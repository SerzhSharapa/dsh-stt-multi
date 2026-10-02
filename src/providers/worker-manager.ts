/**
 * Host-side worker manager — owns the native worker child: spawn, readiness
 * handshake, serial tail-queue (stock pattern), idle-timeout termination
 * (QUAL-03: recognizer memory frees when the worker exits), and Phase-2
 * preparation before the first spawn.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Preparation } from './preparation.js'
import type { CatalogModel } from '../download/catalog.js'

export interface ManagerConfig {
  dataRoot: string
  threads: number
  idleTimeoutMs: number
  maxPending: number
  inferenceTimeoutMs: number
  maxAudioBytes: number
}

interface RunningWorker {
  child: ReturnType<typeof spawn>
  port: number
  token: string
  closed: boolean
}

export class WorkerManager {
  private worker: RunningWorker | null = null
  private tail: Promise<unknown> = Promise.resolve()
  private pending = 0
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly lifetime = new AbortController()

  constructor(
    private readonly config: ManagerConfig,
    private readonly model: CatalogModel,
    private readonly preparation: Preparation,
    private readonly workerEntry: string,
  ) {}

  private modelDir(): string {
    if (this.model.customDirectory) return this.model.customDirectory
    return this.model.modelConfig === 'nemoCtc'
      ? `${this.config.dataRoot}/gigaam-local/${this.model.id}`
      : `${this.config.dataRoot}/whisper-local/${this.model.id}`
  }

  private workerArgs(): string[] {
    const custom = this.model.customDirectory
    const modelDir = this.modelDir()
    const vad = `${this.config.dataRoot}/vad/silero_vad.onnx`
    const first = (suffix: string) => this.model.files.find((f) => f.path.endsWith(suffix))?.path ?? ''
    return [
      JSON.stringify({
        modelType: this.model.modelConfig,
        encoder: `${modelDir}/${this.model.modelConfig === 'nemoCtc' ? (this.model.files.find((f) => f.path.endsWith('model.int8.onnx'))?.path ?? '') : first('encoder.int8.onnx')}`,
        decoder: `${modelDir}/${first('decoder.int8.onnx')}`,
        tokens: `${modelDir}/${first('tokens.txt')}`,
        vad,
        threads: this.config.threads,
        maxAudioBytes: this.config.maxAudioBytes,
      }),
    ]
  }

  private async start(): Promise<RunningWorker> {
    if (this.worker && !this.worker.closed) return this.worker
    // Ensure models are on disk before spawning (Phase 2 layer).
    await this.preparation.prepare()
    if (this.preparation.snapshot().phase === 'failed') {
      throw new Error(`Model preparation failed: ${this.preparation.snapshot().message ?? 'unknown'}`)
    }
    const token = randomBytes(32).toString('hex')
    const child = spawn(process.execPath, [this.workerEntry, ...this.workerArgs()], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DSH_SPEECH_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' },
    })
    const port = await new Promise<number>((resolve, reject) => {
      let stdout = ''
      const timer = setTimeout(() => reject(new Error('Worker readiness timeout')), 60_000)
      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
        const line = stdout.split('\n').find((l) => l.trim().startsWith('{'))
        if (line) {
          clearTimeout(timer)
          try {
            resolve(JSON.parse(line).port as number)
          } catch {
            reject(new Error('Worker readiness malformed'))
          }
        }
      })
      child.stderr!.on('data', (chunk: Buffer) => {
        process.stderr.write(`[dsh-stt-multi worker] ${chunk}`)
      })
      child.once('exit', (code) => reject(new Error(`Worker exited before readiness (code ${code}))`)))
    })
    const worker: RunningWorker = { child, port, token, closed: false }
    child.once('exit', () => {
      worker.closed = true
      if (this.worker === worker) this.worker = null
    })
    this.worker = worker
    return worker
  }

  private async stop(): Promise<void> {
    const worker = this.worker
    if (!worker) return
    worker.closed = true
    worker.child.kill()
    await new Promise<void>((resolve) => {
      worker.child.once('exit', () => resolve())
      setTimeout(resolve, 3000)
    })
    this.worker = null
  }

  /** Queue one recording; serial execution (stock tail-queue pattern). */
  async transcribe(audio: Buffer, language: string, signal?: AbortSignal): Promise<{ text: string; audioSeconds: number; inferenceSeconds: number }> {
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal
    combined.throwIfAborted()
    if (this.pending >= this.config.maxPending) throw new Error('Speech transcription queue is full')
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.pending++
    const job = this.tail.then(async () => {
      combined.throwIfAborted()
      try {
        const worker = await this.start()
        const response = await fetch(`http://127.0.0.1:${worker.port}/transcribe?language=${encodeURIComponent(language)}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${worker.token}`, 'content-type': 'audio/wav' },
          body: audio,
          signal: AbortSignal.any([combined, AbortSignal.timeout(this.config.inferenceTimeoutMs)]),
        })
        const value = (await response.json()) as { text?: string; audioSeconds?: number; inferenceSeconds?: number; error?: string }
        if (!response.ok) throw new Error(value.error ?? `Worker HTTP ${response.status}`)
        return {
          text: value.text ?? '',
          audioSeconds: value.audioSeconds ?? 0,
          inferenceSeconds: value.inferenceSeconds ?? 0,
        }
      } catch (error) {
        await this.stop()
        throw error
      }
    })
    this.tail = job.then(() => undefined, () => undefined)
    void this.tail.then(() => {
      this.pending--
      if (this.pending === 0 && !this.lifetime.signal.aborted) {
        this.idleTimer = setTimeout(() => {
          // QUAL-03: free recognizer memory by letting the worker process exit.
          void this.stop()
        }, this.config.idleTimeoutMs)
      }
    })
    return job
  }

  async dispose(): Promise<void> {
    this.lifetime.abort(new Error('worker manager disposed'))
    if (this.idleTimer) clearTimeout(this.idleTimer)
    await this.tail.catch(() => undefined)
    await this.stop()
  }
}

/**
 * Preparation state machine — Phase 2.
 *
 * Implements the DSH speech-provider preparation contract observed in the
 * stock sensevoice worker: snapshot()/subscribe()/prepare(options)/cancel()
 * with phases checking → downloading → verify → ready | standby | failed
 * | cancelled. Downloads are owned by the engine; this class sequences them.
 */

import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  downloadFile,
  orderSources,
  untar,
  verifyFile,
  DownloadError,
} from '../download/engine.js'
import { HF_ORIGINS, VAD_ASSET, type CatalogModel } from '../download/catalog.js'

export type PreparationPhase =
  | 'unprepared'
  | 'checking'
  | 'downloading'
  | 'verify'
  | 'ready'
  | 'standby'
  | 'failed'
  | 'cancelled'

export interface PreparationState {
  phase: PreparationPhase
  resource?: string
  completedBytes?: number
  totalBytes?: number
  message?: string
  startedAt?: number
}

export interface PreparationConfig {
  dataRoot: string
  modelId: string
  probeTimeoutMs?: number
}

export class Preparation implements Required<{
  snapshot: () => PreparationState
  subscribe: (listener: () => void) => () => void
  prepare: (options?: { downloadSource?: string }) => Promise<void>
  cancel: () => Promise<void>
}> {
  private state: PreparationState = { phase: 'unprepared' }
  private readonly listeners = new Set<() => void>()
  private controller: AbortController | null = null
  private running = false

  constructor(
    private readonly config: PreparationConfig,
    private readonly model: CatalogModel,
  ) {}

  snapshot(): PreparationState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(patch: PreparationState) {
    this.state = patch
    for (const listener of this.listeners) listener()
  }

  /** Check disk caches; enter standby when everything is already present. */
  async inspect(): Promise<void> {
    if (this.running) return
    this.publish({ phase: 'checking', startedAt: Date.now() })
    if (await this.isReady()) {
      this.publish({ phase: 'standby' })
    } else {
      this.publish({ phase: 'unprepared' })
    }
  }

  private modelDir(): string {
    return this.model.modelConfig === 'nemoCtc'
      ? join(this.config.dataRoot, 'gigaam-local', this.model.id)
      : join(this.config.dataRoot, 'whisper-local', this.config.modelId)
  }

  private async isReady(): Promise<boolean> {
    const vadOk = await verifyFile(join(this.config.dataRoot, 'vad', 'silero_vad.onnx'), VAD_ASSET)
    if (!vadOk) return false
    for (const file of this.model.files) {
      const base = this.model.customDirectory ?? this.modelDir()
      if (!(await verifyFile(join(base, file.path), { bytes: null, sha256: this.model.customDirectory ? null : file.sha256 }))) return false
    }
    return true
  }

  /** Download the tarball + VAD, verify every file, publish progress. */
  async prepare(options: { downloadSource?: string } = {}): Promise<void> {
    if (this.running) return
    this.running = true
    this.controller = new AbortController()
    const signal = this.controller.signal
    try {
      if (await this.isReady()) {
        this.publish({ phase: 'ready' })
        return
      }
      this.publish({ phase: 'checking', startedAt: Date.now() })

      // CUSTOM-01: user-supplied directory - presence only, never download model files.
      if (this.model.customDirectory) {
        if (await this.isReady()) {
          this.publish({ phase: 'ready' })
        } else {
          this.publish({ phase: 'failed', message: `Custom model directory incomplete: ${this.model.customDirectory} (expects encoder/decoder int8 + tokens)` })
        }
        return
      }

      // VAD once, shared across models.
      const vadPath = join(this.config.dataRoot, 'vad', 'silero_vad.onnx')
      if (!(await verifyFile(vadPath, VAD_ASSET))) {
        const origins = options.downloadSource ? [options.downloadSource] : [new URL(VAD_ASSET.url).origin, ...HF_ORIGINS]
        for (const url of await orderSources(VAD_ASSET.url, origins, this.config.probeTimeoutMs ?? 3000)) {
          try {
            this.publish({ phase: 'downloading', resource: 'silero-vad', completedBytes: 0, totalBytes: VAD_ASSET.bytes })
            await downloadFile(url, vadPath, VAD_ASSET, {
              onProgress: (completed, total) => this.publish({ phase: 'downloading', resource: 'silero-vad', completedBytes: completed, totalBytes: total }),
            }, signal)
            break
          } catch (error) {
            if (signal.aborted) throw error
            if (error instanceof DownloadError && error.reason === 'unknown') throw error
          }
        }
      }

      const modelTarball = join(this.modelDir(), `${this.model.id}.tar.bz2`)
      const origins = options.downloadSource ? [options.downloadSource] : [new URL(this.model.tarballUrl).origin, ...HF_ORIGINS]
      let downloaded = false
      for (const url of await orderSources(this.model.tarballUrl, origins, this.config.probeTimeoutMs ?? 3000)) {
        try {
          this.publish({ phase: 'downloading', resource: this.model.id, completedBytes: 0 })
          await downloadFile(url, modelTarball, { bytes: null, sha256: null }, {
            onProgress: (completed, total) => this.publish({ phase: 'downloading', resource: this.model.id, completedBytes: completed, totalBytes: total }),
          }, signal)
          downloaded = true
          break
        } catch (error) {
          if (signal.aborted) throw error
          if (error instanceof DownloadError && error.reason === 'unknown') throw error
        }
      }
      if (!downloaded) throw new DownloadError(this.model.tarballUrl, 'network')

      this.publish({ phase: 'verify', resource: this.model.id })
      await untar(modelTarball, this.modelDir())
      await rm(modelTarball, { force: true })

      if (!(await this.isReady())) {
        this.publish({ phase: 'failed', message: 'Model files failed verification after download' })
        return
      }
      this.publish({ phase: 'ready' })
    } catch (error) {
      if (signal.aborted) {
        this.publish({ phase: 'cancelled' })
      } else {
        this.publish({
          phase: 'failed',
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof DownloadError ? { resource: error.resource } : {}),
        })
      }
    } finally {
      this.running = false
      this.controller = null
    }
  }

  async cancel(): Promise<void> {
    this.controller?.abort(new Error('cancelled'))
    // prepare() settles its own publishing on abort.
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

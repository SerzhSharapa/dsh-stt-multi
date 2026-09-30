import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const workerEntry = join(here, '../dist/worker/main.js')
const dataRoot = join(homedir(), '.dsh', 'speech-to-text')
const tinyDir = join(dataRoot, 'whisper-local', 'whisper-tiny', 'sherpa-onnx-whisper-tiny')
const vad = join(dataRoot, 'vad', 'silero_vad.onnx')

interface WorkerHandle {
  port: number
  token: string
  child: ReturnType<typeof spawn>
}

async function startWorker(): Promise<WorkerHandle> {
  const token = randomBytes(32).toString('hex')
  const child = spawn(process.execPath, [
    workerEntry,
    JSON.stringify({
      encoder: join(tinyDir, 'tiny-encoder.int8.onnx'),
      decoder: join(tinyDir, 'tiny-decoder.int8.onnx'),
      tokens: join(tinyDir, 'tiny-tokens.txt'),
      vad,
      threads: 2,
    }),
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DSH_SPEECH_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' } })
  const port = await new Promise<number>((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error('readiness timeout')), 120_000)
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const line = out.split('\n').find((l) => l.trim().startsWith('{'))
      if (line) {
        clearTimeout(timer)
        resolve(JSON.parse(line).port as number)
      }
    })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`worker exited ${code}`)) })
  })
  return { port, token, child }
}

async function transcribe(handle: WorkerHandle, wav: Buffer, language: string) {
  const response = await fetch(`http://127.0.0.1:${handle.port}/transcribe?language=${language}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${handle.token}`, 'content-type': 'audio/wav' },
    body: wav,
  })
  return { status: response.status, value: await response.json() as { text?: string; error?: string; audioSeconds?: number } }
}

describe('whisper worker (golden ru/en, real native inference)', () => {
  it('transcribes the Russian fixture to non-empty Russian text', { timeout: 180_000 }, async () => {
    const handle = await startWorker()
    try {
      const wav = readFileSync(join(here, 'fixtures/ru-golden.wav'))
      const { status, value } = await transcribe(handle, wav, 'ru')
      expect(status).toBe(200)
      expect((value.text ?? '').length).toBeGreaterThan(3)
      expect(value.text).toMatch(/[а-яА-Я]/)
      console.log('[golden ru]', value.text)
    } finally {
      handle.child.kill()
    }
  })

  it('transcribes the English fixture to non-empty English text', { timeout: 180_000 }, async () => {
    const handle = await startWorker()
    try {
      const wav = readFileSync(join(here, 'fixtures/en-golden.wav'))
      const { status, value } = await transcribe(handle, wav, 'en')
      expect(status).toBe(200)
      expect((value.text ?? '').length).toBeGreaterThan(3)
      expect(value.text).toMatch(/[a-zA-Z]/)
      console.log('[golden en]', value.text)
    } finally {
      handle.child.kill()
    }
  })

  it('rejects unauthorized requests', { timeout: 120_000 }, async () => {
    const handle = await startWorker()
    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/transcribe?language=ru`, {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
        body: readFileSync(join(here, 'fixtures/ru-golden.wav')),
      })
      expect(response.status).toBe(401)
    } finally {
      handle.child.kill()
    }
  })
})

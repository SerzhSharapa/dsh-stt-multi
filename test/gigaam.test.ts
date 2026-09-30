import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const workerEntry = join(here, '../dist/worker/main.js')
const gigaamDir = join(homedir(), '.dsh/speech-to-text/gigaam-local/gigaam-v2/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19')
const vad = join(homedir(), '.dsh/speech-to-text/vad/silero_vad.onnx')

describe('gigaam worker (golden RU, nemoCtc)', () => {
  it('transcribes the Russian fixture with GigaAM v2', { timeout: 180_000 }, async () => {
    const token = randomBytes(32).toString('hex')
    const child = spawn(process.execPath, [
      workerEntry,
      JSON.stringify({
        modelType: 'nemoCtc',
        encoder: join(gigaamDir, 'model.int8.onnx'),
        decoder: '',
        tokens: join(gigaamDir, 'tokens.txt'),
        vad,
        threads: 2,
      }),
    ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DSH_SPEECH_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' } })
    try {
      const port = await new Promise<number>((resolve, reject) => {
        let out = ''
        const timer = setTimeout(() => reject(new Error('readiness timeout')), 120_000)
        child.stdout!.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
          const line = out.split('\n').find((l) => l.trim().startsWith('{'))
          if (line) { clearTimeout(timer); resolve(JSON.parse(line).port as number) }
        })
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`worker exited ${code}`)) })
      })
      const wav = readFileSync(join(here, 'fixtures/ru-golden.wav'))
      const response = await fetch(`http://127.0.0.1:${port}/transcribe?language=ru`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' },
        body: wav,
      })
      const value = await response.json() as { text?: string }
      console.log('[golden gigaam]', value.text)
      expect(response.status).toBe(200)
      expect((value.text ?? '').length).toBeGreaterThan(3)
      expect(value.text).toMatch(/[а-яА-Я]/)
    } finally {
      child.kill()
    }
  })
})

import { describe, expect, it, vi } from 'vitest'
import { providerInfo, registerEchoProvider, type EffectContext } from '../src/providers/adapter.js'
import { echoTranscribe, wavDurationSeconds } from '../src/providers/echo.js'

function makeCtx() {
  const registered: unknown[] = []
  const unregister = vi.fn()
  const ctx: EffectContext = {
    speechToText: {
      register: (reg: never) => {
        registered.push(reg)
        return unregister
      },
    },
    effect: (fn: () => unknown) => fn(),
  }
  return { ctx, registered, unregister }
}

/** 1 second of silence, 16 kHz mono 16-bit PCM. */
function silentWav(seconds = 1): Buffer {
  const sampleRate = 16000
  const dataBytes = seconds * sampleRate * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  return buf
}

describe('providerInfo', () => {
  it('builds info with the configured id and echo languages', () => {
    const info = providerInfo({ providerId: 'whisper-local' })
    expect(info.id).toBe('whisper-local')
    expect(info.name).toContain('Whisper')
    expect(info.location).toBe('host-local')
    expect(info.languages).toContain('ru')
    expect(info.languages).toContain('en')
    expect(info.downloadSources).toEqual([])
  })

  it('honors a custom display name', () => {
    expect(providerInfo({ providerId: 'x', displayName: 'Custom' }).name).toBe('Custom')
  })
})

describe('registerEchoProvider', () => {
  it('registers once with expected shape and cleans up', async () => {
    const { ctx, registered, unregister } = makeCtx()
    const dispose = registerEchoProvider(ctx, { providerId: 'whisper-local' }) as () => Promise<void>
    expect(registered).toHaveLength(1)
    const reg = registered[0] as { info: { id: string }; transcribe: (i: { audio: Buffer; language: string }, s: AbortSignal) => Promise<unknown> }
    expect(reg.info.id).toBe('whisper-local')
    const result = (await reg.transcribe({ audio: silentWav(), language: 'ru' }, new AbortController().signal)) as { text: string; audioSeconds: number }
    expect(result.text).toContain('echo:ru')
    expect(result.audioSeconds).toBeCloseTo(1, 1)
    await dispose()
    expect(unregister).toHaveBeenCalledOnce()
  })
})

describe('echoTranscribe', () => {
  it('reports wav duration and near-zero inference time', async () => {
    const result = await echoTranscribe({ audio: silentWav(2), language: 'en' })
    expect(result.audioSeconds).toBeCloseTo(2, 1)
    expect(result.inferenceSeconds).toBeLessThan(0.1)
  })
})

describe('wavDurationSeconds', () => {
  it('returns 0 for non-WAV garbage', () => {
    expect(wavDurationSeconds(Buffer.alloc(100))).toBe(0)
    expect(wavDurationSeconds(Buffer.alloc(10))).toBe(0)
  })
})

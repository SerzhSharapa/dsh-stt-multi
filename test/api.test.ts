import { describe, expect, it, vi } from 'vitest'
import { apiTranscribe, apiDisplayName } from '../src/providers/api.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('api provider', () => {
  it('marks cloud clearly (API-02)', () => {
    expect(apiDisplayName({ apiModel: 'whisper-large-v3' })).toMatch(/cloud/i)
  })

  it('sends multipart with key from env and parses text (API-01)', async () => {
    process.env.TEST_STT_KEY = 'sk-test'
    const calls: { url: string; auth?: string; body: FormData }[] = []
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.authorization, body: init?.body as FormData })
      return new Response(JSON.stringify({ text: 'привет из облака' }), { status: 200 })
    }) as unknown as typeof fetch
    const wav = readFileSync(join(here, 'fixtures/ru-golden.wav'))
    const result = await apiTranscribe(
      { providerId: 'stt-api', baseUrl: 'https://api.example.com/v1/', apiKeyEnv: 'TEST_STT_KEY', apiModel: 'whisper-large-v3', language: 'ru', timeoutMs: 5000 },
      wav, 'ru',
    )
    expect(result.text).toBe('привет из облака')
    expect(calls[0]!.url).toBe('https://api.example.com/v1/audio/transcriptions')
    expect(calls[0]!.auth).toBe('Bearer sk-test')
    expect(calls[0]!.body).toBeInstanceOf(FormData)
  })

  it('fails readably without the env key', async () => {
    delete process.env.TEST_STT_KEY2
    await expect(apiTranscribe(
      { providerId: 'x', baseUrl: 'https://api.example.com/v1/', apiKeyEnv: 'TEST_STT_KEY2', apiModel: 'm', language: 'ru', timeoutMs: 5000 },
      Buffer.alloc(100), 'ru',
    )).rejects.toThrow(/TEST_STT_KEY2/)
  })
})

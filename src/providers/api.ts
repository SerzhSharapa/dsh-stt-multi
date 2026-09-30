/**
 * OpenAI-compatible cloud provider (API-01, API-02).
 *
 * POST {baseURL}/audio/transcriptions (multipart: file, model, language).
 * No worker, no downloads — audio leaves the machine, hence the explicit
 * "cloud" marking in the display name. The API key comes from an env
 * variable (apiKeyEnv), never from the profile config.
 */

export interface ApiConfig {
  providerId: string
  baseUrl: string
  apiKeyEnv: string
  apiModel: string
  language: string
  timeoutMs: number
}

export interface ApiTranscript {
  text: string
  audioSeconds: number
  inferenceSeconds: number
}

export function apiDisplayName(config: Pick<ApiConfig, 'apiModel'>): string {
  return `☁️ ${config.apiModel} (cloud)`
}

/** Transcribe one WAV recording through the OpenAI-compatible endpoint. */
export async function apiTranscribe(config: ApiConfig, audio: Buffer, language: string, signal?: AbortSignal): Promise<ApiTranscript> {
  const key = process.env[config.apiKeyEnv]
  if (!key) throw new Error(`API key not found in env ${config.apiKeyEnv}`)
  const started = performance.now()

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'speech.wav')
  form.append('model', config.apiModel)
  form.append('language', language === 'auto' ? (config.language === 'auto' ? 'ru' : config.language) : language)

  const response = await fetch(new URL('audio/transcriptions', config.baseUrl).href, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs),
  })
  const value = (await response.json()) as { text?: string; error?: { message?: string } | string }
  if (!response.ok) {
    const message = typeof value.error === 'string' ? value.error : value.error?.message ?? `HTTP ${response.status}`
    throw new Error(`Speech API failed: ${message}`)
  }
  return {
    text: value.text ?? '',
    audioSeconds: 0,
    inferenceSeconds: (performance.now() - started) / 1e3,
  }
}

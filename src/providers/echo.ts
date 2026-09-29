/**
 * Echo stub engine — Phase 1 stand-in for the real Whisper worker (Phase 3).
 *
 * Implements the provider transcribe contract observed in the stock
 * dsh-experimental-speech-to-text-sensevoice plugin: given a WAV payload and a
 * language hint, resolve to a transcript ({ text, audioSeconds, inferenceSeconds }).
 * The echo engine never imports native code; it proves the registration and
 * mic-button round-trip before any model exists on disk.
 */

/** Language hints this provider advertises (core validates selection against this list). */
export const echoLanguages = ['auto', 'ru', 'en'] as const

export interface EchoTranscript {
  text: string
  audioSeconds: number
  inferenceSeconds: number
}

export interface TranscribeInput {
  audio: Uint8Array | Buffer
  language: string
}

/** Best-effort WAV duration (seconds); falls back to 0 when the header is unreadable. */
export function wavDurationSeconds(audio: Uint8Array): number {
  const bytes = audio
  if (bytes.length < 44) return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x52494646) return 0 // "RIFF"
  const byteRate = view.getUint32(28, true)
  if (!byteRate) return 0
  return bytes.length / byteRate
}

/** Echo transcribe: fixed marker text + honest timing, zero native inference. */
export async function echoTranscribe(input: TranscribeInput, _signal?: AbortSignal): Promise<EchoTranscript> {
  const startedAt = performance.now()
  const audioSeconds = wavDurationSeconds(input.audio)
  const inferenceSeconds = (performance.now() - startedAt) / 1000
  return {
    text: `[dsh-stt-multi echo:${input.language}] real Whisper worker arrives in Phase 3`,
    audioSeconds,
    inferenceSeconds,
  }
}

/**
 * Whisper inference — native sherpa-onnx recognizer + Silero VAD segmentation,
 * confined to the worker child process. Ported from the stock sensevoice
 * worker with modelConfig.whisper (encoder/decoder int8 + tailPaddings).
 */

import { createRequire } from 'node:module'

export interface InferenceConfig {
  modelType: 'whisper' | 'nemoCtc'
  encoder: string
  decoder: string
  tokens: string
  vad: string
  threads: number
  segmentSeconds: number
  vadThreshold: number
  minSpeechSeconds: number
  minSilenceSeconds: number
  tailPaddings: number
  maxAudioBytes: number
}

export class SpeechInputError extends Error {}

const LANGUAGES = ['auto', 'ru', 'en', 'zh', 'de', 'fr', 'es', 'ja', 'ko']

/** Validate WAV shape (44-byte header, PCM16) and enforce the byte limit. */
function validateWav(audio: Buffer, maxAudioBytes: number): number {
  if (audio.byteLength > maxAudioBytes) throw new SpeechInputError('Speech audio exceeds the worker byte limit')
  if (audio.byteLength < 46) throw new SpeechInputError('Invalid speech WAV')
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new SpeechInputError('Invalid speech WAV')
  }
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  const byteRate = view.getUint32(28, true)
  return byteRate > 0 ? audio.byteLength / byteRate : 0
}

export function createWhisperTranscriber(config: InferenceConfig) {
  const sherpa = createRequire(import.meta.url)('sherpa-onnx-node')
  const nativeConfig: {
    featConfig: { sampleRate: number; featureDim: number }
    modelConfig: Record<string, unknown> & { whisper?: unknown; nemoCtc?: unknown }
  } = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      ...(config.modelType === 'nemoCtc'
        ? { nemoCtc: { model: config.encoder } }
        : { whisper: { encoder: config.encoder, decoder: config.decoder, language: 'ru', task: 'transcribe', tailPaddings: config.tailPaddings } }),
      tokens: config.tokens,
      numThreads: config.threads,
      provider: 'cpu',
      debug: 0,
    },
  }
  const recognizer = new sherpa.OfflineRecognizer(nativeConfig)
  const detector = new sherpa.Vad(
    {
      sileroVad: {
        model: config.vad,
        threshold: config.vadThreshold,
        minSilenceDuration: config.minSilenceSeconds,
        minSpeechDuration: config.minSpeechSeconds,
        maxSpeechDuration: config.segmentSeconds,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: config.threads,
      provider: 'cpu',
      debug: 0,
    },
    config.segmentSeconds + config.minSilenceSeconds + 1,
  )

  const dispose = () => {
    try { detector?.free?.() } catch { /* best effort */ }
    try { recognizer?.free?.() } catch { /* best effort */ }
  }

  const transcribe = (audio: Buffer, language: string) => {
    if (!LANGUAGES.includes(language)) throw new SpeechInputError(`Unsupported language: ${language}`)
    const audioSeconds = validateWav(audio, config.maxAudioBytes)
    const pcm = new DataView(audio.buffer, audio.byteOffset + 44, audio.byteLength - 44)
    const samples = Float32Array.from({ length: pcm.byteLength / 2 }, (_, i) => pcm.getInt16(i * 2, true) / 32768)
    const whisperCfg = nativeConfig.modelConfig.whisper as { language: string } | undefined
    if (whisperCfg) whisperCfg.language = language === 'auto' ? 'ru' : language
    try {
      recognizer.setConfig?.(nativeConfig)
    } catch { /* older sherpa builds keep the initial config */ }
    detector.reset()
    const started = performance.now()
    const texts: string[] = []
    const drain = () => {
      while (!detector.isEmpty()) {
        const segment = detector.front(false)
        const stream = recognizer.createStream()
        stream.acceptWaveform({ sampleRate: 16000, samples: segment.samples })
        recognizer.decode(stream)
        texts.push(String(recognizer.getResult(stream).text ?? '').trim())
        detector.pop()
      }
    }
    for (let offset = 0; offset < samples.length; offset += 512) {
      detector.acceptWaveform(samples.subarray(offset, offset + 512))
      drain()
    }
    detector.flush()
    drain()
    return {
      text: texts.filter(Boolean).join(' ').trim(),
      audioSeconds,
      inferenceSeconds: (performance.now() - started) / 1e3,
    }
  }

  return { transcribe, dispose }
}

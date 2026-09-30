/**
 * Worker child entry — mirrors the stock sensevoice worker contract:
 * argv[2] is a JSON config; DSH_SPEECH_TOKEN authenticates the loopback
 * server; readiness `{"port":N}\n` on stdout is the only stdout output.
 */

import { createWhisperTranscriber, type InferenceConfig } from './inference.js'
import { startRecognitionServer } from './server.js'

interface WorkerConfig extends InferenceConfig {
  maxAudioBytes: number
}

const raw = JSON.parse(process.argv[2] ?? '{}') as WorkerConfig
const config: WorkerConfig = {
  encoder: raw.encoder,
  decoder: raw.decoder,
  tokens: raw.tokens,
  vad: raw.vad,
  threads: raw.threads ?? 2,
  segmentSeconds: raw.segmentSeconds ?? 30,
  vadThreshold: raw.vadThreshold ?? 0.5,
  minSpeechSeconds: raw.minSpeechSeconds ?? 0.25,
  minSilenceSeconds: raw.minSilenceSeconds ?? 0.5,
  tailPaddings: raw.tailPaddings ?? 3000,
  maxAudioBytes: raw.maxAudioBytes ?? 4 * 1024 * 1024,
}

const token = process.env.DSH_SPEECH_TOKEN ?? ''
if (!/^[a-f0-9]{64}$/.test(token)) {
  process.stderr.write('worker: DSH_SPEECH_TOKEN missing or malformed\n')
  process.exit(2)
}
delete process.env.DSH_SPEECH_TOKEN

const { transcribe, dispose } = createWhisperTranscriber(config)
process.on('exit', dispose)

const { port } = await startRecognitionServer(token, config.maxAudioBytes, transcribe)
process.stdout.write(`${JSON.stringify({ port })}\n`)

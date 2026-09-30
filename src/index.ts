/**
 * dsh-stt-multi - multi-provider speech-to-text for DeepSeek Harness.
 *
 * Phase 3: real local Whisper worker end-to-end (Russian dictation).
 */

import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { registerProvider, type EffectContext, type TranscribeSpec, type TranscriptResult } from './providers/adapter.js'
import { Preparation } from './providers/preparation.js'
import { WorkerManager } from './providers/worker-manager.js'
import { MODEL_CATALOG, downloadOrigins, findModel } from './download/catalog.js'

export const name = 'dsh-stt-multi'
export const inject = ['speechToText', 'subprocess']

const here = dirname(fileURLToPath(import.meta.url))
const workerEntry = join(here, 'worker', 'main.js')

/** Per-instance deployment configuration (one cordis.patch.yml entry = one model). */
export const Config = Schema.object({
  providerId: Schema.string().min(1).default('whisper-local'),
  displayName: Schema.union([Schema.string().min(1), Schema.const(undefined)]),
  dataRoot: Schema.string().min(1).default(join(homedir(), '.dsh', 'speech-to-text')),
  modelId: Schema.string().min(1).default('whisper-small'),
  language: Schema.string().min(1).default('auto'),
  threads: Schema.natural().min(1).default(2),
  echo: Schema.boolean().default(false),
  idleTimeoutMs: Schema.natural().min(1).default(300_000),
  maxPending: Schema.natural().min(1).default(4),
  inferenceTimeoutMs: Schema.natural().min(1).default(120_000),
  maxAudioBytes: Schema.natural().min(46).default(4 * 1024 * 1024),
})

/** Plugin activation: register provider with whisper worker (or echo debug mode). */
export function apply(ctx: EffectContext, config: {
  providerId: string
  displayName?: string
  dataRoot: string
  modelId: string
  language: string
  threads: number
  echo: boolean
  idleTimeoutMs: number
  maxPending: number
  inferenceTimeoutMs: number
  maxAudioBytes: number
}) {
  const model = findModel(config.modelId) ?? MODEL_CATALOG[0]!
  const preparation = new Preparation({ dataRoot: config.dataRoot, modelId: model.id }, model)
  let manager: WorkerManager | null = null
  if (!config.echo) {
    manager = new WorkerManager(
      {
        dataRoot: config.dataRoot,
        threads: config.threads,
        idleTimeoutMs: config.idleTimeoutMs,
        maxPending: config.maxPending,
        inferenceTimeoutMs: config.inferenceTimeoutMs,
        maxAudioBytes: config.maxAudioBytes,
      },
      model,
      preparation,
      workerEntry,
    )
  }
  const transcribe = manager
    ? async (input: TranscribeSpec, signal: AbortSignal): Promise<TranscriptResult> =>
        manager!.transcribe(Buffer.from(input.audio), input.language === 'auto' ? config.language : input.language, signal)
    : undefined
  const dispose = registerProvider(ctx, config, { preparation, downloadSources: downloadOrigins(), transcribe })
  void preparation.inspect()
  return dispose
}

export { echoTranscribe, echoLanguages } from './providers/echo.js'

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
import { apiTranscribe, apiDisplayName } from './providers/api.js'
import { MODEL_CATALOG, downloadOrigins, findModel, modelFromDirectory } from './download/catalog.js'

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
  modelDirectory: Schema.union([Schema.string().min(1), Schema.const(undefined)]),
  baseUrl: Schema.union([Schema.string().min(1), Schema.const(undefined)]),
  apiKeyEnv: Schema.string().min(1).default('DSH_STT_API_KEY'),
  apiModel: Schema.string().min(1).default('whisper-large-v3-turbo'),
  language: Schema.string().min(1).default('ru'),
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
  modelDirectory?: string
  baseUrl?: string
  apiKeyEnv: string
  apiModel: string
  language: string
  threads: number
  echo: boolean
  idleTimeoutMs: number
  maxPending: number
  inferenceTimeoutMs: number
  maxAudioBytes: number
}) {
  // API-01/02: cloud instance — no model, no worker, no preparation.
  if (config.baseUrl) {
    const api = {
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      apiKeyEnv: config.apiKeyEnv,
      apiModel: config.apiModel,
      language: config.language,
      timeoutMs: config.inferenceTimeoutMs,
    }
    return registerProvider(ctx, { providerId: config.providerId, displayName: config.displayName ?? apiDisplayName(api) }, {
      transcribe: (input, signal) => apiTranscribe(api, Buffer.from(input.audio), input.language, signal),
    })
  }

  const model = config.modelDirectory
    ? modelFromDirectory(config.modelDirectory, config.displayName ?? 'Whisper (custom)')
    : findModel(config.modelId) ?? MODEL_CATALOG[0]!
  const displayName = config.displayName ?? model.displayName
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
        manager!.transcribe(Buffer.from(input.audio), input.language === 'auto' ? (config.language === 'auto' ? 'ru' : config.language) : input.language, signal)
    : undefined
  const dispose = registerProvider(ctx, { ...config, displayName }, { preparation, downloadSources: downloadOrigins(), transcribe })
  void preparation.inspect()
  return dispose
}

export { echoTranscribe, echoLanguages } from './providers/echo.js'

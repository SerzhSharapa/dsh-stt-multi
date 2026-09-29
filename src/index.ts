/**
 * dsh-stt-multi - multi-provider speech-to-text for DeepSeek Harness.
 *
 * Phase 1: plugin skeleton + provider registration with an echo stub engine.
 * Phase 2: model assets & download layer (this version).
 * Phase 3: real Whisper worker. Phase 4: multi-instance list. Phase 5: GigaAM + API.
 */

import Schema from '@deepseek-ai/schemastery'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { registerEchoProvider, type EffectContext } from './providers/adapter.js'
import { Preparation } from './providers/preparation.js'
import { MODEL_CATALOG, downloadOrigins, findModel } from './download/catalog.js'

export const name = 'dsh-stt-multi'
export const inject = ['speechToText', 'subprocess']

/** Per-instance deployment configuration (one cordis.patch.yml entry = one model). */
export const Config = Schema.object({
  providerId: Schema.string().min(1).default('whisper-local'),
  displayName: Schema.union([Schema.string().min(1), Schema.const(undefined)]),
  dataRoot: Schema.string().min(1).default(join(homedir(), '.dsh', 'speech-to-text')),
  modelId: Schema.string().min(1).default('whisper-tiny'),
})

/** Plugin activation: register the provider (echo engine) + download preparation. */
export function apply(ctx: EffectContext, config: { providerId: string; displayName?: string; dataRoot: string; modelId: string }) {
  const model = findModel(config.modelId) ?? MODEL_CATALOG[0]!
  const preparation = new Preparation({ dataRoot: config.dataRoot, modelId: config.modelId }, model)
  registerEchoProvider(ctx, config, preparation, downloadOrigins())
  void preparation.inspect()
}

export { echoTranscribe, echoLanguages } from './providers/echo.js'

/**
 * dsh-stt-multi — multi-provider speech-to-text for DeepSeek Harness.
 *
 * Phase 1: plugin skeleton + provider registration with an echo stub engine.
 * Phase 2: model assets & download layer. Phase 3: real Whisper worker.
 * Phase 4: multi-instance model list. Phase 5: GigaAM v2 + API providers.
 */

import Schema from '@deepseek-ai/schemastery'
import { registerEchoProvider, type EffectContext } from './providers/adapter.js'

export const name = 'dsh-stt-multi'
export const inject = ['speechToText', 'subprocess']

/** Per-instance deployment configuration (one cordis.patch.yml entry = one model). */
export const Config = Schema.object({
  providerId: Schema.string().min(1).default('whisper-local'),
  displayName: Schema.union([Schema.string().min(1), Schema.const(undefined)]),
  dataRoot: Schema.string().min(1).default(''),
})

/** Plugin activation: register the provider (echo engine in Phase 1). */
export function apply(ctx: EffectContext, config: { providerId: string; displayName?: string; dataRoot: string }) {
  registerEchoProvider(ctx, config)
}

export { echoTranscribe, echoLanguages } from './providers/echo.js'

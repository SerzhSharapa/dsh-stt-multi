/**
 * SpeechProvider adapter — the ONLY module that touches the experimental
 * DSH speechToText API (pitfall-research isolation rule). If the API shifts
 * between DSH RCs, this file is the single place to update.
 *
 * Contract verified against @deepseek-ai/dsh-experimental-speech-to-text-sensevoice
 * 0.2.0-rc.2 (lib/index.js): a plugin exports { name, inject, Config, apply };
 * apply(ctx, config) registers via ctx.speechToText.register({ info, preparation?,
 * transcribe }) inside ctx.effect and returns an unregister-cleanup disposer.
 */

import { echoLanguages, echoTranscribe } from './echo.js'
import type { Preparation } from './preparation.js'

export interface SpeechProviderInfo {
  id: string
  name: string
  location: 'host-local'
  languages: readonly string[]
  downloadSources: readonly string[]
  setupEstimate: {
    recommendedDiskBytes: number
    expectedMemoryBytes: number
    minimumMinutes: number
    maximumMinutes: number
  }
}

export interface TranscribeSpec {
  audio: Uint8Array | Buffer
  language: string
}

export interface TranscriptResult {
  text: string
  audioSeconds: number
  inferenceSeconds: number
}

export interface SpeechToTextService {
  register(registration: {
    info: SpeechProviderInfo
    preparation?: {
      snapshot: () => unknown
      subscribe: (listener: () => void) => () => void
      prepare: (options?: { downloadSource?: string }) => Promise<void> | void
      cancel?: () => Promise<void> | void
    }
    transcribe: (input: TranscribeSpec, signal: AbortSignal) => Promise<TranscriptResult>
  }): () => Promise<void> | void
}

export interface EffectContext {
  effect(fn: () => (() => Promise<void> | void) | void): unknown
  speechToText: SpeechToTextService
}

/** Build the provider info block from per-instance config. */
export function providerInfo(config: { providerId: string; displayName?: string }): SpeechProviderInfo {
  return {
    id: config.providerId,
    name: config.displayName ?? `Whisper (local) [${config.providerId}]`,
    location: 'host-local',
    languages: echoLanguages,
    downloadSources: [], // real download sources arrive with the Phase 2 asset layer
    setupEstimate: {
      recommendedDiskBytes: 0,
      expectedMemoryBytes: 0,
      minimumMinutes: 0,
      maximumMinutes: 0,
    },
  }
}

export interface ProviderTranscribe {
  (input: TranscribeSpec, signal: AbortSignal): Promise<TranscriptResult>
}

/** Register one provider with optional preparation (Phase 2) and transcribe impl. */
export function registerProvider(
  ctx: EffectContext,
  config: { providerId: string; displayName?: string },
  options: {
    preparation?: Preparation
    downloadSources?: readonly string[]
    transcribe?: ProviderTranscribe
  } = {},
) {
  const transcribe = options.transcribe ?? ((input, signal) => echoTranscribe(input, signal))
  return ctx.effect(() => {
    const unregister = ctx.speechToText.register({
      info: { ...providerInfo(config), ...(options.downloadSources ? { downloadSources: options.downloadSources } : {}) },
      ...(options.preparation ? { preparation: options.preparation } : {}),
      transcribe,
    })
    return async () => {
      const removing = unregister()
      if (removing instanceof Promise) await removing
    }
  })
}

/** Backwards-compatible echo registration (debug mode). */
export function registerEchoProvider(
  ctx: EffectContext,
  config: { providerId: string; displayName?: string },
  preparation?: Preparation,
  downloadSources: readonly string[] = [],
) {
  return registerProvider(ctx, config, { preparation, downloadSources })
}

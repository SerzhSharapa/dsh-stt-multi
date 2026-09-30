import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { MODEL_CATALOG, findModel, modelFromDirectory } from '../src/download/catalog.js'
import { registerProvider } from '../src/providers/adapter.js'

const tinyDir = join(homedir(), '.dsh/speech-to-text/whisper-local/whisper-tiny/sherpa-onnx-whisper-tiny')

describe('multi-instance catalog', () => {
  it('offers tiny, small and turbo with unique ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id)
    expect(ids).toContain('whisper-tiny')
    expect(ids).toContain('whisper-small')
    expect(ids).toContain('whisper-turbo')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('CUSTOM-01: modelFromDirectory builds a hash-free model from a user dir', () => {
    const model = modelFromDirectory(tinyDir, 'My tiny')
    expect(model.customDirectory).toBe(tinyDir)
    expect(model.files.every((f) => f.sha256 === null)).toBe(true)
    expect(findModel(model.id)).toBeUndefined()
  })
})

describe('adapter registers multiple instances', () => {
  it('registers whisper-small and whisper-tiny as separate providers', () => {
    const registered: { id: string }[] = []
    const ctx = {
      speechToText: { register: (reg: { info: { id: string } }) => { registered.push({ id: reg.info.id }); return () => {} } },
      effect: (fn: () => unknown) => fn(),
    }
    registerProvider(ctx, { providerId: 'whisper-small', displayName: 'Whisper small' })
    registerProvider(ctx, { providerId: 'whisper-tiny', displayName: 'Whisper tiny' })
    expect(registered.map((r) => r.id)).toEqual(['whisper-small', 'whisper-tiny'])
  })
})

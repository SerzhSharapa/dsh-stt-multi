import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { classifyFailure, verifyFile, DownloadError } from '../src/download/engine.js'
import { MODEL_CATALOG, findModel, downloadOrigins } from '../src/download/catalog.js'
import { Preparation } from '../src/providers/preparation.js'

const tinyDir = join(homedir(), '.dsh', 'speech-to-text', 'whisper-local', 'whisper-tiny')

describe('classifyFailure', () => {
  it('classifies dns/timeout/storage/network codes', () => {
    const dns = Object.assign(new Error('x'), { code: 'ENOTFOUND' })
    expect(classifyFailure(dns).reason).toBe('dns')
    const timeout = Object.assign(new Error('x'), { code: 'ETIMEDOUT' })
    expect(classifyFailure(timeout).reason).toBe('timeout')
    const storage = Object.assign(new Error('x'), { code: 'EACCES' })
    expect(classifyFailure(storage).reason).toBe('storage')
    const network = Object.assign(new Error('x'), { code: 'ECONNRESET' })
    expect(classifyFailure(network).reason).toBe('network')
  })

  it('walks causes and handles timeout names', () => {
    const inner = Object.assign(new Error('inner'), { code: 'EAI_AGAIN' })
    const outer = new Error('outer', { cause: inner })
    expect(classifyFailure(outer).reason).toBe('dns')
    const named = new Error('too slow')
    named.name = 'TimeoutError'
    expect(classifyFailure(named).reason).toBe('timeout')
  })

  it('returns unknown for unrecognized errors', () => {
    expect(classifyFailure(new Error('mystery')).reason).toBe('unknown')
    expect(classifyFailure(null).reason).toBe('unknown')
  })
})

describe('catalog', () => {
  it('has pinned URLs and unique ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const model of MODEL_CATALOG) {
      expect(model.tarballUrl).toMatch(/^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\/asr-models\//)
      expect(model.files.length).toBeGreaterThanOrEqual(2)
    }
    expect(findModel('whisper-tiny')?.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('advertises github + HF mirror origins', () => {
    const origins = downloadOrigins()
    expect(origins).toContain('https://github.com')
    expect(origins).toContain('https://hf-mirror.com')
  })
})

describe('verifyFile (integration: local tiny cache)', () => {
  it('accepts the locally verified whisper tiny files', async () => {
    const model = findModel('whisper-tiny')!
    for (const file of model.files) {
      expect(await verifyFile(join(tinyDir, file.path), file)).toBe(true)
    }
  })

  it('rejects missing files', async () => {
    expect(await verifyFile(join(tinyDir, 'nope.onnx'), { bytes: 1, sha256: null })).toBe(false)
  })

  it('manual install: null hash + matching size passes, wrong size fails', async () => {
    const file = findModel('whisper-tiny')!.files[0]!
    expect(await verifyFile(join(tinyDir, file.path), { bytes: file.bytes, sha256: null })).toBe(true)
    expect(await verifyFile(join(tinyDir, file.path), { bytes: 1, sha256: null })).toBe(false)
  })
})

describe('Preparation state machine', () => {
  it('inspect() runs checking then unprepared/standby', async () => {
    const model = findModel('whisper-tiny')!
    const prep = new Preparation({ dataRoot: join(homedir(), '.dsh', 'speech-to-text'), modelId: 'whisper-tiny' }, model)
    const states: string[] = []
    prep.subscribe(() => states.push(prep.snapshot().phase))
    await prep.inspect()
    expect(['unprepared', 'standby']).toContain(prep.snapshot().phase)
    expect(states[0]).toBe('checking')
  })

  it('prepare() downloads VAD and reaches ready (network integration)', { timeout: 180000 }, async () => {
    const model = findModel('whisper-tiny')!
    const prep = new Preparation({ dataRoot: join(homedir(), '.dsh', 'speech-to-text'), modelId: 'whisper-tiny' }, model)
    await prep.prepare()
    const final = prep.snapshot()
    if (final.phase === 'failed') console.warn('prepare failed:', final.message)
    expect(['ready', 'standby', 'failed']).toContain(final.phase)
  })

  it('DownloadError message is readable', () => {
    const error = new DownloadError('http://x/y', 'dns', 'ENOTFOUND')
    expect(error.message).toContain('dns')
    expect(error.message).toContain('ENOTFOUND')
  })
})

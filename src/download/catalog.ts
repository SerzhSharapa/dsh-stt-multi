/**
 * Model catalog — pinned sources for every engine asset this plugin can fetch.
 *
 * One catalog entry = one downloadable model. Files are verified individually
 * by sha256 after tarball extraction (works identically for manual installs
 * where the tarball never passed through us). Unknown sha256 values are null:
 * the engine then checks size only and logs the computed digest so it can be
 * pinned by a follow-up commit (documented bootstrap process).
 */

export const GITHUB_ASSETS = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models'
export const HF_ORIGINS = ['https://huggingface.co', 'https://hf-mirror.com'] as const

export interface CatalogFile {
  /** Path relative to the model directory after extraction. */
  path: string
  bytes: number | null
  sha256: string | null
}

export interface CatalogModel {
  id: string
  displayName: string
  /** Pinned tarball URL (github asr-models release). Empty for custom directories. */
  tarballUrl: string
  /** Directory the tarball extracts into, relative to the model dir. */
  extractDir: string
  language: 'ru'
  modelConfig: 'whisper'
  /** CUSTOM-01: absolute user-supplied model directory (files auto-detected, no hashes). */
  customDirectory?: string
  files: CatalogFile[]
}

const M = 1024 * 1024

export const MODEL_CATALOG: readonly CatalogModel[] = [
  {
    id: 'whisper-tiny',
    displayName: 'Whisper tiny (int8)',
    tarballUrl: `${GITHUB_ASSETS}/sherpa-onnx-whisper-tiny.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-tiny',
    language: 'ru',
    modelConfig: 'whisper',
    files: [
      // sha256 fixed from the locally verified download (2026-09-30)
      { path: 'sherpa-onnx-whisper-tiny/tiny-encoder.int8.onnx', bytes: 12_937_772, sha256: 'd24fb083ae3b1041fc24e97971d60e280c9342201fbb67b0ab428a8b4a51a434' },
      { path: 'sherpa-onnx-whisper-tiny/tiny-decoder.int8.onnx', bytes: 89_855_401, sha256: 'd2fece8dd42771f1df975c6c0445770d0c292bf7547c2cae04a6c0cc57540925' },
      { path: 'sherpa-onnx-whisper-tiny/tiny-tokens.txt', bytes: 816_730, sha256: 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126' },
    ],
  },
  {
    id: 'whisper-base',
    displayName: 'Whisper base (int8)',
    tarballUrl: `${GITHUB_ASSETS}/sherpa-onnx-whisper-base.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-base',
    language: 'ru',
    modelConfig: 'whisper',
    files: [
      // sha256 null: pinned after first verified download (bootstrap process)
      { path: 'sherpa-onnx-whisper-base/base-encoder.int8.onnx', bytes: null, sha256: null },
      { path: 'sherpa-onnx-whisper-base/base-decoder.int8.onnx', bytes: null, sha256: null },
      { path: 'sherpa-onnx-whisper-base/base-tokens.txt', bytes: null, sha256: null },
    ],
  },
  {
    id: 'whisper-small',
    displayName: 'Whisper small (int8)',
    tarballUrl: `${GITHUB_ASSETS}/sherpa-onnx-whisper-small.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-small',
    language: 'ru',
    modelConfig: 'whisper',
    files: [
      { path: 'sherpa-onnx-whisper-small/small-encoder.int8.onnx', bytes: 112_442_483, sha256: '4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9' },
      { path: 'sherpa-onnx-whisper-small/small-decoder.int8.onnx', bytes: 262_226_114, sha256: 'acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee' },
      { path: 'sherpa-onnx-whisper-small/small-tokens.txt', bytes: 816_730, sha256: 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126' },
    ],
  },
  {
    id: 'whisper-turbo',
    displayName: 'Whisper large-v3-turbo (int8)',
    tarballUrl: `${GITHUB_ASSETS}/sherpa-onnx-whisper-turbo.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-turbo',
    language: 'ru',
    modelConfig: 'whisper',
    files: [
      { path: 'sherpa-onnx-whisper-turbo/turbo-encoder.int8.onnx', bytes: null, sha256: null },
      { path: 'sherpa-onnx-whisper-turbo/turbo-decoder.int8.onnx', bytes: null, sha256: null },
      { path: 'sherpa-onnx-whisper-turbo/turbo-tokens.txt', bytes: null, sha256: null },
    ],
  },
]

/** VAD asset — shared by every local engine, downloaded once. */
export const VAD_ASSET = {
  id: 'silero-vad',
  url: `${GITHUB_ASSETS}/silero_vad.onnx`,
  bytes: 643_854,
  sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
} as const

export function findModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((model) => model.id === id)
}

/**
 * CUSTOM-01: build a catalog model from a user-supplied directory.
 * Auto-detects encoder/decoder/tokens (int8 preferred); no hash checks -
 * the directory is the source of truth (stock DSH behavior for custom dirs).
 */
export function modelFromDirectory(modelDirectory: string, displayName = 'Whisper (custom)'): CatalogModel {
  const base = modelDirectory.replace(/\/+$/, '').split('/').pop() ?? 'custom'
  return {
    id: `custom-${base}`,
    displayName,
    tarballUrl: '',
    extractDir: '',
    language: 'ru',
    modelConfig: 'whisper',
    customDirectory: modelDirectory,
    files: [
      { path: 'encoder.int8.onnx', bytes: null, sha256: null },
      { path: 'decoder.int8.onnx', bytes: null, sha256: null },
      { path: 'tokens.txt', bytes: null, sha256: null },
    ],
  }
}

/** Download source origins advertised through the provider info (UI choice). */
export function downloadOrigins(): string[] {
  return [new URL(GITHUB_ASSETS).origin, ...HF_ORIGINS]
}

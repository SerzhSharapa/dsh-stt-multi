/**
 * QUAL-02 smoke test: prove sherpa-onnx-node loads and constructs an
 * OfflineRecognizer INSIDE the real DSH Electron runtime (not plain node).
 *
 * Usage:
 *   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
 *     scripts/smoke-native.mjs <path-to-profile-node_modules>
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const profileModules = process.argv[2]
if (!profileModules) {
  console.error('usage: smoke-native.mjs <profile-node_modules-dir>')
  process.exit(2)
}

const runtime = process.versions
console.log('[smoke] runtime:', JSON.stringify({
  node: runtime.node,
  electron: runtime.electron ?? null,
  modules: runtime.modules,
  platform: runtime.platform,
  arch: runtime.arch,
}))
if (!runtime.electron) {
  console.error('[smoke] FAIL: not running inside Electron (no process.versions.electron)')
  process.exit(1)
}

// Resolve sherpa-onnx-node from the profile's node_modules (the exact tree DSH loads).
const require = createRequire(join(profileModules, 'x.js'))
const sherpa = require('sherpa-onnx-node')
console.log('[smoke] sherpa-onnx-node loaded OK')

const modelDir = process.env.SMOKE_MODEL_DIR
  ?? join(process.env.HOME, '.dsh/speech-to-text/whisper-local/whisper-tiny/sherpa-onnx-whisper-tiny')

const recognizer = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    whisper: {
      encoder: join(modelDir, 'tiny-encoder.int8.onnx'),
      decoder: join(modelDir, 'tiny-decoder.int8.onnx'),
      language: 'ru',
      task: 'transcribe',
    },
    tokens: join(modelDir, 'tiny-tokens.txt'),
    debug: 0,
    numThreads: 2,
    provider: 'cpu',
  },
})
console.log('[smoke] OfflineRecognizer constructed OK (whisper tiny, ru)')

// Decode 1 second of silence through the full native pipeline.
const seconds = 1
const samples = new Float32Array(16000 * seconds)
const stream = recognizer.createStream()
stream.acceptWaveform({ samples, sampleRate: 16000 })
recognizer.decode(stream)
const result = recognizer.getResult(stream)
console.log('[smoke] decode OK — result.text =', JSON.stringify(result?.text ?? result))
recognizer.free?.()
console.log('[smoke] PASS: native sherpa-onnx works inside DSH Electron runtime')

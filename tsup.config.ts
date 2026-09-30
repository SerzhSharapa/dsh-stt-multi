import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'providers/adapter': 'src/providers/adapter.ts',
    'providers/echo': 'src/providers/echo.ts',
    'worker/index': 'src/worker/index.ts',
    'worker/main': 'src/worker/main.ts',
    'download/index': 'src/download/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  platform: 'node',
  target: 'node20',
  external: ['sherpa-onnx-node', '@deepseek-ai/cordis', '@deepseek-ai/dsh-experimental-speech-to-text', '@deepseek-ai/dsh-subprocess'],
})

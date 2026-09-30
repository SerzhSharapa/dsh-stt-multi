[English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md)

# dsh-stt-multi

![dsh-stt-multi — voice input for DSH](docs/hero-en.svg)

[![Status](https://img.shields.io/badge/status-v0.6.0-yes-green)]() [![Tests](https://img.shields.io/badge/tests-26%2F26-brightgreen)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

Multi-provider speech-to-text for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
local **Whisper**, **GigaAM v2** (Russian SOTA) and OpenAI-compatible cloud APIs behind the native
DSH mic button — every model selectable in voice settings, no app code changes.

## Why

The stock DSH speech plugin (SenseVoice) doesn't understand Russian.
`dsh-stt-multi` registers additional STT providers — the DSH voice-settings list
**is** the provider registry, so one plugin instance = one selectable model.

## Engines

| Engine | Model | Languages | Size | Notes |
|--------|-------|-----------|------|-------|
| Whisper small (int8) | `whisper-small` | ru, en + multilingual | ~370 MB | **Default** — best balance |
| Whisper tiny (int8) | `whisper-tiny` | ru, en + multilingual | ~100 MB | Fast, rough RU |
| Whisper large-v3-turbo | `whisper-turbo` | ru, en + multilingual | ~800 MB | Best Whisper quality |
| GigaAM v2 (CTC int8) | `gigaam-v2` | **ru** | ~236 MB | RU specialist, MIT |
| Custom | `modelDirectory` | любые sherpa-совместимые | — | files exist = works, no hashes |
| Cloud API | `baseUrl` + key | зависит от API | 0 | OpenAI-compatible (Groq, OpenAI, …) |

Models download automatically (GitHub k2-fsa + HF/hf-mirror fallback, sha256-verified)
into `~/.dsh/speech-to-text/`. Model binaries never ship in the npm package.

## Install

From npm (recommended):

```bash
# inside a DSH profile (~/.dsh/profiles/<name>/):
dsh plugin --profile <name> add dsh-stt-multi
```

From a release tarball (no npm registry needed):

```bash
dsh plugin --profile <name> add https://github.com/SerzhSharapa/dsh-stt-multi/releases/download/v0.6.0/dsh-stt-multi-0.6.0.tgz
```

> Note: `dsh plugin` needs `pnpm` on PATH. DSH ships one — add it:
> `export PATH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/pnpm/bin:$PATH"`
> (or create a shim running `node .../pnpm/bin/pnpm.cjs "$@"`).

Then add the bundle to the profile's `package.json`:

```json
"dsh": { "profile": { "bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-experimental-voice-input-bundle",
  "@deepseek-ai/dsh-web-app",
  "dsh-stt-multi"
] } }
```

The plugin ships two engines out of the box (`whisper-small`, `whisper-tiny`) and a
`gigaam-local` entry. More models = more entries in your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: whisper-turbo          # unique instance id
      name: dsh-stt-multi
      config:
        providerId: whisper-turbo
        modelId: whisper-turbo
```

### Custom local model (CUSTOM-01)

```yaml
- insert:
    - id: my-model
      name: dsh-stt-multi
      config:
        providerId: my-model
        modelDirectory: /absolute/path/to/sherpa-whisper-model  # encoder*/decoder*/tokens*
```

### Cloud API provider

```yaml
- insert:
    - id: stt-api
      name: dsh-stt-multi
      config:
        providerId: stt-api
        baseUrl: https://api.groq.com/openai/v1/
        apiKeyEnv: GROQ_API_KEY     # key read from env — never stored in profile config
        apiModel: whisper-large-v3
```

Cloud engines are marked `☁️ … (cloud)` in the list — audio leaves your machine;
everything else is fully local.

## Configuration (per instance)

| Option | Default | Description |
|--------|---------|-------------|
| `providerId` | `whisper-local` | instance id shown in DSH settings |
| `modelId` | `whisper-small` | catalog model (tiny/small/turbo/gigaam-v2) |
| `modelDirectory` | — | custom sherpa model dir (overrides modelId) |
| `language` | `ru` | language hint (`auto` maps to `ru` for whisper) |
| `threads` | `2` | CPU threads for inference |
| `echo` | `false` | debug mode: no native inference |
| `baseUrl` / `apiKeyEnv` / `apiModel` | — | cloud provider (see above) |

## Development

```bash
npm install && npm run build && npm test
node scripts/smoke-native.mjs ~/.dsh/profiles/<name>/node_modules  # native smoke (plain node)
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  scripts/smoke-native.mjs ~/.dsh/profiles/<name>/node_modules     # real Electron runtime
```

Verified against DSH 0.2.0-rc.2 (cordis 4.0.4, sherpa-onnx-node 1.13.8, Electron 44).

## Privacy

Local engines never send audio anywhere — inference runs in an isolated local worker
process. Cloud providers are opt-in and explicitly marked.

## Licenses

- This plugin: MIT
- GigaAM v2 weights: MIT (salute-developers/GigaAM)
- Models remain property of their publishers; downloaded at runtime, not redistributed.

## Roadmap

- [x] Phase 1 — plugin skeleton & provider registration (+ Electron native smoke)
- [x] Phase 2 — model assets & download layer (mirrors, sha256, resume-safe)
- [x] Phase 3 — real Whisper worker end-to-end (Russian dictation)
- [x] Phase 4 — multi-instance model list + custom modelDirectory
- [x] Phase 5 — GigaAM v2 + OpenAI-compatible API provider

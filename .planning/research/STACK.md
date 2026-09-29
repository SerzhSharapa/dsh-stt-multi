# Stack Research

**Domain:** DSH speech-to-text plugin (offline ASR via sherpa-onnx + OpenAI-compatible STT APIs)
**Researched:** 2026-09-29
**Confidence:** HIGH (versions verified against npm registry and official sherpa docs on this date)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript + ESM | TS ~5.x | Plugin source | DSH plugins are ESM npm packages (`"type": "module"`); cordis 4.x is ESM-only. Matches official `@deepseek-ai/*` plugin format. |
| `@deepseek-ai/cordis` | **4.0.4** (peer `~4.0`) | Plugin runtime / DI / `cordis.patch.yml` multi-instance | Latest on npm today (verified: `registry.npmjs.org/@deepseek-ai/cordis/latest` → 4.0.4). Peer dep `~4.0.x` as planned; DSH vendors this package (`vendor/cordis` in deepseek-harness repo), so peer range must stay `~4.0` — never bundle it. |
| `sherpa-onnx-node` | **1.13.8** (pin `~1.13.8`) | Native offline ASR engine (Whisper, NeMo CTC, SenseVoice…) | Latest npm release (verified via registry, published with SLSA provenance). Ships per-platform prebuilt binaries as **optionalDependencies** including `sherpa-onnx-darwin-arm64@^1.13.8` — no node-gyp build on user machines. Same engine DSH's stock SenseVoice worker uses, so behavior/perf is a known quantity. |
| `sherpa-onnx-darwin-arm64` | ^1.13.8 (auto via optionalDeps) | Native binary darwin-arm64 | npm resolves it automatically on Apple Silicon; do NOT list it as a direct dependency (breaks other platforms). |
| VAD Silero | `silero_vad.onnx` (asset, not npm) | Voice-activity segmentation for the mic worker | Same model file the stock DSH worker loads; official download: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx` (verified in sherpa docs today). Reuse the same cache dir convention so users don't double-download. |

### ASR Models (downloaded at runtime → `~/.dsh/speech-to-text/<model>/`)

| Model | Artifact | modelConfig key | Why / Notes |
|-------|----------|-----------------|-------------|
| Whisper multilingual tiny / base / small / medium | `sherpa-onnx-whisper-*.tar.bz2` (github `asr-models` release tag, HF mirrors of it) | `modelConfig.whisper` (`encoder` + `decoder`, `language: "ru"`, `task: "transcribe"`) | Russian supported; smallest footprint for phase-1 default. Verify exact tarball names against the release page in phase 1 (docs "colab" page lists non-large models). |
| Whisper large-v3 / large-v3-turbo | exported via official `scripts/whisper/export-onnx.py`; turbo supported by the exporter | `modelConfig.whisper` | Best accuracy tier; int8 variants for CPU. large-v3 doc page (CPU int8) verified today. |
| **GigaAM v2 (CTC)** — Russian | **`sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19.tar.bz2`** (226 MB `model.int8.onnx` + `tokens.txt`) from `github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/…` | `modelConfig.nemoCtc` | **KEY FINDING: k2-fsa already publishes a pre-converted GigaAM v2 ONNX package.** No NeMo→ONNX conversion step is needed — phase 3's riskiest sub-task collapses to "download tarball + point nemoCtc at it." RNNT variant (`sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19`) also exists if CTC quality disappoints. Docs show working Russian output and mic+VAD usage. |
| Groq / OpenAI-compatible API | `POST {baseURL}/audio/transcriptions` (multipart), models `whisper-large-v3`, `whisper-large-v3-turbo` | n/a (fetch, no sherpa) | Fallback provider `stt-api`. Groq is OpenAI-endpoint-compatible; verify current model IDs against console.groq.com docs at phase 3 (docs page returned HTTP 403 to automated fetch — MEDIUM confidence on exact IDs). |

### Model Distribution / Download Layer

| Choice | Purpose | Why |
|--------|---------|-----|
| Primary: github releases `asr-models` tag (k2-fsa/sherpa-onnx) | Model tarballs + `silero_vad.onnx` | Canonical source sherpa docs link to; stable tag, no auth. GigaAM v2 verified here today. |
| Mirror: HuggingFace repos of `csukuangfj/sherpa-onnx-*` + `HF_ENDPOINT=https://hf-mirror.com` override | Fallback when github is slow/blocked | Same pattern the stock DSH worker already uses (HF + mirrors, `assets.json` hash manifest). Mirror via env-var endpoint swap keeps one code path. |
| Local cache `~/.dsh/speech-to-text/<model-id>/` with per-model `assets.json` (filename+size+sha256) | Integrity + resume | Stock plugin convention; custom `modelDirectory` skips DSH's hash check, so ship our own manifest check. Never commit models to git (repo rule). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `fetch` (undici) | Node ≥ 20 | API STT provider + model downloads | No axios needed; DSH bundles modern Node/Electron. Stream multipart upload directly. |
| `tar` (or `tar-fs` + `bzip2`/`bz2` handling) | `tar@^7` | Untar `.tar.bz2` model archives | sherpa tarballs are bzip2 — prefer decompressing via system `tar -xjf` (bsdtar on macOS handles it) rather than adding native bz2 deps. |
| `tsup` or `ts-node`+tsc | tsup ^8 | Build ESM bundle | Keep native `sherpa-onnx-node` external (`external: ['sherpa-onnx-node']`). |
| `vitest` | ^3 | Unit tests for worker/config logic | Mock the sherpa addon API surface; real-ASR tests are manual/integration. |
| zod (or cordis schema helpers) | ^3/v4 | Config validation per instance | One instance = one model config in `cordis.patch.yml`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| npm (not pnpm) for the published package | Consumer installs plugin via npm in a DSH profile | optionalDependencies platform binaries rely on plain npm resolution; test install in a scratch DSH profile before release. |
| Node + Electron ABI check | Native module in DSH host | `sherpa-onnx-node` uses N-API (node-addon-api) → ABI-stable across Electron; verify `process.versions.modules` loads in the DSH worker during phase 1 smoke test. |

## Installation

```bash
# Core (plugin project)
npm install sherpa-onnx-node@~1.13.8

# Peer (provided by DSH host — never bundled)
npm install -D @deepseek-ai/cordis@~4.0   # peerDependencies: { "@deepseek-ai/cordis": "~4.0" }

# Dev
npm install -D typescript tsup vitest @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| sherpa-onnx-node | whisper.cpp Node bindings (`smart-whisper`, `nodejs-whisper`) | Only if sherpa N-API binary conflicts with the DSH host; whisper.cpp binds you to one architecture (no nemoCtc/GigaAM path) — not worth it. |
| sherpa-onnx-node | transformerrs.js / ONNX Runtime Web (WASM) | Only for a web-profile plugin without Node native access; ~5–10× slower on CPU. |
| GigaAM v2 via pre-built ONNX tarball | own NeMo export pipeline (`scripts/nemo/GigaAM/run-ctc-v2.sh` upstream) | Only if we need a quantization/layout the published int8 package lacks; otherwise pure overhead (Python + NeMo + GPU env). |
| Groq whisper API | GigaChat/SaluteSpeech native API | Only if Groq latency/quotas fail; native API breaks the "OpenAI-compatible" abstraction — keep it behind the same provider interface if ever added. |
| github-releases-first downloads | hf_hub Node client | If we later need per-file (non-tarball) resolution or authed HF repos; plain HTTPS + mirror env var is enough now. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Bundling `@deepseek-ai/cordis` as a dependency | DSH vendors cordis (4.0.4); bundling causes dual-instance DI bugs and version drift across RCs | `peerDependencies: "~4.0"`, dev-dep only |
| `sherpa-onnx` (Python wheel) in the plugin | Requires Python runtime in every user profile | `sherpa-onnx-node` with prebuilt binaries |
| Listing `sherpa-onnx-darwin-arm64` as a direct dependency | Breaks install on linux/windows consumers | Let `sherpa-onnx-node` resolve it via optionalDependencies |
| Committing models/binaries to git or the npm tarball | 200 MB+ artifacts, repo rule violation, npm publish size limits | Runtime download to `~/.dsh/speech-to-text/` with manifest check |
| `modelConfig.senseVoice` hard-coded config (copying stock worker verbatim) | That is exactly the stock plugin's limitation that kills Russian | Config-driven `modelConfig` selection: `whisper` / `nemoCtc` / `senseVoice` by model type |
| axios/node-fetch polyfills | Extra deps; DSH host Node has global fetch | Built-in fetch + FormData |
| GigaAM v1 (`…giga-am-russian-2024-10-24`) | Non-commercial license (GigaAM License NC); v2 package ships a plain LICENSE file — still verify before public GitHub distribution | GigaAM v2 2025-04-19; check its LICENSE text in phase 3 |

## Stack Patterns by Variant

**If local offline (default):**
- Worker per instance: `OfflineRecognizer` + `VAD` (silero_vad.onnx) + modelConfig by model type
- Because it mirrors the stock speech-to-text-sensevoice worker the DSH host already trusts.

**If provider = `stt-api`:**
- Same SpeechProviderId registration, but worker just buffers PCM → wav/opus → multipart `POST {baseURL}/audio/transcriptions` with `model`, `language=ru`
- Because OpenAI-compatible = Groq, OpenAI, local whisper.cpp-server, LM Studio all work with one config (baseURL + apiKey + model).

**If model dir already populated (custom `modelDirectory`):**
- Skip hash check, only verify files exist
- Because that is the stock plugin's documented behavior for user-supplied dirs.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `sherpa-onnx-node@1.13.8` | Node N-API (stable ABI), incl. Electron hosts | Uses node-addon-api; darwin-arm64 binary included as optional dep. Smoke-test inside the actual DSH worker in phase 1 — that is the only real proof. |
| `@deepseek-ai/cordis@~4.0` (4.0.4 current) | DSH 0.2.0-rc.x host | SpeechProvider interface is experimental and may shift between RCs — re-verify `SpeechProviderId` registry API against the installed DSH version before each release (lesson from plugin-shop). |
| GigaAM v2 tarball ↔ sherpa-onnx-node 1.13.x | Yes | `OfflineNemoEncDecCtcModelConfig` present in 1.13.x config dump (verified in today's docs output). |
| silero_vad.onnx (asr-models tag) ↔ 1.13.8 | Yes | Same release lineage. |

## Sources

- npm registry `sherpa-onnx-node@latest` → **1.13.8**, optionalDeps incl. `sherpa-onnx-darwin-arm64` — fetched 2026-09-29 — HIGH
- npm registry `@deepseek-ai/cordis@latest` → **4.0.4**, ESM, vendored in deepseek-harness — fetched 2026-09-29 — HIGH
- sherpa docs: Whisper section (export + large-v3 CPU int8) `k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/` — fetched 2026-09-29 — HIGH
- sherpa docs: NeMo CTC Russian — pre-built `sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19` (226 MB int8, nemoCtc config, mic+VAD examples) and RNNT variant — fetched 2026-09-29 — HIGH
- sherpa docs: `silero_vad.onnx` official download URL (asr-models tag) — fetched 2026-09-29 — HIGH
- Groq speech-to-text model IDs (`whisper-large-v3(-turbo)`) — from training data; console.groq.com blocked automated fetch (403) — **MEDIUM, re-verify in phase 3**
- Prior local research: `~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md` (SpeechProviderId registry, stock worker internals, modelDirectory/hash behavior) — local, code-derived — HIGH

---
*Stack research for: DSH speech-to-text plugin (dsh-stt-multi)*
*Researched: 2026-09-29*

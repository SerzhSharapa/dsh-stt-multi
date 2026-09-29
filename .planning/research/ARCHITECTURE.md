# Architecture Research

**Domain:** DSH speech-to-text plugin (multi-provider, sherpa-onnx based)
**Researched:** 29.09.2026
**Confidence:** HIGH for DSH internals (read directly from shipped code of DSH 0.2.0-rc.2, extracted from `app.asar`); MEDIUM for sherpa-onnx non-SenseVoice modelConfig shapes (from sherpa-onnx 1.13.x API knowledge — verify against installed `sherpa-onnx-node` `.d.ts` at build time)

## Standard Architecture

### System Overview

The reference implementation (built-in `@deepseek-ai/dsh-experimental-speech-to-text-sensevoice`) splits into **three layers**, all inside the DSH Host (main) process except the inference worker:

```
┌──────────────────────────────────────────────────────────────────────┐
│  DSH Web GUI (voice-input UI)                                        │
│  mic button → records WAV → api-speech-to-text (Remote RPC, base64)  │
├──────────────────────────────────────────────────────────────────────┤
│  DSH Host process (cordis runtime)                                   │
│  ┌──────────────────────────┐   ┌─────────────────────────────────┐  │
│  │ speechToText Service     │   │ Provider plugin(s)              │  │
│  │ (dsh-experimental-       │◄──┤ apply(ctx, config)              │  │
│  │  speech-to-text)         │reg│  ├─ assets.json (model lock)    │  │
│  │  Map<SpeechProviderId,   │   │  ├─ download+sha256 verify      │  │
│  │  registration>           │   │  ├─ ManagedWorker               │  │
│  │  resolve() / transcribe()│   │  │   (queue, idle stop)          │  │
│  └──────────────────────────┘   └────────────┬────────────────────┘  │
│                                              │ spawn (stdio, token)  │
├──────────────────────────────────────────────┼───────────────────────┤
│  Worker child process (plain Node, ELECTRON_RUN_AS_NODE=1)           │
│  HTTP loopback server (127.0.0.1:ephemeral, Bearer token)            │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐           │
│  │ WAV parse  │→ │ Silero VAD  │→ │ sherpa-onnx-node     │           │
│  │ + validate │  │ (segments)  │  │ OfflineRecognizer    │           │
│  └────────────┘  └─────────────┘  │ modelConfig.<type>   │           │
│                                    └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

Key architectural facts verified in source:

- **Registry service** (`dsh-experimental-speech-to-text/lib/index.js`): a cordis `Service` named `"speechToText"`. Providers call `ctx.speechToText.register({ info, preparation?, transcribe })`. Duplicate `info.id` throws. `resolve()` pins provider+language; `transcribe(spec)` executes exactly the resolved provider with **no fallback**. Selection (`defaultProvider`, `language`) is `volatile` config persisted per profile entry via the `settings` service — this is what the UI "model list" reads (`listProviders()` / `snapshot()` / `follow()`).
- **Provider plugin contract** (sensevoice plugin `apply`): `name`, `inject: ["speechToText", "subprocess"]`, SchemaMaster `Config`, register inside `ctx.effect(() => () => dispose)`. Registration exposes `info` (id, name, `location: "host-local"`, languages, downloadSources, setupEstimate), a `preparation` object (state machine: `unprepared → checking → downloading → verify → load → ready/standby/failed/cancelled`, with `snapshot()/subscribe()` for UI progress) and a `transcribe(input, signal)` function.
- **Multi-instance pattern**: one `cordis.patch.yml` entry = one plugin instance = one provider. Confirmed in `~/.dsh/profiles/desktop/cordis.patch.yml`: each entry has a unique patch `id` + package `name` + instance `config`. Multiple entries with the same package name (as `@deepseek-ai/dsh-mcp-client` does for MCP servers) yield multiple instances, each registering under its own `config.providerId`. **The selection `defaultProvider` lives in the *core* speech-to-text entry's config, not the provider's.**
- **Worker isolation**: native `sherpa-onnx-node` is loaded only in the child via `createRequire(import.meta.url)("sherpa-onnx-node")`. The parent never imports the native module — it spawns `process.execPath worker.js <json-config>` with `DSH_SPEECH_TOKEN` env and `ELECTRON_RUN_AS_NODE=1`, reads `{"port":N}\n` from stdout, then POSTs WAV bytes to `http://127.0.0.1:N/transcribe?language=…` with Bearer auth (timing-safe compare). Serial execution via a promise-tail queue, bounded pending, idle timeout kills the process.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Core service (peer dep) | Provider registry, selection persistence, routing | Provided by DSH — our plugin only consumes it |
| Plugin entry (`apply`) | Validate per-instance config, build ManagedWorker, register provider, own lifecycle | cordis plugin; SchemaMaster Config; `ctx.effect` disposer |
| Config schema | Per-instance knobs: providerId, dataRoot, model refs, precision, VAD params, threads, timeouts | SchemaMaster `z.object` with defaults (copy sensevoice's, extend with `modelType`) |
| Model lock (`assets.json`) | Pinned per-asset `{name,url,bytes,sha256}` per model type + precision | Static JSON in package `runtime/`; ours becomes a catalog with entries per (type, size/precision) |
| Download/verify layer | Probe HF mirrors (HEAD race), stream-download to `.part`, hash while streaming, atomic rename, categorized errors | Port of sensevoice's `downloadAsset`/`orderModelSources`/`verifyRuntime` — reusable nearly verbatim |
| ManagedWorker | Queue transcriptions, spawn/stop child, idle reclaim, preparation state machine | Port of `SenseVoiceWorker` generalized over model type |
| Worker process | WAV validation → PCM16→Float32 → VAD segmentation → per-segment `OfflineRecognizer.decode` → join texts | HTTP loopback server; only place native module is imported |
| modelConfig selector | Map `(modelType) → modelConfig branch` | `whisper: {model, language, task, tailPaddings?}` vs `nemoCtc: {model}` vs `senseVoice: {model, language, useInverseTextNormalization}` (verify in sherpa-onnx-node .d.ts) |

## Recommended Project Structure

```
src/
├── index.ts               # cordis plugin: name, inject, Config, apply()
├── config.ts              # per-instance SchemaMaster schema (providerId, modelType, ...)
├── models.ts              # model catalog: per (modelType, variant) → files list + download URLs
├── assets/
│   ├── lock.ts            # load/validate pinned assets (name/url/bytes/sha256)
│   ├── download.ts        # mirror probe, streaming download+hash, atomic publish
│   └── verify.ts          # sha256 verify, inspect (no-download readiness check)
├── worker/
│   ├── manager.ts         # ManagedWorker: spawn, readiness, queue, idle stop, states
│   ├── server.ts          # loopback HTTP server, Bearer auth, size limits
│   ├── transcriber.ts     # sherpa-onnx OfflineRecognizer + Silero VAD; modelConfig switch
│   └── main.ts            # child entry: parse argv JSON, start server, print {"port"}
└── types.ts               # SpeechProvider-ish interfaces (re-declare; core ships no .d.ts in runtime extract)
runtime/
└── models.json            # pinned per-model asset catalog (bytes+sha256 for every variant we ship)
```

### Structure Rationale

- **`assets/` separated from `worker/`:** downloading/verification runs in the Host process and is model-type-agnostic; inference runs in the child and is model-type-specific. Clean boundary = the JSON config passed over argv.
- **`models.ts` + `runtime/models.json`:** the built-in hardcodes `senseVoice` and a 2-precision lock. We generalize to a catalog keyed by `modelType` + variant, each entry listing its own files (Whisper: `model.onnx` + `tokens.txt`; nemoCtc: `model.onnx` + `tokens.txt`; VAD shared Silero).
- **`worker/` mirrors the shipped worker file layout** so the spawn/readiness protocol (stdout `{"port"}` + env token) can be copied with minimal change.

## Architectural Patterns

### Pattern 1: Provider plugin over the experimental speechToText service

**What:** A cordis plugin with `inject: ["speechToText", "subprocess"]` that registers N providers (one per patch.yml instance).
**When to use:** Always here — it is the only way into the native mic button.
**Trade-offs:** Depends on experimental peer `@deepseek-ai/dsh-experimental-speech-to-text` pinned to an rc version (API may change between rc); peer `cordis ~4.0.4`.

```typescript
// cordis.patch.yml (profile) — two models = two entries:
- id: stt-whisper-turbo
  name: dsh-stt-multi
  config:
    providerId: whisper-large-v3-turbo
    modelType: whisper
    variant: turbo-int8
- id: stt-gigaam
  name: dsh-stt-multi
  config:
    providerId: gigaam-v2-ctc
    modelType: nemoCtc
    dataRoot: ~/.dsh/speech-to-text   # shared cache root; models land in models/<type-variant>/
```

### Pattern 2: Managed native-worker child process

**What:** Parent spawns a dedicated Node child for `sherpa-onnx-node`; communication is an authenticated loopback HTTP server; readiness frame on stdout.
**When to use:** Always for native inference — keeps the addon out of the Host/Electron process, gives crash isolation and idle reclaim.
**Trade-offs:** Extra process + model-load latency on wake (~seconds for large models); mitigated by `standby` state + idle timeout from the reference.

```typescript
const handle = ctx.subprocess.spawn({
  argv: [process.execPath, workerJs, JSON.stringify({ ...config, ...verifiedPaths })],
  env: { DSH_SPEECH_TOKEN: token, ELECTRON_RUN_AS_NODE: "1" },
  stdio: { stdin: "ignore", stdout: "pipe", stderr: { maxBytes } },
});
const port = await readReady(handle, maxLogBytes, signal); // {"port":N}\n on stdout
```

### Pattern 3: Content-addressed model cache with pinned assets

**What:** Every downloadable file pinned by `{url (revision-pinned), bytes, sha256}`; verify-on-activate (`inspect`, no download); download to `*.uuid.part` while hashing the stream, atomic `rename` on success; multi-origin (HF + hf-mirror.com) with HEAD probe racing.
**When to use:** All local model types; custom `modelDirectory`/`vadModelPath` bypass hash checks (reference behavior — keep it for power users).
**Trade-offs:** Catalog maintenance burden (must pin hashes for every variant we offer); buys integrity + resumable-by-restart semantics for free.

### Pattern 4: modelConfig selection by model type

**What:** The worker builds the sherpa `OfflineRecognizer` config branch from `modelType`:

```typescript
switch (modelType) {
  case "senseVoice": mc.senseVoice = { model, language, useInverseTextNormalization: 1 }; break;
  case "whisper":    mc.whisper = { model, language, task: "translate" | "transcribe", tailPaddings: 3000 }; break;
  case "nemoCtc":    mc.nemoCtc = { model }; break; // GigaAM v2 ONNX
}
// shared: mc.tokens, mc.numThreads, mc.provider: "cpu", featConfig { sampleRate: 16000, featureDim: 80 }
```

**When to use:** This is the exact limitation of the built-in (hardcoded `modelConfig.senseVoice`) that our plugin exists to remove.
**Trade-offs:** Language handling differs (Whisper: `language` + `task`; SenseVoice: `language` hint; CTC: none) — normalize into per-type adapters so the provider `info.languages` metadata stays honest.

## Data Flow

### Request Flow (one dictation)

```
[mic button in DSH GUI]
   ↓ WAV (base64, Remote RPC)
[api-speech-to-text] validateWave + size limits
   ↓
[speechToText.resolve({providerId?, language?})]  ← defaults from volatile config (settings UI)
   ↓
[provider.transcribe({audio: Buffer(WAV), language}, signal)]
   ↓ ManagedWorker.enqueue (serial tail queue, maxPending)
[child POST / 127.0.0.1:port/transcribe?language=…  Bearer token, body=audio/wav]
   ↓
[worker: WAV header check → PCM16→Float32 @16kHz]
   ↓ 512-sample windows
[Silero VAD] — segments; drain →
[OfflineRecognizer: createStream → acceptWaveform → decode → getResult]
   ↓ join texts
{ text, audioSeconds, inferenceSeconds }  ← same JSON shape back up
   ↓
[text lands in the message input]
```

Preparation flow (model download) is orthogonal, Host-side: `inspect()` on activation (no I/O beyond stat+hash) → UI triggers `prepare({downloadSource})` → `checking → downloading(bytes progress) → verify → load(spawn child, load model) → ready`. Worker idle → terminate → `standby` (model stays on disk; wake = respawn).

### State Management

Preparation is the only stateful machine: `{phase, step, steps[], message?, download?}` exposed via `snapshot()/subscribe()`; the core service re-emits to UI through `follow()`. Selection state (`defaultProvider`, `language`) is persisted by the core service into its profile entry — our plugin must **not** persist selection itself.

### Key Data Flows

1. **Audio:** GUI → base64 RPC → Buffer → child HTTP body → Float32 samples → VAD → recognizer → text string. Direction is strictly one-way; nothing but `{text, timings}` comes back.
2. **Models:** assets catalog → probe origins → streamed download + sha256 → `~/.dsh/speech-to-text/models/<type>/<variant>/…` → verified paths passed to child via argv JSON on spawn.
3. **Config:** `cordis.patch.yml` entry → SchemaMaster-validated per-instance config → ManagedWorker + provider `info`. Selection: settings UI → core service `configure()` → volatile config.

## Scaling Considerations

| Concern | Today (single user) | Many models installed | Notes |
|---------|---------------------|----------------------|-------|
| Disk | 0.2–1 GB per model | catalog UI + prune helper later | keep out of git; shared `dataRoot` per machine |
| Memory | one worker live (one loaded model) | idle timeout reclaims; never load two recognizers at once | serial queue is per-instance; instances are independent processes only when both prepared — acceptable |
| Latency | model load on wake (standby→ready) | prefer small models for daily use; document per-variant load times in `setupEstimate` | `expectedMemoryBytes`/`recommendedDiskBytes` metadata exists — use it honestly |
| CPU | `threads` config (default 2) | unchanged | VAD + decode both honor numThreads |

### Scaling Priorities

1. **First bottleneck: model-load latency on wake** for large Whisper variants — mitigate with generous `idleTimeoutMs` default and honest `setupEstimate`.
2. **Second: download reliability** in RU network — multi-origin fallback (HF + hf-mirror.com, plus optional custom origin) is already in the reference pattern; keep it.

## Anti-Patterns

### Anti-Pattern 1: Importing sherpa-onnx-node in the Host process

**What people do:** `import "sherpa-onnx-node"` at plugin top level.
**Why it's wrong:** Native addon loads into Electron's process — a crash or long GC freezes the whole app; the reference deliberately confines it to a `ELECTRON_RUN_AS_NODE` child.
**Do this instead:** `createRequire` inside the worker entry only; parent speaks HTTP.

### Anti-Pattern 2: One provider id with a "model" dropdown inside the plugin

**What people do:** Register a single provider and try to render own model picker in config.
**Why it's wrong:** The native mic-button UI reads the provider registry (`listProviders`) — model choice = provider choice there. Custom UI is invisible to the button.
**Do this instead:** One `cordis.patch.yml` entry per model; selection happens through the standard settings UI (`defaultProvider`).

### Anti-Pattern 3: Re-implementing selection/persistence in the plugin

**Why it's wrong:** Core service already persists `defaultProvider`/`language` per profile and validates language support; duplicated state drifts.
**Do this instead:** Only expose correct `info.languages` per modelType; let the core own selection.

### Anti-Pattern 4: Skipping hash pinning for downloads

**Why it's wrong:** HF tags move; a silently-swappped model breaks inference in ways hard to debug.
**Do this instead:** Revision-pinned URLs + `bytes`/`sha256` per file, exactly like `runtime/assets.json`; custom `modelDirectory` users opt out explicitly.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Hugging Face / hf-mirror.com | HEAD-probe race → first-ok origin preferred; download with per-origin fallback | URL form `…/resolve/<revision>/<file>`; keep both origins + optional config override |
| OpenAI-compatible ASR API (phase 3 fallback `stt-api`) | Same provider registration, `transcribe` does HTTPS multipart instead of spawning worker | `location` other than `host-local`; no preparation needed (or minimal) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| plugin ↔ core speechToText | `ctx.speechToText.register(...)` in-process | peer dep pinned `0.2.0-rc.2`; re-check on DSH upgrades |
| plugin (Host) ↔ worker child | spawn argv JSON + stdout readiness + loopback HTTP + Bearer token | keep config JSON schema versioned (child may come from older installed package during upgrades) |
| worker ↔ sherpa-onnx-node | sync calls (`decode`) on the request thread | serial per child; queue in parent |

## Build Order Implications (for roadmap)

Dependency-driven order; each step has a verifiable artifact:

1. **Plugin skeleton + registry wiring** (no inference): `apply()` registers a fake provider that returns canned text; verify it appears in DSH settings mic list. *Proves the cordis.patch.yml/peer-dep/install story — the riskiest integration.*
2. **Assets layer**: port download/verify (model-type-agnostic); pin Whisper tiny int8 + tokens + Silero VAD in `runtime/models.json`; CLI/testable download into `~/.dsh/speech-to-text/`.
3. **Worker with Whisper**: spawn protocol + HTTP server + `modelConfig.whisper` + VAD; end-to-end Russian dictation through the native button.
4. **Multi-instance**: per-instance config (providerId/modelType/variant/threads/precision), second patch entry, shared `dataRoot` cache; selection via standard UI.
5. **nemoCtc (GigaAM v2)**: ONNX conversion is its own sub-phase; adapter behind the same modelConfig switch. Fallback if conversion stalls: `stt-api` provider (OpenAI-compatible endpoint) reusing steps 1's registration shape — no worker needed.

Phases 1–2 are independent of sherpa specifics; phase 3 is the first end-to-end risk-reduction; 5 is isolated behind the adapter boundary.

## Sources

- DSH 0.2.0-rc.2 shipped source, extracted from `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`:
  - `dsh-experimental-speech-to-text/lib/index.js` (registry service, selection persistence) — read in full
  - `dsh-experimental-speech-to-text-sensevoice/lib/{index,worker}.js`, `runtime/assets.json` (provider plugin, managed worker, download/verify, modelConfig.senseVoice + Silero VAD) — read in full
  - `dsh-experimental-api-speech-to-text/lib/index.js` (GUI RPC surface: base64 WAV, resolve+transcribe)
- `~/.dsh/profiles/desktop/cordis.patch.yml` (multi-instance entry pattern, confirmed live)
- `.planning/PROJECT.md`; `~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md`
- sherpa-onnx 1.13.x offline modelConfig API (`whisper`/`nemoCtc`/`senseVoice` branches) — MEDIUM confidence, API knowledge; verify against `node_modules/sherpa-onnx-node` type declarations during Phase 3.

---
*Architecture research for: DSH multi-provider speech-to-text plugin*
*Researched: 29.09.2026*

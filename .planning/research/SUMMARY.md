# Project Research Summary

**Project:** dsh-stt-multi (DSH speech-to-text plugin, multi-provider: Whisper / GigaAM / API)
**Domain:** Desktop plugin — offline & cloud ASR behind DSH's native mic button (cordis 4 / sherpa-onnx)
**Researched:** 2026-09-29 – 2026-09-30
**Confidence:** HIGH

## Executive Summary

dsh-stt-multi is a cordis plugin for DeepSeek Harness that fixes the stock SenseVoice worker's core limitation — no Russian — by registering multiple speech providers (local Whisper, local GigaAM v2, OpenAI-compatible cloud APIs) selectable from DSH's native voice-settings list. Experts build exactly one shape here: a provider plugin over the experimental `speechToText` registry (one `cordis.patch.yml` entry = one model), with native `sherpa-onnx-node` inference confined to an authenticated child-process worker, and models downloaded at runtime into `~/.dsh/speech-to-text/` with pinned sha256 manifests and HF/hf-mirror fallback. The stock sensevoice plugin is a near-complete reference implementation; our plugin is best built as a generalized port of it (model-type-driven `modelConfig` switch instead of hardcoded `senseVoice`).

The recommended approach: TypeScript/ESM, peer `@deepseek-ai/cordis@~4.0` (never bundled), `sherpa-onnx-node@~1.13.8` (N-API prebuilt binaries, no node-gyp), Silero VAD asset shared with the stock worker. Two research findings materially de-risk the plan. First, **k2-fsa already publishes a pre-built GigaAM v2 ONNX package** (`sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19`, 226 MB int8, `modelConfig.nemoCtc`, verified on the official releases; an RNNT variant also exists) — the risky NeMo→ONNX conversion sub-phase collapses to "download tarball + point nemoCtc at it". Conversion remains only a fallback if we ever need a custom quantization. Second, the OpenAI-compatible API provider is independent of GigaAM and any local engine — it needs only provider registration — so it can be promoted ahead of (or alongside) GigaAM rather than being a phase-3 fallback.

Key risks: the experimental SpeechProvider API may break between DSH RCs (mitigate: single adapter module + per-RC smoke test in a real profile); sherpa-onnx native binary failing inside Electron/ASAR/quarantine despite working under plain node (mitigate: first smoke test constructs a recognizer inside a DSH desktop profile); Whisper Russian output silently broken by decoder-parameter bugs (language tokens, `tailPaddings`) — mitigate with golden ru+en audio regression tests from day one; and download corruption/network issues for RU users (mitigate: own sha256 manifest + mirrors + resumable downloads, since the host skips hash checks for custom dirs).

## Key Findings

### Recommended Stack

From [STACK.md](STACK.md) — versions verified against npm registry and official sherpa-onnx docs on 2026-09-29.

**Core technologies:**
- **TypeScript + ESM** — DSH plugins are ESM npm packages; cordis 4.x is ESM-only.
- **`@deepseek-ai/cordis` peer `~4.0`** (4.0.4 current) — plugin runtime/DI; DSH vendors it, so it must be a peer dependency, never bundled.
- **`sherpa-onnx-node@~1.13.8`** — native offline ASR (Whisper, NeMo CTC, SenseVoice); same engine as the stock worker; per-platform prebuilt binaries via optionalDependencies (darwin-arm64 included automatically).
- **Silero VAD (`silero_vad.onnx` asset)** — voice segmentation; same file the stock worker loads.
- **Node built-in `fetch`** — API provider + model downloads; no axios.
- **vitest / tsup / zod (SchemaMaster)** — tests (mocked sherpa API), ESM build (sherpa external), per-instance config validation.

**Models (runtime download → `~/.dsh/speech-to-text/`):** Whisper tiny→large-v3-turbo (`modelConfig.whisper`, RU OK); **GigaAM v2 pre-built ONNX** (`modelConfig.nemoCtc` — no conversion needed); OpenAI-compatible `/audio/transcriptions` endpoints (Groq/OpenAI/local servers) via plain fetch.

**Critical constraints:** never bundle cordis; never list platform binaries as direct deps; never commit models to git/npm; pin exact sherpa version so wrapper and platform binary stay in lockstep.

### Expected Features

From [FEATURES.md](FEATURES.md) — benchmarked against Handy, superwhisper, MacWhisper, and stock DSH.

**Must have (table stakes):**
- Provider appears in DSH voice-settings list (the product concept itself)
- Local Whisper with Russian — the founding problem
- Model auto-download with HF mirror fallback + manual install (custom `modelDirectory`)
- Mic-button dictation UX (inherited — do not re-implement)
- Readable error surfacing (download failed / model missing / mic permission)
- Per-instance language/threads/precision; sensible default model

**Should have (differentiators):**
- Multiple engine architectures behind one settings list (whisper + nemoCtc + API) — no competitor does this
- GigaAM v2 local (best RU WER, offline, free) — now cheap thanks to the pre-built package
- OpenAI-compatible API provider, free where superwhisper gates it behind Pro — promotable early (independent of local engines)
- Custom sherpa-compatible models via modelDirectory; quantized/turbo whisper variants; auto/explicit language per instance

**Defer (v2+):** post-processing via DSH agent (API for hooks unverified).

**Never (anti-features):** own global hotkeys (conflicts with native mic button), file/meeting transcription UI, shipping model binaries, runtime model conversion, telemetry/licensing, streaming partial transcripts.

### Architecture Approach

From [ARCHITECTURE.md](ARCHITECTURE.md) — DSH internals read directly from 0.2.0-rc.2 shipped code (HIGH confidence). The plugin is a three-layer port-and-generalize of the stock sensevoice plugin: a cordis provider plugin in the Host process (registry + download/verify + ManagedWorker), an authenticated loopback-HTTP child worker where `sherpa-onnx-node` is the only native import (WAV → VAD → `OfflineRecognizer`), and a pinned-assets model catalog generalized over model type.

**Major components:**
1. **Plugin entry (`apply`, config schema, provider registration)** — one patch.yml instance = one provider; selection/persistence owned by the core service, not us.
2. **Assets layer (`models.ts` catalog, download/verify)** — model-type-agnostic, sha256-pinned, mirror-racing, resumable.
3. **ManagedWorker + worker child** — spawn protocol (stdout `{"port"}` + Bearer token), serial queue, idle reclaim; `modelConfig` switch by `modelType` (whisper / nemoCtc / senseVoice).
4. **API provider** — same registration shape, `transcribe` does HTTPS multipart instead of spawning a worker.

**Key anti-patterns to avoid:** importing sherpa-onnx-node in the Host process; a model dropdown inside one provider id (invisible to the mic button); re-implementing selection persistence; skipping hash pinning.

### Critical Pitfalls

From [PITFALLS.md](PITFALLS.md) — top items:

1. **Native binary fails inside Electron** (optional dep skipped, ASAR, quarantine, ABI) — first smoke test must construct a recognizer inside a real DSH desktop profile, not plain node; pin exact sherpa version; postinstall require-check.
2. **Whisper Russian garbage output from parameter bugs** (language tokens, `tailPaddings`) — copy known-good sherpa example configs verbatim; golden ru+en audio regression tests from phase 1.
3. **HF downloads: rate limits, mirrors, unverified files** — own sha256 manifest (repos publish none), `.part` + atomic rename, resumable Range downloads, HF→hf-mirror fallback; verification is our responsibility for custom dirs.
4. **Experimental SpeechProvider API breaking between RCs** — isolate all DSH touchpoints in one adapter module; per-RC profile smoke test; peer-compat check before install.
5. **Multi-instance conflicts** (shared paths, settings bleed-through, double-loaded recognizers) — namespaced per-model directories designed in phase 1; lazy load; explicit `.free()`; two-instance test matrix in phase 2.

Also notable: macOS mic TCC permission failures are silent (detect zero-energy VAD → explicit permission error); memory blow-up with large models (conservative defaults, RSS hints); GigaAM conversion fragility (now mostly moot — see reconciliation).

### Reconciled Disagreements

- **GigaAM conversion:** ARCHITECTURE.md and PITFALLS.md treat NeMo→ONNX conversion as a risky phase-3 sub-phase with a time-boxed spike. STACK.md's finding supersedes this: **k2-fsa publishes a pre-built GigaAM v2 package** (`sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19`, verified on GitHub releases + sherpa docs, HIGH confidence). Resolution: no conversion phase — GigaAM becomes "download tarball + nemoCtc adapter". Keep conversion only as a documented fallback (custom quantization needs); retain the golden-audio WER gate before declaring GigaAM done.
- **API provider ordering:** FEATURES.md notes the OpenAI-compatible API provider depends only on provider registration — it is independent of GigaAM and local engines. Resolution: promote it to its own early phase (or bundle with GigaAM phase) rather than a phase-3 fallback; it is the cheapest high-value provider.

## Implications for Roadmap

### Phase 1: Whisper-local MVP (single provider, end-to-end RU)
**Rationale:** Validates the riskiest integration (registration + native binary in Electron + Russian quality) with the smallest surface; every later phase reuses its components.
**Delivers:** Plugin skeleton + adapter-isolated registration; assets/download layer (sha256 manifest, mirrors); worker child with `modelConfig.whisper` + Silero VAD; golden ru+en tests; provider visible and working via the native mic button in a real DSH profile.
**Addresses:** table stakes (provider in list, local Whisper RU, auto-download, error surfacing, default model).
**Avoids:** pitfalls 1 (native/Electron), 2 (whisper decoder params), 4 (downloads), 5 (API break — adapter isolation + smoke test), 7 (mic permission UX); designs pitfall-6 path scheme now.

### Phase 2: Multi-instance model list
**Rationale:** The "Handy-like" differentiator; depends only on phase 1's registration pattern.
**Delivers:** Per-instance config (modelType/variant/threads/precision/language), second+ patch.yml entries, shared `dataRoot`, catalog with quantized/turbo variants, custom `modelDirectory` models, memory hints in UI.
**Avoids:** pitfalls 6 (multi-instance conflicts) and 9 (memory); verifies with the two-instance test matrix.

### Phase 3: GigaAM v2 local + OpenAI-compatible API providers
**Rationale:** Both now low-risk: GigaAM via the pre-built ONNX package (no conversion), API provider via plain fetch behind the same registration. Could be one phase or split; if split, API first (cheaper).
**Delivers:** `nemoCtc` adapter + GigaAM catalog entry (golden-audio WER gate vs reference transcript); `stt-api` provider (baseURL/apiKey/model per instance, multipart upload, clear "cloud" labeling, credential hygiene).
**Avoids:** pitfall 3 (conversion — reduced to fallback note), security mistakes (API key storage/logging).

### Phase 4: Release hardening (small)
**Rationale:** npm packaging, per-RC compatibility checklist, docs.
**Delivers:** `os`/`cpu`/`files` fields, `npm pack --dry-run` check, README compatibility matrix, install docs in `~/hq/toolkit/dsh/`, GitHub public release.

### Phase Ordering Rationale

- Registration → download layer → worker is the strict dependency chain from ARCHITECTURE's build order; each step has a verifiable artifact.
- API provider promoted out of "fallback" because it depends only on registration (FEATURES dependency graph); GigaAM demoted from "risky conversion" to "download + adapter" (STACK finding).
- All download/mirror/memory infrastructure lands in phase 1 as shared components, so phases 2–3 only add catalog entries and adapters.

### Research Flags

Phases likely needing deeper research during planning (`--research-phase`):
- **Phase 3 (GigaAM):** verify the tarball's exact file layout + LICENSE terms before public redistribution; verify `nemoCtc` config shape against installed `.d.ts` (ARCHITECTURE flags this MEDIUM).
- **Phase 3 (API):** re-verify Groq/OpenAI model IDs (docs returned 403 to automated fetch — MEDIUM).

Phases with standard patterns (skip research-phase):
- **Phase 1, Phase 2:** the shipped sensevoice plugin is a complete, code-verified reference; patterns are documented in ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry + official sherpa docs (2026-09-29) |
| Features | HIGH | Competitor facts from primary pages; DSH facts code-verified |
| Architecture | HIGH | DSH internals read from shipped 0.2.0-rc.2 code; sherpa non-senseVoice config shapes MEDIUM (verify vs `.d.ts`) |
| Pitfalls | MEDIUM-HIGH | DSH facts code-verified; some sherpa/Electron community-issue knowledge not freshly fetched |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact Whisper tarball names/sizes** for our catalog — verify against the k2-fsa release page in phase 1; compute sha256 at packaging time.
- **`nemoCtc`/`whisper` config shapes** — confirm against installed `sherpa-onnx-node` type declarations during implementation.
- **Groq/OpenAI model IDs** — re-verify from console docs in phase 3 (automated fetch was 403).
- **GigaAM v2 license** — tarball ships a plain LICENSE; review text before public GitHub redistribution.
- **sherpa-onnx-node inside the DSH Electron host** — only a real profile smoke test proves ASAR/quarantine/ABI safety; plan it as the first phase-1 milestone.

## Sources

### Primary (HIGH confidence)
- npm registry: `sherpa-onnx-node@1.13.8`, `@deepseek-ai/cordis@4.0.4` — fetched 2026-09-29
- sherpa-onnx official docs: Whisper export/large-v3-int8, NeMo CTC Russian (pre-built GigaAM v2 package), `silero_vad.onnx` download — k2-fsa.github.io/sherpa — fetched 2026-09-29
- DSH 0.2.0-rc.2 shipped source (extracted from app.asar): speech-to-text registry, sensevoice provider/worker, runtime/assets.json; live `cordis.patch.yml` multi-instance pattern
- Competitor primary pages: Handy README/site, superwhisper (archived), macwhisper.com
- Local code-derived research: `~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md`

### Secondary (MEDIUM confidence)
- Groq speech-to-text model IDs (training data; console fetch blocked 403) — re-verify phase 3
- sherpa-onnx non-SenseVoice `modelConfig` API knowledge — verify vs `.d.ts`
- Community-issue knowledge: Electron ASAR/quarantine, macOS TCC, whisper tailPaddings behavior — spot-check during phase 1

---
*Research completed: 2026-09-30*
*Ready for roadmap: yes*

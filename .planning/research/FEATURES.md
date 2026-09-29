# Feature Research

**Domain:** STT / voice-dictation products (macOS desktop apps + DSH built-in speech-to-text plugin context)
**Researched:** 2026-09-30
**Confidence:** HIGH (competitor facts verified from primary pages/READMEs; DSH facts verified against DSH 0.2.0-rc.2 code per `.planning/PROJECT.md`)

Scope note: this is the **Features** dimension only (per research request). It analyzes what
Handy, superwhisper, MacWhisper, Whisper menubar apps, and DSH's built-in speech-to-text
offer — specifically: model selection list, model auto-download with mirrors, language
support (RU focus), precision/threads config, API providers, hotkeys, dictation-vs-command
modes, privacy/local-first — and categorizes for `dsh-stt-multi`.

## Competitor Feature Snapshot (verified)

| Capability | Handy (OSS, free) | superwhisper (freemium) | MacWhisper (paid) | DSH built-in (sensevoice) | dsh-stt-multi (ours) |
|---|---|---|---|---|---|
| Model selection list | Settings→Models: whisper small/medium/turbo/large + Parakeet, custom models section | Local whisper models + cloud models (Pro, own API keys) | Local + cloud models switcher | ONE provider (SenseVoice); UI list = provider registry | Multi-instance = multiple entries in DSH voice settings list |
| Auto-download + mirrors | Auto from blob.handy.computer / HF; documented manual-install URLs for proxy users; HF cache reuse | Auto for local models | Auto for local whisper | Auto from HF mirrors, hash check via assets.json; hash check skipped if custom `modelDirectory` | Same pattern as stock worker (HF mirrors → `~/.dsh/speech-to-text/<model>/`) |
| Languages | Whisper multilingual + Parakeet auto-detect (EN-only model) | 100+ languages, translate-to-EN (Pro) | 100+ languages | zh/yule/en/ja/ko only — **no RU** | Whisper = RU OK; GigaAM = RU-best; goal = RU |
| Precision / threads / accel | GPU accel auto (Vulkan/CoreML) | Implicit (Apple Silicon local; Intel→cloud) | Implicit | precision/threads config exposed | Keep parity: per-instance precision/threads |
| API providers | None (local only) | Own API keys (OpenAI etc., Pro) | OpenAI, Anthropic, xAI, Gemini connectors | None | OpenAI-compatible endpoint (Groq whisper ru OK per earlier research) |
| Hotkeys | Configurable shortcut; hold (push-to-talk) / toggle / hybrid modes; CLI + signals | ⌥+Space default, configurable | App-level (dictation mode) | DSH native mic button (own UX) | **Do not build hotkeys** — reuse DSH mic button |
| Dictation vs command modes | Dictation only (+ toggle post-processing) | Presets per use-case; custom prompts (AI rewrite of transcript) = command-ish | Dictation + file/meeting transcription; custom AI prompts | Dictation only | Dictation only for MVP; post-processing via DSH agent = later |
| Privacy / local-first | Core selling point ("voice stays on your computer") | Core selling point (offline-first) | Local models for sensitive files | Local | Local-first by default; API providers must be opt-in and clearly labeled |

Sources: [Handy README](https://github.com/cjpais/Handy) (HIGH), archived superwhisper.com pricing/FAQ (HIGH), macwhisper.com (HIGH), DSH analysis in `~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md` (HIGH, code-verified).

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the plugin feels broken next to Handy/stock DSH.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Provider appears in DSH voice-settings list | The entire product concept: select model from a list without code edits; stock UX registers providers in `SpeechProviderId` | LOW | One `dsh register` + worker; multi-instance via multiple `cordis.patch.yml` entries |
| Local Whisper engine (tiny→large-v3-turbo) with RU | Stock SenseVoice has no RU — the founding problem; every competitor ships whisper multilingual | MEDIUM | sherpa-onnx `modelConfig.whisper`; exact config knobs verified in stock worker |
| Model auto-download with HF mirror fallback | Stock worker does this (mirrors + assets.json hash check); Handy documents mirror URLs; users behind proxies need it (RU users often do) | MEDIUM | Reuse stock worker pattern; download into `~/.dsh/speech-to-text/<model>/` per CLAUDE.md |
| Manual model install (files in dir, skip hash check) | Handy has this for restricted networks; stock DSH skips hash check for custom `modelDirectory` | LOW | Just document dir layout; already supported by stock logic |
| VAD + mic-button UX (push/release → transcript) | Every competitor has push-to-talk or toggle; DSH native button provides it | LOW (inherited) | Do not re-implement; worker just consumes audio stream like stock |
| Error surfacing (download failed / model missing / incompatible) | Stock plugin test-button flow exists; silent failure = worst UX | LOW-MEDIUM | Worker startup errors → DSH UI; test button must give readable message |
| Per-instance config: language, threads, precision | Stock plugin exposes precision/threads; Handy/superwhisper tune per model | LOW-MEDIUM | Pass-through to sherpa-onnx `OfflineRecognizerConfig`; per-instance via patch.yml config |
| Local-first privacy (audio never leaves machine for local engines) | Handy + superwhisper's #1 marketing point; dictation audio is sensitive | LOW (inherited) | Local engines are on-device by construction; document it |
| Sensible default model out of the box | Handy defaults to a good quality/size model; users shouldn't research model charts | LOW | Default: whisper small or medium (RU quality vs size) — verify in phase 1 |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multiple engine architectures behind one UI (whisper + nemoCtc + API) | No competitor's-list item does RU + multilingual + cloud in one settings list; DSH multi-instance makes it natural | HIGH | Each engine = own modelConfig builder; phase-gated (1: whisper, 2: multi-instance, 3: gigaam/api) |
| GigaAM v2 local provider (RU-specialist, SOTA RU WER) | Best-in-class Russian locally, free, offline — neither Handy nor superwhisper ships it | HIGH | Needs NeMo→ONNX conversion to sherpa `modelConfig.nemoCtc`; may fail → API fallback planned |
| OpenAI-compatible API provider (Groq/OpenAI/etc.) | superwhisper gates API keys behind Pro; we give it free; instant quality on weak hardware (Intel Macs per superwhisper FAQ) | MEDIUM | POST audio → `/audio/transcriptions`; key + base URL per instance; must label "cloud" clearly (privacy) |
| Custom sherpa-compatible models via modelDirectory | Handy's best-loved trick (drop a .bin in models dir → appears as "Custom Models") | MEDIUM | Schema: instance config points at arbitrary dir + modelConfig type; hash check already skipped for custom dirs |
| Whisper model variety incl. quantized (q4/q5, turbo) | Handy ships turbo/q5 for speed-size balance; stock DSH ships none of this | LOW-MEDIUM | Just catalog entries in our model registry; sherpa-onnx int8 support |
| Auto language detection / explicit language per instance | Whisper supports both; RU users often mix RU/EN | LOW | `whisper.language` param; default auto, override per instance |
| Post-processing (polish/format transcript via DSH agent) | superwhisper's killer "custom prompt" feature — but DSH has a real agent to hand it to | MEDIUM-HIGH | Defer; needs transcript→agent hook which the speech plugin API may not expose yet |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Own global hotkeys (push-to-talk capture) | Every competitor has configurable hotkeys | DSH owns the mic button; a plugin grabbing global keys conflicts with DSH/OS shortcuts and duplicates UX | Native DSH mic button only; hotkey work belongs to DSH core |
| File / batch / meeting transcription UI | MacWhisper's headline features | Wrong product shape: plugin hooks the mic button, not a transcript editor; huge UI surface | CLI transcript command later, or point users to MacWhisper/vibe |
| Ship model binaries in npm/git | "Just works" install | 150MB–3GB per model; CLAUDE.md forbids; npm size limits | Auto-download to `~/.dsh/speech-to-text/` with mirrors |
| Runtime model conversion (GigaAM NeMo→ONNX inside plugin) | "Any model" promise | Python/torch toolchain at runtime = fragile, huge deps; conversion is one-off | Build-time/conversion-script subtask; plugin consumes finished ONNX |
| Custom vocabulary / filler-word removal / speaker labels | superwhisper/MacWhisper ship them | All require post-processing stack + UI the speech API doesn't give us | Defer; future post-processing hook |
| Telemetry / usage stats / license tiers | "Product-like" polish | Local-first privacy promise conflicts; single-maintainer cost | None; open source, free |
| Streaming/real-time partial transcripts | Feels modern | sherpa offline recognizer + DSH button UX is batch-utterance; complexity spike | Keep utterance-based flow like stock |

## Feature Dependencies

```
[DSH provider registration (speech worker)]
    └──requires──> [Single local whisper engine + RU]          (Phase 1)
                      └──requires──> [Model auto-download + mirrors]
                                        └──requires──> [Model registry/catalog]

[Multi-instance model list] ──requires──> [Provider registration]  (Phase 2)
[Per-instance precision/threads/language] ──requires──> [Multi-instance model list]
[Custom modelDirectory models] ──requires──> [Multi-instance model list]
                                           └──enhances──> [Model registry]

[GigaAM local provider] ──requires──> [NeMo→ONNX conversion (build-time, risky)]
                         └──requires──> [Provider registration]
[OpenAI-compatible API provider] ──requires──> [Provider registration] only (independent of local models)

[Post-processing via DSH agent] ──requires──> [DSH speech API support for hooks] (unverified → defer)
[Own hotkeys] ──conflicts──> [Native DSH mic button UX]
```

### Dependency Notes

- **Model list requires provider registration first:** phase ordering already correct in PROJECT.md (1 whisper-local → 2 multi-instance → 3 gigaam/api).
- **API provider is independent of GigaAM conversion** — it's the risk-free half of phase 3; consider pulling it before GigaAM if conversion stalls.
- **Per-instance config requires multi-instance template** (one patch.yml entry = one provider config blob).
- **Hotkeys conflict with native UX** — explicitly out of scope.

## MVP Definition

### Launch With (v1)

- [x] Registered provider visible in DSH voice settings — the product concept
- [x] Local whisper engine (one default model, RU verified via test button)
- [x] Auto-download with HF mirrors into `~/.dsh/speech-to-text/`
- [x] Mic-button dictation flow (inherited from stock worker pattern)
- [x] Readable startup/download errors

### Add After Validation (v1.x = Phase 2)

- [ ] Multiple instances = model list (tiny/medium/turbo/quantized)
- [ ] Per-instance precision/threads/language
- [ ] Manual/custom modelDirectory models

### Future Consideration (v2+ = Phase 3 / defer)

- [ ] GigaAM v2 ONNX provider — only after conversion spike succeeds
- [ ] OpenAI-compatible API provider — could be promoted earlier (cheap, independent)
- [ ] Post-processing hook into DSH agent — only if speech API grows support

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Whisper local + RU via native button | HIGH | MEDIUM | P1 |
| Auto-download + mirrors | HIGH | MEDIUM | P1 |
| Multi-instance model list | HIGH | MEDIUM | P2 |
| Per-instance precision/threads/lang | MEDIUM | LOW | P2 |
| OpenAI-compatible API provider | HIGH | MEDIUM | P2 (promotable) |
| Custom modelDirectory models | MEDIUM | LOW-MEDIUM | P2/P3 |
| GigaAM local | HIGH (RU users) | HIGH | P3 |
| Post-processing via agent | MEDIUM | HIGH | P3 |
| Hotkeys / file transcription / vocab | — | — | Never (anti-features) |

## MVP Recommendation

Prioritize:
1. Whisper-local single provider with RU + auto-download (table stakes, validates whole concept)
2. Error surfacing + sensible default model (feels complete vs stock)
3. Multi-instance model list (the "Handy-like" differentiator, moderate cost)

Defer: GigaAM (conversion risk, has API fallback), post-processing (API dependency unverified), everything in Anti-Features.

## Sources

- Handy README + site (HIGH): https://github.com/cjpais/Handy , https://handy.computer — model list, mirrors/manual install, custom models, hotkey modes, local-first
- superwhisper archived homepage/pricing (HIGH): web.archive.org/web/2025/https://superwhisper.com — hotkeys, offline-first, custom vocabulary/prompts, Pro API keys, Intel note
- MacWhisper site (HIGH): https://www.macwhisper.com — dictation + APIs + languages + local privacy
- DSH 0.2.0-rc.2 code analysis (HIGH, local): `.planning/PROJECT.md`, `~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md` — provider registry, stock worker, mirrors/assets.json, precision/threads, SenseVoice language limit

---
*Feature research for: dsh-stt-multi (multi-provider STT plugin for DSH mic button)*
*Researched: 2026-09-30*

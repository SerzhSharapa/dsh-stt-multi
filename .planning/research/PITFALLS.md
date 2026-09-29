# Pitfalls Research

**Domain:** DSH speech-to-text plugin (sherpa-onnx native module, Whisper/GigaAM ONNX models, HF downloads, experimental plugin API)
**Researched:** 2026-09-30
**Confidence:** MEDIUM-HIGH (DSH-specific facts verified against 0.2.0-rc.2 code per PROJECT.md; sherpa-onnx facts grounded in npm registry + known project behavior; web_search unavailable this session, so some community-issue citations are from domain knowledge, not fresh fetches)

## Critical Pitfalls

### Pitfall 1: sherpa-onnx-node native binary not loading under Electron/darwin-arm64

**What goes wrong:**
`require('sherpa-onnx-node')` throws `dlopen ... symbol not found` or `was compiled against a different Node.js version` inside the DSH desktop app (Electron), even though it works in plain `node` during local tests.

**Why it happens:**
`sherpa-onnx-node` is a thin JS wrapper (~61 KB unpacked, npm 1.13.8); the actual `.node` prebuilt binary comes from platform optionalDependencies (`sherpa-onnx-darwin-arm64` etc.). Two failure classes:
1. The optional dependency is skipped (npm `--no-optional`, pnpm default optional-deps handling, or offline install), leaving no binary at all.
2. The binary is an N-API addon loaded into Electron, where ABI mismatches, code signing/quarantine on macOS (`com.apple.quarantine` on downloaded .node), and Electron's ASAR packaging (native modules cannot be loaded from inside an .asar archive) break loading.

**Consequences:** Plugin installs "successfully" but crashes at first recognition; or works in worker tests and fails only in the packaged desktop profile — the exact integration gap the project plans for.

**Prevention:**
- Declare `sherpa-onnx-node` as a regular dependency and let its optionalDependencies pull the darwin-arm64 binary; never use `--no-optional`; verify in a postinstall/install-check step that `require('sherpa-onnx-node')` resolves and `OfflineRecognizer` is constructible.
- Do not assume Electron will `asarUnpack` the plugin's node_modules — test in the real DSH profile, not just `node`. If the host loads the plugin from an ASAR, document/support `asarUnpack` expectations or load via an absolute path outside ASAR.
- On macOS, strip quarantine attributes from downloaded binaries (`xattr -d com.apple.quarantine`) in the model/binary installer flow; sign or at least verify shasums.
- Pin an exact sherpa-onnx version (e.g. `1.13.8`) so wrapper and platform package versions always match (`^1.13.x` optionalDeps mismatch causes load errors after partial upgrades).

**Warning signs:** `MODULE_NOT_FOUND` for `sherpa-onnx-darwin-arm64`; `Error: The module was compiled against a different Node.js version`; works in `node test.js` but not in DSH.

**Phase to address:** Phase 1 (whisper-local) — the very first smoke test must be "construct recognizer inside a DSH desktop profile", not "run worker under node".

---

### Pitfall 2: Whisper ONNX decoder quirks — language tokens, tail padding, initial prompt

**What goes wrong:**
Whisper works for English demos, then produces garbage or empty output for Russian: the model transcribes English regardless of speech, hallucinates, or the first words are cut off.

**Why it happens:**
sherpa-onnx Whisper (`modelConfig.whisper`) has non-obvious parameters that the original OpenAI Whisper handles internally:
- **Language/token tokens:** decoder input must start with the right token sequence (`<|startoftranscript|><|ru|><|notimestamps|>` for Russian). Wrong/missing language token → English-biased or empty output. Multilingual tokens.txt differs from English-only models; using an English-only model file with multilingual expectations fails silently.
- **Tail padding:** sherpa-onnx Whisper requires `tailPaddings` (e.g. 3000 samples ≈ 0.3 s) appended to the audio; without it the last word(s) are dropped or decoding ends early.
- **Decoding params:** `greedySearch` vs beam; wrong `eosToken`/max length loops or truncates.
- **VAD segmentation mismatch:** feeding VAD-segmented short clips to Whisper, which was trained on 30 s windows, degrades accuracy unless tail padding/normalization is handled.

**Consequences:** "Russian doesn't work" bug reports that are actually parameter bugs, not model limits; days lost blaming the model.

**Prevention:**
- Start from a known-good sherpa-onnx example config for the exact model repo (csukuangfj/sherpa-onnx-whisper-* on HF) and copy its tokens.txt, model/decoder files, and parameter set verbatim before customizing.
- Encode language selection explicitly per instance (ru/en/auto) and map it to the correct token sequence; test each language with a fixed 5-second reference clip in CI.
- Always append tail padding; make it a constant, not a tunable someone can zero out.
- Pin exact model revisions (HF commit sha) so a republished tokens.txt can't silently change behavior.

**Warning signs:** English output on Russian audio; last word missing; first 1–2 words missing; identical audio gives different results between runs.

**Phase to address:** Phase 1 — bake a golden-audio regression test (ru + en clips with expected transcripts) into the worker test suite from day one.

---

### Pitfall 3: GigaAM NeMo→ONNX conversion fails or converts "successfully" but recognizes garbage

**What goes wrong:**
The team budgets "an afternoon" for converting GigaAM v2 (NeMo CTC) to ONNX; it either fails during export (opset/ONNX op unsupported, missing `nemo` toolchain on macOS arm64 — NeMo wants CUDA/torch envs), or exports cleanly but produces empty/garbled text in sherpa (`modelConfig.nemoCtc`), usually due to wrong feature preprocessing or vocabulary mapping.

**Why it happens:**
- NeMo models assume specific feature extraction (log-mel, dither, normalization) done in the NeMo preprocessing graph; a plain ONNX export often bakes in or drops parts of it, and sherpa-onnx's `nemoCtc` support expects a specific export recipe (sherpa ships scripts in `sherpa-onnx/scripts/nemo/` — deviating from them breaks silently).
- CTC vocab: NeMo's vocab.json must be converted to sherpa tokens.txt exactly (blank token id, space handling); an off-by-one in blank index yields fluent-looking nonsense or empty strings.
- Russian BPE vocab vs char vocab differences.

**Consequences:** Phase 3 slips or gets cut; worst case the plugin ships a broken gigaam-local provider.

**Prevention:**
- Treat conversion as a **separate spike with time-box and fallback** (PROJECT.md already says "may not be completed" — keep that). Prefer pre-converted sherpa-compatible GigaAM ONNX models if they exist on HF (search csukuangfj/sherpa-onnx-gigaam*) before converting yourself.
- If converting: run sherpa-onnx's official NeMo export script in a Linux/Python container on a Mac — do not fight NeMo+CUDA on darwin-arm64.
- Golden-audio test again: convert → decode reference clip → compare to NeMo original transcript; mismatch = failed conversion even if export logged success.
- Keep `stt-api` (OpenAI-compatible endpoint) fallback scoped and ready so phase 3 can pivot without renegotiating scope.

**Warning signs:** export warnings about cast/reshape ops; output length 0; output that's real Russian words but wrong; WER jump vs the NeMo original.

**Phase to address:** Phase 3 (gigaam-local) — but create the conversion spike checklist + fallback decision gate at roadmap time.

---

### Pitfall 4: Hugging Face downloads — rate limits, mirrors, and unverified files

**What goes wrong:**
First-run model download fails for users in some networks (HF blocked/unreliable), or succeeds but leaves a truncated/corrupted file that crashes sherpa at load with an ONNX parse error.

**Why it happens:**
- huggingface.co is unreachable or slow from some regions; hf-mirror.com (HF_ENDPOINT=https://hf-mirror.com) is the common mirror but lags and lacks some repos/Xet files.
- HF rate-limits unauthenticated bulk downloads (403/429), especially large ONNX weights.
- sherpa model repos (csukuangfj/*) usually do **not** publish sha256 manifests (unlike DSH's SenseVoice assets.json) — so there's nothing to verify against unless we generate our own.
- Truncated downloads from interrupted connections leave partial files on disk that pass "file exists" checks.

**Consequences:** "Plugin is broken" reports that are actually network corruption; support burden; silent wrong-version model usage.

**Prevention:**
- Mirror the DSH built-in plugin's approach: try HF → on failure retry via hf-mirror (HF_ENDPOINT) → surface a clear error with manual-download instructions.
- Maintain our own manifest: model name → list of files with expected sizes + sha256 (computed once at packaging time, pinned to a HF commit sha), stored in the plugin. Verify after download; download to `.tmp` then atomically rename; re-download on mismatch. (Note: DSH's built-in skips hash checks for custom modelDirectory — so verification is *our* responsibility, not the host's.)
- Use resumable downloads (HTTP Range) for multi-GB models (large-v3-turbo int8 is ~800 MB+).
- Never bundle models in the npm package or git (CLAUDE.md rule).

**Warning signs:** ONNX `Invalid protobuf` / protobuf parse errors at recognizer construction; 403/429 in download logs; file size < manifest size.

**Phase to address:** Phase 1 (downloader belongs to the first provider), designed as a shared component reused by phases 2–3.

---

### Pitfall 5: DSH experimental SpeechProvider API breaking between 0.1.7-alpha and 0.2.0-rc

**What goes wrong:**
Plugin built against 0.1.7-alpha.1 speech APIs stops registering (or registers but the mic button misbehaves) after DSH updates to a newer 0.2.0-rc; TypeScript compiles fine locally because it was typechecked against an older @deepseek-ai/cordis.

**Why it happens:**
The speech provider surface (`SpeechProviderId` registry, worker protocol, model config shape) is explicitly experimental; rc-to-rc breaks are permitted. The plugin runs inside the host process, so there's no runtime shim layer — a changed interface is an immediate hard break.

**Consequences:** Every DSH rc bump can silently break the plugin; users see the provider vanish from settings.

**Prevention:**
- Pin peer `@deepseek-ai/cordis ^4.0.x` to the version matching the *installed* DSH (lesson from plugin-shop: check peerDependencies before install) and declare a `dshHostVersion` compatibility matrix in the README.
- Isolate all DSH API touchpoints in one adapter module (registration, config schema, worker lifecycle); everything else (sherpa calls, downloads) stays DSH-agnostic and unit-testable.
- Add a smoke test script: `install into throwaway DSH profile → expect provider appears in voice settings list`. Run it per rc; CI or manual checklist per release.
- Subscribe to DSH changelog; re-verify on each 0.2.0-rc.N.

**Warning signs:** peer dependency warnings during profile install; provider missing from settings after DSH update; TS types resolving to different shapes than runtime objects.

**Phase to address:** Phase 1 (adapter isolation + smoke test), verified again in every later phase.

---

### Pitfall 6: Multi-instance plugin config conflicts (cordis.patch.yml pattern)

**What goes wrong:**
Two instances (e.g. whisper-tiny-ru and whisper-small) both appear in the voice-settings list, but changing settings in one affects the other, models overwrite each other's files in `~/.dsh/speech-to-text/`, or both try to keep a recognizer loaded and the second `OfflineRecognizer` constructor fails/OOMs.

**Why it happens:**
Instance config is per-record in `cordis.patch.yml` (like `@deepseek-ai/dsh-mcp-client`), so it's easy to (a) hardcode a shared cache/model directory instead of deriving it from instance name+model, (b) share a singleton model loader across instances, (c) leave stale instances pointing at deleted model dirs after a model is removed.

**Consequences:** Settings bleed-through bugs that look like "random" behavior; disk bloat from duplicate downloads; memory exhaustion (see Pitfall 9).

**Prevention:**
- Derive all on-disk paths from a namespaced root: `~/.dsh/speech-to-text/<provider>/<model-name>@<revision>/` — never share directories between models; include revision so re-downloads don't collide.
- Keep instance state strictly per-instance (no module-level singletons for recognizer/decoder); lazy-load and cache per model id.
- Define uninstall/cleanup behavior: removing an instance offers to delete (or at least garbage-collect via refcount) its model directory.
- Test matrix in phase 2: two instances, same model; two instances, different models; remove one instance → other still works.

**Warning signs:** changing language in instance A affects B; duplicate model dirs with same content; settings UI shows stale models after config edit.

**Phase to address:** Phase 2 (multi-instance) — design the path scheme in phase 1 already to avoid migration.

---

### Pitfall 7: macOS microphone permission not granted to the DSH host

**What goes wrong:**
Everything works in tests (reading audio files), but live dictation yields silence/empty VAD segments for the user: macOS blocks mic access and the failure is a silent zero-sample stream or a one-time dismissed dialog.

**Why it happens:**
TCC permission is granted per-app (the Electron host), not per-plugin. A plugin can't request it; if the host app lacks `NSMicrophoneUsageDescription`/mic entitlement or the user denied earlier, capture fails with no plugin-visible error. Wrangler processes (audio worker) may get errors the plugin swallows.

**Consequences:** Unfixable-from-plugin support tickets; users blame the STT model.

**Prevention:**
- Detect the failure mode: if VAD receives ~0-energy frames for N seconds, surface an explicit "no microphone input — check macOS privacy settings (System Settings → Privacy → Microphone)" error in the provider status, not a generic timeout.
- Document the macOS permission step (and the "reenable after app update requires TCC reset" quirk: `tccutil reset Microphone <bundle-id>`).
- Include one live-capture smoke test in the integration profile checklist (not just file-based golden tests).

**Warning signs:** zero-length audio buffers; recognition returns instantly with empty result; works for developer (permission granted long ago) but not fresh profiles.

**Phase to address:** Phase 1 (status/error UX for capture failure), refined in phase 2.

---

## Moderate Pitfalls

### Pitfall 8: Peer dependency @deepseek-ai/cordis version mismatch at install time

**What goes wrong:** npm/DSH profile install fails with ERESOLVE, or worse installs with `--force` and the plugin loads with incompatible runtime.
**Prevention:** Before every build/install, script a check comparing plugin `peerDependencies` against the target profile's cordis version (explicit lesson in CLAUDE.md / plugin-shop). Never `--force`; bump peer range deliberately per supported DSH release line.

### Pitfall 9: Memory blow-up with large models / multiple loaded recognizers

**What goes wrong:** whisper-large-v3-turbo (int8 ≈ 800 MB file → ~1.5–2.5 GB RSS with ONNX runtime arena) plus a second loaded instance pushes a 16 GB Mac into swap; recognition latency explodes.
**Prevention:**
- Load at most one recognizer per instance and **release** (`recognizer.free()` / drop references) on model switch or config change — sherpa holds the ONNX arena until GC/free, and Node GC may not return it promptly; explicitly call `.free()` where the API offers it.
- Expose threads/interOp parallelism conservative defaults (2) like the built-in plugin; document expected RSS per model size class in the model list UI (tiny ~200–400 MB, medium ~1–1.5 GB, large ~2–3 GB).
- Guard: refuse (or warn before) loading a model whose file size > a fraction of free memory.

### Pitfall 10: Streaming vs offline API confusion

**What goes wrong:** Team wires VAD segments into an OnlineRecognizer-style API (or vice versa); partial results garble or latency doubles.
**Prevention:** Whisper and GigaAM are **offline** architectures in sherpa-onnx — use `OfflineRecognizer` + VAD segmentation exactly like the built-in sensevoice worker; don't reach for streaming APIs.

### Pitfall 11: Sample-rate / float normalization mismatches

**What goes wrong:** Recognizer gets 48 kHz macOS mic audio; models expect 16 kHz float32 normalized [-1,1]. Output degrades subtly (sounds "drunk") rather than failing.
**Prevention:** Always resample to 16 kHz and normalize before feeding sherpa; golden-audio tests at both 16k and 48k inputs.

## Minor Pitfalls

### Pitfall 12: Publishing native-model plugin to npm with wrong `files`/`os`/`cpu` fields
**What goes wrong:** npm pack excludes native loader glue or includes huge files; installs attempted on Windows fail confusingly.
**Prevention:** Use `os: ["darwin"]` + `cpu: ["arm64"]` (if macOS-first), test `npm pack --dry-run` in CI, keep models out of the tarball.

### Pitfall 13: Assuming HF model repos are stable
**What goes wrong:** Repo owner republishes files (tokens.txt changed) without a version bump; downloads now mismatch old cached models.
**Prevention:** Pin commit sha per model in the manifest; treat any manifest mismatch as "different model version", re-download to a new directory (see Pitfall 6 path scheme).

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip sha256 verification, trust file existence | Faster phase 1 | Corrupt-model support tickets, silent breakage | Never (cheap to do right) |
| Hardcode single whisper-tiny path instead of per-model dirs | Less code in phase 1 | Migration + collisions in phase 2 | Phase 1 spike only, must fix before phase 2 |
| DSH API calls scattered across worker code | Fewer files now | Full audit on every rc bump | Never — adapter isolation from day one |
| Keep recognizers loaded across switches for "snappiness" | Instant re-enable | 2–3 GB resident per model, swap death | Only for the actively selected model |
| Skip hf-mirror fallback | Works in dev network | Unusable for users behind blocked/slow HF | Phase 1 dev-only; must add before release |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| sherpa-onnx-node | Loose version ranges; assuming npm installs platform binary everywhere | Pin exact version; postinstall require-check; test in Electron context |
| Hugging Face | Direct hardcoded URLs, no resume, no mirror | resolve endpoint via HF_ENDPOINT w/ hf-mirror fallback, Range-resume, tmp+rename, sha256 verify |
| DSH SpeechProvider registry | Implementing against remembered 0.1.7 shapes | Typecheck against installed profile's cordis; smoke test provider listing per rc |
| cordis.patch.yml instances | Shared hardcoded paths/config keys | Per-instance derived paths; remove/rename handling |
| macOS TCC | Treating mic denial as model failure | Detect zero-energy stream → explicit permission error UX |
| ONNX Runtime (in sherpa) | Forgetting arena memory isn't freed by GC promptly | Explicit free on switch; conservative thread counts |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading large-v3-turbo by default | Fans, 2+ GB RSS, slow first result | Default to tiny/small; make large opt-in with memory hint | 8–16 GB machines |
| Multiple instances each preloading recognizers | Swap, beachballs | Lazy load; load only selected provider | ≥2 instances |
| High thread counts on M-series | Latency *worse*, contention | Default numThreads=2 like built-in plugin | >4 threads |
| No VAD, decoding whole buffer each utterance | Seconds of lag | VAD Silero segmentation (as built-in worker does) | clips >5 s |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Executing downloaded model files from unverified sources | Supply chain (malicious ONNX is limited but tokens/config can inject) | Verify sha256 + pin commits; only whitelisted repo list |
| Shipping API keys (stt-api phase) in instance config plaintext in patch.yml | Key leakage in dotfiles/git | Use DSH credential store if available; warn users; never log keys |
| Deserializing arbitrary model directories user points at | Crash/DoS at minimum | Validate manifest before constructing recognizer |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Model list without size/RAM hints | User picks large-v3, machine swaps, blames DSH | Show download size + approx RAM per model |
| No download progress | 800 MB download looks frozen | Progress % + resumable + cancel |
| Silent switch to English/garbage on Russian audio (Pitfall 2) | "Russian doesn't work" | Per-model language fixed & tested; golden clips |
| Errors only in logs | User sees dead mic button | Surface provider status/errors in settings UI |

## "Looks Done But Isn't" Checklist

- [ ] **Provider registration:** appears in DSH voice settings on the *installed rc*, not just 0.2.0-rc.2 dev machine — verify per profile smoke test
- [ ] **Native binary:** `require('sherpa-onnx-node')` works inside the packaged DSH app (ASAR/quarantine checked), not just under plain node
- [ ] **Russian E2E:** golden ru clip through live mic path (TCC permission granted in fresh profile), not just file-based test
- [ ] **Download integrity:** kill download mid-way → restart → sha256 verified → recognizer loads
- [ ] **Multi-instance:** 2 instances simultaneously configured, switching models frees previous recognizer (RSS drops)
- [ ] **Uninstall:** removing instance cleans or GCs model dir; stale config doesn't crash plugin
- [ ] **GigaAM:** converted model WER-checked against NeMo original on reference clip before declaring conversion done

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Native binary fails in Electron | MEDIUM | Load from unpacked path; bump pinned sherpa version; worst case vendor prebuilt dylib with explicit install |
| Whisper ru garbage output | LOW | Fix tokens/padding params against sherpa example configs; no architecture change |
| GigaAM conversion dead end | LOW (planned) | Pivot to pre-converted HF model, else stt-api fallback per PROJECT.md |
| SpeechProvider API break | MEDIUM | Update adapter module only (isolation pays off); repin peer; smoke test |
| Corrupt downloaded models | LOW | Delete dir → manifest re-download; verification makes this diagnosable |
| Multi-instance conflicts | MEDIUM | Migrate to namespaced paths (cheap if designed early, painful after users have data) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Native binary/Electron load (1) | Phase 1 | recognizer constructs inside DSH profile |
| Whisper decoder params (2) | Phase 1 | golden ru+en clips regression test |
| HF downloads/mirrors/hashes (4) | Phase 1 | interrupted-download test; sha256 manifest check |
| SpeechProvider adapter isolation (5) | Phase 1 | API touchpoints in one module; per-rc smoke test |
| Mic permission UX (7) | Phase 1 | zero-energy detection → explicit error |
| Multi-instance config conflicts (6) | Phase 2 | two-instance test matrix; path scheme from phase 1 |
| Peer dep mismatches (8) | All phases | pre-install peer check script |
| Memory / model size (9) | Phase 2 (defaults in 1) | RSS before/after switch; memory hints in UI |
| GigaAM conversion (3) | Phase 3 | conversion spike with WER gate + stt-api fallback decision |
| npm packaging (12) | Release | `npm pack --dry-run`, os/cpu fields |

## Sources

- npm registry: sherpa-onnx-node@1.13.8 (optionalDependencies incl. sherpa-onnx-darwin-arm64; thin 61 KB wrapper) — fetched 2026-09-30
- Hugging Face: csukuangfj/sherpa-onnx-whisper-tiny model repo (files layout: model.onnx/decoder/tokens.txt; no model card, no hash manifest → verification is on us) — fetched 2026-09-30
- .planning/PROJECT.md — DSH 0.2.0-rc.2 verified facts (SpeechProviderId registry, cordis.patch.yml multi-instance pattern, sensevoice worker: OfflineRecognizer+VAD+HF mirrors+assets.json, hash-skip for custom modelDirectory, senseVoice-only modelConfig limitation)
- CLAUDE.md — peer-compat check rule, models to ~/.dsh/speech-to-text/, not in git
- Domain knowledge (MEDIUM confidence, web_search unavailable this session): sherpa-onnx whisper tailPaddings/language token behavior; NeMo ONNX export fragility; hf-mirror.com as HF_ENDPOINT fallback; Electron native-module ASAR/quarantine issues; macOS TCC mic permissions. Verify against k2-fa.github.io/sherpa docs and GitHub issues during phase 1 research.

---
*Pitfalls research for: DSH multi-provider STT plugin*
*Researched: 2026-09-30*

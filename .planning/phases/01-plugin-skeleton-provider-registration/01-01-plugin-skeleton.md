# Plan 01-01: Plugin Skeleton, Registration & Native Smoke (tracer)

**Phase:** 1 — Plugin Skeleton & Provider Registration
**Type:** tracer (end-to-end slice)
**Author:** orchestrator (generic-agent workaround: planner subagent unresponsive after 5 rounds, interrupted; plan authored inline per budget guard — documented deviation)
**Requirements:** PROV-01, PROV-02, PROV-03, QUAL-02

## Goal

One vertical slice: npm package skeleton → install into scratch DSH profile → provider `whisper-local` visible & selectable in DSH voice settings → mic-button transcribe event via echo stub → native sherpa-onnx-node loads & constructs OfflineRecognizer inside the real Electron runtime.

## Tasks

### Task 1: Package skeleton
- `package.json`: name `dsh-stt-multi`, type module, main `dist/index.js`, peerDeps `@deepseek-ai/cordis ~4.0`, deps `sherpa-onnx-node ~1.13.8`, devDeps tsup/typescript/vitest
- `tsup.config.ts` (external sherpa-onnx-node + cordis), `tsconfig.json` (strict)
- src skeleton: `src/index.ts` (plugin define/entry), `src/providers/adapter.ts` (ALL SpeechProvider touchpoints — register call, info, transcribe wiring), `src/providers/echo.ts` (stub engine), `src/worker/` + `src/download/` placeholders
- **Verify:** `npm install && npm run build` succeeds; `dist/index.js` ESM output exists

### Task 2: Provider registration (echo stub engine)
- adapter.ts: cordis plugin, inject `["speechToText","subprocess"]`, in `ctx.effect` call `ctx.speechToText.register({info:{id:"whisper-local", name:"Whisper (local)", location:"host-local", languages:["ru","en"], downloadSources:[], setupEstimate...}, transcribe: echoEngine})`
- echo.ts: returns fixed string + audioSeconds from payload; no native import
- **Verify:** vitest unit test — adapter registers with expected info shape (mock ctx)

### Task 3: Install into scratch profile & verify registration
- Create scratch profile dir `~/.dsh/profiles/stt-multi-test/` (package.json + cordis.patch.yml with our entry: `- id: whisper-local / name: dsh-stt-multi / config: {...}`), npm install from local tarball (`npm pack` → file: dep)
- Launch DSH against the scratch profile (headless check if possible: `dsh` CLI or app binary), assert provider `whisper-local` appears in speech provider list (via profile settings file or CLI introspection — fallback: GUI check flagged for human verification)
- **Verify:** provider listed; selection persists after profile reload (core persists defaultProvider)

### Task 4: Mic-button transcribe event (echo)
- With whisper-local selected, feed a short WAV through the profile's speech pipeline (or the DSH test-button flow) — transcribe resolves with echo payload
- **Verify:** transcribe event/round-trip observed (log or settings test result)

### Task 5: Native smoke inside Electron (QUAL-02)
- Fetch whisper tiny ONNX tarball (manual curl from k2-fsa asr-models release) into `~/.dsh/speech-to-text/whisper-local/whisper-tiny/` (temp; real download layer is Phase 2)
- `scripts/smoke-native.mjs`: `require('sherpa-onnx-node')` → construct `OfflineRecognizer` with whisper config → decode 1s of silence → exit 0
- Run it with the DSH Electron binary: `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/<binary>" scripts/smoke-native.mjs` from the scratch profile's node_modules context
- **Verify:** exit 0 with recognizer constructed + decode returned; capture `process.versions` in output as proof of Electron runtime

### Task 6: Wrap-up
- README stub, .gitignore (node_modules, dist, *.tar.bz2), commit all
- SUMMARY.md for the plan

## Risks & Mitigations

- **Profile creation/launch mechanics unknown in detail** → Task 3 starts by inspecting existing `desktop` profile files; GUI-only assertion falls back to human verification (the one planned pause)
- **Electron native load failure (ASAR/quarantine)** → that IS the smoke test's purpose; if it fails, document exact error and mitigation (asarUnpack config / install layout) before proceeding
- **Model tarball URL exactness** → resolve at execution time from release page; no hard dependency on research MEDIUM items

## Definition of Done

All 4 phase success criteria observable: provider listed (1), selection persists (2), transcribe event via echo (3), native smoke in Electron exit 0 (4).

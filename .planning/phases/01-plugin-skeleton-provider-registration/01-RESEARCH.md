# Phase 1 Research: Plugin Skeleton & Provider Registration

**Phase:** 1 — Plugin Skeleton & Provider Registration
**Researched:** 2026-09-30
**Confidence:** HIGH for machine-verified facts (live profile, DSH install on this Mac); MEDIUM for items marked below
**Note:** researcher agent was interrupted mid-run (unresponsive past two wrap-up directives); this file was assembled by the orchestrator from the researcher's interim reports plus direct verification commands. Open questions listed at the end.

## 1. Profile Install Mechanics (machine-verified)

- DSH profiles live at `~/.dsh/profiles/<name>/` — on this machine: `desktop`, `web`.
- Installing a plugin into a profile = **two artifacts**:
  1. dependency entry in `~/.dsh/profiles/<name>/package.json`
  2. patch entry in `~/.dsh/profiles/<name>/cordis.patch.yml`
- Live `cordis.patch.yml` (desktop profile) confirms entry format:
  ```yaml
  - id: mcp-llm-chat            # unique instance id (our multi-instance hook)
    name: "@deepseek-ai/dsh-mcp-client"   # npm package name
    config:                      # arbitrary per-instance config blob
      serverName: llm-chat
      transport: stdio
      ...
  ```
  → our entry: `- id: whisper-local / name: dsh-stt-multi / config: {model, language, threads, precision...}`
- Header comment of patch.yml: "top-level YAML array of loader patch entries (id-targeted config overrides, disables, and insert lists; `!!js` expressions allowed)".

## 2. Native Binary Location (machine-verified)

- `sherpa-onnx-darwin-arm64` is **already present unpacked** at
  `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/sherpa-onnx-darwin-arm64`
- Implication: ASAR-unpacking is the mechanism DSH uses for native modules; our plugin's native dep must land the same way when installed into a profile (verify during smoke test — see open questions).

## 3. Worker Spawn Pattern (from prior project research — .planning/research/ARCHITECTURE.md, HIGH)

- Stock sensevoice worker: loaded ONLY in child process — `process.execPath worker.js <json-config>`, env `DSH_SPEECH_TOKEN` + `ELECTRON_RUN_AS_NODE=1`; readiness = `{"port":N}\n` on stdout; authenticated loopback HTTP POST /transcribe (Bearer, timing-safe compare).
- Our smoke test (QUAL-02) replicates this: run a script with the DSH Electron binary under `ELECTRON_RUN_AS_NODE=1`, `require('sherpa-onnx-node')`, construct `OfflineRecognizer`.

## 4. Package Shape & Build (from project STACK.md, HIGH)

- TypeScript + ESM (`"type": "module"`), tsup bundler, `external: ['sherpa-onnx-node']`.
- peerDependencies: `@deepseek-ai/cordis: "~4.0"` (4.0.4 current; vendored by DSH — never bundle).
- Dependency: `sherpa-onnx-node: "~1.13.8"` (platform binaries via optionalDependencies — confirmed present in the DSH install for darwin-arm64).
- Provider registration contract (code-verified in prior research): cordis plugin `inject: ["speechToText","subprocess"]`, `ctx.speechToText.register({info:{id,name,location:"host-local",languages,downloadSources,setupEstimate}, preparation?, transcribe})` inside `ctx.effect`. Duplicate ids throw. Selection persistence (`defaultProvider`/`language`) — DSH core's job, NOT ours.

## 5. tsup Config Sketch (MEDIUM — standard pattern, finalize in implementation)

```js
// tsup.config.ts
import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  external: ['sherpa-onnx-node', '@deepseek-ai/cordis'],
  platform: 'node',
  target: 'node20',
})
```

## Open Questions (for executor; none blocking planning)

1. **asar extraction of sensevoice plugin source** was NOT completed by the researcher — if exact registration code snippets are needed, extract from `app.asar` during execution (prior research ARCHITECTURE.md already documents the contract; treat this as nice-to-have).
2. **Does profile `npm install` of our package unpack its native optionalDependency correctly** under Electron? — this is exactly what the QUAL-02 smoke test verifies; no pre-work needed.
3. Exact whisper-tiny tarball name/sha256 for the smoke recognizer — resolve at smoke time from k2-fsa `asr-models` release (STACK.md has the URL pattern).

## Sources

- `~/.dsh/profiles/desktop/cordis.patch.yml` — read directly (HIGH)
- `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/` — ls (HIGH)
- `.planning/research/ARCHITECTURE.md`, `STACK.md` — prior code-verified research (HIGH)

# dsh-stt-multi

Multi-provider speech-to-text for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
local Whisper, GigaAM v2 (Russian SOTA) and OpenAI-compatible API engines behind the
native DSH mic button — each model selectable in voice settings, no app code changes.

> **Status:** Phase 1 (skeleton + provider registration, echo stub). See `.planning/ROADMAP.md`.

## Why

The stock DSH speech plugin (SenseVoice) does not understand Russian.
`dsh-stt-multi` registers additional STT providers; DSH's voice-settings list
is the provider registry, so one plugin instance = one selectable model.

## Install (dev preview)

```bash
npm pack                     # build dist/ + tarball
# inside a DSH profile (~/.dsh/profiles/<name>/):
npm install <path-to>/dsh-stt-multi-0.1.0.tgz
```

Then add to the profile's `cordis.patch.yml`:

```yaml
- id: whisper-local
  name: dsh-stt-multi
  config:
    providerId: whisper-local
    dataRoot: /Users/you/.dsh/speech-to-text
```

## Roadmap

1. **Plugin skeleton & registration** (echo stub) ← current
2. Model assets & download layer (HF + mirrors, sha256, resume)
3. Real Whisper worker end-to-end (Russian dictation)
4. Multi-instance model list
5. GigaAM v2 + OpenAI-compatible API providers

## License

MIT

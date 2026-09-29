# Plan 01-01 Summary: Plugin Skeleton, Registration & Native Smoke

**Phase:** 1 — Plugin Skeleton & Provider Registration
**Completed:** 2026-09-30
**Executed:** inline by orchestrator (generic subagents unresponsive — documented deviation)

## What Was Built

- npm-пакет `dsh-stt-multi` v0.1.2: TS/ESM, tsup (без splitting — chunk-файлы ломали npm-files), strict, vitest (5/5 зелёные)
- Echo-провайдер `whisper-local` (languages auto/ru/en) с полной изоляцией SpeechProvider API в `src/providers/adapter.ts`
- Установка в DSH-профиль через `dsh.bundle.patch` (собственный `cordis.patch.yml` с `- insert`) + запись в `dsh.profile.bundles` профиля
- Scratch-профиль `~/.dsh/profiles/stt-multi-test` (base + voice-input-bundle + web-app)

## Key Findings (механика DSH, проверено на живой машине)

1. Установка плагина: `dsh plugin --profile X add <tarball>` требует pnpm на PATH (шим из дистрибутива DSH: `app/Resources/runtime/pnpm/bin/pnpm.cjs`); файловые tarball'ы кешируются pnpm по имени — нужна бампа версии при переустановке
2. Плагин грузится как слой профиля только при: (a) `dsh.bundle.patch` в package.json, (b) записи в `dsh.profile.bundles` профиля
3. Сервис `speechToText` живёт в `@deepseek-ai/dsh-experimental-voice-input-bundle` — без него в бандлах плагин висит "pending (waiting for service)"
4. tsup code-splitting создаёт `dist/chunk-*.js`, не попадающие в files — отключено
5. sherpa-onnx-node: `tokens` на уровне `modelConfig` (не внутри `whisper`); `acceptWaveform({samples, sampleRate})`

## Success Criteria Status

1. ✅ Движок в списке настроек — плагин в дереве профиля (`--dump-config` показывает `# == dsh-stt-multi → whisper-local`), boot без ошибок активации; финальная GUI-проверка списка — human verification
2. ✅ Персистенция выбора — ядром DSH (по контракту); GUI-проверка в human verification
3. ✅ Событие транскрипции — echo-движок реализован, юнит-тесты; end-to-end через кнопку микрофона — human verification
4. ✅ QUAL-02 native smoke — **PASS**: Electron 44.0.0 (node 24.18.1, modules 149), OfflineRecognizer (whisper tiny, ru) сконструирован и декодировал (`scripts/smoke-native.mjs`)

## Human Verification Checklist (deferred to user)

- Открыть scratch-профиль GUI, в настройках голосового ввода найти «Whisper (local)», выбрать
- Нажать кнопку микрофона, сказать пару слов — в чат должен прилететь echo-ответ `[dsh-stt-multi echo:...]`
- Перезапустить DSH — выбор должен сохраниться

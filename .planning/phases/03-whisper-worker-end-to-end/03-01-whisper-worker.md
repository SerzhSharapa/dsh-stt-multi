# Plan 03-01: Whisper Worker End-to-End (tracer)

**Phase:** 3 - Whisper Worker End-to-End | **Type:** tracer | **Author:** orchestrator inline (documented deviation)
**Requirements:** STT-01, STT-02, STT-03, QUAL-01, QUAL-03

## Tasks

1. Worker протокол (src/worker/server.ts): loopback HTTP + Bearer timing-safe, /transcribe, readiness JSON на stdout, WAV-валидация
2. Whisper-инференс (src/worker/inference.ts): OfflineRecognizer(whisper int8, tailPaddings), VAD Silero, PCM16->Float32, decode-join, free()
3. Host-менеджер (src/providers/worker-manager.ts): spawn + readiness + серийная очередь + idle-kill + подготовка Фазы 2
4. Интеграция: adapter.transcribe -> worker-manager; echo debug-опция; small пиннинг
5. Тесты: юнит + интеграционный golden ru/en WAV
6. E2E в профиле: v0.3.0, boot, human voice test (пауза)
7. Wrap-up: README, SUMMARY, npm pack

## Risks

- RU-мусор из параметров -> tailPaddings + golden тесты сразу
- Electron spawn -> доказано smoke-тестом Фазы 1
- small tarball большой -> качаем один раз, пинним

## Definition of Done

STT-01..03, QUAL-01, QUAL-03 наблюдаемы: русская диктовка, золотые тесты зелёные, аудио локально, free() работает.

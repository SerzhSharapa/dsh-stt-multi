---
status: passed
verified: 2026-09-30
verified_by: human (owner) + machine evidence
---

# Phase 3 Verification

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| STT-01 | Русская офлайн-диктовка локальным Whisper | Человек: «Да все отлично!» после живой диктовки в GUI профиля (whisper small int8, локально) | OK human |
| STT-02 | RU+EN корректность, золотой регресс | worker.test.ts: RU дословно «Привет, это проверка русского распознавания речи», EN ок, 19/19 | OK machine |
| STT-03 | Дефолт из коробки | whisper small int8 pinned (sha256), preparation качает при выборе | OK |
| QUAL-01 | Аудио локально | loopback worker, никакого внешнего сетевого I/O в инференс-пути | OK |
| QUAL-03 | free() памяти / idle-kill | WorkerManager.stop() по idle-timeout + dispose; worker процесс владеет нативом | OK |

## Issues found & fixed during verification

- {{HOME}} literal в cordis.patch.yml → качал в фиктивную папку; dataRoot убран из патча (default из homedir()) — 0.3.1
- sherpa whisper не принимает language=auto (падение натива) → auto маппится на ru — 0.3.1

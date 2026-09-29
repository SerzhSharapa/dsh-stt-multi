# Plan 02-01: Model Assets & Download Layer (tracer)

**Phase:** 2 - Model Assets & Download Layer
**Type:** tracer (end-to-end slice)
**Author:** orchestrator inline (documented deviation - planner subagents unresponsive in this runtime)
**Requirements:** DL-01, DL-02, DL-03, DL-04

## Goal

Каталог моделей (whisper tiny/base/small + VAD) с манифестом; движок загрузки: HEAD-проба источников, Range-докачка, sha256, атомарная публикация, распаковка tar.bz2; preparation state machine; ручная установка без хэша; классификация ошибок. transcribe остаётся echo.

## Tasks

### Task 1: Каталог и манифесты
- src/download/catalog.ts: MODEL_CATALOG (tiny/base/small x int8/fp32 + vad silero), pinned URLs, sizes, sha256 (фиксируются коммитом при первой закачке; tiny уже локально)
- Verify: юнит-тест каталога (структура, пиннинг URL)

### Task 2: Download engine
- src/download/engine.ts: orderSources (HEAD-проба), downloadFile (Range-докачка, *.part, потоковый sha256, атомарный rename), classifyFailure (dns/timeout/cert/storage/network), untar (tar -xjf)
- Verify: юнит classify/retry (моки); интеграционный: кеш-хит tiny + докачка с локального http-сервера

### Task 3: Preparation state machine + integration
- src/providers/preparation.ts: контракт preparation (snapshot/subscribe/prepare/cancel), фазы checking-downloading-verify-ready/standby/failed, прогресс
- Адаптер: preparation подключён к register(); echo transcribe без изменений; downloadSources = реальные источники
- Verify: юнит стейт-машины (переходы, cancel)

### Task 4: Инсталляция в профиль + e2e
- Версия 0.2.0, pack, переустановка в scratch-профиль (pnpm-шим + бампа версии)
- Boot чистый; tiny в кеше - standby быстро; VAD докачивается
- Verify: boot-лог; кеш распознан; manual-install (DL-03) юнит-тестом

### Task 5: Wrap-up - README (модели), SUMMARY, commit

## Risks

- sha256 base/small неизвестны до скачивания - фиксируются коммитом при первой закачке
- Range не поддержан зеркалом - fallback полной загрузки
- Контракт preparation - сверка с извлечённым sensevoice worker

## Definition of Done

DL-01..04 наблюдаемы: модель качается с зеркалами/докачкой (интеграционный тест), ручная установка валидна без хэша, ошибки классифицированы.

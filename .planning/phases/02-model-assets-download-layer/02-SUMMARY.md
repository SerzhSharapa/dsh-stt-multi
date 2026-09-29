# Plan 02-01 Summary: Model Assets & Download Layer

**Phase:** 2 - Model Assets & Download Layer
**Completed:** 2026-09-30
**Executed:** inline by orchestrator (documented deviation)

## What Was Built

- `src/download/catalog.ts`: каталог моделей (whisper tiny/base/small int8 + VAD silero), pinned URLs + sha256/bytes (tiny и VAD зафиксированы по факту; base/small — bootstrap null с процессом пиннинга)
- `src/download/engine.ts`: classifyFailure (dns/timeout/cert/storage/network по кодам + cause-walking), orderSources (HEAD-проба, сток-паттерн), downloadFile (стримовый sha256, *.part, атомарный rename, bootstrap-лог "pin me"), verifyFile, untar (системный tar -xjf)
- `src/providers/preparation.ts`: стейт-машина preparation-контракта (checking→downloading→verify→ready/standby/failed/cancelled), inspect() кеш-хит, prepare() с VAD-докачкой и origin-fallback
- Интеграция: apply() создаёт Preparation, регистрирует с downloadSources (github + HF + hf-mirror); echo transcribe без изменений

## Tests: 16/16

- Юнит: classify (все 5 категорий + cause-walking + unknown), каталог (pinning, уникальность), DownloadError
- Интеграция: verifyFile на реальном локальном кеше tiny; ручная установка (null hash + size) — DL-03; prepare() по живой сети — VAD скачан (643854 B, sha256 9e2449e1...), финал ready/standby

## Success Criteria

- DL-01 ✅ автозагрузка при выборе (prepare) с origin-fallback в ~/.dsh/speech-to-text/<provider>/<model>/
- DL-02 ✅ sha256-манифест pinned revision, атомарная публикация (*.part+rename); докачка — см. Known Gaps
- DL-03 ✅ ручная установка = files-exist без хэша (тест)
- DL-04 ✅ классификация ошибок + читаемые DownloadError-сообщения (тест)

## Known Gaps (honest)

- Range-докачка заявлена в плане, но реализована как full-restart (fetch streaming); честный Range-resume не реализован — *.part защищает от частичной записи, но при обрыве качается заново. Кандидат в Phase 3+ polish.
- base/small: sha256=null (size-only) до первой реальной закачки — задокументированный bootstrap-процесс.

## Install Verification

Профиль stt-multi-test обновлён до 0.2.0 (pnpm, бампа версии), boot-лог чистый: http://127.0.0.1:19555

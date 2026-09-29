# Phase 2: Model Assets & Download Layer - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Автономный слой загрузки моделей: по выбору пользователя модель (tarball + VAD) автоматически скачивается в `~/.dsh/speech-to-text/<provider>/<model>/` с проверкой sha256, докачкой, зеркалами и распаковкой — либо подхватывается из ручной установки без хэш-проверки. Ошибки читаемы и классифицированы. transcribe остаётся echo (реальный Whisper — Фаза 3).

Requirements: DL-01, DL-02, DL-03, DL-04.

</domain>

<decisions>
## Implementation Decisions

### Каталог моделей и манифест
- Формат: per-model `assets.json`: `{ files: [{path, url(pinned), bytes, sha256}] }` — паттерн штатного воркера
- Каталог v1: whisper tiny / base / small (+int8 варианты каждой); small — кандидат дефолта Фазы 3
- Источники: GitHub releases k2-fsa (primary), HF/hf-mirror (fallback), HEAD-проба как у штатного orderModelSources
- VAD silero включён в манифест слоя (качается один раз, нужен Фазе 3)

### Надёжность загрузки
- Докачка: HTTP Range в `*.part`, атомарный rename после sha256-верификации
- Ошибки: классификация dns/timeout/certificate/storage/network — переиспользовать classifyDownloadFailure-паттерн штатного воркера
- Прогресс: preparation state machine через SpeechProvider API (checking→downloading→verify→ready/standby/failed)
- Ручная установка: наличие файлов = валидно, хэш пропускается (DL-03, поведение DSH для кастомных директорий)

### Границы фазы
- Распаковка `.tar.bz2` в слое (системный tar -xjf, без нативных bz2-зависимостей)
- echo-движок остаётся; preparation качает модель, но transcribe не использует её
- Тесты: юнит (manifest/verify/classify/retry) + интеграционный (tiny уже в локальном кеше — быстрый happy-path)

### the agent's Discretion
Детали API модулей, структура каталога манифестов, точные имена файлов — на усмотрение агента.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/download/index.ts` — плейсхолдер, заменяем реализацией
- Штатный sensevoice worker (извлечён в /tmp/dsh-speech/, ключевые паттерны: orderModelSources HEAD-проба, matchesAsset sha256, classifyDownloadFailure, *.part+rename)
- Уже скачанный whisper tiny в `~/.dsh/speech-to-text/whisper-local/whisper-tiny/` — готовый тестовый кеш
- `scripts/smoke-native.mjs` — модель использует Фаза 3; для Фазы 2 — источник имён файлов (tiny-encoder.int8.onnx и т.д.)

### Established Patterns
- TS/ESM, tsup без splitting, npm, strict; адаптер SpeechProvider — единственная точка контакта с API
- namespaced-директории `~/.dsh/speech-to-text/<provider>/<model>/`

### Integration Points
- Preparation-контракт `ctx.speechToText.register({preparation})` — state machine
- per-instance config из cordis.patch.yml (modelId → каталог)

</code_context>

<specifics>
## Specific Ideas

Пользователь: полная автономия, бюджет бережливый. Установка плагина в профиль требует pnpm-шим (задокументировано в 01-SUMMARY) — автоматизировать переустановку скриптом при смене версии.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

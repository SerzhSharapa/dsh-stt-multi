# Phase 5: GigaAM v2 & API Providers - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Третий локальный движок GigaAM v2 (RU SOTA, готовый ONNX k2-fsa nemoCtc) и облачный OpenAI-совместимый провайдер /audio/transcriptions (Groq/OpenAI). Релизная упаковка: npm-готовность, полный README. GitHub-пуш - отдельное решение владельца после верификации.

Requirements: GIGA-01, GIGA-02, API-01, API-02.
</domain>

<decisions>
## Implementation Decisions

### GigaAM v2 (принято)
- Каталог: sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19.tar.bz2 (226MB int8 + tokens), modelConfig.nemoCtc
- Инференс: тот же worker, ветка modelType nemoCtc (CTC не требует tailPaddings; VAD-сегментация та же)
- insert-запись gigaam-local в patch.yml пакета
- GIGA-02: проверить LICENSE в пакете до включения; если NC - пометить в README

### API-провайдер (принято)
- POST {baseURL}/audio/transcriptions multipart (file/model/language); без воркера и загрузок
- config: baseUrl, apiKeyEnv (ключ из env, НЕ в конфиге), apiModel; имя движка помечено cloud
- API-02: displayName с облачной пометкой; local-first остальных не тронут

### Релиз (принято)
- npm files/exports финализированы; README полный (модели/установка/конфиги/кастом)
- GitHub-публикация - после отдельного ОК владельца
</decisions>

<code_context>
- worker/inference.ts: ветвление по modelType (whisper | nemoCtc)
- adapter: третий/четвёртый инстанс; API-transcribe без worker-manager
- catalog: GigaAM запись + nemoCtc modelConfig тип
</code_context>

<specifics>
Верификация: GigaAM диктовка человеком (русская), API - опционально если есть ключ у владельца.
</specifics>

<deferred>
Groq model IDs - MEDIUM confidence из исследования; уточнить при первой настройке владельцем.
</deferred>

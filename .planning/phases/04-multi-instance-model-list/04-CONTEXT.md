# Phase 4: Multi-Instance Model List - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Несколько моделей одновременно в списке настроек DSH: мульти-инстансы через несколько insert-записей (whisper-tiny + whisper-small предустановлены), per-instance конфиг (language/threads/precision), large-v3-turbo в каталоге, кастомные modelDirectory-модели с автодетектом и без хэш-проверки.

Requirements: MULTI-01, MULTI-02, MULTI-03, CUSTOM-01.
</domain>

<decisions>
## Implementation Decisions

### Механика (принято)
- cordis.patch.yml пакета: две insert-записи из коробки (whisper-tiny, whisper-small), каждая со своим id и config.modelId; пользовательские - своими патчами профиля
- MULTI-02: per-instance language/threads уже в Config; precision фиксируется int8 (fp32-вариант - при спросе)

### Каталог (принято)
- Добавить whisper-large-v3-turbo int8 (sha256 bootstrap-null до первой закачки владельцем)

### Кастомные модели (принято)
- config.modelDirectory (абсолютный путь): каталог = источник истины, автодетект encoder*/decoder*/tokens*, без хэшей (CUSTOM-01); displayName из конфига
</decisions>

<code_context>
## Existing Code Insights

- adapter/preparation/worker-manager: уже параметризованы per-instance (providerId, modelId)
- catalog: расширить large-v3-turbo + helper автодетекта файлов в произвольной директории
</code_context>

<specifics>
## Specific Ideas

Верификация: обе предустановленные модели видны в списке настроек GUI (человек); large-turbo - опционально.
</specifics>

<deferred>
## Deferred Ideas

None
</deferred>

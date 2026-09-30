# Phase 3: Whisper Worker End-to-End - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Настоящая русская офлайн-диктовка локальным Whisper через родную кнопку микрофона DSH: WAV -> PCM->Float32 -> VAD Silero сегментация -> OfflineRecognizer(modelConfig.whisper) -> join -> {text, audioSeconds, inferenceSeconds}. Приватность, free() памяти, золотой ru/en регресс, релиз-минимум. Echo сохраняется как debug-опция.

Requirements: STT-01, STT-02, STT-03, QUAL-01, QUAL-03.
</domain>

<decisions>
## Implementation Decisions

### Архитектура воркера (принято)
- Порт сток-паттерна: sherpa-onnx-node ТОЛЬКО в child-process; process.execPath, DSH_SPEECH_TOKEN + ELECTRON_RUN_AS_NODE=1; readiness JSON на stdout; loopback HTTP + Bearer
- modelConfig.whisper: int8 encoder/decoder + tokens, language, task transcribe; tailPaddings ~3000
- VAD Silero из кеша Фазы 2

### Качество и дефолт (принято)
- Дефолт whisper small int8 - скачать и запиннить sha256 при верификации
- Золотой тест: ru+en WAV в test/fixtures/
- QUAL-03: free() при idle-timeout + dispose

### Границы (принято)
- transcribe: сток-flow WAV->Float32->VAD-сегменты->decode->join
- echo: true - debug-режим
- Релиз-минимум: npm pack + README

### the agent's Discretion
Детали протокола, структура, тайминги.
</decisions>

<code_context>
## Existing Code Insights

- Сток-воркер (извлечён в /tmp/dsh-speech/): полный референс протокола
- Фазы 1-2: adapter, preparation, catalog, smoke-native.mjs (рабочий whisper-конфиг)
</code_context>

<specifics>
## Specific Ideas

После фазы - финальная голосовая верификация человеком (русская диктовка).
</specifics>

<deferred>
## Deferred Ideas

None
</deferred>

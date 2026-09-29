# dsh-stt-multi — v1 Requirements

**Project:** dsh-stt-multi — голосовой ввод DSH с выбором моделей
**Defined:** 2026-09-30 (research-backed: `.planning/research/`)
**Structure:** Horizontal Layers (PROJECT_MODE=standard)

## v1 Requirements

### Интеграция с DSH
- [ ] **PROV-01**: Пользователь устанавливает плагин в профиль desktop DSH — его движки появляются в списке настроек голосового ввода без правки кода приложения (через `ctx.speechToText.register`)
- [ ] **PROV-02**: Выбранная модель сохраняется между сессиями (персистенция выбора — ядром DSH, не плагином)
- [ ] **PROV-03**: Диктовка через родную кнопку микрофона DSH; собственных хоткеев нет

### Локальный Whisper (RU)
- [ ] **STT-01**: Пользователь диктует на русском локальным Whisper (tiny→large-v3-turbo) офлайн после загрузки модели
- [ ] **STT-02**: Русский и английский транскрипт корректен — регрессия на золотом ru+en аудио с первой фазы
- [ ] **STT-03**: Из коробки работает дефолтная модель (конкретную выбрать в фазе 1 по качеству/размеру)

### Загрузка моделей
- [ ] **DL-01**: При первом выборе модель автоматически скачивается (HF + hf-mirror fallback) в `~/.dsh/speech-to-text/<provider>/<model>/`
- [ ] **DL-02**: Целостность проверяется собственным sha256-манифестом (pinned revision); докачка, атомичная публикация
- [ ] **DL-03**: Ручная установка: пользователь кладёт файлы модели в директорию — работает без загрузки, хэш-проверка пропускается
- [ ] **DL-04**: Ошибки загрузки/запуска отображаются читаемо (кнопка теста даёт понятное сообщение)

### Мульти-инстансы и конфиг
- [ ] **MULTI-01**: Несколько записей в `cordis.patch.yml` = несколько моделей одновременно в списке настроек DSH
- [ ] **MULTI-02**: Конфиг per-instance: язык (auto/ru/en…), threads, precision — как у штатного плагина
- [ ] **MULTI-03**: Каталог моделей включает квантованные (int8/q5) и turbo-варианты Whisper
- [ ] **CUSTOM-01**: Пользователь подключает произвольные sherpa-совместимые модели через `modelDirectory`

### GigaAM v2 (локально)
- [ ] **GIGA-01**: Локальный RU-специалист GigaAM v2 (готовый ONNX-пакет k2-fsa, `modelConfig.nemoCtc`)
- [ ] **GIGA-02**: Лицензия GigaAM v2 проверена до публичного релиза (v1 — некоммерческая)

### API-провайдер
- [ ] **API-01**: OpenAI-совместимый провайдер `/audio/transcriptions` (Groq/OpenAI/…): baseURL + ключ per-instance
- [ ] **API-02**: Облачные движки явно помечены (аудио покидает машину); по умолчанию всё локально

### Качество и надёжность
- [ ] **QUAL-01**: Аудио не покидает устройство для локальных движков
- [ ] **QUAL-02**: Нативный бинарь sherpa-onnx проверен внутри реального профиля DSH (Electron/ASAR), не только в plain node
- [ ] **QUAL-03**: Память распознавателя освобождается (`free()`) при выгрузке/смене модели; namespaced-директории с первой фазы

## v2 / Deferred
- Пост-обработка транскрипта через DSH-агента — API хуков у speech-провайдера ещё нет
- CLI-команда транскрипции файлов
- Рантайм-конверсия моделей — только сборка/скрипты; GigaAM уже готовым пакетом

## Out of Scope (anti-features)
- Собственные глобальные хоткеи — конфликт с родной кнопкой DSH
- Файловая/митинг-транскрипция UI — не форма продукта (плагин хукает кнопку микрофона)
- Бинари моделей в npm/git — 150MB–3GB; качаем в `~/.dsh/speech-to-text/`
- Стриминг-партиалы — batch-utterance UX кнопки
- Телеметрия / платные тиры — local-first open source
- Словари / удаление слов-паразитов / спикер-лейблы — нужен пост-процессинг-стек, которого API не даёт

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 1 | Pending |
| PROV-02 | Phase 1 | Pending |
| PROV-03 | Phase 1 | Pending |
| QUAL-02 | Phase 1 | Pending |
| DL-01 | Phase 2 | Pending |
| DL-02 | Phase 2 | Pending |
| DL-03 | Phase 2 | Pending |
| DL-04 | Phase 2 | Pending |
| STT-01 | Phase 3 | Pending |
| STT-02 | Phase 3 | Pending |
| STT-03 | Phase 3 | Pending |
| QUAL-01 | Phase 3 | Pending |
| QUAL-03 | Phase 3 | Pending |
| MULTI-01 | Phase 4 | Pending |
| MULTI-02 | Phase 4 | Pending |
| MULTI-03 | Phase 4 | Pending |
| CUSTOM-01 | Phase 4 | Pending |
| GIGA-01 | Phase 5 | Pending |
| GIGA-02 | Phase 5 | Pending |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |

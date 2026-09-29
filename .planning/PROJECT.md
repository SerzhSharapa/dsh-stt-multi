# dsh-stt-multi — голосовой ввод DSH с выбором моделей

Плагин DeepSeek Harness (DSH), расширяющий родную кнопку микрофона: несколько
провайдеров распознавания с выбором и загрузкой моделей, как в Handy (handy.computer).
Проблема: штатный SenseVoice не знает русского (zh/yue/en/ja/ko only).

Заведён 29.09.2026 из сессии настройки DSH. Исходное исследование —
`~/hq/toolkit/dsh/research/2026-09-29-plugins-and-settings.md`.

## Цель (value)

Диктовка на русском (и не только) в родную кнопку микрофона DSH, локально и/или через
API, со сменой модели выбором из списка в настройках — без правки кода приложения.

## Архитектурные факты (проверены по коду DSH 0.2.0-rc.2)

- Реестр провайдеров `SpeechProviderId`: плагин регистрирует движок, тот появляется
  в списке настроек голосового ввода.
- Шаблон мульти-инстансов: одна запись в `cordis.patch.yml` профиля = один провайдер
  (как `@deepseek-ai/dsh-mcp-client` на сервер). Несколько записей = список моделей.
- Штатный воркер (speech-to-text-sensevoice): sherpa-onnx `OfflineRecognizer`,
  VAD Silero, загрузка моделей с зеркал HF, проверка по assets.json. При своём
  `modelDirectory` проверка хэшей пропускается.
- Жёсткое ограничение штатного плагина: `modelConfig.senseVoice` — только архитектура
  SenseVoice. Наш плагин выбирает modelConfig по типу модели.

## Провайдеры (фазы)

1. **`whisper-local`** (фаза 1): sherpa-onnx Whisper (tiny→large-v3-turbo), русский ок,
   загрузка с HF/зеркал в `~/.dsh/speech-to-text/<модель>/`. Кнопка работает на русском.
2. **Мульти-инстансы** (фаза 2): несколько моделей в списке, конфиг per-instance,
   precision/threads как у штатного.
3. **`gigaam-local`** (фаза 3): GigaAM v2 (NeMo CTC) → ONNX конвертация → sherpa
   `modelConfig.nemoCtc`. Конверсия — отдельный подэтап, может не осилиться.
   Fallback: `stt-api` — OpenAI-совместимый эндпоинт (Groq whisper и т.п.).

## Ограничения и риски

- DSH experimental API (0.1.7-alpha.1 → 0.2.0-rc.2): интерфейс SpeechProvider может
  меняться между rc. Плейс под peer `@deepseek-ai/cordis ^4.0.x`.
- «Любые модели» = sherpa-onnx-совместимые архитектуры локально + OpenAI-совместимые API.
- sherpa-onnx-node как dependency (нативный бинарь под darwin-arm64).
- Совместимость проверять по peerDependencies перед установкой (урок plugin-shop).

## Деливери

npm-пакет `dsh-stt-multi`, установка в профиль desktop, документация установки в
`~/hq/toolkit/dsh/` (LOG + README). Публикация: открытый репозиторий
`github.com/SerzhSharapa/dsh-stt-multi` (правила — build/CLAUDE.md) + npm.

# dsh-stt-multi — плагин голосового ввода для DSH

Плагин DeepSeek Harness: несколько провайдеров STT (Whisper/GigaAM/API) для родной
кнопки микрофона. Постановка и план фаз — `.planning/` и [PROJECT.md](PROJECT.md).
Знания об устройстве DSH — `~/hq/toolkit/dsh/`.

## Как вести

- Проект по GSD: `.planning/` уже создан; вход — `$gsd-progress` / `$gsd-resume-work`.
- Обновлять DSH-знания (LOG, profiles-backup) при новых находках — в `~/hq/toolkit/dsh/`.
- Модели и бинари в git не класть; качать в `~/.dsh/speech-to-text/`.
- Совместимость peer-зависимостей сверять с версией DSH до сборки.

## Стек

- TypeScript/JavaScript (npm-пакет), зависимость `sherpa-onnx-node` (нативный модуль).
- Тесты воркера — локально; интеграционные — установка в профиль desktop DSH.

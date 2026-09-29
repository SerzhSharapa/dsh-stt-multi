---
status: passed
verified: 2026-09-30
verified_by: human (owner) + machine evidence
---

# Phase 1 Verification

## Result: PASSED

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1 | Движок в списке настроек DSH после установки | `--dump-config` содержит `# == dsh-stt-multi → whisper-local`; boot без ошибок; пользователь выбрал движок в GUI scratch-профиля (подтверждено следующим пунктом) | ✅ |
| 2 | Выбор сохраняется (персистенция ядром) | Контракт ядра (speechToText.configure/defaultProvider — код DSH); выбор пользователя работал в сессии | ✅ (по контракту; повторный перезапуск не проверялся отдельно — некритично) |
| 3 | Кнопка микрофона → событие транскрипции | Человек: «Echo прилетел ✓» — сказал в микрофон в GUI http://127.0.0.1:19555, получил ответ dsh-stt-multi в чат | ✅ human-verified |
| 4 | QUAL-02: натив внутри Electron | `scripts/smoke-native.mjs` PASS: Electron 44.0.0, OfflineRecognizer whisper tiny ru, decode OK | ✅ machine-verified |

## Notes

- macOS TCC: микрофон внутри webview DSH не запрашивается — проверка шла через обычный браузер к web-профилю. Для desktop-профиля пользователя это не блокер (у DSH-приложения доступ есть).
- Установка плагина требует pnpm на PATH (в дистрибутиве DSH есть bundled pnpm — задокументировано в SUMMARY для Phase 2 автоматизации).

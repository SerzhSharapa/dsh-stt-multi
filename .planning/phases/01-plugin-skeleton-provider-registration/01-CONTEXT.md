# Phase 1: Plugin Skeleton & Provider Registration - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Плагин `dsh-stt-multi` устанавливается в профиль desktop DSH и его движок виден и выбираем в родных настройках голосового ввода (без правки кода приложения). Критерий транскрипции закрывается echo/stub-движком. Главный интеграционный риск — нативный модуль sherpa-onnx-node внутри Electron/ASAR — снимается smoke-тестом в реальном профиле DSH. Реальный Whisper-воркер и download-слой — НЕ в этой фазе (Фазы 2–3).

Requirements: PROV-01, PROV-02, PROV-03, QUAL-02.

</domain>

<decisions>
## Implementation Decisions

### Скелет пакета и идентификаторы
- Provider ID: `whisper-local`, display name «Whisper (local)» (из PROJECT.md фаз)
- Сборщик: tsup (ESM), `external: ['sherpa-onnx-node']`
- Менеджер: npm (критичны platform optionalDependencies)
- Структура src: каркас под все 5 фаз сразу — `src/index.ts`, `src/providers/`, `src/worker/`, `src/download/`

### Stub-движок (критерий 3)
- transcribe: echo-заглушка — фиксированная строка + audioSeconds; нативный путь не задействован
- `info.languages`: `["ru","en"]` (честно; ядро DSH валидирует при выборе)
- `downloadSources`: пусто/заглушка в этой фазе
- Все точки контакта с SpeechProvider API — в одном модуле `src/providers/adapter.ts` (изоляция экспериментального API, pitfall из исследования)

### Smoke-тест нативного бинаря (критерий 4)
- Среда: запуск скрипта Electron'ом DSH из живого профиля (`process.execPath`, `ELECTRON_RUN_AS_NODE=1`) — как штатный воркер, не plain node
- Глубина: `require('sherpa-onnx-node')` + конструирование `OfflineRecognizer` на whisper tiny (модель качается в `~/.dsh/speech-to-text/`)
- Профиль установки: отдельный scratch-профиль DSH, основной не трогаем
- Пин: `sherpa-onnx-node@~1.13.8`, lock-файл закоммичен

### the agent's Discretion
Детали реализации (точные имена файлов, содержимое package.json полей, тестовая структура) — на усмотрение агента.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Референс: штатный плагин speech-to-text-sensevoice в чекауте DSH (`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/`) — паттерн регистрации, worker-spawn, download-слой
- `.planning/research/ARCHITECTURE.md` — проверенный по исходникам контракт `ctx.speechToText.register({info, preparation, transcribe})` внутри `ctx.effect`, inject `["speechToText","subprocess"]`

### Established Patterns
- Greenfield — кода ещё нет; конвенции задаёт эта фаза (TS/ESM, npm)
- Одна запись в `cordis.patch.yml` профиля = один провайдер (паттерн подтверждён mcp-client записями)

### Integration Points
- Реестр SpeechProviderId ядра DSH (speechToText service)
- `cordis.patch.yml` профиля desktop DSH
- `~/.dsh/speech-to-text/` — кэш моделей (namespaced с первой фазы: `<provider>/<model>/`)

</code_context>

<specifics>
## Specific Ideas

Пользователь выбрал полную автономию: все рекомендации серых зон приняты без изменений (3/3 зоны). Бюджет агентов ограничен — фаза должна быть бережливой, без избыточных артефактов.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

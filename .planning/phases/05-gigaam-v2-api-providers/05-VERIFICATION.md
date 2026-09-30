---
status: passed
verified: 2026-09-30
verified_by: human (owner) + machine evidence
---

# Phase 5 Verification

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| GIGA-01 | GigaAM v2 локально | golden RU дословно «привет это проверка русского распознавания речи» (0.8с); человек продиктовал в GUI — «Работает» | OK |
| GIGA-02 | Лицензия проверена | GigaAM v2 (salute-developers/GigaAM, main) — MIT License (проверено по raw.githubusercontent) | OK |
| API-01 | OpenAI-совместимый провайдер | apiTranscribe multipart + env-ключ, unit-тесты (url/auth/formData/env-miss) | OK machine |
| API-02 | Явная облачная маркировка | apiDisplayName -> «... (cloud)» (тест); шаблон stt-api в patch.yml закомментирован | OK |

Fixes: display-имя из каталога (GigaAM больше не «Whisper»), per-provider директории (gigaam-local/).

Итог: 4 движка в списке (whisper small/tiny, GigaAM v2, + опциональный cloud), 26/26 тестов, v0.5.2.

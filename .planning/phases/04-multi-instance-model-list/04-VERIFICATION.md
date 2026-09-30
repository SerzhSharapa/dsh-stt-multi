---
status: passed
verified: 2026-09-30
verified_by: human (owner) + machine evidence
---

# Phase 4 Verification

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| MULTI-01 | Несколько моделей в списке | Человек: оба движка (whisper-small, whisper-tiny) видны и выбираемы в GUI | OK human |
| MULTI-02 | Per-instance конфиг | language/threads в Config; два инстанса с разными modelId зарегистрированы (тест) | OK |
| MULTI-03 | Каталог вариантов | tiny/small/turbo в каталоге (тест 22/22); turbo bootstrap | OK |
| CUSTOM-01 | Кастомный modelDirectory | modelFromDirectory (без хэшей, автодетект) + preparation custom-path + тест | OK machine |

Примечание: качество tiny для RU слабое (свойство модели, не баг) — дефолт small.

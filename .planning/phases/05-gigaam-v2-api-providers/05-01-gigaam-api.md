# Plan 05-01: GigaAM v2 + API Provider + Release (tracer)

**Phase:** 5 | **Type:** tracer | **Author:** orchestrator inline
**Requirements:** GIGA-01, GIGA-02, API-01, API-02

## Tasks

1. GigaAM: catalog запись (nemoCtc), worker inference ветка nemoCtc, insert gigaam-local; проверить LICENSE пакета
2. API provider: src/providers/api.ts (fetch multipart, apiKeyEnv), регистрация cloud-инстанса (без preparation/воркера)
3. Тесты: nemoCtc golden RU (после загрузки GigaAM), api unit (мок fetch), каталог
4. E2E: v0.5.0 -> профиль -> boot -> 3 локальных + 1 cloud движок в списке -> GigaAM диктовка (человек)
5. Релиз: README полный, SUMMARY/VERIFICATION, commit; GitHub-пуш после ОК владельца

## Definition of Done

GIGA-01..02, API-01..02 наблюдаемы; 4 движка в списке настроек.

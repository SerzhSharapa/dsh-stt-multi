# Plan 04-01: Multi-Instance Model List (tracer)

**Phase:** 4 | **Type:** tracer | **Author:** orchestrator inline
**Requirements:** MULTI-01, MULTI-02, MULTI-03, CUSTOM-01

## Tasks

1. **modelDirectory support**: Config.modelDirectory; findModel|fromDirectory (автодетект encoder*/decoder*/tokens* int8-приоритет, без хэшей); Preparation с custom-dir (inspect = files exist)
2. **Каталог**: large-v3-turbo int8 (bootstrap sha)
3. **patch.yml**: две insert-записи (whisper-tiny, whisper-small); id = providerId
4. **Тесты**: каталог-структура; автодетект на tiny-директории; adapter регистрирует оба инстанса (мок ctx)
5. **E2E**: v0.4.0 -> профиль -> boot -> оба движка в списке (человек) -> диктовка на каждом
6. **Wrap-up**: SUMMARY, VERIFICATION, commit

## Definition of Done

MULTI-01..03, CUSTOM-01 наблюдаемы: два+ движка в списке, per-instance конфиг работает, кастомная директория подхватывается.

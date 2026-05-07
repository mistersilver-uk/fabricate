# Import Mythwright SRD Equipment

## Summary

Update the Mythwright DnD5e bootstrap script so mundane SRD weapons and armour are resolved from the DnD5e 2024 Equipment compendium by explicit UUID and referenced directly by Mythwright components.

## Motivation

The current bootstrap scans DnD5e item packs by name and creates world-item payloads from the matched documents. That is brittle when both legacy and 2024 DnD5e packs are installed, and it recreates/imports base SRD equipment instead of referencing the canonical compendium entries.

## Scope

- Pin Mythwright mundane SRD gear to `Compendium.dnd5e.equipment24.Item.*` UUIDs from `tmp/dnd-5e-srd-ids.md`.
- Prefer direct UUID resolution before falling back to pack scanning.
- Add base SRD gear to the Mythwright component library by source UUID only, without creating world items.
- Keep Mythwright-authored quality, elemental, relic, essence, and ingredient items authored by Mythwright.

## Out of Scope

- Changing Mythwright recipe structure or result tiers.
- Changing starter alchemy content.
- Adding new module dependencies.

# Design

## SRD Resolution

Mythwright will maintain a curated list of DnD5e 2024 Equipment compendium UUIDs for the mundane weapons and armour it supports. `discoverSrdItems` will resolve these UUIDs with `fromUuid` when possible and by `game.packs.get(packId).getDocument(id)` otherwise. Pack scanning remains as a fallback for testability and degraded worlds.

## Component Reference Semantics

Mundane SRD base gear must not be imported into the world or recreated as Mythwright world items. The bootstrap adds these entries to the Mythwright component library from the resolved compendium document, preserving the compendium UUID as `sourceUuid` and `sourceItemUuid`.

Quality and elemental variants continue to be Mythwright-authored derivatives. They intentionally strip SRD matching identity and retain only `flags.fabricate.mythwrightBaseSourceId`.

## Risks

- Some DnD5e 2024 item names differ from legacy SRD names, such as `Light Crossbow` rather than `Crossbow, Light`. Component IDs will follow the canonical 2024 names for newly imported Mythwright data.

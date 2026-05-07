# Mythwright DnD5e Bootstrap Design

## Runtime

`routed` becomes a canonical recipe resolution mode alongside legacy `tiered`. Legacy `tiered` keeps outcome routing by explicit `outcomeRouting`. Canonical `routed` delegates result group choice to `resultSelection.provider`.

Provider behaviour:

- `ingredientSet`: uses `ingredientSet.resultGroupId`, then caller-selected result group, then first group.
- `macroOutcome`: compares the crafting check outcome to result group names case-insensitively. Reserved fail and miss keywords produce no output.
- `rollTableOutcome`: draws from the configured table and matches the drawn result name to a result group.

Step-level `resultSelection` overrides recipe-level `resultSelection`, allowing non-final Mythwright steps to route to `Standard` while final finishing steps route to the quality ladder.

## Bootstrap Script

The world script:

- Requires GM permission, DnD5e, and Fabricate readiness.
- Discovers DnD5e Item compendiums dynamically from `game.packs`.
- Resolves SRD weapons and armour by normalized name and type.
- Creates or updates world Items under the `Mythwright > ...` folder tree using folder path and item name as identity.
- Creates or updates the `mythwright-dnd5e` crafting system through Fabricate's managers.
- Creates or updates recipes and gathering environments by deterministic IDs.
- Creates or updates a `Mythwright Crafting Check` world Macro and records its UUID on the system.

SRD base weapon and armour items preserve their SRD source reference so Fabricate can match actor/world copies back to the canonical SRD item. Quality variants are copied from SRD item data only as a template; their matching identity strips `flags.core.sourceId`, `_stats.compendiumSource`, `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`. The original SRD source is retained only as Mythwright provenance metadata.

Generated tags are reserved for component matching and UI filtering. The bootstrap emits trait and role tags such as `weapon`, `armor`, `srd`, `quality`, `elemental`, essence IDs, `component`, `essence`, `relic`, and `catalyst`; it does not emit a `mythwright` tag solely to indicate system association.

Mundane SRD recipes use a four-outcome quality ladder: `Flawed`, `Standard`, `Fine`, and `Masterwork`. `Standard` routes to the source-linked SRD base item, while the other outcomes route to Mythwright-authored quality variants. `Mythic` remains available only on bespoke relic recipes, where the fantasy language fits the item identity. The Mythwright crafting macro falls back to `Masterwork` on a natural-20 style outcome when a step has no Mythic result group.

Curated elemental variants are Mythwright-authored world items copied from focused SRD templates. Each variant strips SRD matching identity while preserving `flags.fabricate.mythwrightBaseSourceId` as provenance. Weapon variants add a guarded `system.damage.parts` elemental damage part when that DnD5e shape exists and always append visible description text. Armour and shield variants add a transferring ActiveEffect that writes a DnD5e actor damage-resistance trait path and also append description text so the benefit remains visible if the effect schema changes.

Elemental finishing recipes are separate from mundane quality and relic recipes. Each elemental recipe requires the matching essence plus an artisan catalyst and routes deterministically to the curated elemental component. Elemental recipes set `transferEffects: true`; mundane and relic recipes do not rely on essence-transfer behaviour.

Bootstrap reruns repair earlier duplicate quality variants by keeping the deterministic Mythwright item for each quality and deleting extra Mythwright-authored items in the quality folders that still claim the same SRD source. Mythwright-authored item icons are passed through a small approved path set and fall back to `icons/svg/item-bag.svg` when uncertain.

`CraftingSystemManager` validates component source uniqueness after whole-system normalization for create/update payloads. Components with no source references remain valid, but any overlap across `sourceUuid`, `sourceItemUuid`, or `fallbackItemIds` is rejected.

The script exposes helper functions on `globalThis.MythwrightDnd5eBootstrap` so the idempotency and SRD matching behaviour can be tested under Node without a live Foundry runtime.

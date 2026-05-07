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

The generated crafting system description is player-facing copy: "Mythwright lets you turn harvested components, rare essences, and hard-won materials into weapons, armour, tools, and relics worthy of legend. Build multi-step recipes, forge mundane gear or world-shaping artefacts, and make crafting feel like part of the story rather than a shopping list."

Generated recipe descriptions use patterned player-facing copy. Mundane SRD weapon recipes describe selection, shaping, balancing, and finishing; armour and shield recipes use matching Mythwright copy with British `armour` language where appropriate. Elemental recipes describe binding the matching essence into an existing base item, while relic recipes describe awakening legendary artefacts from trophies, ancient fragments, catalysts, and essences. The `Craft Club` recipe description is fixed to: "A simple Mythwright recipe for crafting a sturdy club, guiding the crafter from raw material selection through shaping, balancing, and finishing the weapon."

SRD base weapon and armour items preserve their SRD source reference so Fabricate can match actor/world copies back to the canonical SRD item. Quality variants are copied from SRD item data only as a template; their matching identity strips `flags.core.sourceId`, `_stats.compendiumSource`, `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`. The original SRD source is retained only as Mythwright provenance metadata.

Generated tags are reserved only for tag-placeholder ingredient matching. Mythwright's generated recipes currently use exact component ingredients and essence requirements, not tag-placeholder ingredients, so the bootstrap emits no component tags, no recipe tags, and an empty `CraftingSystem.itemTags` list. Recipe categories remain the Mythwright GM UI filtering mechanism for Weapons, Armour, and Relics.

Mundane SRD recipes use a four-outcome quality ladder: `Flawed`, `Standard`, `Fine`, and `Masterwork`. `Standard` routes to the source-linked SRD base item, while the other outcomes route to Mythwright-authored quality variants. `Mythic` remains available only on elemental and bespoke relic recipes, where the fantasy language fits the item identity. The Mythwright crafting macro falls back to `Masterwork` on a natural-20 style outcome when a step has no Mythic result group.

Curated elemental variants are Mythwright-authored world items copied from focused SRD templates and expanded across `Flawed`, `Standard`, `Fine`, `Masterwork`, and `Mythic` quality tiers. The `Standard` tier keeps the original deterministic elemental ID for compatibility; other tiers insert the quality into the ID. Each variant strips SRD matching identity while preserving `flags.fabricate.mythwrightBaseSourceId` as provenance. Weapon variants add guarded tier-scaled elemental damage when `system.damage.parts` exists and always append visible description text. Armour and shield variants add tiered defensive metadata: flawed variants are description-only, standard variants add resistance, and higher variants add resistance plus a guarded AC bonus ActiveEffect.

Elemental finishing recipes are separate from mundane quality and relic recipes. Each elemental recipe requires the matching essence plus an artisan catalyst and uses `macroOutcome` to route to the tiered elemental component. Elemental recipes set `transferEffects: true`; mundane and relic recipes do not rely on essence-transfer behaviour.

Mythwright-authored world items receive item-sheet descriptions at creation/update time. Base materials, weapon and armour components, catalysts, essences, relics, quality variants, and elemental variants all carry short fantasy descriptions. Fabricate components created from Mythwright-authored items copy that item flavour into component descriptions. Source-linked SRD base weapons and armour preserve source descriptions when present.

Mythwright-authored items, recipes, and the crafting check macro use explicit Foundry core icon paths verified against `tmp/fvtt-icon-paths.md`. SRD-derived base items may still preserve their source item image when copied from DnD5e compendium data.

Bootstrap reruns repair earlier duplicate quality variants by keeping the deterministic Mythwright item for each quality and deleting extra Mythwright-authored items in the quality folders that still claim the same SRD source. Mythwright-authored item icons are passed through a small approved path set and fall back to `icons/svg/item-bag.svg` when uncertain.

`CraftingSystemManager` validates component source uniqueness after whole-system normalization for create/update payloads. Components with no source references remain valid, but any overlap across `sourceUuid`, `sourceItemUuid`, or `fallbackItemIds` is rejected.

The script exposes helper functions on `globalThis.MythwrightDnd5eBootstrap` so the idempotency and SRD matching behaviour can be tested under Node without a live Foundry runtime.

Deterministic Mythwright gathering environments keep their stable IDs but use plain names: `Mines`, `Wilds`, `Ruins`, `Battlefields`, `Planar Sites`, and `Dragon Lairs`. Their descriptions describe the location rather than repeating the crafting-system name.

The player Gathering listing model includes `craftingSystemName` on visible environments, active runs, and history rows. Listing results include `gatheringSystems` metadata derived from visible environments/runs/history. The Svelte store normalizes these options, tracks a selected system filter, exposes filtered environments in view state, and keeps all Foundry access behind injected services. The player app shows a crafting-system select only when more than one gathering system is present, includes system names in environment search, and renders system chips only in that multi-system state.

# Rename Gathering Hazards to Gathering Events

## Summary

Rename the gathering-domain concept **Gathering Hazard** to **Gathering Event** root-and-branch
across persistence, runtime, stores, UI, i18n, specs, and docs. The word "Hazard" hard-codes a
*danger-only* connotation; a Gathering Event is meant to be a neutral umbrella that can evoke
meeting a travelling merchant in the woods just as readily as a volcanic eruption or a pack of
harpies. The mechanic is unchanged — a reusable library record that can drop alongside a
gathering result, matched by biome/weather/time and gated by a danger profile — only the
ubiquitous-language term and every identifier, key, and string derived from it change.

## Motivation

"Hazard" is the wrong centre of gravity for the concept. The system already supports neutral and
beneficial encounters (a record need not be dangerous), but the naming pushes every authoring and
player surface toward danger-first language ("When & where it strikes", "This area carries a risk
of hazards", "If a hazard strikes…"). Renaming to **Event** widens the fantasy: the same machinery
models an eruption, a wandering pedlar, or a fortuitous omen. The **danger** axis (`dangerTags`,
danger level, the `hazardous` tier) stays as an orthogonal *property* of an Event — events CAN be
dangerous — so risk remains expressible without dominating the framing.

## Goals

- **Event** is the only term for the concept. No `hazard`/`Hazard`/`HAZARD` token survives for the
  Gathering Event concept in source, UI, i18n keys/values, specs, or docs.
- Persisted world data migrates automatically and idempotently with no data loss: `hazards[]` →
  `events[]`, the per-environment `*HazardIds` / `hazard*` rule keys → `*EventIds` / `event*`, the
  record field `hazardModifier` → `eventModifier`, and the stored policy values
  `successWithHazard` / `failureWithHazard` → `successWithEvent` / `failureWithEvent`.
- The danger axis is preserved as an Event property; danger-first UI copy is reworded to neutral
  encounter language.
- The normalizer accepts legacy `successWithHazard` / `failureWithHazard` policy values on read
  (imported or un-migrated payloads) and coerces them to the new values.

## Non-Goals

- No change to the Event *mechanic*: matching axes (biome/weather/time + danger), selection modes
  (`allDrops` / `highestRankedDrop`), visibility tiers (`dangerLevelOnly` / `encounterChance` /
  `full`), drop-rate, condition/character modifiers, and scene linking all behave exactly as before.
- No rename of the orthogonal **danger** axis: `dangerTags`, danger level/tiers (incl. the
  `hazardous` tier value), `dangerLevelOnly`, and `risk-*` CSS are unchanged.
- The Foundry core asset path `icons/svg/hazard.svg` (the default Event image) is **not** renamed.
- No archived `openspec/changes/hazard-*` historical proposals are rewritten.

## Migration

A versioned (`1.0.0`), idempotent migration converts each persisted `gatheringConfig.systems[*]`
and `environments[*]` payload from the hazard schema to the event schema: it renames the
collection, the rule keys, the per-environment id lists / order / adjustment maps, the record
modifier field, and the stored policy enum values. It only renames a key when the old key is
present and the new key absent, so a second run is a no-op. The default-image literal
`icons/svg/hazard.svg` is left untouched.

## Affected Specs

- `gathering-and-harvesting`
- `data-models`
- `ui-integration`

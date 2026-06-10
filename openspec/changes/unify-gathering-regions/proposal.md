# Unify Gathering Regions

## Summary

Make **`GatheringRegion`** the single region concept in gathering. Today two unrelated "region" notions coexist: a legacy *region vocabulary* of tag strings that participates in environment composition, and first-class `GatheringRegion` records (introduced by `location-aware-gathering-regions`) that drive location availability, current-region resolution, travel, and discovery. This change collapses them into one, lets environments belong to multiple regions, moves region authoring into the Travel surface, and adds a per-system toggle that enables or disables the entire region/travel subsystem.

This change **supersedes** parts of `location-aware-gathering-regions`: region is no longer a composition axis, the legacy region vocabulary is removed, and the region/travel subsystem becomes opt-in per system.

## Motivation

The two region concepts look related to a GM but are wired to entirely different machinery, and they never cross-reference. The legacy `environment.region` tag drives *composition* (which library tasks/hazards auto-populate an environment), while `GatheringRegion` drives *availability* (where the party can gather). Environments can only carry one legacy region tag. The result is confusing duplication and a region model that cannot express "this environment exists in several places."

A single first-class region concept — geography that environments opt into and parties travel between — is clearer, and gating it behind a per-system switch keeps the default gathering experience simple for systems that do not want location mechanics.

## Goals

- `GatheringRegion` is the only region concept. The legacy region vocabulary is removed.
- Region is **geography only**: it drives availability, current-region resolution, travel, and discovery — not composition.
- Auto-composition of tasks/hazards into environments matches on **biome + danger only**. Region is dropped as a composition axis; tasks/hazards no longer carry region tags.
- Environments declare membership in **multiple** regions via `includedRegionIds` (the multi-value analog of biomes), replacing the single legacy `region` tag in the editor.
- Region authoring lives in the **Travel** tab; the legacy region vocabulary editor is removed.
- A per-system **Enable Travel & Regions** setting (`gatheringRegionSettings.enabled`, default disabled) gates the whole subsystem.
- Existing region data migrates automatically and idempotently with no data loss.

## Non-Goals

- No change to biome or danger vocabularies (biomes remain a composition axis and the source for region biome traits).
- No new region-detection automation (Scene Region token sensing remains a later phase).
- No player-facing travel UI in this change (still a later phase); only the data, gating, and GM authoring surfaces.
- No change to parties beyond gating them behind the new toggle.

## Behavior When The Toggle Is Disabled

- The environment editor shows no region selectors.
- No party, travel, current-region resolution, availability gating, or discovery mechanics run.
- The Travel tab is hidden in the manager.
- The player gathering UI shows no current region (and the engine emits no location evidence).
- Composition (biome + danger) is unaffected.

## Migration

A one-time, idempotent migration converts each legacy region-vocabulary tag into a `GatheringRegion` record, maps each `environment.region` to `includedRegionIds`, strips task/hazard region tags, and clears the legacy region vocabulary. Migrated systems remain **disabled** by default; a one-time GM notice names the systems that had regions so the GM can re-enable them.

## Affected Specs

- `gathering-and-harvesting`
- `data-models`
- `ui-integration`

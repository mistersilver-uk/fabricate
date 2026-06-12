# Gathering And Harvesting Spec Delta

## Renamed Concept

### Reusable Gathering Hazard Library → Reusable Gathering Event Library

The reusable library of records that can drop alongside a gathering result is renamed from
**Gathering Hazard** to **Gathering Event**. The selection, policy, visibility, matching, drop-rate,
and modifier mechanics are unchanged — only the term and its derived identifiers change.

Requirements:

1. System Gathering Rules govern **event** selection (`eventSelectionMode`), **event** limit
   (`eventLimit`), **event** outcome (`eventPolicy`), and **event** visibility (`eventVisibility`).
   These are renames of the `hazard*` rule fields; the rule values are unchanged.
2. Event selection modes (`highestRankedDrop` / `allDrops` / `limitedDrops`), event policy values
   (`successWithEvent` / `failureWithEvent`), and event visibility tiers (`dangerLevelOnly` /
   `encounterChance` / `full`) behave exactly as the prior hazard equivalents. Only the two policy
   values are renamed (`successWithHazard`→`successWithEvent`, `failureWithHazard`→`failureWithEvent`).
3. Event matching uses biome (and danger) only, exactly as hazard matching did. The danger axis
   (`dangerLevel`, default tiers `safe`/`unsafe`/`hazardous`/`dangerous`/`deadly`/`extreme`) is
   **unchanged** — events, like hazards before them, match against an environment danger ceiling.
4. Deleting a per-system condition value removes it from Gathering Tasks and **events** in that
   system only (rename of the prior "tasks and hazards" wording).
5. Character modifiers apply to d100 drop rows and **events** (rename of "drops and hazards");
   evaluation, summing, and blind-history redaction of hidden **event** identities are unchanged.

## Unchanged: d100 failure-result keyword `hazard`

The d100 result-group parser keeps `hazard` as a reserved **failure** keyword/alias (with `danger`,
`complication`, `trap`, `oops`). It is not the Gathering Event concept and is **not** renamed.
Validation/helper copy still reserves these failure aliases and forbids them as result-group names.

## Migration

A one-time, idempotent `1.0.0` migration rewrites persisted hazard keys/values to their event
equivalents across `gatheringConfig.systems[*]` and `environments[*]` (see the `data-models` delta),
leaving `icons/svg/hazard.svg`, the danger axis, and the failure-keyword vocabularies untouched.

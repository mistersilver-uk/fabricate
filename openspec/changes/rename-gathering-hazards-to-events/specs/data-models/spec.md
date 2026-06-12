# Data Models Spec Delta

## Renamed Models

### Gathering Hazard → Gathering Event

The reusable library record formerly called **Gathering Hazard** is renamed **Gathering Event**.
The record shape, matching axes (biome/weather/time + danger), drop rate, condition/character
modifiers, and scene link are unchanged; only the term and the derived field names change.

Requirements:

1. The record field `hazardModifier` is renamed `eventModifier`. Its semantics (optional
   provider-specific roll modifier) are unchanged.
2. The default image literal `icons/svg/hazard.svg` is a Foundry core asset and is **not** changed.
3. The orthogonal danger axis (`dangerTags`, `dangerLevel`, the `hazardous` danger tier) is **not**
   renamed; it remains a property describing how dangerous an Event is.

### GatheringEnvironment composition fields

The per-environment hazard composition fields are renamed to their event equivalents:

```js
GatheringEnvironment = {
  // …unchanged task fields…
  enabledEventIds?: string[],                       // was enabledHazardIds
  disabledEventIds?: string[],                      // was disabledHazardIds
  forcedEventIds?: string[],                        // was forcedHazardIds
  eventOrder?: string[],                            // was hazardOrder
  eventSelectionMode?: "highestRankedDrop" | "allDrops",   // legacy compat-read; was hazardSelectionMode
  eventPolicy?: "successWithEvent" | "failureWithEvent",   // legacy compat-read; was hazardPolicy
  eventDropRateAdjustments?: Record<string, number>,          // was hazardDropRateAdjustments; eventId -> signed pp delta
  eventDropRateAdjustmentsEnabled?: Record<string, boolean>,  // was hazardDropRateAdjustmentsEnabled
}
```

Requirements:

1. `enabledEventIds` / `disabledEventIds` store environment-level composition toggles for reusable
   Event records (was `enabledHazardIds` / `disabledHazardIds`).
2. In automatic mode every matching, library-enabled Event composes unless listed in
   `disabledEventIds`; in manual mode only `enabledEventIds` (still matching) plus `forcedEventIds`
   compose. (Renamed from the hazard equivalents; behavior unchanged.)
3. `eventOrder` provides deterministic ordering for composed Events, including manual
   `forcedEventIds`. GM reorder controls are exposed only when the system's `eventSelectionMode` is
   `highestRankedDrop` (renamed from `hazardOrder` / `hazardSelectionMode`; behavior unchanged).
4. `eventDropRateAdjustments` stores environment-local signed percentage-point deltas keyed by
   event id; `eventDropRateAdjustmentsEnabled` stores per-event apply switches. (Renamed from the
   hazard equivalents; integer `-100..100`, zero omitted, environment-local only.)

### System Gathering Rules

The selected-system d100 rule fields are renamed:

```js
GatheringRules = {
  // …reward fields unchanged…
  eventSelectionMode: "highestRankedDrop" | "allDrops" | "limitedDrops",  // was hazardSelectionMode
  eventLimit: number,                                                     // was hazardLimit
  eventPolicy: "successWithEvent" | "failureWithEvent",                   // was hazardPolicy
  eventVisibility: "dangerLevelOnly" | "encounterChance" | "full",       // was hazardVisibility
}
```

Requirements:

1. Missing rules normalize to event mode `allDrops`, event limit `1`, event policy
   `successWithEvent` (renamed from hazard equivalents; other defaults unchanged).
2. Unknown event policies normalize to `successWithEvent`.
3. The visibility tier **values** `dangerLevelOnly` / `encounterChance` / `full` and the selection
   **values** `highestRankedDrop` / `allDrops` / `limitedDrops` are unchanged (they carry no
   "hazard" token).
4. The normalizer accepts legacy `successWithHazard` / `failureWithHazard` policy **values** on read
   (imported or un-migrated payloads) and coerces them to `successWithEvent` / `failureWithEvent`.

## Unchanged: d100 failure-result keyword `hazard`

The d100 result-group parser reserves `hazard` as a **failure** alias (alongside `danger`,
`complication`, `trap`, `oops`). This is unrelated to the Gathering Event concept and is **not**
renamed. The `FAILURE_KEYWORDS` / `GATHERING_FAILURE_KEYWORDS` vocabularies are unchanged.

## Migration

A versioned (`1.0.0`), idempotent migration:

1. For each `gatheringConfig.systems[*]`: renames `hazards`→`events`; rule keys
   `hazardSelectionMode/hazardLimit/hazardPolicy/hazardVisibility`→`event*`; record field
   `hazardModifier`→`eventModifier`; and the `hazardPolicy` **values**
   `successWithHazard/failureWithHazard`→`successWithEvent/failureWithEvent`.
2. For each `environments[*]`: renames `*HazardIds`→`*EventIds`, `hazardOrder`→`eventOrder`,
   `hazardSelectionMode/hazardPolicy`→`event*` (+ value remap),
   `hazardDropRateAdjustments(Enabled)`→`eventDropRateAdjustments(Enabled)`.
3. Leaves `icons/svg/hazard.svg`, `dangerTags`/`dangerLevel`/`hazardous`, and the failure-keyword
   vocabularies untouched.

Requirements:

1. The migration is idempotent: every rename guards on "old key present AND new key absent", and a
   value remap fires only for a known legacy string, so a second run makes no change.
2. It runs at a higher version than all existing migrations (new highest `1.0.0`).
3. Imports do not re-run the migration; pre-rename imports upgrade on the next startup, and the
   normalizer's legacy-value fallback keeps un-migrated payloads loadable in the interim.

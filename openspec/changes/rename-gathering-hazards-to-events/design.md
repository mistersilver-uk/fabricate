# Design — Rename Gathering Hazards to Gathering Events

## Naming scheme

Every token of the *Gathering Hazard concept* is rewritten preserving the surrounding compound and
casing:

| Before                                   | After                                    |
|------------------------------------------|------------------------------------------|
| `GatheringHazardEditView` (component)    | `GatheringEventEditView`                 |
| `hazardSelectionMode` / `hazardLimit`    | `eventSelectionMode` / `eventLimit`      |
| `hazardPolicy` / `hazardVisibility`      | `eventPolicy` / `eventVisibility`        |
| `enabledHazardIds` / `disabledHazardIds` | `enabledEventIds` / `disabledEventIds`   |
| `forcedHazardIds` / `hazardOrder`        | `forcedEventIds` / `eventOrder`          |
| `hazardModifier` (record field)          | `eventModifier`                          |
| `hazardChance` / `_environmentHazardChance` (listing payload) | `eventChance` / `_environmentEventChance` |
| `'hazardChance'` (region-modifier kind value, `GATHERING_REGION_MODIFIER_KINDS`) | `'eventChance'` |
| `hazardDropRateAdjustments(Enabled)`     | `eventDropRateAdjustments(Enabled)`      |
| `successWithHazard` / `failureWithHazard`| `successWithEvent` / `failureWithEvent`  |
| `GATHERING_HAZARD_POLICIES`              | `GATHERING_EVENT_POLICIES`               |
| `GATHERING_HAZARD_VISIBILITIES`          | `GATHERING_EVENT_VISIBILITIES`           |
| `data-gathering-hazard-*` / `data-hazard-*` | `data-gathering-event-*` / `data-event-*` |
| `.gathering-hazard-*` / `.manager-gathering-hazard-*` | `.gathering-event-*` / `.manager-gathering-event-*` |
| i18n `…Hazard*` keys + values            | `…Event*`                                |

## Decisions

1. **Full rename + migration (persisted keys).** Storage keys are renamed and a `1.0.0` migration
   rewrites existing worlds. Rationale: keeping internal keys as `hazard` while everything else
   reads `event` leaves a permanent seam; the migration infra (`MigrationRunner` + the
   `migrateUnifyGatheringRegions` template) makes a safe, idempotent rewrite cheap.

2. **Keep the danger axis, neutralize copy.** `dangerTags`, danger level/tiers (incl. the
   `hazardous` tier value), `dangerLevelOnly`, and `risk-*` CSS are an orthogonal axis describing
   *how dangerous* an Event is — Events can be benign or dangerous. They are **not** renamed. Only
   danger-first user-facing copy is reworded (see below).

3. **Rename stored enum values with a legacy fallback.** `successWithHazard` / `failureWithHazard`
   → `successWithEvent` / `failureWithEvent`. The normalizer accepts the legacy values on read and
   coerces them, so imported or pre-migration payloads still load even though the migration
   normally rewrites them at startup.

## Migration design (`migrateRenameGatheringHazardsToEvents.js`, v1.0.0)

Modelled on `src/migration/migrateUnifyGatheringRegions.js`: a pure function, deep-cloning inputs
via `JSON.parse(JSON.stringify())`, idempotent, returning `{ gatheringConfig, environments, systems }`
so the runner spread-merges those keys. Registered in `MigrationRunner.MIGRATIONS` as the new highest
version `1.0.0`.

For each crafting system in `systems[*]` (region-modifier kind rename):
- Walk `gatheringRegions[*].modifiers[*]` and rename `kind` value `'hazardChance'→'eventChance'`
  (only that one kind; `dropRate`/`yield`/`difficulty`/`staminaCost`/`attemptLimit`/`custom` are
  unchanged). Guard on the legacy value so a second run is a no-op.

For each `gatheringConfig.systems[sysId]`:
- Rename collection `hazards` → `events` (only when `events` absent).
- On `rules`: `hazardSelectionMode→eventSelectionMode`, `hazardLimit→eventLimit`,
  `hazardPolicy→eventPolicy`, `hazardVisibility→eventVisibility`; remap `hazardPolicy` **value**
  `successWithHazard→successWithEvent` / `failureWithHazard→failureWithEvent`.
- On each event record: `hazardModifier→eventModifier`. Leave `img` (`icons/svg/hazard.svg`) and the
  `dangerTags` / `hazardous` danger value untouched.

For each `environments[*]`:
- `enabledHazardIds→enabledEventIds`, `disabledHazardIds→disabledEventIds`,
  `forcedHazardIds→forcedEventIds`, `hazardOrder→eventOrder`,
  `hazardSelectionMode→eventSelectionMode`, `hazardPolicy→eventPolicy` (+ value remap),
  `hazardDropRateAdjustments→eventDropRateAdjustments`,
  `hazardDropRateAdjustmentsEnabled→eventDropRateAdjustmentsEnabled`.

**Idempotency:** every rename guards on "old key present AND new key absent"; value remaps only fire
for a known legacy string. A second run is a byte-for-byte no-op.

**Partial / anomalous payloads:** if the new key is already present (e.g. `events[]` exists), the
migration does **not** touch it; a stale legacy `hazards[]` left alongside it is left inert (no
clobber, no drop) — lossless and matches the `migrateUnifyGatheringRegions` orphan-leave-inert
precedent. Each key migrates independently (a mixed object with `eventPolicy` already set but
`hazardLimit` still legacy migrates only `hazardLimit`). An `hazardDropRateAdjustments` map renames
even when the `hazards[]`/`events[]` collection is absent.

## Two normalizers carry the policy enum

Both must be renamed AND given the legacy-accepting fallback (`successWithHazard`/`failureWithHazard`
→ coerce to event values on read), or imported/un-migrated payloads silently lose their policy:

1. `adminStore.js` `_normalizeGatheringRules` (system rules; also `_normalizeGatheringHazard` →
   `_normalizeGatheringEvent`) and the draft field-merge switch (`adminStore.js` ~3543-3582) +
   `_normalizeDraftHazardDropRateAdjustmentsEnabled` — these read the **new** names post-migration.
2. `GatheringEnvironmentStore._normalizeEnvironment` (~line 280) independently re-derives
   `hazardPolicy` against `['successWithHazard','failureWithHazard']`. This is the path the smoke
   `create()` fixture and `tests/gathering-environment-store.test.js` exercise — its validation
   error string (`hazardDropRateAdjustments.<id> must be an integer…`) also renames in lockstep.

## Neutral-copy rewrites (keep danger axis, reword danger-first phrasing)

A pure `Hazard*`→`Event*` key/value swap leaves residual danger framing in several strings
("strikes", "risk", "safe", "risky locations", "struck"). Reword these:

| i18n key (renamed)                          | Before                                          | After                                          |
|---------------------------------------------|-------------------------------------------------|------------------------------------------------|
| `App.Gathering.Browse.EventConditionsHeading` | "When & where it strikes"                     | "When & where it happens"                      |
| `App.Gathering.Browse.EventRiskNote`        | "This area carries a risk of hazards."          | "Events can occur in this area."               |
| `App.Gathering.Browse.EventsHiddenHint`     | "The hazards here are hidden until you gather."  | "The events here are hidden until you gather." |
| `App.Gathering.Browse.EventImpactSuccess`   | "If a hazard strikes, your gather still succeeds." | "If an event occurs, your gather still succeeds." |
| `App.Gathering.Browse.EventImpactFailure`   | "If a hazard strikes, the gather fails."        | "If an event occurs, the gather fails."        |
| `App.Gathering.Browse.EventChanceHint`      | "Your chance of encountering a hazard while gathering here." | "Your chance of an event occurring while gathering here." |
| `App.Gathering.Browse.EventSafeHint`        | "This gathering environment is safe."           | "No events occur while gathering here."        |
| `…EnvironmentEditor.…EventScenePrompt.Title`| "Hazard struck"                                 | "An event occurred"                            |
| `…EnvironmentEditor.EmptySetup.StepEvents`  | "Prepare encounter and hazard options that can be reused across risky locations." | "Prepare event options that can be reused across your locations." |

Tooltips referencing "this hazard" → "this event". Copy that legitimately describes the danger axis
is kept verbatim, only swapping the concept noun: e.g. `Validation.IssueNoEventsAtDanger` keeps the
danger reference → "Danger is set but no events are available."; "Danger tags let environments opt
in…" is unchanged.

## Surviving "hazard"-rooted user-visible word (by design)

The danger-tier **value** `hazardous` (one of `safe`/`unsafe`/`hazardous`/`dangerous`/`deadly`/
`extreme`) and its i18n label are retained verbatim — it names danger *intensity*, not the Event
concept. This is the single user-visible "hazard"-rooted word that survives, and the grep-sweep gate
whitelists it. Likewise the new-Event seed default `dangerTags: ['hazardous']` is unchanged.

## Manager "Encounters" tab key/id — kept as-is (stated decision)

The GM nav tab is *keyed* `Admin.Manager.Environment.GatheringTabs.Encounters` with the *value*
"Hazards", and its DOM/nav id is `manager-gathering-nav-encounters` (smoke harness pins this
selector). Decision: **rename only the visible values** ("Hazards"/"Gathering hazards" →
"Events"/"Gathering events"); **keep** the `Encounters` key name and the
`manager-gathering-nav-encounters` id (the key was already a euphemism, and renaming the id would
break the smoke selector for no user benefit). The grep-sweep keep-list includes `encounters`.

## Collision guards

- **`'hazard'` as a d100 failure-result keyword** — the `FAILURE_KEYWORDS` (`GatheringEngine.js`)
  and `GATHERING_FAILURE_KEYWORDS` (`GatheringEnvironmentStore.js`) arrays list `'hazard'`
  alongside `danger`/`complication`/`trap`/`oops` as a *failure* alias for result-group parsing.
  This is a **separate concept** (a failure outcome, not a Gathering Event) and is **NOT renamed**.
  The matching `resolution-modes` spec aliases and `ui-integration` "former miss/hazard terms" copy
  stay. The literal `'hazard'` is therefore context-dependent: rename it only where it is the
  Event-concept `kind` discriminator (`kind === 'hazard'` / `kind: 'hazard'` / `kind="hazard"`),
  never in the failure-keyword arrays. These few sites are edited by hand, not by bulk replace.
- **`kind === 'hazard'` discriminator** — the shared task/hazard `kind`-driven component pattern
  (AGENTS.md §kind-split) uses `'hazard'` as a runtime discriminator value. It IS the Event
  concept → rename the value to `'event'` and the paired i18n selection (`…Hazard`→`…Event`).
  Runtime-only (not persisted), so no migration needed for it.
- **`GatheringChatCard` event section** — `model.hazards`, `CHAT_KEYS.hazards`,
  `HAZARD_FALLBACK_IMG`, and the section CSS `modifier: 'hazard'` are the Event concept → rename
  (constant `HAZARD_FALLBACK_IMG→EVENT_FALLBACK_IMG`, CSS modifier `'hazard'→'event'`), but its
  *value* `icons/svg/hazard.svg` stays.
- `icons/svg/hazard.svg` — Foundry core asset; never a replace source (only the constant name
  changes, not the path string).
- `hazardous` danger-tier value and `danger`/`risk` identifiers — orthogonal axis; whole-word,
  case-sensitive replacement of `hazard`-concept tokens never touches them.
- Pre-existing `event` usages (DOM events, Foundry hooks, keydown handlers) — never a replace
  *source*; all rename targets are `gathering`/`Hazard`-suffixed compounds, so the rename is
  additive-by-construction and cannot collide.

## Layer ordering (each step keeps `npm test` + `npm run build` green)

A storage-key or i18n-key rename must land together with its consumer or tests break. Sequence:
OpenSpec → persistence/migration/runtime (+ scene coordinator, `main.js`, `selectionDefault`, their
tests) → admin store + manager root → Svelte components + test-hooks + CSS (+ component/screenshot
tests) → i18n keys/values + neutral copy → docs/specs.

# Tasks

## OpenSpec And Review

- [ ] Run plan-review with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [ ] Revise `proposal.md`, `design.md`, and spec deltas until every plan reviewer approves.

## Step 1 — Persistence + migration + runtime (atomic)

- [ ] Add `src/migration/migrateRenameGatheringHazardsToEvents.js` (pure, deep-cloning, idempotent; returns `{ gatheringConfig, environments }`): rename `hazards→events`; rules `hazardSelectionMode/hazardLimit/hazardPolicy/hazardVisibility→event*`; record field `hazardModifier→eventModifier`; env `*HazardIds→*EventIds`, `hazardOrder→eventOrder`, `hazardSelectionMode/hazardPolicy→event*`, `hazardDropRateAdjustments(Enabled)→event*`; policy values `successWithHazard/failureWithHazard→successWithEvent/failureWithEvent`. Leave `icons/svg/hazard.svg` and the `hazardous` danger value untouched.
- [ ] Register it in `MigrationRunner.MIGRATIONS` as version `1.0.0` (new highest). Migration also returns `systems` and renames region-modifier kind `'hazardChance'→'eventChance'` on `systems[*].gatheringRegions[*].modifiers[*]`.
- [ ] Rename region-modifier kind in `src/systems/gatheringRegions.js`: `GATHERING_REGION_MODIFIER_KINDS` `'hazardChance'→'eventChance'`; accept legacy `'hazardChance'` on READ (coerce) so un-migrated/imported region data loads; update `validateGatheringRegionModifiers`. Update `tests/gathering-region*.test.js` and the spec/doc references (`openspec/specs/gathering-and-harvesting/spec.md:317`, `docs/gathering-regions.md:60`).
- [ ] Rename runtime: `GatheringEngine.js` (`GATHERING_HAZARD_POLICIES/VISIBILITIES→GATHERING_EVENT_*`; listing model `hazards/hazardChance/hazardVisibility→events/eventChance/eventVisibility`, incl. `_environmentHazardChance→_environmentEventChance`; `GatheringChatCard.js` `model.hazards→events`, `HAZARD_FALLBACK_IMG→EVENT_FALLBACK_IMG` (value `icons/svg/hazard.svg` stays), section CSS `modifier:'hazard'→'event'`), `gatheringMatch.js`, and the normalizer in `adminStore.js` (`_normalizeGatheringHazard→_normalizeGatheringEvent`, `_normalizeGatheringRules`, draft field-merge switch ~3543-3582, `_normalizeDraftHazardDropRateAdjustmentsEnabled`).
- [ ] **Second normalizer:** rename `GatheringEnvironmentStore._normalizeEnvironment` (~line 280) policy derivation to `eventPolicy`/`successWithEvent` and its validation error string (`hazardDropRateAdjustments.<id>…`→`eventDropRateAdjustments.<id>…`). Do NOT touch `GATHERING_FAILURE_KEYWORDS` (line 10) — the `'hazard'` there is a failure alias.
- [ ] Add legacy-enum fallback in **both** normalizers (adminStore rules + GatheringEnvironmentStore per-environment): accept `successWithHazard/failureWithHazard` on read → coerce to `successWithEvent/failureWithEvent`; unknown policy still defaults to `successWithEvent`.
- [ ] `git mv src/systems/hazardSceneCoordinator.js src/systems/eventSceneCoordinator.js`; rename `collectLinkedHazardScenes→collectLinkedEventScenes`, `createHazardSceneTrigger→createEventSceneTrigger`, `routeHazardSceneSocketMessage→routeEventSceneSocketMessage`, and the socket message-type constant. Update `src/main.js` wiring and `selectionDefault.js` (`visibleHazardsFor→visibleEventsFor`, `resolveDefaultHazardSelection→resolveDefaultEventSelection`).
- [ ] `git mv` + update matching tests: `tests/hazard-scene-coordinator.test.js`, `tests/gathering-hazard-scene-trigger.test.js`, `tests/gathering-engine-listing.test.js` (~74 sites), `tests/gathering-match.test.js`, `tests/gathering-chat-card.test.js`, `tests/gathering-environment-store.test.js` (validation error string), `tests/gathering-rich-library.test.js`, `tests/gathering-biome-modifiers.test.js`, `tests/gathering-character-modifier-*.test.js`, `tests/helpers/gathering.js`.
- [ ] **Migration-version assertions (will break repo-wide):** bump `'0.9.0'`→`'1.0.0'` in `tests/migration-runner.test.js` (lines ~285,353,467,496,568,612) and `tests/migrate-unify-gathering-regions.test.js` (~233,299).

## Step 2 — Admin store + manager root

- [ ] Rename the ~45 hazard CRUD/state methods in `adminStore.js` (`createGatheringHazard→createGatheringEvent`, `updateGatheringLibraryHazard`, `toggleGatheringHazardEnabled`, `addGatheringHazardCharacterModifier`, `…ConditionModifier`, `normalizeHazardCharacterModifiers`, etc.) and the `kind === 'hazard'` discriminator value → `'event'` (NOT the `FAILURE_KEYWORDS` literal).
- [ ] Rename handlers/state/route ids in `CraftingSystemManagerRoot.svelte` (`selectedGatheringHazardId`, `gatheringHazardDraft(Baseline)`, `editingGatheringHazard`, `gatheringHazardValidation`, route `'gathering-hazard-edit'→'gathering-event-edit'`, etc.).
- [ ] Update `kind`-discriminator consumers in lockstep: `CompositionList.svelte`, `RecordInspector.svelte`, `EnvironmentEditView.svelte:62` (`kind === 'hazard' ? 'hazards' : 'tasks'` → `'event'`/`'events'`, coupled to the `data-environment-tab` value). Update `tests/stores/adminStore.test.js` (~159 sites), `tests/stores/admin-store-environments.test.js` (~40), `tests/components/environment-composition-list-mounted.test.js` (`kind:'hazard'`, `['exclude','hazard','included']` tuples).

## Step 3 — Svelte components + test-hooks + CSS

- [ ] `git mv` 6 components, update every import: `GatheringHazardEditView→GatheringEventEditView`, `GatheringHazardsBrowserView→GatheringEventsBrowserView`, `GatheringHazardRow→GatheringEventRow`, `GatheringHazardDetail→GatheringEventDetail`, `HazardChanceBar→EventChanceBar`, `EnvironmentHazardsTab→EnvironmentEventsTab`.
- [ ] Rename `data-gathering-hazard-*`/`data-hazard-*` → `data-gathering-event-*`/`data-event-*`; `.gathering-hazard-*`/`.manager-gathering-hazard-*` → `…-event-…`; `data-manager-view="gathering-hazard-edit"`/`data-environment-tab="hazards"` values.
- [ ] `git mv` + update component tests (`gathering-hazard-editor.test.js`, `gathering-hazards-browser.test.js`). **Mounted tests `writeCompiledSvelte` by path and hard-crash on the `git mv`** — update import paths/tokens in lockstep: `tests/components/manager-mounted.test.js`, `gathering-environments-mounted.test.js`, `gathering-detail-mounted.test.js`, `gathering-view-actor-bar.test.js`, `environment-editor.test.js` (`EnvironmentHazardsTab` import token). Update the heavily-coupled `tests/components/manager-contract.test.js` (i18n VALUE pins "Gathering hazards"/"Review hazards"/"Hazards", source tokens `gatheringHazardDefinitions`, `data-gathering-rule-stepper="hazardLimit"`, rule labels).
- [ ] Screenshot ids `manager-gathering-hazards-normal`→`manager-gathering-events-normal`, `manager-gathering-hazard-editor-normal`→`manager-gathering-event-editor-normal`; ensure the screenshot publish/clean step removes the orphaned `*-hazard*` ids.

## Step 4 — i18n keys + values + neutral copy

- [ ] `lang/en.json`: rename every `Hazard*` key+value to `Event*` across `App.Gathering.Browse.*`, `Chat.GatherHazards→GatherEvents`, `Admin.Manager.EnvironmentEditor.{Hazards,Rules,Composition,CompositionDetail,HazardsTab,Validation}.*`, and `Admin.Manager.Environment.GatheringTabs.*` (NOTE: correct path — there is no `System.Encounters.*`). Rename the GatheringTabs `Encounters`/`EncountersTitle`/`EncountersHint` **values** "Hazards"/"Gathering hazards"/"Browse reusable hazards…" → "Events"/"Gathering events"/"Browse reusable events…", but **keep** the `Encounters` key name and the `manager-gathering-nav-encounters` DOM id (stated decision in design.md).
- [ ] Apply the neutral-copy rewrites in `design.md` — including `EventChanceHint`, `EventSafeHint` ("safe"→neutral), `EmptySetup.StepEvents` ("risky locations"), `…EventScenePrompt.Title` ("Hazard struck"→"An event occurred"). Keep `dangerTags`-related copy and `Validation.IssueNoEventsAtDanger` danger reference.

## Step 5 — Docs + specs

- [ ] Update `DOMAIN.md` ubiquitous-language entries + "task/hazard" → "task/event" mentions. Name the heavy rows explicitly: **Gathering Rules** (line ~26: `successWithHazard`/`failureWithHazard`, hazard selection/limits/outcome, `hazardSelectionMode`/`hazardPolicy`), **Environment Task** (line ~28), **Character Modifier** (line ~97: `normalizeHazardCharacterModifiers`, `hazard.hazardModifier`, row/hazard-scoped actions). **KEEP** the **Reserved Failure Keyword** row (line ~70) — `hazard` there is the failure alias.
- [ ] Update `AGENTS.md` (~line 93 kind-split i18n guidance `…Task/…Hazard`→`…Task/…Event`; ~line 94 domain-terms list "tasks, hazards, and required tools"→"tasks, events, and required tools").
- [ ] Update `docs/gathering-environments.md`, `docs/agents/gathering-environment-data-model.md`.
- [ ] Promote spec deltas into canonical `openspec/specs/{data-models,gathering-and-harvesting,ui-integration}/spec.md`.

## Tests

- [ ] NEW `tests/migrate-rename-gathering-hazards-to-events.test.js` (top-level dir — confirmed gated by the `package.json` test glob, same as `tests/migrate-unify-gathering-regions.test.js`). Assertions: pre-1.0.0 fixture (`hazards[]`/`enabledHazardIds`/`hazardPolicy:'successWithHazard'`/`hazardModifier`/`hazardDropRateAdjustments`) → `events[]`/`enabledEventIds`/`eventPolicy:'successWithEvent'`/`eventModifier`/`eventDropRateAdjustments`; **idempotent** second run is a no-op; **keep-list preserved** (`img:'icons/svg/hazard.svg'` and `dangerTags:['hazardous']` unchanged); **failure-keyword survival** (a result-group containing `'hazard'` passes through byte-for-byte); **partial payload** (`events[]` already present + stale `hazards[]` → not clobbered, stale left inert); **mixed old/new keys** migrate independently; **adjustments without collection** (`hazardDropRateAdjustments` but no `hazards[]`) still renames; **through-the-runner** run from <1.0.0 lands at `migrationVersion==='1.0.0'` and persists the rewrites. Confirm `npm test` total count rises.
- [ ] Legacy-fallback unit for **both** normalizers (adminStore rules + GatheringEnvironmentStore per-environment): accept `successWithHazard` → coerce to `successWithEvent`; unknown policy → `successWithEvent`.
- [ ] Smoke harness (`scripts/foundry-test-run.mjs`): update the `environmentStore.create({...})` fixture payload keys (~1993-1996: `hazardSelectionMode/hazardPolicy:'successWithHazard'/enabledHazardIds`) and direct `hazards[]` seeds (~1021-1029, ~2101-2107) — these go through the runtime normalizer, NOT the migration, so stale keys are silently dropped. Update selectors `.manager-gathering-hazard-row`/`.manager-gathering-hazard-edit-view` (~782,792,828,837,2667,2673), `data-manager-view="gathering-hazard-edit"` (~2674), visible text `'Hazard Identity'`/`'Hazard Matching'` (~2675-2677), `rawHazards`/`viewHazards` count probes (~2235-2242,2601-2608), and screenshot ids. Rename fixture id `smoke-bramble-hazard`→`smoke-bramble-event` (or add to keep-list) so the grep-sweep gate passes. Keep `#manager-gathering-nav-encounters`.

## Validation Gates

- [ ] `npm test` (total count rises).
- [ ] `npm run build`.
- [ ] Grep sweep over `src/`, `tests/`, `lang/`, `styles/`, `docs/`, `openspec/specs/`: no `Hazard`/`hazard` tokens outside the keep-list — `icons/svg/hazard.svg`; the `hazardous` danger tier; `FAILURE_KEYWORDS`/`GATHERING_FAILURE_KEYWORDS` + resolution-modes failure alias `hazard`; `manager-gathering-nav-encounters`/`Encounters` key; `biohazard` FA icon; archived `openspec/changes/hazard-*`, `openspec/changes/manager-v2-hazard-library`, and other archived `openspec/changes/*` proposals (historical record — not rewritten). Run the same sweep over `tests/` (mirrors the source sweep) to catch missed lockstep test updates.
- [ ] UI-changing slice: screenshot planning → local Foundry smoke capture → publish → clean per `docs/agents/ui-pr-screenshots.md`.
- [ ] Run implementation review with reviewer, UX, and quality coverage.

## Docs Loop

- [ ] Run the paired `fabricate_domain_expert` / `fabricate_docs_writer` loop over the diff until both approve.

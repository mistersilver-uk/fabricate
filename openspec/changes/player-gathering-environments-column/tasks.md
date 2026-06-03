# Tasks

## Phase 1 — Engine: locked environments + listing fields
- [ ] `GatheringRichStateService`: add `countRevealedTasks({ actor, environmentId, scope })` — read
      `readState(actor).reveals`, count distinct task ids per scope+env **reusing the existing
      `revealKey` builder** (`:1592-1596`); `party` collapses onto the `actor:` key (no party
      branch today); return `0` on missing state, never throw.
- [ ] `GatheringRichStateService`: add `resolveBiomeTags(biomeIds, systemId)` — reuse
      `normalizeVocabularyOption('biomes', …)` + `DEFAULT_BIOME_METADATA`; load system biome vocab
      from `this._config().systems?.[systemId]?.vocabularies?.biomes` → `config.vocabularies?.biomes`
      → `DEFAULT_BIOME_METADATA` (confirm exact path on the service before wiring). Extract a
      reusable resolver if `normalizeVocabularyOption` is module-private.
- [ ] `GatheringEngine._playerCandidateEnvironments`: stop filtering `enabled === false` for
      non-GMs; keep system-membership filter + compose.
- [ ] `GatheringEngine`: build a lightweight locked listing for disabled envs (non-GM) that skips
      task-visibility gating — `{ identity…, locked: true, visible: true, attemptable: false,
      tasks: [], blockedReasons: [ENVIRONMENT_DISABLED] }` (reuse the existing reason; no new key).
- [ ] `GatheringEngine._buildEnvironmentListing`: add `locked`, `revealPolicy` (from
      `_resolveRevealPolicy(composedEnvironment)` — system-level `composed.rules`, NOT
      `environment.reveal`), `composedTaskCount` (composed task pool size; `0` when
      locked/composed-empty), `discoveredTaskCount` (via `countRevealedTasks` at the same effective
      scope; `0` when locked or `revealPolicy === 'never'`), `biomeTags` (via `resolveBiomeTags`).
- [ ] Tests — `tests/gathering-engine-listing.test.js`:
  - [ ] non-GM `listForActor` returns a disabled env with `locked: true`, identity-only fields,
        `tasks: []`, `attemptable: false`, and the `EnvironmentDisabled` blocked reason (no GM
        internals leaked).
  - [ ] disabled **blind** env whose sole task is hidden still returns the locked listing (is NOT
        dropped as `BLIND_SOLE_TASK_HIDDEN`).
  - [ ] **GM** still receives the full (non-locked) listing for a disabled env (`locked: false`).
  - [ ] enabled env carries `revealPolicy`, `composedTaskCount`, `discoveredTaskCount`,
        `biomeTags`; fixtures seed **`environment.rules`/system rules** for reveal policy (NOT
        `environment.reveal`).
  - [ ] regression: an `environment.reveal` override does NOT change the listed `revealPolicy`
        (locks the discarded-override invariant alongside the new field).
  - [ ] `composedTaskCount === 0` / `discoveredTaskCount === 0` on a composed-empty env and on the
        locked listing (blind `(0/y)` teaser pinned).
- [ ] Unit tests — `tests/gathering-rich-library.test.js` (or sibling): `countRevealedTasks` for
      each scope (actor/user/global) **and `party` via the actor-key path**, empty/missing state;
      `resolveBiomeTags` with a per-system vocab override winning and the `DEFAULT_BIOME_METADATA`
      fallback.
- [ ] `npm test` + `npm run build`.

## Phase 2 — App wiring + components
- [ ] `SvelteFabricateApp.svelte.js`: add `listGatheringForActor` service; pass `services` prop.
- [ ] `FabricateAppRoot.svelte`: accept `services`; render `<GatheringView {services} />` on the
      gathering tab (other tabs keep the placeholder).
- [ ] New `GatheringView.svelte`: async fetch + loading/error/empty (and no-actor → empty) states
      with scoped base-token styles; 3-column grid (center larger); left =
      `GatheringEnvironmentList`; center/right inert empty placeholders; owns `selectedId`.
- [ ] New `GatheringEnvironmentList.svelte`: labeled region (`aria-labelledby` → "Environments"
      title) + hint; `role="list"`; available-before-locked ordering; inner scroll
      `min-width:0; overflow:hidden`.
- [ ] New `EnvironmentCard.svelte`: stable `data-environment-id`/`data-locked`/`data-selection-mode`
      /selection hooks; image (`alt=""`) + name (ellipsis + `title`) + read-only biome chips
      (base-token `color-mix(in srgb,…)`, `--fab-chip-color` per chip); blind mask icon + chip;
      `(x/y)` suffix (accessible label) when blind && `revealPolicy !== 'never'`; locked =
      non-focusable `div` + visible lock icon + accessible label, image-only desaturation,
      contrast-safe text; available = `<button>`, `is-selected` = `--fab-success-soft` + inset
      `--fab-accent` bar. Mirror GM card metrics (`min-height:76px`, `9px 10px`, radius 8px).
- [ ] `lang/en.json`: add the `FABRICATE.App.Gathering.{Loading,Error}` +
      `Gathering.Environments.{Title,Hint,Empty,BlindChip,Locked,LockedAria,Discovered}` keys
      (copy in design.md).
- [ ] Component tests — **split by style**:
  - [ ] string-include (mirror `tests/components/fabricate-app-shell.test.js`): presence of the 3
        columns, region title + hint i18n keys, the `revealPolicy !== 'never'` guard, biome-chip /
        blind-chip / lock markup markers.
  - [ ] mounted/happy-dom (mirror `tests/components/manager-mounted.test.js` +
        `tests/helpers/svelte-dom.js`, mocking `services.listGatheringForActor`): selecting an
        available card sets the selection hook/`is-selected`; locked card renders no `<button>` and
        is not focusable; `(x/y)` appears only for blind + reveal≠never; loading→populated
        transition.
- [ ] `npm test` + `npm run build`.

## Phase 3 — Smoke harness + screenshot evidence + docs
- [ ] `scripts/foundry-test-run.mjs`: before the gathering-tab `screenshot()`
      (~L2641-2655), add a `waitFor` on a stable `EnvironmentCard`/empty-state hook so the async
      `GatheringView` fetch resolves (avoids capturing the loading state). Seed a disabled env and a
      blind env (reveal≠never) in `seedSmokeGatheringLibrary` (~L905) using Foundry/dnd5e raster
      icon paths (no custom SVG). Note the GM-only capture shows full listings (locked-teaser is
      player-only, test-covered).
- [ ] Produce real smoke-run screenshots of the gathering tab Environments column per the UI
      screenshot evidence flow; embed in the PR (`screenshots:ui:plan` → `test:foundry` →
      `screenshots:ui` → `screenshots:ui:publish` → `screenshots:ui:clean`).
- [ ] Docs loop: update JSDoc on the changed engine/RichState methods; update
      `docs/agents/gathering-environment-data-model.md:16` to distinguish the GM admin
      `availableTaskCount` from the new engine `composedTaskCount`; confirm no canonical spec edit
      needed for reveal/blocked-reason.

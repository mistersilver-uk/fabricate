# Tasks

## Phase 1 — Selector path, persistence, and API injection (`src/main.js`)
- [ ] Add `isPlayerCharacterActor(actor)` → `actor?.type === 'character'` — the current dnd5e/pf2e
      implementation of the player-character **concept** and the documented extension seam (JSDoc
      should say so; other PC types are a known limitation).
- [ ] Add `isSelectableBarActor({ actor, viewer })` combining the existing ownership rule (player
      owns / GM sees all) AND `isPlayerCharacterActor(actor)`. Do NOT modify
      `isGatheringActorSelectableByUser`.
- [ ] Add `getBarSelectableActors` via the existing `createGatheringSelectableActorsGetter`, passing
      `isSelectableBarActor` as `isSelectable`.
- [ ] Add `listSelectableActors()` mapping selectable actors to **redaction-safe**
      `{ id, uuid, name, img }` records only (no leaked actor internals).
- [ ] Add `getSelectedGatheringActorId()` / `setSelectedGatheringActorId(id)` over
      `SETTING_KEYS.LAST_GATHERING_ACTOR`.
- [ ] In `listGatheringForActor(options)`, inject
      `{ rememberedActorId: this.getSelectedGatheringActorId() || null, ...options }` so an explicit
      `rememberedActorId` still overrides the persisted default. Note: the engine resolves
      `rememberedActorId` against its **ownership** list, so a legacy persisted owned non-PC id is
      honored by the engine for that fetch; the bar store converges it to a PC (see Phase 2 / design
      convergence contract). Do NOT add a PC filter to the engine path.
- [ ] Do NOT modify `src/config/preferencesCleanup.js`: startup cleanup stays ownership-based and an
      owned non-PC persisted id is intentionally not cleared (convergence is the store's job).
- [ ] Test — selectable-actors service: owned (player) / all (GM) AND `isPlayerCharacterActor`;
      an owned non-PC actor stays attempt-authorized but is absent from the bar list; redaction
      assertion that returned records contain ONLY `{ id, uuid, name, img }`; `rememberedActorId`
      default injection from the setting + explicit override. Route through the SAME injected-dependency
      boundary used by `tests/gathering-engine-listing.test.js` (inject
      `getSelectableActors`/`isActorSelectable`/`localize`/settings accessors) so it runs under
      `node:test` without touching `game.settings`/`game.actors`.
- [ ] `npm test` + `npm run build`.

## Phase 2 — Shared store + icon util
- [ ] New `src/ui/svelte/util/gatheringConditionIcons.js`: export `TIME_OF_DAY_ICONS`,
      `TIME_OF_DAY_FALLBACK_ICON` (`'fas fa-clock'`), `getTimeOfDayIcon(id)`,
      `getTimeOfDayLabelKey(id)`.
- [ ] `src/ui/svelte/stores/adminStore.js`: import the extracted icon map (no behavior change).
- [ ] New `src/ui/svelte/stores/actorBarStore.svelte.js`: factory `createActorBarStore({ services })`
      with runes state `selectedActorId`, `selectableActors`, `region`, `conditions`, `loaded`;
      methods `loadSelectableActors()` (seed from `getSelectedActorId()`; if id is empty OR not in the
      PC `selectableActors` (stale, incl. owned non-PC) fall back to first + re-persist; guard with
      `loaded` so a re-entry does not clobber a deliberate `selectActor`; when the list is EMPTY set no
      selection, do NOT persist, do NOT index `selectableActors[0]`), `selectActor(id)` (persist via
      `setSelectedActorId`), `setRegion(region)`, `refreshConditions()` (via `getGatheringConditions`).
- [ ] Test — `tests/util/gathering-condition-icons.test.js`: icon lookups, fallback, label keys.
- [ ] Test — `tests/stores/actor-bar-store.test.js`: (a) empty persisted id and (b) STALE persisted
      id (present-but-not-in-PC-list / owned non-PC) BOTH fall back to first + re-persist exactly once;
      EMPTY PC list → no selection, no persist, no throw; `selectActor` persists; re-entry guard
      (`loaded` prevents a second `loadSelectableActors()` from clobbering a deliberate `selectActor`);
      `setRegion`; `refreshConditions`.
- [ ] `npm test` + `npm run build`.

## Phase 3 — Top bar component + shell/view wiring + i18n
- [ ] `src/ui/SvelteFabricateApp.svelte.js`: `_buildServices()` adds `listSelectableActors`,
      `getSelectedActorId`, `setSelectedActorId`, `getGatheringConditions`; then
      `services.actorBar = createActorBarStore({ services })`.
- [ ] New `src/ui/svelte/components/ActorSelectTopBar.svelte`: props `store`, `activeTab`,
      `onActorChange?`. Borrow the `IconPicker.svelte` interaction model
      (`dismissOnOutsideClick`, focus-on-open effect, `searchTerm` + `$derived` filtered list) but
      render the popover **in-place** (no `portal`). Left portrait+caret trigger; popover search
      input + `role="listbox"` portrait+name options filtered case-insensitively by name; right side
      weather + time-of-day + region only when `activeTab === 'gathering'`, using the fixed GM
      category icons (`fas fa-cloud-sun`, `fas fa-clock`). Tokens-only scoped styles, both themes.
  - Popover positioning: plain CSS `position: absolute; top: calc(100% + 6px); left: 0` anchored to
    the `position: relative` `.actor-bar-left`, dropping directly below the trigger, left-aligned;
    the bar root drops `overflow: hidden` so the in-place popover can overflow downward; bounded
    `max-height` with the options list scrolling.
  - A11y: `role="dialog"` + `aria-label`, trigger `aria-haspopup`/`aria-expanded`, `role="listbox"`/
    `role="option"`, Tab-through option buttons, Escape/outside-click dismiss, focus-on-open search.
    Do NOT add arrow-key roving / `aria-activedescendant` (not in the reused IconPicker).
  - Null/empty `img`: render a neutral fallback icon (e.g. `fa-user`), portrait `aria-hidden`, actor
    name as the accessible label / `alt`; never emit `<img src="">`.
  - Long names: ellipsis truncation (`text-overflow: ellipsis` + `overflow:hidden`/`white-space:nowrap`)
    with full name in `title`, for both trigger and option rows.
  - Zero selectable actors: disabled trigger + placeholder portrait/label; `NoActors` empty state in
    the popover.
  - Right side: missing `conditions.timeOfDay` → `TIME_OF_DAY_FALLBACK_ICON` (`fa-clock`) +
    `TimeOfDay.Unknown`; `region === ''` → `Region.None`.
  - Narrow resize: region/time-of-day cluster truncates/wraps; trigger stays usable; no horizontal
    overflow beyond `.fabricate-app-content`.
  - Expose a stable `data-actor-bar-state` attribute (`loading` → `ready`) flipping to `ready` once
    `selectableActors` and `conditions` are loaded (smoke-harness wait selector).
- [ ] `src/ui/svelte/apps/FabricateAppRoot.svelte`: render
      `<ActorSelectTopBar store={services.actorBar} {activeTab} />` above content in a new
      `.fabricate-app-main` vertical flex column; add `$effect` calling `loadSelectableActors()` +
      `refreshConditions()`. Layout: `.fabricate-app-main` is `display:flex; flex-direction:column`;
      the bar is `flex:0 0 auto`; `.fabricate-app-content` is `flex:1 1 auto; min-height:0` so the
      gathering `height:100%` 3-column grid has a bounded parent and does not collapse/double-scroll.
- [ ] `src/ui/svelte/apps/gathering/GatheringView.svelte`: read `store = services.actorBar` (use
      `store?.` optional chaining everywhere so existing tests with no `services.actorBar` stay green);
      `load()` passes `{ rememberedActorId: store?.selectedActorId ?? null }`; make the fetch
      `$effect` re-run on `store.selectedActorId`; add an `$effect` reporting
      `setRegion(selectedEnvironment?.region ?? '')`; first-load BACKSTOP calls
      `store.selectActor(listing.selectedActorId)` AT MOST ONCE and ONLY when the store id is empty AND
      `listing.selectedActorId` is present in `store.selectableActors` (a player character); otherwise
      keep the store's own fallback. Idempotent — no re-adopt/ping-pong on later fetches.
- [ ] `lang/en.json`: add `FABRICATE.App.ActorBar.*` — `Trigger`, `SearchPlaceholder`, `SearchLabel`,
      `NoActors`, `DialogLabel`, `Region.Label`, `Region.None`, `TimeOfDay.Label`,
      `TimeOfDay.{dawn,day,dusk,night}`, `TimeOfDay.Unknown`, and `PortraitFallbackAlt` (or reuse the
      actor name as the accessible label for the neutral fallback portrait).
- [ ] Test — `tests/components/actor-select-top-bar-mounted.test.js`: portrait+caret trigger; popover
      search filters by name; listbox selection calls `selectActor`; gathering-only region/time-of-day
      right side hidden on non-gathering tabs; null/empty `img` → neutral fallback (no `<img src="">`);
      long-name ellipsis + `title`; zero actors → disabled trigger + `NoActors`; missing `timeOfDay` →
      `fa-clock` + `TimeOfDay.Unknown`; `region === ''` → `Region.None`. Popover focus: drain a
      microtask (`await tick()`) before asserting focus (IconPicker uses
      `queueMicrotask(() => searchInput?.focus())`); if happy-dom focus is unreliable, assert
      popover-open + search-input presence instead.
- [ ] Test — extend the gathering view mounted test: actor change re-fetches `listGatheringForActor`
      (mutate `store.selectedActorId`, then `flushSync()` + double `await tick()`, assert the fetch
      call-count mirroring `tests/components/gathering-detail-mounted.test.js` `calls.list` so there is
      no spurious mount-time double fetch); region reported to the store; REGRESSION — a GatheringView
      mounted with a `services` bag with NO `actorBar` still mounts and fetches unmodified (the
      `store?.` guards); first-load backstop adopts `listing.selectedActorId` once and ONLY when present
      in `selectableActors`, with no re-adopt on subsequent fetches; a second `loadSelectableActors()`
      after a deliberate `selectActor` does NOT re-seed the user's choice (re-entry guard).
- [ ] `npm test` + `npm run build`.

## Phase 4 — Smoke harness + screenshots + docs (PR follow-up)
- [ ] `scripts/foundry-test-run.mjs` Phase E (player app, ~2672-2726): the change inserts
      `.fabricate-app-main` ABOVE the gathering body, so the existing `[data-gathering-state]`
      DESCENDANT selectors survive unchanged. Add the new stable bar selector
      `[data-actor-bar-state="ready"]` to Phase E's wait set so the player-app screenshot waits on a
      mounted, conditions-loaded bar rather than its loading state, before capturing
      `fabricate-app-shell`. (Manager Phase D0 `.manager-*` selectors are NOT affected — no change
      there.)
- [ ] Produce real smoke-run screenshots of the top bar across tabs; embed in the PR.
- [ ] Docs loop: JSDoc on the new `main.js` selector/persistence methods + `listGatheringForActor`
      injection, the `actorBarStore` factory, and the extracted icon util; note the shared top bar in
      any player-app chrome doc.

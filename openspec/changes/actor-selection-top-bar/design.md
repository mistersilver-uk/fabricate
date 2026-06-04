# Design — Actor Selection Top Bar

## Shared runes store via `services.actorBar`

The bar lives in the shell (`FabricateAppRoot`), but the gathering tab (`GatheringView`) owns the
selected environment whose `region` the bar must display, and a change of selected actor in the bar
must re-drive the gathering fetch. This is **bidirectional**: shell → tab (selected actor id) and
tab → shell (current region). Threading props up and down through the tab router would be brittle and
would not survive tab switches.

Instead, a single Svelte 5 runes store is created once in `_buildServices()` and hung off
`services.actorBar`. Both `FabricateAppRoot` and `GatheringView` already receive `services`, so both
read and write the same reactive state without prop drilling. The shell writes
`selectedActorId` / `selectableActors`; the gathering tab writes `region` and reads
`selectedActorId`; the bar reads `region` / `conditions` for its right-hand context.

### `src/ui/svelte/stores/actorBarStore.svelte.js` (new)

Factory `createActorBarStore({ services })`. Runes state:

- `selectedActorId: string` — the active selection.
- `selectableActors: Array<{ id, uuid, name, img }>` — the popover list.
- `region: string` — reported by the gathering tab from its selected environment.
- `conditions: { weather, timeOfDay }` — current global gathering conditions.
- `loaded: boolean` — guards one-time load.

Methods:

- `loadSelectableActors()` — populate `selectableActors` via `services.listSelectableActors()` (the
  PC-filtered list); seed `selectedActorId` from `services.getSelectedActorId()`. If that id is **empty
  or not present in the PC list** (stale, including a legacy owned non-PC id), **fall back to the first
  selectable actor and re-persist it** via `selectActor(first.id)` so the shell and the persisted
  setting converge on a player character. Guarded by `loaded` so a second call after a deliberate
  `selectActor` does NOT clobber/re-seed the user's choice (re-entry guard). When the PC list is
  **empty**, set no selection, do NOT persist, and do NOT index `selectableActors[0]` (no throw).
- `selectActor(id)` — set `selectedActorId` and persist via `services.setSelectedActorId(id)`.
- `setRegion(region)` — store the gathering tab's reported region (`''` when none selected).
- `refreshConditions()` — refresh `conditions` via `services.getGatheringConditions()`.

The store is a plain factory (no Foundry globals); all environment access is behind the injected
`services` bag, matching the existing developer-contract boundary rule.

## The player-character concept and why its filter lives in the new selector path

"Player character" is a **concept**: the actor types a system designates as player characters. It is a
**selection-list** concern for the top bar only. The current dnd5e/pf2e **implementation** of the
concept is the predicate `isPlayerCharacterActor(actor)` → `actor?.type === 'character'`; `'character'`
is not a universal truth and is the seam where future per-system PC-type configuration would hook in.

`isGatheringActorSelectableByUser(actor, user)` is **ownership-based** and is reused as a gathering
**attempt authorization** gate (`main.js` `isActorSelectable: ({ actor, viewer }) => …`). Folding the
player-character concept into it would silently forbid legitimately-owned non-PC actors from making
gathering attempts through any surface — a behavior regression, not a UI tweak.

So the filter lives in a new selector path in `main.js`, layered above ownership:

- `isPlayerCharacterActor(actor)` — `actor?.type === 'character'` (the current dnd5e/pf2e
  implementation of the player-character concept; the documented extension seam).
- `isSelectableBarActor({ actor, viewer })` — combine ownership (player owns / GM sees all, mirroring
  the existing ownership rule) AND `isPlayerCharacterActor(actor)`.
- `getBarSelectableActors` — built via the existing `createGatheringSelectableActorsGetter`, passing
  `isSelectableBarActor` as `isSelectable`.

`isGatheringActorSelectableByUser` is untouched, so attempt authorization stays ownership-based.

**Known limitation:** systems whose player-character actor type is not `'character'` will not have
their PCs listed in the bar this iteration. Re-pointing `isPlayerCharacterActor` is the intended,
isolated extension point.

## Persistence and fallback behavior

The selection reuses the existing `SETTING_KEYS.LAST_GATHERING_ACTOR` client setting — no new key.

- `getSelectedGatheringActorId()` reads `LAST_GATHERING_ACTOR` (empty string when unset).
- `setSelectedGatheringActorId(id)` writes it.
- The store seeds from `getSelectedActorId()`; when empty/stale it **falls back to the first
  selectable actor and re-persists** so a fresh client converges on a valid, sticky selection.
- `listGatheringForActor(options)` injects
  `{ rememberedActorId: this.getSelectedGatheringActorId() || null, ...options }` so the default
  honors the persisted selection while an explicit `rememberedActorId` in `options` still overrides
  it (the gathering view passes the live `store.selectedActorId`).

This keeps a single source of truth for "who am I gathering as" across reloads and tab switches —
**after convergence**. See the convergence contract below for the first-fetch window where a legacy
persisted id can diverge.

## Engine ownership list vs. bar PC list — the convergence contract

There are **two different selectable-actor lists** in play:

- The **engine's** list is **ownership-based**: `GatheringEngine._resolveSelectedActor` matches
  `rememberedActorId` against the engine's ownership `selectableActors` (it does `find(... actorMatchesId
  ...)` and otherwise falls back to `selectableActors[0]`). It does NOT apply the player-character
  concept.
- The **bar store's** list (`selectableActors`) is the **PC-filtered** subset (`isSelectableBarActor`).

These can diverge on the **persisted-default path**: `listGatheringForActor` injects
`rememberedActorId = getSelectedGatheringActorId()` from `LAST_GATHERING_ACTOR`, and a legacy/stored id
can be an **owned non-PC** actor (e.g. an owned `npc`). In that case:

- The **engine is authoritative for that fetch**: because the id matches its ownership list, the engine
  will resolve and gather as that owned non-PC actor and return it as `listing.selectedActorId`.
- The **bar store treats a non-listed id as stale**: a `rememberedActorId` (or an adopted
  `selectedActorId`) that is not present in the bar's PC `selectableActors` is converged by **falling
  back to the first PC and re-persisting** it (`selectActor(firstPc.id)`), so subsequent fetches gather
  as a player character and `LAST_GATHERING_ACTOR` is rewritten to a PC id.

So the **single-source-of-truth claim holds AFTER convergence, not necessarily on the very first
fetch** when a legacy non-PC id is persisted. The store's `loadSelectableActors()` fallback is what
performs the convergence; the engine is never modified to know about the PC concept.

### `cleanupStalePreferences` interaction (intentionally ownership-based)

Startup cleanup (`src/config/preferencesCleanup.js`) clears `LAST_GATHERING_ACTOR` only when the
stored id fails the **ownership** predicate (`resolveGatheringActor` + `isSelectableGatheringActor`).
An **owned non-PC** id therefore passes cleanup and is NOT cleared at startup, leaving the divergent
state for the store to converge. This is **intentional and unchanged**: cleanup is consistent with
attempt authorization (ownership), and converging to a player character is the store's responsibility,
not cleanup's. This change does NOT modify cleanup behavior.

## First-load sync between store and gathering listing

The gathering listing already returns a `selectedActorId` (its own ownership-based resolution of the
remembered/owned actor). The shell's `loadSelectableActors()` `$effect` seeds the store first (and
already falls back to the first PC + re-persists), so by the time the gathering tab fetches, the store
id is normally already populated — the gathering first-load sync should rarely fire and is a
**backstop**.

When it does fire, `GatheringView` adopts `listing.selectedActorId` **only if both**:

1. the bar store's `selectedActorId` is still empty (one-time, on empty seed), AND
2. `listing.selectedActorId` is **present in the bar's `selectableActors`** (it is a player character).

If `listing.selectedActorId` is an owned non-PC (not in the bar list), the store does **not** adopt it
and instead keeps its own fallback (first PC + re-persist). The backstop must be **idempotent**: it
adopts at most once and must not ping-pong — after adoption (or after the store's own fallback) the
store is authoritative and the gathering fetch `$effect` re-runs on `store.selectedActorId`.

## Popover (search + listbox, rendered in-place)

`ActorSelectTopBar.svelte` borrows `IconPicker.svelte`'s interaction model (search input over a
`role="listbox"`, focus-on-open, outside-click/Escape dismiss) but renders the popover **in-place**
inside the bar rather than portaling it:

- `dismissOnOutsideClick` action on the bar root (`pickerRoot`); because the popover is a descendant
  of `pickerRoot`, the action's `node.contains` check distinguishes inside vs. outside clicks
  reliably without an `additionalNodes` portal escape hatch.
- focus-on-open effect; `searchTerm` `$state` + a `$derived` filtered list.
- `role="listbox"` of options; here each option is a **portrait + name** row, filtered
  case-insensitively by name.

### Popover positioning (player app)

The popover is positioned with plain CSS rather than the `computeIconPickerPopoverLayout` /
`portal` machinery (which existed to escape manager table overflow contexts that the player app does
not have):

- `position: absolute; top: calc(100% + 6px); left: 0` on the popover, anchored to the
  `position: relative` `.actor-bar-left` so it always drops **directly below the trigger,
  left-aligned**.
- The bar root drops `overflow: hidden` so the in-place popover can overflow the bar downward; bar
  children keep `min-width: 0` + ellipsis for horizontal safety. No ancestor between the bar and the
  app root clips it (`.fabricate-app-main` is `overflow: visible`; `.fabricate-app-content` is a
  sibling below, not an ancestor).
- A bounded `max-height` (`min(60vh, 420px)`) with the options list scrolling (`overflow-y: auto`,
  `flex: 1 1 auto; min-height: 0`).

Rendering in-place (no portal) also guarantees the component's scoped styles apply identically to the
trigger and the popover rows, so the portrait sizing cannot diverge between them.

### Accessibility (matches the reused IconPicker, no over-claim)

The bar reuses IconPicker's interaction model exactly and claims **only** what that code provides:

- `role="dialog"` popover with `aria-label` (`DialogLabel`); trigger has `aria-haspopup` /
  `aria-expanded`.
- `role="listbox"` with `role="option"` rows.
- **Tab-through** option buttons (each option is a focusable button), **Escape / outside-click**
  dismiss, and **focus-on-open** moving focus to the search input.
- It does **NOT** claim listbox arrow-key roving focus or `aria-activedescendant` — the reused
  IconPicker pattern does not implement those, so the spec must not assert them.

### Portrait fallback and truncation

- **Null/missing portrait** (`img === null`/empty): render a neutral fallback icon (e.g.
  `fa-user`/silhouette) instead of an `<img src="">`. The portrait is decorative — mark it
  `aria-hidden`, and the option/trigger uses the **actor name** as the accessible label / `alt`.
- **Long names**: trigger label and option rows truncate with `text-overflow: ellipsis` (with
  `overflow: hidden` / `white-space: nowrap`) and expose the full name via `title`.
- **Zero selectable actors**: the trigger renders **disabled** with a placeholder portrait + label,
  and the popover (if opened) shows the `NoActors` empty state.

### Overriding the host's `button` defaults

Both the trigger and the option rows are `<button>`s, and Foundry's global `button` styling centers
content (`justify-content: center`) and pins a fixed height. The scoped styles therefore explicitly
set `justify-content: flex-start` (portrait + name **flush-left**, as requested) and
`height: auto` + a `min-height` sized for the 40px portrait (so the portrait is contained, not
overflowing a short button). Option rows also set `width: 100%` so they fill the popover rather than
shrinking to content.

Left side: portrait + caret trigger. Right side (gathering tab only, gated on `activeTab ===
'gathering'`): weather, time-of-day, and region, each a **fixed icon** + value (no text category
labels). The icons match the GM gathering-settings UI exactly — `fas fa-cloud-sun` for weather,
`fas fa-clock` for time of day (the shared `WEATHER_FALLBACK_ICON` / `TIME_OF_DAY_FALLBACK_ICON`,
equal to the manager's `defaultConditionIcon(kind)`), and `fas fa-map-location-dot` for region —
**not** per-value icons. The value label remains dynamic (e.g. "Clear", "Dusk", the region name, or
the relevant `Unknown` / `None` fallback). Scoped
`<style>` uses only base `--fab-*`
tokens and supports both themes (no `.fabricate-manager`-scoped `--fab-mv2-*` tokens — the player app
is `.fabricate-app`-scoped).

### Right-side render states and narrow resize

- **Missing `conditions.timeOfDay`**: fall back to the `fa-clock` icon
  (`TIME_OF_DAY_FALLBACK_ICON`) + the `TimeOfDay.Unknown` label.
- **`region === ''`** (no environment selected): show the `Region.None` neutral placeholder; never
  fabricate a region name.
- **Narrow resize**: when the window is dragged narrow, the region / time-of-day cluster truncates or
  wraps gracefully; the actor trigger stays usable and there is **no horizontal overflow** (the bar
  does not push the content wider than `.fabricate-app-content`).

### Layout: `.fabricate-app-main` vertical flex column

The new `.fabricate-app-main` wrapper is a **vertical flex column** (`display: flex; flex-direction:
column`) so the gathering body's `height: 100%` 3-column grid keeps a bounded parent and does not
collapse or double-scroll:

- the bar is `flex: 0 0 auto` (intrinsic height), and
- `.fabricate-app-content` is `flex: 1 1 auto; min-height: 0` (the `min-height: 0` lets the inner
  `height: 100%` grid size against the remaining space instead of overflowing).

## Shared time-of-day icon util

The time-of-day icon map is currently a non-exported const inside `adminStore.js` (~lines 117-127,
the `timeOfDay` block of the gathering condition icons, with the `'fas fa-clock'` fallback). The bar
needs it too, so it is extracted with **no behavior change**:

### `src/ui/svelte/util/gatheringConditionIcons.js` (new)

- `TIME_OF_DAY_ICONS` — `{ dawn: 'fas fa-cloud-sun', day: 'fas fa-sun', dusk: 'fas fa-cloud-moon',
  night: 'fas fa-moon' }`.
- `TIME_OF_DAY_FALLBACK_ICON` — `'fas fa-clock'`.
- `getTimeOfDayIcon(id)` — map lookup with fallback.
- `getTimeOfDayLabelKey(id)` — i18n key (`FABRICATE.App.ActorBar.TimeOfDay.{id}`, `Unknown` fallback).

`adminStore.js` imports the extracted map so its existing behavior and tests stay green.

## Shell / view wiring

- `src/ui/SvelteFabricateApp.svelte.js` — `_buildServices()` adds `listSelectableActors`,
  `getSelectedActorId`, `setSelectedActorId`, `getGatheringConditions`; then
  `services.actorBar = createActorBarStore({ services })`.
- `src/ui/svelte/apps/FabricateAppRoot.svelte` — render
  `<ActorSelectTopBar store={services.actorBar} {activeTab} />` above the content in a new
  `.fabricate-app-main` vertical flex column (see layout rules above); add an `$effect` calling
  `loadSelectableActors()` + `refreshConditions()`. The bar exposes a **stable state selector**
  `data-actor-bar-state` (`loading` → `ready`) flipping to `ready` once `selectableActors` and
  `conditions` have loaded, for the smoke harness wait set.
- `src/ui/svelte/apps/gathering/GatheringView.svelte` — read `store = services.actorBar` (all uses go
  through `store?.` optional chaining so existing tests with no `services.actorBar` stay green);
  `load()` passes `{ rememberedActorId: store?.selectedActorId ?? null }`; the fetch `$effect` re-runs
  on `store.selectedActorId`; an `$effect` reports `setRegion(selectedEnvironment?.region ?? '')`;
  the first-load **backstop** calls `store.selectActor(listing.selectedActorId)` **at most once** and
  **only when** the store id is empty AND `listing.selectedActorId` is present in
  `store.selectableActors` (a player character) — otherwise it leaves the store's own fallback in
  place (no ping-pong).

## i18n — `lang/en.json`

Add a `FABRICATE.App.ActorBar.*` block: `Trigger`, `SearchPlaceholder`, `SearchLabel`, `NoActors`,
`DialogLabel`, `Region.Label`, `Region.None`, `TimeOfDay.Label`, `TimeOfDay.{dawn,day,dusk,night}`,
`TimeOfDay.Unknown`, plus a `PortraitFallbackAlt` (or reuse the actor name as the accessible label for
the neutral fallback portrait when `img` is null/empty). The neutral fallback portrait icon is a
Font Awesome class (e.g. `fa-user`), no new asset.

## Tests (node:test + happy-dom, compile-to-temp pattern)

Mirror `tests/components/gathering-environments-mounted.test.js`:

1. `tests/util/gathering-condition-icons.test.js` — icon map lookups, fallback, label keys.
2. `tests/stores/actor-bar-store.test.js` — seed-from-setting; fallback-to-first + re-persist;
   **stale persisted id** (present-but-not-in-PC-list, e.g. owned non-PC) also falls back +
   re-persists; **empty PC list** → no selection, no persist, no throw (do not index
   `selectableActors[0]`); `selectActor` persists; re-entry guard (`loaded` prevents a second
   `loadSelectableActors()` from clobbering a deliberate `selectActor`); `setRegion`;
   `refreshConditions`.
3. `tests/components/actor-select-top-bar-mounted.test.js` — portrait+caret trigger, popover search
   filters by name, listbox selection calls `selectActor`, gathering-only region/time-of-day right
   side hidden on other tabs; **null/empty `img`** renders the neutral fallback (no `<img src="">`);
   long-name ellipsis + `title`; **zero actors** → disabled trigger + `NoActors` empty state;
   right-side **missing `timeOfDay`** → `fa-clock` + `TimeOfDay.Unknown`, **`region === ''`** →
   `Region.None`. Popover focus assertion drains a microtask (`await tick()`) because IconPicker uses
   `queueMicrotask(() => searchInput?.focus())`; if happy-dom focus is unreliable, assert
   popover-open + search-input presence instead.
4. Extend the gathering view mounted test — actor change re-fetches `listGatheringForActor` (mutate
   `store.selectedActorId`, then `flushSync()` + double `await tick()`, and assert the fetch
   call-count, mirroring `tests/components/gathering-detail-mounted.test.js` `calls.list`, so there is
   no spurious mount-time double fetch); region reported to the store; **regression**: a GatheringView
   mounted with a `services` bag that has **no `actorBar`** still mounts and fetches (the `store?.`
   guards keep existing tests green unmodified); first-load backstop adopts `listing.selectedActorId`
   **once** and **only** when present in `selectableActors`, never re-adopting on later fetches.
5. Selectable-actors service test — owned (player) / all (GM) AND `isPlayerCharacterActor`
   (`type === 'character'`); an owned non-PC stays attempt-authorized but is absent from the bar list;
   redaction assertion that records contain **only** `{ id, uuid, name, img }`; `rememberedActorId`
   default injection from `LAST_GATHERING_ACTOR` and explicit override. The test routes through the
   **same injected-dependency boundary** as `tests/gathering-engine-listing.test.js` (inject
   `getSelectableActors`/`isActorSelectable`/`localize`/settings accessors) so it runs under
   `node:test` without touching `game.settings`/`game.actors`.

## Validation gates

`npm test` and `npm run build`. UI-touching, so the PR will later need smoke screenshots (out of
scope for the change docs).

## Risks / edge cases

- **Predicate confusion**: keeping the player-character concept out of
  `isGatheringActorSelectableByUser` is load-bearing — a test asserts an owned non-PC actor is still
  attempt-authorized while absent from the bar's selectable list.
- **Engine/bar divergence**: the engine resolves `rememberedActorId` against its **ownership** list,
  so a legacy persisted owned-non-PC id makes the engine gather as that actor on the first fetch; the
  store converges by falling back to the first PC + re-persisting. Single-source-of-truth holds
  **after convergence** (see convergence contract).
- **Empty PC list**: `loadSelectableActors` must not index `selectableActors[0]` when the list is
  empty (crash risk) — no selection, no persist, no throw.
- **Fallback re-persist loop**: `loadSelectableActors` must re-persist exactly once on empty/stale
  ids; guard with `loaded` to avoid clobbering a deliberate selection on re-entry.
- **First-load backstop**: only adopt `listing.selectedActorId` when the store id is empty AND the id
  is present in the bar's `selectableActors`, else the store/listing can ping-pong on every fetch or
  the bar can adopt an owned non-PC.

## Docs to update (docs loop)

- JSDoc on the new `main.js` selector/persistence methods and `listGatheringForActor` injection.
- JSDoc on the `actorBarStore` factory and the extracted icon util.
- Any player-app surface doc that enumerates the unified-window chrome (note the shared top bar).

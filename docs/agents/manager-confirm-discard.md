# Manager Confirm-Discard Architecture

Every editor in the Crafting System Manager (component, essence, environment, gathering task, gathering hazard, tools) guards an unsaved draft on route exit. The pattern is three layers; new editor kinds MUST mirror it rather than reach for `globalThis.confirm()` or thread callbacks through `services` directly.

## The three layers

**1. Svelte layer — `src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte`**

Each kind has a `confirm{Kind}RouteExit(nextView)` function. Each early-returns `true` when the view isn't this kind or the local dirty flag is false, then calls the matching store helper. An orchestrator `confirmRouteExit(nextView)` chains all of them; it's what every "Back to …" / nav-click handler invokes.

Helpers today:

- `confirmEnvironmentRouteExit`
- `confirmEssenceRouteExit`
- `confirmComponentRouteExit`
- `confirmGatheringTaskRouteExit`
- `confirmGatheringHazardRouteExit`
- `confirmToolsRouteExit`

Each pairs with a `finish{Kind}RouteExit` that calls `store.cancel{Kind}Draft?.()` to actually clear the draft *after* the user confirms.

**2. Store layer — `src/ui/svelte/stores/adminStore.js`**

Each kind has a `confirmDiscardDirty{Kind}Draft()` async helper exported on the store. It calls `services.confirmDialog?.({ title, content, yes, no })` and returns the boolean. Shared title + button labels live under `FABRICATE.Admin.Manager.DiscardDirty*` in `lang/en.json`; kind-specific body strings live under each kind's namespace.

A shared inner factory `_confirmDiscardDirtyDraft(contentKey, contentFallback)` produces the dialog options for the four kinds whose dirty state lives in Svelte (component, essence, gathering-task, gathering-hazard). The two kinds whose dirty state lives in the store (environment, tools) wrap the same factory with their own dirty-check + dedup lock.

**3. Foundry layer — `src/ui/svelte/util/foundryBridge.js`**

`services.confirmDialog` is wired to `foundry.applications.api.DialogV2.confirm`. In tests, `services.confirmDialog` is absent and the store helpers are stubbed directly on the test fixture — the Svelte layer never knows the difference.

## Recipe — adding a new editor kind

1. Add a `confirmDiscardDirty{Kind}Draft()` helper in `adminStore.js` next to the existing ones, using the shared `_confirmDiscardDirtyDraft` factory with kind-specific body strings.
2. Export it on the store API (the big return-object near the bottom of `adminStore.js`).
3. Add a `confirm{Kind}RouteExit(nextView)` function in `CraftingSystemManagerRoot.svelte` and chain it through `confirmRouteExit`.
4. Wire the editor's Back / Cancel button to a `backTo{Browser}Browse` or `cancel{Kind}Edit` handler that runs `afterTruthyResult(confirmRouteExit(nextView), () => { activeView = ... })`. Never call `store.cancel{Kind}Draft?.()` directly — that bypasses the prompt.
5. Update the test fixture in `tests/components/manager-mounted.test.js` (~line 738) with a stub for the new helper.

## Anti-patterns to avoid

- Adding `globalThis.confirm(message)` as a fallback "in case DialogV2 isn't available". DialogV2 is always present in Foundry; missing-DialogV2 means a test environment that should stub the store helper anyway.
- Adding a `services?.confirmDiscard{Kind}Draft?.()` seam that nothing wires up in production. Use the store helper or extend it.
- Skipping the dirty check at the Svelte layer and relying solely on the store helper. The Svelte layer is the source of truth for which view is active and whether its draft is dirty; the store helper just asks the user.

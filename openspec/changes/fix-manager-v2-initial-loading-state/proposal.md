# Fix Manager V2 Initial Loading State

## Problem

Manager V2 starts with an empty `viewState.systems` array before `adminStore.refresh()` has finished. The systems browser currently treats that transient state as confirmed empty data, so GMs can briefly see "No crafting systems yet" even when systems are still loading.

No GitHub issue number was supplied for this scoped task; `gh issue list --search "Manager V2 initial loading state" --limit 10` returned no matching issue.

## Scope

In scope:

- Add explicit `adminStore` refresh state to `viewState`: loading, loaded, and error.
- Keep the systems empty state hidden until a refresh succeeds and confirms there are no systems.
- Render a localized loading state and localized refresh error state in the Manager V2 systems library.
- Add focused store and mounted Svelte tests for initial, successful empty, and failed refresh states.

Out of scope:

- Changing Manager V2 routing, feature gates, or non-system empty states.
- Changing Foundry runtime adapters or persistence behavior.
- Styling beyond reusing the existing empty-state shell and icons.

## Affected Files

- `src/ui/svelte/stores/adminStore.js`
- `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte`
- `lang/en.json`
- `tests/stores/adminStore.test.js`
- `tests/components/manager-v2-mounted.test.js`

## Verification

- Focused node tests for `tests/stores/adminStore.test.js`.
- Focused mounted component tests for `tests/components/manager-v2-mounted.test.js`.
- Full `npm test` and `npm run build` when feasible after implementation.

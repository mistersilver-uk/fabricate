# Proposal: Fix Manager V2 Ready Empty State

## Problem

Manager V2 can be opened during Fabricate startup while the recipe and crafting system managers exist but have not finished loading persisted data. During that window `getSystems()` may return an empty array, causing Manager V2 to render `No crafting systems yet` even though persisted crafting systems are still loading.

## Scope

- Treat unready Fabricate services as a loading state in the admin store.
- Refresh the admin store once Fabricate emits `fabricate.ready`.
- Defer direct Manager V2 opens until Fabricate is ready.
- Render Manager V2 loading copy instead of the true no-systems empty state while services are unready.
- Update the canonical UI specification and regression tests.

## Out of Scope

- Changing crafting system, recipe, import/export, or gathering data normalization.
- Adding migrations.
- Changing the true empty state for worlds that have zero systems after initialization.

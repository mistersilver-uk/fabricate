## Summary

Gate the GM Manager V2 `Recipes` route behind the existing `fabricate.experimentalFeatures` world setting.

## Motivation

Manager V2 recipe browsing is present in the current shell, but the experimental route should not be generally active while the v2 manager route set is still being staged. The rail should still advertise planned `Recipes`, `Rules`, and `Graph` work with the existing `Soon` placeholder treatment when experimental features are disabled.

## Scope

- Read `fabricate.experimentalFeatures` through the admin store and expose it to `CraftingSystemManagerRoot.svelte` view state.
- When experimental features are disabled, render `Recipes`, `Rules`, and `Graph` as disabled `Soon` rail items and prevent direct recipes route entry.
- When experimental features are enabled, render `Recipes` as the implemented route with count, browser content, inspector, and recipe actions.
- Keep `Rules` and `Graph` as disabled `Soon` rail items in both states.
- Update mounted and source-contract tests for disabled and enabled flag behavior.

## Out of Scope

- Registering or changing the `fabricate.experimentalFeatures` setting.
- Implementing active Manager V2 `Rules` or `Graph` route content.
- Live-reacting already-open manager windows when the world setting changes.

## Design

`createAdminStore()` already receives the Foundry edge `services.getSetting()` callback. The store will publish `experimentalFeaturesEnabled` in `viewState`, initialized from `services.getSetting('experimentalFeatures') === true` and refreshed alongside system, recipe, gathering, and graph data.

`CraftingSystemManagerRoot.svelte` will derive `recipesRouteEnabled` from that view-state field. Route normalization and `setView()` will use that derived flag so attempts to enter `recipes` while disabled resolve back to the selected system's `system-edit` route. The selected-system rail will render the active Recipes button only when `recipesRouteEnabled` is true; otherwise `recipes` joins `rules` and `graph` in the placeholder rail list with the existing disabled `Soon` badge treatment.

The root already renders `Rules` and `Graph` through `placeholderViews`; this change keeps those entries in that list regardless of the experimental flag. `RecipesBrowserView`, recipe header actions, and the selected-recipe inspector remain guarded by `currentView === 'recipes'`, which cannot be reached while disabled.

## Local Development Behavior

Local development reads the current world setting through the injected manager app service. With the setting disabled or missing, the manager shows `Recipes`, `Rules`, and `Graph` as disabled `Soon` rail items. With the setting enabled, the Recipes route behaves as the current implemented browser route.

## CI Behavior

CI component tests use explicit test-store view-state values so disabled and enabled route behavior is deterministic. No CI-only setting override is required.

## Risks

- Existing tests that assumed Recipes was always active need to opt into the experimental flag where they exercise the recipe browser.
- Direct route state normalization must use the same flag as the nav, or hidden active content could be reachable after a stale `activeView` value.

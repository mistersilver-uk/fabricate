# Design: Manager V2 Recipe Status Toggle

## Boundary Decision

The change belongs in `RecipesBrowserView.svelte`. The root already delegates recipe enabled updates to the existing admin-store callback, and persistence remains owned by `store.toggleRecipeEnabled`. The browser view only needs to render the same compact button used by systems and environments and pass the next enabled state.

## UI Pattern

Recipe rows keep a `Status` column. The cell uses `manager-v2-status-cell` for shared alignment and renders:

- `button.manager-v2-status-toggle`
- `is-on` when `recipe.enabled !== false`
- `is-off` when `recipe.enabled === false`
- `aria-pressed={recipe.enabled !== false}`
- `manager-v2-status-toggle-track`
- `manager-v2-status-toggle-knob`
- `manager-v2-status-toggle-label`

The visible label uses the existing shared `StatusOn` and `StatusOff` copy so recipes match systems and environments exactly.

## Accessibility

The button uses recipe-specific localized aria labels:

- `FABRICATE.Admin.ManagerV2.Recipe.EnableNamed`
- `FABRICATE.Admin.ManagerV2.Recipe.DisableNamed`

The control stops click and keydown propagation for parity with row-based systems and environments behavior.

## Styling

No recipe-only toggle CSS is introduced. Recipe rows opt into the existing shared status-cell alignment selector. Existing recipe grid widths are retained because the shared toggle is capped at 64px and fits the current status column.

## Risks

- A source-only assertion could miss a mounted rendering regression, so mounted tests assert actual `aria-pressed` and On/Off copy.
- Reusing active/disabled copy would keep the old checkbox semantics visible, so the row label must use shared On/Off copy.

# Proposal: Manager V2 Recipe Status Toggle

## Problem

Manager V2 systems and environment browser rows use a compact on/off status toggle button, while recipe browser rows still render enabled state with a checkbox-style label. This creates a different visual language for the same status interaction inside the same management shell.

No GitHub issue number was provided for this task, so there is no issue read before implementation.

## Scope

- Replace recipe browse row enabled checkboxes with the shared `manager-v2-status-toggle` button markup.
- Preserve the existing `Status` column, recipe table geometry, and `store.toggleRecipeEnabled` persistence path.
- Add recipe-specific enable/disable aria-label localization.
- Update source, mounted, layout, and contract tests for the shared toggle pattern.
- Update the canonical UI integration spec for Manager V2 recipe browse status behavior.

## Out Of Scope

- Recipe persistence behavior, validation, filtering semantics, and editor behavior.
- New dependencies.
- Runtime Foundry API changes.
- Quick-start documentation changes.

## Acceptance Criteria

- Recipe browse rows render `button.manager-v2-status-toggle` with track, knob, and On/Off label.
- Enabled recipes use `is-on`, disabled recipes use `is-off`, and `aria-pressed` reflects the enabled state.
- Toggling a disabled recipe calls the existing recipe toggle callback with `(recipe.id, true)`.
- Recipe status toggle click and keydown events do not leak into row-level handlers.
- Systems, environments, and recipes share the same status toggle CSS treatment.

## Verification Plan

- `node --test tests/components/manager-v2-mounted.test.js tests/components/manager-v2-contract.test.js tests/components/manager-v2-layout.test.js`
- `npm test`
- `npm run build`

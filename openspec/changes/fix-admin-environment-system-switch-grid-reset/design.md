# Design: Admin Environment System Switch Grid Reset

## Boundary Decision

The behavior belongs at the `EnvironmentsTab.svelte` view-state boundary unless implementation shows the tab lacks enough input to identify selected-system changes. The tab already owns `editorOpen`, while `adminStore` owns environment lists, selected drafts, dirty confirmation, and persistence callbacks. Keep that split: store data changes should not implicitly mean "show editor" unless the user explicitly selects, creates, or duplicates into an editor flow.

If the tab cannot robustly detect the system transition from existing props, pass a narrow `selectedSystemId` or `environmentScopeId` prop from `RecipeManagerRoot.svelte` to `EnvironmentsTab.svelte`. Prefer this explicit prop over deriving intent from the first environment ID or draft ID.

The implemented seam uses `environmentDraft.craftingSystemId`, which is already part of the gathering environment data model, to identify real system-scope changes. The reset requires both the previous and next draft system ids to be present so same-system fixture/card draft replacement does not close an explicitly opened editor.

## Expected State Flow

1. User is on system A with `Environments` active.
2. User opens an environment editor, setting local `editorOpen = true`.
3. User selects system B.
4. `adminStore.selectSystem` confirms dirty-discard when needed, updates selected system, clears/rebuilds environment draft state, and refreshes view state.
5. `EnvironmentsTab` detects the selected-system/scope change and resets local browse/editor mode to grid.
6. Direct user actions in the new scope can open the editor again.

## Structural Constraints

- Do not move dirty-draft confirmation into Svelte components.
- Do not make `adminStore` reach into component-local state.
- Do not add global events or Foundry runtime lookups for this reset.
- Keep constructors/factories boring; no new service/container object is needed.
- Keep presentational environment card components prop-driven and free of Foundry globals.

## Test Seams

- Mounted Svelte test: render `EnvironmentsTab` with a system A draft, open the editor, update props to represent system B, and assert the grid is visible with system B cards.
- Root/contract test: if a scope prop is added, assert `RecipeManagerRoot.svelte` passes the selected system ID into `EnvironmentsTab`.
- Store test only if behavior changes there: assert system switching clears selected environment draft state or preserves dirty-confirm semantics exactly as intended.
- Store behavior is unchanged for this fix; existing store tests remain the dirty-confirmation coverage.

## Risks

- Resetting editor state on every `environmentDraft` change would break explicit card selection, duplicate, save, or create flows. The reset must key off selected-system/scope changes, not arbitrary draft replacement.
- A source-only test could miss the real interaction regression. At least one mounted test should exercise prop updates after editor open.
- Dirty draft behavior is user-protective; do not bypass or weaken the existing confirmation path.

## UI Review Gate

Because this touches user-facing Svelte behavior, final sign-off should include a UX review gate. The reviewer should confirm the post-switch first state, editor re-entry, Back behavior, and visible controls across normal and narrow admin widths.

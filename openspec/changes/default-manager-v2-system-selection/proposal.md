# Default Manager V2 System Selection

## Problem

The manager-v2 systems browser currently has an unselected state when crafting systems exist. In that state, selected-system navigation is hidden and the rail scope can clear the store selection. This adds little utility because most manager-v2 work is scoped to a crafting system.

## Proposed Change

When at least one crafting system exists, manager-v2 should always have a selected system. The systems browser remains available as the System library view, but returning there must preserve the selected system and selected row.

Replace the selected-system rail clear action with a dedicated Return to System Library icon button. The selected system name in the rail becomes static scope text instead of a button.

## In Scope

- Default to the first available crafting system when the persisted selected system is empty.
- Preserve the existing stale-selection fallback to the first available system.
- Replace the manager-v2 rail clear-selection affordance with a return-to-library route.
- Update localization, canonical spec text, and focused tests.

## Out of Scope

- Redesigning the systems table, inspector, breadcrumbs, or selected-system feature views.
- Changing crafting system ordering semantics.
- Adding dependencies or changing Foundry compatibility metadata.

## Validation

- `npm test`
- `npm run build`

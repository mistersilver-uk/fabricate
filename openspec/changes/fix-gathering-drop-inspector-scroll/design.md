# Design

## Selected Drop Inspector Layout

When Manager V2 is on `data-manager-v2-view="gathering-task-edit"` and a drop rule is selected, the right inspector uses three vertical regions:

- selected-drop header card;
- full-width divider;
- scrollable content viewport for the drop editor and character modifiers.

The header is no longer sticky. Instead, the inspector itself clips overflow and the new lower viewport owns vertical scrolling. This prevents lower cards from rendering behind the header while keeping the header visible.

## Markup

`CraftingSystemManagerV2Root.svelte` keeps the existing `.manager-v2-drop-inspector-stack` wrapper. The header remains the first child. The drop editor card and character modifier card move into a new `.manager-v2-drop-inspector-scroll` wrapper after a `.manager-v2-drop-inspector-divider` element.

## Styling

The layout is scoped to the gathering task edit route so other Manager V2 inspector uses keep their current scroll behavior. The selected-drop stack uses a definite height and `grid-template-rows: auto auto minmax(0, 1fr)`. The lower viewport uses `overflow-y: auto` and `overflow-x: hidden`.

The existing generic `.is-sticky` styling remains available for any other future inspector card, but the selected-drop header no longer uses that class.

# Manager V2 Essence Edit Layout Design

## Existing Context

The active Manager V2 essence route lives in `src/ui/svelte/apps/manager-v2/EssenceEditView.svelte`. It receives selected essence display data, managed source component options, feature-gated source UI state, and save/drop callbacks from `CraftingSystemManagerV2Root.svelte`.

The right inspector branch for `currentView === 'essences' || currentView === 'essence-edit'` lives in `CraftingSystemManagerV2Root.svelte`. It already owns component edit navigation through `editComponent(itemId)` and component image fallback through `componentImage(item)`.

`src/ui/svelte/stores/adminStore.js` builds `viewState.essenceCards` with `componentUsageCount`, but it does not currently expose the specific component cards that contain each essence.

## Data Shape

Extend each essence display card with:

```js
componentUsageItems: [
  {
    id: string,
    name: string,
    img: string
  }
]
```

This is display-only data derived from managed component/item display data. The usage count remains authoritative for delete blocking. The grid should use the item image fallback already used by Manager V2 components when `img` is missing.

## Layout Decisions

- Keep `EssenceEditView` as the focused route component.
- Replace the current two-row identity grid with a two-column shell:
  - left column: icon preview, icon picker, clear icon button
  - right column: Name field and Description textarea
- Use one CSS custom property for the left column width so preview, picker, and clear button stay aligned.
- Render source controls in a full-width row beneath the identity grid only when `showSourceUi` is true.
- Keep source selector behavior unchanged: picker/drop selects a managed source component; clear submits a source clear only when the source UI is visible and touched.
- Remove the separate Source card so the new source block consumes the space created by moving Description right.

## Inspector Usage Grid

Under Usage:

- Keep the existing component count row.
- If `componentUsageItems.length > 0`, render a `manager-v2-essence-usage-grid`.
- Use buttons containing only `img` elements.
- Set each button `title` and `aria-label` to the component name.
- Clicking a thumbnail calls `editComponent(component.id)`.
- Keep the grid compact and scrollable with stable square cells so it does not dominate the inspector.

When no components contain the essence, render no image grid; the count row is sufficient.

## UX Acceptance

- Normal Manager V2 width: icon column and field column align without horizontal overflow.
- Narrow Manager V2 width: identity columns stack, and the source selector/copy stack cleanly.
- Source selector remains a square drop target with active drag feedback.
- Usage grid shows image-only cells, has no visible component names, and scrolls when many components use the essence.
- Thumbnail hit targets remain at least 34px square.

## Affected Files

- `src/ui/svelte/apps/manager-v2/EssenceEditView.svelte`
- `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte`
- `src/ui/svelte/stores/adminStore.js`
- `styles/fabricate.css`
- `lang/en.json`
- `tests/components/manager-v2-mounted.test.js`
- `tests/components/manager-v2-layout.test.js`
- `tests/stores/adminStore.test.js` or another focused store test if a better local fixture exists

## Review Gate

An implementation reviewer should check:

- source UI is still feature gated by `effectTransfer`
- usage thumbnails only include components containing the selected essence
- clicking usage thumbnails routes to the component edit callback, not mere selection
- no stale Basic information card remains in the essence inspector
- CSS uses manager-v2 scoped selectors and avoids unscoped generic state classes

# Design

## Data Flow

`CraftingSystemManagerV2Root.svelte` already derives `itemCards` from the admin store view state. The gathering task edit route passes those cards to `GatheringTaskEditView.svelte` alongside the existing managed item options. The editor continues to use managed item options for drop-row labels and inspector compatibility, while the new browser uses `itemCards` for richer display fields.

## Browser State

The component browser owns independent local state:

- component name search text
- component tag search text
- selected component tags
- component page index
- fixed component page size of `6`

Filtering is intentionally narrow: name search checks only `item.name`, and selected tags use an all-tags match against `item.tags`. Tag suggestions are derived from the current component cards and exclude already-selected tags.

## Drag And Drop

Each component card is draggable and writes a `text/plain` JSON payload:

```json
{ "type": "FabricateManagedComponent", "componentId": "<item id>" }
```

Drop-rule rows use the existing Svelte `dragDrop` action so Foundry drag parsing stays centralized. When the parsed payload is a managed component payload, the editor calls:

```js
onUpdateDrop(row.id, { componentId, itemUuid: '', systemItemId: '', name: '', enabled: true })
```

All other parsed payloads continue through `onImportDrop(row.id, data)`.

## Layout

The task editor grid gains a bounded component browser row between task availability and drop rules. The browser card uses a compact header, filter row, fixed two-row card viewport, and local pagination footer. The grid is three columns at normal widths and collapses only under the existing Manager V2 container breakpoints.

Drop-rule rows remain full-row drop targets, including already-populated rows. Right-click-to-clear remains scoped to the component button and is unchanged.

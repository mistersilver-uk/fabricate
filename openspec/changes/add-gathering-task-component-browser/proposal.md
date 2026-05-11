# Add Gathering Task Component Browser

## Why

Gathering task drop rows can be edited, but assigning existing managed components still relies on the inspector selector or external item drops. GMs need a compact in-editor component browser so they can scan available components and drag them onto any drop rule row.

## What Changes

- Add a component browser section to the Manager V2 gathering task editor above Drop Rules.
- Pass Manager V2 `itemCards` into the task editor so the browser can show component name, image, description, and tags.
- Keep component browser search, tag filters, and pagination separate from drop-rule search and pagination.
- Render draggable managed component cards and allow dropping them onto any drop rule row.
- Preserve existing Foundry/import drop handling for non-managed-component drag payloads.
- Keep drop rules visible by bounding the new browser and the existing drop rules card with internal scroll regions.
- Increase the Manager V2 default window height and gathering editor card heights so drag/drop has enough vertical room.
- Default gathering task drop-rule pagination to five rows.
- Render selected component tag filters as removable pills.
- Remove right-inspector component assignment so drop rows are assigned through drag/drop, and align the inspector chance/count controls with row controls.

## Scope Notes

- The browser only assigns an existing managed component to a drop row; it does not create components or edit component metadata.
- Component tag filtering requires all selected tags to match.
- Component name search matches component names only.

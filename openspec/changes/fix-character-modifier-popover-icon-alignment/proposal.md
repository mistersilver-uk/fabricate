# Fix Character Modifier Popover Icon Alignment

## Why

The Manager V2 gathering task editor's character modifier add-search suggestions render icons incorrectly inside the search popover. A selector-only fix that changed `.manager-v2-search i` to `.manager-v2-search > i` is already present locally, but it was not verified against rendered geometry and is too shallow to trust as the final fix.

## What Changes

- Revert the current failed selector-only attempt in `styles/fabricate.css` and its related selector-presence assertions in `tests/components/manager-v2-layout.test.js`.
- Build a disposable Playwright harness under an ignored temp path to render the availability menu and character modifier tag suggestions side-by-side with the real `styles/fabricate.css`.
- Inspect screenshot output, bounding boxes, and computed styles to identify the actual layout conflict.
- Apply the smallest verified CSS fix needed to align character modifier suggestion icons without regressing the normal search field leading icon or availability menu icons.
- Add permanent layout regression coverage for the verified behavior.

## Scope Notes

- This is a narrow Manager V2 CSS/layout regression fix.
- No Svelte behavior, gathering data model, runtime resolution logic, localization, public API, or documentation surface should change.
- The disposable harness is investigation-only and must not be committed unless the team explicitly decides to promote it into a permanent test fixture.

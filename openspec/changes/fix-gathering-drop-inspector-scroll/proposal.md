# Fix Gathering Drop Inspector Scroll

## Why

The Manager V2 gathering task edit view currently uses a sticky selected-drop header inside the right inspector's single scroll area. As the lower editor content scrolls, it passes behind the header card and creates visual noise.

## What Changes

- Split the selected-drop inspector into a fixed header region and a separate lower scroll region.
- Add a full-width divider below the selected-drop header card.
- Keep the selected-drop chance, count, condition modifier, and character modifier controls in the lower scroll region.
- Preserve the existing selected-drop actions and empty-drop fallback behavior.

## Scope Notes

- This is a layout-only Manager V2 UI change.
- No gathering data model, runtime behavior, localization, or public API changes are required.

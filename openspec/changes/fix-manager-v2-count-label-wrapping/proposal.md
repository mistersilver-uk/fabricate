# Proposal: Fix Manager V2 Count Label Wrapping

## Summary

Allow the selected-system inspector `Counts` cards in manager-v2 to show their full label text. Labels such as `Recipe categories` must wrap within the card instead of truncating to ellipsized fragments like `Recipe Cateo...`, and the count rows/cards may grow taller to fit the content.

No GitHub issue is assigned for this task.

## Problem

The current manager-v2 selected-system inspector count facts are optimized for a single-line compact layout. The CSS intentionally sets `white-space: nowrap`, hides overflow, and ellipsizes the label span. The layout test also asserts that count facts remain one non-wrapping line.

That behavior makes longer labels unreadable in the right inspector at normal Foundry manager widths. The concrete user-visible failure is a count card displaying text like `5 Recipe Cateo...` instead of the full `5 Recipe categories`.

## Goals

- Show the full count fact labels in the selected-system inspector.
- Permit count labels to wrap at word boundaries.
- Permit count cards and the count grid rows to grow vertically when labels wrap.
- Preserve the numeric count/value emphasis.
- Keep the selected-system inspector contained inside the manager-v2 shell without horizontal overflow.
- Update layout tests so they assert wrapping/full-label behavior instead of the old no-wrap behavior.

## Non-Goals

- Do not redesign the manager-v2 inspector.
- Do not change count derivation, localization keys, selected-system state, or manager-v2 routing.
- Do not alter recipe, component, environment, or feature behavior.
- Do not touch runtime files during planning.
- Do not invent a GitHub issue number.

## Scope

Expected implementation files:

- `styles/fabricate.css`
- `tests/components/manager-v2-layout.test.js`

Read-only context files:

- `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte`
- `openspec/specs/ui-integration/spec.md`
- `openspec/changes/fabricate-ui-design-system-manager-v2/`

The Svelte root is expected to remain unchanged because it already renders value and label as separate inline elements inside `.manager-v2-fact`. If implementation proves the markup prevents accessible wrapping, document the reason before changing it.

## Acceptance Criteria

- The selected-system inspector `Counts` card renders full labels for all current facts: `Components`, `Recipes`, `Gathering environments`, `Essences`, `Item tags`, and `Recipe categories`.
- `Recipe categories` and `Gathering environments` wrap cleanly when needed rather than truncating or clipping.
- Count fact cards may become taller, and the grid row height follows the tallest card in that row.
- No count fact causes horizontal scrolling, overlap, or text escaping from the inspector.
- The disabled gathering count still reads label-first as `Gathering environments Off`, with `Off` retaining value emphasis.
- Focus, row selection, and inspector layout behavior outside the count cards remains unchanged.
- `npm test` and `npm run build` pass after implementation.

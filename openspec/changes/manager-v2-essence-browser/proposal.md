# Manager V2 Essence Browser

## Problem

Manager v2 exposes `Essences` in the selected-system rail when the selected crafting system has `features.essences === true`, but the rail item is still a disabled placeholder. GMs must fall back to the current admin to create, inspect, edit, source-link, and remove essence definitions.

## Proposed Change

Add a real manager-v2 Essence browser page for the selected crafting system. The page should reuse existing admin-store essence persistence, icon normalization, source linkage, and duplicate-name handling while adopting the manager-v2 browser/inspector layout.

Before the browser UI is implemented, resolve the current essence source identity drift: existing UI stores managed component IDs in fields named like item UUIDs, while runtime effect transfer expects a resolvable Foundry UUID. This change must make the manager-v2 source model explicit instead of building a browser on ambiguous fields.

## In Scope

- Replace the disabled `Essences` placeholder with an enabled selected-system nav route when `features.essences === true`.
- Canonicalize the first-slice UI source link as a managed source component reference, preserving legacy aliases for existing data.
- Expose display-only essence cards/evidence for source state and usage counts.
- Render a browser table/list of `selectedSystem.essenceDefinitions`.
- Support create, edit, cancel, save, source item select/drop/clear, and remove flows through existing store actions.
- Include search/filtering and selected-essence inspector evidence.
- Add localized manager-v2 essence copy, styles, tests, and smoke-harness coverage.

## Out of Scope

- Changing recipe essence requirement behavior or component essence assignment behavior.
- Implementing broad cleanup migrations beyond the source-link compatibility normalization needed for this page.
- Redesigning the legacy current-admin essence editor.
- Adding npm dependencies.

## Validation

- `npm test`
- `npm run build`
- Browser/smoke validation for normal and stacked manager-v2 essence layouts, including icon picker and source picker interaction.

# Proposal: Fix Admin Environment Card Hover States

## Problem

The GM crafting admin `Gathering`/`Environments` card grid has two hover regressions:

1. Environment-card action buttons become low-contrast on hover because the dark button chip changes to a clear/translucent fill over scene artwork.
2. Hovering the card image or the name/summary edit target draws outline borders around the image frame and text block, creating distracting transient borders around the card content.

No matching GitHub issue was found with:

```sh
gh issue list --search "environment card hover" --limit 20
gh issue list --search "Gathering Environments hover" --limit 20
```

## Change Slug

`fix-admin-environment-card-hover-states`

## Scope

- Update the GM admin environment-card hover/focus visual treatment in `styles/fabricate.css`.
- Keep card action buttons readable over linked scene imagery and fallback icons during hover and keyboard focus.
- Remove hover/focus border or outline effects from the card image edit target and card name/summary edit target.
- Preserve accessible keyboard focus indication with a non-border treatment, such as a stable shadow, tint, underline, or other highlight that does not outline the image frame or text block.
- Preserve the existing card layout, action locations, icon choices, labels, pointer targets, and menu behavior.
- Add or update focused CSS/source coverage and mounted/browser checks for the card hover states.
- Include visual validation with representative cards that use a linked scene image and a fallback icon.

## Out Of Scope

- Runtime gathering behavior, environment persistence, validation, scene gating, or player `Gathering` app behavior.
- Redesigning the environment card grid, editor workflow, action menu model, or responsive layout.
- Changing localized copy or adding new localization keys unless implementation discovers an existing hard-coded label bug.
- Quick-start documentation, README/runtime docs, compatibility metadata, or Jekyll docs.
- Adding npm dependencies.
- Reworking unrelated existing changes in `src/ui/svelte/apps/EnvironmentsTab.svelte`, `styles/fabricate.css`, tests, or other dirty files.

## Affected Files

Expected implementation files:

- `styles/fabricate.css`
- `tests/components/environments-tab-contract.test.js`
- `tests/components/environments-tab-mounted.test.js`

Possible verification-only or harness files if live browser checks need more coverage:

- `scripts/foundry-test-run.mjs`
- Existing Playwright/Foundry harness files only if they already own GM admin screenshot setup.

Implementation should not need Svelte markup changes. If the CSS cannot preserve keyboard focus affordance without class or DOM support, the implementer must stop and update this plan before touching component markup.

## Acceptance Criteria

- Hovering or focusing environment-card icon buttons keeps a readable filled chip; the hover state must not become visually clear/transparent over card imagery.
- Hovering or focusing `.environment-card-image-action` does not draw a border, outline, or ring around the image frame.
- Hovering or focusing `.environment-card-name-action` does not draw a border, outline, or ring around the environment name/summary block.
- Keyboard users still receive a visible focus indication on card image, name/summary, and icon-button controls.
- Active selected-card styling remains intact and is the only card-level border emphasis introduced by selection.
- Linked scene images remain clipped to the image frame; fallback icons still render centered and readable.
- Overlay edit/toggle/delete/menu controls remain visible, aligned, and clickable.
- The overflow action menu still opens above the image area without clipping and keeps its own menu-item hover state.
- Normal and narrow GM admin widths show no text clipping, button overlap, or scroll containment regression.

## Verification Plan

- `node --test tests/components/environments-tab-contract.test.js`
- `node --test tests/components/environments-tab-mounted.test.js`
- Browser pointer and visual checks using the local Vite harness when available, or `npm run test:foundry` when Foundry-backed layout is needed:
  - pointer-hover each card icon button over a linked scene image and verify the button chip remains filled/readable;
  - pointer-hover the image edit target and verify no image-frame border/outline appears;
  - pointer-hover the name/summary target and verify no text-block border/outline appears;
  - keyboard-focus the image, name/summary, and icon buttons and verify focus remains visible without the removed border treatment;
  - click image, name/summary, and edit controls and verify they still open the environment editor;
  - click toggle/delete/menu controls and verify existing action routing is preserved;
  - open the overflow menu and verify menu items remain visible, hoverable, and unclipped.
- `npm test`
- `npm run build`

Use `npm run test:foundry` for final screenshot validation if the local browser harness cannot reproduce the Foundry ApplicationV2 admin shell, overlay stacking, or real image rendering.

## Screenshot Artifacts

Capture screenshots for:

- First visible GM admin `Environments` grid state at normal width with at least one linked scene image and one fallback icon.
- Hovered icon-button state over a linked scene image, proving the button remains readable and aligned.
- Hovered image edit target, proving no transient image-frame border/outline appears.
- Hovered name/summary target, proving no transient text-block border/outline appears.
- Keyboard focus state for image/name or button controls, proving focus remains visible after removing the border-style hover.
- Narrow admin-width grid, proving responsive layout, scroll containment, visible controls, and no clipping/overlap regressions.

## Documentation Expectations

No user-facing documentation update is expected. This is a visual polish fix for an existing GM admin surface and does not change workflow, data model, settings, or quick-start behavior.

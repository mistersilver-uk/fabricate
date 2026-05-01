# Proposal: Fix Admin Environment Card Media Overflow

## Problem

The GM crafting admin `Environments` card image/media frame can overflow the card bounds in the persisted-environment grid. Browser reproduction confirmed the media frame width can become wider than its containing `.environment-card`.

Diagnosis points to `.environment-card-media`: it is a grid item with `width: 100%`, `aspect-ratio: 3 / 2`, and no explicit shrink permission. The card itself has `min-width: 0`, but the media grid item can still honor its automatic minimum size and exceed the available card column.

No matching GitHub issue was found with:

```sh
gh issue list --search "environment card overflow" --limit 20
```

## Scope

- Keep the fix limited to the GM admin environment-card layout.
- Add explicit shrink permission to `.fabricate-admin .environment-card-media`.
- Preserve `overflow: visible` on `.fabricate-admin .environment-card-media` so overlaid action/menu controls are not clipped by the media wrapper.
- Keep clipping on `.fabricate-admin .environment-card-image-frame`, where scene imagery should remain bounded to the image frame.
- Add or update focused layout/test coverage for normal and narrow GM `Environments` grid widths.
- Include real linked-scene imagery coverage in the browser harness so the regression is validated with actual scene image assets, not only fallback icons.

## Out Of Scope

- Runtime gathering behavior, environment persistence, schema, or validation changes.
- Redesigning the GM environment grid, cards, editor, or action menu.
- Changing pointer action semantics for card image, name, edit, toggle, delete, duplicate, or reorder controls.
- Changing quick-start documentation, README, runtime docs, or compatibility metadata.
- Adding dependencies.

## Affected Files

- `styles/fabricate.css`
- `tests/components/environments-tab-contract.test.js`
- Existing browser/Playwright harness files only if needed to verify real linked-scene imagery and measured media/frame bounds.

Do not touch unrelated dirty files or the existing `openspec/changes/fix-admin-environment-system-switch-grid-reset/` work.

## Acceptance Criteria

- Normal-width GM `Environments` grid shows environment cards whose media and image frame stay within each card's horizontal bounds.
- Narrow GM `Environments` grid shows the same no-overflow behavior after responsive layout changes.
- Browser harness coverage uses a real linked-scene image for at least one environment card.
- No `.environment-card-media` or `.environment-card-image-frame` horizontal overflow is measurable relative to its containing `.environment-card`.
- Overlay controls remain visible over the image area.
- The overflow/action menu behavior remains preserved; menus are not clipped by the media wrapper.
- Existing pointer action behavior is preserved for image edit, card name/edit activation, toggle, delete, duplicate, reorder, and menu controls.
- `.fabricate-admin .environment-card-media` still uses `overflow: visible`.
- `.fabricate-admin .environment-card-image-frame` still clips image content with `overflow: hidden`.

## Verification Plan

- `node --test tests/components/environments-tab-contract.test.js`
- Browser harness or Playwright validation for normal and narrow GM admin widths:
  - linked-scene image renders inside the card image frame;
  - media and image-frame bounding boxes do not exceed the card bounding box horizontally;
  - overlay controls remain visible and clickable;
  - overflow menu opens without being clipped by the media wrapper;
  - card image/name/edit pointer actions still open the editor;
  - toggle/delete/duplicate/reorder/menu actions keep their existing behavior.
- `npm test`
- `npm run build`

Use `npm run test:foundry` only if the existing browser harness cannot reproduce the Foundry admin shell layout or reviewer asks for Foundry-backed screenshots.

## Screenshot Artifacts

If screenshot validation runs, capture:

- Normal-width GM `Environments` grid with a linked-scene image and visible overlay controls.
- Narrow GM `Environments` grid with the same card proving media/frame containment.
- Open overflow menu state proving menu visibility is preserved.

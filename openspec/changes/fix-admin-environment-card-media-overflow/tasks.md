# Tasks

## Planning

- [x] Confirm no matching GitHub issue exists with `gh issue list --search "environment card overflow" --limit 20`.
- [x] Read the current dirty diff and changed source/test files before writing this planning handoff.
- [x] Read the relevant environment card DOM, stylesheet selectors, and existing contract-test coverage.
- [x] Keep the planning change isolated to `openspec/changes/fix-admin-environment-card-media-overflow/`.

## Implementation Handoff

- [x] Add explicit shrink permission to `.fabricate-admin .environment-card-media`, using `min-width: 0`.
- [x] Preserve `overflow: visible` on `.fabricate-admin .environment-card-media`.
- [x] Preserve clipping on `.fabricate-admin .environment-card-image-frame` with `overflow: hidden`.
- [x] Update focused source/contract coverage for the media shrink permission and preserved frame clipping.
- [x] Add or update browser harness coverage using real linked-scene imagery in the GM `Environments` grid.
- [x] Verify both normal and narrow GM `Environments` grid layouts have no horizontal media/frame overflow.
- [x] Verify overlay controls remain visible.
- [x] Verify overflow menu behavior remains preserved and menus are not clipped by the media wrapper.
- [x] Verify existing pointer action behavior is unchanged for image/name/edit activation and direct card actions.

## Verification

- [x] `node --test tests/components/environments-tab-contract.test.js`
- [x] Browser harness/Playwright normal-width GM `Environments` grid check with linked-scene imagery.
- [x] Browser harness/Playwright narrow GM `Environments` grid check with linked-scene imagery.
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:foundry`

## Reviewer Checklist

- [x] The implementation is limited to admin environment-card layout and focused test coverage.
- [x] No runtime gathering, persistence, validation, or unrelated UI behavior changed.
- [x] `.environment-card-media` has shrink permission while retaining `overflow: visible`.
- [x] `.environment-card-image-frame` remains the clipping boundary for image content.
- [x] Browser evidence covers normal and narrow grids, real linked-scene imagery, no horizontal overflow, visible overlay controls, preserved overflow menu behavior, and existing pointer actions.

## Validation Results

Validation results on 2026-05-01:

- `git diff --check -- openspec/changes/fix-admin-environment-card-media-overflow styles/fabricate.css tests/components/environments-tab-contract.test.js scripts/foundry-test-run.mjs` passed.
- `node --check scripts/foundry-test-run.mjs` passed.
- `node --test tests/components/environments-tab-contract.test.js` passed.
- `npm test` passed: 2215 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `FOUNDRY_HOST_PORT=30001 FOUNDRY_URL=http://localhost:30001 npm run test:foundry` passed according to `test-results/summary.json`, including the GM Environments browser flow and screenshot capture. The harness process did not stream a final success banner back through the shell session, but the recorded summary is `passed: true` with no errors or console errors.

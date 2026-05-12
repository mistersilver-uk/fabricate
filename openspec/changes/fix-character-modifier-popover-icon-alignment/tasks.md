## 1. Planning

- [x] Create OpenSpec proposal, design, and tasks for the narrow CSS/layout fix.
- [x] Run plan review with `fabricate_ux_designer` and `fabricate_quality_engineer`.

## 2. Baseline Revert

- [x] Verify whether the selector-only CSS attempt from `.fabricate-manager-v2 .manager-v2-search > i` is present in the working tree or branch history.
- [x] Revert the selector-only CSS attempt back to the pre-attempt baseline when present.
- [x] Remove the related selector-only assertions from `tests/components/manager-v2-layout.test.js` when present.
- [x] Confirm no unrelated dirty files were reverted.

## 3. Disposable Harness Investigation

- [x] Create an ignored Playwright harness under `test-results/tmp-popover-harness/`.
- [x] Load the real `styles/fabricate.css` into the harness.
- [x] Render a normal Manager V2 search control, availability menu rows, and character modifier add-search suggestion rows side-by-side.
- [x] Capture baseline screenshots at desktop width.
- [x] Capture baseline bounding boxes and computed styles for search, availability-menu, and suggestion icons.
- [x] Use the captured evidence to identify the real source of icon misalignment.

## 4. CSS Fix

- [x] Apply the smallest verified CSS change in `styles/fabricate.css`.
- [x] Re-run the harness and capture fixed-state screenshots, geometry, and computed styles.
- [x] Verify normal search leading icon alignment still works.
- [x] Verify availability menu icon alignment is unchanged.
- [x] Verify character modifier suggestion icons align with labels and stay in normal row flow.
- [x] Verify suggestion row pointer hit-tests when feasible.

## 5. Permanent Regression

- [x] Add permanent regression coverage based on the verified fix.
- [x] Prefer geometry/computed-style assertions over selector-text assertions.
- [x] Keep any selector-text assertions as supporting coverage only.
- [x] Ensure the disposable harness is deleted or remains ignored and untracked.

## 6. Validation

- [x] Run the targeted permanent regression test.
- [x] Run `node --test tests\components\manager-v2-layout.test.js`.
- [x] Run `node --test tests\components\manager-v2-mounted.test.js`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Record screenshot artifact paths or describe why screenshots were not retained.

Screenshot artifacts were generated under `test-results/tmp-popover-harness/` during diagnosis and removed with the disposable harness before final validation, so no screenshot file is retained in the working tree.

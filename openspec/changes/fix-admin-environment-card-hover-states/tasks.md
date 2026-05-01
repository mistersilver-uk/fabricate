# Tasks: Admin Environment Card Hover States

## Implementation

- [x] Confirm the worktree status and avoid reverting or rewriting unrelated dirty changes from the environment-system-switch and media-overflow work.
- [x] Update only the environment-card hover/focus CSS needed for:
  - [x] readable filled icon-button hover/focus states over scene images;
  - [x] no hover border or outline around `.environment-card-image-action`;
  - [x] no hover border or outline around `.environment-card-name-action`;
  - [x] preserved non-border keyboard focus indication.
- [x] Keep Svelte component markup unchanged unless the CSS-only approach cannot satisfy keyboard focus visibility.

## Tests

- [x] Update `tests/components/environments-tab-contract.test.js` to pin the intended CSS contract for environment-card hover/focus states.
- [x] Update `tests/components/environments-tab-mounted.test.js` only where it can prove rendered card controls, action routing, or focusable targets remain intact. Existing mounted coverage remains sufficient; no markup/action change was needed.
- [x] Add browser-level pointer/visual validation for hover states when a harness is available:
  - [x] hover card icon buttons over linked scene imagery;
  - [x] hover image edit target;
  - [x] hover name/summary target;
  - [x] focus image/name/buttons with keyboard navigation;
  - [x] pointer-test card controls and reopen the editor.
  - [x] rerun browser validation after implementation review requested non-border keyboard focus treatment.

## Verification

- [x] `node --test tests/components/environments-tab-contract.test.js`
- [x] `node --test tests/components/environments-tab-mounted.test.js`
- [x] `npm test`
- [x] `npm run build`
- [x] Local browser/Vite visual validation when available, otherwise `npm run test:foundry` for Foundry-backed screenshots.

## Screenshot Review Gate

- [x] Normal-width first visible grid state shows linked scene image and fallback icon cards with aligned overlay controls.
- [x] Hovered icon-button screenshot proves the button remains filled/readable over the scene image.
- [x] Hovered image edit-target screenshot proves no image-frame border/outline appears.
- [x] Hovered name/summary screenshot proves no text-block border/outline appears.
- [x] Keyboard focus/browser evidence proves focus remains visible without the removed hover border treatment.
- [x] Narrow-width screenshot proves responsive layout, scroll containment, visible controls, and no clipping or overlap.

## Documentation

- [x] Confirm no docs update is needed because the change does not alter user workflows, settings, data model, runtime behavior, or quick-start instructions.

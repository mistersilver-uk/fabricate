# Tasks

## Planning

- [x] Create the OpenSpec follow-up folder for `issue-179-gathering-environments-runtime-ui-followup`.
- [x] Document relationship to the completed #179 runtime branch/slice while noting GitHub issue #179 remains open.
- [x] Document scope limited to GM `Environments` editor UX refinement.
- [x] Document non-goals: runtime, persistence schema, run manager, player app behavior, dependencies, and admin-store contract changes during extraction.
- [x] Add a UI integration delta for validation reveal behavior, section IDs, and injected picker data contracts.

## Implementation Sequence

- [x] First: perform behavior-neutral `EnvironmentsTab` component extraction only.
- [x] Later: add summaries and invalid indicators for environment/task/section state.
- [x] Later: add validation-aware collapsibles that reveal the first invalid field's section before focus.
- [x] Later: add assisted image, scene, and routed roll-table picker affordances using injected data/actions only.
- [ ] Later: add assisted component and macro picker affordances using injected data/actions only.
- [x] Later: add contextual reorder controls.
- [x] Later: add catalyst dependent controls for degradation and `maxUses`.
- [x] Later: apply visual/responsive polish and collect Foundry screenshots when the UI behavior warrants it.
- [x] Current: replace the environment list with a 3-column scrollable card grid.
- [x] Current: add direct card actions for edit, delete, and persisted enable/disable toggle.
- [x] Current: use injected scene imagery for environment cards with a default icon fallback.
- [x] Current: align the `New Environment` button with the `Gathering Environments` title.
- [x] Current follow-up: make the Environments tab grid-first with the editor hidden until card/edit/create is clicked.
- [x] Current follow-up: add an editor Back action that returns to the full-height card grid.
- [x] Current follow-up: enlarge card imagery and overlay card action buttons on the image.
- [x] Current bugfix: make real pointer hit targets work for card body, edit, toggle, delete, and overflow/reorder actions.
- [x] Current bugfix: make off-to-on environment toggles visible and actionable from grid mode.
- [x] Current bugfix: prefer high-resolution scene imagery and improve scene-card aspect ratio/polish.
- [x] Current bugfix: add focused hit-target/menu/toggle/image tests and run screenshot validation.

## Card Grid Acceptance Criteria

- [x] Existing environments render as cards in a 3-column scrollable grid in the GM `Environments` tab.
- [x] A card uses the linked scene image from injected scene option data when available.
- [x] A card falls back to a default icon image when no linked scene image is available.
- [x] Clicking the card image or environment name selects the environment and opens the edit view.
- [x] Each persisted environment card exposes edit, delete, and enable/disable buttons.
- [x] The enable/disable button updates the represented persisted environment rather than only mutating the currently selected draft.
- [x] The `New Environment` button stays vertically aligned with the tab title in the toolbar.
- [x] The card component remains prop-driven and free of Foundry globals.
- [x] The card grid is the only content shown in the first Environments tab view.
- [x] The card grid fills the available tab height.
- [x] The editor opens only after card image/name/edit/create activation.
- [x] The editor Back button returns to the card grid.
- [x] Card action buttons are overlaid on the image.
- [x] Card imagery is visually prominent, with compact name and summary spacing.
- [x] Blank card body clicks open the editor without blocking explicit card controls.
- [x] Edit, enable, disable, delete, and move up/down controls work by real browser pointer hit-testing.
- [x] Enabling a disabled environment from the grid updates the represented persisted environment and gives visible failure feedback if persistence fails.
- [x] Linked scene cards prefer high-resolution scene image paths over thumbnails and use a scene-like aspect ratio.

## Extraction-Only Acceptance Criteria

- [x] Extract smaller presentational components under `src/ui/svelte/apps/environments/`.
- [x] Keep `EnvironmentsTab.svelte` public props stable for `RecipeManagerRoot`.
- [x] Preserve behavior, CSS classes, DOM structure contracts, `data-environment-field` paths, localization keys, validation paths, focus behavior, and callback wiring.
- [x] Preserve stale scene/macro UUID display.
- [x] Preserve dirty/save/cancel affordance behavior.
- [x] Preserve the local incomplete visibility state machine; incomplete provider state must not be committed to `adminStore`.
- [x] Ensure extracted components are prop-driven and do not use Foundry globals or direct collection lookups.
- [x] Do not add collapsibles, pickers, summaries, new reorder controls, catalyst dependent-control changes, responsive/sticky polish, store contract changes, persistence changes, or localization copy changes.

## Verification

- [x] Preserve or add characterization coverage for callback wiring.
- [x] Preserve or add characterization coverage for dirty state and save/cancel state.
- [x] Preserve or add characterization coverage for validation accessibility state and first-invalid focus support.
- [x] Preserve or add characterization coverage for stale UUID display.
- [x] Preserve or add characterization coverage for incomplete local visibility provider state.
- [x] Run `node --test tests/components/environments-tab-contract.test.js`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Do not run `npm run test:foundry` for extraction-only work unless behavior is added that requires it.

Validation results on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js` passed.
- `npm test` passed: 138 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this slice is extraction-only and introduced no runtime behavior or screenshot-required UI behavior.

Validation results for the summaries/collapsibles slice on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js` passed.
- `npm test` passed: 138 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this slice avoided screenshot-required Foundry layout behavior.

Validation results for the UX/QA iteration on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this iteration did not start a screenshot-required visual/responsive slice.

Validation results for the assisted image/scene/roll-table picker slice on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `node --test tests/stores/admin-store-environments.test.js tests/stores/adminStore.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this slice keeps Foundry-only lookup and file-picker behavior behind injected edge data/actions and is source/mounted-testable.

Validation results for the assisted picker QA/UX iteration on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `node --test tests/stores/admin-store-environments.test.js tests/stores/adminStore.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this iteration changed only injected prop wiring and Svelte component accessibility/labels.

Validation results for the contextual reorder and catalyst dependent-control slice on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this slice did not introduce screenshot-required Foundry runtime or layout behavior.

Validation results for the contextual action-menu UX iteration on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this narrow iteration did not introduce screenshot-required Foundry runtime behavior.

Validation results for the contextual action-menu layout iteration on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run because this narrow CSS/source-test iteration did not introduce screenshot-required Foundry runtime behavior.

Validation results for the final visual/responsive polish slice on 2026-04-28:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js` passed.
- `node --test tests/components/admin-icon-button-layout.test.js tests/components/flat-ui-style-contract.test.js tests/components/feature-card-layout.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was attempted twice for screenshot/narrow-window validation. Each run prepared data and pulled `felddy/foundryvtt:release`, then Docker failed before browser screenshots because host port `30000/tcp` was already in use: `failed to bind host port 0.0.0.0:30000/tcp: address already in use`.
- Cleanup: `docker compose -f docker-compose.foundry.yml down` removed the stopped `fabricate-foundry-test` container and `fabricate-v2_default` network after each failed harness start.

Validation results for the Foundry screenshot validation blocker resolution on 2026-04-28:

- Updated the Foundry harness to default to `felddy/foundryvtt:13` through `FOUNDRY_IMAGE`, avoiding the moving `release` tag and the V14 world-migration modal for the V13 smoke world.
- `node --check scripts/foundry-test-up.mjs` passed.
- `node --check scripts/foundry-test-run.mjs` passed.
- `git diff --check -- docker-compose.foundry.yml scripts/foundry-test-up.mjs scripts/foundry-test-run.mjs scripts/README.md` passed.
- `npm run test:foundry` passed against the local `felddy/foundryvtt:13` image.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- GM Environments screenshot artifacts were captured:
  - `test-results/screenshot-13-recipe-manager-environments.png`
  - `test-results/screenshot-14-gm-environments-normal-validation.png`
  - `test-results/screenshot-15-gm-environments-normal-authoring.png`
  - `test-results/screenshot-16-gm-environments-normal-results.png`
  - `test-results/screenshot-17-gm-environments-narrow-authoring.png`
  - `test-results/screenshot-18-gm-environments-narrow-results.png`

Validation plan for the card-grid task:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js`
- `node --test tests/stores/admin-store-environments.test.js`
- `npm test`
- `npm run build`
- Use the already-running Foundry world on port 30000 for screenshots if layout risk remains after focused component and build validation.

Validation results for the persisted environment toggle seam on 2026-05-01:

- `node --test tests/stores/admin-store-environments.test.js` passed.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm test` failed in coordinator-owned component coverage outside this seam: `tests/components/environments-tab-contract.test.js` expects `.environment-row-actions .btn-icon` hit-area CSS in `styles/fabricate.css`, and `tests/components/environments-tab-mounted.test.js` expects the task delete action label `FABRICATE.Admin.Environments.DeleteTaskNamed`.

Validation results for the card-grid integration on 2026-05-01:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js tests/stores/admin-store-environments.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `node --check scripts/foundry-test-run.mjs` passed.
- `git diff --check` passed.
- `node scripts/foundry-test-run.mjs` passed against the already-running Foundry world on `http://localhost:30000`; the gathering negative-gate step was skipped because another pre-existing gathering-enabled system was present in that live world, and the harness restored the smoke system's gathering flag before screenshot phases.
	- GM Environments screenshot artifacts from the passing run:
	  - `test-results/screenshot-07-recipe-manager-environments.png`
	  - `test-results/screenshot-08-gm-environments-normal-validation.png`
	  - `test-results/screenshot-09-gm-environments-normal-authoring.png`
	  - `test-results/screenshot-10-gm-environments-normal-results.png`
	  - `test-results/screenshot-11-gm-environments-narrow-authoring.png`
	  - `test-results/screenshot-12-gm-environments-narrow-results.png`

Validation results for the card-grid screenshot feedback iteration on 2026-05-01:

- Agent review feedback identified the prior screenshot artifact as insufficiently evaluated against visual acceptance criteria.
- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js tests/stores/admin-store-environments.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `git diff --check` passed.
- Foundry screenshot validation used `FOUNDRY_HOST_PORT=30001 FOUNDRY_URL=http://localhost:30001 npm run test:foundry` because the user's existing `foundryvtt` process still held host port `30000`.
- A full Foundry harness run passed before the final screenshot-scroll adjustment. Later screenshot-only verification runs captured the needed Environments artifacts, then exited early in later smoke phases; each left-over `fabricate-foundry-test` container was stopped with `docker compose -f docker-compose.foundry.yml down`.
- Latest inspected GM Environments screenshot artifacts:
  - `test-results/screenshot-13-recipe-manager-environments.png`: grid-only first view, three card columns, image-overlay action buttons, larger media area, compact summary spacing.
  - `test-results/screenshot-14-gm-environments-normal-validation.png`: editor view with visible Back button and validation state.
- Reviewer follow-up fixed after the screenshot pass:
  - Added a card-shell edit button target so card body/background activation opens the editor without putting mouse/keyboard listeners on a non-interactive element.
  - Added the grid-first/card behavior to the OpenSpec UI integration delta.
  - Re-ran `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js tests/stores/admin-store-environments.test.js`: passed.
  - Re-ran `npm test`: passed, 139 tests, 0 failures.
  - Re-ran `npm run build`: passed with only the pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
  - Re-ran `git diff --check` and `node --check scripts/foundry-test-run.mjs`: passed.

Validation results for the card-grid regression bugfix on 2026-05-01:

- `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js tests/stores/admin-store-environments.test.js` passed.
- `npm test` passed: 139 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `git diff --check` passed.
- `node --check scripts/foundry-test-run.mjs` passed.
- `FOUNDRY_HOST_PORT=30001 FOUNDRY_URL=http://localhost:30001 npm run test:foundry` passed after the final card media/action-overlay fix. Port 30001 was used because the user's existing Foundry process still held port 30000.
- Inspected `test-results/screenshot-13-recipe-manager-environments.png`: grid-only first view, three columns, all overlay controls visible inside each card, unclipped card names/summaries, and scrollable grid height preserved.
- Inspected `test-results/screenshot-14-gm-environments-normal-validation.png`: editor view opens after card/edit activation and exposes the Back action.
- Review loop completed with no blocking issues:
  - `fabricate_reviewer`: approved, no blockers.
  - `fabricate_quality_engineer`: no blockers; noted the live screenshot uses fallback icons while component tests cover high-resolution scene image priority.
  - `fabricate_ux_designer`: no UX blockers; suggested sticky Back and sticky Save/Cancel as future polish.

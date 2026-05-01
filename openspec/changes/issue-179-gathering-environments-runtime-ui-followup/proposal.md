# Proposal: Issue #179 Gathering Environments Runtime UI Follow-up

## Summary

Refine the GM `Environments` editor user experience for gathering environments after the completed #179 runtime branch/slice, while keeping GitHub issue #179 open until the broader accepted work is reviewed and closed by humans.

This change is an admin UI feedback follow-up only. It does not reopen or alter gathering runtime contracts, persistence schema, run-manager behavior, player gathering behavior, or the canonical gathering data model.

## Relationship To #179

- GitHub issue #179 remains open and is the active issue context.
- The prior `issue-179-gathering-environments-runtime` OpenSpec change documents the completed runtime/backend/player/GM foundation slice.
- This follow-up builds on that completed runtime slice and focuses only on GM-facing authoring ergonomics in the existing `Environments` tab.
- Runtime behavior described by `openspec/specs/gathering-and-harvesting/spec.md` remains authoritative and unchanged.

## Scope

- First task: behavior-neutral extraction of `src/ui/svelte/apps/EnvironmentsTab.svelte` into smaller prop-driven presentational components under `src/ui/svelte/apps/environments/`.
- Later UI feedback tasks:
- environment/task summaries and invalid indicators
  - validation-aware collapsibles with deterministic reveal behavior
  - assisted scene, roll-table, image, and component/macro picker affordances using injected data only
  - contextual reorder controls that reduce disabled/no-op buttons
  - catalyst dependent controls that clarify `maxUses` relevance when degradation is disabled
  - visual and responsive polish verified with Foundry screenshots when those visual changes are implemented
- Current task: replace the compact environment list with a 3-column scrollable card grid. Each persisted environment card shows its linked scene image when injected scene data provides one, otherwise a default icon, and exposes edit, delete, and enable/disable actions without requiring the user to open the draft editor first.
- Current follow-up: keep the Environments tab grid-first. The full-height card grid is the default first view, card imagery is visually prominent, card actions are overlaid on the image, and the environment editor opens only after the GM clicks a card/edit/create action. The editor has a Back action to return to the grid.
- Current bugfix follow-up: correct real pointer hit targets for environment cards and overlay actions, ensure disabled-to-enabled card toggles are observable in grid mode, avoid clipping move/reorder menu actions, and prefer high-resolution scene imagery with a scene-like card aspect ratio.
- Preserve current store callbacks, validation paths, localization keys, CSS class contracts, focus behavior, and `data-environment-field` addresses unless a later task explicitly changes them.

## Out Of Scope

- Gathering runtime semantics.
- Persistence schema or migration changes.
- `GatheringEnvironmentStore`, `GatheringRunManager`, `GatheringEngine`, or gate/check evaluator behavior.
- Player gathering app behavior.
- New npm dependencies.
- Reworking the admin store contract during the extraction-only task.
- Adding collapsibles, new summaries, new pickers, new reorder behavior, catalyst dependent-control changes, or visual/responsive polish during the extraction-only task.
- Runtime scene resolution from Svelte components; scene thumbnails must come from injected scene option data.

## User Experience Goals

- Make the large GM editor easier to reason about without changing its behavior first.
- Make environment selection scannable by presenting existing environments as image-backed cards rather than dense rows.
- Let GMs edit, delete, and toggle an existing environment directly from its card, while keeping the card image and name as edit targets.
- Keep direct card actions reliable under real browser hit-testing; blank card body/image/name/edit opens the editor, while toggle/delete/reorder actions perform only their explicit action.
- Use crisp scene imagery for cards when available, avoiding low-resolution thumbnails as the preferred image source.
- Keep the new-environment action aligned with the `Gathering Environments` title in the toolbar.
- Ensure validation errors can be surfaced and revealed predictably in later UI tasks.
- Keep future picker integrations data-injected so the Svelte components remain Foundry-global-free and testable.
- Preserve unsaved local UI state, including incomplete visibility provider input, without committing incomplete provider configuration to the admin store.

## Affected Surfaces

- `openspec/changes/issue-179-gathering-environments-runtime-ui-followup/`
- `src/ui/svelte/apps/EnvironmentsTab.svelte`
- new presentational Svelte components under `src/ui/svelte/apps/environments/`
- `src/ui/svelte/stores/adminStore.js`
- `tests/components/environments-tab-contract.test.js`
- `tests/components/environments-tab-mounted.test.js`
- `tests/stores/admin-store-environments.test.js`
- `styles/fabricate.css`

## Verification

For the extraction-only task:

- focused component/source contract test: `node --test tests/components/environments-tab-contract.test.js`
- full test gate: `npm test`
- build gate: `npm run build`
- do not run `npm run test:foundry`; this first slice is behavior-neutral and should not introduce runtime or screenshot-required behavior.

For later visual/responsive UI polish tasks, use a local Vite dev server first when practical and reserve `npm run test:foundry` for Foundry runtime behavior or reproducible screenshot evidence.

For the card-grid task:

- focused component tests: `node --test tests/components/environments-tab-contract.test.js tests/components/environments-tab-mounted.test.js`
- focused store tests: `node --test tests/stores/admin-store-environments.test.js`
- full test gate: `npm test`
- build gate: `npm run build`
- use the already-running Foundry world on port 30000 for screenshot validation if code-level and Vite-level checks leave layout risk unresolved.

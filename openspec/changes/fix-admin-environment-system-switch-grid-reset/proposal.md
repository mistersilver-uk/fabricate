# Proposal: Fix Admin Environment System Switch Grid Reset

## Problem

In the GM crafting admin `Environments` tab, editing an environment in one gathering-enabled crafting system and then selecting another gathering-enabled system leaves the local editor view open. The admin store refreshes the draft for the new selected system, so the UI renders the editor for the first environment in the new system instead of returning to the grid/overview.

There is no assigned GitHub issue number. A `gh issue` search for environment/admin was reported with no matching output.

## Scope

- Reset the GM `Environments` tab to grid/browse mode when the selected crafting system changes.
- Preserve the existing grid-first flow: card/edit/create opens the editor, Back returns to grid, direct card actions stay on grid.
- Preserve dirty-draft confirmation behavior before system switching.
- Add focused coverage for switching between two gathering-enabled systems after opening an editor.

## Out Of Scope

- Gathering runtime, player gathering UI, environment persistence schema, run history, and destructive cleanup behavior.
- Redesigning the environment card grid or editor layout.
- Adding dependencies.
- Quick-start or runtime documentation changes.

## Affected Files

- `src/ui/svelte/apps/RecipeManagerRoot.svelte`
- `src/ui/svelte/apps/EnvironmentsTab.svelte`
- `src/ui/svelte/stores/adminStore.js` only if the implementer finds the store should expose an explicit view-reset signal instead of keeping reset ownership in the Svelte tab.
- `tests/components/environments-tab-mounted.test.js`
- `tests/components/environments-tab-contract.test.js`
- `tests/stores/admin-store-environments.test.js` if store behavior is adjusted or characterized.
- `styles/fabricate.css` is not expected to change.

Do not touch the unrelated dirty worktree changes in `.codex/agents`, `skills`, or `openspec/changes/codify-ui-review-agent-learnings`.

## Acceptance Criteria

- Starting in system A, opening an environment editor, then selecting gathering-enabled system B shows the system B environment grid/overview first, not an editor.
- The grid contains only system B environments and does not visually imply system A is still selected.
- Clicking a system B card image, name, or edit action still opens that environment editor.
- Creating a new environment in system B still opens the new draft editor.
- Switching systems with a dirty environment draft still prompts for discard; declining keeps the current editor and system selection unchanged.
- Switching to a system without gathering still hides the `Environments` tab and falls back to a visible tab per the canonical UI spec.
- No runtime gathering behavior or persistence data shape changes.

## Verification Plan

- `node --test tests/components/environments-tab-mounted.test.js`
- `node --test tests/components/environments-tab-contract.test.js`
- `node --test tests/stores/admin-store-environments.test.js` if store logic changes.
- `npm test`
- `npm run build`
- UI verification with a live browser when feasible:
  - first visible state after system switch is the environment card grid;
  - card grid alignment has no clipping or overlapping controls;
  - scroll containment remains inside the environments panel;
  - visible controls include New Environment, card image/name/edit/toggle/delete/menu;
  - pointer hit-tests prove card edit targets open the editor after the switch.
- Use `npm run test:foundry` if local Vite/browser validation cannot reproduce the real Foundry admin shell behavior or if reviewer requests reproducible screenshots.

## Screenshot Artifacts

If screenshot validation runs, capture:

- Normal-width GM admin after switching from system A editor to system B: proves the first visible state is the grid, not the editor.
- Normal-width GM admin after clicking a system B card edit target: proves the editor opens only after explicit activation.
- Narrow admin window after the same switch: proves responsive card alignment, clipping, visible controls, and scroll containment.

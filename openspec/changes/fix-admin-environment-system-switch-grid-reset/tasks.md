# Tasks

## Planning

- [x] Confirm no GitHub issue number is assigned; reported `gh issue` search for environment/admin had no matching output.
- [x] Read `AGENTS.md`, relevant OpenSpec specs, prior gathering environment change docs, and the likely admin UI/store files.
- [x] Document unrelated dirty worktree paths that must not be touched: `.codex/agents`, `skills`, and `openspec/changes/codify-ui-review-agent-learnings`.
- [x] Draft OpenSpec proposal, design, and implementation handoff for one focused bug fix.

## Implementation Handoff

- [x] Reproduce or characterize the bug in a mounted Svelte test before changing behavior.
- [x] Implement the smallest reset seam:
  - use `environmentDraft.craftingSystemId` as the system-scope signal already available to the tab;
  - reset local `editorOpen` only when both previous and next scope ids are known and different;
  - keep card/edit/create actions responsible for opening the editor.
- [x] Preserve dirty-draft confirmation and existing store ownership.
- [x] Avoid component contract changes because no new prop wiring was needed.
- [x] Avoid store changes because existing store behavior remains valid.

## Verification

- [x] `node --test tests/components/environments-tab-mounted.test.js`
- [x] `node --test tests/components/environments-tab-contract.test.js`
- [x] `node --test tests/stores/admin-store-environments.test.js` not required by changed files; covered later by `npm test`.
- [x] `npm test`
- [x] `npm run build`
- [x] Browser or Foundry UI verification when feasible:
  - system A editor open, switch to gathering-enabled system B, first visible state is grid;
  - system B card edit target opens editor by real pointer hit-test;
  - normal and narrow widths have no clipping/overlap and keep controls visible.

## Reviewer Checklist

- [x] The reset is keyed to crafting-system scope, not every draft/list refresh.
- [x] Dirty draft discard decline leaves the user in the original system/editor.
- [x] Card direct actions still stay on grid unless they are edit/create actions.
- [x] Screenshot or browser evidence, when collected, proves first visible state, alignment, clipping, content fidelity, scroll containment, visible controls, and responsive widths.

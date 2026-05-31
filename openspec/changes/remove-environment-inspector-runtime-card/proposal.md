# Remove Environment Inspector Runtime Card

## Problem

The environment task/hazard right inspector repeats runtime state in a dedicated `Runtime state` card even though the selected-record header and the task/hazard rows already show the same runtime status. The extra card consumes inspector space that is better used for matching evidence and environment override controls.

## Scope

In scope:

- Remove the selected-record inspector's standalone runtime-state card.
- Keep the selected-record header composition and runtime pills.
- Keep row-level runtime state in task/hazard composition lists.
- Keep task/hazard matching evidence and all five evidence rows.
- Keep hazard environment override controls, including the hazard chance drop-rate adjustment.
- Remove localization keys used only by the deleted card.
- Update source and mounted component tests.

Out of scope:

- Runtime-state semantics, composition semantics, matching logic, and player gathering behavior.
- Environment override behavior, persistence semantics, and matching evidence layout.

## Resolved Agent Roster

- Plan review: `fabricate_ux_designer`, `fabricate_quality_engineer`
- Implementation review: `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`
- Docs loop: not required; this removes redundant inspector chrome without changing documented behavior or public API.

## Verification

- `node --test tests\components\environment-editor.test.js`
- `node --test tests\components\manager-mounted.test.js`
- `npm test`
- `npm run build`
- `git diff --check`
- Local Playwright screenshot fixture: `test-results/hazard-inspector-runtime-card-removed.png` proves no hazard-runtime card, retained header pills, all five evidence rows, and visible hazard override controls at a 360px viewport.
- `npx commitlint --from HEAD~1 --to HEAD` after commit

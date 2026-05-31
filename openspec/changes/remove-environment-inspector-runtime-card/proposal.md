# Remove Environment Inspector Runtime Card

## Problem

The environment task/hazard right inspector repeats runtime state in a dedicated `Runtime state` card even though the selected-record header and the task/hazard rows already show the same runtime status. The extra card consumes inspector space that is better used for matching evidence and environment override controls.

## Scope

In scope:

- Remove the selected-record inspector's standalone runtime-state card.
- Keep the selected-record header composition and runtime pills.
- Keep row-level runtime state in task/hazard composition lists.
- Keep task/hazard matching evidence and all five evidence rows.
- Remove localization keys used only by the deleted card.
- Update source and mounted component tests.

Out of scope:

- Runtime-state semantics, composition semantics, matching logic, and player gathering behavior.
- Hazard runtime details, environment override controls, and matching evidence layout.

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
- `npx commitlint --from HEAD~1 --to HEAD` after commit

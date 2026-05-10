# Tasks

## Planning
- [x] Read `AGENTS.md`, the active Gathering Condition Settings change, relevant canonical UI/Gathering specs, current picker components, and named tests.
- [x] Verify the current branch is not `main`.
- [x] Resolve routing: UI component behavior and test coverage require UX and Quality plan/post-implementation review.
- [x] Create OpenSpec proposal, design, and task docs for this focused fix.

## Implementation
- [x] Update `ManagerV2ColorPicker` to portal the popover to the nearest `.fabricate-manager-v2`.
- [x] Reuse `computeIconPickerPopoverLayout` with `horizontalAlign: 'left'`, `minWidth: 220`, and `maxWidth: 220`.
- [x] Constrain `minLeft` and `maxRight` to the nearest `.manager-v2-main` bounds when available.
- [x] Recompute placement while open when the viewport or containing scroll region changes.
- [x] Preserve existing preset/custom hex behavior, dismissal behavior, data attributes, and `onChange({ colorToken, customColor })` payloads.
- [x] Avoid unrelated changes to biome vocabulary persistence, store callbacks, or other picker components.

## Tests
- [x] Extend `manager-v2-layout` coverage to assert the colour picker remains 220px wide and layout/helper usage is present in the Manager V2 color picker source.
- [x] Extend `manager-v2-mounted` coverage to open a biome colour picker, assert the popover is portaled under `.fabricate-manager-v2`, click a preset, and verify the existing `updateGatheringVocabularyValue` payload is unchanged.
- [x] Add or adapt mounted geometry stubs to prove left alignment, Manager V2 main-panel horizontal constraints, and above-trigger placement near the lower edge.
- [x] Run `node --test tests\components\manager-v2-layout.test.js`.
- [x] Run `node --test tests\components\manager-v2-mounted.test.js`.
- [x] Run `npm test`.
- [x] Run `npm run build`.

## Review And Delivery
- [x] UX review confirms alignment, clipping, visible controls, scroll containment, responsive width, and flip-above behavior.
- [x] Quality review confirms regression coverage exercises portal target, layout options, constrained placement, and unchanged payloads.
- [x] `fabricate_reviewer` approves the implementation diff.
- [ ] Commit, push, and open a PR targeting `main` if this planning change proceeds to implementation.

## Loop Counts
- Plan loop: 0 review iterations run in this planning-only handoff.
- Implementation loop: not started.
- Docs loop: not started; expected not required unless implementation changes durable behavior or documented API.

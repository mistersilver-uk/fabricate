# Tasks

## Planning

- [x] Read AGENTS.md instructions supplied for this repo.
- [x] Read the Fabricate orchestrator skill.
- [x] Confirm no GitHub issue is assigned and do not invent one.
- [x] Review the canonical UI integration spec.
- [x] Review the existing manager-v2 OpenSpec context.
- [x] Review the current count-card markup, CSS, and layout test.
- [x] Create this narrow OpenSpec change before implementation.

## Implementer Entry Criteria

- [x] Respect the dirty worktree and do not revert unrelated edits.
- [x] Treat `fix-manager-v2-count-label-wrapping` as the active OpenSpec change.
- [x] Keep implementation scoped to manager-v2 selected-system inspector count labels.
- [x] Do not change runtime behavior, count derivation, persistence, routing, or localization keys unless a blocking markup issue is documented first.
- [x] Do not add npm dependencies.

## Implementation Checklist

- [x] Update `.manager-v2-fact` CSS in `styles/fabricate.css` so count cards can wrap labels and grow in height.
- [x] Update the `.manager-v2-fact strong, .manager-v2-fact span` CSS so labels are not hidden or ellipsized.
- [x] Preserve the disabled gathering count full-row layout and disabled value emphasis.
- [x] Update `tests/components/manager-v2-layout.test.js` to assert wrapping/full-label behavior instead of single-line no-wrap behavior.
- [x] Confirm no Svelte markup changes are required because the existing label/value markup supports wrapping.

## Verification

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Capture manager-v2 visual evidence at normal width showing the selected-system inspector Counts card with all labels fully readable, no ellipsis, no clipping/overlap/horizontal scroll, and vertically grown cards/rows where labels wrap.
- [x] Capture manager-v2 visual evidence at stacked width showing the inspector/counts section remains reachable and wrapped labels stay inside their cards without disrupting scroll containment.
- [x] Capture or construct a disabled-gathering selected-system state showing `Gathering environments Off` fully readable across the count grid with `Off` retaining value emphasis.
- [x] Confirm the required lightweight UI harness ran, so no blocker or unverified visual acceptance criteria remain to document.

## UX Review Gate

- [x] Before final sign-off for the implementation, review the inspector visually to confirm the taller count cards read as intentional, align with neighboring cards, and do not make enabled feature chips or inspector actions unreachable.

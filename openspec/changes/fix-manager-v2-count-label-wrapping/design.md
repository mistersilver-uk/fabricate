# Design: Fix Manager V2 Count Label Wrapping

## Current Behavior

The selected-system inspector renders the `Counts` section in `CraftingSystemManagerV2Root.svelte` with a `.manager-v2-fact-grid` containing `.manager-v2-fact` cards.

The current CSS makes each fact a single-line flex row:

- `.manager-v2-fact` uses `display: flex`, `align-items: baseline`, and `white-space: nowrap`.
- `.manager-v2-fact strong, .manager-v2-fact span` use `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.
- `.manager-v2-fact.is-off` spans both grid columns for the disabled gathering state.

The current layout test `manager-v2 inspector counts and feature chips align compactly` asserts the no-wrap behavior. That test must be updated because it now describes the bug.

## Design Decision

Keep the existing two-column count grid and the value/label ordering, but allow cards to grow vertically.

Implementation should make the count fact content wrap within its card:

- Remove or override `white-space: nowrap` on `.manager-v2-fact`.
- Remove or override `overflow: hidden` and `text-overflow: ellipsis` from the count value/label rule.
- Use `flex-wrap: wrap` or an equivalent grid/inline layout that preserves the visual relationship between the value and label.
- Keep `min-width: 0` and `max-width: 100%` constraints so cards shrink inside the inspector instead of forcing horizontal overflow.
- Prefer `overflow-wrap: break-word` for rare long localization strings. Avoid `overflow-wrap: anywhere` unless necessary because it can create poor single-letter wrapping.
- Keep `.manager-v2-fact.is-off { grid-column: 1 / -1; }`.

The selected-system count label text is already produced by localization-backed `buildSelectedCountFacts()`. No data-model or localization change is expected.

## Test Strategy

Update `tests/components/manager-v2-layout.test.js` so the inspector count test asserts the new contract:

- Count facts still use the two-column inspector grid.
- Count facts still align the value and label compactly.
- Count facts allow wrapping, for example by asserting `flex-wrap: wrap` or the chosen equivalent.
- Count facts do not include `white-space: nowrap`.
- Count value/label children do not include `overflow: hidden`, `text-overflow: ellipsis`, or `white-space: nowrap`.
- The disabled count still spans the full grid and preserves the `.is-disabled` value emphasis.

If CSS helper parsing makes exact negative assertions brittle, split selectors so the test can inspect the `.manager-v2-fact` block and the child value/label block independently.

## UI Verification

Visual verification is required for implementation sign-off. Prefer the local Vite or component test route when available. Use Foundry smoke coverage when live manager-v2 state is needed or no lighter UI harness can show the selected-system inspector. If no UI harness can be run, record the blocker and residual visual risk in the implementation handoff before requesting final approval.

Screenshot artifact expectations:

- `manager-v2-counts-normal` at about `1200x790`: selected-system inspector is visible; `Recipe categories` is fully readable; no ellipsis appears in the Counts card; no horizontal clipping or overlap.
- `manager-v2-counts-stacked` at about `1000x700` or the existing stacked manager-v2 breakpoint: the inspector/counts section remains reachable; wrapped labels stay inside cards; scroll containment remains coherent.
- A fixture/state with gathering disabled: `Gathering environments Off` remains fully readable, spans the count grid, and preserves `Off` emphasis.

Visual review must explicitly map the captured states back to acceptance criteria: every current count label is fully readable, wrapping occurs at word boundaries where needed, count cards/grid rows grow vertically instead of clipping, there is no ellipsis, overlap, text escape, or horizontal scroll, and the disabled gathering value emphasis remains intact.

Pointer hit-test expectations:

- Count cards themselves are informational and do not need click hit-tests.
- Reuse existing manager-v2 live browser pointer coverage for selecting a system row and navigating to the selected-system inspector state before the screenshot is captured.

## Risks

- Allowing cards to grow can increase inspector height and push enabled feature chips lower. This is acceptable, but the inspector must remain scroll-contained by existing manager-v2 shell rules.
- Long localized labels may still wrap awkwardly in very narrow inspectors. The fix should prefer word wrapping and only break long words as a fallback.
- Existing layout tests currently encode the old compact behavior; failing to update them would block the intended change.

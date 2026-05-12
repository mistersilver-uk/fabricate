# Design

## Current Context

The reported failed attempt was an unverified selector-only change:

- `styles/fabricate.css` changes `.fabricate-manager-v2 .manager-v2-search i` to `.fabricate-manager-v2 .manager-v2-search > i`.
- `tests/components/manager-v2-layout.test.js` adds assertions that the broad descendant selector is absent and character modifier suggestion rows are flex.

That attempt correctly suspects selector bleed from the generic search icon rule, but it does not prove the rendered issue. The implementation must first verify whether those edits are present in the working tree or branch history and revert them when present so the investigation starts from the failing baseline and does not accidentally bless a selector-only assumption.

## Investigation Harness

Create a disposable Playwright harness under an ignored temp path such as `test-results/tmp-popover-harness/`.

The harness must:

- load the real `styles/fabricate.css`;
- render the availability menu and the character modifier add-search suggestion popover side-by-side in a minimal `.fabricate-manager-v2` shell;
- include a normal `.manager-v2-search` field with its leading search icon;
- include representative suggestion rows with Font Awesome-style `<i>` icons and labels;
- capture screenshots for desktop and constrained/narrow widths;
- record bounding boxes for the search leading icon, availability menu icon, suggestion row, suggestion icon, and suggestion label;
- record computed styles that affect icon flow, at minimum `position`, `display`, `top`, `left`, `transform`, `width`, `height`, `margin`, `align-items`, and relevant line-height/font-size values.

The harness may be deleted before final commit. If kept for local debugging during implementation, it remains under `test-results/`, which is already ignored.

## CSS Fix Strategy

After the baseline geometry is captured, choose the smallest CSS change that fixes the rendered character modifier suggestion icons.

Preferred direction if verified by the harness:

- limit absolute positioning to the dedicated search-field leading icon in the search control;
- keep suggestion row icons in normal row flow within an availability-style fixed icon grid column;
- avoid broad descendant rules that catch popover/menu content rendered inside `.manager-v2-search`;
- avoid changing suggestion markup or search component behavior unless CSS cannot solve the actual conflict.

The fix must preserve:

- the normal search input icon alignment and input left padding;
- availability menu icon and label alignment;
- character modifier suggestion icon and label alignment;
- row click/pointer target geometry.

## Permanent Regression

Add permanent test coverage only after the CSS fix is verified in the harness.

Regression coverage should assert behavior/geometry rather than only selector strings. Acceptable coverage includes Playwright-backed geometry assertions or a mounted/layout test that proves:

- the search field leading icon remains absolutely positioned within the search control;
- character modifier suggestion icons are not absolutely positioned;
- suggestion icons and labels share the same row flow, fixed icon column, and vertical center;
- availability menu icons keep their established row alignment.

Selector-text assertions may remain as supporting checks, but they are not sufficient by themselves.

## Visual And Interaction Acceptance

- First visible state: the harness shows the availability menu and the character modifier add-search suggestion popover side-by-side with real Fabricate styling.
- Alignment: suggestion icons align vertically with their labels and sit in the intended leading-icon slot.
- Clipping: icons and labels are not clipped by the popover, search control, or narrow shell.
- Content fidelity: the search field leading icon, availability menu icons, and character modifier suggestion icons remain visually distinct and readable.
- Scroll containment: no new page or Manager V2 shell overflow is introduced by the CSS fix.
- Visible controls: all rendered suggestion rows remain visible and clickable in the harness.
- Responsive sizes: capture or verify normal desktop width and a constrained/narrow Manager V2 width.
- Pointer hit-test: when feasible, click a suggestion row in the live harness and verify the row receives the pointer event at the expected target.

## Affected Files For Implementation

- `styles/fabricate.css`
- `tests/components/manager-v2-layout.test.js`
- Optional permanent Playwright or component-layout test file only if needed for geometry coverage
- Disposable ignored harness under `test-results/tmp-popover-harness/`

## Verification

- Harness screenshot and geometry review for baseline and fixed states.
- Targeted layout or Playwright regression test for the permanent coverage.
- `node --test tests\components\manager-v2-layout.test.js`
- `node --test tests\components\manager-v2-mounted.test.js`
- `npm test`
- `npm run build`
- `git diff --check`

`npm run test:foundry` is not required for this CSS-only slice unless the harness or local tests cannot reproduce the Manager V2 popover geometry with real CSS.

## Agent Roster

- Plan owner: `fabricate_orchestrator`.
- Plan review: `fabricate_ux_designer`, `fabricate_quality_engineer`.
- Implementation: `fabricate_implementer`.
- Post-implementation review: `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`.
- Docs loop: not required unless implementation changes durable behavior, public API, localization, JSDoc, or user-facing documentation.

## Implementer Entry Criteria

- Keep all edits on the current non-`main` task branch or another task branch.
- Start by verifying and, if present, reverting only the failed selector attempt and related test assertions; do not revert unrelated user changes.
- Do not edit Svelte components, runtime gathering logic, localization, docs, or canonical specs unless the harness proves CSS cannot solve the issue.
- Do not commit the disposable harness unless it is intentionally promoted to a maintained fixture with review approval.

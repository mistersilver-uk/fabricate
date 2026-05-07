# Tasks

## Planning

- [x] Confirm no GitHub issue number was provided.
- [x] Read the Manager V2 recipe browser, systems browser, environment browser, shared CSS, localization, UI spec, and affected tests.
- [x] Create OpenSpec proposal, design, and task tracking files.

## Implementation

- [x] Replace recipe enabled checkbox markup with the shared compact status toggle button.
- [x] Add recipe-specific enable/disable localization keys.
- [x] Include recipe status cells in the shared status-cell alignment selector.
- [x] Update the canonical UI integration spec for recipe browse status controls.
- [x] Update mounted, layout, and contract tests for recipe status toggles.

## Verification

- [x] `node --test tests/components/manager-v2-mounted.test.js tests/components/manager-v2-contract.test.js tests/components/manager-v2-layout.test.js`
- [x] `npm test`
- [x] `npm run build`

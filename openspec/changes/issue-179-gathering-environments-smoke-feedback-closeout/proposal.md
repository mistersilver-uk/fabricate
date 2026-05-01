# Proposal: Issue #179 Gathering Environments Smoke Feedback Closeout

## Summary

Expand the containerized Foundry smoke suite so issue #179 gathering environments are covered by live GM and player screenshots, then use UX, QA, and domain review of those screenshots to drive final implementation tasks.

## Issue Context

- GitHub issue #179 is open: "Implement gathering environments, GM environments tab, and player gathering app per OpenSpec".
- The existing `issue-179-gathering-environments-runtime` change covers the runtime foundation.
- The existing `issue-179-gathering-environments-runtime-ui-followup` change covers GM editor extraction and polish.
- This closeout change covers live smoke coverage, screenshot evidence, cross-discipline feedback, and final fixes needed before #179 can be considered review-ready.

## Scope

- Expand `scripts/foundry-test-run.mjs` to exercise gathering-specific live Foundry flows.
- Capture deterministic screenshots under `test-results/` for GM `Environments`, Items Directory entry, and player `Gathering` app states.
- Review screenshots with UX, QA, and domain perspectives.
- Convert accepted feedback into implementation tasks with explicit acceptance criteria and sign-off.
- Implement accepted defects or usability/layout fixes discovered by the smoke run and screenshot review.

## Out Of Scope

- New npm dependencies.
- New gathering persistence schema or migrations unless a screenshot-backed defect proves existing data cannot satisfy the spec.
- Reopening completed runtime contracts without a concrete smoke defect.
- Harvesting as a separate runtime, app, store, or setting path.
- Unrelated admin, crafting, recipe, or alchemy UI redesign.

## Evidence Goals

The smoke suite should provide live Foundry screenshots for:

- Items Directory with the feature-gated `Gathering` action.
- GM `Environments` default, validation, authoring, result/catalyst, empty/create, routed, progressive, normal-width, and narrow-width states.
- Player `Gathering` targeted ready listing.
- Player scene/token blocked listing.
- Player catalyst blocked listing.
- Player immediate success feedback/history.
- Player timed active run and completed history.
- Player blind redaction.
- Player narrow layout.

## Verification

- `node --check scripts/foundry-test-run.mjs`
- focused source/component tests when product UI changes are made
- `npm test`
- `npm run build`
- `npm run test:foundry`


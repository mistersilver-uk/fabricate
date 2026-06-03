# UI PR Screenshot Evidence Hardening

## Problem

The screenshot evidence system collects real smoke-harness screenshots, but the loop
does not close and the gate is weak:

- Nothing automatically uploads screenshots or embeds them in the PR description — it was a manual, browser-only step.
- The required `check-screenshots` gate can be self-satisfied with a bare `SCREENSHOTS_NEEDED:` line (the team-b workflow even auto-injects it on failure), so an agent can green the check with zero screenshots.
- UI-change detection misses `lang/*.json`, where all visible Manager text lives.
- A recipe match path had already rotted (`utils/essenceIcons.js` vs the real `util/essenceIcons.js`) with no guard.

## Proposed Change

- Add a `publish` command (`npm run screenshots:ui:publish`) that uploads collected screenshots with the `gh attach` extension (release mode → a `fabricate-pr-<number>` release tag, headless) and idempotently embeds `![pr-<number> ...]` markdown into a managed block in the PR body via `gh pr edit --body-file`.
- Keep generation local: `npm run test:foundry` (the `full` profile) produces the screenshots; the full smoke profile is never run on a GitHub Actions runner.
- Remove the self-serve `SCREENSHOTS_NEEDED:` text bypass. The only exemption is a maintainer-applied `screenshots-exempt` label, which CI reads via `gh pr view --json labels`. An agent cannot self-exempt.
- Add `lang/` to UI-change detection.
- Fix the `essenceIcons.js` recipe path and add anti-rot guard tests: every recipe match pattern must resolve to a tracked file, and every recipe smoke label must be emitted by `scripts/foundry-test-run.mjs`.
- Update team-b automation to run the publish flow after PR creation, and update agent guidance, skills, and docs.
- Delete the orphaned `tests/fixtures/ui-assets/` directory.

## Out of Scope

- Running the full smoke profile in GitHub Actions.
- Replacing the live Foundry smoke harness or hardening its Phase D0 selectors.
- Orphan-branch / S3 upload hosts — `gh attach` release assets are the chosen headless route. Browser-mode `user-attachments` URLs (also accepted by `check`) are deferred because they need an interactive `playwright-cli` session.

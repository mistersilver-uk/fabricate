# Tasks

- [x] Add OpenSpec proposal/design/tasks and spec delta for the hardening change.
- [x] Add a `publish` command + `screenshots:ui:publish` script that uploads via `gh image` and embeds a managed PR-body block idempotently.
- [x] Remove the self-serve `SCREENSHOTS_NEEDED:` bypass; add a maintainer `screenshots-exempt` label gate read by CI.
- [x] Add `lang/` to UI-change detection.
- [x] Fix the `essenceIcons.js` recipe path and add anti-rot guard tests (recipe→tracked file, smokeLabel→harness label).
- [x] Wire the CI `check-screenshots` job to pass live PR labels and the exempt label.
- [x] Update team-b automation to publish screenshots after PR creation and stop auto-injecting the bypass.
- [x] Update AGENTS.md, docs, shared role skills, and the Team B prompt.
- [x] Delete the orphaned `tests/fixtures/ui-assets/` directory.
- [x] Run validation gates (`npm test`, `npm run build`).

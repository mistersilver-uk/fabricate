You are running the manually triggered Codex Team B backlog workflow for Fabricate, a FoundryVTT crafting module.

Read these files before doing anything else, ideally in parallel:

- `AGENTS.md`
- `.git/codex-team-b-context/issue-meta.md`
- `.git/codex-team-b-context/issue-body.txt`
- `openspec/README.md`
- `openspec/specs/README.md`
- `.codex/config.toml`
- `.codex/agents/fabricate-orchestrator.toml`
- `.codex/agents/fabricate-implementer.toml`
- `.codex/agents/fabricate-reviewer.toml`
- `.codex/agents/fabricate-docs-writer.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `skills/fabricate-orchestrator/SKILL.md`
- `skills/fabricate-implementer/SKILL.md`
- `skills/javascript-structural-design/SKILL.md`
- `skills/javascript-mastery/SKILL.md`
- `skills/fabricate-reviewer/SKILL.md`
- `skills/fabricate-docs-writer/SKILL.md`

The workflow has already selected the issue, fetched its body, and installed dependencies.
Do not depend on network access.

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` first for non-trivial issues to map affected files, specs, tests, and likely file ownership boundaries.
- If the issue has disjoint write sets, spawn one `fabricate_implementer` worker per write set and assign exact file ownership.
Tell each worker that other agents may be editing in parallel and that it must not revert unrelated changes.
- If there is only one write set, implement locally after using the explorer result.
- Spawn `fabricate_reviewer` after implementation to review the final diff.
If it returns `NEEDS_CHANGES`, fix the issues and review again.
- Spawn `fabricate_docs_writer` only when behavior or public API documentation changed.
- Keep subagent nesting at one level.
Do not ask child agents to spawn further agents.

Work through these phases:

1. Plan

- Use `fabricate-orchestrator` behavior first.
- Search the codebase for relevant files before deciding on changes.
- For non-trivial work, author the OpenSpec change delta in the **selected issue's body** before code changes, using `gh issue edit "$ISSUE_NUMBER"` to write the managed `openspec-delta` block (proposal, design, tasks, any per-domain spec deltas, resolved roster, acceptance).
Preserve the reporter's original text above the block, edit only inside the `openspec-delta:start`/`openspec-delta:end` markers, and rewrite the block in place rather than appending a duplicate.
See `openspec/README.md`.
The delta lives in the issue, not in versioned files, so it persists even when the branch commit is code-only.
- For trivial work, keep the task tightly scoped.

1. Implement

- Follow the repo rules in `AGENTS.md` and the local implementer skill.
- Use `javascript-structural-design` when work changes module boundaries, collaborator wiring, constructors, API shape, or test seams.
- Use `javascript-mastery` when implementation work depends on JavaScript language semantics or edge cases.
- Keep changes limited to the selected issue.
- Prefer existing patterns over new abstractions.
- Add or update tests first when practical.

1. Validate

- Follow the reviewer skill expectations.
- Run `npm test` and `npm run build` once after all changes are complete.
- Fix any issues those gates reveal before finishing.

1. Document

- Follow the docs-writer skill expectations.
- Update relevant documentation if behavior changed.
- Reconcile the shipped canonical specs (`openspec/specs/`) against the issue's `openspec-delta`: when implementation faithfully realized the delta, leave it; when it justifiably deviated, update the issue's delta block (and its `Deviations` note) via `gh issue edit` so it accurately describes what shipped.

1. Commit

- If you make changes, stage and commit them using:
  `<type>(#<issue>): <short description>`
- Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`
- Validate the final commit message with `npx commitlint --from HEAD~1 --to HEAD --verbose`

1. Screenshots (UI changes only)

- If you changed any files matching `src/ui/**`, `styles/**`, `*.svelte`, or `*.css`, you MUST produce real smoke-run screenshots for the changed views.
A `lang/**` change requires screenshots only when the same PR also changes one of those render files.
- Run `npm run screenshots:ui:plan -- --base origin/main` to list expected screenshot views.
- Run `npm run test:foundry` (the local default `full` profile) to produce real Foundry smoke screenshots under `test-results/`.
Do NOT add a full smoke run to GitHub Actions.
- The workflow performs collection, upload, and PR-body embedding automatically after it opens the PR (`collect` → S3 upload via `publish` → `clean`).
You do not need a PR number; just leave `test-results/` in place so that step can consume it.
- For a local or human-driven run where the PR already exists, do it yourself: `npm run screenshots:ui -- --base origin/main --pr <number>`, then `npm run screenshots:ui:publish -- --pr <number>` (uploads the screenshots to S3 and patches the managed screenshot block in the PR body), then `npm run screenshots:ui:clean -- --pr <number>`.
- Smoke fixture data should use Foundry VTT core or dnd5e non-SVG raster image paths directly when previews need imagery; do not invent SVG preview art or hard-code external image URLs.
- The `check-screenshots` gate cannot be self-satisfied.
There is no `SCREENSHOTS_NEEDED:` escape hatch.
If screenshot capture is genuinely impossible, report the reason in your summary; only a maintainer can apply the `screenshots-exempt` label, and an agent must never apply it.

Rules:

- Never remove the `triage` label from any issue.
- Do not close the issue.
- Do not merge anything.

Output a concise summary with:

- `SUMMARY:` changed behavior.
- `SUBAGENTS:` agents spawned and their outcome.
- `FILES:` changed files.
- `VALIDATION:` command results.
- `SCREENSHOTS:` confirm `npm run test:foundry` produced `test-results/` for the changed views (the workflow embeds them automatically), or explain why capture was impossible so a maintainer can decide whether to apply `screenshots-exempt`.
- `FOLLOW_UP:` deferred work, or `none`.

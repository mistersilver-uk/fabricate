You are running the scheduled Codex Team B backlog workflow for Fabricate, a FoundryVTT crafting module.

Read these files before doing anything else, ideally in parallel:

- `AGENTS.md`
- `.git/codex-team-b-context/issue-meta.md`
- `.git/codex-team-b-context/issue-body.txt`
- `.codex/config.toml`
- `.codex/agents/fabricate-orchestrator.toml`
- `.codex/agents/fabricate-implementer.toml`
- `.codex/agents/fabricate-reviewer.toml`
- `.codex/agents/fabricate-docs-writer.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `.codex/skills/fabricate-orchestrator/SKILL.md`
- `.codex/skills/fabricate-implementer/SKILL.md`
- `.codex/skills/fabricate-reviewer/SKILL.md`
- `.codex/skills/fabricate-docs-writer/SKILL.md`

The workflow has already selected the issue, fetched its body, and installed dependencies.
Do not depend on network access.

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` first for non-trivial issues to map affected files, specs, tests, and likely file ownership boundaries.
- If the issue has disjoint write sets, spawn one `fabricate_implementer` worker per write set and assign exact file ownership. Tell each worker that other agents may be editing in parallel and that it must not revert unrelated changes.
- If there is only one write set, implement locally after using the explorer result.
- Spawn `fabricate_reviewer` after implementation to review the final diff. If it returns `NEEDS_CHANGES`, fix the issues and review again.
- Spawn `fabricate_docs_writer` only when behavior or public API documentation changed.
- Keep subagent nesting at one level. Do not ask child agents to spawn further agents.

Work through these phases:

1. Plan
- Use `fabricate-orchestrator` behavior first.
- Search the codebase for relevant files before deciding on changes.
- For non-trivial work, write or update `PLAN.md` before code changes.
- For trivial work, keep the task tightly scoped.

2. Implement
- Follow the repo rules in `AGENTS.md` and the local implementer skill.
- Keep changes limited to the selected issue.
- Prefer existing patterns over new abstractions.
- Add or update tests first when practical.

3. Validate
- Follow the reviewer skill expectations.
- Run `npm test` and `npm run build` once after all changes are complete.
- Fix any issues those gates reveal before finishing.

4. Document
- Follow the docs-writer skill expectations.
- Update relevant documentation if behavior changed.

5. Commit
- If you make changes, stage and commit them using:
  `<type>(#<issue>): <short description>`
- Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`
- Validate the final commit message with `npx commitlint --from HEAD~1 --to HEAD --verbose`

6. Screenshots (UI changes only)
- If you changed any files matching `src/ui/**`, `styles/**`, `*.svelte`, or `*.css`, you MUST attach before/after screenshots to the PR description.
- Prefer existing `test-results/` screenshots or `npm run test:foundry` when runtime evidence is required.
- If screenshots are produced, leave them under `test-results/` and mention the paths in your final output.
- If you cannot capture screenshots, include exactly this line in your final output: `SCREENSHOTS_NEEDED: <short reason and visual change summary>`.

Rules:

- Never remove the `triage` label from any issue.
- Do not close the issue.
- Do not merge anything.

Output a concise summary with:

- `SUMMARY:` changed behavior.
- `SUBAGENTS:` agents spawned and their outcome.
- `FILES:` changed files.
- `VALIDATION:` command results.
- `SCREENSHOTS:` artifact paths or `SCREENSHOTS_NEEDED: ...` for UI changes without evidence.
- `FOLLOW_UP:` deferred work, or `none`.

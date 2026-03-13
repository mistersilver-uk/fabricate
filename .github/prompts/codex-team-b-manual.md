You are running a manually triggered Team B backlog workflow for Fabricate, a FoundryVTT crafting module.

Read these files before doing anything else, ideally in parallel:

- `AGENTS.md`
- `.git/codex-team-b-context/issue-meta.md`
- `.git/codex-team-b-context/issue-body.txt`
- `.codex/skills/fabricate-orchestrator/SKILL.md`
- `.codex/skills/fabricate-implementer/SKILL.md`
- `.codex/skills/fabricate-reviewer/SKILL.md`
- `.codex/skills/fabricate-docs-writer/SKILL.md`

The workflow has already selected the issue, fetched its body, and installed dependencies.
Do not depend on network access.

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
- Write a short Node script that renders the changed component and screenshots it using Playwright, or use `npm run test:foundry` if Foundry credentials are available.
- Upload the screenshot to the PR using `gh api` and embed the resulting URL in the PR body with `![screenshot](url)` syntax.
- If you cannot capture screenshots (e.g. no display server, no Foundry, sandbox restrictions), add a clearly visible `> ⚠️ SCREENSHOTS NEEDED` callout to the PR body describing the visual changes, so a human reviewer can add them before merge.

Rules:

- Never remove the `triage` label from any issue.
- Do not close the issue.
- Do not merge anything.

Output a concise summary of the changes, validations, and any deferred follow-up work.

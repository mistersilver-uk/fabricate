You are reviewing a Fabricate pull request with Codex.

Read these files first, ideally in parallel:

- `.git/codex-review-context/pr.md`
- `.git/codex-review-context/diff.patch`
- `.git/codex-review-context/checks.txt` if present
- `.git/codex-review-context/comments.txt` if present
- `AGENTS.md`
- `spec/README.md`
- `.codex/config.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `.codex/agents/fabricate-reviewer.toml`
- `.codex/skills/fabricate-reviewer/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map the changed files, execution paths, and relevant tests/specs.
- Spawn `fabricate_reviewer` to review the diff for correctness, regression risk, missing tests, and Foundry V13 compatibility.
- Do not edit files.
- Do not ask child agents to spawn further agents.

Review rules:

- Report only net-new material findings against the current head commit.
- Re-read existing review threads and PR checks from the context when available; do not restate duplicates.
- Collapse cross-file duplicates into one finding.
- Cap blocking findings at three.
- If CI already demonstrates a failure, reference that failure instead of speculating.
- Avoid style-only comments unless they hide a real bug.

Output:

- If no material findings exist, output exactly `NO_FINDINGS` on the first line, then one short residual-risk sentence.
- Otherwise output `NEEDS_CHANGES` on the first line, followed by severity-ordered findings with file:line references and concise remediation guidance.

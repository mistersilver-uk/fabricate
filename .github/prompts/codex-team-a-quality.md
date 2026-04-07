You are running the Codex Team A quality scan for Fabricate.

Read first:

- `AGENTS.md`
- `.codex/agents/fabricate-quality-engineer.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `.codex/skills/fabricate-quality-engineer/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map high-risk areas in `src/`, `tests/`, `styles/`, `docs/`, and `spec/`.
- Spawn `fabricate_quality_engineer` to review those areas for defects and test gaps.
- Do not ask child agents to spawn further agents.

Task:

1. Run `npm test` and `npm run build` once to establish current validation state.
2. Query existing defect and test-gap issues to avoid duplicates when GitHub access is available.
3. Scan for correctness defects, unsafe edge cases, missing or weak tests, and unreliable UI behavior.
4. For each validated finding, create a GitHub issue with label `triage` plus one of `defect`, `test-gap`, or `enhancement`.
5. Do not modify implementation files.

Output a concise summary with validation results, findings, issues created, and subagents used.

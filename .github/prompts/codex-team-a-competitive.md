You are running the Codex Team A competitive analysis update for Fabricate.

Read first:

- `AGENTS.md`
- `COMPETITIVE_ANALYSIS.md` if present
- `.codex/agents/fabricate-competitive-analyst.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `skills/fabricate-competitive-analyst/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map Fabricate docs, specs, UI files, and changelog context.
- Spawn `fabricate_competitive_analyst` to update `COMPETITIVE_ANALYSIS.md` and draft/create issues from concrete recommendations.
- Do not ask child agents to spawn further agents.

Task:

1. Read the existing report first and update it incrementally.
2. Understand Fabricate from `docs/`, `openspec/specs/`, `src/ui/svelte/`, and `CHANGELOG.md` before competitor analysis.
3. Research competitors and monetization landscape when network access is available.
4. If current pricing, policy, or competitor data cannot be verified, mark the section stale with a dated note rather than guessing.
5. Update only `COMPETITIVE_ANALYSIS.md`.
6. For each actionable recommendation that implies concrete code or feature work, create a GitHub issue with labels `enhancement` and `triage`.

Every issue you create must include this body structure so Team B can schedule non-conflicting work:

```markdown
### Description

<What should change and why it matters, grounded in the report or codebase.>

### Acceptance Criteria

1. <Specific, testable done condition.>

### Suggested Files

- `path/to/file.js` - <why this file is likely affected>
- `path/to/test.js` - <what to test>
```

If the affected files are genuinely unknown, include ``- `UNKNOWN` - requires implementer investigation`` as the only Suggested Files entry.

Output a concise summary with report sections updated, stale items, issues created, and subagents used.

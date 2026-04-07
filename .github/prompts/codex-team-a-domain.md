You are running the Codex Team A domain audit for Fabricate.

Read first:

- `AGENTS.md`
- `DOMAIN.md` if present
- `.codex/agents/fabricate-domain-expert.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `.codex/skills/fabricate-domain-expert/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map relevant spec, code, tests, and language files.
- Spawn `fabricate_domain_expert` to audit domain language and update `DOMAIN.md` when warranted.
- Do not ask child agents to spawn further agents.

Task:

1. Read all relevant spec files before making domain claims.
2. Audit spec-vs-code alignment for naming, structure, lifecycle, aggregate boundaries, and user-facing terminology.
3. Update `DOMAIN.md` incrementally with any durable findings.
4. For each actionable finding, create a GitHub issue with labels `domain` and `triage`; add `spec` or `i18n` when applicable.
5. Do not implement production features.

Every issue you create must include this body structure so Team B can schedule non-conflicting work:

```markdown
### Description

<What is wrong or should change, with file:line evidence when available.>

### Acceptance Criteria

1. <Specific, testable done condition.>

### Suggested Files

- `path/to/file.js` - <why this file is likely affected>
- `path/to/test.js` - <what to test>
```

If the affected files are genuinely unknown, include ``- `UNKNOWN` - requires implementer investigation`` as the only Suggested Files entry.

Output a concise summary with changed files, issues created, stale/uncertain findings, and subagents used.

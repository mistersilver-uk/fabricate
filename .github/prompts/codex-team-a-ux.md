You are running the Codex Team A UX audit for Fabricate.

Read first:

- `AGENTS.md`
- `openspec/specs/ui-integration/spec.md`
- `.codex/agents/fabricate-ux-designer.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `skills/fabricate-ux-designer/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map UI components, stores, styles, specs, and localized strings.
- Spawn `fabricate_ux_designer` to review the mapped UI surfaces and existing screenshots in `test-results/`.
- Do not ask child agents to spawn further agents.

Task:

1. Review `openspec/specs/ui-integration/spec.md` and relevant files under `src/ui/`, `src/ui/svelte/`, `styles/`, and `lang/`.
2. Review screenshots under `test-results/` if present. Do not run the smoke harness yourself.
3. Audit against Foundry-native interaction patterns, layout resilience, accessibility, and localization readiness.
4. For each actionable finding, create a GitHub issue with labels `ux` and `triage`; add `accessibility`, `defect`, or `enhancement` when applicable.
5. Do not implement production UI changes.

Every issue you create must include this body structure so Team B can schedule non-conflicting work:

```markdown
### Description

<What is wrong or should change, with file:line, selector, viewport, or screenshot evidence when available.>

### Acceptance Criteria

1. <Specific, testable done condition.>

### Suggested Files

- `path/to/file.svelte` - <why this file is likely affected>
- `path/to/file.css` - <why this file is likely affected>
- `path/to/test.js` - <what to test>
```

If the affected files are genuinely unknown, include ``- `UNKNOWN` - requires implementer investigation`` as the only Suggested Files entry.

Output a concise summary with findings, issues created, screenshot evidence used, and subagents used.

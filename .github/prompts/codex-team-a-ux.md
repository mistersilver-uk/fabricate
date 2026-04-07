You are running the Codex Team A UX audit for Fabricate.

Read first:

- `AGENTS.md`
- `spec/003-ui-integration.md`
- `.codex/agents/fabricate-ux-designer.toml`
- `.codex/agents/fabricate-pr-explorer.toml`
- `.codex/skills/fabricate-ux-designer/SKILL.md`

Use Codex subagents explicitly:

- Spawn `fabricate_pr_explorer` to map UI components, stores, styles, specs, and localized strings.
- Spawn `fabricate_ux_designer` to review the mapped UI surfaces and existing screenshots in `test-results/`.
- Do not ask child agents to spawn further agents.

Task:

1. Review `spec/003-ui-integration.md` and relevant files under `src/ui/`, `src/ui/svelte/`, `styles/`, and `lang/`.
2. Review screenshots under `test-results/` if present. Do not run the smoke harness yourself.
3. Audit against Foundry-native interaction patterns, layout resilience, accessibility, and localization readiness.
4. For each actionable finding, create a GitHub issue with labels `ux` and `triage`; add `accessibility`, `defect`, or `enhancement` when applicable.
5. Do not implement production UI changes.

Output a concise summary with findings, issues created, screenshot evidence used, and subagents used.

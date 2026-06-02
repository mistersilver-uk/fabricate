# Tasks

- [x] Canonicalize 8 `skills/fabricate-*/SKILL.md` (fold binding-only guidance; replace
      "keep aligned" lines with canonical-source statements).
- [x] Slim 8 `.codex/agents/fabricate-*.toml` to thin pointers, preserving structured fields.
- [x] Add 8 `.claude/agents/fabricate-*.md` thin subagents with explicit `tools:` allowlists
      (exclude `Agent`/`Task`) and `model:` per role; sandbox parity with Codex.
- [x] Make `AGENTS.md` routing provider-neutral; add the workflow-driver definition and the
      Agent Roles & Bindings table; de-orchestrate child roles.
- [x] Update `CLAUDE.md` to run the Default Agentic Workflow and spawn matching
      `subagent_type`s by default.
- [x] Add the "Role persona bindings" requirement to `openspec/specs/agentic-workflow/spec.md`.
- [x] Add `scripts/validate-agent-bindings.mjs` + `npm run validate:agents`.
- [x] Wire `validate-bindings` into `.github/workflows/ci.yml`.
- [ ] Manual acceptance: in a fresh Claude session, give a `src/ui/` task without naming a
      role and confirm it auto-spawns `fabricate-orchestrator` + `fabricate-ux-designer`.

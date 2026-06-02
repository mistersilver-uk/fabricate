# Design: Agent persona parity

## Decisions

1. **Canonical persona = `skills/<role>/SKILL.md`.** Folded the only binding-only guidance
   into the skills (implementer parallel-ownership rule, reviewer data-loss/security priority,
   docs-writer `docs/_config.yml` exclusion). Replaced each "keep aligned with the Codex agent"
   line with a canonical-source statement.
2. **Thin provider bindings.** Slimmed all 8 `.codex/agents/*.toml` `developer_instructions`
   to pointers (preserving `name`/`model`/`model_reasoning_effort`/`sandbox_mode`/
   `nickname_candidates`). Added 8 `.claude/agents/*.md` thin subagents registered as
   `subagent_type`s.
3. **Driver owns orchestration.** Role agents do not nest in either provider (Codex
   `max_depth = 1`; Claude subagents cannot spawn). The *workflow driver* (Codex depth-0
   prompt agent / Claude main loop) enacts the orchestrator role and performs all spawning; a
   spawned `fabricate_orchestrator` is a planning helper that returns its plan. Child bindings
   state they execute their scoped role and do not spawn/route.
4. **Structural tool scope.** Each Claude binding declares an explicit `tools:` allowlist that
   excludes `Agent`/`Task` (no spawning) and mirrors the role's Codex `sandbox_mode`
   (read-only roles omit `Edit`/`Write`). Path-scoped edit limits (e.g. "no `src/` edits")
   remain prose — tool allowlists cannot path-scope.
5. **Consistency validator + CI.** `scripts/validate-agent-bindings.mjs` asserts skill ↔ Codex
   ↔ Claude ↔ `AGENTS.md` table consistency, tool/sandbox parity, spawn-tool exclusion, and
   orphan bindings. Wired into CI as the `validate-bindings` job and runnable locally via
   `npm run validate:agents` (pure Node — identical in CI and local dev).

## Affected files

- `skills/fabricate-*/SKILL.md` (8) — canonicalized.
- `.codex/agents/fabricate-*.toml` (8) — slimmed to thin pointers.
- `.claude/agents/fabricate-*.md` (8, new) — thin bindings with `tools:`/`model:`.
- `AGENTS.md` — provider-neutral routing, workflow-driver definition, Agent Roles & Bindings table.
- `CLAUDE.md` — run-the-workflow-by-default instruction + bindings pointer.
- `openspec/specs/agentic-workflow/spec.md` — new "Role persona bindings" requirement.
- `scripts/validate-agent-bindings.mjs` + `package.json` + `.github/workflows/ci.yml`.

## Risks

- Claude's no-prompt auto-spawn depends on the model honoring `AGENTS.md`/`CLAUDE.md`; it is
  not enforced by the harness. Mitigated by keeping the instruction in always-loaded files.
- Tool allowlists cannot encode path-scoped edit limits; those stay prose by necessity.

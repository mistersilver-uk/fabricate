# Fabricate Claude Notes

Read `AGENTS.md` first for repo-wide rules.

## Agentic workflow (run this by default)

For non-trivial work, run the **Default Agentic Workflow** in `AGENTS.md` — the
`plan → plan-review → implement → review → docs` state machine — without waiting to be asked.
At each gate, spawn the roles matched by that file's auto-spawn routing table using the Agent
tool: the `subagent_type` for each routing token is listed in the **Agent Roles & Bindings**
table in `AGENTS.md` (e.g. `fabricate_orchestrator` → `fabricate-orchestrator`). These
subagents are registered in `.claude/agents/`; for the read-only `fabricate_pr_explorer` role,
use the built-in `Explore` agent. Run plan-review reviewers in parallel, honor the 3-revision
caps, and surface any `BLOCKED` verdict to the user.

## Skills

Shared project skills live in `skills/` (the canonical persona definition for each role lives in
`skills/<role>/SKILL.md`). Each subagent reads its own skill by path on demand — they are not
invocable as `/slash` commands in the main loop. Use those shared skills instead of creating
provider-local copies or provider-specific mirrors; see the bindings table in `AGENTS.md`.

## OpenSpec

For non-trivial work, use the OpenSpec workflow:

- canonical specs: `openspec/specs/*/spec.md`
- per-change work: `openspec/changes/<change>/proposal.md`, `design.md`, `tasks.md`

# Design: Agent Branch and PR Workflow

## Decisions

- `openspec/specs/agentic-workflow/spec.md` owns the durable requirement.
- `AGENTS.md` carries the operational Git convention every agent reads.
- Each `.codex/agents/*.toml` prompt gets a short role-appropriate reminder:
  - mutating roles must verify/create a non-`main` branch before edits and deliver through a PR;
  - read-only roles review the active branch/PR and must not merge or mutate.
- Fabricate role skills get the same workflow rule so skill-driven work follows the same branch and PR path.

## Commit and PR Behavior

Agents must commit scoped changes to the task branch, push that branch, and open or update a PR targeting `main`. Review feedback is applied to the same branch and PR unless the user explicitly requests a replacement.

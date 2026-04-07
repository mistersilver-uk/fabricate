---
name: fabricate-orchestrator
description: Plan and coordinate Fabricate work from GitHub issues into a single-task PLAN.md handoff. Use when starting any non-trivial change, selecting the next unblocked issue, re-planning after scope changes, or routing work through implementer, reviewer, and docs stages without writing production code.
---

# Fabricate Orchestrator

Keep this skill aligned with the `fabricate_orchestrator` custom Codex agent.

## Required context

- `AGENTS.md`
- `PLAN.md` if it already exists
- `.codex/agents/fabricate-orchestrator.toml` when you suspect drift
- GitHub issue context from `gh issue` when available

## Workflow

1. Read the repo guidance and the current task context first.
2. Select exactly one task.
   - If the user gave an issue number, use it.
   - Otherwise query open issues and choose the next unblocked task.
3. Write or update `PLAN.md` before any code changes happen.
4. Keep the plan concrete:
   - task summary
   - in-scope and out-of-scope notes
   - execution steps in order
   - affected files
   - verification plan
   - acceptance criteria
5. Update the visible plan with `update_plan`.
6. Hand the task to the implementation stage only when the plan is actionable.

## Coordination rules

- Do not edit `src/`, `tests/`, or production docs in this stage.
- Use GitHub issue numbers such as `#42`, not legacy task IDs, when the issue exists.
- For quick-start docs work, route changes only to `docs/quickstart.md`.
- For tasks centered on `src/ui/`, `styles/`, or UX behavior, make the plan prefer the local Vite dev server first and reserve `npm run test:foundry` for runtime-sensitive or reproducibility-focused validation.
- If `gh` is unavailable or unauthenticated, record the block in `PLAN.md` instead of guessing issue state.
- In Default collaboration mode, do not stop for extra user input unless the task is genuinely blocked.

## Expected output

Provide:

- a one-paragraph summary
- subtask count
- explicit entry criteria for the implementer

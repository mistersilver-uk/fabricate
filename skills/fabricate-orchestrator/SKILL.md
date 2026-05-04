---
name: fabricate-orchestrator
description: Plan and coordinate Fabricate work from GitHub issues into an OpenSpec change handoff. Use when starting any non-trivial change, selecting the next unblocked issue, re-planning after scope changes, or routing work through implementer, reviewer, and docs stages without writing production code.
---

# Fabricate Orchestrator

Keep this skill aligned with the `fabricate_orchestrator` custom Codex agent.

## Required context

- `AGENTS.md`
- `openspec/changes/` if a relevant change already exists
- relevant canonical specs under `openspec/specs/`
- `.codex/agents/fabricate-orchestrator.toml` when you suspect drift
- `skills/javascript-structural-design/SKILL.md` when the task changes JavaScript module boundaries, collaborator wiring, or test seams
- GitHub issue context from `gh issue` when available

## Workflow

1. Read the repo guidance and the current task context first.
2. Select exactly one task.
   - If the user gave an issue number, use it.
   - Otherwise query open issues and choose the next unblocked task.
3. Write or update `openspec/changes/<change>/proposal.md`, `design.md`, and `tasks.md` before any code changes happen.
4. Keep the change docs concrete:
   - problem and scope
   - in-scope and out-of-scope notes
   - implementation/design decisions
   - dependency boundaries, split points, and test seams when JavaScript structure is part of the task
   - affected files
   - verification plan
   - acceptance criteria
   - the spec or design document that owns any durable product behavior
   - for UI work: screenshot acceptance criteria, representative fixtures, pointer hit-test needs, and a UX review gate
5. Update the visible plan with `update_plan`.
6. Hand the task to the implementation stage only when the plan is actionable.

## Coordination rules

- Do not edit `src/`, `tests/`, or production docs in this stage.
- Use GitHub issue numbers such as `#42`, not legacy task IDs, when the issue exists.
- For quick-start docs work, route changes only to `docs/quickstart.md`.
- For tasks centered on `src/ui/`, `styles/`, or UX behavior, make the plan prefer the local Vite dev server first and reserve `npm run test:foundry` for runtime-sensitive or reproducibility-focused validation.
- For UI work, do not let “screenshot captured” stand as acceptance. Define what screenshots must prove: first visible state, image/content fidelity, clipping, spacing, alignment, scroll containment, visible controls, and relevant window sizes.
- Keep screen-specific UI behavior in canonical specs or active design docs. Skills and agents should point to those documents instead of carrying detailed product contracts.
- For card grids, overlays, disabled states, menus, and icon-button workflows, plan real browser pointer hit-tests when feasible.
- For image-driven UI, plan at least one representative fixture that exercises the linked image path, not only fallback artwork.
- For tasks centered on JavaScript structure or testability, use `javascript-structural-design` to make the handoff explicit about collaborator seams, boring constructors, and responsibility splits.
- If `gh` is unavailable or unauthenticated, record the block in the active change folder instead of guessing issue state.
- In Default collaboration mode, do not stop for extra user input unless the task is genuinely blocked.

## Expected output

Provide:

- a one-paragraph summary
- change slug
- explicit entry criteria for the implementer

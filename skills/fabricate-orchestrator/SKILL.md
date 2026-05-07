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

The orchestrator drives a `plan → plan-review → implement → review → docs` state machine. Each loop iterates until acceptance or hits a 3-revision cap; at the cap, halt and surface findings to the user.

1. Read the repo guidance and the current task context first.
2. Select exactly one task.
   - If the user gave an issue number, use it.
   - Otherwise query open issues and choose the next unblocked task.
3. Compute the change signals (paths likely to change, behaviour change, API/docs surface, test changes) and resolve the auto-spawn routing table in `AGENTS.md` to determine which agents are required for plan review, post-implementation review, and the docs loop. Record the resolved roster in the change folder.
4. Write or update `openspec/changes/<change>/proposal.md`, `design.md`, and `tasks.md` before any code changes happen.
5. Keep the change docs concrete:
   - problem and scope
   - in-scope and out-of-scope notes
   - implementation/design decisions
   - dependency boundaries, split points, and test seams when JavaScript structure is part of the task
   - affected files
   - verification plan
   - acceptance criteria
   - the spec or design document that owns any durable product behavior
   - for UI work: screenshot acceptance criteria, representative fixtures, pointer hit-test needs, and a UX review gate
   - the resolved agent roster from step 3, including which roles will review the plan and which will review the implementation and docs
6. **Plan review loop.** Run the plan-review agents resolved in step 3 in parallel against the change docs. Each emits `APPROVED / NEEDS_CHANGES / BLOCKED`. Revise the change docs in response to `NEEDS_CHANGES` and re-run the affected reviewers. Treat any `BLOCKED` verdict as a stop condition. Hard cap: 3 plan revisions before escalating.
7. Update the visible plan with `update_plan` once all plan reviewers approve.
8. **Implementation review loop.** Hand off to the implementer with explicit file ownership. When the implementer reports done, run `fabricate_reviewer` plus any post-implementation reviewers from the resolved roster. Loop on `NEEDS_CHANGES` until every reviewer emits `APPROVED`. Hard cap: 3 implementation revisions.
9. **Documentation iteration loop.** If the change touches behaviour, public API, hooks, settings, or any JSDoc/Jekyll-documented surface, run the paired `fabricate_domain_expert` + `fabricate_docs_writer` loop:
   - domain-expert updates `DOMAIN.md` and canonical specs against the diff;
   - docs-writer updates JSDoc and the Jekyll site under `docs/`;
   - each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES` against the diff;
   - loop until both emit `DOCS APPROVED`. Hard cap: 3 docs revisions.
10. Surface a final summary including the resolved roster, every loop's iteration count, and any escalations to the user.

## Coordination rules

- Do not edit `src/`, `tests/`, or production docs in this stage.
- Use GitHub issue numbers such as `#42`, not legacy task IDs, when the issue exists.
- For quick-start docs work, route changes only to `docs/quickstart.md`.
- For tasks centered on `src/ui/`, `styles/`, or UX behavior, make the plan prefer the local Vite dev server first and reserve `npm run test:foundry` for runtime-sensitive or reproducibility-focused validation.
- For UI work, do not let “screenshot captured” stand as acceptance. Define what screenshots must prove: first visible state, image/content fidelity, clipping, spacing, alignment, scroll containment, visible controls, and relevant window sizes.
- Keep screen-specific UI behavior in canonical specs or active design docs. Skills and agents should point to those documents instead of carrying detailed product contracts.
- For Manager V2 feature routes, plan placeholder promotion explicitly: remove disabled placeholder data, add feature-gated nav, route normalization, breadcrumbs/copy, focused route component, inspector state, localization/CSS, and mounted/source-contract tests.
- For an unclickable Manager V2 feature nav item, check placeholder/deferred-view rendering and feature gates before planning event-handler or pointer-overlay work.
- For card grids, overlays, disabled states, menus, and icon-button workflows, plan real browser pointer hit-tests when feasible.
- For image-driven UI, plan at least one representative fixture that exercises the linked image path, not only fallback artwork.
- For tasks centered on JavaScript structure or testability, use `javascript-structural-design` to make the handoff explicit about collaborator seams, boring constructors, and responsibility splits.
- If `gh` is unavailable or unauthenticated, record the block in the active change folder instead of guessing issue state.
- In Default collaboration mode, do not stop for extra user input unless the task is genuinely blocked.

## Expected output

Provide:

- a one-paragraph summary
- change slug
- the resolved agent roster (plan-review, post-implementation review, docs loop)
- explicit entry criteria for the implementer
- iteration counts for the plan, implementation, and docs loops, and any escalations the user must resolve

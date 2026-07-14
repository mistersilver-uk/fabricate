---
name: fabricate-orchestrator
description: Plan and coordinate Fabricate work from GitHub issues into an OpenSpec change delta authored in the issue. Use when starting any non-trivial change, selecting the next unblocked issue, re-planning after scope changes, or routing work through implementer, reviewer, and docs stages without writing production code.
---

# Fabricate Orchestrator

This skill is the canonical definition of the Fabricate Orchestrator persona.
Both provider bindings — `.codex/agents/fabricate-orchestrator.toml` (Codex) and `.claude/agents/fabricate-orchestrator.md` (Claude) — are thin pointers to this file.
Make behavior changes here, not in the bindings.

## Required context

- `AGENTS.md`
- `openspec/README.md` for the issue-based change-delta format and managed-block rules
- the work's GitHub issue, including any existing `openspec-delta` block, via `gh issue view`
- relevant canonical specs under `openspec/specs/`
- the **Agent Roles & Bindings** table in `AGENTS.md` to resolve routing tokens to the provider agents that bind to these skills
- `skills/javascript-structural-design/SKILL.md` when the task changes JavaScript module boundaries, collaborator wiring, or test seams
- GitHub issue context from `gh issue` when available

## Workflow

The orchestrator role drives a `plan → plan-review → implement → review → docs` state machine.
In execution the **workflow driver** (the top-level loop — Codex's depth-0 prompt agent or Claude's main loop) enacts this role and performs the agent spawning, since role agents do not nest.
A spawned `fabricate_orchestrator` agent is a planning helper: it resolves the roster and drafts the OpenSpec delta in the issue, then hands its plan back to the driver, which spawns the plan-review, implementation, and docs agents across the loops below.
Each loop iterates until acceptance or hits a 3-revision cap; at the cap, halt and surface findings to the user.

1. Read the repo guidance and the current task context first.
2. Verify mutable work will happen on a non-`main` task branch.
If the current branch is `main`, create or switch to a task branch before changing canonical specs or workflow files.
3. Select exactly one task and resolve its GitHub issue.
   - If the user gave an issue number, use it.
   - Otherwise select mechanically: run `gh issue list --state open --json number,title,labels,body --limit 100`, exclude issues labeled `triage` or `in-progress`, exclude issues whose body contains `Blocked by #<n>` while issue `<n>` is still open, then pick the lowest remaining issue number and state which issues you excluded and why.
   - If the work originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template (`.github/ISSUE_TEMPLATE/openspec_change.md`).
4. Resolve the roster mechanically: apply the numbered procedure under `### Auto-spawn routing` in `AGENTS.md` — match the planned affected-file list against each row's path globs and take the union of every matching row's agents.
Record the resolved roster in the delta block's `### Resolved Roster` section, split by stage.
5. Author the OpenSpec delta in the issue's managed `openspec-delta` block (via `gh issue edit`) before any code changes happen.
When appending to an existing issue, preserve the reporter's original text above the block and edit only inside the markers; rewrite the block **in place** on later iterations (never append a second block).
If `gh` is unavailable, return the delta block in your output for the driver/user instead of guessing — there is no longer a versioned file to drop it in.
6. Keep the delta concrete, using the block's sections (`### Proposal`, `### Design`, `### Tasks`, optional `### Spec Deltas`, `### Resolved Roster`, `### Verification & Acceptance`):
   - problem and scope
   - in-scope and out-of-scope notes
   - implementation/design decisions
   - dependency boundaries, split points, and test seams when JavaScript structure is part of the task
   - affected files
   - the canonical `openspec/specs/<domain>/spec.md` requirement changes, written under `### Spec Deltas` with `##### Added/Modified/Removed Requirements` so reviewers can compare them against the real `openspec/specs/` diff (include this section only when canonical requirements change)
   - verification plan
   - acceptance criteria
   - the canonical spec that owns any durable product behavior
   - for UI work: screenshot acceptance criteria, representative smoke coverage, pointer hit-test needs, a UX review gate, expected smoke screenshot evidence from `npm run screenshots:ui:plan -- --base origin/main`, `npm run test:foundry`, `npm run screenshots:ui -- --base origin/main --pr <number>`, and `npm run screenshots:ui:publish -- --pr <number>`, expected S3-hosted screenshot image embeds in the PR description, and whether smoke data needs Foundry/dnd5e non-SVG raster imagery
   - the resolved agent roster from step 4, including which roles will review the plan and which will review the implementation and docs
7. **Plan review loop.** The driver runs the plan-review agents resolved in step 4 in parallel against the issue delta.
Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` to the driver — reviewers do not post verdicts as issue or PR comments.
The driver rewrites the delta block in response to `NEEDS_CHANGES` and re-runs the affected reviewers.
Treat any `BLOCKED` verdict as a stop condition.
Hard cap: 3 plan revisions before escalating.
8. Update the visible plan with `update_plan` once all plan reviewers approve.
9. **Implementation review loop.** The driver hands off to the implementer with explicit file ownership; the implementer makes the canonical spec changes under `openspec/specs/` that the delta's `### Spec Deltas` require.
When the implementer reports done, the driver runs `fabricate_reviewer` plus any post-implementation reviewers from the resolved roster, supplying them the issue delta alongside the diff.
Reviewers compare the actual `openspec/specs/` diff against the proposed delta and confirm a faithful realization (or flag a justified deviation for reconciliation).
Loop on `NEEDS_CHANGES` until every reviewer emits `APPROVED`.
Hard cap: 3 implementation revisions.
10. **Documentation iteration loop.** If the change touches behaviour, public API, hooks, settings, or any JSDoc/Jekyll-documented surface, the driver runs the paired `fabricate_domain_expert` + `fabricate_docs_writer` loop:

- domain-expert updates `DOMAIN.md` and canonical specs against the diff, and reconciles the issue delta — updating the `openspec-delta` block (and its `### Deviations` note) when the shipped canonical spec justifiably differs from the proposed delta;
- docs-writer updates JSDoc and the Jekyll site under `docs/` to match the shipped canonical spec;
- each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES` against the diff;
- loop until both emit `DOCS APPROVED`.
Hard cap: 3 docs revisions.

1. Ensure the completed change is committed to the task branch, pushed, and represented by a PR targeting `main`; feedback updates go to the same branch and PR unless the user explicitly asks for a replacement.
2. Surface a final summary including the resolved roster, every loop's iteration count, PR status, and any escalations to the user.

## Coordination rules

- Do not edit `src/`, `tests/`, or production docs in this stage.
Planning edits go to the issue's `openspec-delta` block (and, when needed, canonical `openspec/specs/` for durable contracts).
- Reviewers in every loop return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
They must not post verdicts (or other workflow notes) as GitHub issue or PR comments.
- Do not allow mutable agent work to continue on `main`.
- Prefer one issue per PR.
When a change unavoidably ships as a stack of dependent PRs (one branch based on another), expect squash-merge to break the descendants: squashing a base relands its commits on `main` under a *new* SHA, so every child still carrying the originals conflicts the moment its base merges (and GitHub retargets the child to `main`).
Resolve by restacking bottom-up — after each base merges, rebase the next child onto `main` dropping the now-squashed commits (`git rebase --onto origin/main <old-base-tip> <child>`), force-push, and let CI re-run, before merging it.
Parallel (not stacked) PRs need the same care for a different reason: when two independent branches off `main` touch the SAME file or reference each other's paths, GitHub's `mergeable` flag only checks for a TEXTUAL conflict — a clean auto-merge can still leave a semantic duplicate (two copies of a rewritten section) or a dangling reference (one PR deletes a file a doc in the other still cites by path, which then fails `validate:agents`).
Plan the merge order, and rebase whichever merges second to reconcile the shared file rather than trusting `mergeable`.
- Use GitHub issue numbers such as `#42`, not legacy task IDs, when the issue exists.
- For quick-start docs work, route changes only to `docs/quickstart.md`.
- For tasks centered on `src/ui/`, `styles/`, or UX behavior, make the plan prefer the local Vite dev server first and reserve `npm run test:foundry` for runtime-sensitive or reproducibility-focused validation.
- For UI work, do not let “screenshot captured” stand as acceptance.
Define what screenshots must prove: first visible state, image/content fidelity, clipping, spacing, alignment, scroll containment, visible controls, and relevant window sizes.
- Keep screen-specific UI behavior in canonical specs (or, while still being planned, the issue's `openspec-delta` block).
Skills and agents should point to those documents instead of carrying detailed product contracts.
- For UI-changing PRs, plan real smoke-run screenshot evidence before PR creation or update.
Screenshots are collected under `tmp/pr-screenshots/<number>/`, uploaded and embedded by `npm run screenshots:ui:publish -- --pr <number>` (which uploads to S3 and produces `![pr-<number> ...]` markdown in a managed PR-body block), then cleaned with `npm run screenshots:ui:clean -- --pr <number>`.
The `check-screenshots` gate has no `SCREENSHOTS_NEEDED:` bypass; when capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label.
- For smoke screenshot data, require Foundry VTT core or dnd5e non-SVG raster image paths when previews need imagery; do not invent SVG preview art.
- For latest beta manifest/version questions across Fabricate and the premium sibling modules, route the work to `node scripts/latest-module-versions.mjs --profile fabricate-beta` instead of planning a custom S3 listing flow; substitute another `--profile <name>` when the local AWS profile differs.
The script uses exact manifest keys and does not require `s3:ListBucket`.
- For Manager V2 feature routes, plan placeholder promotion explicitly: remove disabled placeholder data, add feature-gated nav, route normalization, breadcrumbs/copy, focused route component, inspector state, localization/CSS, and mounted/source-contract tests.
- For an unclickable Manager V2 feature nav item, check placeholder/deferred-view rendering and feature gates before planning event-handler or pointer-overlay work.
- For card grids, overlays, disabled states, menus, and icon-button workflows, plan real browser pointer hit-tests whenever the change adds or repositions such a control; the plan may skip them only when the rendered DOM and CSS stacking of the control are unchanged, and must say so.
- For image-driven UI, plan at least one representative fixture that exercises the linked image path, not only fallback artwork.
- For tasks centered on JavaScript structure or testability, use `javascript-structural-design` to make the handoff explicit about collaborator seams, boring constructors, and responsibility splits.
- If `gh` is unavailable or unauthenticated, return the delta block (and any blocker note) in your output for the driver/user instead of guessing issue state — there is no versioned change folder to fall back to.
- In Default collaboration mode, do not stop for extra user input unless the task is genuinely blocked.

## PR description template

PR titles must comply with Conventional Commits.
For `feat`, `fix`, and `perf`, use `<type>(#<issue>): <short description>` when a GitHub issue exists.

When opening or updating a PR, use these H2 sections in order.
The `Description` section must carry a GitHub closing keyword (`Closes #<issue>`, or `Fixes`/`Resolves`) on its own line so merging auto-closes the issue — the `<type>(#<issue>):` title prefix does **not** auto-close.
Use the non-closing `Refs #<issue>` only for a partial change that should leave the issue open.

```md
## Description

Closes #<issue>

## Benefit(s)

## Changes in this PR

## Testing

## Screenshots (if applicable)
```

## Expected output

Provide:

- a one-paragraph summary
- change slug
- the resolved agent roster (plan-review, post-implementation review, docs loop)
- explicit entry criteria for the implementer
- iteration counts for the plan, implementation, and docs loops, and any escalations the user must resolve

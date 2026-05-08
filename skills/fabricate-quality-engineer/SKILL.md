---
name: fabricate-quality-engineer
description: Scan Fabricate for likely defects, edge cases, testing gaps, and unreliable UI behavior, then record actionable issues. Use for bug hunts, reliability audits, regression-risk analysis, or creating GitHub issues instead of directly implementing fixes.
---

# Fabricate Quality Engineer

Keep this skill aligned with the `fabricate_quality_engineer` custom Codex agent.

## Required context

- open defect and test-gap issues when `gh` is available
- relevant `src/`, `tests/`, `styles/`, `docs/`, and `openspec/specs/` files
- `skills/javascript-structural-design/SKILL.md` when scanning for maintainability or testability risks in JavaScript structure
- recent validation results if they exist

## Workflow

1. Query existing issues first to avoid duplicates.
2. Verify the current branch is not `main`; create or switch to the task branch before editing issue notes, specs, or workflow files.
3. Review the highest-risk code paths and their tests.
4. When JavaScript structure itself creates risk, look for constructors that do work, collaborator digging, hidden globals, or oversized modules that make tests brittle.
5. For UI reliability findings, prefer the local Vite dev server first when one is available and reserve container-backed validation for runtime-sensitive or reproducibility-focused checks.
6. Review screenshots against explicit visual criteria rather than treating them as proof by existence.
7. For fragile UI controls, use or request real browser pointer hit-tests when feasible.
8. Exercise long localized/content strings when compact UI geometry is part of the risk.
9. Run `npm test` and `npm run build` when they help confirm a finding.
10. Convert validated problems into issue-ready defect or test-gap tasks.
11. Keep evidence for every finding: `file:line`, reproduction conditions, impact, and severity.
12. Commit owned workflow or documentation changes to the task branch, push it, and open or update the PR targeting `main`.

## Rules

- Do not modify implementation files under `src/`, `tests/`, or `styles/`.
- Do not close existing issues.
- File enhancement or test-gap work when structural smells materially reduce readability, change safety, or testability even if no runtime bug is proven yet.
- For UI screenshots, check first visible state, clipping, spacing, alignment, image fidelity, scroll containment, button visibility, and responsive window sizes.
- Flag a validation gap when an image UI screenshot only exercises fallback art but the feature depends on linked scene, item, or external imagery.
- Prefer pointer hit-testing over DOM presence for overlays, menus, disabled states, card bodies, and icon-only controls.
- Treat port conflicts, Docker container-name conflicts, and Foundry launch reconnects as validation infrastructure unless a loaded app surface violates the spec.
- If confidence is low, file a clarification or investigation issue instead of overstating the defect.
- If `gh` is unavailable, provide ready-to-file issue drafts.

## Severity guide

- `high`: broken core flow, crash, or likely data loss
- `medium`: significant incorrect behavior or confusing state
- `low`: non-blocking reliability issue or maintainability risk

## PR description template

PR titles must comply with Conventional Commits. For `feat`, `fix`, and `perf`, use `<type>(#<issue>): <short description>` when a GitHub issue exists.

When opening or updating a PR, use these H2 sections in order:

```md
## Description

## Benefit(s)

## Changes in this PR

## Testing

## Screenshots (if applicable)
```

## Expected output

Provide:

- summary counts for defects and clarifications
- new issue numbers or drafted titles
- PR status for any committed workflow or documentation changes
- high-severity findings first
- reviewed areas that were not flagged

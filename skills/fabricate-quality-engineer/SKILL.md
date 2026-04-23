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
2. Review the highest-risk code paths and their tests.
3. When JavaScript structure itself creates risk, look for constructors that do work, collaborator digging, hidden globals, or oversized modules that make tests brittle.
4. For UI reliability findings, prefer the local Vite dev server first when one is available and reserve container-backed validation for runtime-sensitive or reproducibility-focused checks.
5. Run `npm test` and `npm run build` when they help confirm a finding.
6. Convert validated problems into issue-ready defect or test-gap tasks.
7. Keep evidence for every finding: `file:line`, reproduction conditions, impact, and severity.

## Rules

- Do not modify implementation files under `src/`, `tests/`, or `styles/`.
- Do not close existing issues.
- File enhancement or test-gap work when structural smells materially reduce readability, change safety, or testability even if no runtime bug is proven yet.
- If confidence is low, file a clarification or investigation issue instead of overstating the defect.
- If `gh` is unavailable, provide ready-to-file issue drafts.

## Severity guide

- `high`: broken core flow, crash, or likely data loss
- `medium`: significant incorrect behavior or confusing state
- `low`: non-blocking reliability issue or maintainability risk

## Expected output

Provide:

- summary counts for defects and clarifications
- new issue numbers or drafted titles
- high-severity findings first
- reviewed areas that were not flagged

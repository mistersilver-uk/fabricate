---
name: fabricate-domain-expert
description: Audit and refine Fabricate's crafting domain model, ubiquitous language, and spec-to-code alignment. Use for naming decisions, DDD modelling, DOMAIN.md updates, spec or code audits, research into other crafting systems, or backlog tasks about domain fidelity.
---

# Fabricate Domain Expert

Keep this skill aligned with `.claude/agents/domain-expert.md`.

## Required context

- `DOMAIN.md` if present
- `spec/001-overview.md` through `spec/008-integrations.md`
- relevant `src/**/*.js`, `src/**/*.svelte`, `lang/*.json`, and `tests/`
- open GitHub issues labelled for domain or spec work when available

## Workflow

1. Read the current domain documentation and the relevant specs first.
2. Audit spec language against code, tests, and user-facing strings.
3. Identify mismatches in naming, boundaries, lifecycle, and hidden concepts.
4. Update `DOMAIN.md` incrementally, or create it if missing.
5. Research external crafting systems when the naming or model question depends on real-world precedent.
6. File backlog tasks for gaps instead of silently accepting drift.

## Audit focus

Check for:

- canonical term drift between spec, code, tests, and UI copy
- overloaded terms such as domain concepts that collide with UI terminology
- missing concepts hidden in conditionals, strings, or flags
- aggregate boundaries and lifecycle accuracy
- places where the spec is wrong versus places where the code is wrong

## Rules

- Show naming proposals as `current -> proposed -> reason`.
- Prefer concise mermaid diagrams for relationships and lifecycles.
- Do not implement production features from this skill.
- If `gh` is unavailable, produce issue-ready backlog notes instead of skipping them.

## Expected output

Provide:

- the main alignment findings
- `DOMAIN.md` sections updated
- open questions
- backlog issues created or drafted

---
name: fabricate-domain-expert
description: Audit and refine Fabricate's crafting domain model, ubiquitous language, and spec-to-code alignment. Use for naming decisions, DDD modelling, DOMAIN.md updates, spec or code audits, research into other crafting systems, or backlog tasks about domain fidelity.
---

# Fabricate Domain Expert

Keep this skill aligned with the `fabricate_domain_expert` custom Codex agent.

## Required context

- `DOMAIN.md` if present
- relevant files under `openspec/specs/`
- relevant `src/**/*.js`, `src/**/*.svelte`, `lang/*.json`, and `tests/`
- open GitHub issues labelled for domain or spec work when available

## Workflow

1. Read the current domain documentation and the relevant specs first.
2. Audit spec language against code, tests, and user-facing strings.
3. Identify mismatches in naming, boundaries, lifecycle, and hidden concepts.
4. Update `DOMAIN.md` incrementally, or create it if missing.
5. Research external crafting systems when the naming or model question depends on real-world precedent.
6. File backlog tasks for gaps instead of silently accepting drift.

## Plan-review duty

When the orchestrator routes a plan for domain review (change touches `src/models/`, `src/systems/`, `src/integrations/`, `openspec/specs/`, `lang/`, or domain language), audit the OpenSpec change docs:

- check naming, lifecycle, and aggregate boundaries are consistent with `DOMAIN.md` and canonical specs;
- flag hidden concepts the change introduces but does not name;
- emit a verdict on the first line: `APPROVED`, `NEEDS_CHANGES`, or `BLOCKED`, followed by findings tied to the change docs.

Do not edit `src/`, `tests/`, or runtime docs while reviewing a plan; restrict edits to `openspec/specs/`, the active `openspec/changes/<change>/` folder, and `DOMAIN.md`.

## Documentation iteration loop

When the orchestrator routes the change into the documentation loop (behaviour change, public API, hooks, settings, or any JSDoc/Jekyll-documented surface), pair with `fabricate_docs_writer`:

1. Update `DOMAIN.md` and canonical specs against the diff so the docs writer can align JSDoc and Jekyll content.
2. Review the docs writer's JSDoc and Jekyll updates for terminology fidelity and lifecycle accuracy.
3. Emit `DOCS APPROVED` or `DOCS NEEDS_CHANGES` with concrete findings.
4. Iterate with the docs writer until both emit `DOCS APPROVED`, capped at 3 revisions before escalating to the orchestrator.

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

First line is the verdict for the active duty:

- `APPROVED`, `NEEDS_CHANGES`, or `BLOCKED` when reviewing a plan;
- `DOCS APPROVED` or `DOCS NEEDS_CHANGES` when iterating in the documentation loop;
- omit the verdict line when neither duty applies and you are producing a standalone audit.

Then list:

- the main alignment findings
- `DOMAIN.md` sections updated
- naming proposals as `current -> proposed -> reason`
- open questions
- backlog issues created or drafted

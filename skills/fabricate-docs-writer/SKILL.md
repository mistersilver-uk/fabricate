---
name: fabricate-docs-writer
description: Synchronize Fabricate documentation with approved code changes. Use after review approval or for docs-only maintenance involving JSDoc in `src/` and the Jekyll site in `docs/`, without modifying runtime logic or tests.
---

# Fabricate Docs Writer

Keep this skill aligned with the `fabricate_docs_writer` custom Codex agent.

## Required context

- current git diff
- changed source files
- existing docs for the affected area

## Scope

You may update:

- JSDoc in `src/` comment blocks only
- the Jekyll docs site under `docs/`

## Workflow

1. Read the diff first.
2. Read the changed source files before writing docs.
3. Read the corresponding docs pages.
4. Read the latest `DOMAIN.md` and canonical-spec updates from `fabricate_domain_expert` so JSDoc and Jekyll content stay consistent with domain language.
5. Update only documentation that matches real behavior.
6. Keep quick-start content canonical in `docs/quickstart.md`.
7. Review the domain expert's output for terminology accuracy and example fidelity, then emit `DOCS APPROVED` or `DOCS NEEDS_CHANGES` with concrete findings.
8. Iterate with the domain expert until both emit `DOCS APPROVED`, capped at 3 revisions before escalating to the orchestrator.
9. Report exactly what changed and what could not be documented confidently.

## Documentation rules

- Do not edit `README.md`.
- Do not change runtime logic in `src/`.
- Do not edit files under `tests/`.
- Do not invent API behavior. If the source is ambiguous, leave a TODO note in the doc.
- Use real Fabricate APIs in examples.
- When examples depend on the global API, show that they run after the `fabricate.ready` hook.

## Validation rule

Do not run `npm test` or `npm run build` from this skill unless the user explicitly asks. Those gates belong to implementation.

## Expected output

First line is the verdict: `DOCS APPROVED` or `DOCS NEEDS_CHANGES` (use `DOCS NEEDS_CHANGES` when the paired domain-expert output or the diff still requires changes).

Then list:

- JSDoc updated
- docs pages updated
- skipped areas
- unresolved TODOs
- findings against the domain expert's output when the verdict is `DOCS NEEDS_CHANGES`

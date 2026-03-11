---
name: fabricate-docs-writer
description: Synchronize Fabricate documentation with approved code changes. Use after review approval or for docs-only maintenance involving JSDoc in `src/`, the Jekyll site in `docs/`, and `CHANGELOG.md`, without modifying runtime logic or tests.
---

# Fabricate Docs Writer

Keep this skill aligned with `.claude/agents/docs-writer.md`.

## Required context

- current git diff
- changed source files
- existing docs for the affected area
- `CHANGELOG.md`

## Scope

You may update:

- JSDoc in `src/` comment blocks only
- the Jekyll docs site under `docs/`
- `CHANGELOG.md`

## Workflow

1. Read the diff first.
2. Read the changed source files before writing docs.
3. Read the corresponding docs pages and `CHANGELOG.md` format.
4. Update only documentation that matches real behavior.
5. Keep quick-start content canonical in `docs/quickstart.md`.
6. Report exactly what changed and what could not be documented confidently.

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

Start with `DOCS COMPLETE`, then list:

- JSDoc updated
- docs pages updated
- changelog entries added
- skipped areas
- unresolved TODOs

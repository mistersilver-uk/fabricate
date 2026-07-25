---
name: review-implementing
description: Process and implement code review feedback systematically. Use when user provides reviewer comments, PR feedback, code review notes, or asks to implement suggestions from reviews.
---

# Review Feedback Implementation

Systematically process and implement changes based on code review feedback in this repository's JavaScript, Svelte 5, and Vite codebase.

## When to Use

- The user or the workflow driver provides reviewer comments or feedback
- A reviewer verdict of `NEEDS_CHANGES` lists findings to address
- The user says "address these comments" or "implement feedback"

## Systematic Workflow

### 0. Confirm Branch and PR

Before changing files, verify the current branch is not `main`; create or switch to the PR branch that received feedback.
Commit fixes to that same branch, push it, and update the existing PR unless the user explicitly asks for a replacement PR.

Ensure the PR title complies with Conventional Commits.
For `feat`, `fix`, and `perf`, use `<type>(#<issue>): <short description>` when a GitHub issue exists.

When updating the PR description, preserve or add these H2 sections in order, keeping the closing keyword (`Closes #<issue>`) on its own line in `Description`:

```md
## Description

Closes #<issue>

## Benefit(s)

## Changes in this PR

## Testing

## Screenshots (if applicable)
```

### 1. Parse Reviewer Notes

Identify individual feedback items:

- Split numbered lists and bullet points into distinct change requests
- Extract the file, symbol, and intent of each item
- Clarify ambiguous items before starting

### 2. Track the Items

Track each feedback item as its own task, mark exactly one in progress at a time, and complete it only when its validation passes.

### 3. Implement Changes Systematically

For each item: locate the code (Grep for the symbol, Read the current implementation), make the change following the conventions in `AGENTS.md`, and verify it addresses the reviewer's intent before moving on.

Repository specifics that shape the fix:

- Tests are `node:test` files under `tests/`; the `test` script in `package.json` globs a fixed set of directories, so a test outside those directories never runs in CI
- New mounted Svelte component tests use `createMountedComponentHarness` from `tests/helpers/svelte-component-harness.js`, never inlined compile/mount boilerplate
- A component missing from a mount harness allowlist hangs and reports `# cancelled`, not a failure — after component changes confirm `# cancelled 0`
- Keep dependencies explicit and constructors boring per `.agents/skills/javascript-structural-design/SKILL.md` when the fix reshapes module boundaries

### 4. Validation

After implementing the changes, run the gates that cover the touched surface:

- `npm test` — confirm `# fail 0` AND `# cancelled 0`
- `npm run build`
- `npm run lint` (ESLint) and `npm run lint:css` (Stylelint) when the change touches their globs
- `npm run format:check` (Prettier) — the CI `lint` job runs it in addition to ESLint
- `npm run lint:md` when the change touches Markdown; use `npm run lint:md:fix` to auto-split prose to one sentence per line
- `npx commitlint --from <merge-base> --to HEAD` before pushing — CI lints every commit on the branch, not just the tip

### 5. Communication

- Report progress per item, not in one batch at the end
- Ask for clarification on ambiguous feedback
- Summarize the changed files, validation results, and PR status at completion

## Edge Cases

**Conflicting feedback:** ask the user or driver for guidance and explain the conflict clearly.

**Breaking changes required:** notify before implementing and discuss impact and alternatives.

**Tests fail after changes:** fix them before marking the item complete; never delete a test to make feedback pass.

**Referenced code doesn't exist:** verify with Grep, then ask for clarification instead of guessing.

## Important Guidelines

- Only one feedback item in progress at any time; update status in real time
- Run the validation gates before declaring an item done
- Use Conventional Commits when committing feedback updates
- Update the same PR branch unless the user explicitly asks for a replacement PR

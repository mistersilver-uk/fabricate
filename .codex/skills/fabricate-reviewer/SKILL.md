---
name: fabricate-reviewer
description: Perform an independent review of Fabricate changes for correctness, regression risk, test quality, and Foundry V13 compatibility. Use after implementation is complete, when the user asks for a review, or before docs and issue closure.
---

# Fabricate Reviewer

Keep this skill aligned with `.claude/agents/reviewer.md`.

## Required context

- `PLAN.md`
- current git diff
- relevant spec files for the changed area
- prior test and build results if available

## Review workflow

1. Review the diff with a findings-first mindset.
2. Check correctness, regression risk, and missing edge cases.
3. Check test quality and whether coverage matches the risk.
4. Verify Foundry compatibility assumptions for touched APIs.
5. Run `npm test` and `npm run build` if validation is missing, stale, or suspicious.
6. Return one gate status on the first line:
   - `APPROVED`
   - `NEEDS_CHANGES`
   - `BLOCKED`

## Review checklist

- Types are explicit and defensible.
- Tests are meaningful, not trivial.
- Svelte components follow existing repo patterns.
- No stray debug logging remains.
- Validation passes without warnings that matter.
- UI-only changes use Vite-first verification when available, with container-based validation reserved for runtime-sensitive or reproducibility-focused checks.

## Foundry V13 checks

When reviewing Foundry-facing code, verify:

- `game.documentTypes.Item` is converted before array methods.
- V13 document types come from `game.documentTypes`, not only `game.system.documentTypes`.
- Programmatic tab switches use `changeTab`, not DOM click hacks.
- Embedded copies preserve `flags.core.sourceId` when needed.
- Manager calls use `getSystems()` and `getItems(systemId)`.
- Browser test helpers account for V13 API shapes.

## Expected output

- first line: status token only
- then severity-ordered findings with `file:line` references
- if no findings, say so explicitly and list residual risks or testing gaps

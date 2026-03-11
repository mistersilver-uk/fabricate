---
name: fabricate-ux-designer
description: Audit and improve Fabricate's Svelte UI, Foundry window layouts, and interaction flows. Use for UX reviews, visual design proposals, accessibility checks, responsive behavior, screenshot analysis, or creating UI backlog tasks for `src/ui/`, `styles/`, and related specs.
---

# Fabricate UX Designer

Keep this skill aligned with `.claude/agents/ux-designer.md`.

## Required context

- `spec/003-ui-integration.md` first, then other UI-related specs as needed
- relevant files under `src/ui/`, `src/ui/svelte/`, `styles/`, and `lang/`
- existing screenshots in `test-results/` before capturing new ones
- `.claude/agents/ux-designer.md` when you need the full audit intent

## Workflow

1. Read the relevant UI spec before making recommendations.
2. Inspect the current Svelte components, stores, styles, and localized strings.
3. Check `test-results/` for recent screenshots before trying to capture fresh ones.
4. If browser tooling is available, inspect the running Foundry UI at multiple sizes.
5. Compare the implementation against the spec and against Foundry-native interaction patterns.
6. Turn confirmed problems into specific design guidance or backlog issues.

## Review checklist

Check:

- layout resilience in resizable Foundry windows
- spacing, typography, and information hierarchy
- contrast, focus states, and keyboard accessibility
- empty states, loading states, and error states
- Svelte 5 rune usage and avoidable side effects
- localization readiness for longer strings

## Rules

- Prefer Foundry-native patterns over novelty.
- Be specific with file paths, selectors, viewport sizes, and screenshot names.
- If browser tooling is unavailable, say so and rely on code plus existing screenshots.
- Do not implement production UI changes unless the user explicitly switches to implementation work.

## Expected output

Lead with the highest-impact findings or recommendations, then provide:

- evidence with file references or screenshot names
- concrete design changes
- backlog issues created or drafted

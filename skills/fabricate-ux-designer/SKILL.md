---
name: fabricate-ux-designer
description: Audit and improve Fabricate's Svelte UI, Foundry window layouts, and interaction flows. Use for UX reviews, visual design proposals, accessibility checks, responsive behavior, screenshot analysis, or creating UI backlog tasks for `src/ui/`, `styles/`, and related specs.
---

# Fabricate UX Designer

Keep this skill aligned with the `fabricate_ux_designer` custom Codex agent.

## Required context

- `openspec/specs/ui-integration/spec.md` first, then other UI-related specs as needed
- relevant files under `src/ui/`, `src/ui/svelte/`, `styles/`, and `lang/`
- the active Vite dev URL when available, or a prompt to ask the user for it before using container-backed flows
- existing screenshots in `test-results/` when no live dev session is available
- `.codex/agents/fabricate-ux-designer.toml` when you need the full audit intent

## Workflow

1. Read the relevant UI spec before making recommendations.
2. Verify the current branch is not `main`; create or switch to the task branch before editing UI specs, design docs, or workflow files.
3. Inspect the current Svelte components, stores, styles, and localized strings.
4. Use the active Vite dev server first for live UI inspection; ask the user for the URL if it is not known.
5. If no live dev session is available, check `test-results/` for recent screenshots before trying to generate fresh ones.
6. Use container-backed Foundry validation only when the task depends on real runtime behavior or needs reproducible screenshots.
7. Compare screenshots against explicit visual acceptance criteria, not just against whether the screen rendered.
8. Compare the implementation against the spec and against Foundry-native interaction patterns.
9. Turn confirmed problems into specific design guidance or backlog issues.
10. Commit owned spec, design, or workflow changes to the task branch, push it, and open or update the PR targeting `main`.

## Review checklist

Check:

- layout resilience in resizable Foundry windows
- spacing, typography, and information hierarchy
- compact navigation, headers, cards, and fact components with long names or localized strings
- contrast, focus states, and keyboard accessibility
- empty states, loading states, and error states
- Svelte 5 rune usage and avoidable side effects
- localization readiness for longer strings
- screenshot artifacts for first visible state, clipping, spacing, alignment, image/content scale, scroll containment, and visible controls
- rendered geometry in resizable Foundry windows, including CSS that overflows, compresses, or clips despite looking plausible in source
- whether image-card screenshots prove linked imagery or only fallback artwork
- action overlays and icon controls for crowding, clipping, target size, and visual hierarchy

## Rules

- Prefer Foundry-native patterns over novelty.
- Keep product-specific UI contracts in `openspec/specs/ui-integration/spec.md` or active design docs; UX guidance should cite those contracts rather than rely on memory.
- Be specific with file paths, selectors, viewport sizes, and screenshot names.
- If browser tooling is unavailable, say so and rely on the Vite dev server plus code inspection first, then existing screenshots.
- Name the screenshot file, viewport/window size, and concrete pass/fail criteria when giving screenshot feedback.
- Do not implement production UI changes unless the user explicitly switches to implementation work.

## PR description template

When opening or updating a PR, use these H2 sections in order:

```md
## Description

## Benefit(s)

## Changes in this PR

## Testing

## Screenshots (if applicable)
```

## Expected output

Lead with the highest-impact findings or recommendations, then provide:

- evidence with file references or screenshot names
- concrete design changes
- PR status for any committed spec, design, or workflow changes
- backlog issues created or drafted

---
name: fabricate-competitive-analyst
description: Research Fabricate's competitive landscape, product differentiation, and monetization options, then maintain `COMPETITIVE_ANALYSIS.md`. Use for market-fit analysis, rival module comparisons, crafting UX research, pricing research, or monetization strategy updates.
---

# Fabricate Competitive Analyst

Keep this skill aligned with `.claude/agents/competitive-analyst.md`.

## Required context

- `COMPETITIVE_ANALYSIS.md` if it exists
- Fabricate docs under `docs/`
- relevant UI files under `src/ui/svelte/`
- `CHANGELOG.md`
- relevant spec files

## Workflow

1. Read the current report first and update it incrementally.
2. Understand Fabricate itself before analyzing competitors.
3. Research rival Foundry crafting modules and note pricing, workflow model, and UX patterns.
4. Research wider crafting UX references and extract transferable lessons.
5. Research monetization models and current price points with dated sources.
6. Update `COMPETITIVE_ANALYSIS.md` with a changelog entry and stale markers where verification is missing.

## Rules

- Modify only `COMPETITIVE_ANALYSIS.md` from this skill.
- Never overwrite the report from scratch when an existing file is present.
- Ground claims in the codebase, the docs, or an attributable external source.
- When current pricing or policy data cannot be verified, mark the section stale instead of guessing.

## Report sections

Maintain these sections:

- Fabricate today: capabilities and gaps
- competitor analysis
- UX lessons from wider games
- gap analysis and market-fit recommendations
- monetization landscape and model evaluation
- content pack opportunities and recommended strategy

## Expected output

Provide:

- sections updated
- major additions or changed conclusions
- stale items that still need verification

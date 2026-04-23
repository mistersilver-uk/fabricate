# Design: Add JavaScript Structural Design Skill

## Decisions

1. The canonical skill lives in `skills/javascript-structural-design/`.
2. The skill body stays short and procedural, while source-derived details live in `references/`.
3. The guidance is adapted for Fabricate's JavaScript, Svelte, and Foundry edges rather than copied as strict object-oriented dogma.
4. Implementer, reviewer, quality, orchestrator, and explorer surfaces should all know when to load or apply the skill.
5. `AGENTS.md` should codify the highest-value structural rules so they remain visible even when the skill is not loaded.

## Tradeoffs

- Elegant Objects is intentionally opinionated. Adapting it for JavaScript keeps the useful parts, but loses strict purity.
- Relying on skill and agent guidance improves consistency quickly, but it does not enforce the rules mechanically.
- Adding structural review heuristics may increase feedback volume, so prompts must keep the focus on material risk rather than style.

## Validation

- verify the new skill files exist under `skills/javascript-structural-design/`
- verify agent and prompt files reference the new skill where appropriate
- verify `AGENTS.md` lists the skill and its core structural rules

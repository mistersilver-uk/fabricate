# Mythwright DnD5e Bootstrap

## Summary

Seed a DnD5e-first Mythwright crafting system through an idempotent Foundry world script and make canonical routed recipe resolution usable by explicit multi-step recipes.

No GitHub issue was provided for this change.

## Motivation

Mythwright needs a practical first-run bootstrap that creates world content, links available DnD5e SRD weapons and armour, and registers recipes that exercise Fabricate's multi-step routed flow. Current runtime support treats `mapped` and legacy `tiered` as first-class, while `routed` is only durable in gathering and salvage paths.

## Scope

- Add a Foundry world script at `scripts/foundry/create-mythwright-dnd5e.js`.
- Preserve `step.resultSelection` and let it override recipe-level result selection.
- Treat `resolutionMode: "routed"` as a recipe resolution mode.
- Support routed recipe providers `ingredientSet`, `macroOutcome`, and `rollTableOutcome`.
- Seed Mythwright folders, world Items, system config, recipes, gathering environments, and a crafting check Macro idempotently.

## Non-Goals

- Package Mythwright as a compendium.
- Add npm dependencies.
- Support non-DnD5e systems in the Mythwright bootstrap.

---
layout: default
title: Routed Mode (Macro Outcome)
parent: Recipes
nav_order: 3
---

# Routed Mode — Macro Outcome Provider

{: .note }
> This page documents the `macroOutcome` provider for routed mode. Legacy recipes still stored with `resolutionMode: "tiered"` are automatically normalised to `routed` + `macroOutcome` on load.

A crafting check macro returns a named **outcome**, and the outcome determines which result group is produced. The outcome is matched case-insensitively against result group names.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- `resultSelection.provider` must be `"macroOutcome"`
- Crafting check is **required** (`resultSelection.macroUuid` or system fallback)
- The check macro must return `{ success: true, outcome: "outcomeName" }` or `{ success: false }`
- The `outcome` value is trim-normalised and compared case-insensitively against result group names
- Result group names must be unique under case-insensitive comparison
- Result group names may not use reserved fail/miss keywords (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`)

### Reserved Keywords

| Keyword | Behaviour |
|:--------|:----------|
| `fail`, `failed`, `failure`, `f` | The craft takes the failure path |
| `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed` | The craft produces nothing (non-producing failure) |

If the macro returns an outcome that does not match any reserved keyword and does not match any result group name, the engine aborts with a crafting-system misconfiguration error rather than treating it as a player failure.

## Example: Weapon Forging

A blacksmithing recipe where the quality of the result depends on a skill check:

| Outcome | Result |
|:--------|:-------|
| "masterwork" | 1x Masterwork Longsword |
| "standard" | 1x Longsword |
| "flawed" | 1x Bent Blade (junk) |

### The Check Macro

Your crafting check macro receives context about the recipe and actors, and must return a named outcome — for example `masterwork`, `standard`, or `flawed` depending on the roll total, or a failure result when the roll is too low. The outcome name is matched against the recipe's result group names. See [Crafting Checks]({% link crafting-checks.md %}) for the macro context and return contract.

### Creating the Recipe

The recipe sets `resultSelection.provider` to `"macroOutcome"` with an optional `macroUuid` (omit it to use the system fallback), one ingredient set, and one result group per named outcome (`Masterwork`, `Standard`, `Flawed`). Recipes can be authored through the API only. See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## Step-Level Routing Overrides

In multi-step recipes, individual steps can override the recipe-level `resultSelection`. The engine checks `step.resultSelection` first, then falls back to `recipe.resultSelection`.

## When to Use the Macro Outcome Provider

The `macroOutcome` provider is ideal when:
- Result quality should depend on a skill check
- You want distinct named outcomes (not just pass/fail)
- Different outcomes should produce fundamentally different items

---

## What's next?

- [Progressive Mode]({% link recipes/progressive.md %}) -- check values are spent to buy results in difficulty order.
- [Crafting Checks]({% link crafting-checks.md %}) -- crafting check macro contracts.
- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- chain multiple steps with per-step outcome routing.

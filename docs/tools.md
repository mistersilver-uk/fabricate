---
layout: default
title: Tools
nav_order: 5
---

# Tools

Tools are items that are **required for an activity but not consumed** by it. They represent the reusable, breakable equipment a craft or a gathering attempt depends on — a blacksmith's forge, an alchemist's cauldron, a wizard's focus, or a miner's pick.

{: .note }
> **Catalysts have been retired.** Earlier versions of Fabricate had a separate recipe-side **Catalyst** concept. As of `0.6.0` it is gone: Tools are now the single shared "required-but-reusable, breakable prerequisite" primitive for **crafting recipes**, **gathering tasks**, and **salvage**. Existing catalyst data is migrated to Tools automatically — see [Migration from Catalysts](#migration-from-catalysts).

---

Imagine a blacksmith who needs an anvil and hammer to forge a blade, or an alchemist who brews potions in a cauldron. These tools are essential to the work, but they are not used up by it — the cauldron is still there after the potion is bottled. A **Tool** models exactly this: an item that must be present (and may need to pass a requirement) before an activity can proceed, and that may wear out and break over repeated use.

Tools are **system-owned**: each crafting system carries its own shared **Tools library** as `system.tools` (persisted in the `craftingSystems` world setting), authored on the system's dedicated **Tools** page in the Crafting System Manager. They are *not* owned by a gathering environment or task — a gathering task only *references* a system tool by id. The same Tool entry can therefore gate a recipe step, a salvage operation, and a gathering task across the one system. Every consumer reads the canonical library through `craftingSystemManager.getSystem(systemId).tools`.

## Where Tools are required

A Tool becomes a prerequisite by being referenced by id from any of these surfaces:

| Surface | Reference field | Granularity |
|:--------|:----------------|:------------|
| Recipe | `recipe.toolIds` | Applies to every step / ingredient set in the recipe |
| Recipe step | `step.toolIds` | Applies to that step (multi-step recipes) |
| Ingredient set | `ingredientSet.toolIds` | Applies when that ingredient set is selected |
| Gathering task | `task.toolIds` | Required to attempt the task |
| Salvage | `component.salvage.toolIds` | Required to salvage the component |

For crafting, the **applicable** set for a given attempt is the union of the recipe-level, step-level, and ingredient-set-level `toolIds`, resolved against the per-system Tools library (`RecipeManager.getToolsForSet`). Ids that no longer resolve to a library Tool are logged and dropped rather than throwing — the same stale-reference behaviour gathering tasks use.

## The requirement gate

Every applicable Tool must be **present** in the source actor's inventory and must **pass its optional requirement** before the activity can proceed. The owned item is recognised whether it is the Tool component's source world item or a copy duplicated from it.

A Tool's optional `requirement` is an actor-side condition that must evaluate truthy:

| Provider | Field | Example |
|:---------|:------|:--------|
| `dnd5e` / `pf2e` | `formula` | `@flags.dnd5e.proficient` |
| `macro` | `macroUuid` | a macro returning `true`/`false` or `{ allowed, description }` |

If a referenced Tool id is missing or disabled, or the actor does not own a non-broken instance, or the requirement does not evaluate truthy, the activity is blocked. In gathering this surfaces as the `TOOL_BLOCKED` reason; in crafting the Tool appears under `missing.tools` / `toolStates` in the craftability evaluation.

## Breakage modes

Each Tool picks **exactly one** breakage mechanic, configured under `breakage`:

| Mode | Fields | Behaviour |
|:-----|:-------|:----------|
| `limitedUses` | `maxUses` (`number \| null`) | A per-item usage counter ticks up each attempt; the Tool breaks when the counter reaches `maxUses`. `null` means unlimited (usage is still tracked). |
| `breakageChance` | `breakageChance` (`0`–`100`) | A flat percent chance per attempt that the Tool breaks. `100` always breaks; `0` never breaks. |
| `diceExpression` | `formula`, `threshold` | A Foundry roll formula (e.g. `1d20 + @abilities.str.mod`) compared against a numeric threshold; the Tool breaks when the roll is below the threshold. |

{: .note }
> Only `limitedUses` Tools track per-item usage. They write `Item.flags.fabricate.toolUsage = { timesUsed }`. `breakageChance` and `diceExpression` Tools never write an item-usage flag.

## On-break actions

When a Tool breaks, its `onBreak` action runs:

| Mode | Fields | Behaviour |
|:-----|:-------|:----------|
| `destroy` | — | The owned Tool is removed from the actor's inventory. |
| `flagBroken` | — | The Tool stays in inventory but receives `flags.fabricate.toolBroken = true`. A broken Tool fails the presence gate on future attempts until a GM clears the flag. |
| `replaceWith` | `replacementComponentId` | The original is deleted and a "broken" variant component is created on the actor. You can build a recipe that consumes the broken variant to produce the repaired Tool. While the actor holds the broken variant, the gathering app shows the required Tool as **Broken** rather than **Missing**. |

## Authoring a Tool

Tools are authored in the Crafting System Manager (not constructed via the API). In Manager V2:

1. **Add the component.** In the system's **Components** tab, add the Tool item as a managed component. If you plan to use `replaceWith`, also add the broken-tool variant as a separate component.
2. **Open the system's Tools page.** With a crafting system selected, click the top-level **Tools** entry in the Manager navigation (it sits alongside Components, Essences, and the Gathering group — it is *not* nested under Gathering, because Tools belong to the system). Click *Add tool*, pick the Tool component (drag-drop from the Items directory or use the dropdown), and optionally set a display label.
3. **(Optional) Add a requirement** — an actor-side condition (see [The requirement gate](#the-requirement-gate)).
4. **Pick a breakage mode** — `limitedUses`, `breakageChance`, or `diceExpression` (see [Breakage modes](#breakage-modes)).
5. **Pick an on-break action** — `destroy`, `flagBroken`, or `replaceWith` (see [On-break actions](#on-break-actions)).
6. **Save**, then reference the saved Tool from the recipes, steps, ingredient sets, gathering tasks, or salvage configurations that require it.

## Failure behaviour

By default, Tools are **not** broken/degraded when a crafting or salvage check fails. This is configured per system:

- `craftingCheck.consumption.consumeCatalystsOnFail` — apply Tool breakage on a failed recipe check.
- `salvageCraftingCheck.consumption.consumeCatalystsOnFail` — apply Tool breakage on a failed salvage check.

{: .note }
> These configuration field names still read `consumeCatalystsOnFail` for backward compatibility, but they now govern **Tool** breakage. See [Consumption on Failure]({% link crafting-checks.md %}#consumption-on-failure).

For gathering, the system-level **Tool breakage outcome** setting (Manager V2 → System Settings → Gathering Rules) decides whether a broken Tool fails the whole attempt (the default) or whether drops are still awarded with the breakage reported alongside.

## Evidence and macro payloads

After an activity that resolved Tools, the result describes what each Tool did:

| Surface | Field | Shape |
|:--------|:------|:------|
| Run record | `usedTools` | array describing each Tool's outcome this attempt |
| Success / failure macro callback | `consumedTools` | array of `{ tool, item }` |
| Property macro callback | `resolvedTools` | array of `{ item, tool }` |
| Chat card | `tools` | the Tools involved |

See [Macros]({% link macros/index.md %}) for the full macro callback contracts.

## Migration from Catalysts

If you are upgrading from a version before `0.6.0`, every recipe-level, step-level, ingredient-set-level, and salvage catalyst is converted automatically into a deduped per-system library Tool, and the inline catalyst arrays are replaced with `toolIds` references. After the migration runs, the GM sees a one-time notification with a count of migrated entries and a pointer to the Tools tab.

The mapping preserves behaviour:

| Old catalyst | Resulting Tool |
|:-------------|:---------------|
| `degradesOnUse: false` (present, never consumed) | `breakage { mode: 'breakageChance', breakageChance: 0 }` + `onBreak { mode: 'flagBroken' }` — present-only, writes **no** item-usage flag |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: true` | `breakage { mode: 'limitedUses', maxUses: N }` + `onBreak { mode: 'destroy' }` |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: false` | `breakage { mode: 'limitedUses', maxUses: N }` + `onBreak { mode: 'flagBroken' }` |

{: .note }
> The presence-only row is a deliberate, behaviour-preserving choice rather than a strictly structural copy: a `breakageChance: 0` Tool's usage apply is a no-op, so it never writes an item-usage flag — exactly the old never-consumed behaviour.

Identical catalysts dedupe into a single shared library Tool (keyed on componentId + degradation + maxUses + destroy behaviour); semantically different catalysts are **not** merged. Recipes whose crafting system is missing are skipped (logged, not thrown). The migration is idempotent and runs before any catalyst code is removed.

**In-flight usage counters.** At runtime, Tool usage reads `flags.fabricate.toolUsage` and falls back to the legacy `flags.fabricate.catalystItemUsage` when `toolUsage` is absent, so an item already degraded as a catalyst keeps its used count. This fallback is meaningful only for migrated `limitedUses` Tools. The first post-migration use writes `toolUsage` (authoritative thereafter); the legacy `catalystItemUsage` flag is never back-filled or cleared.

### Tool library relocation (0.7.0)

In early gathering builds, Tools authored in the Manager were persisted under the gathering config (`gatheringConfig.systems[systemId].tools`) rather than on the crafting system. Now that Tools are system-owned, a second versioned migration (`0.7.0`) **reconciles** any such gathering-config Tools onto the matching crafting system's `tools` array and clears the gathering-config copy, so there is a single canonical library. It dedupes by tool `id` — when the same id already exists on the system, the existing system Tool wins and the stale gathering-config copy is dropped (never merged). Gathering-config tools whose system no longer exists are left in place rather than discarded. Like the 0.6.0 step, it is pure and idempotent: once the gathering-config `tools` arrays are emptied, a re-run is a no-op.

---

## What's next?

- [Recipes overview]({% link recipes/index.md %}) — how Tools fit into recipe definitions and resolution modes.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) — a worked example of a gathering Tool that wears out.
- [Canvas Interactables]({% link canvas-interactables.md %}) — place Tool stations on the canvas as Scene Regions players activate by walking in, so they can use a Tool without owning it.
- [Crafting Engine API]({% link api/crafting-engine.md %}) — programmatic control over crafting runs and Tool validation.

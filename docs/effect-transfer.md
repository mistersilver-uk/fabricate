---
layout: default
title: Effect Transfer
nav_order: 3.2
---

# Effect Transfer

When the Effect transfer feature is enabled, Fabricate can copy active effects from essence source items to the newly created result item after a successful craft.
This lets the magical properties bound to an essence carry over into the finished product.
For example, crafting with fire-essence ingredients can automatically give the result fire-resistance or burning damage effects.

**Effect transfer is an opt-in feature.**
All three of the following must be turned on before any effects are transferred:

1. The **Essences** feature must be enabled.
   Effect transfer builds on top of essences.
2. The GM enables the **Effect transfer** feature on the crafting system.
3. The recipe author opts each recipe in.

If any one of these is off, no effect transfer occurs.
This design lets you enable the feature for the whole system while still controlling it recipe by recipe.

**How it works.**
When all three are turned on, after a successful craft Fabricate:

1. Works out which essences were contributed by the ingredients that were used.
2. For each contributing essence, looks up its definition on the system.
3. If the essence is linked to a source item, finds that item.
4. Collects all of the source item's active effects.
5. Applies those effects to the newly created result item.

Essences with no linked source item, or whose linked item no longer exists, are skipped without comment.

**Enabling via the UI.**
Open the Crafting Admin panel, select your system, and look for the **Essences** toggle and the **Effect transfer** toggle in the Features card.
Both must be enabled.
Then link each essence definition to a **Source item** in the Essences feature card.

**Enabling via the API.**
You can also enable both required features programmatically.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

**Controlling transfer per recipe.**
Turn on effect transfer for each recipe that should inherit effects from its ingredient essences.
Recipes with it off, which is the default, never transfer effects, even when both system features are on.

**Example: a Potion of Fire Resistance recipe.**
In an Alchemy system with essences enabled, a Fire essence definition links to a "Flame Shard" item that carries a Fire Resistance active effect.
Any recipe that consumes a Fire-essence ingredient and has effect transfer turned on will copy Fire Resistance onto the brewed potion when all three conditions are met.
See the [Crafting Engine API]({% link api/crafting-engine.md %}).

---

## See Also

- [Essences]({% link essences.md %}).
Define essences and link each one to a source item whose active effects will be transferred.
- [Crafting Systems]({% link crafting-systems.md %}).
Enable the Essences and Effect transfer feature toggles on your system.
- [Recipes]({% link recipes/index.md %}).
Turn on effect transfer for individual recipes in the recipe editor.

---
layout: default
title: Effect Transfer
nav_order: 3.2
---

# Effect Transfer

When the `effectTransfer` feature is enabled, Fabricate can copy Foundry active effects from essence source items to the newly created result item after a successful craft. 
This lets the magical properties bound to an essence carry over into the finished product.
For example, crafting with fire-essence ingredients can automatically give the result fire-resistance or burning damage effects.

**Effect transfer is an opt-in feature.**
All three of the following must be `true` before any effects are transferred:

1. `system.features.essences` is `true`.
   The essences feature must be enabled.
   Effect transfer is built on top of the essence pipeline.
2. `system.features.effectTransfer` is `true`.
   The GM enables the effect transfer feature on the crafting system.
3. `recipe.transferEffects` is `true`.
   The recipe author opts each recipe in.

If any one of these flags is `false`, no effect transfer occurs.
This design lets you enable the feature for the whole system while still controlling it recipe by recipe.

**How the pipeline works.**
When all three flags are set, the engine:

1. Determines which essence IDs were contributed by the resolved ingredients (using the `essences` flag values stored on each component).
2. For each contributing essence, looks up its `EssenceDefinition` in `system.essenceDefinitions`.
3. If the definition has a `sourceItemUuid`, resolves that item via `fromUuid()`.
4. Collects all active effects from the resolved source item.
5. Transfers all collected effects to the created result item using `createEmbeddedDocuments('ActiveEffect', ...)`.

Essences with no `sourceItemUuid`, or whose `sourceItemUuid` no longer resolves to a valid item, are silently skipped.

{: .warning }
> The old ingredient-level `extractEffects` / `effectFilter` approach has been removed. Setting `extractEffects: true` on an ingredient no longer has any effect. Effect transfer is now controlled entirely through essence definitions and their `sourceItemUuid` field. See [Essences]({% link essences.md %}) for how to configure essence definitions.

**Enabling via the UI.**
Open the Crafting Admin panel, select your system, and look for the **Essences** toggle and the **Effect Transfer** toggle in the Features card.
Both must be enabled.
Then configure essence definitions with a **Source item** in the Essences feature card.

**Enabling via the API.**
You can also enable both required features programmatically.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

**Controlling transfer per recipe.**
Set `recipe.transferEffects = true` on each recipe that should inherit effects from its ingredient essences.
Recipes where this is `false` (the default) will never transfer effects, even when both system features are on.

**Example: a Potion of Fire Resistance recipe.**
In an Alchemy system with essences enabled, a Fire essence definition links to a "Flame Shard" item that carries a `Fire Resistance` active effect.
Any recipe that consumes a Fire-essence ingredient and has `transferEffects: true` will copy `Fire Resistance` onto the brewed potion when all three flags are set.
See the [Crafting Engine API]({% link api/crafting-engine.md %}).

---

## See Also

- [Essences]({% link essences.md %}). Define essences and link each one to a source item whose active effects will be transferred.
- [Crafting Systems]({% link crafting-systems.md %}). Enable the `essences` and `effectTransfer` feature toggles on your system.
- [Recipes]({% link recipes/index.md %}). Set `transferEffects: true` on individual recipes in the recipe editor.

---
layout: default
title: Item Piles Integration
nav_order: 11
---

# Item Piles Integration

Fabricate can connect to [Item Piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles) to add currency costs to recipes, read merchant stock as an ingredient source, and use container contents as crafting-station inventory — all without writing a single macro.

The integration is:

- **Opt-in per crafting system.** A toggle on each system controls whether Item Piles is used. Systems that do not enable the toggle are completely unaffected.
- **Automatic.** Fabricate detects Item Piles at startup. If the module is absent or below the minimum supported version, the toggle is hidden and no integration code runs.
- **Zero-macro.** No macros, scripts, or manual wiring are required at any point.

**Minimum Item Piles version:** 3.1.0

---

## Requirements

- Item Piles v3.1.0 or later must be installed and active in your world.
- Fabricate v2.0.0 or later.

If Item Piles is not installed, the `itemPiles` feature toggle does not appear in the crafting system settings.

---

## Enabling the Integration

{: .gm }
> Only GMs can enable features on a crafting system.

1. Open **Manage Crafting Systems** from the Items sidebar.
2. Select the crafting system you want to configure.
3. In the **Features** card, enable the **Item Piles** toggle.
4. Save the system.

The toggle can also be set via the API:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    features: { itemPiles: true }
  });
});
```

When the toggle is off (the default), Fabricate has zero runtime interaction with Item Piles. The module may be installed without any effect on crafting behaviour.

---

## Currency Costs

Recipes can require currency to be paid before crafting succeeds. Fabricate checks affordability before starting the craft and deducts the cost automatically on success.

### Adding a currency cost to a recipe

Currency costs are stored on the recipe's `currencyCost` field:

```javascript
{
  currencyCost: {
    currencies: [
      { abbreviation: 'gp', amount: 50 },
      { abbreviation: 'sp', amount: 5 }
    ]
  }
}
```

The `abbreviation` values must match the denomination abbreviations used by Item Piles in your world (for example `gp`, `sp`, `cp` for D&D 5e). Item Piles controls how currencies are defined; Fabricate reads them from the Item Piles API.

### What happens during crafting

When the `itemPiles` feature is enabled and a recipe has a `currencyCost`:

1. Before ingredients are consumed, Fabricate calls `ItemPilesIntegration.canAfford()` to check the crafting actor's balance.
2. If the actor cannot afford the cost, crafting fails immediately with a clear error message. No ingredients are consumed.
3. If the actor can afford it, ingredients are consumed and results are created as normal.
4. After a successful craft, `ItemPilesIntegration.deductCurrency()` removes the currency from the crafting actor.

### Example: a recipe that costs 50 gp

```javascript
Hooks.once('fabricate.ready', async () => {
  const rm = game.fabricate.getRecipeManager();
  await rm.updateRecipe('master-healing-potion-id', {
    currencyCost: {
      currencies: [{ abbreviation: 'gp', amount: 50 }]
    }
  });
});
```

{: .note }
> Currency costs are checked and deducted using the Item Piles API (`game.itempiles.API.getActorCurrencies` and `game.itempiles.API.removeCurrencies`). The crafting actor must have enough currency in their Item Piles-managed wallet. If Item Piles is not enabled for the crafting system, the `currencyCost` field is silently ignored and crafting proceeds without a currency check.

---

## Merchant Stock as an Ingredient Source

When a merchant actor is set up in Item Piles, Fabricate can query their stock and make it available as an ingredient source. This allows recipes to draw materials from a merchant's inventory rather than (or in addition to) the player's own inventory.

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const merchantActor = game.actors.getName('Grimble the Alchemist Supplier');

  // Returns an array of Item objects from the merchant's stock
  const merchantItems = await integration.getMerchantItems(merchantActor);
});
```

The returned items can be used to populate the `componentSourceActors` list when calling `CraftingEngine.craft()`, or passed to any workflow that accepts an actor's item list.

{: .note }
> `getMerchantItems()` reads the merchant's current stock via `game.itempiles.API.getMerchantItems`. It does not modify the merchant's inventory. Consuming ingredients from a merchant during crafting requires your own handling — Fabricate's built-in ingredient consumption reads from the component source actors you provide to the craft call.

---

## Container Contents as Crafting-Station Inventory

Item Piles containers — chests, bags, shared storage — can be read as crafting-station inventory. This is especially useful for multi-step recipes where materials accumulate in a shared container between steps.

```javascript
Hooks.once('fabricate.ready', async () => {
  const integration = game.fabricate.getItemPilesIntegration();
  const partyChest = game.actors.getName('Party Chest');

  // Returns an array of Item objects from the container
  const containerItems = await integration.getContainerContents(partyChest);
});
```

Pass the container actor as one of the `componentSourceActors` in your craft call, or use `getContainerContents()` to inspect what materials are available before starting a crafting session.

### Example: craft using items from a shared party chest

```javascript
Hooks.once('fabricate.ready', async () => {
  const engine = game.fabricate.getCraftingEngine();
  const crafter = game.actors.getName('Mira the Alchemist');
  const partyChest = game.actors.getName('Party Chest');
  const recipe = game.fabricate.getRecipeManager().getRecipes().find(
    r => r.name === 'Grand Elixir of Fortitude'
  );

  const result = await engine.craft(crafter, [crafter, partyChest], recipe);
  console.log(result.message);
});
```

Fabricate will draw ingredients from both the crafter's inventory and the party chest. Items consumed from the chest are removed by the normal ingredient consumption logic.

---

## Troubleshooting

### The Item Piles toggle does not appear in my crafting system

Item Piles is not installed, not active, or does not meet the minimum version (3.1.0). Check **Setup > Add-on Modules** to confirm the module is active and on a supported version.

### Crafting says the actor cannot afford the cost, but they have enough gold

The `abbreviation` in your `currencyCost` must match the denomination key Item Piles uses internally. Open the Item Piles currency settings to check the exact abbreviation strings (for example, `gp` not `GP` or `gold`).

### `getMerchantItems` returns an empty array

The actor may not be flagged as a merchant in Item Piles, or its stock may be empty. Confirm the actor is a valid Item Piles merchant in the Item Piles UI.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}) — feature toggles reference
- [Multi-Step Recipes]({% link recipes/multi-step.md %}) — using container inventory for staged crafting
- [How-To: Shared Party Storage]({% link how-to/shared-party-storage.md %}) — setting up shared crafting inventory

---
layout: default
title: Catalysts
nav_order: 5
---

# Catalysts

Catalysts are items required for crafting but **not consumed**. They represent tools, workstations, or reagents that are used but not used up -- a blacksmith's forge, an alchemist's cauldron, or a wizard's focus.

---

Imagine a blacksmith who needs an anvil and hammer to forge a blade, or an alchemist who brews potions in a cauldron. These tools are essential to the craft, but they are not used up in the process -- the cauldron is still there after the potion is bottled. In Fabricate, a **catalyst** models exactly this: an item that must be present for crafting to succeed but is not consumed when the recipe completes. Catalysts can optionally degrade over time, tracking how many times a tool has been used and even destroying it once it wears out. The [properties table below](#catalyst-properties) describes every field available when you define a catalyst inside a recipe.

## Catalyst Properties

| Property | Type | Default | Description |
|:---------|:-----|:--------|:------------|
| `componentId` | `string` | *required* | ID of the managed component in the crafting system |
| `degradesOnUse` | `boolean` | `false` | Track usage count on the owned item instance |
| `destroyWhenExhausted` | `boolean` | `false` | Delete the item when exhausted. Only has effect when `degradesOnUse` is `true` and `maxUses` is a positive integer |
| `maxUses` | `number\|null` | `null` | Maximum uses before exhaustion. Only applies when `degradesOnUse` is `true`. `null` means unlimited uses (but still tracks count). Ignored entirely when `degradesOnUse` is `false` |

{: .note }
> The field was previously named `systemItemId`. Use `componentId` for all new recipes.

## How Usage Tracking Works

When `degradesOnUse` is `true`, each time the catalyst is used in crafting, Fabricate increments a counter on the player's owned item:

```
Item.flags.fabricate.catalystItemUsage = {
  timesUsed: <number>
}
```

When `degradesOnUse` is `false`, usage flags are **not written or evaluated** at all. The `maxUses` and `destroyWhenExhausted` fields have no effect in this case.

When `destroyWhenExhausted` is `true`, `degradesOnUse` is `true`, and `maxUses` is a positive integer, the owned item is deleted from the player's inventory once `timesUsed >= maxUses`.

## Example: Blacksmith's Forge

A forge that lasts for 50 uses before it needs to be repaired or replaced:

```javascript
const { Catalyst } = game.fabricate.api;

const forge = new Catalyst({
  componentId: 'forge-managed-item-id',
  degradesOnUse: true,
  destroyWhenExhausted: false,  // Don't delete -- just mark as exhausted
  maxUses: 50
});
```

## Example: Consumable Scroll Focus

A magical scroll that is destroyed after 3 uses:

```javascript
const scrollFocus = new Catalyst({
  componentId: 'scroll-focus-id',
  degradesOnUse: true,
  destroyWhenExhausted: true,
  maxUses: 3
});
```

## Example: Permanent Tool

A tool with no usage tracking (always available):

```javascript
const toolkit = new Catalyst({
  componentId: 'toolkit-id',
  degradesOnUse: false
});
```

{: .note }
> When `degradesOnUse` is `false`, the values of `maxUses` and `destroyWhenExhausted` are irrelevant -- they are ignored at both validation time and runtime. No usage flags are written to the item.

## Adding Catalysts to Recipes

Catalysts can be added at the recipe level or within individual ingredient sets:

```javascript
const recipe = new Recipe({
  name: 'Steel Blade',
  catalysts: [
    new Catalyst({
      componentId: 'forge-id',
      degradesOnUse: true,
      maxUses: 50
    })
  ],
  ingredientSets: [/* ... */],
  resultGroups: [/* ... */]
});
```

## Failure Behaviour

By default, catalysts are **not** degraded when a crafting check fails. This can be changed per system:

- `craftingCheck.consumption.consumeCatalystsOnFail = true` -- degrade catalysts even on failure

## Legacy Migration

If you are upgrading from an older version of Fabricate, any catalyst usage that was tracked using the previous flag format (`Item.flags.fabricate.catalystUses`, stored as a bare number) will be migrated automatically the first time a catalyst is used after the upgrade.

Fabricate performs this migration on-read inside `applyDegradation()`:

1. When a catalyst is used, Fabricate checks for the new `catalystItemUsage.timesUsed` flag first.
2. If the new flag is absent, Fabricate looks for the old `catalystUses` bare number.
3. When the old flag is found, its value becomes the starting `timesUsed` count. The new flag is written immediately with that value incremented by one.
4. The old `catalystUses` flag is left in place but is no longer read after the new flag exists. It can be safely ignored.

No manual migration step is required. Owned items with the old flag will continue to work correctly, and their usage history is preserved.

**Note:** If both the old and new flags happen to be present on the same item (for example, from a partial previous migration), the new `catalystItemUsage.timesUsed` value always takes precedence.

---

## What's next?

- [Recipes overview]({% link recipes/index.md %}) -- learn how catalysts fit into recipe definitions and resolution modes.
- [Crafting Engine API]({% link api/crafting-engine.md %}) -- programmatic control over crafting runs and catalyst validation.

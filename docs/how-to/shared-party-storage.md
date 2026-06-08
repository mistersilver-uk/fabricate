---
layout: default
title: Shared Party Storage
parent: How-To Guides
nav_order: 5
---

# Shared Party Storage

## Problem

How do I let players craft using ingredients stored in a shared party inventory or loot container?

## Short answer

Pass a shared actor (such as a party loot character) as a **component source actor** alongside the player's own character when crafting through the API. Fabricate aggregates ingredients from all source actors.

## Steps

1. Create an actor in Foundry to represent the shared inventory (e.g. "Party Chest"). Give it the shared items.
2. Make sure all players who need access have at least Observer permission on the shared actor.
3. Use `fabricate.craft(actor, recipeId, { componentSourceActors })` from a macro or integration.
4. Include both the player's character and the shared actor in `componentSourceActors`.
5. When the recipe is crafted, ingredients are consumed from whichever source actors hold them.

```javascript
const crafter = game.user.character;
const partyChest = game.actors.getName('Party Chest');

await fabricate.craft(crafter, 'healing-potion-recipe-id', {
  componentSourceActors: [crafter, partyChest].filter(Boolean)
});
```

## Learn more

- [Recipes -- Current Crafting Surface]({% link recipes/index.md %}#current-crafting-surface)
- [CraftingEngine API]({% link api/crafting-engine.md %})

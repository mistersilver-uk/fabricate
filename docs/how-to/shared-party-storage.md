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

Add a shared actor (such as a party loot character) as a **component source actor** alongside the player's own character in the crafting app. Fabricate aggregates ingredients from all source actors.

## Steps

1. Create an actor in Foundry to represent the shared inventory (e.g. "Party Chest"). Give it the shared items.
2. Make sure all players who need access have at least Observer permission on the shared actor.
3. Open the crafting app, select the crafting character, and add the shared actor as an additional **component source** using the source actor picker.
4. The crafting app now shows combined ingredients from both the player's character and the shared actor.
5. When a recipe is crafted, ingredients are consumed from whichever source actors hold them.

## Learn more

- [Recipes -- The Crafting App]({% link recipes/index.md %}#the-crafting-app)
- [CraftingEngine API]({% link api/crafting-engine.md %})

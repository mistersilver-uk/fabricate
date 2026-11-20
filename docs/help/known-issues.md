---
layout: default
title: Known Issues
nav_order: 4
parent: Help
---

# Known Issues

This page lists problems caused by other modules that break Foundry VTT's documented behaviour.
Fabricate relies on Foundry's public API working as Foundry defines it, so it does not work around another module that changes that behaviour.
Each entry says how to recognise the problem and what to do about it, and the fix belongs in the module that causes it.

---

## Foundry Graph

**Affected:** consuming a whole stack (an item with a quantity of 1, or a full stack) during salvage, crafting, or an alchemy attempt, when a Gamemaster performs it.

**Symptom:**

- The attempt fails with a message like this one, naming the item:

  <!-- markdownlint-disable markdownlint-sentences-per-line -->

  ```text
  Could not consume "Test Ammo": the write left the item unchanged (a module veto, permissions, or a stack-quantity path the item's schema discards). Nothing was changed.
  ```

  <!-- markdownlint-enable markdownlint-sentences-per-line -->

- A moment later the item disappears from the actor anyway.
- No salvage results or crafted items are granted for it.

Consuming part of a stack is not affected, because that reduces the item's quantity instead of deleting it.

**Cause:**

Foundry Graph blocks every Actor, Item, and Scene deletion a Gamemaster makes, through Foundry's `preDeleteItem`, `preDeleteActor`, and `preDeleteScene` hooks.
It then checks its graphs in the background and deletes the document again itself, outside the original request.

Under Foundry's API, a blocked deletion means the document was not deleted, and the code that asked for the deletion is told so.
Fabricate asks Foundry to delete the item, is told the deletion was refused, and stops the attempt without granting anything.
Foundry Graph's own, later deletion then removes the item that Fabricate was told still exists.
Any module that deletes documents and checks the result is affected in the same way.

**What to do:**

1. Disable Foundry Graph while you craft or salvage in Fabricate, or remove it from the world.
2. If an attempt already removed an item without granting its results, grant the results by hand.
   Fabricate recorded the attempt as refused, so nothing is left in progress and the next attempt runs normally.
3. Report the problem to Foundry Graph's author, so that its deletion check stops blocking deletions it later carries out itself.

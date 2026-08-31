---
layout: default
title: Effect Transfer
parent: How-To Guides
nav_order: 4
grand_parent: Help
---

# Effect Transfer

## Problem

How do I make active effects from ingredients automatically transfer to crafted items?

## Short answer

Enable both the **Essences** and **Effect Transfer** feature toggles on the system, set an **Active effect source** on each essence that should transfer effects, and turn on **Transfer Effects** on each recipe that should inherit those effects.

## Steps

1. In the Crafting Admin panel, enable the **Essences** and **Effect Transfer** feature toggles for your system.
2. Open the Essence Studio and define your essences (e.g. "Fire", "Frost").
3. On each essence's **On craft** tab, set an **Active effect source** component.
   This is the component whose active effects represent that essence.
4. Assign essence quantities to your ingredient components (e.g. Dragon Scale = 3 Fire, 1 Arcane).
5. In the recipe editor, enable **Transfer Effects** on recipes that should inherit effects from their ingredients' essences.
6. When a player crafts, Fabricate gathers the active effects from the source components of every contributing, enabled essence and applies them to the created result.

## Learn more

- [Effect Transfer]({% link essences/effect-transfer.md %})
- [Essences]({% link essences/index.md %})
- [Essences: Effect Transfer via Essences]({% link essences/index.md %}#effect-transfer-via-essences)

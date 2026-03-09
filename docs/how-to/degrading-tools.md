---
layout: default
title: Degrading Tools
parent: How-To Guides
nav_order: 3
---

# Degrading Tools

## Problem

How do I make tools or workstations degrade and eventually break after repeated crafting use?

## Short answer

Add the tool as a **catalyst** on the recipe with `degradesOnUse: true`, set a `maxUses` limit, and optionally enable `destroyWhenExhausted` to delete the item when it wears out.

## Steps

1. Add the tool item as a **component** in your crafting system's Items tab.
2. Open the recipe editor and add the component as a **catalyst**.
3. Enable **Degrades on Use** on the catalyst entry.
4. Set **Max Uses** to the number of crafts the tool survives (e.g. `50`).
5. If the item should be deleted from inventory when exhausted, enable **Destroy When Exhausted**. Otherwise the item remains but is marked exhausted.

## Learn more

- [Catalysts]({% link catalysts.md %})
- [Catalysts -- Usage Tracking]({% link catalysts.md %}#how-usage-tracking-works)

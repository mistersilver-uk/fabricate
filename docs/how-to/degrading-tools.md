---
layout: default
title: Degrading Tools
parent: How-To Guides
nav_order: 3
---

# Degrading Tools

## Problem

How do I make a tool or workstation wear out and eventually break after repeated crafting use?

## Short answer

Author the tool once in the crafting system's **Tools** library with the `limitedUses` breakage mode and a `maxUses` limit, choose an on-break action (`destroy`, `flagBroken`, or `replaceWith`), then require the tool from the recipe (or step / ingredient set) via `toolIds`.

{: .note }
> This replaces the old recipe-side **Catalyst** workflow. The Catalyst concept was retired in `0.6.0`; existing catalyst data migrates to Tools automatically. See [Tools]({% link tools.md %}#migration-from-catalysts).

## Steps

1. **Add the tool component.** In your crafting system's **Components** tab, add the tool item as a managed component. If you plan to use `replaceWith`, also add the broken-tool variant as a separate component.
2. **Open the Tools library** for the system and click *Add tool*. Pick the tool component and optionally set a display label.
3. **Pick the `limitedUses` breakage mode** and set **Max uses** to the number of crafts the tool survives (e.g. `50`). Leave it blank for unlimited uses (still tracked).
4. **Pick an on-break action:**
   - **Destroy item** — the tool is deleted from inventory when it breaks.
   - **Mark as broken** — the tool stays but is flagged broken and fails the presence gate until a GM clears the flag.
   - **Replace with...** — swap the tool for a broken variant you can repair through a recipe.
5. **Save**, then require the tool from the recipe: add the saved tool id to the recipe's `toolIds` (or a step / ingredient set's `toolIds`).

## How usage is tracked

A `limitedUses` tool increments `Item.flags.fabricate.toolUsage = { timesUsed }` on the owned item each time it is used in crafting. The counter increments before the break comparison, so `maxUses: 5` lets the tool survive its first five uses and break on the sixth.

## Learn more

- [Tools]({% link tools.md %}) — the full Tool model: requirement gate, breakage modes, and on-break actions.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) — the gathering-side equivalent.

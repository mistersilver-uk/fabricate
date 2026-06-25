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

Author the tool once in the crafting system's **Tools** library with the **Limited uses** breakage mode and a **Max uses** limit, choose what happens when it breaks (destroy it, mark it as broken, or replace it with a broken variant), then require the tool from the recipe (or a step or ingredient set).

{: .note }
> This replaces the old recipe-side **Catalyst** workflow.
> The Catalyst concept was retired in version 0.6.0.
> Existing catalyst data is converted to Tools automatically.
> See [Tools]({% link tools.md %}#migration-from-catalysts).

## Steps

1. **Add the tool component.** In your crafting system's **Components** tab, add the tool item as a managed component.
   If you plan to replace the tool with a broken variant on break, also add that broken-tool variant as a separate component.
2. **Open the Tools library** for the system and click *Add tool*.
   Pick the tool component and optionally set a display label.
3. **Pick the Limited uses breakage mode** and set **Max uses** to the number of crafts the tool survives (for example 50).
   Leave it blank for unlimited uses (still tracked).
4. **Pick what happens when it breaks:**
   - **Destroy item**.
The tool is removed from inventory when it breaks.
   - **Mark as broken**.
The tool stays but is flagged as broken and cannot be used until a GM clears that mark.
Fabricate also appends " (broken)" to the tool's name so it reads as broken at a glance, and clearing the mark does not remove that suffix, so the GM renames the tool back as well.
   - **Replace with...**.
Swap the tool for a broken variant you can repair through a recipe.
5. **Save**, then require the tool from the recipe (or from a step or ingredient set).

## How usage is tracked

A Limited uses tool counts how many times it has been used in crafting on the owned item.
The count goes up before the break is checked, so a Max uses of 5 lets the tool survive its first five uses and break on the sixth.

## Learn more

- [Tools]({% link tools.md %}).
The full Tool model: requirement gate, breakage modes, and on-break actions.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}).
The gathering-side equivalent.

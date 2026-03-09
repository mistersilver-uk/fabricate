---
layout: default
title: Recipe Graph
nav_order: 12
---

# Recipe Graph

The **Graph** tab in the Crafting Admin panel displays an interactive visual map of how your recipes are connected through shared components. It helps you understand dependencies, spot circular crafting chains, and plan a balanced crafting system.

---

## Opening the Graph

1. Open **Manage Crafting Systems** from the Items sidebar.
2. Select the crafting system you want to inspect.
3. Click the **Graph** tab at the top of the admin panel.

The graph is computed the first time you open the tab. If you add or modify recipes, close and reopen the tab to refresh the graph.

---

## Reading the Graph

### Nodes

Each node represents one recipe. The node displays:

- The recipe's **icon** (or a default bag icon if none is set)
- The recipe's **name**

### Edges

An arrow from Recipe A to Recipe B means:

> Recipe A **produces** a component that Recipe B **consumes** as an ingredient.

In other words, you need to craft Recipe A before you can craft Recipe B.

**Example.** If your "Smelt Iron Ore" recipe produces "Iron Ingot", and your "Forge Iron Sword" recipe requires "Iron Ingot" as an ingredient, the graph will show an arrow from "Smelt Iron Ore" to "Forge Iron Sword".

### Layout

Recipes are arranged left to right in layers. Recipes with no prerequisites appear on the left; recipes that depend on other recipes' outputs appear further right. Fabricate uses a Sugiyama-style layered layout algorithm to minimise edge crossings.

Disconnected groups of recipes (no shared components) appear as separate clusters side by side.

---

## Cycle Detection

If two (or more) recipes form a loop — Recipe A produces a component consumed by Recipe B, and Recipe B produces a component consumed by Recipe A — Fabricate detects the cycle and marks the back edge with a dashed or highlighted style.

Cyclic recipes are valid configurations (useful for refinement loops or reprocessing chains), but they are worth reviewing to make sure the cycle is intentional.

---

## Panning and Zooming

| Action | How to do it |
|:-------|:-------------|
| Pan | Click and drag on the graph background |
| Zoom in | Scroll up (mouse wheel) |
| Zoom out | Scroll down (mouse wheel) |
| Reset view | Double-click the graph background |

---

## Filtering the Graph

Two filter controls appear above the graph:

**Search by name.** Type any text in the search box to show only recipes whose names contain that text. Connected edges are also filtered: an edge is only shown if both the source and target recipe pass the filter.

**Filter by category.** If your system has recipe categories enabled, a category dropdown lets you show only recipes in a specific category. Select the blank option to show all categories.

You can combine search and category filtering at the same time.

---

## Worked Example: Alchemist's Supplies

The Alchemist's Supplies starter content includes several recipes that share components. Opening the Graph tab on that system shows:

- "Harvest Nightshade" → "Brew Sleeping Draught" (Nightshade Extract is produced by harvest and consumed by the brew recipe)
- "Crush Sulphur" → "Mix Flash Powder" (Sulphur Powder connects these two)
- "Brew Sleeping Draught" and "Mix Flash Powder" appear as separate clusters with no edge between them, because they share no components

This makes it easy to see that players need to do the two harvesting/crushing recipes before they can brew more complex outputs.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}) — system configuration and feature toggles
- [Recipes]({% link recipes/index.md %}) — recipe structure, ingredients, and resolution modes
- [Components]({% link crafting-systems.md %}#components) — how components are added to a system

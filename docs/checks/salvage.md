---
layout: default
title: Salvage
parent: Checks
nav_order: 2
---

# Salvage Checks

{: .note }
> **Checks › Salvage** appears only while the **Salvage** feature is switched on for the system.

The salvage check decides what a component yields when a player breaks it down.
It is separate from the recipe crafting check, and a system can have both.

You must configure it when the system's salvage resolution mode is **Routed** or **Progressive**.
It is optional in **Simple** mode, which awards a single result group with or without a pass/fail roll.
See [Salvage Resolution Mode]({% link components/salvage.md %}#salvage-resolution-mode) for what each mode awards.

## Authoring the check

The page is laid out in the same five sections the Crafting page uses — **The roll**, **Outcomes**, **Triggers**, **Modifiers**, and **On failure** — and they behave identically.
See [The Checks screen]({% link checks/index.md %}#the-checks-screen) for the editor itself, and [Check modifiers]({% link checks/index.md %}#check-modifiers) for the named-modifier library all three activities select from.

A salvaged component has a single ingredient, so ingredient-set routing does not apply here.

## What players see

Everything a player is shown when they salvage comes from the salvage check, never from the recipe crafting check.

For the player-facing flow, see [Salvaging From the Inventory Tab]({% link components/salvage.md %}#salvaging-from-the-inventory-tab).
For what an individual component yields, see [Component Salvage]({% link components/salvage.md %}#component-salvage).

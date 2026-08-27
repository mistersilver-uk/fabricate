---
layout: default
title: Modifiers
parent: Rules & Resources
grand_parent: World
nav_order: 3
---

# Modifiers

Reusable, actor-driven expressions — `@abilities.med.mod`, `@prof`, `2` — resolved against the acting character.

One library serves every activity.
A crafting, salvage or gathering check adds the modifiers it selects to its roll; a gathering drop row or event shifts the drop chance by them; a gathering task's stamina cost is adjusted by them.
Each consumer chooses which entries apply and how they combine, but they all choose from this one list.

See {% link checks/crafting.md %} for how checks select and combine them, and {% link expressions.md %} for the full expression syntax and the difference between a library modifier and a reference that attaches it.

{% include screenshot.html case="world-modifiers" caption="The modifier library, shared by crafting, salvage and gathering alike." %}

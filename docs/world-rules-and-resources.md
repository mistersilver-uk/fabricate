---
layout: default
title: Rules & Resources
nav_order: 3.3
---

# Rules & Resources

Some of what a crafting system needs does not belong to any one crafting system.
A world runs a single game system, so there is one way its actors store coins.
A character's proficiencies and ability modifiers are facts about that character, and they do not change because the GM switched from blacksmithing to alchemy.

**Rules & Resources** in the manager rail is where those shared libraries are authored, once for the whole world.
It has three pages: **Currency**, **Character prerequisites** and **Modifiers**.

{: .gm }
> Only GMs can see and manage Rules & Resources.

Every page here is always available, even before any crafting system references what is on it.
That is deliberate: you can define the coins, the prerequisites and the modifiers first, and point systems at them afterwards.

## Currency

The coin ladder and how Fabricate spends from it.
See {% link world-currency.md %} for the full page.

## Character prerequisites

Reusable pass/fail conditions, each one a property path on the character, a comparison and a value — "Smith's Tools proficiency is at least 1", say.

They gate three things: who may learn a recipe from a book or scroll, whether a required tool is usable, and whether a component complication fires.
A recipe item, a tool or a complication names the prerequisites it needs by id; the prerequisite itself is authored once here.

Read {% link visibility.md %} for how learning gates use them, and {% link tools.md %} for tool requirements.

{% include screenshot.html case="world-prerequisites" caption="The prerequisite library, each entry naming the character property it tests." %}

## Modifiers

Reusable, actor-driven expressions — `@abilities.med.mod`, `@prof`, `2` — resolved against the acting character.

One library serves every activity.
A crafting, salvage or gathering check adds the modifiers it selects to its roll; a gathering drop row or event shifts the drop chance by them; a gathering task's stamina cost is adjusted by them.
Each consumer chooses which entries apply and how they combine, but they all choose from this one list.

See {% link crafting-checks.md %} for how checks select and combine them, and {% link gathering-expressions.md %} for the gathering side.

{% include screenshot.html case="world-modifiers" caption="The modifier library, shared by crafting, salvage and gathering alike." %}

## Sharing, and what that means when you delete something

Everything on these three pages is shared by every crafting system in the world.
Editing an entry changes it everywhere at once, which is the point — a rule authored once cannot drift between systems.

Deleting is the same reach, so Fabricate asks first and names it.
A deleted modifier disappears from every check that selected it, on every system; a deleted prerequisite stops gating every book, scroll and tool that required it.
References are left as they are rather than repaired for you, so you can re-point them deliberately.

## Upgrading from an earlier version of Fabricate

Before this change, each crafting system carried its own copy of the character prerequisites and the modifiers.
On first load, Fabricate merges every system's entries into one world library, keyed by id.

Two systems that had seeded the same preset — `smithsTools`, `perception` and their siblings all have stable ids — simply merge back into one entry, and nothing is lost.

Where two systems shared an id but had **edited it differently**, only one definition survives, and Fabricate tells you which by name when it happens.
That case is worth checking: the reference still resolves, so nothing breaks visibly, but it now resolves to the other system's version of the rule.

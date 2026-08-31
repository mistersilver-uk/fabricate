---
layout: default
title: Rules & Resources
parent: World
nav_order: 3
has_children: true
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

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Page | What it holds |
|:-----|:--------------|
| [Currency]({% link world/rules/currency.md %}) | The coin ladder and how Fabricate spends from it. |
| [Character Prerequisites]({% link world/rules/character-prerequisites.md %}) | Reusable pass/fail conditions tested against the acting character. |
| [Modifiers]({% link world/rules/modifiers.md %}) | Reusable, actor-driven expressions that checks and gathering rolls select from. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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

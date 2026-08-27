---
layout: default
title: World
nav_order: 12
has_children: true
---

# World

The **WORLD** block at the foot of the Crafting Admin panel's rail holds the records that belong to the whole world rather than to any one crafting system.
They are reachable under every selection, and they stay reachable when no crafting system is selected at all.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Page | What it holds |
|:-----|:--------------|
| [Parties]({% link world/parties.md %}) | Fabricate-managed parties: members, travel actor, and current-realm override. |
| [Travel]({% link world/travel/index.md %}) | Campaign geography: the realm library and its Foundry Scene Region mappings. |
| [Rules & Resources]({% link world/rules/index.md %}) | The world's currency ladder, character prerequisites, and named modifiers. |
| [Downtime]({% link world/downtime.md %}) | The downtime preview, provided by Fabricate Premium. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .gm }
> Every World page is GM-only, as the whole Crafting System Manager is.

The `WORLD / every system` heading, Parties and Travel all remain visible when a system's Travel & Realms toggle is off and when no system is selected.
Parties, realms and authored map links are all world-level and identical under every selection; only the current-realm override is gated on the selected crafting system.

Create realms under **World > Travel > Realms** before assigning environments to them.

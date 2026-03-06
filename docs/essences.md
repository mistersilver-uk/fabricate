---
layout: default
title: Essences
nav_order: 6
---

# Essences

{: .gm }
> Requires the `essences` feature to be enabled on the crafting system.

Essences are abstract properties that can be assigned to managed items. They provide a flexible way to categorise ingredients beyond simple tags -- an item might contain "2 units of Fire essence and 1 unit of Arcane essence".

---

## Defining Essences

Essences are defined at the crafting system level. Each essence definition has the following fields:

| Property | Type | Description |
|:---------|:-----|:------------|
| `id` | `string` | Unique identifier, derived from the name on creation |
| `name` | `string` | Display name (e.g. "Fire", "Arcane", "Nature") |
| `icon` | `string` | FontAwesome icon class. Defaults to `fas fa-mortar-pestle`. Empty or whitespace values also fall back to the default. |
| `description` | `string` | Flavour text |
| `sourceItemUuid` | `string\|null` | The authoritative field. UUID of the managed item (by its system item ID) whose active effects represent this essence. `null` if not linked. |

When Fabricate normalises an essence definition it resolves `sourceItemUuid` against the system's current managed item IDs. If the referenced item no longer exists, `sourceItemUuid` is set to `null`.

### Example Essences

| Essence | Icon | Description |
|:--------|:-----|:------------|
| Fire | `fas fa-fire` | The raw energy of flame |
| Frost | `fas fa-snowflake` | The biting cold of winter |
| Arcane | `fas fa-hat-wizard` | Pure magical energy |
| Nature | `fas fa-leaf` | The vitality of the natural world |

## Assigning Essences to Items

In the **Items** tab of the GM admin, each managed item can have essences assigned with quantities:

| Item | Fire | Frost | Arcane |
|:-----|:-----|:------|:-------|
| Dragon Scale | 3 | 0 | 1 |
| Frost Crystal | 0 | 4 | 0 |
| Arcane Dust | 0 | 0 | 2 |
| Phoenix Feather | 5 | 0 | 2 |

## Using Essences in Recipes

Ingredient sets can require specific essence quantities. When a player crafts, the essences from their chosen ingredients are totalled and compared against the requirement.

For example, an ingredient set requiring "3 Fire essence and 2 Arcane essence" could be satisfied by:
- 1x Dragon Scale (3 Fire + 1 Arcane) + 1x Arcane Dust (2 Arcane) = 3 Fire + 3 Arcane (meets requirement)

## Effect Transfer via Essences

When `transferEffects` is enabled on a recipe and essences are active, the engine can transfer active effects from essence source items to crafted results:

1. The engine determines which essence IDs contribute to the resolved ingredients
2. For each essence with a `sourceItemUuid`, it collects active effects from that source item
3. Those effects are applied to the created result items

This lets you create systems where crafting with fire-essence ingredients automatically gives the result fire-related properties.

## Managing Essences in the GM Admin

Essence definitions are configured from the **Systems** tab of the GM admin, inside the **Essences** feature card. The card is visible only when advanced options are enabled and the `essences` feature toggle is on.

1. Open **Manage Crafting Systems**
2. Select your system in the sidebar
3. Enable **Show advanced options**
4. Enable the **Essences** feature toggle
5. In the Essences card, fill in the name, description, icon class, and optional source item, then click **Add**
6. Existing essence definitions are shown in a list below the form; click the trash icon to remove one

The icon field accepts any FontAwesome class string (e.g. `fas fa-fire`, `fas fa-snowflake`). If you leave it blank, the default `fas fa-mortar-pestle` icon is used.

The source item dropdown lists managed items already added to this crafting system. Selecting one links the essence to that item for effect transfer purposes. The label in the UI reads **Source item**.

---

## What's next?

- [Crafting Systems -- Effect Transfer]({% link crafting-systems.md %}) -- configure the effect transfer pipeline that uses essence source items.
- [Recipes overview]({% link recipes/index.md %}) -- see how essence requirements work inside ingredient sets.
- [Recipe Manager API]({% link api/recipe-manager.md %}) -- create and manage recipes with essence-based ingredients programmatically.

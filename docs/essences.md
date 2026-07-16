---
layout: default
title: Essences
nav_order: 6
---

# Essences

{: .gm }
> Requires the **Essences** feature to be enabled on the crafting system.

Essences are abstract properties that can be assigned to components.
They provide a flexible way to categorise ingredients beyond simple tags.
For example, an item might contain "2 units of Fire essence and 1 unit of Arcane essence".

Consider a Dragon Scale that radiates heat and hums with faint magical energy, or a Frost Crystal that chills anything it touches.
Rather than treating these as unrelated ingredients, essences let you tag each component with the *qualities* it carries: three units of Fire and one of Arcane on the scale, four units of Frost on the crystal.
When a recipe calls for "at least 3 Fire and 2 Arcane", players can mix and match any combination of components whose essence totals meet the threshold, opening up creative flexibility at the crafting table.
Essences can also drive automatic [effect transfer](#effect-transfer-via-essences), so a sword forged from fire-heavy ingredients inherits flame-related properties.
Below you will find the fields that [define an essence](#defining-essences) and how to [assign essence quantities](#assigning-essences-to-items) to your components.

---

## Defining Essences

Essences are defined at the crafting system level.
Each essence definition has the following fields:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Description |
|:------|:------------|
| Name | Display name, for example "Fire", "Arcane", or "Nature" |
| Icon | A FontAwesome icon class. Leave it blank to use the default mortar-and-pestle icon. |
| Description | Flavour text |
| Source item | The component whose active effects represent this essence, used for effect transfer. Leave it unset if the essence is not linked to an item. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

When you link an essence to a source item, Fabricate checks that the component still exists.
If the linked component is later removed, the link is cleared.

### Example Essences

| Essence | Description |
|:--------|:------------|
| Fire | The raw energy of flame |
| Frost | The biting cold of winter |
| Arcane | Pure magical energy |
| Nature | The vitality of the natural world |

## Assigning Essences to Items

In the **Items** tab of the GM admin, each component can have essences assigned with quantities:

| Item | Fire | Frost | Arcane |
|:-----|:-----|:------|:-------|
| Dragon Scale | 3 | 0 | 1 |
| Frost Crystal | 0 | 4 | 0 |
| Arcane Dust | 0 | 0 | 2 |
| Phoenix Feather | 5 | 0 | 2 |

## Using Essences in Recipes

An essence amount is a first-class ingredient option, matched the same way as a component or a tag.
When a player crafts, the essences from their chosen ingredients are totalled and compared against the amount the option asks for.

For example, an option requiring "3 Fire essence" is satisfied by any combination of held items whose Fire essence totals at least 3:

- 1x Dragon Scale (3 Fire) meets it outright.
- 3x Ember Shard (1 Fire each) also meets it.

Because an essence is an option like any other, it can sit inside a group as one of several **Accept instead** alternatives on the recipe editor's Ingredients tab, or stand alone in its own group as a hard requirement.
A group holding only a single essence option is a required essence: the crafter must supply that essence amount in addition to the recipe's other groups.

{: .note }
> Earlier versions attached essence requirements to the whole ingredient set through a separate essence map.
That per-set map is superseded by first-class essence options.
Fabricate migrates existing recipes automatically, rewriting each former requirement into a required single-option essence group so the original behaviour is preserved.

## Effect Transfer via Essences

When effect transfer is enabled on a recipe and essences are active, Fabricate can transfer active effects from essence source items to crafted results:

1. Fabricate works out which essences are contributed by the ingredients that were used
2. For each essence linked to a source item, it collects that item's active effects
3. Those effects are applied to the created result items

This lets you create systems where crafting with fire-essence ingredients automatically gives the result fire-related properties.

## Managing Essences in the GM Admin

Essence definitions are configured from the **Systems** tab of the GM admin, inside the **Essences** feature card.
The card is visible only when advanced options are enabled and the **Essences** feature toggle is on.

1. Open **Manage Crafting Systems**
2. Select your system in the sidebar
3. Enable **Show advanced options**
4. Enable the **Essences** feature toggle
5. In the Essences card, fill in the name, description, icon, and optional source item, then click **Add**
6. Existing essence definitions are shown in a list below the form.
   Click the trash icon to remove one

The icon field accepts any FontAwesome icon class.
If you leave it blank, a default mortar-and-pestle icon is used.

The source item dropdown lists components already added to this crafting system.
Selecting one links the essence to that component for effect transfer purposes.
The label in the UI reads **Source item**.

---

## See Also

- [Effect Transfer]({% link effect-transfer.md %}).
Configure the effect transfer pipeline that uses essence source items.
- [Recipes overview]({% link recipes/index.md %}).
See how essence requirements work inside ingredient sets.
- [Recipe Manager API]({% link api/recipe-manager.md %}).
Create and manage recipes with essence-based ingredients programmatically.

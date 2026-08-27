---
layout: default
title: Essences
nav_order: 7
has_children: true
---

# Essences

{: .gm }
> Requires the **Essences** feature to be enabled on the crafting system.

Essences are abstract properties you assign to components, so a recipe can ask for a total amount of a quality instead of one specific item.
For example, an item might contain "3 units of Fire essence and 1 unit of Arcane essence".

Consider a Dragon Scale that radiates heat and hums with faint magical energy, or a Frost Crystal that chills anything it touches.
Rather than treating these as unrelated ingredients, essences let you tag each component with the qualities it carries.
Three units of Fire and one of Arcane on the scale, four units of Frost on the crystal.
When a recipe calls for "at least 3 Fire and 2 Arcane", players can mix and match any combination of components whose essence totals meet the threshold, opening up creative flexibility at the crafting table.

An essence can also drive automatic [effect transfer](#effect-transfer-via-essences) and an optional [property macro](#the-essence-property-macro), so a sword forged from fire-heavy ingredients can inherit flame-related properties, or have its properties rewritten as it is created.

---

## Open the Essence Studio

Open the Crafting System Manager and select a crafting system.
Choose the top-level **Essences** entry.

Each library row shows the essence's icon, name, colour, an **Effects** pill and a **Macro** pill for the behaviours it carries, a **Disabled** marker when it is turned off, how many components carry it, how many recipes require it, and a per-row enable/disable switch.
Choose **List** or **Grid** to change how the library is presented, search or filter by status to narrow it, and select a row to inspect it in the panel on the right.
Choose **Edit** to open the essence editor.

Your search, filters, presentation choice, and page position all survive opening the editor and coming back.

{% include screenshot.html case="manager-essences-normal" caption="The essence library in its list presentation, with one essence selected." %}

## Create or edit an essence

Choose **Create essence** to start a new one, or **Edit** an existing row.

The editor has three tabs:

- **Identity** sets the name, an icon, a description, an optional colour from the shared palette, and whether the essence is **Enabled**.
- **On craft** sets what the essence does when it contributes to a crafted result, an active effect source and a property macro.
See [Effect Transfer via Essences](#effect-transfer-via-essences) and [The Essence Property Macro](#the-essence-property-macro) below.
- **Validation** lists anything unfinished, such as a missing description or a macro that no longer resolves.

A live preview panel shows how the essence appears and what it currently does, updating as you edit.

{% include screenshot.html case="manager-essence-edit-first-state" caption="The editor's Identity tab beside the live preview, on an essence that is currently disabled." %}

Choose **Save** when you are done.
An essence always saves, even with warnings, unless it has a blocking issue such as a missing name or icon.

### Example essences

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Essence | Description |
|:--------|:------------|
| Fire | The raw energy of flame |
| Frost | The biting cold of winter |
| Arcane | Pure magical energy |
| Nature | The vitality of the natural world |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Assigning Essences to Components

In the **Items** tab of the GM admin, each component can have essences assigned with quantities:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Item | Fire | Frost | Arcane |
|:-----|:-----|:------|:-------|
| Dragon Scale | 3 | 0 | 1 |
| Frost Crystal | 0 | 4 | 0 |
| Arcane Dust | 0 | 0 | 2 |
| Phoenix Feather | 5 | 0 | 2 |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Enabling and disabling an essence

Every essence has an **Enabled** switch, both on its library row and on its **Identity** tab.
Disabling an essence never deletes anything.
Every component that carries it, and every recipe that requires it, keeps that reference and keeps rendering it, marked **Disabled**.

Disabling only suppresses what the essence does to a crafted result.

- A disabled essence's active effect transfer does not run.
- A disabled essence's property macro does not run.

{: .note }
> Disabling an essence does **not** stop it counting.
> A disabled essence still matches an ingredient requirement, still accumulates across the items you hold, and is still consumed by a craft, exactly as before.
> Only its behaviour on the crafted result is suppressed, never its quantity.
> This is deliberate.
> Toggling an essence mid-session must not change what an item you already hold is worth.

## A disabled essence blocks recipe activation

A recipe cannot be enabled while it requires a disabled essence.
Disabling an essence does not retroactively disable a recipe that is already enabled, but Fabricate warns you how many currently-enabled recipes can no longer be re-enabled while the essence stays disabled.

Re-enabling the essence clears the block, with no other change to the recipes it had blocked.

## Using Essences in Recipes

An essence amount is a first-class ingredient option, matched the same way as a component or a tag.
When a player crafts, the essences from their chosen ingredients are totalled and compared against the amount the option asks for.

For example, an option requiring "3 Fire essence" is satisfied by any combination of held items whose Fire essence totals at least 3:

- 1x Dragon Scale (3 Fire) meets it outright.
- 3x Ember Shard (1 Fire each) also meets it.

When two requirements on the same recipe both ask for essences, the player fills one shared pool rather than two separate ones.

{% include screenshot.html case="player-crafting-essence-pool" caption="A player filling one essence pool that two of the recipe's requirements draw on." %}

Because an essence is an option like any other, it can sit inside a group as one of several **Accept instead** alternatives on the recipe editor's Ingredients tab, or stand alone in its own group as a hard requirement.
A group holding only a single essence option is a required essence, meaning the crafter must supply that essence amount in addition to the recipe's other groups.

{% include screenshot.html case="player-crafting-essence-alternative" caption="The player's side of that choice, picking between a component and an essence amount for one requirement." %}

A disabled essence is withheld only from the **add new** picker in the recipe and component editors.
Anywhere it is already referenced, such as an existing recipe requirement or an existing component quantity, it keeps showing, marked **Disabled**, and you can still edit or clear it.

{: .note }
> Earlier versions attached essence requirements to the whole ingredient set through a separate essence map.
That per-set map is superseded by first-class essence options.
Fabricate migrates existing recipes automatically, rewriting each former requirement into a required single-option essence group so the original behaviour is preserved.

## Effect Transfer via Essences

When effect transfer is enabled on a recipe and essences are active, Fabricate can transfer active effects from an essence's source item to crafted results.
See [Effect Transfer]({% link essences/effect-transfer.md %}) for the full feature, including how to link a source item to an essence.

A disabled essence never transfers effects, even when the recipe and both feature toggles are on.

## The essence property macro

Turn on **Property macros** in the crafting system's feature toggles, then drop a macro onto an essence's **On craft** tab to give that essence the ability to rewrite a crafted result's data before it is created.

The macro receives the recipe, the crafting system, the crafting character, every ingredient and tool involved, every essence the craft resolved and how much of each was used, which essence is invoking it and how much of that one was used, the check result, the step, and which of the recipe's results is being created.
Knowing which essence is invoking it, and how much of it was used, lets one shared macro answer differently for different essences, such as adding damage per unit of Fire.

The macro should return the set of property changes to make to the item being created.
When more than one essence on a crafted result carries a property macro, they run one at a time, in the order the essences are listed in the crafting system, before the result's own property macro runs last.
If one essence's macro fails, only that essence's changes are skipped.
Every other essence's macro, and the result's own macro, still runs.

{: .warning }
> Fabricate only runs a **script** macro from an essence.
> A **chat** macro, which is what a newly created Foundry macro defaults to, is refused with a warning when you drop it onto the essence, and is refused again, silently, at craft time if one somehow reaches an essence anyway, for example through an imported crafting system.
> Change the macro's type to **Script** before linking it.

{: .note }
> A macro stored in a compendium pack works for you as the GM, but a player crafting with that essence needs permission to read the pack the macro lives in.
> Without it, the macro quietly does nothing for that player while it keeps working for you.

## Bulk edit and bulk delete

Select more than one essence in the library, using the checkbox on each row, to open the bulk edit panel in place of the single-essence inspector.

From there you can:

- stage an icon, a colour, or an enabled/disabled status across every selected essence, leaving anything you do not touch unchanged
- see how many essences are currently selected before you apply

Names, descriptions, linked source items, and property macros are never touched by a bulk edit.
Edit those on the essence itself.

**Delete selected essences** states its impact before you can confirm it, how many essence definitions will be deleted, how many components carry one or more of them, and how many recipes will be rewritten to drop them.
An essence in use is never excluded: deleting it removes it from every component that carries it and rewrites every recipe that requires it.
Deleting a single essence from its inspector warns you the same way, stating how many components it is removed from and how many recipes are rewritten before you confirm.

Deleting is a two-step action.
The first click arms the **Delete** button, and a second click confirms it.
Click elsewhere to back out instead.

---

## See Also

- [Effect Transfer]({% link essences/effect-transfer.md %}).
Configure the effect transfer pipeline that uses essence source items.
- [Recipes overview]({% link crafting/recipes/index.md %}).
See how essence requirements work inside ingredient sets.
- [Recipe Manager API]({% link api/recipe-manager.md %}).
Create and manage recipes with essence-based ingredients programmatically.

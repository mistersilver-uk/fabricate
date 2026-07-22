---
layout: default
title: Tools
nav_order: 5
---

# Tools

Tools are reusable items that an actor must have for crafting, salvage, or gathering.
They can grant a check bonus, wear out, break, or turn into a damaged item.

Each crafting system owns one shared **Tools** library.
Recipes, steps, ingredient sets, salvage configurations, and gathering tasks all select Tools from that library.

## Open the Tool Studio

Open the Crafting System Manager and select a crafting system.
Choose the top-level **Tools** entry between **Essences** and **Gathering**.

The library shows each Tool's image, display name, enabled state, breakage summary, and validation state.
Select a row to inspect it.
Choose **Edit Tool** to open its editor.

**Ready** means the Tool passes every validation check.
**Needs attention** means the Tool has one or more issues.
The inspector shows the issue count before you open the editor.

The library also owns the system-wide **Tool breakage source** setting.
Changing this setting takes effect immediately and does not erase the inactive Tool settings.

## Create or link a Tool

You can create a Tool in three ways:

- Choose an Item under **Start unlinked or from an Item**, then choose **Create from Item**.
- Drop a world or compendium Item onto the creation area.
- Choose **Create unlinked**, then link an Item from the **Overview** tab.

You can also drop a managed Component onto the Tools library to start a Component-linked Tool.
Use this when the same item is both a Tool and a crafting material.

Fabricate records the linked Item's name, image, and description when you create or relink the Tool.
Later changes to the source Item do not refresh that stored display automatically.
Open **Overview** and use **Replace linked Item** when you want a new source and a fresh display snapshot.

A **Display label** overrides the stored source name in Fabricate without changing the Item.
Unlinking the Item preserves the draft, but the Tool cannot be saved until it has a linked Item or managed Component.

## Edit a Tool

The editor has four tabs:

- **Overview** controls the linked Item, display label, and enabled state.
- **Breakage** controls wear, check-driven immunity, on-break behavior, replacement, and repair materials.
- **Requirements** controls shared character prerequisites and the Tool check bonus.
- **Validation** lists every issue that blocks saving.

The behavior preview summarizes the draft while you work.
The **Unsaved** state appears after a change.
Leaving the editor with unsaved changes offers **Save**, **Discard**, and **Keep editing**.

Choose **Save changes** when the Tool is ready.
An invalid or failed save keeps the editor open and moves attention to **Validation**.
Validation and operation failures use safe descriptions instead of technical error details.

## Presence and prerequisites

Every referenced Tool must be enabled and present before the activity can begin.
The acting actor must own a non-broken matching Item unless a Tool station provides virtual presence.

Presence matching accepts familiar copies so players can use Items copied from the Tool's source.
Usage and breakage require a durable identity match because those actions can change or delete an Item.
A loosely recognized copy can satisfy presence while being spared from usage and breakage.

{: .note }
> Use **Repair Item Data** or issue a fresh copy from the source Item when a Tool is present but does not track use or break.
> See [Tools Not Breaking or Tracking Usage]({% link troubleshooting.md %}#tools-not-breaking-or-tracking-usage).

The **Requirements** tab can apply shared character prerequisites defined for the crafting system.
Every selected prerequisite is required.
The same actor that supplies the owned Tool must satisfy them.

Choose what happens when those prerequisites fail:

- **Tool is unusable** blocks crafting, salvage, and gathering as though the Tool were missing.
- **Bonus is withheld** keeps the Tool usable but suppresses its numeric bonus.

## Tool check bonuses

Enable **Tool check bonus** in the **Requirements** tab and enter a bonus expression.
The expression is evaluated against the actor who supplies the Tool.

Recipes decide how each required Tool bonus contributes:

- **Always** adds the bonus.
- **Highest only** competes with other Tools in that mode, and only the greatest value is added.
- **Never** ignores the Tool's bonus for that recipe.

All **Always** bonuses and the greatest **Highest only** bonus can contribute to the same crafting check.
Salvage applies every eligible Tool bonus.
Gathering checks do not apply numeric Tool bonuses.

See [Recipes]({% link recipes/index.md %}#tool-bonus-modes) for recipe authoring.

## Tool breakage source

The library's **Tool breakage source** setting decides what determines whether a required Tool breaks.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Source | Behaviour |
|:-------|:----------|
| Tool-specific | Each Tool's own **Limited uses**, **Breakage chance**, or **Dice expression** configuration decides whether it breaks. |
| Check-driven | The active check's breakage settings decide whether required Tools break. The Tool-specific configuration is retained but not evaluated. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Under **Check-driven**, each Tool also has a separate **Breakable** or **Immune** choice.
An **Immune** Tool is excluded when the check breaks other required Tools.
This choice does not replace or erase the Tool's retained Tool-specific breakage configuration.

Authority decides whether Tool-specific settings or the active check controls breakage.
The Tool's **Breakable** or **Immune** choice decides whether it participates in check-driven breakage.
The **On-break action** decides what happens after a break.

See [Tool breakage triggers]({% link crafting-checks.md %}#tool-breakage-triggers) for check-driven setup.

## Tool-specific breakage mechanics

Under **Tool-specific**, choose one breakage mechanic:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mechanic | Behaviour |
|:---------|:----------|
| Limited uses | The Item's usage counter increases on each attempt. The Tool breaks after the chosen maximum has been reached. A blank maximum means unlimited use while still tracking usage. |
| Breakage chance | A percentage from 0 to 100 is tested on each attempt. Zero never breaks and 100 always breaks. |
| Dice expression | Fabricate rolls the expression against the acting actor and breaks the Tool when the result is below **Break below**. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Only **Limited uses** stores an Item usage counter.
Switching to **Check-driven** retains the configured mechanic for a later switch back.

## On-break actions

Choose one **On-break action**:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Action | Behaviour |
|:-------|:----------|
| Destroy item | Removes the owned Tool Item. |
| Mark as broken | Keeps the Item, marks it broken, and appends " (broken)" to its name. The broken Item cannot satisfy future Tool requirements until a GM clears the mark and restores its name. |
| Replace with item | Creates one replacement Item and then removes the original Tool. The target can be a managed Component or a direct Item. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Replacement is lossless when the target cannot be resolved or created.
Fabricate keeps the original Tool rather than deleting it without a replacement.

Use a managed Component target when the damaged item should participate in Fabricate recipes and Component matching.
Use a direct Item target when the replacement does not need to be a managed Component.

## Repair materials

Choose **Mark as broken** to author optional **Repair materials**.
Repair materials use the same structure as recipe ingredients.
Every required group must be satisfied, and any one option inside a group can satisfy that group.

You can add requirements for Components, tags, essences, and currency.
Every added group must be complete and every option must have a positive quantity before the Tool can be saved.

{: .warning }
> Repair execution is planned and is not yet available.
> The Tool Studio saves and validates the repair materials now, but it does not provide a repair action.

## Reference a Tool

After saving the Tool, select it wherever it is required.

- A recipe-level Tool applies to the whole recipe and every step.
- A step-level Tool applies only to that step.
- An ingredient-set Tool applies only when that set is selected.
- A salvage Tool is required for that salvage setup.
- A gathering Tool is required for that gathering task.

Crafting combines the applicable recipe, step, and ingredient-set Tools for the attempt.
A missing, disabled, broken, or unusable Tool blocks the activity.

## Failure behavior

Crafting and salvage each have their own **Break tools on a failed check** policy.
These policies decide whether otherwise applicable Tool breakage can run after a failed check.

Gathering uses **Tool breakage outcome** under **Gathering Rules**.
This setting decides whether a broken Tool fails the whole attempt or whether rewards are still awarded.
It does not decide whether the Tool breaks.

## What results show

Activity results record what happened to each required Tool.
Chat cards show the Tools involved and any breakage.

## Migration from Catalysts

Fabricate converts retired Catalysts into system-owned Tools when older data is upgraded.
The conversion preserves required references, limited-use counters, and the previous destroy or retain behavior.
Gathering Tools stored by early versions are also reconciled into the system library.

---

## See Also

- [Recipes]({% link recipes/index.md %}).
Configure recipe Tool requirements and bonus modes.
- [Degrading Tools]({% link how-to/degrading-tools.md %}).
Build a Tool that wears out through repeated crafting.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}).
Apply the shared Tool setup to gathering.
- [Canvas Interactables]({% link canvas-interactables.md %}).
Provide virtual Tool presence from a Scene Region station.

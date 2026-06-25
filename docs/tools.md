---
layout: default
title: Tools
nav_order: 5
---

# Tools

Tools are items that are **required for an activity but not consumed** by it.
They represent the reusable, breakable equipment a craft or a gathering attempt depends on, such as a blacksmith's forge, an alchemist's cauldron, a wizard's focus, or a miner's pick.

---

Imagine a blacksmith who needs an anvil and hammer to forge a blade, or an alchemist who brews potions in a cauldron.
These tools are essential to the work, but they are not used up by it.
The cauldron is still there after the potion is bottled.
A **Tool** models exactly this.
It is an item that must be present (and may need to pass a requirement) before an activity can proceed, and that may wear out and break over repeated use.

Tools belong to the crafting system.
Each crafting system carries its own shared **Tools library**, authored on the system's dedicated **Tools** page in the Crafting System Manager.
They are not owned by a gathering environment or task.
A gathering task only points to a Tool that lives in the system's library.
The same Tool entry can therefore gate a recipe step, a salvage operation, and a gathering task across the one system.

## Where Tools are required

A Tool becomes a prerequisite wherever you reference it in the UI.

You can require a Tool on a whole recipe, where it applies to every step and ingredient set in that recipe.
You can require a Tool on a single step of a multi-step recipe, where it applies only to that step.
You can require a Tool on a specific ingredient set, where it applies only when that ingredient set is selected.
You can require a Tool on a gathering task, where it must be present to attempt the task.
You can require a Tool on a salvage setup, where it must be present to salvage the component.

For crafting, the Tools that apply to a given attempt are everything required at the recipe level, the step level, and the selected ingredient set combined.
If a referenced Tool no longer exists in the library, Fabricate quietly drops the stale reference rather than failing.
This is the same behaviour gathering tasks use.

## The requirement gate

Every applicable Tool must be **present** in the source actor's inventory and must **pass its optional requirement** before the activity can proceed.
The owned item is recognised whether it is the Tool component's source world item or a copy duplicated from it.

A Tool's optional requirement is a condition checked against the acting character that must pass.
You write it as a single roll expression evaluated against the character's roll data, for example a proficiency check.
A requirement with no expression is invalid.

If a referenced Tool is missing or disabled, or the character does not own a non-broken instance, or the requirement does not pass, the activity is blocked.
In gathering this is reported as a blocked tool.
In crafting the Tool is flagged as missing or unsatisfied in the craftability summary.

## Breakage modes

Each Tool picks exactly one breakage mechanic:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mode | Behaviour |
|:-----|:----------|
| Limited uses | A usage counter ticks up each attempt. The Tool breaks when the counter reaches the chosen maximum. Leave the maximum unset for unlimited use, in which case usage is still tracked. |
| A chance each use | A flat percent chance per attempt that the Tool breaks. Set it to 100 to always break and to 0 to never break. |
| A dice roll | A dice roll is compared against a numeric threshold. The Tool breaks when the roll comes in below the threshold. |
| Immune | The Tool never breaks. It is still recorded as used, but it carries no breakage settings and no on-break action ever runs. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

When you pick **Immune**, the breakage settings for the other modes are hidden, because there is nothing to configure.
An immune Tool is the clean way to model a piece of equipment that is always present but never wears out.

{: .note }
> Only limited-uses Tools track how many times each item has been used.
The other modes never record a per-item usage count.

## Tool breakage source

By default each Tool decides for itself whether it breaks, using the breakage mode you picked above.
You can instead hand that decision to the check the attempt rolls, so the same roll that decides the result also decides whether the required Tools break.

You choose between these two on the system's **Tools** page, in the **Tool breakage source** setting:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Source | Behaviour |
|:-------|:----------|
| Tool-specific | The default. Each Tool's own breakage mode decides whether it breaks. |
| Check-driven | The active check decides whether all of the required Tools break for the attempt. Each Tool's own breakage mode is ignored, with one exception. An Immune Tool still never breaks. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The setting applies to the whole crafting system.
It covers crafting, salvage, and gathering together.

When you switch to **Check-driven**, the Tools page shows a reminder that per-tool breakage modes are no longer evaluated, except Immune.
Immune is how you exempt a single Tool from check-driven breakage.
Set that Tool to Immune and it will never break, even when the check breaks every other required Tool.

You decide exactly when a check-driven check breaks Tools on the check editor itself.
See [Tool breakage triggers]({% link crafting-checks.md %}#tool-breakage-triggers).

## On-break actions

When a Tool breaks, the on-break action you chose runs:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Action | Behaviour |
|:-------|:----------|
| Destroy it | The owned Tool is removed from the character's inventory. |
| Flag it as broken | The Tool stays in inventory but is marked as broken, and Fabricate appends " (broken)" to its name so it reads as broken at a glance. A broken Tool fails the presence check on future attempts until a GM clears it. Clearing the mark does not remove the " (broken)" name, so the GM also renames the Tool back to undo the break. |
| Replace it with a broken variant | The original is removed and a broken variant component is created on the character. You can build a recipe that consumes the broken variant to produce the repaired Tool. While the character holds the broken variant, the gathering app shows the required Tool as **Broken** rather than **Missing**. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Authoring a Tool

Tools are authored in the Crafting System Manager (not constructed via the API).
In Manager V2:

1. **Add the component.** In the system's **Components** tab, add the Tool item as a managed component.
   If you plan to replace the Tool with a broken variant when it breaks, also add the broken-tool variant as a separate component.
2. **Open the system's Tools page.** With a crafting system selected, click the top-level **Tools** entry in the Manager navigation (it sits alongside Components, Essences, and the Gathering group, and it is not nested under Gathering, because Tools belong to the system).
   Click *Add tool*, pick the Tool component (drag-drop from the Items directory or use the dropdown), and optionally set a display label.
3. **(Optional) Add a requirement**, a condition checked against the acting character (see [The requirement gate](#the-requirement-gate)).
4. **Pick a breakage mode**: limited uses, a chance each use, a dice roll, or immune (see [Breakage modes](#breakage-modes)).
5. **Pick an on-break action**: destroy it, flag it as broken, or replace it with a broken variant (see [On-break actions](#on-break-actions)).
6. **Save**, then reference the saved Tool from the recipes, steps, ingredient sets, gathering tasks, or salvage configurations that require it.

## Failure behaviour

By default, Tools are not broken or degraded when a crafting or salvage check fails.
You can change this per system in the crafting check settings.

You can choose to apply Tool breakage on a failed recipe check.
You can separately choose to apply Tool breakage on a failed salvage check.

{: .note }
> See [Consumption on Failure]({% link crafting-checks.md %}#consumption-on-failure) for where these options live.

This applies to check-driven breakage too.
On a failed attempt, a check that would break the required Tools only does so when you have allowed breakage on failure for that activity.
On a successful attempt the Tools always break when the check says they do.

For gathering, the system-level **Tool breakage outcome** setting (Manager V2 → System Settings → Gathering Rules) decides whether a broken Tool fails the whole attempt (the default) or whether drops are still awarded with the breakage reported alongside.
That setting is separate from the **Tool breakage source** above.
The source decides whether a Tool breaks.
The outcome setting decides what a broken Tool does to the gather.

## What the results show

After an activity that resolved Tools, the result describes what each Tool did.

The run record lists each Tool's outcome for that attempt.
The chat card shows the Tools involved, including any that broke.
Macros that run on success, on failure, or when setting result properties also receive the Tools that were used.

## Migration from Catalysts

If you are upgrading from a version before 0.6.0, every recipe, step, ingredient set, and salvage catalyst is converted automatically into a Tool in the system's library, and each place that used a catalyst now references the matching Tool instead.
After the migration runs, the GM sees a one-time notification with a count of migrated entries and a pointer to the Tools tab.

The conversion preserves behaviour:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Old catalyst | Resulting Tool |
|:-------------|:---------------|
| Present but never consumed | A Tool that never breaks and is flagged as broken if it ever would. It is present-only and tracks no usage. |
| Consumed on use, limited uses, destroyed when exhausted | A limited-uses Tool that is destroyed when it breaks. |
| Consumed on use, limited uses, kept when exhausted | A limited-uses Tool that is flagged as broken when it breaks. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .note }
> The present-only row is a deliberate, behaviour-preserving choice.
A Tool with a zero breakage chance never wears out, matching the old never-consumed behaviour.
For new Tools you author by hand, the Immune mode is the clearer way to say "this never breaks".

Identical catalysts are combined into a single shared library Tool.
Catalysts that differ in meaning are kept separate.
Recipes whose crafting system is missing are skipped rather than causing an error.
The migration is safe to run more than once.

**In-flight usage counters.** A Tool that you had already worn down as a catalyst keeps its used count after the upgrade.
This matters only for migrated limited-uses Tools.
The first use after the upgrade records the count in the new place, and that becomes authoritative from then on.

### Tool library relocation (0.7.0)

In early gathering builds, Tools authored in the Manager were stored with the gathering configuration rather than with the crafting system.
Now that Tools belong to the system, a second upgrade step moves any such Tools onto the matching crafting system and clears the old copy, so there is a single library.
It combines duplicates by Tool.
When the same Tool already exists on the system, the existing system Tool wins and the stale copy is dropped rather than merged.
Tools whose system no longer exists are left in place rather than discarded.
Like the earlier step, it is safe to run more than once.
Once the old copies are cleared, running it again does nothing.

---

## See Also

- [Recipes overview]({% link recipes/index.md %}).
How Tools fit into recipe definitions and resolution modes.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}).
A worked example of a gathering Tool that wears out.
- [Canvas Interactables]({% link canvas-interactables.md %}).
Place Tool stations on the canvas as Scene Regions players activate by walking in, so they can use a Tool without owning it.
- [Crafting Engine API]({% link api/crafting-engine.md %}).
Programmatic control over crafting runs and Tool validation.

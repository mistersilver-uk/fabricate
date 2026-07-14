---
layout: default
title: Breakable Gathering Tools
parent: How-To Guides
nav_order: 4
---

# Breakable Gathering Tools

## Problem

How do I require an actor to wield a tool for a gathering task, have that tool wear out or break, and optionally produce a damaged item that can be repaired through a recipe?

## Short answer

Author the tool once on the crafting system's top-level **Tools** page (Tools are system-owned, shared across crafting, gathering, and salvage).
Pick one of three breakage mechanics (limited uses, breakage chance, or dice expression), pick what happens when it breaks (destroy, mark broken, or replace with another component), require that tool from the relevant Gathering Task, and set the system-level **Tool breakage outcome** policy in the gathering rules.

## Steps

1. **Define the tool component.** In the crafting system's Items tab, add the tool item as a managed component.
   If you plan to use the **Replace with** on-break action, also add the broken-tool variant as a separate managed component.
   A managed component is only required for the **Replace with** action.
   Otherwise you can skip this step and drop the Item directly onto the Tools page to create an item-sourced tool.
   See [Authoring a Tool]({% link tools.md %}#authoring-a-tool).
2. **Open the Tools page.** In Manager V2, with the crafting system selected, click the top-level **Tools** navigation entry (a sibling of Components, Essences, and the Gathering group).
   It is *not* nested under Gathering, because Tools belong to the system, not the gathering config.
   The page lists the system's library of reusable tools and opens an in-memory draft you can edit before saving.
3. **Add a tool.** Click *Add tool*.
   Pick the tool component from the picker (drag-drop from the Items directory or use the dropdown), or drop an Item to create an item-sourced tool.
   Optionally set a display label.
4. **(Optional) Add a tool requirement.** Click *Add requirement* to require a condition on the character.
   The requirement is a Foundry expression.
   If it does not hold true when the player attempts a task that uses this tool, the attempt is blocked.
   Examples:
   - dnd5e: `@flags.dnd5e.proficient` (set on actors that have the relevant proficiency)
   - Any system: a macro that decides whether the character is allowed, with an optional explanation
5. **Pick a breakage mechanic.** Each tool uses exactly one:
   - **Limited uses**.
The tool's **Max uses** counter ticks up each attempt.
     The tool breaks when the counter reaches the limit.
     Leave the field blank for unlimited uses.
   - **Breakage chance**.
A flat 0 to 100 percent chance per attempt that the tool breaks.
     100 always breaks, 0 never breaks.
   - **Dice expression**.
Author a Foundry roll formula (for example `1d20 + @abilities.str.mod`) and a numeric threshold.
     The tool breaks when the roll result is below the threshold.
   - **Immune**.
The tool never breaks.
     It is still recorded as used, and it has no breakage settings to fill in.
6. **Pick what happens when it breaks.** Each tool picks one:
   - **Destroy item**.
The owned tool is removed from the character's inventory.
   - **Mark as broken**.
The tool stays in inventory but is marked as broken, and Fabricate appends " (broken)" to its name so it reads as broken at a glance in the inventory.
     Broken tools block future attempts until a GM clears that mark.
     Clearing the mark does not remove the " (broken)" name, so the GM also renames the tool back to undo the break.
   - **Replace with...**.
Pick a second managed component (the "broken" variant).
     On break, the original is removed and the replacement is created on the character.
     The replacement is a normal component, so you can build a recipe that consumes it to produce the repaired tool.
     While the character holds the broken variant, the player Gathering app shows the required tool as **Broken** rather than **Missing**, signalling that it needs repair (the attempt stays blocked until the working tool is restored).
7. **Click *Save changes*.** The page shows an *Unsaved* chip when you have pending edits.
   Navigating away while there are unsaved edits prompts before discarding.
8. **Require the tool from a task.** Open the selected system's Gathering Tasks, edit the task, and add the saved tool in the required-tools section.
9. **Decide the system-level outcome.** In Manager V2 then System Settings then Gathering Rules, set **Tool breakage outcome** to either *Attempt fails on break* (the default, where a broken tool fails the whole attempt and awards nothing) or *Attempt succeeds despite break* (rewards are awarded, and the breakage is reported alongside).

## What happens at the table

- Before the attempt starts, Fabricate checks each required tool.
  A tool that is missing from the library or has been disabled blocks the attempt.
  Then Fabricate checks each tool against the character's inventory: the character must own a non-broken copy and the requirement (if any) must hold true.
  A missing tool or a failed requirement also blocks the attempt.
  The owned item is recognised whether it is the original world item or a copy the player dragged or duplicated from it, so handing a player a copy of the tool works the same as the original.
- During the attempt, each tool's breakage mechanic runs.
  For Limited uses, the count goes up before the break is checked, so a Max uses of 5 lets the tool survive its first five attempts and break on the sixth.
- The breakage is decided *before* any rewards are created.
  With the *Attempt fails on break* policy, the attempt fails when any tool breaks, and no rewards are awarded.
  The destroy, mark, or replace action always happens.
- The attempt result includes a summary of what each tool did this attempt, so chat and log integrations can describe the breakage.

{: .note }
> Presence is matched broadly, but breakage and usage are not.
> Only a copy Fabricate can identify as the tool by a durable link is consumed, marked as broken, or usage-counted.
> A copy duplicated from another item in a world that has not been repaired, or one that merely shares the tool's name, still satisfies presence but is spared from breakage until you repair or re-issue it.
> See [Tools Not Breaking or Tracking Usage]({% link troubleshooting.md %}#tools-not-breaking-or-tracking-usage).

## Learn more

- [Tools]({% link tools.md %}).
The full system-owned Tool model: requirement gate, breakage modes, and on-break actions.
- [Degrading Tools]({% link how-to/degrading-tools.md %}).
The recipe-side equivalent.
- [Canvas Interactables]({% link canvas-interactables.md %}).
Place a Tool station on the canvas so players can use a Tool without owning it.

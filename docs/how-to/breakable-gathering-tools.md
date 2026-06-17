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
Pick one of three breakage mechanics (limited uses, breakage chance, or dice expression), pick what happens when it breaks (destroy, mark broken, or replace with another component), require that tool from the relevant Gathering Task via `task.toolIds`, and set the system-level **Tool breakage outcome** policy in the gathering rules.

## Steps

1. **Define the tool component.** In the crafting system's Items tab, add the tool item as a managed component.
   If you plan to use the `Replace with` on-break action, also add the broken-tool variant as a separate managed component.
2. **Open the Tools page.** In Manager V2, with the crafting system selected, click the top-level **Tools** navigation entry (a sibling of Components, Essences, and the Gathering group).
   It is *not* nested under Gathering, because Tools belong to the system, not the gathering config.
   The page lists the system's library of reusable tools and opens an in-memory draft you can edit before saving.
3. **Add a tool.** Click *Add tool*.
   Pick the tool component from the picker (drag-drop from the Items directory or use the dropdown).
   Optionally set a display label.
4. **(Optional) Add a tool requirement.** Click *Add requirement* to require an actor-side condition.
   The requirement is a Foundry expression.
   If it does not evaluate truthy when the player attempts a task that uses this tool, the attempt is blocked.
   Examples:
   - dnd5e: `@flags.dnd5e.proficient` (set on actors that have the relevant proficiency)
   - Any system: a macro that returns `true`/`false` or `{ allowed, description }`
5. **Pick a breakage mechanic.** Each tool uses exactly one:
   - **Limited uses**. The tool's `Max uses` counter ticks up each attempt.
     The tool breaks when the counter reaches the limit.
     Leave the field blank for unlimited uses.
   - **Breakage chance**. A flat 0 to 100 percent chance per attempt that the tool breaks.
     `100` always breaks, `0` never breaks.
   - **Dice expression**. Author a Foundry roll formula (for example `1d20 + @abilities.str.mod`) and a numeric threshold.
     The tool breaks when the roll result is below the threshold.
6. **Pick an on-break action.** Each tool picks one:
   - **Destroy item**. The owned tool is removed from the actor's inventory.
   - **Mark as broken**. The tool stays in inventory but receives the `flags.fabricate.toolBroken = true` flag.
     Broken tools fail the presence gate on future attempts, so a task is blocked until a GM clears the flag (Foundry item flag editor).
   - **Replace with...**. Pick a second managed component (the "broken" variant).
     On break, the original is deleted and the replacement is created on the actor.
     The replacement is a normal component, so you can build a recipe that consumes it to produce the repaired tool.
     While the actor holds the broken variant, the player Gathering app shows the required tool as **Broken** rather than **Missing**, signalling that it needs repair (the attempt stays blocked until the working tool is restored).
7. **Click *Save changes*.** The page tracks dirty state with an *Unsaved* chip.
   Navigation away while dirty prompts before discarding.
8. **Require the tool from a task.** Open the selected system's Gathering Tasks, edit the task, and add the saved tool in the required-tools section.
   Fabricate stores this as `task.toolIds`.
9. **Decide the system-level outcome.** In Manager V2 → System Settings → Gathering Rules, set **Tool breakage outcome** to either *Attempt fails on break* (the default, where a broken tool fails the whole attempt and clears its drops) or *Attempt succeeds despite break* (drops are awarded, and the breakage is reported alongside).

## What happens at the table

- Before the attempt starts, Fabricate resolves each configured `toolId`.
  Missing or disabled library references block with `TOOL_BLOCKED`.
  Then Fabricate checks each resolved tool against the actor inventory: the actor must own a non-broken instance and the requirement (if any) must evaluate truthy.
  Missing actor tools or failed requirements also block with `TOOL_BLOCKED`.
  The owned item is recognised whether it is the tool component's source world item itself or a copy the player dragged or duplicated from it, so handing a player a copy of the tool works the same as the original.
- During resolution, each tool's breakage mechanic runs.
  The `limitedUses` counter increments before the comparison, so `maxUses: 5` lets the tool survive its first five attempts and breaks on the sixth.
- The breakage rolls happen *before* result creation.
  With the `failureOnBreak` policy the success state flips to `failed` when any tool breaks, and no drops are awarded.
  The destruction / flag / replacement always commits.
- The terminal response includes a `usedTools` array describing what each tool did this attempt, so chat/log integrations can describe the breakage.

## Learn more

- [Tools]({% link tools.md %}). The full system-owned Tool model: requirement gate, breakage modes, and on-break actions.
- [Degrading Tools]({% link how-to/degrading-tools.md %}). The recipe-side equivalent.
- [Canvas Interactables]({% link canvas-interactables.md %}). Place a Tool station on the canvas so players can use a Tool without owning it.

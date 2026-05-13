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

Add the tool as a **Tool** on the gathering task. Pick one of three breakage mechanics (limited uses, breakage chance, or dice expression), pick what happens when it breaks (destroy, mark broken, or replace with another component), and set the system-level **Tool breakage outcome** policy in the gathering rules.

## Steps

1. **Define the tool component.** In the crafting system's Items tab, add the tool item as a managed component. If you plan to use the `Replace with` on-break action, also add the broken-tool variant as a separate managed component.
2. **Open the gathering task editor.** From Manager V2 → Environments, edit the task and switch to the **Tools** tab.
3. **Add a tool.** Click *Add Tool*. Pick the tool component from the picker.
4. **(Optional) Add a tool requirement.** Click *Add Requirement* to require an actor-side condition. The requirement is a Foundry expression; if it does not evaluate truthy when the player attempts the task, the attempt is blocked. Examples:
   - dnd5e: `@flags.dnd5e.proficient` (set on actors that have the relevant proficiency)
   - Any system: a macro that returns `true`/`false` or `{ allowed, description }`
5. **Pick a breakage mechanic.** Each tool uses exactly one:
   - **Limited uses** — the tool's `Max uses` counter ticks up each attempt; the tool breaks when the counter reaches the limit. Leave the field blank for unlimited uses.
   - **Breakage chance** — a flat 0–100 percent chance per attempt that the tool breaks. `100` always breaks, `0` never breaks.
   - **Dice expression** — author a Foundry roll formula (for example `1d20 + @abilities.str.mod`) and a numeric threshold. The tool breaks when the roll result is below the threshold.
6. **Pick an on-break action.** Each tool picks one:
   - **Destroy item** — the owned tool is removed from the actor's inventory.
   - **Mark as broken** — the tool stays in inventory but receives the `flags.fabricate.toolBroken = true` flag. Broken tools fail the presence gate on future attempts, so the task is blocked until a GM clears the flag (Foundry item flag editor).
   - **Replace with...** — pick a second managed component (the "broken" variant). On break, the original is deleted and the replacement is created on the actor. The replacement is a normal component, so you can build a recipe that consumes it to produce the repaired tool.
7. **Decide the system-level outcome.** In Manager V2 → System Settings → Gathering Rules, set **Tool breakage outcome** to either *Attempt fails on break* (the default — a broken tool fails the whole attempt and clears its drops) or *Attempt succeeds despite break* (drops are awarded; the breakage is reported alongside).

## What happens at the table

- Before the attempt starts, Fabricate checks each configured tool: the actor must own a non-broken instance and the requirement (if any) must evaluate truthy. Missing tools or failed requirements block the start with a `TOOL_BLOCKED` reason.
- During resolution, each tool's breakage mechanic runs. The `limitedUses` counter increments before the comparison, so `maxUses: 5` lets the tool survive its first five attempts and breaks on the sixth.
- The breakage rolls happen *before* result creation. With the `failureOnBreak` policy the success state flips to `failed` when any tool breaks, and no drops are awarded — but the destruction / flag / replacement always commits.
- The terminal response includes a `usedTools` array describing what each tool did this attempt, so chat/log integrations can describe the breakage.

## Learn more

- [Catalysts]({% link catalysts.md %}) — same persistence pattern, but for recipes.
- [Degrading Tools]({% link how-to/degrading-tools.md %}) — the recipe-side equivalent.

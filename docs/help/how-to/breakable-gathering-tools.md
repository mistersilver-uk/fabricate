---
layout: default
title: Breakable Gathering Tools
parent: How-To Guides
nav_order: 3
grand_parent: Help
---

# Breakable Gathering Tools

## Problem

How do I require a Tool for gathering and decide what happens when it breaks?

## Short answer

Create the Tool once in the crafting system's **Tools** library, configure its breakage behavior, and add it to the Gathering Task.
Then choose the system's **Tool breakage outcome** under **Gathering Rules**.

## Steps

1. Open the Crafting System Manager and select the crafting system.
2. Open the top-level **Tools** page.
3. Create the Tool by dropping a world or compendium Item onto the library.
4. Open **Breakage** in the Tool editor.
5. Under a **Tool-specific** breakage source, choose **Limited uses**, **Breakage chance**, or **Dice expression**.
6. Under a **Check-driven** breakage source, choose whether this Tool is **Breakable** or **Immune**.
7. Choose **Destroy the item**, **Mark as broken**, or **Replace with component** as the **On-break action**.
8. Open **Validation**, resolve every issue, and choose **Save changes**.
9. Open **Gathering Tasks** and edit the task.
10. Add the saved Tool to the task's required Tools.
11. Open **System Settings**, then **Gathering Rules**.
12. Set **Tool breakage outcome** to **Attempt fails on break** or **Attempt succeeds despite break**.

## Shared prerequisites

The Tool's **Requirements** tab can require shared character prerequisites.
Choose **Tool is unusable** when a failed prerequisite should block gathering.
Choose **Bonus is withheld** when it should preserve Tool usability.

Gathering never applies the Tool's numeric check bonus.
The bonus can still apply when the same Tool is used for crafting or salvage.

## Check-driven breakage

Set **Tool breakage source** to **Check-driven** when the gathering check should decide whether Tools break.
Configure the gathering check's breakage conditions under **Checks**.
An individual trigger on that check can also break the required Tools whenever it fires, whatever the failure policy says.

{% include screenshot.html case="manager-checks-crafting-trigger-break-tools" caption="The Crafting check's Triggers tab, whose break-tools card the Gathering check carries too." %}

The active check can break all required **Breakable** Tools.
An **Immune** Tool is excluded.
Its retained Tool-specific mechanic is not evaluated until the system returns to **Tool-specific**.

{% include screenshot.html case="manager-tool-stress-immune" caption="An immune Tool, with its on-break actions greyed out because it never runs one." %}

Immediate d100 gathering has no engine-evaluated check that can trigger check-driven Tool breakage.
Use **Tool-specific** when an immediate d100 task needs per-attempt breakage.

## What happens at the table

Fabricate first checks that every required Tool is enabled, present, not broken, and usable.
A failed **Tool is unusable** prerequisite blocks the attempt as though the Tool were missing.

Breakage resolves before gathering rewards are created.
The chosen **On-break action** still commits when a Tool breaks.
**Tool breakage outcome** then decides whether rewards are withheld or awarded.

Presence accepts familiar Item copies, but usage and breakage require a durable identity match.
A loosely recognized copy can allow the attempt while being spared from destructive changes.
See [Tools Not Breaking or Tracking Usage]({% link help/troubleshooting.md %}#tools-not-breaking-or-tracking-usage) when that happens.

## Learn more

- [Tools]({% link tools.md %}).
  Learn the complete shared Tool authoring workflow.
- [Degrading Tools]({% link help/how-to/degrading-tools.md %}).
  Build a limited-use crafting Tool.
- [Canvas Interactables]({% link canvas-interactables.md %}).
  Provide a Tool station without requiring actor ownership.

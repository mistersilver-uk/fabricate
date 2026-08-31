---
layout: default
title: Gathering
parent: Checks
nav_order: 3
---

# Gathering Checks

{: .note }
> **Checks › Gathering** appears only while the **Gathering** feature is switched on for the system.

The gathering check is authored once for the whole crafting system, beside the crafting and salvage checks.
Individual gathering tasks do not carry their own check.

{% include screenshot.html case="manager-checks-gathering" %}

## Authoring the check

The page is laid out in the same five sections the Crafting page uses — **The roll**, **Outcomes**, **Triggers**, **Modifiers**, and **On failure** — and they behave identically.
See [The Checks screen]({% link checks/index.md %}#the-checks-screen) for the editor, and [Check modifiers]({% link checks/index.md %}#check-modifiers) for the named-modifier library all three activities select from.

## What the check decides

A **routed** gathering task is resolved by this check.
The check rolls, produces a named outcome, and that outcome name is matched to one of the task's result groups by name.
A routed task whose system has no gathering check formula reports a setup problem for the GM to fix rather than resolving.
See [Routed Result Selection]({% link gathering/tasks.md %}#routed-result-selection).

A **progressive** gathering task needs an award mode and a check formula of its own, set on the task.
See [Progressive Checks]({% link gathering/tasks.md %}#progressive-checks).

The system's gathering resolution mode decides which of these applies.
See [Gathering Resolution Mode]({% link gathering/settings.md %}#gathering-resolution-mode).

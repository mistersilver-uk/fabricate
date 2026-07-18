---
layout: default
title: Journal
nav_order: 11
---

# Journal

The **Journal** is the player-facing home for keeping track of the runs your characters have started.
It is a tab in the unified Fabricate window, alongside Crafting, Gathering, and the other player tabs.
Open it the same way you open the other player tabs, then pick a character you own in the actor-selection bar at the top.

The Journal **monitors** your crafting, gathering, and salvage runs in one place, and lets you **advance** crafting runs.
It does not start new runs.
You begin crafting in the Crafting flow and start gathering in the Gathering tab, and those runs then appear here for you to watch and continue.

When no character is selected the Journal shows a short prompt:
"Select a character to see their crafting, gathering, and salvage runs."

---

## Active Runs

The left column lists the selected character's **Active Runs**: every run that has not yet finished.
Each entry shows the run's name, the crafting system it belongs to, a status badge, and a crafting-progress bar for crafting runs.

Runs that are still waiting on the game clock show a countdown to when they will be ready.
The status badge tells you where a run stands:

- **Ready** means the run has waited long enough and can be continued now.
- **Waiting** means the run is still counting down and cannot be continued yet.
- **In progress** means the run is underway with no active wait.

You can sort the active list by **Soonest Ready** or by **Newest**.
Soonest Ready puts the runs you can act on first, then the ones that will be ready soonest.

A live count badge on the **Journal** tab shows how many active runs the selected character has.
The badge stays accurate even while the Journal tab is closed, and it disappears when there are no active runs.
It also keeps pace when another player or your GM starts, advances, or finishes a run for that character, so the count and the run lists update on their own once that character's data reaches your client, with no need to reload the window.

## History

Below the active list, **History** shows runs that have finished.
A finished run carries a status of **Succeeded**, **Failed**, or **Cancelled**.

Failed alchemy brews appear here too.
An alchemy attempt that matched no recipe is listed as a generic **Failed alchemy attempt** that never names a recipe, so it cannot reveal an undiscovered recipe.
For an alchemy system, whether players see these failed attempts is controlled by the GM's **Show attempt history to players** option.
The GM always sees them.

History is paginated.
You can choose how many runs to show per page and step through the pages.
You can also sort history by **Newest** or **Oldest**.

## Run detail

Select any run, active or finished, to open its full detail in the centre column.

The detail panel opens with the run's name, image, status badge, and tags for the recipe structure and the current step.
A single-step recipe is labelled as such, and a multi-step recipe shows which step the run is on, like "Step 2 of 4".

For crafting runs the detail panel shows the run's requirements, plus a **step timeline** for multi-step recipes.
A multi-step recipe titles this card **Step requirements**, and a single-step recipe titles it **Craft requirements**.
The requirements list what the run needs, which can include:

- **Requires time**, the world time the step must wait through.
- **Primary tool**, the main tool the step uses.
- **Check**, the crafting check the step rolls, shown with its difficulty when one is set.
- **Failure**, an explanation shown when a step has failed.

When a run has succeeded, its detail panel also lists the **Crafted items** it produced, with quantities.

The right column adds three more cards for the selected run:

- **About this run** shows when the run started, its run identifier, the recipe, and the resolution mode.
- **What to expect** explains, in plain language, how this kind of run behaves.
- **Recent results** lists the most recently finished runs, with a **View full history** link back to the history list.

## Continuing a crafting run

Crafting is the only run type you advance by hand.

When a crafting run is selected and not yet finished, the detail panel shows a **Trigger Next Step** button.
The button stays disabled until the current step has waited long enough on the game clock.
While a step is still counting down, a **Time remaining** box shows how long is left and when the step becomes available.
Once enough world time has passed the button becomes active, and triggering it rolls that step's crafting check and moves the run forward.

If the run draws materials from a character you do not own, you cannot advance it yourself.
In that case the Journal asks you to use a character you own or to ask your GM, rather than letting the run fail silently.

## Gathering and salvage runs

Gathering and salvage runs **resolve automatically** as world time advances.
There is no button to press for them.
Their detail panel shows a short note that the run resolves on its own when the world time advances, along with the time-remaining box while a wait is still in progress.

Detailed per-step breakdowns for gathering and salvage runs in the Journal are planned for a later release.
For now the Journal shows their status, timing, and results, and you start and manage gathering itself from the Gathering tab.

## Times use world time

Every countdown, timestamp, and "ready" state in the Journal is measured in the game world's time, not real time.
A countdown only moves when your GM advances the game clock.
The Journal's **Tips** card states this so a paused countdown is not mistaken for a stuck timer.

## See Also

- [Quickstart]({% link quickstart.md %}) walks through creating systems, gathering, and trying Fabricate as a player.
- [Crafting Checks]({% link crafting-checks.md %}) explains the checks a crafting step rolls.
- [Salvage]({% link salvage.md %}) covers how components break down into salvage results.
- [Gathering Environments]({% link gathering-environments.md %}) covers gathering, where gathering runs begin.

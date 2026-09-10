---
layout: default
title: Journal
nav_order: 2
parent: Player App
---

# Journal

The **Journal** is the player-facing home for keeping track of the runs your characters have started.
It is a tab in the unified Fabricate window, alongside Crafting, Gathering, and the other player tabs.
Open it the same way you open the other player tabs, then pick a character you own in the actor-selection bar at the top.

The Journal brings crafting, alchemy, gathering, and salvage runs together and offers the actions each run supports.
It does not start new runs.
Begin in the relevant activity tab, then return here to continue a run or review its results.
New crafting and gathering runs use manual completion by default.

When no character is selected the Journal shows a short prompt:
"Select a character to see their crafting, gathering, and salvage runs."

{% include screenshot.html case="fabricate-journal" caption="The Journal brings ongoing runs and finished history together." %}

---

## Browse Active and Finished

**Active** lists the selected character's unfinished runs.
**Finished** is the history browser for completed, failed, and cancelled runs.
Select a row in either list to read its detail.
The lists and selected detail scroll independently, with sort controls and page controls kept outside the scrolling lists.
In a narrow window they stack in the order Active, Finished, then detail.

Use **Search runs** and **Kind** to filter both lists.
Kind distinguishes Crafting, Alchemy, Gathering, and Salvage.
The Active status filter selects one of **All**, **Ready**, **Waiting**, or **Paused**.
Its counts describe the selected kind before search or paging, so a search can show fewer rows than the status count.

Both lists start with four runs per page and have independent page sizes and page controls.
You can choose 4, 6, 12, or 25 runs per page.
Changing one list's page does not move the other list's page.
Your selected detail stays open even when its row is on another page or hidden by a filter, including a search with no matches.
Removing or dismissing the selected run lets the Journal select another entry.

Runs that are still waiting on the game clock show a countdown to when they will be ready.
The status badge tells you where a run stands:

- **Ready** means the time gate has passed.
  Check the action's availability too, because missing materials, a required decision, or unavailable GM authority can still prevent execution.
- **Waiting** means the run is still counting down and cannot be continued yet.
- **Paused** means the run's remaining wait is frozen until you resume it.
- **In progress** means the run is underway with no active wait.

You can sort the active list by **Soonest Ready** or by **Newest**.
Soonest Ready puts the runs you can act on first, then the ones that will be ready soonest.

A live count badge on the **Journal** tab shows how many active runs the selected character has.
The badge stays accurate even while the Journal tab is closed, and it disappears when there are no active runs.
It also keeps pace when another player or your GM starts, advances, or finishes a run for that character, so the count and the run lists update on their own once that character's data reaches your client, with no need to reload the window.

## Finished history and hiding entries

A finished run carries a status of **Succeeded**, **Failed**, or **Cancelled**.
Sort Finished by **Newest** or **Oldest**, then use its pages to browse history.
The selected detail distinguishes what the run required, what was actually spent, its recorded checks, and what was actually received.
An upcoming or unexecuted stage is not marked completed just because the run ended.

Failed alchemy brews appear here too.
An alchemy attempt that matched no recipe is listed as a generic **Failed alchemy attempt** that never names a recipe, so it cannot reveal an undiscovered recipe.
For an alchemy system, whether players see these failed attempts is controlled by the GM's **Show attempt history to players** option.
The GM always sees them.

Use a finished row's **Hide … from this Journal** control to dismiss it from your view.
This does not delete the character's history or hide it from another user.
Dismissal is remembered for your user in this world across browsers and devices.
It does not carry into other worlds, and active runs cannot be dismissed.

## Run detail

The detail opens with the run's identity and available actions, followed by notices, its outcome when finished, progress, stage requirements, yields, and the **Run record**.
The record labels identifiers separately from readable names and includes the available mode and start or finish times.
One guidance callout at the bottom explains the current activity or state and reminds you how world time and history work.

{% include screenshot.html case="fabricate-journal-craft-detail" %}

### Stage choices and essence carriers

For a multi-stage craft, use the stage navigator to inspect past and upcoming stages, then **Return to current stage** to continue your work.
Viewing another stage never advances the run.
Only the current stage can offer editable material controls, and only while the run permits changes.
A single-stage recipe omits the redundant stage navigator.

Where a recipe offers an **Ingredient route**, select the route you want to use.
Changing route replaces the previous route's ingredient choices and shared essence allocation.
Open an ingredient choice to compare each candidate's held, needed, and spare amounts.
A missing or stale choice needs an explicit replacement, even if only one option remains.
You can repair several choices one at a time, but the whole stage must be valid before execution.

**Shared essence allocation** counts physical units of carrier items.
One carrier unit can contribute every applicable essence it carries while being spent only once.
Fixed ingredients, alternative ingredients, and essence carriers share the same available stock, so one physical unit cannot also pay a second ingredient requirement.
Repeated requirements for the same essence add together.
For example, two requirements of two Fire each need four Fire in total.
Extra contribution appears below the carrier list as overshoot.

### Possible yields and Received

**Possible yields** describe what the authored activity could produce.
They are previews, not items already awarded to your character.
**Received** reports recorded results after execution.

- **Direct** gathering previews its result set without a yield roll.
- **d100** gathering compares one shared roll against the item drop chances.
  It does not roll separately for each item.
- **Check** gathering shows the outcome ladder, including failure.
  The ladder explains outcomes and does not let you select one.
- Existing **Progressive** gathering uses its accumulated yield budget and ordered component costs.
  Those costs are not drop chances or outcome tiers.

## Continue, pause, or cancel

New crafting, alchemy, and gathering runs use the current run lifecycle.
When ready, use **Trigger Next Step**, **Finish Crafting**, **Brew**, or **Collect**, as appropriate to the selected run.
Any required player check stays manual.
The action explains why it is unavailable when the run cannot proceed.
You must own the crafting character and its material-source characters, or ask your GM to act.

Starting a timed craft records the wait and your selections without spending editable ingredients or currency.
They are rechecked and spent only when the ready stage executes.
Starting or editing a selection is not a reservation that guarantees the stock will still be there later.
Gathering keeps its existing start-time costs and reservations, including stamina and node use, so waiting to collect does not postpone those costs.

Use **Pause** on an eligible waiting run to freeze its remaining world time.
Choices are retained while paused.
**Resume** starts that remaining wait from the current world time, rather than counting time that passed during the pause.
A paused run cannot execute or complete automatically, but it can still be cancelled when otherwise permitted.

The cancel control opens a confirmation in the action bar.
Read the consequence, then choose **Yes, cancel** or **Keep crafting**.
While that decision is open, the other actions are replaced by those confirmation controls.
For a current-lifecycle run, cancellation forfeits elapsed time and keeps costs already incurred and awards already delivered.
It does not spend current or future unconsumed materials or refund earlier spending.

### When ready

During an active countdown without a player check, **When ready** offers **Ask me** and **Complete**.
**Ask me** is the default and leaves the ready run waiting for your action.
**Complete** allows eligible stages to complete when world time advances.

The preference may be visible even while materials or choices remain unresolved.
Its visibility does not mean the run is eligible to execute automatically.
Automatic crafting stops without spending when a stage needs materials, an ingredient choice, currency, essence allocation, a Tool, or a player check, or when validation fails.
Choosing materials in advance does not authorize automatic material spending.
The preference is retained when blocked, and eligible stages needing no further input can complete automatically.

## GM setup and recovery

Current-lifecycle run changes require an active GM and a single private authority ledger.
If the selected run reports a missing ledger, the active GM sees **Set up authority…** in the Journal.
Before confirming, close every other GM tab and session for this world, including other tabs signed in as the same GM user.
The confirmation explains this single-session prerequisite.
Choosing **Not now** leaves setup untouched.
Successful setup creates the private ledger and refreshes the Journal.
Setup does not replace an existing ledger, resolve duplicates, or clear an interrupted operation.
Players and other GMs see the availability reason and should ask the active GM for help.

If an operation stops after an effect may have happened, the Journal can show **This run needs GM attention**.
Its evidence distinguishes confirmed effects with recorded receipts, an uncertain effect that must not be repeated, and effects not started.
A planned quantity is not proof of spending or an award.
Ordinary execution and cancellation remain unavailable for a run requiring recovery.

An unresolved execution claim can also block other current-lifecycle runs.
The active GM must inspect the recorded receipts and the uncertain boundary, then manually record a reconciliation or abandonment through the recovery API.
That releases the matching claim only.
It never retries the uncertain effect, makes the old request replayable, or automatically rolls anything back.
The uncertain run remains marked as requiring recovery.

### Hidden identity and private checks

A hidden crafting recipe or blind gathering task keeps its protected details out of your Journal view.
The owner still has the actions the run's lifecycle permits, subject to the same timing, authority, and recovery restrictions as other runs.
The GM can see permitted secret previews.

For a secret check, the player receives a generic prompt and the GM evaluates and privately posts the roll.
Secret roll details are not handed back for player-side posting or dice animation.
For an entitled non-secret check, the initiating client can post the already evaluated roll without rolling again.
Foundry's private-roll and whisper visibility is a presentation rule, not a confidentiality guarantee.
A missing chat message is not a reason to repeat spending or awards.

## Older runs and salvage

Runs created under the older lifecycle keep their original behavior.
Older crafting runs still advance manually and retain their existing cancellation and refund rules.
Older timed gathering and salvage resolve automatically as world time advances.
Salvage has not moved to the new pause and manual-collection lifecycle.

A run created with an unsupported lifecycle remains available as a read-only record.
Fabricate does not reinterpret it as an older run or allow ordinary mutations.

## Times use world time

Every countdown, timestamp, and "ready" state in the Journal is measured in the game world's time, not real time.
A countdown only moves when your GM advances the game clock.
The world clock is read-only in the Journal.
The detail guidance reminds you of this so an unmoving countdown is not mistaken for a stuck timer.

## See Also

- [Quickstart]({% link help/quickstart.md %}) walks through creating systems, gathering, and trying Fabricate as a player.
- [Crafting Checks]({% link checks/crafting.md %}) explains the checks a crafting step rolls.
- [Salvage]({% link components/salvage.md %}) covers how components break down into salvage results.
- [Gathering Environments]({% link gathering/index.md %}) covers gathering, where gathering runs begin.

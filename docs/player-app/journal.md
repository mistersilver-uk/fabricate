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
Each compact pager keeps its range, arrows, and page-size choice on one row.
Changing one list's page does not move the other list's page.
The list sections keep their space when a page is short or empty, and an empty-state panel fills the available list area.
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

A finished row uses an outcome icon for **Succeeded**, **Failed**, or **Cancelled**.
An unrecognized outcome stays **Outcome unknown**, and settlement or recovery takes precedence over a success indication.
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

An active run opens with its identity, available actions, and relevant notices.
For the current crafting stage, progress and stage navigation lead into the stage's purpose, **Produces**, and **Consumes**.
The current stage's **Time** and **Check** summaries follow.
Protected or unknown check details are not described as **No check**.

The compact **This run** section shows the start time, the closed time for a finished run, and recorded pause timing where applicable.
An untitled guidance callout at the bottom explains the selected state.
Its advice changes when you browse another stage, open finished history, or encounter a blocker or recovery requirement.

{% include screenshot.html case="fabricate-journal-craft-detail" %}

### Stage choices and essence carriers

For a multi-stage craft, use the stage navigator to inspect past and upcoming stages, then **Return to current stage** to continue your work.
Viewing another stage never advances the run.
Past stages pair their recorded **Consumed** and **Produced** evidence with recorded checks and routes.
Upcoming stages pair **Will consume** and **Will produce** previews, including the permitted alternatives and ingredient routes.
These views are read-only and omit the current stage's countdown and separate Time and Check summaries.
Previewing an option does not select it or reserve materials.
Its choices become available when that stage becomes current.
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

### Possible yields and actual results

**Possible yields** describe what the authored activity could produce.
They are previews, not items already awarded to your character.
After execution, history reports actual awards as **Crafted**, **Brought back**, or **Recovered**, according to the activity.

- **Direct** gathering previews its result set without a yield roll.
- **d100** gathering compares one shared roll against the item drop chances.
  It does not roll separately for each item.
  Higher effective rolls clear the displayed thresholds.
- **Check** gathering shows the outcome ladder, including failure.
  The preview ladder explains outcomes and does not let you select one.
- Existing **Progressive** gathering uses its accumulated yield budget and ordered component costs.
  Those costs are not drop chances or outcome tiers.

### Reading a closed run

Finished history is a read-only account of what happened.
It has no active actions, progress bar, stage navigation, editable materials, or Time and Check pair.

A successful single-stage craft with a recorded check starts with **Final check**.
A confirmed no-check resolution shows **Resolution** instead.
A failed checked single-stage craft puts its roll in the failure verdict without a second check summary.
Missing check evidence remains **Not recorded** rather than becoming proof that no check was needed.

When more than one stage was attempted, **How each stage went** presents them together in order, with each stage's check and actual consumed and produced items.
An initialized next stage is not an attempt by itself.
Cancelling before execution leaves timing and cancellation guidance, while cancelling after completed stages retains their actual earlier spending and awards.

**Materials used**, **Crafted**, and **Tools used** use compact image cards in four columns.
Long names are shortened visually, with the full text available in the tooltip.
**Tools used** groups repeated uses only when the history identifies the same physical item.
Each use retains its stage, recorded quantity, and any recorded broken, virtual, spared, or immune state.
Repeated use is not a total of tools consumed, and missing breakage evidence does not mean a tool was intact.
Matching names or images alone do not combine separate tools.

Material, essence-carrier, currency, and award receipts describe recorded spending or delivery, not the recipe's planned amounts.
A carrier's recorded contributions can include several essences even though that physical unit was consumed once.
Missing evidence is unknown, while an explicitly recorded empty receipt or zero amount establishes zero.
A displayed zero quantity is never a positive award.
Missing item details can appear as **Unknown material** or **Not recorded**.
Later recipe edits do not rewrite captured stage purpose or executed resolution evidence.

Direct gathering shows **Resolution** with **No roll** and its **Brought back** items.
D100 history keeps the recorded roll, high-roll thresholds, cleared or missed rows, and attributable awarded quantities together on one scale.
If an actual award cannot be attributed to individual rows, their amounts remain **Not recorded** and the award appears once with an explanation.
Check-based gathering records **How the check landed**, rather than repeating the preview ladder.
The recorded run status and actual awards are separate facts.
An absence of drops does not by itself mean failure, and a permitted failure award does not turn a failed run into a success.

Immediately after resolution, a result notice may show the selected run's summary and receipts.
Reselecting the run restores its ordinary history layout.
The bottom guidance describes a closed record, distinguishing delivered results, confirmed no awards, missing evidence, cancellation, and recovery.
It does not invite another execution of the finished run.

## Continue, pause, or cancel

New crafting, alchemy, and gathering runs use the current run lifecycle.
When ready, use **Complete stage**, **Complete**, **Brew**, or **Collect**, as appropriate to the selected run.
An available check action says **Roll check**, while d100 gathering says **Roll a d100**.
Any required player check stays manual.
The action explains why it is unavailable when the run cannot proceed.
You must own the crafting character and its material-source characters, or ask your GM to act.
When a crafting stage is already ready and all its choices are supplied, the starting action can execute it immediately through the same active-GM authority.
Manual completion does not require an extra Journal visit for that fully supplied case.

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
The active GM must inspect the recorded receipts and the uncertain boundary, then manually record a reconciliation or abandonment.
This is a separate recovery procedure, not the **Set up authority…** action.
That releases the matching claim only.
It never retries the uncertain effect, makes the old request replayable, or automatically rolls anything back.
The uncertain run remains marked as requiring recovery.

### Hidden identity and private checks

A hidden crafting recipe or blind gathering task keeps its protected details out of your Journal view.
The owner still has the actions the run's lifecycle permits, subject to the same timing, authority, and recovery restrictions as other runs.
The GM can see permitted secret previews.
Anonymous gathering entries use a generic pouch image, while an entitled GM preview can retain the task's own image.
Owning the character does not by itself reveal protected historical materials, tools, or results.

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
The clock and recorded times use the world's existing calendar formatting and fallback.
Pausing one run does not pause the world's clock.

## See Also

- [Quickstart]({% link help/quickstart.md %}) walks through creating systems, gathering, and trying Fabricate as a player.
- [Crafting Checks]({% link checks/crafting.md %}) explains the checks a crafting step rolls.
- [Salvage]({% link components/salvage.md %}) covers how components break down into salvage results.
- [Gathering Environments]({% link gathering/index.md %}) covers gathering, where gathering runs begin.

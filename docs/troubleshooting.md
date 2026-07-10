---
layout: default
title: Troubleshooting
nav_order: 9
---

# Troubleshooting

This guide covers common issues GMs and players encounter when setting up or using Fabricate, with step-by-step checks for each.

---

## Recipes Not Appearing in the Crafting App

**Symptom:** A recipe exists in the GM admin panel but does not appear in the player crafting app.

**Likely causes:**

- The recipe is disabled.
  Disabled recipes do not appear in the player crafting app (they remain in the GM admin panel with a grey "Disabled" badge).
- The recipe is restricted to specific users and the current player is not on the allow-list.
- The system uses knowledge mode and the player has not learned the recipe or does not own a matching recipe item.
- The recipe belongs to a crafting system that no longer exists.
- The crafting system has a blocker, or this individual recipe is broken.
  Fabricate hides recipes that players could not use because of a setup problem, while still showing them to the GM.

**Step-by-step checks:**

1. Open the Crafting Admin panel, select the system, and open the **Overview**.
   A blocker means players see none of the system's recipes until you fix it.
   An issue listed against the recipe itself hides only that recipe.
   Use the **Open** button on an issue to jump to the editor that owns it.
2. Go to the **Recipes** tab.
   Is the recipe's enable toggle (checkbox) in the Actions column checked?
   Disabled recipes show reduced opacity and a grey "Disabled" badge.
3. Check the **Visibility** column in the recipe list.
   Does it show "Restricted" with a user count?
   If so, make sure the affected player is in the allow-list.
4. Check the **Recipe Visibility** card on the Systems tab.
   If the system is set to knowledge mode:
   - Does the player's actor own the item linked to the recipe?
   - Has the player learned the recipe? Confirm this in the player's knowledge list.
5. Confirm the recipe still belongs to an existing crafting system.
   If its system was deleted, the recipe will not show for players.

**See also:** [Recipes]({% link recipes/index.md %}) for enabling and disabling recipes.
[Visibility & Knowledge]({% link visibility.md %}) for list modes and knowledge access.
[Crafting Systems]({% link crafting-systems.md %}#system-overview) for the System Overview and how broken systems and recipes are hidden.

---

### Recipes Disappeared After Changing the Resolution Mode

**Symptom:** After changing a crafting system's recipe resolution mode, some or all recipes are no longer present.

**What to expect:** Changing the resolution mode is no longer delete-all.
Fabricate migrates each recipe to the new mode wherever it can, and only deletes a recipe whose structure cannot be made to fit.
The confirmation prompt runs a dry run first and tells you exactly what will happen: how many recipes will be migrated, and, only when some cannot be migrated, how many will be deleted and their names.

**Likely causes for a recipe being deleted:**

- You narrowed into Simple or Progressive mode (which each expect exactly one ingredient set and one result group) from a recipe that had more than one of either.
- You moved a multi-step recipe into Alchemy mode, which does not support multi-step recipes.

**Step-by-step checks:**

1. Read the confirmation prompt before confirming.
   It names the recipes that cannot be migrated and will be deleted.
   Cancel if you are not ready to lose them.
2. Export the system first to keep a backup if you are unsure.
   You can re-import it to recover deleted recipes.
3. If a recipe simply vanished from players but is still in the admin panel, the cause is a system or recipe problem, not deletion.
   Open the **Overview** to find and fix it.

**See also:** [Crafting Systems]({% link crafting-systems.md %}#system-settings) for the migration-first mode change and the System Overview.

---

## Crafting Check Not Running

**Symptom:** The crafting check never fires.
Recipes resolve immediately with no skill check, even though the Routed by check mode or Progressive mode is configured.

**Likely causes:**

- The crafting check has no roll formula authored for the system's active resolution mode.
  Routed by check mode and Progressive mode each need a roll formula before their check can run.
  A required check with no roll formula now fails loudly with a validation error rather than being silently skipped.
- The resolution mode is Simple, or Routed by ingredients.
  In these configurations a crafting check is **optional**.
  The check runs if a roll formula is configured but is not required for success.
- For an optional Simple check, the check is turned off.
  When it is off, the check is skipped entirely.
- The check returns something the current mode does not understand (for example, no named outcome in Routed by check mode, or a missing numeric value for Progressive mode).

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Crafting Checks** section.
   Is a roll formula configured for the system's resolution mode?
2. Check the system's **Resolution Mode**.
   If the resolution mode is **Routed by check** or **Progressive**, a crafting check is required.
   Fabricate reports a validation error when its roll formula is missing.
   For **Simple** mode or **Routed by ingredients**, the check is optional and simply does not run when no roll formula is configured.
3. For an optional **Simple** check, confirm the check is turned on.
   When it is off, the check is skipped.
4. Attempt a craft and watch for any error or warning notifications from Fabricate about the check.

**See also:** [Crafting Checks]({% link crafting-checks.md %}) for crafting check configuration.

---

## Routed Recipe Produces Nothing on a Successful Check

**Symptom:** A recipe that routes by skill-check outcome rolls a success, but no result is produced.

**Likely causes:**

- A success outcome tier is not wired to any result set.
  When the check rolls that tier, there is nothing to produce.
- A result set is assigned only to an outcome tier that was later deleted from the routed crafting check.
  The stale assignment no longer points at a real outcome, so that result set can never be selected.
- The recipe mixes explicit outcome assignment with name matching, and the rolled outcome's name does not match any result set name.

**Step-by-step checks:**

1. Open the recipe in the recipe editor and go to the **Validation** tab.
   Look for the warning that a result set is not assigned to any check outcome, and the warning that a check success outcome produces no result set.
2. On the **Results** tab, check each result set's **Produced on outcome** assignment.
   Make sure every success outcome tier you expect to use is assigned to a result set, and that every result set is assigned to an outcome that still exists.
3. If you removed an outcome tier from the routed crafting check, Fabricate strips that tier from any recipe result set that referenced it and posts a notification saying how many result sets were updated.
   Re-open the affected recipes and assign the result sets to a current outcome tier.
4. If you rely on name matching instead of explicit assignment, confirm each result set name matches the outcome tier name once case and surrounding spaces are ignored.

**See also:** [Routed Modes]({% link recipes/routed.md %}) for how outcomes match results, including explicit outcome assignment and name matching.
[Crafting Checks]({% link crafting-checks.md %}) for how a routed check rolls and resolves its difficulty.

---

## Tools Not Breaking or Tracking Usage

{: .note }
> The standalone **Catalyst** concept was retired in version 0.6.0.
> Required-but-reusable equipment is now modelled by [Tools]({% link tools.md %}).
> Existing catalyst data migrates to Tools automatically.

**Symptom:** A tool is used during crafting or gathering but its usage counter does not increment, or the tool never breaks when you expect it to.

**Likely causes:**

- The tool's breakage mode is **not** limited uses.
  Only limited-uses tools track per-item usage.
  Tools that roll a chance to break each attempt do not keep a usage count.
- The maximum number of uses is blank (unlimited).
  A limited-uses tool still increments its counter but never breaks because there is no maximum.
- The tool's on-break action is set to flag the tool as broken (the default for migrated tools), so it is marked broken rather than destroyed.
  This may be intentional (for example, a forge that needs repair rather than replacement).
- On a failed crafting or salvage check, tools are **not** broken or degraded by default.
- The owned tool item cannot be identified as the Tool by a durable link.
  Presence is matched broadly, but breakage and usage are not.
  In a world that has not been repaired, a copy that was duplicated from another item, or that merely shares the Tool's name, is recognised as present but is never consumed, broken, or usage-counted.
  Fabricate spares it deliberately, so it never destroys the wrong item.

**Step-by-step checks:**

1. Open the system's **Tools** page and select the tool.
   Is the breakage mode set to limited uses?
2. If so, is **Max uses** set to a positive number (rather than left blank)?
3. Use the tool a few times and confirm its usage count goes up on the owned item.
   If it never increases, the breakage mode is not limited uses.
4. If a broken tool should be removed instead of flagged, set its on-break action to **Destroy item** (or **Replace with...**).
   A tool that has been flagged as broken cannot be used again until a GM clears that broken state.
5. If tools should break even on a failed check, open the system settings and enable the option to consume tools on failure (there are separate options for recipes and for salvage).
6. If the tool is present but never breaks or tracks usage, and the owned copy was duplicated from another item or shares its name with another item, run **Repair Item Data** from the Fabricate module settings, or delete the copy and re-issue the tool from its source component.
   This gives the item a durable identity link, after which it breaks and tracks usage normally.

**See also:** [Tools]({% link tools.md %}) covers the system-owned Tool model, including the requirement gate, breakage modes, and on-break actions.
[Crafting Checks]({% link crafting-checks.md %}#consumption-on-failure) covers consumption on failure settings.
[Repairing Item Data](#repairing-item-data) covers the maintenance action that gives duplicated copies a durable identity link.

---

## Effect Transfer Not Applying

**Symptom:** Crafting completes successfully but the result item does not receive active effects from essence source items.

**Likely causes:**

Effect transfer is an **opt-in feature with three separate switches**.
All three of the following must be turned on before any effects are transferred:

1. The **Essences** feature must be enabled on the crafting system.
2. The **Effect Transfer** feature must be enabled on the crafting system.
3. The individual recipe must opt in to effect transfer.

If any one of these is off, effect transfer is silently skipped.

Additional causes:

- An essence has no source item selected, or its source item no longer exists.
  Essences without a valid source item are silently skipped.
- The source item has no active effects defined on it (nothing to transfer).
- The consumed ingredients do not contribute any essence quantities.
  If no essences are contributed, there is nothing to transfer.

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Features** card.
   Are both the **Essences** toggle and the **Effect Transfer** toggle enabled?
2. Open the recipe in the recipe editor.
   Is **Transfer Effects** checked?
3. In the system settings, open the **Essences** feature card.
   Does each essence have a **Source item** selected?
4. Open the source item linked to the essence.
   Does it have active effects defined?
   (Check the item sheet's Effects tab.)
5. Check the components used as ingredients in the recipe.
   Do they have non-zero essence quantities assigned for the relevant essence?

**See also:** [Effect Transfer]({% link effect-transfer.md %}) covers effect transfer configuration and the triple-flag pipeline.
[Essences]({% link essences.md %}) covers essence definitions and source items.

---

## Salvage Configuration Rejected

**Symptom:** Salvage fails with a validation error, or attempting to salvage a component produces an error instead of results.

**Likely causes:**

- The salvage resolution mode is set to a mode that is not valid for salvage.
  Only Simple, Routed, and Progressive are valid.
- **Routed salvage mode** requires:
  - a salvage check roll formula is configured
  - at least one outcome is declared (such as critical, pass, and fail)
  - the component maps every declared outcome to an existing result group
- **Progressive salvage mode** requires:
  - a progressive salvage check roll formula is configured
  - every result component has a valid positive difficulty value
- **Simple salvage mode** requires exactly one result group per component.
  Having none, or two or more, is rejected.
- Salvage is disabled on the component.

**Step-by-step checks:**

1. Check the system's salvage resolution mode.
   If it is not Simple, Routed, or Progressive, change it to one of those.
2. For **Routed** mode:
   - Is a routed salvage check roll formula configured?
   - Are the outcomes defined (such as critical, pass, and fail)?
   - Does the component map every declared outcome to an existing result group?
3. For **Simple** mode: does the component have exactly one salvage result group?
4. For **Progressive** mode: does each result component have a valid positive difficulty value?
5. Is salvage enabled on the component you are trying to salvage?
6. Is the salvage feature enabled on the crafting system?

**See also:** [Salvage]({% link salvage.md %}) covers salvage configuration, salvage resolution modes, and salvage crafting checks.

---

## Recipe Appears Uncraftable Despite Owning Recipe Item or Components

**Symptom:** A recipe shows as "Cannot craft" or is excluded from the "Craftable only" filter even though the player's actor owns a copy of the linked recipe item and all required components.
This is most common after upgrading to Foundry v12 or after importing items from a compendium.

**Likely causes:**

- The owned item was duplicated from a world item rather than dragged directly from the compendium, so Fabricate cannot link it back to the recipe's linked item.
- The owned item is a very old copy with no link to its original compendium entry.
- Fabricate is out of date.
  Recent versions recognise the compendium link recorded by both Foundry v11 and Foundry v12 and later, but older versions may only recognise the v11 link.

**Step-by-step checks:**

1. Open the Crafting Admin panel, find the recipe, open the editor, and check the **Linked Recipe Item** field.
   Note which compendium item it points to.
2. On the actor's sheet, confirm the owned copy of that recipe item (and the required components) came from the same compendium entry.
   The most reliable way to be sure is to delete the owned copy and drag a fresh one directly from the compendium browser onto the actor's sheet.
3. Make sure Fabricate is up to date.
   Recent versions recognise copies made under both Foundry v11 and Foundry v12 and later.
4. Reload the Foundry page (F5) and re-open the crafting app.
   Craftability is re-evaluated each time, so a reload is enough.
   No data migration is required.

**Expected behaviour after the fix:** A player who owns an actor copy of a compendium item will have that item recognised by Fabricate's recipe matching, whether the copy was made under Foundry v11 or Foundry v12 and later.
The "Craftable only" filter will include the recipe once all required items are matched.

**See also:** [Visibility & Knowledge]({% link visibility.md %}#how-matching-works) covers how owned compendium copies are matched on Foundry v12 and later.
[Recipes]({% link recipes/index.md %}) covers linking recipe items in the editor.

---

## Repairing Item Data

Fabricate can reconcile the items behind your crafting components and recipe items so copies in players' inventories match reliably.
This is the **Repair Item Data** maintenance action.

**Where to find it:** Open Foundry's **Game Settings**, choose **Configure Settings**, and open the **Fabricate** module settings (the same panel as the theme selector).
Click **Repair Item Data** and confirm.
The action is available to GMs only.

**What it does:**

- It scans your world items, your unlocked compendiums, and every actor's inventory.
- It tags each component and each recipe item (book or scroll) source with a durable identity link, so future copies always resolve to the right one.
- It clears misleading duplicate-source metadata that a copied item inherited from the item it was copied from.
- It re-points an owned copy that a duplicate mislabelled, but only when the copy's name clearly identifies a single book or scroll.
- Locked (system and module) compendiums are skipped, because Fabricate cannot write to them.
- It never teaches or removes a recipe.
  It only repairs how items are identified.

After it runs, Fabricate reports how many items were tagged, cleaned, unlinked, and re-pointed.
When a copy's name matched more than one book or scroll, it is left as-is and counted separately, with a note to fix it by hand.

**When to run it:**

- After updating to a version of Fabricate that added durable item identity, if players hold copies that were duplicated in an older world.
- When a player's duplicated copy of a book or scroll shows the wrong title in their inventory, or auto-learned the wrong recipes when it was dropped on the actor.
- When a duplicated component is confused with the item it was copied from.
- After you duplicate items to author new content in a world that predates the durable identity.

**What it cannot fix:**

- **A copy that can no longer be identified.**
  If a copy was duplicated before the fix, and its only remaining link points at a different book or scroll, Fabricate can re-point it only when its name uniquely matches one book or scroll.
  When the name matches more than one, or matches none, the copy is left untouched.
  Delete that copy and drag a fresh one from the correct source item to restore it.
- **A book, scroll, or component whose original details were already overwritten.**
  In older versions, registering a duplicate of a compendium-linked item could overwrite the original entry's own name, image, and description with the duplicate's.
  Those original details are gone and cannot be reconstructed.
  The repair flags the affected entry so you can spot it, but you must restore its name, image, description, and linked recipes by hand, or re-import it from a backup or its compendium.

The repair scans the actors in your world's Actors directory.
It does not reach unlinked token copies that were never saved as world actors, or actors stored inside a compendium.

**See also:** [Visibility & Knowledge]({% link visibility.md %}#duplicating-a-book-or-scroll) covers duplicating books and scrolls as an authoring workflow.
[Crafting Systems]({% link crafting-systems.md %}#adding-components) covers duplicating items to author components.

---

## Crafting App Fails to Open

**Symptom:** Clicking **Craft Item** from the Items sidebar does nothing, or the Crafting App opens briefly then closes.

**Cause:**

This was caused by corrupted crafting-run history on the actor, which could make the same run appear twice in the app's run list and prevent the list from rendering.

**Fix:** This is resolved in the current version, which guards against duplicate runs.
Make sure Fabricate is up to date.

**If you are still seeing this after updating:**

The actor's stored crafting-run history may be corrupted.
Ask your GM to clear that actor's crafting run history (this removes the run history only, not your recipes or crafting systems), then reload the page (F5) and re-open the Crafting App.

**See also:** [Quickstart]({% link quickstart.md %}) covers opening the Crafting App for the first time.

---

## Completed Simple Craft Still Shows as In-Progress

**Symptom:** After a single-step (simple) craft completes successfully or fails, the Crafting App still shows the recipe as in-progress.
Reloading the page clears the stale state, but it reappears on the next craft.

**Cause:**

This was caused by a timing issue where the Crafting App could read the actor's run list before the completed run had finished saving, so it kept showing the run as active.

**Fix:** This is resolved in the current version, which keeps the displayed run list in step with the saved state.
Make sure Fabricate is up to date.

**If you are still seeing this after updating:**

Ask your GM to clear that actor's crafting run history (this removes the run history only, not your recipes or crafting systems), then reload the page (F5) and re-open the Crafting App.

**See also:** [Quickstart]({% link quickstart.md %}) covers opening the Crafting App for the first time.

---

## Dropping an Actor, Folder, or Non-Item Document onto the Items Tab Shows a Warning

**Symptom:** Dragging something onto the **Items** tab drop zone in the Crafting Admin panel produces a warning notification such as "Only Item documents can be added as crafting components" or "Folder contains no Item documents", and nothing is added.

**Cause:**

Fabricate only accepts Item documents as crafting components.
When the dropped entity is an Actor, JournalEntry, Scene, or any other non-Item document type, Fabricate rejects it with a warning.
Actors in particular cannot be components because they represent characters, not inventory objects.

Folder drops are a special case.
Fabricate expands the folder and imports any Item documents it contains.
If the folder holds no Items (for example, it contains only Actors), a notification says so and nothing is written.

**What each notification means:**

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Notification | Meaning |
|:-------------|:--------|
| "Only Item documents can be added as crafting components. Dropped: Actor." | You dragged a character or NPC sheet onto the drop zone. Use an Item from the sidebar or a compendium instead. |
| "Folder contains no Item documents." | The folder you dropped holds no Items. It may contain Actors, JournalEntries, or other document types. |
| "Drop an Item document from sidebar or compendium." | The drag data could not be resolved to any UUID. This can happen when dragging something that does not emit standard Foundry drag data. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Step-by-step checks:**

1. Confirm the drag source is an **Item** document (check the Items sidebar or open an items compendium).
   Fabricate does not accept Actors, Journal Entries, Scenes, Roll Tables, or Macros as components.
2. If you want to import everything in a folder, make sure the folder contains Item documents.
   Open the folder in the sidebar and check the document icons.
   Item documents show the items bag icon, not the actor or journal icon.
3. If you dropped a compendium pack header and received no items, verify the compendium type.
   Only **Items** compendiums contain importable components.
   **Actor** or **Journal Entry** compendiums are silently filtered.

**See also:** [Crafting Systems]({% link crafting-systems.md %}#adding-components) covers adding components via drag-and-drop.

---

## Dropping Items onto the Recipe Manager or Crafting App Does Nothing

**Symptom:** Dragging an item from the sidebar or a compendium and dropping it onto a Fabricate drop zone (such as the Items tab in the Recipe Manager) produces no result.
The item is not added, no error or notification appears from Fabricate, and in some cases Foundry displays its own "Drop an Item document from sidebar or compendium." message.

**Cause:**

In some Foundry versions and environments, Fabricate could not read the drag-and-drop data at the moment of the drop, so it silently ignored the dropped item.
Control then returned to Foundry, which produced the generic error message.

**Fix:** This is resolved in the current version, which reads the drag data more robustly across Foundry versions.
Make sure Fabricate is up to date.

**If you are still seeing silent drop failures after updating:**

1. Confirm the drag source is a world item or compendium item.
   Fabricate drop zones only accept Item documents.
   Other document types (Actors, Journal Entries, and so on) are rejected.
2. If you are dragging from a compendium, confirm the compendium is not locked or from a module that restricts access.
3. Make sure Fabricate is updated to the latest version, which includes the more robust drag-data handling.

**See also:** [Crafting Systems]({% link crafting-systems.md %}#adding-components) explains adding components via drag-and-drop.

---

## Before filing an issue

If the steps above do not resolve your problem, work through this checklist before opening a bug report:

1. Is the Fabricate module enabled in the world? (Setup > Add-on Modules > Fabricate should be checked.)
2. Is the crafting system saved without errors?
   Open the Crafting Admin panel and check for red validation warnings.
3. Are components properly linked?
   Each component should link to an existing world or compendium item.
   Open the component in the editor and confirm its linked item is still present.
4. Does the recipe pass validation?
   Open the recipe in the editor and click Save.
   Check for validation error messages.
5. Is the correct actor selected in the crafting app?
   The crafting app uses the selected actor for ingredient checks and result delivery.
6. Are component source actors configured?
   If ingredients should come from multiple actors, make sure they are all selected in the crafting app.
7. Try refreshing the browser (F5) and re-opening the crafting app.
   Some state is cached and a refresh clears it.

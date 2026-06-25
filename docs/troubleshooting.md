---
layout: default
title: Troubleshooting
nav_order: 9
---

# Troubleshooting

This guide covers common issues GMs and players encounter when setting up or using Fabricate, with step-by-step checks for each.

---

### Recipes Not Appearing in the Crafting App

**Symptom:** A recipe exists in the GM admin panel but does not appear in the player crafting app.

**Likely causes:**

- The recipe is disabled.
  Disabled recipes do not appear in the player crafting app (they remain in the GM admin panel with a grey "Disabled" badge).
- The recipe is restricted to specific users and the current player is not on the allow-list.
- The system uses knowledge mode and the player has not learned the recipe or does not own a matching recipe item.
- The recipe belongs to a crafting system that no longer exists.

**Step-by-step checks:**

1. Open the Crafting Admin panel and go to the **Recipes** tab.
   Is the recipe's enable toggle (checkbox) in the Actions column checked?
   Disabled recipes show reduced opacity and a grey "Disabled" badge.
2. Check the **Visibility** column in the recipe list.
   Does it show "Restricted" with a user count?
   If so, make sure the affected player is in the allow-list.
3. Check the **Recipe Visibility** card on the Systems tab.
   If the system is set to knowledge mode:
   - Does the player's actor own the item linked to the recipe?
   - Has the player learned the recipe? Confirm this in the player's knowledge list.
4. Confirm the recipe still belongs to an existing crafting system.
   If its system was deleted, the recipe will not show for players.

**See also:** [Recipes]({% link recipes/index.md %}) for enabling and disabling recipes.
[Visibility & Knowledge]({% link visibility.md %}) for list modes and knowledge access.
[Crafting Systems]({% link crafting-systems.md %}) for recipe visibility configuration.

---

### Crafting Check Macro Not Running

**Symptom:** The crafting check macro never fires.
Recipes resolve immediately with no skill check, even though the Routed mode (with the skill-check outcome option) or Progressive mode is configured.

**Likely causes:**

- The crafting check is turned off and no macro is set.
  When both are absent, the check is skipped entirely.
- The configured macro has been deleted or no longer exists.
- The resolution mode is Simple, or Routed with the ingredient-choice option.
  In these configurations a crafting check is **optional**.
  The check runs if configured but is not required for success.
- The check returns something the current mode does not understand (for example, no named outcome for the skill-check outcome option, or a missing numeric value for Progressive mode).

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Crafting Checks** section.
   Is the crafting check turned on?
2. Is a macro selected?
   Open Foundry's macro directory and confirm that macro still exists.
3. Check the system's **Resolution Mode**.
   If the resolution mode is **Routed** with the skill-check outcome option, or **Progressive**, a crafting check is required.
   Fabricate reports a validation error if one is missing.
   For **Simple** mode or Routed with the ingredient-choice option, the check is optional and simply does not run if unconfigured.
4. Attempt a craft and watch for any error or warning notifications from Fabricate about the macro.
5. If a developer set up a custom macro, confirm it returns the result the current mode expects (a named outcome for the skill-check outcome option, or a numeric value for Progressive mode). See the API reference for the expected setup.

**See also:** [Crafting Checks]({% link crafting-checks.md %}) for crafting check configuration.

---

### Tools Not Breaking or Tracking Usage

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

**Step-by-step checks:**

1. Open the system's **Tools** page and select the tool.
   Is the breakage mode set to limited uses?
2. If so, is **Max uses** set to a positive number (rather than left blank)?
3. Use the tool a few times and confirm its usage count goes up on the owned item.
   If it never increases, the breakage mode is not limited uses.
4. If a broken tool should be removed instead of flagged, set its on-break action to **Destroy item** (or **Replace with...**).
   A tool that has been flagged as broken cannot be used again until a GM clears that broken state.
5. If tools should break even on a failed check, open the system settings and enable the option to consume tools on failure (there are separate options for recipes and for salvage).

**See also:** [Tools]({% link tools.md %}) covers the system-owned Tool model, including the requirement gate, breakage modes, and on-break actions.
[Crafting Checks]({% link crafting-checks.md %}#consumption-on-failure) covers consumption on failure settings.

---

### Effect Transfer Not Applying

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

### Salvage Configuration Rejected

**Symptom:** Salvage fails with a validation error, or attempting to salvage a component produces an error instead of results.

**Likely causes:**

- The salvage resolution mode is set to a mode that is not valid for salvage.
  Only Simple, Routed, and Progressive are valid.
- **Routed salvage mode** requires:
  - a salvage check is configured (turned on or with a macro set)
  - at least one outcome is declared (such as critical, pass, and fail)
  - the component maps every declared outcome to an existing result group
- **Progressive salvage mode** requires:
  - a progressive salvage check is configured
  - every result component has a valid positive difficulty value
- **Simple salvage mode** requires exactly one result group per component.
  Having none, or two or more, is rejected.
- Salvage is disabled on the component.

**Step-by-step checks:**

1. Check the system's salvage resolution mode.
   If it is not Simple, Routed, or Progressive, change it to one of those.
2. For **Routed** mode:
   - Is a salvage check macro selected?
   - Are the outcomes defined (such as critical, pass, and fail)?
   - Does the component map every declared outcome to an existing result group?
3. For **Simple** mode: does the component have exactly one salvage result group?
4. For **Progressive** mode: does each result component have a valid positive difficulty value?
5. Is salvage enabled on the component you are trying to salvage?
6. Is the salvage feature enabled on the crafting system?

**See also:** [Salvage]({% link salvage.md %}) covers salvage configuration, salvage resolution modes, and salvage crafting checks.

---

### Recipe Appears Uncraftable Despite Owning Recipe Item or Components

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

### Crafting App Fails to Open

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

### Completed Simple Craft Still Shows as In-Progress

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

### Dropping an Actor, Folder, or Non-Item Document onto the Items Tab Shows a Warning

**Symptom:** Dragging something onto the **Items** tab drop zone in the Crafting Admin panel produces a warning notification such as "Only Item documents can be added as crafting components" or "Folder contains no Item documents", and nothing is added.

**Cause:**

Fabricate only accepts Item documents as crafting components.
When the dropped entity is an Actor, JournalEntry, Scene, or any other non-Item document type, Fabricate rejects it with a warning.
Actors in particular cannot be components because they represent characters, not inventory objects.

Folder drops are a special case.
Fabricate expands the folder and imports any Item documents it contains.
If the folder holds no Items (for example, it contains only Actors), a notification says so and nothing is written.

**What each notification means:**

| Notification | Meaning |
|:-------------|:--------|
| "Only Item documents can be added as crafting components. Dropped: Actor." | You dragged a character or NPC sheet onto the drop zone. Use an Item from the sidebar or a compendium instead. |
| "Folder contains no Item documents." | The folder you dropped holds no Items. It may contain Actors, JournalEntries, or other document types. |
| "Drop an Item document from sidebar or compendium." | The drag data could not be resolved to any UUID. This can happen when dragging something that does not emit standard Foundry drag data. |

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

### Dropping Items onto the Recipe Manager or Crafting App Does Nothing

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

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

- Recipe `enabled` is `false` -- disabled recipes do not appear in the player crafting app (they remain in the GM admin panel with a grey "Disabled" badge).
- Visibility list mode is `"player"` and the recipe is restricted to specific users. If the current user is not in `allowedUserIds`, they cannot see it.
- Visibility list mode is `"knowledge"` and the player has not learned the recipe or does not own a matching recipe item.
- The recipe's `craftingSystemId` references a crafting system that no longer exists.

**Step-by-step checks:**

1. Open the Crafting Admin panel and go to the **Recipes** tab. Is the recipe's enable toggle (checkbox) in the Actions column checked? Disabled recipes show reduced opacity and a grey "Disabled" badge.
2. Check the **Visibility** column in the recipe list. Does it show "Restricted" with a user count? If so, make sure the affected player is in the allow-list.
3. Check the system's `recipeVisibility.listMode` in the **Recipe Visibility** card on the Systems tab. If set to `"knowledge"`:
   - Does the player's actor own an item matching the recipe's `linkedRecipeItemUuid`?
   - Has the player learned the recipe? Check `Actor.flags.fabricate.learnedRecipes` in the browser console.
4. Open the browser console (F12) and look for `Fabricate |` error messages referencing missing system IDs.

**See also:** [Recipes]({% link recipes/index.md %}) -- enabling/disabling recipes; [Visibility & Knowledge]({% link visibility.md %}) -- list modes and knowledge access; [Crafting Systems]({% link crafting-systems.md %}) -- recipe visibility configuration.

---

### Crafting Check Macro Not Running

**Symptom:** The crafting check macro never fires. Recipes resolve immediately with no skill check, even though routed mode (macroOutcome provider) or progressive mode is configured.

**Likely causes:**

- `craftingCheck.enabled` is `false` and no `macroUuid` is set. The engine skips the check entirely when both are absent.
- `craftingCheck.macroUuid` is `null` or points to a macro that has been deleted.
- The resolution mode is `simple`, or routed with the `ingredientSet` or `rollTableOutcome` provider. In these configurations, crafting checks are **optional** -- the check runs if configured but is not required for success.
- The macro returns a value that does not match the expected shape for the current mode. Routed macroOutcome provider requires `{ success, outcome }` where `outcome` is a non-empty string. Progressive mode requires `{ success, value }` where `value` is a finite number.

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Crafting Checks** section. Is `craftingCheck.enabled` turned on?
2. Is `craftingCheck.macroUuid` populated? Open Foundry's macro directory and confirm the macro with that UUID still exists.
3. Check the system's **Resolution Mode**. If the resolution mode is **Routed** with the `macroOutcome` provider, or **Progressive**, a crafting check is required -- the engine will report a validation error if one is missing. For **Simple** mode or routed with `ingredientSet`/`rollTableOutcome` providers, the check is optional and will silently not run if unconfigured.
4. Open the browser console (F12), attempt a craft, and look for `Fabricate |` prefixed error or warning messages about macro execution.
5. Verify the macro's return shape matches the mode:
   - **Simple / Routed (ingredientSet or rollTableOutcome):** `{ success: boolean }`
   - **Routed (macroOutcome):** `{ success: boolean, outcome: string }` (outcome is matched case-insensitively to a result group name)
   - **Progressive:** `{ success: boolean, value: number }` (value must be a finite number)

**See also:** [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contract and return shapes; [Crafting Checks]({% link crafting-checks.md %}) -- crafting check configuration.

---

### Tools Not Breaking or Tracking Usage

{: .note }
> The standalone **Catalyst** concept was retired in `0.6.0`; required-but-reusable equipment is now modelled by [Tools]({% link tools.md %}). Existing catalyst data migrates to Tools automatically.

**Symptom:** A tool is used during crafting or gathering but its usage counter does not increment, or the tool never breaks when you expect it to.

**Likely causes:**

- The tool's breakage mode is **not** `limitedUses`. Only `limitedUses` tools track per-item usage; `breakageChance` and `diceExpression` tools never write a usage flag (they roll for breakage each attempt and write nothing otherwise).
- `maxUses` is blank (unlimited). A `limitedUses` tool still increments its counter but never breaks because there is no maximum.
- The tool's on-break action is `flagBroken` (the default for migrated non-degrading catalysts), so it is marked broken rather than destroyed. This may be intentional (e.g. a forge that needs repair rather than replacement).
- On a failed crafting or salvage check, tools are **not** broken/degraded by default. The setting `craftingCheck.consumption.consumeCatalystsOnFail` (field name retained for backward compatibility) defaults to `false`.

**Step-by-step checks:**

1. Open the system's **Tools** page and select the tool. Is the breakage mode `limitedUses`?
2. If so, is **Max uses** set to a positive integer (rather than left blank)?
3. Check the owned item's tracking flag in the browser console: `item.getFlag('fabricate', 'toolUsage')`. Is `timesUsed` incrementing after each use? (Items migrated from a catalyst may still carry the legacy `catalystItemUsage` flag, which is read as a fallback until the first post-migration use writes `toolUsage`.)
4. If a broken tool should be removed instead of flagged, set its on-break action to **Destroy item** (or **Replace with...**). A tool marked broken (`flags.fabricate.toolBroken === true`) fails its presence gate until a GM clears the flag.
5. If tools should break even on a failed check, open the system settings and enable `craftingCheck.consumption.consumeCatalystsOnFail` (recipes) or `salvageCraftingCheck.consumption.consumeCatalystsOnFail` (salvage).

**See also:** [Tools]({% link tools.md %}) -- the system-owned Tool model: requirement gate, breakage modes, and on-break actions; [Crafting Checks]({% link crafting-checks.md %}#consumption-on-failure) -- consumption on failure settings.

---

### Effect Transfer Not Applying

**Symptom:** Crafting completes successfully but the result item does not receive active effects from essence source items.

**Likely causes:**

Effect transfer is an **opt-in, triple-flag feature**. All three of the following must be `true` before any effects are transferred:

1. `system.features.essences` is `true` -- the essences feature must be enabled on the crafting system.
2. `system.features.effectTransfer` is `true` -- the effect transfer feature must be enabled on the crafting system.
3. `recipe.transferEffects` is `true` -- the individual recipe must opt in to effect transfer.

If any one of these flags is `false`, effect transfer is silently skipped.

Additional causes:

- The essence definition's `sourceItemUuid` is `null` or points to an item that no longer exists. Essences without a valid source item are silently skipped.
- The source item has no active effects defined on it (nothing to transfer).
- The consumed ingredients do not contribute any essence quantities. If no essences are contributed, the transfer pipeline has nothing to process.

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Features** card. Are both the **Essences** toggle and the **Effect Transfer** toggle enabled?
2. Open the recipe in the recipe editor. Is **Transfer Effects** checked?
3. In the system settings, open the **Essences** feature card. Does each essence definition have a **Source item** selected?
4. Open the source item linked to the essence definition. Does it have active effects defined? (Check the item sheet's Effects tab.)
5. Check the components used as ingredients in the recipe. Do they have non-zero essence quantities assigned for the relevant essence?
6. Open the browser console (F12) and attempt a craft. Effect transfer issues are logged as `Fabricate |` messages.

**See also:** [Effect Transfer]({% link effect-transfer.md %}) -- effect transfer configuration and the triple-flag pipeline; [Essences]({% link essences.md %}) -- essence definitions and source items.

---

### Salvage Configuration Rejected

**Symptom:** Salvage fails with a validation error, or attempting to salvage a component produces an error instead of results.

**Likely causes:**

- `salvageResolutionMode` is set to `"mapped"` or `"alchemy"`. Those modes are **not valid** for salvage and are explicitly rejected. Use `"simple"`, `"routed"`, or `"progressive"` instead.
- **Routed salvage mode** requires:
  - `salvageCraftingCheck.enabled` is `true` (or `salvageCraftingCheck.macroUuid` is set)
  - `salvageCraftingCheck.outcomes` contains at least one declared outcome label (e.g. `["critical", "pass", "fail"]`)
  - The component's `salvage.outcomeRouting` maps every declared outcome to an existing result group ID in `salvage.resultGroups`
- **Progressive salvage mode** requires:
  - `salvageCraftingCheck.progressive` configuration is present
  - All result components have a valid positive `difficulty` value on their component definition
- **Simple salvage mode** requires exactly 1 result group per component. Having 0 or 2+ result groups is rejected.
- The component's `salvage.enabled` is `false`.

**Step-by-step checks:**

1. Check the system's `salvageResolutionMode`. If it is `"mapped"` or `"alchemy"`, change it to `"simple"`, `"routed"`, or `"progressive"`.
2. For **routed** mode:
   - Is `salvageCraftingCheck.macroUuid` set to a valid macro UUID?
   - Are `salvageCraftingCheck.outcomes` defined (e.g. `["critical", "pass", "fail"]`)?
   - Does the component's `salvage.outcomeRouting` map every declared outcome to an existing result group ID?
3. For **simple** mode: does the component have exactly one salvage result group?
4. For **progressive** mode: does each result component reference a component with a valid positive `difficulty` value?
5. Is `salvage.enabled` set to `true` on the component you are trying to salvage?
6. Is the `salvage` feature toggle enabled on the crafting system?

**See also:** [Salvage]({% link salvage.md %}) -- salvage configuration, salvage resolution modes, and salvage crafting checks.

---

### Recipe Appears Uncraftable Despite Owning Recipe Item or Components

**Symptom:** A recipe shows as "Cannot craft" or is excluded from the "Craftable only" filter even though the player's actor owns a copy of the linked recipe item and all required components. This is most common after upgrading to Foundry v12 or after importing items from a compendium.

**Likely causes:**

- On Foundry v12+, the compendium source UUID of an item is stored in `_stats.compendiumSource`. Older versions of Fabricate only checked `flags.core.sourceId` (the Foundry v11 field). If the module has not been updated to use the new field, owned copies of compendium items will not match, even though the items are correct.
- The owned item was created on Foundry v11 and later migrated. Items that were never re-imported from the compendium after upgrading to v12 may only have `flags.core.sourceId` set and no `_stats.compendiumSource`. The source UUID resolver handles this with a fallback, but very old items may have neither field populated if the compendium link was never established.
- The linked recipe item UUID stored on the recipe (`linkedRecipeItemUuid`) points to the compendium entry, but the owned item's source fields do not match because the item was duplicated from a world item rather than dragged directly from the compendium.

**Step-by-step checks:**

1. Open the browser console (F12) and locate the owned recipe item or component on the actor's sheet. Run the following to inspect the source fields:
   ```javascript
   const actor = game.actors.getName("Aldric the Alchemist"); // replace with actor name
   const item = actor.items.getName("Healing Salve Recipe");  // replace with item name
   console.log("uuid:", item.uuid);
   console.log("_stats.compendiumSource:", item._stats?.compendiumSource);
   console.log("flags.core.sourceId:", item.flags?.core?.sourceId);
   ```
2. Compare the output with the `linkedRecipeItemUuid` stored on the recipe. Open the Crafting Admin panel, find the recipe, open the editor, and check the **Linked Recipe Item** field. The UUID shown there must match either `_stats.compendiumSource` or `flags.core.sourceId` on the owned item.
3. If neither source field on the owned item matches the linked UUID, the item was not created from the correct compendium entry. Delete the owned copy and re-import it by dragging it directly from the compendium browser to the actor's sheet.
4. If the owned item was created on Foundry v11 and only has `flags.core.sourceId`, check that Fabricate is running version 0.9.0 or later, which added the `_stats.compendiumSource`-first resolver with `flags.core.sourceId` as a legacy fallback. Older versions of Fabricate do not read `_stats.compendiumSource`.
5. If the issue only affects the **"Craftable only"** filter and not recipe visibility, verify that the component matching paths are also using the source UUID resolver. Open the browser console and look for `Fabricate | Cannot resolve component` warnings when attempting to craft.
6. After confirming the source fields are correct, reload the Foundry page (F5) and re-open the crafting app. Source UUID resolution is evaluated live on each visibility check, so a reload is sufficient -- no data migration is required.

**Expected behaviour after the fix:** A player who owns an actor-copy of a compendium item will have that item recognised by Fabricate's recipe matching, regardless of whether the Foundry version that created the copy stored the source UUID in `_stats.compendiumSource` (v12+) or `flags.core.sourceId` (v11). The "Craftable only" filter will include the recipe once all required items are matched.

**Manual verification steps (for maintainers confirming the fix):**

1. Open a Foundry v12+ world with Fabricate installed and at least one knowledge-mode crafting system configured.
2. Find the recipe's linked item in the compendium browser and drag it directly onto an actor's sheet. This creates an owned copy whose `_stats.compendiumSource` is set to the compendium item's UUID.
3. Open the crafting app for that actor. The recipe should now appear in the recipe list and show as craftable (assuming all required components are also present).
4. Enable the **Craftable only** filter in the crafting app. The recipe must remain visible -- if it disappears, the `_stats.compendiumSource` matching path is not working.
5. Repeat steps 2--4 using an item that was originally created on Foundry v11 (i.e., one that has `flags.core.sourceId` but not `_stats.compendiumSource`). The recipe must also remain craftable and visible under the filter, confirming the legacy fallback path.

**See also:** [Visibility & Knowledge]({% link visibility.md %}#how-matching-works) -- source UUID matching rules and Foundry v12+ behaviour; [Recipes]({% link recipes/index.md %}) -- linking recipe items in the editor.

---

### Crafting App Fails to Open (`each_key_duplicate` Error)

**Symptom:** Clicking **Craft Item** from the Items sidebar does nothing, or the Crafting App opens briefly then closes. The browser console (F12) shows a Svelte error similar to:

```
each_key_duplicate
```

or:

```
Error: Cannot have duplicate keys in an each block
```

**Cause:**

This error was caused by two related bugs in the Crafting App's run display logic:

1. If the actor's stored crafting run data contained duplicate run IDs (for example, after a data-corruption event or a race condition that wrote the same run twice), the `RunSummary` component received multiple runs with the same `id`. Svelte's `{#each}` block requires unique keys and throws immediately when it encounters duplicates.
2. Even without corrupted data, runs from the active-runs list and runs from the run-history list shared the same key space. A run ID that appeared in both lists (e.g., a run that was simultaneously active and in history during a transition) caused a cross-list key collision.

**Fix:** This is resolved in the current version. `craftingStore.js` now deduplicates `activeRuns` and `runHistory` independently using a Set before passing them to the component. The `RunSummary` component also uses composite keys (`active-${run.id}` and `history-${run.id}`) so the two lists can never collide even if a run ID appears in both.

**If you are still seeing this error after updating:**

1. Open the browser console (F12) and run the following to inspect your actor's stored run data:
   ```javascript
   const actor = game.actors.getName("Aldric the Alchemist"); // replace with actor name
   const runs = actor.getFlag("fabricate", "craftingRuns") || {};
   console.log("active:", runs.active);
   console.log("history:", runs.history);
   ```
2. If the output shows the same run ID appearing more than once in `active` or `history`, the stored data is corrupted. You can clear the runs for this actor with:
   ```javascript
   await actor.unsetFlag("fabricate", "craftingRuns");
   ```
   This removes all run history for the actor. Recipes and crafting systems are not affected.
3. Reload the page (F5) and re-open the Crafting App.

**See also:** [Quickstart]({% link quickstart.md %}) -- opening the Crafting App for the first time.

---

### Completed Simple Craft Still Shows as In-Progress

**Symptom:** After a single-step (simple) craft completes successfully or fails, the Crafting App still shows the recipe as in-progress. Reloading the page clears the stale state, but it reappears on the next craft.

**Cause:**

This was caused by a race between `CraftingRunManager` writing the completed run to Foundry actor flags and the Crafting App reading the run list back from those flags. Because Foundry flag writes are asynchronous and not immediately visible to subsequent synchronous reads in the same client, the UI received stale data and continued to show the run as active.

**Fix:** This is resolved in the current version. `CraftingRunManager` now maintains an in-memory cache keyed by actor ID. `_persist()` writes to both the cache and Foundry flags at the same time, so any subsequent `_getContainer()` call in the same session returns the committed state immediately without waiting for the flag round-trip.

**If you are still seeing this after updating:**

1. Open the browser console (F12) and inspect the actor's stored run data:
   ```javascript
   const actor = game.actors.getName("Aldric the Alchemist"); // replace with actor name
   const runs = actor.getFlag("fabricate", "craftingRuns") || {};
   console.log("active:", runs.active);
   console.log("history:", runs.history);
   ```
2. If the completed run appears in `active` rather than `history`, the flag was not written correctly. Clear it with:
   ```javascript
   await actor.unsetFlag("fabricate", "craftingRuns");
   ```
   This removes all run history for the actor. Recipes and crafting systems are not affected.
3. If your code calls `CraftingRunManager` methods directly and writes to actor flags externally, call `runMgr.invalidateCache(actor.id)` after your write so the manager re-reads from flags on the next access.

**See also:** [CraftingRunManager API]({% link api/run-manager.md %}) -- `invalidateCache()` reference.

---

### Dropping an Actor, Folder, or Non-Item Document onto the Items Tab Shows a Warning

**Symptom:** Dragging something onto the **Items** tab drop zone in the Crafting Admin panel produces a warning notification such as "Only Item documents can be added as crafting components" or "Folder contains no Item documents", and nothing is added.

**Cause:**

Fabricate only accepts Item documents as crafting components. When the dropped entity is an Actor, JournalEntry, Scene, or any other non-Item document type, Fabricate rejects it with a warning. Actors in particular cannot be components because they represent characters, not inventory objects.

Folder drops are a special case: Fabricate expands the folder and imports any Item documents it contains. If the folder holds no Items — for example, it contains only Actors — a notification says so and nothing is written.

**What each notification means:**

| Notification | Meaning |
|:-------------|:--------|
| "Only Item documents can be added as crafting components. Dropped: Actor." | You dragged a character or NPC sheet onto the drop zone. Use an Item from the sidebar or a compendium instead. |
| "Folder contains no Item documents." | The folder you dropped holds no Items — it may contain Actors, JournalEntries, or other document types. |
| "Drop an Item document from sidebar or compendium." | The drag data could not be resolved to any UUID. This can happen when dragging something that does not emit standard Foundry drag data. |

**Step-by-step checks:**

1. Confirm the drag source is an **Item** document (check the Items sidebar or open an items compendium). Fabricate does not accept Actors, Journal Entries, Scenes, Roll Tables, or Macros as components.
2. If you want to import everything in a folder, make sure the folder contains Item documents. Open the folder in the sidebar and check the document icons — Item documents show the items bag icon, not the actor or journal icon.
3. If you dropped a compendium pack header and received no items, verify the compendium type. Only **Items** compendiums contain importable components; **Actor** or **Journal Entry** compendiums are silently filtered.
4. Open the browser console (F12) and look for `Fabricate |` prefixed messages for additional detail.

**See also:** [Crafting Systems]({% link crafting-systems.md %}#adding-components) — adding components via drag-and-drop.

---

### Dropping Items onto the Recipe Manager or Crafting App Does Nothing

**Symptom:** Dragging an item from the sidebar or a compendium and dropping it onto a Fabricate drop zone (such as the Items tab in the Recipe Manager) produces no result. The item is not added, no error or notification appears from Fabricate, and in some cases Foundry displays its own "Drop an Item document from sidebar or compendium." message.

**Cause:**

Fabricate's Svelte UI reads drag data using `foundry.applications.ux.TextEditor.implementation.getDragEventData`. In some Foundry versions and environments this API path is absent at the time of the drop, causing Fabricate's drag handler to receive `null` and silently skip the drop callback entirely. Control returns to Foundry's own ApplicationV2 drop handler, which produces the generic error message.

**Fix:** This is resolved in the current version. `getDragEventData` in `foundryBridge.js` now uses a two-strategy approach:

1. If `foundry.applications.ux.TextEditor.implementation.getDragEventData` is available, it is used as before.
2. Otherwise, the drag data is read directly from `event.dataTransfer.getData('text/plain')` and parsed as JSON. This is the universal drag data format used by Foundry across all versions.

The same fix is applied to `foundryCompat.js` (the legacy Handlebars path). In addition, `foundryCompat.js` now evaluates the `TextEditor` API path at the moment of each drop rather than once at module load time, so it correctly handles cases where the API becomes available after the module first imports.

**If you are still seeing silent drop failures after updating:**

1. Open the browser console (F12) and attempt a drag-and-drop. Look for any `Fabricate |` prefixed error messages.
2. Confirm the drag source is a world item or compendium item. Fabricate drop zones only accept Item documents; other document types (Actors, Journal Entries, etc.) are rejected.
3. If you are dragging from a compendium, confirm the compendium is not locked or from a module that restricts programmatic access.
4. Run the following in the browser console to verify the drag data format. First, add a temporary drop listener to the body:
   ```javascript
   document.body.addEventListener('drop', e => {
     e.preventDefault();
     console.log('text/plain:', e.dataTransfer.getData('text/plain'));
   }, { once: true });
   ```
   Then drag an item onto the page. The console should print a JSON object like `{"type":"Item","uuid":"Item.abc123"}`. If it prints an empty string, the drag source is not sending standard Foundry drag data.
5. If the above confirms valid drag data but drops still fail, update Fabricate to the latest version which includes the `text/plain` fallback.

**See also:** [Crafting Systems]({% link crafting-systems.md %}#adding-components) -- adding components via drag-and-drop.

---

## Before filing an issue

If the steps above do not resolve your problem, work through this checklist before opening a bug report:

1. Is the Fabricate module enabled in the world? (Setup > Add-on Modules > Fabricate should be checked.)
2. Is Fabricate initialising? Open the browser console (F12) and run: `Hooks.once('fabricate.ready', () => console.log('Fabricate is ready'))`. If the message does not appear after a reload, the module may not be loading.
3. Is the crafting system saved without errors? Open the Crafting Admin panel and check for red validation warnings.
4. Are components properly linked? Each component should have a valid `sourceItemUuid` pointing to an existing world or compendium item.
5. Does the recipe pass validation? Open the recipe in the editor and click Save. Check for validation error messages.
6. Is the correct actor selected in the crafting app? The crafting app uses the selected actor for ingredient checks and result delivery.
7. Are component source actors configured? If ingredients should come from multiple actors, make sure they are all selected in the crafting app.
8. Check the browser console (F12) for any lines starting with `Fabricate |` -- these are the module's own diagnostic messages.
9. Try refreshing the browser (F5) and re-opening the crafting app. Some state is cached client-side and a refresh clears it.

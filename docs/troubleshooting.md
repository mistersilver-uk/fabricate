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

**Symptom:** The crafting check macro never fires. Recipes resolve immediately with no skill check, even though tiered or progressive mode is configured.

**Likely causes:**

- `craftingCheck.enabled` is `false` and no `macroUuid` is set. The engine skips the check entirely when both are absent.
- `craftingCheck.macroUuid` is `null` or points to a macro that has been deleted.
- The resolution mode is `simple` or `mapped`. In these modes, crafting checks are **optional** -- the check runs if configured but is not required for success.
- The macro returns a value that does not match the expected shape for the current mode. Tiered mode requires `{ success, outcome }` where `outcome` is a non-empty string. Progressive mode requires `{ success, value }` where `value` is a finite number.

**Step-by-step checks:**

1. Open the Crafting Admin panel, go to the **Systems** tab, and check the **Crafting Checks** section. Is `craftingCheck.enabled` turned on?
2. Is `craftingCheck.macroUuid` populated? Open Foundry's macro directory and confirm the macro with that UUID still exists.
3. Check the system's **Resolution Mode**. If it is **Tiered** or **Progressive**, a crafting check is required -- the engine will report a validation error if one is missing. If it is **Simple** or **Mapped**, the check is optional and will silently not run if unconfigured.
4. Open the browser console (F12), attempt a craft, and look for `Fabricate |` prefixed error or warning messages about macro execution.
5. Verify the macro's return shape matches the mode:
   - **Simple / Mapped:** `{ success: boolean }`
   - **Tiered:** `{ success: boolean, outcome: string }` (outcome must match a declared outcome label)
   - **Progressive:** `{ success: boolean, value: number }` (value must be a finite number)

**See also:** [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contract and return shapes; [Crafting Systems]({% link crafting-systems.md %}) -- crafting check configuration.

---

### Catalysts Not Degrading or Tracking Usage

**Symptom:** A catalyst is used during crafting but its usage counter does not increment, or the catalyst is never destroyed when it should be exhausted.

**Likely causes:**

- `degradesOnUse` is `false` on the catalyst definition. When disabled, no usage tracking occurs -- the catalyst is simply checked for presence and never modified.
- `maxUses` is `null`. The usage counter increments but exhaustion never triggers because there is no maximum.
- `destroyWhenExhausted` is `false`. The catalyst remains in inventory even after `timesUsed >= maxUses`. This may be intentional (e.g. a forge that needs repair rather than replacement).
- On a failed crafting check, catalysts are **not** degraded by default. The setting `craftingCheck.consumption.consumeCatalystsOnFail` defaults to `false`.
- The catalyst uses the legacy field name `systemItemId` instead of `componentId`. The engine supports both for reads but new configurations should use `componentId`.

**Step-by-step checks:**

1. Open the recipe in the recipe editor. In the catalyst entry, is **Degrades on use** enabled?
2. If `degradesOnUse` is `true`, is **Max uses** set to a positive integer?
3. If the catalyst should be destroyed on exhaustion, is **Destroy when exhausted** checked?
4. Check the owned item's tracking flags in the browser console: `item.getFlag('fabricate', 'catalystItemUsage')`. Is `timesUsed` incrementing after each craft?
5. If catalysts should degrade even on a failed check, open the system settings and check `craftingCheck.consumption.consumeCatalystsOnFail`. Set it to `true` if needed.
6. Verify the catalyst configuration uses `componentId`, not the legacy `systemItemId`.

**See also:** [Catalysts]({% link catalysts.md %}) -- catalyst properties, usage tracking, and exhaustion; [Crafting Systems]({% link crafting-systems.md %}) -- consumption on failure settings.

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
5. Check the managed items used as ingredients in the recipe. Do they have non-zero essence quantities assigned for the relevant essence?
6. Open the browser console (F12) and attempt a craft. Effect transfer issues are logged as `Fabricate |` messages.

**See also:** [Crafting Systems]({% link crafting-systems.md %}) -- effect transfer configuration and the triple-flag pipeline; [Essences]({% link essences.md %}) -- essence definitions and source items.

---

### Salvage Configuration Rejected

**Symptom:** Salvage fails with a validation error, or attempting to salvage a component produces an error instead of results.

**Likely causes:**

- `salvageResolutionMode` is set to `"mapped"`. Mapped mode is **not valid** for salvage and is explicitly rejected. Use `"simple"`, `"tiered"`, or `"progressive"` instead.
- **Tiered salvage mode** requires:
  - `salvageCraftingCheck.enabled` is `true` (or `salvageCraftingCheck.macroUuid` is set)
  - `salvageCraftingCheck.outcomes` contains at least one declared outcome label (e.g. `["critical", "pass", "fail"]`)
  - The component's `salvage.outcomeRouting` maps every declared outcome to an existing result group ID in `salvage.resultGroups`
- **Progressive salvage mode** requires:
  - `salvageCraftingCheck.progressive` configuration is present
  - All result components have a valid positive `difficulty` value on their managed item definition
- **Simple salvage mode** requires exactly 1 result group per component. Having 0 or 2+ result groups is rejected.
- The component's `salvage.enabled` is `false`.

**Step-by-step checks:**

1. Check the system's `salvageResolutionMode`. If it is `"mapped"`, change it to `"simple"`, `"tiered"`, or `"progressive"`.
2. For **tiered** mode:
   - Is `salvageCraftingCheck.macroUuid` set to a valid macro UUID?
   - Are `salvageCraftingCheck.outcomes` defined (e.g. `["critical", "pass", "fail"]`)?
   - Does the component's `salvage.outcomeRouting` map every declared outcome to an existing result group ID?
3. For **simple** mode: does the component have exactly one salvage result group?
4. For **progressive** mode: does each result component reference a managed item with a valid positive `difficulty` value?
5. Is `salvage.enabled` set to `true` on the component you are trying to salvage?
6. Is the `salvage` feature toggle enabled on the crafting system?

**See also:** [Crafting Systems]({% link crafting-systems.md %}) -- salvage configuration, salvage resolution modes, and salvage crafting checks.

---

## Before filing an issue

If the steps above do not resolve your problem, work through this checklist before opening a bug report:

1. Is the Fabricate module enabled in the world? (Setup > Add-on Modules > Fabricate should be checked.)
2. Is Fabricate initialising? Open the browser console (F12) and run: `Hooks.once('fabricate.ready', () => console.log('Fabricate is ready'))`. If the message does not appear after a reload, the module may not be loading.
3. Is the crafting system saved without errors? Open the Crafting Admin panel and check for red validation warnings.
4. Are managed items properly linked? Each managed item should have a valid `sourceItemUuid` pointing to an existing world or compendium item.
5. Does the recipe pass validation? Open the recipe in the editor and click Save. Check for validation error messages.
6. Is the correct actor selected in the crafting app? The crafting app uses the selected actor for ingredient checks and result delivery.
7. Are component source actors configured? If ingredients should come from multiple actors, make sure they are all selected in the crafting app.
8. Check the browser console (F12) for any lines starting with `Fabricate |` -- these are the module's own diagnostic messages.
9. Try refreshing the browser (F5) and re-opening the crafting app. Some state is cached client-side and a refresh clears it.

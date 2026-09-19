/**
 * Phase D0's recipes section: the recipes browser and editor walk, its bulk-edit and continuation
 * frames, and the result, ingredient and access captures. Inert under rc/ci/full; skipped on a
 * scoped `screenshots` run whose target set touches none of its labels.
 */

import { RECIPE_BULK_EDIT_STUDIO, assertManagerLayoutStable, assertRecipeRowsHittable, captureBulkEditFrame, captureGroupedContinuationFrame, captureRecipeEditorRoundtrip, captureRecipeResultsTab, captureStableManagerView, chooseSelectOption, clickSegment, openManagerCraftingSection, openManagerMultiStepFeatureTile, openManagerRecipeEditor, returnToSystemLibrary, selectRecipeRowsByName } from '../pageOps/managerViews.mjs';
import { assertNoScreenshotOverlays, dismissFoundryNotifications, selectSmokeSystemInManager, setManagerWindowSize, settleManagerNav, softClick } from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'recipes',
  phase: 'phase-D0',
  section: 'recipes',
  publishes: [],
  consumes: ['craftingSetup', 'executionFixtures', 'alchemyFixtures'],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { craftingSetup, executionFixtures, alchemyFixtures } = ctx.shared;
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        const recipeApiCount = await page.evaluate((sysId) => {
          const rm = game.fabricate?.getRecipeManager?.();
          return rm?.getRecipes?.({ craftingSystemId: sysId })?.length ?? 0;
        }, craftingSetup.systemId);
        if (recipeApiCount < 2) {
          throw new Error(`Expected the smoke system to expose at least 2 recipes via the API; saw ${recipeApiCount}.`);
        }
        await openManagerCraftingSection(page, 'recipes', 'recipes');
        await page.locator('.fabricate-manager .manager-recipe-row:has-text("Brew Healing Potion")').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await assertRecipeRowsHittable(page, 'recipes normal');
        await captureStableManagerView(ctx, { layout: 'recipes normal', label: 'manager-recipes-normal' });

        // --------------------------------------------------------------------- Issue 1010 — the
        // recipe browser's bulk edit rail panel, in its three frames.
        await captureBulkEditFrame(ctx, {
          studio: RECIPE_BULK_EDIT_STUDIO,
          stepName: 'recipes-bulk-edit',
          label: 'manager-recipes-bulk-edit',
          selectRows: selectRecipeRowsByName('Brew Healing Potion', 'Quench a Blade'),
          stage: async (bulkPanel) => {
            // Index 1 is the first real option after the `Leave unchanged` sentinel, so a category
            // is staged whatever vocabulary this world has authored.
            await chooseSelectOption(
              page,
              bulkPanel.locator('[data-recipe-bulk-category]').first(),
              { index: 1 },
            );
            await clickSegment(bulkPanel, 'data-recipe-bulk-lock-option', 'lock');

            // Apply must be live with two axes staged — but it is never clicked: this
            // capture writes nothing.
            if (await bulkPanel.locator('[data-recipe-bulk-apply]').first().isDisabled()) {
              throw new Error('Recipe bulk edit Apply stayed inert after a category and Lock were staged.');
            }
          },
        });
        await captureBulkEditFrame(ctx, {
          studio: RECIPE_BULK_EDIT_STUDIO,
          stepName: 'recipes-bulk-edit-unstaged',
          label: 'manager-recipes-bulk-edit-unstaged',
          selectRows: selectRecipeRowsByName('Brew Healing Potion', 'Quench a Blade'),
          stage: async (bulkPanel) => {
            // A pristine draft can write nothing, so Apply must be inert. Re-selecting from
            // a cleared rail rather than un-staging also proves the discard-on-empty-selection
            // effect in real Foundry.
            if (!await bulkPanel.locator('[data-recipe-bulk-apply]').first().isDisabled()) {
              throw new Error('Recipe bulk edit Apply was live on a pristine draft with nothing staged.');
            }
            // Both segmented axes on their sentinel face. `Unchanged` is a real segment
            // rather than an absence, and this frame is its only evidence.
            for (const axis of ['status', 'lock']) {
              await bulkPanel.locator(`[data-recipe-bulk-${axis}-option="unchanged"] input:checked`)
                .first().waitFor({ state: 'attached', timeout: 5_000 });
            }
          },
        });
        await captureBulkEditFrame(ctx, {
          studio: RECIPE_BULK_EDIT_STUDIO,
          stepName: 'recipes-bulk-edit-blocked',
          label: 'manager-recipes-bulk-edit-blocked',
          // Pinned by name, not positionally.
          selectRows: selectRecipeRowsByName('Temper a Blade', 'Quench a Blade'),
          stage: async (bulkPanel) => {
            await clickSegment(bulkPanel, 'data-recipe-bulk-status-option', 'enable');
            // BOTH halves of the claim, because either alone would publish a lie: a Callout
            // with no pilled row says the panel invented a count, and a pilled row with no
            // Callout is the plain browser frame under a step named for the warning.
            await bulkPanel.locator('[data-recipe-bulk-blocked-warning]')
              .first().waitFor({ state: 'visible', timeout: 5_000 });
            await page.locator('.fabricate-manager .manager-recipe-row:has-text("Temper a Blade") .manager-chip.is-danger')
              .first().waitFor({ state: 'visible', timeout: 5_000 });
          },
        });

        // The rich recipe row (issue 643) is the highest horizontal-overflow risk in the manager:
        // identity + I/O readout + check pill + lock + toggle + three actions on one line.
        await setManagerWindowSize(page, { width: 900, height: 700 });
        await assertRecipeRowsHittable(page, 'recipes narrow');
        await captureStableManagerView(ctx, {
          layout: 'recipes narrow',
          label: 'manager-recipes-narrow',
        });
        await setManagerWindowSize(page, { width: 1280, height: 820 });

        // The row's "No check" warning pill fires when the system has no usable crafting check (no
        // authored rollFormula) — a system-level fact, so it cannot exist in the routed-check smoke
        // system whatever a recipe is authored to do.
        const scopeSelect = page.locator('.fabricate-manager [data-manager-scope-select]').first();
        try {
          await scopeSelect.selectOption({ label: 'Smoke Simple Forge' });
          await settleManagerNav(page);
          await page.locator('.fabricate-manager .manager-recipe-row [data-recipe-check="none"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertRecipeRowsHittable(page, 'recipes no-check');
          await captureStableManagerView(ctx, {
            layout: 'recipes no check',
            label: 'manager-recipes-no-check',
          });
        } finally {
          await scopeSelect.selectOption(craftingSetup.systemId).catch(() => {});
          await settleManagerNav(page);
          await openManagerCraftingSection(page, 'recipes', 'recipes');
        }

        // Issue 801 — the grouped-category continuation frame for the recipe library.
        await captureGroupedContinuationFrame(ctx, {
          stepName: 'recipes-grouped-continuation',
          failMessage: 'Recipes grouped continuation capture failed',
          layout: 'recipes grouped continuation',
          label: 'manager-recipes-grouped-continuation',
          groupCountSelector: '.fabricate-manager .manager-recipe-group .fab-group-count',
          openBrowser: () => openManagerCraftingSection(page, 'recipes', 'recipes'),
          settle: () => settleManagerNav(page),
          settleAfterReset: () => settleManagerNav(page),
          seed: () => page.evaluate(async (sysId) => {
            const rm = game.fabricate.getRecipeManager();
            const ids = [];
            for (let index = 1; index <= 14; index += 1) {
              const recipe = await rm.createRecipe({
                name: `Continuation Draught ${String(index).padStart(2, '0')}`,
                description: 'Issue 801 grouped-pagination continuation fixture.',
                craftingSystemId: sysId,
                ingredientSets: [{
                  ingredientGroups: [{
                    name: 'Any reagent',
                    options: [{ quantity: 1, match: { type: 'tags', tags: ['reagent'], tagMatch: 'any' } }]
                  }]
                }]
              }, { allowIncomplete: true, notify: false });
              await rm.updateRecipe(
                recipe.id,
                { category: 'Aaa Continuation' },
                { allowIncomplete: true, notify: false }
              );
              ids.push(recipe.id);
            }
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
            return ids;
          }, craftingSetup.systemId),
          hasSeed: (ids) => ids.length > 0,
          cleanup: (ids) => page.evaluate(async (recipeIds) => {
            const rm = game.fabricate.getRecipeManager();
            for (const id of recipeIds) {
              await rm.deleteRecipe(id, { notify: false }).catch(() => {});
            }
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          }, ids),
        });

        // Issue 806 — prove the editor round-trip preserves the browser's view-state
        // (category filter + collapsed group) rather than resetting it on the remount.
        await captureRecipeEditorRoundtrip(ctx, craftingSetup);

        // Crafting nav group expanded (Settings + Recipes + Books & Scrolls) and the Books &
        // Scrolls recipe-item surface + the Settings placeholder.
        try {
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-crafting-group-expanded');
          await openManagerCraftingSection(page, 'books-scrolls', 'books-scrolls');
          await page.locator('.fabricate-manager [data-books-scrolls]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          // The Books & Scrolls management surface now lists the book/scroll recipe items seeded
          // for "Brew Healing Potion" (issue 796) plus the two recipe items seeded for the
          // Validation-tab captures (issue 797) — the all-clear "Tome of Brewing" and the mixed
          // "Torn Recipe Scroll" — so it is deliberately populated.
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-books-scrolls-normal');
          await openManagerCraftingSection(page, 'settings', 'crafting-settings');
          // The Crafting Settings section now renders its real content (resolution
          // mode, visibility, salvage) — the former stub `-placeholder` hook is gone.
          await page.locator('.fabricate-manager [data-crafting-settings]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-crafting-settings');
          results.steps.push({ step: 'crafting-group-surfaces', passed: true });
        } catch (err) {
          results.steps.push({ step: 'crafting-group-surfaces', passed: false, error: err.message });
          process.stderr.write(`Crafting group surface capture failed: ${err.message}\n`);
        }

        // Recipe-item editor → Validation tab (issue 797): brought to parity with the recipe
        // editor's Validation tab (summary card + Passing/Blocking count tiles + grouped bordered
        // rows with status pills).
        try {
          const openRecipeItemValidation = async (recipeItemId) => {
            await openManagerCraftingSection(page, 'books-scrolls', 'books-scrolls');
            await page.locator(`.fabricate-manager [data-books-scrolls-edit="${recipeItemId}"]`).first().click();
            await page.locator('.fabricate-manager[data-manager-view="recipe-item-edit"]').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
            await page.locator('.fabricate-manager [data-recipe-item-tab-button="validation"]').first().click();
            // Wait on the summary card marker (the recipe-item editor is an edit-form view with no
            // table rows, so `assertManagerLayoutStable` — which requires them — does not apply;
            // the recipe-editor tab captures likewise use only the overlay guard).
            await page.locator('.fabricate-manager [data-recipe-item-tab="validation"] [data-recipe-item-validation-summary]').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
            await assertNoScreenshotOverlays(page);
          };
          await openRecipeItemValidation(craftingSetup.recipeItemIds.clear);
          await screenshot(page, 'manager-recipe-item-validation');
          await openRecipeItemValidation(craftingSetup.recipeItemIds.mixed);
          await screenshot(page, 'manager-recipe-item-validation-blocked');
          results.steps.push({ step: 'recipe-item-validation', passed: true });
        } catch (err) {
          results.steps.push({ step: 'recipe-item-validation', passed: false, error: err.message });
          process.stderr.write(`Recipe-item validation capture failed: ${err.message}\n`);
        }

        // Recipes → open the editor so the Overview tab's identity card is captured (#387).
        await openManagerRecipeEditor(page, 'Brew Healing Potion');
        await page.locator('.fabricate-manager [data-recipe-section="identity"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-normal');

        // Books & Scrolls tab: the knowledge-gated list of books teaching this recipe, plus its
        // per-row unlink — the ONLY surface carrying either.
        try {
          await page.locator('.fabricate-manager [data-recipe-tab-button="books-scrolls"]').first().click();
          await page.locator('.fabricate-manager [data-recipe-tab="books-scrolls"] [data-recipe-section="recipe-item"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertManagerLayoutStable(page, 'recipe edit books & scrolls');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-recipe-edit-books-scrolls');
          results.steps.push({ step: 'recipe-edit-books-scrolls', passed: true });
        } catch (err) {
          results.steps.push({ step: 'recipe-edit-books-scrolls', passed: false, error: err.message });
          process.stderr.write(`Recipe books & scrolls capture failed: ${err.message}\n`);
        }

        // Recipe Tools tab → this recipe references a deliberately-unlabelled tool, so the row must
        // show the backing component's name (the fallback fix), never a raw id.
        try {
          await page.locator('.fabricate-manager [data-recipe-tab-button="tools"]').first().click();
          await page.locator('.fabricate-manager [data-recipe-tab="tools"]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-recipe-tab="tools"] [data-recipe-tool-id]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-recipe-edit-tools');
          results.steps.push({ step: 'recipe-edit-tools', passed: true });
        } catch (err) {
          results.steps.push({ step: 'recipe-edit-tools', passed: false, error: err.message });
          process.stderr.write(`Recipe tools capture failed: ${err.message}\n`);
        }

        // Showcase Requirements → Ingredients tab.
        await openManagerRecipeEditor(page, 'Showcase Requirements');
        await page.locator('.fabricate-manager [data-recipe-tab-button="ingredients"]').first().click();
        await page.locator('.fabricate-manager [data-recipe-tab="ingredients"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-recipe-tab="ingredients"] [data-recipe-group]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit ingredients');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-ingredients');

        // Issue 684: the essence + currency-cost requirement rows sit below the fold of the
        // viewport-sized frame above, so they were cropped out of every published frame while the
        // caption still claimed them.
        const ingredientsTab = page.locator('.fabricate-manager [data-recipe-tab="ingredients"]').first();
        await ingredientsTab.locator('[data-recipe-option-currency]').first().scrollIntoViewIfNeeded();
        await ingredientsTab.locator('[data-recipe-option-essence]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await ingredientsTab.locator('[data-recipe-currency-amount]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-ingredients-cost');

        // Return to the recipes browser, then open the check-routed recipe whose Validation tab
        // carries both routed readiness warnings (issue 431 PR-2).
        await openManagerRecipeEditor(page, 'Routed Check Readiness');
        await page.locator('.fabricate-manager [data-recipe-tab-button="validation"]').first().click();
        await page.locator('.fabricate-manager [data-recipe-tab="validation"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // Wait on both warning chips so the capture proves the new readiness signals.
        await page.locator('.fabricate-manager [data-issue="unroutedResultGroup"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-issue="unproducedOutcomeTier"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit validation');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-validation');

        // Multi-Step Alloy → Overview: the steps accordion shows the per-step duration
        // chips/controls. Wait on the steps card and a per-step time chip.
        await openManagerRecipeEditor(page, 'Multi-Step Alloy');
        await page.locator('.fabricate-manager [data-recipe-tab="overview"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-recipe-section="steps"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // The Overview steps accordion passes onUpdateStep, so each step header renders the
        // editable duration control (data-recipe-duration-trigger), not the read-only
        // data-recipe-step-time chip used on the ingredients/results/tools accordions.
        await page.locator('.fabricate-manager [data-recipe-section="steps"] [data-recipe-duration-trigger]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit multistep');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-multistep');

        // Results-tab coverage (issue 643): the most mode-dependent tab previously had zero
        // screenshot coverage — which is why the multi-step Results structural bug shipped unseen.
        await captureRecipeResultsTab(
          ctx,
          'Routed Check Readiness',
          'manager-recipe-edit-results',
          '[data-recipe-result-set-id]'
        );

        // Multi-step: the per-step result content must be VISIBLE (the always-open
        // step accordion) — this is the frame that proves the multi-step Results
        // renders something (the C1 fix), not an empty tab.
        await captureRecipeResultsTab(
          ctx,
          'Multi-Step Alloy',
          'manager-recipe-edit-results-multistep',
          '[data-recipe-section$="-results"]'
        );

        // Two captures that demonstrate the collapse semantics of the feature: the confirm dialog
        // that guards turning the multi-step feature off while multi-step recipes exist, and the
        // collapsed recipe editor the branch renders once it is off.
        try {
          // (1) Disable-confirm, cancelled.
          const featureTile = await openManagerMultiStepFeatureTile(page);
          await featureTile.locator('.manager-status-toggle.is-on').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await featureTile.locator('.manager-status-toggle').first().click();

          const disableDialog = page
            .locator('.application.dialog:has(button[data-action="yes"]):has(button[data-action="no"])')
            .filter({ hasText: 'Existing multi-step recipes will run as one combined action' })
            .first();
          await disableDialog.waitFor({ state: 'visible', timeout: 10_000 });
          // Load-bearing proof this is the branch's collapse confirm (not a generic prompt): its
          // body copy AND its 'Disable' confirm button (issue 710's fix commit wired that label
          // onto the yes action).
          await disableDialog.getByText('Their steps are kept and restored').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await disableDialog.locator('button[data-action="yes"]:has-text("Disable")').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          // The dialog IS the intended overlay here (like the import-report capture), so
          // clear stray toasts but deliberately skip assertNoScreenshotOverlays.
          await dismissFoundryNotifications(page);
          await screenshot(page, 'manager-multistep-disable-confirm');

          // Cancel: the 'no' button leaves the toggle ON with zero persisted change.
          await disableDialog.locator('button[data-action="no"]').first().click();
          await disableDialog.waitFor({ state: 'detached', timeout: 10_000 });
          await featureTile.locator('.manager-status-toggle.is-on').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          results.steps.push({ step: 'multistep-disable-confirm', passed: true });
        } catch (err) {
          results.steps.push({ step: 'multistep-disable-confirm', passed: false, error: err.message });
          process.stderr.write(`Multi-step disable-confirm capture failed: ${err.message}\n`);
          // Dismiss any lingering confirm dialog so the next capture starts clean.
          await page.locator('.application.dialog button[data-action="no"]').first().click().catch(() => {});
        }

        try {
          // (2) Collapsed editor.
          const featureTile = await openManagerMultiStepFeatureTile(page);
          await featureTile.locator('.manager-status-toggle.is-on').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await featureTile.locator('.manager-status-toggle').first().click();
          const confirmDialog = page
            .locator('.application.dialog:has(button[data-action="yes"]):has(button[data-action="no"])')
            .filter({ hasText: 'Existing multi-step recipes will run as one combined action' })
            .first();
          await confirmDialog.waitFor({ state: 'visible', timeout: 10_000 });
          await confirmDialog.locator('button[data-action="yes"]').first().click();
          await confirmDialog.waitFor({ state: 'detached', timeout: 10_000 });
          // The store's toggleFeature refreshes after updateSystem; wait for the tile to
          // flip OFF so the recipe editor below receives multiStepEnabled=false.
          await featureTile.locator('.manager-status-toggle.is-off').first()
            .waitFor({ state: 'visible', timeout: 5_000 });

          await openManagerRecipeEditor(page, 'Multi-Step Alloy');
          await page.locator('.fabricate-manager [data-recipe-tab="overview"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          // Collapsed presentation: the read-only steps card + its note strip replace the editable
          // accordion.
          await page.locator('.fabricate-manager [data-recipe-section="collapsed-steps"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-recipe-collapsed-note]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          if (await page.locator('.fabricate-manager [data-recipe-section="steps"]').count() > 0) {
            throw new Error('Collapsed editor still rendered the editable steps accordion.');
          }
          await assertManagerLayoutStable(page, 'recipe edit collapsed');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-recipe-edit-collapsed');
          results.steps.push({ step: 'multistep-recipe-edit-collapsed', passed: true });
        } catch (err) {
          results.steps.push({ step: 'multistep-recipe-edit-collapsed', passed: false, error: err.message });
          process.stderr.write(`Multi-step collapsed-editor capture failed: ${err.message}\n`);
        } finally {
          // Mandatory restore: re-enable multi-step recipes (enabling never prompts) and verify the
          // editable steps accordion is back so every later multistep frame — and every rerun —
          // sees the enabled editor.
          try {
            const featureTile = await openManagerMultiStepFeatureTile(page);
            if (await featureTile.locator('.manager-status-toggle.is-off').count() > 0) {
              await featureTile.locator('.manager-status-toggle').first().click();
            }
            await featureTile.locator('.manager-status-toggle.is-on').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
            await openManagerRecipeEditor(page, 'Multi-Step Alloy');
            await page.locator('.fabricate-manager [data-recipe-section="steps"]').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
          } catch (restoreErr) {
            process.stderr.write(`Multi-step re-enable via UI failed, forcing via API: ${restoreErr.message}\n`);
            await page.evaluate(async (sysId) => {
              await game.fabricate.getCraftingSystemManager()?.updateSystem?.(sysId, {
                features: { multiStepRecipes: true },
              });
              await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
            }, craftingSetup.systemId).catch(() => {});
          }
        }

        // Progressive: the ordered stage list + roll-budget info strip + read-only difficulty badge
        // + keyboard move chevrons.
        if (executionFixtures?.progressive?.systemId) {
          try {
            await returnToSystemLibrary(page);
            await selectSmokeSystemInManager(page, executionFixtures.progressive.systemId);
            await captureRecipeResultsTab(
              ctx,
              executionFixtures.progressive.recipeName,
              'manager-recipe-edit-results-progressive',
              '[data-recipe-result-row]'
            );
            results.steps.push({ step: 'recipe-edit-results-progressive', passed: true });
          } catch (err) {
            results.steps.push({ step: 'recipe-edit-results-progressive', passed: false, error: err.message });
            process.stderr.write(`Progressive results capture failed: ${err.message}\n`);
          } finally {
            await softClick(page.locator('.fabricate-manager .manager-scope-return'));
            await selectSmokeSystemInManager(page, craftingSetup.systemId).catch(() => {});
          }
        }

        // Alchemy: the two-slot result shape — a success set plus a reserved,
        // undeletable "On a failed check" set. In its own alchemy system; same
        // switch-and-restore guard as the progressive capture.
        if (alchemyFixtures?.cauldronSystemId) {
          try {
            await returnToSystemLibrary(page);
            await selectSmokeSystemInManager(page, alchemyFixtures.cauldronSystemId);
            await captureRecipeResultsTab(
              ctx,
              'Elixir of Vigor',
              'manager-recipe-edit-results-alchemy',
              '[data-recipe-result-set-static-label]'
            );
            results.steps.push({ step: 'recipe-edit-results-alchemy', passed: true });
          } catch (err) {
            results.steps.push({ step: 'recipe-edit-results-alchemy', passed: false, error: err.message });
            process.stderr.write(`Alchemy results capture failed: ${err.message}\n`);
          } finally {
            await softClick(page.locator('.fabricate-manager .manager-scope-return'));
            await selectSmokeSystemInManager(page, craftingSetup.systemId).catch(() => {});
          }
        }

        // Warded Rite (restricted system) → the recipe editor's access tab: players with access,
        // characters with access, and each character's "played by" subline.
        try {
          await returnToSystemLibrary(page);
          await selectSmokeSystemInManager(page, craftingSetup.restrictedSystemId);
          await openManagerRecipeEditor(page, craftingSetup.restrictedRecipeName);
          await page.locator('.fabricate-manager [data-recipe-tab-button="access"]').first()
            .click({ timeout: 5_000 });
          await page.locator('.fabricate-manager [data-recipe-tab="access"] [data-recipe-section="access"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-recipe-access-characters]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await captureStableManagerView(ctx, {
            layout: 'recipe edit access rail',
            label: 'manager-recipe-edit-access-rail',
          });
          results.steps.push({ step: 'recipe-edit-access-rail', passed: true });
        } catch (err) {
          results.steps.push({ step: 'recipe-edit-access-rail', passed: false, error: err.message });
          process.stderr.write(`Restricted recipe rail capture failed: ${err.message}\n`);
        } finally {
          // Every later Phase D0 capture reads the fully-seeded Arcane Forge system,
          // so re-select it whether or not the restricted capture succeeded.
          await softClick(page.locator('.fabricate-manager .manager-scope-return'));
          await selectSmokeSystemInManager(page, craftingSetup.systemId).catch(() => {});
        }

        // Return to the recipes browser for the remaining navigation.
        await openManagerCraftingSection(page, 'recipes', 'recipes');
  }
};

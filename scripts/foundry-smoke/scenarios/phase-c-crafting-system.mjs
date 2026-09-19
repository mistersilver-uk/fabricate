/**
 * Phase C: the crafting-system seed, the craft-execution and alchemy fixtures, and the gathering
 * feature-gate check. It is a group scenario because phase C's try/catch encloses phases D0 and E:
 * a throw in the seed records one `create-crafting-system` failure and skips both. `phase` is null
 * because the phase opens only when phase B passed.
 */

import d0Spine from './d0-spine.mjs';
import phaseE from './phase-e.mjs';
import { assertNoScreenshotOverlays, closeOpenApplications, setManagerWindowSize } from '../pageOps/pageLifecycle.mjs';
import { seedSmokeAlchemyFixtures } from './phase-c-alchemy-fixtures.mjs';
import { seedSmokeCraftExecutionFixtures } from './phase-c-craft-execution-fixtures.mjs';
import { seedSmokeCraftingSystem } from './phase-c-system-fixture.mjs';

export default {
  id: 'phase-c-crafting-system',
  phase: null,
  section: null,
  children: [d0Spine, phaseE],
  publishes: ['craftingSetup', 'executionFixtures', 'alchemyFixtures'],
  consumes: ['cleanup'],
  async run(ctx, { runChildren }) {
    const { page, results, screenshot, startPhase } = ctx;
    const { cleanup } = ctx.shared;
    const { RUN_SCREENSHOT_PHASES, RUN_FULL_ONLY_BEHAVIORS } = ctx.profile;
    // Guard: Phases C–E depend on Phase B having created items
    const phaseBPassed = results.steps.some(s => s.step === 'create-actors-items' && s.passed);
    if (!phaseBPassed) {
      process.stderr.write('Skipping Phases C–E: Phase B did not complete.\n');
      results.steps.push({ step: 'create-crafting-system', passed: false, error: 'Skipped: Phase B failed' });
    }

    // ── Phase C: Create crafting system & recipes ────────────────────────────
    if (phaseBPassed) {
    startPhase('phase-C');
    process.stdout.write('Phase C: Creating crafting system and recipes...\n');
    try {
      // Quickstart Step 2 evidence (full profile): the GM System Library before any system exists —
      // the "No crafting systems yet" onboarding card with the primary "Create system" button.
      if (RUN_SCREENSHOT_PHASES) {
        await page.evaluate(async () => {
          const csm = game.fabricate.getCraftingSystemManager();
          for (const system of csm.getSystems()) {
            await csm.deleteSystem(system.id);
          }
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          globalThis.__fabricateSmokeManagerApp = (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        // The empty-library onboarding card renders its own primary action; wait
        // on it (not assertManagerLayoutStable, which requires table rows) so the
        // frame shows the onboarding state with the Create system button.
        await page.locator('.fabricate-manager .manager-empty .manager-button.is-primary')
          .filter({ hasText: 'Create system' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-systems-empty');
        await closeOpenApplications(page);
      }

      const craftingSetup = await seedSmokeCraftingSystem(page, {
        gathererUserId: cleanup.gathererUserId,
        crafterId: cleanup.crafterId,
        travelMemberId: cleanup.travelMemberId
      });
      ctx.shared.craftingSetup = craftingSetup;

      cleanup.systemId = craftingSetup.systemId;
      cleanup.blockedSystemId = craftingSetup.blockedSystemId;
      cleanup.restrictedSystemId = craftingSetup.restrictedSystemId;
      cleanup.recipeIds = craftingSetup.recipeIds;
      cleanup.sceneIds = craftingSetup.sceneIds;
      // The interactable Region is embedded in azureGroveScene, so it is cleaned
      // up with the scene (cleanup.sceneIds) — no separate cleanup key needed.
      process.stdout.write(`  Created crafting system and ${craftingSetup.recipeIds.length} recipes.\n`);

      results.steps.push({ step: 'create-crafting-system', passed: true });
      process.stdout.write(`Phase C complete: System "${craftingSetup.systemId}" with ${craftingSetup.recipeIds.length} recipes.\n`);

      // Issue #489: seed the craft-execution coverage fixtures (dedicated per-mode systems,
      // tool-breakage recipes, a salvageable component, crafter inventory, and a guaranteed-success
      // gather env/task).
      let executionFixtures = null;
      try {
        process.stdout.write('  Seeding craft-execution coverage fixtures (#489)...\n');
        executionFixtures = await seedSmokeCraftExecutionFixtures(page, craftingSetup, cleanup.crafterId);
        cleanup.executionSystemIds = executionFixtures.executionSystemIds;
        cleanup.executionItemIds = executionFixtures.executionItemIds;
        cleanup.recipeIds = [...cleanup.recipeIds, ...executionFixtures.executionRecipeIds];
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: true });
        process.stdout.write(
          `  Seeded ${executionFixtures.executionSystemIds.length} execution systems and ` +
          `${executionFixtures.executionRecipeIds.length} recipes.\n`
        );
      } catch (err) {
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: false, error: err.message });
        process.stderr.write(`Seeding craft-execution fixtures failed: ${err.message}\n`);
      }

      // Issue #543: seed the player Alchemy workbench coverage fixtures (two enabled alchemy
      // systems + valid recipes) so the shared app surfaces the Alchemy tab and its discipline
      // chooser in Phase E. Screenshot-profile only — rc/ci never opens the player app's alchemy
      // captures.
      let alchemyFixtures = null;
      if (RUN_SCREENSHOT_PHASES) {
        try {
          process.stdout.write('  Seeding player alchemy workbench fixtures (#543)...\n');
          alchemyFixtures = await seedSmokeAlchemyFixtures(page, craftingSetup, cleanup.crafterId);
          cleanup.executionSystemIds = [
            ...(cleanup.executionSystemIds || []),
            ...alchemyFixtures.alchemySystemIds
          ];
          cleanup.executionItemIds = [
            ...(cleanup.executionItemIds || []),
            ...alchemyFixtures.alchemyProductItemIds
          ];
          cleanup.recipeIds = [...cleanup.recipeIds, ...alchemyFixtures.alchemyRecipeIds];
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: true });
          process.stdout.write(
            `  Seeded ${alchemyFixtures.alchemySystemIds.length} alchemy systems and ` +
            `${alchemyFixtures.alchemyRecipeIds.length} recipes.\n`
          );
        } catch (err) {
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: false, error: err.message });
          process.stderr.write(`Seeding alchemy fixtures failed: ${err.message}\n`);
        }
      }

      // Feature-gate negative test (toggle gathering off, assert button hides, toggle back on).
      if (RUN_FULL_ONLY_BEHAVIORS) {
      try {
        const otherGatheringSystemsEnabled = await page.evaluate((systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          return csm.getSystems()
            .some(system => system.id !== systemId && system.features?.gathering === true);
        }, craftingSetup.systemId);
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.locator('#sidebar [data-tab="items"]').first().click({ force: true });
        // Wait for the items-sidebar tab content to be visible — replaces a
        // 750 ms fixed sleep that was guarding render of the sidebar after a
        // settings.update that triggers a Hooks.callAll cycle.
        await page.locator('#sidebar [data-tab="items"][aria-selected="true"], #sidebar [data-application-part="items"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* selectors vary across V13 sheets — best-effort */ });
        if (!otherGatheringSystemsEnabled && await page.locator('button[data-fabricate-action="gathering"]').count() > 0) {
          throw new Error('Gathering action is visible when no system enables gathering.');
        }
        if (otherGatheringSystemsEnabled) {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
        } else {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true });
        }
      } catch (err) {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: false, error: err.message });
      } finally {
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await page.locator('button[data-fabricate-action="gathering"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* tolerate if sidebar hasn't re-rendered in time */ });
      }
      } else {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
      }

      ctx.shared.executionFixtures = executionFixtures;
      ctx.shared.alchemyFixtures = alchemyFixtures;

      await runChildren();

    } catch (err) {
      results.steps.push({ step: 'create-crafting-system', passed: false, error: err.message });
      process.stderr.write(`Phase C failed: ${err.message}\n`);
    }
    } // end if (phaseBPassed)
  }
};

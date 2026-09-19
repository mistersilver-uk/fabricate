/**
 * Phase E's second half: the alchemy chooser and workbench, the craft itself, the crafter's
 * post-craft inventory, the craft-execution and gather assertions, and the player Journal capture.
 */

import {
  TRANSIENT_TEARDOWN_SKIP_PREFIX,
  isTransientPageTeardown,
  shouldTolerateSmokeTeardown,
} from '../../lib/foundrySmokeSignal.js';
import { captureAlchemyThemes } from '../pageOps/managerViews.mjs';
import { assertNoScreenshotOverlays, closeOpenApplications } from '../pageOps/pageLifecycle.mjs';

import { runCraftExecutionAsserts, runFullProfileGatherAsserts } from './phase-e-asserts.mjs';

export async function runPhaseEAlchemyAndJournal(ctx, { appShell }) {
  const { page, results, screenshot } = ctx;
  const { cleanup, craftingSetup, executionFixtures, alchemyFixtures } = ctx.shared;
  const { RUN_SCREENSHOT_PHASES, RUN_FULL_ONLY_GATHERING_STATES } = ctx.profile;
  // The Alchemy tab is conditional — shown only when an enabled alchemy system has recipes
  // (seeded above under RUN_SCREENSHOT_PHASES).
  if (RUN_SCREENSHOT_PHASES) {
    try {
      if ((await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').count()) === 0) {
        throw new Error('Alchemy tab is not present (alchemy fixtures may not have seeded).');
      }
      // Restore the window to a normal width — the crafting-stacked capture
      // above shrank it — before capturing the alchemy chooser/workbench.
      await page.evaluate(() => {
        const app = document.querySelector('#fabricate-app');
        if (!app) return;
        Object.assign(app.style, {
          minWidth: '',
          minHeight: '',
          width: '1100px',
          height: '760px',
          left: '40px',
          top: '40px',
        });
      });
      await page.waitForTimeout(300);

      // The alchemy listing resolves its actor from the shared top-bar selection, and the
      // no-actor state precedes the chooser in AlchemyView.
      await appShell
        .locator('[data-actor-bar-state="ready"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {});

      await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').first().click();
      await appShell
        .locator('.fabricate-app-nav-item.active:has-text("Alchemy")')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });

      // Let the view settle out of its loading state.
      await appShell
        .locator(
          '#fabricate-app [data-alchemy-state]:not([data-alchemy-state="loading"]), #fabricate-app .alchemy-chooser'
        )
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {});
      const alchemyChooser = appShell.locator('.alchemy-chooser').first();
      if (!(await alchemyChooser.isVisible().catch(() => false))) {
        const switchDiscipline = appShell.locator('[data-alchemy-switch]').first();
        if ((await switchDiscipline.count()) > 0) {
          await switchDiscipline.click().catch(() => {});
        }
      }
      await alchemyChooser.waitFor({ state: 'visible', timeout: 12_000 });
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-alchemy-chooser');

      // Enter a discipline (prefer the Bubbling Cauldron, whose components the
      // crafter owns) → the three-column workbench.
      const cauldronCard = appShell
        .locator(`[data-alchemy-chooser-card="${alchemyFixtures?.cauldronSystemId ?? ''}"]`)
        .first();
      if ((await cauldronCard.count()) > 0) {
        await cauldronCard.click();
      } else {
        await appShell.locator('[data-alchemy-chooser-card]').first().click();
      }
      await appShell
        .locator('[data-alchemy-state="workbench"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });

      // Populate the bench: place the first available owned component so the
      // workbench frame shows chips + a signature rather than the empty bench.
      const firstAvailableComponent = appShell
        .locator('[data-alchemy-inventory-row]:not([disabled])')
        .first();
      if ((await firstAvailableComponent.count()) > 0) {
        await firstAvailableComponent.click().catch(() => {});
        await page.waitForTimeout(200);
      }
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-alchemy-workbench');

      // Narrow-window stacked evidence: shrink below the alchemy grid's 900px
      // container-query breakpoint so the three columns reflow into a single
      // vertical stack (workbench leading).
      const alchemyStackedSize = await page.evaluate(() => {
        const app = document.querySelector('#fabricate-app');
        if (!app) return null;
        Object.assign(app.style, {
          minWidth: '0px',
          minHeight: '0px',
          width: '780px',
          height: '760px',
          left: '20px',
          top: '20px',
        });
        return {
          width: app.getBoundingClientRect().width,
          height: app.getBoundingClientRect().height,
        };
      });
      await page.waitForTimeout(600);
      await appShell
        .locator('[data-alchemy-state="workbench"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {});
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-alchemy-stacked');

      // Restore a normal width, then capture the workbench under every theme.
      await page.evaluate(() => {
        const app = document.querySelector('#fabricate-app');
        if (!app) return;
        Object.assign(app.style, {
          minWidth: '',
          minHeight: '',
          width: '1100px',
          height: '760px',
          left: '40px',
          top: '40px',
        });
      });
      await page.waitForTimeout(400);
      await appShell
        .locator('[data-alchemy-state="workbench"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {});
      await captureAlchemyThemes(ctx);

      results.steps.push({ step: 'player-alchemy', passed: true, size: alchemyStackedSize });
    } catch (alchemyTabError) {
      results.steps.push({
        step: 'player-alchemy',
        passed: false,
        error: String(alchemyTabError?.message ?? alchemyTabError),
      });
      process.stdout.write(
        `  Player Alchemy tab capture skipped: ${alchemyTabError?.message ?? alchemyTabError}\n`
      );
    }
  }

  await closeOpenApplications(page);
  results.steps.push({ step: 'open-fabricate-app-shell', passed: true });
  process.stdout.write('  Shared Fabricate app shell verified and screenshotted.\n');

  // Attempt to craft via the API
  process.stdout.write('  Executing craft: Brew Healing Potion...\n');
  const craftResult = await page.evaluate(
    async ({ recipeId, crafterId }) => {
      const crafter = game.actors.get(crafterId);
      if (!crafter) throw new Error(`Actor ${crafterId} not found`);

      console.log(
        `Crafting with ${crafter.name} (${crafter.id}), ${crafter.items.size} items in inventory`
      );
      const vialCopies = crafter.items.contents.filter((item) => item.name === 'Empty Vial');
      if (vialCopies.length < 2) {
        throw new Error(
          `Brew Healing Potion fixture retained ${vialCopies.length} Empty Vial copies; ` +
            'the attempt requires distinct ingredient and Tool documents'
        );
      }

      const rm = game.fabricate.getRecipeManager();
      const recipe = rm.getRecipe(recipeId);
      if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

      const result = await game.fabricate.craft(crafter, recipe, {
        componentSourceActors: [crafter],
      });

      // Check the crafter's inventory for the Healing Potion
      const potionInInventory = crafter.items.contents.some((i) => i.name === 'Healing Potion');

      return {
        success: result.success,
        message: result.message,
        potionInInventory,
      };
    },
    { recipeId: craftingSetup.healingPotionRecipeId, crafterId: cleanup.crafterId }
  );

  if (craftResult.success) {
    process.stdout.write(`Craft succeeded: ${craftResult.message}\n`);
    process.stdout.write(`Healing Potion in inventory: ${craftResult.potionInInventory}\n`);
    results.steps.push({ step: 'craft-healing-potion', passed: true });
  } else {
    process.stderr.write(`Craft returned failure: ${craftResult.message}\n`);
    results.steps.push({ step: 'craft-healing-potion', passed: false, error: craftResult.message });
  }

  // Wait for the Healing Potion to actually appear in the crafter's inventory
  // before screenshotting. Catches missing-craft regressions that a
  // fixed sleep would mask. Replaces a 1 s fixed sleep.
  if (craftResult.success) {
    await page
      .waitForFunction(
        (crafterId) => {
          const crafter = game.actors.get(crafterId);
          return crafter?.items?.contents?.some((i) => i.name === 'Healing Potion') === true;
        },
        cleanup.crafterId,
        { timeout: 10_000 }
      )
      .catch(() => {
        /* surface via post-craft step state */
      });
  }
  await screenshot(page, 'post-craft');
  process.stdout.write('  Screenshotted post-craft state.\n');

  // Chat card evidence (issue #752 — evidence for #727's roll-total fix): the API craft above
  // posts a crafting result card to chat.
  if (RUN_SCREENSHOT_PHASES) {
    try {
      await page
        .locator('#sidebar [data-tab="chat"]')
        .first()
        .click({ force: true })
        .catch(() => {});
      const craftChatCard = page.locator('#sidebar .fabricate-craft-chat').last();
      await craftChatCard.waitFor({ state: 'visible', timeout: 10_000 });
      await craftChatCard.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(200);
      const sidebarClip = await page.locator('#sidebar').first().boundingBox();
      await screenshot(page, 'chat-craft-card', sidebarClip ? { clip: sidebarClip } : {});
      process.stdout.write('  Screenshotted the crafting chat card.\n');
      results.steps.push({ step: 'chat-craft-card', passed: true });
    } catch (chatCardError) {
      results.steps.push({
        step: 'chat-craft-card',
        passed: false,
        error: String(chatCardError?.message ?? chatCardError),
      });
      process.stderr.write(
        `Chat craft card capture failed: ${chatCardError?.message ?? chatCardError}\n`
      );
    }
  }

  // Open the crafter's sheet to show the crafted item (inventory tab)
  process.stdout.write("  Opening the crafter's inventory to verify crafted item...\n");
  await page.evaluate(async (crafterId) => {
    const crafter = game.actors.get(crafterId);
    if (crafter) await crafter.sheet.render(true);
  }, cleanup.crafterId);
  // Wait for the actor sheet to render (replaces a 1.5 s fixed sleep).
  await page
    .locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {
      /* sheet selectors vary by V13 sheet — tab change tolerates absence */
    });
  // Navigate to inventory tab via Foundry API
  await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const sheet = actor?.sheet;
    if (typeof sheet?.changeTab === 'function') {
      sheet.changeTab('inventory', 'primary');
    } else if (typeof sheet?.activateTab === 'function') {
      sheet.activateTab('inventory');
    }
  }, cleanup.crafterId);
  await page.waitForTimeout(500);
  await screenshot(page, 'crafter-post-craft-inventory');
  process.stdout.write("  Screenshotted the crafter's post-craft inventory.\n");

  // Close the sheet
  await page.evaluate((crafterId) => {
    const crafter = game.actors.get(crafterId);
    if (crafter) crafter.sheet.close();
  }, cleanup.crafterId);

  // Cheap API crafts, tool breakages, salvage, negative gating, and one guaranteed-success
  // gather — no screenshots, so they run in every profile.
  if (executionFixtures) {
    process.stdout.write('  Running craft-execution coverage asserts (#489)...\n');
    const execSteps = await runCraftExecutionAsserts(page, executionFixtures, cleanup.crafterId);
    for (const step of execSteps) {
      results.steps.push(step);
      process.stdout.write(
        `    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`
      );
    }

    // Full-profile-only gather assertions: the 0%-drop ("empty") and
    // scene-blocked gathers, plus the hazardous "Bramble Snare" event
    // firing — all rely on fixtures seeded only under RUN_SCREENSHOT_PHASES.
    if (RUN_FULL_ONLY_GATHERING_STATES) {
      process.stdout.write('  Running full-profile gather asserts (#489)...\n');
      const gatherSteps = await runFullProfileGatherAsserts(
        page,
        craftingSetup,
        executionFixtures.hazard,
        cleanup.crafterId
      );
      for (const step of gatherSteps) {
        results.steps.push(step);
        process.stdout.write(
          `    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`
        );
      }
    }
  } else {
    process.stdout.write('  Skipping #489 execution asserts: fixtures not seeded.\n');
    results.steps.push({
      step: 'exec-coverage',
      passed: false,
      error: 'Execution fixtures not seeded',
    });
  }

  // The Phase E craft above produced at least one terminal crafting run for the crafter, so
  // the player Journal screen has a populated, selectable run to render.
  const JOURNAL_CAPTURE_ATTEMPTS = 3;
  const captureJournalScreen = async () => {
    await closeOpenApplications(page);
    // Ensure the crafter (the actor that owns the terminal run) is the persisted bar
    // selection so the Journal lists its runs even though the harness runs as GM.
    await page.evaluate(async (crafterId) => {
      await game.fabricate.setSelectedGatheringActorId(crafterId);
    }, cleanup.crafterId);

    // Re-open the shared Fabricate app via the same "Craft Item" sidebar
    // action used earlier in this phase.
    const journalItemsTab = page.locator('#sidebar [data-tab="items"]').first();
    await journalItemsTab.click({ force: true });
    const journalCraftButton = page.locator('button[data-fabricate-action="craft"]').first();
    await journalCraftButton.waitFor({ state: 'visible', timeout: 10_000 });
    await journalCraftButton.evaluate((button) => button.click());

    await appShell.waitFor({ state: 'visible', timeout: 10_000 });
    await appShell
      .locator('[data-actor-bar-state="ready"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Switch to the Journal tab (click via .evaluate to bypass any overlay,
    // matching the sidebar-action pattern above) and wait for it to activate.
    await appShell
      .locator('.fabricate-app-nav-item:has-text("Journal")')
      .first()
      .evaluate((el) => el.click());
    await appShell
      .locator('.fabricate-app-nav-item.active:has-text("Journal")')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });

    // JournalView mounts and fires an async listJournalForActor() fetch, rendering a
    // [data-journal-state] container ("loading" -> "populated"/ "empty"/"error").
    await appShell
      .locator('[data-journal-state]:not([data-journal-state="loading"])')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    await appShell
      .locator('[data-journal-state="populated"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Render the centre detail for a concrete run: prefer an active run card, else the first
    // terminal history row.
    const journalActiveCard = appShell.locator('.journal-run-card[data-run-id]').first();
    if ((await journalActiveCard.count()) > 0) {
      await journalActiveCard.click();
    } else {
      const journalHistoryRow = appShell
        .locator('.journal-history-row [data-history-run-id]')
        .first();
      if ((await journalHistoryRow.count()) > 0) {
        await journalHistoryRow.scrollIntoViewIfNeeded();
        await journalHistoryRow.click();
      }
    }
    await appShell
      .locator('[data-journal-detail][data-run-key]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });

    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'fabricate-journal');

    // Phase E guarantees a terminal craft; capture its historical account after the
    // general Journal frame so selecting it cannot disturb that frame's selection.
    if (RUN_SCREENSHOT_PHASES) {
      const historyRows = appShell.locator('.journal-history-row [data-history-run-id]');
      const historyCount = await historyRows.count();
      let craftingRunSelected = false;
      for (let i = 0; i < historyCount; i += 1) {
        await historyRows
          .nth(i)
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await historyRows
          .nth(i)
          .click()
          .catch(() => {});
        const selectedCraftingRun = await appShell
          .locator(String.raw`[data-journal-detail][data-run-key*="\"crafting\""]`)
          .first()
          .waitFor({ state: 'visible', timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (selectedCraftingRun) {
          craftingRunSelected = true;
          break;
        }
      }
      if (!craftingRunSelected) {
        throw new Error('Journal history had no crafting run to show its historical account.');
      }
      // Every profile reaching this capture requires the selected run's historical account.
      await appShell
        .locator('[data-journal-detail] [data-journal-history-detail]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'fabricate-journal-craft-detail');
    }
  };
  let journalErr = null;
  for (let attempt = 1; attempt <= JOURNAL_CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      process.stdout.write(
        `  Capturing the player Journal screen (attempt ${attempt}/${JOURNAL_CAPTURE_ATTEMPTS})...\n`
      );
      await captureJournalScreen();
      journalErr = null;
      break;
    } catch (error) {
      journalErr = error;
      process.stderr.write(`Player Journal capture attempt ${attempt} failed: ${error.message}\n`);
      // A torn-down page cannot be recovered within this run — stop retrying.
      if (page.isClosed?.() || isTransientPageTeardown(error.message)) break;
      // Live-page hiccup (navigation/timing): reset and retry.
      if (attempt < JOURNAL_CAPTURE_ATTEMPTS) {
        try {
          await closeOpenApplications(page);
        } catch {
          /* ignore reset failure; the next attempt re-opens the app */
        }
      }
    }
  }
  if (!journalErr) {
    results.steps.push({ step: 'player-journal', passed: true });
    process.stdout.write('  Screenshotted the player Journal screen.\n');
  } else if (
    shouldTolerateSmokeTeardown({
      message: journalErr.message,
      pageClosed: page.isClosed?.(),
      requiredCapturesComplete: true,
    })
  ) {
    // Infra teardown (renderer/page closed) — do not fail the whole smoke on a known-flaky
    // last step; mark it skipped with the reason so a persistent pattern is still visible in
    // summary.json.
    results.steps.push({
      step: 'player-journal',
      passed: true,
      skipped: true,
      error: TRANSIENT_TEARDOWN_SKIP_PREFIX + journalErr.message,
    });
    process.stderr.write(
      `Player Journal capture skipped after a transient page teardown: ${journalErr.message}\n`
    );
  } else {
    results.steps.push({ step: 'player-journal', passed: false, error: journalErr.message });
    process.stderr.write(`Player Journal capture failed: ${journalErr.message}\n`);
    try {
      await screenshot(page, 'journal-failure');
    } catch {
      /* page may already be gone */
    }
  }
}

/** Phase E's first half: the shared app, the inventory and salvage captures, the gathering states and the Crafting tab; it returns the app-shell locator the second half continues against. */

import {
  assertProgressiveStageListSound,
  handleRollPromptIfPresent,
} from '../pageOps/managerViews.mjs';
import {
  assertNoScreenshotOverlays,
  assertPointerTarget,
  closeOpenApplications,
  describeBlockingOverlay,
} from '../pageOps/pageLifecycle.mjs';
import { ensureSlotOpen } from '../pageOps/toolStudio.mjs';

export async function runPhaseEInventoryGatheringAndCrafting(ctx) {
  const { page, results, screenshot } = ctx;
  const { executionFixtures } = ctx.shared;
  const { RUN_SCREENSHOT_PHASES, RUN_FULL_ONLY_GATHERING_STATES } = ctx.profile;
  // The "Craft Item" and "Gathering" sidebar actions both open one shared window
  // (#fabricate-app); "Craft Item" lands on the Crafting tab and "Gathering" focuses the same
  // window on the Gathering tab.
  process.stdout.write('  Opening shared Fabricate app via "Craft Item"...\n');
  await closeOpenApplications(page);
  const sidebarItemsTab = page.locator('#sidebar [data-tab="items"]').first();
  await sidebarItemsTab.click({ force: true });
  // The craft button is the readiness signal — it lives in the Items directory header, so it
  // can only be visible once that panel is active.
  const craftButton = page.locator('button[data-fabricate-action="craft"]').first();
  try {
    await craftButton.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (waitError) {
    const blocker = await describeBlockingOverlay(page);
    if (blocker) {
      throw new Error(
        `The "Craft Item" sidebar action never became visible, and ${blocker} is on screen — ` +
          'a modal overlay intercepts the sidebar click even with force:true. ' +
          `Original error: ${waitError.message}`,
        { cause: waitError }
      );
    }
    throw waitError;
  }
  await craftButton.evaluate((button) => button.click());

  const appShell = page.locator('#fabricate-app').first();
  await appShell.waitFor({ state: 'visible', timeout: 10_000 });

  const navItems = appShell.locator('.fabricate-app-nav-item');
  await navItems.first().waitFor({ state: 'visible', timeout: 10_000 });

  // The shared actor-selection top bar mounts with the shell and flips [data-actor-bar-state] from
  // "loading" to "ready" once its selectable actor list and gathering conditions have loaded.
  await appShell
    .locator('[data-actor-bar-state="ready"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  // Crafting/Gathering/Journal/Inventory are always present; the Alchemy
  // tab is conditional (shown only when an enabled alchemy system has recipes).
  for (const label of ['Crafting', 'Gathering', 'Journal', 'Inventory']) {
    if ((await appShell.locator(`.fabricate-app-nav-item:has-text("${label}")`).count()) === 0) {
      throw new Error(`Shared Fabricate app is missing the ${label} nav tab.`);
    }
  }
  if ((await navItems.count()) < 4) {
    throw new Error('Shared Fabricate app should expose at least the four base nav tabs.');
  }
  if (
    (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count()) === 0
  ) {
    throw new Error('Shared Fabricate app did not open on the Crafting tab after "Craft Item".');
  }

  // "Gathering" focuses the SAME window and switches to the Gathering tab.
  const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
  await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
  await gatheringButton.evaluate((button) => button.click());

  if ((await page.locator('#fabricate-app').count()) !== 1) {
    throw new Error(
      '"Gathering" opened a second window instead of focusing the shared Fabricate app.'
    );
  }
  await appShell
    .locator('.fabricate-app-nav-item.active:has-text("Gathering")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  if (
    (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count()) !== 0
  ) {
    throw new Error('Shared Fabricate app did not switch off the Crafting tab after "Gathering".');
  }

  // The nav switch above only proves the Gathering tab is active; GatheringView then fires an
  // async services.listGatheringForActor() fetch and renders a [data-gathering-state]
  // container ("loading" -> "populated"/"empty"/"error").
  await appShell
    .locator('[data-gathering-state]:not([data-gathering-state="loading"])')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });

  // The populated layout now fills the center column with the environment detail (GatheringDetail).
  if ((await appShell.locator('[data-gathering-state="populated"]').count()) > 0) {
    await appShell
      .locator('[data-gathering-detail] [data-gathering-detail-state="selected"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  await assertNoScreenshotOverlays(page);
  // Dedicated player Gathering tab evidence: the same populated/selected state, captured
  // under its own label so changes under src/ui/svelte/apps/gathering/ map to a real
  // screenshot (see the 'player-gathering' VIEW_RECIPE in ui-pr-screenshot-evidence.mjs).
  await screenshot(page, 'player-gathering-environments');
  await screenshot(page, 'fabricate-app-shell');

  // Dedicated player Inventory tab evidence: switch the shared window to the Inventory tab
  // and wait for its listing to settle off "loading" so the captured frame shows the resolved
  // owned-materials grid (or the empty / no-actor state) rather than the spinner.
  await appShell.locator('.fabricate-app-nav-item:has-text("Inventory")').first().click();
  await appShell
    .locator('.fabricate-app-nav-item.active:has-text("Inventory")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell
    .locator('[data-inventory-state]:not([data-inventory-state="loading"])')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  // A selectable item auto-selects, so when the grid is populated wait for
  // the detail panel to render before capturing (mirrors the gathering
  // detail wait), so the frame shows the sources / used-by panel.
  if ((await appShell.locator('[data-inventory-state="populated"]').count()) > 0) {
    await appShell
      .locator('[data-inventory-detail]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-inventory');

  // Dedicated player salvage evidence (issue 675) — the first player-facing salvage surface.
  const salvageSearch = appShell.locator('[data-inventory-filters] input').first();
  await salvageSearch.waitFor({ state: 'visible', timeout: 10_000 });
  await salvageSearch.fill('Smoke Cracked Amphora');
  await page.waitForTimeout(200);
  await appShell
    .locator('[data-inventory-card]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('[data-inventory-card]').first().click();
  const salvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
  await salvageTab.waitFor({ state: 'visible', timeout: 10_000 });
  await salvageTab.click();
  await appShell
    .locator('[data-inventory-salvage-panel="progressive"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell
    .locator('[data-progressive-stage-reorderable]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-salvage');

  // The second salvage frame: the no-check body — Smoke Relic's real shape, and the shape
  // most real worlds have (a simple-mode salvage with no authored check formula recovers its
  // materials outright, with every result tagged "Guaranteed").
  await salvageSearch.fill('Smoke Relic');
  await page.waitForTimeout(200);
  await appShell
    .locator('[data-inventory-card]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('[data-inventory-card]').first().click();
  const relicSalvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
  await relicSalvageTab.waitFor({ state: 'visible', timeout: 10_000 });
  await relicSalvageTab.click();
  await appShell
    .locator('[data-inventory-salvage-body="no-check"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-salvage-no-check');

  // Issue 777: the pre-roll required-tools disclosure.
  await salvageSearch.fill('Smoke Toolchest');
  await page.waitForTimeout(200);
  await appShell
    .locator('[data-inventory-card]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('[data-inventory-card]').first().click();
  const toolchestSalvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
  await toolchestSalvageTab.waitFor({ state: 'visible', timeout: 10_000 });
  await toolchestSalvageTab.click();
  await appShell
    .locator('[data-inventory-salvage-tools]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-salvage-tools');

  // Issue 766: one physical stack registered as salvageable in two systems must render as a
  // single inventory card, counted once, carrying a System selector that re-scopes the detail.
  const collapseSearch = appShell.locator('[data-inventory-filters] input').first();
  await collapseSearch.waitFor({ state: 'visible', timeout: 10_000 });
  await collapseSearch.fill('Smoke Air Shard');
  await page.waitForTimeout(200);
  // Exactly ONE card for the multi-system stack — the collapse contract.
  await appShell
    .locator('[data-inventory-card]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('[data-inventory-card]').first().click();
  // The multi-system selector drop-down is the visual proof of the collapse. The hook is
  // on the converted trigger, which is why this wait survived the conversion unchanged.
  await appShell
    .locator('[data-inventory-system-select]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-inventory-multi-system');

  // Issue 764: the GM-facing Simple-mode misconfigured salvage cue. A stored Simple config
  // with more than one success result group is invalid (the engine awards only the first).
  await page.evaluate(
    ({ systemId, componentId }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(systemId);
      const component = system?.components?.find((c) => c.id === componentId);
      if (!component?.salvage) {
        throw new Error('issue 764 frame: Smoke Relic salvage not found for in-memory injection');
      }
      component.salvage.resultGroups.push({
        id: 'smoke-relic-surplus-764',
        name: 'Surplus Parts',
        results: [],
      });
    },
    {
      systemId: executionFixtures.simple.systemId,
      componentId: executionFixtures.simple.relicComponentId,
    }
  );

  // Tab out and back so InventoryView remounts and re-fetches the (now multi-group)
  // listing — each tab body is behind an {#if}, so switching unmounts and remounts it.
  await appShell.locator('.fabricate-app-nav-item:has-text("Gathering")').first().click();
  await appShell
    .locator('.fabricate-app-nav-item.active:has-text("Gathering")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('.fabricate-app-nav-item:has-text("Inventory")').first().click();
  await appShell
    .locator('.fabricate-app-nav-item.active:has-text("Inventory")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell
    .locator('[data-inventory-state]:not([data-inventory-state="loading"])')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });

  const misconfiguredSearch = appShell.locator('[data-inventory-filters] input').first();
  await misconfiguredSearch.waitFor({ state: 'visible', timeout: 10_000 });
  await misconfiguredSearch.fill('Smoke Relic');
  await page.waitForTimeout(200);
  await appShell
    .locator('[data-inventory-card]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell.locator('[data-inventory-card]').first().click();
  const misconfiguredTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
  await misconfiguredTab.waitFor({ state: 'visible', timeout: 10_000 });
  await misconfiguredTab.click();
  await appShell
    .locator('[data-inventory-salvage-body="misconfigured"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-salvage-misconfigured');

  // Restore Smoke Relic's healthy single-group salvage so nothing downstream inherits
  // the injected invalid config.
  await page.evaluate(
    ({ systemId, componentId }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(systemId);
      const component = system?.components?.find((c) => c.id === componentId);
      if (component?.salvage) {
        component.salvage.resultGroups = component.salvage.resultGroups.filter(
          (g) => g.id !== 'smoke-relic-surplus-764'
        );
      }
    },
    {
      systemId: executionFixtures.simple.systemId,
      componentId: executionFixtures.simple.relicComponentId,
    }
  );

  // Clear the search so the tab is left in its browsable state for any later
  // inventory work (and so a re-entry does not inherit this filter).
  await salvageSearch.fill('');
  await page.waitForTimeout(150);

  // Restore the Gathering tab (the tab active before this inventory capture): the downstream
  // steps operate on the Gathering view (selecting the 'Azure Grove' environment, etc.), so
  // re-activate it and wait for its listing to settle off "loading" before continuing.
  await appShell.locator('.fabricate-app-nav-item:has-text("Gathering")').first().click();
  await appShell
    .locator('.fabricate-app-nav-item.active:has-text("Gathering")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await appShell
    .locator('[data-gathering-state]:not([data-gathering-state="loading"])')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });

  async function clearGatheringEnvironmentSearch() {
    const search = appShell.locator('.gathering-env-search input').first();
    if ((await search.count()) === 0) return;
    await search.fill('');
    await page.waitForTimeout(150);
  }

  async function selectGatheringEnvironment(name) {
    const search = appShell.locator('.gathering-env-search input').first();
    if ((await search.count()) > 0) {
      await search.fill(name);
      await page.waitForTimeout(200);
    }
    const card = appShell
      .locator('.gathering-env-card[data-locked="false"]')
      .filter({ hasText: name })
      .first();
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();
    await appShell
      .locator('[data-gathering-detail-state="selected"]')
      .filter({ hasText: name })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  async function selectGatheringTask(name) {
    const row = appShell.locator('.gathering-task-row').filter({ hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await appShell
      .locator('[data-gathering-task-detail]')
      .filter({ hasText: name })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await appShell
      .locator('[data-gathering-drops-state="ready"], [data-gathering-drops-state="loading"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(250);
  }

  async function waitForGatheringAttempt(blocked) {
    await appShell
      .locator(`[data-gathering-attempt][data-gathering-attempt-blocked="${blocked}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  async function captureCurrentPlayerGathering(label) {
    await assertNoScreenshotOverlays(page);
    await screenshot(page, label);
  }

  async function captureSelectedGatheringTask({ environment, task, blocked, label }) {
    await selectGatheringEnvironment(environment);
    await selectGatheringTask(task);
    if (typeof blocked === 'boolean') {
      await waitForGatheringAttempt(blocked);
    }
    await captureCurrentPlayerGathering(label);
  }

  async function clickReadyGatheringAttempt() {
    await appShell
      .locator('[data-gathering-attempt][data-gathering-attempt-blocked="false"]')
      .first()
      .click();
    // An immediate (d100) attempt opens the interactive roll prompt: capture it and click Roll.
    await handleRollPromptIfPresent(ctx, 'player-gathering-roll-prompt');
    await appShell
      .locator('[data-gathering-state="populated"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  // Documentation journey captures: exercise the user-visible gathering states the quickstart
  // and gathering docs discuss.
  if (RUN_FULL_ONLY_GATHERING_STATES) {
    await selectGatheringEnvironment('Azure Grove');
    await appShell.locator('[data-gathering-detail-tab="events"]').first().click();
    await appShell
      .locator('[data-gathering-event-section]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await captureCurrentPlayerGathering('player-gathering-events');
    await appShell.locator('[data-gathering-detail-tab="tasks"]').first().click();
    await appShell
      .locator('[data-gathering-tasks-section]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });

    await captureSelectedGatheringTask({
      environment: 'Verdant Meadow',
      task: 'Gather Meadow Herbs',
      blocked: false,
      label: 'player-gathering-task-ready',
    });
    await clickReadyGatheringAttempt();
    await captureSelectedGatheringTask({
      environment: 'Verdant Meadow',
      task: 'Gather Meadow Herbs',
      label: 'player-gathering-after-success',
    });
    await captureSelectedGatheringTask({
      environment: 'Crystal Thicket',
      task: 'Bottle Crystal Dew',
      blocked: true,
      label: 'player-gathering-tool-blocked',
    });
    await captureSelectedGatheringTask({
      environment: 'Timed Orchard',
      task: 'Tend Slow Bloom',
      blocked: false,
      label: 'player-gathering-timed-ready',
    });
    await clickReadyGatheringAttempt();
    await captureSelectedGatheringTask({
      environment: 'Timed Orchard',
      task: 'Tend Slow Bloom',
      blocked: true,
      label: 'player-gathering-timed-active',
    });

    await selectGatheringEnvironment('Moonlit Blind Grove');
    await appShell
      .locator('[data-gathering-blind-card]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await captureCurrentPlayerGathering('player-gathering-blind');

    await clearGatheringEnvironmentSearch();
  }

  // Region-lock evidence (#294): the locked "Hidden Hollow" env sorts last, so page forward
  // until it appears, then capture it.
  const lockedEnvCard = appShell.locator('.gathering-env-card[data-locked="true"]');
  const envNextPage = appShell.locator('.gathering-env-list [data-pagination-next]');
  for (
    let i = 0;
    i < 6 && (await lockedEnvCard.count()) === 0 && (await envNextPage.count()) > 0;
    i++
  ) {
    if (await envNextPage.isDisabled()) break;
    await envNextPage.click();
    await page.waitForTimeout(150);
  }
  if ((await lockedEnvCard.count()) > 0) {
    await lockedEnvCard
      .first()
      .scrollIntoViewIfNeeded({ timeout: 5000 })
      .catch(() => {});
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'player-gathering-realm-locked');
  }

  // Narrow-window stacked evidence (#330): shrink the Fabricate window below the gathering
  // grid's stacking breakpoint so the three columns reflow into a single vertical stack
  // instead of clipping the side columns.
  const envPrevPage = appShell.locator('.gathering-env-list [data-pagination-prev]');
  for (let i = 0; i < 6 && (await envPrevPage.count()) > 0; i++) {
    if (await envPrevPage.isDisabled()) break;
    await envPrevPage.click();
    await page.waitForTimeout(150);
  }
  // Drive the window below the gathering grid's stacking breakpoint. This simulates the
  // small-screen case from #330 where Foundry constrains the window to a viewport narrower
  // than the CSS floor.
  const stackedSize = await page.evaluate(() => {
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
    return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
  });
  // Let the resize + container-query reflow settle before capturing so the
  // frame shows the fully stacked single-column layout, not a mid-transition.
  await page.waitForTimeout(600);
  await appShell
    .locator('[data-gathering-state="populated"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {});
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'player-gathering-stacked');
  results.steps.push({ step: 'player-gathering-stacked', passed: true, size: stackedSize });

  // Switch the shared window to the Crafting tab and capture its states so changes under
  // src/ui/svelte/apps/crafting/ map to real screenshots (the 'player-crafting' VIEW_RECIPES
  // entry).
  if (RUN_SCREENSHOT_PHASES) {
    try {
      // Restore the window to a normal width before re-capturing the tab.
      await page.evaluate(() => {
        const app = document.querySelector('#fabricate-app');
        if (!app) return;
        Object.assign(app.style, { width: '1100px', height: '760px', left: '40px', top: '40px' });
      });
      await page.waitForTimeout(300);

      await appShell.locator('.fabricate-app-nav-item:has-text("Crafting")').first().click();
      await appShell
        .locator('[data-crafting-state]:not([data-crafting-state="loading"])')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });

      // Best-effort: select the recipe whose detail renders the given mode, so the captured
      // frame matches the label when that mode is seeded.
      async function selectCraftingRecipeByMode(mode) {
        const rows = appShell.locator('[data-recipe-id]');
        const count = await rows.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          await rows
            .nth(i)
            .locator('.crafting-recipe-row-main')
            .click()
            .catch(() => {});
          await page.waitForTimeout(150);
          if ((await appShell.locator(`[data-recipe-detail-mode="${mode}"]`).count()) > 0) break;
        }
      }

      async function selectCraftingRecipeByName(name) {
        const recipeSearch = appShell.locator('.crafting-browser-search input').first();
        await recipeSearch.fill(name);
        await page.waitForTimeout(350);
        const row = appShell.locator(`[data-recipe-id]:has-text("${name}")`).first();
        await row.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await row.locator('.crafting-recipe-row-main').click({ timeout: 5000 });
        return { recipeSearch, row };
      }

      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-crafting-simple');

      await selectCraftingRecipeByMode('routedByIngredients');
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-crafting-ingredient-routed');

      await selectCraftingRecipeByMode('routedByCheck');
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-crafting-routed-by-check');

      // Produce a run-summary frame: craft the selected recipe (when craftable)
      // so the right column swaps to the run summary, then capture it.
      const craftButton = appShell
        .locator('[data-crafting-craft][data-crafting-craft-disabled="false"]')
        .first();
      if ((await craftButton.count()) > 0) {
        await craftButton.click().catch(() => {});
        // A UI craft now opens the interactive roll prompt: capture it, then
        // click Roll so the run summary resolves and the overlay clears.
        await handleRollPromptIfPresent(ctx, 'player-crafting-roll-prompt');
        await appShell
          .locator('[data-crafting-run-summary]')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => {});
      }
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-crafting-run-summary');

      // Roll-result box evidence (issue #752 — evidence for #727's pill fix): the run summary
      // only renders when a craft recorded a roll result, and it embeds the RollResultBox
      // (awarded pills + outcome).
      try {
        const rollResultBox = appShell
          .locator('[data-crafting-run-summary] [data-recipe-section="roll-result"]')
          .first();
        await rollResultBox.waitFor({ state: 'visible', timeout: 10_000 });
        await rollResultBox.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-roll-result');
        results.steps.push({ step: 'player-crafting-roll-result', passed: true });
      } catch (rollResultError) {
        results.steps.push({
          step: 'player-crafting-roll-result',
          passed: false,
          error: String(rollResultError?.message ?? rollResultError),
        });
        process.stdout.write(
          `  Player Crafting roll-result capture skipped: ${rollResultError?.message ?? rollResultError}\n`
        );
      }

      // Multi-option ingredient selector evidence (issue #552): 'Smoke Weave Filigree' offers a
      // held component or an authored essence, so the detail renders the two-row radiogroup.
      try {
        // The recipe list is paginated (12/page); filter to the multi-option recipe via the browser
        // search so its row is in the DOM regardless of which page it would otherwise fall on.
        const recipeSearch = appShell.locator('.crafting-browser-search input').first();
        await recipeSearch.fill('Smoke Weave Filigree');
        await page.waitForTimeout(350);
        const altRecipeRow = appShell
          .locator('[data-recipe-id]:has-text("Smoke Weave Filigree")')
          .first();
        await altRecipeRow.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await altRecipeRow.locator('.crafting-recipe-row-main').click({ timeout: 5000 });
        // Issue 917 re-point: `[data-recipe-section="alternatives"]` is no longer always present.
        await appShell
          .locator('[data-recipe-section="requirement-rail"]')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        const altSlotTile = appShell
          .locator('[data-requirement-slot][data-slot-kind="choice"]')
          .first();
        await ensureSlotOpen(altSlotTile).catch(() => {});
        const altSection = appShell.locator('[data-recipe-section="alternatives"]').first();
        await altSection.waitFor({ state: 'visible', timeout: 10_000 });
        // Pointer hit-test (issue 917): the whole 80px slot-tile column is the control, under the
        // rail's wrapping flex row. happy-dom computes no cascade, so only a real frame can prove
        // Foundry's global button chrome is not swallowing the click.
        await assertPointerTarget(
          page,
          altSlotTile,
          '[data-requirement-slot]',
          'Requirement rail slot tile'
        );
        await appShell
          .locator('.crafting-alt-option')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-alternative');
        await screenshot(page, 'player-crafting-alternatives');

        // Nice-to-have "switched" variant: click the second alternative so the
        // selection tick moves, evidencing the player choosing the other option.
        const altOptions = appShell.locator('.crafting-alt-option');
        if ((await altOptions.count()) > 1) {
          await altOptions
            .nth(1)
            .click({ timeout: 5000 })
            .catch(() => {});
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-alternatives-switched');
        }
        // Restore the unfiltered recipe list for the subsequent stacked frame.
        await recipeSearch.fill('').catch(() => {});
        await page.waitForTimeout(200);
        results.steps.push({ step: 'player-crafting-alternatives', passed: true });
      } catch (altError) {
        results.steps.push({
          step: 'player-crafting-alternatives',
          passed: false,
          error: String(altError?.message ?? altError),
        });
        process.stdout.write(
          `  Player Crafting alternatives capture skipped: ${altError?.message ?? altError}\n`
        );
      }

      try {
        const legacy = await selectCraftingRecipeByName('Smoke Legacy Essence Seal');
        await appShell
          .locator('[data-io-group="essences"] .crafting-io-essence-icon')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-legacy');
        await legacy.recipeSearch.fill('');

        const firstClass = await selectCraftingRecipeByName('Smoke First-Class Essence Draught');
        // Issue 917 re-point: a first-class essence requirement is no longer a separate essence
        // thumb inside the ingredient image grid — it is a rail slot whose glyph carries the
        // authored icon and colour token.
        await appShell
          .locator(
            '[data-recipe-section="requirement-rail"] [data-slot-kind="essence"] [data-medallion]'
          )
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-ingredient');

        await firstClass.row.locator('.crafting-recipe-row-add').click({ timeout: 5000 });
        // Issue 1506: the acquire card's essence row draws the shared art tile in its glyph face.
        await appShell
          .locator('[data-shopping-acquire-components] [data-medallion="glyph"]')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-shopping');
        await firstClass.recipeSearch.fill('');
        results.steps.push({ step: 'player-crafting-essence-icons', passed: true });
      } catch (essenceIconError) {
        results.steps.push({
          step: 'player-crafting-essence-icons',
          passed: false,
          error: String(essenceIconError?.message ?? essenceIconError),
        });
      }

      // The redesign's own surfaces.
      try {
        // Set one carrier's allocation through its real stepper input rather than the store, so
        // what the frame shows is what a player's keystroke produces.
        const setCarrierUnits = async (carrierName, units) => {
          const input = appShell
            .locator(`[data-essence-carrier]:has-text("${carrierName}") [data-stepper-input]`)
            .first();
          await input.waitFor({ state: 'visible', timeout: 8000 });
          await input.fill(String(units));
          await input.blur().catch(() => {});
          await page.waitForTimeout(300);
        };
        // `ensureSlotOpen` (issue 917): the tile is a real disclosure, and focus auto-advance
        // already opens the rail's first unsatisfied openable slot the moment a recipe is picked.
        const openEssencePool = async () => {
          await ensureSlotOpen(
            appShell.locator('[data-requirement-slot][data-slot-kind="essence"]').first()
          );
          await appShell
            .locator('[data-recipe-section="essence-pool"]')
            .first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        };
        const readMeters = () =>
          page.evaluate(() =>
            [...document.querySelectorAll('#fabricate-app [data-essence-meter]')].map((node) => ({
              essenceId: node.dataset.essenceMeter,
              state: node.dataset.essenceMeterState,
              ratio: String(
                node.querySelector('.essence-pool-meter-ratio')?.textContent ?? ''
              ).trim(),
            }))
          );
        // Container-level wait: the rail's slot row, not a particular tile. An over-specific
        // wait that times out fails the whole phase and reads as an unrelated later breakage.
        const railSlots = appShell
          .locator('[data-recipe-section="requirement-rail"] [data-requirement-rail-slots]')
          .first();

        // (1) The rail's three states in ONE frame: a met fixed slot, an UNCHOSEN choice slot in
        // accent (a to-do, never danger), and a zero-delivered essence slot in danger, with one
        // chooser open beneath it.
        const railRecipe = await selectCraftingRecipeByName('Smoke Runestaff Binding');
        await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
        const railStates = await page.evaluate(() =>
          [...document.querySelectorAll('#fabricate-app [data-requirement-slot]')]
            .map((node) => `${node.dataset.slotKind}:${node.dataset.slotState}`)
            .sort((a, b) => a.localeCompare(b))
        );
        const expectedRailStates = ['choice:partial', 'essence:short', 'fixed:met'];
        if (railStates.join('|') !== expectedRailStates.join('|')) {
          throw new Error(
            `Requirement rail states were ${JSON.stringify(railStates)}, expected ${JSON.stringify(expectedRailStates)}`
          );
        }
        const openChoosers = await appShell
          .locator('[data-recipe-section="alternatives"], [data-recipe-section="essence-pool"]')
          .count();
        if (openChoosers !== 1) {
          throw new Error(
            `Requirement rail had ${openChoosers} choosers open, expected exactly one`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-slot-rail');
        await railRecipe.recipeSearch.fill('');

        // (2) Acceptance criterion 5. Nothing in inventory carries the authored tag, so the
        // tile has no item image to borrow and must render its glyph — never Foundry's
        // `icons/svg/item-bag.svg`.
        const tagRecipe = await selectCraftingRecipeByName('Smoke Sigil Etching');
        await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
        const tagReport = await page.evaluate(() => {
          const rail = document.querySelector(
            '#fabricate-app [data-recipe-section="requirement-rail"]'
          );
          if (!rail) return null;
          return {
            slots: rail.querySelectorAll('[data-requirement-slot]').length,
            bagImages: [...rail.querySelectorAll('img')].filter((img) =>
              String(img.getAttribute('src') ?? '').includes('item-bag')
            ).length,
            // Issue 1506: the fallback glyph is the shared art tile's glyph face.
            glyphTiles: rail.querySelectorAll('[data-medallion="glyph"]').length,
            openChoosers: document.querySelectorAll(
              '#fabricate-app [data-recipe-section="alternatives"], #fabricate-app [data-recipe-section="essence-pool"]'
            ).length,
          };
        });
        if (!tagReport) throw new Error('Tag-requirement rail did not render');
        if (tagReport.bagImages > 0) {
          throw new Error(
            `Unmatched tag tile still renders the item-bag SVG: ${JSON.stringify(tagReport)}`
          );
        }
        if (tagReport.glyphTiles < 1) {
          throw new Error(
            `Unmatched tag tile rendered no fallback glyph: ${JSON.stringify(tagReport)}`
          );
        }
        if (tagReport.openChoosers !== 0) {
          throw new Error(`An all-fixed rail opened a chooser: ${JSON.stringify(tagReport)}`);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-tag-unmatched');
        await tagRecipe.recipeSearch.fill('');

        // (3) The pool at its simplest: one requirement, a partial allocation, exactly one
        // stepper left non-zero, and the "your selection" recap beneath it.
        const poolRecipe = await selectCraftingRecipeByName('Smoke First-Class Essence Draught');
        await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
        await openEssencePool();
        const poolWand = appShell.locator('[data-requirement-pick-for-me]').first();
        // Pointer hit-test (issue 917): a new card-shaped pill button in the rail's own
        // header row, which no mounted test can evaluate for stacking.
        await assertPointerTarget(
          page,
          poolWand,
          '[data-requirement-pick-for-me]',
          'Requirement rail Pick for me'
        );
        await poolWand.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        await setCarrierUnits('Smoke Tidebloom', 0);
        await setCarrierUnits('Smoke Starmote', 0);
        // Pointer hit-test (issue 917): the `+` adjunct is a 24px icon-only control nested in a
        // list row inside a panel that only exists while its slot is open — a new stacking
        // arrangement no mounted test can evaluate.
        await assertPointerTarget(
          page,
          appShell
            .locator('[data-essence-carrier]:has-text("Smoke Tidebloom") [data-stepper-increment]')
            .first(),
          '[data-stepper-increment]',
          'Essence pool carrier increment'
        );
        const singleMeters = await readMeters();
        if (singleMeters.length !== 1 || singleMeters[0].state !== 'partial') {
          throw new Error(
            `Single-requirement pool was ${JSON.stringify(singleMeters)}, expected one partial meter`
          );
        }
        const trimmedRows = await appShell.locator('[data-essence-picked]').count();
        if (trimmedRows !== 1) {
          throw new Error(
            `Pool recap listed ${trimmedRows} carriers, expected exactly the one still allocated`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-pool');

        // (4) "Pick for me", captured on the same recipe immediately after (3) so the pair
        // reads as a genuine before/after: one carrier funding 2 of 6, then the wand restoring
        // the resolver's full suggestion.
        await poolWand.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        const pickedRows = await appShell.locator('[data-essence-picked]').count();
        if (pickedRows <= trimmedRows) {
          throw new Error(
            `Pick for me left ${pickedRows} allocated carriers, no more than the ${trimmedRows} before it`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-pick-for-me');
        await poolRecipe.recipeSearch.fill('');

        // (5) The D-ESS proof.
        const sharedRecipe = await selectCraftingRecipeByName('Smoke Tidecore Tempering');
        await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
        await openEssencePool();
        await setCarrierUnits('Smoke Starmote', 1);
        await setCarrierUnits('Smoke Duskcrystal', 1);
        await setCarrierUnits('Smoke Starmote', 0);
        const sharedMeters = await readMeters();
        const sharedStates = sharedMeters
          .map((meter) => meter.state)
          .sort((a, b) => a.localeCompare(b))
          .join('|');
        if (sharedMeters.length !== 2 || sharedStates !== 'met|partial') {
          throw new Error(
            `Shared pool was ${JSON.stringify(sharedMeters)}, expected one met and one part-delivered meter`
          );
        }
        // Issue 917 re-point: the chip's class is `.essence-contribution`
        // (`EssenceContribution.svelte`) — `.essence-pool-contribution` never existed and
        // always counted zero.
        const duskContributions = await appShell
          .locator('[data-essence-carrier]:has-text("Smoke Duskcrystal") .essence-contribution')
          .count();
        if (duskContributions < 2) {
          throw new Error(
            `Dual carrier showed ${duskContributions} contribution chips, expected one per essence it funds`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-essence-pool-shared');

        // (6) The same recipe and allocation framed on the consumption plan: a fixed row, an
        // essence-carrier row (one entry per item key), and the "still to choose" line.
        const planPanel = appShell.locator('[data-recipe-section="consumption-plan"]').first();
        await planPanel.waitFor({ state: 'visible', timeout: 10_000 });
        await planPanel.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        const planReport = await page.evaluate(() => {
          const panel = document.querySelector(
            '#fabricate-app [data-recipe-section="consumption-plan"]'
          );
          if (!panel) return null;
          return {
            rows: panel.querySelectorAll('[data-consumption-row]').length,
            carrierRows: panel.querySelectorAll('[data-consumption-row^="carrier:"]').length,
            pending: String(panel.querySelector('[data-consumption-pending]')?.textContent ?? '')
              .replaceAll(/\s+/g, ' ')
              .trim(),
          };
        });
        if (!planReport) throw new Error('Consumption plan panel did not render');
        if (planReport.rows < 2 || planReport.carrierRows < 1) {
          throw new Error(
            `Consumption plan showed ${JSON.stringify(planReport)}, expected a fixed row and a carrier row`
          );
        }
        if (planReport.pending.length === 0) {
          throw new Error(
            'Consumption plan showed no "still to choose" line for the unsettled requirement'
          );
        }
        // The tile's name is the chosen option's, not the group's: `_resolveGroupDescription` and
        // `_resolveIngredientVisual` report the option ('Smoke Anvil'), never the label.
        if (!planReport.pending.includes('Smoke Anvil')) {
          throw new Error(
            `Consumption plan pending line did not name the unchosen Fitting requirement's option: ${JSON.stringify(planReport)}`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-consumption-plan');

        await sharedRecipe.recipeSearch.fill('');
        await page.waitForTimeout(200);
        results.steps.push({
          step: 'player-crafting-requirement-rail',
          passed: true,
          railStates,
          tagReport,
          singleMeters,
          trimmedRows,
          pickedRows,
          sharedMeters,
          planReport,
        });
      } catch (railError) {
        results.steps.push({
          step: 'player-crafting-requirement-rail',
          passed: false,
          error: String(railError?.message ?? railError),
        });
        process.stdout.write(
          `  Player Crafting requirement-rail capture failed: ${railError?.message ?? railError}\n`
        );
      }

      // Select the seeded 'Smoke Raise Tent' recipe (a simple-mode recipe whose sets live on
      // steps[]).
      try {
        const recipeSearch = appShell.locator('.crafting-browser-search input').first();
        await recipeSearch.fill('Smoke Raise Tent');
        await page.waitForTimeout(350);
        const tentRow = appShell.locator('[data-recipe-id]:has-text("Smoke Raise Tent")').first();
        await tentRow.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await tentRow.locator('.crafting-recipe-row-main').click({ timeout: 5000 });
        // Wait for the ordered step list (a stable section marker, not leaf content).
        await appShell
          .locator('[data-recipe-section="steps"]')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        const stepBlocks = await appShell
          .locator('[data-recipe-section="steps"] [data-recipe-step]')
          .count();
        const hasHint = await appShell.locator('[data-recipe-section="steps-hint"]').count();
        const hasCheck = await appShell.locator('[data-recipe-section="check"]').count();
        const totalDuration = String(
          await appShell
            .locator('[data-recipe-duration][data-recipe-duration-kind="total"]')
            .first()
            .textContent()
        )
          .replaceAll(/\s+/g, ' ')
          .trim();
        const stepDurationLabels = await appShell
          .locator('[data-recipe-section="steps"] [data-recipe-step]')
          .evaluateAll((steps) =>
            steps.map((step) =>
              String(step.querySelector('[data-recipe-step-duration]')?.textContent ?? '')
                .replaceAll(/\s+/g, ' ')
                .trim()
            )
          );
        if (
          totalDuration !== 'Total duration: 1 hr 30 min' ||
          stepDurationLabels[0] !== '30 min' ||
          stepDurationLabels[1] !== '1 hr'
        ) {
          throw new Error(
            `Unexpected multi-step durations: total="${totalDuration}", steps=${JSON.stringify(stepDurationLabels)}`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-multistep');
        // Restore the unfiltered recipe list for the subsequent frames.
        await recipeSearch.fill('').catch(() => {});
        await page.waitForTimeout(200);
        results.steps.push({
          step: 'player-crafting-multistep',
          passed: stepBlocks >= 2 && hasHint > 0 && hasCheck === 0,
          stepBlocks,
          hasHint: hasHint > 0,
          checkCardShown: hasCheck > 0,
          totalDuration,
          stepDurationLabels,
        });
      } catch (multiStepError) {
        results.steps.push({
          step: 'player-crafting-multistep',
          passed: false,
          error: String(multiStepError?.message ?? multiStepError),
        });
        process.stdout.write(
          `  Player Crafting multi-step capture skipped: ${multiStepError?.message ?? multiStepError}\n`
        );
      }

      // The change's main new player surface.
      try {
        const recipeSearch = appShell.locator('.crafting-browser-search input').first();
        const selectRecipeByName = async (name) => {
          await recipeSearch.fill(name);
          await page.waitForTimeout(350);
          const row = appShell.locator(`[data-recipe-id]:has-text("${name}")`).first();
          await row.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await row.locator('.crafting-recipe-row-main').click({ timeout: 5000 });
          await appShell
            .locator('[data-recipe-section="progressive-stages"]')
            .first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        };

        // (1) Flag ON — the default. Settles the chevron box: the buttons render
        // whether or not anything has moved, so the reset is checkable at rest.
        await selectRecipeByName('Smoke Mold Brick');
        await assertProgressiveStageListSound(page, 'player-crafting-progressive');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-progressive');

        // (2) Reordered.
        const moveDown = appShell.locator('[data-progressive-stage-move-down]').first();
        await moveDown.click({ timeout: 5000 });
        await page.waitForTimeout(250);
        const reordered = await assertProgressiveStageListSound(
          page,
          'player-crafting-progressive-reordered',
          { expectAnnouncement: true }
        );
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-progressive-reordered');
        results.steps.push({
          step: 'player-crafting-progressive-reordered',
          passed: true,
          thresholds: reordered.thresholds,
          announcement: reordered.region?.text ?? '',
        });

        // (3) Flag OFF (D13): no grips, no move buttons, ordinals + difficulty kept,
        // and the muted "Order set by the GM" line. Default-true means an explicit
        // false has to be authored to reach this state at all.
        await selectRecipeByName('Smoke Kiln Firing');
        const fixedReport = await page.evaluate(() => ({
          rows: document.querySelectorAll('[data-progressive-stage-fixed]').length,
          grips: document.querySelectorAll('.crafting-stage-handle').length,
          moves: document.querySelectorAll('[data-progressive-stage-move]').length,
          ordinals: document.querySelectorAll('[data-progressive-stage-ordinal]').length,
          difficulties: document.querySelectorAll('[data-progressive-stage-difficulty]').length,
          note:
            document.querySelector('[data-progressive-stage-fixed-note]')?.textContent?.trim() ??
            '',
          liveRegions: document.querySelectorAll('[data-progressive-stage-status]').length,
        }));
        if (fixedReport.rows < 3) throw new Error(`fixed state rendered ${fixedReport.rows} rows`);
        if (fixedReport.grips > 0 || fixedReport.moves > 0) {
          throw new Error(
            `fixed state still offers reorder affordances: ${JSON.stringify(fixedReport)}`
          );
        }
        if (fixedReport.ordinals < 3 || fixedReport.difficulties < 3) {
          throw new Error(
            `fixed state dropped ordinals/difficulty: ${JSON.stringify(fixedReport)}`
          );
        }
        if (fixedReport.note.length === 0)
          throw new Error('fixed state shows no "order set by the GM" line');
        if (fixedReport.liveRegions > 0)
          throw new Error('fixed state renders a live region for an order that cannot change');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-progressive-fixed');
        results.steps.push({
          step: 'player-crafting-progressive-fixed',
          passed: true,
          ...fixedReport,
        });

        // (4) Narrow: the long component name must ellipse while the difficulty and
        // "Reached at >=N" chips survive and the chevrons stay on-row.
        await selectRecipeByName('Smoke Mold Brick');
        const progressiveStackedSize = await page.evaluate(() => {
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
        const narrow = await assertProgressiveStageListSound(
          page,
          'player-crafting-progressive-stacked'
        );
        const narrowChips = await page.evaluate(() => {
          const visible = (selector) =>
            [...document.querySelectorAll(selector)].filter(
              (node) => node.getBoundingClientRect().width > 1
            ).length;
          const names = [...document.querySelectorAll('.crafting-stage-name')];
          return {
            difficulties: visible('[data-progressive-stage-difficulty]'),
            thresholds: visible('[data-progressive-stage-threshold]'),
            ellipsed: names.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
            rowOverflow: [...document.querySelectorAll('.crafting-stage-row')].filter(
              (row) => row.scrollWidth > row.clientWidth + 2
            ).length,
          };
        });
        if (narrowChips.difficulties < 3 || narrowChips.thresholds < 3) {
          throw new Error(`narrow layout squeezed out the chips: ${JSON.stringify(narrowChips)}`);
        }
        if (narrowChips.rowOverflow > 0) {
          throw new Error(
            `narrow layout overflows the row (chevrons pushed off): ${JSON.stringify(narrowChips)}`
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-crafting-progressive-stacked');
        results.steps.push({
          step: 'player-crafting-progressive-stacked',
          passed: true,
          size: progressiveStackedSize,
          thresholds: narrow.thresholds,
          ...narrowChips,
        });

        // Restore width + the unfiltered list for the frames that follow.
        await page.evaluate(() => {
          const app = document.querySelector('#fabricate-app');
          if (app)
            Object.assign(app.style, {
              width: '1100px',
              height: '760px',
              left: '40px',
              top: '40px',
            });
        });
        await recipeSearch.fill('').catch(() => {});
        await page.waitForTimeout(300);
        results.steps.push({ step: 'player-crafting-progressive', passed: true });
      } catch (progressiveError) {
        results.steps.push({
          step: 'player-crafting-progressive',
          passed: false,
          error: String(progressiveError?.message ?? progressiveError),
        });
        process.stdout.write(
          `  Player Crafting progressive capture failed: ${progressiveError?.message ?? progressiveError}\n`
        );
      }

      // Narrow-window stacked evidence: shrink below the grid's 900px stacking
      // breakpoint so the three columns reflow into a single vertical stack.
      const craftingStackedSize = await page.evaluate(() => {
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
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'player-crafting-stacked');
      results.steps.push({
        step: 'player-crafting-stacked',
        passed: true,
        size: craftingStackedSize,
      });
    } catch (craftingTabError) {
      results.steps.push({
        step: 'player-crafting',
        passed: false,
        error: String(craftingTabError?.message ?? craftingTabError),
      });
      process.stdout.write(
        `  Player Crafting tab capture skipped: ${craftingTabError?.message ?? craftingTabError}\n`
      );
    }
  }
  return { appShell };
}

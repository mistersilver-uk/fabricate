/**
 * Boot: the setup page, the license and admin-auth flows, the world launch and join, and the
 * Fabricate module activation the rest of the walk depends on.
 */

import {
  acceptLicenseIfPresent as acceptLicenseIfPresentShared,
  authenticateIfRequired as authenticateIfRequiredShared,
  createBootReporter,
  getPathname,
  joinWorldSession as joinWorldSessionShared,
  launchWorld as launchWorldShared
} from '../../lib/foundryBrowserBoot.js';
import { installNotificationHidingCss } from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'boot-and-join',
  phase: 'boot-and-join',
  section: null,
  publishes: [],
  consumes: [],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { FOUNDRY_URL, ADMIN_KEY, WORLD_ID } = ctx.endpoint;
    // How the shared boot path (scripts/lib/foundryBrowserBoot.js) reports back into this run's
    // bookkeeping.
    const bootReporter = createBootReporter({
      screenshot,
      recordStep: (step) => results.steps.push(step),
      log: (message) => process.stdout.write(message)
    });
    // ── Step 1: Navigate to setup page and handle first-run flows ──────────
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle' });
    results.steps.push({ step: 'navigate-setup', passed: true });

    // Handle first-run license page (redirects /setup → /license → /auth)
    await acceptLicenseIfPresentShared(page, { reporter: bootReporter });

    // Handle admin auth page (/auth → /setup)
    await authenticateIfRequiredShared(page, { adminKey: ADMIN_KEY, reporter: bootReporter });

    // If the world is already running, Foundry redirects straight to /join or /game
    const postAuthPath = getPathname(page.url());
    const worldAlreadyRunning = postAuthPath === '/join' || postAuthPath === '/game';

    if (!worldAlreadyRunning) {
      // ── Step 2: Dismiss first-run dialogs, then launch the world ───────────
      await launchWorldShared(page, {
        worldId: WORLD_ID,
        foundryUrl: FOUNDRY_URL,
        reporter: bootReporter
      });
    } else {
      process.stdout.write('World already running, skipping setup/launch.\n');
      results.steps.push({ step: 'setup-ready', passed: true, skipped: true });
      results.steps.push({ step: 'launch-world', passed: true, skipped: true });
    }

    await joinWorldSessionShared(page, {
      userLabel: 'Gamemaster',
      stepName: 'join-session',
      reporter: bootReporter
    });

    // Hide notification toasts globally — they otherwise overlay screenshots and force a
    // per-screenshot dismiss + sleep dance.
    await installNotificationHidingCss(page);

    await screenshot(page, 'world-loaded');

    // Wait for Foundry canvas to be ready
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

    // ── Step 3: Verify/activate Fabricate module ─────────────────────────────
    const fabricateActive = await page.evaluate(() => {
      return game.modules.get('fabricate')?.active === true;
    });

    if (!fabricateActive) {
      process.stdout.write('Fabricate module not active. Activating via Module Management...\n');
      // Enable the module through Foundry's settings API, then reload
      await page.evaluate(async () => {
        const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
        moduleSettings['fabricate'] = true;
        await game.settings.set('core', 'moduleConfiguration', moduleSettings);
      });
      // Reload the page to apply module activation
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      // Re-join if redirected to /join
      await joinWorldSessionShared(page, { userLabel: 'Gamemaster', reporter: bootReporter });
      // Re-apply the notification-hiding CSS after reload (style tags are
      // scoped to the document and are cleared on navigation)
      await installNotificationHidingCss(page);
      await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

      const nowActive = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
      if (!nowActive) {
        throw new Error('Fabricate module could not be activated.');
      }
      results.steps.push({ step: 'module-activated', passed: true });
      process.stdout.write('Fabricate module activated and loaded.\n');
    } else {
      results.steps.push({ step: 'module-active', passed: true });
      process.stdout.write('Fabricate module is active.\n');
    }

    // Wait for Fabricate to be fully ready
    await page.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });

    // Dismiss any overlay that might block sidebar clicks (Game Paused banner, tours, dialogs)
    await page.evaluate(() => {
      // Unpause the game if paused (the "Game Paused" overlay blocks all sidebar clicks)
      if (game.paused) game.togglePause(false);
      // Dismiss any active tour
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) tour.activeTour.exit();
    });
    await page.waitForTimeout(500);
  }
};

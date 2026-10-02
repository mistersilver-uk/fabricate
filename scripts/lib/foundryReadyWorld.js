/** Bring a Playwright page to a joined, Fabricate-ready Gamemaster session (issues #1088, #2007). */

import {
  acceptLicenseIfPresent,
  authenticateIfRequired,
  clearBlockingOverlays,
  createBootReporter,
  getPathname,
  joinWorldSession,
  launchWorld,
} from './foundryBrowserBoot.js';
import { TOUR_PROGRESS_STORAGE_KEY, withSuppressedTours } from './foundryTourSuppression.js';

/** Stop Foundry's New User Experience tours ever starting. */
export async function suppressTours(context) {
  await context.addInitScript(
    ({ key, value }) => {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        // A boot must never depend on localStorage being writable.
      }
    },
    { key: TOUR_PROGRESS_STORAGE_KEY, value: JSON.stringify(withSuppressedTours(null)) }
  );
}

/**
 * Boot, launch `worldId`, join as Gamemaster and wait until Fabricate reports ready, enabling the
 * module first when the world has it switched off.
 */
export async function bootToReadyWorld(page, { foundryUrl, worldId, adminKey, log }) {
  const reporter = createBootReporter({ log });

  await page.goto(`${foundryUrl}/setup`, { waitUntil: 'networkidle', timeout: 120_000 });
  await acceptLicenseIfPresent(page, { reporter });
  await authenticateIfRequired(page, { adminKey, reporter });

  const path = getPathname(page.url());
  if (path !== '/join' && path !== '/game') {
    // Foundry's nue starts a setup tour whose full-viewport `.tour-overlay` intercepts every click,
    // so a perfectly correct selector times out as "element is visible, enabled and stable" — which
    // reads as a missing control rather than a blocked one.
    await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 30_000 });
    const cleared = await clearBlockingOverlays(page);
    if (cleared.length > 0) log(`Cleared blocking setup overlays: ${cleared.join(', ')}\n`);
    await launchWorld(page, { worldId, foundryUrl, reporter });
  }

  await joinWorldSession(page, { userLabel: 'Gamemaster', reporter });
  await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
    timeout: 120_000,
  });
  await clearBlockingOverlays(page);

  const active = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
  if (!active) {
    log('Fabricate module not active; enabling it and reloading...\n');
    await page.evaluate(async () => {
      const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
      moduleSettings.fabricate = true;
      await game.settings.set('core', 'moduleConfiguration', moduleSettings);
    });
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    await joinWorldSession(page, { userLabel: 'Gamemaster', reporter });
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
      timeout: 120_000,
    });
  }

  await page.waitForFunction(() => game.modules.get('fabricate')?.active === true, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(() => globalThis.game?.fabricate?.ready === true, null, {
    timeout: 60_000,
  });
}

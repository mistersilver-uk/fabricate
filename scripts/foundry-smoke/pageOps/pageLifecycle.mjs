/**
 * Page primitives the whole walk shares: overlay and notification handling, window sizing and
 * settle waits, manager pointer targets, application close sweeps, scene activation and the
 * console capture. `attachConsoleCapture` takes its three sinks as an argument so it is drivable
 * from a test.
 */

import { classifyCapturedError } from '../../lib/foundrySmokeSignal.js';
import { isCanvasReadyForScene } from '../../lib/foundryCanvasReadiness.js';
import { railSelector } from '../../lib/managerRailEntries.js';
import {
  CORE_TOUR_IDS,
  TOUR_PROGRESS_STORAGE_KEY,
  SUPPRESSED_STEP_INDEX,
} from '../../lib/foundryTourSuppression.js';

/** Normalize text for stable UI matching. */
export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Name whatever modal is currently covering the interface, or return null when nothing is. */
export async function describeBlockingOverlay(page) {
  try {
    return await page.evaluate(() => {
      const activeTour = globalThis.foundry?.nue?.Tour?.activeTour;
      if (activeTour) return `a Foundry NUE tour ("${activeTour.title ?? activeTour.id ?? 'unknown'}")`;
      const dialog = document.querySelector('dialog[open], .application.dialog, #client-settings');
      if (dialog) {
        const label = dialog.getAttribute('aria-label') || dialog.querySelector('.window-title')?.textContent;
        return `a modal dialog${label ? ` ("${label.trim()}")` : ''}`;
      }
      if (document.querySelector('#pause:not(.paused)') === null && globalThis.game?.paused) {
        return 'the Game Paused overlay';
      }
      return null;
    });
  } catch {
    // The page may be gone; a diagnostic must never mask the original failure.
    return null;
  }
}

/** Stop Foundry's New User Experience tours ever starting, for the whole browser context. */
export async function suppressFoundryTours(context) {
  // The body is inlined rather than passed by reference because `addInitScript` serializes the
  // function to run in the page, where this module's imports do not exist.
  await context.addInitScript(
    ({ key, tourIds, stepIndex }) => {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        const base = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        const core =
          base.core && typeof base.core === 'object' && !Array.isArray(base.core)
            ? { ...base.core }
            : {};
        // Merge, never lower: a tour the run legitimately advanced keeps its real progress.
        for (const id of tourIds) if (typeof core[id] !== 'number') core[id] = stepIndex;
        window.localStorage.setItem(key, JSON.stringify({ ...base, core }));
      } catch {
        // A malformed or unavailable localStorage must not stop the run booting; the
        // reactive Tour.activeTour.exit() calls remain as defence in depth.
      }
    },
    {
      key: TOUR_PROGRESS_STORAGE_KEY,
      tourIds: [...CORE_TOUR_IDS],
      stepIndex: SUPPRESSED_STEP_INDEX,
    }
  );
}

/**
 * Race a promise against a deadline. Used to surface page.evaluate hangs as
 * thrown errors (with context) rather than silent waits that consume the
 * job timeout. Discovered cause for an earlier 13-minute Phase D0 hang
 * in CI: a page.evaluate after a viewport resize was waiting indefinitely
 * for the page's JS thread, with no timeout of its own. The script-level
 * deadline guarantees we get a useful error and a `screenshot-failure.png`
 * instead of a cancelled job.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
export function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Operation '${label}' exceeded ${ms}ms deadline`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Wait until an in-page `predicate` returns truthy, polling on animation frames so a settled layout
 * is detected as soon as it quiesces instead of always paying a fixed wait (R4, #750).
 */
export async function waitForSettled(page, predicate, arg, { timeout = 1500, fallbackMs = 500 } = {}) {
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 'raf' });
  } catch {
    await page.waitForTimeout(fallbackMs);
  }
}

/**
 * Settle the Crafting System Manager frame after a resize: wait for the app's measured geometry to
 * reach the requested size and hold steady across a few animation frames, then return.
 */
export async function waitForManagerGeometrySettled(page, { timeout = 1500, fallbackMs = 500 } = {}) {
  await page.evaluate(() => { delete window.__fabGeomSettle; }).catch(() => {});
  await waitForSettled(page, () => {
    const manager = document.querySelector('.fabricate-manager');
    const app = manager?.closest('.application, .app') || document.querySelector('#fabricate-crafting-system-manager');
    if (!app) return false;
    const outer = app.getBoundingClientRect();
    const product = manager.getBoundingClientRect();
    const state = window.__fabGeomSettle || { sig: null, stable: 0 };
    const sig = [
      window.innerWidth,
      window.innerHeight,
      Math.round(outer.left),
      Math.round(outer.top),
      Math.round(outer.width),
      Math.round(outer.height),
      Math.round(product.left),
      Math.round(product.top),
      Math.round(product.width),
      Math.round(product.height),
    ].join(':');
    if (state.sig === sig) state.stable += 1; else { state.sig = sig; state.stable = 0; }
    window.__fabGeomSettle = state;
    return state.stable >= 4; // ~4 steady RAF samples ≈ 65ms of quiescence.
  }, undefined, { timeout, fallbackMs });
  return page.evaluate(() => {
    const manager = document.querySelector('.fabricate-manager');
    const app = manager?.closest('.application, .app') || document.querySelector('#fabricate-crafting-system-manager');
    if (!manager || !app) throw new Error('Crafting System Manager geometry is unavailable');
    const rectangle = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    };
    return {
      browser: { width: window.innerWidth, height: window.innerHeight },
      outer: rectangle(app),
      product: rectangle(manager),
    };
  });
}

/**
 * Settle the manager after an in-frame navigation (system-identity click, return-to-library,
 * scope-select) that re-renders the nav rail.
 */
export async function settleManagerNav(page, { timeout = 2000, fallbackMs = 750 } = {}) {
  await page.evaluate(() => { delete window.__fabNavSettle; }).catch(() => {});
  await waitForSettled(page, () => {
    const manager = document.querySelector('.fabricate-manager');
    if (!manager) return false;
    const navCount = manager.querySelectorAll('.manager-nav-label').length;
    if (navCount === 0) return false;
    const rect = manager.getBoundingClientRect();
    const sig = `${Math.round(rect.width)}x${Math.round(rect.height)}:${navCount}`;
    const state = window.__fabNavSettle || { sig: null, stable: 0 };
    if (state.sig === sig) state.stable += 1; else { state.sig = sig; state.stable = 0; }
    window.__fabNavSettle = state;
    return state.stable >= 6; // ~6 steady RAF samples ≈ 100ms of quiescence.
  }, undefined, { timeout, fallbackMs });
}

export async function waitForManagerApplicationRendered(page) {
  const outerSelector = '#fabricate-crafting-system-manager';
  const resolveRegisteredManager = (selector) => {
    const renderedOuters = Array.from(document.querySelectorAll(selector))
      .filter((element) => element?.isConnected);
    const renderedManagers = renderedOuters
      .map((element) => element.querySelector('.fabricate-manager'))
      .filter((element) => element?.isConnected);
    if (renderedOuters.length !== 1 || renderedManagers.length !== 1) {
      throw new Error(
        'Crafting System Manager DOM resolution was not unique: '
        + JSON.stringify({
          renderedOuterCount: renderedOuters.length,
          renderedManagerCount: renderedManagers.length,
        })
      );
    }
    const renderedOuter = renderedOuters[0];
    const renderedManager = renderedManagers[0];
    const explicitApp = globalThis.__fabricateSmokeManagerApp ?? null;
    const instances = foundry?.applications?.instances;
    const registeredApps = instances?.values
      ? Array.from(instances.values())
      : (instances ? Array.from(instances) : []);
    const uniqueApps = Array.from(
      new Set([explicitApp, ...registeredApps].filter(Boolean))
    );
    const applicationCandidates = uniqueApps.map((app, index) => {
      const rawElement = app?.element ?? app?._element ?? null;
      const element = rawElement?.[0] ?? rawElement;
      const manager = element?.matches?.('.fabricate-manager')
        ? element
        : element?.querySelector?.('.fabricate-manager')
          ?? element?.closest?.('.fabricate-manager');
      const ownsManager = Boolean(
        manager?.isConnected
        && (
          element === manager
          || element?.contains?.(manager)
          || manager?.contains?.(element)
        )
      );
      const ownsRenderedManager = Boolean(
        element === renderedOuter
        || element === renderedManager
        || element?.contains?.(renderedManager)
        || renderedManager?.contains?.(element)
      );
      return {
        app,
        index,
        source: app === explicitApp ? 'explicit' : 'registry',
        appType: app?.constructor?.name ?? typeof app,
        appRendered: app?.rendered ?? null,
        elementType: element?.constructor?.name ?? typeof element,
        elementId: element?.id ?? null,
        elementConnected: Boolean(element?.isConnected),
        elementHasStyle: Boolean(element?.style),
        managerConnected: Boolean(manager?.isConnected),
        ownsManager,
        ownsRenderedManager,
        liveMatch: Boolean(
          element?.isConnected
          && element?.style
          && manager?.isConnected
          && ownsManager
          && ownsRenderedManager
        ),
      };
    });
    const liveMatches = applicationCandidates.filter((candidate) => candidate.liveMatch);
    if (liveMatches.length !== 1) {
      const diagnostics = applicationCandidates.map(({ app: _app, ...candidate }) => candidate);
      throw new Error(
        `Crafting System Manager application resolution found ${liveMatches.length} owners `
        + 'for the connected Manager DOM: '
        + JSON.stringify({
          renderedOuterCount: renderedOuters.length,
          renderedManagerCount: renderedManagers.length,
          applicationCandidates: diagnostics,
        })
      );
    }
    globalThis.__fabricateSmokeManagerApp = liveMatches[0].app;
    const { app: _app, ...selected } = liveMatches[0];
    return selected;
  };
  const inspectReadiness = (diagnostic = false) => {
    const app = globalThis.__fabricateSmokeManagerApp;
    const rawElement = app?.element ?? app?._element ?? null;
    const appElement = rawElement?.[0] ?? rawElement;
    const manager = appElement?.matches?.('.fabricate-manager')
      ? appElement
      : appElement?.querySelector?.('.fabricate-manager')
        ?? appElement?.closest?.('.fabricate-manager');
    const report = {
      ready: Boolean(appElement?.isConnected && appElement?.style && manager?.isConnected),
      appRendered: app?.rendered ?? null,
      elementType: appElement?.constructor?.name ?? typeof appElement,
      elementId: appElement?.id ?? null,
      elementConnected: Boolean(appElement?.isConnected),
      elementHasStyle: Boolean(appElement?.style),
      managerConnected: Boolean(manager?.isConnected),
      selectorManagerConnected: Boolean(
        document.querySelector('#fabricate-crafting-system-manager .fabricate-manager')?.isConnected
      ),
    };
    if (diagnostic || report.ready) return report;
    return false;
  };
  try {
    await page.locator(outerSelector).waitFor({ state: 'attached', timeout: 15_000 });
    await page.locator(`${outerSelector} .fabricate-manager`).waitFor({
      state: 'attached',
      timeout: 15_000,
    });
    await page.evaluate(resolveRegisteredManager, outerSelector);
    await page.waitForFunction(inspectReadiness, false, { timeout: 15_000, polling: 'raf' });
  } catch (error) {
    const readiness = await page.evaluate(inspectReadiness, true).catch((diagnosticError) => ({
      diagnosticError: diagnosticError.message,
    }));
    const causeMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Crafting System Manager ApplicationV2 render readiness failed (${causeMessage}): `
      + JSON.stringify(readiness),
      { cause: error }
    );
  }
}

/**
 * Resize the rendered Crafting System Manager application frame for
 * responsive screenshots and hit testing.
 *
 * A supplied source viewport is exact screenshot evidence; ordinary manager
 * callers retain the roomy shared viewport. The outer frame is always resized
 * through the live ApplicationV2 instance, then the browser, outer frame, and
 * inner product rectangles are measured after they settle. Foundry V13 may
 * clamp the requested outer height to the exact browser viewport.
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number, sourceViewport?: {width: number, height: number} }} size
 */
export async function setManagerWindowSize(page, { width, height, sourceViewport = null }) {
  const viewport = sourceViewport || {
    width: Math.max(1366, width + 80),
    height: Math.max(768, height + 80),
  };

  await withDeadline(
    page.setViewportSize(viewport),
    15_000,
    `setViewportSize ${width}x${height}`
  );
  await waitForManagerApplicationRendered(page);
  await withDeadline(
    page.evaluate(async ({ width, height, viewport }) => {
      const app = globalThis.__fabricateSmokeManagerApp;
      if (!app || typeof app.setPosition !== 'function') {
        throw new Error('Live Crafting System Manager ApplicationV2 instance has no setPosition');
      }
      await app.setPosition({
        width,
        height,
        left: Math.max(0, Math.round((viewport.width - width) / 2)),
        top: 0,
      });
    }, { width, height, viewport }),
    15_000,
    `setManagerWindowSize evaluate ${width}x${height}`
  );
  const geometry = await waitForManagerGeometrySettled(page, { timeout: 1500, fallbackMs: 500 });
  if (geometry.browser.width !== viewport.width || geometry.browser.height !== viewport.height) {
    throw new Error(`Manager source viewport drifted: ${JSON.stringify({ expected: viewport, actual: geometry.browser })}`);
  }
  if (
    geometry.outer.left < 0
    || geometry.outer.top < 0
    || geometry.outer.right > geometry.browser.width
    || geometry.outer.bottom > geometry.browser.height
  ) {
    throw new Error(`ApplicationV2 outer rectangle escapes the browser viewport: ${JSON.stringify(geometry)}`);
  }
  if (
    geometry.product.left < geometry.outer.left
    || geometry.product.top < geometry.outer.top
    || geometry.product.right > geometry.outer.right
    || geometry.product.bottom > geometry.outer.bottom
  ) {
    throw new Error(`Tool Studio product rectangle escapes the ApplicationV2 frame: ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

/** Click a target only if it is present, swallowing transient failures. */
export async function softClick(locator, options = {}) {
  if (await locator.count() === 0) return;
  await locator.first().click(options).catch(() => {});
}

export async function assertPointerTarget(page, locator, targetSelector, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No pointer box found for ${label}`);
  const hit = await page.evaluate(({ x, y, targetSelector }) => {
    const element = document.elementFromPoint(x, y);
    return {
      matched: Boolean(element?.closest?.(targetSelector)),
      tag: element?.tagName || 'none',
      className: String(element?.className || ''),
    };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, targetSelector });
  if (!hit.matched) {
    throw new Error(`${label} pointer missed ${targetSelector}; hit ${hit.tag} ${hit.className}`);
  }
}

export function managerSystemRowSelector(systemId) {
  return `.fabricate-manager .manager-system-row[data-system-id="${systemId}"]`;
}

/** Exercise manager pointer targets without triggering destructive actions. */
export async function exerciseManagerPointerTargets(page, systemId) {
  const search = page.locator('.fabricate-manager input[type="search"]').first();
  await search.fill('forge');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('all');

  await page.locator(`${managerSystemRowSelector(systemId)} .manager-system-identity`).first().click();
  // Breadcrumb / scope / header pointer targets only exist in certain navigation states (e.g.
  // inside a system sub-view).
  await softClick(page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("The Herbalist")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-scope-return'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Import")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Export")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create")'), { trial: true });
  const rowActionButtons = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`);
  for (let index = 0; index < await rowActionButtons.count(); index += 1) {
    await rowActionButtons.nth(index).click({ trial: true });
  }
}

/** Select the smoke test crafting system in Manager. */
export async function selectSmokeSystemInManager(page, systemId) {
  const row = page.locator(managerSystemRowSelector(systemId)).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  const alreadySelected = await row.evaluate(element => element.getAttribute('aria-selected') === 'true')
    .catch(() => false);
  if (alreadySelected) return;
  await row.locator('.manager-system-identity').click();
  await settleManagerNav(page);
}

/** Exercise manager system edit controls without saving destructive changes. */
export async function exerciseManagerSystemEditPointerTargets(page, systemId) {
  if (await page.locator('.fabricate-manager #manager-system-name').count() === 0) {
    let editButton = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`).nth(0);
    if (await editButton.count() === 0) {
      const systemsBreadcrumb = page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').first();
      if (await systemsBreadcrumb.count() > 0) {
        await systemsBreadcrumb.click();
        await page.waitForTimeout(500);
      }
      const search = page.locator('.fabricate-manager input[type="search"]').first();
      if (await search.count() > 0) {
        await search.fill('');
        await page.waitForTimeout(250);
      }
      await page.locator(managerSystemRowSelector(systemId)).first().waitFor({ state: 'visible', timeout: 5_000 });
      editButton = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`).nth(0);
    }
    await editButton.click();
  }
  await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.fabricate-manager #manager-system-name').first().fill('The Herbalist');
  await page.locator('.fabricate-manager #manager-system-description').first().fill('A field alchemy system for gathering herbs and brewing reliable remedies.');
  // Note: the recipe-resolution-mode control moved off the system-edit view into the dedicated
  // Crafting Settings section (`data-crafting-resolution-mode-option` in CraftingSettingsView) with
  // the issue-511 Books & Scrolls refactor, so the old `data-system-resolution-mode-option`
  // interaction that lived here is gone.
  await softClick(page.locator('.fabricate-manager [data-edit-control="advanced-options"] input'), { trial: true });
  await softClick(page.locator('.fabricate-manager [data-feature-key="gathering"] input'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to systems")'), { trial: true });
}

/** Exercise manager environment browser pointer targets without mutating environments. */
export async function exerciseManagerEnvironmentPointerTargets(page) {
  await page.locator(railSelector('manager-nav-gathering')).click();
  await page.locator('.fabricate-manager .manager-environment-row').first().waitFor({ state: 'visible', timeout: 5_000 });

  const search = page.locator('.fabricate-manager input[aria-label="Search environments"]').first();
  await search.fill('Azure');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager select[aria-label="Filter environments by status"]').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager select[aria-label="Filter environments by status"]').first().selectOption('all');
  await page.locator('.fabricate-manager select[aria-label="Filter environments by selection mode"]').first().selectOption('targeted');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager select[aria-label="Filter environments by selection mode"]').first().selectOption('all');

  const azureRow = page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove")').first();
  await azureRow.waitFor({ state: 'visible', timeout: 5_000 });
  await azureRow.locator('.manager-environment-identity').click();
  await softClick(azureRow.locator('.manager-status-toggle'), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(0), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(1), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(2), { trial: true });
  // Reordering happens via composition-list drag-and-drop; row no longer has
  // standalone move-up / move-down icon buttons.
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create environment")'), { trial: true });
}

/** Dismiss global Foundry notifications that can cover screenshot targets. */
export async function dismissFoundryNotifications(page) {
  // Notifications are globally hidden via `installNotificationHidingCss()` at world-load, so this
  // helper is largely defensive — kept in case the CSS is bypassed by a Foundry update or an
  // in-test addStyleTag removal.
  await page.evaluate(() => {
    document
      .querySelectorAll('#notifications .notification, body > .notification, .notification')
      .forEach(notification => {
        try { notification.remove(); } catch { /* ignore */ }
      });
  });
}

/**
 * Inject a global stylesheet that hides Foundry's notification toasts so they never overlay
 * screenshots or block clicks. Called once per browser context at world-load.
 */
export async function installNotificationHidingCss(page) {
  await page.addStyleTag({
    content: `
      #notifications,
      body > .notification,
      .notification {
        display: none !important;
      }
    `
  });
}

/**
 * Close Foundry application windows across ApplicationV1 and ApplicationV2.
 * @param {import('playwright').Page} page
 */
/**
 * Wait for every Fabricate window (manager, shared app) and any dirty-draft
 * "Discard Changes" prompt to leave the DOM after a close sweep (R5, #750).
 * Replaces the two blanket 500ms waits per `closeOpenApplications` attempt with
 * an event-driven detach check; the close usually completes well under 500ms.
 * The capped fallback preserves the old fixed pacing if a window is slow to go,
 * so a stuck close degrades to today's timing rather than hanging.
 * @param {import('playwright').Page} page
 * @param {{ timeout?: number, fallbackMs?: number }} [options]
 */
export async function waitForFabricateWindowsClosed(page, { timeout = 800, fallbackMs = 500 } = {}) {
  await waitForSettled(page, () => {
    const windows = document.querySelectorAll([
      '.fabricate-manager',
      '.fabricate-app',
      '.application[id^="fabricate-"]',
      '.window-app[id^="fabricate-"]',
    ].join(', ')).length;
    const hasDiscard = Array.from(document.querySelectorAll('button'))
      .some(button => /Discard Changes/.test(button.textContent || ''));
    return windows === 0 && !hasDiscard;
  }, undefined, { timeout, fallbackMs });
}

export async function closeOpenApplications(page) {
  const closeSelector = [
    '.application:not(#sidebar) button[data-action="close"]',
    '.application:not(#sidebar) button[aria-label="Close"]',
    '.application:not(#sidebar) button[title="Close"]',
    '.application:not(#sidebar) .header-button.close',
    '.application:not(#sidebar) .window-header .close',
    '.app.window-app .close',
    '#fabricate-recipe-manager button[data-action="close"]',
    '#fabricate-crafting-system-manager button[data-action="close"]',
    '#fabricate-app button[data-action="close"]'
  ].join(', ');

  async function discardDirtyDraft() {
    const discardButton = page.locator('button:has-text("Discard Changes")').first();
    if (await discardButton.count() > 0) {
      try {
        await discardButton.click({ timeout: 2_000, force: true });
        await page.waitForTimeout(500);
      } catch { /* ignore */ }
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await discardDirtyDraft();
    await page.evaluate(async (selector) => {
      const closePromises = [];

      if (ui.windows) {
        for (const app of Object.values(ui.windows)) {
          try { closePromises.push(Promise.resolve(app.close())); } catch { /* ignore */ }
        }
      }

      const instances = foundry?.applications?.instances;
      const applicationV2s = instances?.values
        ? Array.from(instances.values())
        : (instances ? Array.from(instances) : []);
      for (const app of applicationV2s) {
        const element = app?.element ?? app?._element ?? null;
        if (!element || element.id === 'sidebar') continue;
        if (element.querySelector?.('.fabricate-manager, .fabricate-app') || element.id?.startsWith?.('fabricate-')) {
          try {
            closePromises.push(Promise.resolve(app.close({ force: true })));
          } catch { /* ignore */ }
        }
      }

      await Promise.allSettled(closePromises);

      // ApplicationV2 registries can retain a stale instance after its close promise settles.
      document.querySelectorAll(selector).forEach(btn => {
        try { btn.click(); } catch { /* ignore */ }
      });
    }, closeSelector);
    await waitForFabricateWindowsClosed(page);
    await discardDirtyDraft();

    const closeButtons = page.locator(closeSelector);
    for (let i = 0; i < await closeButtons.count(); i++) {
      try { await closeButtons.nth(i).click({ timeout: 1_000, force: true }); } catch { /* ignore */ }
    }
    await waitForFabricateWindowsClosed(page);
    await discardDirtyDraft();

    const remaining = await page.locator([
      '.fabricate-manager',
      '.fabricate-app',
      '.application[id^="fabricate-"]',
      '.window-app[id^="fabricate-"]',
      'button:has-text("Discard Changes")',
    ].join(', ')).count();
    if (remaining === 0) break;
  }

  const remaining = page.locator([
    '.fabricate-manager',
    '.fabricate-app',
    '.application[id^="fabricate-"]',
    '.window-app[id^="fabricate-"]',
    'button:has-text("Discard Changes")',
  ].join(', '));
  if (await remaining.count() > 0) {
    const ids = await remaining.evaluateAll(elements => elements.map(element => (
      element.id || element.closest?.('[id]')?.id || element.tagName
    )));
    throw new Error(`Failed to close Fabricate application(s): ${ids.join(', ')}.`);
  }
}

/** Activate a scene and wait until the canvas has finished drawing it. */
export async function activateSceneAndAwaitCanvasReady(page, sceneId, { timeout = 90_000 } = {}) {
  if (!sceneId) return;
  await page.evaluate(async (id) => {
    const scene = game.scenes.get(id);
    if (scene && !scene.active) await scene.activate();
  }, sceneId).catch(() => {});
  await page.waitForFunction(isCanvasReadyForScene, sceneId, { timeout }).catch(err => {
    // Name the REASON, not just the fact. A timeout and a destroyed execution context both land
    // here and mean different things, and the previous message asserted "timeout" for both.
    process.stderr.write(
      `Canvas never reported ready for scene ${sceneId} (waited up to ${timeout}ms): ` +
      `${err?.message?.split('\n')[0] ?? err}. Continuing against a possibly undrawn canvas.\n`
    );
  });
}

/** Attach browser console capture to a Playwright page. */
export function attachConsoleCapture(page, ignoredErrorPatterns, sinks) {
  const { consoleErrors, waivedConsoleErrors, consoleLog } = sinks;
  page.on('console', msg => {
    // Browser "Failed to load resource" console errors carry no URL in their text; the resource
    // path lives in msg.location().
    const location = msg.type() === 'error' ? (msg.location()?.url || '') : '';
    const text = location ? `${msg.text()} (${location})` : msg.text();
    consoleLog.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      // Route through the SHARED classifier (the same seam the pageerror handler
      // below uses): a match against the waiver patterns (in-source defaults +
      // any appended via --allowed-console-error-patterns) is recorded as waived
      // for audit only; anything else enters the gating consoleErrors list.
      if (classifyCapturedError(text, ignoredErrorPatterns).waived) {
        waivedConsoleErrors.push(text);
      } else {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', err => {
    const entry = `[pageerror] ${err.message}`;
    consoleLog.push(entry);
    // The stack goes to the diagnostic log only, never to consoleErrors — the gate matches its
    // waiver patterns against the message, and widening what it sees would change which runs fail.
    if (err.stack) consoleLog.push(`[pageerror-stack] ${err.stack}`);
    // Pageerror waiving is a deliberate existing capability (the Foundry canvas-artefact default
    // filters pageerror entries too); an appended pattern extends it, it does not remove it.
    if (classifyCapturedError(err.message, ignoredErrorPatterns).waived) {
      waivedConsoleErrors.push(`pageerror: ${err.message}`);
    } else {
      consoleErrors.push(`pageerror: ${err.message}`);
    }
  });

  // Diagnostic only: a console 'error' is logged for failed resource loads but is not always paired
  // with a usable URL.
  page.on('response', response => {
    const status = response.status();
    if (status >= 400) {
      consoleLog.push(`[response ${status}] ${response.url()}`);
    }
  });

  page.on('requestfailed', request => {
    const failure = request.failure();
    consoleLog.push(`[requestfailed ${failure?.errorText || 'unknown'}] ${request.url()}`);
  });
}

export async function assertNoScreenshotOverlays(page, options = {}) {
  await dismissFoundryNotifications(page);
  // A DialogV2 close() is an async fade-out: Foundry keeps the element in the DOM with a
  // `minimizing` (and, on some builds, `minimized`) class while it animates away.
  const OVERLAY_SELECTOR =
    '.dialog.application, .window-app.dialog, .application.dialog, .app.dialog, #notifications .notification';
  const visibleOverlayCount = async () =>
    page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).filter((el) => {
        const style = globalThis.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length;
    }, OVERLAY_SELECTOR);
  const blockingOverlayCount = async () =>
    page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).filter(
        (el) => !el.classList.contains('minimizing') && !el.classList.contains('minimized')
      ).length;
    }, OVERLAY_SELECTOR);

  let visibleCount = await visibleOverlayCount();
  if (visibleCount > 0) {
    await page.waitForTimeout(750);
    await dismissFoundryNotifications(page);
    visibleCount = await visibleOverlayCount();
  }
  if (visibleCount > 0) {
    await page.waitForFunction((selector) => {
      return Array.from(document.querySelectorAll(selector)).every((el) => {
        const style = globalThis.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        const rect = el.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0;
      });
    }, OVERLAY_SELECTOR, { timeout: 2_500 }).catch(() => {});
    await dismissFoundryNotifications(page);
    visibleCount = await visibleOverlayCount();
  }
  if (visibleCount > 0) {
    const diag = await page
      .evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map((el) => `${el.tagName}#${el.id}.${el.className} :: ${(el.textContent || '').trim().slice(0, 120)}`)
          .join(' || ');
      }, OVERLAY_SELECTOR)
      .catch(() => '');
    throw new Error(`Screenshot target still has ${visibleCount} visible modal or notification overlay(s). [${diag}]`);
  }

  let count = await blockingOverlayCount();
  if (count > 0) {
    // Give any in-flight close animation a moment, then re-check, before failing.
    await page.waitForTimeout(750);
    await dismissFoundryNotifications(page);
    count = await blockingOverlayCount();
  }
  if (count > 0) {
    const diag = await page
      .evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .filter((el) => !el.classList.contains('minimizing') && !el.classList.contains('minimized'))
          .map((el) => `${el.tagName}#${el.id}.${el.className} :: ${(el.textContent || '').trim().slice(0, 120)}`)
          .join(' || ');
      }, OVERLAY_SELECTOR)
      .catch(() => '');
    throw new Error(`Screenshot target is covered by ${count} modal or notification overlay(s). [${diag}]`);
  }
  // Opt-in bleed-through guard: when the caller passes the set of Fabricate window ids it expects
  // to be open for this capture, fail on any other visible Fabricate-owned window.
  const allowedIds = options?.allowFabricateWindowIds;
  if (Array.isArray(allowedIds)) {
    const allowSet = new Set(allowedIds);
    const visibleFabricateWindows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[id^="fabricate-"]'))
        .filter((el) => {
          if (!el.classList.contains('application') && !el.classList.contains('window-app')) return false;
          const style = globalThis.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => el.id);
    });
    const stray = visibleFabricateWindows.filter((id) => !allowSet.has(id));
    if (stray.length > 0) {
      throw new Error(`Screenshot target has stray Fabricate window(s) bleeding through: ${stray.join(', ')}.`);
    }
  }
}

/**
 * Delete every world document the run seeded. Its body runs in the page, so it lives beside
 * the other in-page primitives rather than in the Node-only cleanup module.
 */
export async function deleteSmokeWorldDocuments(page, cleanupData) {
  await page.evaluate(async (cleanupData) => {
        // Delete recipes
        if (cleanupData.recipeIds.length > 0) {
          const rm = game.fabricate?.getRecipeManager?.();
          if (rm) {
            for (const id of cleanupData.recipeIds) {
              try { await rm.deleteRecipe(id); } catch { /* already deleted */ }
            }
          }
        }

        // Delete crafting system
        if (cleanupData.systemId) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          try { await environmentStore?.cleanupByCraftingSystem?.(cleanupData.systemId); } catch { /* ok */ }

          const csm = game.fabricate?.getCraftingSystemManager?.();
          if (csm) {
            try { await csm.deleteSystem(cleanupData.systemId); } catch { /* already deleted */ }
          }
        }

        // Delete the issue #489 craft-execution coverage systems (and any gather environments/items
        // they own).
        if (Array.isArray(cleanupData.executionSystemIds) && cleanupData.executionSystemIds.length > 0) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          const csm = game.fabricate?.getCraftingSystemManager?.();
          for (const executionSystemId of cleanupData.executionSystemIds) {
            try { await environmentStore?.cleanupByCraftingSystem?.(executionSystemId); } catch { /* ok */ }
            try { await csm?.deleteSystem(executionSystemId); } catch { /* already deleted */ }
          }
        }
        if (Array.isArray(cleanupData.executionItemIds) && cleanupData.executionItemIds.length > 0) {
          try { await Item.deleteDocuments(cleanupData.executionItemIds); } catch { /* ok */ }
        }

        // Delete the dedicated single-purpose systems: the broken one seeded for the
        // overview/banner captures, and the restricted-visibility one seeded for the recipe rail's
        // access branch (issue 643).
        const singlePurposeSystemIds = [
          cleanupData.blockedSystemId,
          cleanupData.restrictedSystemId
        ].filter(Boolean);
        if (singlePurposeSystemIds.length > 0) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          const csm = game.fabricate?.getCraftingSystemManager?.();
          for (const singlePurposeSystemId of singlePurposeSystemIds) {
            try { await environmentStore?.cleanupByCraftingSystem?.(singlePurposeSystemId); } catch { /* ok */ }
            try { await csm?.deleteSystem(singlePurposeSystemId); } catch { /* already deleted */ }
          }
        }

        // Delete actors
        if (cleanupData.actorIds.length > 0) {
          try { await Actor.deleteDocuments(cleanupData.actorIds); } catch { /* ok */ }
        }

        // Delete smoke users after actors so ownership references do not matter.
        if (cleanupData.userIds.length > 0) {
          try { await User.deleteDocuments(cleanupData.userIds); } catch { /* ok */ }
        }

        // Delete world items
        if (cleanupData.itemIds.length > 0) {
          try { await Item.deleteDocuments(cleanupData.itemIds); } catch { /* ok */ }
        }

        // Delete smoke scenes
        if (cleanupData.sceneIds.length > 0) {
          try { await Scene.deleteDocuments(cleanupData.sceneIds); } catch { /* ok */ }
        }
  }, cleanupData);
}

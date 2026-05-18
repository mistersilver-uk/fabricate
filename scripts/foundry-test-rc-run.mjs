/**
 * foundry-test-rc-run.mjs
 *
 * Focused release-candidate smoke test for CI. This intentionally avoids the
 * full visual-regression tour in foundry-test-run.mjs and verifies only the
 * load-bearing RC paths:
 *   - real Foundry boot + world join
 *   - Fabricate module activation/readiness
 *   - minimal fixture creation
 *   - one successful Gathering task
 *   - one successful Healing Potion craft
 *   - runtime console-error health
 */

import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

const FOUNDRY_URL = process.env.FOUNDRY_URL ?? 'http://localhost:30100';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke-ci';

const JOIN_BUTTON_SELECTOR = 'button:has-text("Join Game Session"), button[name="join"]';
const JOIN_USER_SELECT_SELECTOR = 'select[name="userid"]';
const JOIN_USER_TILE_SELECTOR = '[data-user-id]';

/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const consoleLog = [];
/** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
const phaseTimings = [];
let screenshotCounter = 0;

async function timedPhase(name, fn) {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    phaseTimings.push({
      phase: name,
      startedAt,
      durationMs: Math.round(performance.now() - t0)
    });
  }
}

function formatTimingsTable(timings) {
  if (timings.length === 0) return '';
  const rows = timings.map(({ phase, durationMs }) => ({
    phase,
    seconds: (durationMs / 1000).toFixed(1)
  }));
  const totalMs = timings.reduce((sum, entry) => sum + entry.durationMs, 0);
  rows.push({ phase: 'TOTAL', seconds: (totalMs / 1000).toFixed(1) });
  const phaseWidth = Math.max(...rows.map(row => row.phase.length));
  const secondsWidth = Math.max(...rows.map(row => row.seconds.length));
  return [
    'Phase timings',
    '─'.repeat(phaseWidth + secondsWidth + 5),
    ...rows.map(row => `  ${row.phase.padEnd(phaseWidth)}  ${row.seconds.padStart(secondsWidth)}s`)
  ].join('\n');
}

async function screenshot(page, label) {
  screenshotCounter += 1;
  const num = String(screenshotCounter).padStart(2, '0');
  await page.screenshot({ path: join(RESULTS_DIR, `screenshot-${num}-${label}.png`) });
}

function getPathname(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}

function attachConsoleCapture(page, ignoredErrorPatterns = []) {
  page.on('console', msg => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    consoleLog.push(entry);
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!ignoredErrorPatterns.some(pattern => pattern.test(text))) {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    const entry = `[pageerror] ${err.message}`;
    consoleLog.push(entry);
    if (!ignoredErrorPatterns.some(pattern => pattern.test(err.message))) {
      consoleErrors.push(`pageerror: ${err.message}`);
    }
  });
}

async function installNotificationHidingCss(page) {
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

async function dismissFoundryNotifications(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('#notifications .notification, body > .notification, .notification')
      .forEach(notification => {
        try { notification.remove(); } catch { /* ignore */ }
      });
  });
}

async function acceptLicenseIfPresent(page, results) {
  if (getPathname(page.url()) !== '/license') {
    results.steps.push({ step: 'license-check', passed: true, skipped: true });
    return;
  }

  process.stdout.write('License agreement detected. Accepting terms...\n');
  const checkbox = page.locator('input[name="agree"], input[id*="agree" i], input[type="checkbox"]').first();
  await checkbox.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await checkbox.isChecked())) await checkbox.check();

  const agreeButton = page.locator('button:has-text("AGREE"), button:has-text("Agree"), button:has-text("I Agree")').first();
  await agreeButton.waitFor({ state: 'visible', timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/(setup|auth)(?:\?.*)?$/, { timeout: 60_000 }),
    agreeButton.click()
  ]);
  results.steps.push({ step: 'license-accepted', passed: true });
}

async function authenticateIfRequired(page, results) {
  if (getPathname(page.url()) !== '/auth') return;

  process.stdout.write('Admin auth page detected. Entering admin key...\n');
  const adminInput = page.locator('input[name="adminKey"], input[name="password"], input[type="password"]').first();
  await adminInput.waitFor({ state: 'visible', timeout: 10_000 });
  await adminInput.fill(ADMIN_KEY);
  const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Log In")').first();
  await Promise.all([
    page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 60_000 }),
    submitBtn.click()
  ]);
  results.steps.push({ step: 'admin-auth-page', passed: true });
}

async function dismissFirstRunDialogs(page, results) {
  try {
    const declineSharing = page.locator('button:has-text("Decline Sharing")');
    await declineSharing.waitFor({ state: 'visible', timeout: 10_000 });
    process.stdout.write('Telemetry dialog detected. Declining...\n');
    await declineSharing.click();
    await declineSharing.waitFor({ state: 'hidden', timeout: 5_000 });
    results.steps.push({ step: 'dismiss-telemetry', passed: true });
  } catch {
    // Not shown.
  }

  try {
    const dismissed = await page.evaluate(() => {
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) {
        tour.activeTour.exit();
        return true;
      }
      return false;
    });
    if (dismissed) results.steps.push({ step: 'dismiss-tour', passed: true });
  } catch {
    // No active tour.
  }
}

async function waitForJoinUi(page, userLabel) {
  await page.locator(JOIN_BUTTON_SELECTOR).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(({ selectSelector, tileSelector, targetLabel }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const matchTarget = value => {
      const normalized = normalize(value);
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    };

    const select = Array.from(document.querySelectorAll(selectSelector))
      .filter(node => node instanceof HTMLSelectElement)
      .find(isVisible);
    if (select) {
      return Array.from(select.options).some(option => option.value && !option.disabled && matchTarget(option.textContent));
    }

    return Array.from(document.querySelectorAll(tileSelector)).filter(isVisible).some(tile => {
      const label = tile.getAttribute('data-user-name') || tile.getAttribute('aria-label') || tile.textContent || '';
      return matchTarget(label);
    });
  }, { selectSelector: JOIN_USER_SELECT_SELECTOR, tileSelector: JOIN_USER_TILE_SELECTOR, targetLabel: userLabel }, { timeout: 15_000 });
}

async function selectJoinUser(page, userLabel) {
  return page.evaluate(({ selectSelector, tileSelector, targetLabel }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const matchTarget = value => {
      const normalized = normalize(value);
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    };

    const select = Array.from(document.querySelectorAll(selectSelector))
      .filter(node => node instanceof HTMLSelectElement)
      .find(isVisible);
    if (select) {
      const option = Array.from(select.options).find(candidate =>
        candidate.value && !candidate.disabled && matchTarget(candidate.textContent)
      );
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const tile = Array.from(document.querySelectorAll(tileSelector)).filter(isVisible).find(candidate => {
      const label = candidate.getAttribute('data-user-name') || candidate.getAttribute('aria-label') || candidate.textContent || '';
      return matchTarget(label);
    });
    if (!tile) return false;
    tile.click();
    return true;
  }, { selectSelector: JOIN_USER_SELECT_SELECTOR, tileSelector: JOIN_USER_TILE_SELECTOR, targetLabel: userLabel });
}

async function joinWorldSession(page, results, userLabel = 'Gamemaster') {
  if (getPathname(page.url()) !== '/join') return;

  process.stdout.write(`Join page detected. Joining as ${userLabel}...\n`);
  await waitForJoinUi(page, userLabel);
  let selected = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    selected = await selectJoinUser(page, userLabel);
    if (selected) break;
    await page.waitForTimeout(250 * attempt);
  }
  if (!selected) throw new Error(`Unable to select join user "${userLabel}".`);

  const joinButton = page.locator(JOIN_BUTTON_SELECTOR).first();
  await joinButton.waitFor({ state: 'visible', timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/game/, { timeout: 60_000, waitUntil: 'load' }),
    joinButton.click()
  ]);
  results.steps.push({ step: `join-session-${userLabel}`, passed: true });
}

async function launchAndJoinWorld(page, results) {
  await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 60_000 });
  results.steps.push({ step: 'navigate-setup', passed: true });
  await acceptLicenseIfPresent(page, results);
  await authenticateIfRequired(page, results);

  const postAuthPath = getPathname(page.url());
  const worldAlreadyRunning = postAuthPath === '/join' || postAuthPath === '/game';

  if (!worldAlreadyRunning) {
    await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 15_000 });
    await dismissFirstRunDialogs(page, results);
    await page.evaluate(() => document.querySelector('#setup-packages-header [data-tab="worlds"]')?.click());
    await page.locator(`[data-package-id="${WORLD_ID}"]`).first().waitFor({ state: 'visible', timeout: 15_000 });
    const worldCard = page.locator(`[data-package-id="${WORLD_ID}"]`);
    await worldCard.hover();
    const launchBtn = worldCard.locator('[data-action="worldLaunch"]');
    await launchBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await launchBtn.click();
    try {
      await page.waitForURL(/\/(join|game)/, { timeout: 120_000 });
    } catch (err) {
      if (!String(err?.message ?? '').includes('ERR_CONNECTION_REFUSED')) throw err;
      await page.waitForTimeout(2_000);
      await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForURL(/\/(join|game)/, { timeout: 60_000 });
    }
    results.steps.push({ step: 'launch-world', passed: true });
  } else {
    results.steps.push({ step: 'launch-world', passed: true, skipped: true });
  }

  await joinWorldSession(page, results, 'Gamemaster');
  await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });
  await installNotificationHidingCss(page);
  await screenshot(page, 'world-loaded');
}

async function ensureFabricateReady(page, results) {
  const fabricateActive = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
  if (!fabricateActive) {
    process.stdout.write('Fabricate module not active. Activating via module configuration...\n');
    await page.evaluate(async () => {
      const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
      moduleSettings.fabricate = true;
      await game.settings.set('core', 'moduleConfiguration', moduleSettings);
    });
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    await joinWorldSession(page, results, 'Gamemaster');
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });
    await installNotificationHidingCss(page);
  }

  await page.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });
  await page.evaluate(() => {
    if (game.paused) game.togglePause(false);
    const tour = globalThis.foundry?.nue?.Tour;
    if (tour?.activeTour) tour.activeTour.exit();
  });
  results.steps.push({ step: 'fabricate-ready', passed: true });
}

async function closeOpenApplications(page) {
  await page.evaluate(async () => {
    const closePromises = [];
    if (ui.windows) {
      for (const app of Object.values(ui.windows)) {
        if (app?.id === 'sidebar') continue;
        try { closePromises.push(Promise.resolve(app.close())); } catch { /* ignore */ }
      }
    }
    const instances = foundry?.applications?.instances;
    const apps = instances?.values ? Array.from(instances.values()) : [];
    for (const app of apps) {
      const element = app?.element ?? app?._element ?? null;
      if (!element || element.id === 'sidebar') continue;
      try { closePromises.push(Promise.resolve(app.close({ force: true }))); } catch { /* ignore */ }
    }
    await Promise.allSettled(closePromises);
  });
  await page.waitForTimeout(250);
}

async function createFixtures(page, results) {
  const fixtures = await page.evaluate(async () => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();

    for (const system of csm.getSystems().filter(candidate => candidate.name === 'Arcane Forge')) {
      try { await environmentStore?.cleanupByCraftingSystem?.(system.id); } catch { /* ignore */ }
      for (const recipe of rm.getRecipesForSystem?.(system.id) ?? []) {
        try { await rm.deleteRecipe(recipe.id); } catch { /* ignore */ }
      }
      try { await csm.deleteSystem(system.id); } catch { /* ignore */ }
    }

    const actorNames = ['Alara the Alchemist'];
    const staleActors = game.actors.contents.filter(actor => actorNames.includes(actor.name));
    if (staleActors.length > 0) await Actor.deleteDocuments(staleActors.map(actor => actor.id));

    const itemNames = ['Mystic Herb', 'Empty Vial', 'Healing Potion'];
    const staleItems = game.items.contents.filter(item => itemNames.includes(item.name));
    if (staleItems.length > 0) await Item.deleteDocuments(staleItems.map(item => item.id));

    const itemTypes = Array.from(game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? game.system?.template?.Item?.types ?? []);
    const actorTypes = Array.from(game.documentTypes?.Actor ?? game.system?.documentTypes?.Actor ?? game.system?.template?.Actor?.types ?? []);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';
    const actorType = actorTypes.includes('character') ? 'character' : actorTypes[0] || 'character';

    const items = await Item.createDocuments([
      { name: 'Mystic Herb', type: itemType, img: 'icons/consumables/plants/leaf-herb-green.webp' },
      { name: 'Empty Vial', type: itemType, img: 'icons/consumables/potions/vial-cork-empty.webp' },
      { name: 'Healing Potion', type: itemType, img: 'icons/consumables/potions/potion-tube-corked-red.webp' }
    ]);
    const byName = name => {
      const item = items.find(candidate => candidate.name === name);
      if (!item) throw new Error(`Item ${name} was not created.`);
      return item;
    };

    const [alara] = await Actor.createDocuments([
      { name: 'Alara the Alchemist', type: actorType, img: 'icons/svg/mystery-man.svg' }
    ]);

    const copy = item => ({
      name: item.name,
      type: item.type,
      img: item.img,
      flags: { core: { sourceId: item.uuid } }
    });
    await alara.createEmbeddedDocuments('Item', [
      copy(byName('Mystic Herb')),
      copy(byName('Mystic Herb')),
      copy(byName('Empty Vial'))
    ]);

    const system = await csm.createSystem({
      name: 'Arcane Forge',
      description: 'Minimal release-candidate fixture for Fabricate smoke testing.',
      features: { essences: false, gathering: true }
    });

    const componentMap = {};
    for (const item of items) {
      const result = await csm.addItemFromUuid(system.id, item.uuid);
      componentMap[item.name] = result.item.id;
    }
    for (const componentId of Object.values(componentMap)) {
      await csm.updateItem(system.id, componentId, { difficulty: 1 });
    }
    await csm.updateSystem(system.id, { features: { essences: false, gathering: true } });

    const recipe = await rm.createRecipe({
      name: 'Brew Healing Potion',
      description: 'Combine mystic herbs and an empty vial to create a healing draught.',
      craftingSystemId: system.id,
      img: 'icons/consumables/potions/bottle-round-corked-red.webp',
      ingredientSets: [{
        ingredientGroups: [
          {
            name: 'Mystic Herb',
            options: [{ quantity: 1, match: { type: 'component', componentId: componentMap['Mystic Herb'] } }]
          },
          {
            name: 'Empty Vial',
            options: [{ quantity: 1, match: { type: 'component', componentId: componentMap['Empty Vial'] } }]
          }
        ]
      }],
      resultGroups: [{
        name: 'Brewed Potion',
        results: [{ componentId: componentMap['Healing Potion'], quantity: 1 }]
      }]
    });

    const environment = await environmentStore.create({
      craftingSystemId: system.id,
      name: 'Verdant Meadow',
      description: 'A clear player-facing gathering site with an immediate successful task.',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      tasks: [{
        name: 'Gather Meadow Herbs',
        description: 'Collect fresh herbs for a quick brewing session.',
        img: 'icons/consumables/plants/leaf-herb-green.webp',
        enabled: true,
        resolutionMode: 'progressive',
        progressive: { awardMode: 'equal' },
        check: { provider: 'dnd5e', formula: '20', threshold: '10' },
        resultGroups: [{
          name: 'Meadow Herbs',
          results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
        }]
      }]
    });

    return {
      alaraId: alara.id,
      systemId: system.id,
      recipeId: recipe.id,
      environmentId: environment.id,
      itemIds: items.map(item => item.id)
    };
  });

  results.steps.push({ step: 'create-minimal-fixtures', passed: true });
  process.stdout.write(`Created minimal RC fixtures for system ${fixtures.systemId}.\n`);
  return fixtures;
}

async function openGatheringAppFromDirectory(page) {
  await page.locator('#sidebar [data-tab="items"]').first().click({ force: true });
  const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
  await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await gatheringButton.isEnabled())) throw new Error('Gathering directory action is visible but disabled.');
  await gatheringButton.evaluate(button => button.click());
  const app = page.locator('.fabricate-gathering-app').first();
  await app.waitFor({ state: 'visible', timeout: 10_000 });
  return app;
}

async function selectGatheringActor(page, actorName) {
  const actorSelect = page.locator('.fabricate-gathering-app .gathering-v2-actor-card select').first();
  await actorSelect.waitFor({ state: 'visible', timeout: 10_000 });
  await actorSelect.selectOption({ label: actorName });
  await page.locator('.fabricate-gathering-app .gathering-v2-actor-card').filter({ hasText: actorName }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

async function selectGatheringEnvironment(page, environmentName) {
  const environmentTab = page.locator('.fabricate-gathering-app .gathering-v2-tabs button').first();
  if (await environmentTab.count() > 0) await environmentTab.click();
  const search = page.locator('.fabricate-gathering-app input[type="search"]').first();
  if (await search.count() > 0) await search.fill(environmentName);
  const row = page.locator('.gathering-v2-environment-row').filter({ hasText: environmentName }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.click({ force: true });
  await page.evaluate((name) => {
    const applicationValues = [
      ...Object.values(ui.windows || {}),
      ...Array.from(foundry?.applications?.instances?.values?.() || [])
    ];
    for (const app of applicationValues) {
      const store = app?._gatheringStore;
      if (!store?.viewState || !store?.selectEnvironment) continue;
      let state = null;
      const unsubscribe = store.viewState.subscribe(value => { state = value; });
      unsubscribe();
      const environment = (state?.filteredEnvironments || state?.systemFilteredEnvironments || state?.environments || [])
        .find(candidate => candidate?.name === name);
      if (environment?.id) store.selectEnvironment(environment.id);
    }
  }, environmentName);
  await page.locator('.gathering-v2-task-panel').filter({ hasText: environmentName }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

async function runGatheringSuccess(page, results) {
  await closeOpenApplications(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGatheringAppFromDirectory(page);
  await selectGatheringActor(page, 'Alara the Alchemist');
  await selectGatheringEnvironment(page, 'Verdant Meadow');

  const taskRow = page.locator('.gathering-task-row').filter({ hasText: 'Gather Meadow Herbs' }).first();
  await taskRow.waitFor({ state: 'visible', timeout: 10_000 });
  await taskRow.click();
  const startButton = page.locator('.fabricate-gathering-app .gathering-start-button').first();
  await startButton.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissFoundryNotifications(page);
  await screenshot(page, 'gathering-targeted-ready');

  await startButton.click();
  await page.locator('.gathering-feedback-panel.success').first().waitFor({ state: 'visible', timeout: 30_000 });
  const logTab = page.locator('.fabricate-gathering-app .gathering-v2-tabs button').nth(1);
  await logTab.waitFor({ state: 'visible', timeout: 10_000 });
  await logTab.click();
  await page.locator('.gathering-history-row').filter({ hasText: 'Gather Meadow Herbs' }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await dismissFoundryNotifications(page);
  await screenshot(page, 'gathering-immediate-success');

  results.steps.push({ step: 'gathering-success-path', passed: true });
}

async function runCraftSuccess(page, fixtures, results) {
  await closeOpenApplications(page);
  await page.locator('#sidebar [data-tab="items"]').first().click({ force: true });
  await page.locator('button[data-fabricate-action="craft"]').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.querySelector('[data-fabricate-action="craft"]')?.click());
  await page.locator('.crafting-app, [data-appid] .window-title:has-text("Craft")').first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await screenshot(page, 'crafting-app-opened');

  const craftResult = await page.evaluate(async ({ recipeId, alaraId }) => {
    const alara = game.actors.get(alaraId);
    if (!alara) throw new Error(`Actor ${alaraId} not found.`);
    const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
    if (!recipe) throw new Error(`Recipe ${recipeId} not found.`);
    const result = await game.fabricate.craft(alara, recipe, { componentSourceActors: [alara] });
    return {
      success: result.success,
      message: result.message,
      potionInInventory: alara.items.contents.some(item => item.name === 'Healing Potion')
    };
  }, { recipeId: fixtures.recipeId, alaraId: fixtures.alaraId });

  if (!craftResult.success || !craftResult.potionInInventory) {
    throw new Error(`Healing Potion craft failed: ${craftResult.message}`);
  }

  await page.waitForFunction((alaraId) => {
    const alara = game.actors.get(alaraId);
    return alara?.items?.contents?.some(item => item.name === 'Healing Potion') === true;
  }, fixtures.alaraId, { timeout: 10_000 });
  await screenshot(page, 'post-craft');

  await page.evaluate(async (alaraId) => {
    const alara = game.actors.get(alaraId);
    if (alara) await alara.sheet.render(true);
  }, fixtures.alaraId);
  await page.locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]').first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {});
  await page.evaluate((alaraId) => {
    const sheet = game.actors.get(alaraId)?.sheet;
    if (typeof sheet?.changeTab === 'function') sheet.changeTab('inventory', 'primary');
    else if (typeof sheet?.activateTab === 'function') sheet.activateTab('inventory');
  }, fixtures.alaraId);
  await page.waitForTimeout(500);
  await screenshot(page, 'alara-post-craft-inventory');

  results.steps.push({ step: 'craft-healing-potion', passed: true });
}

async function main() {
  let bootTimings = [];
  try {
    const raw = await readFile(join(RESULTS_DIR, 'boot-timings.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.bootTimings)) bootTimings = parsed.bootTimings;
  } catch {
    // Optional when invoked directly.
  }

  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });

  const results = {
    passed: false,
    profile: 'rc',
    steps: [],
    errors: [],
    consoleErrors: [],
    bootTimings,
    phaseTimings
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  attachConsoleCapture(page, [/favicon/i]);

  try {
    process.stdout.write('Smoke profile: rc (focused CI runner)\n');
    await timedPhase('boot-and-join', () => launchAndJoinWorld(page, results));
    await timedPhase('module-ready', () => ensureFabricateReady(page, results));
    const fixtures = await timedPhase('phase-B-C-minimal-fixtures', () => createFixtures(page, results));
    await timedPhase('phase-D2-gathering-success', () => runGatheringSuccess(page, results));
    await timedPhase('phase-E-craft-success', () => runCraftSuccess(page, fixtures, results));

    if (consoleErrors.length > 0) {
      results.consoleErrors = consoleErrors;
      throw new Error(`${consoleErrors.length} runtime console error(s) captured.`);
    }

    results.passed = true;
    process.stdout.write('RC smoke test PASSED.\n');
  } catch (err) {
    results.passed = false;
    results.errors.push(err.message);
    process.stderr.write(`RC smoke test FAILED: ${err.message}\n`);
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-failure.png') }).catch(() => {});
  } finally {
    results.consoleErrors = consoleErrors;
    results.phaseTimings = phaseTimings;
    await browser.close();

    const combinedTimings = [
      ...bootTimings.map(entry => ({ ...entry, phase: `boot:${entry.phase}` })),
      ...phaseTimings
    ];
    const timingsTable = formatTimingsTable(combinedTimings);
    if (timingsTable) process.stdout.write(`\n${timingsTable}\n\n`);

    await writeFile(join(RESULTS_DIR, 'summary.json'), JSON.stringify(results, null, 2));
    await writeFile(join(RESULTS_DIR, 'console.log'), consoleLog.join('\n'));
    process.stdout.write('Results written to test-results/\n');
  }

  if (!results.passed) process.exit(1);
}

main().catch(err => {
  process.stderr.write(`foundry-test-rc-run fatal error: ${err.message}\n`);
  process.exit(1);
});

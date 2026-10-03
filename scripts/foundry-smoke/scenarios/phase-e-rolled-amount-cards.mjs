/**
 * Phase E's rolled result amount (issue 1516): a forge whose one result the GM puts on Rolled in the
 * recipe editor, and whose token's salvage result is put on Rolled in the component editor, crafted,
 * gathered and salvaged with d4s set to manual entry, so an award that rolled interactively would
 * open a RollResolver. Each editor's refusals, the awards and the roll on their cards, a rolled
 * gathering yield, and a craft and a salvage refused before they consume anything are asserted in
 * every profile; nothing is captured.
 */

import { summarizeCraftCard, pickCraftCardMessage } from '../../lib/craftChatCardSummary.js';
import { railSelector } from '../../lib/managerRailEntries.js';
import {
  craftAndCollect,
  dismissStandingPrompts,
  readBackAllRolls,
  seedChatCardForge,
  withinTime,
} from '../pageOps/chatCardCrafts.mjs';
import { clickSegment, openManagerRecipeEditor } from '../pageOps/managerViews.mjs';
import {
  closeOpenApplications,
  setManagerWindowSize,
  settleManagerNav,
} from '../pageOps/pageLifecycle.mjs';

const ROLLED_FORGE = Object.freeze({
  name: 'Smoke Rolled Amount Forge',
  description: 'Issue 1516: a result amount rolled from an expression.',
  tokenName: 'Smoke Rolled Token',
  charmName: 'Smoke Rolled Charm',
  // One for the craft, one the refused craft must leave, one to salvage and one the refused
  // salvage must leave.
  crafts: 4,
});

const ROLLED_FORMULA = '1d4+1';
// Core writes the evaluated formula with spaced operators.
const ROLLED_ROLL_FORMULA = '1d4 + 1';
// Passes the actor-free floor and breaks only against the crafter, whose `@name` is text.
const CHARACTER_FORMULA = '1d4 + @name';
const REFUSED_FORMULAS = Object.freeze([
  { formula: 'max(, 2)', message: 'This expression cannot be rolled.' },
  { formula: '0', message: 'This expression can never award a positive amount.' },
]);
// What a refused editor save logs by design: the store's own line, then its notification.
const REFUSED_SAVE_LOGS = Object.freeze([
  /^Fabricate \| Failed to update recipe/,
  /^This recipe could not be saved/,
]);
const REFUSED_COMPONENT_LOGS = Object.freeze([
  /^Fabricate \| Failed to update component/,
  /^Invalid salvage: /,
]);

const RESULT_ROW = '.fabricate-manager [data-recipe-tab="results"] [data-recipe-result-item]';
const TASK_RESULT_ROW =
  '.fabricate-manager [data-gathering-task-results="straight"] [data-recipe-result-item]';
const SALVAGE_ROW = '.fabricate-manager [data-salvage-section] [data-salvage-result]';
const FORMULA = '[data-recipe-option-formula]';
const HEADER_BUTTON = '.fabricate-manager .manager-header-actions .fabricate-button';

/** One named step: its body's detail on success, its message on failure. */
async function runStep(ctx, step, body) {
  try {
    const detail = await body();
    ctx.results.steps.push({ step, passed: true, ...detail });
  } catch (error) {
    await dismissStandingPrompts(ctx.page);
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

/** The summed quantity of each named item the crafter holds. */
async function itemCounts(page, crafterId, names) {
  return await page.evaluate(
    ({ crafterId, names }) => {
      const items = game.actors.get(crafterId)?.items?.contents ?? [];
      return Object.fromEntries(
        names.map((name) => [
          name,
          items
            .filter((item) => item.name === name)
            .reduce((sum, item) => sum + (Number(item.system?.quantity) || 1), 0),
        ])
      );
    },
    { crafterId, names }
  );
}

/** The forge's one persisted result, as stored JSON, or null. */
async function persistedResult(page, { recipeId }) {
  return await page.evaluate((id) => {
    const record = (game.settings.get('fabricate', 'recipes') ?? []).find((r) => r?.id === id);
    const result = record?.resultGroups?.[0]?.results?.[0];
    return result ? JSON.stringify(result) : null;
  }, recipeId);
}

/** The forge token's one salvage result, as stored JSON, or null. */
async function persistedSalvageResult(page, forge) {
  return await page.evaluate(
    ({ systemId, componentId }) => {
      const item = game.fabricate
        .getCraftingSystemManager()
        .getItems(systemId)
        .find((entry) => entry?.id === componentId);
      const result = item?.salvage?.resultGroups?.[0]?.results?.[0];
      return result ? JSON.stringify(result) : null;
    },
    { systemId: forge.systemId, componentId: forge.tokenComponentId }
  );
}

/** Where each editor saves, what its refused save logs, and what it persists. */
const RECIPE_SURFACE = Object.freeze({
  save: `${HEADER_BUTTON}:has-text("Save recipe")`,
  view: 'recipe-edit',
  // A saved recipe returns to the recipes browser.
  savedView: 'recipes',
  logs: REFUSED_SAVE_LOGS,
  read: persistedResult,
});
const SALVAGE_SURFACE = Object.freeze({
  save: '.fabricate-manager button[form="manager-component-edit-form"]',
  view: 'component-edit',
  // A saved component returns to the components browser.
  savedView: 'components',
  logs: REFUSED_COMPONENT_LOGS,
  read: persistedSalvageResult,
});

/**
 * The forge's salvage on, with no salvage check to fail, and its token salvaging into one charm;
 * resolves to the two component ids, which the seed helper does not return.
 */
async function armSalvage(page, forge) {
  return await page.evaluate(
    async ({ systemId, tokenName, charmName }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const items = csm.getItems(systemId);
      const idOf = (name) => items.find((item) => item?.name === name)?.id ?? null;
      const tokenComponentId = idOf(tokenName);
      const charmComponentId = idOf(charmName);
      if (!tokenComponentId || !charmComponentId)
        throw new Error('the forge has no token or charm');
      const system = csm.getSystem(systemId);
      const check = system.salvageCraftingCheck ?? {};
      await csm.updateSystem(systemId, {
        features: { ...system.features, salvage: true },
        salvageResolutionMode: 'simple',
        salvageCraftingCheck: {
          ...check,
          enabled: false,
          simple: { ...check.simple, rollFormula: '' },
        },
      });
      await csm.updateItem(systemId, tokenComponentId, {
        salvage: {
          enabled: true,
          ingredientQuantity: 1,
          resultGroups: [
            { name: 'Charm', results: [{ componentId: charmComponentId, quantity: 1 }] },
          ],
        },
      });
      return { tokenComponentId, charmComponentId };
    },
    { systemId: forge.systemId, tokenName: forge.tokenName, charmName: forge.charmName }
  );
}

/** The core dice configuration and the gathering configuration, as they stand. */
async function snapshotWorld(page) {
  return await page.evaluate(() => ({
    dice: foundry.utils.deepClone(game.settings.get('core', 'diceConfiguration') ?? {}),
    gathering: foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') ?? {}),
  }));
}

/** d4s to manual entry, a counter on every RollResolver render, and the forge's check off. */
async function armManualD4(page, systemId) {
  await page.evaluate(async (systemId) => {
    const dice = game.settings.get('core', 'diceConfiguration') ?? {};
    await game.settings.set('core', 'diceConfiguration', { ...dice, d4: 'manual' });
    const counter = { renders: 0 };
    counter.hookId = Hooks.on('renderRollResolver', () => {
      counter.renders += 1;
    });
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the scenario deletes in its finally.
    globalThis.__fabricateSmokeResolverRenders = counter;
    const csm = game.fabricate.getCraftingSystemManager();
    const { craftingCheck } = csm.getSystem(systemId);
    await csm.updateSystem(systemId, { craftingCheck: { ...craftingCheck, enabled: false } });
  }, systemId);
}

/** The gather fixture's task made Direct with one fixed Mystic Herb; returns the task's name. */
async function makeTaskDirect(page, { systemId, taskId, componentId }) {
  return await page.evaluate(
    async ({ systemId, taskId, componentId }) => {
      const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig'));
      const task = config?.systems?.[systemId]?.tasks?.find((entry) => entry?.id === taskId);
      if (!task) throw new Error(`gathering task ${taskId} is not seeded`);
      Object.assign(task, {
        resolutionMode: 'straight',
        resultGroups: [
          {
            id: 'smoke-rolled-yield',
            name: 'Yield',
            results: [{ id: 'smoke-rolled-herb', componentId, quantity: 1 }],
          },
        ],
      });
      await game.settings.set('fabricate', 'gatheringConfig', config);
      return task.name;
    },
    { systemId, taskId, componentId }
  );
}

async function restoreWorld(ctx, snapshot) {
  try {
    await ctx.page.evaluate(async ({ dice, gathering }) => {
      const counter = globalThis.__fabricateSmokeResolverRenders;
      if (counter) Hooks.off('renderRollResolver', counter.hookId);
      delete globalThis.__fabricateSmokeResolverRenders;
      await game.settings.set('core', 'diceConfiguration', dice);
      await game.settings.set('fabricate', 'gatheringConfig', gathering);
    }, snapshot);
  } catch (error) {
    ctx.results.steps.push({ step: 'rolled-amount-restore', passed: false, error: error.message });
  }
}

/** Throw unless no RollResolver rendered since the world was armed and none is open now. */
async function assertNoResolver(page, what) {
  const seen = await page.evaluate(() => ({
    renders: globalThis.__fabricateSmokeResolverRenders?.renders ?? null,
    open: [...(foundry.applications.instances?.values?.() ?? [])].filter(
      (app) => app instanceof foundry.applications.dice.RollResolver
    ).length,
  }));
  if (seen.renders !== 0 || seen.open !== 0) {
    throw new Error(`${what} rolled interactively: ${JSON.stringify(seen)}`);
  }
}

/**
 * Run `action`, then wait for one console error matching each of `patterns` and move exactly those
 * to the waived list: a refused save logs them by design, and any other error stays gating.
 */
async function expectConsoleErrors(ctx, patterns, action) {
  const start = ctx.consoleErrors.length;
  await action();
  const deadline = Date.now() + 20_000;
  let found = [];
  do {
    const taken = new Set();
    found = patterns.map((pattern) => {
      const index = ctx.consoleErrors.findIndex(
        (text, at) => at >= start && !taken.has(at) && pattern.test(text)
      );
      if (index !== -1) taken.add(index);
      return index;
    });
    if (!found.includes(-1)) break;
    await ctx.page.waitForTimeout(250);
  } while (Date.now() < deadline);
  const missing = patterns.filter((_, at) => found[at] === -1);
  if (missing.length > 0) throw new Error(`the refused save never logged ${missing.join(', ')}`);
  for (const index of found.toSorted((a, b) => b - a)) {
    const [text] = ctx.consoleErrors.splice(index, 1);
    ctx.waivedConsoleErrors.push(`expected (issue 1516, a refused save): ${text}`);
  }
}

/** Open the manager on `systemId`, its rail then showing that system's routes. */
async function openManagedSystem(page, systemId) {
  await closeOpenApplications(page);
  await page.evaluate(async () => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
    globalThis.__fabricateSmokeManagerApp = (
      await game.fabricate.api.loadCraftingSystemManagerAppClass()
    ).show();
  });
  await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
  await setManagerWindowSize(page, { width: 1280, height: 820 });
  // The store call the systems browser's row makes, so a paged-out row cannot hide the system.
  await page.evaluate(async (id) => {
    await globalThis.__fabricateSmokeManagerApp._adminStore.selectSystem(id);
  }, systemId);
  await settleManagerNav(page);
}

async function openResultRow(page, recipeName) {
  await openManagerRecipeEditor(page, recipeName);
  await page.locator('.fabricate-manager [data-recipe-tab-button="results"]').first().click();
  const row = page.locator(RESULT_ROW).first();
  await row.waitFor({ state: 'visible', timeout: 5000 });
  return row;
}

/** Type a formula the editor accepts, save it through the header, and wait for the write. */
async function saveFormula(page, forge, row, formula, surface = RECIPE_SURFACE) {
  await row.locator(FORMULA).first().fill(formula);
  await row
    .locator(`${FORMULA}[aria-invalid]`)
    .first()
    .waitFor({ state: 'detached', timeout: 5000 });
  await page.locator(surface.save).first().click();
  if (surface.savedView) {
    await page
      .locator(`.fabricate-manager[data-manager-view="${surface.savedView}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }
  const deadline = Date.now() + 10_000;
  let saved;
  do {
    saved = JSON.parse((await surface.read(page, forge)) ?? '{}');
    if (saved.quantityFormula === formula) return;
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  throw new Error(`Save wrote ${JSON.stringify(saved)}, not the formula "${formula}"`);
}

/** A formula the editor marks invalid, whose header Save is refused and writes nothing. */
async function assertSaveRefused(ctx, forge, row, { formula, message }, surface = RECIPE_SURFACE) {
  const before = await surface.read(ctx.page, forge);
  await row.locator(FORMULA).first().fill(formula);
  await row
    .locator(`${FORMULA}[aria-invalid="true"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const shown = row.locator('[data-recipe-option-invalid]').filter({ hasText: message }).first();
  await shown.waitFor({ state: 'visible', timeout: 5000 });
  await expectConsoleErrors(ctx, surface.logs, () =>
    ctx.page.locator(surface.save).first().click()
  );
  const view = `.fabricate-manager[data-manager-view="${surface.view}"]`;
  if ((await ctx.page.locator(view).count()) === 0) {
    throw new Error(`Save on "${formula}" left the editor`);
  }
  const after = await surface.read(ctx.page, forge);
  if (after !== before) throw new Error(`Save on "${formula}" wrote ${after} over ${before}`);
}

/** Step 3: two refused expressions, then `1d4+1` saved and read back in the reopened editor. */
async function proveEditorFloor(ctx, forge) {
  const { page } = ctx;
  await openManagedSystem(page, forge.systemId);
  const row = await openResultRow(page, forge.recipeName);
  await clickSegment(row, 'data-recipe-option-amount-mode', 'rolled');
  for (const refused of REFUSED_FORMULAS) await assertSaveRefused(ctx, forge, row, refused);
  await saveFormula(page, forge, row, ROLLED_FORMULA);
  const reopened = await openResultRow(page, forge.recipeName);
  const shown = await reopened.locator(FORMULA).first().inputValue();
  if (shown !== ROLLED_FORMULA) throw new Error(`the reopened editor shows "${shown}"`);
  return { saved: ROLLED_FORMULA };
}

/** Steps 4 and 5: the craft awards 2 to 5, rolls no resolver, and its one card carries the roll. */
async function proveRolledCraft(ctx, forge) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  const stored = JSON.parse((await persistedResult(page, forge)) ?? '{}');
  if (stored.quantityFormula !== ROLLED_FORMULA) {
    throw new Error(`the recipe holds ${JSON.stringify(stored)}, not "${ROLLED_FORMULA}"`);
  }
  await closeOpenApplications(page);
  const before = await itemCounts(page, crafterId, [forge.charmName]);
  const crafted = craftAndCollect(page, { ...forge, crafterId });
  crafted.catch(() => {});
  const { messages, result } = await withinTime(crafted, 60_000, 'the rolled craft never settled');
  if (result.success !== true) throw new Error(`the craft failed: ${result.message}`);
  const after = await itemCounts(page, crafterId, [forge.charmName]);
  const increase = after[forge.charmName] - before[forge.charmName];
  if (increase < 2 || increase > 5) throw new Error(`the charms rose by ${increase}, not 2 to 5`);
  await assertNoResolver(page, 'the craft');
  const picked = pickCraftCardMessage(messages);
  if (picked.error) throw new Error(picked.error);
  const rolls = await readBackAllRolls(page, [picked.message.id]);
  const amountRolls = rolls.filter((roll) => roll.formula === ROLLED_ROLL_FORMULA);
  if (amountRolls.length !== 1 || amountRolls[0].total !== increase) {
    throw new Error(`the card carries ${JSON.stringify(rolls)} for an award of ${increase}`);
  }
  return { increase, messageId: picked.message.id };
}

/** Put the task's one Direct result on Rolled through the gathering task editor and save it. */
async function authorTaskFormula(page, { systemId, taskId, taskName }) {
  await openManagedSystem(page, systemId);
  await page.locator(railSelector('manager-nav-gathering')).first().click();
  const tasksNav = page.locator('.fabricate-manager #manager-gathering-nav-tasks').first();
  await tasksNav.waitFor({ state: 'visible', timeout: 5000 });
  await tasksNav.click();
  await page
    .locator('.fabricate-manager [data-gathering-tasks-browser] input[type="search"]')
    .first()
    .fill(taskName);
  await page
    .locator(`.fabricate-manager [data-gathering-task-id="${taskId}"] [aria-label^="Edit"]`)
    .first()
    .click();
  await page
    .locator('.fabricate-manager[data-manager-view="gathering-task-edit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const row = page.locator(TASK_RESULT_ROW).first();
  await row.scrollIntoViewIfNeeded();
  await clickSegment(row, 'data-recipe-option-amount-mode', 'rolled');
  await row.locator(FORMULA).first().fill(ROLLED_FORMULA);
  await page.locator(`${HEADER_BUTTON}:has-text("Save task")`).first().click();
  await page.waitForFunction(
    ({ systemId, taskId, formula }) =>
      game.settings
        .get('fabricate', 'gatheringConfig')
        ?.systems?.[systemId]?.tasks?.find((task) => task?.id === taskId)?.resultGroups?.[0]
        ?.results?.[0]?.quantityFormula === formula,
    { systemId, taskId, formula: ROLLED_FORMULA },
    { timeout: 10_000 }
  );
}

/** Step 6: the gather fixture's Direct task, now rolled, yields 2 to 5 Mystic Herb. */
async function proveRolledGather(ctx, gather) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  await authorTaskFormula(page, gather);
  await closeOpenApplications(page);
  const before = await itemCounts(page, crafterId, ['Mystic Herb']);
  const outcome = await page.evaluate(
    async ({ crafterId, environmentId, taskId }) => {
      await game.fabricate.setSelectedGatheringActorId(crafterId);
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId,
        taskId,
      });
      return { accepted: result?.accepted === true, blocked: result?.blockedReasons ?? null };
    },
    { crafterId, environmentId: gather.environmentId, taskId: gather.taskId }
  );
  if (!outcome.accepted) throw new Error(`the gather was refused: ${JSON.stringify(outcome)}`);
  const after = await itemCounts(page, crafterId, ['Mystic Herb']);
  const increase = after['Mystic Herb'] - before['Mystic Herb'];
  if (increase < 2 || increase > 5) throw new Error(`Mystic Herb rose by ${increase}, not 2 to 5`);
  await assertNoResolver(page, 'the gather');
  return { increase };
}

/** Step 7: `1d4 + @name` saves, and its craft is refused with nothing consumed and no run left. */
async function proveCharacterRefusal(ctx, forge) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  const name = await page.evaluate((id) => game.actors.get(id)?.getRollData?.()?.name, crafterId);
  if (typeof name !== 'string') throw new Error(`the crafter's @name is ${typeof name}, not text`);
  await openManagedSystem(page, forge.systemId);
  await saveFormula(page, forge, await openResultRow(page, forge.recipeName), CHARACTER_FORMULA);
  await closeOpenApplications(page);
  const names = [forge.tokenName, forge.charmName];
  const before = await itemCounts(page, crafterId, names);
  const crafted = craftAndCollect(page, { ...forge, crafterId });
  crafted.catch(() => {});
  const { messages, result } = await withinTime(crafted, 30_000, 'the refusal never settled');
  const after = await itemCounts(page, crafterId, names);
  const activeRun = await page.evaluate(
    ({ crafterId, recipeId }) =>
      game.fabricate
        .getCraftingRunManager()
        .findActiveRunForRecipe(game.actors.get(crafterId), recipeId)?.id ?? null,
    { crafterId, recipeId: forge.recipeId }
  );
  const cards = messages.filter((message) => summarizeCraftCard(message.content).isCraftCard);
  const failures = [
    result.success === false || `the craft answered success ${result.success}`,
    /cannot be rolled for this character/.test(result.message ?? '') ||
      `the refusal said "${result.message}"`,
    JSON.stringify(after) === JSON.stringify(before) ||
      `the inventory moved ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    activeRun === null || `run ${activeRun} is still active`,
    cards.length === 0 || `${cards.length} crafting card(s) posted`,
  ].filter((entry) => entry !== true);
  if (failures.length > 0) throw new Error(failures.join('; '));
  return { refusal: result.message };
}

/** Open the component editor on the forge's token and return its one salvage result row. */
async function openSalvageRow(page, forge) {
  await openManagedSystem(page, forge.systemId);
  await page.locator(railSelector('manager-nav-component-rules')).first().click();
  await page
    .locator('.fabricate-manager[data-manager-view="components"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('searchbox', { name: 'Search components' }).first().fill(forge.tokenName);
  await page
    .locator(
      `.fabricate-manager .manager-component-row[data-component-id="${forge.tokenComponentId}"] [data-component-edit]`
    )
    .first()
    .click();
  await page
    .locator('.fabricate-manager[data-manager-view="component-edit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const row = page.locator(SALVAGE_ROW).first();
  await row.scrollIntoViewIfNeeded();
  return row;
}

/** The ids of the chat messages `action` posts. */
async function messagesPostedBy(page, action) {
  const ids = () => page.evaluate(() => game.messages.contents.map((message) => message.id));
  const before = new Set(await ids());
  const result = await action();
  await page.waitForTimeout(500);
  return { result, posted: (await ids()).filter((id) => !before.has(id)) };
}

/** Salvage one forge token through the facade, as the player app does. */
function salvageToken(page, forge, crafterId) {
  return page.evaluate(
    ({ crafterId, systemId, componentId }) =>
      game.fabricate
        .salvageComponent({ actorId: crafterId, systemId, componentId })
        .then(({ success, message }) => ({ success, message })),
    { crafterId, systemId: forge.systemId, componentId: forge.tokenComponentId }
  );
}

/**
 * Salvage step 1: the forge's salvage armed, two refused expressions, then `1d4+1` saved and read
 * back in the editor. Arming here keeps a failure to arm out of the recipe and gather steps.
 */
async function proveSalvageEditorFloor(ctx, forge) {
  const { page } = ctx;
  Object.assign(forge, await armSalvage(page, forge));
  const row = await openSalvageRow(page, forge);
  await clickSegment(row, 'data-recipe-option-amount-mode', 'rolled');
  for (const refused of REFUSED_FORMULAS) {
    await assertSaveRefused(ctx, forge, row, refused, SALVAGE_SURFACE);
  }
  await saveFormula(page, forge, row, ROLLED_FORMULA, SALVAGE_SURFACE);
  const reopened = await openSalvageRow(page, forge);
  const shown = await reopened.locator(FORMULA).first().inputValue();
  if (shown !== ROLLED_FORMULA) throw new Error(`the reopened editor shows "${shown}"`);
  return { saved: ROLLED_FORMULA };
}

/** Salvage step 2: one token salvages into 2 to 5 charms, with no resolver and one rolled card. */
async function proveRolledSalvage(ctx, forge) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  await closeOpenApplications(page);
  const names = [forge.tokenName, forge.charmName];
  const before = await itemCounts(page, crafterId, names);
  const { result, posted } = await messagesPostedBy(page, () =>
    salvageToken(page, forge, crafterId)
  );
  if (result.success !== true) throw new Error(`the salvage failed: ${result.message}`);
  const after = await itemCounts(page, crafterId, names);
  const spent = before[forge.tokenName] - after[forge.tokenName];
  const increase = after[forge.charmName] - before[forge.charmName];
  if (spent !== 1) throw new Error(`the salvage spent ${spent} tokens, not 1`);
  if (increase < 2 || increase > 5) throw new Error(`the charms rose by ${increase}, not 2 to 5`);
  await assertNoResolver(page, 'the salvage');
  const rolled = [];
  for (const id of posted) {
    const rolls = (await readBackAllRolls(page, [id])).filter(
      (roll) => roll.formula === ROLLED_ROLL_FORMULA
    );
    if (rolls.length > 0) rolled.push({ id, rolls });
  }
  if (
    rolled.length !== 1 ||
    rolled[0].rolls.length !== 1 ||
    rolled[0].rolls[0].total !== increase
  ) {
    throw new Error(`the salvage posted ${JSON.stringify(rolled)} for an award of ${increase}`);
  }
  return { increase, messageId: rolled[0].id };
}

/** Salvage step 3: `1d4 + @name` saves, and its salvage is refused with nothing consumed. */
async function proveSalvageCharacterRefusal(ctx, forge) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  await saveFormula(
    page,
    forge,
    await openSalvageRow(page, forge),
    CHARACTER_FORMULA,
    SALVAGE_SURFACE
  );
  await closeOpenApplications(page);
  const names = [forge.tokenName, forge.charmName];
  const before = await itemCounts(page, crafterId, names);
  const { result, posted } = await messagesPostedBy(page, () =>
    salvageToken(page, forge, crafterId)
  );
  const after = await itemCounts(page, crafterId, names);
  const failures = [
    result.success === false || `the salvage answered success ${result.success}`,
    /cannot be rolled for this character/.test(result.message ?? '') ||
      `the refusal said "${result.message}"`,
    JSON.stringify(after) === JSON.stringify(before) ||
      `the inventory moved ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    posted.length === 0 || `${posted.length} chat message(s) posted`,
  ].filter((entry) => entry !== true);
  if (failures.length > 0) throw new Error(failures.join('; '));
  return { refusal: result.message };
}

export async function runRolledAmountCards(ctx) {
  const { page } = ctx;
  const { cleanup, craftingSetup, executionFixtures } = ctx.shared;
  process.stdout.write('  Proving a rolled result amount (#1516)...\n');
  await dismissStandingPrompts(page);
  let forge;
  let snapshot;
  try {
    snapshot = await snapshotWorld(page);
    forge = {
      ...ROLLED_FORGE,
      ...(await seedChatCardForge(page, cleanup.crafterId, ROLLED_FORGE)),
    };
  } catch (error) {
    ctx.results.steps.push({ step: 'rolled-amount-seed', passed: false, error: error.message });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), forge.recipeId];
  try {
    const gather = executionFixtures?.gather
      ? { ...executionFixtures.gather, systemId: craftingSetup.systemId }
      : null;
    await armManualD4(page, forge.systemId);
    if (gather) {
      gather.taskName = await makeTaskDirect(page, {
        ...gather,
        componentId: craftingSetup.componentMap['Mystic Herb'],
      });
    }
    await runStep(ctx, 'rolled-amount-editor', () => proveEditorFloor(ctx, forge));
    await runStep(ctx, 'rolled-amount-craft', () => proveRolledCraft(ctx, forge));
    await runStep(ctx, 'rolled-amount-gather', () => {
      if (!gather) throw new Error('the execution fixtures seeded no gather task');
      return proveRolledGather(ctx, gather);
    });
    await runStep(ctx, 'rolled-amount-refusal', () => proveCharacterRefusal(ctx, forge));
    await runStep(ctx, 'rolled-amount-salvage-editor', () => proveSalvageEditorFloor(ctx, forge));
    await runStep(ctx, 'rolled-amount-salvage', () => proveRolledSalvage(ctx, forge));
    await runStep(ctx, 'rolled-amount-salvage-refusal', () =>
      proveSalvageCharacterRefusal(ctx, forge)
    );
  } catch (error) {
    ctx.results.steps.push({ step: 'rolled-amount-arm', passed: false, error: error.message });
  } finally {
    await restoreWorld(ctx, snapshot);
    await closeOpenApplications(page).catch(() => {});
  }
}

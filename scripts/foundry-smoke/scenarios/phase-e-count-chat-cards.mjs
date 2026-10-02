/**
 * Phase E's success-counting chat cards (issue 2006): one dedicated system whose crafting check is
 * rewritten per case, crafted interactively with a public roll, and asserted against the card the
 * execute created and its count Roll. The assertions run in every profile; only the frames are
 * gated behind `RUN_SCREENSHOT_PHASES`. Issue 2008's bought die runs on Foundry 14 only.
 */

import {
  COUNT_CHAT_CARD_CASES,
  countCardFailures,
  pickCraftCardMessage,
  summarizeCraftCard,
} from '../../lib/countChatCardEvidence.js';
import {
  ROLL_PROMPT,
  craftAndCollect,
  dismissStandingPrompts,
  rollPublicly,
  seedChatCardForge,
  showChatMessage,
  withinTime,
  writeCaseCheck,
} from '../pageOps/chatCardCrafts.mjs';

const COUNT_FORGE = Object.freeze({
  name: 'Smoke Counting Forge',
  description: 'Issue 2006: success-counting chat cards, rolled deterministically.',
  tokenName: 'Smoke Count Token',
  charmName: 'Smoke Count Charm',
  // One craft per case, the bought die's, and one spare.
  crafts: COUNT_CHAT_CARD_CASES.length + 2,
});

/** The chat sidebar clipped to one message, each label a literal the capture map can find. */
async function captureCountCard(ctx, caseId, messageId) {
  const { page, screenshot } = ctx;
  const options = await showChatMessage(page, messageId);
  const frames = {
    pass: () => screenshot(page, 'chat-craft-card-count-pass', options),
    fail: () => screenshot(page, 'chat-craft-card-count-fail', options),
    botch: () => screenshot(page, 'chat-craft-card-count-botch', options),
    zero: () => screenshot(page, 'chat-craft-card-count-zero', options),
    'over-control': () => screenshot(page, 'chat-craft-card-over-control', options),
  };
  await frames[caseId]();
}

/** One case: craft, bind to the created card, assert, and capture when frames are wanted. */
async function runCountCase(ctx, forge, { id, check }) {
  const step =
    id === 'over-control' ? 'chat-craft-card-over-control' : `chat-craft-card-count-${id}`;
  try {
    await writeCaseCheck(ctx.page, forge.systemId, { check });
    const crafted = craftAndCollect(ctx.page, {
      ...forge,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await rollPublicly(ctx.page);
    const { messages } = await withinTime(crafted, 60_000, 'the craft never settled');
    const picked = pickCraftCardMessage(messages);
    if (picked.error) throw new Error(picked.error);
    const rollMessages = messages.map((message) => message.roll).filter(Boolean);
    const failures = countCardFailures(id, { card: picked.message.content, rollMessages });
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step, passed: true, messageId: picked.message.id });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) await captureCountCard(ctx, id, picked.message.id);
  } catch (error) {
    // A prompt left standing would answer the next case's craft instead of its own.
    await dismissStandingPrompts(ctx.page);
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

/** Issue 2008: the resource a dnd5e character stores and a bought die spends. */
const BOUGHT_PATH = 'system.resources.primary.value';
const BOUGHT_STEP = 'chat-craft-card-count-bought';

/**
 * The reporter's case, deterministic by construction: two d20s, each at or under 20, need three
 * successes, so only the one die bought from the crafter's resource can pass it.
 */
const BOUGHT_CHECK = Object.freeze({
  rollFormula: '',
  thresholdMode: 'meet',
  evaluation: {
    product: 'count',
    direction: 'under',
    pool: {
      die: 20,
      base: '2',
      threshold: '20',
      required: 3,
      additionalDice: {
        enabled: true,
        source: 'path',
        path: BOUGHT_PATH,
        max: 1,
        label: 'Momentum',
      },
    },
  },
});

/** Set the crafter's stored resource to 3 and answer what `_source` then holds. */
async function primeBoughtResource(page, crafterId) {
  return await page.evaluate(
    async ({ crafterId, path }) => {
      const actor = game.actors.get(crafterId);
      await actor.update({ [path]: 3 });
      return foundry.utils.getProperty(actor._source, path);
    },
    { crafterId, path: BOUGHT_PATH }
  );
}

/**
 * Started before the craft: record, in order, the crafter's resource writes and every message
 * posted, settling with the record once the crafting card posts.
 */
function watchBoughtOrder(page, crafterId) {
  return page.evaluate(
    ({ crafterId, path }) =>
      new Promise((resolve) => {
        const order = [];
        const spend = (document, change) => {
          if (document.id === crafterId && foundry.utils.hasProperty(change, path)) {
            order.push(`spend:${foundry.utils.getProperty(change, path)}`);
          }
        };
        const posted = (message) => {
          order.push(`message:${message.id}`);
          if (!String(message.content ?? '').includes('fabricate-craft-chat')) return;
          Hooks.off('updateActor', spendHook);
          Hooks.off('createChatMessage', postedHook);
          resolve(order);
        };
        const spendHook = Hooks.on('updateActor', spend);
        const postedHook = Hooks.on('createChatMessage', posted);
      }),
    { crafterId, path: BOUGHT_PATH }
  );
}

/** The resource the crafter stores now. */
async function storedBoughtResource(page, crafterId) {
  return await page.evaluate(
    ({ crafterId, path }) => foundry.utils.getProperty(game.actors.get(crafterId)._source, path),
    { crafterId, path: BOUGHT_PATH }
  );
}

/** Raise the standing prompt's additional dice to one before it is answered. */
async function buyOneDie(page) {
  const prompt = page.locator(ROLL_PROMPT).last();
  await prompt.waitFor({ state: 'visible', timeout: 15_000 });
  await prompt
    .locator('[data-roll-prompt-additional-dice-stepper] [data-stepper-increment]')
    .click();
  const chosen = await prompt.locator('input[data-roll-prompt-additional-dice]').inputValue();
  if (chosen !== '1') throw new Error(`the prompt's additional dice read ${chosen}, expected 1`);
}

/** The card's own tiles, row and summary line for one bought die on three qualifying d20s. */
function boughtCardFailures(card) {
  const summary = summarizeCraftCard(card);
  const failures = [];
  if (summary.result !== 'success') failures.push('bought: expected the Success pill');
  const marks = summary.tiles.map((tile) => tile.marks);
  if (marks.length !== 3 || marks.some((each) => !each.includes('qualified'))) {
    failures.push(`bought: tiles ${JSON.stringify(marks)}, expected three qualified`);
  }
  const bought = marks.map((each) => each.includes('bought'));
  if (JSON.stringify(bought) !== JSON.stringify([false, false, true])) {
    failures.push('bought: only the last original tile may be marked bought');
  }
  const row = summary.rows.find((entry) => entry.id === 'additionalDice');
  if (row?.text !== '1 bought · spent 1 Momentum') failures.push(`bought: row "${row?.text}"`);
  const line = /data-check-count-summary[^>]*>([^<]*)</.exec(card)?.[1] ?? '';
  if (!line.includes('(2 + 1 bought)')) failures.push(`bought: summary "${line}"`);
  return failures;
}

/** Every way the bought die's card, its one count Roll and the spend before it fall short. */
function boughtFailures({ card, messageId, rollMessages, stored, order }) {
  const failures = boughtCardFailures(card);
  const counted = rollMessages.filter((message) => message.className === 'FabricateCountRoll');
  const active = counted[0]?.results.filter((result) => result.active !== false).length;
  if (counted.length !== 1 || active !== 3) {
    failures.push(`bought: ${counted.length} count Rolls with ${active} dice, expected one of 3`);
  }
  if (stored !== 2) failures.push(`bought: the resource reads ${stored}, expected 3 less 1`);
  const spent = order.indexOf('spend:2');
  if (spent === -1 || spent > order.indexOf(`message:${messageId}`)) {
    failures.push(`bought: the spend did not land before the card (${order.join(', ')})`);
  }
  return failures;
}

/** The chat sidebar clipped to the bought die's card. */
async function captureBoughtCard(ctx, messageId) {
  const { page, screenshot } = ctx;
  const options = await showChatMessage(page, messageId);
  await screenshot(page, 'chat-craft-card-count-bought', options);
}

/** Issue 2008: one die bought from the crafter's resource, spent before the main dice roll. */
async function runBoughtCase(ctx, forge) {
  const generation = await ctx.page.evaluate(() => game.release?.generation ?? null);
  if (generation < 14) {
    ctx.results.steps.push({ step: BOUGHT_STEP, passed: true, skipped: true, generation });
    return;
  }
  const { crafterId } = ctx.shared.cleanup;
  try {
    const before = await primeBoughtResource(ctx.page, crafterId);
    if (before !== 3) throw new Error(`the crafter's ${BOUGHT_PATH} reads ${before}, not 3`);
    await writeCaseCheck(ctx.page, forge.systemId, { check: BOUGHT_CHECK });
    const watched = watchBoughtOrder(ctx.page, crafterId);
    watched.catch(() => {});
    const crafted = craftAndCollect(ctx.page, { ...forge, crafterId });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await buyOneDie(ctx.page);
    await rollPublicly(ctx.page);
    const { messages } = await withinTime(crafted, 60_000, 'the craft never settled');
    const picked = pickCraftCardMessage(messages);
    if (picked.error) throw new Error(picked.error);
    const failures = boughtFailures({
      card: picked.message.content,
      messageId: picked.message.id,
      rollMessages: messages.map((message) => message.roll).filter(Boolean),
      stored: await storedBoughtResource(ctx.page, crafterId),
      order: await withinTime(watched, 10_000, 'the crafting card never posted'),
    });
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step: BOUGHT_STEP, passed: true, messageId: picked.message.id });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) await captureBoughtCard(ctx, picked.message.id);
  } catch (error) {
    await dismissStandingPrompts(ctx.page);
    const message = String(error?.message ?? error);
    ctx.results.steps.push({ step: BOUGHT_STEP, passed: false, error: message });
    process.stderr.write(`  ${BOUGHT_STEP} failed: ${message}\n`);
  }
}

export async function runCountChatCards(ctx) {
  const { cleanup } = ctx.shared;
  process.stdout.write('  Crafting the success-counting chat card cases (#2006)...\n');
  await dismissStandingPrompts(ctx.page);
  let forge;
  try {
    forge = await seedChatCardForge(ctx.page, cleanup.crafterId, COUNT_FORGE);
  } catch (error) {
    ctx.results.steps.push({
      step: 'chat-craft-card-count-seed',
      passed: false,
      error: error.message,
    });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), forge.recipeId];
  for (const entry of COUNT_CHAT_CARD_CASES) await runCountCase(ctx, forge, entry);
  await runBoughtCase(ctx, forge);
}

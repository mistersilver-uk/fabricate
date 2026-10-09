/**
 * Phase E's roll-under chat cards (issue 2005): one dedicated system whose crafting check is
 * rewritten per case and crafted interactively with a public roll. The rolled cases assert the
 * card the execute created and its roll; the refusing case asserts that nothing is posted and that
 * the Crafting tab shows the refusal. The assertions run in every profile; only the frames are
 * gated behind `RUN_SCREENSHOT_PHASES`.
 */

import { pickCraftCardMessage } from '../../lib/craftChatCardSummary.js';
import {
  UNDER_CHAT_CARD_CASES,
  UNDER_CHARACTER_PATH,
  UNDER_MIN_CHARACTER_VALUE,
  misconfiguredFailures,
  underCardFailures,
} from '../../lib/underChatCardEvidence.js';
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
import { closeOpenApplications } from '../pageOps/pageLifecycle.mjs';

const UNDER_FORGE = Object.freeze({
  name: 'Smoke Roll-Under Forge',
  description: 'Issue 2005: roll-under chat cards, decided by construction.',
  tokenName: 'Smoke Under Token',
  charmName: 'Smoke Under Charm',
  // Named for the routed success tier, which routes on it; the simple cases award it too.
  group: 'Regular',
  outcomeIds: ['under-regular'],
  crafts: UNDER_CHAT_CARD_CASES.length + 2,
});

/** The crafter's value at the path every attribute case reads, or null. */
async function readCharacterValue(page, crafterId) {
  return await page.evaluate(
    ({ crafterId, path }) => {
      const data = game.actors.get(crafterId)?.getRollData?.() ?? {};
      const value = Number(foundry.utils.getProperty(data, path));
      return Number.isFinite(value) ? value : null;
    },
    { crafterId, path: UNDER_CHARACTER_PATH.slice(1) }
  );
}

/** The chat sidebar clipped to one message, each label a literal the capture map can find. */
async function captureUnderCard(ctx, caseId, messageId) {
  const { page, screenshot } = ctx;
  const options = await showChatMessage(page, messageId);
  const frames = {
    pass: () => screenshot(page, 'chat-craft-card-under-pass', options),
    fail: () => screenshot(page, 'chat-craft-card-under-fail', options),
    otherwise: () => screenshot(page, 'chat-craft-card-under-otherwise', options),
  };
  await frames[caseId]();
}

/** One rolled case: craft, bind to the created card, assert, and capture when frames are wanted. */
async function runUnderCase(ctx, forge, entry, characterValue) {
  const step = `chat-craft-card-under-${entry.id}`;
  try {
    if (characterValue === null || characterValue < UNDER_MIN_CHARACTER_VALUE) {
      throw new Error(
        `the crafter's ${UNDER_CHARACTER_PATH} is ${characterValue}, below the ${UNDER_MIN_CHARACTER_VALUE} these cases are decided at`
      );
    }
    await writeCaseCheck(ctx.page, forge.systemId, entry);
    const crafted = craftAndCollect(ctx.page, {
      ...forge,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await rollPublicly(ctx.page, { bonus: entry.bonus });
    const { messages } = await withinTime(crafted, 60_000, 'the craft never settled');
    const picked = pickCraftCardMessage(messages);
    if (picked.error) throw new Error(picked.error);
    const failures = underCardFailures(entry.id, {
      card: picked.message.content,
      rollMessages: messages,
      characterValue,
    });
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step, passed: true, messageId: picked.message.id });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) await captureUnderCard(ctx, entry.id, picked.message.id);
  } catch (error) {
    // A prompt left standing would answer the next case's craft instead of its own.
    await dismissStandingPrompts(ctx.page);
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

/** How many crafting cards the rendered chat log holds, with the log in view. */
async function chatLogCardCount(page) {
  await page
    .locator('#sidebar [data-tab="chat"]')
    .first()
    .click({ force: true })
    .catch(() => {});
  return await page.evaluate(
    () => document.querySelectorAll('#sidebar .chat-log .fabricate-craft-chat').length
  );
}

/**
 * Open the Crafting tab on `recipeId` through the Items sidebar's Craft Item action, and return
 * the check card's refusal text, blank when it shows none.
 */
async function showRefusalInCraftingTab(page, { recipeId, recipeName }) {
  await closeOpenApplications(page);
  await page
    .locator('#sidebar [data-tab="items"]')
    .first()
    .click({ force: true })
    .catch(() => {});
  const craftItem = page.locator('button[data-fabricate-action="craft"]').first();
  await craftItem.waitFor({ state: 'visible', timeout: 10_000 });
  await craftItem.evaluate((button) => button.click());
  const app = page.locator('#fabricate-app').first();
  await app.waitFor({ state: 'visible', timeout: 10_000 });
  await app
    .locator('[data-crafting-state]:not([data-crafting-state="loading"])')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  await app.locator('.crafting-browser-search input').first().fill(recipeName);
  await page.waitForTimeout(350);
  // The narrowed list selects its only recipe itself; a DOM click covers the case where it has not.
  const row = app.locator(`[data-recipe-id="${recipeId}"]`).first();
  await row.waitFor({ state: 'attached', timeout: 10_000 });
  if ((await row.getAttribute('data-selected')) !== 'true') {
    await row
      .locator('.crafting-recipe-row-main')
      .first()
      .evaluate((main) => main.click());
  }
  const note = app.locator('[data-recipe-section="check"] [data-check-target-unresolved]').first();
  await note.waitFor({ state: 'visible', timeout: 10_000 });
  return (await note.isVisible()) ? ((await note.textContent()) ?? '').trim() : '';
}

/**
 * The refusing case: the facade craft must refuse before any prompt and post nothing, and the
 * Crafting tab must then show the refusal on the recipe's check card.
 */
async function runMisconfiguredCase(ctx, forge, entry) {
  const step = 'chat-craft-card-under-misconfigured';
  const { page, screenshot } = ctx;
  try {
    await writeCaseCheck(page, forge.systemId, entry);
    const before = await chatLogCardCount(page);
    const crafted = craftAndCollect(page, { ...forge, crafterId: ctx.shared.cleanup.crafterId });
    crafted.catch(() => {});
    const promptOpened = await page
      .locator(ROLL_PROMPT)
      .first()
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (promptOpened) await dismissStandingPrompts(page);
    const { messages, result } = await withinTime(crafted, 30_000, 'the refusal never settled');
    const after = await chatLogCardCount(page);
    const refusalText = await showRefusalInCraftingTab(page, forge);
    const failures = misconfiguredFailures({
      result,
      createdMessages: messages,
      cardCount: { before, after },
      promptOpened,
      refusalText,
    });
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step, passed: true, refusal: refusalText });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) {
      await page
        .locator('#sidebar [data-tab="chat"]')
        .first()
        .click({ force: true })
        .catch(() => {});
      await screenshot(page, 'chat-craft-card-under-misconfigured');
    }
  } catch (error) {
    await dismissStandingPrompts(page);
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  } finally {
    await closeOpenApplications(page).catch(() => {});
  }
}

export async function runUnderChatCards(ctx) {
  const { cleanup } = ctx.shared;
  process.stdout.write('  Crafting the roll-under chat card cases (#2005)...\n');
  await dismissStandingPrompts(ctx.page);
  let forge;
  try {
    forge = await seedChatCardForge(ctx.page, cleanup.crafterId, UNDER_FORGE);
  } catch (error) {
    ctx.results.steps.push({
      step: 'chat-craft-card-under-seed',
      passed: false,
      error: error.message,
    });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), forge.recipeId];
  const characterValue = await readCharacterValue(ctx.page, cleanup.crafterId);
  for (const entry of UNDER_CHAT_CARD_CASES) {
    if (entry.id === 'misconfigured') await runMisconfiguredCase(ctx, forge, entry);
    else await runUnderCase(ctx, forge, entry, characterValue);
  }
}

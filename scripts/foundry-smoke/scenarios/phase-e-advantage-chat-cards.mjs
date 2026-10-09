/**
 * Phase E's advantage rule chat cards (issue 2007): one dedicated system whose crafting check is
 * rewritten per case and crafted interactively, answered with that case's Advantage, Disadvantage
 * or Roll choice. Each case is decided by construction, and every assertion binds to the roll the
 * craft's own message carries, read back through `game.messages.get(id)`. The assertions run in
 * every profile; only the frames are gated behind `RUN_SCREENSHOT_PHASES`.
 */

import {
  ADVANTAGE_CHAT_CARD_CASES,
  advantageRollFailures,
  pickCraftCardMessage,
} from '../../lib/advantageChatCardEvidence.js';
import {
  ROLL_PROMPT,
  abandonCraft,
  clearStandingPrompts,
  craftAndCollect,
  describeStandingPrompts,
  readBackAllRolls,
  rollPublicly,
  seedChatCardForge,
  showChatMessage,
  withinTime,
  writeCaseCheck,
} from '../pageOps/chatCardCrafts.mjs';

const ADVANTAGE_FORGE = Object.freeze({
  name: 'Smoke Advantage Forge',
  description: 'Issue 2007: the advantage rule, decided by construction.',
  tokenName: 'Smoke Advantage Token',
  charmName: 'Smoke Advantage Charm',
  crafts: ADVANTAGE_CHAT_CARD_CASES.length + 1,
});

/** The chat sidebar clipped to one message, each label a literal the capture map can find. */
async function captureAdvantageCard(ctx, caseId, messageId) {
  const { page, screenshot } = ctx;
  const options = await showChatMessage(page, messageId);
  const frames = {
    keep: () => screenshot(page, 'chat-craft-card-advantage-keep', options),
    'keep-under': () => screenshot(page, 'chat-craft-card-advantage-keep-under', options),
    bonus: () => screenshot(page, 'chat-craft-card-advantage-bonus', options),
    count: () => screenshot(page, 'chat-craft-card-advantage-count', options),
    off: () => screenshot(page, 'chat-craft-card-advantage-off', options),
  };
  await frames[caseId]();
}

// A hang guard: each case starts with no prompt standing, so the one that shows is its craft's.
const PROMPT_CEILING_MS = 60_000;
// The Journal command reopens a prompt whose prepared check changed while it stood; a player
// answers it again, and so does the case, up to the command's own retry limit.
const ANSWERS = 4;

/** The footer's Advantage button, present for every case but `off`, which offers none. */
async function assertFooterOffer(page, caseId) {
  const prompt = page.locator(ROLL_PROMPT).last();
  await prompt.waitFor({ state: 'visible', timeout: PROMPT_CEILING_MS }).catch(async (error) => {
    const seen = JSON.stringify(await describeStandingPrompts(page));
    throw new Error(`${caseId}: no prompt showed. The page saw: ${seen}`, { cause: error });
  });
  const hasAdvantage = (await prompt.locator('button[data-action="advantage"]').count()) > 0;
  if (caseId === 'off' && hasAdvantage) {
    throw new Error('off: the footer still offers an Advantage button');
  }
  if (caseId !== 'off' && !hasAdvantage) {
    throw new Error(`${caseId}: the footer offers no Advantage button`);
  }
}

/** Answer this case's prompt, and any prompt its craft reopens, until the craft settles. */
async function answerCase(page, crafted, entry, step) {
  const settled = crafted.then(
    () => 'settled',
    () => 'settled'
  );
  for (let answered = 0; answered < ANSWERS; answered += 1) {
    await assertFooterOffer(page, entry.id);
    await rollPublicly(page, { choice: entry.choice });
    const reopened = page
      .locator(ROLL_PROMPT)
      .first()
      .waitFor({ state: 'visible', timeout: PROMPT_CEILING_MS })
      .then(() => 'reopened');
    if ((await Promise.race([settled, reopened.catch(() => 'settled')])) === 'settled') return;
    process.stdout.write(`  ${step}: the craft reopened its prompt; answering it again\n`);
  }
}

/** One case: craft, answer with its choice, bind to the messages it created, and assert. */
async function runAdvantageCase(ctx, forge, entry) {
  const step = `chat-craft-card-advantage-${entry.id}`;
  let crafted = null;
  try {
    await clearStandingPrompts(ctx.page);
    await writeCaseCheck(ctx.page, forge.systemId, { check: entry.check });
    crafted = craftAndCollect(ctx.page, {
      ...forge,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await answerCase(ctx.page, crafted, entry, step);
    const { messages } = await withinTime(crafted, 60_000, 'the craft never settled');
    const picked = pickCraftCardMessage(messages);
    if (picked.error) throw new Error(picked.error);
    const rolls = await readBackAllRolls(
      ctx.page,
      messages.map((message) => message.id)
    );
    const failures = advantageRollFailures(entry.id, rolls);
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step, passed: true, messageId: picked.message.id });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) {
      await captureAdvantageCard(ctx, entry.id, picked.message.id);
    }
  } catch (error) {
    // A prompt left standing, or one still to mount, would answer the next case's craft instead.
    if (crafted) await abandonCraft(ctx.page, crafted);
    await clearStandingPrompts(ctx.page).catch(() => {});
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

export async function runAdvantageChatCards(ctx) {
  const { cleanup } = ctx.shared;
  process.stdout.write('  Crafting the advantage rule chat card cases (#2007)...\n');
  await clearStandingPrompts(ctx.page).catch(() => {});
  let forge;
  try {
    forge = await seedChatCardForge(ctx.page, cleanup.crafterId, ADVANTAGE_FORGE);
  } catch (error) {
    ctx.results.steps.push({
      step: 'chat-craft-card-advantage-seed',
      passed: false,
      error: error.message,
    });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), forge.recipeId];
  for (const entry of ADVANTAGE_CHAT_CARD_CASES) await runAdvantageCase(ctx, forge, entry);
}

/**
 * Phase E's success-counting chat cards (issue 2006): one dedicated system whose crafting check is
 * rewritten per case, crafted interactively with a public roll, and asserted against the card the
 * execute created and its count Roll. The assertions run in every profile; only the frames are
 * gated behind `RUN_SCREENSHOT_PHASES`.
 */

import {
  COUNT_CHAT_CARD_CASES,
  countCardFailures,
  pickCraftCardMessage,
} from '../../lib/countChatCardEvidence.js';
import {
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
  crafts: COUNT_CHAT_CARD_CASES.length + 1,
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
}

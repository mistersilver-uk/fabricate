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
  craftAndCollect,
  dismissStandingPrompts,
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

/** The footer's Advantage button, present for every case but `off`, which offers none. */
async function assertFooterOffer(page, caseId) {
  const prompt = page.locator(ROLL_PROMPT).last();
  await prompt.waitFor({ state: 'visible', timeout: 15_000 });
  const hasAdvantage = (await prompt.locator('button[data-action="advantage"]').count()) > 0;
  if (caseId === 'off' && hasAdvantage) {
    throw new Error('off: the footer still offers an Advantage button');
  }
  if (caseId !== 'off' && !hasAdvantage) {
    throw new Error(`${caseId}: the footer offers no Advantage button`);
  }
}

/** One case: craft, answer with its choice, bind to the messages it created, and assert. */
async function runAdvantageCase(ctx, forge, entry) {
  const step = `chat-craft-card-advantage-${entry.id}`;
  try {
    await writeCaseCheck(ctx.page, forge.systemId, { check: entry.check });
    const crafted = craftAndCollect(ctx.page, {
      ...forge,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await assertFooterOffer(ctx.page, entry.id);
    await rollPublicly(ctx.page, { choice: entry.choice });
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
    // A prompt left standing would answer the next case's craft instead of its own.
    await dismissStandingPrompts(ctx.page);
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

export async function runAdvantageChatCards(ctx) {
  const { cleanup } = ctx.shared;
  process.stdout.write('  Crafting the advantage rule chat card cases (#2007)...\n');
  await dismissStandingPrompts(ctx.page);
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

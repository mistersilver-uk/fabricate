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
import { chooseSelectOption } from '../pageOps/selectControl.mjs';

const PROMPT = '.manager-modal[data-roll-prompt]';

/** Seed the counting forge, its token and charm, and the crafter's tokens; returns the ids. */
async function seedCountForge(page, crafterId) {
  return await page.evaluate(
    async ({ crafterId, crafts }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const rm = game.fabricate.getRecipeManager();
      const crafter = game.actors.get(crafterId);
      const types = [...(game.documentTypes?.Item ?? [])];
      const type = types.includes('loot') ? 'loot' : types[0] || 'loot';
      const [token, charm] = await Item.createDocuments([
        { name: 'Smoke Count Token', type, img: 'icons/commodities/gems/gem-fragments-red.webp' },
        {
          name: 'Smoke Count Charm',
          type,
          img: 'icons/equipment/neck/amulet-round-engraved-gold.webp',
        },
      ]);
      const system = await csm.createSystem({
        name: 'Smoke Counting Forge',
        description: 'Issue 2006: success-counting chat cards, rolled deterministically.',
      });
      const tokenId = (await csm.addItemFromUuid(system.id, token.uuid)).item.id;
      const charmId = (await csm.addItemFromUuid(system.id, charm.uuid)).item.id;
      await csm.updateSystem(system.id, { resolutionMode: 'simple' });
      const recipe = await rm.createRecipe({
        name: 'Smoke Count Charm',
        description: 'One token, counted into a charm.',
        craftingSystemId: system.id,
        img: charm.img,
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Token',
                options: [{ quantity: 1, match: { type: 'component', componentId: tokenId } }],
              },
            ],
          },
        ],
        resultGroups: [{ name: 'Charm', results: [{ componentId: charmId, quantity: 1 }] }],
      });
      const copy = { name: token.name, type: token.type, img: token.img };
      await crafter.createEmbeddedDocuments(
        'Item',
        Array.from({ length: crafts }, () => ({
          ...copy,
          flags: { core: { sourceId: token.uuid } },
        }))
      );
      return { systemId: system.id, recipeId: recipe.id, itemIds: [token.id, charm.id] };
    },
    { crafterId, crafts: COUNT_CHAT_CARD_CASES.length + 1 }
  );
}

/** Rewrite the forge's check so the next craft rolls one case's configuration. */
async function writeCaseCheck(page, systemId, check) {
  await page.evaluate(
    async ({ systemId, check }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(systemId);
      await csm.updateSystem(systemId, {
        craftingCheck: {
          ...system.craftingCheck,
          enabled: true,
          defaultModifierIds: [],
          simple: { ...system.craftingCheck?.simple, ...check },
        },
      });
    },
    { systemId, check }
  );
}

/**
 * Craft interactively and resolve with the messages that craft created: each one's id, content
 * and first Roll's dice. It settles only once the prompt is answered, so it is started unawaited.
 */
function craftAndCollect(page, { recipeId, crafterId }) {
  return page.evaluate(
    async ({ recipeId, crafterId }) => {
      const before = new Set(game.messages.contents.map((message) => message.id));
      const crafter = game.actors.get(crafterId);
      const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
      await game.fabricate.craft(crafter, recipe, {
        interactive: true,
        componentSourceActors: [crafter],
      });
      const created = () => game.messages.contents.filter((message) => !before.has(message.id));
      const deadline = Date.now() + 10_000;
      while (created().every((m) => !m.content?.includes('fabricate-craft-chat'))) {
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return created().map((message) => {
        const roll = message.rolls?.[0] ?? null;
        const results = roll?.dice?.[0]?.results ?? [];
        return {
          id: message.id,
          content: String(message.content ?? ''),
          roll: roll && {
            className: roll.constructor?.name ?? null,
            results: results.map(({ result, active, success, failure, exploded }) => ({
              result,
              active,
              success,
              failure,
              exploded,
            })),
          },
        };
      });
    },
    { recipeId, crafterId }
  );
}

/** Answer the prompt with a public roll, since only a public card states its evidence. */
async function rollPublicly(page) {
  const prompt = page.locator(PROMPT).first();
  await prompt.waitFor({ state: 'visible', timeout: 15_000 });
  await chooseSelectOption(page, prompt.locator('.mode-field .fabricate-select-trigger'), {
    value: 'publicroll',
  });
  await prompt.locator('button[type="submit"]').click();
  await prompt.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

/** The chat sidebar clipped to one message, each label a literal the capture map can find. */
async function captureCountCard(ctx, caseId, messageId) {
  const { page, screenshot } = ctx;
  await page
    .locator('#sidebar [data-tab="chat"]')
    .first()
    .click({ force: true })
    .catch(() => {});
  const card = page.locator(`[data-message-id="${messageId}"]`).last();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await card.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  const box = await page.locator('#sidebar').first().boundingBox();
  const options = box ? { clip: box } : {};
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
    await writeCaseCheck(ctx.page, forge.systemId, check);
    const crafted = craftAndCollect(ctx.page, {
      ...forge,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    // Awaited below; this keeps a craft abandoned by a failed prompt from rejecting unobserved.
    crafted.catch(() => {});
    await rollPublicly(ctx.page);
    const messages = await crafted;
    const picked = pickCraftCardMessage(messages);
    if (picked.error) throw new Error(picked.error);
    const rollMessages = messages.map((message) => message.roll).filter(Boolean);
    const failures = countCardFailures(id, { card: picked.message.content, rollMessages });
    if (failures.length > 0) throw new Error(failures.join('; '));
    ctx.results.steps.push({ step, passed: true, messageId: picked.message.id });
    if (ctx.profile.RUN_SCREENSHOT_PHASES) await captureCountCard(ctx, id, picked.message.id);
  } catch (error) {
    // A prompt left standing would answer the next case's craft instead of its own.
    await ctx.page.keyboard.press('Escape').catch(() => {});
    ctx.results.steps.push({ step, passed: false, error: String(error?.message ?? error) });
    process.stderr.write(`  ${step} failed: ${error?.message ?? error}\n`);
  }
}

export async function runCountChatCards(ctx) {
  const { cleanup } = ctx.shared;
  process.stdout.write('  Crafting the success-counting chat card cases (#2006)...\n');
  let forge;
  try {
    forge = await seedCountForge(ctx.page, cleanup.crafterId);
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

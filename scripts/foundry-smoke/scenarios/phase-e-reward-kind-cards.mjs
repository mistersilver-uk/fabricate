/**
 * Phase E's reward results (issue 1773): a player-owned dnd5e character crafts a recipe that pays a
 * fixed 3 gp, a `1d4` gp and teaches a recipe, under an `actorProperty` gp ladder and a
 * knowledge-visibility system, once through the versioned public craft and once through the
 * unversioned engine craft. Each path crafts twice: the first credits and grants, the second credits
 * again and records the recipe already known. Asserted in every profile; nothing is captured.
 */

import {
  craftAndCollect,
  dismissStandingPrompts,
  readBackAllRolls,
  withinTime,
} from '../pageOps/chatCardCrafts.mjs';
import { closeOpenApplications } from '../pageOps/pageLifecycle.mjs';

const REWARD_FORGE = Object.freeze({
  name: 'Smoke Reward Forge',
  tokenName: 'Smoke Reward Token',
  // Two crafts on each of the two paths.
  crafts: 4,
});
const FIXED_GP = 3;
const ROLLED_FORMULA = '1d4';
const GP_PATH = 'system.currency.gp';

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

/**
 * The world's currency config, the crafter's gp and learned recipes as they stand, then a gp unit
 * on `system.currency.gp` and a knowledge-visibility forge whose two recipes each pay and teach.
 */
async function seedRewardForge(page, crafterId, forge) {
  return await page.evaluate(
    async ({ crafterId, forge, gpPath, fixed, formula }) => {
      const crafter = game.actors.get(crafterId);
      const snapshot = {
        currency: foundry.utils.deepClone(game.settings.get('fabricate', 'currencyConfig') ?? {}),
        gp: foundry.utils.getProperty(crafter, gpPath) ?? 0,
        learned: foundry.utils.deepClone(
          crafter.getFlag('fabricate', 'fabricate.learnedRecipes') ?? null
        ),
        actor: {
          type: crafter.type,
          system: game.system.id,
          playerOwned: game.users.some(
            (user) => !user.isGM && crafter.testUserPermission(user, 'OWNER')
          ),
        },
      };
      // An `actorProperty` ladder is valid only when every unit names its path, so each world
      // unit keeps its own or takes dnd5e's.
      const units = (snapshot.currency.units ?? [])
        .filter((unit) => unit?.id && unit.id !== 'gp')
        .map((unit) => ({ ...unit, actorPath: unit.actorPath || `system.currency.${unit.id}` }));
      await game.settings.set('fabricate', 'currencyConfig', {
        ...snapshot.currency,
        spendStrategy: 'actorProperty',
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            actorPath: gpPath,
            contains: [],
          },
          ...units,
        ],
      });
      await game.fabricate.getCurrencyConfigStore?.()?.load?.();

      const csm = game.fabricate.getCraftingSystemManager();
      const rm = game.fabricate.getRecipeManager();
      const types = [...(game.documentTypes?.Item ?? [])];
      const [token] = await Item.createDocuments([
        {
          name: forge.tokenName,
          type: types.includes('loot') ? 'loot' : types[0] || 'loot',
          img: 'icons/commodities/gems/gem-fragments-red.webp',
        },
      ]);
      const system = await csm.createSystem({
        name: forge.name,
        description: 'Issue 1773: currency and knowledge rewards.',
      });
      const tokenId = (await csm.addItemFromUuid(system.id, token.uuid)).item.id;
      const created = await csm.getSystem(system.id);
      await csm.updateSystem(system.id, {
        resolutionMode: 'simple',
        visibilityMode: 'knowledge',
        requirements: { ...created.requirements, currency: { enabled: true } },
        craftingCheck: { ...created.craftingCheck, enabled: false },
      });
      const spend = [
        {
          ingredientGroups: [
            {
              name: 'Token',
              options: [{ quantity: 1, match: { type: 'component', componentId: tokenId } }],
            },
          ],
        },
      ];
      const recipeFor = (name, results) =>
        rm.createRecipe({
          name,
          description: 'Issue 1773 smoke.',
          craftingSystemId: system.id,
          img: token.img,
          ingredientSets: spend,
          resultGroups: [{ name: 'Rewards', results }],
        });
      const paths = {};
      for (const path of ['versioned', 'unversioned']) {
        const lore = await recipeFor(`Smoke ${path} lore`, [{ componentId: tokenId, quantity: 1 }]);
        const recipe = await recipeFor(`Smoke ${path} reward`, [
          { id: `${path}-fixed`, kind: 'currency', unit: 'gp', quantity: fixed },
          {
            id: `${path}-rolled`,
            kind: 'currency',
            unit: 'gp',
            quantity: 1,
            quantityFormula: formula,
          },
          { id: `${path}-lore`, kind: 'knowledge', recipeId: lore.id, quantity: 1 },
        ]);
        // The crafter knows the paying recipe, so only the taught one is new to them.
        await game.fabricate.grantRecipeKnowledge({ actorId: crafterId, recipeId: recipe.id });
        paths[path] = { recipeId: recipe.id, recipeName: recipe.name, loreId: lore.id };
      }
      await crafter.createEmbeddedDocuments(
        'Item',
        Array.from({ length: forge.crafts }, () => ({
          name: token.name,
          type: token.type,
          img: token.img,
          flags: { core: { sourceId: token.uuid } },
        }))
      );
      return { snapshot, systemId: system.id, itemIds: [token.id], paths };
    },
    { crafterId, forge, gpPath: GP_PATH, fixed: FIXED_GP, formula: ROLLED_FORMULA }
  );
}

/** Craft through the unversioned engine and resolve with the messages it created. */
function craftUnversioned(page, { recipeId, crafterId }) {
  return page.evaluate(
    async ({ recipeId, crafterId }) => {
      const before = new Set(game.messages.contents.map((message) => message.id));
      const crafter = game.actors.get(crafterId);
      const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
      const answer = await game.fabricate.getCraftingEngine().craft(crafter, [crafter], recipe);
      const created = () => game.messages.contents.filter((message) => !before.has(message.id));
      const deadline = Date.now() + 10_000;
      while (
        created().every((m) => !m.content?.includes('fabricate-craft-chat')) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        messages: created().map((message) => ({
          id: message.id,
          content: String(message.content ?? ''),
        })),
        result: { success: answer?.success ?? null, message: answer?.message ?? null },
      };
    },
    { recipeId, crafterId }
  );
}

/** The crafter's gp, the last credit marker, the learned entry for `loreId` and the latest run. */
async function readCrafter(page, { crafterId, loreId, recipeId }) {
  return await page.evaluate(
    ({ crafterId, loreId, recipeId, gpPath }) => {
      const crafter = game.actors.get(crafterId);
      const run = game.fabricate
        .getCraftingRunManager()
        .getRunHistory(crafter)
        .find((entry) => entry?.recipeId === recipeId);
      return {
        gp: foundry.utils.getProperty(crafter, gpPath) ?? 0,
        marker: foundry.utils.deepClone(crafter._source.flags?.fabricate?.companionEffect ?? null),
        learned: foundry.utils.deepClone(
          crafter.getFlag('fabricate', 'fabricate.learnedRecipes')?.[loreId] ?? null
        ),
        run: run
          ? {
              id: run.id,
              effects: (run.executionJournal?.effects ?? []).map((effect) => effect.effectId),
              credits: run.steps?.[0]?.currencyCredits ?? null,
              grants: run.steps?.[0]?.knowledgeGrants ?? null,
            }
          : null,
      };
    },
    { crafterId, loreId, recipeId, gpPath: GP_PATH }
  );
}

/** Count the actor updates that write the learned-recipes flag while `action` runs. */
async function learnedWritesDuring(page, crafterId, action) {
  await page.evaluate((crafterId) => {
    const counter = { writes: 0 };
    counter.hookId = Hooks.on('updateActor', (actor, diff) => {
      if (
        actor.id === crafterId &&
        foundry.utils.hasProperty(diff, 'flags.fabricate.fabricate.learnedRecipes')
      ) {
        counter.writes += 1;
      }
    });
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle this helper deletes before it returns.
    globalThis.__fabricateSmokeLearnedWrites = counter;
  }, crafterId);
  try {
    const outcome = await action();
    const writes = await page.evaluate(() => globalThis.__fabricateSmokeLearnedWrites.writes);
    return { outcome, writes };
  } finally {
    await page.evaluate(() => {
      const counter = globalThis.__fabricateSmokeLearnedWrites;
      if (counter) Hooks.off('updateActor', counter.hookId);
      delete globalThis.__fabricateSmokeLearnedWrites;
    });
  }
}

/** The one reward card's `1d4` total, after checking it carries one such roll and three reward rows. */
async function rewardCard(page, messages) {
  const cards = messages.filter((message) => message.content.includes('fabricate-craft-chat'));
  if (cards.length !== 1) throw new Error(`the craft posted ${cards.length} crafting cards`);
  const [card] = cards;
  const kinds = [...card.content.matchAll(/data-reward-kind="(\w+)"/g)].map(([, kind]) => kind);
  if (JSON.stringify(kinds) !== JSON.stringify(['currency', 'currency', 'knowledge'])) {
    throw new Error(`the card lists reward rows ${JSON.stringify(kinds)}`);
  }
  const rolls = (await readBackAllRolls(page, [card.id])).filter(
    (roll) => roll.formula === ROLLED_FORMULA
  );
  if (rolls.length !== 1)
    throw new Error(`the card carries ${rolls.length} ${ROLLED_FORMULA} rolls`);
  return rolls[0].total;
}

/** One craft on `path`: what the crafter gained, its card's roll, and the run it recorded. */
async function craftOnce(ctx, forge, path) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  const { recipeId, loreId } = forge.paths[path];
  const before = await readCrafter(page, { crafterId, loreId, recipeId });
  const { outcome, writes } = await learnedWritesDuring(page, crafterId, async () => {
    const crafted =
      path === 'versioned'
        ? craftAndCollect(page, { recipeId, crafterId })
        : craftUnversioned(page, { recipeId, crafterId });
    crafted.catch(() => {});
    return await withinTime(crafted, 60_000, `the ${path} craft never settled`);
  });
  if (outcome.result.success !== true)
    throw new Error(`the ${path} craft failed: ${outcome.result.message}`);
  const total = await rewardCard(page, outcome.messages);
  const after = await readCrafter(page, { crafterId, loreId, recipeId });
  if (after.gp - before.gp !== FIXED_GP + total) {
    throw new Error(`gp rose by ${after.gp - before.gp}, not ${FIXED_GP} + ${total}`);
  }
  if (!after.run || after.run.id === before.run?.id)
    throw new Error(`the ${path} craft recorded no run`);
  const marker = {
    runId: after.run.id,
    effectId: 'award-rewards',
    resultId: `${path}-rolled`,
    index: 1,
  };
  if (JSON.stringify(after.marker) !== JSON.stringify(marker)) {
    throw new Error(
      `the credit marker is ${JSON.stringify(after.marker)}, not ${JSON.stringify(marker)}`
    );
  }
  return { total, writes, after };
}

/** A path's two crafts: credit and grant, then credit again with the recipe already known. */
async function proveRewardPath(ctx, forge, path) {
  const first = await craftOnce(ctx, forge, path);
  // The counter is live only if the grant it watches for registers, so the second craft's zero means.
  if (first.writes < 1)
    throw new Error(`the first craft wrote learned recipes ${first.writes} time(s)`);
  const { learned, run } = first.after;
  if (learned?.granted !== true || learned?.grantedBy !== forge.paths[path].recipeName) {
    throw new Error(`the learned entry is ${JSON.stringify(learned)}`);
  }
  const outcomes = (grants) => (grants ?? []).map((grant) => grant.outcome);
  if (JSON.stringify(outcomes(run.grants)) !== '["granted"]') {
    throw new Error(`the first run records grants ${JSON.stringify(run.grants)}`);
  }
  if ((run.credits ?? []).length !== 2)
    throw new Error(`the first run records credits ${JSON.stringify(run.credits)}`);
  const versioned =
    run.effects.indexOf('award-rewards') === run.effects.indexOf('award-results') + 1;
  if (path === 'versioned' && (!run.effects.includes('award-results') || !versioned)) {
    throw new Error(`the versioned run's effects are ${JSON.stringify(run.effects)}`);
  }
  if (path === 'unversioned' && run.effects.length > 0) {
    throw new Error(`the unversioned run journaled ${JSON.stringify(run.effects)}`);
  }
  const second = await craftOnce(ctx, forge, path);
  if (JSON.stringify(outcomes(second.after.run.grants)) !== '["alreadyKnown"]') {
    throw new Error(`the second run records grants ${JSON.stringify(second.after.run.grants)}`);
  }
  if (second.writes !== 0)
    throw new Error(`the second craft wrote learned recipes ${second.writes} time(s)`);
  if (JSON.stringify(second.after.learned) !== JSON.stringify(learned)) {
    throw new Error(
      `the learned entry moved: ${JSON.stringify(learned)} -> ${JSON.stringify(second.after.learned)}`
    );
  }
  return {
    rolls: [first.total, second.total],
    effects: run.effects,
    learnedWrites: [first.writes, second.writes],
  };
}

async function restoreWorld(ctx, forge) {
  try {
    await ctx.page.evaluate(
      async ({ crafterId, snapshot, gpPath }) => {
        const crafter = game.actors.get(crafterId);
        await game.settings.set('fabricate', 'currencyConfig', snapshot.currency);
        await game.fabricate.getCurrencyConfigStore?.()?.load?.();
        await crafter.update({ [gpPath]: snapshot.gp });
        await crafter.unsetFlag('fabricate', 'companionEffect').catch(() => {});
        // A dotted `unsetFlag` key can silently no-op on V14, so the delete is the forced form.
        const Forced = foundry.data?.operators?.ForcedDeletion;
        const parent = 'flags.fabricate.fabricate';
        await crafter.update(
          Forced
            ? { [`${parent}.learnedRecipes`]: new Forced() }
            : { [`${parent}.-=learnedRecipes`]: null }
        );
        if (snapshot.learned)
          await crafter.setFlag('fabricate', 'fabricate.learnedRecipes', snapshot.learned);
        const restored = crafter.getFlag('fabricate', 'fabricate.learnedRecipes') ?? null;
        if (!foundry.utils.objectsEqual(restored ?? {}, snapshot.learned ?? {})) {
          throw new Error(`learned recipes restored as ${JSON.stringify(restored)}`);
        }
      },
      { crafterId: ctx.shared.cleanup.crafterId, snapshot: forge.snapshot, gpPath: GP_PATH }
    );
  } catch (error) {
    ctx.results.steps.push({ step: 'reward-kinds-restore', passed: false, error: error.message });
  }
}

export async function runRewardKindCards(ctx) {
  const { page } = ctx;
  const { cleanup } = ctx.shared;
  process.stdout.write('  Proving currency and knowledge rewards (#1773)...\n');
  await dismissStandingPrompts(page);
  await closeOpenApplications(page).catch(() => {});
  let forge;
  try {
    forge = { ...REWARD_FORGE, ...(await seedRewardForge(page, cleanup.crafterId, REWARD_FORGE)) };
  } catch (error) {
    ctx.results.steps.push({ step: 'reward-kinds-seed', passed: false, error: error.message });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [
    ...(cleanup.recipeIds || []),
    ...Object.values(forge.paths).flatMap(({ recipeId, loreId }) => [recipeId, loreId]),
  ];
  try {
    await runStep(ctx, 'reward-kinds-crafter', async () => {
      const { actor } = forge.snapshot;
      if (actor.system !== 'dnd5e' || actor.type !== 'character' || !actor.playerOwned) {
        throw new Error(
          `the crafter is not a player-owned dnd5e character: ${JSON.stringify(actor)}`
        );
      }
      return actor;
    });
    await runStep(ctx, 'reward-kinds-versioned', () => proveRewardPath(ctx, forge, 'versioned'));
    await runStep(ctx, 'reward-kinds-unversioned', () =>
      proveRewardPath(ctx, forge, 'unversioned')
    );
  } finally {
    await restoreWorld(ctx, forge);
    await closeOpenApplications(page).catch(() => {});
  }
}

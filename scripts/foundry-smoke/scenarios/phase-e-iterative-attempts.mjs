/**
 * Phase E's Iterative Attempts: an iterative forge whose one-step recipe is started on the GM,
 * then taken three times through `game.fabricate.takeCraftingAction` from a second client joined
 * as the crafter's owning player, one attempt rolling its check. An observer's call is answered
 * with the "needs owner" message, and the player then reads the counters the GM wrote, the Journal
 * listing's workpiece at the GM's revision, and a stale press refused. Asserted in every profile
 * through `page.evaluate` alone; nothing is captured.
 */

import { appendAllowedConsoleErrorPatterns } from '../../lib/foundrySmokeSignal.js';
import { dismissStandingPrompts, withinTime } from '../pageOps/chatCardCrafts.mjs';
import { awaitPageResponsive, openJoinedClient } from '../pageOps/joinedClient.mjs';
import {
  attachConsoleCapture,
  closeOpenApplications,
  suppressFoundryTours,
} from '../pageOps/pageLifecycle.mjs';
import { readAllowedConsoleErrorPatternsCsv } from '../profile.mjs';

const FORGE = Object.freeze({ name: 'Smoke Iterative Forge', ingotName: 'Smoke Iterative Ingot' });
const PLAYER = 'Fabricate Gatherer';
const OBSERVER = 'Fabricate Observer';
const ATTEMPTS = Object.freeze(['stoke', 'hammer', 'stoke']);

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

/** An iterative forge, its one-step recipe consuming one ingot, and one ingot on the crafter. */
async function seedForge(page, crafterId) {
  return await page.evaluate(
    async ({ crafterId, forge }) => {
      const gte = (counterId, value) => ({ source: 'counter', counterId, op: '>=', value });
      const action = (id, extra) => ({
        id,
        label: id,
        categories: [],
        usesSession: true,
        availability: { combine: 'all', rules: [] },
        costs: [],
        check: 'none',
        effects: [],
        ...extra,
      });
      const heatUp = (id, when) => ({
        id,
        when,
        target: { kind: 'counter', counterId: 'heat' },
        op: 'add',
        amount: '1',
      });
      const csm = game.fabricate.getCraftingSystemManager();
      const rm = game.fabricate.getRecipeManager();
      const types = [...(game.documentTypes?.Item ?? [])];
      const type = types.includes('loot') ? 'loot' : types[0] || 'loot';
      const [ingot] = await Item.createDocuments([
        { name: forge.ingotName, type, img: 'icons/commodities/metal/ingot-iron.webp' },
      ]);
      const system = await csm.createSystem({ name: forge.name, description: 'Iterative smoke.' });
      const ingotId = (await csm.addItemFromUuid(system.id, ingot.uuid)).item.id;
      const created = await csm.getSystem(system.id);
      await csm.updateSystem(system.id, {
        resolutionMode: 'iterative',
        // the player must see the recipe for its check to be public, so the facade posts the player's own roll
        visibilityMode: 'global',
        features: { ...created.features, chatOutput: true, multiStepRecipes: false },
        craftingCheck: {
          ...created.craftingCheck,
          routed: {
            rollFormula: '1d20',
            type: 'fixed',
            fixedOutcomes: [
              { id: 'miss', name: 'Miss', success: false, start: 1, end: 9 },
              { id: 'hit', name: 'Hit', success: true, start: 10, end: 20 },
            ],
          },
        },
        iterative: {
          version: 1,
          counters: [
            { id: 'heat', label: 'Heat', limit: 'none' },
            { id: 'fuel', label: 'Fuel', limit: 'global', min: 0, max: 10 },
          ],
          actions: [
            action('stoke', {
              costs: [{ id: 'burn', counterId: 'fuel', amount: '1', needsEnough: true }],
              effects: [heatUp('warm', { combine: 'all' })],
            }),
            action('hammer', {
              check: 'roll',
              effects: [heatUp('strike', { combine: 'all', success: true })],
            }),
          ],
        },
      });
      const recipe = await rm.createRecipe({
        name: 'Smoke iterative blade',
        description: 'Three attempts at the anvil.',
        craftingSystemId: system.id,
        img: ingot.img,
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Ingot',
                options: [{ quantity: 1, match: { type: 'component', componentId: ingotId } }],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Blade',
            producedWhen: [{ end: 'success', rules: [] }],
            results: [{ componentId: ingotId, quantity: 1 }],
          },
        ],
        iterative: {
          counters: [
            { counterId: 'heat', start: 0, visible: true },
            { counterId: 'fuel', start: 6, visible: true },
          ],
          step: {
            actions: { mode: 'all', actionIds: [] },
            hiddenCounterIds: [],
            lockedCounterIds: [],
            success: [gte('heat', 10)],
            failure: [],
          },
        },
      });
      const crafter = game.actors.get(crafterId);
      await crafter.createEmbeddedDocuments('Item', [
        { name: ingot.name, type, img: ingot.img, flags: { core: { sourceId: ingot.uuid } } },
      ]);
      return { systemId: system.id, recipeId: recipe.id, itemIds: [ingot.id] };
    },
    { crafterId, forge: FORGE }
  );
}

/** The run's counters as `page` reads them, freshly from the actor flag. */
async function readCounters(page, { crafterId, runId }) {
  return await page.evaluate(
    ({ crafterId, runId }) => {
      const crafter = game.actors.get(crafterId);
      const manager = game.fabricate.getCraftingRunManager();
      manager.invalidateCache?.(crafter.id);
      const run = manager.getActiveRun(crafter, runId);
      return {
        counters: foundry.utils.deepClone(run?.steps?.[0]?.iterative?.counters ?? null),
        runRevision: run?.runRevision ?? null,
        log: run?.steps?.[0]?.iterative?.log?.length ?? 0,
      };
    },
    { crafterId, runId }
  );
}

async function joinAs(page, userLabel) {
  const sinks = { consoleErrors: [], waivedConsoleErrors: [], consoleLog: [] };
  const waivers = appendAllowedConsoleErrorPatterns(
    [/favicon/i],
    readAllowedConsoleErrorPatternsCsv()
  );
  const { context, clientPage } = await openJoinedClient(page, userLabel, {
    prepareContext: suppressFoundryTours,
    preparePage: (clientPage) => attachConsoleCapture(clientPage, waivers, sinks),
  });
  return { context, clientPage, errors: () => [...sinks.consoleErrors] };
}

/**
 * One `takeCraftingAction` from `clientPage`, answering the reply's facts and the chat messages
 * it added: `posted`, and the last message's roll count and whether this client's user wrote it.
 */
async function takeFrom(clientPage, { crafterId, runId, actionId, attemptId, expectedRevision }) {
  return await clientPage.evaluate(
    async ({ crafterId, runId, actionId, attemptId, expectedRevision }) => {
      const before = game.messages.size;
      const reply = await game.fabricate.takeCraftingAction({
        actorId: crafterId,
        runId,
        actionId,
        attemptId,
        expectedRevision,
        interactive: false,
      });
      const last = game.messages.contents.at(-1);
      return {
        success: reply?.success ?? null,
        reason: reply?.reason ?? null,
        message: reply?.message ?? null,
        attempt: reply?.iterative?.attempt?.attempt ?? null,
        checked: (reply?.iterative?.attempt?.check ?? null) !== null,
        posted: game.messages.size - before,
        lastRolls: last?.rolls?.length ?? 0,
        lastByMe: last?.author?.id === game.user.id,
        needsOwner: game.i18n.localize('FABRICATE.App.Journal.Actions.NeedsOwner'),
      };
    },
    { crafterId, runId, actionId, attemptId, expectedRevision }
  );
}

/** The workpiece the Journal listing offers `page`'s user, freshly read: what D-20 asserts of it. */
async function readListing(page, { crafterId, runId }) {
  return await page.evaluate(
    ({ crafterId, runId }) => {
      game.fabricate.getCraftingRunManager().invalidateCache?.(crafterId);
      const listing = game.fabricate.listJournalForActor({ rememberedActorId: crafterId });
      const run = (listing?.activeRuns ?? []).find((entry) => entry.id === runId);
      return {
        found: Boolean(run),
        iterative: Boolean(run?.iterative),
        takeAction: run?.actions?.takeAction ?? null,
        sessions: run?.iterative?.sessions?.length ?? null,
        runRevision: run?.runRevision ?? null,
      };
    },
    { crafterId, runId }
  );
}

async function proveStarted(ctx, forge) {
  const { crafterId } = ctx.shared.cleanup;
  const started = await withinTime(
    ctx.page.evaluate(
      async ({ crafterId, recipeId }) => {
        const crafter = game.actors.get(crafterId);
        const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
        const result = await game.fabricate.craft(crafter, recipe, {
          interactive: false,
          componentSourceActors: [crafter],
        });
        return {
          success: result?.success ?? null,
          runId: result?.runId ?? null,
          message: result?.message ?? null,
        };
      },
      { crafterId, recipeId: forge.recipeId }
    ),
    60_000,
    'the iterative start never answered'
  );
  if (started.success !== true || !started.runId) {
    throw new Error(`the start failed: ${started.message}`);
  }
  const read = await readCounters(ctx.page, { crafterId, runId: started.runId });
  if (
    JSON.stringify(read.counters) !==
    '[{"counterId":"heat","value":0},{"counterId":"fuel","value":6}]'
  ) {
    throw new Error(`the started state holds ${JSON.stringify(read.counters)}`);
  }
  return { runId: started.runId };
}

async function proveObserverRefused(ctx, staged) {
  const before = await readCounters(ctx.page, {
    ...staged,
    crafterId: ctx.shared.cleanup.crafterId,
  });
  const observer = await joinAs(ctx.page, OBSERVER);
  try {
    const reply = await takeFrom(observer.clientPage, {
      ...staged,
      crafterId: ctx.shared.cleanup.crafterId,
      actionId: 'stoke',
    });
    if (reply.success !== false || reply.message !== reply.needsOwner) {
      throw new Error(`the observer was answered ${JSON.stringify(reply)}`);
    }
    const errors = observer.errors();
    if (errors.length > 0) throw new Error(`the observer client logged: ${errors.join(' | ')}`);
    const after = await readCounters(ctx.page, {
      ...staged,
      crafterId: ctx.shared.cleanup.crafterId,
    });
    if (after.runRevision !== before.runRevision)
      throw new Error('the observer call changed the run');
    return { message: reply.message };
  } finally {
    await observer.context.close().catch(() => {});
  }
}

/** A checked attempt's roll is posted once, by the player; an unchecked one posts nothing. */
function assertPosted(actionId, reply) {
  const posted =
    actionId === 'hammer'
      ? reply.posted === 1 && reply.lastRolls === 1 && reply.lastByMe
      : reply.posted === 0;
  if (!posted) throw new Error(`${actionId} posted ${JSON.stringify(reply)}`);
}

/** The player's listing offers the workpiece, with its three sessions, at the GM's revision. */
function assertListing(listing, gm) {
  const ok =
    listing.found &&
    listing.iterative &&
    listing.takeAction === true &&
    listing.sessions === ATTEMPTS.length &&
    listing.runRevision === gm.runRevision;
  if (!ok) throw new Error(`the player's listing holds ${JSON.stringify(listing)}`);
}

/** A fresh attempt of the unchecked action at the pre-attempt revision is stale, and changes nothing. */
async function proveStale(ctx, player, staged, expectedRevision) {
  const { crafterId } = ctx.shared.cleanup;
  const before = await readCounters(ctx.page, { ...staged, crafterId });
  const reply = await withinTime(
    takeFrom(player.clientPage, {
      ...staged,
      crafterId,
      actionId: 'stoke',
      attemptId: `smoke-stale-${Date.now()}`,
      expectedRevision,
    }),
    60_000,
    'the stale attempt never answered'
  );
  const after = await readCounters(ctx.page, { ...staged, crafterId });
  if (
    reply.success !== false ||
    reply.reason !== 'stale-run' ||
    reply.posted !== 0 ||
    after.runRevision !== before.runRevision
  ) {
    throw new Error(`the stale attempt was answered ${JSON.stringify({ reply, before, after })}`);
  }
}

async function provePlayerAttempts(ctx, staged) {
  const { crafterId } = ctx.shared.cleanup;
  const player = await joinAs(ctx.page, PLAYER);
  const started = Date.now();
  try {
    const preAttempt = await readCounters(ctx.page, { ...staged, crafterId });
    const replies = [];
    for (const actionId of ATTEMPTS) {
      const reply = await withinTime(
        takeFrom(player.clientPage, { ...staged, crafterId, actionId }),
        60_000,
        `the ${actionId} attempt never answered`
      );
      if (reply.success !== true) throw new Error(`${actionId} refused: ${reply.reason}`);
      assertPosted(actionId, reply);
      replies.push(reply);
    }
    if (!replies[1].checked) throw new Error('the hammer attempt carried no check');
    const gm = await readCounters(ctx.page, { ...staged, crafterId });
    const seen = await readCounters(player.clientPage, { ...staged, crafterId });
    if (
      gm.log !== ATTEMPTS.length ||
      JSON.stringify(seen.counters) !== JSON.stringify(gm.counters)
    ) {
      throw new Error(`the player reads ${JSON.stringify(seen)} against ${JSON.stringify(gm)}`);
    }
    assertListing(await readListing(player.clientPage, { ...staged, crafterId }), gm);
    await proveStale(ctx, player, staged, preAttempt.runRevision);
    const errors = player.errors();
    if (errors.length > 0) throw new Error(`the player client logged: ${errors.join(' | ')}`);
    const wallMs = Date.now() - started;
    process.stdout.write(`  Iterative attempts walk: ${wallMs} ms\n`);
    return { wallMs, counters: gm.counters };
  } finally {
    await player.context.close().catch(() => {});
  }
}

export async function runIterativeAttempts(ctx) {
  const { page } = ctx;
  const { cleanup } = ctx.shared;
  process.stdout.write('  Proving Iterative Attempts...\n');
  await dismissStandingPrompts(page);
  let forge;
  try {
    forge = await seedForge(page, cleanup.crafterId);
  } catch (error) {
    ctx.results.steps.push({
      step: 'iterative-attempts-seed',
      passed: false,
      error: error.message,
    });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), forge.recipeId];
  try {
    let staged = null;
    await runStep(ctx, 'iterative-attempts-start', async () => {
      staged = await proveStarted(ctx, forge);
      return staged;
    });
    await runStep(ctx, 'iterative-attempts-observer-refused', () => {
      if (!staged) throw new Error('the iterative run never started');
      return proveObserverRefused(ctx, staged);
    });
    await runStep(ctx, 'iterative-attempts-player', () => {
      if (!staged) throw new Error('the iterative run never started');
      return provePlayerAttempts(ctx, staged);
    });
  } finally {
    await closeOpenApplications(page).catch(() => {});
    await awaitPageResponsive(page).catch((error) => {
      ctx.results.steps.push({
        step: 'iterative-attempts-gm-responsive',
        passed: false,
        error: error.message,
      });
    });
  }
}

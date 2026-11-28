/**
 * Phase E's award-time pick (issue 1773): a one-stage recipe whose results hold a group the player
 * chooses up to three from (a charm, 5 gp and a taught recipe) and a group a `1d1+9` selection
 * draws from, crafted through the Journal command. An observer's `chooseAward` is refused; the pick
 * of all three is then sent from a second client joined as the crafter's owning player while the
 * GM stays connected, and re-sent under the same request. Both joined clients' consoles are gated.
 * Asserted in every profile; nothing is captured.
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

const AWARD_FORGE = Object.freeze({
  name: 'Smoke Award Choice Forge',
  tokenName: 'Smoke Award Token',
  charmName: 'Smoke Award Charm',
});
const PLAYER = 'Fabricate Gatherer';
const OBSERVER = 'Fabricate Observer';
const GP_PATH = 'system.currency.gp';
const CREDIT = 5;
const PICK_ID = 'smoke-award-pick';
const PICKS = Object.freeze(['charm', 'coin', 'lore']);
// The stage's own charm and the `1d1+9` draw's three, which only a total of 10 reaches.
const STAGE_CHARMS = 1 + 3;
const DRAW_SELECTIONS = '[{"alternativeId":"high","roll":{"formula":"1d1+9","total":10}}]';
const POLL_MS = 250;
const DWELL_MS = 1500;

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
 * A gp ladder on `system.currency.gp`, a knowledge-visibility forge whose recipe holds the two
 * groups, and one token on the crafter; answers what it changed, so the walk can restore it.
 */
async function seedAwardForge(page, crafterId, forge) {
  return await page.evaluate(
    async ({ crafterId, forge, gpPath, credit, pickId }) => {
      const crafter = game.actors.get(crafterId);
      const snapshot = {
        currency: foundry.utils.deepClone(game.settings.get('fabricate', 'currencyConfig') ?? {}),
        learned: foundry.utils.deepClone(
          crafter.getFlag('fabricate', 'fabricate.learnedRecipes') ?? null
        ),
        gp: foundry.utils.getProperty(crafter, gpPath) ?? null,
      };
      const units = (snapshot.currency.units ?? [])
        .filter((unit) => unit?.id && unit.id !== 'gp')
        .map((unit) => ({ ...unit, actorPath: unit.actorPath || `system.currency.${unit.id}` }));
      await game.settings.set('fabricate', 'currencyConfig', {
        ...snapshot.currency,
        spendStrategy: 'actorProperty',
        units: [
          { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: gpPath, contains: [] },
          ...units,
        ],
      });
      await game.fabricate.getCurrencyConfigStore?.()?.load?.();
      const csm = game.fabricate.getCraftingSystemManager();
      const rm = game.fabricate.getRecipeManager();
      const types = [...(game.documentTypes?.Item ?? [])];
      const type = types.includes('loot') ? 'loot' : types[0] || 'loot';
      const [token, charm] = await Item.createDocuments([
        { name: forge.tokenName, type, img: 'icons/commodities/gems/gem-fragments-red.webp' },
        {
          name: forge.charmName,
          type,
          img: 'icons/equipment/neck/amulet-round-engraved-gold.webp',
        },
      ]);
      const system = await csm.createSystem({
        name: forge.name,
        description: 'Issue 1773: a reward the player picks.',
      });
      const tokenId = (await csm.addItemFromUuid(system.id, token.uuid)).item.id;
      const charmId = (await csm.addItemFromUuid(system.id, charm.uuid)).item.id;
      const created = await csm.getSystem(system.id);
      await csm.updateSystem(system.id, {
        resolutionMode: 'simple',
        visibilityMode: 'knowledge',
        features: { ...created.features, chatOutput: true },
        requirements: { ...created.requirements, currency: { enabled: true } },
        craftingCheck: { ...created.craftingCheck, enabled: false },
      });
      const ingredientSets = [
        {
          ingredientGroups: [
            {
              name: 'Token',
              options: [{ quantity: 1, match: { type: 'component', componentId: tokenId } }],
            },
          ],
        },
      ];
      const lore = await rm.createRecipe({
        name: 'Smoke award lore',
        description: 'Taught by the award pick.',
        craftingSystemId: system.id,
        img: charm.img,
        ingredientSets,
        resultGroups: [{ name: 'Charm', results: [{ componentId: charmId, quantity: 1 }] }],
      });
      const recipe = await rm.createRecipe({
        name: 'Smoke award choice',
        description: 'One token, a charm, a drawn reward and a reward to pick.',
        craftingSystemId: system.id,
        img: charm.img,
        ingredientSets,
        resultGroups: [
          {
            name: 'Rewards',
            results: [
              { id: 'smoke-charm', componentId: charmId, quantity: 1 },
              {
                id: pickId,
                chooser: 'playerChooses',
                awardStrategy: 'upTo',
                awardCount: 3,
                alternatives: [
                  { id: 'charm', componentId: charmId, quantity: 1 },
                  { id: 'coin', kind: 'currency', unit: 'gp', quantity: credit },
                  { id: 'lore', kind: 'knowledge', recipeId: lore.id, quantity: 1 },
                ],
              },
              {
                id: 'smoke-award-draw',
                chooser: 'rolled',
                awardStrategy: 'anyOne',
                selectionFormula: '1d1+9',
                alternatives: [
                  {
                    id: 'low',
                    componentId: charmId,
                    quantity: 2,
                    selectionRange: { from: 1, to: 5 },
                  },
                  {
                    id: 'high',
                    componentId: charmId,
                    quantity: 3,
                    selectionRange: { from: 6, to: 10 },
                  },
                ],
              },
            ],
          },
        ],
      });
      // The crafter knows the recipe it crafts, so only the taught one is new.
      await game.fabricate.grantRecipeKnowledge({ actorId: crafterId, recipeId: recipe.id });
      await crafter.createEmbeddedDocuments('Item', [
        {
          name: token.name,
          type: token.type,
          img: token.img,
          flags: { core: { sourceId: token.uuid } },
        },
      ]);
      return {
        snapshot,
        systemId: system.id,
        recipeId: recipe.id,
        loreId: lore.id,
        itemIds: [token.id, charm.id],
        recipeIds: [recipe.id, lore.id],
      };
    },
    { crafterId, forge, gpPath: GP_PATH, credit: CREDIT, pickId: PICK_ID }
  );
}

/**
 * The crafter's charms with each stack's stored source and quantity, gp and learned entry, its
 * latest run of the recipe with the stage's consumption, and the card count.
 */
async function readWorld(page, { crafterId, recipeId, loreId, charmName }) {
  return await page.evaluate(
    ({ crafterId, recipeId, loreId, charmName, gpPath }) => {
      const crafter = game.actors.get(crafterId);
      const manager = game.fabricate.getCraftingRunManager();
      manager.invalidateCache?.(crafter.id);
      const run = [...manager.getActiveRuns(crafter), ...manager.getRunHistory(crafter)].find(
        (entry) => entry?.recipeId === recipeId
      );
      const [step] = run?.steps ?? [];
      const charms = crafter.items.contents.filter((item) => item.name === charmName);
      return {
        charms: charms.reduce((sum, item) => sum + (Number(item.system?.quantity) || 1), 0),
        charmStacks: charms.map((item) => ({
          id: item.id,
          quantity: item._source.system?.quantity ?? null,
          compendiumSource: item._stats?.compendiumSource ?? null,
          duplicateSource: item._stats?.duplicateSource ?? null,
          // The stored flag, read past any accessor a release lays over a migrated `sourceId`.
          sourceId:
            Object.getOwnPropertyDescriptor(item._source.flags?.core ?? {}, 'sourceId')?.value ??
            null,
        })),
        gp: Number(foundry.utils.getProperty(crafter, gpPath) ?? 0),
        learned: crafter.getFlag('fabricate', 'fabricate.learnedRecipes')?.[loreId] ?? null,
        cards: game.messages.contents.filter((message) =>
          String(message.content ?? '').includes('fabricate-craft-chat')
        ).length,
        awardRows: game.messages.contents.filter((message) =>
          String(message.content ?? '').includes('data-reward-kind="awardChoice"')
        ).length,
        run: run
          ? {
              id: run.id,
              status: run.status,
              runRevision: run.runRevision,
              awardChoiceJournal: run.awardChoiceJournal?.status ?? null,
              choice: foundry.utils.deepClone(
                (step?.pendingAwardChoices ?? []).find(
                  (entry) => entry.choiceId === 'smoke-award-pick'
                )
              ),
              groupAwards: foundry.utils.deepClone(step?.groupAwards ?? []),
              consumedSummary: foundry.utils.deepClone(
                step?.preparedConsumption?.consumedSummary ?? null
              ),
            }
          : null,
      };
    },
    { crafterId, recipeId, loreId, charmName, gpPath: GP_PATH }
  );
}

/**
 * `readWorld` every 250 ms: the first read `expect` holds on, else the last at `timeout`. With
 * `minDwell`, a negative check: the first read `expect` fails on, else the last after `minDwell`.
 */
export async function readSettled(page, args, expect, { timeout = 10_000, minDwell = 0 } = {}) {
  const started = Date.now();
  for (;;) {
    const read = await readWorld(page, args);
    const holds = expect(read);
    const elapsed = Date.now() - started;
    if (minDwell > 0 ? !holds || elapsed >= minDwell : holds || elapsed >= timeout) return read;
    await page.waitForTimeout(POLL_MS);
  }
}

/** The message of the first `[holds, message]` check that does not hold, else null. */
function firstFault(checks) {
  return checks.find(([holds]) => !holds)?.[1] ?? null;
}

/** A poll predicate over a step's fault function: held exactly when it finds no fault. */
function held(fault) {
  return (read) => fault(read) === null;
}

/** A charm stack at a stored quantity of 0 or less, or a stack `before` held that is gone or fell. */
export function ledgerFault(before, read) {
  const spent = read.charmStacks.find(({ quantity: q }) => Number.isFinite(q) && q <= 0);
  if (spent) return `charm stack ${spent.id} stores quantity ${spent.quantity}`;
  const now = new Map(read.charmStacks.map(({ id, quantity }) => [id, quantity]));
  const gone = before.charmStacks.find(({ id }) => !now.has(id));
  if (gone) return `charm stack ${gone.id} vanished`;
  const fell = before.charmStacks.find(
    ({ id, quantity: q }) => Number.isFinite(q) && Number.isFinite(now.get(id)) && q > now.get(id)
  );
  return fell ? `charm stack ${fell.id} fell from ${fell.quantity} to ${now.get(fell.id)}` : null;
}

/** What the stage step asserts of its read after the craft; null when all of it holds. */
export function stageFault(before, read) {
  const { run } = read;
  if (!run) return 'no run of the recipe is recorded';
  const draw = run.groupAwards.find((entry) => entry.choiceId === 'smoke-award-draw');
  const rows = read.awardRows - before.awardRows;
  const charms = read.charms - before.charms;
  return (
    ledgerFault(before, read) ??
    firstFault([
      [run.status === 'succeeded', `the run is ${run.status}`],
      [
        Boolean(run.choice) && run.choice.settledAt == null,
        `the pick is ${JSON.stringify(run.choice)}`,
      ],
      [rows === 1, `the stage card carries ${rows} award rows`],
      [charms === STAGE_CHARMS, `the stage awarded ${charms} charms, not ${STAGE_CHARMS}`],
      [
        JSON.stringify(draw?.selections) === DRAW_SELECTIONS,
        `the draw recorded ${JSON.stringify(draw)}`,
      ],
      [read.gp === before.gp && !read.learned, 'the pick awarded before it was made'],
    ])
  );
}

/** What the pick step asserts of its read after the settle; null when all of it holds. */
export function pickFault(before, staged, read) {
  const { run } = read;
  if (!run) return 'no run of the recipe is recorded';
  const { choice } = run;
  const settledAward = run.groupAwards.find((entry) => entry.choiceId === PICK_ID);
  const awarded = (settledAward?.selections ?? []).map((entry) => entry.alternativeId);
  const gp = read.gp - before.gp;
  const charms = read.charms - before.charms;
  const cards = read.cards - before.cards;
  return (
    ledgerFault(before, read) ??
    firstFault([
      [gp === CREDIT, `gp rose by ${gp}`],
      [read.learned?.granted === true, `learned: ${JSON.stringify(read.learned)}`],
      [charms === 1, `the picked charm awarded ${charms}`],
      [
        choice?.outcome === 'awarded' && JSON.stringify(choice.picks) === JSON.stringify(PICKS),
        `the choice settled ${JSON.stringify(choice)}`,
      ],
      [awarded.join(',') === PICKS.join(','), `the group award is ${JSON.stringify(settledAward)}`],
      [run.awardChoiceJournal === 'committed', `the award journal is ${run.awardChoiceJournal}`],
      [run.runRevision > staged.revision, 'the run revision did not advance'],
      [cards === 1, `${cards} cards posted`],
    ])
  );
}

/** The observer's refusal must leave gp and the run revision as `before` had them. */
export function observerFault(before, read) {
  if (!read.run) return 'no run of the recipe is recorded';
  const unchanged = read.gp === before.gp && read.run.runRevision === before.run.runRevision;
  return unchanged ? null : 'the refused settle changed the run';
}

/** The replay must leave gp, charms, cards and every charm stack as the pick left them. */
export function replayFault(after, read) {
  if (!read.run) return 'no run of the recipe is recorded';
  const unchanged =
    read.gp === after.gp && read.charms === after.charms && read.cards === after.cards;
  return ledgerFault(after, read) ?? (unchanged ? null : 'awarded again');
}

/**
 * The pick's read: the first `fault` finds nothing in, then held across a dwell, so a late award
 * from this settle is named at the pick and not by the replay. Answers the read and its fault.
 */
export async function settlePick(page, args, fault) {
  const after = await readSettled(page, args, held(fault));
  const failure = fault(after);
  if (failure) return { read: after, failure };
  const rested = await readSettled(page, args, held(fault), { minDwell: DWELL_MS });
  return { read: rested, failure: fault(rested) };
}

/** One read's charm ledger: the count, each stack, and the stage's recorded consumption. */
function charmLedger(read) {
  return {
    charms: read.charms,
    stacks: read.charmStacks,
    consumed: read.run?.consumedSummary ?? null,
  };
}

/** A step failure that carries the charm ledger, so a red run names its class of fault. */
function ledgerError(message, ledger) {
  return new Error(`${message}; charm ledger ${JSON.stringify(ledger)}`);
}

/** The run's Journal projection as the GM reads it, and a refused dismissal. */
async function readJournal(page, { crafterId, runId }) {
  return await page.evaluate(
    async ({ crafterId, runId }) => {
      const crafter = game.actors.get(crafterId);
      const listing = await game.fabricate.listJournalForActor({ rememberedActorId: crafter.id });
      const model = listing.activeRuns.find((run) => run.id === runId) ?? null;
      const dismissal = await game.fabricate.dismissJournalRun({
        actorUuid: crafter.uuid,
        runType: 'crafting',
        runId,
      });
      return {
        listedActive: Boolean(model),
        pending: model?.awardChoicePending === true,
        chooseAward: model?.actions?.chooseAward === true,
        dismiss: model?.actions?.dismiss === true,
        dismissal: dismissal?.reason ?? null,
      };
    },
    { crafterId, runId }
  );
}

/**
 * A second client joined as `userLabel` with Fabricate ready, its console and page errors gated by
 * the run's waivers; `errors()` answers the unwaived ones. `openJoinedClient` closes it on failure.
 */
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

/** `chooseAward` of `PICKS` sent from `clientPage` under `requestId`; resolves to its reply. */
async function chooseFrom(clientPage, { actorUuid, runId, expectedRevision, requestId }) {
  return await clientPage.evaluate(
    async ({ actorUuid, runId, expectedRevision, pickId, picks, requestId }) =>
      await game.fabricate.executeJournalRunCommand(
        {
          actorUuid,
          runType: 'crafting',
          runId,
          expectedRevision,
          action: 'chooseAward',
          requestId,
          payload: { choiceId: pickId, picks },
        },
        { interactive: false }
      ),
    { actorUuid, runId, expectedRevision, pickId: PICK_ID, picks: [...PICKS], requestId }
  );
}

/** Fail on any unwaived console or page error a joined client raised. */
function assertCleanConsole(client, label) {
  const errors = client.errors();
  if (errors.length > 0) throw new Error(`the ${label} client logged: ${errors.join(' | ')}`);
}

/** Craft through the Journal command: the stage commits owing the pick and the draw has landed. */
async function proveStageOwesPick(ctx, forge) {
  const { page } = ctx;
  const { crafterId } = ctx.shared.cleanup;
  const before = await readWorld(page, { crafterId, ...forge });
  const ledger = { before: charmLedger(before) };
  const answer = await withinTime(
    page.evaluate(
      async ({ crafterId, recipeId }) => {
        const crafter = game.actors.get(crafterId);
        const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
        const result = await game.fabricate.craft(crafter, recipe, {
          interactive: false,
          componentSourceActors: [crafter],
        });
        return {
          success: result?.success ?? null,
          message: result?.message ?? null,
          awardChoicePending: result?.awardChoicePending === true,
        };
      },
      { crafterId, recipeId: forge.recipeId }
    ),
    60_000,
    'the award craft never settled'
  );
  if (answer.success !== true) throw ledgerError(`the craft failed: ${answer.message}`, ledger);
  if (!answer.awardChoicePending) {
    throw ledgerError('the craft reply names no pending pick', ledger);
  }
  const fault = (read) => stageFault(before, read);
  const after = await readSettled(page, { crafterId, ...forge }, held(fault));
  ledger.after = charmLedger(after);
  const stageFailure = fault(after);
  if (stageFailure) throw ledgerError(stageFailure, ledger);
  const journal = await readJournal(page, { crafterId, runId: after.run.id });
  if (!journal.listedActive || !journal.pending || !journal.chooseAward || journal.dismiss) {
    throw ledgerError(`the Journal projects ${JSON.stringify(journal)}`, ledger);
  }
  if (journal.dismissal !== 'award-choice-pending') {
    throw ledgerError(`dismissal answered ${journal.dismissal}`, ledger);
  }
  const actorUuid = await page.evaluate((id) => game.actors.get(id).uuid, crafterId);
  const { id: runId, runRevision: revision } = after.run;
  return { runId, actorUuid, revision, charms: after.charms, ledger };
}

/** An observer who does not own the crafter is refused `owner-required`, and nothing changes. */
async function proveObserverRefused(ctx, forge, staged, requestId) {
  const { page } = ctx;
  const args = { crafterId: ctx.shared.cleanup.crafterId, ...forge };
  const before = await readWorld(page, args);
  const observer = await joinAs(page, OBSERVER);
  try {
    const refused = await withinTime(
      chooseFrom(observer.clientPage, {
        ...staged,
        expectedRevision: before.run.runRevision,
        requestId: `${requestId}-observer`,
      }),
      60_000,
      'the observer settle never answered'
    );
    if (refused?.reason !== 'owner-required') {
      throw new Error(`the observer was answered ${JSON.stringify(refused)}`);
    }
    const fault = (read) => observerFault(before, read);
    const after = await readSettled(page, args, held(fault), { minDwell: DWELL_MS });
    const observerFailure = fault(after);
    if (observerFailure) throw new Error(observerFailure);
    assertCleanConsole(observer, 'observer');
    return { reason: refused.reason };
  } finally {
    await observer.context.close().catch(() => {});
  }
}

/**
 * The player's pick of all three: credited, taught, one charm created, recorded once with one
 * card and holding across a 1.5 s dwell, and a replay awarding nothing.
 */
async function provePlayerPick(ctx, forge, staged, requestId) {
  const { page } = ctx;
  const args = { crafterId: ctx.shared.cleanup.crafterId, ...forge };
  const before = await readWorld(page, args);
  const ledger = { before: charmLedger(before) };
  const player = await joinAs(page, PLAYER);
  const expectedRevision = before.run.runRevision;
  const send = () => chooseFrom(player.clientPage, { ...staged, expectedRevision, requestId });
  try {
    const settled = await withinTime(send(), 60_000, 'the player settle never answered');
    if (settled?.success !== true) {
      const reason = `${settled?.reason} ${settled?.message ?? ''}`;
      throw ledgerError(`the settle was refused: ${reason}`, ledger);
    }
    const fault = (read) => pickFault(before, staged, read);
    const { read: after, failure: pickFailure } = await settlePick(page, args, fault);
    ledger.after = charmLedger(after);
    if (pickFailure) throw ledgerError(pickFailure, ledger);
    const replay = await withinTime(send(), 60_000, 'the replayed settle never answered');
    const replayed = (read) => replayFault(after, read);
    const again = await readSettled(page, args, held(replayed), { minDwell: DWELL_MS });
    ledger.replay = charmLedger(again);
    const replayFailure = replayed(again);
    if (replayFailure) {
      throw ledgerError(`the replay (${JSON.stringify(replay)}) ${replayFailure}`, ledger);
    }
    assertCleanConsole(player, 'player');
    return { replayed: replay?.success === true, replayReason: replay?.reason ?? null, ledger };
  } finally {
    await player.context.close().catch(() => {});
  }
}

/** The currency ladder, the crafter's gp, learned recipes and charms, as they were. */
async function restoreWorld(ctx, { crafterId, snapshot, charmName }) {
  try {
    await ctx.page.evaluate(
      async ({ crafterId, snapshot, charmName, gpPath }) => {
        await game.settings.set('fabricate', 'currencyConfig', snapshot.currency);
        await game.fabricate.getCurrencyConfigStore?.()?.load?.();
        const crafter = game.actors.get(crafterId);
        await crafter.unsetFlag('fabricate', 'fabricate.learnedRecipes').catch(() => {});
        if (snapshot.learned) {
          await crafter.update({ 'flags.fabricate.fabricate.learnedRecipes': snapshot.learned });
        }
        if (snapshot.gp !== null) await crafter.update({ [gpPath]: snapshot.gp });
        const charms = crafter.items.contents.filter((item) => item.name === charmName);
        if (charms.length > 0) {
          await crafter.deleteEmbeddedDocuments(
            'Item',
            charms.map((item) => item.id)
          );
        }
      },
      { crafterId, snapshot, charmName, gpPath: GP_PATH }
    );
  } catch (error) {
    ctx.results.steps.push({ step: 'award-choice-restore', passed: false, error: error.message });
  }
}

export async function runAwardChoice(ctx) {
  const { page } = ctx;
  const { cleanup } = ctx.shared;
  process.stdout.write('  Proving the award-time pick (#1773)...\n');
  await dismissStandingPrompts(page);
  let forge;
  try {
    forge = { ...AWARD_FORGE, ...(await seedAwardForge(page, cleanup.crafterId, AWARD_FORGE)) };
  } catch (error) {
    ctx.results.steps.push({ step: 'award-choice-seed', passed: false, error: error.message });
    return;
  }
  cleanup.executionSystemIds = [...(cleanup.executionSystemIds || []), forge.systemId];
  cleanup.executionItemIds = [...(cleanup.executionItemIds || []), ...forge.itemIds];
  cleanup.recipeIds = [...(cleanup.recipeIds || []), ...forge.recipeIds];
  // Per run, so a reused world's ledger never answers this run's settle as another session's.
  const requestId = `smoke-award-choose-${Date.now()}`;
  try {
    let staged = null;
    await runStep(ctx, 'award-choice-stage', async () => {
      staged = await proveStageOwesPick(ctx, forge);
      return staged;
    });
    await runStep(ctx, 'award-choice-observer-refused', () => {
      if (!staged) throw new Error('the stage never owed a pick');
      return proveObserverRefused(ctx, forge, staged, requestId);
    });
    await runStep(ctx, 'award-choice-player-pick', () => {
      if (!staged) throw new Error('the stage never owed a pick');
      return provePlayerPick(ctx, forge, staged, requestId);
    });
  } finally {
    const { snapshot, charmName } = forge;
    await restoreWorld(ctx, { crafterId: cleanup.crafterId, snapshot, charmName });
    await closeOpenApplications(page).catch(() => {});
    await awaitPageResponsive(page).catch((error) => {
      ctx.results.steps.push({
        step: 'award-choice-gm-responsive',
        passed: false,
        error: error.message,
      });
    });
  }
}

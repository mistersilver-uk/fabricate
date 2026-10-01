/**
 * Issue 2008 — additional dice on the GM-evaluated paths: the prepare-time snapshot and offer, the
 * decision allowlists, the sender's right to spend, the refusal and spent-dice replies, and the
 * spend's place inside the authority's request deduplication (AD25–AD32, AD69). The Journal
 * command service runs over the real authority and an in-memory ledger; dice come from the
 * core-faithful double and the resource is a stored path whose `update` writes what it reads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { compileFunction } from 'node:vm';

import { promptJournalStageCheck } from '../src/bootstrap/journalOperations.js';
import { publicAdvantageOffer } from '../src/systems/checkAdvantage.js';
import {
  evaluatePreparedCraftingCheck,
  evaluatePreparedRunCheck,
  runFormulaPassFail,
} from '../src/systems/checkRoll.js';
import { countDecisionPolicy, preparedCountEvaluation } from '../src/systems/countCheck.js';
import { CountRollRefusal } from '../src/systems/countRoll.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { safeRollDecision } from '../src/systems/journalPreparedCheck.js';
import { createJournalRunAuthority } from '../src/systems/journalRunAuthority.js';
import {
  createGatheringJournalRunOperations,
  createJournalRunCommandService,
  createManagerMutation,
} from '../src/systems/journalRunCommands.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import {
  authorizedPreparedDecision,
  preparedDecisionPolicy,
  validatedPreparedDecision,
} from '../src/systems/preparedDecisionPolicy.js';
import { resolvedComponentsFor } from '../src/systems/scopedEntityReads.js';
import { resolveAlchemySubmissions } from '../src/utils/alchemySubmissions.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation, preparedCountCheck } from './helpers/countFixtures.js';

const PATH = 'system.resources.focus.value';
const PAID = Object.freeze({
  enabled: true,
  source: 'path',
  path: PATH,
  readMacroUuid: '',
  spendMacroUuid: '',
  max: 3,
  label: 'Focus',
});
const PLAYER = Object.freeze({ id: 'player', isGM: false });
const GM = Object.freeze({ id: 'gm', isGM: true });
const OTHER_GM = Object.freeze({ id: 'gm-2', isGM: true });
const USERS = new Map([PLAYER, GM, OTHER_GM].map((user) => [user.id, user]));

const walk = (object, path) =>
  String(path)
    .split('.')
    .reduce((node, key) => node?.[key], object);

const saved = {};
beforeEach(() => {
  for (const key of ['foundry', 'game', 'fromUuid']) saved[key] = globalThis[key];
  const utils = {
    getProperty: walk,
    hasProperty: (object, path) => walk(object, path) !== undefined,
  };
  Object.assign(globalThis, { foundry: { utils }, game: { user: GM } });
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key];
    else Object.assign(globalThis, { [key]: value });
  }
});

/**
 * An actor holding `focus` at {@link PATH} in `_source`, owned by the player; only `writers` may
 * update it, and `veto` makes `update` resolve `undefined`, as a refused write does.
 */
function heroWith(focus, { writers = ['player', 'gm'], veto = false } = {}) {
  const source = { system: { resources: { focus: { value: focus } } } };
  const writes = [];
  const actor = {
    uuid: 'Actor.hero',
    name: 'Hero',
    _source: source,
    overrides: {},
    getRollData: () => ({}),
    testUserPermission: (user, level) => level === 'OWNER' && user?.id === 'player',
    canUserModify: (user, action) => action === 'update' && writers.includes(user?.id),
    async update(patch) {
      writes.push(patch[PATH]);
      if (veto) return undefined;
      source.system.resources.focus.value = patch[PATH];
      return actor;
    },
  };
  return { actor, writes, focus: () => source.system.resources.focus.value };
}

/** A prepared simple count check (2d10 at ≥ 8, needing 1) whose snapshot pays with `paid`. */
function paidPreparation(paid = PAID, overrides = {}) {
  const evaluation = countEvaluation({ additionalDice: { ...paid } });
  const prepared = preparedCountCheck({ evaluation, count: { additionalDice: { ...paid } } });
  return { ...prepared, ...overrides };
}

/** A decision buying `dice` beside the offer a prepare token binds (limit 3 of 3 by default). */
function bound(dice, offer = {}) {
  const base = { available: 3, limit: 3, max: 3, resourceLabel: 'Focus', unavailable: null };
  return { additionalDice: dice, additionalDiceOffer: { ...base, reach: null, ...offer } };
}

const COUNT_PROMPT = Object.freeze({
  label: 'Steep tea',
  product: 'count',
  direction: 'over',
  comparison: 'meet',
  pool: 2,
  die: 10,
  threshold: 8,
  required: 1,
  allowsSituationalModifier: true,
  allowAdvantage: false,
});

async function withDice(faces, body) {
  const dice = installCountDice({ faces });
  try {
    return await body(dice);
  } finally {
    dice.restore();
  }
}

/** The real Journal authority over an in-memory ledger, electing `active.gm`. */
function memoryAuthority(active) {
  const store = { ledger: null, ids: 0 };
  return createJournalRunAuthority({
    currentUser: () => GM,
    activeGM: () => active.gm,
    randomId: () => `secret-${(store.ids += 1)}`,
    listLedgers: async () => (store.ledger ? [store.ledger] : []),
    listLedgerRecords: async () => (store.ledger ? [{ id: 'ledger', createdTime: 1 }] : []),
    createLedger: async ({ state }) => {
      store.ledger = { id: 'ledger', state: structuredClone(state), claim: null };
      return store.ledger;
    },
    readState: async () => structuredClone(store.ledger.state),
    writeState: async (_ledger, state) => {
      store.ledger.state = structuredClone(state);
    },
    createClaim: async (_ledger, claim) => {
      if (store.ledger.claim) throw new Error('claim-held');
      store.ledger.claim = structuredClone(claim);
      return store.ledger.claim;
    },
    readClaim: async () => store.ledger.claim,
    deleteClaim: async (_ledger, claimId) => {
      if (store.ledger.claim?.claimId !== claimId) return false;
      store.ledger.claim = null;
      return true;
    },
    reconstructExecutions: async () => ({ success: true }),
  });
}

/**
 * The elected GM's command service for `actor`, with one crafting run whose check `describe`
 * answers and whose stage `stage` executes; `evaluated` records every evaluator call.
 */
function gmService({ actor, describe, stage, evaluate = null, onGetRun = () => {} }) {
  const active = { gm: GM };
  const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
  const evaluated = [];
  const stages = [];
  let ids = 0;
  const service = createJournalRunCommandService({
    authority: memoryAuthority(active),
    operations: {
      crafting: {
        getRun: () => (onGetRun(active), run),
        describeCheck: async () => describe(),
        evaluateCheck: async (args) => {
          evaluated.push(args);
          return (evaluate ?? defaultEvaluate)(args);
        },
        execute: async (args) => {
          stages.push(args);
          return stage(args);
        },
      },
    },
    currentUser: () => GM,
    activeGM: () => active.gm,
    getUser: (id) => USERS.get(id) ?? null,
    resolveUuid: async (uuid) => (uuid === actor.uuid ? actor : null),
    emit: () => {},
    randomId: () => `request-${(ids += 1)}`,
  });
  return { service, evaluated, stages, active };
}

function defaultEvaluate({ actor, privateEvaluation, decision, sender }) {
  return evaluatePreparedRunCheck(privateEvaluation, actor, decision, { user: sender });
}

/** The prepared evaluator, recording each call into `evaluated`. */
function recordingEvaluate(evaluated) {
  return (args) => {
    evaluated.push(args);
    return defaultEvaluate(args);
  };
}

const completed = () => ({ success: true, runId: 'run-1', status: 'completed', runRevision: 4 });

let requests = 0;
/** One player request to the GM, as the socket delivers it; `payload` rides along. */
function playerRequest(service, payload = {}, requestId = `player-${(requests += 1)}`) {
  return service.handleRequest(
    {
      requestId,
      sessionId: 'player-tab',
      actorUuid: 'Actor.hero',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
      payload,
    },
    'player'
  );
}

/** Describes, then executes with the player's `rollDecision`; answers both replies. */
async function describeThenExecute(service, rollDecision) {
  const described = await playerRequest(service);
  assert.equal(described.checkRequired, true, JSON.stringify(described));
  const executed = await playerRequest(service, {
    prepareToken: described.prepareToken,
    rollDecision,
  });
  return { described, executed };
}

const paidDescriptor = (overrides = {}) => ({
  required: true,
  publicPrompt: { ...COUNT_PROMPT },
  privateEvaluation: paidPreparation(),
  ...overrides,
});

// ── the snapshot, the policy and the decision allowlists ─────────────────────

describe('the prepared snapshot and the decision allowlists', () => {
  test('a count check snapshots its additional dice only while enabled, and execute replays it', () => {
    const evaluation = normalizeCheckEvaluation(countEvaluation({ additionalDice: { ...PAID } }));
    const policy = {
      die: 10,
      direction: 'over',
      resolved: { base: 2, threshold: 8 },
      comparison: 'meet',
    };
    const captured = countDecisionPolicy(evaluation, policy, 1);
    assert.deepEqual(captured.additionalDice, PAID);
    assert.deepEqual(
      preparedCountEvaluation(captured).rollOptions.evaluation.pool.additionalDice,
      PAID
    );
    const off = normalizeCheckEvaluation(
      countEvaluation({ additionalDice: { ...PAID, enabled: false } })
    );
    assert.equal(
      'additionalDice' in countDecisionPolicy(off, policy, 1),
      false,
      'a disabled record captures nothing'
    );
  });

  test('the policy binds only the allowlisted offer, and no key at all without one', () => {
    const offer = {
      available: 4,
      limit: 3,
      max: 3,
      resourceLabel: ' Focus ',
      unavailable: null,
      reach: null,
    };
    const policy = preparedDecisionPolicy({
      additionalDiceOffer: { ...offer, path: PATH, readMacroUuid: 'Macro.x' },
    });
    assert.deepEqual(policy.additionalDiceOffer, { ...offer, resourceLabel: 'Focus' });
    assert.equal(JSON.stringify(policy).includes(PATH), false, 'no path is ever bound');
    assert.equal('additionalDiceOffer' in preparedDecisionPolicy({}), false);
  });

  // AD25, AD26, AD32 (previews never cross).
  test('both decision allowlists carry the bought dice as sent and never a preview count', () => {
    const forged = { additionalDice: 2, simulatedAdditionalDice: 5 };
    assert.deepEqual(safeRollDecision(forged), {
      bonus: null,
      rollMode: null,
      advantage: null,
      modifierIds: null,
      additionalDice: 2,
    });
    assert.deepEqual(validatedPreparedDecision(forged, null, null), {
      bonus: null,
      advantage: null,
      rollMode: null,
      additionalDice: 2,
    });
    assert.equal(
      safeRollDecision({ additionalDice: -1 }).additionalDice,
      -1,
      'kept to refuse, never clamped'
    );
    assert.equal('additionalDice' in safeRollDecision({}), false, 'an absent count adds no key');
  });

  test('bought dice the bound offer excludes refuse with their reason, never clamped', () => {
    const offer = {
      available: 1,
      limit: 1,
      max: 1,
      resourceLabel: 'Focus',
      unavailable: null,
      reach: null,
    };
    const refusal = (decision) =>
      authorizedPreparedDecision(decision).additionalDiceRefusal ?? null;
    assert.equal(refusal({ additionalDice: 2 }), 'notOffered');
    assert.equal(refusal({ additionalDice: 2, additionalDiceOffer: offer }), 'choiceAboveLimit');
    assert.equal(
      refusal({
        additionalDice: 1,
        additionalDiceOffer: { ...offer, unavailable: 'resourceNotWritable' },
      }),
      'resourceNotWritable'
    );
    assert.equal(refusal({ additionalDice: 1, additionalDiceOffer: offer }), null);
    assert.equal(refusal({ additionalDice: 0 }), null);
    const refused = authorizedPreparedDecision({ additionalDice: 2, additionalDiceOffer: offer });
    assert.equal(refused.additionalDice, 2, 'the count is kept as chosen');
    assert.deepEqual(refused.additionalDiceNotice, {
      dice: 2,
      limit: 1,
      available: 1,
      label: 'Focus',
      source: null,
    });
  });
});

// ── the prepared evaluator ──────────────────────────────────────────────────

describe('the prepared evaluator spends for the sender, from the snapshot', () => {
  // AD31.
  test('a forged count above the snapshot max refuses and is never clamped', async () => {
    const { actor, writes } = heroWith(20);
    await withDice([9, 3], async (dice) => {
      const result = await evaluatePreparedRunCheck(
        paidPreparation({ ...PAID, max: 1 }),
        actor,
        bound(20, { limit: 1, max: 1 }),
        { user: PLAYER }
      );
      assert.equal(result.cancelled, true);
      assert.equal(result.additionalDiceRefusal, 'choiceAboveLimit');
      assert.deepEqual(writes, [], 'nothing spent');
      assert.deepEqual(dice.constructed, [], 'nothing rolled');
    });
  });

  // AD31: the bound offer's limit is not trusted alone.
  test('a choice inside the bound offer still refuses when a fresh read affords less', async () => {
    const { actor, writes } = heroWith(1);
    const offer = {
      available: 2,
      limit: 2,
      max: 3,
      resourceLabel: 'Focus',
      unavailable: null,
      reach: null,
    };
    await withDice([9, 3], async () => {
      const result = await evaluatePreparedRunCheck(
        paidPreparation(),
        actor,
        { additionalDice: 2, additionalDiceOffer: offer },
        { user: PLAYER }
      );
      assert.equal(result.additionalDiceRefusal, 'choiceAboveLimit');
      assert.deepEqual(writes, []);
    });
  });

  // AD28 at the evaluator.
  test("writability is the sender's, never the executing GM's", async () => {
    const { actor, writes } = heroWith(3, { writers: ['gm'] });
    await withDice([9, 3, 8], async () => {
      const result = await evaluatePreparedRunCheck(paidPreparation(), actor, bound(1), {
        user: PLAYER,
      });
      assert.equal(result.additionalDiceRefusal, 'resourceNotWritable');
      assert.deepEqual(writes, []);
    });
  });

  // AD32: `checkRoll.js:525` keeps the refusal and the notice facts.
  test('a refused spend leaves the evaluator cancelled with its reason and notice facts', async () => {
    const { actor, writes, focus } = heroWith(3, { veto: true });
    await withDice([9, 3, 8], async (dice) => {
      const result = await evaluatePreparedRunCheck(paidPreparation(), actor, bound(1), {
        user: PLAYER,
      });
      assert.equal(result.cancelled, true);
      assert.equal(result.additionalDiceRefusal, 'spendRefused');
      assert.equal(result.additionalDiceNotice.label, 'Focus');
      assert.deepEqual(writes, [2], 'the write was attempted');
      assert.equal(focus(), 3, 'and vetoed');
      assert.deepEqual(dice.constructed, [], 'so no main Roll');
    });
  });

  // AD30.
  test('execute replays the snapshot, not the authored record it was taken from', async () => {
    const { actor, writes } = heroWith(5);
    const preparation = paidPreparation();
    preparation.checkConfig.evaluation.pool.additionalDice = {
      ...PAID,
      max: 1,
      path: 'system.other',
    };
    await withDice([9, 3, 8, 1], async () => {
      const result = await evaluatePreparedRunCheck(preparation, actor, bound(2), { user: PLAYER });
      assert.equal(result.engineEvaluated, true, JSON.stringify(result));
      assert.deepEqual(writes, [3], 'two units from the snapshot path, under the snapshot max');
      assert.deepEqual(result.data.boughtDice, { count: 2, source: 'path' });
    });
  });

  test('a secret check keeps its bought dice inside the authority, and its refusal too', async () => {
    const { actor } = heroWith(3);
    await withDice([9, 3, 8], async () => {
      const result = await evaluatePreparedRunCheck(paidPreparation(), actor, bound(1), {
        user: PLAYER,
        secret: true,
      });
      assert.deepEqual(result.data.boughtDice, { count: 1, source: 'path' });
      assert.equal(result.secret, true);
    });
    const vetoed = heroWith(3, { veto: true });
    await withDice([9, 3, 8], async () => {
      const result = await evaluatePreparedRunCheck(paidPreparation(), vetoed.actor, bound(1), {
        user: PLAYER,
        secret: true,
      });
      assert.equal(result.additionalDiceRefusal, 'spendRefused');
    });
  });

  test('a summed check refuses bought dice it never offers, and says so', async () => {
    await withDice([], async (dice) => {
      const result = await runFormulaPassFail({
        formula: '1d20',
        dc: 10,
        actor: { getRollData: () => ({}) },
        rollOptions: { additionalDice: 2 },
      });
      assert.equal(result.cancelled, true);
      assert.equal(result.additionalDiceRefusal, 'notOffered');
      assert.deepEqual(dice.constructed, []);
    });
  });
});

// ── the Journal command over the real authority ─────────────────────────────

describe('the Journal command offers, validates and spends on the claim holder', () => {
  test("the describe attaches the sender's allowlisted offer, with the simple needed count", async () => {
    const { actor } = heroWith(2);
    const { service } = gmService({ actor, describe: () => paidDescriptor(), stage: completed });
    const described = await playerRequest(service);
    const offer = described.promptDescriptor.additionalDiceOffer;
    assert.deepEqual(
      { ...offer, reach: null },
      { available: 2, limit: 2, max: 3, resourceLabel: 'Focus', unavailable: null, reach: null }
    );
    assert.deepEqual(offer.reach, { needed: 1, perDieMost: 1, explode: 'off', rescued: false });
    assert.equal(JSON.stringify(described).includes(PATH), false, 'no path reaches the player');
  });

  // AD28 at the describe: the GM could write, the sender cannot.
  test('the offer is read for the sender, so a resource only the GM may change is unavailable', async () => {
    const { actor } = heroWith(2, { writers: ['gm'] });
    const { service } = gmService({ actor, describe: () => paidDescriptor(), stage: completed });
    const offer = (await playerRequest(service)).promptDescriptor.additionalDiceOffer;
    assert.equal(offer.unavailable, 'resourceNotWritable');
    assert.equal(offer.limit, 0);
  });

  // AD32: reach is the one R3 switch, and prepared routed or progressive checks state no count.
  for (const [name, descriptor, expected] of [
    [
      'an unentitled (redacted) prompt',
      { publicPrompt: { allowsSituationalModifier: true } },
      null,
    ],
    ['a secret prompt', { privateEvaluation: paidPreparation(PAID, { secret: true }) }, null],
    [
      'a prepared routed check',
      { privateEvaluation: paidPreparation(PAID, { slot: 'routed', mode: 'routedByCheck' }) },
      'no-needed',
    ],
    [
      'a prepared progressive check',
      { privateEvaluation: paidPreparation(PAID, { slot: 'progressive', mode: 'progressive' }) },
      'no-needed',
    ],
  ]) {
    test(`${name} offers ${expected ? 'a reach with no needed count' : 'no reach'}`, async () => {
      const { actor } = heroWith(2);
      const { service } = gmService({
        actor,
        describe: () => paidDescriptor(descriptor),
        stage: completed,
      });
      const offer = (await playerRequest(service)).promptDescriptor.additionalDiceOffer;
      assert.equal(offer.limit, 2, 'the budget is still offered');
      if (expected) assert.equal(offer.reach.needed, null);
      else assert.equal(offer.reach, null);
    });
  }

  // AD26, AD27: the player's count survives the client allowlist and the token-policy merge.
  test("the prompt's count reaches the evaluator beside the bound policy, and is spent", async () => {
    const { actor, writes, focus } = heroWith(3);
    const active = { gm: GM };
    const authority = memoryAuthority(active);
    const evaluated = [];
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    let ids = 0;
    const operations = {
      crafting: {
        getRun: () => run,
        describeCheck: async () => paidDescriptor(),
        evaluateCheck: recordingEvaluate(evaluated),
        execute: async () => completed(),
      },
    };
    const shared = {
      authority,
      operations,
      activeGM: () => active.gm,
      getUser: (id) => USERS.get(id) ?? null,
      resolveUuid: async () => actor,
      randomId: () => `wire-${(ids += 1)}`,
    };
    let player = null;
    const gm = createJournalRunCommandService({
      ...shared,
      currentUser: () => GM,
      emit: (reply) => player.acceptReply(reply, 'gm'),
    });
    player = createJournalRunCommandService({
      ...shared,
      currentUser: () => PLAYER,
      emit: (request) => gm.handleSocketMessage(request, 'player'),
      promptCheck: async (descriptor) => {
        assert.equal(descriptor.additionalDiceOffer.limit, 3);
        return { confirmed: true, additionalDice: 2, simulatedAdditionalDice: 9 };
      },
    });
    await withDice([9, 3, 8, 1], async () => {
      const settled = await player.executeJournalRunCommand({
        actorUuid: actor.uuid,
        runType: 'crafting',
        runId: run.id,
        expectedRevision: 3,
        action: 'execute',
      });
      assert.equal(settled.success, true, JSON.stringify(settled));
    });
    const { decision } = evaluated[0];
    assert.equal(decision.additionalDice, 2, "the player's count");
    assert.equal(decision.additionalDiceOffer.limit, 3, 'beside the bound offer');
    assert.equal('simulatedAdditionalDice' in decision, false);
    assert.deepEqual(writes, [1]);
    assert.equal(focus(), 1);
  });

  // AD32: a refusal is its own reply, never a dismissal or a roll that could not happen.
  test('a refused spend answers additional-dice-refused with its reason and notice facts', async () => {
    const { actor } = heroWith(3, { veto: true });
    const { service, stages } = gmService({
      actor,
      describe: () => paidDescriptor(),
      stage: completed,
    });
    await withDice([9, 3, 8], async () => {
      const { executed } = await describeThenExecute(service, { additionalDice: 1 });
      assert.deepEqual(executed, {
        success: false,
        reason: 'additional-dice-refused',
        additionalDiceRefusal: 'spendRefused',
        additionalDiceNotice: {
          dice: 1,
          limit: 3,
          available: 3,
          label: 'Focus',
          source: 'path',
          actorName: 'Hero',
        },
      });
    });
    assert.equal(stages.length, 0, 'the stage never runs');
  });

  // AD32: the active-GM check runs before the evaluation, never after the spend.
  test('an authority that lost the election spends nothing', async () => {
    const { actor, writes } = heroWith(3);
    let lookups = 0;
    const { service, evaluated } = gmService({
      actor,
      describe: () => paidDescriptor(),
      stage: completed,
      onGetRun: (active) => {
        lookups += 1;
        if (lookups === 2) active.gm = OTHER_GM;
      },
    });
    await withDice([9, 3, 8], async () => {
      const { executed } = await describeThenExecute(service, { additionalDice: 1 });
      assert.equal(executed.reason, 'active-gm-required');
    });
    assert.equal(evaluated.length, 0, 'never evaluated');
    assert.deepEqual(writes, []);
  });

  // AD32: releasing the check spends nothing.
  test('a dismissed prompt releases the check and spends nothing', async () => {
    const { actor, writes } = heroWith(3);
    const active = { gm: GM };
    let ids = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const evaluated = [];
    const service = createJournalRunCommandService({
      authority: memoryAuthority(active),
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => paidDescriptor(),
          evaluateCheck: recordingEvaluate(evaluated),
          execute: async () => completed(),
        },
      },
      currentUser: () => GM,
      activeGM: () => active.gm,
      getUser: (id) => USERS.get(id) ?? null,
      resolveUuid: async () => actor,
      emit: () => {},
      randomId: () => `release-${(ids += 1)}`,
      promptCheck: async () => ({ confirmed: false, additionalDice: 2 }),
    });
    const result = await service.executeJournalRunCommand({
      actorUuid: actor.uuid,
      runType: 'crafting',
      runId: run.id,
      expectedRevision: 3,
      action: 'execute',
    });
    assert.deepEqual(result, { success: false, cancelled: true, reason: 'roll-cancelled' });
    assert.equal(evaluated.length, 0);
    assert.deepEqual(writes, []);
  });

  // AD29.
  test('a replayed settled request answers its stored reply and never spends again', async () => {
    const { actor, writes } = heroWith(3);
    const { service, evaluated } = gmService({
      actor,
      describe: () => paidDescriptor(),
      stage: completed,
    });
    await withDice([9, 3, 8, 9, 3, 8], async () => {
      const described = await playerRequest(service);
      const payload = { prepareToken: described.prepareToken, rollDecision: { additionalDice: 1 } };
      const first = await playerRequest(service, payload, 'replayed');
      const again = await playerRequest(service, payload, 'replayed');
      assert.equal(first.success, true, JSON.stringify(first));
      assert.deepEqual(again, first);
    });
    assert.equal(evaluated.length, 1);
    assert.deepEqual(writes, [2], 'one spend');
  });

  // AD69.
  for (const [name, stage, reason] of [
    ['refuses', () => ({ success: false, message: 'The crafting stage inputs are stale' }), null],
    [
      'throws',
      () => {
        throw new Error('stage exploded');
      },
      'operation-failed',
    ],
  ]) {
    test(`a stage that ${name} after the spend keeps it and says what was spent`, async () => {
      const { actor, focus } = heroWith(3);
      const { service } = gmService({ actor, describe: () => paidDescriptor(), stage });
      await withDice([9, 3, 8, 1], async () => {
        const { executed } = await describeThenExecute(service, { additionalDice: 2 });
        assert.equal(executed.success, false);
        if (reason) assert.equal(executed.reason, reason);
        assert.equal(executed.boughtDice, 2);
        assert.deepEqual(executed.additionalDiceNotice, {
          dice: 2,
          label: 'Focus',
          source: 'path',
          actorName: 'Hero',
        });
      });
      assert.equal(focus(), 1, 'never refunded');
    });
  }

  test('a stage that commits a failed outcome is not a spent-and-lost roll', async () => {
    const { actor } = heroWith(3);
    const failed = () => ({
      ...completed(),
      success: false,
      disposition: 'failed',
      status: 'failed',
    });
    const { service } = gmService({ actor, describe: () => paidDescriptor(), stage: failed });
    await withDice([1, 1, 1], async () => {
      const { executed } = await describeThenExecute(service, { additionalDice: 1 });
      assert.equal(executed.disposition, 'failed');
      assert.equal('boughtDice' in executed, false);
    });
  });

  test('a roll refused after the spend answers its sentence with the dice spent', async () => {
    const { actor, focus } = heroWith(3);
    const { service } = gmService({ actor, describe: () => paidDescriptor(), stage: completed });
    await withDice([], async (dice) => {
      // As Foundry's explosion recursion limit refuses a Roll that has already been paid for.
      dice.CountRoll.prototype.evaluate = async () => {
        throw new CountRollRefusal('explode-unbounded', 'explode');
      };
      const { executed } = await describeThenExecute(service, { additionalDice: 1 });
      assert.equal(executed.reason, 'roll-unavailable', JSON.stringify(executed));
      assert.equal(executed.boughtDice, 1);
    });
    assert.equal(focus(), 2);
  });

  test('the non-interactive Journal command buys only the dice its caller names', async () => {
    for (const [options, expected] of [
      [{ interactive: false, additionalDice: 1 }, [2]],
      [{ interactive: false }, []],
    ]) {
      const { actor, writes } = heroWith(3);
      const { service } = gmService({ actor, describe: () => paidDescriptor(), stage: completed });
      await withDice([9, 3, 8], async () => {
        const settled = await service.executeJournalRunCommand(
          {
            actorUuid: actor.uuid,
            runType: 'crafting',
            runId: 'run-1',
            expectedRevision: 3,
            action: 'execute',
          },
          options
        );
        assert.equal(settled.success, true, JSON.stringify(settled));
      });
      assert.deepEqual(writes, expected);
    }
  });

  test('a blind gathering check settled without a prompt rolls with no bought dice', async () => {
    const { actor, writes } = heroWith(3);
    const descriptor = paidDescriptor({
      publicPrompt: { label: '', product: 'count', pool: null, required: null },
      privateEvaluation: paidPreparation(PAID, {
        secret: true,
        slot: 'routed',
        mode: 'routedByCheck',
      }),
    });
    const { service, evaluated } = gmService({
      actor,
      describe: () => descriptor,
      stage: completed,
    });
    await withDice([9, 3], async (dice) => {
      const settled = await service.executeJournalRunCommand(
        {
          actorUuid: actor.uuid,
          runType: 'crafting',
          runId: 'run-1',
          expectedRevision: 3,
          action: 'execute',
        },
        { interactive: false }
      );
      assert.equal(settled.success, true, JSON.stringify(settled));
      assert.deepEqual(dice.formulas(), ['2d10']);
    });
    assert.equal('additionalDice' in evaluated[0].decision, false);
    assert.deepEqual(writes, []);
  });
});

// ── the activities' own evaluators forward the sender ───────────────────────

describe('crafting and gathering evaluate for the attested sender (AD28)', () => {
  function craftingCheckOperations(fabricate) {
    const source = readFileSync(
      new URL('../src/bootstrap/journalOperations.js', import.meta.url),
      'utf8'
    );
    const start = source.indexOf('async function resolveJournalSourceActors(');
    const end = source.indexOf('export function createJournalCommandsForFabricate(', start);
    const names = [
      'resolveAlchemySubmissions',
      'resolvedComponentsFor',
      'createManagerMutation',
      'publicAdvantageOffer',
      'evaluatePreparedCraftingCheck',
    ];
    return compileFunction(
      `${source.slice(start, end)}\nreturn createCraftingJournalOperations;`,
      names
    )(
      resolveAlchemySubmissions,
      resolvedComponentsFor,
      createManagerMutation,
      publicAdvantageOffer,
      evaluatePreparedCraftingCheck
    )(fabricate, () => null);
  }

  test('crafting refuses a spend on an actor the sender may not change, though the GM may', async () => {
    const { actor, writes } = heroWith(3, { writers: ['gm'] });
    Object.assign(globalThis, { fromUuid: async () => actor });
    const operations = craftingCheckOperations({
      recipeManager: { getRecipe: () => ({ id: 'recipe', craftingSystemId: 'system' }) },
      recipeVisibilityService: { getVisibleRecipes: () => [{ recipe: { id: 'recipe' } }] },
    });
    await withDice([9, 3, 8], async () => {
      const result = await operations.evaluateCheck({
        actor,
        privateEvaluation: paidPreparation(PAID, { recipeId: 'recipe' }),
        decision: bound(1),
        sender: PLAYER,
      });
      assert.equal(result.additionalDiceRefusal, 'resourceNotWritable');
    });
    assert.deepEqual(writes, []);
  });

  test('gathering forwards the sender to the prepared evaluator', async () => {
    const { actor, writes } = heroWith(3, { writers: ['gm'] });
    const engine = new GatheringEngine({ localize: (key) => key });
    engine.installVersionedRunAuthority({ evaluatePreparedRunCheck });
    const operations = createGatheringJournalRunOperations({ engine });
    await withDice([9, 3, 8], async () => {
      const result = await operations.evaluateCheck({
        actor,
        privateEvaluation: paidPreparation(),
        decision: bound(1),
        sender: PLAYER,
      });
      assert.equal(result.additionalDiceRefusal, 'resourceNotWritable');
    });
    assert.deepEqual(writes, []);
  });

  test('the Journal prompt adapter passes only the allowlisted offer', async () => {
    let prompted = null;
    const offer = {
      available: 2,
      limit: 2,
      max: 3,
      resourceLabel: 'Focus',
      unavailable: null,
      reach: null,
    };
    await promptJournalStageCheck(
      { ...COUNT_PROMPT, additionalDiceOffer: { ...offer, path: PATH } },
      async (options) => (prompted = options)
    );
    assert.deepEqual(prompted.additionalDiceOffer, offer);
    await promptJournalStageCheck({ ...COUNT_PROMPT }, async (options) => (prompted = options));
    assert.equal('additionalDiceOffer' in prompted, false);
  });
});

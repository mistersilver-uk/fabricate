/**
 * Issue 2008 — bought dice through the count engine and the immediate paths of all three
 * activities: the read before the decision, the spend just before the main Roll, the refusal
 * channel every cancelled site keeps, the bought-dice evidence and the preview seam (AD13–AD24,
 * AD66–AD68, AD70). Dice come from the core-faithful double; the resource is a stored path on a
 * fake actor whose `update` writes the `_source` it reads, or a read/spend script macro pair.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { checkRequest, evaluateCountCheckRoll } from '../src/systems/countCheckRoll.js';
import { CountRollRefusal } from '../src/systems/countRoll.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation } from './helpers/countFixtures.js';
import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import {
  GatheringDocumentActor,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';

const PATH = 'system.resources.momentum.value';
const PAID = { enabled: true, source: 'path', path: PATH, max: 3, label: 'Momentum' };
const MACROS = {
  enabled: true,
  source: 'macro',
  readMacroUuid: 'Macro.read',
  spendMacroUuid: 'Macro.spend',
  max: 3,
  label: '',
};

/** A d10 pool of 2 at ≥ 8 needing 1, paid for by `additionalDice`; `pool` overrides any field. */
const paidEvaluation = (pool = {}, additionalDice = PAID) =>
  normalizeCheckEvaluation(countEvaluation({ additionalDice, ...pool }));

function readPath(object, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => value?.[key], object);
}

function writePath(object, path, value) {
  const keys = String(path).split('.');
  const leaf = keys.pop();
  keys.reduce((node, key) => (node[key] ??= {}), object)[leaf] = value;
}

/** Core's read helpers, added to whatever `foundry.utils` a harness installed. */
function installReadHelpers() {
  if (!globalThis.foundry?.utils) Object.assign(globalThis, { foundry: { utils: {} } });
  Object.assign(globalThis.foundry.utils, {
    getProperty: readPath,
    hasProperty: (object, path) => readPath(object, path) !== undefined,
  });
}

/**
 * Gives `actor` a stored resource: `_source` holds `value` at {@link PATH}, which `update` writes
 * and records; `answer` replaces what `update` resolves, as a vetoed or refused write would.
 */
function holdResource(actor, value, { answer, writable = true } = {}) {
  const source = {};
  if (value !== undefined) writePath(source, PATH, value);
  const original = actor.update?.bind(actor);
  const writes = [];
  Object.defineProperty(actor, '_source', { configurable: true, get: () => source });
  Object.assign(actor, {
    overrides: {},
    canUserModify: () => writable,
    async update(patch) {
      if (!Object.hasOwn(patch, PATH)) return original(patch);
      writes.push(patch[PATH]);
      if (answer) return answer();
      writePath(source, PATH, patch[PATH]);
      return actor;
    },
  });
  return { writes, read: () => readPath(source, PATH) };
}

/** A bare actor holding `value` Momentum, with no roll data. */
function heldActor(value, options = {}) {
  const actor = { uuid: 'Actor.hero', name: 'Hero', getRollData: () => ({}) };
  return { actor, ...holdResource(actor, value, options) };
}

const macroCalls = { reads: [], spends: [] };
let macroAnswers;
let macros = {};
const saved = {};

/** Resolves the read and spend macros first, then whatever documents a harness resolves. */
function installMacroLookup() {
  const documents = globalThis.fromUuid;
  Object.assign(globalThis, {
    fromUuid: async (uuid) => macros[uuid] ?? (await documents?.(uuid)) ?? null,
  });
}

beforeEach(() => {
  for (const key of ['foundry', 'fromUuid', 'game', 'additionalDiceProbe'])
    saved[key] = globalThis[key];
  installReadHelpers();
  macroCalls.reads = [];
  macroCalls.spends = [];
  macroAnswers = { available: 2, spent: true };
  Object.assign(globalThis, {
    additionalDiceProbe: { calls: macroCalls, answers: () => macroAnswers },
    fromUuid: undefined,
  });
  const script = (list, answer) => ({
    type: 'script',
    command: `const p = globalThis.additionalDiceProbe; p.calls.${list}.push(scope); return p.answers().${answer};`,
  });
  macros = { 'Macro.read': script('reads', 'available'), 'Macro.spend': script('spends', 'spent') };
  installMacroLookup();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

async function withDice(faces, body, options = {}) {
  const dice = installCountDice({ faces, ...options });
  try {
    return await body(dice);
  } finally {
    dice.restore();
  }
}

/** A simple count check at the runner, required 1, reporting its display evidence. */
function passFail(actor, evaluation, rollOptions = {}) {
  return runFormulaPassFail({
    formula: '',
    dc: 1,
    actor,
    evaluation,
    rollOptions: { reportVisibility: true, ...rollOptions },
  });
}

const countRolls = (dice) =>
  dice.constructed.filter((entry) => entry.kind === 'FabricateCountRoll');

// ── the lifecycle at the engine ───────────────────────────────────────────────

test('a non-interactive request spends before the one main Roll, which carries the bought dice', async () => {
  const { actor, writes, read } = heldActor(2);
  await withDice([9, 3, 8], async (dice) => {
    const fromPolicy = dice.CountRoll.fromPolicy.bind(dice.CountRoll);
    const replays = [];
    dice.CountRoll.fromPolicy = (policy, options) => {
      const roll = fromPolicy(policy, options);
      replays.push(roll.options.fabricateCount);
      return roll;
    };
    const result = await passFail(actor, paidEvaluation(), { additionalDice: 1 });
    assert.deepEqual(writes, [1], 'Momentum falls from 2 to 1');
    assert.equal(read(), 1);
    assert.deepEqual(dice.formulas(), ['3d10'], 'the bought die joins the one count Roll');
    assert.equal(countRolls(dice).length, 1, 'never a second Roll');
    assert.equal(replays[0].bought, 1, 'the replay policy marks the bought die');
    assert.deepEqual(result.data.boughtDice, { count: 1, source: 'path' });
    assert.deepEqual(
      [result.countDisplay.bought, result.countDisplay.resourceLabel],
      [1, 'Momentum'],
      'the display input names the marked die and the Resource name'
    );
  });
});

test('buying nothing reads nothing and records no bought dice anywhere', async () => {
  const { actor, writes } = heldActor(2);
  await withDice([9, 3], async (dice) => {
    const result = await passFail(actor, paidEvaluation({}, MACROS), { additionalDice: 0 });
    assert.deepEqual(macroCalls.reads, [], 'an omitted or zero request runs no read macro');
    assert.deepEqual(writes, []);
    assert.equal('boughtDice' in result.data, false, 'never written as 0 or null');
    assert.equal('bought' in result.countDisplay, false);
    assert.deepEqual(dice.formulas(), ['2d10']);
  });
});

test('a pre-resolved decision that buys no dice runs no read macro', async () => {
  const { actor } = heldActor(2);
  for (const rollDecision of [{}, { additionalDice: 0 }, { additionalDice: null }]) {
    await withDice([9, 3], async (dice) => {
      const evaluation = paidEvaluation({}, MACROS);
      const result = await passFail(actor, evaluation, { interactive: true, rollDecision });
      assert.deepEqual(macroCalls.reads, [], JSON.stringify(rollDecision));
      assert.deepEqual([dice.formulas(), 'boughtDice' in result.data], [['2d10'], false]);
    });
  }
  await withDice([9, 3, 8], async () => {
    const rollDecision = { additionalDice: 1 };
    await passFail(actor, paidEvaluation({}, MACROS), { interactive: true, rollDecision });
  });
  assert.equal(macroCalls.reads.length, 2, 'a decision that buys reads, then re-reads to spend');
});

test('the spend runs after the pre-rolls and before the main dice', async () => {
  const { actor } = heldActor(2);
  const rolledAtSpend = [];
  await withDice([2, 9, 3, 8, 1, 5], async (dice) => {
    const update = actor.update;
    actor.update = async (patch) => {
      rolledAtSpend.push(dice.formulas());
      return update(patch);
    };
    await passFail(actor, paidEvaluation(), {
      interactive: true,
      post: false,
      rollDecision: { bonus: '1d4', additionalDice: 1 },
    });
    assert.deepEqual(rolledAtSpend, [['1d4']], 'the pre-roll settled; the main Roll had not');
    assert.deepEqual(dice.formulas(), ['1d4', '5d10']);
  });
});

for (const [name, options, reason] of [
  ['an update that resolves nothing', { answer: async () => undefined }, 'spendRefused'],
  [
    'a rejected update',
    {
      answer: async () => {
        throw new Error('denied');
      },
    },
    'spendRefused',
  ],
  ['a write the system clamps', { answer: null }, 'spendUnconfirmed'],
]) {
  test(`${name} cancels with its reason: no main Roll, no post, never a failed check`, async () => {
    const held = heldActor(2, options);
    if (reason === 'spendUnconfirmed') {
      const update = held.actor.update;
      held.actor.update = async (patch) => {
        await update({ [PATH]: patch[PATH] + 1 });
        return held.actor;
      };
    }
    await withDice([9, 3, 8], async (dice) => {
      const evaluated = await evaluateCountCheckRoll(held.actor, {
        evaluation: paidEvaluation(),
        additionalDice: 1,
      });
      assert.equal(evaluated.engine, true, 'a refusal never passes as headless');
      assert.equal(evaluated.cancelled, true);
      const result = await passFail(held.actor, paidEvaluation(), { additionalDice: 1 });
      assert.deepEqual(
        [result.success, result.cancelled, result.outcome, result.additionalDiceRefusal],
        [false, true, null, reason],
        'the cancelled shape plus its reason, never graded fail'
      );
      assert.deepEqual(countRolls(dice), [], 'no main Roll is constructed');
      assert.deepEqual(dice.posts, []);
      assert.equal(result.additionalDiceNotice.label, 'Momentum');
    });
  });
}

test('a pool that cannot resolve refuses before any read or spend', async () => {
  const { actor, writes } = heldActor(2);
  await withDice([], async () => {
    const result = await passFail(actor, paidEvaluation({ base: '@missing' }, MACROS), {
      additionalDice: 1,
    });
    assert.equal(result.misconfigured, true);
    assert.deepEqual([writes, macroCalls.reads, macroCalls.spends], [[], [], []]);
  });
});

test('a dismissed prompt spends nothing', async () => {
  const { actor, writes } = heldActor(2);
  await withDice([], async () => {
    const result = await passFail(actor, paidEvaluation(), {
      interactive: true,
      prompt: async () => null,
    });
    assert.equal(result.cancelled, true);
    assert.equal('additionalDiceRefusal' in result, false, 'a dismissal is not a refusal');
    assert.deepEqual(writes, []);
  });
});

test('bought dice always grow the pool, whatever the modifier destination', async () => {
  const { actor } = heldActor(2);
  await withDice([9, 3, 8], async (dice) => {
    const result = await passFail(actor, paidEvaluation({ modifierDestination: 'threshold' }), {
      additionalDice: 1,
    });
    assert.deepEqual(dice.formulas(), ['3d10']);
    assert.equal(result.data.target, 8, 'the threshold is untouched');
  });
});

test('bought dice settle with the pool, so the one-die floor counts against them', async () => {
  const { actor } = heldActor(5);
  await withDice([9, 3], async (dice) => {
    const result = await passFail(actor, paidEvaluation({ base: '1', zeroPoolFails: false }), {
      interactive: true,
      post: false,
      rollDecision: { bonus: '-2', additionalDice: 3 },
    });
    assert.deepEqual(dice.formulas(), ['2d10'], 'base 1 − 2 + 3 bought settles to 2 dice');
    assert.equal(result.data.boughtDice.count, 3, 'every paid die is recorded');
    assert.equal(result.countDisplay.bought, 1, 'only one die rolled beyond the floor');
  });
});

test('a pool still at zero after the bought dice fails as a zero pool and spends nothing', async () => {
  const { actor, writes } = heldActor(5);
  await withDice([], async (dice) => {
    const result = await passFail(actor, paidEvaluation({ base: '1' }), {
      interactive: true,
      post: false,
      rollDecision: { bonus: '-3', additionalDice: 1 },
    });
    assert.equal(result.data.zeroPool, true);
    assert.deepEqual(writes, []);
    assert.equal('boughtDice' in result.data, false);
    assert.deepEqual(dice.constructed, []);
  });
});

test('a main Roll that throws after the spend keeps the spend and records it', async () => {
  const { actor, writes } = heldActor(2);
  await withDice([], async (dice) => {
    refuseCountRolls(dice);
    const result = await passFail(actor, paidEvaluation(), { additionalDice: 1 });
    assert.equal(result.misconfigured, true);
    assert.equal(result.data.targetRefusal, 'explode-unbounded');
    assert.deepEqual(result.data.boughtDice, { count: 1, source: 'path' });
    assert.deepEqual(result.additionalDiceNotice, { dice: 1, label: 'Momentum', source: 'path' });
    assert.deepEqual(writes, [1], 'nothing refunds');
  });
});

for (const site of ['fromPolicy', 'evaluate']) {
  test(`a throw from ${site} after the spend refuses with the bought dice, not a fail`, async () => {
    const { actor, writes } = heldActor(2);
    await withDice([], async (dice) => {
      const owner = site === 'fromPolicy' ? dice.CountRoll : dice.CountRoll.prototype;
      owner[site] = () => {
        throw new Error('boom');
      };
      const result = await passFail(actor, paidEvaluation(), { additionalDice: 1 });
      assert.deepEqual([result.misconfigured, result.outcome], [true, null]);
      assert.equal(result.message, 'Crafting check roll failed: boom');
      assert.deepEqual(result.data.boughtDice, { count: 1, source: 'path' });
      assert.deepEqual(result.additionalDiceNotice, { dice: 1, label: 'Momentum', source: 'path' });
      assert.deepEqual(writes, [1], 'nothing refunds');
      const unpaid = await passFail(actor, paidEvaluation(), {});
      assert.deepEqual([unpaid.outcome, unpaid.data], ['fail', {}], 'a throw with none bought');
    });
  });
}

for (const [name, request, evaluation, reason, held = {}] of [
  ['an unoffered count', 1, () => paidEvaluation({}, { ...PAID, enabled: false }), 'notOffered'],
  ['a negative count', -1, () => paidEvaluation(), 'choiceInvalid'],
  ['a fractional count', 1.5, () => paidEvaluation(), 'choiceInvalid'],
  ['a numeric string', '1', () => paidEvaluation(), 'choiceInvalid'],
  ['a count above the limit', 3, () => paidEvaluation(), 'choiceAboveLimit'],
  ['a count above max', 4, () => paidEvaluation(), 'choiceAboveLimit', { value: 10 }],
  [
    'a count the user cannot pay',
    1,
    () => paidEvaluation(),
    'resourceNotWritable',
    { writable: false },
  ],
  ['an overridden value', 1, () => paidEvaluation(), 'resourceOverridden', { overridden: true }],
]) {
  test(`${name} refuses ${reason}, never clamped, before anything rolls or is spent`, async () => {
    const { actor, writes } = heldActor(held.value ?? 2, { writable: held.writable !== false });
    if (held.overridden) writePath(actor.overrides, PATH, 9);
    await withDice([], async (dice) => {
      const result = await passFail(actor, evaluation(), { additionalDice: request });
      assert.deepEqual([result.cancelled, result.additionalDiceRefusal], [true, reason]);
      assert.deepEqual([writes, dice.constructed], [[], []]);
    });
  });
}

test('a forced unavailable reason refuses a non-zero request and runs no read macro', async () => {
  const { actor } = heldActor(2);
  await withDice([], async () => {
    const result = await passFail(actor, paidEvaluation({}, MACROS), {
      additionalDice: 1,
      forcedUnavailable: 'broadcastCallSite',
    });
    assert.equal(result.additionalDiceRefusal, 'broadcastCallSite');
    assert.deepEqual(macroCalls.reads, []);
  });
});

test('the prompt is offered the public offer, and its answer buys and spends', async () => {
  const { actor, writes } = heldActor(2);
  const offered = [];
  await withDice([9, 3, 8], async () => {
    await passFail(actor, paidEvaluation(), {
      interactive: true,
      post: false,
      forcedUnavailable: null,
      prompt: async (input) => {
        offered.push(input.additionalDiceOffer);
        return { confirmed: true, additionalDice: 1 };
      },
    });
  });
  assert.deepEqual(offered, [
    {
      available: 2,
      limit: 2,
      max: 3,
      resourceLabel: 'Momentum',
      unavailable: null,
      reach: { needed: 1, perDieMost: 1, explode: 'off', rescued: false },
    },
  ]);
  assert.deepEqual(writes, [1]);
});

test('a broadcast prompt is offered the control as unavailable, and nothing is read', async () => {
  const { actor } = heldActor(2);
  const offered = [];
  await withDice([9, 3], async () => {
    await passFail(actor, paidEvaluation({}, MACROS), {
      interactive: true,
      post: false,
      forcedUnavailable: 'broadcastCallSite',
      prompt: async (input) => {
        offered.push(input.additionalDiceOffer);
        return { confirmed: true, additionalDice: 0 };
      },
    });
  });
  assert.deepEqual(
    [offered[0].unavailable, offered[0].limit, macroCalls.reads],
    ['broadcastCallSite', 0, []]
  );
});

/** The offer a prompt sees for a routed or progressive check. */
async function offeredReach(run, args) {
  const { actor } = heldActor(2);
  let offer = null;
  await withDice([9, 3], async () => {
    await run({
      formula: '',
      actor,
      evaluation: paidEvaluation(),
      ...args,
      rollOptions: {
        interactive: true,
        post: false,
        prompt: async (input) => {
          offer = input.additionalDiceOffer;
          return { confirmed: true };
        },
      },
    });
  });
  return offer.reach;
}

test('a routed offer needs the least net any succeeding tier accepts', async () => {
  const relativeOutcomes = [
    { id: 'botch', name: 'Botch', success: false, dc: 0 },
    { id: 'fine', name: 'Fine', success: true, dc: 1 },
    { id: 'great', name: 'Great', success: true, dc: 3 },
  ];
  const routed = { dc: 1, type: 'relative', relativeOutcomes, fixedOutcomes: [], triggers: [] };
  assert.equal((await offeredReach(runFormulaRouted, routed)).needed, 2, 'required 1 + Fine 1');
  const clamped = { ...routed, relativeOutcomes: relativeOutcomes.slice(1), clampToNearest: true };
  assert.equal(
    (await offeredReach(runFormulaRouted, clamped)).needed,
    0,
    'a clamped lower net still routes to the least demanding succeeding tier'
  );
  const fixedOutcomes = [
    { id: 'low', name: 'Low', success: false, start: 0, end: 1 },
    { id: 'high', name: 'High', success: true, start: 2, end: 9 },
  ];
  const fixed = { dc: 1, type: 'fixed', relativeOutcomes: [], fixedOutcomes, triggers: [] };
  assert.equal(
    (await offeredReach(runFormulaRouted, fixed)).needed,
    2,
    'a fixed range starts at 2'
  );
});

test('an immediate progressive offer judges reach without a needed count', async () => {
  const reach = await offeredReach(runFormulaProgressive, { triggers: [] });
  assert.notEqual(reach, null, 'its zero-pool limb still applies');
  assert.equal(reach.needed, null);
});

test('a simulated preview places its dice with no read and no spend', async () => {
  const { actor, writes } = heldActor(0);
  await withDice([9, 3, 8, 1], async (dice) => {
    const result = await passFail(actor, paidEvaluation({}, MACROS), {
      simulatedAdditionalDice: 2,
    });
    assert.deepEqual(dice.formulas(), ['4d10']);
    assert.deepEqual([writes, macroCalls.reads, macroCalls.spends], [[], [], []]);
    assert.deepEqual(result.data.boughtDice, { count: 2, source: 'macro' });
    assert.equal(result.countDisplay.bought, 2, 'simulated dice render as bought tiles');
  });
});

test('a macro pair is read for the limit and spent with the dice and the delta', async () => {
  const { actor } = heldActor(undefined);
  await withDice([9, 3, 8], async () => {
    const result = await passFail(actor, paidEvaluation({}, MACROS), { additionalDice: 1 });
    assert.deepEqual(result.data.boughtDice, { count: 1, source: 'macro' });
  });
  assert.equal(macroCalls.reads.length, 2, 'once for the offer and once inside the spend');
  assert.deepEqual(
    [macroCalls.spends[0].dice, macroCalls.spends[0].delta, macroCalls.spends[0].rolls],
    [1, -1, 1]
  );
});

// ── the request object the runners thread through `interactive` ───────────────

test('a check request keeps the prompt flag, the request and the subject, and nothing else', () => {
  const request = checkRequest(
    { interactive: true, additionalDice: 2, simulatedAdditionalDice: 5, user: 'forged' },
    { recipe: 'r' }
  );
  assert.deepEqual(request, {
    interactive: true,
    additionalDice: 2,
    additionalDiceRolls: 1,
    additionalDiceSubject: { recipe: 'r' },
  });
  assert.deepEqual(checkRequest(request, { craftingSystem: 's' }).additionalDiceSubject, {
    recipe: 'r',
    craftingSystem: 's',
  });
  assert.equal(checkRequest(true).interactive, true);
  assert.equal(checkRequest(false).additionalDice, 0);
});

// ── the three activities ──────────────────────────────────────────────────────

const TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 },
  { id: 't-botch', name: 'Botch', success: false, breakTools: false, dc: -1 },
];
const simpleCheck = (evaluation) => ({ rollFormula: '', dc: 10, evaluation });
const routedCheck = (evaluation) => ({
  rollFormula: '',
  dc: 10,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: TIERS,
  fixedOutcomes: [],
  evaluation,
});
const progressiveCheck = (evaluation) => ({
  rollFormula: '',
  evaluation,
  checkBreakage: { triggers: [] },
});

/** One craft of a world whose `slot` check is `config`, its actor holding `value` Momentum. */
async function craftOnce(
  { resolutionMode, slot, config },
  { value = 2, faces, options, answer, evaluation }
) {
  const world = craftProbe({
    resolutionMode,
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      consumption: {},
      [slot]: config(evaluation ?? paidEvaluation()),
    },
    resolutionService: probeResolutionService({ mode: resolutionMode }),
  });
  installReadHelpers();
  installMacroLookup();
  const held = holdResource(world.craftingActor, value, { answer });
  const checks = [];
  const run = world.engine._runCraftingCheck.bind(world.engine);
  world.engine._runCraftingCheck = async (...args) => {
    const result = await run(...args);
    checks.push(result);
    return result;
  };
  return withDice(
    faces,
    async (dice) => ({
      world,
      result: await world.craft(null, options),
      check: checks[0],
      formulas: dice.formulas(),
      ...held,
    }),
    { chat: false }
  );
}

/** One salvage of a world whose `mode` check is `config`. */
async function salvageOnce({ mode, config }, { value = 2, faces, options, answer, evaluation }) {
  const world = salvageProbe({
    salvageResolutionMode: mode,
    salvageCraftingCheck: {
      [mode]: config(evaluation ?? paidEvaluation()),
      consumption: { consumeComponentOnFail: true },
    },
    resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 1 }] }],
    awardDifficulty: 1,
  });
  installReadHelpers();
  installMacroLookup();
  const held = holdResource(world.actor, value, { answer });
  return withDice(
    faces,
    async (dice) => ({
      world,
      result: await world.salvage(options),
      formulas: dice.formulas(),
      ...held,
    }),
    { chat: false }
  );
}

/** Makes every count Roll refuse as Foundry's explosion recursion limit would. */
function refuseCountRolls(dice) {
  dice.CountRoll.prototype.evaluate = async () => {
    throw new CountRollRefusal('explode-unbounded', 'explode');
  };
}

/** One immediate gathering attempt whose system check for `mode` is `config`. */
async function gatherOnce(
  { mode, config },
  { value = 2, faces, options, answer, evaluation, refuseRoll = false }
) {
  const fixture = gatheringFixture({
    mode,
    resultGroups: [
      {
        id: 'g-yield',
        name: 'Fine',
        results: [{ id: 'r-herb', componentId: 'herb', quantity: 1 }],
      },
    ],
    components: [{ id: 'herb', name: 'Herb', difficulty: 1 }],
  });
  fixture.system.gatheringCraftingCheck[mode] = config(evaluation ?? paidEvaluation());
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: ['user-gathering'] });
  const held = holdResource(actor, value, { answer });
  const previousConfig = globalThis.CONFIG;
  let dice = null;
  try {
    const attempt = await runRealGatheringAttempt({
      ...fixture,
      actor,
      beforeStart: ({ engine }) => {
        installReadHelpers();
        dice = installCountDice({ faces, chat: false });
        if (refuseRoll) refuseCountRolls(dice);
        const start = engine.startAttempt.bind(engine);
        engine.startAttempt = (args) => start({ ...args, ...options });
      },
    });
    return { result: attempt.response, attempt, formulas: dice.formulas(), ...held };
  } finally {
    if (previousConfig === undefined) delete globalThis.CONFIG;
    else Object.assign(globalThis, { CONFIG: previousConfig });
  }
}

const SITES = [
  {
    name: 'crafting simple',
    run: craftOnce,
    resolutionMode: 'simple',
    slot: 'simple',
    config: simpleCheck,
  },
  {
    name: 'crafting routed',
    run: craftOnce,
    resolutionMode: 'routedByCheck',
    slot: 'routed',
    config: routedCheck,
  },
  {
    name: 'crafting progressive',
    run: craftOnce,
    resolutionMode: 'progressive',
    slot: 'progressive',
    config: progressiveCheck,
  },
  { name: 'salvage simple', run: salvageOnce, mode: 'simple', config: simpleCheck },
  {
    name: 'salvage routed',
    run: salvageOnce,
    mode: 'routed',
    config: (evaluation) => ({ ...routedCheck(evaluation), relativeOutcomes: [{ ...TIERS[0] }] }),
  },
  { name: 'salvage progressive', run: salvageOnce, mode: 'progressive', config: progressiveCheck },
  { name: 'gathering routed', run: gatherOnce, mode: 'routed', config: routedCheck },
  { name: 'gathering progressive', run: gatherOnce, mode: 'progressive', config: progressiveCheck },
];

for (const site of SITES) {
  test(`${site.name}: a non-interactive additionalDice buys and spends before the one roll`, async () => {
    const bought = await site.run(site, { faces: [9, 3, 8], options: { additionalDice: 1 } });
    assert.deepEqual(bought.formulas, ['3d10']);
    assert.deepEqual(bought.writes, [1]);
    const control = await site.run(site, { faces: [9, 3], options: {} });
    assert.deepEqual([control.formulas, control.writes], [['2d10'], []]);
  });

  test(`${site.name}: a refused spend cancels the attempt with its reason and zero mutation`, async () => {
    const refused = await site.run(site, {
      faces: [9, 3, 8],
      options: { additionalDice: 1 },
      answer: async () => undefined,
    });
    assert.equal(refused.result.cancelled, true);
    assert.equal(refused.result.additionalDiceRefusal, 'spendRefused');
    assert.deepEqual(refused.formulas, [], 'no roll at all');
    const stock = refused.world?.sourceItem
      ? [refused.world.sourceItem]
      : refused.world?.stockItems;
    for (const item of stock ?? []) assert.equal(item.deleted, false, `${item.name} is kept`);
    if (refused.world?.sourceItem) assert.equal(refused.world.sourceItem.system.quantity, 3);
    if (refused.attempt) {
      assert.equal(refused.attempt.runManagerCalls.createTerminalRun.length, 0);
      assert.equal(refused.attempt.actor.items.length, 0, 'nothing is awarded');
    }
  });

  test(`${site.name}: a caller's simulatedAdditionalDice never reaches the engine`, async () => {
    const run = await site.run(site, { faces: [9, 3], options: { simulatedAdditionalDice: 2 } });
    assert.deepEqual(run.formulas, ['2d10']);
  });
}

test('crafting: the macro payload names the activity, the recipe and the crafting system', async () => {
  const site = SITES[0];
  await site.run(site, {
    faces: [9, 3, 8],
    options: { additionalDice: 1 },
    evaluation: paidEvaluation({}, MACROS),
  });
  const [read] = macroCalls.reads;
  assert.deepEqual(
    [
      read.activity,
      read.recipe?.id,
      read.craftingSystem?.id,
      read.component,
      read.task,
      read.rolls,
    ],
    ['crafting', 'recipe-probe', 'sys-probe', null, null, 1]
  );
  assert.equal(read.evaluation.pool.additionalDice.source, 'macro');
});

test('salvage and gathering macro payloads name their own subject', async () => {
  await SITES[3].run(SITES[3], {
    faces: [9, 3, 8],
    options: { additionalDice: 1 },
    evaluation: paidEvaluation({}, MACROS),
  });
  await SITES[6].run(SITES[6], {
    faces: [9, 3, 8],
    options: { additionalDice: 1 },
    evaluation: paidEvaluation({}, MACROS),
  });
  const [salvage, gathering] = macroCalls.reads.filter((_, index) => index % 2 === 0);
  assert.deepEqual(
    [salvage.activity, salvage.component?.id, salvage.craftingSystem?.id, salvage.recipe],
    ['salvage', 'ore', 'sys-salvage', null]
  );
  assert.deepEqual(
    [gathering.activity, gathering.task?.id, gathering.craftingSystem?.id],
    ['gathering', 'task-fixture', 'system-fixture']
  );
});

test('crafting: a check refused after the spend reports the bought dice on the misconfigured result', async () => {
  const site = SITES[0];
  const world = craftProbe({
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, consumption: {}, simple: site.config(paidEvaluation()) },
    resolutionService: probeResolutionService({ mode: 'simple' }),
  });
  installReadHelpers();
  const held = holdResource(world.craftingActor, 2);
  await withDice(
    [],
    async (dice) => {
      refuseCountRolls(dice);
      const result = await world.craft(null, { additionalDice: 1 });
      assert.equal(result.misconfigured, true);
      assert.deepEqual(result.data.boughtDice, { count: 1, source: 'path' });
      assert.equal(result.additionalDiceNotice.label, 'Momentum');
      assert.deepEqual(held.writes, [1], 'the spend stands');
    },
    { chat: false }
  );
});

for (const site of [SITES[6], SITES[7]]) {
  test(`${site.name}: a roll refused after the spend still reports the bought dice`, async () => {
    const run = await site.run(site, {
      faces: [],
      options: { additionalDice: 1 },
      refuseRoll: true,
    });
    assert.equal(run.result.accepted, false);
    assert.deepEqual(run.result.data?.boughtDice, { count: 1, source: 'path' });
    assert.equal(run.result.additionalDiceNotice?.label, 'Momentum');
    assert.deepEqual(run.writes, [1], 'the spend stands');
  });
}

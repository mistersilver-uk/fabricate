/** Additional dice's read, spend, limit, reach and offer (issue 2008, AD1–AD11). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, test } from 'node:test';

import {
  ADDITIONAL_DICE_REFUSAL_KEYS,
  ADDITIONAL_DICE_REFUSALS,
  ADDITIONAL_DICE_UNAVAILABLE,
  additionalDiceRefusalKey,
  boundAdditionalDice,
  buildAdditionalDiceReach,
  publicAdditionalDiceOffer,
  readStoredResource,
  resolveAdditionalDiceBudget,
  resolveAdditionalDiceReach,
  spendAdditionalDice,
  withAdditionalDiceRefusal,
} from '../src/systems/additionalDice.js';
import { resolvePool } from '../src/systems/countEvaluation.js';
import { countTriggerRescues } from '../src/systems/countTriggerReach.js';

import { countEvaluation } from './helpers/countFixtures.js';

const PATH = 'system.resources.ap.value';
const ABSENT = Symbol('absent');
const LANG = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));

// Core's V13 `foundry.utils` walks: the whole key first, then one segment at a time.
function walk(object, key) {
  if (!key || !object) return { found: false };
  if (key in object) return { found: true, value: object[key] };
  let target = object;
  for (const segment of key.split('.')) {
    if (!target || typeof target !== 'object' || !(segment in target)) return { found: false };
    target = target[segment];
  }
  return { found: true, value: target };
}

const saved = {
  foundry: globalThis.foundry,
  fromUuid: globalThis.fromUuid,
  additionalDiceProbe: globalThis.additionalDiceProbe,
};
const probe = { reads: [], spends: [], ran: [] };
let macros = {};

beforeEach(() => {
  Object.assign(globalThis, {
    foundry: {
      utils: {
        getProperty: (object, key) => walk(object, key).value,
        hasProperty: (object, key) => walk(object, key).found,
      },
    },
    fromUuid: async (uuid) => macros[uuid] ?? null,
    additionalDiceProbe: probe,
  });
  probe.reads = [];
  probe.spends = [];
  probe.ran = [];
  probe.available = 2;
  probe.spent = true;
  macros = {
    'Macro.read': {
      type: 'script',
      command: 'const p = globalThis.additionalDiceProbe; p.reads.push(scope); return p.available;',
    },
    'Macro.spend': {
      type: 'script',
      command: 'const p = globalThis.additionalDiceProbe; p.spends.push(scope); return p.spent;',
    },
    'Macro.chat': {
      type: 'chat',
      command: 'globalThis.additionalDiceProbe.ran.push("chat"); return 5;',
    },
  };
});

after(() => Object.assign(globalThis, saved));

function writePath(object, key, value) {
  const segments = key.split('.');
  const leaf = segments.pop();
  let target = object;
  for (const segment of segments) target = target[segment] ??= {};
  target[leaf] = value;
}

/** An actor whose `update` writes `_source` after a tick, vetoes, rejects, answers a copy or clamps. */
function fakeActor({
  stored = 2,
  prepared = 9,
  overrides = {},
  canModify = true,
  update = 'write',
} = {}) {
  const source = { system: { resources: { ap: {} } } };
  if (stored !== ABSENT) source.system.resources.ap.value = stored;
  const actor = {
    uuid: 'Actor.brenna',
    _source: source,
    system: { resources: { ap: { value: prepared } } },
    overrides,
    modifyCalls: [],
    updates: [],
    canUserModify(user, action) {
      actor.modifyCalls.push({ user, action });
      return canModify;
    },
    async update(changes) {
      actor.updates.push(changes);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (update === 'reject') throw new Error('validation failed');
      if (update === 'veto') return undefined;
      const [[key, value]] = Object.entries(changes);
      writePath(actor._source, key, update === 'clamp' ? Math.max(2, value) : value);
      return update === 'other' ? { ...actor } : actor;
    },
  };
  return actor;
}

const pathPolicy = (path = PATH) => ({ enabled: true, source: 'path', path, max: 3 });
const macroPolicy = (read = 'Macro.read', spend = 'Macro.spend') => ({
  enabled: true,
  source: 'macro',
  readMacroUuid: read,
  spendMacroUuid: spend,
  max: 3,
});
const user = { id: 'player', isGM: false };

async function pathBudget(actor) {
  return resolveAdditionalDiceBudget({ additionalDice: pathPolicy(), actor, user });
}

test('the refusal list is closed and every reason has a message in en.json', () => {
  assert.deepEqual(ADDITIONAL_DICE_REFUSALS, [
    'sourceMissing',
    'resourceUnreadable',
    'resourceOverridden',
    'resourceNotWritable',
    'resourceMacroFailed',
    'broadcastCallSite',
    'notOffered',
    'choiceInvalid',
    'choiceAboveLimit',
    'resourceChanged',
    'spendRefused',
    'spendUnconfirmed',
  ]);
  assert.ok(Object.isFrozen(ADDITIONAL_DICE_REFUSALS));
  assert.deepEqual(ADDITIONAL_DICE_UNAVAILABLE, ADDITIONAL_DICE_REFUSALS.slice(0, 6));
  assert.deepEqual(Object.keys(ADDITIONAL_DICE_REFUSAL_KEYS), [...ADDITIONAL_DICE_REFUSALS]);
  const resolve = (key) => key.split('.').reduce((node, part) => node?.[part], LANG);
  for (const reason of ADDITIONAL_DICE_REFUSALS) {
    for (const label of ['Momentum', '']) {
      for (const source of ['path', 'macro']) {
        const key = additionalDiceRefusalKey(reason, { label, source });
        assert.equal(typeof resolve(key), 'string', `${reason} ${source} "${label}" → ${key}`);
        if (!label) assert.doesNotMatch(resolve(key), /\{resource\}/, key);
      }
    }
  }
  assert.equal(additionalDiceRefusalKey('toString'), null);
});

test('spend refusals pick the labelled form, and a macro source names its spend macro', () => {
  const keys = (reason, options) => additionalDiceRefusalKey(reason, options);
  assert.match(keys('spendRefused', { label: 'Momentum' }), /\.SpendRefused$/);
  assert.match(keys('spendRefused', { label: ' ' }), /\.SpendRefusedUnlabelled$/);
  assert.match(
    keys('spendRefused', { label: 'Momentum', source: 'macro' }),
    /\.SpendRefusedMacro$/
  );
  assert.match(keys('resourceChanged', { source: 'macro' }), /\.ResourceChangedUnlabelled$/);
});

test('readStoredResource reads _source, never prepared data, and nested overrides (AD2)', () => {
  const actor = fakeActor({ stored: 2, prepared: 9 });
  assert.deepEqual(readStoredResource(actor, PATH), { value: 2, overridden: false });
  const overridden = fakeActor({ overrides: { system: { resources: { ap: { value: 4 } } } } });
  assert.equal(readStoredResource(overridden, PATH).overridden, true);
  assert.deepEqual(readStoredResource(actor, '  '), { value: undefined, overridden: false });
});

test('a path budget is the floored stored amount for the given user (AD2, AD7)', async () => {
  const actor = fakeActor({ stored: 2.7, prepared: 9 });
  assert.deepEqual(await pathBudget(actor), { ok: true, source: 'path', path: PATH, available: 2 });
  assert.deepEqual(actor.modifyCalls, [{ user, action: 'update' }]);
});

test('reads of -1, "3", NaN, Infinity or an absent value are unreadable (AD7)', async () => {
  for (const stored of [-1, '3', NaN, Infinity, ABSENT, null]) {
    const budget = await pathBudget(fakeActor({ stored }));
    assert.deepEqual(budget, { ok: false, reason: 'resourceUnreadable' }, String(stored));
  }
});

test('a path budget refuses in order: missing, unreadable, overridden, not writable (AD2)', async () => {
  const missing = await resolveAdditionalDiceBudget({ additionalDice: pathPolicy(' '), user });
  assert.equal(missing.reason, 'sourceMissing');
  const overrides = { system: { resources: { ap: { value: 4 } } } };
  const both = fakeActor({ stored: 'x', overrides, canModify: false });
  assert.equal((await pathBudget(both)).reason, 'resourceUnreadable');
  const overridden = fakeActor({ overrides, canModify: false });
  assert.equal((await pathBudget(overridden)).reason, 'resourceOverridden');
  const locked = fakeActor({ canModify: false });
  assert.equal((await pathBudget(locked)).reason, 'resourceNotWritable');
});

test('a forced unavailable reason refuses before any read', async () => {
  const actor = fakeActor();
  const budget = await resolveAdditionalDiceBudget({
    additionalDice: macroPolicy(),
    actor,
    user,
    forcedUnavailable: 'broadcastCallSite',
  });
  assert.deepEqual(budget, { ok: false, reason: 'broadcastCallSite' });
  assert.equal(probe.reads.length, 0);
});

test('a macro budget runs the script read macro with the payload and floors it (AD7)', async () => {
  probe.available = 2.7;
  const payload = { actor: { id: 'a' }, rolls: 1 };
  const budget = await resolveAdditionalDiceBudget({ additionalDice: macroPolicy(), payload });
  assert.deepEqual(budget, {
    ok: true,
    source: 'macro',
    readMacroUuid: 'Macro.read',
    spendMacroUuid: 'Macro.spend',
    available: 2,
  });
  assert.equal(probe.reads[0], payload);
  for (const answer of [-1, '3', NaN, undefined]) {
    probe.available = answer;
    const failed = await resolveAdditionalDiceBudget({ additionalDice: macroPolicy() });
    assert.deepEqual(failed, { ok: false, reason: 'resourceMacroFailed' }, String(answer));
  }
});

test('a macro budget refuses a blank UUID, a missing, throwing or non-script read macro (AD6)', async () => {
  const blank = await resolveAdditionalDiceBudget({
    additionalDice: macroPolicy('Macro.read', ''),
  });
  assert.equal(blank.reason, 'sourceMissing');
  macros['Macro.throws'] = { type: 'script', command: 'throw new Error("boom");' };
  for (const read of ['Macro.chat', 'Macro.gone', 'Macro.throws']) {
    const budget = await resolveAdditionalDiceBudget({ additionalDice: macroPolicy(read) });
    assert.deepEqual(budget, { ok: false, reason: 'resourceMacroFailed' }, read);
  }
  assert.deepEqual(probe.ran, [], 'a chat macro never runs');
});

test('the path write subtracts from the in-queue re-read, not the prompt-time amount (AD1)', async () => {
  const actor = fakeActor({ stored: 5 });
  const budget = await pathBudget(actor);
  actor._source.system.resources.ap.value = 3;
  const spent = await spendAdditionalDice({ budget, dice: 1, actor, user });
  assert.deepEqual(spent, { ok: true, spent: 1, source: 'path' });
  assert.deepEqual(actor.updates, [{ [PATH]: 2 }]);
  assert.equal(actor._source.system.resources.ap.value, 2);
});

test('the write reads _source, not the prepared value (AD2)', async () => {
  const actor = fakeActor({ stored: 2, prepared: 9 });
  await spendAdditionalDice({ budget: await pathBudget(actor), dice: 1, actor, user });
  assert.deepEqual(actor.updates, [{ [PATH]: 1 }]);
});

test('an undefined update result refuses spendRefused (AD3)', async () => {
  const actor = fakeActor({ update: 'veto' });
  const spent = await spendAdditionalDice({
    budget: await pathBudget(actor),
    dice: 1,
    actor,
    user,
  });
  assert.deepEqual(spent, { ok: false, reason: 'spendRefused' });
});

test('a rejected update or another acknowledging object refuses spendRefused (AD4)', async () => {
  for (const update of ['reject', 'other']) {
    const actor = fakeActor({ update });
    const budget = await pathBudget(actor);
    const spent = await spendAdditionalDice({ budget, dice: 1, actor, user });
    assert.deepEqual(spent, { ok: false, reason: 'spendRefused' }, update);
  }
});

test('a system that clamps the write refuses spendUnconfirmed (AD4)', async () => {
  const actor = fakeActor({ stored: 3, update: 'clamp' });
  const spent = await spendAdditionalDice({
    budget: await pathBudget(actor),
    dice: 2,
    actor,
    user,
  });
  assert.deepEqual(spent, { ok: false, reason: 'spendUnconfirmed' });
});

test('a spend re-checks the stored amount, overrides and writability before writing', async () => {
  const actor = fakeActor({ stored: 2 });
  const budget = await pathBudget(actor);
  actor._source.system.resources.ap.value = 1;
  const short = await spendAdditionalDice({ budget, dice: 2, actor, user });
  assert.deepEqual(short, { ok: false, reason: 'resourceChanged', available: 1 });
  actor.overrides = { system: { resources: { ap: { value: 5 } } } };
  const overridden = await spendAdditionalDice({ budget, dice: 1, actor, user });
  assert.equal(overridden.reason, 'resourceOverridden');
  assert.deepEqual(actor.updates, []);
});

test('zero dice spend nothing and an unavailable budget refuses a non-zero choice', async () => {
  const actor = fakeActor();
  const budget = await pathBudget(actor);
  assert.deepEqual(await spendAdditionalDice({ budget, dice: 0, actor, user }), {
    ok: true,
    spent: 0,
    source: 'path',
  });
  const refused = { ok: false, reason: 'resourceNotWritable' };
  assert.deepEqual(await spendAdditionalDice({ budget: refused, dice: 1, actor, user }), refused);
  assert.equal(
    (await spendAdditionalDice({ budget, dice: 1.5, actor, user })).reason,
    'choiceInvalid'
  );
  assert.deepEqual(actor.updates, []);
});

test('concurrent spends of one resource are serialized per client (AD5)', async () => {
  const actor = fakeActor({ stored: 2 });
  const budget = await pathBudget(actor);
  const both = await Promise.all([
    spendAdditionalDice({ budget, dice: 1, actor, user }),
    spendAdditionalDice({ budget, dice: 1, actor, user }),
  ]);
  assert.deepEqual(
    both.map((spent) => spent.ok),
    [true, true]
  );
  assert.equal(actor._source.system.resources.ap.value, 0);
  const last = fakeActor({ stored: 1 });
  const lastBudget = await pathBudget(last);
  const raced = await Promise.all([
    spendAdditionalDice({ budget: lastBudget, dice: 1, actor: last, user }),
    spendAdditionalDice({ budget: lastBudget, dice: 1, actor: last, user }),
  ]);
  assert.deepEqual(raced[1], { ok: false, reason: 'resourceChanged', available: 0 });
  assert.equal(last._source.system.resources.ap.value, 0);
});

test('a macro spend re-reads, then runs the script spend macro with dice and delta', async () => {
  const payload = { rolls: 1 };
  const budget = await resolveAdditionalDiceBudget({ additionalDice: macroPolicy(), payload });
  const spent = await spendAdditionalDice({ budget, dice: 2, payload });
  assert.deepEqual(spent, { ok: true, spent: 2, source: 'macro' });
  assert.deepEqual(probe.spends, [{ rolls: 1, dice: 2, delta: -2 }]);
  assert.equal(probe.reads.length, 2);
  probe.available = 1;
  assert.deepEqual(await spendAdditionalDice({ budget, dice: 2, payload }), {
    ok: false,
    reason: 'resourceChanged',
    available: 1,
  });
  assert.equal(probe.spends.length, 1, 'no spend after a short re-read');
});

test('a falsy, throwing or non-script spend macro refuses spendRefused (AD6)', async () => {
  const budget = await resolveAdditionalDiceBudget({ additionalDice: macroPolicy() });
  probe.spent = 0;
  assert.equal((await spendAdditionalDice({ budget, dice: 1 })).reason, 'spendRefused');
  macros['Macro.spend'] = { type: 'script', command: 'throw new Error("boom");' };
  assert.equal((await spendAdditionalDice({ budget, dice: 1 })).reason, 'spendRefused');
  const chat = { ...budget, spendMacroUuid: 'Macro.chat' };
  assert.equal((await spendAdditionalDice({ budget: chat, dice: 1 })).reason, 'spendRefused');
  assert.deepEqual(probe.ran, [], 'a chat spend macro never runs');
});

test('the limit is the lower of max and the floored per-roll share (AD8)', () => {
  assert.equal(boundAdditionalDice({ max: 3, available: 4, rolls: 2 }), 2);
  assert.equal(boundAdditionalDice({ max: 3, available: 5, rolls: 3 }), 1);
  assert.equal(boundAdditionalDice({ max: 1, available: 5 }), 1);
  assert.equal(boundAdditionalDice({ max: 3, available: 2, rolls: 3 }), 0);
  assert.equal(boundAdditionalDice({ max: 3, available: null }), 0);
});

function reachOf(pool, { needed = 3, triggers = [], routed = false } = {}) {
  const evaluation = countEvaluation(pool);
  const { policy } = resolvePool({ evaluation, thresholdMode: 'meet' });
  return buildAdditionalDiceReach({ policy, needed, triggers, evaluation, routed });
}

const explodeOn = (once) => ({ enabled: true, faces: { kind: 'best', value: null }, once });

test('the per-die most reads qualifying, cancelling and exploding faces', () => {
  assert.deepEqual(reachOf({}), { needed: 3, perDieMost: 1, explode: 'off', rescued: false });
  assert.equal(reachOf({ threshold: '11' }).perDieMost, 0);
  const cancel = (value) => ({ enabled: true, faces: { kind: 'from', value } });
  assert.equal(reachOf({ cancel: cancel(9) }).perDieMost, 1);
  assert.equal(reachOf({ cancel: cancel(10) }).perDieMost, 0);
  assert.deepEqual(reachOf({ explode: explodeOn(true) }).perDieMost, 2);
  assert.deepEqual(reachOf({ explode: explodeOn(false) }).perDieMost, null);
  assert.equal(reachOf({}, { needed: null }).needed, null);
});

const judge = (reach, { base = 2, poolDelta = 0, zeroPoolFails = true, ...rest } = {}) =>
  resolveAdditionalDiceReach({ pool: { base, poolDelta, zeroPoolFails }, reach, ...rest });

test('reach reads explode: recursive never caps the needed count, once doubles (AD9)', () => {
  const recursive = judge(reachOf({ explode: explodeOn(false) }, { needed: 5 }), { limit: 1 });
  assert.equal(recursive.normal.unreachable, false);
  assert.equal(recursive.normal.shortfall, 3);
  const once = (needed) => judge(reachOf({ explode: explodeOn(true) }, { needed })).normal;
  assert.equal(once(4).unreachable, false);
  assert.equal(once(5).unreachable, true);
});

test('the shortfall settles bought dice through the pool rules, never the clamped pool (AD11)', () => {
  const reach = { needed: 2, perDieMost: 1, explode: 'off', rescued: false };
  const floored = judge(reach, { base: 1, poolDelta: -2, zeroPoolFails: false, limit: 5 });
  assert.equal(floored.normal.shortfall, 3);
  const zero = judge({ ...reach, needed: 0 }, { base: 2, poolDelta: -2, limit: 5 });
  assert.equal(zero.normal.shortfall, 1);
  assert.equal(zero.normal.unreachable, false);
});

test('each footer action is its own attempt (R1)', () => {
  const reach = { needed: 3, perDieMost: 1, explode: 'off', rescued: false };
  const deltas = { disadvantage: -1, normal: 0, advantage: 1 };
  const judged = judge(reach, { deltas, limit: 0 });
  assert.deepEqual(
    Object.fromEntries(Object.entries(judged).map(([action, { blocked }]) => [action, blocked])),
    { disadvantage: true, normal: true, advantage: false }
  );
  assert.deepEqual(judged.normal, {
    shortfall: 1,
    unreachable: true,
    zeroPool: false,
    blocked: true,
  });
  assert.equal(judge(reach, { limit: 1 }).normal.blocked, false);
});

test('an unliftable zero pool blocks even when rescued or the needed count is unknown (R4)', () => {
  const pool = { base: 1, poolDelta: -3, limit: 1 };
  for (const reach of [
    { needed: null, perDieMost: 1, explode: 'off', rescued: false },
    { needed: 1, perDieMost: null, explode: 'recursive', rescued: true },
  ]) {
    const { normal } = judge(reach, pool);
    assert.deepEqual([normal.zeroPool, normal.blocked], [true, true]);
  }
  const lifted = judge(
    { needed: null, perDieMost: 1, explode: 'off', rescued: false },
    {
      ...pool,
      limit: 3,
    }
  );
  assert.deepEqual(lifted.normal, {
    shortfall: null,
    unreachable: false,
    zeroPool: false,
    blocked: false,
  });
});

test('a pending contribution counts least for the shortfall and most for reach', () => {
  const reach = { needed: 4, perDieMost: 1, explode: 'off', rescued: false };
  const { normal } = judge(reach, { pending: [{ least: 1, most: 4 }] });
  assert.deepEqual([normal.shortfall, normal.unreachable], [1, false]);
  const unknown = judge(reach, { pending: [{ least: null, most: null }] }).normal;
  assert.deepEqual([unknown.shortfall, unknown.unreachable], [null, false]);
});

test('a null reach judges nothing (R3)', () => {
  const judged = judge(null, { base: 0, deltas: { normal: 0, advantage: 1 } });
  for (const action of ['normal', 'advantage']) {
    assert.deepEqual(judged[action], {
      shortfall: null,
      unreachable: false,
      zeroPool: false,
      blocked: false,
    });
  }
});

const diceTrigger = (operator, value, extra = {}) => ({
  condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator, value },
  outcome: 'success',
  tierStep: { mode: 'none', steps: 1, tierId: null },
  ...extra,
});

test('only a trigger the pool can fire rescues an unreachable attempt (AD10)', () => {
  const unreachable = { needed: 3, perDieMost: 1, explode: 'off' };
  const blocked = (triggers, routed = false) =>
    judge({ ...unreachable, rescued: reachOf({}, { triggers, routed }).rescued }).normal.blocked;
  assert.equal(blocked([diceTrigger('>=', 25)]), true);
  assert.equal(blocked([diceTrigger('==', 10)]), false);
  assert.equal(blocked([diceTrigger('==', 10, { outcome: 'failure' })]), true);
  const step = diceTrigger('==', 10, { outcome: 'none', tierStep: { mode: 'up', steps: 1 } });
  assert.equal(blocked([step]), true);
  assert.equal(blocked([step], true), false);
});

test('a trigger on another condition type rescues, and the evaluation is normalized', () => {
  const total = { condition: { type: 'rollTotal', operator: '>=', value: 3 }, outcome: 'success' };
  assert.equal(countTriggerRescues({ triggers: [total], evaluation: countEvaluation() }), true);
  assert.equal(countTriggerRescues({ triggers: null, evaluation: undefined }), false);
});

test('the public offer allowlists numbers, a reason and the name, never a path or UUID', () => {
  const offer = publicAdditionalDiceOffer({
    available: 2,
    limit: 1,
    max: 1,
    resourceLabel: ' Momentum ',
    unavailable: null,
    path: PATH,
    readMacroUuid: 'Macro.read',
    reach: { needed: 3, perDieMost: 1, explode: 'once', rescued: true, path: PATH },
  });
  assert.deepEqual(offer, {
    available: 2,
    limit: 1,
    max: 1,
    resourceLabel: 'Momentum',
    unavailable: null,
    reach: { needed: 3, perDieMost: 1, explode: 'once', rescued: true },
  });
  const odd = publicAdditionalDiceOffer({ unavailable: 'spendRefused', reach: { perDieMost: 9 } });
  assert.deepEqual([odd.unavailable, odd.reach.perDieMost, odd.reach.explode], [null, null, 'off']);
  assert.equal(publicAdditionalDiceOffer(null), null);
  assert.equal(publicAdditionalDiceOffer({ reach: null }).reach, null);
});

test('withAdditionalDiceRefusal keeps a refusal reason and adds nothing otherwise', () => {
  const cancelled = { success: false, cancelled: true };
  assert.deepEqual(
    withAdditionalDiceRefusal(cancelled, { additionalDiceRefusal: 'spendRefused' }),
    {
      ...cancelled,
      additionalDiceRefusal: 'spendRefused',
    }
  );
  assert.equal(withAdditionalDiceRefusal(cancelled, { cancelled: true }), cancelled);
});

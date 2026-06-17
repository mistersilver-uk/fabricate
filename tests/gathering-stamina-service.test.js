/**
 * Focused unit coverage for `GatheringStaminaService` (issue 376) — the
 * per-actor stamina subsystem extracted from `GatheringRichStateService`. These
 * exercise the collaborator directly through its injected seams: economy reads
 * (`getSystemEconomy`), the expression evaluator, the calendar-aware
 * `secondsPerUnit`, the world-time `now`, and the hook/history factories.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringStaminaService } from '../src/systems/GatheringStaminaService.js';

const HOUR = 3600;

function makeFakeActor() {
  let flags = {};
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    getFlag: (ns, key) => flags[`${ns}.${key}`],
    setFlag: async (ns, key, value) => {
      flags = { ...flags, [`${ns}.${key}`]: value };
      return value;
    }
  };
}

function makeService({
  economy = { stamina: { enabled: true, max: '40', start: '', regen: { policy: 'none' } }, nodes: { enabled: false } },
  evaluate = null,
  now = () => 0,
  secondsPerUnit = () => HOUR
} = {}) {
  const hooks = [];
  const service = new GatheringStaminaService({
    getSystemEconomy: () => economy,
    evaluateExpression: evaluate
      ? async (payload) => evaluate(payload)
      : null,
    secondsPerUnit,
    now,
    callHook: (name, payload) => hooks.push({ name, payload }),
    historyEvent: (type, data = {}) => ({ id: `${type}-stub`, type, worldTime: now(), ...data })
  });
  return { service, hooks };
}

// --- getActorStamina -------------------------------------------------------

test('getActorStamina reads null for an unseeded pool', () => {
  const { service } = makeService();
  const state = service.getActorStamina(makeFakeActor(), 'sys');
  assert.equal(state.current, null);
  assert.equal(state.max, null);
  assert.equal(state.regenerationMode, 'manual');
});

test('getActorStamina applies maxOverride as the effective cap', async () => {
  const { service } = makeService();
  const actor = makeFakeActor();
  await service.setActorStamina(actor, { systemId: 'sys', current: 30, max: 40, maxOverride: 20 });
  const state = service.getActorStamina(actor, 'sys');
  assert.equal(state.max, 20, 'override wins over rolled max');
  assert.equal(state.rolledMax, 40);
  assert.equal(state.maxOverride, 20);
  assert.equal(state.current, 20, 'current clamped to effective cap');
});

test('getActorStamina maps legacy provider:external to a read-only max', async () => {
  const { service } = makeService();
  const actor = makeFakeActor();
  await actor.setFlag('fabricate', 'gatheringState', {
    stamina: { sys: { max: 10, current: 5, provider: 'external' } }
  });
  assert.equal(service.getActorStamina(actor, 'sys').maxReadOnly, true);
});

// --- seedActorStaminaIfNeeded ---------------------------------------------

test('seedActorStaminaIfNeeded rolls max/start once and persists numbers', async () => {
  const { service, hooks } = makeService({
    economy: { stamina: { enabled: true, max: '40', start: '', regen: { policy: 'overTime', unit: 'hours' } } },
    now: () => 100
  });
  const actor = makeFakeActor();
  const entry = await service.seedActorStaminaIfNeeded({ actor, systemId: 'sys' });
  assert.equal(entry.max, 40);
  assert.equal(entry.current, 40, 'blank start ⇒ full');
  assert.equal(entry.regenerationMode, 'auto');
  assert.equal(entry.lastRegenWorldTime, 100, 'anchor seeded from now()');
  assert.ok(hooks.some((h) => h.name === 'fabricate.gathering.staminaSeeded'));
});

test('seedActorStaminaIfNeeded is idempotent unless forced', async () => {
  const { service } = makeService({
    economy: { stamina: { enabled: true, max: '40', start: '', regen: { policy: 'none' } } }
  });
  const actor = makeFakeActor();
  await service.seedActorStaminaIfNeeded({ actor, systemId: 'sys' });
  await service.adjustActorStamina(actor, { systemId: 'sys', delta: -10 });
  const again = await service.seedActorStaminaIfNeeded({ actor, systemId: 'sys' });
  assert.equal(again.current, 30, 'kept the existing pool');
  const forced = await service.seedActorStaminaIfNeeded({ actor, systemId: 'sys', force: true });
  assert.equal(forced.current, 40, 'force re-rolls to full');
});

test('seedActorStaminaIfNeeded no-ops when stamina disabled or max blank', async () => {
  const disabled = makeService({ economy: { stamina: { enabled: false } } });
  assert.equal(await disabled.service.seedActorStaminaIfNeeded({ actor: makeFakeActor(), systemId: 'sys' }), null);

  const noMax = makeService({ economy: { stamina: { enabled: true, max: '', start: '' } } });
  assert.equal(await noMax.service.seedActorStaminaIfNeeded({ actor: makeFakeActor(), systemId: 'sys' }), null);
});

// --- _evaluateStaminaExpression -------------------------------------------

test('_evaluateStaminaExpression returns null for blank and resolves the evaluator', async () => {
  const seen = [];
  const { service } = makeService({ evaluate: (p) => { seen.push(p); return 7; } });
  assert.equal(await service._evaluateStaminaExpression({ expression: '' }), null);
  const value = await service._evaluateStaminaExpression({ expression: '1d1+6', actor: makeFakeActor(), kind: 'staminaMax' });
  assert.equal(value, 7);
  assert.equal(seen[0].kind, 'staminaMax');
});

// --- setActorStamina / adjustActorStamina ---------------------------------

test('setActorStamina preserves the regen anchor on a manual GM set', async () => {
  const { service } = makeService();
  const actor = makeFakeActor();
  await actor.setFlag('fabricate', 'gatheringState', {
    stamina: { sys: { max: 40, current: 20, lastRegenWorldTime: 555 } }
  });
  const next = await service.setActorStamina(actor, { systemId: 'sys', current: 10 });
  assert.equal(next.current, 10);
  assert.equal(next.lastRegenWorldTime, 555, 'anchor untouched');
});

test('adjustActorStamina clamps to the effective cap and floors at zero', async () => {
  const { service } = makeService();
  const actor = makeFakeActor();
  await service.setActorStamina(actor, { systemId: 'sys', current: 5, max: 40 });
  assert.equal((await service.adjustActorStamina(actor, { systemId: 'sys', delta: 100 })).current, 40);
  assert.equal((await service.adjustActorStamina(actor, { systemId: 'sys', delta: -1000 })).current, 0);
});

// --- regenerateActorStamina (anchor math) ---------------------------------

test('regenerateActorStamina adds per-interval amount and advances the anchor', async () => {
  const { service } = makeService({
    economy: { stamina: { enabled: true, max: '40', regen: { policy: 'overTime', unit: 'hours', amount: '2' } } },
    evaluate: () => 2,
    now: () => 0
  });
  const actor = makeFakeActor();
  await actor.setFlag('fabricate', 'gatheringState', {
    stamina: { sys: { max: 40, current: 10, lastRegenWorldTime: 0, regenerationMode: 'auto' } }
  });
  const next = await service.regenerateActorStamina({ actor, systemId: 'sys', worldTime: 3 * HOUR });
  assert.equal(next.current, 16, '3 intervals × 2');
  assert.equal(next.lastRegenWorldTime, 3 * HOUR, 'anchor advanced by consumed intervals');
});

test('regenerateActorStamina re-anchors without gain when time runs backwards', async () => {
  const { service } = makeService({
    economy: { stamina: { enabled: true, max: '40', regen: { policy: 'overTime', unit: 'hours', amount: '2' } } },
    evaluate: () => 2
  });
  const actor = makeFakeActor();
  await actor.setFlag('fabricate', 'gatheringState', {
    stamina: { sys: { max: 40, current: 10, lastRegenWorldTime: 5 * HOUR } }
  });
  const result = await service.regenerateActorStamina({ actor, systemId: 'sys', worldTime: 2 * HOUR });
  assert.equal(result, null, 'no-op on backwards time');
  assert.equal(service.getActorStamina(actor, 'sys').current, 10);
});

test('regenerateActorStamina no-ops when regen is off or the pool is unmaterialized', async () => {
  const off = makeService({ economy: { stamina: { enabled: true, max: '40', regen: { policy: 'none' } } } });
  assert.equal(await off.service.regenerateActorStamina({ actor: makeFakeActor(), systemId: 'sys', worldTime: HOUR }), null);

  const noPool = makeService({
    economy: { stamina: { enabled: true, max: '40', regen: { policy: 'overTime', unit: 'hours', amount: '2' } } }
  });
  assert.equal(await noPool.service.regenerateActorStamina({ actor: makeFakeActor(), systemId: 'sys', worldTime: HOUR }), null);
});

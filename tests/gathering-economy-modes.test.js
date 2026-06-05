import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { makeRichState, makeFakeActor, environment, DEFAULT_TEST_SYSTEM } from './helpers/gathering.js';

const SYSTEM = 'system-test';
const HOUR = 3600;

function staminaConfig(regen = {}) {
  return {
    systems: {
      [SYSTEM]: {
        economy: {
          mode: 'stamina',
          stamina: { regen: { policy: 'elapsedTime', unit: 'hours', amount: 5, ...regen } }
        }
      }
    }
  };
}

describe('gathering economy — config normalization', () => {
  it('defaults a system economy to none/no-regen', () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: {} } } });
    const econ = service.systemEconomy(SYSTEM);
    assert.equal(econ.mode, 'none');
    assert.equal(econ.stamina.regen.policy, 'none');
    assert.equal(econ.stamina.regen.unit, 'hours');
  });

  it('rejects an invalid mode and regen unit', () => {
    const { service } = makeRichState({
      config: { systems: { [SYSTEM]: { economy: { mode: 'hybrid', stamina: { regen: { policy: 'elapsedTime', unit: 'fortnights', amount: 2 } } } } } }
    });
    const econ = service.systemEconomy(SYSTEM);
    assert.equal(econ.mode, 'none'); // 'hybrid' is no longer valid
    assert.equal(econ.stamina.regen.unit, 'hours'); // unknown unit falls back
    assert.equal(econ.stamina.regen.amount, '2'); // amount is a number-or-formula string
  });

  it('persists a system economy via setSystemEconomy', async () => {
    const { service, settings } = makeRichState({ config: {} });
    await service.setSystemEconomy({ systemId: SYSTEM, economy: { mode: 'nodes' } });
    assert.equal(service.economyMode(SYSTEM), 'nodes');
    assert.ok(settings.get(SETTING_KEYS.GATHERING_CONFIG).systems[SYSTEM].economy);
  });
});

describe('gathering economy — stamina regeneration over world time', () => {
  it('regenerates a fixed amount per elapsed interval, clamped to max, after anchoring', async () => {
    const { service } = makeRichState({ config: staminaConfig() });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 12 });

    // First observation only anchors; no regen yet.
    assert.equal(await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 }), null);

    // Two whole hours elapse → +5 * 2 = 10.
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(after.current, 10);

    // One more hour → would be 15 but clamps to the max of 12.
    const capped = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 3 * HOUR });
    assert.equal(capped.current, 12);
  });

  it('preserves the fractional remainder across ticks (catch-up accounting)', async () => {
    const { service } = makeRichState({ config: staminaConfig() });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 100 });
    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 });

    // 1.5 hours: one whole interval applies, anchor advances to 1h (not 1.5h).
    const first = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: HOUR + 1800 });
    assert.equal(first.current, 5);
    // Another 0.5h later (total 2.0h): the remaining half-hour completes the 2nd interval.
    const second = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(second.current, 10);
  });

  it('does not regenerate when world time runs backwards (re-anchors, never negative)', async () => {
    const { service } = makeRichState({ config: staminaConfig() });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 4, max: 100 });
    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 10 * HOUR });
    const back = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(back, null);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 4);
  });

  it('skips regen when the pool has no max or the system is not in stamina mode', async () => {
    const noMax = makeRichState({ config: staminaConfig() });
    const a1 = makeFakeActor();
    await noMax.service.setActorStamina(a1, { systemId: SYSTEM, current: 0, max: null, provider: 'external' });
    assert.equal(await noMax.service.regenerateActorStamina({ actor: a1, systemId: SYSTEM, worldTime: 5 * HOUR }), null);

    const nodesMode = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'nodes' } } } } });
    const a2 = makeFakeActor();
    await nodesMode.service.setActorStamina(a2, { systemId: SYSTEM, current: 0, max: 10 });
    await nodesMode.service.regenerateActorStamina({ actor: a2, systemId: SYSTEM, worldTime: 0 });
    assert.equal(await nodesMode.service.regenerateActorStamina({ actor: a2, systemId: SYSTEM, worldTime: 9 * HOUR }), null);
  });

  it('evaluates the regen amount as an in-game expression (number or formula)', async () => {
    const config = {
      systems: {
        [SYSTEM]: {
          economy: {
            mode: 'stamina',
            stamina: { regen: { policy: 'elapsedTime', unit: 'hours', amount: '1 + @abilities.con.mod' } }
          }
        }
      }
    };
    const calls = [];
    const { service } = makeRichState({ config, evaluateExpression: (payload) => { calls.push(payload.expression); return 5; } });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 100 });
    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 });
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: HOUR });
    assert.equal(after.current, 5); // the single expression resolves to 5 per interval
    assert.equal(calls.at(-1), '1 + @abilities.con.mod'); // the raw expression is evaluated in-game
  });
});

describe('gathering economy — node respawn over world time', () => {
  function nodeService({ mode = 'nodes', respawn, current = 0, max = 4, rolls = [] } = {}) {
    const env = environment({
      tasks: [{
        id: 'task-node',
        name: 'Vein',
        nodes: { enabled: true, max, current, depletionTiming: 'onStart', respawn }
      }]
    });
    const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, { systems: { [SYSTEM]: { economy: { mode } } } }]]);
    const queue = [...rolls];
    const service = new GatheringRichStateService({
      getSetting: key => settings.get(key),
      setSetting: async (key, value) => { settings.set(key, value); return value; },
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      environmentStore: {
        get: () => env,
        list: () => [env],
        update: async (id, patch) => { Object.assign(env, patch); return env; }
      },
      rollD100: () => queue.shift() ?? 100,
      hooks: { callAll: () => {} }
    });
    return { service, env };
  }

  it('restores one node per elapsed interval (elapsedTime), clamped to max', async () => {
    const { service, env } = nodeService({ respawn: { policy: 'elapsedTime', intervalSeconds: HOUR }, current: 0, max: 3 });
    await service.respawnNodes({ environment: env, worldTime: 0 }); // anchor
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
    assert.equal(env.tasks[0].nodes.current, 2);
    await service.respawnNodes({ environment: env, worldTime: 10 * HOUR });
    assert.equal(env.tasks[0].nodes.current, 3); // clamped
  });

  it('uses a persisted probability roll that is not rerolled on a same-tick refresh', async () => {
    // chance 0.5 → success threshold 50. One interval, roll 30 ≤ 50 → +1.
    const { service, env } = nodeService({ respawn: { policy: 'probability', intervalSeconds: HOUR, chance: 0.5 }, current: 0, max: 5, rolls: [30] });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: HOUR });
    assert.equal(env.tasks[0].nodes.current, 1);
    assert.equal(env.tasks[0].nodes.respawn.lastRoll.rolls[0], 30);
    // Same world time again → no new interval, no reroll, count unchanged.
    const again = await service.respawnNodes({ environment: env, worldTime: HOUR });
    assert.equal(again, null);
    assert.equal(env.tasks[0].nodes.current, 1);
  });

  it('does not respawn when the system is not in nodes mode', async () => {
    const { service, env } = nodeService({ mode: 'stamina', respawn: { policy: 'elapsedTime', intervalSeconds: HOUR }, current: 0, max: 3 });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    const result = await service.respawnNodes({ environment: env, worldTime: 5 * HOUR });
    assert.equal(result, null);
    assert.equal(env.tasks[0].nodes.current, 0);
  });
});

describe('gathering economy — cost modifiers and mode gating', () => {
  function costConfig(mode = 'stamina') {
    return {
      systems: {
        [SYSTEM]: {
          characterModifiers: [{ id: 'str', label: 'Str', provider: 'dnd5e', expression: '@abilities.str.mod' }],
          economy: { mode }
        }
      }
    };
  }
  const task = (overrides = {}) => ({ id: 'task-1', name: 'Mine', staminaCost: 5, ...overrides });

  it('reduces the effective stamina cost by a character modifier, floored at 0', async () => {
    const { service } = makeRichState({ config: costConfig(), evaluateExpression: () => 3 });
    const env = environment();
    const cheaper = await service._effectiveStaminaCost({
      actor: makeFakeActor(), system: { id: SYSTEM }, environment: env,
      task: task({ staminaCostModifiers: [{ modifierId: 'str', operator: '-', min: 0, max: 4 }] })
    });
    assert.equal(cheaper, 2); // 5 - 3

    const { service: free } = makeRichState({ config: costConfig(), evaluateExpression: () => 99 });
    const floored = await free._effectiveStaminaCost({
      actor: makeFakeActor(), system: { id: SYSTEM }, environment: env,
      task: task({ staminaCostModifiers: [{ modifierId: 'str', operator: '-' }] })
    });
    assert.equal(floored, 0); // never negative
  });

  it('blocks on insufficient stamina only in stamina mode, and the gate equals the spend', async () => {
    const { service } = makeRichState({ config: costConfig('stamina'), evaluateExpression: () => 0 });
    const env = environment();
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 3, max: 10 });

    const blocked = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: task() });
    assert.equal(blocked.blockedReasons.some(r => r.code === 'STAMINA_BLOCKED'), true);
    assert.equal(blocked.evidence.stamina.cost, 5);

    // Top up so the attempt passes, then commit and confirm exactly the cost is spent.
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 8, max: 10 });
    const ok = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: task() });
    assert.equal(ok.blockedReasons.length, 0);
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: task(), outcome: { status: 'succeeded' } });
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 3);
  });

  it('does not gate or spend stamina when the system mode is none', async () => {
    const { service } = makeRichState({ config: costConfig('none') });
    const env = environment();
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 1, max: 10 });
    const result = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: task() });
    assert.equal(result.blockedReasons.length, 0);
    assert.equal(result.evidence.stamina, null);
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: task(), outcome: { status: 'succeeded' } });
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 1); // untouched
  });

  it('blocks a depleted node only in nodes mode; a GM viewer bypasses without consuming', async () => {
    const { service } = makeRichState({ config: costConfig('nodes') });
    const env = environment();
    const depleted = task({ staminaCost: 0, nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'none' } } });

    const player = await service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: depleted, viewer: { isGM: false } });
    assert.equal(player.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);

    const gm = await service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: depleted, viewer: { isGM: true } });
    assert.equal(gm.blockedReasons.length, 0);
  });

  it('treats an external stamina provider max as read-only', async () => {
    const { service } = makeRichState({ config: costConfig('stamina') });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 5, max: 20, provider: 'external' });
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 8, max: 999, provider: 'external' });
    const state = service.getActorStamina(actor, SYSTEM);
    assert.equal(state.max, 20); // external max unchanged
    assert.equal(state.current, 8);
  });
});

describe('gathering economy — processWorldTime drives regen under the primary-GM gate', () => {
  function makeStaminaEngine({ isPrimaryGM }) {
    const { service } = makeRichState({ config: staminaConfig() });
    const actor = makeFakeActor();
    const env = environment();
    const engine = new GatheringEngine({
      environmentStore: { list: () => [env], get: () => env },
      getSystems: () => [DEFAULT_TEST_SYSTEM],
      richState: service,
      runManager: { getMaturedWaitingRuns: async () => [] },
      isPrimaryGM,
      getActors: () => [actor]
    });
    return { engine, service, actor };
  }

  it('regenerates stamina on the primary GM and still matures runs', async () => {
    const { engine, service, actor } = makeStaminaEngine({ isPrimaryGM: () => true });
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 50 });
    await engine.processWorldTime(0); // anchor
    const result = await engine.processWorldTime(2 * HOUR);
    assert.equal(result.staminaRegen.length, 1);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 10);
  });

  it('does not regenerate on a non-primary GM client', async () => {
    const { engine, service, actor } = makeStaminaEngine({ isPrimaryGM: () => false });
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 50 });
    await engine.processWorldTime(0);
    const result = await engine.processWorldTime(5 * HOUR);
    assert.deepEqual(result.staminaRegen, []);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 0);
  });
});

describe('gathering economy — system-level default (global) stamina max', () => {
  it('normalizes a system default stamina max (null by default)', () => {
    const set = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: 12 } } } } } });
    assert.equal(set.service.systemEconomy(SYSTEM).stamina.max, 12);
    const unset = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina' } } } } });
    assert.equal(unset.service.systemEconomy(SYSTEM).stamina.max, null);
  });

  it('falls back to the global max and starts characters full when they have no stored pool', () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: 15 } } } } } });
    const eff = service.getActorStamina(makeFakeActor(), SYSTEM);
    assert.equal(eff.max, 15);
    assert.equal(eff.current, 15); // a fresh character starts full at the effective max
  });

  it('regenerates up to the global max without baking it into the per-actor entry', async () => {
    const config = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: 20, regen: { policy: 'elapsedTime', unit: 'hours', amount: 5 } } } } } };
    const { service } = makeRichState({ config });
    const actor = makeFakeActor();

    // Spend from the (defaulted) full pool — creates an entry below max with a null stored max.
    await service.adjustActorStamina(actor, { systemId: SYSTEM, delta: -8 });
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 12);

    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 }); // anchor
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(after.current, 20); // 12 + 5*2 = 22, clamped to the global max 20
    assert.equal(after.max, null); // the global max is not baked into the entry
  });
});

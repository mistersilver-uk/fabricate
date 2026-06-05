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

describe('gathering economy — expression-based max/start (seed once per character)', () => {
  it('normalizes max and start as expression strings (empty by default)', () => {
    const set = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: 12, start: '@abilities.con.mod' } } } } } });
    assert.equal(set.service.systemEconomy(SYSTEM).stamina.max, '12'); // numbers stringify
    assert.equal(set.service.systemEconomy(SYSTEM).stamina.start, '@abilities.con.mod');
    const unset = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina' } } } } });
    assert.equal(unset.service.systemEconomy(SYSTEM).stamina.max, '');
    assert.equal(unset.service.systemEconomy(SYSTEM).stamina.start, '');
  });

  it('seeds a character pool by rolling max & start once; blank start starts full', async () => {
    const config = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: '4 * @abilities.con.mod' } } } } };
    let rolls = 0;
    const { service } = makeRichState({ config, evaluateExpression: (p) => (p.kind === 'staminaMax' ? (++rolls, 16) : null) });
    const actor = makeFakeActor();

    const seeded = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM });
    assert.equal(seeded.max, 16);
    assert.equal(seeded.current, 16); // blank start ⇒ full
    assert.equal(rolls, 1);

    // Idempotent: a second call does not reroll.
    const again = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM });
    assert.equal(again.max, 16);
    assert.equal(rolls, 1);

    // getActorStamina reads the materialized numbers synchronously.
    assert.deepEqual(
      { current: service.getActorStamina(actor, SYSTEM).current, max: service.getActorStamina(actor, SYSTEM).max },
      { current: 16, max: 16 }
    );
  });

  it('starts at the rolled starting value when one is configured, and force re-rolls', async () => {
    const config = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: '20', start: '@abilities.con.mod' } } } } };
    const seq = { staminaMax: [20, 30], staminaStart: [7, 9] };
    const { service } = makeRichState({ config, evaluateExpression: (p) => seq[p.kind].shift() });
    const actor = makeFakeActor();

    const seeded = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM });
    assert.deepEqual({ current: seeded.current, max: seeded.max }, { current: 7, max: 20 });

    const rerolled = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM, force: true });
    assert.deepEqual({ current: rerolled.current, max: rerolled.max }, { current: 9, max: 30 });
  });

  it('does not seed when the max expression is blank (stamina then unenforced)', async () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina' } } } } });
    const actor = makeFakeActor();
    assert.equal(await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM }), null);
    assert.equal(service.getActorStamina(actor, SYSTEM).max, null);
  });

  it('regenerates up to the rolled max once the pool is seeded', async () => {
    const config = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: '20', start: '12', regen: { policy: 'elapsedTime', unit: 'hours', amount: 5 } } } } } };
    const { service } = makeRichState({ config, evaluateExpression: (p) => (p.kind === 'staminaMax' ? 20 : p.kind === 'staminaStart' ? 12 : 5) });
    const actor = makeFakeActor();
    await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM }); // current 12 / max 20

    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 }); // re-anchor
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(after.current, 20); // 12 + 5*2 = 22, clamped to the rolled max 20
    assert.equal(after.max, 20);
  });
});

describe('gathering economy — per-character max override', () => {
  it('layers an override over the rolled max and falls back when cleared', async () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: '20' } } } } } });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 18, max: 20 }); // rolled pool

    // Set an override below the rolled max → effective max is the override, current clamps.
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 18, maxOverride: 12 });
    let s = service.getActorStamina(actor, SYSTEM);
    assert.equal(s.max, 12);        // effective
    assert.equal(s.rolledMax, 20);  // rolled preserved
    assert.equal(s.maxOverride, 12);
    assert.equal(s.current, 12);    // clamped to the override

    // Clearing the override falls back to the rolled max.
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 12, maxOverride: null });
    s = service.getActorStamina(actor, SYSTEM);
    assert.equal(s.max, 20);
    assert.equal(s.maxOverride, null);
  });

  it('regenerates up to the override, and a force reroll clears it', async () => {
    const config = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { max: '50', start: '50', regen: { policy: 'elapsedTime', unit: 'hours', amount: 5 } } } } } };
    const { service } = makeRichState({ config, evaluateExpression: (p) => (p.kind === 'staminaMax' ? 50 : p.kind === 'staminaStart' ? 50 : 5) });
    const actor = makeFakeActor();
    await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM }); // 50/50

    // Override the cap to 15 and drop current below it.
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 10, maxOverride: 15 });
    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 }); // anchor
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 2 * HOUR });
    assert.equal(after.current, 15); // 10 + 5*2 = 20, clamped to the override 15

    // A force reroll resets the pool and clears the override.
    const rerolled = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM, force: true });
    assert.equal(rerolled.current, 50);
    assert.equal(service.getActorStamina(actor, SYSTEM).maxOverride, null);
  });
});

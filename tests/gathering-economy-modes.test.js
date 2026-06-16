import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { makeRichState, makeFakeActor, environment, DEFAULT_TEST_SYSTEM } from './helpers/gathering.js';

const SYSTEM = 'system-test';
const HOUR = 3600;

// Build the two-flag economy block from a legacy-style mode string, so the
// existing per-mode fixtures read clearly while exercising the new shape.
function economyForMode(mode) {
  return { stamina: { enabled: mode === 'stamina' }, nodes: { enabled: mode === 'nodes' } };
}

function staminaConfig(regen = {}) {
  return {
    systems: {
      [SYSTEM]: {
        economy: {
          stamina: { enabled: true, regen: { policy: 'overTime', unit: 'hours', amount: 5, ...regen } },
          nodes: { enabled: false }
        }
      }
    }
  };
}

describe('gathering economy — config normalization', () => {
  it('defaults a system economy to both flags off / no-regen', () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: {} } } });
    const econ = service.systemEconomy(SYSTEM);
    assert.equal(econ.stamina.enabled, false);
    assert.equal(econ.nodes.enabled, false);
    assert.equal(service.economyMode(SYSTEM), 'none');
    assert.equal(econ.stamina.regen.policy, 'none');
    assert.equal(econ.stamina.regen.unit, 'hours');
  });

  it('rejects an invalid legacy mode and regen unit', () => {
    const { service } = makeRichState({
      config: { systems: { [SYSTEM]: { economy: { mode: 'hybrid', stamina: { regen: { policy: 'overTime', unit: 'fortnights', amount: 2 } } } } } }
    });
    const econ = service.systemEconomy(SYSTEM);
    // 'hybrid' is not a recognized legacy mode ⇒ neither flag is set.
    assert.equal(econ.stamina.enabled, false);
    assert.equal(econ.nodes.enabled, false);
    assert.equal(econ.stamina.regen.unit, 'hours'); // unknown unit falls back
    assert.equal(econ.stamina.regen.amount, '2'); // amount is a number-or-formula string
  });

  it('maps a legacy elapsedTime regen policy to overTime at read time (regen stays active)', () => {
    const { service } = makeRichState({
      config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, regen: { policy: 'elapsedTime', unit: 'hours', amount: 3 } } } } } }
    });
    const econ = service.systemEconomy(SYSTEM);
    // Un-migrated worlds keep the unified `overTime` term rather than degrading to `none`.
    assert.equal(econ.stamina.regen.policy, 'overTime');
    assert.equal(econ.stamina.regen.unit, 'hours');
    assert.equal(econ.stamina.regen.amount, '3');
  });

  it('falls back an unknown regen policy to none', () => {
    const { service } = makeRichState({
      config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, regen: { policy: 'sometimes' } } } } } }
    });
    assert.equal(service.systemEconomy(SYSTEM).stamina.regen.policy, 'none');
  });

  it('persists a system economy via setSystemEconomy', async () => {
    const { service, settings } = makeRichState({ config: {} });
    await service.setSystemEconomy({ systemId: SYSTEM, economy: { nodes: { enabled: true } } });
    assert.equal(service.nodesEnabled(SYSTEM), true);
    assert.equal(service.staminaEnabled(SYSTEM), false);
    assert.equal(service.economyMode(SYSTEM), 'nodes');
    assert.ok(settings.get(SETTING_KEYS.GATHERING_CONFIG).systems[SYSTEM].economy);
  });

  it('weatherEnabled/timeOfDayEnabled default to true and reflect the per-system toggles', () => {
    const enabled = makeRichState({ config: { systems: { [SYSTEM]: {} } } }).service;
    assert.equal(enabled.weatherEnabled(SYSTEM), true, 'weather defaults enabled');
    assert.equal(enabled.timeOfDayEnabled(SYSTEM), true, 'time-of-day defaults enabled');

    const disabled = makeRichState({
      config: { systems: { [SYSTEM]: { conditions: { weather: { enabled: false }, timeOfDay: { enabled: false } } } } }
    }).service;
    assert.equal(disabled.weatherEnabled(SYSTEM), false, 'weather toggle honored');
    assert.equal(disabled.timeOfDayEnabled(SYSTEM), false, 'time-of-day toggle honored');
  });

  describe('read-time legacy mode → flags mapping', () => {
    function econFor(raw) {
      return makeRichState({ config: { systems: { [SYSTEM]: { economy: raw } } } }).service.systemEconomy(SYSTEM);
    }

    it('maps a legacy mode when no flags are present', () => {
      const stamina = econFor({ mode: 'stamina' });
      assert.equal(stamina.stamina.enabled, true);
      assert.equal(stamina.nodes.enabled, false);

      const nodes = econFor({ mode: 'nodes' });
      assert.equal(nodes.stamina.enabled, false);
      assert.equal(nodes.nodes.enabled, true);

      const none = econFor({ mode: 'none' });
      assert.equal(none.stamina.enabled, false);
      assert.equal(none.nodes.enabled, false);

      const absent = econFor({});
      assert.equal(absent.stamina.enabled, false);
      assert.equal(absent.nodes.enabled, false);
    });

    it('lets present flags win over a stale mode (no resurrection of a disabled limit)', () => {
      // A stale `mode: 'stamina'` must NOT resurrect stamina when the flag is
      // explicitly disabled (the key is present and false).
      const disabled = econFor({ mode: 'stamina', stamina: { enabled: false } });
      assert.equal(disabled.stamina.enabled, false);

      // Both flags explicitly on with a conflicting stale mode ⇒ both win.
      const both = econFor({ mode: 'nodes', stamina: { enabled: true }, nodes: { enabled: true } });
      assert.equal(both.stamina.enabled, true);
      assert.equal(both.nodes.enabled, true);
      assert.equal(makeRichState({ config: { systems: { [SYSTEM]: { economy: { mode: 'nodes', stamina: { enabled: true }, nodes: { enabled: true } } } } } }).service.economyMode(SYSTEM), 'both');
    });
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

    const nodesMode = makeRichState({ config: { systems: { [SYSTEM]: { economy: economyForMode('nodes') } } } });
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
            stamina: { enabled: true, regen: { policy: 'overTime', unit: 'hours', amount: '1 + @abilities.con.mod' } },
            nodes: { enabled: false }
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
  function nodeService({ mode = 'nodes', respawn, current = 0, max = 4, rolls = [], amounts = null, onEvaluate = null, evaluate = null } = {}) {
    const env = environment({
      nodeRuntime: {
        'task-node': { enabled: true, max, current, depletionTiming: 'onStart', respawn }
      }
    });
    const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, { systems: { [SYSTEM]: { economy: economyForMode(mode) } } }]]);
    const queue = [...rolls];
    // Expression seam: when `amounts` is provided, evaluate the dice expression
    // to the next queued amount (deterministic stand-in for Foundry's Roll).
    const amountQueue = Array.isArray(amounts) ? [...amounts] : null;
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
      ...(evaluate ? { evaluateExpression: evaluate } : {}),
      ...(amountQueue ? { evaluateExpression: async (payload) => { onEvaluate?.(payload); return amountQueue.length ? amountQueue.shift() : 0; } } : {}),
      hooks: { callAll: () => {} }
    });
    return { service, env };
  }

  it('adds one node per elapsed interval (overTime + guaranteed), clamped to max', async () => {
    const { service, env } = nodeService({ respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR }, current: 0, max: 3 });
    await service.respawnNodes({ environment: env, worldTime: 0 }); // anchor
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 2);
    await service.respawnNodes({ environment: env, worldTime: 10 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 3); // clamped
  });

  it('uses a persisted chance roll (overTime + chance) that is not rerolled on a same-tick refresh', async () => {
    // chance 0.5 → success threshold 50. One interval, roll 30 ≤ 50 → +1.
    const { service, env } = nodeService({ respawn: { policy: 'overTime', gainMode: 'chance', intervalSeconds: HOUR, chance: 0.5 }, current: 0, max: 5, rolls: [30] });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 1);
    assert.equal(env.nodeRuntime['task-node'].respawn.lastRoll.rolls[0], 30);
    // Same world time again → no new interval, no reroll, count unchanged.
    const again = await service.respawnNodes({ environment: env, worldTime: HOUR });
    assert.equal(again, null);
    assert.equal(env.nodeRuntime['task-node'].current, 1);
  });

  it('rolls a dice expression for the per-interval amount (overTime + expression)', async () => {
    // Two intervals, each rolls the expression: 3 then 2 → +5.
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '1d4' },
      current: 0, max: 10, amounts: [3, 2]
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 5);
    assert.equal(env.nodeRuntime['task-node'].respawn.lastRoll.expression, '1d4');
    assert.deepEqual(env.nodeRuntime['task-node'].respawn.lastRoll.rolls, [3, 2]);
  });

  it('stops rolling the expression once the pool is full (clamped to max)', async () => {
    // room is 2 but the first roll already overfills → clamp to max, stop early.
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '1d4' },
      current: 3, max: 5, amounts: [3, 3, 3]
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 5 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 5);
    // Bounded by room (2): a single roll filled the pool, so only one roll was taken.
    assert.equal(env.nodeRuntime['task-node'].respawn.lastRoll.rolls.length, 1);
  });

  it('falls back to a numeric expression when no Roll evaluator is injected (headless)', async () => {
    // No `amounts` seam → evaluateExpression is absent → Number('2') resolves per interval.
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '2' },
      current: 0, max: 10
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 4); // 2 intervals × 2
  });

  it('floors negative / NaN expression results at zero (never shrinks the pool)', async () => {
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '1d4-2' },
      current: 0, max: 10, amounts: [-3, NaN, 2]
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 3 * HOUR });
    assert.equal(env.nodeRuntime['task-node'].current, 2); // -3→0, NaN→0, 2→2
  });

  it('treats a malformed expression as zero gain without aborting respawn', async () => {
    // An evaluator that throws (e.g. an unparseable dice string) must not bubble
    // up and abort respawn for the environment — the interval simply adds nothing.
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '1d' },
      current: 1, max: 5, evaluate: async () => { throw new Error('malformed dice'); }
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await assert.doesNotReject(() => service.respawnNodes({ environment: env, worldTime: 3 * HOUR }));
    assert.equal(env.nodeRuntime['task-node'].current, 1); // unchanged, no crash
  });

  it('re-anchors without gain when world time runs backwards (overTime)', async () => {
    const { service, env } = nodeService({ respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR }, current: 0, max: 5 });
    await service.respawnNodes({ environment: env, worldTime: 10 * HOUR }); // anchor at 10h
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR }); // time goes backwards
    assert.equal(env.nodeRuntime['task-node'].current, 0); // no gain
    assert.equal(env.nodeRuntime['task-node'].respawn.lastEvaluatedWorldTime, 2 * HOUR); // re-anchored
  });

  it('evaluates the amount expression with the nodeRespawn kind and environment context', async () => {
    const payloads = [];
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'expression', intervalSeconds: HOUR, amountExpression: '1d4' },
      current: 0, max: 10, amounts: [2], onEvaluate: p => payloads.push(p)
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: HOUR });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].kind, 'nodeRespawn');
    assert.equal(payloads[0].actor, null); // respawn is environment-level, no actor
    assert.equal(payloads[0].expression, '1d4');
    assert.ok(payloads[0].environment, 'the environment is passed for expression context');
  });

  it('does not respawn when the system is not in nodes mode', async () => {
    const { service, env } = nodeService({ mode: 'stamina', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR }, current: 0, max: 3 });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    const result = await service.respawnNodes({ environment: env, worldTime: 5 * HOUR });
    assert.equal(result, null);
    assert.equal(env.nodeRuntime['task-node'].current, 0);
  });
});

describe('gathering economy — per-environment node pools (library tasks)', () => {
  const LIB_TASK = (overrides = {}) => ({
    id: 'lib-1', name: 'Mine',
    nodes: { enabled: true, max: 2, current: 2, depletionTiming: 'onStart', respawn: { policy: 'manual' }, ...(overrides.nodes || {}) },
    ...overrides
  });

  function libService({ mode = 'nodes', task = LIB_TASK(), nodeRuntime = {}, envs = null, rolls = [] } = {}) {
    const environments = envs || [environment({ id: 'env-1', tasks: [], nodeRuntime })];
    const byId = new Map(environments.map(e => [e.id, e]));
    const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, { systems: { [SYSTEM]: { economy: economyForMode(mode), tasks: [task] } } }]]);
    const queue = [...rolls];
    const hookCalls = [];
    const service = new GatheringRichStateService({
      getSetting: key => settings.get(key),
      setSetting: async (key, value) => { settings.set(key, value); return value; },
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      environmentStore: {
        get: id => byId.get(id) ?? environments[0],
        list: () => environments,
        update: async (id, patch) => { Object.assign(byId.get(id), patch); return byId.get(id); }
      },
      rollD100: () => queue.shift() ?? 100,
      hooks: { callAll: (name, payload) => { hookCalls.push({ name, payload }); } }
    });
    return { service, environments, env: environments[0], task, hookCalls };
  }

  it('carries node config into the runtime task: seeds current=max, else uses stored runtime', async () => {
    const { service, env, task } = libService();
    const fresh = service._libraryTaskToRuntimeTask(task, env);
    assert.equal(fresh.nodes.current, 2);
    assert.equal(fresh.nodes.max, 2);

    env.nodeRuntime = { 'lib-1': { enabled: true, max: 2, current: 1, depletionTiming: 'onStart', respawn: { policy: 'manual' } } };
    const stored = service._libraryTaskToRuntimeTask(task, env);
    assert.equal(stored.nodes.current, 1, 'uses the per-environment runtime pool');
  });

  it('depletes the per-environment pool on attempt, floors at 0, and the gate blocks when empty', async () => {
    const { service, env, task } = libService({ task: LIB_TASK({ nodes: { enabled: true, max: 2, current: 2, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }) });
    const actor = makeFakeActor();

    const runtime1 = service._libraryTaskToRuntimeTask(task, env);
    const ev1 = await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: runtime1, outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 1);
    assert.equal(ev1.node.remaining, 1);

    const runtime2 = service._libraryTaskToRuntimeTask(task, env); // reads nodeRuntime → current 1
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: runtime2, outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 0);

    const gate = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env) });
    assert.equal(gate.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);
  });

  it('respects depletionTiming onSuccess (only successful attempts consume)', async () => {
    const { service, env, task } = libService({ task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onSuccess', respawn: { policy: 'manual' } } }) });
    const actor = makeFakeActor();
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'failed' } });
    assert.equal(env.nodeRuntime['lib-1'], undefined, 'a failed attempt does not consume');
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 2);
  });

  it('keeps pools independent across environments', async () => {
    const envs = [environment({ id: 'env-a', tasks: [], nodeRuntime: {} }), environment({ id: 'env-b', tasks: [], nodeRuntime: {} })];
    const { service, task } = libService({ envs });
    const actor = makeFakeActor();
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: envs[0], task: service._libraryTaskToRuntimeTask(task, envs[0]), outcome: { status: 'succeeded' } });
    assert.equal(envs[0].nodeRuntime['lib-1'].current, 1);
    assert.equal(envs[1].nodeRuntime['lib-1'], undefined, 'the other environment is untouched');
  });

  it('respawns the per-environment pool over world time', async () => {
    const { service, env, task } = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }
    });
    await service.respawnNodes({ environment: env, worldTime: 0 }); // anchor
    await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
    assert.equal(env.nodeRuntime['lib-1'].current, 2);
  });

  it('GM restock refills a depleted library pool, clamped to max', async () => {
    const { service, env, task } = libService({ nodeRuntime: { 'lib-1': { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } } });
    await service.restockNode({ environmentId: env.id, taskId: 'lib-1', current: 5, max: null });
    assert.equal(env.nodeRuntime['lib-1'].current, 2); // clamped to max
  });

  it('reads max from the library task, not a stale per-environment snapshot (raising node count takes effect)', async () => {
    // A task configured with 3 nodes, depleted once so the environment persists a
    // runtime snapshot (which historically froze max=3 and shadowed later edits).
    const { service, env, task } = libService({ task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }) });
    const actor = makeFakeActor();
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 2);
    assert.equal(env.nodeRuntime['lib-1'].max, 3, 'the persisted snapshot froze the old cap');

    // GM raises the library task's node count to 5. Composition must reflect the
    // new cap (config is library-sourced) while keeping this environment's own
    // depleted count (state is per-environment).
    const raised = LIB_TASK({ nodes: { enabled: true, max: 5, current: 5, depletionTiming: 'onStart', respawn: { policy: 'manual' } } });
    const composed = service._libraryTaskToRuntimeTask(raised, env);
    assert.equal(composed.nodes.max, 5, 'max comes from the library source, not the stale snapshot');
    assert.equal(composed.nodes.current, 2, 'the per-environment depleted count is preserved');
  });

  it('clamps the stored current down to a lowered library max', async () => {
    const { service, env, task } = libService({ task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }) });
    const actor = makeFakeActor();
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 2);

    // Lowering the library cap below the stored count must clamp current to the cap.
    const lowered = LIB_TASK({ nodes: { enabled: true, max: 1, current: 1, depletionTiming: 'onStart', respawn: { policy: 'manual' } } });
    const composed = service._libraryTaskToRuntimeTask(lowered, env);
    assert.equal(composed.nodes.max, 1);
    assert.equal(composed.nodes.current, 1, 'current cannot exceed the lowered library cap');
  });

  // --- nonRegenerating (permanently depletable) pools (issue 301) -------------

  const NONREGEN = { policy: 'nonRegenerating' };

  it('restockNode is a no-op for a nonRegenerating pool (no write, no nodeRestocked hook)', async () => {
    const { service, env, hookCalls } = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: NONREGEN } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: NONREGEN } }
    });
    const before = { ...env.nodeRuntime['lib-1'] };
    const result = await service.restockNode({ environmentId: env.id, taskId: 'lib-1', current: 5, max: null });
    assert.equal(env.nodeRuntime['lib-1'].current, 0, 'a permanently depletable pool stays exhausted');
    assert.deepEqual(env.nodeRuntime['lib-1'], before, 'restock did not mutate the stored runtime');
    assert.equal(result.current, 0, 'restock returns the unchanged pool');
    assert.equal(hookCalls.some(c => c.name === 'fabricate.gathering.nodeRestocked'), false, 'no restock hook fires');
  });

  it('restockNode still refills manual and overTime pools (regression vs the nonRegenerating no-op)', async () => {
    const manual = libService({ nodeRuntime: { 'lib-1': { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } } });
    await manual.service.restockNode({ environmentId: manual.env.id, taskId: 'lib-1', current: 5, max: null });
    assert.equal(manual.env.nodeRuntime['lib-1'].current, 2, 'manual pool refills (clamped to max)');
    assert.equal(manual.hookCalls.some(c => c.name === 'fabricate.gathering.nodeRestocked'), true);

    const overTime = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }
    });
    await overTime.service.restockNode({ environmentId: overTime.env.id, taskId: 'lib-1', current: 2, max: null });
    assert.equal(overTime.env.nodeRuntime['lib-1'].current, 2, 'overTime pool is still restockable');
  });

  it('the world-time respawn pass never regrows a nonRegenerating pool', async () => {
    const { service, env } = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: NONREGEN } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 0, depletionTiming: 'onStart', respawn: NONREGEN } }
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 100 * HOUR });
    assert.equal(env.nodeRuntime['lib-1'].current, 0, 'a permanently depletable pool stays at 0 across world time');
  });

  it('evaluateStart blocks a depleted nonRegenerating pool with NODE_EXHAUSTED, not NODE_DEPLETED', async () => {
    const { service, env, task } = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 1, current: 1, depletionTiming: 'onStart', respawn: NONREGEN } })
    });
    const actor = makeFakeActor();
    // Deplete to exhaustion through the real attempt-commit path.
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 0);

    const gate = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env) });
    assert.equal(gate.blockedReasons.some(r => r.code === 'NODE_EXHAUSTED'), true, 'exhausted pool surfaces a distinct reason');
    assert.equal(gate.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), false, 'and not the generic depleted reason');

    // A world-time advance must not clear the exhausted state.
    await service.respawnNodes({ environment: env, worldTime: 100 * HOUR });
    const stillExhausted = await service.evaluateStart({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env) });
    assert.equal(stillExhausted.blockedReasons.some(r => r.code === 'NODE_EXHAUSTED'), true, 'world time does not revive it');
  });

  it('evaluateStart still uses NODE_DEPLETED for depleted manual/overTime pools (regression)', async () => {
    const manual = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }
    });
    const gateM = await manual.service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: manual.env, task: manual.service._libraryTaskToRuntimeTask(manual.task, manual.env) });
    assert.equal(gateM.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);
    assert.equal(gateM.blockedReasons.some(r => r.code === 'NODE_EXHAUSTED'), false);

    const overTime = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }
    });
    const gateO = await overTime.service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: overTime.env, task: overTime.service._libraryTaskToRuntimeTask(overTime.task, overTime.env) });
    assert.equal(gateO.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);
    assert.equal(gateO.blockedReasons.some(r => r.code === 'NODE_EXHAUSTED'), false);
  });

  it('buildListingMetadata flags permanentlyExhausted only for a depleted nonRegenerating pool', async () => {
    const { service, env, task } = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 2, current: 2, depletionTiming: 'onStart', respawn: NONREGEN } })
    });
    const actor = makeFakeActor();
    const viewer = { isGM: true };

    // Not yet depleted → not exhausted, but the nonRegenerating flag is true
    // (it drives count-bearing scarcity copy before exhaustion).
    const full = service.buildListingMetadata({ environment: env, task: service._libraryTaskToRuntimeTask(task, env), actor, viewer });
    assert.equal(full.nodes.permanentlyExhausted, false);
    assert.equal(full.nodes.nonRegenerating, true, 'the nonRegenerating policy flag is exposed before exhaustion');

    // Drain to 0.
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    await service.commitAcceptedAttempt({ actor, system: { id: SYSTEM }, environment: env, task: service._libraryTaskToRuntimeTask(task, env), outcome: { status: 'succeeded' } });
    assert.equal(env.nodeRuntime['lib-1'].current, 0);
    const exhausted = service.buildListingMetadata({ environment: env, task: service._libraryTaskToRuntimeTask(task, env), actor, viewer });
    assert.equal(exhausted.nodes.permanentlyExhausted, true);
    assert.equal(exhausted.nodes.nonRegenerating, true, 'the nonRegenerating flag stays true at exhaustion');

    // A depleted overTime pool is NOT permanently exhausted (it will regrow) and is
    // NOT nonRegenerating.
    const overTime = libService({
      task: LIB_TASK({ nodes: { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }),
      nodeRuntime: { 'lib-1': { enabled: true, max: 1, current: 0, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR } } }
    });
    const otMeta = overTime.service.buildListingMetadata({ environment: overTime.env, task: overTime.service._libraryTaskToRuntimeTask(overTime.task, overTime.env), actor, viewer });
    assert.equal(otMeta.nodes.permanentlyExhausted, false, 'an overTime pool at 0 is depleted, not exhausted');
    assert.equal(otMeta.nodes.nonRegenerating, false, 'an overTime pool is not flagged nonRegenerating');
  });
});

describe('gathering economy — cost modifiers and flag gating', () => {
  function costConfig(mode = 'stamina') {
    return {
      systems: {
        [SYSTEM]: {
          characterModifiers: [{ id: 'str', label: 'Str', provider: 'dnd5e', expression: '@abilities.str.mod' }],
          economy: economyForMode(mode)
        }
      }
    };
  }
  // Both stamina and resource nodes enabled at once (the anti-dogpiling combination).
  function bothConfig() {
    return {
      systems: {
        [SYSTEM]: {
          characterModifiers: [{ id: 'str', label: 'Str', provider: 'dnd5e', expression: '@abilities.str.mod' }],
          economy: { stamina: { enabled: true }, nodes: { enabled: true } }
        }
      }
    };
  }
  const task = (overrides = {}) => ({ id: 'task-1', name: 'Mine', staminaCost: 5, ...overrides });

  // A rich-state service whose environment store persists nodeRuntime writes, so
  // commitAcceptedAttempt's node-depletion path can be asserted against `env`.
  function wiredService(config) {
    const env = environment();
    const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
    const service = new GatheringRichStateService({
      getSetting: key => settings.get(key),
      setSetting: async (key, value) => { settings.set(key, value); return value; },
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      environmentStore: {
        get: () => env,
        list: () => [env],
        update: async (id, patch) => { Object.assign(env, patch); return env; }
      },
      evaluateExpression: async () => 0,
      hooks: { callAll: () => {} }
    });
    return { service, env };
  }

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

  it('issue 299: stamina cost stays additive even when a stray mode field is present', async () => {
    // A stray `mode` field on a stamina reference is ignored: the signed
    // contribution is always summed onto the base, never used as a factor.
    const { service } = makeRichState({ config: costConfig(), evaluateExpression: () => 5 });
    const env = environment();
    const cost = await service._effectiveStaminaCost({
      actor: makeFakeActor(), system: { id: SYSTEM }, environment: env,
      task: task({ staminaCost: 10, staminaCostModifiers: [{ modifierId: 'str', operator: '-', mode: 'multiplicative' }] })
    });
    assert.equal(cost, 5); // 10 - 5 (additive), NOT 10 * 0.95 = 9.5
  });

  it('issue 299: stamina cost stays additive under a multiplicative system default', async () => {
    const config = costConfig();
    config.systems[SYSTEM].rules = { dropModifierMode: 'multiplicative' };
    const { service } = makeRichState({ config, evaluateExpression: () => 5 });
    const env = environment();
    const cost = await service._effectiveStaminaCost({
      actor: makeFakeActor(), system: { id: SYSTEM }, environment: env,
      task: task({ staminaCost: 10, staminaCostModifiers: [{ modifierId: 'str', operator: '-' }] })
    });
    assert.equal(cost, 5); // additive 10 - 5, the system multiplicative default does not apply to stamina
  });

  it('exposes the per-actor effective cost for the player listing (not the base)', async () => {
    const { service } = makeRichState({ config: costConfig(), evaluateExpression: () => 2 });
    const env = environment();
    const taskWithMod = task({ staminaCost: 6, staminaCostModifiers: [{ modifierId: 'str', operator: '-' }] });

    const cost = await service.listingStaminaCost({
      actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: taskWithMod
    });
    assert.equal(cost, 4); // 6 - 2 (the base would be 6)

    // No actor still resolves (modifier evaluates), but a non-stamina system or a
    // zero-cost task yields null (nothing to refine).
    const { service: nodesMode } = makeRichState({ config: costConfig('nodes'), evaluateExpression: () => 2 });
    assert.equal(await nodesMode.listingStaminaCost({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: taskWithMod }), null);
    assert.equal(await service.listingStaminaCost({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: task({ staminaCost: 0 }) }), null);
  });

  it('blocks on insufficient stamina only when stamina is enabled, and the gate equals the spend', async () => {
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

  it('does not gate or spend stamina when both limitation flags are off', async () => {
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

  // The node + stamina task fixture used by the flag-isolation cases below.
  const nodeStaminaTask = (overrides = {}) => task({
    staminaCost: 5,
    nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'manual' } },
    ...overrides
  });

  it('stamina-only: a node-carrying task never decrements the node pool when nodes are off', async () => {
    const { service, env } = wiredService(costConfig('stamina'));
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 10, max: 10 });

    const evidence = await service.commitAcceptedAttempt({
      actor, system: { id: SYSTEM }, environment: env, task: nodeStaminaTask(), outcome: { status: 'succeeded' }
    });
    // Stamina spent, node pool untouched (no nodeRuntime write).
    assert.equal(evidence.stamina.spent, 5);
    assert.equal(evidence.node, null);
    assert.equal(env.nodeRuntime?.['task-1'], undefined);
  });

  it('nodes-only: getActorStamina is untouched even when the task carries a staminaCost', async () => {
    const { service, env } = wiredService(costConfig('nodes'));
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 7, max: 10 });

    const evidence = await service.commitAcceptedAttempt({
      actor, system: { id: SYSTEM }, environment: env, task: nodeStaminaTask(), outcome: { status: 'succeeded' }
    });
    // Node depleted, stamina untouched.
    assert.equal(evidence.node.remaining, 2);
    assert.equal(evidence.stamina, null);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 7);
  });

  it('both enabled: both start gates fire, and one accepted attempt depletes the node AND spends stamina', async () => {
    const { service, env } = wiredService(bothConfig());
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 10, max: 10 });

    // Both gates evaluate: a depleted node blocks AND stamina evidence is populated.
    const depletedGate = await service.evaluateStart({
      actor, system: { id: SYSTEM }, environment: env,
      task: nodeStaminaTask({ nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } })
    });
    assert.equal(depletedGate.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);
    assert.ok(depletedGate.evidence.stamina, 'stamina evidence is populated under both');

    // An accepted attempt against an available node both decrements it and spends stamina (anti-dogpiling).
    const evidence = await service.commitAcceptedAttempt({
      actor, system: { id: SYSTEM }, environment: env, task: nodeStaminaTask(), outcome: { status: 'succeeded' }
    });
    assert.equal(env.nodeRuntime['task-1'].current, 2, 'node pool decremented by one');
    assert.equal(evidence.node.remaining, 2);
    assert.equal(evidence.stamina.spent, 5);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 5, 'stamina spent by exactly the cost');
  });

  it('both enabled: a depleted node AND insufficient stamina raise both block codes at once', async () => {
    const { service, env } = wiredService(bothConfig());
    const actor = makeFakeActor();
    // Stamina below the task cost (5) and the node pool empty: both gates must block.
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 2, max: 10 });

    const gate = await service.evaluateStart({
      actor, system: { id: SYSTEM }, environment: env,
      task: nodeStaminaTask({ nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } })
    });
    assert.equal(gate.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true, 'node gate blocks');
    assert.equal(gate.blockedReasons.some(r => r.code === 'STAMINA_BLOCKED'), true, 'stamina gate blocks');
  });

  it('both off: neither gate fires and both pieces of evidence are null', async () => {
    const { service, env } = wiredService(costConfig('none'));
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 10, max: 10 });

    const gate = await service.evaluateStart({
      actor, system: { id: SYSTEM }, environment: env,
      task: nodeStaminaTask({ nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } })
    });
    assert.equal(gate.blockedReasons.length, 0);
    assert.equal(gate.evidence.stamina, null);
    assert.equal(gate.evidence.nodes, null);

    const evidence = await service.commitAcceptedAttempt({
      actor, system: { id: SYSTEM }, environment: env, task: nodeStaminaTask(), outcome: { status: 'succeeded' }
    });
    assert.equal(evidence.node, null);
    assert.equal(evidence.stamina, null);
    assert.equal(env.nodeRuntime?.['task-1'], undefined);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 10);
  });

  it('blocks a depleted node for players and GMs alike (GMs are subject to the economy)', async () => {
    const { service } = makeRichState({ config: costConfig('nodes') });
    const env = environment();
    const depleted = task({ staminaCost: 0, nodes: { enabled: true, max: 2, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual' } } });

    const player = await service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: depleted, viewer: { isGM: false } });
    assert.equal(player.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);

    const gm = await service.evaluateStart({ actor: makeFakeActor(), system: { id: SYSTEM }, environment: env, task: depleted, viewer: { isGM: true } });
    assert.equal(gm.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true, 'GMs are now gated by the economy too');
  });

  it('spends stamina on a committed attempt by a GM viewer (no economy bypass)', async () => {
    const { service } = makeRichState({ config: costConfig('stamina'), evaluateExpression: () => 0 });
    const env = environment();
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 8, max: 10 });

    const evidence = await service.commitAcceptedAttempt({
      actor, system: { id: SYSTEM }, environment: env, task: task(), outcome: { status: 'succeeded' }, viewer: { isGM: true }
    });
    assert.equal(evidence.stamina.spent, 5);
    assert.equal(service.getActorStamina(actor, SYSTEM).current, 3); // 8 - 5, GM included
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
    const set = makeRichState({ config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: 12, start: '@abilities.con.mod' } } } } } });
    assert.equal(set.service.systemEconomy(SYSTEM).stamina.max, '12'); // numbers stringify
    assert.equal(set.service.systemEconomy(SYSTEM).stamina.start, '@abilities.con.mod');
    const unset = makeRichState({ config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true } } } } } });
    assert.equal(unset.service.systemEconomy(SYSTEM).stamina.max, '');
    assert.equal(unset.service.systemEconomy(SYSTEM).stamina.start, '');
  });

  it('seeds a character pool by rolling max & start once; blank start starts full', async () => {
    const config = { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: '4 * @abilities.con.mod' } } } } };
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
    const config = { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: '20', start: '@abilities.con.mod' } } } } };
    const seq = { staminaMax: [20, 30], staminaStart: [7, 9] };
    const { service } = makeRichState({ config, evaluateExpression: (p) => seq[p.kind].shift() });
    const actor = makeFakeActor();

    const seeded = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM });
    assert.deepEqual({ current: seeded.current, max: seeded.max }, { current: 7, max: 20 });

    const rerolled = await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM, force: true });
    assert.deepEqual({ current: rerolled.current, max: rerolled.max }, { current: 9, max: 30 });
  });

  it('does not seed when the max expression is blank (stamina then unenforced)', async () => {
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true } } } } } });
    const actor = makeFakeActor();
    assert.equal(await service.seedActorStaminaIfNeeded({ actor, systemId: SYSTEM }), null);
    assert.equal(service.getActorStamina(actor, SYSTEM).max, null);
  });

  it('regenerates up to the rolled max once the pool is seeded', async () => {
    const config = { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: '20', start: '12', regen: { policy: 'overTime', unit: 'hours', amount: 5 } } } } } };
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
    const { service } = makeRichState({ config: { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: '20' } } } } } });
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
    const config = { systems: { [SYSTEM]: { economy: { stamina: { enabled: true, max: '50', start: '50', regen: { policy: 'overTime', unit: 'hours', amount: 5 } } } } } };
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

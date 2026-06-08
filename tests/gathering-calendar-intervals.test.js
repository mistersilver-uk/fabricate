import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { makeRichState, makeFakeActor, environment } from './helpers/gathering.js';

const SYSTEM = 'system-test';

// A non-Earth calendar: a "day" is 30000s (not 86400) and a "week" 150000s.
const CUSTOM_SECONDS_PER_UNIT = (unit) => ({ minutes: 60, hours: 3600, days: 30000, weeks: 150000 }[unit] ?? 3600);

function staminaDaysConfig() {
  return {
    systems: {
      [SYSTEM]: { economy: { mode: 'stamina', stamina: { regen: { policy: 'elapsedTime', unit: 'days', amount: 5 } } } }
    }
  };
}

function nodeService({ respawn, current = 0, max = 4, secondsPerUnit = null } = {}) {
  const env = environment({
    nodeRuntime: { 'task-node': { enabled: true, max, current, depletionTiming: 'onStart', respawn } }
  });
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, { systems: { [SYSTEM]: { economy: { mode: 'nodes' } } } }]]);
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    environmentStore: {
      get: () => env,
      list: () => [env],
      update: async (id, patch) => { Object.assign(env, patch); return env; }
    },
    hooks: { callAll: () => {} },
    secondsPerUnit
  });
  return { service, env };
}

describe('gathering — calendar-aware interval lengths', () => {
  it('regenerates stamina on the calendar day length, not the Earth day', async () => {
    const { service } = makeRichState({ config: staminaDaysConfig(), secondsPerUnit: CUSTOM_SECONDS_PER_UNIT });
    const actor = makeFakeActor();
    await service.setActorStamina(actor, { systemId: SYSTEM, current: 0, max: 100 });
    await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 0 }); // anchor

    // 60000s = two custom days (2 × 30000) → +10. On an Earth day (86400s) this
    // would be zero whole intervals, so this asserts the calendar drives it.
    const after = await service.regenerateActorStamina({ actor, systemId: SYSTEM, worldTime: 60000 });
    assert.equal(after.current, 10);
  });

  it('respawns nodes on the calendar day length (unit + amount schema)', async () => {
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'days', intervalAmount: 1 },
      current: 0, max: 3, secondsPerUnit: CUSTOM_SECONDS_PER_UNIT
    });
    await service.respawnNodes({ environment: env, worldTime: 0 }); // anchor
    await service.respawnNodes({ environment: env, worldTime: 30000 }); // one custom day
    assert.equal(env.nodeRuntime['task-node'].current, 1);
  });

  it('catches up multiple custom-day intervals at once and accrues the remainder', async () => {
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'days', intervalAmount: 1 },
      current: 0, max: 10, secondsPerUnit: CUSTOM_SECONDS_PER_UNIT
    });
    await service.respawnNodes({ environment: env, worldTime: 0 }); // anchor
    // 3.5 custom days (3 × 30000 + 15000): three whole intervals apply at once.
    await service.respawnNodes({ environment: env, worldTime: 3 * 30000 + 15000 });
    assert.equal(env.nodeRuntime['task-node'].current, 3);
    // The anchor advanced to 90000 (not 105000), so the leftover half-day plus a
    // further half-day completes exactly one more interval — no tick lost or doubled.
    await service.respawnNodes({ environment: env, worldTime: 4 * 30000 });
    assert.equal(env.nodeRuntime['task-node'].current, 4);
  });

  it('default seam reproduces the Earth day and week (no calendar injected)', async () => {
    // Days: a full Earth day regenerates once; one second short regenerates nothing.
    const days = makeRichState({ config: staminaDaysConfig() });
    const a1 = makeFakeActor();
    await days.service.setActorStamina(a1, { systemId: SYSTEM, current: 0, max: 100 });
    await days.service.regenerateActorStamina({ actor: a1, systemId: SYSTEM, worldTime: 0 });
    assert.equal((await days.service.regenerateActorStamina({ actor: a1, systemId: SYSTEM, worldTime: 86399 })), null);
    const oneDay = await days.service.regenerateActorStamina({ actor: a1, systemId: SYSTEM, worldTime: 86400 });
    assert.equal(oneDay.current, 5);

    // Weeks: 604800s is exactly one Earth week.
    const weeksConfig = { systems: { [SYSTEM]: { economy: { mode: 'stamina', stamina: { regen: { policy: 'elapsedTime', unit: 'weeks', amount: 3 } } } } } };
    const weeks = makeRichState({ config: weeksConfig });
    const a2 = makeFakeActor();
    await weeks.service.setActorStamina(a2, { systemId: SYSTEM, current: 0, max: 100 });
    await weeks.service.regenerateActorStamina({ actor: a2, systemId: SYSTEM, worldTime: 0 });
    const oneWeek = await weeks.service.regenerateActorStamina({ actor: a2, systemId: SYSTEM, worldTime: 604800 });
    assert.equal(oneWeek.current, 3);
  });

  it('still honors a legacy raw intervalSeconds node (pre-migration fallback)', async () => {
    const { service, env } = nodeService({
      respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 3600 },
      current: 0, max: 5
    });
    await service.respawnNodes({ environment: env, worldTime: 0 });
    await service.respawnNodes({ environment: env, worldTime: 7200 }); // two legacy hours
    assert.equal(env.nodeRuntime['task-node'].current, 2);
  });
});

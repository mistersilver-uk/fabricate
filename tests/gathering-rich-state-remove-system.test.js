import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

function makeService(initialConfig) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, initialConfig]]);
  const writes = [];
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      writes.push({ key, value });
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG
  });
  return { service, settings, writes };
}

test('removeSystem drops the matching system entry from gatheringConfig.systems', async () => {
  const { service, settings, writes } = makeService({
    conditions: { weather: 'clear', timeOfDay: 'day' },
    systems: {
      'mythwright-dnd5e': { tools: [{ id: 't1' }], tasks: [{ id: 'tk' }] },
      'other-system': { tools: [{ id: 't2' }] }
    }
  });

  const removed = await service.removeSystem('mythwright-dnd5e');

  assert.equal(removed, true);
  assert.equal(writes.length, 1);
  const next = settings.get(SETTING_KEYS.GATHERING_CONFIG);
  assert.equal('mythwright-dnd5e' in next.systems, false);
  assert.ok('other-system' in next.systems, 'unrelated systems are preserved');
  assert.deepEqual(next.conditions, { weather: 'clear', timeOfDay: 'day' },
    'unrelated config keys are preserved');
});

test('removeSystem is a no-op when the system is not present', async () => {
  const { service, writes } = makeService({
    systems: { 'other-system': { tools: [] } }
  });

  const removed = await service.removeSystem('missing-system');

  assert.equal(removed, false);
  assert.equal(writes.length, 0, 'no write when nothing changes');
});

test('removeSystem handles missing or non-object systems gracefully', async () => {
  const { service: s1 } = makeService({});
  assert.equal(await s1.removeSystem('x'), false);

  const { service: s2 } = makeService(null);
  assert.equal(await s2.removeSystem('x'), false);

  const { service: s3 } = makeService({ systems: null });
  assert.equal(await s3.removeSystem('x'), false);
});

test('removeSystem returns false when no systemId provided', async () => {
  const { service } = makeService({ systems: { x: {} } });
  assert.equal(await service.removeSystem(''), false);
  assert.equal(await service.removeSystem(null), false);
  assert.equal(await service.removeSystem(undefined), false);
});

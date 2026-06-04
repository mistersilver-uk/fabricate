import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

function makeService({ config = {}, userId = 'user-1' } = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    getUserId: () => userId,
    hooks: { callAll: () => {} }
  });
  return { service, settings };
}

// Minimal actor that stores fabricate gathering flag state in memory, matching
// the getFlag/setFlag surface the reveal helpers read and write.
function makeActor({ id = 'actor-1', uuid = 'Actor.actor-1' } = {}) {
  const flags = {};
  return {
    id,
    uuid,
    getFlag: (ns, key) => flags[`${ns}.${key}`],
    setFlag: (ns, key, value) => {
      flags[`${ns}.${key}`] = value;
      return Promise.resolve(value);
    }
  };
}

test('countRevealedTasks counts distinct actor-scoped reveals for one environment', async () => {
  const { service } = makeService();
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-2', scope: 'actor' });
  // Duplicate reveal of task-1 must not double-count.
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'actor' });
  // A different environment must not leak into the count.
  await service.revealTask(actor, { environmentId: 'env-b', taskId: 'task-9', scope: 'actor' });

  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'actor' }), 2);
  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-b', scope: 'actor' }), 1);
});

test('countRevealedTasks counts user-scoped reveals separately from actor-scoped', async () => {
  const { service } = makeService({ userId: 'user-7' });
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'user' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-2', scope: 'user' });

  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'user' }), 2);
  // Actor scope sees none of the user-keyed reveals.
  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'actor' }), 0);
});

test('countRevealedTasks counts global-scoped reveals', async () => {
  const { service } = makeService();
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'global' });

  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'global' }), 1);
  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'actor' }), 0);
});

test('countRevealedTasks counts party-scoped reveals via the actor key', async () => {
  const { service } = makeService();
  const actor = makeActor();

  // party has no dedicated key today; it collapses onto the actor: key.
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'party' });

  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'party' }), 1);
  // Counting at actor scope sees the same reveal, since they share the key.
  assert.equal(service.countRevealedTasks({ actor, environmentId: 'env-a', scope: 'actor' }), 1);
});

test('countRevealedTasks returns 0 for empty or missing state without throwing', () => {
  const { service } = makeService();
  const emptyActor = makeActor();

  assert.equal(service.countRevealedTasks({ actor: emptyActor, environmentId: 'env-a', scope: 'actor' }), 0);
  assert.equal(service.countRevealedTasks({ actor: null, environmentId: 'env-a', scope: 'actor' }), 0);
  assert.equal(service.countRevealedTasks({ actor: emptyActor, environmentId: '', scope: 'actor' }), 0);
});

test('listRevealedTaskIds returns the distinct revealed task ids per scope', async () => {
  const { service } = makeService({ userId: 'user-7' });
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-2', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-b', taskId: 'task-9', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-u', scope: 'user' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-g', scope: 'global' });

  assert.deepEqual(
    service.listRevealedTaskIds({ actor, environmentId: 'env-a', scope: 'actor' }).sort(),
    ['task-1', 'task-2']
  );
  assert.deepEqual(service.listRevealedTaskIds({ actor, environmentId: 'env-b', scope: 'actor' }), ['task-9']);
  assert.deepEqual(service.listRevealedTaskIds({ actor, environmentId: 'env-a', scope: 'user' }), ['task-u']);
  assert.deepEqual(service.listRevealedTaskIds({ actor, environmentId: 'env-a', scope: 'global' }), ['task-g']);
});

test('listRevealedTaskIds counts party reveals via the actor key', async () => {
  const { service } = makeService();
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'party' });

  assert.deepEqual(service.listRevealedTaskIds({ actor, environmentId: 'env-a', scope: 'party' }), ['task-1']);
  // party collapses onto the actor key, so the actor scope sees the same reveal.
  assert.deepEqual(service.listRevealedTaskIds({ actor, environmentId: 'env-a', scope: 'actor' }), ['task-1']);
});

test('listRevealedTaskIds returns [] for empty or missing state without throwing', () => {
  const { service } = makeService();
  const emptyActor = makeActor();

  assert.deepEqual(service.listRevealedTaskIds({ actor: emptyActor, environmentId: 'env-a', scope: 'actor' }), []);
  assert.deepEqual(service.listRevealedTaskIds({ actor: null, environmentId: 'env-a', scope: 'actor' }), []);
  assert.deepEqual(service.listRevealedTaskIds({ actor: emptyActor, environmentId: '', scope: 'actor' }), []);
});

test('countRevealedTasks equals listRevealedTaskIds length (shared implementation)', async () => {
  const { service } = makeService();
  const actor = makeActor();

  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-1', scope: 'actor' });
  await service.revealTask(actor, { environmentId: 'env-a', taskId: 'task-2', scope: 'actor' });

  const args = { actor, environmentId: 'env-a', scope: 'actor' };
  assert.equal(service.countRevealedTasks(args), service.listRevealedTaskIds(args).length);
});

test('resolveBiomeTags lets a per-system vocabulary override win over defaults', () => {
  const { service } = makeService({
    config: {
      systems: {
        'system-a': {
          vocabularies: {
            biomes: {
              values: [
                { id: 'forest', label: 'Moon Forest', icon: 'fas fa-moon', colorToken: 'lavender', customColor: '#112233' }
              ]
            }
          }
        }
      }
    }
  });

  const tags = service.resolveBiomeTags(['forest'], 'system-a');

  assert.equal(tags.length, 1);
  assert.equal(tags[0].id, 'forest');
  assert.equal(tags[0].label, 'Moon Forest');
  assert.equal(tags[0].icon, 'fas fa-moon');
  assert.equal(tags[0].colorToken, 'lavender');
  assert.equal(tags[0].customColor, '#112233');
});

test('resolveBiomeTags falls back to DEFAULT_BIOME_METADATA when no vocabulary defines the id', () => {
  const { service } = makeService();

  const tags = service.resolveBiomeTags(['forest', 'cave'], 'system-a');

  assert.equal(tags.length, 2);
  assert.equal(tags[0].id, 'forest');
  assert.equal(tags[0].label, 'Forest');
  assert.equal(tags[0].icon, 'fas fa-tree');
  assert.equal(tags[0].colorToken, 'sage');
  assert.equal(tags[1].id, 'cave');
  assert.equal(tags[1].label, 'Cave');
  assert.equal(tags[1].colorToken, 'lavender');
});

test('resolveBiomeTags returns an empty array for no biome ids', () => {
  const { service } = makeService();
  assert.deepEqual(service.resolveBiomeTags([], 'system-a'), []);
  assert.deepEqual(service.resolveBiomeTags(null, 'system-a'), []);
});

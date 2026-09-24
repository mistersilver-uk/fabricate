/**
 * The tool-source transaction in `manager/toolSources.js` (issue 1923): each writer's GM gate and
 * error text, and the manager members it reaches through `io`, which a later call must see
 * replaced, so the bag is never cached.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getProperty, makeWorldItem } from '../helpers/writeCapableItemFake.js';

const registry = new Map();
globalThis.foundry = { utils: { randomID: () => 'tool-rid', getProperty } };
globalThis.fromUuid = async (uuid) => registry.get(uuid) ?? null;
globalThis.game = { user: { isGM: false }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');

/** `assert.rejects` with a validator, so a swapped or generic error text fails the assertion. */
const rejectsExactly = (promise, message) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.message, message);
    return true;
  });

function toolManager() {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sysT', manager._normalizeSystem({ id: 'sysT', name: 'Sys T' }));
  return manager;
}

function hammer(uuid) {
  const source = makeWorldItem({ uuid, name: 'Hammer' });
  source.documentName = 'Item';
  source.system = { description: { value: '' } };
  registry.set(uuid, source);
  return source;
}

test('non-GM: each tool writer rejects with the GM-permission message naming its own action', async () => {
  globalThis.game.user.isGM = false;
  const manager = toolManager();

  await rejectsExactly(
    manager.upsertTool('sysT', { label: 'Saw' }),
    'GM permissions required: add tool from uuid'
  );
  await rejectsExactly(
    manager.addToolFromUuid('sysT', 'Item.saw'),
    'GM permissions required: add tool from uuid'
  );
  await rejectsExactly(manager.deleteTool('sysT', 'tool-1'), 'GM permissions required: delete tool');
});

test('GM: each refusal carries its exact text', async () => {
  globalThis.game.user.isGM = true;
  registry.set('Actor.a', { uuid: 'Actor.a', documentName: 'Actor' });
  const manager = toolManager();

  await rejectsExactly(manager.upsertTool('nope', {}), 'Crafting system not found: nope');
  await rejectsExactly(manager.deleteTool('nope', 'tool-1'), 'Crafting system not found: nope');
  await rejectsExactly(
    manager.addToolFromUuid('sysT', 'Actor.a'),
    'Cannot register Tool source "Actor.a": resolved document is not an Item'
  );
  await rejectsExactly(
    manager.upsertTool('sysT', { label: 'Unlinked' }),
    'Cannot save Tool: a tool requires either a componentId or its own source references'
  );

  const source = hammer('Item.rollback');
  const update = source.update.bind(source);
  source.update = async (patch) => {
    await update(patch);
    throw new Error('stamp failed');
  };
  manager.save = async ({ put }) => {
    if (put.tools.length === 0) throw new Error('compensation failed');
  };
  await rejectsExactly(
    manager.addToolFromUuid('sysT', source.uuid),
    'Tool transaction failed and rollback was incomplete'
  );
});

test('upsertTool reaches each collaborator through the manager, and a later deleteTool sees replaced members', async () => {
  globalThis.game.user.isGM = true;
  const manager = toolManager();
  const source = hammer('Item.reach');
  const calls = [];
  for (const name of [
    '_toolRoleFlagKey',
    '_characterLibraryBasis',
    '_normalizeTool',
    '_buildToolSourceSnapshot',
    '_stampSourceIdentity',
  ]) {
    const original = manager[name].bind(manager);
    manager[name] = (...args) => {
      calls.push(name);
      return original(...args);
    };
  }
  manager.save = async () => void calls.push('save');

  const { item } = await manager.addToolFromUuid('sysT', source.uuid);
  assert.deepEqual(calls, [
    '_toolRoleFlagKey',
    '_buildToolSourceSnapshot',
    '_characterLibraryBasis',
    '_normalizeTool',
    'save',
    '_stampSourceIdentity',
  ]);

  const later = [];
  manager.save = async () => void later.push('save');
  manager._toolRoleFlagKey = (systemId) => {
    later.push('_toolRoleFlagKey');
    return `roles.${systemId}.toolId`;
  };
  manager.systems = new Map([['sysT', manager.getSystem('sysT')]]);
  assert.deepEqual(await manager.deleteTool('sysT', item.id), { deleted: true });
  assert.deepEqual(later, ['save', '_toolRoleFlagKey']);
  assert.equal(source.getFlag('fabricate', 'fabricate.roles.sysT.toolId'), undefined);
});

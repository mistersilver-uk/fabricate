/**
 * `refreshComponentMetadataForUpdatedItem` returns early for a non-GM (issue 1923), through
 * `globalThis.game?.user?.isGM` in `manager/itemSources.js`: nothing is renamed, saved or announced.
 * A later GM edit must see members replaced after that call, so the `io` bag is never cached.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.foundry = { utils: { randomID: () => 'rid' } };
globalThis.game = { user: { isGM: false }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');

test('a non-GM item edit changes nothing, and a later GM edit sees replaced members', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const herbSystem = (id) =>
    manager._normalizeSystem({
      id,
      name: id,
      items: [{ id: 'comp-herb', name: 'Old Herb', registeredItemUuid: 'Item.herb' }],
    });
  const counting = (calls) => {
    manager.save = async () => void calls.save++;
    manager._notifySystemsChanged = () => void calls.notify++;
  };
  const edit = () =>
    manager.refreshComponentMetadataForUpdatedItem(
      { uuid: 'Item.herb', name: 'Fresh Herb' },
      { name: 'Fresh Herb' }
    );
  manager.systems.set('sys1', herbSystem('sys1'));
  const early = { save: 0, notify: 0 };
  counting(early);

  assert.deepEqual(await edit(), { updated: 0 });
  assert.equal(manager.getSystem('sys1').components[0].name, 'Old Herb');
  assert.deepEqual(early, { save: 0, notify: 0 });

  const later = { save: 0, notify: 0 };
  counting(later);
  manager.systems = new Map([['sys2', herbSystem('sys2')]]);
  globalThis.game.user.isGM = true;
  assert.deepEqual(await edit(), { updated: 1 });
  assert.equal(manager.getSystem('sys2').components[0].name, 'Fresh Herb');
  assert.deepEqual([early, later], [{ save: 0, notify: 0 }, { save: 1, notify: 1 }]);
});

/** `assert.rejects` with a validator, so a swapped or generic error text fails the assertion
 * instead of a loose regex quietly matching it. */
const rejectsExactly = (promise, message) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.message, message);
    return true;
  });

const gatedSystem = (manager) =>
  manager._normalizeSystem({
    id: 'sys-gate',
    name: 'Sys Gate',
    items: [{ id: 'comp-1', name: 'Comp One', registeredItemUuid: 'Item.comp-1' }],
  });

test('non-GM: each writer rejects with the GM-permission message naming its own action', async () => {
  globalThis.game.user.isGM = false;
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.systems.set('sys-gate', gatedSystem(manager));

  await rejectsExactly(
    manager.addRecipeItemFromUuid('sys-gate', 'Item.recipe-1'),
    'GM permissions required: add recipe item from uuid'
  );
  await rejectsExactly(
    manager.addItemFromUuid('sys-gate', 'Item.comp-2'),
    'GM permissions required: add component from uuid'
  );
  await rejectsExactly(
    manager.replaceItemSource('sys-gate', 'comp-1', 'Item.comp-3'),
    'GM permissions required: replace component source'
  );
});

test('GM: a resolved non-Item document is refused with each writer’s own message', async () => {
  globalThis.game.user.isGM = true;
  globalThis.fromUuid = async () => ({ documentName: 'Actor' });
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.systems.set('sys-gate', gatedSystem(manager));

  await rejectsExactly(
    manager.addRecipeItemFromUuid('sys-gate', 'Actor.a'),
    'Cannot add non-Item document (Actor) as a recipe item'
  );
  await rejectsExactly(
    manager.addItemFromUuid('sys-gate', 'Actor.a'),
    'Cannot add non-Item document (Actor) as a crafting component'
  );
  await rejectsExactly(
    manager.replaceItemSource('sys-gate', 'comp-1', 'Actor.a'),
    'Cannot use non-Item document (Actor) as a component source'
  );
});

test('addItemFromUuid reaches _resolveImportedComponentSourceData through the manager, so an instance patch is observed exactly once', async () => {
  globalThis.game.user.isGM = true;
  globalThis.fromUuid = async () => ({ documentName: 'Item', uuid: 'Item.new-1', name: 'New Item' });
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-gate', manager._normalizeSystem({ id: 'sys-gate', name: 'Sys Gate' }));

  let calls = 0;
  const original = manager._resolveImportedComponentSourceData.bind(manager);
  manager._resolveImportedComponentSourceData = async (itemUuid, source) => {
    calls++;
    return original(itemUuid, source);
  };

  await manager.addItemFromUuid('sys-gate', 'Item.new-1');
  assert.equal(calls, 1);
});

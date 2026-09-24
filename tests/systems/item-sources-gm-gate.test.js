/**
 * `refreshComponentMetadataForUpdatedItem` returns early for a non-GM (issue 1923), now through
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

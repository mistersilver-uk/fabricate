import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { resolveDropUuid } from '../src/ui/svelte/util/dropUtils.js';
import { resolveItemSourceSnapshot } from '../src/ui/svelte/util/foundryBridge.js';

const previousFromUuid = globalThis.fromUuid;

afterEach(() => {
  if (previousFromUuid === undefined) delete globalThis.fromUuid;
  else globalThis.fromUuid = previousFromUuid;
});

test('manager Item drops resolve world and compendium Items to one shared snapshot', async () => {
  const requested = [];
  globalThis.fromUuid = async (uuid) => {
    requested.push(uuid);
    return {
      documentName: 'Item',
      uuid,
      name: 'Smith Hammer',
      img: 'hammer.webp',
      type: 'tool',
      system: { description: { value: 'A working hammer.' } },
    };
  };

  const worldUuid = resolveDropUuid({ type: 'Item', uuid: 'Item.hammer' });
  const compendiumUuid = resolveDropUuid({
    type: 'Item',
    pack: 'mythwright.items',
    id: 'hammer',
  });

  assert.deepEqual(await resolveItemSourceSnapshot(worldUuid), {
    uuid: 'Item.hammer',
    name: 'Smith Hammer',
    img: 'hammer.webp',
    type: 'tool',
    description: 'A working hammer.',
  });
  assert.equal((await resolveItemSourceSnapshot(compendiumUuid))?.uuid, compendiumUuid);
  assert.deepEqual(requested, ['Item.hammer', 'Compendium.mythwright.items.hammer']);
});

test('manager Item drops reject missing, malformed, and non-Item documents', async () => {
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Actor.hero') return { documentName: 'Actor', uuid };
    if (uuid === 'Folder.tools') return { documentName: 'Folder', uuid };
    if (uuid === 'Item.missing') return null;
    throw new Error('malformed UUID');
  };

  assert.equal(resolveDropUuid({ type: 'Item', pack: 'mythwright.items' }), null);
  assert.equal(resolveDropUuid({ type: 'Item', id: 'hammer' }), null);
  assert.equal(await resolveItemSourceSnapshot('Actor.hero'), null);
  assert.equal(await resolveItemSourceSnapshot('Folder.tools'), null);
  assert.equal(await resolveItemSourceSnapshot('Item.missing'), null);
  assert.equal(await resolveItemSourceSnapshot('not-a-uuid'), null);
});

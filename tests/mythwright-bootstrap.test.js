import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

globalThis.game = { ready: false };

before(async () => {
  await import('../scripts/foundry/create-mythwright-dnd5e.js');
});

function folder(id, name, parent = null) {
  return { id, name, type: 'Item', folder: parent };
}

describe('Mythwright DnD5e bootstrap helpers', () => {
  it('normalizes armour spelling and punctuation consistently', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;

    assert.equal(helper.normalizeName('Half-Plate Armour'), 'half plate armor');
    assert.equal(helper.normalizeName('Crossbow, Heavy'), 'crossbow heavy');
  });

  it('finds folders by full path rather than leaf name alone', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const root = folder('root', 'Mythwright');
    const ingredients = folder('ingredients', 'Ingredients', root.id);
    const mundaneIngredients = folder('mundane-ingredients', 'Mundane', ingredients.id);
    const weapons = folder('weapons', 'Weapons', root.id);
    const mundaneWeapons = folder('mundane-weapons', 'Mundane', weapons.id);
    const folders = [root, ingredients, mundaneIngredients, weapons, mundaneWeapons];

    const found = helper.findFolderByPath('Mythwright > Weapons > Mundane', { folders });

    assert.equal(found.id, 'mundane-weapons');
  });

  it('builds item payloads preserving a compendium source UUID', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.itemPayload({
      id: 'weapon-longsword',
      name: 'Longsword',
      folder: { id: 'folder-id' },
      source: {
        name: 'Longsword',
        type: 'weapon',
        img: 'icons/longsword.webp',
        uuid: 'Compendium.dnd5e.items.longsword',
        toObject: () => ({ system: { quantity: 1 }, flags: {} })
      }
    });

    assert.equal(payload.folder, 'folder-id');
    assert.equal(payload.flags.core.sourceId, 'Compendium.dnd5e.items.longsword');
    assert.equal(payload.flags.fabricate.mythwrightId, 'weapon-longsword');
  });

  it('discovers SRD items by normalized name from DnD5e item packs', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const packs = [{
      metadata: { packageName: 'dnd5e', type: 'Item' },
      documentName: 'Item',
      getDocuments: async () => [
        { name: 'Longsword', type: 'weapon', uuid: 'Compendium.dnd5e.items.longsword' },
        { name: 'Chain Mail', type: 'equipment', uuid: 'Compendium.dnd5e.items.chainmail' },
        { name: 'Unrelated Spell', type: 'spell', uuid: 'Compendium.dnd5e.spells.foo' }
      ]
    }];

    const result = await helper.discoverSrdItems(packs);
    const names = result.resolved.map(entry => entry.name);

    assert.ok(names.includes('Longsword'));
    assert.ok(names.includes('Chain Mail'));
    assert.ok(result.unresolved.includes('Dagger'));
  });

  it('builds deterministic multi-step SRD recipes with a macroOutcome finishing step', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const target = { name: 'Longsword', type: 'weapon', item: { img: 'icons/longsword.webp' } };
    const recipe = helper.buildRecipeForSrd(target, new Map([
      ['weapon-longsword', { id: 'weapon-longsword' }]
    ]));

    assert.equal(recipe.id, 'mythwright-craft-longsword');
    assert.equal(recipe.steps.length, 4);
    assert.equal(recipe.steps.at(-1).resultSelection.provider, 'macroOutcome');
    assert.deepEqual(recipe.steps.at(-1).resultGroups.map(group => group.name), [
      'Flawed', 'Standard', 'Fine', 'Masterwork', 'Mythic'
    ]);
  });
});

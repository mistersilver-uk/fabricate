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
      preserveSourceIdentity: true,
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

  it('builds quality variant payloads without SRD matching identity', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.itemPayload({
      id: 'weapon-fine-longsword',
      name: 'Fine Longsword',
      folder: { id: 'quality-folder' },
      preserveSourceIdentity: false,
      baseSourceId: 'Compendium.dnd5e.items.longsword',
      source: {
        name: 'Longsword',
        type: 'weapon',
        img: 'icons/longsword.webp',
        uuid: 'Compendium.dnd5e.items.longsword',
        toObject: () => ({
          sourceUuid: 'Compendium.dnd5e.items.longsword',
          sourceItemUuid: 'Compendium.dnd5e.items.longsword',
          fallbackItemIds: ['Compendium.dnd5e.items.old-longsword'],
          _stats: { compendiumSource: 'Compendium.dnd5e.items.longsword' },
          system: { quantity: 1 },
          flags: { core: { sourceId: 'Compendium.dnd5e.items.longsword' } }
        })
      }
    });

    assert.equal(payload.name, 'Fine Longsword');
    assert.equal(payload.flags.core, undefined);
    assert.equal(payload._stats, undefined);
    assert.equal(payload.sourceUuid, undefined);
    assert.equal(payload.sourceItemUuid, undefined);
    assert.equal(payload.fallbackItemIds, undefined);
    assert.equal(payload.flags.fabricate.mythwrightBaseSourceId, 'Compendium.dnd5e.items.longsword');
  });

  it('builds quality variant components without SRD matching identity', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const component = helper.componentFromItem(
      'weapon-fine-longsword',
      {
        name: 'Fine Longsword',
        img: 'icons/longsword.webp',
        uuid: 'Item.world-fine-longsword',
        flags: { core: { sourceId: 'Compendium.dnd5e.items.longsword' } }
      },
      {
        preserveSourceIdentity: false,
        mythwrightBaseSourceId: 'Compendium.dnd5e.items.longsword'
      }
    );

    assert.equal(component.sourceUuid, null);
    assert.equal(component.sourceItemUuid, null);
    assert.deepEqual(component.fallbackItemIds, []);
    assert.equal(component.mythwrightBaseSourceId, 'Compendium.dnd5e.items.longsword');
  });

  it('removes duplicate SRD-sourced quality variants from earlier bootstrap runs', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const qualityFolder = folder('quality-folder', 'Quality');
    const deleted = [];
    const kept = {
      id: 'keep-fine',
      name: 'Fine Longsword',
      folder: qualityFolder.id,
      flags: { fabricate: { mythwrightId: 'weapon-fine-longsword' } }
    };
    const stale = {
      id: 'stale-fine',
      name: 'Longsword',
      folder: qualityFolder.id,
      flags: {
        core: { sourceId: 'Compendium.dnd5e.items.longsword' },
        fabricate: { mythwrightId: 'weapon-fine-longsword' }
      },
      delete: async () => { deleted.push('stale-fine'); }
    };
    const unrelated = {
      id: 'user-copy',
      name: 'Longsword',
      folder: qualityFolder.id,
      flags: { core: { sourceId: 'Compendium.dnd5e.items.longsword' } },
      delete: async () => { deleted.push('user-copy'); }
    };
    globalThis.game.items = [kept, stale, unrelated];

    const summary = { items: { updated: 0, deleted: 0 } };
    await helper.cleanupQualityVariantDuplicates(
      { name: 'Longsword', type: 'weapon', item: { uuid: 'Compendium.dnd5e.items.longsword' } },
      new Map([['Mythwright > Weapons > Quality', qualityFolder]]),
      [kept],
      summary
    );

    assert.deepEqual(deleted, ['stale-fine']);
    assert.equal(summary.items.deleted, 1);
  });

  it('removes obsolete Mythic SRD quality variants from earlier bootstrap runs', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const qualityFolder = folder('quality-folder', 'Quality');
    const deleted = [];
    const obsolete = {
      id: 'old-mythic',
      name: 'Mythic Longsword',
      folder: qualityFolder.id,
      flags: { fabricate: { mythwrightId: 'weapon-mythic-longsword' } },
      delete: async () => { deleted.push('old-mythic'); }
    };
    const relic = {
      id: 'relic-copy',
      name: 'Mythwright Mythic Longsword',
      folder: 'relic-folder',
      flags: { fabricate: { mythwrightId: 'relic-mythic-longsword' } },
      delete: async () => { deleted.push('relic-copy'); }
    };
    globalThis.game.items = [obsolete, relic];

    const summary = { items: { deleted: 0 } };
    await helper.cleanupObsoleteQualityVariants(
      { name: 'Longsword', type: 'weapon' },
      new Map([['Mythwright > Weapons > Quality', qualityFolder]]),
      summary
    );

    assert.deepEqual(deleted, ['old-mythic']);
    assert.equal(summary.items.deleted, 1);
  });

  it('sanitizes hardcoded Mythwright icons to the approved safe set', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const safe = new Set(helper.APPROVED_MYTHWRIGHT_ICON_PATHS);

    assert.ok(safe.has('icons/svg/item-bag.svg'));
    assert.equal(helper.sanitizeIconPath('icons/not-guaranteed/missing.webp'), 'icons/svg/item-bag.svg');
    assert.equal(helper.sanitizeIconPath('icons/svg/item-bag.svg'), 'icons/svg/item-bag.svg');
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
      'Flawed', 'Standard', 'Fine', 'Masterwork'
    ]);
  });

  it('keeps Mythic outcomes available for bespoke relic recipes', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const recipe = helper.buildRelicRecipe('relic-mythic-longsword', 'Mythwright Mythic Longsword', 'ember');

    assert.ok(recipe.tags.includes('relic'));
    assert.ok(recipe.tags.includes('mythic'));
    assert.ok(!recipe.tags.includes('mythwright'));
    assert.ok(recipe.steps.at(-1).resultGroups.some(group => group.name === 'Mythic'));
  });

  it('uses matchable component tags without the Mythwright system association tag', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;

    const tags = helper.tagsForComponent(
      'weapon-fine-longsword',
      { name: 'Fine Longsword' },
      {
        srdQualityIds: new Set(['weapon-fine-longsword']),
        srdQualityTypes: new Map([['weapon-fine-longsword', 'weapon']])
      }
    );

    assert.deepEqual(tags.sort(), ['quality', 'srd', 'weapon']);
    assert.ok(!helper.itemTagsForSystem().includes('mythwright'));
  });

  it('builds elemental weapon payloads without SRD identity and with elemental damage metadata', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.elementalVariantPayload(
      { id: 'weapon-ember-shortsword', name: 'Ember Shortsword', baseName: 'Shortsword', type: 'weapon', essenceId: 'ember', damageType: 'fire' },
      {
        name: 'Shortsword',
        type: 'weapon',
        img: 'icons/shortsword.webp',
        uuid: 'Compendium.dnd5e.items.shortsword',
        toObject: () => ({
          _stats: { compendiumSource: 'Compendium.dnd5e.items.shortsword' },
          system: { quantity: 1, damage: { parts: [['1d6', 'piercing']] } },
          flags: { core: { sourceId: 'Compendium.dnd5e.items.shortsword' } }
        })
      },
      { id: 'elemental-folder' }
    );

    assert.equal(payload.name, 'Ember Shortsword');
    assert.equal(payload.flags.core, undefined);
    assert.equal(payload._stats, undefined);
    assert.equal(payload.flags.fabricate.mythwrightBaseSourceId, 'Compendium.dnd5e.items.shortsword');
    assert.equal(payload.flags.fabricate.elemental.essenceId, 'ember');
    assert.equal(payload.flags.fabricate.elemental.damageType, 'fire');
    assert.equal(payload.flags.fabricate.elemental.damageApplied, true);
    assert.deepEqual(payload.system.damage.parts.at(-1), ['1d4', 'fire']);
  });

  it('builds elemental armour payloads without SRD identity and with resistance metadata', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.elementalVariantPayload(
      { id: 'armor-dragon-scale-mail', name: 'Dragon Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'dragon', resistanceType: 'fire' },
      {
        name: 'Scale Mail',
        type: 'equipment',
        img: 'icons/scale-mail.webp',
        uuid: 'Compendium.dnd5e.items.scale-mail',
        toObject: () => ({
          sourceUuid: 'Compendium.dnd5e.items.scale-mail',
          sourceItemUuid: 'Compendium.dnd5e.items.scale-mail',
          system: { quantity: 1, description: { value: '<p>Base armour.</p>' } },
          flags: { core: { sourceId: 'Compendium.dnd5e.items.scale-mail' } },
          _stats: { compendiumSource: 'Compendium.dnd5e.items.scale-mail' }
        })
      },
      { id: 'elemental-folder' }
    );

    assert.equal(payload.flags.core, undefined);
    assert.equal(payload._stats, undefined);
    assert.equal(payload.sourceUuid, undefined);
    assert.equal(payload.sourceItemUuid, undefined);
    assert.equal(payload.flags.fabricate.elemental.resistanceType, 'fire');
    assert.match(payload.system.description.value, /resistance to fire damage/);
    assert.equal(payload.effects.at(-1).changes[0].key, 'system.traits.dr.value');
    assert.equal(payload.effects.at(-1).changes[0].value, 'fire');
  });

  it('builds elemental recipes requiring matching essence and producing the intended variant', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const recipe = helper.buildElementalRecipe({
      id: 'weapon-ember-shortsword',
      name: 'Ember Shortsword',
      baseName: 'Shortsword',
      type: 'weapon',
      essenceId: 'ember',
      damageType: 'fire'
    });
    const set = recipe.steps[0].ingredientSets[0];

    assert.equal(recipe.transferEffects, true);
    assert.deepEqual(recipe.tags, ['weapon', 'elemental', 'ember']);
    assert.equal(set.essences.ember, 1);
    assert.equal(recipe.steps[0].resultGroups[0].results[0].componentId, 'weapon-ember-shortsword');
  });
});

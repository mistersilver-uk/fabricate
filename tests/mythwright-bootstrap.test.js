import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

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

    assert.equal(component.sourceUuid, 'Item.world-fine-longsword');
    assert.equal(component.sourceItemUuid, 'Item.world-fine-longsword');
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

  it('uses only valid Foundry core icon paths for Mythwright-authored icons', t => {
    const helper = globalThis.MythwrightDnd5eBootstrap;

    // Cheap shape-check: runs everywhere (CI included). Catches typos and
    // malformed entries even when the live Foundry manifest isn't present.
    const ICON_PATH_SHAPE = /^icons\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(svg|webp|png|jpg|jpeg)$/;
    assert.ok(helper.APPROVED_MYTHWRIGHT_ICON_PATHS.length > 10);
    for (const iconPath of helper.APPROVED_MYTHWRIGHT_ICON_PATHS) {
      assert.match(iconPath, ICON_PATH_SHAPE, `${iconPath} is not a well-formed Foundry icon path`);
    }

    // Existence check: requires tmp/fvtt-icon-paths.md, which is generated
    // locally from a running Foundry instance and gitignored. Skip when
    // absent (CI, fresh clones) rather than fail — the shape check above
    // still runs.
    const iconManifestUrl = new URL('../tmp/fvtt-icon-paths.md', import.meta.url);
    if (!existsSync(iconManifestUrl)) {
      t.skip('tmp/fvtt-icon-paths.md not present — regenerate locally from a running Foundry to validate against the live icon set');
      return;
    }

    const foundryIconPaths = new Set(
      readFileSync(iconManifestUrl, 'utf8')
        .split(/\r?\n/)
        .map(path => path.trim())
        .filter(Boolean)
    );

    for (const iconPath of helper.APPROVED_MYTHWRIGHT_ICON_PATHS) {
      assert.ok(foundryIconPaths.has(iconPath), `${iconPath} should exist in tmp/fvtt-icon-paths.md`);
    }
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

  it('pins Mythwright SRD equipment to the DnD5e 2024 Equipment compendium UUIDs', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const byName = new Map(helper.DND5E_EQUIPMENT24_SRD_ITEMS.map(([, name, uuid]) => [name, uuid]));

    assert.equal(byName.get('Longsword'), 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0');
    assert.equal(byName.get('Light Crossbow'), 'Compendium.dnd5e.equipment24.Item.phbwepLightCross');
    assert.equal(byName.get('Plate Armor'), 'Compendium.dnd5e.equipment24.Item.phbarmPlateArmor');
    assert.equal(byName.get('Shield'), 'Compendium.dnd5e.equipment24.Item.phbarmShield0000');
  });

  it('resolves SRD items by explicit compendium UUID before scanning packs by name', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const originalGame = globalThis.game;
    const resolvedById = {
      name: 'Longsword',
      type: 'weapon',
      uuid: 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0'
    };
    const pack = {
      collection: 'dnd5e.equipment24',
      metadata: { packageName: 'dnd5e', type: 'Item' },
      documentName: 'Item',
      getDocument: async id => id === 'phbwepLongsword0' ? resolvedById : null,
      getDocuments: async () => [
        { name: 'Longsword', type: 'weapon', uuid: 'Compendium.dnd5e.items.legacy-longsword' }
      ]
    };
    const packs = [pack];
    packs.get = id => id === 'dnd5e.equipment24' ? pack : null;
    globalThis.game = { ...originalGame, packs };

    const result = await helper.discoverSrdItems(packs);
    const longsword = result.resolved.find(entry => entry.name === 'Longsword');

    assert.equal(longsword.item.uuid, 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0');
    globalThis.game = originalGame;
  });

  it('builds SRD base components that reference compendium items without world import identity', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const component = helper.componentFromItem('weapon-longsword', {
      name: 'Longsword',
      type: 'weapon',
      img: 'icons/longsword.webp',
      uuid: 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0',
      system: { description: { value: '<p>A standard SRD longsword.</p>' } },
      toObject: () => ({ system: { description: { value: '<p>A standard SRD longsword.</p>' } } })
    });

    assert.equal(component.sourceUuid, 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0');
    assert.equal(component.sourceItemUuid, 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0');
    assert.equal(component.name, 'Longsword');
    assert.match(component.description, /standard SRD longsword/);
  });

  it('builds deterministic multi-step SRD recipes with a macroOutcome finishing step', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const target = { name: 'Longsword', type: 'weapon', item: { img: 'icons/longsword.webp' } };
    const recipe = helper.buildRecipeForSrd(target, new Map([
      ['weapon-longsword', { id: 'weapon-longsword' }]
    ]));

    assert.equal(recipe.id, 'mythwright-craft-longsword');
    assert.equal(recipe.category, 'Weapons');
    assert.deepEqual(recipe.tags, []);
    assert.equal(recipe.steps.length, 4);
    assert.equal(recipe.steps.at(-1).resultSelection.provider, 'macroOutcome');
    assert.ok(recipe.steps.every(step =>
      step.ingredientSets.every(set =>
        set.ingredientGroups.every(group =>
          group.options.every(option => option.match.type === 'component')
        )
      )
    ));
    assert.deepEqual(recipe.steps.at(-1).resultGroups.map(group => group.name), [
      'Flawed', 'Standard', 'Fine', 'Masterwork'
    ]);
    assert.deepEqual(recipe.steps.at(-1).resultGroups.map(group => group.results[0].componentId), [
      'weapon-flawed-longsword',
      'weapon-longsword',
      'weapon-fine-longsword',
      'weapon-masterwork-longsword'
    ]);
  });

  it('keeps Mythic outcomes available for bespoke relic recipes', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const recipe = helper.buildRelicRecipe('relic-mythic-longsword', 'Mythwright Mythic Longsword', 'ember');

    assert.equal(recipe.category, 'Relics');
    assert.equal(recipe.img, 'icons/weapons/swords/greatsword-blue.webp');
    assert.match(recipe.description, /awakening Mythwright Mythic Longsword/);
    assert.match(recipe.description, /artefact worthy of legend/);
    assert.deepEqual(recipe.tags, []);
    assert.ok(recipe.steps.at(-1).resultGroups.some(group => group.name === 'Mythic'));
  });

  it('does not emit generated tags when no Mythwright recipe uses tag ingredients', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;

    const tags = helper.tagsForComponent(
      'weapon-fine-longsword',
      { name: 'Fine Longsword' },
      {
        srdQualityIds: new Set(['weapon-fine-longsword']),
        srdQualityTypes: new Map([['weapon-fine-longsword', 'weapon']])
      }
    );

    assert.deepEqual(tags, []);
    assert.deepEqual(helper.itemTagsForSystem(), []);
  });

  it('builds the Mythwright system payload with player-facing description copy', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.buildSystemPayload({
      macroUuid: 'Macro.mythwright-check',
      worldItems: new Map([
        ['ember', { uuid: 'Item.ember-essence' }]
      ]),
      components: [{ id: 'raw-ore', name: 'Raw Ore' }]
    });

    assert.equal(
      payload.description,
      'Mythwright lets you turn harvested components, rare essences, and hard-won materials into weapons, armour, tools, and relics worthy of legend. Build multi-step recipes, forge mundane gear or world-shaping artefacts, and make crafting feel like part of the story rather than a shopping list.'
    );
    assert.equal(payload.craftingCheck.macroUuid, 'Macro.mythwright-check');
    assert.equal(payload.salvageCraftingCheck.macroUuid, 'Macro.mythwright-check');
    assert.equal(payload.essenceDefinitions.find(essence => essence.id === 'ember').sourceItemUuid, 'Item.ember-essence');
    assert.match(payload.essenceDefinitions.find(essence => essence.id === 'ember').description, /cinder-bright essence/);
    assert.deepEqual(payload.components, [{ id: 'raw-ore', name: 'Raw Ore' }]);
  });

  it('builds an import payload and maps import API summary counts', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const previousGame = globalThis.game;
    const calls = [];
    globalThis.game = {
      modules: new Map([['fabricate', { version: '9.8.7' }]]),
      fabricate: {
        importFromPack: async (payload, options) => {
          calls.push({ payload, options });
          return {
            system: { created: false },
            recipes: { imported: 3, skipped: 1, errors: [] },
            collisions: [
              { type: 'system', resolution: 'overwritten' },
              { type: 'recipe', resolution: 'overwritten' }
            ]
          };
        }
      }
    };

    try {
      const payload = helper.buildImportPayload({
        systemPayload: { id: helper.SYSTEM_ID, name: 'Mythwright', components: [{ id: 'raw-ore' }] },
        recipes: [{ id: 'recipe-a', name: 'Recipe A' }]
      });
      const summary = { system: 'skipped', recipes: { created: 0, updated: 0, skipped: 0, errors: 0 } };

      await helper.importMythwrightPayload(payload, summary);

      assert.equal(payload.fabricateVersion, '9.8.7');
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].options, { overwriteExisting: true });
      assert.equal(calls[0].payload.system.id, helper.SYSTEM_ID);
      assert.equal(calls[0].payload.recipes.length, 1);
      assert.equal(summary.system, 'updated');
      assert.equal(summary.recipes.created, 2);
      assert.equal(summary.recipes.updated, 1);
      assert.equal(summary.recipes.skipped, 1);
    } finally {
      globalThis.game = previousGame;
    }
  });

  it('uses patterned player-facing recipe copy and plain gathering environment names', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const club = helper.buildRecipeForSrd(
      { name: 'Club', type: 'weapon', item: { img: 'icons/svg/item-bag.svg' } },
      new Map([['weapon-club', { id: 'weapon-club' }]])
    );
    const shield = helper.buildRecipeForSrd(
      { name: 'Shield', type: 'armor', item: { img: 'icons/svg/item-bag.svg' } },
      new Map([['armor-shield', { id: 'armor-shield' }]])
    );
    const elemental = helper.buildElementalRecipe({
      id: 'weapon-ember-shortsword',
      name: 'Ember Shortsword',
      baseName: 'Shortsword',
      type: 'weapon',
      essenceId: 'ember',
      damageType: 'fire'
    });
    const environment = helper.buildEnvironment('mythwright-mines', 'Mines', 'hazardous', []);

    assert.equal(
      club.description,
      'A simple Mythwright recipe for crafting a sturdy club, guiding the crafter from raw material selection through shaping, balancing, and finishing the weapon.'
    );
    assert.match(shield.description, /crafting a sturdy shield/);
    assert.match(elemental.description, /binding ember essence into shortsword/);
    assert.equal(environment.name, 'Mines');
    assert.match(environment.description, /Old mineworks/);
    assert.equal(environment.description.includes('Mythwright gathering site'), false);
  });

  it('populates Mythwright item and component descriptions from generated flavour', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.itemPayload({
      id: 'raw-ore',
      name: 'Raw Ore',
      folder: { id: 'folder-a' },
      img: 'icons/commodities/stone/ore-pile-grey.webp'
    });
    const component = helper.componentFromItem('raw-ore', {
      name: 'Raw Ore',
      img: payload.img,
      system: payload.system
    }, { preserveSourceIdentity: false });

    assert.match(payload.system.description.value, /Unrefined ore/);
    assert.match(component.description, /Unrefined ore/);
    assert.match(helper.mythwrightItemDescription('ember', 'Ember Essence'), /cinder-bright essence/);
  });

  it('builds elemental weapon payloads without SRD identity and with elemental damage metadata', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const payload = helper.elementalVariantPayload(
      { id: 'weapon-ember-shortsword', name: 'Ember Shortsword', baseName: 'Shortsword', type: 'weapon', essenceId: 'ember', damageType: 'fire', img: 'icons/weapons/swords/shortsword-guard-gold-red.webp' },
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
    assert.equal(payload.img, 'icons/weapons/swords/shortsword-guard-gold-red.webp');
    assert.equal(payload.flags.core, undefined);
    assert.equal(payload._stats, undefined);
    assert.equal(payload.flags.fabricate.mythwrightBaseSourceId, 'Compendium.dnd5e.items.shortsword');
    assert.equal(payload.flags.fabricate.elemental.essenceId, 'ember');
    assert.equal(payload.flags.fabricate.elemental.damageType, 'fire');
    assert.equal(payload.flags.fabricate.elemental.damageApplied, true);
    assert.deepEqual(payload.system.damage.parts.at(-1), ['1d4', 'fire']);
  });

  it('builds tiered elemental weapon payloads with stable standard identity and scaled damage', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const definition = { id: 'weapon-ember-shortsword', name: 'Ember Shortsword', baseName: 'Shortsword', type: 'weapon', essenceId: 'ember', damageType: 'fire', img: 'icons/weapons/swords/shortsword-guard-gold-red.webp' };
    const variants = helper.elementalQualityVariantDefinitions(definition);
    const mythic = variants.find(variant => variant.quality.id === 'mythic');

    assert.equal(variants.find(variant => variant.quality.id === 'standard').id, 'weapon-ember-shortsword');
    assert.equal(mythic.id, 'weapon-ember-mythic-shortsword');
    assert.equal(mythic.name, 'Mythic Ember Shortsword');

    const payload = helper.elementalVariantPayload(
      mythic,
      {
        name: 'Shortsword',
        type: 'weapon',
        img: 'icons/shortsword.webp',
        uuid: 'Compendium.dnd5e.items.shortsword',
        toObject: () => ({
          system: { quantity: 1, damage: { parts: [['1d6', 'piercing']] } },
          flags: { core: { sourceId: 'Compendium.dnd5e.items.shortsword' } }
        })
      },
      { id: 'elemental-folder' }
    );

    assert.equal(payload.flags.fabricate.mythwrightId, 'weapon-ember-mythic-shortsword');
    assert.equal(payload.flags.fabricate.elemental.quality, 'mythic');
    assert.equal(payload.flags.fabricate.elemental.damageFormula, '1d10');
    assert.deepEqual(payload.system.damage.parts.at(-1), ['1d10', 'fire']);
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

  it('builds tiered elemental armour payloads with resistance and AC scaling', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const definition = { id: 'armor-dragon-scale-mail', name: 'Dragon Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'dragon', resistanceType: 'fire', img: 'icons/equipment/chest/breastplate-scale-grey.webp' };
    const [flawed] = helper.elementalQualityVariantDefinitions(definition);
    const mythic = helper.elementalQualityVariantDefinitions(definition).find(variant => variant.quality.id === 'mythic');

    const source = {
      name: 'Scale Mail',
      type: 'equipment',
      img: 'icons/scale-mail.webp',
      uuid: 'Compendium.dnd5e.items.scale-mail',
      toObject: () => ({
        system: { quantity: 1, description: { value: '<p>Base armour.</p>' } },
        flags: { core: { sourceId: 'Compendium.dnd5e.items.scale-mail' } }
      })
    };
    const flawedPayload = helper.elementalVariantPayload(flawed, source, { id: 'elemental-folder' });
    const mythicPayload = helper.elementalVariantPayload(mythic, source, { id: 'elemental-folder' });

    assert.equal(flawedPayload.flags.fabricate.elemental.quality, 'flawed');
    assert.match(flawedPayload.system.description.value, /grants no reliable resistance/);
    assert.deepEqual(flawedPayload.effects, []);
    assert.equal(mythicPayload.flags.fabricate.elemental.quality, 'mythic');
    assert.equal(mythicPayload.flags.fabricate.elemental.acBonus, 3);
    assert.match(mythicPayload.system.description.value, /resistance to fire damage and a \+3 bonus to AC/);
    assert.equal(mythicPayload.effects[0].changes[0].key, 'system.traits.dr.value');
    assert.equal(mythicPayload.effects[1].changes[0].key, 'system.attributes.ac.bonus');
    assert.equal(mythicPayload.effects[1].changes[0].value, '3');
  });

  it('expands curated elemental variants across additional weapon and armour types', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const ids = new Set(helper.ELEMENTAL_VARIANTS.map(variant => variant.id));

    assert.ok(ids.has('weapon-ember-battleaxe'));
    assert.ok(ids.has('weapon-frost-spear'));
    assert.ok(ids.has('weapon-storm-warhammer'));
    assert.ok(ids.has('weapon-radiant-longbow'));
    assert.ok(ids.has('weapon-shadow-rapier'));
    assert.ok(ids.has('weapon-dragon-greataxe'));
    assert.ok(ids.has('armor-ember-shield'));
    assert.ok(ids.has('armor-frost-half-plate'));
    assert.ok(ids.has('armor-storm-studded-leather-armor'));
    assert.ok(ids.has('armor-radiant-plate-armor'));
    assert.ok(ids.has('armor-shadow-breastplate'));
    assert.ok(ids.has('armor-dragon-plate-armor'));
  });

  it('builds elemental recipes requiring matching essence and producing the intended variant', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const recipe = helper.buildElementalRecipe({
      id: 'weapon-ember-shortsword',
      name: 'Ember Shortsword',
      baseName: 'Shortsword',
      type: 'weapon',
      essenceId: 'ember',
      damageType: 'fire',
      img: 'icons/weapons/swords/shortsword-guard-gold-red.webp'
    });
    const set = recipe.steps[0].ingredientSets[0];

    assert.equal(recipe.transferEffects, true);
    assert.equal(recipe.category, 'Weapons');
    assert.equal(recipe.img, 'icons/weapons/swords/shortsword-guard-gold-red.webp');
    assert.deepEqual(recipe.tags, []);
    assert.equal(recipe.resultSelection.provider, 'macroOutcome');
    assert.equal(recipe.steps[0].resultSelection.provider, 'macroOutcome');
    assert.ok(set.ingredientGroups.every(group =>
      group.options.every(option => option.match.type === 'component')
    ));
    assert.equal(set.essences.ember, 1);
    assert.deepEqual(recipe.steps[0].resultGroups.map(group => group.name), [
      'Flawed', 'Standard', 'Fine', 'Masterwork', 'Mythic'
    ]);
    assert.deepEqual(recipe.steps[0].resultGroups.map(group => group.results[0].componentId), [
      'weapon-ember-flawed-shortsword',
      'weapon-ember-shortsword',
      'weapon-ember-fine-shortsword',
      'weapon-ember-masterwork-shortsword',
      'weapon-ember-mythic-shortsword'
    ]);
  });

  it('seeds deterministic Mythwright gathering tools with broken replacements', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const tools = helper.buildGatheringTools();

    assert.deepEqual(tools.map(tool => tool.id), [
      'mythwright-tool-mining-pick',
      'mythwright-tool-wood-axe',
      'mythwright-tool-skinning-knife',
      'mythwright-tool-delver-kit',
      'mythwright-tool-planar-binding-rod',
      'mythwright-tool-dragon-tongs'
    ]);
    assert.ok(tools.every(tool => tool.breakage.mode === 'breakageChance'));
    assert.ok(tools.every(tool => tool.onBreak.mode === 'replaceWith'));
    assert.equal(
      tools.find(tool => tool.id === 'mythwright-tool-mining-pick').onBreak.replacementComponentId,
      'broken-tool-mining-pick'
    );
    assert.ok(helper.APPROVED_MYTHWRIGHT_ICON_PATHS.includes('icons/tools/hand/pickaxe-steel-white.webp'));
  });

  it('builds repair recipes that consume broken tools and matching Mythwright materials', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const recipes = helper.buildToolRepairRecipes();
    const pick = recipes.find(recipe => recipe.id === 'mythwright-repair-mining-pick');
    const components = pick.steps[0].ingredientSets[0].ingredientGroups.map(group => group.options[0].componentId);

    assert.equal(pick.category, 'Tools');
    assert.deepEqual(components, ['broken-tool-mining-pick', 'iron-ingot', 'hardwood']);
    assert.equal(pick.steps[0].resultGroups[0].results[0].componentId, 'tool-mining-pick');
  });

  it('builds Mythwright gathering library tasks with toolIds and valid drop rows', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const tasks = helper.buildGatheringTasks({
      srdByName: new Map([
        [helper.normalizeName('War Pick'), { type: 'weapon', name: 'War Pick', item: { uuid: 'Compendium.dnd5e.equipment24.Item.phbwepWarPick000' } }],
        [helper.normalizeName('Longsword'), { type: 'weapon', name: 'Longsword', item: { uuid: 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0' } }],
        [helper.normalizeName('Leather Armor'), { type: 'armor', name: 'Leather Armor', item: { uuid: 'Compendium.dnd5e.equipment24.Item.phbarmLeatherArm' } }],
        [helper.normalizeName('Shield'), { type: 'armor', name: 'Shield', item: { uuid: 'Compendium.dnd5e.equipment24.Item.phbarmShield0000' } }]
      ])
    });
    const byId = new Map(tasks.map(task => [task.id, task]));
    const rowNames = tasks.flatMap(task => task.dropRows.map(row => row.name));
    const safeIcons = new Set(helper.APPROVED_MYTHWRIGHT_ICON_PATHS);

    assert.equal(byId.get('mine-ore').name, 'Extract Ore');
    assert.equal(byId.get('mine-ore').img, 'icons/commodities/stone/ore-pile-grey.webp');
    assert.equal(byId.get('planar-essence').img, 'icons/svg/lightning.svg');
    assert.equal(byId.get('dragon-scale').img, 'icons/commodities/leather/scales-brown.webp');
    assert.deepEqual(byId.get('mine-ore').toolIds, ['mythwright-tool-mining-pick']);
    assert.deepEqual(byId.get('battlefield-salvage').toolIds, [
      'mythwright-tool-delver-kit',
      'mythwright-tool-skinning-knife'
    ]);
    assert.ok(tasks.every(task => task.img && task.img !== 'icons/svg/item-bag.svg'));
    assert.ok(tasks.every(task => safeIcons.has(task.img)));
    assert.ok(tasks.every(task => task.dropRows.length > 0));
    assert.ok(tasks.every(task => task.dropRows.every(row => row.componentId || row.itemUuid)));
    assert.equal(rowNames.some(name => /^(Found|Recovered|Buried|Preserved)\b/.test(name)), false);
    assert.ok(rowNames.includes('Leather Armor'));
    assert.deepEqual(byId.get('mine-ore').dropRows.find(row => row.name === 'War Pick'), {
      id: 'mine-ore-war-pick',
      name: 'War Pick',
      quantity: 1,
      dropRate: 8,
      enabled: true,
      componentId: 'weapon-war-pick'
    });
    assert.ok(byId.get('battlefield-salvage').dropRows.some(row => row.componentId === 'weapon-longsword'));
    assert.equal(tasks.some(task => task.dropRows.some(row => row.itemUuid)), false);
  });

  it('omits and reports Mythwright optional SRD gathering rewards that cannot become components', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const unresolvedDrops = [];
    const tasks = helper.buildGatheringTasks({ srdByName: new Map(), unresolvedDrops });

    assert.equal(tasks.some(task => task.dropRows.some(row => row.name === 'War Pick')), false);
    assert.ok(unresolvedDrops.some(row => row.id === 'mine-ore-war-pick' && row.itemName === 'War Pick'));
  });

  it('builds Mythwright environments that compose gathering task-library records', () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const environment = helper.buildEnvironment('mythwright-wilds', 'Wilds', 'safe', [
      { id: 'wild-hardwood' },
      { id: 'wild-hide' }
    ]);

    assert.deepEqual(environment.tasks, []);
    assert.deepEqual(environment.enabledTaskIds, ['wild-hardwood', 'wild-hide']);
  });

  it('seeds Mythwright gathering tools and tasks into gatheringConfig idempotently', async () => {
    const helper = globalThis.MythwrightDnd5eBootstrap;
    const originalGame = globalThis.game;
    const writes = [];
    let config = {
      systems: {
        'mythwright-dnd5e': {
          tools: [{ id: 'existing-tool', componentId: 'old-tool' }],
          tasks: [{ id: 'mine-ore', name: 'Old Mine Task' }],
          rules: { rewardSelectionMode: 'allDrops' }
        }
      }
    };
    globalThis.game = {
      ...originalGame,
      settings: {
        get: (_namespace, key) => key === 'gatheringConfig' ? config : undefined,
        set: async (_namespace, key, value) => {
          if (key === 'gatheringConfig') config = value;
          writes.push({ key, value });
          return value;
        }
      }
    };

    await helper.seedGatheringConfig({
      tools: helper.buildGatheringTools(),
      tasks: helper.buildGatheringTasks()
    });

    const systemConfig = config.systems['mythwright-dnd5e'];
    assert.equal(writes.at(-1).key, 'gatheringConfig');
    assert.ok(systemConfig.tools.some(tool => tool.id === 'existing-tool'));
    assert.equal(
      systemConfig.tools.find(tool => tool.id === 'mythwright-tool-mining-pick').componentId,
      'tool-mining-pick'
    );
    assert.notEqual(
      systemConfig.tasks.find(task => task.id === 'mine-ore').name,
      'Old Mine Task'
    );
    assert.ok(systemConfig.tasks.find(task => task.id === 'mine-ore').toolIds.includes('mythwright-tool-mining-pick'));
    globalThis.game = originalGame;
  });
});

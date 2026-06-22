// Fabricate Macro: Seed Exploratory-Testing Crafting Systems
// =============================================================================
// Run this as a GM Script Macro. It (re)creates a MINIMAL but COMPLETE set of
// tersely-populated crafting systems plus the supporting Foundry documents
// (world Items, a test Actor with inventory, Macros, a RollTable and Scenes)
// needed to manually explore EVERY Fabricate mode and feature.
//
// IDEMPOTENT: each run first completely tears down everything a previous run
// created (matched by the `fabricate.seedMacro` flag, or the `FabSeed` name
// prefix for crafting systems), then rebuilds from scratch. Run it as often as
// you like — nothing accumulates.
//
// Every entity with an image field uses a path verified against Foundry core's
// icon list (tmp/fvtt-icon-paths.md). Essence / currency icons are FontAwesome
// class strings (that is the field's type — they are not image paths).
//
// Coverage map (feature -> where it is exercised):
//   - resolution modes simple / routed / progressive / alchemy -> S1 / S2 / S3 / S4
//   - crafting check: built-in (S1), macro + named outcomes (S2), progressive award (S3)
//   - result routing: ingredientSet / macroOutcome / rollTableOutcome + outcomeRouting -> S2
//   - multi-step recipe with per-step durations -> S2
//   - ingredient matches: component / tags / currency, and OR-groups -> S1 + S2
//   - essences + effect transfer (transferEffects, essence -> item w/ Active Effect) -> S4
//   - alchemy config (learnOnCraft / consumeOnFail / history) -> S4
//   - salvage: simple (S1), progressive (S3), routed + property macro (S4)
//   - system Tools breakage: limitedUses + flagBroken (S1), breakageChance + destroy (S3)
//   - recipe visibility: knowledge (S1), teaser (S2), player (S3), global (S4)
//   - currency requirement + item tags -> S1 / S2
//   - gathering w/ resource NODES + targeted environment + tool + event -> S1
//   - gathering w/ STAMINA + blind environment + realms + travel party -> S3
// =============================================================================

(async () => {
  const PREFIX = 'FabSeed';
  const SYS_PREFIX = `${PREFIX}: `;
  const SEED_FLAG = { fabricate: { seedMacro: true } };

  if (!game.user?.isGM) {
    ui.notifications.error('Fabricate seed macro: must be run by a GM.');
    return;
  }

  const fab = game.fabricate;
  if (!fab?.getCraftingSystemManager) {
    ui.notifications.error('Fabricate is not active in this world.');
    return;
  }
  const csm = fab.getCraftingSystemManager();
  const rm = fab.getRecipeManager();
  const envStore = fab.getGatheringEnvironmentStore?.();
  const realmStore = fab.getGatheringRealmStore?.();
  const partyStore = fab.getGatheringPartyStore?.();

  // ---- verified core-icon paths (all present in tmp/fvtt-icon-paths.md) -------
  const ICON = {
    ore: 'icons/commodities/metal/ingot-worn-iron.webp',
    herb: 'icons/consumables/plants/leaf-herb-green.webp',
    scale: 'icons/commodities/leather/scales-blue-white.webp',
    vial: 'icons/consumables/potions/vial-cork-empty.webp',
    rawGem: 'icons/commodities/gems/gem-amber-insect-orange.webp',
    cutGem: 'icons/commodities/gems/gem-cut-faceted-princess-purple.webp',
    sickle: 'icons/tools/hand/sickle-worn-steel-grey.webp',
    hammer: 'icons/skills/trades/construction-carpentry-hammer.webp',
    sword: 'icons/weapons/swords/sword-guard-brass-worn.webp',
    armor: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
    potion: 'icons/consumables/potions/potion-tube-corked-red.webp',
    ingot: 'icons/commodities/metal/ingot-stack-steel.webp',
    flame: 'icons/magic/fire/projectile-fireball-orange.webp',
    scroll: 'icons/sundries/scrolls/scroll-runed-brown.webp',
    scrollAlt: 'icons/sundries/scrolls/scroll-bound-black-brown.webp',
    envTargeted: 'icons/magic/nature/tree-spirit-blue.webp',
    envBlind: 'icons/magic/nature/tree-spirit-green.webp',
    event: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
    realm: 'icons/environment/wilderness/altar-hidden.webp',
    sceneBg: 'icons/consumables/plants/leaf-herb-green.webp',
    flower: 'icons/commodities/flowers/blooms-pink.webp',
    ice: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp'
  };

  const log = (msg) => console.log(`Fabricate seed | ${msg}`);
  const isSeed = (doc) => doc?.getFlag?.('fabricate', 'seedMacro') === true;

  // Resolve a document subtype that exists in this world (game system agnostic).
  const pickType = (kind, preferred) => {
    const types = Array.from(
      game.documentTypes?.[kind] ?? game.system?.documentTypes?.[kind] ?? []
    ).filter((t) => t !== 'base');
    if (types.includes(preferred)) return preferred;
    return types[0] || preferred;
  };
  const ITEM_TYPE = pickType('Item', 'loot');
  const ACTOR_TYPE = pickType('Actor', 'character');

  // ===========================================================================
  // 1. TEARDOWN — remove everything a prior run created.
  // ===========================================================================
  const teardown = async () => {
    // Parties first (they reference the actor we are about to delete).
    try {
      for (const p of partyStore?.list?.() ?? []) {
        if (String(p?.name || '').startsWith(PREFIX)) await partyStore.delete(p.id);
      }
    } catch (e) {
      log(`party teardown skipped: ${e.message}`);
    }

    // Crafting systems — deleteSystem cascades recipes, components, environments,
    // this system's gatheringConfig entry and its realms.
    for (const s of csm.getSystems?.() ?? []) {
      if (String(s?.name || '').startsWith(SYS_PREFIX)) {
        try {
          await csm.deleteSystem(s.id);
        } catch (e) {
          log(`failed to delete system ${s?.name}: ${e.message}`);
        }
      }
    }

    // Defensive: orphan environments not owned by a deleted system.
    try {
      for (const env of envStore?.list?.() ?? []) {
        if (String(env?.name || '').startsWith(PREFIX)) await envStore.delete(env.id);
      }
    } catch (e) {
      log(`environment teardown skipped: ${e.message}`);
    }

    // Supporting world documents — matched ONLY by our flag (the running macro is
    // user-authored and unflagged, so it is never deleted here).
    const sweep = async (collection, cls) => {
      const ids = (collection?.contents ?? []).filter(isSeed).map((d) => d.id);
      if (ids.length) await cls.deleteDocuments(ids);
      return ids.length;
    };
    await sweep(game.scenes, Scene);
    await sweep(game.tables, RollTable);
    await sweep(game.macros, Macro);
    await sweep(game.actors, Actor);
    await sweep(game.items, Item);
  };

  // ===========================================================================
  // 2. SUPPORTING FOUNDRY DOCUMENTS
  // ===========================================================================
  const createSupport = async () => {
    // World items. `Flame Shard` carries an Active Effect so the effect-transfer
    // demo (S4) has something to transfer onto crafted results.
    const itemData = [
      { name: 'Iron Ore', img: ICON.ore },
      { name: 'Mystic Herb', img: ICON.herb },
      { name: 'Dragon Scale', img: ICON.scale },
      { name: 'Empty Vial', img: ICON.vial },
      { name: 'Raw Gemstone', img: ICON.rawGem },
      { name: 'Cut Gem', img: ICON.cutGem },
      { name: 'Herbalist Sickle', img: ICON.sickle },
      { name: 'Smith Hammer', img: ICON.hammer },
      { name: 'Iron Sword', img: ICON.sword },
      { name: 'Dragon Scale Armor', img: ICON.armor },
      { name: 'Healing Potion', img: ICON.potion },
      { name: 'Refined Ingot', img: ICON.ingot },
      {
        name: 'Flame Shard',
        img: ICON.flame,
        effects: [
          {
            name: 'Fire Ward',
            img: ICON.flame,
            disabled: false,
            transfer: false,
            // dnd5e-flavoured key; harmless/cosmetic in other game systems.
            changes: [{ key: 'system.traits.dr.value', mode: 2, value: 'fire' }]
          }
        ]
      }
    ].map((d) => ({
      ...d,
      name: `${PREFIX} ${d.name}`,
      type: ITEM_TYPE,
      flags: { ...SEED_FLAG }
    }));

    const items = await Item.createDocuments(itemData);
    const item = {};
    for (const doc of items) item[doc.name.slice(PREFIX.length + 1)] = doc;

    // Test actor with a stocked inventory. Embedded copies carry
    // flags.core.sourceId so the crafting engine matches them to components.
    const actor = await Actor.create({
      name: `${PREFIX} Test Crafter`,
      type: ACTOR_TYPE,
      img: ICON.armor,
      flags: { ...SEED_FLAG }
    });
    const copies = (name, qty) =>
      Array.from({ length: qty }, () => ({
        name: item[name].name,
        type: item[name].type,
        img: item[name].img,
        flags: { core: { sourceId: item[name].uuid } }
      }));
    await actor.createEmbeddedDocuments('Item', [
      ...copies('Mystic Herb', 3),
      ...copies('Empty Vial', 2),
      ...copies('Iron Ore', 2),
      ...copies('Dragon Scale', 1),
      ...copies('Raw Gemstone', 1),
      ...copies('Flame Shard', 1),
      ...copies('Herbalist Sickle', 1)
    ]);

    // Script macros: a crafting check, a routed-outcome provider, a salvage property macro.
    const mkMacro = (name, command, img) =>
      Macro.create({ name: `${PREFIX} ${name}`, type: 'script', img, command, flags: { ...SEED_FLAG } });
    const checkMacro = await mkMacro(
      'Crafting Check',
      "// Demo crafting check. Return a named outcome for routed/named-outcome modes.\nreturn Math.random() < 0.5 ? 'high' : 'low';",
      ICON.scroll
    );
    const outcomeMacro = await mkMacro(
      'Routed Outcome',
      "// macroOutcome provider: resolves which result group a routed recipe yields.\nreturn Math.random() < 0.5 ? 'high' : 'low';",
      ICON.scrollAlt
    );
    const propMacro = await mkMacro(
      'Property Macro',
      '// Salvage result property macro: mutate the created item document here.\nreturn;',
      ICON.scrollAlt
    );

    // Roll table for the rollTableOutcome routing demo.
    const TEXT = CONST.TABLE_RESULT_TYPES?.TEXT ?? 0;
    const outcomeTable = await RollTable.create({
      name: `${PREFIX} Outcome Table`,
      img: ICON.scroll,
      formula: '1d2',
      flags: { ...SEED_FLAG },
      results: [
        { type: TEXT, text: 'high', range: [1, 1], weight: 1 },
        { type: TEXT, text: 'low', range: [2, 2], weight: 1 }
      ]
    });

    // Scenes used as gathering-environment backdrops.
    const grove = await Scene.create({
      name: `${PREFIX} Azure Grove`,
      background: { src: ICON.sceneBg },
      flags: { ...SEED_FLAG }
    });
    const hollow = await Scene.create({
      name: `${PREFIX} Frostwood Hollow`,
      background: { src: ICON.ice },
      flags: { ...SEED_FLAG }
    });

    return { item, actor, checkMacro, outcomeMacro, propMacro, outcomeTable, grove, hollow };
  };

  // ---- small builders --------------------------------------------------------
  // Register a world item as a component and apply a patch (essences/salvage/etc.).
  const addComponent = async (systemId, itemDoc, patch = {}) => {
    const res = await csm.addItemFromUuid(systemId, itemDoc.uuid);
    const id = res.item.id;
    if (Object.keys(patch).length) await csm.updateItem(systemId, id, patch);
    return id;
  };
  const essIdByName = (system, name) =>
    (system.essenceDefinitions || []).find((e) => e.name === name)?.id ?? null;

  // Read/modify/write the per-system gathering library (tasks/tools/events/rules/economy).
  const writeGathering = async (systemId, entry) => {
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.systems = config.systems || {};
    config.systems[systemId] = { ...(config.systems[systemId] || {}), ...entry };
    await game.settings.set('fabricate', 'gatheringConfig', config);
  };

  // ===========================================================================
  // 3. SYSTEM BUILDERS
  // ===========================================================================

  // --- S1: Simple Forge -----------------------------------------------------
  const buildSimpleForge = async (sup) => {
    const system = await csm.createSystem({
      name: `${SYS_PREFIX}Simple Forge`,
      description: 'Simple crafting, built-in check, salvage, currency/tags and node-limited gathering.',
      resolutionMode: 'simple',
      features: { salvage: true, gathering: true, craftingChecks: true, itemTags: true },
      itemTags: ['metallic', 'reagent', 'rare'],
      requirements: {
        currency: {
          enabled: true,
          units: [
            { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' },
            { id: 'sp', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins' }
          ]
        }
      },
      craftingCheck: {
        enabled: true,
        checkSource: 'builtIn',
        mode: 'passFail',
        builtIn: { ability: 'str', skill: '', dc: 12, advantage: 'normal' },
        consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false }
      },
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, consumption: { consumeComponentOnFail: true } },
      recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'itemOrLearned', learn: { consumeOnLearn: true } } }
    });
    const sid = system.id;

    const ore = await addComponent(sid, sup.item['Iron Ore'], { difficulty: 1, tags: ['metallic'] });
    const sword = await addComponent(sid, sup.item['Iron Sword'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'rg-scrap', name: 'Scrap', results: [{ componentId: ore, quantity: 1 }] }]
      }
    });
    const sickle = await addComponent(sid, sup.item['Herbalist Sickle'], {});

    // System tool: limited-uses breakage that flags the item broken.
    await csm.updateSystem(sid, {
      tools: [
        {
          id: 'forge-sickle',
          label: 'Herbalist Sickle',
          enabled: true,
          componentId: sickle,
          requirement: { formula: '@abilities.str.mod' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ]
    });

    await rm.createRecipe(
      {
        name: 'Forge Iron Sword',
        description: 'Component, tag and currency requirements feeding a single result.',
        craftingSystemId: sid,
        img: ICON.sword,
        ingredientSets: [
          {
            name: 'Forge',
            ingredientGroups: [
              { name: 'Iron Ore', options: [{ quantity: 2, match: { type: 'component', componentId: ore } }] },
              { name: 'Any reagent', options: [{ quantity: 1, match: { type: 'tags', tags: ['reagent', 'rare'], tagMatch: 'any' } }] },
              { name: 'Gold cost', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 50 } }] }
            ]
          }
        ],
        resultGroups: [{ id: 'rg-out', name: 'Forged Weapon', results: [{ componentId: sword, quantity: 1 }] }]
      },
      { allowIncomplete: true, notify: false }
    );

    // Gathering: resource nodes (no stamina), targeted environment with a scene,
    // a tool-gated task and a hazard event.
    await writeGathering(sid, {
      rules: { revealPolicy: 'onAttempt', rewardSelectionMode: 'highestRankedDrop', eventSelectionMode: 'allDrops', eventPolicy: 'successWithEvent' },
      vocabularies: { regions: { values: ['northreach'] } },
      economy: { nodes: { enabled: true } },
      tools: [
        {
          id: 'forge-sickle',
          label: 'Herbalist Sickle',
          enabled: true,
          componentId: sickle,
          requirement: { formula: '@abilities.str.mod' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ],
      tasks: [
        {
          id: 'forge-mine-ore',
          name: 'Mine Surface Ore',
          description: 'Chip ore from a finite, slowly-respawning node.',
          img: ICON.ore,
          enabled: true,
          region: 'northreach',
          biomes: ['mountain'],
          itemSelectionMode: 'highestRankedDrop',
          toolIds: ['forge-sickle'],
          dropRows: [{ id: 'drop-ore', componentId: ore, quantity: 2, dropRate: 85, enabled: true }],
          nodes: {
            enabled: true,
            max: 5,
            current: 5,
            depletionTiming: 'onSuccess',
            respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 6 }
          }
        }
      ],
      events: [
        {
          id: 'forge-rockslide',
          name: 'Rockslide',
          description: 'Loose scree gives way underfoot.',
          img: ICON.event,
          enabled: true,
          dangerTags: ['hazardous'],
          region: 'northreach',
          biomes: ['mountain'],
          dropRate: 30
        }
      ]
    });

    if (envStore) {
      await envStore.create({
        craftingSystemId: sid,
        name: `${PREFIX} Iron Hills`,
        description: 'A targeted gathering site backed by a scene, with node-limited ore.',
        img: ICON.envTargeted,
        enabled: true,
        selectionMode: 'targeted',
        sceneUuid: sup.grove.uuid,
        region: 'northreach',
        biomes: ['mountain'],
        dangerTags: ['hazardous'],
        eventSelectionMode: 'highestRankedDrop',
        eventPolicy: 'successWithEvent',
        enabledTaskIds: ['forge-mine-ore'],
        enabledEventIds: ['forge-rockslide']
      });
    }
    return system;
  };

  // --- S2: Routed Atelier ---------------------------------------------------
  const buildRoutedAtelier = async (sup) => {
    const system = await csm.createSystem({
      name: `${SYS_PREFIX}Routed Atelier`,
      description: 'Routed result selection (ingredientSet / macroOutcome / rollTableOutcome), multi-step, teaser visibility.',
      resolutionMode: 'routed',
      features: { essences: true, multiStepRecipes: true, outcomeRouting: true, craftingChecks: true, itemTags: true, chatOutput: true },
      itemTags: ['metallic', 'precious'],
      requirements: {
        currency: { enabled: true, units: [{ id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' }] }
      },
      craftingCheck: {
        enabled: true,
        checkSource: 'macro',
        mode: 'namedOutcomes',
        macroUuid: sup.checkMacro.uuid,
        successMacroUuid: sup.checkMacro.uuid,
        outcomes: ['low', 'high']
      },
      recipeVisibility: { listMode: 'teaser' },
      teaserConfig: { enabled: true, discoveryMode: 'both', fragments: [] },
      essenceDefinitions: [{ name: 'Verdant', description: 'Growth and renewal.', icon: 'fas fa-leaf' }]
    });
    const sid = system.id;
    const fresh = csm.getSystem(sid);
    const verdant = essIdByName(fresh, 'Verdant');

    const ore = await addComponent(sid, sup.item['Iron Ore'], { tags: ['metallic'], essences: verdant ? { [verdant]: 1 } : {} });
    const ingot = await addComponent(sid, sup.item['Refined Ingot'], {});
    const cutGem = await addComponent(sid, sup.item['Cut Gem'], { tags: ['precious'] });
    const rawGem = await addComponent(sid, sup.item['Raw Gemstone'], {});

    const twoGroups = [
      { id: 'rg-a', name: 'High Outcome', results: [{ componentId: ingot, quantity: 2 }] },
      { id: 'rg-b', name: 'Low Outcome', results: [{ componentId: ingot, quantity: 1 }] }
    ];
    const oreSet = [
      { name: 'Smelt', ingredientGroups: [{ name: 'Iron Ore', options: [{ quantity: 2, match: { type: 'component', componentId: ore } }] }] }
    ];

    // Provider 1: ingredient set drives the result.
    await rm.createRecipe(
      { name: 'Smelt (by ingredients)', description: 'Routed by ingredient set.', craftingSystemId: sid, img: ICON.ingot, ingredientSets: oreSet, resultGroups: twoGroups, resultSelection: { provider: 'ingredientSet' } },
      { allowIncomplete: true, notify: false }
    );
    // Provider 2: a macro decides the named outcome -> result group.
    await rm.createRecipe(
      { name: 'Smelt (by macro outcome)', description: 'Routed by a macro outcome.', craftingSystemId: sid, img: ICON.ingot, ingredientSets: oreSet, resultGroups: twoGroups, resultSelection: { provider: 'macroOutcome', macroUuid: sup.outcomeMacro.uuid }, outcomeRouting: { high: 'rg-a', low: 'rg-b' } },
      { allowIncomplete: true, notify: false }
    );
    // Provider 3: a roll table draw decides the outcome -> result group.
    await rm.createRecipe(
      { name: 'Smelt (by roll table)', description: 'Routed by a roll-table draw.', craftingSystemId: sid, img: ICON.ingot, ingredientSets: oreSet, resultGroups: twoGroups, resultSelection: { provider: 'rollTableOutcome', rollTableUuid: sup.outcomeTable.uuid }, outcomeRouting: { high: 'rg-a', low: 'rg-b' } },
      { allowIncomplete: true, notify: false }
    );

    // Multi-step recipe with per-step durations.
    await rm.createRecipe(
      {
        name: 'Multi-Step Gem Setting',
        description: 'Two steps with their own ingredients, results and durations.',
        craftingSystemId: sid,
        img: ICON.cutGem,
        steps: [
          {
            name: 'Cut the stone',
            ingredientSets: [{ name: 'Rough', ingredientGroups: [{ name: 'Raw Gemstone', options: [{ quantity: 1, match: { type: 'component', componentId: rawGem } }] }] }],
            resultGroups: [{ id: 'ms-a', name: 'Cut Gem', results: [{ componentId: cutGem, quantity: 1 }] }],
            timeRequirement: { hours: 2 }
          },
          {
            name: 'Mount the setting',
            ingredientSets: [{ name: 'Mount', ingredientGroups: [{ name: 'Refined Ingot', options: [{ quantity: 1, match: { type: 'component', componentId: ingot } }] }] }],
            resultGroups: [{ id: 'ms-b', name: 'Jewelled Ingot', results: [{ componentId: ingot, quantity: 1 }] }],
            timeRequirement: { days: 1 }
          }
        ]
      },
      { allowIncomplete: true, notify: false }
    );

    // Showcase: OR-group + currency requirement (complex set card).
    await rm.createRecipe(
      {
        name: 'Showcase Requirements',
        description: 'Component, OR-group, tag and currency requirement rows.',
        craftingSystemId: sid,
        img: ICON.scroll,
        complex: true,
        ingredientSets: [
          {
            name: 'Primary',
            ingredientGroups: [
              { name: 'Iron Ore', options: [{ quantity: 2, match: { type: 'component', componentId: ore } }] },
              { name: 'Gem (either works)', options: [{ quantity: 1, match: { type: 'component', componentId: cutGem } }, { quantity: 1, match: { type: 'component', componentId: rawGem } }] },
              { name: 'Anything precious', options: [{ quantity: 1, match: { type: 'tags', tags: ['precious'], tagMatch: 'any' } }] },
              { name: 'Gold cost', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }] }
            ]
          }
        ],
        resultGroups: [{ id: 'rg-show', name: 'Showcase Result', results: [{ componentId: ingot, quantity: 1 }] }]
      },
      { allowIncomplete: true, notify: false }
    );
    return system;
  };

  // --- S3: Progressive Field ------------------------------------------------
  const buildProgressiveField = async (sup) => {
    const system = await csm.createSystem({
      name: `${SYS_PREFIX}Progressive Field`,
      description: 'Progressive checks & salvage, stamina-limited blind gathering, realms and a travel party.',
      resolutionMode: 'progressive',
      features: { gathering: true, salvage: true, craftingChecks: true },
      craftingCheck: {
        enabled: true,
        checkSource: 'builtIn',
        mode: 'passFail',
        builtIn: { ability: '', skill: 'sur', dc: 13, advantage: 'normal' },
        progressive: { awardMode: 'exceed', allowPlayerReorder: true }
      },
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: { enabled: true, progressive: { awardMode: 'partial' }, consumption: { consumeComponentOnFail: false } },
      recipeVisibility: { listMode: 'player' },
      gatheringRealmSettings: { enabled: true, revealMode: 'onPartyTokenEntry', modifierVisibility: 'visible' }
    });
    const sid = system.id;

    const herb = await addComponent(sid, sup.item['Mystic Herb'], { difficulty: 1 });
    const vial = await addComponent(sid, sup.item['Empty Vial'], {});
    const potion = await addComponent(sid, sup.item['Healing Potion'], {
      // Progressive mode requires every result component to have difficulty >= 1; potion is this recipe's result.
      difficulty: 1,
      salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [{ id: 'rg-reagents', name: 'Reagents', results: [{ componentId: herb, quantity: 1 }] }] }
    });
    const sickle = await addComponent(sid, sup.item['Herbalist Sickle'], {});

    // System tool: chance-based breakage that destroys the tool on break.
    await csm.updateSystem(sid, {
      tools: [
        { id: 'field-sickle', label: 'Field Sickle', enabled: true, componentId: sickle, requirement: { formula: '@abilities.wis.mod' }, breakage: { mode: 'breakageChance', breakageChance: 25 }, onBreak: { mode: 'destroy' } }
      ]
    });

    await rm.createRecipe(
      {
        name: 'Brew Healing Potion',
        description: 'Progressive craft: result quality scales with the check.',
        craftingSystemId: sid,
        img: ICON.potion,
        ingredientSets: [
          { name: 'Brew', ingredientGroups: [
            { name: 'Mystic Herb', options: [{ quantity: 2, match: { type: 'component', componentId: herb } }] },
            { name: 'Empty Vial', options: [{ quantity: 1, match: { type: 'component', componentId: vial } }] }
          ] }
        ],
        resultGroups: [{ id: 'rg-potion', name: 'Brewed', results: [{ componentId: potion, quantity: 1 }] }]
      },
      { allowIncomplete: true, notify: false }
    );

    // Gathering: stamina economy (no nodes), blind environment.
    await writeGathering(sid, {
      rules: { revealPolicy: 'onAttempt', blindCandidateGate: 'attemptableOnly', rewardSelectionMode: 'highestRankedDrop' },
      vocabularies: { regions: { values: ['meadowlands'] } },
      economy: { stamina: { enabled: true, max: '40', start: '', regen: { policy: 'overTime', unit: 'hours', amount: '1' } } },
      tasks: [
        {
          id: 'field-forage',
          name: 'Forage Herbs',
          description: 'A stamina-costing forage with an uncertain yield.',
          img: ICON.herb,
          enabled: true,
          region: 'meadowlands',
          biomes: ['forest'],
          itemSelectionMode: 'highestRankedDrop',
          staminaCost: 5,
          dropRows: [{ id: 'drop-herb', componentId: herb, quantity: 1, dropRate: 75, enabled: true }]
        }
      ],
      events: []
    });

    if (envStore) {
      await envStore.create({
        craftingSystemId: sid,
        name: `${PREFIX} Shrouded Meadow`,
        description: 'A blind environment: the harvest is unknown until attempted.',
        img: ICON.envBlind,
        enabled: true,
        selectionMode: 'blind',
        region: 'meadowlands',
        biomes: ['forest'],
        enabledTaskIds: ['field-forage']
      });
    }

    // Realm with modifiers + scene mapping.
    if (realmStore) {
      try {
        await realmStore.create(sid, {
          name: `${PREFIX} Northreach`,
          description: 'A travel-gated realm that buffs drops and costs extra stamina.',
          img: ICON.realm,
          enabled: true,
          biomes: ['forest'],
          sceneMappings: [{ sceneUuid: sup.hollow.uuid }],
          modifiers: [
            { kind: 'dropRate', operation: 'multiply', value: 1.2, visibility: 'visible' },
            { kind: 'staminaCost', operation: 'add', value: 1, visibility: 'gmOnly' }
          ]
        });
      } catch (e) {
        log(`realm creation skipped: ${e.message}`);
      }
    }
    return system;
  };

  // --- S4: Alchemy Lab ------------------------------------------------------
  const buildAlchemyLab = async (sup) => {
    const system = await csm.createSystem({
      name: `${SYS_PREFIX}Alchemy Lab`,
      description: 'Alchemy resolution, essences + effect transfer, routed salvage with a property macro.',
      resolutionMode: 'alchemy',
      features: { essences: true, effectTransfer: true, salvage: true, propertyMacros: true },
      alchemy: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: true },
      salvageResolutionMode: 'routed',
      recipeVisibility: { listMode: 'global' },
      essenceDefinitions: [
        { name: 'Fire', description: 'Heat and combustion.', icon: 'fas fa-fire', sourceItemUuid: sup.item['Flame Shard'].uuid },
        { name: 'Verdant', description: 'Growth and renewal.', icon: 'fas fa-leaf', sourceItemUuid: sup.item['Mystic Herb'].uuid }
      ]
    });
    const sid = system.id;
    const fresh = csm.getSystem(sid);
    const fire = essIdByName(fresh, 'Fire');
    const verdant = essIdByName(fresh, 'Verdant');

    const flame = await addComponent(sid, sup.item['Flame Shard'], { essences: fire ? { [fire]: 1 } : {} });
    const herb = await addComponent(sid, sup.item['Mystic Herb'], { essences: verdant ? { [verdant]: 1 } : {} });
    const vial = await addComponent(sid, sup.item['Empty Vial'], {});
    const potion = await addComponent(sid, sup.item['Healing Potion'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'rg-salv', name: 'Reclaimed', results: [{ componentId: herb, quantity: 1, propertyMacroUuid: sup.propMacro.uuid }] }]
      }
    });

    // Effect-transfer recipe: the Fire essence's source item (Flame Shard) carries
    // an Active Effect, transferred to the result because transferEffects is true.
    await rm.createRecipe(
      {
        name: 'Brew Fire Potion',
        description: 'Effect transfer: the Fire Ward effect rides onto the crafted potion.',
        craftingSystemId: sid,
        img: ICON.potion,
        transferEffects: true,
        ingredientSets: [
          { name: 'Infuse', ingredientGroups: [
            { name: 'Flame Shard', options: [{ quantity: 1, match: { type: 'component', componentId: flame } }] },
            { name: 'Empty Vial', options: [{ quantity: 1, match: { type: 'component', componentId: vial } }] }
          ] }
        ],
        resultGroups: [{ id: 'rg-fire', name: 'Fire Potion', results: [{ componentId: potion, quantity: 1 }] }]
      },
      { allowIncomplete: true, notify: false }
    );
    return system;
  };

  // ===========================================================================
  // 4. RUN
  // ===========================================================================
  try {
    log('Tearing down any previous seed data...');
    await teardown();

    log('Creating supporting documents...');
    const sup = await createSupport();

    log('Building crafting systems...');
    const built = [];
    built.push(await buildSimpleForge(sup));
    const routed = await buildRoutedAtelier(sup);
    built.push(routed);
    const progressive = await buildProgressiveField(sup);
    built.push(progressive);
    built.push(await buildAlchemyLab(sup));

    // Cross-system travel party (references the test actor + S3's realm).
    if (partyStore) {
      try {
        const overrides = {};
        const realms = realmStore?.listBySystem?.(progressive.id) ?? [];
        if (realms.length) overrides[progressive.id] = { mode: 'manual', realmIds: [realms[0].id] };
        await partyStore.create({
          name: `${PREFIX} Expedition`,
          enabled: true,
          travelActorUuid: sup.actor.uuid,
          memberActorUuids: [sup.actor.uuid],
          currentRealmOverrides: overrides
        });
      } catch (e) {
        log(`party creation skipped: ${e.message}`);
      }
    }

    const names = built.map((s) => s.name).join(', ');
    log(`Done. Systems: ${names}`);
    ui.notifications.info(`Fabricate: seeded ${built.length} test systems + supporting data. See console for details.`);
  } catch (err) {
    console.error('Fabricate seed | failed:', err);
    ui.notifications.error(`Fabricate seed failed: ${err.message}`);
  }
})();

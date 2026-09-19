/** The issue-#543 player-facing Alchemy workbench coverage fixtures. */

/** Seed the player-facing Alchemy workbench coverage fixtures (issue #543). */
export async function seedSmokeAlchemyFixtures(page, craftingSetup, crafterId) {
  return await page.evaluate(async ({ crafterId }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Alchemy fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // Existing world items the crafter already owns: reuse them as managed
    // components so the workbench inventory column shows owned, placeable rows.
    const worldByName = Object.fromEntries(game.items.contents.map((item) => [item.name, item]));
    const requireWorldItem = (name) => {
      const item = worldByName[name];
      if (!item) throw new Error(`Alchemy fixtures: world item "${name}" not found`);
      return item;
    };

    // Product / second-system world items. Alchemy result groups reference managed components, so
    // the products (and the second system's ingredient) must be registered components too.
    const productSpecs = [
      { name: 'Elixir of Vigor', img: 'icons/consumables/potions/potion-tube-corked-red.webp' },
      { name: 'Verdant Tonic', img: 'icons/consumables/potions/flask-corked-blue.webp' },
      { name: 'Powdered Root', img: 'icons/consumables/plants/dried-herb-bundle-brown.webp' },
      { name: 'Soothing Balm', img: 'icons/consumables/potions/bottle-round-corked-red.webp' },
      // Issue #752: the minimal alchemy-mode system's one signature — a reagent and the brew it
      // renders into.
      { name: 'Smoke Bench Reagent', img: 'icons/consumables/plants/grass-leaves-green.webp' },
      { name: 'Smoke Bench Brew', img: 'icons/consumables/potions/bottle-conical-corked-blue.webp' }
    ];
    const createdProducts = await Item.createDocuments(
      productSpecs.map((spec) => ({ name: spec.name, type: itemType, img: spec.img }))
    );
    const productByName = Object.fromEntries(createdProducts.map((item) => [item.name, item]));
    const alchemyProductItemIds = createdProducts.map((item) => item.id);

    const registerComponent = async (systemId, worldItem) => {
      const result = await csm.addItemFromUuid(systemId, worldItem.uuid);
      if (!result?.item?.id) {
        throw new Error(`Alchemy fixtures: failed to register component "${worldItem.name}"`);
      }
      return result.item.id;
    };

    // ── System 1: Bubbling Cauldron (alchemy, reuses owned components) ───────
    const cauldron = await csm.createSystem({
      name: 'Bubbling Cauldron',
      description: 'Issue #543: player alchemy workbench — combine herbs to discover brews.'
    });
    if (!cauldron?.id) throw new Error('Alchemy fixtures: Bubbling Cauldron create failed');
    const cauldronId = cauldron.id;
    await csm.updateSystem(cauldronId, {
      resolutionMode: 'alchemy',
      enabled: true,
      // Simple check mode (#554): a mandatory pass/fail check + a reserved failure
      // result set. Exercises the check-gated workbench + the failure-group authoring.
      alchemy: {
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false,
        checkMode: 'simple'
      },
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 } }
    });
    const cauldronMap = {
      'Mystic Herb': await registerComponent(cauldronId, requireWorldItem('Mystic Herb')),
      'Empty Vial': await registerComponent(cauldronId, requireWorldItem('Empty Vial')),
      'Dragon Scale': await registerComponent(cauldronId, requireWorldItem('Dragon Scale')),
      'Elixir of Vigor': await registerComponent(cauldronId, productByName['Elixir of Vigor']),
      'Verdant Tonic': await registerComponent(cauldronId, productByName['Verdant Tonic'])
    };
    const elixirRecipe = await rm.createRecipe({
      name: 'Elixir of Vigor',
      description: 'Alchemy: two mystic herbs reduce to a vigor elixir.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/potion-tube-corked-red.webp',
      ingredientSets: [{
        name: 'Herbal base',
        ingredientGroups: [{
          name: 'Mystic Herb',
          options: [{ quantity: 2, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
        }]
      }],
      resultGroups: [
        {
          name: 'Elixir',
          results: [{ componentId: cauldronMap['Elixir of Vigor'], quantity: 1 }]
        },
        {
          // Reserved failure result set (#554): produced on a failed Simple check.
          role: 'failure',
          name: '',
          results: [{ componentId: cauldronMap['Dragon Scale'], quantity: 1 }]
        }
      ]
    });
    const tonicRecipe = await rm.createRecipe({
      name: 'Verdant Tonic',
      description: 'Alchemy: one mystic herb bottled in an empty vial makes a tonic.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/flask-corked-blue.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Bottled brew',
        ingredientGroups: [
          {
            name: 'Mystic Herb',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
          },
          {
            name: 'Empty Vial',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Empty Vial'] } }]
          }
        ]
      }],
      resultGroups: [{
        name: 'Tonic',
        results: [{ componentId: cauldronMap['Verdant Tonic'], quantity: 1 }]
      }]
    });

    // ── System 2: Herbalist's Table (second alchemy discipline) ─────────────
    const herbalist = await csm.createSystem({
      name: "Herbalist's Table",
      description: "Issue #543: a second alchemy discipline so the workbench chooser offers a choice."
    });
    if (!herbalist?.id) throw new Error("Alchemy fixtures: Herbalist's Table create failed");
    const herbalistId = herbalist.id;
    await csm.updateSystem(herbalistId, {
      resolutionMode: 'alchemy',
      enabled: true,
      alchemy: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false }
    });
    const herbalistMap = {
      'Powdered Root': await registerComponent(herbalistId, productByName['Powdered Root']),
      'Soothing Balm': await registerComponent(herbalistId, productByName['Soothing Balm'])
    };
    const balmRecipe = await rm.createRecipe({
      name: 'Soothing Balm',
      description: 'Alchemy: powdered root renders into a soothing balm.',
      craftingSystemId: herbalistId,
      img: 'icons/consumables/potions/bottle-round-corked-red.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Root base',
        ingredientGroups: [{
          name: 'Powdered Root',
          options: [{ quantity: 1, match: { type: 'component', componentId: herbalistMap['Powdered Root'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Balm',
        results: [{ componentId: herbalistMap['Soothing Balm'], quantity: 1 }]
      }]
    });

    // The minimal alchemy-mode system whose Crafting → Settings surface the manager
    // alchemy-settings capture photographs (demonstrating #736's #713 half).
    const bench = await csm.createSystem({
      name: 'Smoke Alchemy Bench',
      description: 'Issue #752: minimal alchemy-mode system for the manager alchemy-settings capture.'
    });
    if (!bench?.id) throw new Error('Alchemy fixtures: Smoke Alchemy Bench create failed');
    const benchId = bench.id;
    await csm.updateSystem(benchId, {
      resolutionMode: 'alchemy',
      enabled: true,
      // `checkMode: 'simple'` is load-bearing for the manager alchemy-settings capture, not
      // decoration.
      alchemy: {
        checkMode: 'simple',
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false
      }
    });
    const benchMap = {
      'Smoke Bench Reagent': await registerComponent(benchId, productByName['Smoke Bench Reagent']),
      'Smoke Bench Brew': await registerComponent(benchId, productByName['Smoke Bench Brew'])
    };
    const benchRecipe = await rm.createRecipe({
      name: 'Smoke Bench Brew',
      description: 'Alchemy: one reagent renders into a bench brew.',
      craftingSystemId: benchId,
      img: 'icons/consumables/potions/bottle-conical-corked-blue.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Reagent base',
        ingredientGroups: [{
          name: 'Smoke Bench Reagent',
          options: [{ quantity: 1, match: { type: 'component', componentId: benchMap['Smoke Bench Reagent'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brew',
        results: [{ componentId: benchMap['Smoke Bench Brew'], quantity: 1 }]
      }]
    });

    // Every recipe must have been created enabled (createRecipe throws on an
    // invalid alchemy shape; a disabled recipe would drop its system from the
    // chooser since the listing filters `{ enabled: true }`).
    const alchemyRecipes = [elixirRecipe, tonicRecipe, balmRecipe, benchRecipe];
    for (const recipe of alchemyRecipes) {
      if (!recipe?.id) throw new Error('Alchemy fixtures: recipe create returned no id');
      if (recipe.enabled !== true) {
        throw new Error(
          `Alchemy fixtures: recipe "${recipe.name}" was not created enabled ` +
          `(invalid alchemy shape or signature collision)`
        );
      }
    }

    return {
      alchemySystemIds: [cauldronId, herbalistId, benchId],
      cauldronSystemId: cauldronId,
      herbalistSystemId: herbalistId,
      benchSystemId: benchId,
      alchemyRecipeIds: alchemyRecipes.map((recipe) => recipe.id),
      alchemyProductItemIds,
      alchemyComponentMap: { [cauldronId]: cauldronMap, [herbalistId]: herbalistMap, [benchId]: benchMap }
    };
  }, { crafterId });
}

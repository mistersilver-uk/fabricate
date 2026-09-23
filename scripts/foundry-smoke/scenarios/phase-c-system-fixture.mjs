/** Seed the smoke world's systems, components, essences, recipes, tools, environments and interactables — everything phases D0 and E walk. */

export async function seedSmokeCraftingSystem(page, { gathererUserId, crafterId, travelMemberId }) {
  return page.evaluate(
    async ({ gathererUserId, crafterId, travelMemberId }) => {
      const csm = game.fabricate.getCraftingSystemManager();

      // The world currency ladder (issue 1278).
      await game.settings.set('fabricate', 'currencyConfig', {
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins', contains: [] },
          {
            id: 'sp',
            label: 'Silver',
            abbreviation: 'sp',
            icon: 'fa-solid fa-coins',
            contains: [],
          },
        ],
      });
      await game.fabricate.getCurrencyConfigStore?.()?.load?.();

      // Create the crafting system
      const system = await csm.createSystem({
        name: 'Arcane Forge',
        description:
          'A mystical forge capable of transmuting raw materials into powerful artifacts.',
      });
      const systemId = system.id;
      const azureGroveScene = await Scene.create({
        name: 'Fabricate Azure Grove Scene',
        active: false,
        background: { src: 'icons/consumables/plants/leaf-herb-green.webp' },
      });

      // Register all 7 world items as managed components
      const worldItems = game.items.contents;
      const worldItemByName = Object.fromEntries(worldItems.map((item) => [item.name, item]));
      const componentMap = {};
      for (const item of worldItems) {
        const result = await csm.addItemFromUuid(systemId, item.uuid);
        componentMap[item.name] = result.item.id;
      }
      for (const componentId of Object.values(componentMap)) {
        await csm.updateItem(systemId, componentId, { difficulty: 1 });
      }

      await csm.updateSystem(systemId, {
        // `routedByCheck` resolution allows multiple ingredient/result sets, so the recipe editor
        // shows the "Add ingredient set" promotion affordance (recipeCanAddSet gates on a mode
        // NOT in ['simple','progressive'] and not alchemy).
        resolutionMode: 'routedByCheck',
        features: {
          essences: true,
          gathering: true,
          multiStepRecipes: true,
          itemTags: true,
          recipeCategories: true,
        },
        // Salvage is always on; pick routed mode + named outcome tiers so the
        // component editor's salvage section shows populated outcome routing (#436).
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: {
          enabled: true,
          routed: {
            type: 'relative',
            rollFormula: '1d20',
            dc: 12,
            thresholdMode: 'meet',
            relativeOutcomes: [
              {
                id: 'salvage-clean',
                name: 'Clean Salvage',
                success: true,
                breakTools: false,
                dc: 6,
              },
              {
                id: 'salvage-partial',
                name: 'Partial Salvage',
                success: true,
                breakTools: false,
                dc: 0,
              },
              { id: 'salvage-botched', name: 'Botched', success: false, breakTools: true, dc: -6 },
            ],
          },
        },
        // Crafting check with routed outcome tiers, so a check-routed recipe's result groups can
        // be assigned outcome tiers (`checkOutcomeIds`).
        craftingCheck: {
          enabled: true,
          // Per-recipe check-modifier catalogue + default policy (issue 770).
          checkModifiers: [
            {
              id: 'med',
              label: 'Medicine',
              icon: 'fas fa-staff-snake',
              expression: '@abilities.wis.mod',
            },
            {
              id: 'alch',
              label: 'Alchemy',
              icon: 'fas fa-flask',
              expression: '@abilities.int.mod',
            },
            {
              id: 'herb',
              label: 'Herbalism',
              icon: 'fas fa-seedling',
              expression: '@abilities.dex.mod',
            },
          ],
          // `playerPicks` on the system (issue 1055), and it must stay there or this seed stops
          // working.
          defaultModifierPolicy: 'playerPicks',
          defaultModifierIds: ['med', 'herb'],
          // `maxModifierPicks: 2` — the size of the eligible set above, so it bounds nothing and
          // the prompt renders its MULTI-pick checkbox group ("Pick up to 2") rather than the
          // historical pick-one radio group.
          maxModifierPicks: 2,
          routed: {
            type: 'relative',
            // `1d20 + 20` (base total 21-40, plus a small ability mod) always meets the Masterwork
            // threshold, so the Phase-E Brew Healing Potion craft deterministically succeeds.
            rollFormula: '1d20 + 20',
            dc: 12,
            thresholdMode: 'meet',
            relativeOutcomes: [
              {
                id: 'craft-masterwork',
                name: 'Masterwork',
                success: true,
                breakTools: false,
                dc: 5,
              },
              { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
              { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 },
            ],
          },
        },
        // System-level gathering check with named routed outcome tiers, so the
        // Checks tab's gathering editor renders populated when the gathering
        // economy is set to routed for the screenshot (#437).
        gatheringCraftingCheck: {
          enabled: true,
          routed: {
            type: 'relative',
            rollFormula: '1d20',
            dc: 12,
            thresholdMode: 'meet',
            relativeOutcomes: [
              {
                id: 'gather-bountiful',
                name: 'Bountiful Harvest',
                success: true,
                breakTools: false,
                dc: 5,
              },
              { id: 'gather-harvest', name: 'Harvest', success: true, breakTools: false, dc: 0 },
              { id: 'gather-spoiled', name: 'Spoiled', success: false, breakTools: false, dc: -5 },
            ],
          },
        },
        itemTags: ['rare', 'reagent', 'metallic'],
        // Two authored recipe categories, so the library's group-by-category treatment is
        // exercised with more than one group. A single "General" bucket proves nothing about
        // grouping (issue 643).
        categories: ['Alchemy', 'Smithing'],
        // Participation only. The unit LADDER is world scope since issue 1278 and is seeded
        // as the `currencyConfig` world setting below, which is what gives the currency-cost
        // requirement row a unit to target.
        requirements: {
          currency: { enabled: true },
        },
        // Character prerequisites moved to the WORLD `characterLibraries` setting
        // alongside modifiers (issue 1308/1311) — seeded below, next to the modifier
        // library, rather than on this system-scoped payload. See the comment there.
        essenceDefinitions: [
          {
            name: 'Verdant',
            description: 'The essence of growth, renewal, and living roots.',
            icon: 'fas fa-leaf',
            sourceItemUuid: worldItemByName['Mystic Herb']?.uuid ?? null,
          },
          {
            name: 'Restorative',
            description: 'The essence of mending, resilience, and recovery.',
            icon: 'fas fa-heart',
            sourceItemUuid: worldItemByName['Healing Potion']?.uuid ?? null,
          },
          {
            name: 'Toxic',
            description: 'The essence of venom, corruption, and dangerous decay.',
            icon: 'fas fa-skull-crossbones',
            sourceItemUuid: null,
          },
          {
            name: 'Volatile',
            description: 'The essence of sparks, heat, and unstable reactions.',
            icon: 'fas fa-bolt',
            sourceItemUuid: null,
          },
          {
            name: 'Positive',
            description: 'The essence of radiance, blessing, and warm light.',
            icon: 'fas fa-sun',
            sourceItemUuid: null,
          },
          {
            name: 'Negative',
            description: 'The essence of shadow, concealment, and entropy.',
            icon: 'fas fa-moon',
            sourceItemUuid: null,
          },
        ],
      });

      // Give Iron Ore a routed salvage configuration so the component editor's
      // salvage section renders populated result groups + outcome routing (#436).
      await csm.updateItem(systemId, componentMap['Iron Ore'], {
        salvage: {
          enabled: true,
          ingredientQuantity: 1,
          resultGroups: [
            {
              id: 'scrap',
              name: 'Scrap',
              results: [{ id: 'scrap-result', componentId: componentMap['Iron Ore'], quantity: 1 }],
            },
            {
              id: 'intact',
              name: 'Intact Parts',
              results: [
                { id: 'intact-result', componentId: componentMap['Iron Sword'], quantity: 1 },
              ],
            },
          ],
          outcomeRouting: { 'Clean Salvage': 'intact', 'Partial Salvage': 'scrap' },
        },
      });

      // Iron Sword gets authored salvage results with `enabled` absent (issue 676).
      await csm.updateItem(systemId, componentMap['Iron Sword'], {
        salvage: {
          ingredientQuantity: 1,
          resultGroups: [
            {
              id: 'sword-scrap',
              name: 'Sword Scrap',
              results: [
                { id: 'sword-scrap-result', componentId: componentMap['Iron Ore'], quantity: 2 },
              ],
            },
          ],
        },
      });

      // Create 3 recipes
      const rm = game.fabricate.getRecipeManager();

      const recipe1 = await rm.createRecipe({
        name: 'Forge Iron Sword',
        description: 'Hammer iron ore into a sturdy blade.',
        craftingSystemId: systemId,
        img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
        // routedByCheck routes by the check outcome; this single-result-group recipe
        // is produced on any non-failure outcome (the single-group exemption), so no
        // outcome/tier mapping is needed. The routed modes ignore `resultSelection`.
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Iron Ore',
                options: [
                  {
                    quantity: 2,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] },
                  },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Forged Weapon',
            results: [
              {
                componentId: componentMap['Iron Sword'],
                quantity: 1,
              },
            ],
          },
        ],
      });

      const recipe2 = await rm.createRecipe({
        name: 'Brew Healing Potion',
        description: 'Combine mystic herbs and an empty vial to create a healing draught.',
        craftingSystemId: systemId,
        img: 'icons/consumables/potions/bottle-round-corked-red.webp',
        // No per-recipe `craftingModifier` (issues 856, 1055).
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Mystic Herb',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Mystic Herb'] },
                  },
                ],
              },
              {
                name: 'Empty Vial',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Empty Vial'] },
                  },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Brewed Potion',
            results: [
              {
                componentId: componentMap['Healing Potion'],
                quantity: 1,
              },
            ],
          },
        ],
      });

      // Books & Scrolls fixture (issue 796): five resolvable recipe items all linked to "Brew
      // Healing Potion", so its editor tab renders the populated auto-fill grid — the tiling and
      // specificity-cascade evidence the empty panel cannot show.
      const bookItemType = worldItemByName['Mystic Herb']?.type || 'loot';
      const bookItems = await Item.createDocuments([
        {
          name: "Mythwright Crafter's Handbook",
          type: bookItemType,
          img: 'icons/sundries/books/book-tooled-eye-gold-red.webp',
        },
        {
          name: "Alchemist's Field Notes",
          type: bookItemType,
          img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
        },
        {
          name: 'Grimoire of the Verdant Path',
          type: bookItemType,
          img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
        },
        {
          name: 'Scroll of Restorative Draughts',
          type: bookItemType,
          img: 'icons/sundries/books/book-red-exclamation.webp',
        },
        {
          name: "The Apothecary's Compendium",
          type: bookItemType,
          img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
        },
      ]);
      for (const book of bookItems) {
        const { item: bookDef } = await csm.addRecipeItemFromUuid(systemId, book.uuid);
        await csm.updateRecipeItemDefinition(systemId, bookDef.id, { recipeIds: [recipe2.id] });
      }

      const recipe3 = await rm.createRecipe({
        name: 'Craft Dragon Scale Armor',
        description: 'Forge dragon scales with iron ore into legendary armor.',
        craftingSystemId: systemId,
        img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
        // Single result group → produced on any non-failure outcome (single-group
        // exemption); the routed modes ignore `resultSelection`.
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Dragon Scale',
                options: [
                  {
                    quantity: 2,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] },
                  },
                ],
              },
              {
                name: 'Iron Ore',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] },
                  },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Crafted Armor',
            results: [
              {
                componentId: componentMap['Dragon Scale Armor'],
                quantity: 1,
              },
            ],
          },
        ],
      });

      // Showcase recipe whose one ingredient set carries every requirement row type: a plain
      // component, an OR group, a tag, an essence and a currency cost. complex:true forces the
      // full set-card render; allowIncomplete persists it as a valid editor shell.
      const showcaseRecipe = await rm.createRecipe(
        {
          name: 'Showcase Requirements',
          description:
            'Demonstrates every ingredient requirement row: component, OR group, tag, essence, and currency cost.',
          craftingSystemId: systemId,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          complex: true,
          ingredientSets: [
            {
              name: 'Primary',
              ingredientGroups: [
                {
                  name: 'Iron Ore',
                  options: [
                    {
                      quantity: 2,
                      match: { type: 'component', componentId: componentMap['Iron Ore'] },
                    },
                  ],
                },
                {
                  name: 'Catalyst (either works)',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'component', componentId: componentMap['Mystic Herb'] },
                    },
                    {
                      quantity: 1,
                      match: { type: 'component', componentId: componentMap['Dragon Scale'] },
                    },
                  ],
                },
                {
                  name: 'Any reagent',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'tags', tags: ['reagent', 'rare'], tagMatch: 'any' },
                    },
                  ],
                },
                // An essence requirement (issue 684): a first-class essence match (issue 649) with
                // its own end-of-row Stepper.
                {
                  name: 'Verdant essence',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'essence', essenceId: 'verdant', amount: 2 },
                    },
                  ],
                },
                {
                  name: 'Gold cost',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'currency', unit: 'gp', amount: 100 },
                    },
                  ],
                },
              ],
            },
          ],
          resultGroups: [
            {
              name: 'Showcase Result',
              results: [
                {
                  componentId: componentMap['Healing Potion'],
                  quantity: 1,
                },
              ],
            },
          ],
        },
        { allowIncomplete: true }
      );

      // Multi-step recipe so the Overview steps accordion shows the per-step duration controls
      // (data-recipe-step-time chips + the duration editor).
      const multiStepRecipe = await rm.createRecipe(
        {
          name: 'Multi-Step Alloy',
          description: 'A two-step recipe to showcase the steps accordion and per-step durations.',
          craftingSystemId: systemId,
          img: 'icons/commodities/metal/ingot-stack-steel.webp',
          // Each step has a single result group → produced on any non-failure outcome (the
          // single-group exemption is evaluated per step); routed modes ignore `resultSelection`.
          steps: [
            {
              name: 'Smelt Ore',
              ingredientSets: [
                {
                  name: 'Ore',
                  ingredientGroups: [
                    {
                      name: 'Iron Ore',
                      options: [
                        {
                          quantity: 2,
                          match: { type: 'component', componentId: componentMap['Iron Ore'] },
                        },
                      ],
                    },
                  ],
                },
              ],
              resultGroups: [
                {
                  name: 'Molten Iron',
                  results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }],
                },
              ],
              timeRequirement: { hours: 2, minutes: 30 },
            },
            {
              name: 'Forge Blade',
              ingredientSets: [
                {
                  name: 'Blade',
                  ingredientGroups: [
                    {
                      name: 'Dragon Scale',
                      options: [
                        {
                          quantity: 1,
                          match: { type: 'component', componentId: componentMap['Dragon Scale'] },
                        },
                      ],
                    },
                  ],
                },
              ],
              resultGroups: [
                {
                  name: 'Finished Blade',
                  results: [{ componentId: componentMap['Dragon Scale Armor'], quantity: 1 }],
                },
              ],
              timeRequirement: { days: 1 },
            },
          ],
        },
        { allowIncomplete: true }
      );

      // Check-routed recipe deliberately authored with multiple result groups and two
      // routed-readiness gaps so the Validation tab shows both new warnings (issue 431 PR-2).
      const routedReadinessRecipe = await rm.createRecipe(
        {
          name: 'Routed Check Readiness',
          description:
            'A check-routed recipe with an unrouted result set and an unproduced outcome tier.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          complex: true,
          ingredientSets: [
            {
              name: 'Stock',
              ingredientGroups: [
                {
                  name: 'Iron Ore',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'component', componentId: componentMap['Iron Ore'] },
                    },
                  ],
                },
              ],
            },
          ],
          resultGroups: [
            {
              name: 'Standard Output',
              checkOutcomeIds: ['craft-standard'],
              results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }],
            },
            {
              // No assigned outcome tier → fires the unroutedResultGroup warning.
              name: 'Reject Pile',
              checkOutcomeIds: [],
              results: [{ componentId: componentMap['Iron Ore'], quantity: 1 }],
            },
          ],
        },
        { allowIncomplete: true }
      );

      // Every fixture recipe above is enabled, unlocked, complete and uncategorised, so the
      // library's Disabled row, Locked row, "Can't enable" pill, empty-Produces danger row and
      // category grouping had never been photographed.
      const incompleteRecipe = await rm.createRecipe(
        {
          name: 'Temper a Blade',
          description: 'Re-harden a finished blade to raise its edge retention.',
          craftingSystemId: systemId,
          img: 'icons/skills/melee/hand-grip-sword-red.webp',
          ingredientSets: [
            {
              ingredientGroups: [
                {
                  name: 'Iron Sword',
                  options: [
                    {
                      quantity: 1,
                      match: { type: 'component', componentId: componentMap['Iron Sword'] },
                    },
                  ],
                },
              ],
            },
          ],
        },
        { allowIncomplete: true }
      );
      await rm.updateRecipe(
        incompleteRecipe.id,
        { enabled: false, category: 'Smithing' },
        { allowIncomplete: true }
      );

      // A COMPLETE recipe that is locked (visible to players, GM-only to craft) — the
      // one row state the lock control writes and nothing had ever captured.
      const lockedRecipe = await rm.createRecipe({
        name: 'Quench a Blade',
        description: 'Plunge the hot blade into brine to set its temper.',
        craftingSystemId: systemId,
        img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Iron Ore',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] },
                  },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Tempered Weapon',
            results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }],
          },
        ],
      });
      await rm.updateRecipe(lockedRecipe.id, { locked: true, category: 'Smithing' });

      // Spread the existing recipes across the two authored categories so the library renders
      // three groups (Alchemy / General / Smithing), not one.
      await rm.updateRecipe(recipe1.id, { category: 'Smithing' }, { allowIncomplete: true });
      await rm.updateRecipe(recipe2.id, { category: 'Alchemy' }, { allowIncomplete: true });
      await rm.updateRecipe(
        multiStepRecipe.id,
        { category: 'Smithing' },
        { allowIncomplete: true }
      );

      // Two recipe items so the recipe-item editor's Validation tab can be captured in both an
      // all-clear and a mixed pass/block state.
      const bookType = worldItemByName['Iron Ore']?.type || 'loot';
      const [tomeItem, scrollItem] = await Item.createDocuments([
        {
          name: 'Tome of Brewing',
          type: bookType,
          img: 'icons/sundries/books/book-worn-brown.webp',
          system: {
            description: {
              value:
                '<p>A well-thumbed brewing manual that teaches its reader to brew a healing draught.</p>',
            },
          },
        },
        {
          name: 'Torn Recipe Scroll',
          type: bookType,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          system: {
            description: {
              value: '<p>A half-legible scroll whose recipe list has been torn away.</p>',
            },
          },
        },
      ]);

      // All-clear recipe item: a world item is linked (originItemUuid), a recipe is
      // linked, and learnsValid holds (learning limit off) → summary reads "All clear".
      const clearRecipeItem = (await csm.addRecipeItemFromUuid(systemId, tomeItem.uuid)).item;
      await csm.updateRecipeItemDefinition(systemId, clearRecipeItem.id, {
        recipeIds: [recipe2.id],
      });

      // Mixed recipe item: the world item is linked, but no recipe is linked, so `recipeLinked`
      // blocks while `itemLinked` and `learnsValid` pass.
      const mixedRecipeItem = (await csm.addRecipeItemFromUuid(systemId, scrollItem.uuid)).item;

      const environmentStore = game.fabricate.getGatheringEnvironmentStore();
      // Manual composition (issue 1315): the `enabledTaskIds`/`enabledEventIds` below are the
      // picked lists manual mode actually reads.
      const gatheringEnvironment = await environmentStore.create({
        craftingSystemId: systemId,
        name: 'Azure Grove',
        description: 'A tranquil grove of blue-leaved trees, rich with reagents.',
        img: 'icons/magic/nature/tree-spirit-blue.webp',
        enabled: true,
        selectionMode: 'targeted',
        compositionMode: 'manual',
        sceneUuid: azureGroveScene.uuid,
        region: 'northreach',
        biomes: ['forest', 'ruins'],
        dangerTags: ['hazardous'],
        eventSelectionMode: 'highestRankedDrop',
        eventPolicy: 'successWithEvent',
        enabledTaskIds: ['smoke-forage-library'],
        enabledEventIds: ['smoke-bramble-event'],
      });

      const playerGatheringFixtures = [];
      const playerFixtureDefinitions = [
        {
          name: 'Verdant Meadow',
          description: 'Open grassland thick with common herbs, easy to harvest.',
          img: 'icons/consumables/plants/grass-leaves-green.webp',
          enabledTaskIds: ['smoke-meadow-herbs'],
        },
        {
          name: 'Sunken Ruins',
          description: 'Half-drowned ruins where forgotten reagents still linger.',
          img: 'icons/environment/wilderness/wall-ruins.webp',
          sceneUuid: 'Scene.fabricateMissingGatheringScene',
          enabledTaskIds: ['smoke-sunken-survey'],
        },
        {
          name: 'Crystal Thicket',
          description: 'A thicket of glittering crystal fronds, perilous to harvest by hand.',
          img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
          enabledTaskIds: ['smoke-crystal-dew'],
        },
        {
          name: 'Timed Orchard',
          description: 'An orchard whose slow blooms ripen only with patience.',
          img: 'icons/consumables/fruit/apple-red-tree-green.webp',
          enabledTaskIds: ['smoke-slow-bloom'],
        },
        {
          name: 'Withered Patch',
          description: 'A blighted patch picked all but bare.',
          img: 'icons/magic/fire/flame-burning-tree-stump.webp',
          enabledTaskIds: ['smoke-withered-search'],
        },
        {
          name: 'Moonlit Blind Grove',
          description: 'A moonlit grove where harvests reveal themselves only once attempted.',
          img: 'icons/creatures/mammals/wolf-howl-moon-forest-blue.webp',
          selectionMode: 'blind',
          enabledTaskIds: ['smoke-moonpetal'],
        },
      ];
      for (const fixture of playerFixtureDefinitions) {
        const { sceneUuid = '', selectionMode = 'targeted', ...definition } = fixture;
        playerGatheringFixtures.push(
          await environmentStore.create({
            craftingSystemId: systemId,
            enabled: true,
            selectionMode,
            sceneUuid,
            compositionMode: 'manual',
            ...definition,
          })
        );
      }

      await game.settings.set('fabricate', 'gatheringConfig', {
        conditions: { weather: 'rain', timeOfDay: 'dusk' },
        systems: {
          [systemId]: {
            vocabularies: {
              regions: { values: ['northreach'] },
            },
            tasks: [
              {
                id: 'smoke-forage-library',
                name: 'Forage Wild Herbs',
                description: 'Forage the wayside for common herbs and roots.',
                img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
                enabled: true,
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                itemSelectionMode: 'highestRankedDrop',
                dropRows: [
                  {
                    id: 'smoke-drop-herb',
                    componentId: componentMap['Mystic Herb'],
                    quantity: 2,
                    dropRate: 80,
                    enabled: true,
                  },
                ],
              },
            ],
            tools: [
              {
                id: 'smoke-herbalist-sickle',
                label: 'Herbalist Sickle',
                enabled: true,
                componentId: componentMap['Herbalist Sickle'],
                requirement: { formula: '@tools.herbalism.value' },
                breakage: { mode: 'limitedUses', maxUses: 5 },
                onBreak: { mode: 'flagBroken' },
              },
              {
                // Deliberately unlabelled: a recipe references this tool so the recipe Tools tab
                // proves the component-name fallback (an unlabelled tool must show the backing
                // component's name, never a raw id).
                id: 'smoke-unlabelled-tool',
                label: '',
                enabled: true,
                componentId: componentMap['Empty Vial'],
              },
            ],
            events: [
              {
                id: 'smoke-bramble-event',
                name: 'Bramble Snare',
                description: 'Thorned brambles snare the careless gatherer.',
                img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
                enabled: true,
                dangerTags: ['hazardous'],
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                dropRate: 35,
              },
            ],
          },
        },
      });

      // Tools remain SYSTEM-OWNED; modifiers and character prerequisites are WORLD scope (issues
      // 1308/1311). This is the FIRST write to `characterLibraries`, so an object literal is safe;
      // a LATER one must read-modify-write, since `settings.set` REPLACES rather than merges.
      await csm.updateSystem(systemId, {
        tools: game.settings.get('fabricate', 'gatheringConfig')?.systems?.[systemId]?.tools || [],
      });
      await game.settings.set('fabricate', 'characterLibraries', {
        modifiers: [
          {
            id: 'smoke-mod-herbalism',
            label: 'Herbalism Training',
            icon: 'fa-solid fa-leaf',
            expression: '@skills.nature.value',
          },
          {
            id: 'smoke-mod-survival',
            label: 'Wilderness Survival',
            icon: 'fa-solid fa-campground',
            expression: '@skills.survival.value',
          },
        ],
        characterPrerequisites: [
          {
            id: 'smoke-pre-trained',
            name: 'Trained in Alchemy',
            icon: 'fa-solid fa-flask',
            path: 'skills.alchemy.rank',
            op: 'gte',
            value: 2,
          },
          {
            id: 'smoke-pre-focused',
            name: 'Focused',
            icon: 'fa-solid fa-bullseye',
            path: 'flags.focused',
            op: 'isTrue',
            value: null,
          },
        ],
      });

      // Reference the deliberately-unlabelled tool from the Brew Healing Potion
      // recipe so the recipe Tools tab demonstrates the component-name fallback.
      await rm.updateRecipe(recipe2.id, { toolIds: ['smoke-unlabelled-tool'] });

      // Seed one `fabricate.interactable` Region behaviour on the Azure Grove scene so the canvas
      // interactable config panel (Link/Unlink toggle + node editor) gets screenshot coverage in
      // Phase D0.
      const interactableTaskId = 'smoke-forage-library';
      const [interactableRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [
        {
          name: 'Fabricate Forage Node',
          shapes: [{ type: 'rectangle', x: 1000, y: 1000, width: 400, height: 400 }],
          behaviors: [
            {
              type: 'fabricate.interactable',
              system: {
                interactableType: 'gatheringTask',
                sourceUuid: `Fabricate.${systemId}.gatheringTask.${interactableTaskId}`,
                systemId,
                taskId: interactableTaskId,
                environmentId: gatheringEnvironment.id,
                taskNodeLink: 'linked',
                node: null,
              },
            },
          ],
        },
      ]);
      const interactableBehavior =
        interactableRegion?.behaviors?.find(
          (behavior) => behavior?.type === 'fabricate.interactable'
        ) ?? null;

      // Seed an unconfigured `fabricate.interactable` (issue 342): a behaviour created with an
      // empty `system`, exactly like the native Region → Behaviors "+ Add Behavior → Fabricate
      // Interactable" path.
      const [unconfiguredRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [
        {
          name: 'Fabricate Unconfigured Node',
          shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 400, height: 400 }],
          behaviors: [{ type: 'fabricate.interactable' }],
        },
      ]);
      const unconfiguredBehavior =
        unconfiguredRegion?.behaviors?.find(
          (behavior) => behavior?.type === 'fabricate.interactable'
        ) ?? null;

      // A dedicated system seeded into a deliberately broken state so the GM system-overview view
      // renders populated rows and the system-blocker banner shows (issue 429 PR-2). It carries
      // both.
      const blockedSystem = await csm.createSystem({
        name: 'Broken Workshop',
        description:
          'A system left in a broken state to demonstrate the system overview and the system-blocker banner.',
      });
      const blockedSystemId = blockedSystem.id;
      // Register two managed components so the progressive components browser shows both a set
      // difficulty and an unset ("None") value, and so the difficulty editor card has a component
      // to author against.
      const blockedComponents = [];
      for (const blockedWorldItem of game.items.contents.slice(0, 2)) {
        const added = await csm.addItemFromUuid(blockedSystemId, blockedWorldItem.uuid);
        if (added?.item?.id)
          blockedComponents.push({ id: added.item.id, name: blockedWorldItem.name });
      }
      // Progressive mode with no progressive crafting check → blocks:'system'.
      await csm.updateSystem(blockedSystemId, {
        resolutionMode: 'progressive',
        features: { gathering: true, craftingChecks: false },
        craftingCheck: { enabled: false },
      });
      // Give the first blocked component a usable progressive difficulty so the components column
      // renders a value next to the second component's "None" (and the difficulty editor card
      // opens with a seeded value).
      if (blockedComponents[0]) {
        await csm.updateItem(blockedSystemId, blockedComponents[0].id, { difficulty: 4 });
      }
      // Note: progressive mode with no crafting check rejects recipe creation ("Progressive mode
      // requires crafting checks enabled"), and a recipe created before the mode switch would be
      // deleted by the (pre-migration-first) updateSystem.

      // Seed a gathering library task that will NOT match the environment's conditions/biome,
      // then create a manual environment that explicitly includes it.
      const blockedConfig = game.settings.get('fabricate', 'gatheringConfig') || {};
      await game.settings.set('fabricate', 'gatheringConfig', {
        ...blockedConfig,
        systems: {
          ...blockedConfig.systems,
          [blockedSystemId]: {
            tasks: [
              {
                id: 'broken-stale-task',
                name: 'Phantom Harvest',
                description: 'A task that no longer matches its environment.',
                enabled: true,
                biomes: ['tundra'],
                dropRows: [],
              },
            ],
            events: [],
            tools: [],
          },
        },
      });
      const blockedEnvironment = await environmentStore.create({
        craftingSystemId: blockedSystemId,
        name: 'Forsaken Hollow',
        description: 'An environment whose only included task no longer matches it.',
        enabled: true,
        selectionMode: 'targeted',
        compositionMode: 'manual',
        biomes: ['forest'],
        enabledTaskIds: ['broken-stale-task'],
      });

      // A `visibilityMode: 'restricted'` system (issue 643 §4b).
      const restrictedSystem = await csm.createSystem({
        name: 'Warded Athenaeum',
        description:
          'A restricted system whose recipes are granted to named players and characters.',
      });
      const restrictedSystemId = restrictedSystem.id;
      const restrictedComponentIds = [];
      for (const restrictedWorldItem of game.items.contents.slice(0, 2)) {
        const added = await csm.addItemFromUuid(restrictedSystemId, restrictedWorldItem.uuid);
        if (added?.item?.id) restrictedComponentIds.push(added.item.id);
      }
      await csm.updateSystem(restrictedSystemId, { visibilityMode: 'restricted' });
      const wardedRecipe = await rm.createRecipe({
        name: 'Warded Rite',
        description: 'A rite only the warded may perform.',
        craftingSystemId: restrictedSystemId,
        img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Ward Focus',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: restrictedComponentIds[0] },
                  },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: 'Warded Sigil',
            results: [
              {
                componentId: restrictedComponentIds[1] ?? restrictedComponentIds[0],
                quantity: 1,
              },
            ],
          },
        ],
      });
      // Access-grid evidence (issue 796): the recipe editor's Access tab tiles the granted
      // characters into the same fixed three-column grid as Books & Scrolls.
      const accessGrantType = game.actors.get(crafterId)?.type || 'character';
      const accessGrantActors = await Actor.createDocuments(
        ['Seraphine the Warded', 'Brother Alden', 'Initiate Kaelen', 'Mistweaver Vane'].map(
          (name) => ({
            name,
            type: accessGrantType,
            flags: { fabricate: { smokeSeed: true, smokeSeedRole: 'access-grant' } },
          })
        )
      );
      await rm.updateRecipe(
        wardedRecipe.id,
        {
          access: {
            characterIds: [crafterId, travelMemberId, ...accessGrantActors.map((a) => a.id)].filter(
              Boolean
            ),
            playerIds: [gathererUserId].filter(Boolean),
          },
        },
        { allowIncomplete: true }
      );

      return {
        systemId,
        blockedSystemId,
        blockedComponentNames: blockedComponents.map((component) => component.name),
        blockedEnvironmentId: blockedEnvironment?.id ?? null,
        restrictedSystemId,
        restrictedRecipeName: 'Warded Rite',
        componentMap,
        recipeIds: [
          recipe1.id,
          recipe2.id,
          recipe3.id,
          showcaseRecipe.id,
          multiStepRecipe.id,
          routedReadinessRecipe.id,
          wardedRecipe.id,
        ],
        recipeItemIds: { clear: clearRecipeItem.id, mixed: mixedRecipeItem.id },
        healingPotionRecipeId: recipe2.id,
        sceneIds: [azureGroveScene.id],
        gatheringEnvironmentId: gatheringEnvironment.id,
        playerGatheringEnvironmentIds: playerGatheringFixtures.map((environment) => environment.id),
        interactable: {
          sceneId: azureGroveScene.id,
          regionId: interactableRegion?.id ?? null,
          behaviorId: interactableBehavior?.id ?? null,
        },
        unconfiguredInteractable: {
          sceneId: azureGroveScene.id,
          regionId: unconfiguredRegion?.id ?? null,
          behaviorId: unconfiguredBehavior?.id ?? null,
        },
      };
    },
    { gathererUserId, crafterId, travelMemberId }
  );
}

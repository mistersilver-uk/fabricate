/**
 * The live smoke's world seed, ported verbatim.
 *
 * COPIED, NOT WRITTEN. Every line between the BEGIN/END markers below is lifted unchanged from
 * `scripts/foundry-test-run.mjs` — the four blocks that build the smoke world's crafting systems,
 * components, recipes, tools, gathering library and inventories through the real Fabricate API.
 * Replaying them against the View Lab's real facade reproduces the smoke's DATA exactly, which is
 * what makes a frame-for-frame comparison meaningful rather than approximate.
 *
 * They are copies because `foundry-test-run.mjs` is a browser-context script Node cannot import,
 * and these are the only parts of it the lab needs. `tests/view-lab-smoke-seed-drift.test.js` pins
 * every copy to its original by digest AND by byte comparison, so they cannot diverge silently.
 *
 * Call them in the smoke's own order — see `world/labWorld.js`.
 */

/** sha256 of each copied body, asserted against the harness by the drift test. */
export const SMOKE_SEED_DIGESTS = Object.freeze({
  "seedSmokeWorldDocuments": "2b20341840c816e57e14abaae009c65fd4be985060577495c810b798e3acc570",
  "seedSmokeCraftingSetup": "a5b6d24d22cfff661aa1ac80a32b6b5f552282ccbd84c1b21c9a4c2b1469f21c",
  "seedSmokeGatheringLibrary": "e6280af8643c3f79a915ab68417943478c97b644ab5a81a57b756b7a97b03532",
  "seedSmokeExecutionFixtures": "99434e6299035ad90aa835c819ca4df39c6c8dbd609892f1fb2942ac3b764fd0",
  "renameSmokePrimarySystem": "f8014f806979eded9628c4c235f02e165f5357913bf9a5b6a94be23a34e2b229"
});

/**
 * The world items every later block builds on — Iron Ore, Mystic Herb, Dragon Scale and the
 * rest — plus the crafter inventory copies that make craftability real.
 *
 * Source: scripts/foundry-test-run.mjs lines 6684-6958
 *
 * @param {object} context Exactly what the smoke passes in.
 * @returns {Promise<*>} Exactly what the smoke's block returns.
 */
export async function seedSmokeWorldDocuments() {
  // ── BEGIN VERBATIM COPY: seedSmokeWorldDocuments ──
        // Clean up any stale test data from previous runs.
        // 1. Clean stale crafting systems and their recipes first.
        //    Filter by literal "Arcane Forge" name so we never delete user
        //    state. The CI world (`fabricate-smoke-ci`) is wiped and
        //    recopied by setup-data on every up, so this should be a no-op
        //    in normal runs; the filter is belt-and-suspenders defence
        //    against a partial mid-run crash that left a renamed system
        //    around — those are still recoverable by the literal-name
        //    rename-back at the end of Phase D0.
        const csm = game.fabricate.getCraftingSystemManager();
        const rm = game.fabricate.getRecipeManager();
        const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();

        // Defensively clear all gathering environments before recreating fixtures.
        // The CI world is meant to be wiped each run, but a reused (cached) Foundry
        // container can resurrect a world's LevelDB state that the host-side wipe in
        // foundry-setup-data.mjs misses. Stale environments authored by an older data
        // model can lack a task source (e.g. compositionMode 'automatic' with no
        // enabledTaskIds and no forcedTaskIds) and then fail validation on the FIRST
        // create() in Phase C — its persist re-validates the whole list, including the
        // stale invalid entries. We reset the raw setting directly (bypassing the
        // store's list-validation, which would itself throw on those stale entries)
        // and reload so the in-memory list matches. The CI world is smoke-owned and
        // ephemeral, so clearing every environment here is safe.
        if (environmentStore) {
          try {
            await game.settings.set('fabricate', 'gatheringEnvironments', []);
            environmentStore.load?.();
          } catch (err) {
            console.warn(`Failed to reset gathering environments: ${err?.message}`);
          }
        }

        const allSystems = csm.getSystems();
        // The smoke creates "Arcane Forge" and RENAMES it to "The Herbalist's
        // Compendium" mid-run (Phase D0). A run that crashes after the rename but
        // before cleanup leaves an orphan under the renamed name, so purge BOTH
        // names — otherwise duplicate same-named systems accumulate and the promote
        // source picker can default to a tool-less duplicate.
        const staleSystemNames = new Set([
          'Arcane Forge', "The Herbalist's Compendium",
          // Issue #489 craft-execution coverage systems (deterministic names) so a
          // crashed local run does not accumulate duplicate same-named systems.
          'Smoke Simple Forge', 'Smoke Ingredient Router', 'Smoke Check Router',
          'Smoke Progressive Forge'
        ]);
        const staleSystems = allSystems.filter(s => staleSystemNames.has(s.name));
        for (const sys of staleSystems) {
          console.log(`Cleaning stale crafting system: ${sys.name} (${sys.id})`);
          try { await environmentStore?.cleanupByCraftingSystem?.(sys.id); } catch { /* ok */ }
          const recipes = rm.getRecipes?.({ craftingSystemId: sys.id }) ?? [];
          for (const r of recipes) {
            try { await rm.deleteRecipe(r.id); } catch { /* ok */ }
          }
          try { await csm.deleteSystem(sys.id); } catch { /* ok */ }
        }

        // 2. Clear stale smoke-world chat before any later phase opens the chat
        //    sidebar. Old crafting cards retain image URLs from the product version
        //    that created them; allowing them to render makes an otherwise clean run
        //    fail the zero-console-error gate on obsolete asset 404s.
        const staleMessages = game.messages?.contents ?? [];
        if (staleMessages.length > 0) {
          console.log(`Cleaning ${staleMessages.length} stale smoke chat messages`);
          await ChatMessage.deleteDocuments(staleMessages.map(message => message.id));
        }

        // 3. Clean stale smoke actors (tagged flags.fabricate.smokeSeed) so the
        //    per-run re-import of the dnd5e Starter Heroes pack stays idempotent.
        const staleActors = game.actors.contents.filter(a => a.flags?.fabricate?.smokeSeed === true);
        if (staleActors.length > 0) {
          console.log(`Cleaning ${staleActors.length} stale smoke actors`);
          await Actor.deleteDocuments(staleActors.map(a => a.id));
        }

        const staleUsers = game.users.contents.filter(u =>
          ['Fabricate Gatherer', 'Fabricate Observer'].includes(u.name)
        );
        if (staleUsers.length > 0) {
          console.log(`Cleaning ${staleUsers.length} stale test users`);
          await User.deleteDocuments(staleUsers.map(u => u.id));
        }

        // 4. Clean stale items (the fixed smoke set plus the issue #489
        //    craft-execution world items, all uniquely 'Smoke '-prefixed).
        const staleItems = game.items.contents.filter(i =>
          ['Iron Ore', 'Mystic Herb', 'Dragon Scale', 'Empty Vial',
           'Iron Sword', 'Healing Potion', 'Dragon Scale Armor'].includes(i.name)
          || (typeof i.name === 'string' && i.name.startsWith('Smoke '))
        );
        if (staleItems.length > 0) {
          console.log(`Cleaning ${staleItems.length} stale test items`);
          await Item.deleteDocuments(staleItems.map(i => i.id));
        }

        const staleScenes = game.scenes.contents.filter(scene =>
          ['Fabricate Azure Grove Scene'].includes(scene.name)
        );
        if (staleScenes.length > 0) {
          console.log(`Cleaning ${staleScenes.length} stale test scenes`);
          await Scene.deleteDocuments(staleScenes.map(scene => scene.id));
        }

        // Discover valid document types — try multiple Foundry API locations
        // V13: game.documentTypes.Item, V12: game.system.documentTypes.Item
        const rawItemTypes = game.documentTypes?.Item
          ?? game.system?.documentTypes?.Item
          ?? game.system?.template?.Item?.types
          ?? [];
        const rawActorTypes = game.documentTypes?.Actor
          ?? game.system?.documentTypes?.Actor
          ?? game.system?.template?.Actor?.types
          ?? [];
        const itemTypes = Array.from(rawItemTypes);
        const actorTypes = Array.from(rawActorTypes);
        console.log('Available item types:', JSON.stringify(itemTypes));
        console.log('Available actor types:', JSON.stringify(actorTypes));

        // Use 'loot' for all items — safest common type across D&D 5e versions
        const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

        // Create world-level items (all as loot — type doesn't matter for crafting).
        //
        // Each carries a DESCRIPTION (issue 676). These items had none, so every frame
        // of the component editor photographed its identity strip rendering "—" — the
        // correct output for a description-less item, and therefore a frame that proved
        // nothing about the surface whose whole premise is "name, image & description
        // follow the linked item". The strip reads the LIVE document, so this is also
        // what exercises that resolution rather than the registration-time snapshot.
        // `system.description.value` is the dnd5e shape and is HTML, which is exactly
        // what the plain-text extraction has to cope with.
        const describe = (html) => ({ description: { value: `<p>${html}</p>` } });
        const itemData = [
          { name: 'Iron Ore', type: itemType, img: 'icons/commodities/metal/ingot-worn-iron.webp',
            system: describe('Unrefined metal, dug from a hillside and still carrying the grit of the seam it came from. Smelt it before you trust it to hold an edge.') },
          { name: 'Mystic Herb', type: itemType, img: 'icons/consumables/plants/leaf-herb-green.webp',
            system: describe('A pungent leaf that keeps its colour long after cutting.') },
          { name: 'Dragon Scale', type: itemType, img: 'icons/commodities/leather/scales-blue-white.webp',
            system: describe('Shed plate, still faintly warm to the touch.') },
          { name: 'Empty Vial', type: itemType, img: 'icons/consumables/potions/vial-cork-empty.webp',
            system: describe('Cheap, corked glass. Holds a single dose.') },
          { name: 'Iron Sword', type: itemType, img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
            system: describe('A serviceable blade with a worn brass guard.') },
          { name: 'Herbalist Sickle', type: itemType, img: 'icons/tools/hand/sickle-worn-steel-grey.webp',
            system: describe('A short curved blade for taking cuttings without crushing them.') },
          { name: 'Healing Potion', type: itemType, img: 'icons/consumables/potions/potion-tube-corked-red.webp',
            system: describe('Tastes of iron and cloves.') },
          { name: 'Dragon Scale Armor', type: itemType, img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
            system: describe('Overlapping plate, light for its bulk.') }
        ];

        const items = await Item.createDocuments(itemData);
        console.log(`Created ${items.length} items:`, items.map(i => `${i.name} (${i.type})`).join(', '));

        const itemIds = items.map(i => i.id);
        const itemsByName = {};
        for (const item of items) {
          itemsByName[item.name] = { id: item.id, uuid: item.uuid };
        }

        // Import the dnd5e "Starter Heroes" pack so demo actors use official,
        // non-AI art shipped with the game system instead of bundled portraits.
        // Each imported hero is tagged flags.fabricate.smokeSeed for the
        // idempotent pre-clean above; sorting by name gives a deterministic
        // crafter / travel-member assignment and a stable demo character.
        const heroPack = game.packs.get('dnd5e.heroes')
          ?? game.packs.find(p => p.documentName === 'Actor' && /hero/i.test(p.metadata?.label ?? ''));
        if (!heroPack) {
          throw new Error('dnd5e Starter Heroes compendium (dnd5e.heroes) not found — cannot seed smoke actors.');
        }
        const heroIndex = await heroPack.getIndex();
        // R1 (#750): TWO-ACTOR CONTRACT. Phase B references only actors[0]
        // (crafter) and actors[1] (travelMember); importing the whole Starter
        // Heroes pack cost ~30-45s for actors nothing asserts. Sort the INDEX by
        // name first (the same order the post-import sort produced), then import
        // just the first two character entries — this preserves the exact
        // crafter / travel-member identity while skipping the rest. Raise this
        // cap if a future step needs a third seeded hero.
        const sortedHeroEntries = Array.from(heroIndex)
          .slice()
          .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en'));
        const importedHeroes = [];
        for (const entry of sortedHeroEntries) {
          if (entry.type && entry.type !== 'character') continue;
          const actor = await game.actors.importFromCompendium(heroPack, entry._id);
          if (actor?.type === 'character') importedHeroes.push(actor);
          if (importedHeroes.length >= 2) break;
        }
        if (importedHeroes.length === 0) {
          throw new Error('dnd5e Starter Heroes compendium contained no character actors.');
        }
        await Actor.updateDocuments(importedHeroes.map(a => ({ _id: a.id, 'flags.fabricate.smokeSeed': true })));
        const actors = importedHeroes.slice().sort((a, b) => a.name.localeCompare(b.name, 'en'));
        console.log(`Imported ${actors.length} dnd5e Starter Heroes:`, actors.map(a => a.name).join(', '));
        const actorIds = actors.map(a => a.id);

        const crafter = actors[0];
        const travelMember = actors[1] ?? null;
        // Remember the crafter as the default gathering actor so the player-app
        // screenshots deterministically show the same demo character.
        try { await game.fabricate.setSelectedGatheringActorId(crafter.id); } catch { /* best effort */ }
        const testUserData = [
          { name: 'Fabricate Gatherer', role: CONST.USER_ROLES.PLAYER, password: '' },
          { name: 'Fabricate Observer', role: CONST.USER_ROLES.PLAYER, password: '' }
        ];
        const existingTestUsers = game.users.contents.filter(user =>
          testUserData.some(data => data.name === user.name)
        );
        const missingTestUsers = testUserData.filter(data =>
          !existingTestUsers.some(user => user.name === data.name)
        );
        const users = existingTestUsers.concat(
          missingTestUsers.length > 0 ? await User.createDocuments(missingTestUsers) : []
        );
        const gathererUser = users.find(user => user.name === 'Fabricate Gatherer');
        const observerUser = users.find(user => user.name === 'Fabricate Observer');
        const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const noneLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
        await crafter.update({ ownership: { default: noneLevel, [gathererUser.id]: ownerLevel } });
        if (travelMember) await travelMember.update({ ownership: { default: noneLevel } });
        // "Who controls this character" is a UNION of two independent routes: the
        // viewer holds Foundry OWNER on the actor, OR the actor is that user's
        // ASSIGNED character (`User#character`). The crafter covers the OWNER route
        // (above). Nothing in the smoke world ever assigned a character, so the
        // assigned route had no fixture at all — assign the travel member to the
        // Observer, and the restricted recipe rail can render both sublines.
        if (travelMember && observerUser) {
          await observerUser.update({ character: travelMember.id });
        }
        const userIds = users.map(user => user.id);

        // Build inventory copies from world items
        // Include flags.core.sourceId so the crafting engine can match
        // embedded items back to world-level component UUIDs
        const byName = (name) => {
          const item = items.find(i => i.name === name);
          if (!item) throw new Error(`Item "${name}" not found in created items`);
          return item;
        };
        const copies = (item, qty) =>
          Array.from({ length: qty }, () => ({
            name: item.name,
            type: item.type,
            img: item.img,
            flags: { core: { sourceId: item.uuid } }
          }));

        // Crafter gets: 3x Mystic Herb, 3x Empty Vial, 1x Dragon Scale.
        // The UI evidence phases share this actor and may stage one vial in another
        // workflow. Keep two concrete copies for the final potion attempt so one
        // can be consumed while a distinct physical copy remains the reusable Tool.
        await crafter.createEmbeddedDocuments('Item', [
          ...copies(byName('Mystic Herb'), 3),
          ...copies(byName('Empty Vial'), 3),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        // Travel-party member gets: 3x Iron Ore, 1x Dragon Scale
        if (travelMember) {
          await travelMember.createEmbeddedDocuments('Item', [
            ...copies(byName('Iron Ore'), 3),
            ...copies(byName('Dragon Scale'), 1)
          ]);
        }

        return {
          itemIds,
          actorIds,
          userIds,
          gathererUserId: gathererUser.id,
          observerUserId: observerUser?.id ?? null,
          crafterId: crafter.id,
          travelMemberId: travelMember?.id ?? null,
          itemsByName
        };
  // ── END VERBATIM COPY: seedSmokeWorldDocuments ──
}

/**
 * The primary crafting system, Broken Workshop, Warded Athenaeum, scenes, regions, recipes,
 * recipe items and gathering environments.
 *
 * Source: scripts/foundry-test-run.mjs lines 7092-8075
 *
 * @param {object} context Exactly what the smoke passes in.
 * @returns {Promise<*>} Exactly what the smoke's block returns.
 */
export async function seedSmokeCraftingSetup({ gathererUserId, crafterId, travelMemberId }) {
  // ── BEGIN VERBATIM COPY: seedSmokeCraftingSetup ──
        const csm = game.fabricate.getCraftingSystemManager();

        // Create the crafting system
        const system = await csm.createSystem({
          name: 'Arcane Forge',
          description: 'A mystical forge capable of transmuting raw materials into powerful artifacts.'
        });
        const systemId = system.id;
        const azureGroveScene = await Scene.create({
          name: 'Fabricate Azure Grove Scene',
          active: false,
          background: { src: 'icons/consumables/plants/leaf-herb-green.webp' }
        });

        // Register all 7 world items as managed components
        const worldItems = game.items.contents;
        const worldItemByName = Object.fromEntries(worldItems.map(item => [item.name, item]));
        const componentMap = {};
        for (const item of worldItems) {
          const result = await csm.addItemFromUuid(systemId, item.uuid);
          componentMap[item.name] = result.item.id;
        }
        for (const componentId of Object.values(componentMap)) {
          await csm.updateItem(systemId, componentId, { difficulty: 1 });
        }

        await csm.updateSystem(systemId, {
          // `routedByCheck` resolution allows multiple ingredient/result sets, so the
          // recipe editor shows the "Add ingredient set" promotion affordance
          // (recipeCanAddSet gates on a mode NOT in ['simple','progressive'] and not
          // alchemy). Complexity is emergent from the set/group count — there is no
          // Simple/Complex toggle. Under this system mode every recipe routes
          // by the routed crafting-check outcome, and a single-result-group recipe is
          // produced on any non-failure outcome (the single-group exemption). The
          // authored `craftingCheck.routed.rollFormula` below means no missing-formula
          // blocker. multiStepRecipes unlocks the step-mode toggle and the per-step
          // duration controls; itemTags unlocks the tag-requirement picker;
          // recipeCategories unlocks the category selector.
          resolutionMode: 'routedByCheck',
          features: {
            essences: true,
            gathering: true,
            multiStepRecipes: true,
            itemTags: true,
            recipeCategories: true
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
                { id: 'salvage-clean', name: 'Clean Salvage', success: true, breakTools: false, dc: 6 },
                { id: 'salvage-partial', name: 'Partial Salvage', success: true, breakTools: false, dc: 0 },
                { id: 'salvage-botched', name: 'Botched', success: false, breakTools: true, dc: -6 }
              ]
            }
          },
          // Crafting check with routed outcome tiers, so a check-routed recipe's
          // result groups can be assigned outcome tiers (`checkOutcomeIds`). The
          // success-filtered tiers ('Masterwork', 'Standard') feed the recipe
          // editor's result-routing control AND the Validation tab's routed
          // readiness warnings (issue 431 PR-2).
          craftingCheck: {
            enabled: true,
            // Per-recipe check-modifier catalogue + default policy (issue 770). A
            // crafting-owned aggregate feeding the `@craftingmod` formula placeholder,
            // authored at the top level of the crafting check (sibling of `routed`), so
            // the Checks → Crafting tab renders the populated CraftingModifierCatalogueCard
            // beside the failure-consumption card (screenshot evidence). Each expression
            // resolves against the crafter's dnd5e roll data; the `highest` default policy
            // picks the single largest of the two default-eligible modifiers. The `alch`
            // entry is the one the Brew Healing Potion recipe override selects below.
            checkModifiers: [
              { id: 'med', label: 'Medicine', icon: 'fas fa-staff-snake', expression: '@abilities.wis.mod' },
              { id: 'alch', label: 'Alchemy', icon: 'fas fa-flask', expression: '@abilities.int.mod' },
              { id: 'herb', label: 'Herbalism', icon: 'fas fa-seedling', expression: '@abilities.dex.mod' }
            ],
            defaultModifierPolicy: 'highest',
            defaultModifierIds: ['med', 'herb'],
            routed: {
              type: 'relative',
              // `1d20 + 20 + @craftingmod` (base total 21-40, plus a small ability mod) always
              // meets the Masterwork threshold, so the Phase-E Brew Healing Potion craft
              // deterministically succeeds. `@craftingmod` resolves to a scalar BEFORE the
              // formula reaches Foundry's Roll (issue 770): the recipe's `byRecipe` override
              // uses only the `alch` modifier (a starter-hero INT mod, roughly -1..+3), which
              // the +20 base absorbs. Before #431 the routed check was authored-only (never
              // rolled); now that it is engine-evaluated a bare `1d20` vs dc 12 would fail the
              // craft ~55% of the time (flaky smoke). The named tiers below are unchanged so
              // the routed-check and validation-tab captures still render their authored outcomes.
              rollFormula: '1d20 + 20 + @craftingmod',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
                { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
                { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
              ]
            }
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
                { id: 'gather-bountiful', name: 'Bountiful Harvest', success: true, breakTools: false, dc: 5 },
                { id: 'gather-harvest', name: 'Harvest', success: true, breakTools: false, dc: 0 },
                { id: 'gather-spoiled', name: 'Spoiled', success: false, breakTools: false, dc: -5 }
              ]
            }
          },
          // Two currency units so the currency-cost requirement row can target a unit.
          itemTags: ['rare', 'reagent', 'metallic'],
          // Two authored recipe categories, so the library's group-by-category treatment
          // is exercised with MORE THAN ONE group. A single "General" bucket proves
          // nothing about grouping (issue 643).
          //
          // The key is `categories`, NOT `recipeCategories`: `_normalizeSystem` reads
          // `system.categories` (CraftingSystemManager.js), while `recipeCategories` at
          // system level is the FEATURE-FLAG BOOLEAN. One name, two meanings, and no
          // alias between them — so the array seeded under the flag's name was silently
          // discarded and this fixture had zero authored categories for as long as the
          // seed has existed, leaving issue 643's grouping treatment unexercised.
          categories: ['Alchemy', 'Smithing'],
          requirements: {
            currency: {
              enabled: true,
              units: [
                { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' },
                { id: 'sp', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins' }
              ]
            }
          },
          // Two character prerequisites so the System Settings Character
          // Prerequisites list renders populated for the issue-768 list-ergonomics
          // evidence (section collapse, copy-to-modifiers).
          characterPrerequisites: [
            { id: 'smoke-pre-trained', name: 'Trained in Alchemy', icon: 'fa-solid fa-flask', path: 'skills.alchemy.rank', op: 'gte', value: 2 },
            { id: 'smoke-pre-focused', name: 'Focused', icon: 'fa-solid fa-bullseye', path: 'flags.focused', op: 'isTrue', value: null }
          ],
          essenceDefinitions: [
            {
              name: 'Verdant',
              description: 'The essence of growth, renewal, and living roots.',
              icon: 'fas fa-leaf',
              sourceItemUuid: worldItemByName['Mystic Herb']?.uuid ?? null
            },
            {
              name: 'Restorative',
              description: 'The essence of mending, resilience, and recovery.',
              icon: 'fas fa-heart',
              sourceItemUuid: worldItemByName['Healing Potion']?.uuid ?? null
            },
            {
              name: 'Toxic',
              description: 'The essence of venom, corruption, and dangerous decay.',
              icon: 'fas fa-skull-crossbones',
              sourceItemUuid: null
            },
            {
              name: 'Volatile',
              description: 'The essence of sparks, heat, and unstable reactions.',
              icon: 'fas fa-bolt',
              sourceItemUuid: null
            },
            {
              name: 'Positive',
              description: 'The essence of radiance, blessing, and warm light.',
              icon: 'fas fa-sun',
              sourceItemUuid: null
            },
            {
              name: 'Negative',
              description: 'The essence of shadow, concealment, and entropy.',
              icon: 'fas fa-moon',
              sourceItemUuid: null
            }
          ]
        });

        // Give Iron Ore a routed salvage configuration so the component editor's
        // salvage section renders populated result groups + outcome routing (#436).
        await csm.updateItem(systemId, componentMap['Iron Ore'], {
          salvage: {
            enabled: true,
            ingredientQuantity: 1,
            resultGroups: [
              { id: 'scrap', name: 'Scrap', results: [{ id: 'scrap-result', componentId: componentMap['Iron Ore'], quantity: 1 }] },
              { id: 'intact', name: 'Intact Parts', results: [{ id: 'intact-result', componentId: componentMap['Iron Sword'], quantity: 1 }] }
            ],
            outcomeRouting: { 'Clean Salvage': 'intact', 'Partial Salvage': 'scrap' }
          }
        });

        // Iron Sword gets authored salvage results with `enabled` ABSENT (issue 676).
        // This is the state decision 6 guarantees EVERY existing world will show — the
        // per-component gate defaults false and no migration seeds it — so without this
        // fixture no frame captures the collapsed/OFF salvage body at all: the rest of
        // the fixture authors `enabled: true` throughout.
        await csm.updateItem(systemId, componentMap['Iron Sword'], {
          salvage: {
            ingredientQuantity: 1,
            resultGroups: [
              { id: 'sword-scrap', name: 'Sword Scrap', results: [{ id: 'sword-scrap-result', componentId: componentMap['Iron Ore'], quantity: 2 }] }
            ]
          }
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
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 2,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Forged Weapon',
            results: [{
              componentId: componentMap['Iron Sword'],
              quantity: 1
            }]
          }]
        });

        const recipe2 = await rm.createRecipe({
          name: 'Brew Healing Potion',
          description: 'Combine mystic herbs and an empty vial to create a healing draught.',
          craftingSystemId: systemId,
          img: 'icons/consumables/potions/bottle-round-corked-red.webp',
          // Per-recipe check-modifier override (issue 770): this recipe overrides the
          // system's `highest` default policy with `byRecipe`, drawing only the `alch`
          // catalogue modifier into `@craftingmod`. It renders the recipe editor's
          // Overview modifier control in its OVERRIDE (not inherit) state — the
          // screenshot evidence for the per-recipe override half of #770.
          craftingModifier: { policy: 'byRecipe', modifierIds: ['alch'] },
          // Single result group → produced on any non-failure outcome. The Phase-E
          // craft rolls `1d20 + 20 + @craftingmod` (always Masterwork), so this craft
          // deterministically succeeds and yields the single "Brewed Potion" group.
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Mystic Herb',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                }]
              },
              {
                name: 'Empty Vial',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Empty Vial'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Brewed Potion',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        });

        // Books & Scrolls fixture (issue 796): seed FIVE resolvable book/scroll recipe
        // items and link them all to "Brew Healing Potion" so its Books & Scrolls editor
        // tab renders the POPULATED auto-fill grid — the tiling + specificity-cascade
        // evidence the empty "Not in any book or scroll" panel cannot show. Five cards
        // wrap past the editor's ~four-track row, proving the grid fills the panel and
        // wraps rather than stretching one card. Real world Items back each definition so
        // `fromUuid` resolves a live thumb/name instead of the missing-state row. These
        // are created AFTER the component-registration loop above, so they never enter
        // `componentMap`. The `-` covers the (0,3,0) grid rule vs the shared flex rule.
        // Every img below is a Foundry-core raster confirmed to resolve (no 404s in the
        // smoke console-error gate); `blueprint-recipe-alchemical` is the shared default
        // recipe image every recipe frame already loads.
        const bookItemType = worldItemByName['Mystic Herb']?.type || 'loot';
        const bookItems = await Item.createDocuments([
          { name: "Mythwright Crafter's Handbook", type: bookItemType, img: 'icons/sundries/books/book-tooled-eye-gold-red.webp' },
          { name: "Alchemist's Field Notes", type: bookItemType, img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp' },
          { name: 'Grimoire of the Verdant Path', type: bookItemType, img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp' },
          { name: 'Scroll of Restorative Draughts', type: bookItemType, img: 'icons/sundries/books/book-red-exclamation.webp' },
          { name: "The Apothecary's Compendium", type: bookItemType, img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp' }
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
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Dragon Scale',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                }]
              },
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Crafted Armor',
            results: [{
              componentId: componentMap['Dragon Scale Armor'],
              quantity: 1
            }]
          }]
        });

        // Showcase recipe whose single ingredient set exercises every requirement row
        // type so the Ingredients tab renders: a plain component, an OR group (one
        // group with two component options), a tag requirement, an essence requirement,
        // and a currency cost.
        // complex:true forces the full set-card render; allowIncomplete persists it as a
        // structurally-valid editor shell. Single result group → produced on any
        // non-failure outcome (single-group exemption); routed modes ignore resultSelection.
        const showcaseRecipe = await rm.createRecipe({
          name: 'Showcase Requirements',
          description: 'Demonstrates every ingredient requirement row: component, OR group, tag, essence, and currency cost.',
          craftingSystemId: systemId,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          complex: true,
          ingredientSets: [{
            name: 'Primary',
            ingredientGroups: [
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              },
              {
                name: 'Catalyst (either works)',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                  },
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }
                ]
              },
              {
                name: 'Any reagent',
                options: [{
                  quantity: 1,
                  match: { type: 'tags', tags: ['reagent', 'rare'], tagMatch: 'any' }
                }]
              },
              // An essence requirement (issue 684): a first-class essence match (issue
              // 649) with its own end-of-row Stepper. `verdant` is the derived id of the
              // "Verdant" essence seeded on this system (the normalizer slugs the name via
              // `_uniqueKey`). This row sits directly above the currency cost so the
              // `manager-recipe-edit-ingredients-cost` capture — which scrolls the LAST
              // (currency) row into view — shows BOTH the essence and currency rows.
              {
                name: 'Verdant essence',
                options: [{
                  quantity: 1,
                  match: { type: 'essence', essenceId: 'verdant', amount: 2 }
                }]
              },
              {
                name: 'Gold cost',
                options: [{
                  quantity: 1,
                  match: { type: 'currency', unit: 'gp', amount: 100 }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Showcase Result',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        }, { allowIncomplete: true });

        // Multi-step recipe so the Overview steps accordion shows the per-step duration
        // controls (data-recipe-step-time chips + the duration editor). Each step owns its
        // own ingredient sets, result groups, and timeRequirement.
        const multiStepRecipe = await rm.createRecipe({
          name: 'Multi-Step Alloy',
          description: 'A two-step recipe to showcase the steps accordion and per-step durations.',
          craftingSystemId: systemId,
          img: 'icons/commodities/metal/ingot-stack-steel.webp',
          // Each step has a single result group → produced on any non-failure outcome
          // (the single-group exemption is evaluated per step); routed modes ignore
          // `resultSelection`.
          steps: [
            {
              name: 'Smelt Ore',
              ingredientSets: [{
                name: 'Ore',
                ingredientGroups: [{
                  name: 'Iron Ore',
                  options: [{
                    quantity: 2,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Molten Iron',
                results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
              }],
              timeRequirement: { hours: 2, minutes: 30 }
            },
            {
              name: 'Forge Blade',
              ingredientSets: [{
                name: 'Blade',
                ingredientGroups: [{
                  name: 'Dragon Scale',
                  options: [{
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Finished Blade',
                results: [{ componentId: componentMap['Dragon Scale Armor'], quantity: 1 }]
              }],
              timeRequirement: { days: 1 }
            }
          ]
        }, { allowIncomplete: true });

        // Check-routed recipe deliberately authored with MULTIPLE result groups and
        // two routed-readiness gaps so the Validation tab shows BOTH new warnings
        // (issue 431 PR-2). The warnings now gate on the SYSTEM mode (routedByCheck),
        // not a per-recipe provider, and fire only for multi-result-group steps:
        //  - 'Reject Pile' carries no assigned outcome tier (empty checkOutcomeIds) →
        //    `unroutedResultGroup` (a result set the check can never route to);
        //  - the system's 'Masterwork' success tier is produced by no group →
        //    `unproducedOutcomeTier` (a check outcome that yields nothing).
        // allowIncomplete keeps the gappy draft savable; routed modes ignore resultSelection.
        const routedReadinessRecipe = await rm.createRecipe({
          name: 'Routed Check Readiness',
          description: 'A check-routed recipe with an unrouted result set and an unproduced outcome tier.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          complex: true,
          ingredientSets: [{
            name: 'Stock',
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [
            {
              name: 'Standard Output',
              checkOutcomeIds: ['craft-standard'],
              results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
            },
            {
              // No assigned outcome tier → fires the unroutedResultGroup warning.
              name: 'Reject Pile',
              checkOutcomeIds: [],
              results: [{ componentId: componentMap['Iron Ore'], quantity: 1 }]
            }
          ]
        }, { allowIncomplete: true });

        // ── Recipe-library row states (issue 643) ────────────────────────────────
        // Every fixture recipe above is enabled, unlocked, complete and uncategorised,
        // so the library's Disabled row, Locked row, "Can't enable" pill, empty-Produces
        // danger row and category grouping had NEVER been photographed. These two seed
        // the missing states rather than mutating a recipe another phase depends on.
        //
        // 'Temper a Blade' carries an ingredient set but NO result groups: structurally
        // sound (an empty result group would fail structure — this omits the group entirely),
        // so `validateStructure()` passes while `validate()` fails, which is exactly the
        // `_isRecipeIncomplete` predicate. Being OFF, the row reads "Can't enable" — enabling
        // it would be refused. The edits carry `allowIncomplete` because the merged recipe is
        // still an incomplete shell.
        const incompleteRecipe = await rm.createRecipe({
          name: 'Temper a Blade',
          description: 'Re-harden a finished blade to raise its edge retention.',
          craftingSystemId: systemId,
          img: 'icons/skills/melee/hand-grip-sword-red.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Sword',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Sword'] }
              }]
            }]
          }]
        }, { allowIncomplete: true });
        await rm.updateRecipe(incompleteRecipe.id, { enabled: false, category: 'Smithing' }, { allowIncomplete: true });

        // A COMPLETE recipe that is locked (visible to players, GM-only to craft) — the
        // one row state the lock control writes and nothing had ever captured.
        const lockedRecipe = await rm.createRecipe({
          name: 'Quench a Blade',
          description: 'Plunge the hot blade into brine to set its temper.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Tempered Weapon',
            results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
          }]
        });
        await rm.updateRecipe(lockedRecipe.id, { locked: true, category: 'Smithing' });

        // Spread the existing recipes across the two authored categories so the library
        // renders THREE groups (Alchemy / General / Smithing), not one. `allowIncomplete`
        // keeps a category edit from re-gating an already-savable draft on completeness.
        await rm.updateRecipe(recipe1.id, { category: 'Smithing' }, { allowIncomplete: true });
        await rm.updateRecipe(recipe2.id, { category: 'Alchemy' }, { allowIncomplete: true });
        await rm.updateRecipe(multiStepRecipe.id, { category: 'Smithing' }, { allowIncomplete: true });

        // ── Books & Scrolls recipe items (issue 797) ─────────────────────────────
        // Two recipe items so the recipe-item editor's Validation tab can be captured in
        // BOTH an all-clear and a mixed pass/block state. Arcane Forge leaves
        // `visibilityMode` at its 'knowledge' default, so the mode-specific check row is
        // `learnsValid`. The two linked world items are created HERE, AFTER the
        // component-registration loop above, so they are NOT registered as components and
        // do not disturb the components-browser frames.
        const bookType = worldItemByName['Iron Ore']?.type || 'loot';
        const [tomeItem, scrollItem] = await Item.createDocuments([
          {
            name: 'Tome of Brewing',
            type: bookType,
            img: 'icons/sundries/books/book-worn-brown.webp',
            system: { description: { value: '<p>A well-thumbed brewing manual that teaches its reader to brew a healing draught.</p>' } }
          },
          {
            name: 'Torn Recipe Scroll',
            type: bookType,
            img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
            system: { description: { value: '<p>A half-legible scroll whose recipe list has been torn away.</p>' } }
          }
        ]);

        // All-clear recipe item: a world item is linked (originItemUuid), a recipe is
        // linked, and learnsValid holds (learning limit off) → summary reads "All clear".
        const clearRecipeItem = (await csm.addRecipeItemFromUuid(systemId, tomeItem.uuid)).item;
        await csm.updateRecipeItemDefinition(systemId, clearRecipeItem.id, { recipeIds: [recipe2.id] });

        // Mixed recipe item: the world item is linked, but NO recipe is linked, so
        // `recipeLinked` BLOCKS while `itemLinked` and `learnsValid` pass. One frame then
        // shows a PASS row AND a BLOCK row together with the blocked medallion and both
        // non-zero count tiles (issue 797, decision 7). Left with its default empty
        // `recipeIds`, so no update is needed.
        const mixedRecipeItem = (await csm.addRecipeItemFromUuid(systemId, scrollItem.uuid)).item;

        const environmentStore = game.fabricate.getGatheringEnvironmentStore();
        const gatheringEnvironment = await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Azure Grove',
          description: 'A tranquil grove of blue-leaved trees, rich with reagents.',
          img: 'icons/magic/nature/tree-spirit-blue.webp',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: azureGroveScene.uuid,
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          dangerTags: ['hazardous'],
          eventSelectionMode: 'highestRankedDrop',
          eventPolicy: 'successWithEvent',
          enabledTaskIds: ['smoke-forage-library'],
          enabledEventIds: ['smoke-bramble-event']
        });

        const playerGatheringFixtures = [];
        const playerFixtureDefinitions = [
          {
            name: 'Verdant Meadow',
            description: 'Open grassland thick with common herbs, easy to harvest.',
            img: 'icons/consumables/plants/grass-leaves-green.webp',
            forcedTaskIds: ['smoke-meadow-herbs']
          },
          {
            name: 'Sunken Ruins',
            description: 'Half-drowned ruins where forgotten reagents still linger.',
            img: 'icons/environment/wilderness/wall-ruins.webp',
            sceneUuid: 'Scene.fabricateMissingGatheringScene',
            forcedTaskIds: ['smoke-sunken-survey']
          },
          {
            name: 'Crystal Thicket',
            description: 'A thicket of glittering crystal fronds, perilous to harvest by hand.',
            img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
            forcedTaskIds: ['smoke-crystal-dew']
          },
          {
            name: 'Timed Orchard',
            description: 'An orchard whose slow blooms ripen only with patience.',
            img: 'icons/consumables/fruit/apple-red-tree-green.webp',
            forcedTaskIds: ['smoke-slow-bloom']
          },
          {
            name: 'Withered Patch',
            description: 'A blighted patch picked all but bare.',
            img: 'icons/magic/fire/flame-burning-tree-stump.webp',
            forcedTaskIds: ['smoke-withered-search']
          },
          {
            name: 'Moonlit Blind Grove',
            description: 'A moonlit grove where harvests reveal themselves only once attempted.',
            img: 'icons/creatures/mammals/wolf-howl-moon-forest-blue.webp',
            selectionMode: 'blind',
            forcedTaskIds: ['smoke-moonpetal']
          }
        ];
        for (const fixture of playerFixtureDefinitions) {
          const { sceneUuid = '', selectionMode = 'targeted', ...definition } = fixture;
          playerGatheringFixtures.push(await environmentStore.create({
            craftingSystemId: systemId,
            enabled: true,
            selectionMode,
            sceneUuid,
            compositionMode: 'manual',
            ...definition
          }));
        }

        await game.settings.set('fabricate', 'gatheringConfig', {
          conditions: { weather: 'rain', timeOfDay: 'dusk' },
          systems: {
            [systemId]: {
              vocabularies: {
                regions: { values: ['northreach'] }
              },
              // Two character modifiers so the System Settings Character Modifiers
              // list renders populated for the issue-768 list-ergonomics evidence
              // (icon picker, section collapse, copy-to-prerequisites).
              characterModifiers: [
                { id: 'smoke-mod-herbalism', label: 'Herbalism Training', icon: 'fa-solid fa-leaf', expression: '@skills.nature.value' },
                { id: 'smoke-mod-survival', label: 'Wilderness Survival', icon: 'fa-solid fa-campground', expression: '@skills.survival.value' }
              ],
              tasks: [{
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
                dropRows: [{
                  id: 'smoke-drop-herb',
                  componentId: componentMap['Mystic Herb'],
                  quantity: 2,
                  dropRate: 80,
                  enabled: true
                }]
              }],
              tools: [{
                id: 'smoke-herbalist-sickle',
                label: 'Herbalist Sickle',
                enabled: true,
                componentId: componentMap['Herbalist Sickle'],
                requirement: { formula: '@tools.herbalism.value' },
                breakage: { mode: 'limitedUses', maxUses: 5 },
                onBreak: { mode: 'flagBroken' }
              }, {
                // Deliberately unlabelled: a recipe references this tool so the
                // recipe Tools tab proves the component-name fallback (an
                // unlabelled tool must show the backing component's name, never a
                // raw id).
                id: 'smoke-unlabelled-tool',
                label: '',
                enabled: true,
                componentId: componentMap['Empty Vial']
              }],
              events: [{
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
                dropRate: 35
              }]
            }
          }
        });

        // Tools are SYSTEM-OWNED (the `craftingSystems` setting) — the Tools
        // manager and the gathering tool gate read getSystem(id).tools, not
        // gatheringConfig. Mirror the canonical persist so the manager Tools view
        // renders and tool-blocked tasks resolve their requirement.
        await csm.updateSystem(systemId, {
          tools: game.settings.get('fabricate', 'gatheringConfig')?.systems?.[systemId]?.tools || []
        });

        // Reference the deliberately-unlabelled tool from the Brew Healing Potion
        // recipe so the recipe Tools tab demonstrates the component-name fallback.
        await rm.updateRecipe(recipe2.id, { toolIds: ['smoke-unlabelled-tool'] });

        // Seed one `fabricate.interactable` Region behaviour on the Azure Grove
        // scene so the canvas interactable config panel (Link/Unlink toggle +
        // node editor) gets screenshot coverage in Phase D0. It is bound to the
        // reusable GM library gathering task (`smoke-forage-library`) and the
        // Azure Grove environment, linked by default (taskNodeLink: 'linked',
        // node: null). The synthetic sourceUuid mirrors buildInteractableSourceUuid
        // (`Fabricate.<systemId>.gatheringTask.<taskId>`). The Region is embedded
        // in the scene, so Phase F's scene cleanup removes it — no extra cleanup.
        const interactableTaskId = 'smoke-forage-library';
        const [interactableRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Forage Node',
          shapes: [{ type: 'rectangle', x: 1000, y: 1000, width: 400, height: 400 }],
          behaviors: [{
            type: 'fabricate.interactable',
            system: {
              interactableType: 'gatheringTask',
              sourceUuid: `Fabricate.${systemId}.gatheringTask.${interactableTaskId}`,
              systemId,
              taskId: interactableTaskId,
              environmentId: gatheringEnvironment.id,
              taskNodeLink: 'linked',
              node: null
            }
          }]
        }]);
        const interactableBehavior = interactableRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        // Seed an UNCONFIGURED `fabricate.interactable` (issue 342): a behaviour
        // created with an EMPTY `system`, exactly like the native Region → Behaviors
        // "+ Add Behavior → Fabricate Interactable" path. The schema `initial`s make
        // it instantiate VALID (no DataModelValidationError) and born unconfigured +
        // inert. The config panel's "Needs configuration" identity section is
        // captured against this one. Embedded in the scene → cleaned up with it.
        const [unconfiguredRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Unconfigured Node',
          shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 400, height: 400 }],
          behaviors: [{ type: 'fabricate.interactable' }]
        }]);
        const unconfiguredBehavior = unconfiguredRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        // A dedicated system seeded into a deliberately BROKEN state so the GM
        // system-overview view renders populated rows and the system-blocker
        // banner shows (issue 429 PR-2). It carries BOTH:
        //   - a live system-blocker: progressive resolution mode with no
        //     progressive crafting check configured (blocks:'system'); and
        //   - an entity-level issue: an incomplete recipe with no result group
        //     (a recipe readiness issue that surfaces in the overview).
        const blockedSystem = await csm.createSystem({
          name: 'Broken Workshop',
          description: 'A system left in a broken state to demonstrate the system overview and the system-blocker banner.'
        });
        const blockedSystemId = blockedSystem.id;
        // Register two managed components so the progressive components browser
        // shows BOTH a set difficulty and an unset ("None") value, and so the
        // difficulty editor card has a component to author against. Difficulty is
        // assigned after the progressive mode switch (below).
        const blockedComponents = [];
        for (const blockedWorldItem of game.items.contents.slice(0, 2)) {
          const added = await csm.addItemFromUuid(blockedSystemId, blockedWorldItem.uuid);
          if (added?.item?.id) blockedComponents.push({ id: added.item.id, name: blockedWorldItem.name });
        }
        // Progressive mode with NO progressive crafting check → blocks:'system'.
        // The aggregator's `progressiveNoCheck` blocker only fires when
        // `checksEnabled` is false, i.e. neither `features.craftingChecks` nor
        // `craftingCheck.enabled` is set. A freshly-created system normalizes both
        // to false, but disable the crafting check EXPLICITLY here so the blocker
        // is guaranteed regardless of any future default change. Gathering is
        // enabled so the broken system also carries a TASK-kind issue (below) that
        // deep-links to its owning environment.
        await csm.updateSystem(blockedSystemId, {
          resolutionMode: 'progressive',
          features: { gathering: true, craftingChecks: false },
          craftingCheck: { enabled: false }
        });
        // Give the first blocked component a usable progressive difficulty so the
        // components column renders a value next to the second component's "None"
        // (and the difficulty editor card opens with a seeded value). This clears
        // the progressiveNoDifficulty blocker but leaves progressiveNoCheck, so the
        // system-overview blocker captures below are unaffected.
        if (blockedComponents[0]) {
          await csm.updateItem(blockedSystemId, blockedComponents[0].id, { difficulty: 4 });
        }
        // NOTE: progressive mode with no crafting check rejects recipe creation
        // ("Progressive mode requires crafting checks enabled"), and a recipe created
        // before the mode switch would be deleted by the (pre-migration-first)
        // updateSystem. So the broken system carries no recipe; its overview rows are
        // the system-level blocker (above) plus the stale gathering task (below) — which
        // is exactly the populated state both captures need.

        // Seed a gathering library task that will NOT match the environment's
        // conditions/biome, then create a MANUAL environment that explicitly
        // includes it. A manually-included-but-non-matching task is classified
        // `includedButUnavailable`, which surfaces a `staleIncluded` TASK-kind
        // issue in the overview — exercising the task/event deep-link (which must
        // resolve to the OWNING environment id, not the task record id).
        const blockedConfig = game.settings.get('fabricate', 'gatheringConfig') || {};
        await game.settings.set('fabricate', 'gatheringConfig', {
          ...blockedConfig,
          systems: {
            ...(blockedConfig.systems || {}),
            [blockedSystemId]: {
              tasks: [{
                id: 'broken-stale-task',
                name: 'Phantom Harvest',
                description: 'A task that no longer matches its environment.',
                enabled: true,
                biomes: ['tundra'],
                dropRows: []
              }],
              events: [],
              tools: []
            }
          }
        });
        const blockedEnvironment = await environmentStore.create({
          craftingSystemId: blockedSystemId,
          name: 'Forsaken Hollow',
          description: 'An environment whose only included task no longer matches it.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'manual',
          biomes: ['forest'],
          enabledTaskIds: ['broken-stale-task']
        });

        // A `visibilityMode: 'restricted'` system (issue 643 §4b). The recipe
        // editor's context rail is MODE-CONDITIONAL: `restricted` shows who the
        // recipe is granted to, `item`/`knowledge` shows the books teaching it. The
        // smoke world had no restricted system, no access grant and no assigned
        // character, so the access branch could not be captured at all — a run would
        // silently screenshot the Books & Scrolls branch instead and the PR evidence
        // would show the wrong rail.
        const restrictedSystem = await csm.createSystem({
          name: 'Warded Athenaeum',
          description: 'A restricted system whose recipes are granted to named players and characters.'
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
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Ward Focus',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: restrictedComponentIds[0] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Warded Sigil',
            results: [{
              componentId: restrictedComponentIds[1] ?? restrictedComponentIds[0],
              quantity: 1
            }]
          }]
        });
        // Access-grid evidence (issue 796): the recipe editor's Access tab tiles the
        // granted characters into the SAME fixed three-column grid as Books & Scrolls.
        // The two NAMED characters below reach their controllers by DIFFERENT routes —
        // the crafter via Foundry OWNER ownership, the travel member via `User#character`
        // assignment — so the `controlledBy` union is exercised; but two cards fill only
        // part of one row. Seed four more resolvable grant-only characters so the list
        // holds six, wrapping the three-column grid to two rows and proving it fills the
        // panel. They are `smokeSeed`-flagged so cleanup removes them and are never
        // referenced by the craft/gather steps (which key off the crafter/travel ids).
        // They also carry `smokeSeedRole = 'access-grant'` (#816) so grant-only
        // actors are distinguishable from the two hero fixtures; cleanup still keys
        // solely on `smokeSeed === true`, so both cohorts are torn down.
        const accessGrantType = game.actors.get(crafterId)?.type || 'character';
        const accessGrantActors = await Actor.createDocuments(
          ['Seraphine the Warded', 'Brother Alden', 'Initiate Kaelen', 'Mistweaver Vane'].map((name) => ({
            name,
            type: accessGrantType,
            flags: { fabricate: { smokeSeed: true, smokeSeedRole: 'access-grant' } }
          }))
        );
        await rm.updateRecipe(
          wardedRecipe.id,
          {
            access: {
              characterIds: [crafterId, travelMemberId, ...accessGrantActors.map((a) => a.id)].filter(Boolean),
              playerIds: [gathererUserId].filter(Boolean)
            }
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
          recipeIds: [recipe1.id, recipe2.id, recipe3.id, showcaseRecipe.id, multiStepRecipe.id, routedReadinessRecipe.id, wardedRecipe.id],
          recipeItemIds: { clear: clearRecipeItem.id, mixed: mixedRecipeItem.id },
          healingPotionRecipeId: recipe2.id,
          sceneIds: [azureGroveScene.id],
          gatheringEnvironmentId: gatheringEnvironment.id,
          playerGatheringEnvironmentIds: playerGatheringFixtures.map(environment => environment.id),
          interactable: {
            sceneId: azureGroveScene.id,
            regionId: interactableRegion?.id ?? null,
            behaviorId: interactableBehavior?.id ?? null
          },
          unconfiguredInteractable: {
            sceneId: azureGroveScene.id,
            regionId: unconfiguredRegion?.id ?? null,
            behaviorId: unconfiguredBehavior?.id ?? null
          }
        };
  // ── END VERBATIM COPY: seedSmokeCraftingSetup ──
}

/**
 * The gathering vocabularies, tasks, events and conditions for the primary system.
 *
 * Source: scripts/foundry-test-run.mjs lines 2647-2830
 *
 * @param {object} context Exactly what the smoke passes in.
 * @returns {Promise<*>} Exactly what the smoke's block returns.
 */
export async function seedSmokeGatheringLibrary({ sysId, componentMap }) {
  // ── BEGIN VERBATIM COPY: seedSmokeGatheringLibrary ──
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.conditions = { ...(config.conditions || {}), weather: 'rain', timeOfDay: 'dusk' };
    config.systems = config.systems || {};
    const systemConfig = config.systems[sysId] || {};
    const withoutIds = (entries, ids) => (Array.isArray(entries) ? entries : [])
      .filter(entry => !ids.has(String(entry?.id || '')));
    config.systems[sysId] = {
      ...systemConfig,
      // System-level GatheringRules: a non-'never' reveal policy is required for
      // the blind environment card to surface the "(x/y)" discovered teaser.
      // There is no environment-level reveal override — reveal is system-scoped.
      rules: {
        ...(systemConfig.rules || {}),
        revealPolicy: 'onAttempt'
      },
      vocabularies: {
        ...(systemConfig.vocabularies || {}),
        regions: { values: ['northreach'] }
      },
      tasks: [
        ...withoutIds(systemConfig.tasks, new Set([
          'smoke-forage-library',
          'smoke-meadow-herbs', 'smoke-sunken-survey', 'smoke-crystal-dew',
          'smoke-slow-bloom', 'smoke-withered-search', 'smoke-moonpetal'
        ])),
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
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{
            id: 'smoke-drop-herb',
            componentId: componentMap['Mystic Herb'],
            quantity: 2,
            dropRate: 80,
            enabled: true
          }]
        },
        // Player-gathering scenario library tasks. Each player environment fixture
        // below force-includes one of these via compositionMode 'manual' +
        // forcedTaskIds. region 'meadowlands' keeps them from matching the automatic
        // Azure Grove / GM fixtures (northreach / no region); no weather/timeOfDay
        // constraint keeps them available. Library tasks are d100 drop-row gathers —
        // the per-scenario "state" (success / scene-block / tool-block / timed /
        // empty / blind) comes from the environment config or the drop-rate, since
        // progressive/check/catalyst/failure task resolution no longer exists.
        {
          id: 'smoke-meadow-herbs', name: 'Gather Meadow Herbs',
          description: 'Pick fresh herbs from the open meadow.',
          img: 'icons/consumables/plants/fern-sprig-stem-leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-meadow-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 90, enabled: true }]
        },
        {
          id: 'smoke-sunken-survey', name: 'Survey Sunken Reagents',
          description: 'Wade the flooded ruins for reagents settled in the silt.',
          img: 'icons/environment/wilderness/wall-ruins.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-sunken-drop', componentId: componentMap['Iron Ore'], quantity: 1, dropRate: 70, enabled: true }]
        },
        {
          id: 'smoke-crystal-dew', name: 'Bottle Crystal Dew',
          description: "Cut dew-laden crystal fronds with a herbalist's sickle.",
          img: 'icons/consumables/potions/flask-corked-blue.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{ id: 'smoke-crystal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-slow-bloom', name: 'Tend Slow Bloom',
          description: 'Tend the slow bloom until it ripens.',
          img: 'icons/commodities/flowers/lily-bloom.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
          dropRows: [{ id: 'smoke-bloom-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-withered-search', name: 'Search Withered Patch',
          description: 'Pick over a blighted patch for anything still growing.',
          img: 'icons/consumables/plants/dried-herb-bundle-brown.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-withered-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 0, enabled: true }]
        },
        {
          id: 'smoke-moonpetal', name: 'Secret Moonpetal Harvest',
          description: 'Harvest moonpetals that open only by night.',
          img: 'icons/commodities/flowers/lotus-white.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-moonpetal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 70, enabled: true }]
        }
      ],
      tools: [
        ...withoutIds(systemConfig.tools, new Set(['smoke-herbalist-sickle'])),
        {
          id: 'smoke-herbalist-sickle',
          label: 'Herbalist Sickle',
          enabled: true,
          componentId: componentMap['Herbalist Sickle'],
          requirement: { formula: '@tools.herbalism.value' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ],
      events: [
        ...withoutIds(systemConfig.events, new Set(['smoke-bramble-event'])),
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
          dropRate: 35
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    // Tools are SYSTEM-OWNED (the `craftingSystems` setting). The Tools manager
    // (`getSystem(id).tools` → `enterToolsDraft`) and the gathering tool gate read
    // tools from the crafting system, NOT from gatheringConfig (the 0.7.0
    // reconciliation only runs at world-load, not after a later seed). Persist the
    // seeded library tools onto the crafting system so the Tools view renders the
    // row and tool-blocked gathering tasks resolve their requirement.
    await game.fabricate.getCraftingSystemManager()?.updateSystem?.(sysId, {
      tools: Array.isArray(config.systems?.[sysId]?.tools) ? config.systems[sysId].tools : []
    });

    // Seed two environment-store fixtures so the player Gathering tab frame
    // exercises both the locked teaser path and the blind chip + "(x/y)"
    // discovered suffix:
    //  - smoke-blind-grove   : enabled + selectionMode 'blind'. With the
    //    system rules.revealPolicy === 'onAttempt' above, its card shows the
    //    mask chip and the "(discovered/total)" suffix.
    //  - smoke-locked-hollow : enabled === false. For non-GM players this would
    //    render as a greyed locked teaser; the smoke run is GM, so it renders as
    //    a full listing (locked teasers are player-only and unit-test-covered).
    // Idempotent: the function runs twice in Phase D0, so skip ids already
    // present in the store. Imagery MUST use Foundry-core icon paths that exist
    // in the smoke Foundry version — a missing path 404s on every render and
    // trips the console-error gate (these reuse icons proven to load in-run).
    const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
    if (environmentStore) {
      const existingIds = new Set((environmentStore.list?.() || []).map(env => String(env?.id || '')));
      if (!existingIds.has('smoke-blind-grove')) {
        await environmentStore.create({
          id: 'smoke-blind-grove',
          craftingSystemId: sysId,
          name: 'Shrouded Grove',
          description: 'A fog-veiled grove where the harvest is never certain until tried.',
          img: 'icons/magic/nature/tree-spirit-green.webp',
          enabled: true,
          selectionMode: 'blind',
          region: 'northreach',
          biomes: ['forest'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
      if (!existingIds.has('smoke-locked-hollow')) {
        await environmentStore.create({
          id: 'smoke-locked-hollow',
          craftingSystemId: sysId,
          name: 'Sealed Barrow',
          description: 'A hollow sealed against trespass, not yet open to gatherers.',
          img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
          enabled: false,
          selectionMode: 'targeted',
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
    }
  // ── END VERBATIM COPY: seedSmokeGatheringLibrary ──
}

/**
 * The four Smoke* systems - simple, routed-by-ingredients, routed-by-check and progressive -
 * with their components, recipes, tools and crafter inventory.
 *
 * Source: scripts/foundry-test-run.mjs lines 2877-3861
 *
 * @param {object} context Exactly what the smoke passes in.
 * @returns {Promise<*>} Exactly what the smoke's block returns.
 */
export async function seedSmokeExecutionFixtures({ arcaneSystemId, mysticHerbComponentId, crafterId }) {
  // ── BEGIN VERBATIM COPY: seedSmokeExecutionFixtures ──
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Execution fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // ── 1. World items ──────────────────────────────────────────────────────
    const worldSpecs = [
      // simple system
      { name: 'Smoke Plank', img: 'icons/commodities/wood/lumber-stack.webp' },
      { name: 'Smoke Crate', img: 'icons/containers/boxes/box-gift-white.webp' },
      { name: 'Smoke Mallet', img: 'icons/tools/hand/hammer-cobbler-steel.webp' },
      { name: 'Smoke Toy', img: 'icons/commodities/wood/blocks-cut-brown.webp' },
      { name: 'Smoke Chisel', img: 'icons/tools/hand/chisel-steel-brown.webp' },
      { name: 'Smoke Dowel', img: 'icons/commodities/wood/lumber-plank-brown.webp' },
      { name: 'Smoke Anvil', img: 'icons/tools/smithing/anvil.webp' },
      { name: 'Smoke Bracket', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Relic', img: 'icons/commodities/treasure/crown-gold-laurel-wreath.webp' },
      { name: 'Smoke Shard', img: 'icons/commodities/gems/gem-fragments-red.webp' },
      // Issue 777: the required-tools salvage subject (see the salvage config below).
      { name: 'Smoke Toolchest', img: 'icons/containers/chest/chest-wooden-tied-white.webp' },
      // simple system — multi-option ingredient recipe (issue #552): two
      // interchangeable coil components the crafter holds + the woven result.
      { name: 'Smoke Copper Coil', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Bronze Coil', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Filigree', img: 'icons/commodities/metal/ingot-gold.webp' },
      // simple system — the requirement-rail / shared essence pool fixtures (issue 917).
      // Before this the world seeded ZERO essence-carrying components, so every essence
      // frame photographed `have: 0` and a shared pool could not be shot at all.
      //
      // Two DUAL-essence carriers plus one single-essence contrast carrier fund the pool.
      // Their per-unit yields (set below, after the essence library exists) are chosen so
      // the two-requirement recipe is CONTENDED: `Smoke Tide Essence` can only be met by
      // spending BOTH duals, which under the old per-group disjoint draw would leave the
      // Star requirement short — so the frame proves D-ESS joint crediting rather than
      // showing two trivially-met bars.
      { name: 'Smoke Duskcrystal', img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp' },
      { name: 'Smoke Tidebloom', img: 'icons/commodities/flowers/lotus-white.webp' },
      { name: 'Smoke Starmote', img: 'icons/commodities/materials/bowl-powder-teal.webp' },
      // The FIXED (non-selectable) requirement every new rail recipe opens with, so each
      // rail frame shows a met fixed tile beside the states actually under test. It is a
      // dedicated component rather than a reused plank so the plank budget the execution
      // asserts spend down (5 planks, exactly consumed) is not disturbed.
      { name: 'Smoke Runeplate', img: 'icons/commodities/metal/ingot-stack-steel.webp' },
      // routedByIngredients system
      { name: 'Smoke Ingot A', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Ingot B', img: 'icons/commodities/metal/ingot-gold.webp' },
      { name: 'Smoke Ring', img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp' },
      { name: 'Smoke Amulet', img: 'icons/equipment/neck/amulet-round-engraved-gold.webp' },
      // routedByCheck system
      { name: 'Smoke Bar', img: 'icons/commodities/metal/ingot-plain-steel.webp' },
      { name: 'Smoke Masterwork Blade', img: 'icons/weapons/swords/sword-guard-blue.webp' },
      { name: 'Smoke Standard Blade', img: 'icons/weapons/swords/greatsword-blue.webp' },
      // progressive system — THREE result stages with DISTINCT difficulties (issue 651).
      // Distinct is the point: the player stage list shows a cumulative "Reached at >=N"
      // per row, and equal difficulties would make a carried/stale threshold invisible.
      // The long name is deliberate — it is the stacked frame's ellipsis subject.
      { name: 'Smoke Clay', img: 'icons/commodities/stone/clay-grey.webp' },
      // Issue 675: the progressive-salvage subject. Breaking it down spends ONE roll
      // down the same three stages the progressive craft awards, so its reorderable
      // stage list is the player salvage surface's headline frame.
      { name: 'Smoke Cracked Amphora', img: 'icons/containers/kitchenware/vase-clay-painted-blue-gold.webp' },
      { name: 'Smoke Brick', img: 'icons/commodities/stone/masonry-bricks-brown.webp' },
      { name: 'Smoke Kiln-Fired Ceramic Roofing Tile', img: 'icons/commodities/stone/paver-tile-blue.webp' },
      { name: 'Smoke Glazed Amphora', img: 'icons/containers/kitchenware/jug-clay-brown.webp' },
      // Issue 766: ONE physical world item registered as a salvageable component in TWO
      // crafting systems (the simple forge and the progressive forge). A single crafter
      // copy of it must collapse to ONE inventory card carrying a system selector — the
      // reported "same item shows twice, once per system" defect and its fix.
      { name: 'Smoke Air Shard', img: 'icons/commodities/gems/pearl-turquoise.webp' }
    ];
    const createdItems = await Item.createDocuments(
      worldSpecs.map((s) => ({ name: s.name, type: itemType, img: s.img }))
    );
    const world = {};
    for (const item of createdItems) world[item.name] = item;
    const executionItemIds = createdItems.map((i) => i.id);

    // Register a set of world items as managed components on a system, giving
    // each the supplied difficulty (progressive result awarding needs difficulty
    // >= 1; it is inert for the other modes).
    const registerComponents = async (systemId, names, difficulty = 1) => {
      const map = {};
      for (const name of names) {
        const result = await csm.addItemFromUuid(systemId, world[name].uuid);
        map[name] = result.item.id;
        await csm.updateItem(systemId, map[name], { difficulty });
      }
      return map;
    };

    // Inventory copies matched to the managed component by `flags.core.sourceId`.
    const invCopies = (name, qty, extraFabricateFlags = null) =>
      Array.from({ length: qty }, () => ({
        name: world[name].name,
        type: world[name].type,
        img: world[name].img,
        flags: {
          core: { sourceId: world[name].uuid },
          ...(extraFabricateFlags ? { fabricate: extraFabricateFlags } : {})
        }
      }));

    // ── 2. SIMPLE system (+ breakage / limitedUses / negative-gating / salvage) ─
    const simpleSystem = await csm.createSystem({
      name: 'Smoke Simple Forge',
      description: 'Issue #489: simple-mode crafts, tool breakage, and salvage execution coverage.'
    });
    const simpleSystemId = simpleSystem.id;
    const simpleMap = await registerComponents(simpleSystemId, [
      'Smoke Plank', 'Smoke Crate', 'Smoke Mallet', 'Smoke Toy',
      'Smoke Chisel', 'Smoke Dowel', 'Smoke Anvil', 'Smoke Bracket',
      'Smoke Relic', 'Smoke Shard',
      // Issue 777: the required-tools salvage subject — salvaging it needs the Mallet
      // (which the crafter holds) and the Anvil (which it does not), so the player-salvage-
      // tools frame shows one available and one unavailable required-tool row.
      'Smoke Toolchest',
      // Multi-option ingredient recipe (issue #552) components.
      'Smoke Copper Coil', 'Smoke Bronze Coil', 'Smoke Filigree',
      // Issue 917: the shared essence pool's carriers + the fixed rail requirement.
      'Smoke Duskcrystal', 'Smoke Tidebloom', 'Smoke Starmote', 'Smoke Runeplate',
      // Issue 766: also registered in the progressive forge below — one physical stack,
      // two systems, one collapsed card.
      'Smoke Air Shard'
    ]);
    // Issue 766: Smoke Air Shard salvage in the SIMPLE forge (simple mode, yields Smoke
    // Shard). Its progressive-forge participation (below) salvages differently, so the
    // collapsed card's two participations carry genuinely distinct salvage surfaces.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-simple-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-simple-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
          }
        ]
      }
    });
    const malletToolId = 'smoke-mallet-tool';
    const chiselToolId = 'smoke-chisel-tool';
    const anvilToolId = 'smoke-anvil-tool';
    const chiselMaxUses = 2;
    await csm.updateSystem(simpleSystemId, {
      resolutionMode: 'simple',
      salvageResolutionMode: 'simple',
      // Issue 765: unlock explicit multi-step authoring so the simple system can host
      // a stepped recipe (the player-crafting-multistep screenshot subject).
      features: { multiStepRecipes: true, essences: true },
      // Issue 917: authored tag vocabulary for 'Smoke Sigil Etching' (acceptance
      // criterion 5). `_validateTagPlaceholders` rejects a recipe whose tag match
      // names anything outside `system.itemTags`, so the tag must be registered here
      // for the recipe to persist at all. No component registered in this system is
      // ever given this tag, so the requirement stays authored-but-unmatched — the
      // whole point of the fixture.
      itemTags: ['smoke-voidbound'],
      // Three authored essences (issue 917). `colorToken` is a BARE `--fab-tag-*` key —
      // never a hex and never the `--fab-tag-` prefix — because the normalizer strips the
      // prefix and every tinted surface composes `var(--fab-tag-<token>)` itself. Two
      // distinct tokens are what make the shared-pool frame legible: each meter, glyph and
      // contribution chip carries its own tint, so a reader can tell which carrier unit
      // funded which requirement.
      essenceDefinitions: [
        {
          id: 'smoke-star-essence',
          name: 'Smoke Star Essence',
          description: 'Distinctive authored essence icon fixture for player Crafting evidence.',
          icon: 'fas fa-star-of-life',
          colorToken: 'butter'
        },
        {
          id: 'smoke-tide-essence',
          name: 'Smoke Tide Essence',
          description: 'Second authored essence: the shared-pool frame needs two tints to read.',
          icon: 'fas fa-water',
          colorToken: 'lavender'
        },
        {
          // Deliberately carried by NOTHING in the world. It is the only way to shoot a
          // zero-delivered (danger) essence tile at rest: a carried essence always ends up
          // partly delivered, because the resolver's suggestion allocates every carrier it
          // can, and clearing the whole allocation makes the store fall back to that same
          // suggestion (an empty map re-reads the baked craftability).
          id: 'smoke-ember-essence',
          name: 'Smoke Ember Essence',
          description: 'Authored essence with no carrier in the world — the short-tile fixture.',
          icon: 'fas fa-fire',
          colorToken: 'rose'
        }
      ],
      tools: [
        {
          // Always breaks (rng()*100 ∈ [0,100) < 100) → deterministic breakageChance break.
          id: malletToolId,
          label: 'Smoke Mallet',
          enabled: true,
          componentId: simpleMap['Smoke Mallet'],
          breakage: { mode: 'breakageChance', breakageChance: 100 },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // limitedUses: applyUsage increments FIRST, then evaluateBreakage compares
          // post-increment `timesUsed >= maxUses`. The assertion crafts this recipe
          // `maxUses` (2) times — the first craft (timesUsed 1 < 2) does NOT break,
          // the second (timesUsed 2 >= 2) crosses the threshold and breaks. This
          // "craft maxUses times" variant avoids pre-seeding the double-nested
          // `flags.fabricate.fabricate.toolUsage` accessor from item-creation data.
          id: chiselToolId,
          label: 'Smoke Chisel',
          enabled: true,
          componentId: simpleMap['Smoke Chisel'],
          breakage: { mode: 'limitedUses', maxUses: chiselMaxUses },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // Required by the negative-gating recipe; the crafter never holds it.
          id: anvilToolId,
          label: 'Smoke Anvil',
          enabled: true,
          componentId: simpleMap['Smoke Anvil'],
          breakage: { mode: 'immune' },
          onBreak: { mode: 'flagBroken' }
        }
      ]
    });
    // Issue 917: per-unit essence yields on the pool's carriers. This MUST run after the
    // `essenceDefinitions` write above — `_normalizeComponent` filters the map against the
    // system's `validEssenceIds`, so an id authored before its definition exists is
    // silently dropped. `essences` on the managed COMPONENT is the field the resolver
    // reads (`resolveItemEssences` falls back to it for every inventory copy matched by
    // `flags.core.sourceId`), so no per-item essence flag is seeded: the flag path is read
    // through `getFabricateFlag(item, 'essences')`, which resolves the DOUBLE-nested
    // `flags.fabricate.fabricate.essences`, and a single-nested seed would be a silent
    // no-op.
    //
    // The numbers are the fixture's whole point. Against `Smoke Tidecore Tempering`
    // (Star 2 + Tide 3 in ONE set) the only Tide sources are the two duals, totalling
    // exactly 3 — so a disjoint per-group draw spends both on Tide and leaves Star with
    // just the Starmote's 1 of the 2 it needs (infeasible), while the block's joint
    // crediting funds both from the same two units (feasible). The contended pool is what
    // the `-essence-pool-shared` frame photographs.
    const simpleCarrierEssences = {
      'Smoke Duskcrystal': { 'smoke-star-essence': 2, 'smoke-tide-essence': 2 },
      'Smoke Tidebloom': { 'smoke-star-essence': 1, 'smoke-tide-essence': 1 },
      // The single-essence contrast row: one tinted contribution chip beside the duals' two.
      'Smoke Starmote': { 'smoke-star-essence': 1 }
    };
    for (const [name, essences] of Object.entries(simpleCarrierEssences)) {
      await csm.updateItem(simpleSystemId, simpleMap[name], { essences });
    }

    // Salvage config on Smoke Relic: simple mode (deterministic success, no
    // timeRequirement, no tools) → exactly one result group per validateSalvage.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Relic'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{
          id: 'smoke-relic-parts',
          name: 'Salvaged Parts',
          results: [{ id: 'smoke-shard-result', componentId: simpleMap['Smoke Shard'], quantity: 2 }]
        }]
      }
    });
    // Issue 777: required-tools salvage subject. Simple no-check salvage (same shape as
    // Smoke Relic) with `toolIds` naming two library tools — the Mallet the crafter holds
    // (available) and the Anvil it does not (unavailable) — so the player-salvage-tools
    // frame shows both availability states and the disabled pre-roll action in one panel.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Toolchest'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        toolIds: [malletToolId, anvilToolId],
        resultGroups: [{
          id: 'smoke-toolchest-parts',
          name: 'Reclaimed Parts',
          results: [{ id: 'smoke-toolchest-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
        }]
      }
    });

    const simpleRecipe = await rm.createRecipe({
      name: 'Smoke Assemble Crate',
      description: 'Simple-mode craft: one ingredient set, one result group.',
      craftingSystemId: simpleSystemId,
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Crate',
        results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }]
      }]
    });
    const breakageRecipe = await rm.createRecipe({
      name: 'Smoke Carve Toy',
      description: 'Simple-mode craft whose breakageChance tool always breaks.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/blocks-cut-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Toy', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });
    await rm.updateRecipe(breakageRecipe.id, { toolIds: [malletToolId] });
    const limitedUsesRecipe = await rm.createRecipe({
      name: 'Smoke Turn Dowel',
      description: 'Simple-mode craft whose limitedUses tool breaks at its maxUses threshold.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/lumber-plank-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
    });
    await rm.updateRecipe(limitedUsesRecipe.id, { toolIds: [chiselToolId] });
    const negativeToolRecipe = await rm.createRecipe({
      name: 'Smoke Bend Bracket',
      description: 'Simple-mode craft requiring a tool the crafter does not hold (negative gating).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/fragments-steel-barbed.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Bracket', results: [{ componentId: simpleMap['Smoke Bracket'], quantity: 1 }] }]
    });
    await rm.updateRecipe(negativeToolRecipe.id, { toolIds: [anvilToolId] });

    // Multi-option ingredient recipe (issue #552): a component OR authored essence
    // choice. The held component keeps the recipe selectable while the essence option
    // deterministically exercises its distinctive authored glyph.
    const multiOptionRecipe = await rm.createRecipe({
      name: 'Smoke Weave Filigree',
      description: 'Simple-mode craft with one component-or-essence ingredient choice (issue #552).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/ingot-gold.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-coil-choice',
          name: 'Coil',
          options: [
            { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Copper Coil'] } },
            { quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }
          ]
        }]
      }],
      resultGroups: [{
        name: 'Filigree',
        results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }]
      }]
    });

    await rm.createRecipe({
      name: 'Smoke Legacy Essence Seal',
      description: 'Legacy set-level essence requirement with an authored icon.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }],
        essences: { 'smoke-star-essence': 2 }
      }],
      resultGroups: [{ name: 'Seal', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    await rm.createRecipe({
      name: 'Smoke First-Class Essence Draught',
      description: 'First-class essence ingredient and shopping-list shortage fixture.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-star-essence-group',
          name: 'Star Essence',
          // 6, not the pre-917 3: the world now HOLDS 4 Star (2 + 1 + 1 across the three
          // carriers), and a need of 3 would clear the shopping-list shortage this recipe
          // is also the fixture for — `player-crafting-essence-shopping` waits on an
          // acquire row that would then never render. 6 keeps the shortage AND makes this
          // the single-requirement pool frame: a partly-funded meter with real numbers
          // instead of the 0/3 every essence frame photographed before.
          options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 6 } }]
        }]
      }],
      resultGroups: [{ name: 'Draught', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });

    // ── Issue 917 requirement-rail fixtures ─────────────────────────────────
    // Three recipes, each authored for ONE rendered state the redesign has to prove and
    // that no existing fixture can reach. All are display-only: no execution assert
    // crafts them, and none is craftable, so they add no consumption anywhere.
    //
    // THE NAMES ARE LOAD-BEARING. The player recipe browser sorts A→Z and pages at 12,
    // and the walk's mode-based selection (`selectCraftingRecipeByMode`) only iterates the
    // rows currently in the DOM — i.e. page one. Page one presently ends at 'Smoke Carve
    // Toy', so a fixture named 'Smoke Bind…' or 'Smoke Etch…' would displace it and
    // silently re-point `player-crafting-ingredient-routed`, `-routed-by-check` and the
    // craft that produces `-run-summary`/`-roll-result` at an UNCRAFTABLE display fixture.
    // These three names sort at positions ~20-22, so page one is unchanged. Every capture
    // below reaches its recipe through the browser SEARCH, which collapses the list to one
    // row, so their own page position never matters.

    // (1) The rail's three states in one frame. Author order is load-bearing — the rail
    // auto-advances to the FIRST unsatisfied openable slot, so the choice group must
    // precede the essence group for the alternatives chooser (rather than the pool) to be
    // the one open chooser in the shot.
    await rm.createRecipe({
      name: 'Smoke Runestaff Binding',
      description: 'Requirement rail: a met fixed slot, an unchosen choice slot, and a short essence slot.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
      ingredientSets: [{
        id: 'smoke-rail-set',
        ingredientGroups: [
          {
            id: 'smoke-rail-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            // Two alternatives the crafter holds NEITHER of. An untouched choice whose
            // group already resolves satisfied renders MET, so an unaffordable pair is the
            // only way to shoot the "unchosen → accent, never danger" state.
            id: 'smoke-rail-binding',
            name: 'Binding',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          },
          {
            id: 'smoke-rail-ember',
            name: 'Ember Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-ember-essence', amount: 4 } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Runestaff', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (2) The shared pool. TWO essence requirements in ONE set (sibling groups, each a
    // single essence option) beside a fixed group, so the same selection also supplies the
    // consumption-plan frame: a fixed row, an essence-carrier row and a "still to choose"
    // line, all at once.
    //
    // Issue 917 review: `player-crafting-consumption-plan` and `player-crafting-essence-
    // pool-shared` were captured on this SAME recipe at the SAME store state, differing
    // only by `scrollIntoViewIfNeeded` — a no-op frame if the plan panel is already in
    // view at the capture size. `smoke-shared-fitting` is an unaffordable pair (neither
    // option held, same pattern as `smoke-rail-binding` above), so it stays PARTIAL —
    // "unchosen" — for the life of both captures. It never contributes a plan row (an
    // untouched choice contributes only to `pending`), so it does not disturb the
    // existing `rows`/`carrierRows` assertions below, but it DOES put a non-essence
    // requirement on the consumption plan's "still to choose" line — evidence the
    // essence-pool panel (which shows only essence carriers) never renders at all. (The
    // tile reports its CHOSEN OPTION's name there, not the authored group label, so the
    // pending line names 'Smoke Anvil' rather than 'Fitting' — verified against a live
    // run.) That is what makes the two frames prove different things instead of the same
    // state twice.
    await rm.createRecipe({
      name: 'Smoke Tidecore Tempering',
      description: 'Shared essence pool: two requirements in one set funded jointly from dual carriers.',
      craftingSystemId: simpleSystemId,
      img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
      ingredientSets: [{
        id: 'smoke-shared-pool-set',
        ingredientGroups: [
          {
            id: 'smoke-shared-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-shared-star',
            name: 'Star Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }]
          },
          {
            id: 'smoke-shared-tide',
            name: 'Tide Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-tide-essence', amount: 3 } }]
          },
          {
            id: 'smoke-shared-fitting',
            name: 'Fitting',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          }
        ]
      }],
      resultGroups: [{ name: 'Tidecore', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (3) The item-bag defect (acceptance criterion 5). The tag names nothing any seeded
    // component carries, so the tile has no inventory item to borrow an image from and
    // must render its glyph. Both of this set's groups are single-option and
    // non-essence, so the rail offers NO openable slot at all — which is also the only
    // fixture in the world that photographs the rail with every chooser closed.
    await rm.createRecipe({
      name: 'Smoke Sigil Etching',
      description: 'Tag requirement with nothing matching in inventory: the tile must render a glyph, not the item bag.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
      ingredientSets: [{
        id: 'smoke-tag-unmatched-set',
        ingredientGroups: [
          {
            id: 'smoke-tag-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-tag-voidbound',
            name: 'Voidbound Reagent',
            options: [{ quantity: 1, match: { type: 'tags', tags: ['smoke-voidbound'], tagMatch: 'any' } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Sigil', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // Explicit multi-step simple recipe (issue 765): the reported defect. Its sets
    // live on steps[] with empty top-level arrays, so the step-aware listing
    // projection must surface each step's materials, evaluate the first step's
    // craftability, and resolve PRODUCES from the TERMINAL step. Checks stay off
    // (the simple system has no authored formula), so no check card renders — the
    // player-crafting-multistep screenshot subject. Additive: no execution assert
    // consumes it. Step 1 consumes held planks (craftable/available); step 2's
    // dowel is the intermediate, and the final product is the crate.
    const multiStepRecipe = await rm.createRecipe({
      name: 'Smoke Raise Tent',
      description:
        'Simple-mode multi-step craft (issue #765): step 1 cuts planks, step 2 raises the frame.',
      craftingSystemId: simpleSystemId,
      // A Foundry core raster already exercised by this fixture (the crate world item)
      // so the recipe thumbnail never 404s in the capture.
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [],
      resultGroups: [],
      steps: [
        {
          name: 'Cut Planks',
          timeRequirement: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Plank',
              options: [{ quantity: 2, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
            }]
          }],
          resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
        },
        {
          name: 'Raise Frame',
          timeRequirement: { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Dowel',
              options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Dowel'] } }]
            }]
          }],
          resultGroups: [{ name: 'Crate', results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }] }]
        }
      ]
    });

    // ── 3. ROUTED-BY-INGREDIENTS system (multi-set → differing groups) ──────
    const ingredientRouterSystem = await csm.createSystem({
      name: 'Smoke Ingredient Router',
      description: 'Issue #489: routedByIngredients multi-set routing coverage.'
    });
    const ingredientRouterSystemId = ingredientRouterSystem.id;
    const routerMap = await registerComponents(ingredientRouterSystemId, [
      'Smoke Ingot A', 'Smoke Ingot B', 'Smoke Ring', 'Smoke Amulet'
    ]);
    await csm.updateSystem(ingredientRouterSystemId, { resolutionMode: 'routedByIngredients' });
    const setAId = 'smoke-set-a';
    const setBId = 'smoke-set-b';
    const ringGroupId = 'smoke-group-ring';
    const amuletGroupId = 'smoke-group-amulet';
    const ingredientRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Cast Jewelry',
      description: 'routedByIngredients: each ingredient set maps to a different result group.',
      craftingSystemId: ingredientRouterSystemId,
      img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp',
      complex: true,
      ingredientSets: [
        {
          id: setAId,
          name: 'Silver route',
          resultGroupId: ringGroupId,
          ingredientGroups: [{
            name: 'Ingot A',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot A'] } }]
          }]
        },
        {
          id: setBId,
          name: 'Gold route',
          resultGroupId: amuletGroupId,
          ingredientGroups: [{
            name: 'Ingot B',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot B'] } }]
          }]
        }
      ],
      resultGroups: [
        { id: ringGroupId, name: 'Ring', results: [{ componentId: routerMap['Smoke Ring'], quantity: 1 }] },
        { id: amuletGroupId, name: 'Amulet', results: [{ componentId: routerMap['Smoke Amulet'], quantity: 1 }] }
      ]
    });

    // ── 4. ROUTED-BY-CHECK system (multi-group → different tiers) ───────────
    const checkRouterSystem = await csm.createSystem({
      name: 'Smoke Check Router',
      description: 'Issue #489: routedByCheck multi-group tier routing coverage.'
    });
    const checkRouterSystemId = checkRouterSystem.id;
    const checkMap = await registerComponents(checkRouterSystemId, [
      'Smoke Bar', 'Smoke Masterwork Blade', 'Smoke Standard Blade'
    ]);
    await csm.updateSystem(checkRouterSystemId, {
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          // 1d20 + 20 (21-40) vs dc 12 always meets Masterwork (dc 5) → deterministic tier.
          rollFormula: '1d20 + 20',
          dc: 12,
          thresholdMode: 'meet',
          relativeOutcomes: [
            { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
            { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
            { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
          ]
        }
      }
    });
    const masterGroupId = 'smoke-group-master';
    const standardGroupId = 'smoke-group-standard';
    const checkRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Forge Blade',
      description: 'routedByCheck: two result groups mapped to different outcome tiers.',
      craftingSystemId: checkRouterSystemId,
      img: 'icons/weapons/swords/sword-guard-blue.webp',
      complex: true,
      ingredientSets: [{
        name: 'Stock',
        ingredientGroups: [{
          name: 'Bar',
          options: [{ quantity: 1, match: { type: 'component', componentId: checkMap['Smoke Bar'] } }]
        }]
      }],
      resultGroups: [
        {
          id: masterGroupId,
          name: 'Masterwork Blade',
          checkOutcomeIds: ['craft-masterwork'],
          results: [{ componentId: checkMap['Smoke Masterwork Blade'], quantity: 1 }]
        },
        {
          id: standardGroupId,
          name: 'Standard Blade',
          checkOutcomeIds: ['craft-standard'],
          results: [{ componentId: checkMap['Smoke Standard Blade'], quantity: 1 }]
        }
      ]
    });

    // ── 5. PROGRESSIVE system (single deterministic advance) ────────────────
    const progressiveSystem = await csm.createSystem({
      name: 'Smoke Progressive Forge',
      description: 'Issue #489: progressive budget-vs-difficulty completion coverage.'
    });
    const progressiveSystemId = progressiveSystem.id;
    const progressiveMap = await registerComponents(
      progressiveSystemId,
      [
        'Smoke Clay',
        'Smoke Brick',
        'Smoke Kiln-Fired Ceramic Roofing Tile',
        'Smoke Glazed Amphora',
        // Issue 675: the ONLY progressive-salvage fixture in the repo. Before it there
        // was none anywhere — `Smoke Relic` is a SIMPLE-mode salvage with no check
        // formula (so it renders the no-check body) and `Iron Ore` is seeded for the
        // component EDITOR, not player inventory — so the player salvage surface's
        // headline feature, the reorderable stage list, had no capturable frame.
        'Smoke Cracked Amphora',
        // Issue 766: the SAME world item already registered in the simple forge — so one
        // owned copy resolves to a component in both systems and collapses to one card.
        'Smoke Air Shard'
      ],
      1
    );
    // `registerComponents` applies ONE difficulty to every name, so re-stamp the three
    // result stages individually. Difficulties 1/4/9 give ascending `equal`-mode
    // thresholds of >=1, >=5, >=14 — far enough apart that a wrong (e.g. carried) value
    // is obvious in a screenshot without knowing the fixture.
    const progressiveStageDifficulty = {
      'Smoke Brick': 1,
      'Smoke Kiln-Fired Ceramic Roofing Tile': 4,
      'Smoke Glazed Amphora': 9
    };
    for (const [name, difficulty] of Object.entries(progressiveStageDifficulty)) {
      await csm.updateItem(progressiveSystemId, progressiveMap[name], { difficulty });
    }
    const progressiveStageResults = [
      { id: 'smoke-brick-result', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
      { id: 'smoke-tile-result', componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'], quantity: 1 },
      { id: 'smoke-amphora-result', componentId: progressiveMap['Smoke Glazed Amphora'], quantity: 1 }
    ];
    await csm.updateSystem(progressiveSystemId, {
      resolutionMode: 'progressive',
      features: { craftingChecks: true },
      craftingCheck: {
        enabled: true,
        // 1d20 + 20 budget (21-40) far exceeds the Smoke Brick difficulty (1) so a
        // single advance awards it (progressive is budget-vs-difficulty, not tiered).
        progressive: { rollFormula: '1d20 + 20', awardMode: 'equal' }
      },
      // Issue 675 — SALVAGE'S OWN mode and check block, authored independently of the
      // recipe's above. This is exactly the pair a projection that read `craftingCheck`
      // instead of `salvageCraftingCheck` would confuse: the award modes differ
      // (`partial` vs `equal`), so a wrong read renders visibly wrong thresholds.
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: {
        enabled: true,
        progressive: { rollFormula: '1d20 + 6', awardMode: 'partial' }
      }
    });
    // Progressive salvage on Smoke Cracked Amphora: one roll spent down the SAME three
    // stages (difficulties 1 / 4 / 9), authored in ascending order so a player reorder
    // visibly changes the "Reached at >=N" badges.
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Cracked Amphora'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        // Left at its default TRUE so the player CAN reorder: this fixture exists to
        // capture the reorder affordances, which `false` would (correctly) remove.
        allowPlayerResultReorder: true,
        resultGroups: [
          {
            id: 'smoke-amphora-salvage',
            name: 'Amphora Fragments',
            results: [
              { id: 'smoke-salvage-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
              {
                id: 'smoke-salvage-tile',
                componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'],
                quantity: 1
              },
              {
                id: 'smoke-salvage-amphora',
                componentId: progressiveMap['Smoke Glazed Amphora'],
                quantity: 1
              }
            ]
          }
        ]
      }
    });
    // Issue 766: Smoke Air Shard salvage in the PROGRESSIVE forge (simple mode here for a
    // deterministic capture, yielding Smoke Brick). Its simple-forge participation yields
    // Smoke Shard — so the collapsed card's System selector switches between two genuinely
    // different salvage surfaces, proving the whole body re-scopes to the chosen system.
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-prog-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-prog-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 }]
          }
        ]
      }
    });
    const progressiveRecipe = await rm.createRecipe({
      name: 'Smoke Mold Brick',
      description: 'progressive: one low-difficulty result awarded in a single advance.',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/masonry-bricks-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brick',
        results: progressiveStageResults
      }]
    });

    // Flag-OFF sibling (issue 651): the same three stages with the GM's reorder
    // permission withheld, so the player stage list renders its fixed state (no grips,
    // no move buttons, ordinals + difficulty retained, "Order set by the GM" line).
    // Default-true means the ONLY way to shoot that state is to author an explicit false.
    await rm.createRecipe({
      name: 'Smoke Kiln Firing',
      description: 'progressive: stage order fixed by the GM (allowPlayerResultReorder: false).',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/paver-tile-blue.webp',
      allowPlayerResultReorder: false,
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Fired ware',
        results: progressiveStageResults
      }]
    });

    // ── 6. Crafter inventory top-up ─────────────────────────────────────────
    await crafter.createEmbeddedDocuments('Item', [
      ...invCopies('Smoke Plank', 5),                 // simple(1) + breakage(1) + limitedUses(2) crafts; negative consumes none
      ...invCopies('Smoke Mallet', 1),                // breakageChance tool
      ...invCopies('Smoke Chisel', 1),                // limitedUses tool (broken by crafting maxUses times)
      // TWO copies (issue 675), not one. The always-run `exec-salvage-run` step calls
      // engine.salvage() on this and CONSUMES a copy, and it runs in a different
      // Playwright phase from the player-app capture — so ordering the capture ahead of
      // it is not viable. With one copy the Inventory tab has no salvageable row left to
      // photograph. That step asserts only `result.success`, `results != null` and
      // `shardAfter > shardBefore`, and nothing repo-wide counts Smoke Relic, so a second
      // copy is inert. The player-salvage capture below does NOT commit a salvage; if it
      // ever does, this must become 3.
      ...invCopies('Smoke Relic', 2),                 // salvageable component
      ...invCopies('Smoke Toolchest', 1),             // issue 777: required-tools salvage subject
      ...invCopies('Smoke Copper Coil', 1),           // multi-option recipe alternative A (#552)
      ...invCopies('Smoke Bronze Coil', 1),           // multi-option recipe alternative B (#552)
      // Issue 917 — the shared essence pool's ledger, in DELIBERATE quantities. One unit
      // of each carrier: `_initialRemaining` keys the ledger by item and reads
      // `system.quantity`, so N copies would render N identically-named carrier rows
      // rather than one row of N. With Star 2/Tide 2 + Star 1/Tide 1 + Star 1 the world
      // holds Star 4 and Tide 3 — exactly the Tide the two-requirement recipe needs, which
      // is what makes its pool contended rather than comfortably over-funded.
      ...invCopies('Smoke Duskcrystal', 1),           // dual carrier (Star 2, Tide 2)
      ...invCopies('Smoke Tidebloom', 1),             // dual carrier (Star 1, Tide 1)
      ...invCopies('Smoke Starmote', 1),              // single-essence contrast carrier (Star 1)
      // TWO, so the fixed rail tile reads "owned 2, spends 1" in the consumption plan
      // rather than a degenerate 1-of-1.
      ...invCopies('Smoke Runeplate', 2),             // the fixed requirement of every rail fixture
      ...invCopies('Smoke Ingot A', 1),               // routedByIngredients set A
      ...invCopies('Smoke Ingot B', 1),               // routedByIngredients set B (asserted NOT produced)
      ...invCopies('Smoke Bar', 1),                   // routedByCheck stock
      ...invCopies('Smoke Clay', 1),                  // progressive stock
      ...invCopies('Smoke Cracked Amphora', 1),       // progressive-salvage subject (#675)
      // Issue 766: ONE physical copy registered in BOTH forges. It must collapse to a
      // SINGLE card (quantity ×1, counted once — never ×2) with a system selector.
      ...invCopies('Smoke Air Shard', 1)              // multi-system collapse subject (#766)
    ]);

    // ── 7. Always-run guaranteed-success gather (Arcane Forge, scene-less) ──
    // A dropRate:100 d100 task under a scene-less manual environment so the
    // rc/ci gather-inventory-delta assertion via startGatheringAttempt is
    // deterministic (no scene gate, no tool gate, no roll prompt).
    const rcGatherTaskId = 'smoke-rc-forage';
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.systems = config.systems || {};
    const arcaneConfig = config.systems[arcaneSystemId] || {};
    const existingTasks = Array.isArray(arcaneConfig.tasks) ? arcaneConfig.tasks : [];
    config.systems[arcaneSystemId] = {
      ...arcaneConfig,
      tasks: [
        ...existingTasks.filter((task) => task?.id !== rcGatherTaskId),
        {
          id: rcGatherTaskId,
          name: 'Smoke RC Forage',
          description: 'Guaranteed-drop forage for the rc/ci gather-delta assertion.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
          enabled: true,
          // No weather/timeOfDay constraints (like the meadowlands library tasks):
          // the direct start path does not apply CONDITIONS_BLOCKED, and leaving them
          // off keeps this "guaranteed-success" task honestly unconditional.
          region: 'northreach',
          biomes: ['forest'],
          itemSelectionMode: 'highestRankedDrop',
          dropRows: [{
            id: 'smoke-rc-drop',
            componentId: mysticHerbComponentId,
            quantity: 1,
            dropRate: 100,
            enabled: true
          }]
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    // rc/ci gather env: MANUAL composition force-includes ONLY the guaranteed task
    // and NO events, so the always-run inventory-delta assertion cannot be
    // perturbed by a hazardous event flipping the outcome.
    const rcGatherEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke RC Meadow',
      description: 'Scene-less guaranteed-success environment for the rc/ci gather-delta assertion.',
      img: 'icons/consumables/plants/grass-leaves-green.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      compositionMode: 'manual',
      region: 'northreach',
      biomes: ['forest'],
      forcedTaskIds: [rcGatherTaskId]
    });
    // Full-profile hazard env: AUTOMATIC composition + matching region/biome, so it
    // composes BOTH the guaranteed task and the seeded hazardous smoke-bramble-event.
    // The env MUST carry a hazardous danger level: automatic event composition only
    // includes events up to the env's danger rank (evaluateDangerField:
    // eventRank <= dangerRank(envLevel)), so a default 'safe' env would never compose
    // the hazardous (rank 2) event — mirroring the Azure Grove fixture's dangerTags.
    // Scene-less so a headless GM can attempt it (Azure Grove's sceneUuid gate blocks
    // every viewer). The hazard assertion forces the event dropRate to 100 to fire.
    const hazardEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke Hazard Grove',
      description: 'Scene-less environment that composes the hazardous Bramble Snare event for #489.',
      img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      region: 'northreach',
      biomes: ['forest'],
      dangerTags: ['hazardous'],
      eventPolicy: 'successWithEvent',
      eventSelectionMode: 'highestRankedDrop'
    });

    return {
      executionItemIds,
      executionSystemIds: [
        simpleSystemId, ingredientRouterSystemId, checkRouterSystemId, progressiveSystemId
      ],
      executionRecipeIds: [
        simpleRecipe.id, breakageRecipe.id, limitedUsesRecipe.id, negativeToolRecipe.id,
        multiOptionRecipe.id,
        ingredientRoutedRecipe.id, checkRoutedRecipe.id, progressiveRecipe.id
      ],
      simple: {
        systemId: simpleSystemId,
        simpleRecipeId: simpleRecipe.id,
        breakageRecipeId: breakageRecipe.id,
        limitedUsesRecipeId: limitedUsesRecipe.id,
        negativeToolRecipeId: negativeToolRecipe.id,
        malletComponentId: simpleMap['Smoke Mallet'],
        chiselComponentId: simpleMap['Smoke Chisel'],
        relicComponentId: simpleMap['Smoke Relic']
      },
      ingredientRouted: {
        recipeId: ingredientRoutedRecipe.id,
        // Deliberately the SECOND set → the Amulet group (resultGroups[1], NOT the
        // first group), so the assertion proves the router selects a non-index-0
        // group by set assignment rather than always emitting resultGroups[0].
        chosenSetId: setBId
      },
      checkRouted: { recipeId: checkRoutedRecipe.id },
      progressive: { recipeId: progressiveRecipe.id, systemId: progressiveSystemId, recipeName: 'Smoke Mold Brick' },
      gather: { environmentId: rcGatherEnvironment.id, taskId: rcGatherTaskId },
      hazard: { environmentId: hazardEnvironment.id, taskId: rcGatherTaskId }
    };
  // ── END VERBATIM COPY: seedSmokeExecutionFixtures ──
}

/**
 * Renames the primary system to "The Herbalist's Compendium" and turns experimental features on -
 * the smoke does this just before its manager walk, which is why every manager frame shows that name.
 *
 * Source: scripts/foundry-test-run.mjs lines 8216-8224
 *
 * @param {object} context Exactly what the smoke passes in.
 * @returns {Promise<*>} Exactly what the smoke's block returns.
 */
export async function renameSmokePrimarySystem(sysId) {
  // ── BEGIN VERBATIM COPY: renameSmokePrimarySystem ──
          const previousExperimentalFeatures = Boolean(game.settings.get('fabricate', 'experimentalFeatures'));
          await game.settings.set('fabricate', 'experimentalFeatures', true);
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: "The Herbalist's Compendium",
            description: 'Configure categories, item tags, essences, and crafting behaviour for this system.'
          });
          return previousExperimentalFeatures;
  // ── END VERBATIM COPY: renameSmokePrimarySystem ──
}

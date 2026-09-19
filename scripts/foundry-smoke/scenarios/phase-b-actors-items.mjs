/**
 * Phase B: the smoke world's actors, users, items and inventories, plus the Items sidebar and
 * actor-sheet captures. Its ids land on `ctx.shared.cleanup`, which phase F deletes.
 */

export default {
  id: 'phase-b-actors-items',
  phase: 'phase-B',
  section: null,
  publishes: ['cleanup'],
  consumes: ['cleanup'],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { cleanup } = ctx.shared;
    process.stdout.write('Phase B: Creating test actors and items...\n');
    try {
      const createdDocs = await page.evaluate(async () => {
        // Clean up any stale test data from previous runs.
        const csm = game.fabricate.getCraftingSystemManager();
        const rm = game.fabricate.getRecipeManager();
        const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();

        // Defensively clear all gathering environments before recreating fixtures.
        if (environmentStore) {
          try {
            await game.settings.set('fabricate', 'gatheringEnvironments', []);
            environmentStore.load?.();
          } catch (error) {
            console.warn(`Failed to reset gathering environments: ${error?.message}`);
          }
        }

        const allSystems = csm.getSystems();
        // The smoke creates "Arcane Forge" and renames it to "The Herbalist's Compendium" mid-run
        // (Phase D0).
        const staleSystemNames = new Set([
          'Arcane Forge',
          "The Herbalist's Compendium",
          // Issue #489 craft-execution coverage systems (deterministic names) so a
          // crashed local run does not accumulate duplicate same-named systems.
          'Smoke Simple Forge',
          'Smoke Ingredient Router',
          'Smoke Check Router',
          'Smoke Progressive Forge',
        ]);
        const staleSystems = allSystems.filter((s) => staleSystemNames.has(s.name));
        for (const sys of staleSystems) {
          console.log(`Cleaning stale crafting system: ${sys.name} (${sys.id})`);
          try {
            await environmentStore?.cleanupByCraftingSystem?.(sys.id);
          } catch {
            /* ok */
          }
          const recipes = rm.getRecipes?.({ craftingSystemId: sys.id }) ?? [];
          for (const r of recipes) {
            try {
              await rm.deleteRecipe(r.id);
            } catch {
              /* ok */
            }
          }
          try {
            await csm.deleteSystem(sys.id);
          } catch {
            /* ok */
          }
        }

        // 2. Clear stale smoke-world chat before any later phase opens the chat
        //    sidebar. Old crafting cards retain image URLs from the product version
        //    that created them; allowing them to render makes an otherwise clean run
        //    fail the zero-console-error gate on obsolete asset 404s.
        const staleMessages = game.messages?.contents ?? [];
        if (staleMessages.length > 0) {
          console.log(`Cleaning ${staleMessages.length} stale smoke chat messages`);
          await ChatMessage.deleteDocuments(staleMessages.map((message) => message.id));
        }

        // 3. Clean stale smoke actors (tagged flags.fabricate.smokeSeed) so the
        //    per-run re-import of the dnd5e Starter Heroes pack stays idempotent.
        const staleActors = game.actors.contents.filter(
          (a) => a.flags?.fabricate?.smokeSeed === true
        );
        if (staleActors.length > 0) {
          console.log(`Cleaning ${staleActors.length} stale smoke actors`);
          await Actor.deleteDocuments(staleActors.map((a) => a.id));
        }

        const staleUsers = game.users.contents.filter((u) =>
          ['Fabricate Gatherer', 'Fabricate Observer'].includes(u.name)
        );
        if (staleUsers.length > 0) {
          console.log(`Cleaning ${staleUsers.length} stale test users`);
          await User.deleteDocuments(staleUsers.map((u) => u.id));
        }

        // 4. Clean stale items (the fixed smoke set plus the issue #489
        //    craft-execution world items, all uniquely 'Smoke '-prefixed).
        const staleItems = game.items.contents.filter(
          (i) =>
            [
              'Iron Ore',
              'Mystic Herb',
              'Dragon Scale',
              'Empty Vial',
              'Iron Sword',
              'Healing Potion',
              'Dragon Scale Armor',
            ].includes(i.name) ||
            (typeof i.name === 'string' && i.name.startsWith('Smoke '))
        );
        if (staleItems.length > 0) {
          console.log(`Cleaning ${staleItems.length} stale test items`);
          await Item.deleteDocuments(staleItems.map((i) => i.id));
        }

        const staleScenes = game.scenes.contents.filter((scene) =>
          ['Fabricate Azure Grove Scene'].includes(scene.name)
        );
        if (staleScenes.length > 0) {
          console.log(`Cleaning ${staleScenes.length} stale test scenes`);
          await Scene.deleteDocuments(staleScenes.map((scene) => scene.id));
        }

        // Discover valid document types — try multiple Foundry API locations
        // V13: game.documentTypes.Item, V12: game.system.documentTypes.Item
        const rawItemTypes =
          game.documentTypes?.Item ??
          game.system?.documentTypes?.Item ??
          game.system?.template?.Item?.types ??
          [];
        const rawActorTypes =
          game.documentTypes?.Actor ??
          game.system?.documentTypes?.Actor ??
          game.system?.template?.Actor?.types ??
          [];
        const itemTypes = [...rawItemTypes];
        const actorTypes = [...rawActorTypes];
        console.log('Available item types:', JSON.stringify(itemTypes));
        console.log('Available actor types:', JSON.stringify(actorTypes));

        // Use 'loot' for all items — safest common type across D&D 5e versions
        const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

        // Create world-level items (all as loot — type doesn't matter for crafting).
        const describe = (html) => ({ description: { value: `<p>${html}</p>` } });
        const itemData = [
          {
            name: 'Iron Ore',
            type: itemType,
            img: 'icons/commodities/metal/ingot-worn-iron.webp',
            system: describe(
              'Unrefined metal, dug from a hillside and still carrying the grit of the seam it came from. Smelt it before you trust it to hold an edge.'
            ),
          },
          {
            name: 'Mystic Herb',
            type: itemType,
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            system: describe('A pungent leaf that keeps its colour long after cutting.'),
          },
          {
            name: 'Dragon Scale',
            type: itemType,
            img: 'icons/commodities/leather/scales-blue-white.webp',
            system: describe('Shed plate, still faintly warm to the touch.'),
          },
          {
            name: 'Empty Vial',
            type: itemType,
            img: 'icons/consumables/potions/vial-cork-empty.webp',
            system: describe('Cheap, corked glass. Holds a single dose.'),
          },
          {
            name: 'Iron Sword',
            type: itemType,
            img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
            system: describe('A serviceable blade with a worn brass guard.'),
          },
          {
            name: 'Herbalist Sickle',
            type: itemType,
            img: 'icons/tools/hand/sickle-worn-steel-grey.webp',
            system: describe('A short curved blade for taking cuttings without crushing them.'),
          },
          {
            name: 'Healing Potion',
            type: itemType,
            img: 'icons/consumables/potions/potion-tube-corked-red.webp',
            system: describe('Tastes of iron and cloves.'),
          },
          {
            name: 'Dragon Scale Armor',
            type: itemType,
            img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
            system: describe('Overlapping plate, light for its bulk.'),
          },
        ];

        const items = await Item.createDocuments(itemData);
        console.log(
          `Created ${items.length} items:`,
          items.map((i) => `${i.name} (${i.type})`).join(', ')
        );

        const itemIds = items.map((i) => i.id);
        const itemsByName = {};
        for (const item of items) {
          itemsByName[item.name] = { id: item.id, uuid: item.uuid };
        }

        // Import the dnd5e "Starter Heroes" pack so demo actors use official, non-AI art shipped
        // with the game system instead of bundled portraits.
        const heroPack =
          game.packs.get('dnd5e.heroes') ??
          game.packs.find(
            (p) => p.documentName === 'Actor' && /hero/i.test(p.metadata?.label ?? '')
          );
        if (!heroPack) {
          throw new Error(
            'dnd5e Starter Heroes compendium (dnd5e.heroes) not found — cannot seed smoke actors.'
          );
        }
        const heroIndex = await heroPack.getIndex();
        // R1 (#750): two-actor contract. Phase B references only actors[0] (crafter) and actors[1]
        // (travelMember); importing the whole Starter Heroes pack cost ~30-45s for actors nothing
        // asserts.
        const sortedHeroEntries = [...heroIndex]
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
        await Actor.updateDocuments(
          importedHeroes.map((a) => ({ _id: a.id, 'flags.fabricate.smokeSeed': true }))
        );
        const actors = [...importedHeroes].sort((a, b) => a.name.localeCompare(b.name, 'en'));
        console.log(
          `Imported ${actors.length} dnd5e Starter Heroes:`,
          actors.map((a) => a.name).join(', ')
        );
        const actorIds = actors.map((a) => a.id);

        const crafter = actors[0];
        const travelMember = actors[1] ?? null;
        // Remember the crafter as the default gathering actor so the player-app
        // screenshots deterministically show the same demo character.
        try {
          await game.fabricate.setSelectedGatheringActorId(crafter.id);
        } catch {
          /* best effort */
        }
        const testUserData = [
          { name: 'Fabricate Gatherer', role: CONST.USER_ROLES.PLAYER, password: '' },
          { name: 'Fabricate Observer', role: CONST.USER_ROLES.PLAYER, password: '' },
        ];
        const existingTestUsers = game.users.contents.filter((user) =>
          testUserData.some((data) => data.name === user.name)
        );
        const missingTestUsers = testUserData.filter((data) =>
          existingTestUsers.every((user) => !(user.name === data.name))
        );
        const users = [
          ...existingTestUsers,
          ...(missingTestUsers.length > 0 ? await User.createDocuments(missingTestUsers) : []),
        ];
        const gathererUser = users.find((user) => user.name === 'Fabricate Gatherer');
        const observerUser = users.find((user) => user.name === 'Fabricate Observer');
        const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const noneLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
        await crafter.update({ ownership: { default: noneLevel, [gathererUser.id]: ownerLevel } });
        if (travelMember) await travelMember.update({ ownership: { default: noneLevel } });
        // "Who controls this character" is a union of two independent routes: the viewer holds
        // Foundry OWNER on the actor, OR the actor is that user's assigned character
        // (`User#character`).
        if (travelMember && observerUser) {
          await observerUser.update({ character: travelMember.id });
        }
        const userIds = users.map((user) => user.id);

        // Build inventory copies from world items Include flags.core.sourceId so the crafting
        // engine can match embedded items back to world-level component UUIDs
        const byName = (name) => {
          const item = items.find((i) => i.name === name);
          if (!item) throw new Error(`Item "${name}" not found in created items`);
          return item;
        };
        const copies = (item, qty) =>
          Array.from({ length: qty }, () => ({
            name: item.name,
            type: item.type,
            img: item.img,
            flags: { core: { sourceId: item.uuid } },
          }));

        // Crafter gets: 3x Mystic Herb, 3x Empty Vial, 1x Dragon Scale. The UI evidence phases
        // share this actor and may stage one vial in another workflow.
        await crafter.createEmbeddedDocuments('Item', [
          ...copies(byName('Mystic Herb'), 3),
          ...copies(byName('Empty Vial'), 3),
          ...copies(byName('Dragon Scale'), 1),
        ]);

        // Travel-party member gets: 3x Iron Ore, 1x Dragon Scale
        if (travelMember) {
          await travelMember.createEmbeddedDocuments('Item', [
            ...copies(byName('Iron Ore'), 3),
            ...copies(byName('Dragon Scale'), 1),
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
          itemsByName,
        };
      });

      cleanup.itemIds = createdDocs.itemIds;
      cleanup.actorIds = createdDocs.actorIds;
      cleanup.userIds = createdDocs.userIds;
      cleanup.crafterId = createdDocs.crafterId;
      cleanup.travelMemberId = createdDocs.travelMemberId;
      cleanup.gathererUserId = createdDocs.gathererUserId;
      cleanup.observerUserId = createdDocs.observerUserId;
      process.stdout.write(
        `  Created ${createdDocs.itemIds.length} items and ${createdDocs.actorIds.length} actors with inventories.\n`
      );

      // Screenshot the Items sidebar (force: true bypasses overlays like "Game Paused")
      const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
      await itemsTab.click({ force: true });
      // Wait for the items directory to render an item row created in Phase B
      // (replaces a 1 s fixed sleep that was guarding sidebar render).
      await page
        .locator('#sidebar #items .directory-item, #sidebar [data-tab="items"] .directory-item')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {
          /* selector variants across V13 — best-effort */
        });
      await screenshot(page, 'items-sidebar');
      process.stdout.write('  Screenshotted Items sidebar.\n');

      // Screenshot each actor sheet (inventory tab)
      process.stdout.write('  Opening actor sheets for screenshots...\n');
      for (const actorId of createdDocs.actorIds) {
        const actorName = await page.evaluate(async (id) => {
          const actor = game.actors.get(id);
          await actor.sheet.render(true);
          return actor.name;
        }, actorId);
        // Wait for an actor sheet to be in the DOM (covers AppV1 + V2 shells).
        // Replaces a 1.5 s fixed sleep.
        await page
          .locator(
            '.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]'
          )
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => {
            /* shell selector varies; the changeTab logic below tolerates a not-yet-rendered sheet */
          });
        // Navigate to inventory tab via Foundry API
        const invTabResult = await page.evaluate((id) => {
          const actor = game.actors.get(id);
          const sheet = actor?.sheet;
          if (!sheet) return { found: false, reason: 'no sheet' };

          // ApplicationV2: use changeTab API
          if (typeof sheet.changeTab === 'function') {
            try {
              sheet.changeTab('inventory', 'primary');
              return { found: true, method: 'changeTab(inventory, primary)' };
            } catch {
              // Try without group
              try {
                sheet.changeTab('inventory');
                return { found: true, method: 'changeTab(inventory)' };
              } catch {
                /* continue */
              }
            }
          }

          // ApplicationV1: use activateTab
          if (typeof sheet.activateTab === 'function') {
            try {
              sheet.activateTab('inventory');
              return { found: true, method: 'activateTab(inventory)' };
            } catch {
              /* continue */
            }
          }

          // Debug: list available methods and tab groups
          const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sheet))
            .filter((m) => m.toLowerCase().includes('tab'))
            .slice(0, 10);
          const tabGroups = sheet.tabGroups ? Object.keys(sheet.tabGroups) : [];
          return { found: false, methods, tabGroups };
        }, actorId);
        if (invTabResult.found) {
          await page.waitForTimeout(500);
        }
        await screenshot(page, `actor-sheet-${actorName.replaceAll(/\s+/g, '-').toLowerCase()}`);
        process.stdout.write(`  Screenshotted ${actorName} sheet.\n`);
        // Close the sheet
        await page.evaluate((id) => {
          const actor = game.actors.get(id);
          actor.sheet.close();
        }, actorId);
        await page.waitForTimeout(500);
      }

      results.steps.push({ step: 'create-actors-items', passed: true });
      process.stdout.write('Phase B complete: Actors and items created.\n');
    } catch (error) {
      results.steps.push({ step: 'create-actors-items', passed: false, error: error.message });
      process.stderr.write(`Phase B failed: ${error.message}\n`);
    }
  },
};

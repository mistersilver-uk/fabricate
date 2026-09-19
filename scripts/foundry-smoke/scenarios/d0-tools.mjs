/**
 * Phase D0's Tool Studio section, with the fixture pair and the live-replacement, breakage,
 * clipboard and pagination helpers it drives. `runFixturedScreenshotSection` owns the
 * setup -> exercise -> finally-restore scaffold; its `finally` is the leak guard.
 */

import { exerciseToolStudioPointerTargets } from './d0-tools-pointer-targets.mjs';
import { runFixturedScreenshotSection } from '../../lib/smokeSectionFixture.js';

async function setupToolStudioFixture(page, { systemId, recipeId }) {
  return page.evaluate(async ({ systemId, recipeId }) => {
    const clone = (value) => foundry.utils.deepClone(value);
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const system = csm.getSystem(systemId);
    const recipe = rm.getRecipe(recipeId);
    const sourceTemplate = game.items.find((item) => item.name === 'Herbalist Sickle');
    if (!system || !recipe || !sourceTemplate) {
      throw new Error('Tool Studio fixture requires Arcane Forge, Brew Healing Potion, and Herbalist Sickle');
    }
    const pack = game.packs.get('dnd5e.items');
    const index = await pack?.getIndex?.();
    const uncached = Array.from(index || []).find((entry) => entry?._id && !pack.get(entry._id));
    if (!uncached) throw new Error('Tool Studio fixture requires an uncached dnd5e.items entry');
    const sourceSystem = clone(sourceTemplate.system);
    const parityDescription = '<p>A well-balanced forge hammer. Durable, but the haft splinters when hard used.</p>';
    if (typeof sourceSystem?.description === 'string') {
      sourceSystem.description = parityDescription;
    } else if (sourceSystem?.description && typeof sourceSystem.description === 'object') {
      sourceSystem.description.value = parityDescription;
    } else {
      sourceSystem.description = { value: parityDescription };
    }
    const source = await Item.create({
      name: "Smith's Hammer",
      type: sourceTemplate.type,
      img: 'icons/tools/hand/hammer-cobbler-steel.webp',
      system: sourceSystem,
    });
    if (!source) throw new Error("Tool Studio fixture could not create Smith's Hammer");
    const replacementSource = await Item.create({
      name: 'Smoke Tool Studio Replacement Item',
      type: sourceTemplate.type,
      img: sourceTemplate.img,
      system: clone(sourceSystem),
    });
    if (!replacementSource) throw new Error('Tool Studio fixture could not create its replacement Item');

    // Character prerequisites are world scope (issue 1308/1311): the Tool Studio Requirements tab's
    // `prerequisiteOptions` (`ToolRequirementsTab.svelte`, threaded through `ToolEditView`) reads
    // `selectedCharacterPrerequisites`, which is `$viewState.worldCharacterPrerequisites` — the
    // `characterLibraries` world setting's `characterPrerequisites` list — never
    // `getSystem(id).characterPrerequisites`.
    const worldCharacterLibraries = game.settings.get('fabricate', 'characterLibraries') || {};
    const restore = {
      tools: clone(system.tools || []),
      characterPrerequisites: clone(worldCharacterLibraries.characterPrerequisites || []),
      toolBreakage: clone(system.toolBreakage || { authority: 'toolSpecific' }),
      recipeToolIds: clone(recipe.toolIds || []),
      recipeToolBonusModes: clone(recipe.toolBonusModes || {}),
      sourceRoles: clone(source.getFlag('fabricate', 'fabricate.roles') || null),
      sourceCreated: true,
      replacementSourceCreated: true,
    };
    const prerequisiteId = 'smoke-tool-studio-training';
    const requestedToolId = 'smoke-tool-studio';
    const components = (system.components || []).filter((component) => component.id !== source.id);
    if (components.length < 2) throw new Error('Tool Studio repair fixture needs two managed Components');
    const parityPrerequisites = [
      ['smoke-tool-studio-expert', 'Expert Crafter', 'prof', 'gte', 4],
      [prerequisiteId, "Proficient with Smith's Tools", 'prof', 'gte', 1],
      ['smoke-tool-studio-weave', 'Attuned to the Weave', 'abilities.int.mod', 'gte', 2],
      ['smoke-tool-studio-strong', 'Strength 13 or higher', 'abilities.str.value', 'gte', 13],
      ['smoke-tool-studio-arena', 'Trained in Arcana', 'skills.arc.value', 'gte', 1],
    ].map(([id, name, path, op, value]) => ({
      id,
      name,
      icon: 'fa-solid fa-user-shield',
      path,
      op,
      value,
    }));
    await csm.updateSystem(systemId, {
      // The parity frame owns an exact eight-row fixture. Clear the unrelated
      // smoke tools first; restoration below reinstates the original array.
      tools: [],
      toolBreakage: { authority: 'toolSpecific' },
    });
    // Read-modify-write: `settings.set` REPLACES the whole `characterLibraries` value, so
    // the world modifier library seeded earlier must be spread back in rather than dropped.
    await game.settings.set('fabricate', 'characterLibraries', {
      ...worldCharacterLibraries,
      characterPrerequisites: parityPrerequisites,
    });
    let { item: upsertedTool } = await csm.upsertTool(systemId, {
      id: requestedToolId,
      enabled: true,
      label: "Smith's Hammer",
      prerequisites: { enabled: true, ids: [prerequisiteId], gateMode: 'usability' },
      bonus: { enabled: true, expression: '@prof' },
      breakage: { mode: 'limitedUses', maxUses: 5 },
      checkBreakable: true,
      onBreak: { mode: 'destroy' },
      repairRequirements: [{
        id: 'smoke-tool-repair-group',
        name: 'Restore the working edge',
        options: components.slice(0, 2).map((component, index) => ({
          id: `smoke-tool-repair-option-${index + 1}`,
          quantity: 1,
          extractEffects: false,
          match: { type: 'component', componentId: component.id },
        })),
      }],
    }, { itemUuid: source.uuid });
    // dnd5e Item schemas vary in how they retain a cloned description. The parity
    // fixture tests Tool Studio, not that system-specific schema edge, so pin the
    // normalized Tool snapshot after the source-linked upsert has established its
    // durable identity.
    ({ item: upsertedTool } = await csm.upsertTool(systemId, {
      ...upsertedTool,
      description: 'A well-balanced forge hammer. Durable, but the haft splinters when hard used.',
    }));
    const toolId = upsertedTool.id;
    const parityNames = [
      'Arcane Forge',
      "Alchemist's Supplies",
      'Ley-Line Nexus',
      "Master's Anvil",
      'Moonwell',
      'Volcanic Vent',
      'Woodcarving Tools',
    ];
    for (const [index, label] of parityNames.entries()) {
      await csm.upsertTool(systemId, {
        id: `smoke-tool-studio-row-${index + 1}`,
        enabled: true,
        label,
        componentId: components[index % components.length].id,
        breakage: { mode: 'limitedUses', maxUses: 5 + index },
        checkBreakable: true,
        onBreak: { mode: index % 2 === 0 ? 'destroy' : 'flagBroken' },
        prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
        bonus: { enabled: false, expression: '' },
        repairRequirements: [],
      });
    }
    await rm.updateRecipe(recipeId, {
      toolIds: [...new Set([...(recipe.toolIds || []), toolId])],
      toolBonusModes: { ...(recipe.toolBonusModes || {}), [toolId]: 'highestOnly' },
    }, { allowIncomplete: true });
    const registered = csm.getSystem(systemId).tools.find((tool) => tool.id === toolId);
    const stampedToolId = source.getFlag('fabricate', 'fabricate.roles')?.[systemId]?.toolId;
    if (!registered || stampedToolId !== toolId) {
      throw new Error(`Tool Studio Item registration did not stamp roles.${systemId}.toolId`);
    }
    await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    return {
      ...restore,
      toolId,
      sourceItemUuid: source.uuid,
      replacementSourceItemId: replacementSource.id,
      replacementSourceItemUuid: replacementSource.uuid,
      uncachedReplacementUuid: `Compendium.dnd5e.items.Item.${uncached._id}`,
    };
  }, { systemId, recipeId });
}

async function restoreToolStudioFixture(page, { systemId, recipeId, fixture }) {
  if (!fixture) return;
  await page.evaluate(async ({ systemId, recipeId, fixture }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    await globalThis.__fabricateSmokeManagerApp?._adminStore?.discardToolDraft?.();
    await csm.updateSystem(systemId, {
      tools: fixture.tools,
      toolBreakage: fixture.toolBreakage,
    });
    // Character prerequisites are world scope; restore the pre-fixture world list rather than a
    // system-scoped field (see the matching comment in `setupToolStudioFixture`).
    await game.settings.set('fabricate', 'characterLibraries', {
      ...(game.settings.get('fabricate', 'characterLibraries') || {}),
      characterPrerequisites: fixture.characterPrerequisites,
    });
    await rm.updateRecipe(recipeId, {
      toolIds: fixture.recipeToolIds,
      toolBonusModes: fixture.recipeToolBonusModes,
    }, { allowIncomplete: true });
    const source = await fromUuid(fixture.sourceItemUuid);
    if (source) {
      await source.unsetFlag('fabricate', 'fabricate.roles');
      if (fixture.sourceRoles) await source.setFlag('fabricate', 'fabricate.roles', fixture.sourceRoles);
      if (fixture.sourceCreated) await source.delete();
    }
    const replacementSource = await fromUuid(fixture.replacementSourceItemUuid);
    if (replacementSource && fixture.replacementSourceCreated) await replacementSource.delete();
    await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
  }, { systemId, recipeId, fixture });
}

async function verifyToolStudioLiveReplacement(page, { systemId, recipeId, actorId, fixture }) {
  return page.evaluate(async ({ systemId, recipeId, actorId, fixture }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const actor = game.actors.get(actorId);
    const source = await fromUuid(fixture.sourceItemUuid);
    const system = csm.getSystem(systemId);
    const tool = system.tools.find((entry) => entry.id === fixture.toolId);
    if (!actor || !source || !tool) throw new Error('Tool Studio replacement fixture did not resolve');
    if (game.packs.get('dnd5e.items')?.get(fixture.uncachedReplacementUuid.split('.').at(-1))) {
      throw new Error('Tool Studio direct replacement source was cached before awaited resolution');
    }
    await csm.upsertTool(systemId, {
      ...tool,
      breakage: { mode: 'breakageChance', breakageChance: 100 },
      onBreak: { mode: 'replaceWith', replacementTarget: { type: 'item', itemUuid: fixture.uncachedReplacementUuid } },
    });
    const itemData = source.toObject();
    delete itemData._id;
    itemData.name = 'Smoke Tool Studio Owned Sickle';
    foundry.utils.setProperty(itemData, `flags.fabricate.fabricate.roles.${systemId}.toolId`, fixture.toolId);
    const [owned] = await actor.createEmbeddedDocuments('Item', [itemData]);
    const order = [];
    const createdItems = [];
    const createdPayloads = [];
    const originalCreate = actor.createEmbeddedDocuments;
    const originalDelete = owned.delete;
    actor.createEmbeddedDocuments = async function (type, data, options) {
      order.push('create');
      createdPayloads.push(foundry.utils.deepClone(data));
      const created = await originalCreate.call(this, type, data, options);
      createdItems.push(...created);
      return created;
    };
    owned.delete = async function (options) {
      order.push('delete');
      return originalDelete.call(this, options);
    };
    let evidence;
    try {
      evidence = await game.fabricate.getCraftingEngine()._applyToolBreakage(
        rm.getRecipe(recipeId),
        [{ tool: csm.getSystem(systemId).tools.find((entry) => entry.id === fixture.toolId), item: owned, breakable: true }],
        { forceBreak: true, authority: 'toolSpecific' }
      );
    } finally {
      actor.createEmbeddedDocuments = originalCreate;
      if (createdItems.length > 0) {
        await actor.deleteEmbeddedDocuments('Item', createdItems.map((item) => item.id)).catch(() => {});
      }
    }
    const created = createdItems[0];
    const createdData = createdPayloads[0]?.[0];
    const componentIdentity = foundry.utils.getProperty(createdData, `flags.fabricate.fabricate.roles.${systemId}.componentId`);
    const sourceId = foundry.utils.getProperty(createdData, 'flags.core.sourceId');
    if (order.join(',') !== 'create,delete') throw new Error(`Tool replacement order was ${order.join(',')}`);
    if (createdData?.system?.quantity !== 1) throw new Error('Tool replacement did not create quantity one');
    if (sourceId !== fixture.uncachedReplacementUuid) throw new Error('Tool replacement did not preserve direct Item source identity');
    if (componentIdentity) throw new Error('Direct Item replacement fabricated Component identity');
    if (actor.items.get(owned.id)) throw new Error('Original Tool remained after successful replacement');
    if (evidence?.[0]?.broken !== true || created?.documentName !== 'Item') {
      throw new Error('Tool replacement did not report a successful broken Item replacement');
    }
    return { order, sourceId, quantity: createdData.system.quantity };
  }, { systemId, recipeId, actorId, fixture });
}

export default {
  id: 'tools',
  phase: 'phase-D0',
  section: 'tools',
  publishes: [],
  consumes: ['cleanup', 'craftingSetup'],
  async run(ctx) {
    const { page, results } = ctx;
    const { cleanup, craftingSetup } = ctx.shared;
          // `runFixturedScreenshotSection` owns the setup → exercise → finally-restore scaffold
          // this section and the Knowledge section below both need; only the callbacks differ.
          await runFixturedScreenshotSection({
            results,
            step: 'tool-studio-evidence',
            rethrow: true,
            setup: () => setupToolStudioFixture(page, {
              systemId: craftingSetup.systemId,
              recipeId: craftingSetup.healingPotionRecipeId,
            }),
            exercise: async (fixture) => {
              await exerciseToolStudioPointerTargets(ctx, {
                systemId: craftingSetup.systemId,
                recipeName: 'Brew Healing Potion',
                fixture,
              });
              await verifyToolStudioLiveReplacement(page, {
                systemId: craftingSetup.systemId,
                recipeId: craftingSetup.healingPotionRecipeId,
                actorId: cleanup.crafterId,
                fixture,
              });
            },
            restore: (fixture) => restoreToolStudioFixture(page, {
              systemId: craftingSetup.systemId,
              recipeId: craftingSetup.healingPotionRecipeId,
              fixture,
            }),
          });
  }
};

/** Persist production-valid check variants before the View Lab mounts the player app. */
import { resolveModifierLibrary } from '../../src/systems/characterLibraries.js';
import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';

export async function seedRollPromptFixture(world, state) {
  if (!state || !world) return;
  const manager = world.fabricate.craftingSystemManager;
  if (state === 'basic' || state === 'advantage' || state === 'light') {
    const system = manager.getSystem('lab-smithing');
    await manager.updateSystem(system.id, {
      craftingCheck: {
        ...system.craftingCheck,
        simple: {
          ...system.craftingCheck.simple,
          rollFormula: state === 'advantage' ? '1d20 + @abilities.int.mod' : '2d6 + @abilities.int.mod',
        },
      },
    });
  }
  if (state === 'under') await seedRollUnder(world);
  if (state === 'salvage-under' || state === 'salvage-under-attribute') {
    await seedSalvageUnder(world, state);
  }
  if (state === 'count') await seedCount(manager);
  if (state === 'pick-one' || state === 'overflow') {
    const system = manager.getSystem('lab-herbalism');
    await manager.updateSystem(system.id, {
      craftingCheck: {
        ...system.craftingCheck,
        maxModifierPicks: state === 'pick-one' ? 1 : 2,
      },
    });
  }
  if (state === 'compact') await seedCompactChoice(world);
  if (state === 'overflow') {
    const store = world.fabricate.characterLibrariesStore;
    const herbalism = manager.getSystem('lab-herbalism');
    const longNames = resolveModifierLibrary(herbalism, store)
      .filter((entry) => entry.id?.startsWith('hb-mod-'))
      .map((entry) => ({
      ...entry,
      label: `${entry.label} of the longest remembered herbalist tradition`,
      }));
    const editedIds = new Set(longNames.map((entry) => entry.id));
    await store.saveModifiers([
      ...longNames,
      ...store.listModifiers().filter((entry) => !editedIds.has(entry.id)),
    ]);
  }
}

/**
 * Frame 29: Sera Vane's Smithing level of 12, less the recipe's Hard Work tier of -2, is the
 * target a bare `1d20` must stay at or under, which the one applied modifier raises by 1.
 */
async function seedRollUnder(world) {
  const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  crafter.name = 'Sera Vane';
  crafter.system.skills = { ...crafter.system.skills, smith: { level: 12 } };
  const store = world.fabricate.characterLibrariesStore;
  await store.saveModifiers([
    { id: 'lab-mod-steady-hands', label: 'Steady hands', icon: 'fa-solid fa-hand', expression: '1' },
    ...store.listModifiers(),
  ]);
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-smithing');
  const simple = system.craftingCheck.simple;
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['lab-mod-steady-hands'],
      simple: {
        ...simple,
        rollFormula: '1d20',
        tiers: [...(simple.tiers ?? []), { id: 'lab-tier-hard-work', name: 'Hard Work', adjustment: -2 }],
        evaluation: normalizeCheckEvaluation({
          product: 'sum',
          direction: 'under',
          target: { source: 'attribute', expression: '@skills.smith.level' },
        }),
      },
    },
  });
  await world.fabricate.recipeManager.updateRecipe('sm-r-horseshoe', {
    name: 'Hard Work',
    checkTierId: 'lab-tier-hard-work',
  });
}

/**
 * Bulk salvage rows against roll-under checks: Smithing's simple salvage stays at or under a fixed
 * 12, and Runework's routed one under a fixed target (the slag's own override, 11) or, in
 * `salvage-under-attribute`, under the salvager's Intelligence score, which differs per actor.
 */
async function seedSalvageUnder(world, state) {
  const under = (target) =>
    normalizeCheckEvaluation({ product: 'sum', direction: 'under', ...(target && { target }) });
  const manager = world.fabricate.craftingSystemManager;
  const smithing = manager.getSystem('lab-smithing');
  await manager.updateSystem(smithing.id, {
    salvageCraftingCheck: {
      ...smithing.salvageCraftingCheck,
      enabled: true,
      simple: { rollFormula: '1d20', dc: 12, thresholdMode: 'meet', evaluation: under() },
    },
  });
  const runework = manager.getSystem('lab-runework');
  const attribute = state === 'salvage-under-attribute';
  await manager.updateSystem(runework.id, {
    salvageCraftingCheck: {
      ...runework.salvageCraftingCheck,
      routed: {
        ...runework.salvageCraftingCheck.routed,
        rollFormula: '1d20',
        evaluation: under(attribute && { source: 'attribute', expression: '@abilities.int.value' }),
      },
    },
  });
}

/**
 * Smithing's simple slot counts successes: six d10s, each qualifying at 8 or more, two needed.
 * The retained roll formula stays authored and inert, so the prompt must not show it.
 */
async function seedCount(manager) {
  const system = manager.getSystem('lab-smithing');
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      simple: {
        ...system.craftingCheck.simple,
        evaluation: normalizeCheckEvaluation({
          product: 'count',
          direction: 'over',
          pool: { die: 10, base: '6', threshold: '8', required: 2, modifierDestination: 'pool' },
        }),
      },
    },
  });
}

/** Nine long-named world modifiers Herbalism's check offers, so the prompt meets the height cap. */
async function seedCompactChoice(world) {
  const store = world.fabricate.characterLibrariesStore;
  const notes = Array.from({ length: 9 }, (_, index) => ({
    id: `hb-mod-field-note-${index + 1}`,
    label: `Field note ${index + 1} from the longest remembered herbalist tradition`,
    icon: 'fa-solid fa-leaf',
    expression: String(index % 3),
  }));
  await store.saveModifiers([...notes, ...store.listModifiers()]);
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-herbalism');
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      defaultModifierIds: [
        ...system.craftingCheck.defaultModifierIds,
        ...notes.map((note) => note.id),
      ],
    },
  });
}

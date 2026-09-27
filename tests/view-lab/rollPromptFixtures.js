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
  if (state === 'under') await seedRollUnder(manager);
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

/** Smithing's simple slot rolls a bare `1d20` that must stay at or under its fixed target. */
async function seedRollUnder(manager) {
  const system = manager.getSystem('lab-smithing');
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      simple: {
        ...system.craftingCheck.simple,
        rollFormula: '1d20',
        evaluation: normalizeCheckEvaluation({ product: 'sum', direction: 'under' }),
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

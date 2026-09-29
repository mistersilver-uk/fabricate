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
  if (Object.hasOwn(EVIDENCE_STATES, state)) await seedCheckEvidence(world, EVIDENCE_STATES[state]);
  if (Object.hasOwn(SALVAGE_CHECKS, state)) await seedSalvageChecks(world, state);
  if (state === 'count' || state === 'count-threshold') await seedCount(world, state);
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
  await nameFrameSubject(world, { name: 'Hard Work', checkTierId: 'lab-tier-hard-work' });
}

/**
 * Issue 2005's player result box, chat card and prompt states. Each outcome is forced by formula
 * rather than by seed: frame 29's target of 11 holds any `1d4` and no `1d4 + 20`. `chatOutput`
 * narrates the craft or salvage so a `chatLog=1` case can photograph its result card.
 */
const EVIDENCE_STATES = {
  'under-evidence': { rollFormula: '1d4' },
  'under-evidence-fail': { rollFormula: '1d4 + 20' },
  'under-bonus-off': { rollFormula: '1d20', offerSituationalBonus: false },
  // Strictly under the target, and the player picking one modifier rather than every one applying.
  'under-strict': { rollFormula: '1d20', thresholdMode: 'exceed' },
  'under-picks': { rollFormula: '1d20', picks: true },
  'over-attribute': { rollFormula: '1d20', direction: 'over' },
  // A path the crafter has no value at, so the check card says so rather than name a target.
  'under-unresolved': { rollFormula: '1d20', expression: '@skills.missing.level' },
  'over-evidence': { control: true },
  'salvage-under-evidence': { salvage: true },
  // Issue 2092: the same fixed target, missed by a wide margin, so the panel's failure box
  // states its evidence rows instead of clearing to a toast.
  'salvage-under-evidence-fail': { salvage: true, rollFormula: '1d4 + 20' },
};

async function seedCheckEvidence(
  world,
  { rollFormula, offerSituationalBonus, direction, expression, control, salvage, thresholdMode, picks }
) {
  const manager = world.fabricate.craftingSystemManager;
  if (!control && !salvage) await seedRollUnder(world);
  if (picks) await seedPlayerPicks(world);
  const system = manager.getSystem('lab-smithing');
  const simple = system.craftingCheck.simple;
  const evaluation =
    direction || expression
      ? normalizeCheckEvaluation({
          ...simple.evaluation,
          ...(direction && { direction }),
          ...(expression && { target: { ...simple.evaluation.target, expression } }),
        })
      : simple.evaluation;
  await manager.updateSystem(system.id, {
    features: { ...system.features, chatOutput: true },
    ...(!control &&
      !salvage && {
        craftingCheck: {
          ...system.craftingCheck,
          simple: {
            ...simple,
            rollFormula,
            evaluation,
            ...(offerSituationalBonus === false && { offerSituationalBonus }),
            ...(thresholdMode && { thresholdMode }),
          },
        },
      }),
    ...(salvage && {
      salvageCraftingCheck: {
        ...system.salvageCraftingCheck,
        enabled: true,
        // The passed formula overrides the default `1d4` (issue 2092's failing case forces a
        // wide miss against the fixed target); every other salvage evidence case keeps `1d4`.
        simple: {
          rollFormula: rollFormula || '1d4',
          dc: 12,
          thresholdMode: 'meet',
          evaluation: under(),
        },
      },
    }),
  });
}

/** Frame 29's modifier and a second, "Sure grip +2", of which the player picks one. */
async function seedPlayerPicks(world) {
  const store = world.fabricate.characterLibrariesStore;
  await store.saveModifiers([
    { id: 'lab-mod-sure-grip', label: 'Sure grip', icon: 'fa-solid fa-hand-fist', expression: '2' },
    ...store.listModifiers(),
  ]);
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-smithing');
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      defaultModifierPolicy: 'playerPicks',
      maxModifierPicks: 1,
      defaultModifierIds: ['lab-mod-steady-hands', 'lab-mod-sure-grip'],
    },
  });
}

/** The frames' "Sera Vane · {recipe}" subtitle: the crafter the player app opens, and the horseshoe. */
async function nameFrameSubject(world, recipeUpdates) {
  world.actorList.find((actor) => actor.id === 'lab-actor-brenna').name = 'Sera Vane';
  await world.fabricate.recipeManager.updateRecipe('sm-r-horseshoe', recipeUpdates);
}

const under = (target) =>
  normalizeCheckEvaluation({ product: 'sum', direction: 'under', ...(target && { target }) });
const pooled = (required) =>
  normalizeCheckEvaluation({
    product: 'count',
    direction: 'over',
    pool: { die: 10, base: '4', threshold: '8', required, modifierDestination: 'pool' },
  });

/** Smithing's simple salvage evaluation, then Runework's routed one, for each bulk salvage state. */
const SALVAGE_CHECKS = {
  'salvage-under': () => [under(), under()],
  'salvage-under-attribute': () => [
    under(),
    under({ source: 'attribute', expression: '@abilities.int.value' }),
  ],
  'salvage-count': () => [pooled(2), pooled(1)],
  // Smithing stays at or under the salvager's Smithing level, so its Salvage tab names a source.
  'salvage-under-skill': () => [
    under({ source: 'attribute', expression: '@skills.smith.level' }),
    under(),
  ],
};

/**
 * Bulk salvage rows. Roll-under: Smithing stays at or under a fixed 12, and Runework under a fixed
 * target (the slag's own override, 11) or the salvager's Intelligence score, which differs per
 * actor. Count: two successes needed, then one, and every modifier adds dice.
 */
async function seedSalvageChecks(world, state) {
  const [smithingEvaluation, runeworkEvaluation] = SALVAGE_CHECKS[state]();
  const salvager = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  salvager.system.skills = { ...salvager.system.skills, smith: { level: 12 } };
  const rollFormula = smithingEvaluation.product === 'count' ? '' : '1d20';
  const manager = world.fabricate.craftingSystemManager;
  const smithing = manager.getSystem('lab-smithing');
  await manager.updateSystem(smithing.id, {
    salvageCraftingCheck: {
      ...smithing.salvageCraftingCheck,
      enabled: true,
      simple: { rollFormula, dc: 12, thresholdMode: 'meet', evaluation: smithingEvaluation },
    },
  });
  const runework = manager.getSystem('lab-runework');
  await manager.updateSystem(runework.id, {
    salvageCraftingCheck: {
      ...runework.salvageCraftingCheck,
      routed: { ...runework.salvageCraftingCheck.routed, rollFormula, evaluation: runeworkEvaluation },
    },
  });
}

/**
 * Smithing's simple slot counts successes with one applied modifier, "Steady hands +1". `count` is
 * frame 35: six d10s, each qualifying at 8 or more, the best face exploding and the worst
 * cancelling. `count-threshold` is frame 30: two d20s, each qualifying at or under a threshold
 * read from the character, and modifiers move the threshold. Both need two successes; the retained
 * roll formula stays authored and inert, so the prompt must not show it. The subtitles are the
 * frames': "Sera Vane · Fine Craft" and "Sera Vane · Complex Work".
 */
async function seedCount(world, state) {
  const store = world.fabricate.characterLibrariesStore;
  await store.saveModifiers([
    { id: 'lab-mod-steady-hands', label: 'Steady hands', icon: 'fa-solid fa-hand', expression: '1' },
    ...store.listModifiers().filter((entry) => entry.id !== 'lab-mod-steady-hands'),
  ]);
  const pool =
    state === 'count'
      ? {
          die: 10,
          base: '6',
          threshold: '8',
          explode: { enabled: true, faces: { kind: 'best' } },
          cancel: { enabled: true, faces: { kind: 'worst' } },
          modifierDestination: 'pool',
        }
      : { die: 20, base: '2', threshold: '@abilities.int.mod + 11', modifierDestination: 'threshold' };
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-smithing');
  await manager.updateSystem(system.id, {
    craftingCheck: {
      ...system.craftingCheck,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['lab-mod-steady-hands'],
      simple: {
        ...system.craftingCheck.simple,
        evaluation: normalizeCheckEvaluation({
          product: 'count',
          direction: state === 'count' ? 'over' : 'under',
          pool: { ...pool, required: 2 },
        }),
      },
    },
  });
  await nameFrameSubject(world, { name: state === 'count' ? 'Fine Craft' : 'Complex Work' });
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

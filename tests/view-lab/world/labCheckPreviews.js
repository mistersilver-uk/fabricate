/**
 * The success-counting Checks Studio states (issue 2004) and the roll-under recipe states (issue
 * 2005), each written onto Karrun Forgecraft's crafting, salvage and gathering checks before the
 * runtime boots, so the real normalizer reads them. Count authoring is issue 2006's, so the lab
 * seeds what no control can author yet.
 */
import { LAB_SYSTEM_IDS } from './labContent.js';

const BEST = Object.freeze({ enabled: true, faces: { kind: 'best' } });
const WORST = Object.freeze({ enabled: true, faces: { kind: 'worst' } });

const count = (direction, pool) => ({ product: 'count', direction, pool });
const tier = (id, name, successes) => ({ id, name, dc: 12, successes });
const outcome = (id, name, dc, success) => ({ id, name, dc, success });

/** A rolling modifier whose separately rolled die explodes, so no chart can enumerate it. */
const KNACK = Object.freeze({
  id: 'lab-mod-knack',
  label: 'Knack',
  icon: 'fa-solid fa-hand-sparkles',
  expression: '1d4x',
});

/**
 * Frames 06, 07 and 13: Idrin's six d10s at 8 or better, the salvage two d20s at or under 13, and
 * gathering's six d10s routed Ruined to Masterwork.
 */
const DICE_POOL = {
  resolutionMode: 'simple',
  modifiers: [KNACK],
  crafting: {
    simple: {
      evaluation: count('over', {
        die: 10,
        base: '@skills.smith.rank + 2',
        threshold: '8',
        required: 2,
        modifierDestination: 'pool',
        explode: BEST,
        cancel: WORST,
      }),
      tiers: [
        tier('lab-tier-simple-work', 'Simple Work', 1),
        tier('lab-tier-fine-craft', 'Fine Craft', 2),
        tier('lab-tier-masterwork', 'Masterwork', 4),
      ],
    },
  },
  salvage: count('under', {
    die: 20,
    base: '2',
    threshold: '13',
    required: 2,
    modifierDestination: 'threshold',
  }),
  gathering: {
    evaluation: count('over', {
      die: 10,
      base: '6',
      threshold: '8',
      required: 2,
      explode: BEST,
      cancel: WORST,
    }),
    relativeOutcomes: [
      outcome('lab-count-ruined', 'Ruined', -1, false),
      outcome('lab-count-success', 'Success', 0, true),
      outcome('lab-count-fine', 'Fine', 1, true),
      outcome('lab-count-masterwork', 'Masterwork', 3, true),
    ],
  },
};

/**
 * Frames 09, 40 and 41: a progressive pool, a salvage pool of no dice, and a gathering pool that
 * can never qualify while every face cancels, a deterministic botch.
 */
const DICE_POOL_EXTENDED = {
  resolutionMode: 'progressive',
  crafting: {
    progressive: {
      evaluation: count('over', {
        die: 10,
        base: '6',
        threshold: '8',
        explode: BEST,
        cancel: WORST,
      }),
    },
  },
  salvage: count('over', { die: 10, base: '0', threshold: '8', required: 1, zeroPoolFails: true }),
  gathering: {
    evaluation: count('over', {
      die: 6,
      base: '3',
      threshold: '7',
      required: 1,
      cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
    }),
    relativeOutcomes: [
      outcome('lab-count-failure', 'Failure', -1, false),
      outcome('lab-count-success', 'Success', 0, true),
    ],
  },
};

/**
 * Frames 07, 08, 16 and 17: two d20s against four recipe tiers, one needing more successes than
 * dice (additional dice wait for issue 2008), a threshold that rolls dice and a pool that does.
 */
const DICE_POOL_FAULTS = {
  resolutionMode: 'simple',
  crafting: {
    simple: {
      evaluation: count('under', {
        die: 20,
        base: '2',
        threshold: '13',
        required: 2,
        modifierDestination: 'threshold',
        additionalDice: {
          enabled: true,
          source: 'path',
          path: 'system.resources.momentum.value',
          max: 1,
        },
      }),
      tiers: [
        tier('lab-tier-complex-work', 'Complex Work', 2),
        tier('lab-tier-arcane-work', 'Arcane Work', 3),
        tier('lab-tier-impossible-work', 'Impossible Work', 4),
        tier('lab-tier-unset-work', 'Unset Work', null),
      ],
    },
  },
  salvage: count('under', { die: 20, base: '2', threshold: '1d4 + 6', required: 1 }),
  gathering: {
    evaluation: count('over', { die: 10, base: '2d4', threshold: '8', required: 1 }),
    relativeOutcomes: [
      outcome('lab-count-failure', 'Failure', -1, false),
      outcome('lab-count-success', 'Success', 0, true),
    ],
  },
};

/*
 * Issue 2005 (T6): the crafting check graded roll-under against a fixed target or a character
 * value, for the recipe screens' Check tier select and check pill. The tiers keep Smithing's ids.
 */
const sumUnder = (target) => ({ product: 'sum', direction: 'under', target });
const SMITH_RANK = '@skills.smith.rank';
const underTier = (id, name, dc, adjustment = null) => ({ id, name, dc, adjustment });
const rollUnder = (target, tiers) => ({
  resolutionMode: 'simple',
  crafting: { simple: { rollFormula: '1d20', dc: 12, evaluation: sumUnder(target), tiers } },
  salvage: sumUnder({ source: 'fixed' }),
  gathering: {
    evaluation: sumUnder({ source: 'fixed' }),
    relativeOutcomes: [
      outcome('lab-under-failure', 'Failure', -5, false),
      outcome('lab-under-success', 'Success', 0, true),
    ],
  },
});
const ROLL_UNDER_FIXED = rollUnder({ source: 'fixed' }, [
  underTier('sm-tier-apprentice', 'Apprentice work', 14),
  underTier('sm-tier-masterwork', 'Masterwork', 8),
]);
const ROLL_UNDER_ADD = rollUnder(
  { source: 'attribute', expression: SMITH_RANK, adjustmentKind: 'add', baseAdjustment: 0 },
  [
    underTier('sm-tier-apprentice', 'Apprentice work', 10, 2),
    underTier('sm-tier-masterwork', 'Masterwork', 18, -2),
  ]
);
const ROLL_UNDER_MULTIPLY = rollUnder(
  { source: 'attribute', expression: SMITH_RANK, adjustmentKind: 'multiply', baseAdjustment: 1 },
  [
    underTier('sm-tier-apprentice', 'Apprentice work', 10, 1),
    underTier('sm-tier-masterwork', 'Masterwork', 18, 0.5),
  ]
);

/** The `checkPreviewState` query values and the checks each seeds. */
export const LAB_CHECK_PREVIEW_STATES = Object.freeze({
  'dice-pool': DICE_POOL,
  'dice-pool-extended': DICE_POOL_EXTENDED,
  'dice-pool-faults': DICE_POOL_FAULTS,
  'roll-under-fixed': ROLL_UNDER_FIXED,
  'roll-under-add': ROLL_UNDER_ADD,
  'roll-under-multiply': ROLL_UNDER_MULTIPLY,
});

/** Karrun Forgecraft's checks as `state` authors them; the retained roll formula is blank. */
function seedChecks(system, state) {
  const crafting = system.craftingCheck;
  system.resolutionMode = state.resolutionMode;
  system.modifiers = [...(system.modifiers ?? []), ...(state.modifiers ?? [])];
  system.craftingCheck = {
    ...crafting,
    defaultModifierPolicy: 'addAll',
    defaultModifierIds: [],
    simple: { ...crafting.simple, rollFormula: '', thresholdMode: 'meet', ...state.crafting.simple },
    progressive: { rollFormula: '', ...state.crafting.progressive },
  };
  system.salvageResolutionMode = 'simple';
  system.salvageCraftingCheck = {
    ...system.salvageCraftingCheck,
    enabled: true,
    simple: { rollFormula: '', dc: 12, thresholdMode: 'meet', evaluation: state.salvage },
  };
  system.gatheringCraftingCheck = {
    ...system.gatheringCraftingCheck,
    enabled: true,
    routed: { rollFormula: '', dc: 0, type: 'relative', thresholdMode: 'meet', ...state.gathering },
  };
}

/**
 * Seed a `checkPreviewState` onto the lab content before the runtime boots: the checks, gathering's
 * routed economy, and Idrin's smithing rank of 4 (six dice), which Vosk lacks.
 */
export function seedCheckPreviewState(content, actors, stateId) {
  const state = LAB_CHECK_PREVIEW_STATES[stateId];
  if (!state) return;
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.SMITHING);
  seedChecks(system, state);
  const gathering = content.gatheringConfig.systems[LAB_SYSTEM_IDS.SMITHING];
  gathering.economy = { ...gathering.economy, resolutionMode: 'routed' };
  const idrin = actors.find((actor) => actor.id === 'lab-actor-idrin');
  idrin.system.skills = { ...idrin.system.skills, smith: { rank: 4 } };
}

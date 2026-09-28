/**
 * The success-counting Checks Studio states (issue 2004), each written onto Karrun Forgecraft's
 * crafting, salvage and gathering checks before the runtime boots, so the real normalizer reads
 * them. Count authoring is issue 2006's, so the lab seeds what no control can author yet.
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

/** A trigger forcing `outcome`, by default on every roll (issue 2080). */
const EVERY_ROLL = Object.freeze({ type: 'rollTotal', operator: '>=', value: -1000 });
const forceOn = (id, outcome, condition = EVERY_ROLL) => ({
  id,
  condition,
  outcome,
  breakTools: false,
  tierStep: { mode: 'none', steps: 1, tierId: null },
});

/** Frame 13 with a trigger forcing gathering's routed count to its worst failing tier. */
const DICE_POOL_FORCED = {
  ...DICE_POOL,
  gathering: {
    ...DICE_POOL.gathering,
    checkBreakage: { triggers: [forceOn('lab-trig-force-fail', 'failure')] },
  },
};

/** Frame 40's botch, rescued by a trigger forcing success on a net below zero (ruling 3). */
const DICE_POOL_RESCUED = {
  ...DICE_POOL_EXTENDED,
  gathering: {
    ...DICE_POOL_EXTENDED.gathering,
    checkBreakage: {
      triggers: [
        forceOn('lab-trig-rescue', 'success', { type: 'rollTotal', operator: '<', value: 0 }),
      ],
    },
  },
};

/**
 * A summed gathering check routed Ruined to Fine that the lab's first 20 fails at DC 30, with a
 * trigger breaking the required tools on that natural 20; the crafting and salvage checks stay.
 */
const GATHERING_OVER = {
  gathering: {
    rollFormula: '1d20 + @prof',
    dc: 30,
    relativeOutcomes: [
      outcome('lab-sum-ruined', 'Ruined', -10, false),
      outcome('lab-sum-flawed', 'Flawed', -5, false),
      outcome('lab-sum-success', 'Success', 0, true),
      outcome('lab-sum-fine', 'Fine', 5, true),
    ],
    checkBreakage: {
      triggers: [
        {
          id: 'lab-trig-break-on-20',
          condition: {
            type: 'diceGroup',
            groupId: 0,
            aggregate: 'anyDie',
            operator: '==',
            value: 20,
          },
          outcome: 'none',
          breakTools: true,
          tierStep: { mode: 'none', steps: 1, tierId: null },
        },
      ],
    },
  },
};

/** The `checkPreviewState` query values and the checks each seeds. */
export const LAB_CHECK_PREVIEW_STATES = Object.freeze({
  'dice-pool': DICE_POOL,
  'dice-pool-extended': DICE_POOL_EXTENDED,
  'dice-pool-faults': DICE_POOL_FAULTS,
  'dice-pool-forced': DICE_POOL_FORCED,
  'dice-pool-rescued': DICE_POOL_RESCUED,
  'gathering-over': GATHERING_OVER,
});

/** Karrun Forgecraft's crafting and salvage checks as `state` authors them, formula blank. */
function seedCraftingAndSalvage(system, state) {
  const crafting = system.craftingCheck;
  system.resolutionMode = state.resolutionMode;
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
}

/** Karrun Forgecraft's checks as `state` authors them; a state with no crafting keeps its own. */
function seedChecks(system, state) {
  system.modifiers = [...(system.modifiers ?? []), ...(state.modifiers ?? [])];
  if (state.crafting) seedCraftingAndSalvage(system, state);
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

/**
 * Issue 2006's executed count states, each deterministic by construction rather than by seed: a
 * threshold every face meets or none can, and a cancel every face triggers. Smithing's crafting or
 * salvage check counts successes with no modifier, so nothing moves the pool or the threshold.
 */
import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';

/** Every d6 meets 1 and explodes once, so two dice net four; two needed. */
const PASS = {
  die: 6,
  base: '2',
  threshold: '1',
  required: 2,
  explode: { enabled: true, faces: { kind: 'from', value: 1 }, once: true },
};
/** No d6 reaches 7; one needed. */
const FAIL = { die: 6, base: '2', threshold: '7', required: 1 };
/** No d6 reaches 7 and every face cancels, so three dice net −3. */
const BOTCH = {
  die: 6,
  base: '3',
  threshold: '7',
  required: 1,
  cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
};
/** A pool of no dice, which fails without rolling. */
const ZERO = { die: 6, base: '0', threshold: '4', required: 1, zeroPoolFails: true };

/** The `rollPromptState` values, each naming the slot it counts on and its pool. */
export const COUNT_RESULT_STATES = Object.freeze({
  'count-result-pass': { slot: 'crafting', pool: PASS },
  'count-result-fail': { slot: 'crafting', pool: FAIL },
  'count-result-botch': { slot: 'crafting', pool: BOTCH },
  'count-result-zero': { slot: 'crafting', pool: ZERO },
  'salvage-count-result': { slot: 'salvage', pool: PASS },
  // The horseshoe's recipe tier needs one success where the pool needs two.
  'count-result-descriptor': {
    slot: 'crafting',
    pool: PASS,
    tier: { id: 'lab-tier-quick-work', name: 'Quick Work', dc: 12, successes: 1 },
  },
});

const counted = (pool) =>
  normalizeCheckEvaluation({ product: 'count', direction: 'over', pool });

/** Persist one state's check on Smithing before the player app mounts. */
export async function seedCountResult(world, state) {
  const { slot, pool, tier } = COUNT_RESULT_STATES[state];
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-smithing');
  const check =
    slot === 'crafting'
      ? {
          craftingCheck: {
            ...system.craftingCheck,
            defaultModifierPolicy: 'addAll',
            defaultModifierIds: [],
            simple: {
              ...system.craftingCheck.simple,
              thresholdMode: 'meet',
              evaluation: counted(pool),
              ...(tier && { tiers: [...(system.craftingCheck.simple.tiers ?? []), tier] }),
            },
          },
        }
      : {
          salvageCraftingCheck: {
            ...system.salvageCraftingCheck,
            enabled: true,
            simple: { rollFormula: '', dc: 12, thresholdMode: 'meet', evaluation: counted(pool) },
          },
        };
  // `chatOutput` narrates the craft, so a `chatLog=1` case can photograph its result card.
  await manager.updateSystem(system.id, {
    ...check,
    features: { ...system.features, chatOutput: true },
  });
  if (tier) await world.fabricate.recipeManager.updateRecipe('sm-r-horseshoe', { checkTierId: tier.id });
}

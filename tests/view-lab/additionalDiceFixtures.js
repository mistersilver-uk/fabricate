/**
 * Issue 2008's additional-dice prompt and result states: the horseshoe's simple crafting check
 * counting two d20s at or under 13 (frame 30), paid from Sera Vane's stored Momentum, and the
 * bulk salvage batches over Smithing and Runework. The real engine reads every budget from the lab
 * Actor, so each state stamps the value, the active effect or the permission it needs.
 */
import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';

import { LAB_MACRO_UUIDS } from './world/labMacros.js';

const MOMENTUM_PATH = 'system.resources.momentum.value';
const FOCUS_PATH = 'system.resources.focus.value';

/** The pool's additional dice: one per roll from Momentum unless a state says otherwise. */
const momentum = (overrides = {}) => ({
  enabled: true,
  source: 'path',
  path: MOMENTUM_PATH,
  max: 1,
  label: 'Momentum',
  ...overrides,
});

/** Frame 30's two d20s at or under 13, `required` successes needed. */
const pool = (required, overrides = {}) => ({
  die: 20,
  base: '2',
  threshold: '13',
  required,
  modifierDestination: 'pool',
  additionalDice: momentum(),
  ...overrides,
});

/** A trigger forcing success on every roll: an automatic success that rescues (decision 16). */
const AUTOMATIC_SUCCESS = Object.freeze({
  id: 'lab-trig-automatic-success',
  condition: { type: 'rollTotal', operator: '>=', value: -1000 },
  outcome: 'success',
  breakTools: false,
  tierStep: { mode: 'none', steps: 1, tierId: null },
});

/** A default modifier taking three dice, so even Advantage leaves the pool at zero (R4). */
const CRACKED_TOOLS = Object.freeze({
  id: 'lab-mod-cracked-tools',
  label: 'Cracked tools',
  icon: 'fa-solid fa-hammer',
  expression: '-3',
});

const NO_ADVANTAGE = Object.freeze({ countEnabled: false });

/**
 * The single-prompt states (frames 30 to 34): each names its pool, Sera Vane's Momentum (absent
 * when `stored` is undefined), and any advantage rule, trigger, modifier or actor stamp it adds.
 */
export const ADDITIONAL_DICE_PROMPT_STATES = Object.freeze({
  'count-additional': { pool: pool(2), stored: 2 },
  // Two dice may be bought, so Disadvantage's single die still reaches with both.
  'count-additional-floor': { pool: pool(3, { additionalDice: momentum({ max: 2 }) }), stored: 2 },
  'count-additional-insufficient': { pool: pool(3), stored: 0 },
  'count-additional-disadvantage-only': { pool: pool(2), stored: 0 },
  'count-additional-impossible': { pool: pool(5), stored: 2 },
  'count-additional-rescued': { pool: pool(5), stored: 2, triggers: [AUTOMATIC_SUCCESS] },
  'count-additional-explode': {
    pool: pool(5, { explode: { enabled: true, faces: { kind: 'best' }, once: false } }),
    stored: 2,
  },
  'count-additional-zero-pool': {
    pool: pool(2, { base: '1' }),
    stored: 0,
    modifier: CRACKED_TOOLS,
  },
  'count-additional-single-roll': { pool: pool(4), stored: 2, advantage: NO_ADVANTAGE },
  'count-additional-unaffordable': { pool: pool(1), stored: 0 },
  'count-additional-unlabelled': {
    pool: pool(2, { additionalDice: momentum({ label: '' }) }),
    stored: 2,
  },
  // One success needed, so an unavailable resource blocks no action.
  'count-additional-unreadable': { pool: pool(1), stored: undefined },
  'count-additional-overridden': { pool: pool(1), stored: 2, overridden: true },
  'count-additional-not-writable': { pool: pool(1), stored: 2, writable: false },
  'count-additional-macro-failed': {
    pool: pool(1, {
      additionalDice: momentum({
        source: 'macro',
        readMacroUuid: LAB_MACRO_UUIDS.chatMomentum,
        spendMacroUuid: LAB_MACRO_UUIDS.chatMomentum,
      }),
    }),
    stored: 2,
  },
  // Frame 39: every d20 qualifies at or under 20, so the bought third die meets the third success.
  'count-result-bought': {
    pool: pool(3, { threshold: '20' }),
    stored: 2,
    chatOutput: true,
  },
  // The same faces counted at or over 5, so the bought third die (a 1) misses on a neutral tile.
  'count-result-bought-miss': { pool: pool(2, { threshold: '5' }), stored: 2, direction: 'over' },
});

/** The bulk salvage batches (frame 36): Smithing's simple salvage, and Runework's routed one. */
export const ADDITIONAL_DICE_BULK_STATES = Object.freeze({
  'salvage-count-additional': { required: 2, stored: 2, runework: MOMENTUM_PATH },
  'salvage-count-additional-blocked': { required: 3, stored: 0 },
  'salvage-count-additional-blocked-all': { required: 4, stored: 0 },
  'salvage-count-additional-partial': { required: 1, stored: 0, airShardNeeds: 4 },
  'salvage-count-additional-mixed': { required: 2, stored: 2, runework: FOCUS_PATH },
  // Frame 39 on the salvage summary and both salvage cards: every d20 qualifies, three needed.
  'salvage-count-result-bought': { required: 3, stored: 2, threshold: '20', chatOutput: true },
});

/** Sera Vane, the crafter every prompt frame names, holding `stored` Momentum. */
function stampCrafter(world, { stored, overridden = false, writable = true }) {
  const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  crafter.name = 'Sera Vane';
  const { momentum: _held, ...resources } = crafter.system.resources ?? {};
  crafter.system.resources =
    stored === undefined ? resources : { ...resources, momentum: { value: stored } };
  if (overridden) crafter.overrides = { system: { resources: { momentum: { value: 5 } } } };
  // A system that narrows update permission; core's own OWNER test passes every lab owner.
  if (!writable) crafter.canUserModify = () => false;
}

const counted = (direction, poolSpec) =>
  normalizeCheckEvaluation({ product: 'count', direction, pool: poolSpec });

/** Persist one single-prompt state on Smithing's simple crafting check before the app mounts. */
export async function seedAdditionalDicePrompt(world, state) {
  const {
    pool: poolSpec,
    triggers,
    modifier,
    advantage,
    chatOutput,
    direction = 'under',
    ...actor
  } = ADDITIONAL_DICE_PROMPT_STATES[state];
  stampCrafter(world, actor);
  const store = world.fabricate.characterLibrariesStore;
  if (modifier) await store.saveModifiers([modifier, ...store.listModifiers()]);
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-smithing');
  const simple = system.craftingCheck.simple;
  await manager.updateSystem(system.id, {
    ...(chatOutput && { features: { ...system.features, chatOutput: true } }),
    craftingCheck: {
      ...system.craftingCheck,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: modifier ? [modifier.id] : [],
      simple: {
        ...simple,
        thresholdMode: 'meet',
        evaluation: counted(direction, poolSpec),
        ...(advantage && { advantage: { ...simple.advantage, ...advantage } }),
        ...(triggers && { checkBreakage: { ...simple.checkBreakage, triggers } }),
      },
    },
  });
  await world.fabricate.recipeManager.updateRecipe('sm-r-horseshoe', { name: 'Complex Work' });
}

/** Clear a component's salvage tools, so its bulk row is judged on its own pool (issue 2008). */
async function untool(manager, systemId, componentId, salvagePatch = {}) {
  const component = manager.getItems(systemId).find((entry) => entry.id === componentId);
  await manager.updateItem(systemId, componentId, {
    salvage: { ...component.salvage, toolIds: [], ...salvagePatch },
  });
}

/** Persist one bulk state: both salvage checks count, and each pays from its own path. */
export async function seedAdditionalDiceBulk(world, state) {
  const {
    required,
    stored,
    runework,
    airShardNeeds,
    threshold = '13',
    chatOutput,
  } = ADDITIONAL_DICE_BULK_STATES[state];
  stampCrafter(world, { stored });
  const manager = world.fabricate.craftingSystemManager;
  const salvagePool = pool(required, { threshold });
  const smithing = manager.getSystem('lab-smithing');
  await manager.updateSystem(smithing.id, {
    ...(chatOutput && { features: { ...smithing.features, chatOutput: true } }),
    salvageCraftingCheck: {
      ...smithing.salvageCraftingCheck,
      enabled: true,
      simple: {
        rollFormula: '',
        dc: 12,
        thresholdMode: 'meet',
        evaluation: counted('under', salvagePool),
      },
    },
  });
  await untool(manager, smithing.id, 'sm-longsword');
  await untool(manager, smithing.id, 'sm-air-shard', {
    ...(airShardNeeds && { successesOverride: airShardNeeds }),
  });
  if (!runework) return;
  const system = manager.getSystem('lab-runework');
  const additionalDice = momentum({ path: runework });
  await manager.updateSystem(system.id, {
    salvageCraftingCheck: {
      ...system.salvageCraftingCheck,
      routed: {
        ...system.salvageCraftingCheck.routed,
        rollFormula: '',
        evaluation: counted('under', { ...salvagePool, additionalDice }),
      },
    },
  });
}

/**
 * Runework's routed count check, read by the Journal's prepared prompt (`runeworkCheckMode`
 * `routed-count`), paying from Brenna's Momentum; `-unentitled` hides the recipe from her viewer,
 * so the authority redacts the prompt and the offer carries no reach (R3).
 */
export const ADDITIONAL_DICE_JOURNAL_STATES = Object.freeze({
  'journal-count-additional': { restricted: false },
  'journal-count-additional-unentitled': { restricted: true },
});

export async function seedAdditionalDiceJournal(world, state) {
  const { restricted } = ADDITIONAL_DICE_JOURNAL_STATES[state];
  const brenna = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  brenna.system.resources = { ...brenna.system.resources, momentum: { value: 2 } };
  const manager = world.fabricate.craftingSystemManager;
  const system = manager.getSystem('lab-runework');
  const routed = system.craftingCheck.routed;
  await manager.updateSystem(system.id, {
    ...(restricted && { visibilityMode: 'restricted' }),
    craftingCheck: {
      ...system.craftingCheck,
      routed: {
        ...routed,
        evaluation: normalizeCheckEvaluation({
          ...routed.evaluation,
          pool: { ...routed.evaluation.pool, additionalDice: momentum() },
        }),
      },
    },
  });
}

/**
 * Issue 2139 — the player listing's "check can't roll" verdict and the versioned descriptor's
 * `CHECK_TARGET_INVALID` refusal are one decision: the listing asks `craftingCheckRefuses`, the
 * engine `_versionedCheckTarget`, and both must agree on every row of this table.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveActiveCraftingCheckFormula } from '../src/systems/checkModifierResolver.js';
import { craftingCheckRefuses } from '../src/systems/craftingCheckRefusal.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

import { countEvaluation } from './helpers/countFixtures.js';

const SMITH = '@skills.smith.level';
const attribute = (direction, target = {}) => ({
  product: 'sum',
  direction,
  target: { source: 'attribute', expression: SMITH, ...target },
});
const SKILLED = { id: 'a', getRollData: () => ({ skills: { smith: { level: 12 } } }) };
const BARE = { id: 'a', getRollData: () => ({}) };
const RECIPE = { id: 'r', checkTierId: null };

const system = (resolutionMode, craftingCheck, extra = {}) => ({
  resolutionMode,
  craftingCheck: { simple: {}, routed: {}, progressive: {}, ...craftingCheck },
  ...extra,
});
const simple = (evaluation, extra = {}) => ({
  simple: { rollFormula: '1d20', dc: 12, evaluation, ...extra },
});
const routed = (type, evaluation) => ({
  routed: {
    type,
    rollFormula: '1d20',
    dc: 12,
    evaluation,
    relativeOutcomes: [],
    fixedOutcomes: [],
  },
});
const progressive = (evaluation) => ({ progressive: { rollFormula: '1d20', evaluation } });

const CASES = [
  [
    'simple, a character value the actor lacks',
    system('simple', simple(attribute('under'))),
    BARE,
    true,
  ],
  [
    'simple, a character value the actor has',
    system('simple', simple(attribute('under'))),
    SKILLED,
    false,
  ],
  [
    'routed relative, a character value the actor lacks',
    system('routedByCheck', routed('relative', attribute('over'))),
    BARE,
    true,
  ],
  [
    'routed fixed ranges read no target',
    system('routedByCheck', routed('fixed', attribute('over'))),
    BARE,
    false,
  ],
  [
    'the selected tier multiplies by zero',
    system(
      'simple',
      simple(attribute('under', { adjustmentKind: 'multiply' }), {
        tiers: [{ id: 't', name: 'Odd', adjustment: 0 }],
      })
    ),
    SKILLED,
    true,
    { ...RECIPE, checkTierId: 't' },
  ],
  [
    'progressive summed roll-under',
    system('progressive', progressive({ product: 'sum', direction: 'under' })),
    SKILLED,
    true,
  ],
  [
    'progressive count, a pool path the actor lacks',
    system('progressive', progressive(countEvaluation({ base: SMITH }))),
    BARE,
    true,
  ],
  [
    'simple with no formula is unused',
    system('simple', { simple: { rollFormula: '', evaluation: attribute('under') } }),
    BARE,
    false,
  ],
  [
    'alchemy with no check',
    system('alchemy', simple(attribute('under')), { alchemy: { checkMode: 'none' } }),
    BARE,
    false,
  ],
];

/** Whether the engine's versioned descriptor refuses, as a boolean. */
function engineRefuses(craftingSystem, recipe, actor) {
  const engine = Object.create(CraftingEngine.prototype);
  try {
    engine._versionedCheckTarget(resolveActiveCraftingCheckFormula(craftingSystem), recipe, actor);
    return false;
  } catch (error) {
    if (error?.code === 'CHECK_TARGET_INVALID') return true;
    throw error;
  }
}

for (const [name, craftingSystem, actor, expected, recipe = RECIPE] of CASES) {
  test(`the listing and the descriptor agree: ${name}`, () => {
    assert.equal(engineRefuses(craftingSystem, recipe, actor), expected, 'the descriptor');
    assert.equal(craftingCheckRefuses(craftingSystem, recipe, actor), expected, 'the listing');
  });
}

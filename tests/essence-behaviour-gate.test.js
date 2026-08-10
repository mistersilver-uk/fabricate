/**
 * Issue 1036 — the essence behaviour gate.
 *
 * `EssenceDefinition.enabled` gates essence-carried BEHAVIOUR, never essence ARITHMETIC.
 * A disabled essence still matches, accumulates and is consumed exactly as before —
 * because a mid-session toggle must not change what an already-held item is worth — but it
 * carries nothing onto a crafted result: neither its property macro NOR its active-effect
 * transfer runs.
 *
 * Both suppressions are asserted here, together, because the whole point of the maintainer
 * decision is that they are ONE rule. Two further things are pinned that are easy to get
 * silently wrong:
 *
 *  - the stacking veto `transfersEffects` must NOT become essence-aware (it is computed
 *    before the contributing walk, so an all-disabled craft on a transferring recipe still
 *    declines to stack — matching what an unresolvable essence source already does);
 *  - a time-gated craft evaluates the START snapshot, never the live definitions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { IngredientSet } from '../src/models/IngredientSet.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';

import {
  installEngineGlobals,
  makeCapturingActor,
  makeEssence,
  makeOwnedStack,
  makeScriptMacro,
  publishSystem,
} from './helpers/essenceFixtures.js';

const SYSTEM_ID = 'sys-gate';
const INGOT = { id: 'ingot', name: 'Iron Ingot' };
const SOURCE_UUID = 'Item.fire-source';

installEngineGlobals();

function makeEngine() {
  return new CraftingEngine({ canCraft: () => ({ canCraft: false }) }, null, null);
}

/** A source item carrying one active effect, for the transfer half of the gate. */
function makeEffectSource() {
  return {
    uuid: SOURCE_UUID,
    effects: [{ toObject: () => ({ name: 'Burning', changes: [] }) }],
    toObject: () => ({ name: 'Fire Source', type: 'loot', system: {}, flags: {} }),
  };
}

function makeSystem(essenceDefinitions, features = {}) {
  return {
    id: SYSTEM_ID,
    components: [INGOT],
    essenceDefinitions,
    features: { essences: true, propertyMacros: true, effectTransfer: true, ...features },
  };
}

/** A recipe that transfers effects, so BOTH essence-carried behaviours are reachable. */
const TRANSFERRING_RECIPE = {
  craftingSystemId: SYSTEM_ID,
  transferEffects: true,
  toJSON: () => ({}),
};

async function award(engine, actor, recipe, options) {
  return engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1 },
    [],
    [],
    recipe,
    null,
    options
  );
}

test('1036/4: a DISABLED essence runs neither its property macro nor its effect transfer', async () => {
  const system = makeSystem([
    makeEssence({
      id: 'fire',
      enabled: false,
      propertyMacroUuid: 'Macro.fire',
      sourceItemUuid: SOURCE_UUID,
    }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
    [SOURCE_UUID]: makeEffectSource(),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();
  const created = await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { fire: 3 },
  });

  assert.equal(actor.captured[0].system?.school, undefined, 'the property macro did not run');
  assert.equal(created.effects.length, 0, 'no active effect was transferred');
});

test('1036/4 negative control: the SAME fixture ENABLED runs both behaviours', async () => {
  const system = makeSystem([
    makeEssence({
      id: 'fire',
      enabled: true,
      propertyMacroUuid: 'Macro.fire',
      sourceItemUuid: SOURCE_UUID,
    }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
    [SOURCE_UUID]: makeEffectSource(),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();
  const created = await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { fire: 3 },
  });

  assert.equal(actor.captured[0].system.school, 'fire', 'the property macro ran');
  assert.equal(created.effects.length, 1, 'the active effect was transferred');
});

test('1036/4: a disabled essence still ACCUMULATES its quantity into the craft context', () => {
  const system = makeSystem([makeEssence({ id: 'fire', enabled: false })]);
  publishSystem(system);

  const engine = makeEngine();
  const consumed = [
    {
      item: { id: 'i1', name: 'Ember', getFlag: () => ({ fire: 2 }) },
      quantity: 3,
      ingredient: null,
    },
  ];

  const { resolvedEssences } = engine._buildEssenceContext(consumed, {
    craftingSystemId: SYSTEM_ID,
  });

  assert.equal(
    resolvedEssences.fire,
    6,
    'enabled gates BEHAVIOUR, not ARITHMETIC — the disabled essence still accumulates 2 x 3'
  );
});

// ---------------------------------------------------------------------------
// Criterion 4's other two thirds: a disabled essence still MATCHES and is still CONSUMED
//
// The maintainer's binding decision is that `enabled` gates essence-carried BEHAVIOUR and
// never essence ARITHMETIC — "its quantities still match, accumulate and are consumed".
// Accumulation is pinned above. These pin the other two, which are exactly what an
// implementer "completing the gate" would break: adding the definition lookup to the
// matcher, or to the consumption plan, reads as finishing the job and is wrong.
// ---------------------------------------------------------------------------

/** An item whose Fabricate essence flags resolve through the real dotted-key reader. */
function makeEssenceItem(uuid, quantity, essences) {
  const scopes = { fabricate: { fabricate: { essences }, essences } };
  return {
    id: uuid,
    uuid,
    name: uuid,
    system: { quantity },
    deleted: false,
    getFlag: (scope, key) =>
      String(key)
        .split('.')
        .reduce((value, part) => (value == null ? undefined : value[part]), scopes[scope]),
    async delete() {
      this.deleted = true;
    },
    async update(payload) {
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
  };
}

test('1036/4: a DISABLED essence still SATISFIES an ingredient set essence requirement', () => {
  const system = makeSystem([makeEssence({ id: 'fire', enabled: false })]);
  system.components = [{ id: 'ember', name: 'Ember', essences: { fire: 2 } }];
  publishSystem(system);

  const engine = makeEngine();
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => system.components,
  });
  const recipes = [
    {
      id: 'r1',
      name: 'Brew',
      enabled: true,
      // The legacy per-set essences map — the AND-required arm the matcher evaluates.
      ingredientSets: [{ id: 'set-1', essences: { fire: 2 }, ingredientGroups: [] }],
    },
  ];
  const submitted = [{ item: { id: 'i1', name: 'Ember' }, componentId: 'ember' }];

  const match = engine._matchAlchemySignature(submitted, recipes, system.components, validator, {
    system,
  });

  assert.equal(match.matched, true, 'the submission matched');
  assert.equal(
    match.recipe?.id,
    'r1',
    'the requirement is satisfied by quantity alone — matching never consults `enabled`'
  );
});

test('1036/4 negative control: the same submission SHORT of the requirement does not match', () => {
  const system = makeSystem([makeEssence({ id: 'fire', enabled: false })]);
  system.components = [{ id: 'ember', name: 'Ember', essences: { fire: 2 } }];
  publishSystem(system);

  const engine = makeEngine();
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => system.components,
  });
  const recipes = [
    {
      id: 'r1',
      name: 'Brew',
      enabled: true,
      ingredientSets: [{ id: 'set-1', essences: { fire: 5 }, ingredientGroups: [] }],
    },
  ];
  const submitted = [{ item: { id: 'i1', name: 'Ember' }, componentId: 'ember' }];

  assert.equal(
    engine._matchAlchemySignature(submitted, recipes, system.components, validator, { system })
      .matched,
    false,
    'the matcher really is evaluating the quantity, so the pass above is not vacuous'
  );
});

test('1036/4: a DISABLED essence is still CONSUMED — the plan draws its items down and deletes them', async () => {
  const system = makeSystem([makeEssence({ id: 'fire', enabled: false })]);
  publishSystem(system);

  const set = new IngredientSet({
    id: 'set-1',
    ingredientGroups: [
      { id: 'g-fire', options: [{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 3 } }] },
    ],
  });
  const items = [makeEssenceItem('i1', 2, { fire: 1 }), makeEssenceItem('i2', 5, { fire: 1 })];

  const selection = set.resolveIngredientSelection(items);
  assert.equal(selection.success, true, 'the disabled essence still satisfies the group option');

  const stockBefore = new Map(items.map((item) => [item.uuid, item.system.quantity]));
  const engine = makeEngine();
  const consumed = await engine._consumeIngredients(selection.plan);

  assert.equal(
    consumed.reduce((total, entry) => total + entry.quantity, 0),
    3,
    'exactly the required three fire-carrying units were consumed'
  );
  for (const { item, quantity } of selection.plan) {
    const held = stockBefore.get(item.uuid);
    if (quantity >= held) {
      assert.ok(item.deleted, `${item.uuid} was drawn down entirely and deleted`);
    } else {
      assert.equal(item.system.quantity, held - quantity, `${item.uuid} was drawn down by ${quantity}`);
    }
  }
  assert.deepEqual(
    engine._buildEssenceContext(consumed, { craftingSystemId: SYSTEM_ID }).resolvedEssences,
    { fire: 3 },
    'and the consumed units accumulate exactly as an enabled essence would'
  );
});

test('1036/19: a contributing essence with NO definition is skipped without throwing', async () => {
  // The state an essence deleted between a timed craft's START and FINISH leaves behind.
  const system = makeSystem([makeEssence({ id: 'water', sourceItemUuid: SOURCE_UUID })]);
  publishSystem(system, { [SOURCE_UUID]: makeEffectSource() });

  const actor = makeCapturingActor();
  const engine = makeEngine();
  const created = await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { ghost: 1 },
  });

  assert.ok(created, 'the craft completed');
  assert.equal(created.effects.length, 0, 'the undefined essence contributed no effects');
});

test('1036/19: the stacking veto is UNCHANGED by a disable — a transferring recipe still refuses to stack', async () => {
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: false, sourceItemUuid: SOURCE_UUID }),
  ]);
  publishSystem(system, { [SOURCE_UUID]: makeEffectSource() });

  const owned = makeOwnedStack(INGOT.name, 5);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();
  await award(engine, actor, TRANSFERRING_RECIPE, { precomputedEssences: { fire: 1 } });

  assert.equal(
    owned.updates.length,
    0,
    '`transfersEffects` is flag-derived and evaluated BEFORE the walk, so a disable must not re-open stacking'
  );
  assert.equal(actor.captured.length, 1, 'a distinct item was created, as it is for an unresolvable source');
});

test('1036/19 negative control: a NON-transferring recipe with the same disabled essence DOES stack', async () => {
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: false, sourceItemUuid: SOURCE_UUID }),
  ]);
  publishSystem(system, { [SOURCE_UUID]: makeEffectSource() });

  const owned = makeOwnedStack(INGOT.name, 5);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();
  await award(
    engine,
    actor,
    { craftingSystemId: SYSTEM_ID, transferEffects: false, toJSON: () => ({}) },
    { precomputedEssences: { fire: 1 } }
  );

  assert.equal(owned.system.quantity, 6, 'the veto really is the recipe flag, not the essence state');
});

test('1036/8: a timed craft follows the START snapshot, not the live enabled state', async () => {
  // The essence is LIVE-ENABLED now; the snapshot taken at START says it was disabled.
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: true, propertyMacroUuid: 'Macro.fire' }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();
  await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { fire: 1 },
    essenceEnabled: { fire: false },
  });

  assert.equal(
    actor.captured[0].system?.school,
    undefined,
    'a GM who disabled the essence at START does not get its behaviour at FINISH'
  );
});

test('1036/8: the inverse — snapshot ENABLED beats a live disable made mid-run', async () => {
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.fire' }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();
  await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { fire: 1 },
    essenceEnabled: { fire: true },
  });

  assert.equal(
    actor.captured[0].system.school,
    'fire',
    'a mid-run toggle cannot change the outcome of a craft whose inputs are already gone'
  );
});

test('1036/8: the START snapshot covers EVERY contributing essence, not only the disabled ones', () => {
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: true }),
    makeEssence({ id: 'water', enabled: false }),
  ]);
  publishSystem(system);

  const snapshot = makeEngine()._snapshotEssenceEnabled({ fire: 2, water: 1 }, system);

  assert.deepEqual(
    snapshot,
    { fire: true, water: false },
    'a flag merge cannot delete a key inside a surviving run, so an omitted key would resurrect'
  );
});

test('1036/8: markStepPrepared PERSISTS essenceEnabled — its literal is a whitelist rebuild', async () => {
  const runManager = new CraftingRunManager();
  runManager._nowWorldTime = () => 0;
  runManager.updateRun = async (_actor, run) => run;
  const run = { id: 'run-1', steps: [{ index: 0 }] };

  await runManager.markStepPrepared({}, run, 0, {
    selectedIngredientSetId: 'set-a',
    resolvedEssences: { fire: 2 },
    essenceEnabled: { fire: false },
    consumedSummary: [],
  });

  assert.deepEqual(
    run.steps[0].preparedConsumption.essenceEnabled,
    { fire: false },
    'a snapshot key added only at the CALL SITE would be silently dropped by the rebuild'
  );
});

test('1036/21: a run armed BEFORE this change (no snapshot key) reads as all-enabled', async () => {
  // The essence is live-DISABLED, but the resuming run predates the field entirely, so it
  // must finish under the behaviour it was armed with.
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.fire' }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });
  const engine = makeEngine();

  const resumed = engine._resumedEssenceEnabled({ resolvedEssences: { fire: 2 } });
  assert.deepEqual(resumed, { fire: true }, 'an absent map reads as all-enabled');

  const actor = makeCapturingActor();
  await award(engine, actor, TRANSFERRING_RECIPE, {
    precomputedEssences: { fire: 2 },
    essenceEnabled: resumed,
  });
  assert.equal(actor.captured[0].system.school, 'fire');
});

test('1036/21: an EMPTY snapshot and an absent one coincide, because the snapshot is complete', () => {
  // `_snapshotEssenceEnabled` emits one entry per START `resolvedEssences` key, so the two
  // are empty or non-empty TOGETHER — which is why `_resumedEssenceEnabled` need not
  // distinguish `{}` from an absent map. A pre-change run carries NO key at all, and
  // reaches the all-enabled reading through the absent branch. `{}` alongside a non-empty
  // `resolvedEssences` is the shape a DROPPED key produces, not a state correct code emits.
  const engine = makeEngine();

  assert.deepEqual(
    engine._resumedEssenceEnabled({ resolvedEssences: {}, essenceEnabled: {} }),
    {},
    'an empty contribution set snapshots empty, and reads back empty either way'
  );
  assert.deepEqual(
    engine._snapshotEssenceEnabled({}, makeSystem([makeEssence({ id: 'fire', enabled: false })])),
    {},
    'the two emptinesses really are the same fact, not a coincidence of this fixture'
  );
});

test('1036/21: a COLLAPSED chain has no snapshot at all and evaluates enabled-ness at maturity', async () => {
  const system = makeSystem([
    makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.fire' }),
  ]);
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });
  const engine = makeEngine();

  assert.equal(
    engine._resumedEssenceEnabled({}),
    null,
    'no prepared consumption at all yields NULL — "evaluate live", not "all-enabled"'
  );

  // The collapsed chain reaches `_createSingleResult` through the immediate path, with
  // neither a precomputed map nor a snapshot.
  const actor = makeCapturingActor();
  const consumed = [
    { item: { id: 'i1', name: 'Ember', getFlag: () => ({ fire: 1 }) }, quantity: 1, ingredient: null },
  ];
  await engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1 },
    consumed,
    [],
    TRANSFERRING_RECIPE,
    null,
    {}
  );

  assert.equal(
    actor.captured[0].system?.school,
    undefined,
    'the LIVE disable applies at maturity, consistent with its already-live essence resolution'
  );
});

test('1036/20: an essence property macro applies to a SALVAGE result', async () => {
  const salvaged = { id: 'ore', name: 'Iron Ore', essences: { fire: 1 } };
  const system = {
    id: SYSTEM_ID,
    components: [INGOT, salvaged],
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
    features: { essences: true, propertyMacros: true, effectTransfer: true },
  };
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const engine = makeEngine();
  const actor = makeCapturingActor();
  const consumed = [
    { item: { id: 'i1', name: 'Iron Ore', getFlag: () => ({ fire: 1 }) }, quantity: 1, ingredient: null },
  ];

  await engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1 },
    consumed,
    [],
    engine._buildSalvageRecipeView(salvaged, system),
    null
  );

  assert.equal(
    actor.captured[0].system.school,
    'fire',
    // The contribution arrives through the CONSUMED item's own essence flags, which is
    // what `_buildEssenceContext` resolves first; the salvaged component's `essences` map
    // is the fallback the flag pre-empts. Either way the seam is reached live, with no
    // precomputed map and no snapshot — which is the fact this test is for.
    'salvage reaches the same seam, live, from the consumed item essence contribution'
  );
});

test('1036/20: a salvage essence macro is suppressed when the essence is disabled', async () => {
  const salvaged = { id: 'ore', name: 'Iron Ore', essences: { fire: 1 } };
  const system = {
    id: SYSTEM_ID,
    components: [INGOT, salvaged],
    essenceDefinitions: [
      makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.fire' }),
    ],
    features: { essences: true, propertyMacros: true, effectTransfer: true },
  };
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const engine = makeEngine();
  const actor = makeCapturingActor();
  const consumed = [
    { item: { id: 'i1', name: 'Iron Ore', getFlag: () => ({ fire: 1 }) }, quantity: 1, ingredient: null },
  ];

  await engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1 },
    consumed,
    [],
    engine._buildSalvageRecipeView(salvaged, system),
    null
  );

  assert.equal(
    actor.captured[0].system?.school,
    undefined,
    'the behaviour gate reaches the salvage seam too'
  );
});

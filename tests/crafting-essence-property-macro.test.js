/**
 * Issue 1036 — essence property macros.
 *
 * `EssenceDefinition.propertyMacroUuid` names a script Macro run against the item data of
 * every result its essence contributed to, before that item is created and before the
 * result's own macro.
 *
 * The two headline traps these tests exist to catch:
 *
 *  1. **Anti-stacking.** `_createSingleResult` looks for stacking candidates only when
 *     `!hasPropertyUpdates && !transfersEffects`, and `createOrStackComponentItem`
 *     DISCARDS `itemData` wholesale when it stacks. An essence-mutated output that failed
 *     to set `hasPropertyUpdates` would merge into a plain stack and lose every mutation
 *     with no error at all. Criterion 5, with the negative control that a `null`-returning
 *     macro DOES still stack.
 *  2. **Ordering.** `resolvedEssences` is accumulated over consumed items, so its key
 *     order is integer-like ids first in ascending numeric order and then inventory scan
 *     order — neither stable nor GM-authorable. Macros run in `essenceDefinitions` LIBRARY
 *     order instead, which is why the fixture below gives one essence a DIGIT-ONLY id that
 *     hoists to the front of the object.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

import {
  installEngineGlobals,
  makeCapturingActor,
  makeEssence,
  makeOwnedStack,
  makeScriptMacro,
  publishSystem,
} from './helpers/essenceFixtures.js';

const SYSTEM_ID = 'sys-1036';
const INGOT = { id: 'ingot', name: 'Iron Ingot' };

const notifications = installEngineGlobals();

function makeEngine() {
  return new CraftingEngine({ canCraft: () => ({ canCraft: false }) }, null, null);
}

/**
 * A system whose essences and feature flags the caller controls, with the result
 * component present so `_createSingleResult` resolves a managed component (the
 * precondition for stacking to be considered at all).
 */
function makeSystem({ essenceDefinitions, features = {} }) {
  return {
    id: SYSTEM_ID,
    components: [INGOT],
    essenceDefinitions,
    features: { essences: true, propertyMacros: true, ...features },
  };
}

const RECIPE = { craftingSystemId: SYSTEM_ID, transferEffects: false, toJSON: () => ({}) };

/**
 * Award one Iron Ingot, with the contributing essences supplied as a precomputed map so a
 * test states its contributions directly rather than through consumed-item resolution.
 */
async function award(engine, actor, { precomputedEssences, essenceEnabled = null }) {
  return engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1 },
    [],
    [],
    RECIPE,
    null,
    { precomputedEssences, essenceEnabled }
  );
}

test('1036/5: a result an essence macro mutated does NOT stack onto an existing plain stack', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.damage.bonus": 1 };'),
  });

  const owned = makeOwnedStack(INGOT.name, 3);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 2 } });

  assert.equal(owned.updates.length, 0, 'the existing plain stack was NOT incremented');
  assert.equal(actor.captured.length, 1, 'a distinct item was created instead');
  assert.equal(
    actor.captured[0].system?.damage?.bonus,
    1,
    'the created item carries the essence macro mutation'
  );
});

test('1036/5 negative control: a null-returning essence macro leaves the result stackable', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, { 'Macro.fire': makeScriptMacro('return null;') });

  const owned = makeOwnedStack(INGOT.name, 3);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 2 } });

  assert.equal(actor.captured.length, 0, 'no new item was created');
  assert.equal(owned.system.quantity, 4, 'the award stacked onto the existing item');
});

test('1036/6: essence macros run in essenceDefinitions order, unaffected by consumed-item ordering', async () => {
  // `7` is a digit-only essence id, which `_toKey` permits and which JavaScript hoists to
  // the FRONT of `resolvedEssences` however the map was built. Library order puts it LAST,
  // so a loop over `resolvedEssences` would produce the opposite last writer.
  const system = makeSystem({
    essenceDefinitions: [
      makeEssence({ id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.fire' }),
      makeEssence({ id: '7', name: 'Seven', propertyMacroUuid: 'Macro.seven' }),
    ],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
    'Macro.seven': makeScriptMacro('return { "system.school": "seven" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { 7: 1, fire: 1 } });

  assert.equal(
    Object.keys({ 7: 1, fire: 1 })[0],
    '7',
    'sanity: the digit-only id really does hoist to the front of the resolved map'
  );
  assert.equal(
    actor.captured[0].system.school,
    'seven',
    'the LAST essence in library order is the last writer, not the first resolved key'
  );
});

test('1036/6: the result macro runs after every essence macro and is the last writer', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire", "system.rarity": "rare" };'),
    'Macro.result': makeScriptMacro('return { "system.school": "recipe" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();

  await engine._createSingleResult(
    actor,
    { componentId: INGOT.id, quantity: 1, propertyMacroUuid: 'Macro.result' },
    [],
    [],
    RECIPE,
    null,
    { precomputedEssences: { fire: 1 } }
  );

  assert.equal(actor.captured[0].system.school, 'recipe', 'the result macro wins the shared path');
  assert.equal(
    actor.captured[0].system.rarity,
    'rare',
    'the essence macro still applied every path the result macro did not claim'
  );
});

test('1036/6: a throwing essence macro fails only that essence; every later macro still applies', async () => {
  const system = makeSystem({
    essenceDefinitions: [
      makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.boom' }),
      makeEssence({ id: 'water', propertyMacroUuid: 'Macro.water' }),
    ],
  });
  publishSystem(system, {
    'Macro.boom': makeScriptMacro('throw new Error("macro exploded");'),
    'Macro.water': makeScriptMacro('return { "system.school": "water" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1, water: 1 } });

  assert.equal(actor.captured.length, 1, 'the craft still produced its result');
  assert.equal(
    actor.captured[0].system.school,
    'water',
    'the macro AFTER the throwing one still ran and still applied'
  );
});

test('1036/6: no essence macro runs when features.propertyMacros is off', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
    features: { propertyMacros: false },
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const owned = makeOwnedStack(INGOT.name, 1);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(actor.captured.length, 0, 'nothing was created');
  assert.equal(owned.system.quantity, 2, 'an unmutated result stacks, so no macro ran');
});

test('1036/6: no essence macro runs when features.essences is off, even with propertyMacros on', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
    features: { essences: false },
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const owned = makeOwnedStack(INGOT.name, 1);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(owned.system.quantity, 2, 'the master switch suppresses the loop too');
});

test('1036/6 negative control: with both gates ON the same fixture DOES mutate', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
  });

  const owned = makeOwnedStack(INGOT.name, 1);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(owned.system.quantity, 1, 'the gated-off runs above were not passing vacuously');
  assert.equal(actor.captured[0].system.school, 'fire');
});

test('1036/6: an essence contributing nothing does not run its macro', async () => {
  const system = makeSystem({
    essenceDefinitions: [
      makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' }),
      makeEssence({ id: 'water', propertyMacroUuid: 'Macro.water' }),
    ],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro('return { "system.school": "fire" };'),
    'Macro.water': makeScriptMacro('return { "system.school": "water" };'),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(
    actor.captured[0].system.school,
    'fire',
    'only the contributing essence ran; the non-contributing one never overwrote it'
  );
});

test('1036: an unresolvable propertyMacroUuid is skipped SILENTLY at craft time', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.gone' })],
  });
  publishSystem(system, {}); // nothing resolves

  const before = notifications.errors.length;
  const owned = makeOwnedStack(INGOT.name, 1);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(
    notifications.errors.length,
    before,
    'no ui.notifications.error was raised on the crafting player screen'
  );
  assert.equal(owned.system.quantity, 2, 'the craft completed and the plain result stacked');
});

test('1036: an essence macro returning a non-object is warned about and ignored', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, { 'Macro.fire': makeScriptMacro('return [1, 2, 3];') });

  const owned = makeOwnedStack(INGOT.name, 1);
  const actor = makeCapturingActor([owned]);
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 1 } });

  assert.equal(owned.system.quantity, 2, 'an array return applies nothing, so the result stacks');
});

test('1036: the essence macro context names the invoking essence and its contribution', async () => {
  const system = makeSystem({
    essenceDefinitions: [makeEssence({ id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.fire' })],
  });
  publishSystem(system, {
    'Macro.fire': makeScriptMacro(
      'return { "system.note": `${context.essence.id}:${context.essenceQuantity}` };'
    ),
  });

  const actor = makeCapturingActor();
  const engine = makeEngine();

  await award(engine, actor, { precomputedEssences: { fire: 4 } });

  assert.equal(
    actor.captured[0].system.note,
    'fire:4',
    'a shared macro can find its OWN essence and its own contributed quantity'
  );
});

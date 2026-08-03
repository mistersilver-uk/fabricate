/**
 * The View Lab's `Roll` class.
 *
 * This is the seam that made the crafting roll prompt photographable at all: `evaluateCheckRoll`
 * returns `{engine: false}` on `typeof globalThis.Roll !== 'function'` before it reaches
 * `options.prompt`, so while the shim installed a plain object no crafting, salvage or alchemy
 * dialog could open in the harness.
 *
 * Two classes of assertion here, and they fail for different reasons:
 *
 * 1. SHAPE — `rolledDiceGroups` in `src/systems/checkRoll.js` reads `die.number`, `die.faces`,
 *    `die.total`, `die.results[].result` and `die.results[].active`, and treats an ABSENT `active`
 *    as kept. A shape drift here does not throw; it silently changes what a published frame shows.
 * 2. DETERMINISM — the published frames are a function of the seed. `player-crafting-run-summary`
 *    and `player-crafting-roll-result` now depend on the first d20 of a page being a 20, because
 *    that is what carries smithing's `1d20 + 3` over its threshold of 12. If that stops being true
 *    those frames change, so it is pinned here where the failure names itself, rather than being
 *    discovered as an unexplained pixel diff.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createLabRoll } from './view-lab/foundry/labRoll.js';
import { installLabRandom } from './view-lab/foundry/labRandom.js';
import { rolledDiceGroups } from '../src/systems/checkRoll.js';

/** The two statics the shim hands through, reproduced verbatim from `installFoundryShim.js`. */
const STATICS = {
  replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
    return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = String(path)
        .split('.')
        .reduce((current, part) => (current == null ? undefined : current[part]), data);
      return value === undefined || value === null ? missing : String(value);
    });
  },
  validate(formula) {
    return !/NaN|@/.test(String(formula));
  },
};

/**
 * Build a `Roll` over a freshly seeded stream, so every test starts at draw 0.
 *
 * @param {number} [seed] The seed; defaults to the lab's own.
 * @returns {Function} A `Roll` class.
 */
function makeRoll(seed = 20_260_601) {
  const random = installLabRandom({ seed });
  // `installLabRandom` swaps the realm's `Math.random`/`Date.now`; restore immediately. Only the
  // generator function itself is wanted here, and leaking the swap would poison sibling tests.
  random.restore();
  return createLabRoll({
    random: random.random,
    replaceFormulaData: STATICS.replaceFormulaData,
    validate: STATICS.validate,
  });
}

test('the first d20 of a seeded page is a 20', async () => {
  // Load-bearing for two published frames. `mulberry32(20260601)` yields 0.9666 first, so
  // `floor(0.9666 * 20) + 1 === 20`. Smithing's SIMPLE_CHECK is `1d20 + @abilities.int.mod`
  // against `thresholds.success: 12`; Brenna's int mod is 3. 23 >= 12, with margin.
  const Roll = makeRoll();
  const roll = await new Roll('1d20 + @abilities.int.mod', {
    abilities: { int: { mod: 3 } },
  }).evaluate();
  assert.equal(roll.dice[0].results[0].result, 20, 'the first d20 face');
  assert.equal(roll.total, 23, 'the seeded smithing check total');
  assert.ok(roll.total >= 12, 'the seeded smithing check clears its threshold');
});

test('the same seed replays the same faces', async () => {
  const first = await new (makeRoll())('4d6 + 2').evaluate();
  const second = await new (makeRoll())('4d6 + 2').evaluate();
  assert.deepEqual(second.dice, first.dice, 'identical dice');
  assert.equal(second.total, first.total, 'identical total');
  // A different seed must actually differ, or "deterministic" is indistinguishable from "constant".
  const other = await new (makeRoll(1))('4d6 + 2').evaluate();
  assert.notDeepEqual(other.dice, first.dice, 'a different seed rolls differently');
});

test('evaluate resolves to this, and is idempotent', async () => {
  const Roll = makeRoll();
  const roll = new Roll('2d8');
  const evaluated = await roll.evaluate({ allowInteractive: false });
  assert.equal(evaluated, roll, 'evaluate resolves to the roll itself');
  const total = roll.total;
  await roll.evaluate();
  assert.equal(roll.total, total, 're-evaluating does not re-roll');
  assert.equal(roll.dice.length, 1, 're-evaluating does not append a second die group');
});

test('the die shape is the one rolledDiceGroups reads', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('3d6 + 1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.number, 3);
  assert.equal(die.faces, 6);
  assert.equal(die.results.length, 3);
  // ABSENT, not `true`. Foundry omits `active` on a kept result, and `rolledDiceGroups` filters on
  // `entry?.active !== false` precisely so that absence counts as kept. Asserting `true` here would
  // let the lab drift into a shape production never produces.
  assert.ok(
    die.results.every((entry) => !Object.hasOwn(entry, 'active')),
    'a kept result carries no `active` key'
  );
  assert.equal(
    die.total,
    die.results.reduce((sum, entry) => sum + entry.result, 0),
    'die.total is the sum of its faces when nothing is dropped'
  );
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.group, '3d6');
  assert.equal(group.sum, die.total);
  assert.equal(group.results.length, 3, 'every face is active');
});

test('kh keeps the highest and marks the rest inactive', async () => {
  const Roll = makeRoll();
  // `2d20kh1` is exactly what `applyD20Advantage` emits for advantage.
  const roll = await new Roll('2d20kh1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.results.length, 2, 'both faces are recorded');
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(dropped.length, 1, 'exactly one face is dropped');
  const kept = die.results.filter((entry) => entry.active !== false);
  assert.equal(die.total, kept[0].result, 'the total is the kept face');
  assert.ok(kept[0].result >= dropped[0].result, 'kh keeps the higher face');
  assert.equal(roll.total, die.total);
  // And the consumer agrees: the dropped face must not reach the active-only face list.
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.results.length, 1, 'rolledDiceGroups sees only the kept face');
});

test('kl keeps the lowest', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('2d20kl1').evaluate();
  const [die] = roll.dice;
  const kept = die.results.filter((entry) => entry.active !== false);
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(kept.length, 1);
  assert.ok(kept[0].result <= dropped[0].result, 'kl keeps the lower face');
  assert.equal(die.total, kept[0].result);
});

test('roll data substitutes, and a missing key contributes zero', async () => {
  const Roll = makeRoll();
  // `missing: '0'` inside evaluate mirrors Foundry's behaviour for a Roll constructed WITH data:
  // an unresolved key contributes nothing rather than producing NaN.
  const roll = await new Roll('1d20 + @nope.missing', {}).evaluate();
  assert.ok(Number.isFinite(roll.total), 'an unresolved key does not produce NaN');
  assert.equal(roll.total, roll.dice[0].total, 'it contributes exactly zero');
});

test('a bare dN defaults to one die', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('d20').evaluate();
  assert.equal(roll.dice[0].number, 1);
  assert.equal(roll.dice[0].results.length, 1);
});

test('toMessage routes to ChatMessage.create and tolerates its absence', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('1d6').evaluate();
  const created = [];
  const previous = globalThis.ChatMessage;
  try {
    globalThis.ChatMessage = {
      async create(data) {
        created.push(data);
        return { _id: 'lab-chat-0', ...data };
      },
    };
    const message = await roll.toMessage({ flavor: 'Crafting · Herbalism' }, { rollMode: 'roll' });
    assert.equal(created.length, 1);
    assert.equal(created[0].flavor, 'Crafting · Herbalism');
    assert.deepEqual(created[0].rolls, [roll], 'the roll is carried on `rolls`');
    assert.equal(created[0].rollMode, 'roll');
    assert.equal(message._id, 'lab-chat-0');

    // `create: false` returns the data without posting.
    const data = await roll.toMessage({}, { create: false });
    assert.equal(created.length, 1, 'create:false posts nothing');
    assert.deepEqual(data.rolls, [roll]);

    // No ChatMessage at all must not throw — `checkRoll.js` console.errors on a throw here, and
    // the capture driver fails a case on any console error.
    globalThis.ChatMessage = undefined;
    assert.equal(await roll.toMessage({}), null);
  } finally {
    globalThis.ChatMessage = previous;
  }
});

test('the statics behave exactly as the object they replaced', () => {
  const Roll = makeRoll();
  // Pinned because ~15 recipe check cards render off `replaceFormulaData`, and
  // `resolveCheckFormulaDisplay` gates its `resolved` flag on `validate`. Changing either would
  // move frames that have nothing to do with rolling.
  assert.equal(Roll.replaceFormulaData('1d20 + @prof', { prof: 3 }), '1d20 + 3');
  assert.equal(
    Roll.replaceFormulaData('1d20 + @prof', {}, { missing: 'NaN' }),
    '1d20 + NaN',
    'an unresolved key yields the requested missing marker'
  );
  assert.equal(Roll.replaceFormulaData('1d20 + @a.b.c', { a: { b: { c: 7 } } }), '1d20 + 7');
  assert.equal(Roll.validate('1d20 + 3'), true);
  assert.equal(Roll.validate('1d20 + @x'), false);
  assert.equal(Roll.validate('1d20 + NaN'), false);
});

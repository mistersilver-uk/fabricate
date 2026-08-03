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
 *    `die.total`, `die.results[].result` and `die.results[].active`. A shape drift here does not
 *    throw; it silently changes what a published frame shows.
 * 2. DETERMINISM — `player-crafting-run-summary` and `player-crafting-roll-result` are frames of a
 *    craft that SUCCEEDS, and that success is a function of four fixture facts: the seed, the check
 *    formula, the threshold and the crafter's roll data. All four are READ from the fixtures rather
 *    than copied, so moving any one of them fails here by name instead of surfacing later as an
 *    unexplained frame diff.
 * 3. COMPOSITION — that the shim actually installs a constructor. Asserting the class in isolation
 *    left the whole capability revertible with the suite green.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLabRoll } from './view-lab/foundry/labRoll.js';
import { installLabRandom } from './view-lab/foundry/labRandom.js';
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import { rolledDiceGroups, evaluateCheckRoll } from '../src/systems/checkRoll.js';

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
function makeRoll(seed = LIVE_SEED) {
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

/**
 * The seed the lab actually renders with, read out of `labWorld.js`'s own default rather than
 * copied. A copy is what let the reviewer change `labWorld.js`'s seed with this whole file green.
 */
const LIVE_SEED = (() => {
  const source = readFileSync(new URL('./view-lab/world/labWorld.js', import.meta.url), 'utf8');
  const match = /seed\s*=\s*([\d_]+)/.exec(source);
  assert.ok(match, 'labWorld.js no longer declares a default seed');
  return Number(match[1].replaceAll('_', ''));
})();

test('the seeded smithing check clears its own threshold', () => {
  // The COMPOSED invariant, not three copied literals. `player-crafting-run-summary` and
  // `player-crafting-roll-result` are frames of a craft that SUCCEEDS, and that success is a
  // function of four fixture facts: the seed, the check formula, the threshold and the crafter's
  // roll data. Reading all four from the fixtures is what makes this fail by name when any one of
  // them moves — the earlier version hardcoded 3, 23 and 12, so the seed, the threshold and the
  // ability mod could each be changed with the suite green.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const smithing = content.systems.find((system) => system.id === 'lab-smithing');
  assert.ok(smithing, 'the smithing fixture system exists');
  const { rollFormula, thresholds } = smithing.craftingCheck.simple;
  const brenna = actors.find((actor) => actor.id === 'lab-actor-brenna');
  assert.ok(brenna, 'Brenna exists');

  const Roll = makeRoll();
  const roll = new Roll(rollFormula, brenna.getRollData());
  return roll.evaluate().then((evaluated) => {
    assert.ok(
      evaluated.total >= thresholds.success,
      `the seeded smithing craft must clear its threshold, or the two craft frames stop showing a ` +
        `successful craft: rolled ${evaluated.total} of ${rollFormula} against ${thresholds.success}`
    );
  });
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
  // `active: true` on a kept result, matching every Foundry-shaped dice fixture in this repo
  // (`check-roll.test.js`, `check-roll-dice.test.js`, `check-roll-nat-stepping.test.js`).
  // `rolledDiceGroups` filters on `!== false` so it would accept an absent key too, but the lab
  // must emit the shape production emits — otherwise a later fidelity fix reads as a regression.
  assert.ok(
    die.results.every((entry) => entry.active === true),
    'a kept result is explicitly active'
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

test('the shim installs a Roll CONSTRUCTOR, so evaluateCheckRoll reaches the prompt', async () => {
  // COMPOSITION, and the reason this test exists: every other test here imports `createLabRoll`
  // directly, so reverting `installFoundryShim.js` to the pre-change two-static object left the
  // whole capability gone with the suite green. `evaluateCheckRoll` bails on
  // `typeof globalThis.Roll !== 'function'` BEFORE it calls `options.prompt`, so an object here
  // means no crafting, salvage or alchemy dialog can EVER open in the lab — which is exactly the
  // state the roll-prompt frame was added to escape.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const previous = { Roll: globalThis.Roll, game: globalThis.game, ui: globalThis.ui };
  try {
    installFoundryShim({
      seed: LIVE_SEED,
      actorList: actors,
      scenes: [],
      settings: new Map(),
      i18n: { localize: (key) => key, format: (key) => key },
      worldTime: 0,
      documents: new Map(),
    });
    assert.equal(typeof globalThis.Roll, 'function', 'the shim installs a Roll constructor');

    let prompted = false;
    const result = await evaluateCheckRoll(
      '1d20 + 3',
      { getRollData: () => ({}) },
      {
        interactive: true,
        prompt: async () => {
          prompted = true;
          return { confirmed: true };
        },
      }
    );
    assert.equal(result.engine, true, 'the check is engine-evaluated rather than short-circuited');
    assert.ok(prompted, 'the interactive prompt is reached');
  } finally {
    globalThis.Roll = previous.Roll;
    globalThis.game = previous.game;
    globalThis.ui = previous.ui;
  }
});

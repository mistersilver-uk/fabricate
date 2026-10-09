/** The View Lab Roll's construction-time terms and its registered `Die` (issue 2007). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { rolledDiceGroups } from '../src/systems/checkRoll.js';

import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent } from './view-lab/world/labContent.js';

/** Install the shim, run `body` with its `foundry.dice`, and restore every global it replaced. */
async function withShim(body) {
  const content = buildLabContent();
  const previousRoll = globalThis.Roll;
  const shim = installFoundryShim({
    seed: 7,
    actorList: buildLabActors(content),
    scenes: [],
    settings: new Map(),
    i18n: { localize: (key) => key, format: (key) => key },
    worldTime: 0,
    documents: new Map(),
  });
  try {
    await body(globalThis.foundry.dice);
  } finally {
    shim.restore();
    // ratchet-exempt(lint): the shim installs `globalThis.Roll` and leaves restoring it to callers.
    globalThis.Roll = previousRoll;
  }
}

test('the shim registers the lab Die, and a lab Roll parses core-shaped terms at construction', async () => {
  await withShim(({ Roll, terms }) => {
    assert.equal(Roll, globalThis.Roll, 'foundry.dice.Roll is the installed lab Roll');
    const roll = new Roll('1d20[skill] + @prof + (2) + {1d20,1d12}kh', { prof: 3 });
    const [die, plus, numeric, , parenthetical, , pool] = roll.terms;
    assert.ok(die instanceof terms.Die, 'the first group is a registered Die');
    assert.ok('kh' in die.constructor.MODIFIERS && 'kl' in die.constructor.MODIFIERS);
    assert.deepEqual(
      [die._number, die._faces, die.modifiers, die.options.flavor],
      [1, 20, [], 'skill']
    );
    assert.ok(plus instanceof terms.OperatorTerm && plus.operator === '+');
    assert.ok(numeric instanceof terms.NumericTerm && numeric.number === 3);
    assert.ok(parenthetical instanceof terms.ParentheticalTerm);
    assert.ok(pool instanceof terms.PoolTerm);
    assert.equal(roll._formula, '1d20[skill] + 3 + (2) + {1d20,1d12}kh');
    assert.equal(roll.dice[0], die, 'the top-level die IS the term, as core returns it');
    assert.equal(roll.dice.length, 3, "and the pool's dice follow it");
    const fate = new Roll('1df + 2').terms[0];
    assert.ok(fate instanceof terms.DiceTerm && !(fate instanceof terms.Die), 'dF is no Die');
  });
});

test('a lab Roll mutated in place as the keep transform will be rolls and reads as mutated', async () => {
  await withShim(async ({ Roll }) => {
    const roll = new Roll('1d12 + @prof', { prof: 3 });
    const [die] = roll.terms;
    die.number = 2;
    die.modifiers.push('kh1');
    assert.equal(roll._formula, '1d12 + 3', 'the cached formula waits for resetFormula');
    roll.resetFormula();
    await roll.evaluate({ allowInteractive: false });
    assert.equal(die.results.length, 2, 'two dice rolled');
    assert.equal(die.results.filter((entry) => entry.active === false).length, 1, 'one kept');
    assert.equal(roll.total, die.total + 3);
    assert.equal(rolledDiceGroups(roll)[0].group, '2d12');
    const json = JSON.parse(JSON.stringify(roll.toJSON()));
    const restored = Roll.fromData(json);
    for (const formula of [roll._formula, json.formula, restored._formula, roll.clone()._formula]) {
      assert.equal(formula, '2d12kh1 + 3');
    }
    assert.deepEqual(restored.terms, roll.terms, 'the snapshot revives the same term classes');
    assert.equal(restored.total, roll.total);
  });
});

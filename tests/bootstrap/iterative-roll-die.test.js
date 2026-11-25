/** The edge die adapter over Foundry's uniform generator. */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createFoundryRollDie } from '../../src/bootstrap/iterativeRollDie.js';

const saved = globalThis.CONFIG;
afterEach(() => {
  Object.assign(globalThis, { CONFIG: saved });
});

describe('createFoundryRollDie', () => {
  it('maps 0 to the top face and just below 1 to face 1', () => {
    assert.equal(createFoundryRollDie(() => 0)(6), 6);
    assert.equal(createFoundryRollDie(() => 1 - Number.EPSILON)(6), 1);
    assert.equal(createFoundryRollDie(() => 0.5)(20), 10);
  });

  it('throws for a generator value outside [0, 1)', () => {
    for (const u of [NaN, 1, -0.1]) {
      assert.throws(() => createFoundryRollDie(() => u)(6), RangeError, String(u));
    }
  });

  it('throws for a face count that is not a positive safe integer', () => {
    const rollDie = createFoundryRollDie(() => 0.5);
    for (const faces of [0, -4, 2.5, NaN, 2 ** 53, '6']) {
      assert.throws(() => rollDie(faces), RangeError, String(faces));
    }
  });

  it('reads CONFIG.Dice.randomUniform on each call, so a later generator is used', () => {
    Object.assign(globalThis, { CONFIG: { Dice: { randomUniform: () => 0 } } });
    const rollDie = createFoundryRollDie();
    assert.equal(rollDie(8), 8);
    CONFIG.Dice.randomUniform = () => 0.75;
    assert.equal(rollDie(8), 2);
  });
});

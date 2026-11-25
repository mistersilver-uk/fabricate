/** Which crafting modes roll the routed check and so draw its tier-routing editor (issue 3009). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { usesRoutedCheck } from '../src/systems/checkRouting.js';

test('the routed check serves routedByCheck and iterative, and no other mode', () => {
  for (const mode of ['routedByCheck', 'iterative'])
    assert.equal(usesRoutedCheck(mode), true, mode);
  for (const mode of [
    'simple',
    'alchemy',
    'progressive',
    'routedByIngredients',
    '',
    undefined,
    null,
  ]) {
    assert.equal(usesRoutedCheck(mode), false, String(mode));
  }
});

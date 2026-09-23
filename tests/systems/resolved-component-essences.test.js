/**
 * THE ONE RESOLVED-ESSENCE ACCESSOR, driven directly (issue 1371 r21-store4, the quality engineer's
 * round-7 gap N2).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  componentsWithResolvedEssences,
  resolvedComponentEssencesById,
  resolvedComponentEssencesFor,
} from '../../src/systems/resolvedComponentEssences.js';

/**
 * A manager stand-in whose read union answers exactly what it is given.
 *
 * @param {unknown} answer what `getComponentsForSystem` returns, or an Error it throws.
 */
function makeManager(answer) {
  return {
    getComponentsForSystem: () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test('1371 r21: a row the union does not answer for is passed through UNTOUCHED, not blanked', () => {
  // Absence means "no world half for THIS row", never "no essences". Blanking would erase a
  // system's own authored map on every read for a component the world corpus does not hold.
  const manager = makeManager([{ id: 'ingot', essences: { fire: 3 } }]);
  const rows = [
    { id: 'ingot', name: 'Iron Ingot', essences: { iron: 9 } },
    { id: 'coal', name: 'Coal', essences: { earth: 4 } },
  ];

  const resolved = componentsWithResolvedEssences(manager, 'sys', rows);

  assert.deepEqual(resolved[0].essences, { fire: 3 }, 'the answered row takes the resolved map');
  assert.deepEqual(resolved[1].essences, { earth: 4 }, 'the unanswered row keeps its own');
  assert.equal(resolved[1], rows[1], 'and is the caller’s own object, un-reallocated');
  assert.deepEqual(rows[0].essences, { iron: 9 }, 'the input is never written through');
});

test('1371 r21: a manager whose union THROWS answers absence, so every caller reads the row', () => {
  const manager = makeManager(new Error('the component scope store is unreadable'));
  const rows = [{ id: 'ingot', essences: { iron: 9 } }];

  assert.equal(resolvedComponentEssencesById(manager, 'sys'), null);
  assert.equal(resolvedComponentEssencesFor(manager, 'sys', 'ingot'), undefined);
  assert.equal(
    componentsWithResolvedEssences(manager, 'sys', rows),
    rows,
    'the caller’s own list is handed straight back'
  );
});

test('1371 r21: a manager with NO read union at all answers absence rather than raising', () => {
  // The direct-projection fixtures and every manager stand-in that predates the union land here.
  for (const manager of [null, undefined, {}]) {
    assert.equal(resolvedComponentEssencesById(manager, 'sys'), null);
    assert.equal(resolvedComponentEssencesFor(manager, 'sys', 'ingot'), undefined);
  }
});

test('1371 r21: a union that answers a NON-ARRAY is absence, not an empty map', () => {
  // `null` here is what makes `componentsWithResolvedEssences` hand the rows back; an empty Map
  // would blank every row instead, which is the opposite of the safe direction.
  for (const answer of [null, undefined, {}, 'components']) {
    assert.equal(resolvedComponentEssencesById(makeManager(answer), 'sys'), null, String(answer));
  }
  const rows = [{ id: 'ingot', essences: { iron: 9 } }];
  assert.equal(componentsWithResolvedEssences(makeManager({}), 'sys', rows), rows);
});

test('1371 r21: ids are coerced the same way on both sides of the map', () => {
  // The builder keys on `String(component.id)` and the reader looks up `String(componentId)`. A
  // numeric id in an imported corpus resolves only while those two agree.
  const manager = makeManager([{ id: 7, essences: { fire: 1 } }]);
  assert.deepEqual(resolvedComponentEssencesFor(manager, 'sys', 7), { fire: 1 });
  assert.deepEqual(resolvedComponentEssencesFor(manager, 'sys', '7'), { fire: 1 });
  assert.deepEqual(componentsWithResolvedEssences(manager, 'sys', [{ id: 7 }])[0].essences, {
    fire: 1,
  });
});

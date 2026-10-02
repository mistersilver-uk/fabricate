/** The requirement row's kind mapping: `toValue` / `fromValue` against the persisted shapes. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { HANDLERS } from '../src/models/match/matchTypes.js';
import {
  KIND_META,
  KIND_ORDER,
  fromValue,
  isKnownKind,
  shownAmount,
  toValue,
} from '../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';

/** One persisted ingredient option per match type, each carrying a field the row never draws. */
const INGREDIENTS = Object.freeze({
  component: { id: 'opt-1', quantity: 3, match: { type: 'component', componentId: 'c-iron' } },
  tags: {
    id: 'opt-2',
    quantity: 2,
    match: { type: 'tags', tags: ['herb', 'rare'], tagMatch: 'all' },
  },
  essence: { id: 'opt-3', quantity: 1, match: { type: 'essence', essenceId: 'e-fire', amount: 4 } },
  currency: { id: 'opt-4', quantity: 1, match: { type: 'currency', unit: 'gp', amount: 25 } },
});

const RESULTS = Object.freeze({
  fixed: { id: 'res-1', componentId: 'c-iron', quantity: 2 },
  rolled: { id: 'res-2', componentId: 'c-iron', quantity: 2, quantityFormula: '1d4+1' },
});

/** An unedited round trip must hand back exactly what it was given. */
function assertUntouched(entry, label) {
  const snapshot = structuredClone(entry);
  const back = fromValue(entry, toValue(entry));
  assert.deepEqual(back, snapshot, `${label}: the round trip changed the entry`);
  assert.deepEqual(Object.keys(back), Object.keys(snapshot), `${label}: a key moved or appeared`);
  assert.deepEqual(entry, snapshot, `${label}: the adapter mutated its input`);
}

test('the kind table names exactly the match types the model registers', () => {
  assert.deepEqual(new Set(KIND_ORDER), new Set(Object.keys(HANDLERS)));
  assert.equal(KIND_ORDER.length, Object.keys(HANDLERS).length);
  assert.deepEqual(Object.keys(KIND_META), [...KIND_ORDER]);
  for (const kind of KIND_ORDER) assert.ok(isKnownKind(kind), kind);
  assert.ok(!isKnownKind('knowledge'), 'a kind the table does not name is not known');
  assert.ok(!isKnownKind('toString'), 'an inherited key is not a kind');
});

test('every match type reads as its own kind, subject and amount', () => {
  assert.deepEqual(toValue(INGREDIENTS.component), {
    kind: 'component',
    id: 'c-iron',
    tags: [],
    tagMatch: 'any',
    quantity: 3,
  });
  assert.deepEqual(toValue(INGREDIENTS.tags), {
    kind: 'tags',
    id: '',
    tags: ['herb', 'rare'],
    tagMatch: 'all',
    quantity: 2,
  });
  // Essence and currency count on the match, never on the option's own quantity.
  assert.deepEqual(toValue(INGREDIENTS.essence), {
    kind: 'essence',
    id: 'e-fire',
    tags: [],
    tagMatch: 'any',
    quantity: 4,
  });
  assert.deepEqual(toValue(INGREDIENTS.currency), {
    kind: 'currency',
    id: 'gp',
    tags: [],
    tagMatch: 'any',
    quantity: 25,
  });
});

test('an unedited round trip coerces nothing, for every match type and both result shapes', () => {
  for (const [kind, entry] of Object.entries(INGREDIENTS)) assertUntouched(entry, kind);
  for (const [shape, entry] of Object.entries(RESULTS)) assertUntouched(entry, `${shape} result`);
  assert.ok(!Object.hasOwn(fromValue(RESULTS.fixed, toValue(RESULTS.fixed)), 'quantityFormula'));
});

test('an unedited round trip keeps a zero amount, an absent quantity and an unknown field', () => {
  assertUntouched(
    { quantity: 1, match: { type: 'essence', essenceId: 'e-fire', amount: 0 } },
    'essence amount 0'
  );
  assertUntouched(
    { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 0 } },
    'currency amount 0'
  );
  assertUntouched(
    { quantity: 0, match: { type: 'component', componentId: 'c-iron' } },
    'quantity 0'
  );
  assertUntouched({ match: { type: 'component', componentId: 'c-iron' } }, 'absent quantity');
  assertUntouched({ componentId: 'c-iron' }, 'result with no quantity');
  assertUntouched(
    {
      quantity: 2,
      note: 'kept',
      match: { type: 'tags', tags: ['herb'], tagMatch: 'any', extra: 1 },
    },
    'unknown fields'
  );
  assertUntouched({ componentId: 'c-iron', quantity: 1, award: 'kept' }, 'unknown result field');
  assertUntouched(
    { quantity: 2, match: { type: 'mystery', componentId: 'c-iron' } },
    'unknown type'
  );
  assertUntouched({}, 'an empty option');
  // The stored amount reaches the row as stored.
  assert.equal(toValue({ match: { type: 'essence', essenceId: 'e-fire', amount: 0 } }).quantity, 0);
  assert.equal(
    toValue({ match: { type: 'component', componentId: 'c-iron' } }).quantity,
    undefined
  );
  assert.equal(toValue({ componentId: 'c-iron', quantity: '3' }).quantity, '3');
  // What the row shows for those amounts is 1, and showing it writes nothing.
  assert.equal(shownAmount(0), 1);
  assert.equal(shownAmount(undefined), 1);
  assert.equal(shownAmount('4'), 4);
});

test('an unknown ingredient match type reads as an unnamed component, as the row always drew it', () => {
  assert.deepEqual(toValue({ quantity: 2, match: { type: 'mystery', componentId: 'c-iron' } }), {
    kind: 'component',
    id: '',
    tags: [],
    tagMatch: 'any',
    quantity: 2,
  });
});

test('naming a row writes the subject where its kind keeps it', () => {
  const name = (entry, id) => fromValue(entry, { ...toValue(entry), id });
  assert.deepEqual(name(INGREDIENTS.component, 'c-coal'), {
    id: 'opt-1',
    quantity: 3,
    match: { type: 'component', componentId: 'c-coal' },
  });
  assert.deepEqual(name(INGREDIENTS.component, '').match, { type: 'component', componentId: null });
  assert.deepEqual(name(INGREDIENTS.essence, 'e-life').match, {
    type: 'essence',
    essenceId: 'e-life',
    amount: 4,
  });
  assert.deepEqual(name(INGREDIENTS.currency, '').match, {
    type: 'currency',
    unit: '',
    amount: 25,
  });
  assert.deepEqual(name(RESULTS.rolled, 'c-coal'), { ...RESULTS.rolled, componentId: 'c-coal' });
});

test('an amount lands on the match for essence and currency and on quantity otherwise', () => {
  const step = (entry, quantity) => fromValue(entry, { ...toValue(entry), quantity });
  assert.deepEqual(step(INGREDIENTS.component, 4), { ...INGREDIENTS.component, quantity: 4 });
  assert.deepEqual(step(INGREDIENTS.tags, 5), { ...INGREDIENTS.tags, quantity: 5 });
  assert.deepEqual(step(INGREDIENTS.essence, 5), {
    id: 'opt-3',
    quantity: 1,
    match: { type: 'essence', essenceId: 'e-fire', amount: 5 },
  });
  assert.deepEqual(step(INGREDIENTS.currency, 26), {
    id: 'opt-4',
    quantity: 1,
    match: { type: 'currency', unit: 'gp', amount: 26 },
  });
  assert.equal(step(INGREDIENTS.component, 123_456).quantity, 9999, 'four digits is the cap');
  assert.equal(step(INGREDIENTS.component, -3).quantity, 1, 'and 1 the floor');
  assert.deepEqual(step(RESULTS.rolled, 6), { ...RESULTS.rolled, quantity: 6 });
});

test('a tag edit rewrites the tag match and nothing beside it', () => {
  const value = toValue(INGREDIENTS.tags);
  assert.deepEqual(fromValue(INGREDIENTS.tags, { ...value, tags: ['herb'] }), {
    id: 'opt-2',
    quantity: 2,
    match: { type: 'tags', tags: ['herb'], tagMatch: 'all' },
  });
  assert.deepEqual(fromValue(INGREDIENTS.tags, { ...value, tagMatch: 'any' }).match, {
    type: 'tags',
    tags: ['herb', 'rare'],
    tagMatch: 'any',
  });
  // A copy holding the same tags is not an edit.
  assert.equal(fromValue(INGREDIENTS.tags, { ...value, tags: [...value.tags] }), INGREDIENTS.tags);
});

test('retyping a row leaves the old subject behind and seeds the new kind empty', () => {
  const retype = (entry, kind) =>
    fromValue(entry, { ...toValue(entry), kind, id: '', tags: [], tagMatch: 'any' });
  assert.deepEqual(retype(INGREDIENTS.component, 'tags'), {
    id: 'opt-1',
    quantity: 3,
    match: { type: 'tags', tags: [], tagMatch: 'any' },
  });
  assert.deepEqual(retype(INGREDIENTS.component, 'essence'), {
    id: 'opt-1',
    quantity: 1,
    match: { type: 'essence', essenceId: '', amount: 1 },
  });
  assert.deepEqual(retype(INGREDIENTS.tags, 'currency'), {
    id: 'opt-2',
    quantity: 1,
    match: { type: 'currency', unit: '', amount: 1 },
  });
  // Back to a counted kind: the option's own quantity returns, never the amount on the match.
  assert.deepEqual(retype(INGREDIENTS.essence, 'component'), {
    id: 'opt-3',
    quantity: 1,
    match: { type: 'component', componentId: null },
  });
});

test('a result reads its kind and never has one written', () => {
  assert.equal(toValue(RESULTS.fixed).kind, 'component', 'an absent kind is component');
  assert.equal(toValue({ componentId: null, kind: 'currency' }).kind, 'currency');
  const unknown = { componentId: 'c-iron', kind: 'knowledge', quantity: 1 };
  assert.equal(toValue(unknown).kind, 'knowledge', 'an unrecognised kind is passed through');
  assert.ok(!isKnownKind(toValue(unknown).kind), 'so the row can draw it as a misconfiguration');
  const retyped = fromValue(RESULTS.fixed, { ...toValue(RESULTS.fixed), kind: 'tags' });
  assert.ok(!Object.hasOwn(retyped, 'kind'), 'a result gains no kind');
  assert.ok(!Object.hasOwn(retyped, 'match'), 'and no match');
  assert.deepEqual(fromValue(unknown, { ...toValue(unknown), kind: 'component' }), unknown);
});

test('a rolled amount is written beside quantity, and Fixed removes the key', () => {
  const rolled = fromValue(RESULTS.fixed, { ...toValue(RESULTS.fixed), quantityFormula: '1d4+1' });
  assert.deepEqual(rolled, {
    id: 'res-1',
    componentId: 'c-iron',
    quantity: 2,
    quantityFormula: '1d4+1',
  });
  // Written byte for byte: the adapter trims nothing it stores.
  const spaced = fromValue(RESULTS.fixed, { ...toValue(RESULTS.fixed), quantityFormula: ' 2d6 ' });
  assert.equal(spaced.quantityFormula, ' 2d6 ');

  for (const blank of [undefined, null, '', ' '.repeat(3)]) {
    const fixed = fromValue(RESULTS.rolled, { ...toValue(RESULTS.rolled), quantityFormula: blank });
    assert.ok(
      !Object.hasOwn(fixed, 'quantityFormula'),
      `${JSON.stringify(blank)} must remove the key rather than store it`
    );
    assert.equal(fixed.quantity, 2, 'and quantity is kept');
  }
  // Opening Rolled and leaving it empty on a fixed result persists nothing.
  const opened = fromValue(RESULTS.fixed, { ...toValue(RESULTS.fixed), quantityFormula: '' });
  assert.deepEqual(opened, RESULTS.fixed);
});

test('an ingredient never gains a formula, whatever the row is handed', () => {
  const next = fromValue(INGREDIENTS.component, {
    ...toValue(INGREDIENTS.component),
    quantityFormula: '1d4',
  });
  assert.equal(next, INGREDIENTS.component);
});

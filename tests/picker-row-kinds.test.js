/** The requirement row's kind mapping: `toValue` / `fromValue` against the persisted shapes. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { HANDLERS } from '../src/models/match/matchTypes.js';
import { RESULT_KINDS } from '../src/models/Result.js';
import {
  INGREDIENT_KINDS,
  KIND_META,
  KIND_ORDER,
  RESULT_ROW_KINDS,
  emptyResult,
  fromValue,
  isKnownKind,
  kindMenuItems,
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

test('the kind table names exactly the match types and result kinds the models register', () => {
  assert.deepEqual(new Set(INGREDIENT_KINDS), new Set(Object.keys(HANDLERS)));
  assert.equal(INGREDIENT_KINDS.length, Object.keys(HANDLERS).length);
  assert.deepEqual(RESULT_ROW_KINDS, RESULT_KINDS, 'the restated result kinds are the model’s');
  assert.deepEqual(new Set(KIND_ORDER), new Set([...INGREDIENT_KINDS, ...RESULT_KINDS]));
  assert.deepEqual(Object.keys(KIND_META), [...KIND_ORDER]);
  for (const kind of KIND_ORDER) assert.ok(isKnownKind(kind), kind);
  assert.ok(!isKnownKind('activity'), 'a kind the table does not name is not known');
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
    { componentId: 'c-iron', quantity: 1, quantityFormula: '' },
    'result with a stored blank formula'
  );
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

test('a result reads its kind, and is never retyped to or from a kind a result cannot be', () => {
  assert.equal(toValue(RESULTS.fixed).kind, 'component', 'an absent kind is component');
  assert.equal(toValue({ componentId: null, kind: 'currency' }).kind, 'currency');
  const unknown = { componentId: 'c-iron', kind: 'mystery', quantity: 1 };
  assert.equal(toValue(unknown).kind, 'mystery', 'an unrecognised kind is passed through');
  assert.equal(toValue(unknown).id, '', 'naming no subject');
  assert.ok(!isKnownKind(toValue(unknown).kind), 'so the row can draw it as a misconfiguration');
  const retyped = fromValue(RESULTS.fixed, { ...toValue(RESULTS.fixed), kind: 'tags' });
  assert.equal(retyped, RESULTS.fixed, 'an ingredient-only kind is refused');
  // The row's own retype payload: it must not reach the subject of a misconfigured result.
  const payload = { ...toValue(unknown), kind: 'component', id: '', tags: [], tagMatch: 'any' };
  assert.deepEqual(fromValue(unknown, payload), unknown);
});

/** One persisted result per reward kind, each carrying the fields its kind keeps. */
const KINDS = Object.freeze({
  currency: {
    id: 'res-3',
    kind: 'currency',
    unit: 'gp',
    quantity: 5,
    quantityFormula: '2d6',
    label: 'Bounty',
    reason: 'For the pelts',
  },
  knowledge: { id: 'res-4', kind: 'knowledge', recipeId: 'r-sword', quantity: 1 },
});

test('a currency or knowledge result reads its own subject, and round-trips untouched', () => {
  assert.deepEqual(toValue(KINDS.currency), {
    kind: 'currency',
    id: 'gp',
    tags: [],
    tagMatch: 'any',
    quantity: 5,
    quantityFormula: '2d6',
    label: 'Bounty',
    reason: 'For the pelts',
  });
  assert.equal(toValue(KINDS.knowledge).id, 'r-sword');
  for (const [kind, entry] of Object.entries(KINDS)) assertUntouched(entry, kind);
});

test('naming a currency or knowledge result writes its own subject key', () => {
  const name = (entry, id) => fromValue(entry, { ...toValue(entry), id });
  assert.deepEqual(name(KINDS.currency, 'sp'), { ...KINDS.currency, unit: 'sp' });
  assert.deepEqual(name(KINDS.knowledge, 'r-axe'), { ...KINDS.knowledge, recipeId: 'r-axe' });
  assert.ok(!Object.hasOwn(name(KINDS.knowledge, 'r-axe'), 'componentId'));
});

test('retyping a result clears the old kind’s value and seeds the new kind empty', () => {
  const retype = (entry, kind) =>
    fromValue(entry, { ...toValue(entry), kind, id: '', tags: [], tagMatch: 'any' });
  assert.deepEqual(retype(RESULTS.rolled, 'currency'), {
    id: 'res-2',
    kind: 'currency',
    unit: '',
    quantity: 2,
  });
  assert.deepEqual(retype(KINDS.currency, 'knowledge'), {
    id: 'res-3',
    kind: 'knowledge',
    recipeId: '',
    quantity: 1,
  });
  // Back to component: the kind key goes, since an absent kind is component.
  assert.deepEqual(retype(KINDS.currency, 'component'), {
    id: 'res-3',
    componentId: null,
    quantity: 5,
  });
});

test('a currency label and reason are written as typed, and a blank one removes its key', () => {
  const edit = (patch) => fromValue(KINDS.currency, { ...toValue(KINDS.currency), ...patch });
  assert.equal(edit({ label: 'Wages ' }).label, 'Wages ', 'typed text is kept as typed');
  assert.equal(edit({ reason: 'Paid' }).reason, 'Paid');
  for (const blank of ['', '  ', undefined]) {
    assert.ok(!Object.hasOwn(edit({ label: blank }), 'label'), JSON.stringify(blank));
    assert.ok(!Object.hasOwn(edit({ reason: blank }), 'reason'), JSON.stringify(blank));
  }
});

test('an empty result carries its kind and no value', () => {
  assert.deepEqual(emptyResult('component', 'a'), { id: 'a', componentId: null, quantity: 1 });
  assert.deepEqual(emptyResult('currency', 'b'), {
    id: 'b',
    kind: 'currency',
    unit: '',
    quantity: 1,
  });
  assert.deepEqual(emptyResult('knowledge', 'c'), {
    id: 'c',
    kind: 'knowledge',
    recipeId: '',
    quantity: 1,
  });
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

test('the kind menu lists the offered kinds in table order, toned and hooked from the one table', () => {
  const items = kindMenuItems(
    ['currency', 'tags', 'component'],
    (key, fallback) => `${key}|${fallback}`
  );
  assert.deepEqual(
    items.map(({ id, tone, icon }) => [id, tone, icon]),
    ['component', 'tags', 'currency'].map((kind) => [
      kind,
      KIND_META[kind].tone,
      KIND_META[kind].icon,
    ])
  );
  assert.deepEqual(
    items.map((item) => item.data['data-recipe-add']),
    ['alternative-component', 'alternative-tag', 'alternative-currency']
  );
  assert.equal(
    items[1].label,
    `${KIND_META.tags.labelKey}|Tag`,
    'the label is the caller’s localization'
  );
  assert.equal(kindMenuItems(['essence'])[0].label, 'Essence', 'and the fallback without one');
  assert.deepEqual(
    kindMenuItems(['knowledge', 'currency', 'component'], undefined, 'result').map(
      (item) => item.data['data-recipe-add']
    ),
    ['result-component', 'result-currency', 'result-knowledge'],
    'a result adder hooks its entries as results'
  );
  assert.deepEqual(
    kindMenuItems(['unknown']),
    [],
    'a kind the table does not name is never offered'
  );
});

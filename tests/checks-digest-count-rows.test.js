/** The Checks rail digest's counted rows read singular at exactly 1 (issue 3030). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { digestCountRows } from '../src/ui/svelte/apps/manager/checks/checksDigestCountRows.js';

const LANG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], LANG);

const titles = (count, text = (key, fallback) => fallback) =>
  Object.fromEntries(
    digestCountRows({
      activeTab: 'crafting',
      outcomeCount: count,
      successCount: count,
      triggerCount: count,
      modifierCount: count,
      text,
    }).map((row) => [row.id, row.title])
  );

test('exactly 1 reads each row singular, and 0 and 2 read it plural', () => {
  assert.deepEqual(titles(1), {
    outcomes: '1 outcome tier, 1 counts as success',
    triggers: '1 trigger active',
    modifiers: '1 check modifier applies',
  });
  for (const count of [0, 2]) {
    assert.deepEqual(titles(count), {
      outcomes: `${count} outcome tiers, ${count} count as success`,
      triggers: `${count} triggers active`,
      modifiers: `${count} check modifiers apply`,
    });
  }
});

test('a row whose count is not a number is omitted', () => {
  const rows = digestCountRows({
    activeTab: 'salvage',
    outcomeCount: null,
    successCount: 0,
    triggerCount: 3,
    modifierCount: null,
    text: (key, fallback) => fallback,
  });
  assert.deepEqual(
    rows.map((row) => [row.id, row.target]),
    [['triggers', ['salvage', 'triggers']]]
  );
});

test('a string or undefined count omits its row too', () => {
  const rows = digestCountRows({
    activeTab: 'salvage',
    outcomeCount: undefined,
    successCount: 0,
    triggerCount: '3',
    modifierCount: '1',
    text: (key, fallback) => fallback,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    []
  );
});

test('every key it asks for resolves in lang/en.json to the fallback it carries', () => {
  const asked = new Map();
  titles(1, (key, fallback) => asked.set(key, fallback).get(key));
  titles(2, (key, fallback) => asked.set(key, fallback).get(key));
  assert.equal(asked.size, 9);
  for (const [key, fallback] of asked) {
    assert.equal(lookup(key), fallback, `${key} matches its fallback`);
  }
});

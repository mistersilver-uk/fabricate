/**
 * Coverage for the shared crafting-system label disambiguation
 * (`src/ui/svelte/util/systemDisambiguation.js`, issue 346).
 *
 * Two crafting systems can share a display name, making every picker / list
 * ambiguous. These helpers (1) append a short id disambiguator ONLY to colliding
 * names and (2) pick a sensible default that prefers a source-bearing system over
 * an empty same-named duplicate. In the Node runner `game.i18n` is absent, so
 * `localize` returns the key and the English fallback format applies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSystemLabelMap,
  systemDisplayLabel,
  pickDefaultSystemId
} from '../../src/ui/svelte/util/systemDisambiguation.js';

test('leaves a unique system name untouched', () => {
  const systems = [
    { id: 'alpha-id', name: 'Alchemy' },
    { id: 'beta-id', name: 'Smithing' }
  ];
  const labels = buildSystemLabelMap(systems);
  assert.equal(labels.get('alpha-id'), 'Alchemy');
  assert.equal(labels.get('beta-id'), 'Smithing');
});

test('appends an id-fragment disambiguator only to colliding names', () => {
  const systems = [
    { id: 'aaaa1111zzzz', name: 'Herbalism' },
    { id: 'bbbb2222zzzz', name: 'Herbalism' },
    { id: 'unique-id', name: 'Cooking' }
  ];
  const labels = buildSystemLabelMap(systems);
  assert.equal(labels.get('aaaa1111zzzz'), 'Herbalism (id: aaaa1111)');
  assert.equal(labels.get('bbbb2222zzzz'), 'Herbalism (id: bbbb2222)');
  // The hint is the leading id fragment, so the two siblings carry distinct hints.
  assert.notEqual(labels.get('aaaa1111zzzz'), labels.get('bbbb2222zzzz'));
  assert.equal(labels.get('unique-id'), 'Cooking');
});

test('treats names as colliding case-insensitively and ignoring surrounding whitespace', () => {
  const systems = [
    { id: 'a1234567890', name: 'Herbalism' },
    { id: 'b1234567890', name: '  herbalism ' }
  ];
  const labels = buildSystemLabelMap(systems);
  assert.equal(labels.get('a1234567890'), 'Herbalism (id: a1234567)');
  assert.equal(labels.get('b1234567890'), '  herbalism  (id: b1234567)');
});

test('falls back to the id when a system has no name', () => {
  const systems = [
    { id: 'no-name-id', name: '' },
    { id: 'named-id', name: 'Named' }
  ];
  const labels = buildSystemLabelMap(systems);
  assert.equal(labels.get('no-name-id'), 'no-name-id');
});

test('systemDisplayLabel reads the map, falling back to the system name', () => {
  const systems = [{ id: 'x-id', name: 'Solo' }];
  const labels = buildSystemLabelMap(systems);
  assert.equal(systemDisplayLabel({ id: 'x-id', name: 'Solo' }, labels), 'Solo');
  // No map entry -> falls back to the system's own name.
  assert.equal(systemDisplayLabel({ id: 'missing', name: 'Fallback' }, new Map()), 'Fallback');
});

test('pickDefaultSystemId prefers a source-bearing system over an empty duplicate', () => {
  const systems = [
    { id: 'empty-id', name: 'Herbalism' },
    { id: 'sourced-id', name: 'Herbalism' }
  ];
  const hasSources = (id) => id === 'sourced-id';
  assert.equal(pickDefaultSystemId(systems, hasSources), 'sourced-id');
});

test('pickDefaultSystemId falls back to the first system when none have sources', () => {
  const systems = [
    { id: 'first-id', name: 'A' },
    { id: 'second-id', name: 'B' }
  ];
  assert.equal(pickDefaultSystemId(systems, () => false), 'first-id');
});

test('pickDefaultSystemId falls back to the first system when no predicate is supplied', () => {
  const systems = [{ id: 'first-id', name: 'A' }, { id: 'second-id', name: 'B' }];
  assert.equal(pickDefaultSystemId(systems), 'first-id');
});

test('pickDefaultSystemId returns an empty string for an empty list', () => {
  assert.equal(pickDefaultSystemId([], () => true), '');
  assert.equal(pickDefaultSystemId(null), '');
});

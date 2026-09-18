/** Every `src/utils/scalars.js` export against one shared input table, so no two agree on all of it. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arrayOrEmpty,
  arrayOrWrapped,
  iterableToArray,
  laxNumberOrNull,
  normalizeIdList,
  normalizeTag,
  numberOrNull,
  stringOnlyIdList,
  stringOrEmpty,
  stringOrNull,
  trimString,
  trimStringOrNull,
  untrimmedStringOrEmpty,
  untrimmedStringOrNull,
} from '../src/utils/scalars.js';

const MAP = new Map([['k', 'v']]);
const SET = new Set(['a', 'b']);
const LIST = ['a', '', ' b ', 'a'];

const INPUTS = [
  ["''", ''],
  ['null', null],
  ['undefined', undefined],
  ['0', 0],
  ['false', false],
  ['NaN', Number.NaN],
  ["' a '", ' a '],
  ["'  '", '  '],
  ['42', 42],
  ["'abc'", 'abc'],
  ['a Map', MAP],
  ['a Set', SET],
  ["['a','',' b ','a']", LIST],
  ["a bare 'a'", 'a'],
  ['[42]', [42]],
];

/** Assert one export's output for every input of `INPUTS`, in that order. */
function pin(fn, expected) {
  assert.equal(expected.length, INPUTS.length, `${fn.name} must pin every input`);
  INPUTS.forEach(([label, value], index) => {
    assert.deepEqual(fn(value), expected[index], `${fn.name}(${label})`);
  });
}

test('numberOrNull keeps null for nullish and empty-string input', () => {
  pin(numberOrNull, [null, null, null, 0, 0, null, null, 0, 42, null, null, null, null, null, 42]);
});

test('laxNumberOrNull collapses null and the empty string to zero', () => {
  pin(laxNumberOrNull, [0, 0, null, 0, 0, null, null, 0, 42, null, null, null, null, null, 42]);
});

test('stringOrEmpty stringifies and trims, answering the empty string for nullish input', () => {
  pin(stringOrEmpty, [
    '',
    '',
    '',
    '0',
    'false',
    'NaN',
    'a',
    '',
    '42',
    'abc',
    '[object Map]',
    '[object Set]',
    'a,, b ,a',
    'a',
    '42',
  ]);
});

test('untrimmedStringOrEmpty stringifies without trimming', () => {
  pin(untrimmedStringOrEmpty, [
    '',
    '',
    '',
    '0',
    'false',
    'NaN',
    ' a ',
    '  ',
    '42',
    'abc',
    '[object Map]',
    '[object Set]',
    'a,, b ,a',
    'a',
    '42',
  ]);
});

test('stringOrNull answers null for nullish and blank input', () => {
  pin(stringOrNull, [
    null,
    null,
    null,
    '0',
    'false',
    'NaN',
    'a',
    null,
    '42',
    'abc',
    '[object Map]',
    '[object Set]',
    'a,, b ,a',
    'a',
    '42',
  ]);
});

test('untrimmedStringOrNull keeps whitespace, so only an empty result is null', () => {
  pin(untrimmedStringOrNull, [
    null,
    null,
    null,
    '0',
    'false',
    'NaN',
    ' a ',
    '  ',
    '42',
    'abc',
    '[object Map]',
    '[object Set]',
    'a,, b ,a',
    'a',
    '42',
  ]);
});

test('trimStringOrNull answers null for every non-string', () => {
  pin(trimStringOrNull, [
    null,
    null,
    null,
    null,
    null,
    null,
    'a',
    null,
    null,
    'abc',
    null,
    null,
    null,
    'a',
    null,
  ]);
});

test('trimString answers the empty string for every non-string', () => {
  pin(trimString, ['', '', '', '', '', '', 'a', '', '', 'abc', '', '', '', 'a', '']);
});

test('normalizeTag trims and lower-cases', () => {
  pin(normalizeTag, [
    '',
    '',
    '',
    '0',
    'false',
    'nan',
    'a',
    '',
    '42',
    'abc',
    '[object map]',
    '[object set]',
    'a,, b ,a',
    'a',
    '42',
  ]);
});

test('arrayOrEmpty passes an array through and answers an empty array for everything else', () => {
  pin(arrayOrEmpty, [[], [], [], [], [], [], [], [], [], [], [], [], LIST, [], [42]]);
});

test('arrayOrWrapped wraps a bare value, admitting zero and the empty string', () => {
  pin(arrayOrWrapped, [
    [''],
    [],
    [],
    [0],
    [false],
    [Number.NaN],
    [' a '],
    ['  '],
    [42],
    ['abc'],
    [MAP],
    [SET],
    LIST,
    ['a'],
    [42],
  ]);
});

test('iterableToArray drains a Map, a Set and a string, but not a number', () => {
  pin(iterableToArray, [
    [],
    [],
    [],
    [],
    [],
    [],
    [' ', 'a', ' '],
    [' ', ' '],
    [],
    ['a', 'b', 'c'],
    ['v'],
    ['a', 'b'],
    LIST,
    ['a'],
    [42],
  ]);
});

test('normalizeIdList wraps a truthy bare value and stringifies every entry', () => {
  pin(normalizeIdList, [
    [],
    [],
    [],
    [],
    [],
    [],
    ['a'],
    [],
    ['42'],
    ['abc'],
    ['[object Map]'],
    ['[object Set]'],
    ['a', 'b'],
    ['a'],
    ['42'],
  ]);
});

test('stringOnlyIdList takes only an array, and drops its non-string entries', () => {
  pin(stringOnlyIdList, [
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    ['a', 'b'],
    [],
    [],
  ]);
});

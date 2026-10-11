/**
 * Diff attribution for `broadSignals.js` (issue 2414): an edit confined to
 * `BROAD_SIGNAL_CASE_OVERRIDES` selects by entry, and any other edit keeps surface coverage.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { REPRESENTATIVE_CASE_IDS } from '../scripts/lib/view-lab-cases/broadSignals.js';
import * as viewLabCases from '../scripts/lib/viewLabCases.js';

const {
  BROAD_SIGNAL_CASE_OVERRIDES,
  FALLBACK_CASE_ID,
  LAB_SURFACE_CASE_IDS,
  VIEW_LAB_CASES,
  mapChangedFilesToCases,
} = viewLabCases;

const PATH = 'scripts/lib/view-lab-cases/broadSignals.js';
const LINES = readFileSync(new URL(`../${PATH}`, import.meta.url), 'utf8').split('\n');
const KEYS = Object.keys(BROAD_SIGNAL_CASE_OVERRIDES);
const COVERAGE = [...LAB_SURFACE_CASE_IDS];

const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const SELECT = component('Select');
const MEDALLION = component('Medallion');
const LIST_ROW = component('ListRow');
const TINT_PICKER = component('TintPicker');
const TINT_PICKER_BUTTON = component('TintPickerButton');
const STATUS_TOGGLE = component('StatusToggle');
const STYLESHEET = 'styles/fabricate.css';

/** A real, publishable case that none of the entries these patches sit beside names. */
const REMOVED_ID = 'player-inventory-bulk-report';
const SYNTHETIC_ENTRY = Object.freeze([
  '  // A synthetic entry the checkout no longer carries.',
  `  '${component('Synthetic')}': Object.freeze([`,
  `    '${REMOVED_ID}',`,
  '  ]),',
]);

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** The 1-based line whose text satisfies `matches`, asserted so a rename fails loudly. */
function lineWhere(matches, what) {
  const index = LINES.findIndex(matches);
  assert.notEqual(index, -1, `${PATH} no longer contains ${what}`);
  return index + 1;
}
const lineOf = (text) => lineWhere((line) => line === text, text);

const MAP_OPEN = lineOf('export const BROAD_SIGNAL_CASE_OVERRIDES = Object.freeze({');
const MAP_CLOSE = lineWhere((line, index) => index >= MAP_OPEN && line === '});', 'the map close');
const REPRESENTATIVE_OPEN = lineOf('export const REPRESENTATIVE_CASE_IDS = Object.freeze([');

/** One entry's opener and close lines, found independently of the parser under test. */
function entryLines(key) {
  const start = lineWhere((line) => line.startsWith(`  '${key}': Object.freeze([`), key);
  if (LINES[start - 1].endsWith(']),')) return { start, end: start };
  return { start, end: lineWhere((line, index) => index >= start && line === '  ]),', key) };
}

/** Real lines `from`..`to` as hunk rows, `+` on the lines in `added` and context elsewhere. */
const real = (from, to, added = []) =>
  range(from, to).map((line) => `${added.includes(line) ? '+' : ' '}${LINES[line - 1]}`);
const removed = (texts) => texts.map((text) => `-${text}`);
const hunk = (...rows) => ['@@ -1,1 +1,1 @@', ...rows.flat()].join('\n');

/** A one-hunk patch marking these contiguous lines as added, with git's three context lines. */
function adding(...lineNumbers) {
  const from = Math.max(1, Math.min(...lineNumbers) - 3);
  const to = Math.min(LINES.length, Math.max(...lineNumbers) + 3);
  return hunk(real(from, to, lineNumbers));
}

const selected = (patch, files = [PATH]) =>
  mapChangedFilesToCases(files, patch === undefined ? {} : { patches: { [PATH]: patch } }).map(
    (viewCase) => viewCase.id
  );

/** What the override key itself selects as a changed render file: the expected-value oracle. */
const oracle = (key) => mapChangedFilesToCases([key]).map((viewCase) => viewCase.id);

const inRegistryOrder = (ids) => {
  const wanted = new Set(ids);
  return VIEW_LAB_CASES.filter((viewCase) => viewCase.publish && wanted.has(viewCase.id)).map(
    (viewCase) => viewCase.id
  );
};

/** Some ids with their palette variants, plus the representative pair, in registry order. */
const withPair = (ids) =>
  VIEW_LAB_CASES.filter(
    (viewCase) =>
      viewCase.publish &&
      (ids.includes(viewCase.id) ||
        ids.includes(viewCase.baseCaseId) ||
        REPRESENTATIVE_CASE_IDS.includes(viewCase.id))
  ).map((viewCase) => viewCase.id);

function assertNeitherNeighbour(ids, neighbours) {
  for (const key of neighbours) {
    for (const id of BROAD_SIGNAL_CASE_OVERRIDES[key]) {
      if (REPRESENTATIVE_CASE_IDS.includes(id)) continue;
      assert.ok(!ids.includes(id), `a removal beside ${key} must not select its case ${id}`);
    }
  }
}

test('the cases these patches lean on exist, so a rename cannot pass the tests vacuously', () => {
  assert.ok(
    VIEW_LAB_CASES.some((viewCase) => viewCase.id === REMOVED_ID && viewCase.publish),
    `${REMOVED_ID} must be a publishable case`
  );
  for (const key of [SELECT, MEDALLION, LIST_ROW, TINT_PICKER, TINT_PICKER_BUTTON, STATUS_TOGGLE]) {
    assert.ok(KEYS.includes(key), `${key} must be an override key`);
    assert.ok(!BROAD_SIGNAL_CASE_OVERRIDES[key].includes(REMOVED_ID));
  }
  assert.deepEqual(entryLines(MEDALLION).start, entryLines(MEDALLION).end, 'a one-line entry');
});

test('adding a whole entry selects exactly what that override key selects', () => {
  for (const key of [SELECT, MEDALLION]) {
    const { start, end } = entryLines(key);
    assert.deepEqual(selected(adding(...range(start, end))), oracle(key), key);
  }
});

test('an id deep in a long entry, with its opener outside the hunk, selects that entry', () => {
  const { start, end } = entryLines(LIST_ROW);
  const windowAt = (line) => LINES.slice(line - 4, line + 3);
  const occurrences = (sequence) =>
    range(0, LINES.length - sequence.length).filter((offset) =>
      sequence.every((text, index) => LINES[offset + index] === text)
    ).length;
  const line = range(start + 4, end - 1).find(
    (candidate) => occurrences(windowAt(candidate)) === 1
  );
  assert.ok(line, `no ${LIST_ROW} id line has context occurring exactly once`);
  assert.ok(line - 3 > start, 'the opener must lie outside the context');

  assert.deepEqual(selected(adding(line)), oracle(LIST_ROW));
});

test('removing a whole entry selects its removed id and the pair, and neither neighbour', () => {
  const medallion = entryLines(MEDALLION).end;
  const between = hunk(
    real(medallion - 2, medallion),
    removed(SYNTHETIC_ENTRY),
    real(medallion + 1, medallion + 3)
  );
  const ids = selected(between);
  assert.deepEqual(ids, withPair([REMOVED_ID]));
  assertNeitherNeighbour(ids, [MEDALLION, STATUS_TOGGLE]);

  const trailing = hunk(
    real(MAP_CLOSE - 3, MAP_CLOSE - 1),
    removed(SYNTHETIC_ENTRY),
    real(MAP_CLOSE, MAP_CLOSE + 2)
  );
  assert.ok(
    LINES[MAP_CLOSE + 1].startsWith('/**'),
    'the trailing context ends on the next docblock'
  );
  const trailingIds = selected(trailing);
  assert.deepEqual(trailingIds, withPair([REMOVED_ID]));
  assertNeitherNeighbour(trailingIds, [STYLESHEET]);
});

test('either alignment git can give a removed entry selects the same, and neither neighbour', () => {
  const close = entryLines(TINT_PICKER).end;
  assert.equal(
    LINES[close - 1],
    SYNTHETIC_ENTRY.at(-1),
    'the preceding entry closes like the removed one'
  );
  assert.equal(entryLines(TINT_PICKER_BUTTON).start, close + 1);

  const closeKept = hunk(
    real(close - 2, close),
    removed(SYNTHETIC_ENTRY),
    real(close + 1, close + 3)
  );
  const slid = hunk(
    real(close - 3, close - 1),
    removed([SYNTHETIC_ENTRY.at(-1), ...SYNTHETIC_ENTRY.slice(0, -1)]),
    real(close, close + 2)
  );
  for (const patch of [closeKept, slid]) {
    const ids = selected(patch);
    assert.deepEqual(ids, withPair([REMOVED_ID]));
    assertNeitherNeighbour(ids, [TINT_PICKER, TINT_PICKER_BUTTON]);
  }
});

test('removing an id inside an entry selects that id, the entry and the pair', () => {
  const { start } = entryLines(SELECT);
  const patch = hunk(
    real(start - 2, start + 1),
    removed([`    '${REMOVED_ID}',`]),
    real(start + 2, start + 4)
  );
  assert.deepEqual(
    selected(patch),
    inRegistryOrder([...oracle(SELECT), ...withPair([REMOVED_ID])])
  );
});

test('a comment-only edit inside the map selects nothing from the file', () => {
  const between = lineOf('  // The shared icon picker (issue 1269).');
  const inside = lineWhere((line) => line.startsWith('    // Issue 2008:'), 'an in-entry comment');
  assert.ok(MAP_OPEN < between && inside < MAP_CLOSE);
  for (const line of [between, inside]) {
    assert.deepEqual(selected(adding(line)), [FALLBACK_CASE_ID]);
  }
});

test('an entry hunk beside an unattributable hunk is a union, never a replacement', () => {
  const surface = new Set(COVERAGE);
  const key = KEYS.find((candidate) => oracle(candidate).some((id) => !surface.has(id)));
  assert.ok(key, 'some override entry must select a case outside surface coverage');

  const patch = [adding(entryLines(key).start), adding(REPRESENTATIVE_OPEN + 1)].join('\n');
  assert.deepEqual(selected(patch), inRegistryOrder([...COVERAGE, ...oracle(key)]));
});

test('a hunk spanning the last entry and the representative block selects both', () => {
  const last = entryLines(KEYS.at(-1));
  const id = last.end - 1;
  assert.ok(REPRESENTATIVE_OPEN - id < 7, 'the two lines must share one hunk');
  const patch = hunk(real(id - 3, REPRESENTATIVE_OPEN + 3, [id, REPRESENTATIVE_OPEN]));
  assert.deepEqual(selected(patch), inRegistryOrder([...COVERAGE, ...oracle(KEYS.at(-1))]));
});

test('the parser reads one region per key, in order, spanning its opener and close', () => {
  const regions = viewLabCases.parseBroadSignalOverrideRegions(LINES);
  assert.ok(regions, 'the checked-out table must parse; a reformat that breaks it widens');
  assert.deepEqual(
    regions,
    KEYS.map((key) => ({ key, ...entryLines(key) }))
  );
  for (const key of KEYS) {
    assert.deepEqual(selected(adding(entryLines(key).start)), oracle(key), key);
  }
});

test('the parser fails closed on any table it cannot read exactly', () => {
  const parse = viewLabCases.parseBroadSignalOverrideRegions;
  const opener = LINES[entryLines(SELECT).start - 1];
  const firstSelectId = LINES[entryLines(SELECT).start];
  const medallion = LINES[entryLines(MEDALLION).start - 1];

  /** A copy with one edit applied, asserted to have applied. */
  const edited = (line, replacement) => {
    const index = LINES.indexOf(line);
    assert.notEqual(index, -1, `the mutation target is gone: ${line}`);
    const copy = [...LINES];
    copy.splice(index, 1, ...replacement);
    return copy;
  };

  const mutants = {
    'an entry split across two lines': edited(opener, [`  '${SELECT}':`, '    Object.freeze([']),
    'an unclosed entry': (() => {
      const copy = [...LINES];
      copy.splice(entryLines(SELECT).end - 1, 1);
      return copy;
    })(),
    'a duplicate key': edited(medallion, [medallion, medallion]),
    'an id that disagrees with the module': edited(firstSelectId, ["    'not-the-module-id',"]),
    'a block comment': edited(opener, ['  /* a block comment */', opener]),
    'a trailing comment on an id line': edited(firstSelectId, [`${firstSelectId} // note`]),
    'a missing close': edited('});', []),
    'an entry the module lacks': edited(medallion, [
      medallion,
      `  '${component('Extra')}': Object.freeze(['${REMOVED_ID}']),`,
    ]),
  };
  for (const [name, source] of Object.entries(mutants)) {
    assert.notDeepEqual(source, LINES, `${name}: the mutation did not apply`);
    assert.equal(parse(source), null, name);
  }
});

test('the #2412 shape: a new primitive and its entry select that entry, not surface coverage', () => {
  const { start, end } = entryLines(SELECT);
  const ids = selected(adding(...range(start, end)), [SELECT, PATH]);
  assert.deepEqual(ids, oracle(SELECT));
  assert.ok(ids.length < COVERAGE.length);
  assert.deepEqual(
    COVERAGE.filter((id) => ids.includes(id)),
    COVERAGE.filter((id) => oracle(SELECT).includes(id))
  );
});

test('a patch the table cannot account for selects exactly surface coverage', () => {
  const managerPrimitives = lineWhere(
    (line) => line.startsWith('export const MANAGER_PRIMITIVES = '),
    'MANAGER_PRIMITIVES'
  );
  const patternElement = lineOf("    '^styles/',");
  const representativeElement = lineOf("  'fabricate-app-shell',");
  const importLine = lineWhere((line) => line.startsWith('import '), 'an import');
  /** Real context around a `-` copy of a line, set just before that line. */
  const removing = (line) =>
    hunk(real(line - 3, line - 1), removed([LINES[line - 1]]), real(line, line + 2));

  const listRow = entryLines(LIST_ROW).start;
  const patches = {
    'no patch': undefined,
    'an empty patch': '',
    'a malformed hunk header': '@@ not a header @@\n+x',
    'a wrong-revision body': hunk([' a line this checkout lacks', "+    'nor this one',"]),
    'a + on MANAGER_PRIMITIVES': adding(managerPrimitives),
    "a + on BROAD_SIGNAL_PATTERN's first element": adding(patternElement),
    'a + on a REPRESENTATIVE_CASE_IDS element': adding(representativeElement),
    "a + on the map's opener": adding(MAP_OPEN),
    "a + on the map's close": adding(MAP_CLOSE),
    'a + on the shared-module line view-lab-cases.test.js patches': adding(LINES.length - 2),
    'a - MANAGER_PRIMITIVES line': removing(managerPrimitives),
    'a - BROAD_SIGNAL_PATTERN element': removing(patternElement),
    'a - REPRESENTATIVE_CASE_IDS element': removing(representativeElement),
    'a - import': removing(importLine),
    'a deletion-only hunk with zero context': hunk(removed([`    '${REMOVED_ID}',`])),
    'a trailing removal with no following context': hunk(
      real(listRow, listRow + 2),
      removed([`    '${REMOVED_ID}',`])
    ),
    'a removal just above REPRESENTATIVE_CASE_IDS': hunk(
      real(REPRESENTATIVE_OPEN - 3, REPRESENTATIVE_OPEN - 1),
      removed(SYNTHETIC_ENTRY),
      real(REPRESENTATIVE_OPEN, REPRESENTATIVE_OPEN + 2)
    ),
  };
  for (const [name, patch] of Object.entries(patches)) {
    assert.deepEqual(selected(patch), COVERAGE, name);
  }
});

/**
 * Bounds the oversized files and functions under `src/` (issue 1659) against the base commit: a
 * change may not make a unit oversized or grow an oversized one, unless a
 * `ratchet-exempt(file-size): <reason>` marker at the unit says why. Engine: `mergeBaseRatchet.js`.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import test, { after } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { compareToBase, reportComparison } from './helpers/mergeBaseRatchet.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';
import {
  FILE_THRESHOLDS,
  FUNCTION_THRESHOLD,
  measureComponentFunctions,
  measureModuleFunctions,
  physicalLines,
} from './helpers/unitSizes.js';

const FAMILY = 'file-size';
const CORPUS_ROOT = 'src';
const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte']);
const FILE_ID = 'file';

/** Below this the scan is truncated rather than clean; `src/` holds ~840 scanned files. */
const SCAN_FLOOR = 501;

/** Below this many oversized units the measurement has stopped seeing them. */
const ROW_FLOOR = 150;

const GUIDANCE =
  `A file is oversized past ${FILE_THRESHOLDS['.js']} lines (.js, .mjs) or ` +
  `${FILE_THRESHOLDS['.svelte']} (.svelte), a function past ${FUNCTION_THRESHOLD}. "is new" means ` +
  'a unit crossed its threshold in this change, "rose" that an oversized one grew: extract a ' +
  'cohesive unit instead of adding to the nearest large one. A function is matched by its ' +
  'qualified name, same-named `#N` siblings and renames by size, so a rename is not new; a piece ' +
  'split out of an oversized function that is still oversized says "split further".';

const inCorpus = (file) =>
  file.startsWith(`${CORPUS_ROOT}/`) && SCANNED_EXTENSIONS.includes(extname(file));

function thresholdOf(file) {
  const threshold = FILE_THRESHOLDS[extname(file)];
  if (threshold === undefined) {
    throw new Error(
      `"${file}" is scanned but its extension carries no size threshold. Treating it as ` +
        'never-oversized is how a widened corpus goes half-vacuous: add the extension to ' +
        'FILE_THRESHOLDS or drop it from SCANNED_EXTENSIONS.'
    );
  }
  return threshold;
}

function functionsOf(file, text) {
  try {
    return extname(file) === '.svelte'
      ? measureComponentFunctions(text)
      : measureModuleFunctions(text);
  } catch (error) {
    // Neither parser knows the real path, so attribute it here rather than leave it to bisection.
    throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
  }
}

/** Every file and function one side lists, oversized or not, since matching sees them all. */
function measureUnits(readFile, listFiles) {
  return listFiles().flatMap((file) => {
    const text = readFile(file);
    if (text === undefined) return [];
    const whole = {
      file,
      id: FILE_ID,
      amount: physicalLines(text),
      lines: [1],
      limit: thresholdOf(file),
    };
    const functions = functionsOf(file, text).map((unit) => ({
      file,
      id: `function ${unit.symbol}`,
      symbol: unit.symbol,
      amount: unit.lines,
      lines: [unit.line],
      limit: FUNCTION_THRESHOLD,
    }));
    return [whole, ...functions];
  });
}

const oversized = (unit) => unit.amount > unit.limit;
const largestFirst = (left, right) =>
  right.amount - left.amount || byCodePoint(left.symbol, right.symbol);

/** Largest with largest: if any pairing keeps every unit from growing, this one does. */
function pairBySize(baseUnits, headUnits) {
  const base = [...baseUnits].sort(largestFirst);
  const head = [...headUnits].sort(largestFirst);
  return {
    pairs: head.slice(0, base.length).map((unit, index) => [base[index], unit]),
    baseLeft: base.slice(head.length),
    headLeft: head.slice(base.length),
  };
}

/**
 * One file's functions, matched by qualified symbol across all of them. A `#N` ordinal is
 * positional, so same-named siblings match by size; what is left pairs by size as renames.
 */
function matchFunctions(baseUnits, headUnits) {
  const byName = (units) => Map.groupBy(units, (unit) => unit.symbol.replace(/#\d+$/u, ''));
  const [baseGroups, headGroups] = [byName(baseUnits), byName(headUnits)];
  const pairs = [];
  const baseLeft = [];
  const headLeft = [];
  for (const [name, heads] of headGroups) {
    const matched = pairBySize(baseGroups.get(name) ?? [], heads);
    pairs.push(...matched.pairs);
    baseLeft.push(...matched.baseLeft);
    headLeft.push(...matched.headLeft);
  }
  for (const [name, bases] of baseGroups) if (!headGroups.has(name)) baseLeft.push(...bases);
  const renamed = pairBySize(baseLeft.filter(oversized), headLeft);
  return {
    pairs: [...pairs, ...renamed.pairs],
    added: renamed.headLeft,
    removed: renamed.baseLeft,
  };
}

/** A new oversized unit in a file whose oversized functions lost lines was split out of them. */
function addedId(unit, shrunk) {
  const sources = shrunk.filter((was) => was.file === unit.file).map((was) => was.symbol);
  return sources.length === 0
    ? unit.id
    : `${unit.id} (split from ${sources.join(', ')}: split further)`;
}

/** Keep the oversized units of both sides, a function keyed by its match on the other side. */
function pairUnits(baseEntries, headEntries) {
  const isFile = (entry) => entry.id === FILE_ID;
  const base = baseEntries.filter((entry) => isFile(entry) && oversized(entry));
  const head = headEntries.filter((entry) => isFile(entry) && oversized(entry));
  const files = new Set([...baseEntries, ...headEntries].map((entry) => entry.file));
  const functionsIn = (entries, file) =>
    entries.filter((entry) => entry.file === file && !isFile(entry));
  const matches = [...files].map((file) =>
    matchFunctions(functionsIn(baseEntries, file), functionsIn(headEntries, file))
  );
  const shrunk = matches.flatMap(({ pairs, removed }) => [
    ...pairs.filter(([was, now]) => oversized(was) && now.amount < was.amount).map(([was]) => was),
    ...removed,
  ]);
  for (const { pairs, added, removed } of matches) {
    for (const [was, now] of pairs) {
      if (!oversized(now)) {
        if (oversized(was)) base.push(was);
        continue;
      }
      const id = was.symbol === now.symbol ? now.id : `function ${now.symbol} (was ${was.symbol})`;
      head.push({ ...now, id });
      if (oversized(was)) base.push({ ...was, id });
    }
    base.push(...removed);
    for (const unit of added) {
      if (oversized(unit)) head.push({ ...unit, id: addedId(unit, shrunk) });
    }
  }
  return { base, head };
}

const compareFileSizes = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: CORPUS_ROOT,
    include: inCorpus,
    measure: measureUnits,
    pair: pairUnits,
    ...options,
  });

test('no file or function under `src/` became oversized or grew against the base commit', (t) => {
  const result = reportComparison(t, compareFileSizes(), GUIDANCE);
  if (result.compared) t.diagnostic(`compared ${result.changedCount} changed path(s)`);
});

test('the measurement still sees the oversized units of the whole tree', (t) => {
  // Fixed floors, not a ledger: a scan that stopped matching would otherwise read as a clean tree.
  // ratchet-exempt(source-pin): measures every src/ unit's size and asserts nothing about its text
  const corpus = collectSources(resolve(repoRoot, CORPUS_ROOT), {
    extensions: [...SCANNED_EXTENSIONS],
  });
  const files = Object.keys(corpus);
  const units = measureUnits(
    (file) => corpus[file],
    () => files
  ).filter(oversized);
  const oversizedFiles = units.filter((unit) => unit.id === FILE_ID).length;
  t.diagnostic(`${oversizedFiles} oversized files and ${units.length - oversizedFiles} functions`);
  assert.ok(files.length > SCAN_FLOOR, `only ${files.length} files scanned`);
  assert.ok(
    units.length > ROW_FLOOR,
    `only ${units.length} oversized units, below the floor of ${ROW_FLOOR}; a truncated scan ` +
      'would look exactly like this'
  );
});

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A repository whose first commit holds `files`; the gate compares its working tree with it. */
function srcRepo(files) {
  const repo = createTempGitRepo('file-size-ratchet-');
  repos.push(repo);
  const write = (entries) => {
    for (const [file, text] of Object.entries(entries)) {
      mkdirSync(dirname(join(repo.dir, file)), { recursive: true });
      writeFileSync(join(repo.dir, file), text);
    }
  };
  write(files);
  repo.git('add', '-A');
  const first = repo.commit('base');
  const compare = () => compareFileSizes({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write, compare };
}

/** An exported function spanning exactly `size` physical lines, `marker` on the line above. */
function fn(name, size, marker = '') {
  const body = Array.from({ length: size - 2 }, (_, index) => `  void ${index};`);
  return [marker, `export function ${name}() {`, ...body, '}'].filter(Boolean).join('\n');
}

const moduleOf = (...units) => `${units.join('\n')}\n`;
const filler = (count) => 'void 0;\n'.repeat(count);

test('wiring: an injected oversized function fails the gate, which a small one does not', (t) => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('small', 10)) });
  repo.write({ 'src/a.js': moduleOf(fn('small', 10), fn('grown', FUNCTION_THRESHOLD)) });
  assert.deepEqual(repo.compare().failures, []);
  repo.write({ 'src/a.js': moduleOf(fn('small', 10), fn('grown', FUNCTION_THRESHOLD + 1)) });
  const result = repo.compare();
  assert.deepEqual(result.failures, ['src/a.js: function grown is new (101)']);
  assert.throws(() => reportComparison(t, result, GUIDANCE), {
    message: /file-size: 1 regression[\s\S]*function grown is new \(101\)[\s\S]*split further/,
  });
});

test('a brand-new oversized unit fails, and an oversized one that grows by a line fails', () => {
  const repo = srcRepo({
    'src/big.js': moduleOf(fn('huge', 120)),
    'src/long.js': filler(820),
  });
  repo.write({
    'src/big.js': moduleOf(fn('huge', 121)),
    'src/long.js': filler(821),
    'src/fresh.js': filler(801),
    'src/View.svelte': '<p>x</p>\n'.repeat(501),
  });
  assert.deepEqual(repo.compare().failures, [
    'src/View.svelte: file is new (501)',
    'src/big.js: function huge rose from 120 to 121',
    'src/fresh.js: file is new (801)',
    'src/long.js: file rose from 820 to 821',
  ]);
});

test('a shrink passes and is reported, whether the unit stays oversized or not', () => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('one', 130), fn('two', 120)) });
  repo.write({ 'src/a.js': moduleOf(fn('one', 125), fn('two', 90)) });
  const result = repo.compare();
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.shrank, [
    'src/a.js: function one fell from 130 to 125',
    'src/a.js: function two is gone (was 120)',
  ]);
});

test('sentinel: a changed corpus file is compared, and a change outside it is a skip', () => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('a', 5)), 'src/a.css': 'a {}\n', 'b.js': '' });
  repo.write({ 'src/a.css': 'b {}\n', 'b.js': filler(900) });
  assert.equal(repo.compare().skipped, 'corpus-unchanged');
  repo.write({ 'src/a.js': moduleOf(fn('a', 6)) });
  const result = repo.compare();
  assert.equal(result.compared, true);
  assert.equal(result.changedCount, 3);
});

test('a reasoned marker at the unit exempts it, and an empty one fails', () => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('kept', 5)), 'src/b.js': moduleOf(fn('b', 5)) });
  repo.write({
    'src/a.js': moduleOf(
      fn('kept', 5),
      fn(
        'table',
        140,
        '// ratchet-exempt(file-size): one lookup table, split it and it reads worse'
      )
    ),
    'src/b.js': moduleOf(fn('b', 5), fn('bare', 110, '// ratchet-exempt(file-size):')),
  });
  const result = repo.compare();
  assert.deepEqual(result.exempted, [
    'src/a.js: function table is new (140): one lookup table, split it and it reads worse',
  ]);
  assert.deepEqual(result.failures, [
    'src/b.js: function bare is new (110); its ratchet-exempt marker gives no reason',
    'src/b.js:6 has a ratchet-exempt(file-size) marker with no reason; write why the regression ' +
      'is legitimate after the colon',
  ]);
});

test('a symbol is matched across every function, so a small one growing past the line fails', () => {
  // By size alone this is one oversized function either way; by name, `later` crossed the line.
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('first', 130), fn('later', 90)) });
  repo.write({ 'src/a.js': moduleOf(fn('first', 90), fn('later', 130)) });
  const result = repo.compare();
  assert.deepEqual(result.failures, ['src/a.js: function later is new (130)']);
  assert.deepEqual(result.netted, []);
});

test('a renamed function is paired by size, so only a rename that grew fails', () => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('old', 130), fn('keep', 5)) });
  repo.write({ 'src/a.js': moduleOf(fn('renamed', 128), fn('keep', 5)) });
  const shrunk = repo.compare();
  assert.deepEqual(shrunk.failures, []);
  assert.deepEqual(shrunk.shrank, ['src/a.js: function renamed (was old) fell from 130 to 128']);
  repo.write({ 'src/a.js': moduleOf(fn('renamed', 131), fn('keep', 5)) });
  assert.deepEqual(repo.compare().failures, [
    'src/a.js: function renamed (was old) rose from 130 to 131',
  ]);
});

test('a same-named sibling added before an oversized one does not renumber it into a failure', () => {
  const hook = (size) => `Hooks.on('x', () => {\n${'  void 0;\n'.repeat(size - 2)}});`;
  const repo = srcRepo({ 'src/a.js': moduleOf(hook(120)) });
  repo.write({ 'src/a.js': moduleOf(hook(4), hook(120)) });
  assert.deepEqual(repo.compare().failures, []);
  repo.write({ 'src/a.js': moduleOf(hook(4), hook(121)) });
  assert.deepEqual(repo.compare().failures, [
    'src/a.js: function Hooks.on#2 (was Hooks.on) rose from 120 to 121',
  ]);
});

test('a piece split out of an oversized function that is still oversized says split further', () => {
  const repo = srcRepo({ 'src/a.js': moduleOf(fn('whole', 250)) });
  repo.write({ 'src/a.js': moduleOf(fn('whole', 140), fn('piece', 115), fn('tiny', 4)) });
  const result = repo.compare();
  assert.deepEqual(result.failures, [
    'src/a.js: function piece (split from whole: split further) is new (115)',
  ]);
  assert.deepEqual(result.shrank, ['src/a.js: function whole fell from 250 to 140']);
  repo.write({ 'src/a.js': moduleOf(fn('whole', 140), fn('piece', 100), fn('rest', 60)) });
  assert.deepEqual(repo.compare().failures, []);
});

test('the thresholds are the two the issue states, and exclusive', () => {
  assert.equal(FILE_THRESHOLDS['.svelte'], 500);
  assert.equal(FILE_THRESHOLDS['.js'], 800);
  assert.equal(FILE_THRESHOLDS['.mjs'], 800);
  assert.equal(FUNCTION_THRESHOLD, 100);
  assert.deepStrictEqual(
    Object.keys(FILE_THRESHOLDS).sort(byCodePoint),
    [...SCANNED_EXTENSIONS].sort(byCodePoint),
    'every scanned extension has a threshold, or a widened corpus goes half-vacuous'
  );
  // Exclusive, proved on the shape every real file has: one ending in a newline. A fixture
  // without the terminator is the one input where an off-by-one here does not show.
  const terminated = 'x\n'.repeat(800);
  assert.equal(physicalLines(terminated), 800);
  assert.equal(physicalLines(terminated) > FILE_THRESHOLDS['.js'], false);
  assert.equal(physicalLines('x\n'.repeat(801)) > FILE_THRESHOLDS['.js'], true);
  assert.equal(physicalLines('x\n'.repeat(500)) > FILE_THRESHOLDS['.svelte'], false);
});

test('a nested function is measured, and its enclosing one is not shortened by it', () => {
  const source = [
    'export function outer() {',
    ...Array.from({ length: 3 }, () => '  // body'),
    '  function inner() {',
    ...Array.from({ length: 2 }, () => '    // inner body'),
    '  }',
    '  return inner;',
    '}',
  ].join('\n');
  const measured = measureModuleFunctions(source);
  const outer = measured.find((unit) => unit.symbol === 'outer');
  const inner = measured.find((unit) => unit.symbol === 'outer>inner');
  assert.ok(outer && inner, 'both functions are measured');
  assert.equal(outer.lines, 10);
  assert.equal(inner.lines, 4);
  assert.deepEqual([outer.line, inner.line], [1, 5], 'each unit names its first line');
});

test('a regex quantifier does not derange the scan, which is why it parses', () => {
  const source = [
    String.raw`const RE = /@[A-Za-z]{1,32}\[([^\]]{0,2048})\]/gu;`,
    'export function after() {',
    '  return RE;',
    '}',
  ].join('\n');
  const measured = measureModuleFunctions(source);
  assert.deepStrictEqual(
    measured.map((unit) => unit.symbol),
    ['after']
  );
});

test('two same-named functions in one file get distinct qualified keys', () => {
  const source = [
    'export function a() {',
    '  function helper() {}',
    '  return helper;',
    '}',
    'export function b() {',
    '  function helper() {}',
    '  return helper;',
    '}',
  ].join('\n');
  const symbols = measureModuleFunctions(source).map((unit) => unit.symbol);
  assert.ok(symbols.includes('a>helper'));
  assert.ok(symbols.includes('b>helper'));
});

test('a repeated name takes an ordinal, so a collision cannot drop an entry', () => {
  const source = [
    'export const run = [',
    '  () => {',
    '    return 1;',
    '  },',
    '  () => {',
    '    return 2;',
    '  },',
    '];',
  ].join('\n');
  const symbols = measureModuleFunctions(source).map((unit) => unit.symbol);
  assert.equal(new Set(symbols).size, symbols.length, 'every key is distinct');
  assert.ok(symbols.some((symbol) => symbol.endsWith('#2')));
});

test('a component reports its script functions, and its file size is the whole file', () => {
  const source = [
    '<script>',
    '  export function handle() {',
    '    return 1;',
    '  }',
    '</script>',
    '<div>markup</div>',
    '<style>.x { color: red; }</style>',
  ].join('\n');
  assert.deepStrictEqual(
    measureComponentFunctions(source).map((unit) => unit.symbol),
    ['handle']
  );
  assert.equal(physicalLines(source), 7);
});

test('a name used in both script blocks keeps distinct keys, so neither row is dropped', () => {
  const source = [
    '<script module>',
    '  export function shared() {}',
    '</script>',
    '<script>',
    '  function shared() {}',
    '</script>',
    '<p />',
  ].join('\n');
  const symbols = measureComponentFunctions(source).map((unit) => unit.symbol);
  assert.equal(new Set(symbols).size, symbols.length);
});

test('a callback is keyed by the call it is passed to, not by its position', () => {
  const source = ["Hooks.once('ready', () => {", '  return 1;', '});'].join('\n');
  assert.deepStrictEqual(
    measureModuleFunctions(source).map((unit) => unit.symbol),
    ['Hooks.once']
  );
});

test('an inline handler in the markup is measured, not only the script blocks', () => {
  const source = [
    '<script>',
    '  let n = 0;',
    '</script>',
    '<button onclick={() => {',
    '  n += 1;',
    '}}>go</button>',
  ].join('\n');
  const measured = measureComponentFunctions(source);
  assert.equal(measured.length, 1, 'the markup arrow is measured');
  assert.equal(measured[0].lines, 3);
});

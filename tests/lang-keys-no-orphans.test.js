/**
 * An unreferenced `FABRICATE.*` STRING leaf in `lang/en.json` is an orphan (issue 680); the merge-
 * base engine (issue 2118) requires every head orphan to already be a base orphan, so none is new.
 * `lang/en.json` is parsed by Foundry as strict JSON at runtime and cannot carry a comment, and no
 * source module reliably stands in for a leaf that is, by definition, unreferenced — so this family
 * has no `ratchet-exempt(lang-orphan)` marker; a flagged key must be wired up or deleted for real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';

import { compareToBase, reportComparison } from './helpers/mergeBaseRatchet.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'lang-orphan';
const LANG_FILE = 'lang/en.json';
const CORPUS_ROOT = '.';

/** Below this the scan is truncated rather than clean; `src/` and `lang/` hold ~947 tracked files. */
const SCAN_FLOOR = 900;
/** Below this the scan is truncated; `lang/en.json` declares ~7,300 FABRICATE string leaves. */
const LEAF_FLOOR = 5000;

// Everything under either root triggers a comparison, even a file this family ignores (the corpus
// icon catalogue, a hypothetical second lang file): `measureLangOrphans` below reads only what it
// needs, but "did anything in src/ or lang/ change" is answered by the whole of both.
const inCorpus = (file) => file.startsWith('src/') || file.startsWith('lang/');

/** Capture a maximal `FABRICATE.<seg>(.<seg>)*` dotted literal. */
const REFERENCE = /FABRICATE\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g;

/** Every STRING leaf's dotted path under `FABRICATE`, by an explicit stack walk (no namespace nodes). */
function declaredStringLeaves(fabricate) {
  const leaves = [];
  const stack = [['FABRICATE', fabricate]];
  while (stack.length > 0) {
    const [prefix, node] = stack.pop();
    for (const [key, value] of Object.entries(node)) {
      const path = `${prefix}.${key}`;
      if (typeof value === 'string') leaves.push(path);
      else if (value && typeof value === 'object') stack.push([path, value]);
    }
  }
  return leaves;
}

function isCoveredBy(prefixes, leaf) {
  for (const prefix of prefixes) {
    if (leaf === prefix || leaf.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

/** Every `FABRICATE.*` leaf `lang/en.json` declares that no `.js`/`.svelte` file's text references. */
function measureLangOrphans(readFile, listFiles) {
  const langText = readFile(LANG_FILE);
  if (langText === undefined) return [];
  const leaves = declaredStringLeaves(JSON.parse(langText).FABRICATE ?? {});
  const prefixes = new Set();
  for (const file of listFiles()) {
    if (file === LANG_FILE || !(file.endsWith('.js') || file.endsWith('.svelte'))) continue;
    const text = readFile(file);
    if (text === undefined) continue;
    for (const match of text.matchAll(REFERENCE)) prefixes.add(match[0]);
  }
  return leaves
    .filter((leaf) => !isCoveredBy(prefixes, leaf))
    .map((leaf) => ({ file: LANG_FILE, id: leaf }));
}

const compareLangOrphans = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: CORPUS_ROOT,
    include: inCorpus,
    measure: measureLangOrphans,
    scope: 'corpus',
    ...options,
  });

const GUIDANCE =
  'Reference the key from src/**.js or .svelte (even a trivial usage), or delete it from ' +
  'lang/en.json if the feature it named is gone. This family has no ratchet-exempt marker: ' +
  'lang/en.json is loaded as strict JSON at runtime, so it cannot carry the comment, and there is ' +
  'no other file whose identity is stable enough across an unrelated refactor to hold it safely.';

test('no lang key is newly orphaned, and the scan floor holds', (t) => {
  const listed = [];
  const measure = (readFile, listFiles) => {
    const files = listFiles();
    listed.push(files.length);
    return measureLangOrphans(readFile, () => files);
  };
  const result = reportComparison(t, compareLangOrphans({ measure }), GUIDANCE);
  if (!result.compared) return;
  t.diagnostic(
    `compared ${listed.join(' and ')} corpus files with base ${result.base.slice(0, 12)}`
  );
  assert.ok(
    Math.min(...listed) >= SCAN_FLOOR,
    `expected at least ${SCAN_FLOOR} corpus files on each side; scanned ${listed.join(' and ')}`
  );
});

test('en.json declares enough leaves, and src/ enough modules, for the scan to be meaningful', () => {
  const langText = readFileSync(resolve(repoRoot, LANG_FILE), 'utf8');
  const leaves = declaredStringLeaves(JSON.parse(langText).FABRICATE ?? {});
  assert.ok(leaves.length >= LEAF_FLOOR, `only ${leaves.length} FABRICATE leaves declared`);
  const corpus = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js', '.svelte'] });
  const files = Object.keys(corpus);
  assert.ok(files.length >= SCAN_FLOOR - 1, `only ${files.length} src modules scanned`);
});

test('negative proof on the real tree: stripping every reference to a real key orphans it', () => {
  const corpus = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js', '.svelte'] });
  const langText = readFileSync(resolve(repoRoot, LANG_FILE), 'utf8');
  const files = { [LANG_FILE]: langText, ...corpus };
  const readFile = (file) => files[file];
  const before = new Set(measureLangOrphans(readFile, () => Object.keys(files)).map((e) => e.id));
  const leaves = declaredStringLeaves(JSON.parse(langText).FABRICATE ?? {});
  const target = leaves.find((leaf) => !before.has(leaf));
  assert.ok(target, 'expected at least one currently-referenced real leaf to strip');
  const stripped = Object.fromEntries(
    Object.entries(files).map(([file, text]) => [
      file,
      file === LANG_FILE ? text : text.replaceAll(target, ''),
    ])
  );
  const after = measureLangOrphans(
    (file) => stripped[file],
    () => Object.keys(stripped)
  );
  assert.ok(
    after.some((entry) => entry.id === target),
    `stripping every reference to ${target} should have orphaned it`
  );
});

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A repository whose first commit holds `files`; the gate compares its working tree with it. */
function langRepo(files) {
  const repo = createTempGitRepo('lang-orphan-');
  repos.push(repo);
  repo.write(files);
  const first = repo.commitAll('base');
  const compare = () => compareLangOrphans({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write: repo.write, compare };
}

const langOf = (fabricate) => `${JSON.stringify({ FABRICATE: fabricate }, null, 2)}\n`;

test('wiring: an injected orphan fails the gate, which a reference that stays wired does not', (t) => {
  const repo = langRepo({
    [LANG_FILE]: langOf({ Ping: 'hi' }),
    'src/a.js': "export const x = 'FABRICATE.Ping';\n",
  });
  repo.write({ 'src/a.js': "export const x = 'FABRICATE.Ping';\nexport const y = 1;\n" });
  assert.deepEqual(repo.compare().failures, []);
  repo.write({ 'src/a.js': 'export const y = 1;\n' });
  const result = repo.compare();
  assert.deepEqual(result.failures, [`${LANG_FILE}: FABRICATE.Ping is new (1)`]);
  assert.throws(() => reportComparison(t, result, GUIDANCE), /lang-orphan: 1 regression/);
});

test('both legs: a clean baseline getting its first orphan, and an already-imperfect one getting worse', () => {
  const clean = langRepo({
    [LANG_FILE]: langOf({ Ping: 'hi' }),
    'src/a.js': "export const x = 'FABRICATE.Ping';\n",
  });
  clean.write({ 'src/a.js': 'export const x = 1;\n' });
  assert.deepEqual(clean.compare().failures, [`${LANG_FILE}: FABRICATE.Ping is new (1)`]);

  // Pong is already orphaned at base — an imperfect baseline the ratchet must still tolerate — and
  // stays orphaned at head, so only the newly-orphaned Ping (Ping's reference is dropped) fails.
  const imperfect = langRepo({
    [LANG_FILE]: langOf({ Ping: 'hi', Pong: 'bye' }),
    'src/a.js': "export const x = 'FABRICATE.Ping';\n",
  });
  imperfect.write({ 'src/a.js': 'export const x = 1;\n' });
  assert.deepEqual(imperfect.compare().failures, [`${LANG_FILE}: FABRICATE.Ping is new (1)`]);
});

test('sentinel: a change under src/ or lang/ compares, and a change outside either is a skip', () => {
  const repo = langRepo({
    [LANG_FILE]: langOf({ Ping: 'hi' }),
    'src/a.js': "export const x = 'FABRICATE.Ping';\n",
    'README.md': 'unrelated\n',
  });
  repo.write({ 'README.md': 'still unrelated\n' });
  assert.equal(repo.compare().skipped, 'corpus-unchanged');
  repo.write({ 'src/a.js': "export const x = 'FABRICATE.Ping'; // touched\n" });
  const result = repo.compare();
  assert.equal(result.compared, true);
  assert.deepEqual(result.failures, []);
});

test('a ratchet-exempt(lang-orphan) marker has no effect, and an empty one still fails', () => {
  const repo = langRepo({
    [LANG_FILE]: langOf({ Ping: 'hi' }),
    'src/a.js': "export const x = 'FABRICATE.Ping';\n",
  });
  repo.write({
    'src/a.js': '// ratchet-exempt(lang-orphan): kept for a future feature\nexport const x = 1;\n',
  });
  const reasoned = repo.compare();
  assert.deepEqual(reasoned.exempted, []);
  assert.deepEqual(reasoned.failures, [`${LANG_FILE}: FABRICATE.Ping is new (1)`]);

  repo.write({ 'src/a.js': '// ratchet-exempt(lang-orphan):\nexport const x = 1;\n' });
  const empty = repo.compare();
  assert.deepEqual(empty.failures, [
    `${LANG_FILE}: FABRICATE.Ping is new (1)`,
    'src/a.js:1 has a ratchet-exempt(lang-orphan) marker with no reason; write why the regression ' +
      'is legitimate after the colon',
  ]);
});

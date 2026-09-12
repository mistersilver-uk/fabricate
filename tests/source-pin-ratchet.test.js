/**
 * Ratchets the source-text pin sites per test file (issue 1658), so the conversions in #1691 and
 * #1697 each lower `tests/source-pin-ledger.json` and nothing silently re-grows it.
 *
 * This file spells the tokens the gate hunts, in prose and in fixtures. That is safe by
 * construction rather than by exclusion: sites are AST call nodes, so a pattern written as a
 * string or regex literal, and a token in a comment, count zero.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { byCodePoint } from './helpers/ratchetBaseline.js';
import { parseModule } from './helpers/moduleAst.js';
import { countPinSites } from './helpers/sourcePinSites.js';
import { repoRoot } from './helpers/sourceScan.js';

const LEDGER_PATH = resolve(import.meta.dirname, 'source-pin-ledger.json');
const LEDGER = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));

const REGENERATE =
  'UPDATE_SOURCE_PIN_LEDGER=1 node --conditions=browser --test ' +
  'tests/source-pin-ratchet.test.js, then review the JSON diff';

/**
 * The whole `tests/**` tree, not the `npm test` glob's directories: a pin in a directory the glob
 * does not run is still a pin, and `tests/helpers/` is both scanned and scanning.
 */
const CORPUS_ROOT = 'tests';
const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs']);

/** Recorded debt tables whose entries are strings about pins, not pins. */
const EXCLUDED = Object.freeze([
  'tests/components/design-system-known-debt.js',
  'tests/components/selector-repetition-baseline.js',
  'tests/components/spacing-known-literals.js',
]);

function collect(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collect(full, found);
    else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(full);
  }
  return found;
}

function buildLedger() {
  const counted = [];
  for (const full of collect(resolve(repoRoot, CORPUS_ROOT))) {
    const file = relative(repoRoot, full).replaceAll('\\', '/');
    if (EXCLUDED.includes(file)) continue;
    const { ast } = parseModule(readFileSync(full, 'utf8'));
    const sites = countPinSites(ast);
    if (sites > 0) counted.push([file, sites]);
  }
  return Object.fromEntries(counted.sort(([left], [right]) => byCodePoint(left, right)));
}

let cached;
function currentLedger() {
  cached ??= buildLedger();
  return cached;
}

function describeDrift(actual, expected) {
  const added = Object.keys(actual)
    .filter((key) => !(key in expected))
    .sort(byCodePoint);
  const removed = Object.keys(expected)
    .filter((key) => !(key in actual))
    .sort(byCodePoint);
  if (added.length > 0 || removed.length > 0) {
    return (
      `the set of pinning files changed — added: [${added.join(', ')}], ` +
      `removed: [${removed.join(', ')}]. A file that newly pins source text needs a reason; one ` +
      `that stopped has paid the debt down and should bank it. Re-derive with ${REGENERATE}.`
    );
  }
  const changed = Object.keys(expected)
    .filter((key) => actual[key] !== expected[key])
    .sort(byCodePoint)
    .map((key) => `${key}: pinned ${expected[key]} -> actual ${actual[key]}`);
  if (changed.length === 0) return undefined;
  return (
    `source-pin counts drifted: ${changed.join('; ')}. This gate fails in both directions: a ` +
    'count that ROSE means a new pin on how the code is written rather than what it does, and a ' +
    `count that FELL needs the ledger lowered to bank the conversion. Re-derive with ${REGENERATE}.`
  );
}

test('the source-pin ledger matches the pinned baseline exactly, per test file', () => {
  const actual = currentLedger();
  if (process.env.UPDATE_SOURCE_PIN_LEDGER) {
    writeFileSync(LEDGER_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.deepStrictEqual(actual, LEDGER, describeDrift(actual, LEDGER));
});

test('a pattern spelled as a literal is not a pin site, so this gate does not count itself', () => {
  const probe = [
    "const SHAPE = /Source\\.includes\\(/;",
    "const ALSO = '.includes(';",
    '// readFileSync of src/ in a comment is not a call',
    'export { SHAPE, ALSO };',
  ].join('\n');
  const { ast } = parseModule(probe);
  assert.equal(countPinSites(ast), 0);
});

test('a read through a path binding counts, which a same-line rule would miss', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "const rootPath = new URL('../src/ui/Thing.svelte', import.meta.url);",
    "const rootSource = readFileSync(rootPath, 'utf8');",
    "export const ok = rootSource.includes('class=');",
  ].join('\n');
  const { ast } = parseModule(probe);
  // One read plus one `includes` on what it read.
  assert.equal(countPinSites(ast), 2);
});

test('text derived from a source binding is still a source', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "const a = readFileSync('src/one.js', 'utf8');",
    "const b = readFileSync('src/two.js', 'utf8');",
    "const joined = [a, b].join('\\n');",
    "export const ok = joined.includes('export');",
  ].join('\n');
  const { ast } = parseModule(probe);
  assert.equal(countPinSites(ast), 3);
});

test('an includes on text that never came from src/ is not a pin', () => {
  const probe = [
    "const dataSource = 'a,b,c';",
    "export const ok = dataSource.includes('b');",
  ].join('\n');
  const { ast } = parseModule(probe);
  assert.equal(countPinSites(ast), 0);
});

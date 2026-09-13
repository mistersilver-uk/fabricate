/**
 * Ratchets the source-text pin sites per test file (issue 1658), so the conversions in #1691 and
 * #1697 each lower `tests/source-pin-ledger.json` and nothing silently re-grows it.
 *
 * This file spells the tokens the gate hunts, in prose and in fixtures. That is safe by
 * construction rather than by exclusion: sites are AST call nodes, so a pattern written as a
 * string or regex literal, and a token in a comment, count zero.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { literalStrings, parseModule, walkNodes } from './helpers/moduleAst.js';
import { byCodePoint, describeLedgerDrift } from './helpers/ratchetBaseline.js';
import { countPinSites } from './helpers/sourcePinSites.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

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

/**
 * Names EXPORTED under `tests/` as a `src/` path constant, so a module that imports one and reads
 * through it resolves. Only an `export`ed declaration qualifies, and the set is applied per file
 * against what that file actually imports: matching bare names across the corpus would seed
 * `result`, `entry` and `text`, each bound to something unrelated in hundreds of places.
 */
function exportedPathConstants(corpus) {
  const names = new Set();
  for (const text of Object.values(corpus)) {
    for (const node of walkNodes(parseModule(text).ast)) {
      if (
        node.type !== 'ExportNamedDeclaration' ||
        node.declaration?.type !== 'VariableDeclaration'
      )
        continue;
      for (const declarator of node.declaration.declarations) {
        if (declarator.id?.type !== 'Identifier') continue;
        const [literal] = literalStrings(declarator.init ?? {});
        if (literal?.includes('src/')) names.add(declarator.id.name);
      }
    }
  }
  return names;
}

/** The subset of `exported` that this module imports, which is all it may resolve through. */
function importedPathNames(ast, exported) {
  const imported = new Set();
  for (const node of walkNodes(ast)) {
    if (node.type !== 'ImportDeclaration') continue;
    for (const specifier of node.specifiers) {
      const name = specifier.local?.name;
      if (name && exported.has(name)) imported.add(name);
    }
  }
  return imported;
}

function buildLedger() {
  const corpus = collectSources(resolve(repoRoot, CORPUS_ROOT), {
    extensions: [...SCANNED_EXTENSIONS],
  });
  const exportedPaths = exportedPathConstants(corpus);
  const counted = [];
  for (const [file, text] of Object.entries(corpus)) {
    let parsed;
    try {
      parsed = parseModule(text);
    } catch (error) {
      // `parseModule` names its probe path, never the real one, so attribute it here.
      throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
    }
    const sites = countPinSites(parsed.ast, {
      file,
      scopeManager: parsed.scopeManager,
      seedPaths: importedPathNames(parsed.ast, exportedPaths),
    });
    if (sites > 0) counted.push([file, sites]);
  }
  return Object.fromEntries(counted.sort(([left], [right]) => byCodePoint(left, right)));
}

let cached;
function currentLedger() {
  cached ??= buildLedger();
  return cached;
}

test('the source-pin ledger matches the pinned baseline exactly, per test file', () => {
  const actual = currentLedger();
  if (process.env.UPDATE_SOURCE_PIN_LEDGER) {
    writeFileSync(LEDGER_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.deepStrictEqual(
    actual,
    LEDGER,
    describeLedgerDrift(actual, LEDGER, {
      subject: 'source-pin counts',
      // The corpus is the working tree, so a stray untracked file trips the set before a real change.
      regenerate: REGENERATE,
      structuralHint:
        'A file that newly pins source text needs a reason; one that stopped has paid the debt down and should bank it.',
      roseHint: 'means a new pin on how the code is written rather than what it does',
      fellHint: 'needs the ledger lowered to bank the conversion',
    })
  );
});

test('a pattern spelled as a literal is not a pin site, so this gate does not count itself', () => {
  const probe = [
    String.raw`const SHAPE = /Source\.includes\(/;`,
    "const ALSO = '.includes(';",
    '// readFileSync of src/ in a comment is not a call',
    'export { SHAPE, ALSO };',
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 0);
});

test('a read through a path binding counts, which a same-line rule would miss', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "const rootPath = new URL('../src/ui/Thing.svelte', import.meta.url);",
    "const rootSource = readFileSync(rootPath, 'utf8');",
    "export const ok = rootSource.includes('class=');",
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  // One read plus one `includes` on what it read.
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 2);
});

test('a read through a local wrapper counts, and its binding is a source not a path', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "import { resolve } from 'node:path';",
    'function read(relPath) {',
    "  return readFileSync(resolve(import.meta.dirname, relPath), 'utf8');",
    '}',
    "const rootSource = read('../../src/ui/svelte/apps/FabricateAppRoot.svelte');",
    "export const ok = rootSource.includes('<JournalView');",
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  // One read through the wrapper plus one `includes` on what it read.
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 2);
});

test('two bindings of one name in different scopes are not conflated', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    'export function pin() {',
    "  const source = readFileSync('src/a.js', 'utf8');",
    "  return source.includes('x');",
    '}',
    'export function unrelated(rows) {',
    "  const source = rows.join(',');",
    "  return source.includes('y');",
    '}',
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  // The read and the pin on it; the unrelated join is not source text.
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 2);
});

test('text derived from a source binding is still a source', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "const a = readFileSync('src/one.js', 'utf8');",
    "const b = readFileSync('src/two.js', 'utf8');",
    String.raw`const joined = [a, b].join('\n');`,
    "export const ok = joined.includes('export');",
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 3);
});

test('a source held in a property or indexed out of a map is still a pin', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "const byFile = { a: readFileSync('src/a.js', 'utf8') };",
    "export const one = byFile['a'].includes('export');",
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  // One read, plus the indexed match on what it read.
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 2);
});

test('a helper matching a handed parameter against a literal pins only under tests/helpers', () => {
  const probe = [
    'export function pins(source) {',
    "  return source.includes('export const');",
    '}',
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  assert.equal(countPinSites(ast, { file: 'tests/helpers/thing.js', scopeManager }), 1);
  // The same shape in a behavioural test is ordinary membership, not a source pin.
  assert.equal(countPinSites(ast, { file: 'tests/thing.test.js', scopeManager }), 0);
});

test('a regex test and an assert.match on source are pins, like includes', () => {
  const probe = [
    "import { readFileSync } from 'node:fs';",
    "import assert from 'node:assert/strict';",
    "const src = readFileSync('src/a.svelte', 'utf8');",
    'export const one = /premium/i.test(src);',
    'assert.match(src, /export/);',
  ].join('\n');
  const { ast, scopeManager } = parseModule(probe);
  // The read, the regex test on what it read, and the assert.match on the same text.
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 3);
});

test('an includes on text that never came from src/ is not a pin', () => {
  const probe = ["const dataSource = 'a,b,c';", "export const ok = dataSource.includes('b');"].join(
    '\n'
  );
  const { ast, scopeManager } = parseModule(probe);
  assert.equal(countPinSites(ast, { file: 'tests/x.test.js', scopeManager }), 0);
});

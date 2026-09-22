/**
 * Bounds the source-text pin sites per test file (issue 1658) as a ceiling with no headroom, so a
 * new pin needs a reason and a conversion that removes one is banked by deleting its row.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { literalStrings, parseModule, walkNodes } from './helpers/moduleAst.js';
import { byCodePoint, ceilingLedgerGate } from './helpers/ratchetBaseline.js';
import { countPinSites } from './helpers/sourcePinSites.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

const LEDGER_PATH = resolve(import.meta.dirname, 'source-pin-ledger.txt');

const RUN = 'node --conditions=browser --test tests/source-pin-ratchet.test.js';

/** Below this the scan is truncated rather than clean; `tests/` holds ~1,160 modules. */
const SCAN_FLOOR = 901;

/**
 * The whole `tests/**` tree, not the `npm test` glob's directories: a pin in a directory the glob
 * does not run is still a pin, and `tests/helpers/` is both scanned and scanning.
 */
const CORPUS_ROOT = 'tests';
const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs']);

/**
 * Names EXPORTED under `tests/` as a `src/` path constant, so a module that imports one and reads
 * through it resolves.
 */
function exportedPathConstants(parsed) {
  const names = new Set();
  for (const { ast } of parsed.values()) {
    for (const node of walkNodes(ast)) {
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
  // Parsed once, not once per pass: the seed scan and the count both need an AST, and parsing a
  // thousand modules twice inside `npm test` starves the browser-backed suites running beside it.
  const parsed = new Map();
  for (const [file, text] of Object.entries(corpus)) {
    try {
      parsed.set(file, parseModule(text));
    } catch (error) {
      // `parseModule` names its probe path, never the real one, so attribute it here.
      throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
    }
  }
  const exportedPaths = exportedPathConstants(parsed);
  const counted = [];
  for (const [file, { ast, scopeManager }] of parsed) {
    const sites = countPinSites(ast, {
      file,
      scopeManager,
      seedPaths: importedPathNames(ast, exportedPaths),
    });
    if (sites > 0) counted.push([file, sites]);
  }
  return {
    observed: Object.fromEntries(counted.sort(([left], [right]) => byCodePoint(left, right))),
    scanned: Object.keys(corpus).length,
  };
}

const gate = ceilingLedgerGate({
  test,
  assert,
  title: 'no test file pins more source text than its ledger ceiling',
  ledgerPath: LEDGER_PATH,
  updateEnv: 'UPDATE_SOURCE_PIN_LEDGER',
  tightenEnv: 'TIGHTEN_SOURCE_PIN_LEDGER',
  build: buildLedger,
  // No headroom: a pin is discrete, so there is no size at which one more is the same debt.
  ceiling: (_key, sites) => sites,
  shrink: 'fail',
  floor: SCAN_FLOOR,
  wording: {
    subject: 'source-pin counts',
    update: `UPDATE_SOURCE_PIN_LEDGER=1 ${RUN}`,
    tighten: `TIGHTEN_SOURCE_PIN_LEDGER=1 ${RUN}`,
    addedHint:
      'A new pin asserts how the code is written rather than what it does; assert the behaviour ' +
      'instead, or say in the PR why the text is the contract.',
    staleHint:
      'A file that stopped pinning source text has paid the debt down, and a row nobody is using ' +
      'is a standing permission for whoever finds it next.',
  },
});

/** The counter's behaviour, as a table. */
const PROBES = Object.freeze([
  {
    name: 'a pattern spelled as a literal is not a pin site, so the gate does not count itself',
    file: 'tests/x.test.js',
    sites: 0,
    source: [
      String.raw`const SHAPE = /Source\.includes\(/;`,
      "const ALSO = '.includes(';",
      '// readFileSync of src/ in a comment is not a call',
      'export { SHAPE, ALSO };',
    ],
  },
  {
    name: 'a read through a path binding counts, which a same-line rule would miss',
    file: 'tests/x.test.js',
    sites: 2,
    source: [
      "import { readFileSync } from 'node:fs';",
      "const rootPath = new URL('../src/ui/Thing.svelte', import.meta.url);",
      "const rootSource = readFileSync(rootPath, 'utf8');",
      "export const ok = rootSource.includes('class=');",
    ],
  },
  {
    name: 'a read through a local wrapper counts, and its binding is a source not a path',
    file: 'tests/x.test.js',
    sites: 2,
    source: [
      "import { readFileSync } from 'node:fs';",
      "import { resolve } from 'node:path';",
      'function read(relPath) {',
      "  return readFileSync(resolve(import.meta.dirname, relPath), 'utf8');",
      '}',
      "const rootSource = read('../../src/ui/svelte/apps/FabricateAppRoot.svelte');",
      "export const ok = rootSource.includes('<JournalView');",
    ],
  },
  {
    name: 'two bindings of one name in different scopes are not conflated',
    file: 'tests/x.test.js',
    sites: 2,
    source: [
      "import { readFileSync } from 'node:fs';",
      'export function pin() {',
      "  const source = readFileSync('src/a.js', 'utf8');",
      "  return source.includes('x');",
      '}',
      'export function unrelated(rows) {',
      "  const source = rows.join(',');",
      "  return source.includes('y');",
      '}',
    ],
  },
  {
    name: 'text derived from a source binding is still a source',
    file: 'tests/x.test.js',
    sites: 3,
    source: [
      "import { readFileSync } from 'node:fs';",
      "const a = readFileSync('src/one.js', 'utf8');",
      "const b = readFileSync('src/two.js', 'utf8');",
      String.raw`const joined = [a, b].join('\n');`,
      "export const ok = joined.includes('export');",
    ],
  },
  {
    name: 'a source held in a property or indexed out of a map is still a pin',
    file: 'tests/x.test.js',
    sites: 2,
    source: [
      "import { readFileSync } from 'node:fs';",
      "const byFile = { a: readFileSync('src/a.js', 'utf8') };",
      "export const one = byFile['a'].includes('export');",
    ],
  },
  {
    name: 'a regex test and an assert.match on source are pins, like includes',
    file: 'tests/x.test.js',
    sites: 3,
    source: [
      "import { readFileSync } from 'node:fs';",
      "import assert from 'node:assert/strict';",
      "const src = readFileSync('src/a.svelte', 'utf8');",
      'export const one = /premium/i.test(src);',
      'assert.match(src, /export/);',
    ],
  },
  {
    name: 'an includes on text that never came from src/ is not a pin',
    file: 'tests/x.test.js',
    sites: 0,
    source: ["const dataSource = 'a,b,c';", "export const ok = dataSource.includes('b');"],
  },
  {
    name: 'a helper matching a handed parameter against a literal pins under tests/helpers',
    file: 'tests/helpers/thing.js',
    sites: 1,
    source: ['export function pins(source) {', "  return source.includes('export const');", '}'],
  },
  {
    name: 'the same shape in a behavioural test is membership, not a source pin',
    file: 'tests/thing.test.js',
    sites: 0,
    source: ['export function pins(source) {', "  return source.includes('export const');", '}'],
  },
]);

for (const probe of PROBES) {
  test(probe.name, () => {
    const { ast, scopeManager } = parseModule(probe.source.join('\n'));
    assert.equal(countPinSites(ast, { file: probe.file, scopeManager }), probe.sites);
  });
}

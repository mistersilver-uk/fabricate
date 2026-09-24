/**
 * Bounds the source-text pin sites per test file (issue 1658) as a ceiling with no headroom, so a
 * new pin needs a reason and a conversion that removes one is banked by deleting its row. Every
 * non-test module that reads files is listed with a reviewed kind (issue 1933).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { parseModule } from './helpers/moduleAst.js';
import { byCodePoint, ceilingLedgerGate } from './helpers/ratchetBaseline.js';
import { countCorpusPinSites, countPinSites } from './helpers/sourcePinSites.js';
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

const TEST_MODULE = /\.test\.m?js$/u;

/**
 * Every non-test module under `tests/` that reads files, raw or through an exported wrapper, with
 * the reviewed reason it may: `ast` hands back structure, never text; `corpus` is a deliberate
 * whole-tree scan; `fixture` reads data, a ledger, or a file to compile or mount; `legacy-scan`
 * hands out raw text that tests pin, and is retired by #1932 and the #1933 conversions.
 */
const SCAN_HELPERS = Object.freeze({
  'tests/components/design-system-known-debt.js': 'fixture',
  'tests/components/design-system-target-baseline.js': 'fixture',
  'tests/components/manager-bulk-mounted.js': 'fixture',
  'tests/components/manager-checks-mounted.js': 'fixture',
  'tests/components/manager-components-mounted.js': 'fixture',
  'tests/components/manager-downtime-mounted.js': 'fixture',
  'tests/components/manager-environments-mounted.js': 'fixture',
  'tests/components/manager-essences-mounted.js': 'fixture',
  'tests/components/manager-gathering-mounted.js': 'fixture',
  'tests/components/manager-header-mounted.js': 'fixture',
  'tests/components/manager-layout-browsers.js': 'legacy-scan',
  'tests/components/manager-layout-downtime-fixtures.js': 'legacy-scan',
  'tests/components/manager-layout-gathering-fixtures.js': 'legacy-scan',
  'tests/components/manager-layout-gathering.js': 'legacy-scan',
  'tests/components/manager-layout-primitives-fixtures.js': 'legacy-scan',
  'tests/components/manager-layout-primitives.js': 'legacy-scan',
  'tests/components/manager-layout-recipes-fixtures.js': 'legacy-scan',
  'tests/components/manager-layout-recipes.js': 'legacy-scan',
  'tests/components/manager-layout-select.js': 'legacy-scan',
  'tests/components/manager-layout-shared.js': 'legacy-scan',
  'tests/components/manager-layout-side-rail-fixtures.js': 'fixture',
  'tests/components/manager-layout-tools-fixtures.js': 'legacy-scan',
  'tests/components/manager-layout-tools.js': 'legacy-scan',
  'tests/components/manager-mounted-shared.js': 'fixture',
  'tests/components/manager-rail-mounted.js': 'fixture',
  'tests/components/manager-recipes-mounted.js': 'fixture',
  'tests/components/manager-systems-mounted.js': 'fixture',
  'tests/components/manager-tags-mounted.js': 'fixture',
  'tests/components/manager-tools-mounted.js': 'fixture',
  'tests/components/manager-world-scope-mounted.js': 'fixture',
  'tests/components/selector-repetition-baseline.js': 'fixture',
  'tests/components/spacing-known-literals.js': 'fixture',
  'tests/helpers/chipTone.js': 'legacy-scan',
  'tests/helpers/companionContractOutcomes.js': 'fixture',
  'tests/helpers/compile-svelte-module.js': 'fixture',
  'tests/helpers/componentScopeMountModules.js': 'fixture',
  'tests/helpers/designLibrary.js': 'fixture',
  'tests/helpers/domCensus.js': 'fixture',
  'tests/helpers/extension-composition-harness.js': 'fixture',
  'tests/helpers/harvestedFoundryChrome.js': 'fixture',
  'tests/helpers/interactablesSmokeLocators.js': 'legacy-scan',
  'tests/helpers/interactablesWindowContract.js': 'ast',
  'tests/helpers/langBackedI18n.js': 'fixture',
  'tests/helpers/legacyLintGate.js': 'fixture',
  'tests/helpers/manager-button-cascade.js': 'legacy-scan',
  'tests/helpers/manager/managerCompile.js': 'fixture',
  'tests/helpers/manager/managerLocalization.js': 'fixture',
  'tests/helpers/manager/managerStylesheet.js': 'ast',
  'tests/helpers/parsedSource.js': 'ast',
  'tests/helpers/primitiveAdoptionContract.js': 'legacy-scan',
  'tests/helpers/primitiveSourceContract.js': 'legacy-scan',
  'tests/helpers/ratchetBaseline.js': 'fixture',
  'tests/helpers/renderedManagerShell.js': 'fixture',
  'tests/helpers/scoped-component-css.js': 'fixture',
  'tests/helpers/sourceScan.js': 'corpus',
  'tests/helpers/stepperSourceContract.js': 'legacy-scan',
  'tests/helpers/structureContract.js': 'ast',
  'tests/helpers/styleBlockScan.js': 'corpus',
  'tests/helpers/svelte-component-harness.js': 'fixture',
  'tests/helpers/svelteTemplateScan.js': 'ast',
  'tests/helpers/validationAddressContracts.js': 'legacy-scan',
});

const HELPER_KINDS = Object.freeze(['ast', 'corpus', 'fixture', 'legacy-scan']);

/** The `legacy-scan` entries, as a ceiling that may only fall: lower it as each one is retired. */
const LEGACY_SCAN_CEILING = 19;

/** `{path: text or lines}` parsed the way the gate parses the tree. */
function parseCorpus(modules) {
  const parsed = new Map();
  for (const [file, text] of Object.entries(modules)) {
    try {
      parsed.set(file, parseModule(Array.isArray(text) ? text.join('\n') : text));
    } catch (error) {
      // `parseModule` names its probe path, never the real one, so attribute it here.
      throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
    }
  }
  return parsed;
}

let analysis;

/**
 * The tree parsed and counted once for every gate here: parsing a thousand modules twice inside
 * `npm test` starves the browser-backed suites running beside it.
 */
function analyseTree() {
  if (analysis === undefined) {
    const corpus = collectSources(resolve(repoRoot, CORPUS_ROOT), {
      extensions: [...SCANNED_EXTENSIONS],
    });
    analysis = { ...countCorpusPinSites(parseCorpus(corpus)), scanned: Object.keys(corpus).length };
  }
  return analysis;
}

function buildLedger() {
  const { sites, scanned } = analyseTree();
  const counted = [...sites].sort(([left], [right]) => byCodePoint(left, right));
  return { observed: Object.fromEntries(counted), scanned };
}

/** How the non-test modules that read files disagree with a helper map. */
function scanHelperFindings(fileReaders, helpers) {
  const listed = Object.keys(helpers).sort(byCodePoint);
  return {
    unlisted: [...fileReaders]
      .filter((file) => !TEST_MODULE.test(file) && !Object.hasOwn(helpers, file))
      .sort(byCodePoint),
    stale: listed.filter((file) => !fileReaders.has(file)),
    unknownKind: listed.filter((file) => !HELPER_KINDS.includes(helpers[file])),
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

const READ_TEXT = [
  "import { readFileSync } from 'node:fs';",
  "export const SOURCE = readFileSync('src/a.js', 'utf8');",
];

/** Text crossing a module boundary, one row per export and import form (issue 1933). */
const CORPUS_PROBES = Object.freeze([
  {
    name: 'an exported source const is a source in the module that imports it',
    modules: {
      'tests/helpers/text.js': READ_TEXT,
      'tests/x.test.js': [
        "import { SOURCE } from './helpers/text.js';",
        "export const ok = SOURCE.includes('x');",
      ],
    },
    sites: 1,
  },
  {
    name: 'text exported through a specifier list is still text',
    modules: {
      'tests/helpers/text.js': [
        "import { readFileSync } from 'node:fs';",
        "const text = readFileSync('src/a.js', 'utf8');",
        'export { text as SOURCE };',
      ],
      'tests/x.test.js': [
        "import { SOURCE } from './helpers/text.js';",
        "export const ok = SOURCE.includes('x');",
      ],
    },
    sites: 1,
  },
  {
    name: 'text re-exported by name or by star is still text',
    modules: {
      'tests/helpers/text.js': READ_TEXT,
      'tests/helpers/more.js': [
        "import { readFileSync } from 'node:fs';",
        "export const OTHER = readFileSync('src/b.js', 'utf8');",
      ],
      'tests/helpers/index.js': [
        "export { SOURCE } from './text.js';",
        "export * from './more.js';",
      ],
      'tests/x.test.js': [
        "import { OTHER, SOURCE } from './helpers/index.js';",
        "export const ok = SOURCE.includes('x') && OTHER.includes('y');",
      ],
    },
    sites: 2,
  },
  {
    name: 'an aliased import of text is still text',
    modules: {
      'tests/helpers/text.js': READ_TEXT,
      'tests/x.test.js': [
        "import { SOURCE as text } from './helpers/text.js';",
        "export const ok = text.includes('x');",
      ],
    },
    sites: 1,
  },
  {
    name: 'a namespace member is text only where its export is',
    modules: {
      'tests/helpers/text.js': [...READ_TEXT, "export const NAMES = ['x'];"],
      'tests/x.test.js': [
        "import * as helper from './helpers/text.js';",
        "export const ok = helper.SOURCE.includes('x') && helper.NAMES.includes('x');",
      ],
    },
    sites: 1,
  },
  {
    name: 'a call of an exported function returning text is text',
    modules: {
      'tests/helpers/entry.js': [
        "import { readFileSync } from 'node:fs';",
        'export function entrySource() {',
        "  return readFileSync('src/main.js', 'utf8');",
        '}',
      ],
      'tests/x.test.js': [
        "import { entrySource } from './helpers/entry.js';",
        'const source = entrySource();',
        "export const ok = source.includes('a') && entrySource().includes('b');",
      ],
    },
    sites: 2,
  },
  {
    name: 'text resolves across two hops, whatever order the modules are met in',
    modules: {
      'tests/x.test.js': [
        "import { methodSource } from './helpers/method.js';",
        "export const ok = methodSource('run').includes('await');",
      ],
      'tests/helpers/method.js': [
        "import { SOURCE } from './text.js';",
        'export function methodSource(name) {',
        '  return SOURCE.slice(SOURCE.indexOf(name));',
        '}',
      ],
      'tests/helpers/text.js': READ_TEXT,
    },
    sites: 1,
  },
  {
    name: 'a read through an imported path constant counts',
    modules: {
      'tests/helpers/paths.js': ["export const ROOT_PATH = 'src/ui/Root.svelte';"],
      'tests/x.test.js': [
        "import { readFileSync } from 'node:fs';",
        "import { ROOT_PATH } from './helpers/paths.js';",
        "const source = readFileSync(ROOT_PATH, 'utf8');",
        "export const ok = source.includes('<div');",
      ],
    },
    sites: 2,
  },
  {
    name: 'an import is keyed by its module, so a same-named export elsewhere is not text',
    modules: {
      'tests/helpers/text.js': READ_TEXT,
      'tests/helpers/list.js': ["export const SOURCE = ['x'];"],
      'tests/x.test.js': [
        "import { SOURCE } from './helpers/list.js';",
        "export const ok = SOURCE.includes('x');",
      ],
    },
    sites: 0,
  },
  {
    name: 'an imported reader wrapper is not a pin read, since most compile or mount a file',
    modules: {
      'tests/helpers/compile.js': [
        "import { readFileSync } from 'node:fs';",
        'export function compile(path) {',
        "  return readFileSync(path, 'utf8');",
        '}',
      ],
      'tests/x.test.js': [
        "import { compile } from './helpers/compile.js';",
        "export const mounted = compile('src/ui/Root.svelte');",
      ],
    },
    sites: 0,
  },
]);

for (const probe of CORPUS_PROBES) {
  test(probe.name, () => {
    const { sites } = countCorpusPinSites(parseCorpus(probe.modules));
    assert.equal(sites.get('tests/x.test.js') ?? 0, probe.sites);
  });
}

test('every non-test module under tests/ that reads files is listed with a reviewed kind', () => {
  const findings = scanHelperFindings(analyseTree().fileReaders, SCAN_HELPERS);
  assert.deepEqual(
    findings,
    { unlisted: [], stale: [], unknownKind: [] },
    'A helper that reads files is where a raw scan hides from the pin ledger, since its pins ' +
      'land in whichever test imports it. List a new one in SCAN_HELPERS with the kind a review ' +
      `agreed (${HELPER_KINDS.join(', ')}), and drop the entry of one that stopped reading.`
  );
});

test('the legacy-scan helpers only fall', () => {
  const legacy = Object.values(SCAN_HELPERS).filter((kind) => kind === 'legacy-scan').length;
  assert.ok(
    legacy <= LEGACY_SCAN_CEILING,
    `${legacy} legacy-scan helpers, over the ceiling of ${LEGACY_SCAN_CEILING}: hand structure ` +
      'back through `parsedSource.js` instead of adding a helper that hands out raw text.'
  );
  assert.equal(
    legacy,
    LEGACY_SCAN_CEILING,
    `Bank the retirement: lower LEGACY_SCAN_CEILING to ${legacy}.`
  );
});

test('a helper reading files raw, aliased or via a wrapper chain is flagged until listed', () => {
  const { fileReaders } = countCorpusPinSites(
    parseCorpus({
      'tests/helpers/scan.js': [
        "import { readFileSync } from 'node:fs';",
        "export const readListed = (full) => readFileSync(full, 'utf8');",
      ],
      'tests/helpers/raw.js': [
        "import { readFileSync as read } from 'node:fs';",
        "export const text = read('src/a.js', 'utf8');",
      ],
      'tests/helpers/wrapped.js': [
        "import { readListed } from './scan.js';",
        'export const load = (file) => readListed(file);',
      ],
      'tests/helpers/twoHop.js': [
        "import { load } from './wrapped.js';",
        "export const text = load('src/a.js');",
      ],
      'tests/helpers/pure.js': ['export const PURE = 1;'],
      'tests/reads.test.js': [
        "import { readFileSync } from 'node:fs';",
        "readFileSync('a', 'utf8');",
      ],
    })
  );
  const listed = { 'tests/helpers/scan.js': 'corpus', 'tests/helpers/pure.js': 'scan' };
  assert.deepEqual(scanHelperFindings(fileReaders, listed), {
    unlisted: ['tests/helpers/raw.js', 'tests/helpers/twoHop.js', 'tests/helpers/wrapped.js'],
    stale: ['tests/helpers/pure.js'],
    unknownKind: ['tests/helpers/pure.js'],
  });
});

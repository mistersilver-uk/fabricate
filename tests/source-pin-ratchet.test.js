/**
 * Bounds the source-text pin sites per test file (issue 1658) against the base commit: a file may
 * not pin more than it did there. Text followed across imports (issue 1933) makes the whole
 * `tests/**` corpus one measurement. Every non-test module that reads files is listed with a
 * reviewed kind, and no helper may become `legacy-scan`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { compareToBase, reportComparison } from './helpers/mergeBaseRatchet.js';
import { parseModule } from './helpers/moduleAst.js';
import { countCorpusPinSites, countPinSites } from './helpers/sourcePinSites.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'source-pin';

/** This file, whose `SCAN_HELPERS` is read on each side to compare the `legacy-scan` rows. */
const SELF = 'tests/source-pin-ratchet.test.js';

const PIN_ID = 'source-text pin sites';
const LEGACY_ID = 'legacy-scan helper';

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
 * hands out raw text that tests pin, and may only be retired, never added.
 */
const SCAN_HELPERS = Object.freeze({
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
  'tests/helpers/checkEvidenceFixtures.js': 'fixture',
  'tests/helpers/chipPaint.js': 'fixture',
  'tests/helpers/chipTone.js': 'legacy-scan',
  'tests/helpers/companionContractOutcomes.js': 'fixture',
  'tests/helpers/compile-svelte-module.js': 'fixture',
  'tests/helpers/componentEditViewModules.js': 'fixture',
  'tests/helpers/componentScopeMountModules.js': 'fixture',
  'tests/helpers/designLibrary.js': 'fixture',
  'tests/helpers/designSystemRatchet.js': 'corpus',
  'tests/helpers/domCensus.js': 'fixture',
  'tests/helpers/extension-composition-harness.js': 'fixture',
  'tests/helpers/harvestedFoundryChrome.js': 'fixture',
  'tests/helpers/interactablesSmokeLocators.js': 'legacy-scan',
  'tests/helpers/interactablesWindowContract.js': 'ast',
  'tests/helpers/langBackedI18n.js': 'fixture',
  'tests/helpers/manager-button-cascade.js': 'legacy-scan',
  'tests/helpers/manager/managerCompile.js': 'fixture',
  'tests/helpers/manager/managerLocalization.js': 'fixture',
  'tests/helpers/manager/managerStylesheet.js': 'ast',
  'tests/helpers/mergeBaseRatchet.js': 'corpus',
  'tests/helpers/parsedSource.js': 'ast',
  'tests/helpers/primitiveAdoptionContract.js': 'legacy-scan',
  'tests/helpers/primitiveSourceContract.js': 'legacy-scan',
  'tests/helpers/recordedRollParse.js': 'fixture',
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

const inCorpus = (file) =>
  file.startsWith(`${CORPUS_ROOT}/`) && SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext));

/** Parsed modules by text: base and head share nearly every file, so each is parsed once. */
const parsedByText = new Map();

function parseText(file, text) {
  if (!parsedByText.has(text)) {
    try {
      parsedByText.set(text, parseModule(text));
    } catch (error) {
      // `parseModule` names its probe path, never the real one, so attribute it here.
      throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
    }
  }
  return parsedByText.get(text);
}

/** `{path: text or lines}` parsed the way the gate parses the tree. */
function parseCorpus(modules) {
  const parsed = new Map();
  for (const [file, text] of Object.entries(modules)) {
    parsed.set(file, parseText(file, Array.isArray(text) ? text.join('\n') : text));
  }
  return parsed;
}

/** Corpus analyses by content, so an identical tree is analysed once per run. */
const analyses = new Map();

/** Every file's pin sites and which modules read files, over `files` as `readFile` gives them. */
function analyseCorpus(files, readFile) {
  const texts = new Map();
  const digest = createHash('sha256');
  for (const file of [...files].sort(byCodePoint)) {
    const text = readFile(file);
    if (text === undefined) continue;
    texts.set(file, text);
    digest.update(`${file}\0${text}\0`);
  }
  const key = digest.digest('hex');
  if (!analyses.has(key)) {
    const parsed = new Map([...texts].map(([file, text]) => [file, parseText(file, text)]));
    analyses.set(key, { ...countCorpusPinSites(parsed), texts });
  }
  return analyses.get(key);
}

/** The `SCAN_HELPERS` rows `text` declares, each with its 1-based line; none when it has none. */
function scanHelperRows(text) {
  const { ast } = parseText(SELF, text);
  for (const statement of ast.body) {
    for (const declarator of statement.declarations ?? []) {
      if (declarator.id?.name !== 'SCAN_HELPERS') continue;
      const object = declarator.init?.arguments?.[0] ?? declarator.init;
      return (object?.properties ?? []).map((property) => ({
        file: property.key.value,
        kind: property.value.value,
        line: property.loc.start.line,
      }));
    }
  }
  return [];
}

/**
 * One entry per pin site, counted per file, and one per `legacy-scan` row, netted on the kind so
 * the rows may only fall in number. A reasoned marker at a site or row new to base excuses it.
 */
function measureSourcePins(readFile, listFiles) {
  const { siteLines, texts } = analyseCorpus(listFiles(), readFile);
  const entries = [];
  for (const [file, lines] of siteLines) {
    for (const line of lines) entries.push({ file, id: PIN_ID, lines: [line] });
  }
  const self = texts.get(SELF);
  for (const row of self === undefined ? [] : scanHelperRows(self)) {
    if (row.kind !== 'legacy-scan') continue;
    const id = `${LEGACY_ID} ${row.file}`;
    entries.push({ file: SELF, id, value: 'legacy-scan', lines: [row.line] });
  }
  return entries;
}

const compareSourcePins = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: CORPUS_ROOT,
    include: inCorpus,
    measure: measureSourcePins,
    scope: 'corpus',
    headMarkers: false,
    siteMarkers: true,
    ...options,
  });

const GUIDANCE =
  'A pin asserts how the code is written rather than what it does; assert the behaviour instead. ' +
  'Text followed across imports counts where it is pinned, so a helper that starts handing out ' +
  'source text raises the tests that use it. A new legacy-scan helper should hand structure back ' +
  "through `parsedSource.js` instead. A pin's exemption goes on its line or the comment line " +
  "right above it; a legacy-scan row's goes above the row.";

test('no test file pins more source text, and no helper turns legacy-scan, than at base', (t) => {
  const listed = [];
  const measure = (readFile, listFiles) => {
    const files = listFiles();
    listed.push(files.length);
    return measureSourcePins(readFile, () => files);
  };
  const result = reportComparison(t, compareSourcePins({ measure }), GUIDANCE);
  if (!result.compared) return;
  t.diagnostic(`compared ${listed.join(' and ')} modules with base ${result.base.slice(0, 12)}`);
  assert.ok(
    Math.min(...listed) >= SCAN_FLOOR,
    `expected at least ${SCAN_FLOOR} scanned modules on each side; scanned ${listed.join(' and ')}`
  );
});

/** The working tree; the same content as the gate's head side, so it is not analysed again. */
function analyseTree() {
  const corpus = collectSources(resolve(repoRoot, CORPUS_ROOT), {
    extensions: [...SCANNED_EXTENSIONS],
  });
  const files = Object.keys(corpus);
  return { ...analyseCorpus(files, (file) => corpus[file]), scanned: files.length };
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

test('every non-test module under tests/ that reads files is listed with a reviewed kind', () => {
  const { fileReaders, scanned } = analyseTree();
  assert.ok(scanned >= SCAN_FLOOR, `expected ${SCAN_FLOOR}+ modules; scanned ${scanned}`);
  assert.deepEqual(
    scanHelperFindings(fileReaders, SCAN_HELPERS),
    { unlisted: [], stale: [], unknownKind: [] },
    'A helper that reads files is where a raw scan hides from the pin gate, since its pins land ' +
      'in whichever test imports it. List a new one in SCAN_HELPERS with the kind a review ' +
      `agreed (${HELPER_KINDS.join(', ')}), and drop the entry of one that stopped reading.`
  );
});

test("the gate reads this file's SCAN_HELPERS row for row, so its legacy-scan leg is live", () => {
  const rows = scanHelperRows(readFileSync(import.meta.filename, 'utf8'));
  assert.deepEqual(
    rows.map(({ file, kind }) => [file, kind]),
    Object.entries(SCAN_HELPERS)
  );
  assert.ok(rows.some(({ kind }) => kind === 'legacy-scan'));
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
    name: 'a regex test and an assert.match on a call returning source are pins',
    file: 'tests/x.test.js',
    sites: 3,
    source: [
      "import { readFileSync } from 'node:fs';",
      "import assert from 'node:assert/strict';",
      "const read = () => readFileSync('src/a.svelte', 'utf8');",
      'export const one = /premium/i.test(read());',
      'assert.match(read(), /export/);',
    ],
  },
  {
    name: 'a function returning source is followed whether exported, private or nested',
    file: 'tests/x.test.js',
    sites: 4,
    source: [
      "import { readFileSync } from 'node:fs';",
      "function rootSource() { return readFileSync('src/a.svelte', 'utf8'); }",
      'export function pins() {',
      "  function nested() { return readFileSync('src/b.js', 'utf8'); }",
      "  return rootSource().includes('x') && nested().includes('y');",
      '}',
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
        "import { compile } from 'svelte/compiler';",
        'export function compileFile(path) {',
        "  return compile(readFileSync(path, 'utf8'));",
        '}',
      ],
      'tests/x.test.js': [
        "import { compileFile } from './helpers/compile.js';",
        "export const mounted = compileFile('src/ui/Root.svelte');",
      ],
    },
    sites: 0,
  },
  {
    name: 'an imported wrapper returning the text it read is a read of the path it is handed',
    modules: {
      'tests/helpers/read.js': [
        "import { readFileSync } from 'node:fs';",
        'export function readRoot(path) {',
        "  return readFileSync(path, 'utf8');",
        '}',
        "export const readListed = (full) => readFileSync(full, 'utf8');",
      ],
      'tests/x.test.js': [
        "import { readListed, readRoot } from './helpers/read.js';",
        "const source = readRoot('src/ui/Root.svelte');",
        "export const lang = readRoot('lang/en.json');",
        "export const ok = source.includes('<div') && readListed('src/a.js').includes('x');",
      ],
    },
    sites: 3,
  },
  {
    name: 'a default export of text is text, named or anonymous',
    modules: {
      'tests/helpers/named.js': [
        "import { readFileSync } from 'node:fs';",
        "const TEXT = readFileSync('src/a.js', 'utf8');",
        'export default TEXT;',
      ],
      'tests/helpers/value.js': [
        "import { readFileSync } from 'node:fs';",
        "export default readFileSync('src/b.js', 'utf8');",
      ],
      'tests/helpers/declared.js': [
        "import { readFileSync } from 'node:fs';",
        'export default function () {',
        "  return readFileSync('src/c.js', 'utf8');",
        '}',
      ],
      'tests/helpers/arrow.js': [
        "import { readFileSync } from 'node:fs';",
        "export default () => readFileSync('src/d.js', 'utf8');",
      ],
      'tests/x.test.js': [
        "import named from './helpers/named.js';",
        "import value from './helpers/value.js';",
        "import declared from './helpers/declared.js';",
        "import arrow from './helpers/arrow.js';",
        "export const pins = named.includes('a') && value.includes('b');",
        "export const called = declared().includes('c') && arrow().includes('d');",
      ],
    },
    sites: 4,
  },
]);

for (const probe of CORPUS_PROBES) {
  test(probe.name, () => {
    const { sites } = countCorpusPinSites(parseCorpus(probe.modules));
    assert.equal(sites.get('tests/x.test.js') ?? 0, probe.sites);
  });
}

test('a helper reading files raw, aliased, keyed or via a wrapper chain is flagged until listed', () => {
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
      'tests/helpers/keyed.js': [
        "import fs from 'node:fs';",
        "export const text = fs['readFileSync']('a.txt', 'utf8');",
      ],
      'tests/helpers/destructured.js': [
        "import fs from 'node:fs';",
        'const { readFileSync: rd } = fs;',
        "export const text = rd('a.txt', 'utf8');",
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
    unlisted: [
      'tests/helpers/destructured.js',
      'tests/helpers/keyed.js',
      'tests/helpers/raw.js',
      'tests/helpers/twoHop.js',
      'tests/helpers/wrapped.js',
    ],
    stale: ['tests/helpers/pure.js'],
    unknownKind: ['tests/helpers/pure.js'],
  });
});

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A throwaway repository whose one commit holds `files`, compared by this gate's own wiring. */
function repoWith(files) {
  const repo = createTempGitRepo('source-pin-');
  repos.push(repo);
  const write = (entries) =>
    repo.write(
      Object.fromEntries(
        Object.entries(entries).map(([file, rows]) => [file, `${rows.join('\n')}\n`])
      )
    );
  write(files);
  const first = repo.commitAll('base');
  const compare = () => compareSourcePins({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write, compare };
}

/** A test reading `src/a.js` and pinning it once: two sites. */
const PINNING = [
  "import { readFileSync } from 'node:fs';",
  "const source = readFileSync('src/a.js', 'utf8');",
  "export const ok = source.includes('x');",
];

const BASE_CORPUS = Object.freeze({
  'tests/a.test.js': PINNING,
  'tests/helpers/names.js': ["export const NAMES = ['x'];"],
  'tests/b.test.js': [
    "import { NAMES } from './helpers/names.js';",
    "export const ok = NAMES.includes('x');",
  ],
});

const MARKER = '// ratchet-exempt(source-pin):';

test('a new pinning file and a file pinning more both fail against base', () => {
  const repo = repoWith(BASE_CORPUS);
  repo.write({
    'tests/c.test.js': PINNING,
    'tests/a.test.js': [...PINNING, "export const also = source.includes('y');"],
  });
  const result = repo.compare();
  assert.deepEqual(result.failures, [
    `tests/a.test.js: ${PIN_ID} rose from 2 to 3`,
    `tests/c.test.js: ${PIN_ID} is new (2)`,
  ]);
  assert.throws(() => reportComparison(null, result, GUIDANCE), /source-pin: 2 regression/);
});

test('a helper that starts handing out source raises the unchanged test that pins it', () => {
  const repo = repoWith(BASE_CORPUS);
  repo.write({
    'tests/helpers/names.js': [
      "import { readFileSync } from 'node:fs';",
      "export const NAMES = readFileSync('src/names.js', 'utf8');",
    ],
  });
  assert.deepEqual(repo.compare().failures, [
    `tests/b.test.js: ${PIN_ID} is new (1)`,
    `tests/helpers/names.js: ${PIN_ID} is new (1)`,
  ]);
});

test('a change to any scanned module compares, helpers included; any other change skips', () => {
  const repo = repoWith({ ...BASE_CORPUS, 'tests/data.json': ['{}'], 'src/a.js': ['x'] });
  repo.write({ 'tests/data.json': ['[]'], 'src/a.js': ['y'] });
  assert.equal(repo.compare().skipped, 'corpus-unchanged');
  repo.write({ 'tests/helpers/names.js': ["export const NAMES = ['y'];"] });
  const result = repo.compare();
  assert.deepEqual([result.compared, result.failures], [true, []]);
});

test('a reasoned marker above each pin exempts it, one in the file head does not, and an empty one fails', () => {
  const repo = repoWith(BASE_CORPUS);
  const reasoned = `${MARKER} the emitted text is the contract under test`;
  repo.write({
    'tests/a.test.js': [...PINNING, reasoned, "export const also = source.includes('y');"],
    'tests/c.test.js': [PINNING[0], reasoned, PINNING[1], reasoned, PINNING[2]],
    'tests/d.test.js': [reasoned, ...PINNING],
  });
  const exempt = repo.compare();
  assert.deepEqual(
    [exempt.failures, exempt.exempted.length],
    [[`tests/d.test.js: ${PIN_ID} is new (2)`], 3]
  );
  repo.write({ 'tests/d.test.js': ['export const none = 1;'] });
  repo.write({
    'tests/a.test.js': [
      ...PINNING,
      reasoned,
      "export const also = source.includes('y');",
      MARKER,
      "export const more = source.includes('z');",
    ],
    'tests/c.test.js': [PINNING[0], MARKER, PINNING[1], PINNING[2]],
  });
  const empty = (file, line) =>
    `${file}:${line} has a ratchet-exempt(source-pin) marker with no reason; write why the ` +
    'regression is legitimate after the colon';
  const unreasoned = '; its ratchet-exempt marker gives no reason';
  assert.deepEqual(repo.compare().failures, [
    `tests/a.test.js: ${PIN_ID} rose from 2 to 3${unreasoned}`,
    `tests/c.test.js: ${PIN_ID} is new (2)${unreasoned}`,
    empty('tests/a.test.js', 6),
    empty('tests/c.test.js', 2),
  ]);
});

test('a marker on a pin already at base buys no room for a new one', () => {
  const repo = repoWith(BASE_CORPUS);
  const reasoned = `${MARKER} the emitted text is the contract under test`;
  repo.write({
    'tests/a.test.js': [
      PINNING[0],
      PINNING[1],
      reasoned,
      PINNING[2],
      "export const also = source.includes('y');",
    ],
  });
  assert.deepEqual(repo.compare().failures, [`tests/a.test.js: ${PIN_ID} rose from 2 to 3`]);
});

test('a legacy-scan row may be retired or swapped but not added, unless a reason marks it', () => {
  const helpers = (...rows) => ['const SCAN_HELPERS = Object.freeze({', ...rows, '});'];
  const row = (file, kind) => `  'tests/helpers/${file}.js': '${kind}',`;
  const repo = repoWith({ [SELF]: helpers(row('a', 'legacy-scan'), row('b', 'fixture')) });
  repo.write({ [SELF]: helpers(row('a', 'legacy-scan'), row('b', 'legacy-scan')) });
  const id = (file) => `${SELF}: ${LEGACY_ID} tests/helpers/${file}.js`;
  assert.deepEqual(repo.compare().failures, [`${id('b')} is new (1)`]);
  repo.write({ [SELF]: helpers(row('a', 'fixture'), row('b', 'legacy-scan')) });
  const swapped = repo.compare();
  assert.deepEqual([swapped.failures, swapped.netted.length], [[], 1]);
  const marked = `  ${MARKER} a reason`;
  repo.write({ [SELF]: helpers(row('a', 'legacy-scan'), marked, row('b', 'legacy-scan')) });
  assert.deepEqual(repo.compare().failures, []);
  repo.write({ [SELF]: helpers(row('a', 'fixture'), row('b', 'fixture')) });
  assert.deepEqual(repo.compare().shrank, [`${id('a')} is gone (was 1)`]);
});

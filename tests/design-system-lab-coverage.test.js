/**
 * The coverage gate over the Primitive Lab's catalogue (issue 1487): every row addresses a drawing
 * `library.html` has, names a shipped and recorded component, and passes only props it declares.
 * It resolves addresses through the page's own `library.js` and `inject.js`, and reads the rows
 * through `scripts/lib/primitiveLabSmoke.js`, the reader `npm run lab:check` uses.
 * Every rule is a set comparison, so each carries an anchor that fails on an empty domain.
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

import {
  CATALOGUE_DIRECTORY,
  CATALOGUE_README,
  ERROR_ATTRIBUTE,
  MOUNTED_ATTRIBUTE,
  MOUNT_ALL_QUERY,
  READY_ATTRIBUTE,
  SPECIMEN_ATTRIBUTE,
  catalogueEntries,
  catalogueFiles,
  cataloguePaths,
  describeMountFailure,
  emptyCatalogueMessage,
  expectedSpecimenCount,
} from '../scripts/lib/primitiveLabSmoke.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import {
  parseDesignLibrary,
  primitiveNamesIn,
  readDesignLibrary,
} from './helpers/designLibrary.js';
import { declaredPropNames, PROP_NAME } from './helpers/sveltePropsDeclaration.js';
import CHROME_PROVENANCE from './view-lab/chrome-provenance.json' with { type: 'json' };
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import {
  MINIMAL_LAB_WORLD_FIELDS,
  createMinimalLabWorld,
} from './view-lab/foundry/minimalLabWorld.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import { normalize, specBlocks, unitsOf } from './view-lab/primitives/library.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Why a rule is held as `todo` until the gate is re-derived on `main`. */
const PHASE_16 = 'issue 1487 Phase 16';

/** The library's derived facts, parsed once: a `Window` per test runs `npm test` out of heap. */
const LIBRARY = parseDesignLibrary(readDesignLibrary());

/** The library as a live document, never mutated, because a `draws` selector must be evaluated. */
const LIBRARY_WINDOW = new Window();
LIBRARY_WINDOW.document.write(readDesignLibrary());
const LIBRARY_BODY = LIBRARY_WINDOW.document.body;

/** The manifest, read as the JSON the lab reads. */
const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);

/** Both manifest tables: a near-member ships and is drawable too. */
const MANIFEST_ROWS = [...MANIFEST.designSystemPrimitives, ...MANIFEST.notAPrimitive];

/** Every catalogue row, each carrying the file and index it was written at. */
const CATALOGUE = catalogueEntries(REPO_ROOT);

/** Every shipped component, as the repository-relative POSIX path a manifest row names. */
const SHIPPED_COMPONENTS = toRepositoryPaths(
  REPO_ROOT,
  listSvelteComponents(path.join(REPO_ROOT, 'src'))
);

/** A library name, brackets included, to the component that ships it. Unbuilt names are absent. */
const SHIPS_AS = new Map(
  MANIFEST_ROWS.filter((row) => row.library !== null).map((row) => [row.library, row.path])
);

/** What `declaredPropNames` reports for a `...rest` collector, through which any key reaches. */
const REST_PROP = '...rest';

/** The prop `LiveSpecimen.svelte` passes a row's `content` as. */
const CHILDREN_PROP = 'children';

/** Where a row was written, e.g. `catalogue/controls.json[3]`. */
function where(entry) {
  return `catalogue/${entry.file}[${entry.index}]`;
}

/** What `expected` holds that `present` does not, deduplicated, in code-point order. */
function missingFrom(present, expected) {
  const have = new Set(present);
  return [...new Set(expected)].filter((id) => !have.has(id)).sort(byCodePoint);
}

/** Component source text, read at most once per path. */
const sourceCache = new Map();

/**
 * The prop names a catalogue row's component declares.
 *
 * @param {string} componentPath Repository-relative POSIX path.
 * @returns {string[]|null} Declared names, or null when the file is absent or declares none.
 */
function declaredFor(componentPath) {
  if (!sourceCache.has(componentPath)) {
    const absolute = path.join(REPO_ROOT, componentPath);
    let declared = null;
    if (existsSync(absolute)) {
      try {
        declared = declaredPropNames(readFileSync(absolute, 'utf8'));
      } catch {
        declared = null; // no `$props()` destructure at all
      }
    }
    sourceCache.set(componentPath, declared);
  }
  return sourceCache.get(componentPath);
}

/** Every `.spec` entry, keyed by its heading exactly as `inject.js` keys them. */
const SPEC_BLOCKS = specBlocks(LIBRARY_BODY);

/** Per-entry caption index, built on demand. */
const unitCache = new Map();

function unitsFor(block) {
  if (!unitCache.has(block)) unitCache.set(block, unitsOf(block));
  return unitCache.get(block);
}

/**
 * Group the catalogue by `(spec, cap, draws)`, as `inject.js` groups it, keeping catalogue order.
 *
 * @returns {{spec: string, cap: string|null, draws: string, entries: object[]}[]} The addresses.
 */
function catalogueAddresses() {
  const groups = new Map();
  for (const entry of CATALOGUE) {
    const { spec, cap = null, draws } = entry.row;
    const key = JSON.stringify([spec ?? null, cap ?? null, draws ?? null]);
    if (!groups.has(key)) groups.set(key, { spec, cap: cap ?? null, draws, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}

/**
 * Resolve one address against the library, collecting rather than throwing: a module-scope throw
 * escapes the failure count.
 *
 * @returns {{targets: Element[], problem: string|null}} What it matched, or why it did not.
 */
function resolveAddress(address) {
  const cited = address.entries.map(where).join(', ');
  const block = SPEC_BLOCKS.get(address.spec);
  if (!block) {
    return {
      targets: [],
      problem:
        `${cited}: \`spec\` ${JSON.stringify(address.spec)} names no library entry. A row is ` +
        'addressed to a decoded, verbatim `div.spec-head > h4`, and the page would draw the ' +
        'specimen as authored, which looks exactly like a primitive that is not built yet.',
    };
  }
  if (typeof address.draws !== 'string' || address.draws.length === 0) {
    return { targets: [], problem: `${cited}: every row must name its drawing in \`draws\`` };
  }
  let scope = block;
  if (address.cap !== null) {
    const units = unitsFor(block);
    scope = units.get(normalize(address.cap));
    if (!scope) {
      return {
        targets: [],
        problem:
          `${cited}: entry ${address.spec} has no unit captioned ` +
          `${JSON.stringify(address.cap)}. Its captions are: ${[...units.keys()].join(' | ')}.`,
      };
    }
  }
  const targets = [...scope.querySelectorAll(address.draws)];
  if (targets.length !== address.entries.length) {
    return {
      targets,
      problem:
        `${cited}: \`draws\` ${JSON.stringify(address.draws)} matches ${targets.length} ` +
        `element(s) and ${address.entries.length} row(s) claim them. Rows sharing an address are ` +
        'paired positionally against what the selector matches, so re-read the entry and ' +
        'correct the rows.',
    };
  }
  return { targets, problem: null };
}

/** Every address with what it matched, resolved once. */
const RESOLVED = catalogueAddresses().map((address) => ({ address, ...resolveAddress(address) }));

test('the corpora every rule below quantifies over are alive', { todo: PHASE_16 }, () => {
  assert.ok(LIBRARY.blockCount > 0, 'the library parser found no spec-head block; the anchor died');
  assert.equal(
    LIBRARY.headingSections.length,
    LIBRARY.headings.length,
    'headingSections is positional against headings; the coverage rule below is scoped BY section'
  );
  assert.ok(SPEC_BLOCKS.size > 40, `the live document yielded ${SPEC_BLOCKS.size} entries`);
  assert.ok(MANIFEST_ROWS.length > 50, `the manifest holds ${MANIFEST_ROWS.length} rows`);
  assert.ok(SHIPS_AS.size > 20, `only ${SHIPS_AS.size} manifest rows name a library entry`);
  assert.ok(
    SHIPPED_COMPONENTS.length > 100,
    `the component walk found ${SHIPPED_COMPONENTS.length} files, so it is not walking`
  );
});

test('the catalogue is alive and every row carries an address', () => {
  const files = catalogueFiles(REPO_ROOT);
  assert.ok(files.length > 0, `the catalogue holds ${files.length} file(s)`);
  assert.ok(
    CATALOGUE.length > 50,
    `the catalogue holds ${CATALOGUE.length} rows; the Controls section alone is over 50`
  );
  assert.ok(
    RESOLVED.length > 10,
    `${RESOLVED.length} distinct address(es) for ${CATALOGUE.length} rows, so the grouping key ` +
      'stopped distinguishing them'
  );

  for (const entry of CATALOGUE) {
    const { spec, cap, draws, path: componentPath, props, content } = entry.row;
    assert.ok(
      typeof spec === 'string' && spec.length > 0,
      `${where(entry)}: \`spec\` must be the library entry's heading, decoded and verbatim`
    );
    assert.ok(
      typeof draws === 'string' && draws.length > 0,
      `${where(entry)}: \`draws\` must be a CSS selector for the drawing this row replaces`
    );
    assert.ok(
      typeof componentPath === 'string' && componentPath.length > 0,
      `${where(entry)}: \`path\` must be the component's repository-relative POSIX path`
    );
    assert.ok(
      cap === undefined || (typeof cap === 'string' && cap.length > 0),
      `${where(entry)}: \`cap\` is optional, but an empty one addresses no unit`
    );
    assert.ok(
      props === undefined || (typeof props === 'object' && props !== null && !Array.isArray(props)),
      `${where(entry)}: \`props\` must be a plain object, passed to the component verbatim`
    );
    assert.ok(
      content === undefined || Array.isArray(content),
      `${where(entry)}: \`content\` must be a node array, which \`LiveSpecimen.svelte\` iterates`
    );
  }
});

test('every catalogue row addresses a drawing the library actually has', () => {
  for (const resolved of RESOLVED) {
    assert.ok(resolved.problem === null, resolved.problem ?? '');
  }
  const matched = RESOLVED.reduce((total, resolved) => total + resolved.targets.length, 0);
  assert.equal(
    matched,
    CATALOGUE.length,
    `${CATALOGUE.length} rows resolved to ${matched} drawing(s); one row stands one drawing up`
  );
  assert.ok(matched > 50, `${matched} drawings matched, which is not the whole catalogue`);
});

test('no drawing a row claims contains a drawing another row claims', () => {
  // `inject.js` resolves every address before replacing, so an outer replacement would detach an
  // inner host and its specimen would mount outside the document.
  const hosts = RESOLVED.flatMap((resolved) =>
    resolved.targets.map((host, index) => ({ host, entry: resolved.address.entries[index] }))
  );
  assert.ok(hosts.length > 50, `${hosts.length} drawings claimed, so this rule has no domain`);
  for (const outer of hosts) {
    for (const inner of hosts) {
      if (outer === inner) continue;
      assert.ok(
        !outer.host.contains(inner.host),
        `${where(outer.entry)} claims a drawing that contains the one ${where(inner.entry)} ` +
          'claims, so the inner specimen would mount into a detached subtree'
      );
    }
  }
});

test('the page resolver reads the catalogue exactly as this gate does', () => {
  const { slots, problems } = resolveSlots(
    LIBRARY_BODY,
    CATALOGUE.map((entry) => entry.row)
  );
  assert.deepEqual(
    problems,
    [],
    `the page's own resolver rejects ${problems.length} address(es) this gate accepted`
  );
  assert.equal(
    slots.length,
    CATALOGUE.length,
    `the page's resolver placed ${slots.length} of ${CATALOGUE.length} rows`
  );
});

test('every catalogue row names a shipped component the manifest records', () => {
  const recorded = new Set(MANIFEST_ROWS.map((row) => row.path));
  const shipped = new Set(SHIPPED_COMPONENTS);
  for (const entry of CATALOGUE) {
    const componentPath = entry.row.path;
    assert.ok(
      shipped.has(componentPath),
      `${where(entry)}: no component at ${componentPath}; the specimen would render as a mount ` +
        'failure rather than as a row naming a file that is not there'
    );
    assert.ok(
      recorded.has(componentPath),
      `${where(entry)}: ${componentPath} is in neither manifest table, so the coverage rule ` +
        'cannot see it'
    );
  }
});

test('every prop a catalogue row passes is a prop the component declares', () => {
  let checked = 0;
  for (const entry of CATALOGUE) {
    const declared = declaredFor(entry.row.path);
    if (declared === null) {
      assert.deepEqual(
        Object.keys(entry.row.props ?? {}),
        [],
        `${where(entry)}: ${entry.row.path} has no \`$props()\` destructure and the row passes ` +
          'props, which Svelte drops silently'
      );
      continue;
    }
    const names = new Set(declared);
    for (const prop of Object.keys(entry.row.props ?? {})) {
      checked += 1;
      assert.ok(
        names.has(prop) || names.has(REST_PROP),
        `${where(entry)}: \`${prop}\` is not a prop ${entry.row.path} declares and it has no ` +
          `\`${REST_PROP}\`. Its props are: ${declared.join(', ')}. Svelte drops it silently.`
      );
    }
    if (entry.row.content === undefined) continue;
    assert.ok(
      names.has(CHILDREN_PROP),
      `${where(entry)}: the row supplies \`content\` and ${entry.row.path} declares no ` +
        `\`${CHILDREN_PROP}\` to render it`
    );
  }
  assert.ok(checked > 50, `only ${checked} props were checked, so this rule has almost no domain`);
});

test('every prop name every shipped component declares is a name', () => {
  // Over the whole tree, so the parser cannot regress the moment a component leaves the catalogue.
  let parsed = 0;
  for (const componentPath of SHIPPED_COMPONENTS) {
    let declared;
    try {
      declared = declaredPropNames(readFileSync(path.join(REPO_ROOT, componentPath), 'utf8'));
    } catch {
      continue; // a component with no `$props()` destructure at all
    }
    parsed += 1;
    assert.ok(
      declared.length > 0,
      `${componentPath} has a \`$props()\` destructure that yielded no names`
    );
    for (const name of declared) {
      assert.ok(
        PROP_NAME.test(name),
        `${componentPath} declares ${JSON.stringify(name)}, which is not an identifier, so the ` +
          '`$props()` reader is wrong about this file'
      );
    }
  }
  assert.ok(parsed > 100, `only ${parsed} components parsed, so this rule has almost no domain`);
});

/**
 * The library's naming entries with their enclosing section, zipped positionally.
 *
 * @returns {{heading: string, section: string|null}[]} Naming entries, in document order.
 */
function libraryEntries() {
  return LIBRARY.headings
    .map((heading, index) => ({ heading, section: LIBRARY.headingSections[index] }))
    .filter((entry) => primitiveNamesIn(entry.heading).length > 0);
}

test(
  'every shipped primitive a catalogued section names has a live specimen',
  { todo: PHASE_16 },
  () => {
    const entries = libraryEntries();
    const sectionOf = new Map(entries.map((entry) => [entry.heading, entry.section]));
    const catalogued = new Set(
      CATALOGUE.map((entry) => sectionOf.get(entry.row.spec)).filter((section) => section !== null)
    );
    const standsUp = new Map();
    for (const entry of CATALOGUE) {
      if (!standsUp.has(entry.row.spec)) standsUp.set(entry.row.spec, new Set());
      standsUp.get(entry.row.spec).add(entry.row.path);
    }
    assert.ok(catalogued.size > 0, 'no catalogue row resolves to a library section');

    let required = 0;
    for (const { heading, section } of entries) {
      if (!catalogued.has(section)) continue;
      for (const name of primitiveNamesIn(heading)) {
        const componentPath = SHIPS_AS.get(`<${name}>`);
        if (!componentPath) continue; // an unbuilt name keeps its drawing
        required += 1;
        assert.ok(
          standsUp.get(heading)?.has(componentPath),
          `the library's "${section}" section is catalogued, its entry ${heading} names ` +
            `<${name}>, and ${componentPath} ships, but no row stands it up under that entry`
        );
      }
    }
    assert.ok(required > 5, `${required} shipped primitive(s) were required to have a specimen`);
  }
);

test(
  'every library entry the manifest names sits under a library section',
  { todo: PHASE_16 },
  () => {
    const sectioned = new Set(
      LIBRARY.headings.filter((_, index) => LIBRARY.headingSections[index] !== null)
    );
    const named = MANIFEST_ROWS.filter((row) => row.library !== null);
    assert.ok(
      named.length > 20,
      `${named.length} rows name a library entry, so this has no domain`
    );
    for (const row of named) {
      const name = row.library.slice(1, -1);
      const entry = [...sectioned].find((heading) => primitiveNamesIn(heading).includes(name));
      assert.ok(
        entry,
        `${row.path} records library entry ${row.library}, which no sectioned ` +
          '`div.spec-head > h4` names, so the coverage rule would stop requiring its specimen'
      );
    }
  }
);

test('the catalogue directory holds nothing the lab cannot see', () => {
  const entries = readdirSync(path.join(REPO_ROOT, CATALOGUE_DIRECTORY), { withFileTypes: true });
  assert.ok(entries.length > 0, 'the catalogue directory is gone');
  for (const entry of entries) {
    assert.ok(
      entry.isFile(),
      `${CATALOGUE_DIRECTORY}/${entry.name} is a directory, which the non-recursive glob never reads`
    );
    assert.ok(
      entry.name.endsWith('.json') || entry.name === CATALOGUE_README,
      `${CATALOGUE_DIRECTORY}/${entry.name} is neither a catalogue file nor the README`
    );
  }
});

const SHIM_PATH = 'tests/view-lab/foundry/installFoundryShim.js';

/** A `game.i18n` pair for building the minimal world outside a browser. */
const STUB_I18N = Object.freeze({ localize: (key) => key, format: (key) => key });

test('every world field the Foundry shim reads is supplied by the world it is given', () => {
  const shimSource = readFileSync(path.join(REPO_ROOT, SHIM_PATH), 'utf8');
  const reads = [
    ...new Set([...shimSource.matchAll(/\bworld\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])),
  ];
  const keys = Object.keys(createMinimalLabWorld({ i18n: STUB_I18N }));
  assert.ok(reads.length > 3, `the shim scan found ${reads.length} \`world.\` reads`);
  assert.deepEqual(keys.toSorted(byCodePoint), [...MINIMAL_LAB_WORLD_FIELDS].sort(byCodePoint));
  for (const field of reads.sort(byCodePoint)) {
    assert.ok(
      keys.includes(field),
      `${SHIM_PATH} reads \`world.${field}\` and createMinimalLabWorld() declares no such key, ` +
        'which fails late, inside whichever closure first reads it'
    );
  }
});

test('the minimal lab world fails closed without its i18n pair or seed', () => {
  assert.throws(() => createMinimalLabWorld(), /requires a game\.i18n stub/);
  assert.throws(
    () => createMinimalLabWorld({ i18n: { localize: STUB_I18N.localize } }),
    /requires a game\.i18n stub/
  );
  assert.throws(
    () => createMinimalLabWorld({ i18n: STUB_I18N, seed: NaN }),
    /requires a numeric seed/
  );
});

/**
 * Run `body` against the shim installed over the minimal world, restoring the globals after.
 *
 * @param {() => void} body The assertions.
 */
function withLabShim(body) {
  const shim = installFoundryShim(createMinimalLabWorld({ i18n: STUB_I18N }));
  try {
    body();
  } finally {
    shim.restore();
  }
}

test('the Foundry shim declares the client release the harvested chrome is', () => {
  const [generation, build] = CHROME_PROVENANCE.foundryVersion.split('.').map(Number);
  withLabShim(() => {
    assert.deepEqual(
      { ...globalThis.game.release },
      { generation, build, version: CHROME_PROVENANCE.foundryVersion }
    );
    assert.equal(globalThis.game.version, CHROME_PROVENANCE.foundryVersion);
  });
});

test('the Foundry shim answers getDragEventData on both TextEditor faces, {} on failure', () => {
  const drag = (text) => ({ dataTransfer: { getData: () => text } });
  withLabShim(() => {
    const editor = globalThis.foundry.applications.ux.TextEditor;
    for (const face of [editor, editor.implementation]) {
      assert.deepEqual(face.getDragEventData(drag('{"uuid":"Item.a"}')), { uuid: 'Item.a' });
      assert.deepEqual(face.getDragEventData(drag('not json')), {});
    }
  });
});

/**
 * Build a throwaway repository root holding a catalogue, and run something against it.
 *
 * @param {Record<string, string>} files File name to contents, under the catalogue directory.
 * @param {(root: string) => void} run The body.
 */
function withCatalogueFixture(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-primitive-lab-'));
  try {
    const directory = path.join(root, CATALOGUE_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), contents, 'utf8');
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the catalogue reader reads every JSON file and nothing else', () => {
  withCatalogueFixture(
    {
      'controls.json': JSON.stringify([{ path: 'a.svelte' }, { path: 'b.svelte' }]),
      'marks.json': JSON.stringify([{ path: 'c.svelte' }]),
      [CATALOGUE_README]: '# not a catalogue file',
    },
    (root) => {
      assert.deepEqual(catalogueFiles(root), ['controls.json', 'marks.json']);
      assert.equal(expectedSpecimenCount(root), 3);
      assert.deepEqual(cataloguePaths(root), ['a.svelte', 'b.svelte', 'c.svelte']);
      assert.deepEqual(
        catalogueEntries(root).map((entry) => `${entry.file}[${entry.index}]`),
        ['controls.json[0]', 'controls.json[1]', 'marks.json[0]'],
        'every row must carry where it came from'
      );
    }
  );
});

test('the catalogue reader refuses a file that is not an array of rows', () => {
  withCatalogueFixture({ 'controls.json': JSON.stringify({ path: 'a.svelte' }) }, (root) => {
    assert.throws(() => catalogueEntries(root), /is not an array of catalogue rows/);
  });
});

test('an empty catalogue is refused rather than run', () => {
  withCatalogueFixture({}, (root) => {
    assert.equal(expectedSpecimenCount(root), 0);
    assert.match(
      emptyCatalogueMessage(root),
      /would make it pass over a page that mounted nothing/
    );
  });
});

test('the mounted-set comparison catches a count, an identity and a MULTIPLICITY disagreement', () => {
  const expected = ['a.svelte', 'b.svelte'];
  assert.equal(
    describeMountFailure({ expected, mounted: [...expected], reported: 2 }),
    null,
    'an agreeing page must produce no failure'
  );
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte'], reported: 1 }),
    /never mounted: b\.svelte/
  );
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte', 'z.svelte'], reported: 2 }),
    /mounted but not catalogued: z\.svelte/,
    'the count agrees and the identity does not'
  );
  assert.match(
    describeMountFailure({ expected, mounted: [...expected], reported: 0 }),
    /the page reported 0 mounted/
  );
  assert.match(
    describeMountFailure({
      expected: ['a.svelte', 'a.svelte', 'b.svelte'],
      mounted: ['a.svelte', 'b.svelte'],
      reported: 3,
    }),
    /a\.svelte: catalogued 2, mounted 1/,
    'a path catalogued twice and mounted once must be reported by name and by both counts'
  );
});

/** The smoke's half of the page contract: its attribute names decide the run. */
const SMOKE_PATH = 'scripts/lib/primitiveLabSmoke.js';

/** The page's half: the two files that write the attributes, read as text (neither loads in Node). */
const PAGE_SOURCES = new Map(
  ['tests/view-lab/primitives/mount.js', 'tests/view-lab/primitives/LiveSpecimen.svelte'].map(
    (file) => [file, readFileSync(path.join(REPO_ROOT, file), 'utf8')]
  )
);

/**
 * The page files that set an attribute — as a quoted literal or as `name={…}` — rather than only
 * mention it in prose, which a stale comment could satisfy.
 *
 * @param {string} attribute An attribute name.
 * @returns {string[]} The page files that set it.
 */
function writersOf(attribute) {
  return [...PAGE_SOURCES]
    .filter(([, source]) => source.includes(`'${attribute}'`) || source.includes(`${attribute}={`))
    .map(([file]) => file);
}

test('every attribute the smoke decides on is written by the page', () => {
  const smokeSource = readFileSync(path.join(REPO_ROOT, SMOKE_PATH), 'utf8');
  const declared = [
    ...new Set([...smokeSource.matchAll(/'(data-primitive-lab-[a-z-]+)'/g)].map((m) => m[1])),
  ].sort(byCodePoint);
  assert.deepEqual(
    missingFrom(declared, [
      ERROR_ATTRIBUTE,
      MOUNTED_ATTRIBUTE,
      READY_ATTRIBUTE,
      SPECIMEN_ATTRIBUTE,
    ]),
    [],
    `the scan over ${SMOKE_PATH} found ${declared.length} attribute literal(s) and missed one the ` +
      'module exports'
  );

  for (const attribute of declared) {
    assert.ok(
      writersOf(attribute).length > 0,
      `${SMOKE_PATH} decides the run on \`${attribute}\` and neither ` +
        `${[...PAGE_SOURCES.keys()].join(' nor ')} sets it, so the smoke would time out`
    );
  }

  // The smoke navigates with this query, and `mount.js` refuses every value it does not know.
  const [parameter, value, ...extra] = MOUNT_ALL_QUERY.split('=');
  assert.deepEqual(extra, [], `${MOUNT_ALL_QUERY} is not one \`parameter=value\` pair`);
  const mountSource = PAGE_SOURCES.get('tests/view-lab/primitives/mount.js');
  for (const half of [parameter, value]) {
    assert.ok(
      mountSource.includes(`'${half}'`),
      `the smoke navigates with \`?${MOUNT_ALL_QUERY}\` and \`mount.js\` declares no \`'${half}'\``
    );
  }
});

/**
 * The coverage gate over the Primitive Lab's catalogue (issue 1487): every row addresses a drawing
 * `library.html` has, names a shipped and recorded component, and passes only props it declares.
 * It resolves addresses through the page's own `library.js` and `inject.js`, and reads the rows
 * through `scripts/lib/primitiveLabSmoke.js`, the reader `npm run lab:check` uses.
 * Every rule is a set comparison, so each carries an anchor that fails on an empty domain.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
} from '../scripts/lib/primitiveLabSmoke.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import {
  parseDesignLibrary,
  primitiveNamesIn,
  readDesignLibrary,
} from './helpers/designLibrary.js';
import { declaredPropNames, PROP_NAME } from './helpers/sveltePropsDeclaration.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import { normalize, specBlocks, unitsOf } from './view-lab/primitives/library.js';
import { SPECIMEN_SNIPPET_NAMES } from './view-lab/primitives/specimenSnippets.js';

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

test('the corpora every rule below quantifies over are alive', () => {
  assert.ok(LIBRARY.blockCount > 0, 'the library parser found no spec-head block; the anchor died');
  assert.ok(SPEC_BLOCKS.size > 40, `the live document yielded ${SPEC_BLOCKS.size} entries`);
  assert.ok(MANIFEST_ROWS.length > 50, `the manifest holds ${MANIFEST_ROWS.length} rows`);
  assert.ok(SHIPS_AS.size > 20, `only ${SHIPS_AS.size} manifest rows name a library entry`);
  assert.ok(
    SHIPPED_COMPONENTS.length > 100,
    `the component walk found ${SHIPPED_COMPONENTS.length} files, so it is not walking`
  );
});

/**
 * Fail on an assertion rather than a TypeError while the library's sections are underived.
 *
 * @param {{headingSections?: (string|null)[]}} library Parsed library facts.
 */
function requireSections(library) {
  assert.ok(
    Array.isArray(library.headingSections),
    `parseDesignLibrary() derives no headingSections yet, which ${PHASE_16} adds`
  );
}

test('the library derives a section for every heading', { todo: PHASE_16 }, () => {
  requireSections(LIBRARY);
  assert.equal(
    LIBRARY.headingSections.length,
    LIBRARY.headings.length,
    'headingSections is positional against headings; the coverage rule below is scoped by section'
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
    const {
      spec,
      cap,
      draws,
      path: componentPath,
      props,
      content,
      snippets,
      inset,
      note,
      slot,
    } = entry.row;
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
    assert.ok(
      snippets === undefined ||
        (typeof snippets === 'object' &&
          !Array.isArray(snippets) &&
          snippets !== null &&
          Object.entries(snippets).every(
            ([name, nodes]) => SPECIMEN_SNIPPET_NAMES.includes(name) && Array.isArray(nodes)
          )),
      `${where(entry)}: \`snippets\` maps ${SPECIMEN_SNIPPET_NAMES.join(' or ')} to node arrays`
    );
    assert.ok(
      inset === undefined || (Number.isFinite(inset) && inset > 0),
      `${where(entry)}: \`inset\` is a positive number of CSS pixels`
    );
    assert.ok(
      inset === undefined || slot === undefined,
      `${where(entry)}: \`inset\` pads a default slot's wrapper and does nothing beside a boxed \`slot\``
    );
    assert.ok(
      note === undefined || (typeof note === 'string' && note.length > 0),
      `${where(entry)}: \`note\` is a non-empty string`
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
    for (const name of Object.keys(entry.row.snippets ?? {})) {
      assert.ok(
        names.has(name),
        `${where(entry)}: the row supplies the \`${name}\` snippet and ${entry.row.path} declares ` +
          'no prop of that name to render it'
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
 * A library's naming entries with their enclosing section, zipped positionally.
 *
 * @param {{headings: string[], headingSections: (string|null)[]}} library Parsed library facts.
 * @returns {{heading: string, section: string|null}[]} Naming entries, in document order.
 */
function libraryEntries(library) {
  requireSections(library);
  return library.headings
    .map((heading, index) => ({ heading, section: library.headingSections[index] }))
    .filter((entry) => primitiveNamesIn(entry.heading).length > 0);
}

/**
 * The coverage rule: a shipped primitive named by an entry in a section any row resolves to needs
 * a row standing it up under that entry. An unbuilt name keeps its drawing.
 *
 * @param {object} corpus `{library, catalogue, shipsAs}`, shaped as `LIBRARY`, `CATALOGUE`, `SHIPS_AS`.
 * @returns {{catalogued: Set<string>, required: number, problems: string[]}} What it found.
 */
function uncoveredPrimitives({ library, catalogue, shipsAs }) {
  const entries = libraryEntries(library);
  const sectionOf = new Map(entries.map((entry) => [entry.heading, entry.section]));
  const catalogued = new Set(
    catalogue
      .map((entry) => sectionOf.get(entry.row.spec))
      .filter((section) => typeof section === 'string')
  );
  const standsUp = new Map();
  for (const entry of catalogue) {
    if (!standsUp.has(entry.row.spec)) standsUp.set(entry.row.spec, new Set());
    standsUp.get(entry.row.spec).add(entry.row.path);
  }
  let required = 0;
  const problems = [];
  for (const { heading, section } of entries) {
    if (!catalogued.has(section)) continue;
    for (const name of primitiveNamesIn(heading)) {
      const componentPath = shipsAs.get(`<${name}>`);
      if (!componentPath) continue;
      required += 1;
      if (standsUp.get(heading)?.has(componentPath)) continue;
      problems.push(
        `the library's "${section}" section is catalogued, its entry ${heading} names ` +
          `<${name}>, and ${componentPath} ships, but no row stands it up under that entry`
      );
    }
  }
  return { catalogued, required, problems };
}

/**
 * The manifest rows whose library name no sectioned heading carries, which the coverage rule
 * would stop requiring a specimen for.
 *
 * @param {object} corpus `{library, manifestRows}`, shaped as `LIBRARY` and `MANIFEST_ROWS`.
 * @returns {string[]} One problem per such row.
 */
function unsectionedManifestRows({ library, manifestRows }) {
  requireSections(library);
  const sectioned = library.headings.filter((_, index) => library.headingSections[index] !== null);
  return manifestRows
    .filter((row) => row.library !== null)
    .filter((row) => {
      const name = row.library.slice(1, -1);
      return sectioned.every((heading) => !primitiveNamesIn(heading).includes(name));
    })
    .map(
      (row) =>
        `${row.path} records library entry ${row.library}, which no sectioned ` +
        '`div.spec-head > h4` names, so the coverage rule would stop requiring its specimen'
    );
}

test(
  'every shipped primitive a catalogued section names has a live specimen',
  { todo: PHASE_16 },
  () => {
    const { catalogued, required, problems } = uncoveredPrimitives({
      library: LIBRARY,
      catalogue: CATALOGUE,
      shipsAs: SHIPS_AS,
    });
    assert.ok(catalogued.size > 0, 'no catalogue row resolves to a library section');
    assert.deepEqual(problems, []);
    assert.ok(required > 5, `${required} shipped primitive(s) were required to have a specimen`);
  }
);

test(
  'every library entry the manifest names sits under a library section',
  { todo: PHASE_16 },
  () => {
    const named = MANIFEST_ROWS.filter((row) => row.library !== null);
    assert.ok(
      named.length > 20,
      `${named.length} rows name a library entry, so this has no domain`
    );
    assert.deepEqual(
      unsectionedManifestRows({ library: LIBRARY, manifestRows: MANIFEST_ROWS }),
      []
    );
  }
);

/** Two catalogued sections and one with no row, so the rules run live before Phase 16. */
const SYNTHETIC_LIBRARY = Object.freeze({
  headings: ['Controls', '<Button>', '<Chip> <Kicker>', '<Ghost>', '<Meter>'],
  headingSections: ['controls', 'controls', 'marks', 'marks', 'structures'],
});

/** `<Ghost>` is unbuilt, so it ships as nothing. */
const SYNTHETIC_SHIPS_AS = new Map(
  ['Button', 'Chip', 'Kicker', 'Meter'].map((name) => [`<${name}>`, `src/${name}.svelte`])
);

/** A catalogue entry as `catalogueEntries()` shapes one. */
function syntheticEntry(spec, name) {
  return { row: { spec, path: `src/${name}.svelte` } };
}

const SYNTHETIC_CATALOGUE = Object.freeze([
  syntheticEntry('<Button>', 'Button'),
  syntheticEntry('<Chip> <Kicker>', 'Chip'),
  syntheticEntry('<Chip> <Kicker>', 'Kicker'),
]);

test('the coverage rule requires every shipped name in a catalogued section, and only those', () => {
  const corpus = { library: SYNTHETIC_LIBRARY, shipsAs: SYNTHETIC_SHIPS_AS };
  assert.deepEqual(uncoveredPrimitives({ ...corpus, catalogue: SYNTHETIC_CATALOGUE }), {
    catalogued: new Set(['controls', 'marks']),
    required: 3,
    problems: [],
  });

  // Mode 3, a removed row, reds as mode 4: a shipped name left with no specimen.
  const removed = uncoveredPrimitives({
    ...corpus,
    catalogue: SYNTHETIC_CATALOGUE.filter((entry) => entry.row.path !== 'src/Kicker.svelte'),
  });
  assert.equal(removed.required, 3);
  assert.equal(removed.problems.length, 1, removed.problems.join('\n'));
  assert.match(
    removed.problems[0],
    /entry <Chip> <Kicker> names <Kicker>, and src\/Kicker\.svelte/
  );

  const misfiled = uncoveredPrimitives({
    ...corpus,
    catalogue: [...SYNTHETIC_CATALOGUE.slice(0, 2), syntheticEntry('<Button>', 'Kicker')],
  });
  assert.equal(misfiled.problems.length, 1, 'a row under another entry stands nothing up here');
});

test('the section rule refuses a manifest name no sectioned heading carries', () => {
  const rows = [
    { path: 'src/Button.svelte', library: '<Button>' },
    { path: 'src/Plain.svelte', library: null },
  ];
  assert.deepEqual(unsectionedManifestRows({ library: SYNTHETIC_LIBRARY, manifestRows: rows }), []);
  const library = {
    headings: [...SYNTHETIC_LIBRARY.headings, '<Orphan>'],
    headingSections: [...SYNTHETIC_LIBRARY.headingSections, null],
  };
  const problems = unsectionedManifestRows({
    library,
    manifestRows: [
      ...rows,
      { path: 'src/Orphan.svelte', library: '<Orphan>' },
      { path: 'src/Gone.svelte', library: '<Gone>' },
    ],
  });
  assert.deepEqual(
    problems.map((problem) => problem.split(' ', 1)[0]),
    ['src/Orphan.svelte', 'src/Gone.svelte']
  );
});

test('the section rules fail on an assertion, not a TypeError, while sections are underived', () => {
  assert.throws(() => libraryEntries({ headings: ['<Button>'] }), {
    name: 'AssertionError',
    message: new RegExp(PHASE_16),
  });
});

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

/** The smoke's half of the page contract: its attribute names decide the run. */
const SMOKE_PATH = 'scripts/lib/primitiveLabSmoke.js';

const MOUNT_PATH = 'tests/view-lab/primitives/mount.js';

/** The page's half: the two files that write the attributes, read as text (neither loads in Node). */
const PAGE_SOURCES = new Map(
  [MOUNT_PATH, 'tests/view-lab/primitives/LiveSpecimen.svelte'].map((file) => [
    file,
    readFileSync(path.join(REPO_ROOT, file), 'utf8'),
  ])
);

/** Drop comments, so prose naming an attribute cannot stand in for code that writes it. */
function withoutComments(source) {
  return source.replaceAll(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|^\s*\/\/.*$/gm, '');
}

/**
 * The page files that set an attribute: `setAttribute` given the literal or a constant bound to it,
 * or a Svelte `name={…}`. A read, a declaration alone or a comment does not count.
 *
 * @param {string} attribute An attribute name.
 * @returns {string[]} The page files that set it.
 */
function writersOf(attribute) {
  return [...PAGE_SOURCES]
    .filter(([, source]) => {
      const code = withoutComments(source);
      const bound = [...code.matchAll(new RegExp(String.raw`const (\w+) = '${attribute}';`, 'g'))];
      const targets = [`'${attribute}'`, ...bound.map((match) => match[1])];
      return (
        code.includes(`${attribute}={`) ||
        targets.some((target) => code.includes(`setAttribute(${target},`))
      );
    })
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
  assert.ok(
    writersOf(SPECIMEN_ATTRIBUTE).includes(MOUNT_PATH),
    `the smoke reads \`${SPECIMEN_ATTRIBUTE}\` off the top document, so ${MOUNT_PATH} must set ` +
      "it on each `<iframe>`; LiveSpecimen.svelte's copy sits in a realm the smoke never reads"
  );

  // The smoke navigates with this query, and `mount.js` refuses every value it does not know.
  const [parameter, value, ...extra] = MOUNT_ALL_QUERY.split('=');
  assert.deepEqual(extra, [], `${MOUNT_ALL_QUERY} is not one \`parameter=value\` pair`);
  const mountSource = PAGE_SOURCES.get(MOUNT_PATH);
  for (const half of [parameter, value]) {
    assert.ok(
      mountSource.includes(`'${half}'`),
      `the smoke navigates with \`?${MOUNT_ALL_QUERY}\` and \`mount.js\` declares no \`'${half}'\``
    );
  }
});

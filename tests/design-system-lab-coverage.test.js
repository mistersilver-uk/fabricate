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
import { readLibrarySections } from './helpers/designLibrarySections.js';
import { declaredPropNames, PROP_NAME } from './helpers/sveltePropsDeclaration.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import { normalize, specBlocks, unitsOf } from './view-lab/primitives/library.js';
import { BESIDE, REPLACE, libraryNamesByPath } from './view-lab/primitives/liveness.js';
import { SPECIMEN_SNIPPET_NAMES } from './view-lab/primitives/specimenSnippets.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The library's derived facts, parsed once: a `Window` per test runs `npm test` out of heap. */
const LIBRARY = parseDesignLibrary(readDesignLibrary());

/** The library's sections, and the one each heading sits in, positional against its headings. */
const SECTIONS = readLibrarySections(readDesignLibrary());

/** The headings with their sections, the shape the coverage rules below read. */
const SECTIONED_LIBRARY = { headings: LIBRARY.headings, headingSections: SECTIONS.headingSections };

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

/** The manifest rows that name a library entry. */
const NAMED_ROWS = MANIFEST_ROWS.filter((row) => row.library !== null);

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
  assert.ok(NAMED_ROWS.length > 20, `only ${NAMED_ROWS.length} manifest rows name a library entry`);
  assert.ok(
    SHIPPED_COMPONENTS.length > 100,
    `the component walk found ${SHIPPED_COMPONENTS.length} files, so it is not walking`
  );
});

test('the library derives a section for every heading', () => {
  const ids = SECTIONS.sections.map((section) => section.id);
  assert.ok(ids.length > 0, 'the library yielded no `section[id]`, so no heading has a section');
  assert.equal(
    SECTIONS.headingSections.length,
    LIBRARY.headings.length,
    'headingSections is positional against headings; the coverage rule below reports by section'
  );
  for (const [index, section] of SECTIONS.headingSections.entries()) {
    assert.ok(
      ids.includes(section),
      `${LIBRARY.headings[index]} sits under no library section (${section})`
    );
  }
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

/**
 * The rows whose component is not named by the entry that owns their drawing: a row repathed to
 * another component still resolves, mounts and passes every other rule, and draws the wrong thing.
 *
 * @param {{host: Element, entry: object}[]} hosts Each claimed drawing with its row.
 * @param {Map<string, string[]>} namesByPath `libraryNamesByPath` of the manifest.
 * @returns {string[]} One problem per row outside its entry.
 */
function rowsOutsideTheirEntry(hosts, namesByPath) {
  return hosts.flatMap(({ host, entry }) => {
    const names = namesByPath.get(entry.row.path) ?? [];
    const heading =
      host.closest('.spec')?.querySelector(':scope > .spec-head > h4')?.textContent ?? '';
    const owned = primitiveNamesIn(heading);
    // A prose entry's heading names no primitive; its unit's caption does, as a word.
    const caption = (entry.row.cap ?? '').toLowerCase();
    const named = (name) =>
      owned.length > 0
        ? owned.includes(name)
        : new RegExp(String.raw`\b${name.toLowerCase()}\b`).test(caption);
    return names.some(named)
      ? []
      : [
          `${where(entry)}: ${entry.row.path} ships ` +
            `${names.map((name) => `<${name}>`).join(', ') || 'no library name'}, which the ` +
            `entry drawing it (${JSON.stringify(heading)}) does not name`,
        ];
  });
}

test('every catalogue row stands up a component its drawing’s own entry names', () => {
  const namesByPath = libraryNamesByPath(MANIFEST_ROWS);
  const hosts = RESOLVED.flatMap((resolved) =>
    resolved.targets.map((host, index) => ({ host, entry: resolved.address.entries[index] }))
  );
  assert.ok(hosts.length > 50, `${hosts.length} drawings claimed, so this rule has no domain`);
  assert.deepEqual(rowsOutsideTheirEntry(hosts, namesByPath), []);

  const [{ host, entry }] = hosts;
  const own = namesByPath.get(entry.row.path);
  const stranger = [...namesByPath].find(([, names]) => names.every((n) => !own.includes(n)))[0];
  const repathed = [{ host, entry: { ...entry, row: { ...entry.row, path: stranger } } }];
  assert.equal(rowsOutsideTheirEntry(repathed, namesByPath).length, 1);
});

/**
 * The inline `repeat(auto-fit` grids directly inside a column stage that do not size themselves at the
 * stage's width: a column stage is a shrink-to-fit flex column, so such a grid is as wide as its
 * widest track needs and the rows stretch to fill the height it leaves.
 *
 * @param {Element} root The library body.
 * @returns {{checked: number, unsized: string[]}} How many grids, and the entry of each unsized one.
 */
function unsizedStageGrids(root) {
  const grids = [...root.querySelectorAll(':scope .stage.col > [style*="repeat(auto-fit"]')];
  const unsized = grids
    .filter((grid) => !/(^|;)\s*width:\s*100%\s*(;|$)/.test(grid.getAttribute('style')))
    .map(
      (grid) => grid.closest('.spec')?.querySelector(':scope > .spec-head > h4')?.textContent ?? '?'
    );
  return { checked: grids.length, unsized };
}

test('every auto-fit grid in a column stage is sized at the stage width', () => {
  const { checked, unsized } = unsizedStageGrids(LIBRARY_BODY);
  assert.ok(checked >= 2, `${checked} grid(s) found, so this rule has no domain`);
  assert.deepEqual(unsized, [], 'add `;width:100%` to the inline style of each');

  const probe = new Window().document;
  probe.write(
    '<body><div class="stage col"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9px,1fr))"></div></div></body>'
  );
  assert.equal(unsizedStageGrids(probe.body).unsized.length, 1);
});

/**
 * The claimed drawings one claimed drawing contains, unless its specimen stands beside it.
 *
 * @param {{host: Element, entry: object, mode: string}[]} hosts Each claimed drawing.
 * @returns {string[]} One problem per drawing a replacement would detach.
 */
function detachedClaims(hosts) {
  // `inject.js` resolves every address before placing, so a replaced outer drawing detaches an
  // inner host; one its specimen stands beside stays in the document, and so does the inner one.
  return hosts.flatMap((outer) =>
    outer.mode === BESIDE
      ? []
      : hosts
          .filter((inner) => inner !== outer && outer.host.contains(inner.host))
          .map(
            (inner) =>
              `${where(outer.entry)} replaces a drawing that contains the one ` +
              `${where(inner.entry)} claims, so the inner specimen would mount into a detached subtree`
          )
  );
}

test('no drawing a row replaces contains a drawing another row claims', () => {
  const modes = new Map(
    resolveSlots(
      LIBRARY_BODY,
      CATALOGUE.map((entry) => entry.row),
      MANIFEST_ROWS
    ).slots.map((slot) => [slot.host, slot.mode])
  );
  const hosts = RESOLVED.flatMap((resolved) =>
    resolved.targets.map((host, index) => ({
      host,
      entry: resolved.address.entries[index],
      mode: modes.get(host),
    }))
  );
  assert.ok(hosts.length > 50, `${hosts.length} drawings claimed, so this rule has no domain`);
  assert.ok(
    hosts.some((outer) =>
      hosts.some((inner) => inner !== outer && outer.host.contains(inner.host))
    ),
    'no claimed drawing nests inside another, so the beside exemption below is untested here'
  );
  assert.deepEqual(detachedClaims(hosts), []);

  const [outer, inner] = [LIBRARY_BODY, LIBRARY_BODY.firstElementChild];
  const nested = [
    { host: outer, entry: { file: 'a.json', index: 0 } },
    { host: inner, entry: { file: 'b.json', index: 0 } },
  ];
  assert.equal(detachedClaims(nested.map((h) => ({ ...h, mode: REPLACE }))).length, 1);
  assert.deepEqual(detachedClaims([{ ...nested[0], mode: BESIDE }, nested[1]]), []);
});

test('the page resolver reads the catalogue exactly as this gate does', () => {
  const { slots, problems } = resolveSlots(
    LIBRARY_BODY,
    CATALOGUE.map((entry) => entry.row),
    MANIFEST_ROWS
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
 * The coverage rule: every manifest row naming a library entry needs a catalogue row standing its
 * component up under each heading that names it, in every section. Two rows naming one entry both
 * need one, and a removed catalogue row leaves its manifest row uncovered.
 *
 * @param {object} corpus `{library, catalogue, manifestRows}`, shaped as `SECTIONED_LIBRARY`,
 *   `CATALOGUE` and `MANIFEST_ROWS`.
 * @returns {{required: number, missing: string[]}} `missing` holds `<section> <Name> <path>`.
 */
function uncoveredManifestRows({ library, catalogue, manifestRows }) {
  const standsUp = new Set(catalogue.map((entry) => `${entry.row.spec}\n${entry.row.path}`));
  let required = 0;
  const missing = [];
  for (const row of manifestRows) {
    if (row.library === null) continue;
    const name = row.library.slice(1, -1);
    for (const [index, heading] of library.headings.entries()) {
      if (!primitiveNamesIn(heading).includes(name)) continue;
      required += 1;
      if (standsUp.has(`${heading}\n${row.path}`)) continue;
      missing.push(`${library.headingSections[index]} ${row.library} ${row.path}`);
    }
  }
  return { required, missing };
}

/**
 * The manifest rows whose library name no sectioned heading carries, which the coverage rule
 * could not report under a section.
 *
 * @param {object} corpus `{library, manifestRows}`, shaped as `SECTIONED_LIBRARY` and `MANIFEST_ROWS`.
 * @returns {string[]} One problem per such row.
 */
function unsectionedManifestRows({ library, manifestRows }) {
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
        '`div.spec-head > h4` names, so the coverage rule cannot place its specimen'
    );
}

/**
 * The manifest rows with no specimen yet, by section. Phase 18 catalogues sections 10–11, deleting
 * a line as it lands; the rule below is exact both ways. A row that stays carries its reason.
 */
const AWAITING_SPECIMEN = Object.freeze({
  pickers: [
    // The parent's portaled panel: it needs `optionIsSelected`, `chooseOption`, `close`,
    // `popoverLayout` and an anchor element, and a row passes plain JSON. The list-form
    // `SearchablePopover` specimen mounts it through its one real caller.
    '<SearchPopover> src/ui/svelte/components/SearchablePopoverPanel.svelte',
  ],
  structures: [
    '<Avatar> src/ui/svelte/components/Avatar.svelte',
    '<BulkStagingInset> src/ui/svelte/apps/manager/BulkStagingInset.svelte',
    '<DataTable> src/ui/svelte/components/DataTable.svelte',
    '<ListRow> src/ui/svelte/components/ListRow.svelte',
    '<LogList> src/ui/svelte/components/LogList.svelte',
    '<NavSidebar> src/ui/svelte/components/NavSidebar.svelte',
    '<NavSidebar> src/ui/svelte/components/NavSidebarRows.svelte',
    '<PageHeader> src/ui/svelte/components/PageHeader.svelte',
    '<Rail> src/ui/svelte/components/Rail.svelte',
    '<ValidationSummary> src/ui/svelte/components/EditorValidationSurface.svelte',
  ],
  composites: [
    '<ChoiceGroup> src/ui/svelte/apps/manager/recipe/ChoiceGroup.svelte',
    '<ChoiceOptionList> src/ui/svelte/components/ChoiceOptionList.svelte',
    '<EssencePool> src/ui/svelte/components/EssencePool.svelte',
    '<OutcomeLadder> src/ui/svelte/components/OutcomeLadder.svelte',
    '<PickerRow> src/ui/svelte/apps/manager/recipe/PickerRow.svelte',
    '<RequirementChooser> src/ui/svelte/components/RequirementChooser.svelte',
    '<RuleRow> src/ui/svelte/components/RuleRow.svelte',
    '<RuleSentence> src/ui/svelte/components/RuleSentence.svelte',
    '<RunProgress> src/ui/svelte/components/RunProgress.svelte',
    '<SetPicker> src/ui/svelte/components/SetPicker.svelte',
    '<SlotRow> src/ui/svelte/components/SlotRow.svelte',
    '<SlotTile> src/ui/svelte/components/SlotTile.svelte',
    '<SortableList> src/ui/svelte/components/SortableList.svelte',
    '<StageCard> src/ui/svelte/components/StageCard.svelte',
    '<StageNav> src/ui/svelte/components/StageNav.svelte',
    '<YieldScale> src/ui/svelte/components/YieldScale.svelte',
  ],
});

/** The baseline as the rule reports it. */
function awaitingSpecimen(baseline) {
  return Object.entries(baseline).flatMap(([section, rows]) =>
    rows.map((row) => `${section} ${row}`)
  );
}

test('every manifest row naming a library entry has a live specimen, bar the named baseline', () => {
  const { required, missing } = uncoveredManifestRows({
    library: SECTIONED_LIBRARY,
    catalogue: CATALOGUE,
    manifestRows: MANIFEST_ROWS,
  });
  assert.ok(required >= NAMED_ROWS.length, `${required} specimen(s) required, fewer than the rows`);
  const baseline = awaitingSpecimen(AWAITING_SPECIMEN);
  assert.deepEqual(
    missingFrom(baseline, missing),
    [],
    'these manifest rows have no catalogue row under the library entry naming them: add one, ' +
      'which is what a new named member owes the lab'
  );
  assert.deepEqual(
    missingFrom(missing, baseline),
    [],
    'these now have a specimen: delete them from AWAITING_SPECIMEN, which only shrinks'
  );
});

test('every library entry the manifest names sits under a library section', () => {
  assert.ok(NAMED_ROWS.length > 20, `${NAMED_ROWS.length} rows name a library entry`);
  assert.deepEqual(
    unsectionedManifestRows({ library: SECTIONED_LIBRARY, manifestRows: MANIFEST_ROWS }),
    []
  );
});

/** Two sections with a catalogue row and one without, and one name shipped by two rows. */
const SYNTHETIC_LIBRARY = Object.freeze({
  headings: ['Controls', '<Button>', '<Chip> <Kicker>', '<Ghost>', '<Meter>'],
  headingSections: ['controls', 'controls', 'marks', 'marks', 'structures'],
});

/** `<Ghost>` is unbuilt, so no row names it; `<Meter>` ships as a member and a near-member. */
const SYNTHETIC_ROWS = Object.freeze([
  ...['Button', 'Chip', 'Kicker', 'Meter'].map((name) => ({
    path: `src/${name}.svelte`,
    library: `<${name}>`,
  })),
  { path: 'src/MeterPanel.svelte', library: '<Meter>' },
  { path: 'src/Plain.svelte', library: null },
]);

/** A catalogue entry as `catalogueEntries()` shapes one. */
function syntheticEntry(spec, name) {
  return { row: { spec, path: `src/${name}.svelte` } };
}

const SYNTHETIC_CATALOGUE = Object.freeze([
  syntheticEntry('<Button>', 'Button'),
  syntheticEntry('<Chip> <Kicker>', 'Chip'),
  syntheticEntry('<Chip> <Kicker>', 'Kicker'),
  syntheticEntry('<Meter>', 'Meter'),
  syntheticEntry('<Meter>', 'MeterPanel'),
]);

test('the coverage rule requires every named row in every section, and only those', () => {
  const corpus = { library: SYNTHETIC_LIBRARY, manifestRows: SYNTHETIC_ROWS };
  assert.deepEqual(uncoveredManifestRows({ ...corpus, catalogue: SYNTHETIC_CATALOGUE }), {
    required: 5,
    missing: [],
  });

  // Mode 3, a removed row, reds as mode 4: a named manifest row left with no specimen.
  const removed = uncoveredManifestRows({
    ...corpus,
    catalogue: SYNTHETIC_CATALOGUE.filter((entry) => entry.row.path !== 'src/Kicker.svelte'),
  });
  assert.deepEqual(removed.missing, ['marks <Kicker> src/Kicker.svelte']);

  // Every section, not only one some row already resolves to.
  const uncatalogued = uncoveredManifestRows({
    ...corpus,
    catalogue: SYNTHETIC_CATALOGUE.filter((entry) => entry.row.spec !== '<Meter>'),
  });
  assert.deepEqual(uncatalogued.missing, [
    'structures <Meter> src/Meter.svelte',
    'structures <Meter> src/MeterPanel.svelte',
  ]);

  const misfiled = uncoveredManifestRows({
    ...corpus,
    catalogue: [...SYNTHETIC_CATALOGUE.slice(0, 2), syntheticEntry('<Button>', 'Kicker')],
  });
  assert.ok(
    misfiled.missing.includes('marks <Kicker> src/Kicker.svelte'),
    'a row under another entry stands nothing up here'
  );
});

test('a name under two headings in different sections is reported under both', () => {
  const library = {
    headings: [...SYNTHETIC_LIBRARY.headings, '<Meter> <Chip>'],
    headingSections: [...SYNTHETIC_LIBRARY.headingSections, 'surfaces'],
  };
  const { missing } = uncoveredManifestRows({
    library,
    catalogue: SYNTHETIC_CATALOGUE.filter((entry) => !entry.row.path.includes('Meter')),
    manifestRows: SYNTHETIC_ROWS.filter((row) => !row.path.includes('MeterPanel')),
  });
  assert.deepEqual(missing, [
    'surfaces <Chip> src/Chip.svelte',
    'structures <Meter> src/Meter.svelte',
    'surfaces <Meter> src/Meter.svelte',
  ]);
});

test('the section rule refuses a manifest name no sectioned heading carries', () => {
  const rows = SYNTHETIC_ROWS.slice(0, 2);
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

test('the baseline reads as the rule reports, section first', () => {
  assert.deepEqual(awaitingSpecimen({ marks: ['<Chip> src/Chip.svelte'], controls: [] }), [
    'marks <Chip> src/Chip.svelte',
  ]);
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

/**
 * The catalogue snippet nodes that are a native `select`, which draws unstyled here: the manager's
 * native-select theme is gone, and a specimen entry specifies chrome, not the control.
 *
 * @param {object[]|undefined} nodes Snippet nodes, each `{tag, children?}`.
 * @returns {string[]} One `<tag>` path per `select` found.
 */
function nativeSelectsIn(nodes = []) {
  return nodes.flatMap((node) => [
    ...(node.tag === 'select' ? [node.tag] : []),
    ...nativeSelectsIn(node.children),
  ]);
}

test('no catalogue snippet draws a native select', () => {
  const snippetRows = CATALOGUE.filter((entry) => entry.row.snippets);
  assert.ok(snippetRows.length > 0, 'no row carries snippets, so this rule has no domain');
  for (const entry of snippetRows) {
    for (const [name, nodes] of Object.entries(entry.row.snippets)) {
      assert.deepEqual(
        nativeSelectsIn(nodes),
        [],
        `${where(entry)} snippet "${name}" draws a native select, which renders unstyled`
      );
    }
  }
  const nested = [{ tag: 'div', children: [{ tag: 'span' }, { tag: 'select' }] }];
  assert.deepEqual(nativeSelectsIn(nested), ['select'], 'the rule must find a nested select');
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

test('the page hands the manifest to the liveness decision, both tables', () => {
  const source = withoutComments(PAGE_SOURCES.get(MOUNT_PATH));
  assert.match(source, /import MANIFEST from '[^']*designSystemPrimitives\.json'/);
  assert.match(
    source,
    /resolveSlots\(document\.body, CATALOGUE, \[\s*\.\.\.MANIFEST\.designSystemPrimitives,\s*\.\.\.MANIFEST\.notAPrimitive,?\s*\]\)/,
    'the page must pass both manifest tables, or a row in one has no liveness'
  );
});

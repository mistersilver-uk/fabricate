/**
 * The coverage gate over the Primitive Lab's catalogue.
 *
 * `tests/design-system-coverage.test.js` answers "do the library and the manifest describe the same
 * vocabulary". This file answers the next question down: does the LAB replace the library's hand
 * drawings with the real components, in the right places, driven through props those components
 * actually declare.
 *
 * WHAT THE CATALOGUE IS NOW, AND WHY IT STILL NEEDS A GATE
 * --------------------------------------------------------
 * The page IS `openspec/specs/design-system/library.html`, re-rendered, with individual hand-drawn
 * specimens swapped for mounted components. Everything a reader reads — the entry headings, the
 * captions, the notes, the deltas — is the library's own content, rendered from that file at load
 * time and never copied here. The one written artifact left is the catalogue, and a row says
 * exactly one thing: WHICH real component stands where the library drew a specimen, and with what
 * props.
 *
 * That claim is a hand-written mirror of markup in a file this page may not edit, which is the
 * shape this repository requires a guard for. It rots silently in both directions. A `draws`
 * selector that stopped matching leaves a drawing in place, and a drawing is what the page looks
 * like when it is working. A `props` key the component does not declare is dropped by Svelte
 * without a word, so the specimen renders — wrongly, and authoritatively, on the one page whose
 * subject is how these components are painted.
 *
 * THE COVERAGE CLAIM THIS FILE MAKES, AND THE TWO IT REFUSES TO MAKE
 * ------------------------------------------------------------------
 * The gate this replaces demanded a catalogue row for every row in the manifest. That was the right
 * claim for a workbench with a rail — the rail enumerated the manifest, so an uncatalogued
 * primitive was a rail entry with nothing behind it. It is the WRONG claim for this page: the page
 * is the library, so a primitive can only be catalogued where the library DRAWS it, and 32 of the
 * 57 manifest rows are named by no library entry at all. Demanding a row for those would be
 * demanding a specimen with nowhere to stand.
 *
 * The claim made instead is scoped by the library's own information architecture:
 *
 *   A library SECTION is catalogued once any row addresses an entry inside it. Within a catalogued
 *   section, every primitive an entry names that SHIPS — one the manifest gives a path — must have
 *   at least one row standing it up under that entry.
 *
 * Both halves are load-bearing. Section scope is what makes an entry that has no rows AT ALL fail:
 * a per-entry rule would exempt exactly the entry that was forgotten, which is the one failure mode
 * worth catching. And "that ships" is what keeps the rule honest in the other direction — the
 * library names `<Select>` and `<Search>`, the manifest gives neither a path, and an unbuilt
 * primitive's drawing is supposed to stay a drawing.
 *
 * Two nearby rules are deliberately NOT asserted, because each would red on something legitimate:
 *
 *   - "every drawing in a catalogued entry is replaced". `<Button>`'s specimen ladder draws a
 *     `page 38` and a `row 30` size and the shipped control has no `size` prop, so those drawings
 *     have no live equivalent and the library's own delta block says so. The unit of coverage is
 *     the PRIMITIVE, not the drawing.
 *   - "a row's `path` is the manifest path of a name in its own `spec`". The library composes: a
 *     `<Toggle>` unit draws a Well, a title, a hint and a switch, and a row standing up the Well
 *     inside that entry would be correct and would fail such a rule.
 *
 * WHAT IT IMPORTS FROM THE PAGE, AND WHY THAT IS THE POINT
 * --------------------------------------------------------
 * `tests/view-lab/primitives/library.js` and `inject.js`. Neither touches a DOM at module scope and
 * neither uses `import.meta.glob`, so both load under `node --test` — which means this gate resolves
 * addresses through the SAME `specBlocks`/`unitsOf`/`normalize` the browser resolves them through,
 * rather than through a second reading of the same rules. `catalogue.js` is Vite-only (it globs), so
 * the rows are read off disk by `scripts/lib/primitiveLabSmoke.js` — the same bytes Vite serves, and
 * the same reader `npm run lab:check` derives its expected set from, so it is not a second record.
 *
 * The library is parsed TWICE, deliberately and once each. `parseDesignLibrary` yields the derived
 * facts (headings, their sections, the name census) and closes its window; the local `Window` below
 * keeps a live document, because a `draws` selector has to be EVALUATED and no derived summary can
 * stand in for that. Both are built once at module scope: a `Window` per test is the shape `npm
 * test` runs out of heap on.
 *
 * WHY EVERY RULE CARRIES ITS OWN ANTI-VACUITY ANCHOR
 * --------------------------------------------------
 * Every correspondence here is a set comparison, and every set comparison passes over two empty
 * sets. An empty catalogue satisfies "every row addresses a real drawing", "no prop is undeclared"
 * and "every catalogued section is fully covered" simultaneously and perfectly, over a page showing
 * nothing but drawings. So the catalogue's size is pinned, the library corpus is checked for a
 * pulse, the number of ADDRESSES resolved and DRAWINGS matched is pinned, and the prop-name shape
 * rule quantifies over the whole component tree rather than the catalogued subset.
 *
 * The `data-primitive-lab-*` rule at the bottom of this file is why that paragraph is written in
 * this tone. Its first draft asked whether a page file `includes` the attribute name, and it passed
 * its own rename mutation — because both page files also DOCUMENT these attributes in prose, and the
 * docblock still spelled the old name.
 *
 * WHY THE `$props()` PARSER'S OWN FIXTURE PROOF LIVES IN THIS FILE
 * ----------------------------------------------------------------
 * `tests/helpers/` is outside the `npm test` glob, so a proof written beside the helper would never
 * run. This gate is the parser's newest consumer and the first one the defect could reach — the two
 * older consumers pin eight essence and scoped screens and none of the five components that
 * mis-parsed — so the proof lives with the consumer that needs it.
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

import {
  parseDesignLibrary,
  primitiveNamesIn,
  readDesignLibrary,
} from './helpers/designLibrary.js';
import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import { normalize, specBlocks, unitsOf } from './view-lab/primitives/library.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The library's derived facts. See the docblock: a `Window` per call is what OOMs `npm test`. */
const LIBRARY = parseDesignLibrary(readDesignLibrary());

/**
 * The library as a live document, because a `draws` selector has to be evaluated rather than
 * summarised.
 *
 * Never mutated. `resolveSlots` only reads, and the injector's replacement step is the page's, not
 * this file's — a gate that mounted into the document it is checking would be checking the second
 * half of its own run.
 */
const LIBRARY_WINDOW = new Window();
LIBRARY_WINDOW.document.write(readDesignLibrary());
const LIBRARY_BODY = LIBRARY_WINDOW.document.body;

/** The manifest, read as bytes rather than through its `.js` wrapper — the lab reads the JSON. */
const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);

/** Both manifest tables. A near-member ships and is drawable; the register is why, not whether. */
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

/**
 * A prop name as JavaScript spells one, plus the `...rest` form the parser reports verbatim.
 *
 * THIS IS THE RULE THAT WOULD HAVE CAUGHT THE PARSER DEFECT. Against `ThresholdBandStrip.svelte`
 * the old reader returned three names for fifteen props, and one of the three was a JSDoc comment
 * glued to `previewDc`. Nothing rejected it, so the only visible symptom was a coverage rule
 * reporting real props as props that "do not exist" — which makes deleting the coverage the
 * cheapest repair, and a gate whose cheapest repair REMOVES coverage is worse than no gate.
 */
const PROP_NAME = /^(\.\.\.)?[A-Za-z_$][\w$]*$/;

/**
 * The literal `declaredPropNames` reports for a `...rest` collector.
 *
 * A component that destructures one has opened itself to arbitrary keys, so a `props` key it does
 * not declare still reaches the element — through the spread, exactly as a real call site's would.
 * Reported as a name rather than swallowed, so this file can tell the two cases apart instead of
 * granting every row a blanket exemption.
 */
const REST_PROP = '...rest';

/** The prop `LiveSpecimen.svelte` passes a row's `content` as. Nothing else renders it. */
const CHILDREN_PROP = 'children';

/**
 * Where a row was written, for a message that names a position rather than a component.
 *
 * `catalogue/controls.json[3]` is a place someone can open. "the row for ManagerButton" is a search
 * across the catalogue, and the search is ambiguous exactly when the fault is one of eleven rows
 * that all name the same component.
 *
 * @param {{file: string, index: number}} entry A catalogue entry.
 * @returns {string} A citation.
 */
function where(entry) {
  return `catalogue/${entry.file}[${entry.index}]`;
}

/**
 * Order two strings by code point, ascending.
 *
 * Explicit rather than a bare `sort()`, for the reason `scripts/lib/svelteComponentFiles.js` and
 * `tests/design-system-coverage.test.js` both record beside their own copies: `localeCompare` is
 * locale-dependent, so two machines could order a reported set differently and disagree about a
 * difference they both measured correctly.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));

/**
 * One side of a set equality: what `expected` holds that `present` does not.
 *
 * Returned as an array rather than asserted on, so the failure names the ids that DIVERGE instead
 * of printing two whole sets and leaving the reader to diff them.
 *
 * @param {Iterable<string>} present The side being checked.
 * @param {Iterable<string>} expected The side it is checked against.
 * @returns {string[]} The difference, deduplicated, in code-point order.
 */
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
 * @returns {string[]|null} Declared names, or null when the file does not exist or declares none.
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

/**
 * The keys of an object literal, at its own outermost indentation only.
 *
 * A brace-balancing parser would be more precise and is not worth it: every literal read this way
 * is Prettier-formatted, so its top-level keys are exactly the key-shaped lines at the SMALLEST
 * indentation in the slice.
 *
 * @param {string} slice Source text containing one object literal and nothing above it.
 * @returns {string[]} Key names, in source order.
 */
function objectLiteralKeys(slice) {
  const found = [
    ...slice.matchAll(/^([\t ]+)(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*[:,]/gm),
  ].map((match) => ({
    indent: match[1].length,
    key: match[2] ?? match[3] ?? match[4],
  }));
  if (found.length === 0) return [];
  const outermost = Math.min(...found.map((entry) => entry.indent));
  return found.filter((entry) => entry.indent === outermost).map((entry) => entry.key);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The addresses, resolved once against the library document
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every `.spec` entry, keyed by its heading exactly as `inject.js` keys them. */
const SPEC_BLOCKS = specBlocks(LIBRARY_BODY);

/** Per-entry caption index, built on demand — `unitsOf` walks the whole block. */
const unitCache = new Map();

/**
 * The captioned specimen groups of one entry.
 *
 * @param {Element} block A `.spec`.
 * @returns {Map<string, Element>} Caption text to its `.unit`.
 */
function unitsFor(block) {
  if (!unitCache.has(block)) unitCache.set(block, unitsOf(block));
  return unitCache.get(block);
}

/**
 * Group the catalogue by the address its rows share, preserving catalogue order within a group.
 *
 * The key is `(spec, cap, draws)`, spelled the way `byAddress` in `inject.js` spells it, because
 * rows sharing one are paired POSITIONALLY against the drawings that selector matches. Grouping any
 * other way would check a correspondence the page does not make.
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
 * Resolve one address against the library, collecting rather than throwing.
 *
 * COLLECTING IS NOT A STYLE CHOICE. A throw at module scope escapes `node --test`'s failure count
 * entirely — the run reports a crashed file rather than a failed assertion, and a `# fail 0`
 * summary over a broken tree is the one output nobody re-reads.
 *
 * @param {{spec: string, cap: string|null, draws: string, entries: object[]}} address An address.
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
        'addressed to a `div.spec-head > h4`, decoded and verbatim, and the library heads no ' +
        `entry with that text. The page would report it and draw the specimen as authored, which ` +
        'looks exactly like a primitive that is not built yet.',
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
        'paired POSITIONALLY against what the selector matches, so a partial match would leave ' +
        'live components and hand drawings side by side with nothing on the page saying which is ' +
        'which. Re-read the entry and correct the rows.',
    };
  }
  return { targets, problem: null };
}

/** Every address with what it matched, resolved once. */
const RESOLVED = catalogueAddresses().map((address) => ({ address, ...resolveAddress(address) }));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The corpora
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the corpora every rule below quantifies over are alive', () => {
  assert.ok(LIBRARY.blockCount > 0, 'the library parser found no spec-head block; the anchor died');
  assert.equal(
    LIBRARY.headingSections.length,
    LIBRARY.headings.length,
    'headingSections is positional against headings; a length mismatch reassigns every entry ' +
      'after the gap to another section, and the coverage rule below is scoped BY section'
  );
  assert.ok(
    SPEC_BLOCKS.size > 40,
    `the live document yielded ${SPEC_BLOCKS.size} entries. Every address below is looked up in ` +
      'it, so an empty index reports the whole catalogue as addressing nothing — and a nearly ' +
      'empty one reports an arbitrary slice of it.'
  );
  assert.ok(MANIFEST_ROWS.length > 50, `the manifest holds ${MANIFEST_ROWS.length} rows`);
  assert.ok(
    SHIPS_AS.size > 20,
    `only ${SHIPS_AS.size} manifest rows name a library entry, so the coverage rule below has ` +
      'almost no domain'
  );
  assert.ok(
    SHIPPED_COMPONENTS.length > 100,
    `the component walk found ${SHIPPED_COMPONENTS.length} files, so it is not walking`
  );
});

test('the catalogue is alive and every row carries an address', () => {
  // THE ANTI-VACUITY ANCHOR for this whole file. Every rule here is a set comparison, and a set
  // comparison over an empty catalogue passes perfectly while the page shows nothing but drawings.
  const files = catalogueFiles(REPO_ROOT);
  assert.ok(
    files.length > 0,
    `the catalogue holds ${files.length} file(s), which makes every rule below vacuous. One file ` +
      'per library section is what keeps two people cataloguing different sections disjoint.'
  );
  assert.ok(
    CATALOGUE.length > 50,
    `the catalogue holds ${CATALOGUE.length} rows. The Controls section alone is 52, so anything ` +
      'near or below that is a catalogue that has lost a file rather than one being written.'
  );
  assert.ok(
    RESOLVED.length > 10,
    `${RESOLVED.length} distinct address(es) for ${CATALOGUE.length} rows. Every row grouped ` +
      'under one address means the grouping key stopped distinguishing them, and positional ' +
      'pairing would then be decided by catalogue order alone.'
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
      `${where(entry)}: \`cap\` is optional, but an empty one addresses no unit. Omit it to scope ` +
        'to the whole entry.'
    );
    assert.ok(
      props === undefined || (typeof props === 'object' && props !== null && !Array.isArray(props)),
      `${where(entry)}: \`props\` must be a plain object, passed to the component verbatim`
    );
    assert.ok(
      content === undefined || Array.isArray(content),
      `${where(entry)}: \`content\` must be a node ARRAY. \`LiveSpecimen.svelte\` iterates it, so ` +
        'a bare object or a markup string renders nothing at all.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Every row addresses a drawing the library actually has
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('every catalogue row addresses a drawing the library actually has', () => {
  for (const resolved of RESOLVED) {
    // `assert.ok` rather than `assert.equal(problem, null)`: the message IS the problem, so an
    // equality would print it and then print a diff of it against `null` underneath.
    assert.ok(resolved.problem === null, resolved.problem ?? '');
  }
  // THE ANCHOR. The loop above is a conjunction over `RESOLVED`, and a conjunction over an empty
  // list — or over a list every member of which matched nothing — is true. Both are reachable: the
  // first from an empty catalogue, the second from a `.spec`/`.unit` class rename that empties
  // every scope at once, which is exactly the library edit this rule exists to catch.
  const matched = RESOLVED.reduce((total, resolved) => total + resolved.targets.length, 0);
  assert.equal(
    matched,
    CATALOGUE.length,
    `${CATALOGUE.length} rows resolved to ${matched} drawing(s). One row stands one drawing up, ` +
      'so these are the same number or something above is reporting a match it did not make.'
  );
  assert.ok(matched > 50, `${matched} drawings matched, which is not the whole catalogue`);
});

test('no drawing a row claims contains a drawing another row claims', () => {
  // THE DEFECT THIS EXISTS FOR IS SILENT AND IT IS NOT HYPOTHETICAL. `inject.js` resolves EVERY
  // address before it replaces anything, so if one row's `draws` selects an ancestor of another
  // row's, the outer replacement detaches the inner host — and `replaceWith` on a node with no
  // parent does nothing. The inner component still mounts, still counts itself, and still carries
  // its `data-primitive-lab-specimen` root, into a subtree that is not in the document. The
  // drawing it was supposed to replace was destroyed by the outer component and NOTHING on the
  // page says so.
  const hosts = RESOLVED.flatMap((resolved) =>
    resolved.targets.map((host, index) => ({ host, entry: resolved.address.entries[index] }))
  );
  assert.ok(hosts.length > 50, `${hosts.length} drawings claimed, so this rule has no domain`);
  for (const outer of hosts) {
    for (const inner of hosts) {
      if (outer === inner) continue;
      assert.ok(
        !outer.host.contains(inner.host),
        `${where(outer.entry)} claims a drawing that CONTAINS the one ${where(inner.entry)} ` +
          'claims. The outer component replaces both, the inner one mounts into a detached ' +
          'subtree, and the page renders one live component where the library drew two things.'
      );
    }
  }
});

test('the page resolver reads the catalogue exactly as this gate does', () => {
  // TWO READINGS OF ONE RULE, compared. The rules above are this file's; `resolveSlots` is the
  // page's, and it is the one the reader's browser runs. They share `specBlocks`, `unitsOf` and
  // `normalize`, so a disagreement is a disagreement about the RULE — and a page whose resolver
  // silently dropped a row would otherwise fail only in `npm run lab:check`, which is not a CI
  // gate and needs a Foundry chrome harvest nobody has in CI.
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
    `the page's resolver placed ${slots.length} of ${CATALOGUE.length} rows. A row it drops ` +
      'without a problem is a specimen that never appears, on a page that reports no error.'
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Every row names a component that exists, ships and is recorded
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('every catalogue row names a shipped component the manifest records', () => {
  const recorded = new Set(MANIFEST_ROWS.map((row) => row.path));
  const shipped = new Set(SHIPPED_COMPONENTS);
  for (const entry of CATALOGUE) {
    const componentPath = entry.row.path;
    assert.ok(
      shipped.has(componentPath),
      `${where(entry)}: no component at ${componentPath}. \`importers.js\` globs the whole ` +
        '`src/ui/svelte/` subtree, so a path outside it — or a renamed file — throws "no ' +
        'component at" and the specimen renders as a mount failure, which reads as a broken ' +
        'component rather than as a row naming a file that is not there.'
    );
    assert.ok(
      recorded.has(componentPath),
      `${where(entry)}: ${componentPath} is in neither manifest table. \`AGENTS.md\` prohibits a ` +
        'shared component that is not recorded, and the coverage rule below reads the manifest to ' +
        'decide which library names ship — so an unrecorded row is a specimen the coverage claim ' +
        'cannot see.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The props correspondence
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('every prop a catalogue row passes is a prop the component declares', () => {
  let checked = 0;
  for (const entry of CATALOGUE) {
    const declared = declaredFor(entry.row.path);
    if (declared === null) {
      assert.deepEqual(
        Object.keys(entry.row.props ?? {}),
        [],
        `${where(entry)}: ${entry.row.path} has no \`$props()\` destructure at all and the row ` +
          'passes props to it. Svelte drops every one of them silently.'
      );
      continue;
    }
    const names = new Set(declared);
    for (const prop of Object.keys(entry.row.props ?? {})) {
      checked += 1;
      assert.ok(
        names.has(prop) || names.has(REST_PROP),
        `${where(entry)}: \`${prop}\` is not a prop ${entry.row.path} declares, and it ` +
          `destructures no \`${REST_PROP}\` for it to reach the element through. Its props are: ` +
          `${declared.join(', ')}. Svelte drops an undeclared prop SILENTLY, so the specimen ` +
          'renders, looks plausible, and is not showing what the row says it is showing.'
      );
    }
    if (entry.row.content === undefined) continue;
    assert.ok(
      names.has(CHILDREN_PROP),
      `${where(entry)}: the row supplies \`content\` and ${entry.row.path} declares no ` +
        `\`${CHILDREN_PROP}\`. \`LiveSpecimen.svelte\` passes it as the children snippet, so a ` +
        'component that does not render one draws an empty control where the library drew a ' +
        'labelled one.'
    );
  }
  assert.ok(checked > 50, `only ${checked} props were checked, so this rule has almost no domain`);
});

test('every prop name every shipped component declares is a name', () => {
  // OVER THE WHOLE TREE, not over the catalogued subset. This is the rule the repaired parser
  // exists for, and scoping it to the catalogue would mean the reader could go back to returning
  // JSDoc comments as prop names the moment a component left the catalogue.
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
      `${componentPath} has a \`$props()\` destructure that yielded NO names, which is a parse ` +
        'failure wearing the same shape as a component with no props'
    );
    for (const name of declared) {
      assert.ok(
        PROP_NAME.test(name),
        `${componentPath} declares ${JSON.stringify(name)}, which is not an identifier. The ` +
          '`$props()` reader produced it, so the reader is wrong about this file — and every ' +
          'consumer of it is now comparing sets against a name no call site can pass.'
      );
    }
  }
  assert.ok(parsed > 100, `only ${parsed} components parsed, so this rule has almost no domain`);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The coverage claim
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The library's entries, indexed the way the coverage rule needs them.
 *
 * `headings` and `headingSections` are positional against each other — the corpus rule above pins
 * that — so zipping them is the whole index.
 *
 * @returns {{heading: string, section: string|null}[]} Naming entries, in document order.
 */
function libraryEntries() {
  return LIBRARY.headings
    .map((heading, index) => ({ heading, section: LIBRARY.headingSections[index] }))
    .filter((entry) => primitiveNamesIn(entry.heading).length > 0);
}

test('every shipped primitive a catalogued section names has a live specimen', () => {
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

  assert.ok(
    catalogued.size > 0,
    `no catalogue row resolves to a library section, so this rule quantifies over nothing. Either ` +
      'the catalogue is empty or every `spec` names an entry that sits under no `section[id]`.'
  );

  let required = 0;
  for (const { heading, section } of entries) {
    if (!catalogued.has(section)) continue;
    for (const name of primitiveNamesIn(heading)) {
      const componentPath = SHIPS_AS.get(`<${name}>`);
      // UNBUILT NAMES ARE EXEMPT BY CONSTRUCTION. `<Select>` and `<Search>` are specified and have
      // no manifest row, and the README is explicit that their drawings stay drawings.
      if (!componentPath) continue;
      required += 1;
      assert.ok(
        standsUp.get(heading)?.has(componentPath),
        `the library's "${section}" section is catalogued, its entry ${heading} names <${name}>, ` +
          `and ${componentPath} ships — but no catalogue row stands it up under that entry. The ` +
          'claim this page makes is per SECTION: once any row addresses an entry in a section, ' +
          'every shipped primitive that section names has a live specimen. A section with one ' +
          'entry still drawn is a page a reader cannot tell from a complete one, because a ' +
          'drawing is exactly what this page looks like when it is working. Add a row, or move ' +
          "the section's rows out and leave the section uncatalogued."
      );
    }
  }
  assert.ok(
    required > 5,
    `${required} shipped primitive(s) were required to have a specimen. The Controls section ` +
      'alone names eight, so anything below that is a rule whose domain has collapsed.'
  );
});

test('every library entry the manifest names sits under a library section', () => {
  // THE COVERAGE RULE ABOVE IS SCOPED BY SECTION, so an entry under no `section[id]` is invisible
  // to it: nothing catalogues its section, and nothing requires its primitives. That is a hole a
  // library edit could open by accident — moving an entry above the first `<section>` — and this
  // is the rule that reports it.
  const sectioned = new Set(
    LIBRARY.headings.filter((_, index) => LIBRARY.headingSections[index] !== null)
  );
  const named = MANIFEST_ROWS.filter((row) => row.library !== null);
  assert.ok(named.length > 20, `${named.length} rows name a library entry, so this has no domain`);
  for (const row of named) {
    const name = row.library.slice(1, -1);
    const entry = [...sectioned].find((heading) => primitiveNamesIn(heading).includes(name));
    assert.ok(
      entry,
      `${row.path} records library entry ${row.library}, which no sectioned \`div.spec-head > h4\` ` +
        'names. Either the manifest names an entry the library does not head, or the entry sits ' +
        'outside every `section[id]` — under which the coverage rule above would silently stop ' +
        'requiring a specimen for it.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The catalogue directory
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the catalogue directory holds nothing the lab cannot see', () => {
  const entries = readdirSync(path.join(REPO_ROOT, CATALOGUE_DIRECTORY), { withFileTypes: true });
  assert.ok(entries.length > 0, 'the catalogue directory is gone');
  for (const entry of entries) {
    assert.ok(
      entry.isFile(),
      `${CATALOGUE_DIRECTORY}/${entry.name} is a directory. \`import.meta.glob\` is NOT ` +
        'recursive here, so every row under it is invisible to the lab AND to the reader this ' +
        'gate uses — identically, and with no error from either.'
    );
    assert.ok(
      entry.name.endsWith('.json') || entry.name === CATALOGUE_README,
      `${CATALOGUE_DIRECTORY}/${entry.name} is neither a catalogue file nor the README. ` +
        '`catalogue.js` globs `*.json` and reads nothing else.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The Foundry shim's world
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SHIM_PATH = 'tests/view-lab/foundry/installFoundryShim.js';
const SHIM_SOURCE = readFileSync(path.join(REPO_ROOT, SHIM_PATH), 'utf8');

/**
 * The world the shim is installed with, preferring its own minimal one.
 *
 * `mount.js` boots the Primitive Lab against `createMinimalLabWorld()`, so that is the world the
 * property below has to be checked against; the View Lab's fixture literal is the fallback for a
 * tree where the minimal one does not exist. Preference, not a union: checking the shim against the
 * OTHER world would be checking a page nobody opens.
 *
 * @returns {{label: string, keys: string[]}} Where the world came from and what it declares.
 */
function minimalWorldKeys() {
  const marker = 'createMinimalLabWorld';
  if (SHIM_SOURCE.includes(marker)) {
    const slice = SHIM_SOURCE.slice(SHIM_SOURCE.indexOf(marker));
    return { label: `${SHIM_PATH} ${marker}()`, keys: objectLiteralKeys(slice) };
  }
  const worldSource = readFileSync(
    path.join(REPO_ROOT, 'tests/view-lab/world/labWorld.js'),
    'utf8'
  );
  const slice = worldSource.slice(worldSource.indexOf('const world = {'));
  return {
    label: 'tests/view-lab/world/labWorld.js `const world`',
    keys: objectLiteralKeys(slice),
  };
}

test('every world field the Foundry shim reads is supplied by the world it is given', () => {
  const world = minimalWorldKeys();
  const reads = [
    ...new Set([...SHIM_SOURCE.matchAll(/\bworld\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])),
  ];
  assert.ok(
    reads.length > 3,
    `the shim scan found ${reads.length} \`world.\` reads, so the scanner is broken and this ` +
      'property has almost no domain'
  );
  assert.ok(
    world.keys.length > 3,
    `${world.label} yielded ${world.keys.length} keys, so the literal reader is broken and every ` +
      'read below would be reported as unsupplied'
  );
  for (const field of reads.sort(byCodePoint)) {
    assert.ok(
      world.keys.includes(field),
      `${SHIM_PATH} reads \`world.${field}\` and ${world.label} declares no such key. Its keys ` +
        `are: ${world.keys.join(', ')}. An absent one fails LATE — \`settings\`, \`documents\` ` +
        'and `worldTime` are all read inside closures, so the boot succeeds and the failure ' +
        'arrives at whichever specimen happens to touch it first.'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The `$props()` reader, proved against a fixture rather than against the corpus
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A destructure carrying each of the three hazards that broke the old reader, and one that would
 * break a naive repair.
 *
 * Each is a DIFFERENT wrong answer, deliberately, so no single mistake produces the right list by
 * coincidence:
 *
 *   - The JSDoc block above `documented` was left in the body by the old reader and reported as
 *     part of that prop's name.
 *   - `label`'s default carries a template literal whose closing backtick the old depth walk read
 *     as an OPENER, so every prop after it was swallowed.
 *   - `separated`'s default holds a comma inside a string, which a splitter that ignores quotes
 *     reads as the end of the entry.
 *   - `slashes`'s default holds `//` inside a string, which the old strip-line-comments-first pass
 *     would have eaten along with the rest of the line — the one hazard the two-pass form could
 *     never have got right, because neither pass knew what the other was looking at.
 */
const PARSER_FIXTURE = [
  '<script>',
  '  let {',
  '    binding = "relative",',
  '    /** The previewed record. Only `relative` reads it, to convert absolute, offset. */',
  '    documented = 0,',
  '    label = (a, b) => `${a?.name || ""} / ${b?.name || ""}`,',
  '    separated = "one, two, three",',
  '    slashes = "https://example.test/a",',
  '    // a line comment naming scope, actions and systemId',
  '    onChange = () => {},',
  '    ...rest',
  '  } = $props();',
  '</script>',
].join('\n');

test('the $props() reader survives comments, template literals and commas in strings', () => {
  // `localeCompare` puts `...rest` first, which is the reader's own documented ordering rather
  // than an accident: the names come back sorted so a caller can compare a set without sorting.
  assert.deepEqual(declaredPropNames(PARSER_FIXTURE), [
    '...rest',
    'binding',
    'documented',
    'label',
    'onChange',
    'separated',
    'slashes',
  ]);
});

test('the $props() reader reports a name for every prop of the components that broke it', () => {
  // The five components the old reader mis-parsed, by name, with the count each one declares.
  // Counted rather than listed: the point is that the reader answers with FIFTEEN names for a
  // fifteen-prop destructure, not which fifteen.
  const measured = [
    ['src/ui/svelte/components/ThresholdBandStrip.svelte', 15],
    ['src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte', 1],
    ['src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte', 2],
    ['src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte', 3],
    ['src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte', 3],
  ];
  for (const [componentPath, count] of measured) {
    const declared = declaredPropNames(readFileSync(path.join(REPO_ROOT, componentPath), 'utf8'));
    assert.equal(declared.length, count, `${componentPath} prop count`);
    for (const name of declared) assert.ok(PROP_NAME.test(name), `${componentPath}: ${name}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The smoke's derivations, which no browser is needed to check
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build a throwaway repository root holding a catalogue, and run something against it.
 *
 * A FIXTURE ROOT rather than the real one, because these functions have to be checkable when the
 * real catalogue is empty, when it is full, and when it holds something it should not — three
 * states the repository can only be in one of at a time.
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
        'every row must carry where it came from, or a failure names a component instead of a place'
      );
    }
  );
});

test('the catalogue reader refuses a file that is not an array of rows', () => {
  withCatalogueFixture({ 'controls.json': JSON.stringify({ path: 'a.svelte' }) }, (root) => {
    assert.throws(
      () => catalogueEntries(root),
      /is not an array of catalogue rows/,
      'a single row written without its enclosing array would otherwise flatten to nothing and ' +
        'read as an empty file'
    );
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
    /never mounted: b\.svelte/,
    'a smaller mounted set must be reported as the rows that are missing'
  );
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte', 'z.svelte'], reported: 2 }),
    /mounted but not catalogued: z\.svelte/,
    'THE INTERESTING FAILURE: the count agrees and the identity does not. A smoke that compared ' +
      'only the number would call this page correct.'
  );
  assert.match(
    describeMountFailure({ expected, mounted: [...expected], reported: 0 }),
    /the page reported 0 mounted/,
    'a page that carries the specimen roots and reports zero has a broken counter, which is the ' +
      'attribute the whole smoke is decided on'
  );
  // THE FAILURE THE LIBRARY PAGE MADE REACHABLE. A component standing in a drawing that CONTAINS
  // another row's drawing detaches the inner host, so the inner specimen mounts outside the
  // document: the page's counter says three, the document carries two roots, and every path in
  // the catalogue is still present somewhere. A membership comparison agrees with that page.
  assert.match(
    describeMountFailure({
      expected: ['a.svelte', 'a.svelte', 'b.svelte'],
      mounted: ['a.svelte', 'b.svelte'],
      reported: 3,
    }),
    /a\.svelte: catalogued 2, mounted 1/,
    'a path catalogued twice and mounted once must be reported by NAME and by both counts; ' +
      'membership alone reports two agreeing sets'
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The attribute contract, which is the whole interface between the page and the smoke
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The half of the contract the smoke owns. Its attribute names are what the run is decided on. */
const SMOKE_PATH = 'scripts/lib/primitiveLabSmoke.js';

/**
 * The half the PAGE owns: the two files that write the attributes, read as text.
 *
 * Read rather than imported, and that is not a preference. `mount.js` boots the lab on import and
 * `LiveSpecimen.svelte` needs compiling, so neither can be loaded here — which is exactly the
 * condition under which a hand-maintained mirror of strings goes unchecked. The bytes are the same
 * bytes Vite serves, so reading them is not a second record of the contract.
 */
const PAGE_SOURCES = new Map(
  ['tests/view-lab/primitives/mount.js', 'tests/view-lab/primitives/LiveSpecimen.svelte'].map(
    (file) => [file, readFileSync(path.join(REPO_ROOT, file), 'utf8')]
  )
);

/**
 * The page files that WRITE an attribute, as opposed to the ones that merely mention it.
 *
 * THE DISTINCTION IS MEASURED, not fastidious. The first draft of this rule asked whether the
 * source `includes` the name at all — and renaming `READY_ATTRIBUTE` in `mount.js` left it passing,
 * because both files document these attributes in prose and the docblock still spelled the old
 * name. A rule that a stale comment can satisfy is a rule that reports the rename it exists to
 * catch as agreement.
 *
 * So only the two forms that actually set an attribute count: a quoted string literal, which is how
 * `mount.js` names the three it puts on `<body>`, and `name={…}`, which is how
 * `LiveSpecimen.svelte` writes the row's path onto the specimen root. Prose says `` `name` `` or
 * `name=""`, and neither of those is either of these.
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
  // WITHOUT THIS RULE nothing under `tests/` names these attributes at all, and the only thing
  // that compares the two halves is `npm run lab:check` — which is not a CI gate. A rename of
  // either side then reads as a lab that never becomes ready: the smoke waits for an attribute
  // nobody sets, times out, and reports it as a page that failed to mount.
  const smokeSource = readFileSync(path.join(REPO_ROOT, SMOKE_PATH), 'utf8');
  const declared = [
    ...new Set([...smokeSource.matchAll(/'(data-primitive-lab-[a-z-]+)'/g)].map((m) => m[1])),
  ].sort(byCodePoint);
  // The scan is DERIVED rather than typed, so a fifth attribute is covered the day it is added —
  // but a derived scan that matches nothing passes the loop below perfectly, so it is anchored
  // against the four names this file imports by name and would fail to link without.
  assert.deepEqual(
    missingFrom(declared, [
      ERROR_ATTRIBUTE,
      MOUNTED_ATTRIBUTE,
      READY_ATTRIBUTE,
      SPECIMEN_ATTRIBUTE,
    ]),
    [],
    `the scan over ${SMOKE_PATH} found ${declared.length} attribute literal(s) and missed one the ` +
      'module exports, so the scanner is broken and the rule below has almost no domain'
  );

  for (const attribute of declared) {
    assert.ok(
      writersOf(attribute).length > 0,
      `${SMOKE_PATH} decides the run on \`${attribute}\` and neither ` +
        `${[...PAGE_SOURCES.keys()].join(' nor ')} SETS it. The smoke polls for it, the page ` +
        'never writes it, and the timeout is reported as a lab that failed to mount rather than ' +
        'as two halves of one contract that stopped spelling it the same way.'
    );
  }

  // `MOUNT_ALL_QUERY` is the one part of the contract that is not an attribute: the smoke
  // NAVIGATES with it, and `requireSupportedMountMode` REFUSES any value it does not know. So a
  // rename on either side does not degrade — it throws on boot, before a single specimen mounts.
  const [parameter, value, ...extra] = MOUNT_ALL_QUERY.split('=');
  assert.deepEqual(extra, [], `${MOUNT_ALL_QUERY} is not one \`parameter=value\` pair`);
  const mountSource = PAGE_SOURCES.get('tests/view-lab/primitives/mount.js');
  for (const half of [parameter, value]) {
    assert.ok(
      mountSource.includes(`'${half}'`),
      `the smoke navigates with \`?${MOUNT_ALL_QUERY}\` and \`mount.js\` declares no ` +
        `\`'${half}'\`. Its mount-mode check refuses every value but the one it names, so the ` +
        'page throws on boot and the whole run fails as a page error.'
    );
  }
});

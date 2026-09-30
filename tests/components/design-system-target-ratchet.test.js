/**
 * The design-system programme's closing ratchet (issue 1776, epic 1495 rule 2): the library's
 * per-name `target` statuses, keyed on the name, the manifest's `target` rows, keyed on the
 * implementation path, and the library's "Entries without an API" list, each compared with the
 * base commit. Some manifest rows name no library entry, so one flip lowers one population or both.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodePoint } from '../helpers/codePointOrder.js';
import { parseDesignLibrary, primitiveNamesIn } from '../helpers/designLibrary.js';
import {
  MANIFEST_CORPUS,
  MANIFEST_PATH,
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  emptyMarkerFailure,
  gateOver,
  inAny,
  manifestRows,
  workingTree,
} from '../helpers/designSystemRatchet.js';

const LIBRARY_PATH = 'openspec/specs/design-system/library.html';
const LIBRARY_CORPUS = Object.freeze({
  roots: ['openspec/specs/design-system'],
  extensions: ['library.html'],
  include: (file) => file === LIBRARY_PATH,
});

/** Every `data-status-<Name>="<status>"` the library declares, with its line. */
function perNameStatuses(readFile) {
  const text = readFile(LIBRARY_PATH) ?? '';
  return text.split('\n').flatMap((content, index) =>
    [...content.matchAll(/data-status-([A-Za-z][A-Za-z0-9]*)="([^"]*)"/gu)].map((match) => ({
      name: match[1],
      status: match[2],
      line: index + 1,
    }))
  );
}

/** A marker at a line several entries share excuses only the entry its reason names. */
const NAMED = Object.freeze({ siteMarkers: (entry, marker) => marker.reason.includes(entry.name) });

const TARGET_NAME_GATE = {
  ...gateOver([LIBRARY_CORPUS], (readFile) =>
    perNameStatuses(readFile)
      .filter((entry) => entry.status === 'target')
      .map(({ name, line }) => ({
        file: LIBRARY_PATH,
        line,
        id: `<${name}> at \`target\``,
        name: `<${name}>`,
      }))
  ),
  ...NAMED,
};

const API_ROW_LABEL = '>Entries without an API</td>';

/** The library's "Entries without an API" row: its line and the names its second cell lists. */
function entriesWithoutApi(readFile) {
  const lines = (readFile(LIBRARY_PATH) ?? '').split('\n');
  const index = lines.findIndex((content) => content.includes(API_ROW_LABEL));
  if (index === -1) return null;
  const cells = [...lines[index].matchAll(/<td[^>]*>(.*?)<\/td>/gu)].map((match) => match[1]);
  const listed = (cells[1] ?? '').replaceAll(/<[^>]*>/gu, '').replaceAll('&lt;', '<');
  return { line: index + 1, names: primitiveNamesIn(listed.replaceAll('&gt;', '>')) };
}

const NO_API_GATE = {
  ...gateOver([LIBRARY_CORPUS], (readFile) => {
    const listed = entriesWithoutApi(readFile);
    return (listed?.names ?? []).map((name) => ({
      file: LIBRARY_PATH,
      line: listed.line,
      id: `<${name}> has no Svelte API`,
      name: `<${name}>`,
    }));
  }),
  ...NAMED,
};

/**
 * Every manifest row at `target`, as an entry on its implementation file, so a moved component
 * keeps its row; a manifest cannot hold a comment, so the marker sits at that file's head and
 * excuses the file's rows only when they are new or grew.
 */
const TARGET_ROW_GATE = {
  include: inAny(MANIFEST_CORPUS, TEMPLATE_CORPUS),
  measure: (readFile) =>
    manifestRows(readFile)
      .filter((row) => row.status === 'target')
      .map((row) => ({ file: row.path, id: 'manifest row at `target`' })),
  siteMarkers: false,
  headMarkers: true,
};

const tree = () => workingTree(LIBRARY_CORPUS, MANIFEST_CORPUS);

test('the three scans read the live library and manifest', () => {
  const { readFile } = tree();
  const statuses = perNameStatuses(readFile);
  assertFloor('library per-name statuses', statuses.length, 60);
  assertFloor('manifest rows', manifestRows(readFile).length, 50);
  assert.ok(
    entriesWithoutApi(readFile) !== null,
    `the library no longer carries its "Entries without an API" row, so that list is unread`
  );
  // The line scan must agree with the parsed library, or a status written some other way escapes.
  const parsed = parseDesignLibrary(readFile(LIBRARY_PATH)).blocks.flatMap((block) =>
    Object.entries(block.perNameStatus).map(([name, status]) => `${name}=${status}`)
  );
  assert.deepEqual(
    statuses.map(({ name, status }) => `${name}=${status}`).sort(byCodePoint),
    parsed.sort(byCodePoint),
    'the per-name statuses the line scan reads differ from the ones the parsed library holds'
  );
});

test('no library entry is newly written at `target`', (t) => {
  checkGate(
    t,
    TARGET_NAME_GATE,
    'This is the programme-closing population, and it only goes down. A name flips to `shipped` ' +
      'when its API and geometry match the specimen and a View Lab case draws it, or to ' +
      '`divergent` on a maintainer decision carrying its issue. A new name at `target` is ' +
      'legitimate only when the entry is new, and then it carries a ' +
      '`<!-- ratchet-exempt(design-system): <Name>: reason -->` line right above its `div.spec`, ' +
      'naming the entry, since one `div.spec` can declare several.'
  );
});

test('no manifest row is newly written at `target`', (t) => {
  checkGate(
    t,
    TARGET_ROW_GATE,
    'A row reaches `shipped` on the same bar as a library name. A promotion into a primitive ' +
      'directory arrives as a new row at `target`, and the promoting change says so with a ' +
      'ratchet-exempt(design-system) reason at the head of the component the row names, since ' +
      `\`${MANIFEST_PATH}\` cannot hold a comment.`
  );
});

test('no entry newly joins the "Entries without an API" list', (t) => {
  checkGate(
    t,
    NO_API_GATE,
    'An entry carried unchanged from an existing component may state its geometry alone, but the ' +
      'list of such entries only shrinks: write the Svelte API section instead, or put a ' +
      'ratchet-exempt(design-system) reason naming the entry, as `<Name>`, on the line above the ' +
      'row, since the row lists every such entry.'
  );
});

test('a scan below its floor fails as a broken scan rather than a clean tree', () => {
  assert.doesNotThrow(() => assertFloor('probe', 3, 3));
  assert.throws(() => assertFloor('probe', 2, 3), {
    message: /probe: the scan looked at only 2 candidates, below the floor of 3[\s\S]*broken scan/,
  });
});

/* ───────────────────────── proofs against throwaway repositories ───────────────────────── */

const REASON = 'ratchet-exempt(design-system): the probe needs it';

const spec = (name, status) =>
  `<div class="spec" data-status="${status}" data-status-${name}="${status}">`;

const apiRow = (listed) =>
  `<tr><td style="x">Entries without an API</td><td style="y">${listed}</td><td>z</td></tr>`;

const library = (...lines) =>
  ['<html>', spec('Foo', 'target'), spec('Bar', 'shipped'), ...lines, apiRow('none'), ''].join(
    '\n'
  );

const manifestRow = (path, status) => ({ path, library: null, status });
const manifest = (...rows) =>
  `${JSON.stringify({ designSystemPrimitives: [manifestRow('src/ui/svelte/A.svelte', 'target'), ...rows] })}\n`;

const BASE = Object.freeze({
  [LIBRARY_PATH]: library(),
  [MANIFEST_PATH]: manifest(manifestRow('src/ui/svelte/B.svelte', 'shipped')),
  'src/ui/svelte/A.svelte': '<div></div>\n',
  'src/ui/svelte/B.svelte': '<div></div>\n',
  'src/ui/svelte/C.svelte': '<div></div>\n',
  'README.md': 'unrelated\n',
});

test('a new `target` name or manifest row fails, a repeated one fails, and nothing else', (t) => {
  const names = (name) => `${LIBRARY_PATH}: <${name}> at \`target\``;
  assertGateCases(t, TARGET_NAME_GATE, BASE, [
    {
      head: { [LIBRARY_PATH]: library(spec('Baz', 'target')) },
      failures: [`${names('Baz')} is new (1)`],
    },
    {
      head: { [LIBRARY_PATH]: library().replace(spec('Bar', 'shipped'), spec('Bar', 'target')) },
      failures: [`${names('Bar')} is new (1)`],
    },
    {
      head: { [LIBRARY_PATH]: library(spec('Foo', 'target')) },
      failures: [`${names('Foo')} rose from 1 to 2`],
    },
    { head: { [LIBRARY_PATH]: library().replace(spec('Foo', 'target'), '') }, failures: [] },
    { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
  ]);
  const rows = (file) => `${file}: manifest row at \`target\``;
  const shipped = manifestRow('src/ui/svelte/B.svelte', 'shipped');
  assertGateCases(t, TARGET_ROW_GATE, BASE, [
    {
      head: { [MANIFEST_PATH]: manifest(manifestRow('src/ui/svelte/B.svelte', 'target')) },
      failures: [`${rows('src/ui/svelte/B.svelte')} is new (1)`],
    },
    {
      head: { [MANIFEST_PATH]: manifest(shipped, manifestRow('src/ui/svelte/A.svelte', 'target')) },
      failures: [`${rows('src/ui/svelte/A.svelte')} rose from 1 to 2`],
    },
    { head: { 'src/ui/svelte/C.svelte': '<p></p>\n' }, failures: [] },
    { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
  ]);
  assertGateCases(t, NO_API_GATE, BASE, [
    {
      head: { [LIBRARY_PATH]: library().replace(apiRow('none'), apiRow('&lt;Qux&gt; · <b>x</b>')) },
      failures: [`${LIBRARY_PATH}: <Qux> has no Svelte API is new (1)`],
    },
    {
      head: { [LIBRARY_PATH]: library(spec('Baz', 'shipped')) },
      failures: [],
    },
  ]);
});

test('a reasoned marker at the site exempts a new `target` entry, and an empty one fails', (t) => {
  const marked = (reason) => `<!-- ${reason} -->`;
  const markerLine = 4;
  assertGateCases(t, TARGET_NAME_GATE, BASE, [
    {
      head: { [LIBRARY_PATH]: library(marked(`${REASON} <Baz>`), spec('Baz', 'target')) },
      failures: [],
    },
    {
      head: { [LIBRARY_PATH]: library(marked(`${REASON} <Qux>`), spec('Baz', 'target')) },
      failures: [`${LIBRARY_PATH}: <Baz> at \`target\` is new (1)`],
    },
    {
      head: {
        [LIBRARY_PATH]: library(
          marked(`${REASON} <Baz>`),
          `<div class="spec" data-status-Baz="target" data-status-Zed="target">`
        ),
      },
      failures: [`${LIBRARY_PATH}: <Zed> at \`target\` is new (1)`],
    },
    {
      head: {
        [LIBRARY_PATH]: library(marked('ratchet-exempt(design-system):'), spec('Baz', 'target')),
      },
      failures: [
        `${LIBRARY_PATH}: <Baz> at \`target\` is new (1); its ratchet-exempt marker gives no reason`,
        emptyMarkerFailure(LIBRARY_PATH, markerLine),
      ],
    },
  ]);
  const promoted = manifest(manifestRow('src/ui/svelte/C.svelte', 'target'));
  const component = (reason) => `${marked(reason)}\n<div></div>\n`;
  assertGateCases(t, TARGET_ROW_GATE, BASE, [
    {
      head: { [MANIFEST_PATH]: promoted, 'src/ui/svelte/C.svelte': component(REASON) },
      failures: [],
    },
    {
      head: {
        [MANIFEST_PATH]: promoted,
        'src/ui/svelte/C.svelte': component('ratchet-exempt(design-system):'),
      },
      failures: [
        'src/ui/svelte/C.svelte: manifest row at `target` is new (1); its ratchet-exempt marker ' +
          'gives no reason',
        emptyMarkerFailure('src/ui/svelte/C.svelte', 1),
      ],
    },
  ]);
  const noApi = (reason, listed) =>
    library().replace(apiRow('none'), `${marked(reason)}\n${apiRow(listed)}`);
  assertGateCases(t, NO_API_GATE, BASE, [
    { head: { [LIBRARY_PATH]: noApi(`${REASON} <Qux>`, '&lt;Qux&gt;') }, failures: [] },
    {
      head: { [LIBRARY_PATH]: noApi(`${REASON} <Qux>`, '&lt;Qux&gt; · &lt;Zed&gt;') },
      failures: [`${LIBRARY_PATH}: <Zed> has no Svelte API is new (1)`],
    },
  ]);
});

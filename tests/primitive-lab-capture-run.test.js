/**
 * The browser half of `npm run lab:capture` (issue 2413), over fake pages whose in-page reads run
 * against happy-dom: boot failure, the deadline, the incremental manifest, the cross-check, the
 * clip, the resolution of every real library unit, and the CLI's exit code.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

import {
  OUTPUT_DIRECTORY,
  captureLibrary,
  captureManifest,
  clipUnion,
  createCaptureState,
  createDeadline,
  createManifestWriter,
  exitCodeOf,
  measureUnit,
  parseCaptureArgs,
  planRequests,
  readCatalogueSections,
  readLabels,
  resolveRequests,
} from '../scripts/lib/primitiveLabCapture.js';
import { CATALOGUE_DIRECTORY, parseCatalogueRows } from '../scripts/lib/primitiveLabCatalogue.js';
import { selectLibraryTargets } from '../scripts/lib/primitiveLabSelection.js';
import { LIBRARY_PATH, addressKey, scanLibraryRegions } from '../scripts/lib/primitiveLabUnits.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_PAGE = new Set([resolveRequests, readLabels, measureUnit]);

const entry = (heading, captions) => [
  '<div class="spec">',
  `  <div class="spec-head"><h4>${heading}</h4></div>`,
  ...captions.map((cap) => `  <div class="unit"><span class="cap">${cap}</span><i>x</i></div>`),
  '</div>',
];
const libraryOf = (heading = '&lt;Chip&gt;', captions = ['filter', 'removable', 'tag']) =>
  ['<section>', ...entry(heading, captions), '</section>'].join('\n');

/** A document holding `html`, closed after the test. */
function documentOf(t, html) {
  const window = new Window();
  t.after(() => window.close());
  window.document.write(html);
  return window.document;
}

/**
 * A page whose in-page reads run against `doc`, whose lab report is `report`, and whose listed
 * in-page functions never settle.
 */
function fakePage(doc, { report = { error: null, mounted: 3 }, hangs = [] } = {}) {
  return {
    frames: () => [],
    goto: async () => {},
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    screenshot: async ({ clip }) => Buffer.from(JSON.stringify(clip)),
    evaluate: async (fn, arg) => {
      if (hangs.includes(fn)) return new Promise(() => {});
      if (IN_PAGE.has(fn)) return fn(arg, doc);
      if (typeof arg === 'string') return null;
      return arg.length === 4 ? { ...report, specimens: [] } : [];
    },
  };
}

/** Requests for every unit of the fixture library, and an io that records what it was handed. */
function harness(t, options = {}) {
  const {
    lab = {},
    labHtml = libraryOf(),
    passedAfter = Infinity,
    library = libraryOf(),
  } = options;
  const { keys = ['unit:0.0', 'unit:0.1', 'unit:0.2'], sections = [] } = options;
  const { requests } = planRequests(keys, { sections, library });
  const pages = {
    reference: fakePage(documentOf(t, options.referenceHtml ?? library)),
    lab: fakePage(documentOf(t, labHtml), lab),
  };
  let checks = 0;
  const written = { frames: [], manifests: [] };
  const writeManifest =
    options.writeManifest ??
    ((state) => {
      written.manifests.push({ frames: state.frames.length, failures: state.failures.length });
    });
  const io = {
    baseUrl: 'https://lab.test',
    now: () => 0,
    deadline: {
      passed: () => (checks += 1) > passedAfter,
      remaining: () => (lab.hangs ? 0 : 60_000),
      elapsed: () => 0,
    },
    writeFrame: async (id) => {
      written.frames.push(id);
    },
    writeManifest,
  };
  return { requests, pages, io, written, state: createCaptureState() };
}

const reasonsOf = (state) => state.failures.map(({ id, reason }) => `${id}: ${reason}`);

test('a boot failure fails every unit and writes no frame', async (t) => {
  const run = harness(t, { lab: { report: { error: 'no chrome harvest', mounted: 0 } } });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, []);
  assert.deepEqual(run.state.frames, []);
  assert.deepEqual(reasonsOf(run.state), [
    'unit:0.0: the Primitive Lab did not boot: no chrome harvest',
    'unit:0.1: the Primitive Lab did not boot: no chrome harvest',
    'unit:0.2: the Primitive Lab did not boot: no chrome harvest',
  ]);
});

test('once the deadline passes, every remaining unit is recorded as deadline', async (t) => {
  const run = harness(t, { passedAfter: 1 });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, ['00-0-chip-filter']);
  assert.deepEqual(reasonsOf(run.state), ['unit:0.1: deadline', 'unit:0.2: deadline']);
});

test('the manifest is rewritten after resolution and after every unit', async (t) => {
  const run = harness(t);
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(
    run.written.manifests.map(({ frames }) => frames),
    [0, 1, 2, 3]
  );
  assert.equal(run.state.frames[2].id, '00-2-chip-tag');
});

test('a lab that draws another heading at a unit records a failure, not a frame', async (t) => {
  const run = harness(t, { labHtml: libraryOf('&lt;Button&gt;') });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, []);
  assert.equal(run.state.failures.length, 3);
  assert.ok(
    run.state.failures.every(({ reason }) => reason.startsWith('the Primitive Lab draws')),
    reasonsOf(run.state).join('\n')
  );
});

test('a page read that never settles is recorded as deadline, not left to the step kill', async (t) => {
  const run = harness(t, { lab: { hangs: [readLabels] } });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, []);
  assert.deepEqual(
    run.state.failures.map(({ reason }) => reason),
    ['deadline', 'deadline', 'deadline']
  );
});

test('the clip is the padded union of a unit and what it draws, clamped to its entry and the document', () => {
  const rect = (x, y, width, height) => ({ x, y, width, height });
  const box = {
    rects: [rect(100, 100, 50, 20), rect(110, 104, 0, 0), rect(140, 104, 40, 12)],
    bounds: rect(90, 40, 200, 300),
    extent: { width: 1920, height: 4000 },
  };
  assert.deepEqual(clipUnion(box, 8), rect(92, 92, 96, 36), 'the overflowing suffix is inside');
  assert.deepEqual(
    clipUnion({ ...box, rects: [rect(100, 100, 50, 20), rect(260, 99.5, 80, 12)] }, 8),
    rect(92, 91, 198, 37),
    'the union stops at the entry, in whole pixels'
  );
  assert.deepEqual(
    clipUnion({ ...box, bounds: rect(0, 0, 4000, 4000), extent: { width: 160, height: 115 } }, 8),
    rect(92, 92, 68, 23),
    'and at the document'
  );
  assert.deepEqual(
    clipUnion({ ...box, rects: [rect(100, 100, 50, 20)] }, 0),
    rect(100, 100, 50, 20)
  );
});

test('every real library entry and unit, and coverage, resolves in the real library.html', (t) => {
  const html = readFileSync(path.join(ROOT, LIBRARY_PATH), 'utf8');
  const { entries, units } = scanLibraryRegions(html);
  const keys = [...entries.map((one) => one.key), ...units.map((one) => one.key), 'coverage'];
  const sections = readCatalogueSections(ROOT);
  const { requests, failures } = planRequests(keys, { sections, library: html });
  assert.deepEqual(failures, []);
  const results = resolveRequests(requests, documentOf(t, html));
  const errors = results.flatMap((result, index) =>
    result.error ? [`${requests[index].key}: ${result.error}`] : []
  );
  assert.deepEqual(errors, []);
  const covered = sections.filter(({ rows }) => rows.length > 0).length;
  assert.equal(results.length, entries.length + units.length + covered);
  const scanned = requests.find((request) => request.kind === 'ordinal' && request.caption);
  const mismatched = resolveRequests(
    [{ ...scanned, caption: 'not this one' }],
    documentOf(t, html)
  );
  assert.match(mismatched[0].error, /^drawn as /);
});

test('the arguments name a base, an output directory and the targets', () => {
  assert.deepEqual(parseCaptureArgs(['entry:1,unit:2.0', 'coverage']), {
    base: null,
    output: OUTPUT_DIRECTORY,
    keys: ['entry:1', 'unit:2.0', 'coverage'],
  });
  assert.deepEqual(parseCaptureArgs(['--base', 'origin/main', '--output', '/tmp/x']), {
    base: 'origin/main',
    output: '/tmp/x',
    keys: [],
  });
  assert.throws(() => parseCaptureArgs(['--base']), /--base needs a value/);
  assert.equal(exitCodeOf({ frames: [{}], failures: [] }, 1), 0);
  assert.equal(exitCodeOf({ frames: [{}], failures: [{}] }, 2), 1);
  assert.equal(exitCodeOf({ frames: [], failures: [] }, 1), 1);
  assert.equal(exitCodeOf({ frames: [], failures: [] }, 0), 0);
});

test('a removed note is not a requested unit, and no other note or failure is subtracted', () => {
  const removed = { key: 'addr:x', kind: 'removed' };
  assert.equal(exitCodeOf({ frames: [], failures: [], notes: [removed, removed] }, 2), 0);
  assert.equal(exitCodeOf({ frames: [], failures: [{}], notes: [removed] }, 1), 1);
  assert.equal(exitCodeOf({ frames: [], failures: [], notes: [removed] }, 2), 1);
  const unlocated = { key: 'unlocated:a:1', kind: 'unlocated' };
  assert.equal(exitCodeOf({ frames: [], failures: [], notes: [unlocated] }, 1), 1);
});

test('the manifest lands whole, by a rename', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-manifest-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  createManifestWriter(dir)(createCaptureState({ head: 'abc' }));
  assert.deepEqual(readdirSync(dir), ['manifest.json']);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).head, 'abc');
});

test('the CLI exits non-zero when a key fails, and writes its manifest where it is told', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-capture-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = spawnSync(
    process.execPath,
    ['scripts/primitive-lab-capture.mjs', 'entry:99999', '--output', dir],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000 }
  );
  assert.equal(run.status, 1, run.stderr);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(
    manifest.failures.map(({ id }) => id),
    ['entry:99999']
  );
  assert.ok(!existsSync(path.join(dir, 'manifest.json.tmp')));
});

test('the deadline reports what is left of it', () => {
  let now = 0;
  const deadline = createDeadline(500, () => now);
  now = 200;
  assert.equal(deadline.remaining(), 300);
  now = 900;
  assert.equal(deadline.remaining(), 0);
});

const REMOVED_KEYS = [
  'unit:0.0',
  addressKey('<Chip>', 'gone'),
  addressKey('<Gone>', 'x'),
  addressKey('<Chip>', 'removable'),
];

test('a deleted row the library no longer draws is a removed note; one it still draws is captured', async (t) => {
  const run = harness(t, { keys: REMOVED_KEYS });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, ['00-0-chip-filter', '00-1-chip-removable']);
  assert.deepEqual(run.state.failures, []);
  assert.deepEqual(
    run.state.notes.map(({ key, kind, spec, cap }) => ({ key, kind, spec, cap })),
    [
      { key: REMOVED_KEYS[1], kind: 'removed', spec: '<Chip>', cap: 'gone' },
      { key: REMOVED_KEYS[2], kind: 'removed', spec: '<Gone>', cap: 'x' },
    ]
  );
  assert.equal(exitCodeOf(captureManifest(run.state), run.requests.length), 0);
});

test('only a deleted row address is let go: every other unresolved request still fails', async (t) => {
  const sections = [{ section: 'controls', rows: [{ spec: '<Chip>', cap: 'ghost' }] }];
  const run = harness(t, {
    keys: ['row:controls/0', 'coverage', 'unit:0.1'],
    sections,
    referenceHtml: libraryOf('&lt;Chip&gt;', ['filter', 'drifted', 'tag']),
  });
  run.requests.push({ key: 'by-hand', kind: 'address', spec: '<Chip>', cap: 'ghost' });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(
    run.state.failures.map(({ id }) => id),
    ['row:controls/0', 'coverage', 'unit:0.1', 'by-hand']
  );
  assert.deepEqual(run.state.notes, []);
  assert.equal(exitCodeOf(captureManifest(run.state), run.requests.length), 1);
});

/** `rows` as a catalogue file, one row per `  {` block. */
const catalogueText = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

/** The hunks `git diff` writes from `before` to `after`. */
function unifiedPatch(before, after) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-capture-patch-'));
  try {
    writeFileSync(path.join(dir, 'a'), before);
    writeFileSync(path.join(dir, 'b'), after);
    const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '-U3', 'a', 'b'], {
      cwd: dir,
      encoding: 'utf8',
    }).stdout;
    return diff.slice(diff.indexOf('\n@@') + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a row deleted with its drawing is selected, planned, captured as a note, and exits 0', async (t) => {
  const row = (cap) => ({ spec: '<Chip>', cap, draws: '.k-chip', path: 'Chip.svelte' });
  const before = catalogueText([row('filter'), row('removable'), row('tag')]);
  const after = catalogueText([row('filter'), row('tag')]);
  const file = `${CATALOGUE_DIRECTORY}/controls.json`;
  const selected = selectLibraryTargets([file], {
    patches: { [file]: unifiedPatch(before, after) },
    source: {
      readText: (name) => (name === file ? after : null),
      catalogueSections: () => ['controls'],
    },
  });
  const keys = selected.map(({ key }) => key);
  assert.deepEqual(keys, ['row:controls/1', addressKey('<Chip>', 'removable')]);
  const sections = [{ section: 'controls', rows: parseCatalogueRows(after) }];
  const drawn = (captions) => libraryOf('&lt;Chip&gt;', captions);
  const [library, bare] = [drawn(['filter', 'tag']), drawn(['filter'])];
  const run = harness(t, { keys, sections, library, labHtml: library });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(run.written.frames, ['00-1-chip-tag']);
  assert.deepEqual(run.state.failures, []);
  assert.deepEqual(captureManifest(run.state).notes, [
    {
      key: keys[1],
      kind: 'removed',
      spec: '<Chip>',
      cap: 'removable',
      reason: '<Chip> has no unit captioned "removable"',
    },
  ]);
  assert.equal(exitCodeOf(captureManifest(run.state), run.requests.length), 0);
  const gone = harness(t, { keys, sections, library: bare, labHtml: bare });
  await captureLibrary(gone.requests, gone.pages, gone.state, gone.io);
  assert.deepEqual(
    gone.state.failures.map(({ id }) => id),
    ['row:controls/1']
  );
  assert.equal(exitCodeOf(captureManifest(gone.state), gone.requests.length), 1);
});

test('every catalogue row resolves as an address in the real library, so a miss means a removal', (t) => {
  const html = readFileSync(path.join(ROOT, LIBRARY_PATH), 'utf8');
  const rows = readCatalogueSections(ROOT).flatMap((section) => section.rows);
  assert.ok(rows.length > 50, `${rows.length} rows`);
  const keys = rows.map((one) => addressKey(one.spec, one.cap ?? null));
  const { requests } = planRequests(keys, { sections: [], library: html });
  const errors = resolveRequests(requests, documentOf(t, html)).flatMap((result) =>
    result.error ? [result.error] : []
  );
  assert.equal(requests.length, rows.length);
  assert.deepEqual(errors, []);
});

test('a capture that stops after resolving fails its live keys and not a removed one', async (t) => {
  const run = harness(t, {
    keys: REMOVED_KEYS,
    writeManifest: () => {
      throw new Error('disk full');
    },
  });
  await captureLibrary(run.requests, run.pages, run.state, run.io);
  assert.deepEqual(reasonsOf(run.state), [
    'unit:0.0: capture stopped: disk full',
    `${REMOVED_KEYS[3]}: capture stopped: disk full`,
  ]);
  assert.deepEqual(
    run.state.notes.map(({ key }) => key),
    [REMOVED_KEYS[1], REMOVED_KEYS[2]]
  );
});

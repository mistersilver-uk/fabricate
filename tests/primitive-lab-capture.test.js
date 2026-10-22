/** The pure half of `npm run lab:capture` (issue 2413): requests, names, notes, limits and diffs. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_CONTEXT } from '../scripts/lib/primitiveLabBrowser.js';
import {
  CAPTURE_DEVICE_SCALE_FACTOR,
  TEXT_LIMIT,
  captureManifest,
  createDeadline,
  describeRun,
  frameId,
  frameLabel,
  frameNote,
  isBootFailure,
  labProblemsOf,
  panelWidth,
  planRequests,
  problemFor,
  rowsInUnit,
  splitGitDiff,
} from '../scripts/lib/primitiveLabCapture.js';
import {
  addressKey,
  formatTargets,
  parseTargetKey,
  parseTargets,
  unlocatedKey,
} from '../scripts/lib/primitiveLabUnits.js';

const CHIP = 'src/ui/svelte/components/Chip.svelte';
const SECTIONS = Object.freeze([
  { section: 'controls', rows: [{ spec: '<Stepper>', draws: '.k-step', path: 'Stepper.svelte' }] },
  { section: 'empty', rows: [] },
  {
    section: 'marks',
    rows: [
      { spec: '<Chip>', cap: 'filter', draws: '.k-chip', path: CHIP },
      { spec: '<Chip>', cap: 'filter', draws: '.k-chip', path: CHIP },
      { spec: '<Chip>', cap: 'removable', draws: '.k-chip', path: 'ChipRemovable.svelte' },
    ],
  },
]);
const LIBRARY = [
  '<section id="marks">',
  '  <div class="spec">',
  '    <div class="spec-head"><h4>&lt;Chip&gt;</h4></div>',
  '    <div class="unit"><span class="cap">filter</span><i class="k-chip"></i></div>',
  '    <div class="unit"><i class="k-chip"></i></div>',
  '  </div>',
  '</section>',
].join('\n');

test('keys become capture requests; coverage is the first row of every non-empty section', () => {
  const keys = [
    'row:marks/2',
    addressKey('<Chip>', 'gone'),
    'unit:0.0',
    'unit:0.1',
    'entry:0',
    'coverage',
    unlocatedKey('a,b%.json', 2),
    'row:marks/9',
    'entry:7',
    'nonsense',
  ];
  const { requests, failures, notes } = planRequests(keys, {
    sections: SECTIONS,
    library: LIBRARY,
  });
  assert.deepEqual(requests, [
    { key: 'row:marks/2', kind: 'address', spec: '<Chip>', cap: 'removable' },
    {
      key: addressKey('<Chip>', 'gone'),
      kind: 'address',
      spec: '<Chip>',
      cap: 'gone',
      deletedRow: true,
    },
    {
      key: 'unit:0.0',
      kind: 'ordinal',
      entry: 0,
      unit: 0,
      heading: '&lt;Chip&gt;',
      caption: 'filter',
    },
    { key: 'unit:0.1', kind: 'ordinal', entry: 0, unit: 1, heading: '&lt;Chip&gt;', caption: null },
    {
      key: 'entry:0',
      kind: 'ordinal',
      entry: 0,
      unit: null,
      heading: '&lt;Chip&gt;',
      caption: null,
    },
    { key: 'coverage', kind: 'address', spec: '<Stepper>', cap: null },
    { key: 'coverage', kind: 'address', spec: '<Chip>', cap: 'filter' },
  ]);
  assert.deepEqual(
    failures.map((failure) => failure.id),
    ['row:marks/9', 'entry:7', 'nonsense']
  );
  assert.deepEqual(notes, [
    { key: unlocatedKey('a,b%.json', 2), kind: 'unlocated', file: 'a,b%.json', count: 2 },
  ]);
});

test('target keys never carry a comma, and a target list is deduplicated', () => {
  const key = unlocatedKey('dir,with,commas/%2C.json', 3);
  assert.ok(!key.includes(','), key);
  assert.deepEqual(parseTargetKey(key), {
    kind: 'unlocated',
    file: 'dir,with,commas/%2C.json',
    count: 3,
  });
  assert.deepEqual(parseTargets(formatTargets(['coverage', key, 'coverage', ' entry:1 '])), [
    'coverage',
    key,
    'entry:1',
  ]);
});

test('a frame is named, labelled and noted from its entry, unit and rows', () => {
  const unit = { element: { entry: 3, unit: 1 }, heading: '<Chip>', caption: 'filter — tag' };
  const id = frameId(unit);
  assert.equal(id, '03-1-chip-filter-tag');
  assert.match(
    `${frameId({ ...unit, element: { entry: 12, unit: null }, caption: null })}.png`,
    /^[a-z0-9-]+\.png$/
  );
  assert.equal(frameLabel(unit), 'Library · Chip · filter — tag');
  const rows = rowsInUnit(SECTIONS, {
    element: { entry: 0, unit: 0 },
    heading: '<Chip>',
    caption: 'filter',
  });
  assert.deepEqual(
    rows.map((row) => row.key),
    ['row:marks/0', 'row:marks/1']
  );
  assert.equal(
    frameNote(rows),
    '`library.html` (left) · Primitive Lab (right) · 2 row(s) of `src/ui/svelte/components/Chip.svelte`'
  );
  assert.equal(
    rowsInUnit(SECTIONS, { element: { entry: 0, unit: 1 }, heading: '<Chip>', caption: null })
      .length,
    0
  );
  assert.equal(
    rowsInUnit(SECTIONS, { element: { entry: 0, unit: null }, heading: '<Chip>', caption: null })
      .length,
    3
  );
  const long = 'x'.repeat(400);
  assert.ok(frameNote([], long).endsWith(`Primitive Lab reported: ${'x'.repeat(TEXT_LIMIT - 1)}…`));
  assert.ok(frameLabel({ heading: long, caption: null }).length <= TEXT_LIMIT);
});

test("the lab's report decides a failed boot, and its problems caption the frames they name", () => {
  assert.ok(isBootFailure({ error: 'no chrome harvest', mounted: 0 }));
  assert.ok(isBootFailure({ error: null, mounted: 0 }));
  assert.ok(isBootFailure({ error: 'boom', mounted: 4 }), 'a raw message is a boot-level error');
  assert.ok(!isBootFailure({ error: '2: <Chip> / "filter": x | <Stepper>: y', mounted: 200 }));
  assert.ok(!isBootFailure({ error: null, mounted: 200 }));
  const problems = labProblemsOf('2: <Chip> / "filter": stale draws | <Stepper>: no entry');
  assert.deepEqual(problems, ['<Chip> / "filter": stale draws', '<Stepper>: no entry']);
  assert.equal(problemFor(problems, '<Chip>'), '<Chip> / "filter": stale draws');
  assert.equal(problemFor(problems, '<Stepper>'), '<Stepper>: no entry');
  assert.equal(problemFor(problems, '<Toggle>'), null);
  assert.deepEqual(labProblemsOf(null), []);
});

test('the deadline runs on the clock it is given', () => {
  let now = 1000;
  const deadline = createDeadline(500, () => now);
  assert.ok(!deadline.passed());
  now = 1499;
  assert.ok(!deadline.passed());
  now = 1500;
  assert.ok(deadline.passed());
  assert.equal(deadline.elapsed(), 500);
});

test('the manifest clips what publish reads and lists each failing key once per reason', () => {
  const manifest = captureManifest({
    head: 'abc12345',
    failures: [
      { id: 'coverage', reason: 'no chrome harvest' },
      { id: 'coverage', reason: 'no chrome harvest' },
      { id: 'row:marks/0', reason: `deadline${' '.repeat(3)}` },
      { id: 'entry:1', reason: 'y'.repeat(500) },
    ],
    labProblems: ['z'.repeat(500)],
    timings: { bootMs: 1, perUnitMs: {}, totalMs: 2 },
  });
  assert.deepEqual(
    manifest.failures.map(({ id, reason }) => [id, reason.length]),
    [
      ['coverage', 17],
      ['row:marks/0', 8],
      ['entry:1', TEXT_LIMIT],
    ]
  );
  assert.equal(manifest.labProblems[0].length, TEXT_LIMIT);
  assert.deepEqual(Object.keys(manifest), [
    'head',
    'foundryVersion',
    'frames',
    'failures',
    'overflow',
    'notes',
    'labProblems',
    'timings',
  ]);
});

test('a local diff splits into the files API shape, a rename by its new name', () => {
  const diff = [
    'diff --git a/x.json b/x.json',
    'index 1..2 100644',
    '--- a/x.json',
    '+++ b/x.json',
    '@@ -1,2 +1,2 @@',
    ' [',
    '-1',
    '+2',
    'diff --git a/old.svelte b/new.svelte',
    'similarity index 100%',
    'rename from old.svelte',
    'rename to new.svelte',
    'diff --git a/gone.js b/gone.js',
    'deleted file mode 100644',
    '--- a/gone.js',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-x',
    '',
  ].join('\n');
  assert.deepEqual(splitGitDiff(diff), [
    { filename: 'x.json', patch: '@@ -1,2 +1,2 @@\n [\n-1\n+2\n' },
    { filename: 'new.svelte', patch: '' },
    { filename: 'gone.js', patch: '@@ -1 +0,0 @@\n-x\n' },
  ]);
});

test('composites render at double density while lab:check keeps its own context', () => {
  assert.equal(CAPTURE_DEVICE_SCALE_FACTOR, 2);
  assert.equal(BROWSER_CONTEXT.deviceScaleFactor, 1);
  const header = Buffer.alloc(24);
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(500, 16);
  assert.equal(
    panelWidth(header),
    250,
    'a panel shows at its CSS size, one image pixel a device pixel'
  );
  assert.equal(panelWidth(header, 1), 500);
});

test('the run log counts the removed notes and prints one control-free line for each', () => {
  const manifest = captureManifest({
    frames: [{ id: 'a' }],
    failures: [{ id: 'k', reason: 'r' }],
    notes: [
      {
        key: 'k1',
        kind: 'removed',
        spec: '<Chip>',
        cap: 'go\nne',
        reason: '<Chip> has no\u{1B} unit',
      },
      { key: 'k2', kind: 'removed', spec: '<Gone>', cap: null, reason: 'no entry' },
      { key: 'k3', kind: 'unlocated', file: 'a.json', count: 1 },
    ],
    timings: { bootMs: 5, totalMs: 9 },
  });
  assert.deepEqual(describeRun(manifest, '/out'), [
    'captured 1 unit(s) to /out (1 failure(s), 2 removed with their drawing, 0 over the cap; boot 5 ms, total 9 ms)',
    'removed with its drawing: <Chip> · gone (<Chip> has no unit)',
    'removed with its drawing: <Gone> (no entry)',
  ]);
});

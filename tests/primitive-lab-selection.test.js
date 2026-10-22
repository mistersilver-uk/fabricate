/** Which design-library units a PR's changed files select for the CI library capture (issue 2413). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

import { CATALOGUE_DIRECTORY, catalogueFiles } from '../scripts/lib/primitiveLabCatalogue.js';
import {
  MANIFEST_PATH,
  catalogueRowRegions,
  selectLibraryTargets,
} from '../scripts/lib/primitiveLabSelection.js';
import {
  LIBRARY_PATH,
  addressKey,
  capDistinctUnits,
  parseTargetKey,
  scanLibraryRegions,
} from '../scripts/lib/primitiveLabUnits.js';

import { unifiedPatch } from './helpers/unifiedPatch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const BUTTON = 'src/ui/svelte/components/Button.svelte';
const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const MARKS = `${CATALOGUE_DIRECTORY}/marks.json`;
const CONTROLS = `${CATALOGUE_DIRECTORY}/controls.json`;
const fixturePath = (name) => `tests/view-lab/primitives/fixtures/${name}.svelte`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const MARK_ROWS = [
  { spec: '<Chip>', cap: 'filter', draws: '.k-chip', path: CHIP, props: { tone: 'tag' } },
  { spec: '<Chip>', cap: 'removable', draws: '.k-chip', path: CHIP, fixture: 'ChipRemovable' },
  { spec: '<Button>', cap: 'primary', draws: '.k-btn', path: BUTTON },
];
const CONTROL_ROWS = [
  { spec: '<Stepper>', draws: '.k-step', path: STEPPER },
  { spec: '<Toggle>', cap: 'on', draws: '.k-tog', path: 'src/Toggle.svelte', fixture: 'ToggleOn' },
];

const LIBRARY_LINES = Object.freeze([
  '<!doctype html>',
  '<html><head><style>.unit{gap:4px}</style></head>',
  '<body>',
  '<section id="marks">',
  '  <div class="sec-head"><h2>Marks</h2></div>',
  '  <div class="spec" data-status="shipped">',
  '    <div class="spec-head"><h4>&lt;Chip&gt;</h4><span class="st">shipped</span></div>',
  '    <div class="row">',
  '      <div class="unit"><span class="cap">filter</span><span class="k-chip">A</span></div>',
  '      <div class="unit grow">',
  '        <span class="cap">removable</span>',
  '        <span class="k-chip">B</span>',
  '      </div>',
  '      <div class="unit"><span class="k-chip">bare</span></div>',
  '    </div>',
  '  </div>',
  '  <div class="spec" data-status="target">',
  '    <div class="spec-head"><h4>&lt;Button&gt;</h4></div>',
  '    <div class="unit"><span class="cap">primary</span><button class="k-btn">Go</button></div>',
  '    <div class="unit"><span class="cap">ghost</span><button class="k-btn">Go</button></div>',
  '  </div>',
  '</section>',
  '</body></html>',
]);
const LIBRARY = `${LIBRARY_LINES.join('\n')}\n`;

const MANIFEST = json({
  designSystemPrimitives: [
    { path: CHIP, library: '<Chip>', status: 'shipped', why: 'Chips.' },
    { path: BUTTON, library: '<Button>', status: 'target', why: 'Buttons.' },
    { path: STEPPER, library: '<Stepper>', status: 'shipped', why: 'Steppers.' },
  ],
  notAPrimitive: [],
});

const BASE_FILES = Object.freeze({
  [MARKS]: json(MARK_ROWS),
  [CONTROLS]: json(CONTROL_ROWS),
  [LIBRARY_PATH]: LIBRARY,
  [MANIFEST_PATH]: MANIFEST,
});

/** An in-memory checkout: a key present with `null` is a listed but unreadable catalogue file. */
function fakeSource(overrides = {}) {
  const files = { ...BASE_FILES, ...overrides };
  return {
    readText: (file) => files[file] ?? null,
    catalogueSections: () =>
      Object.keys(files)
        .map((file) => /^tests\/view-lab\/primitives\/catalogue\/([^/]+)\.json$/.exec(file)?.[1])
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
  };
}

/** Select after one file changed from `before` to `after`, the checkout holding `after`. */
function selectEdit(file, before, after, overrides = {}) {
  return selectLibraryTargets([file], {
    patches: { [file]: unifiedPatch(before, after) },
    source: fakeSource({ ...overrides, [file]: after }),
  });
}

const keysOf = (records) => records.map((record) => record.key);
const editLine = (lines, index, text) => lines.with(index, text);
const libraryWith = (lines) => `${lines.join('\n')}\n`;

test('a hunk inside a one-line unit narrows to that unit, with its heading and caption', () => {
  const after = libraryWith(editLine(LIBRARY_LINES, 8, LIBRARY_LINES[8].replace('>A<', '>A2<')));
  assert.deepEqual(selectEdit(LIBRARY_PATH, LIBRARY, after), [
    { key: 'unit:0.0', signal: 'library', heading: '&lt;Chip&gt;', caption: 'filter' },
  ]);
});

test('a `unit grow` unit and a captionless unit are units', () => {
  const grow = libraryWith(editLine(LIBRARY_LINES, 11, '        <span class="k-chip">B2</span>'));
  assert.deepEqual(keysOf(selectEdit(LIBRARY_PATH, LIBRARY, grow)), ['unit:0.1']);
  const bare = libraryWith(
    editLine(LIBRARY_LINES, 13, '      <div class="unit"><span class="k-chip">bare2</span></div>')
  );
  assert.deepEqual(selectEdit(LIBRARY_PATH, LIBRARY, bare), [
    { key: 'unit:0.2', signal: 'library', heading: '&lt;Chip&gt;' },
  ]);
});

test('a hunk across two units, or one removing a unit, stays at its entry', () => {
  const twoUnits = libraryWith(
    editLine(
      editLine(LIBRARY_LINES, 8, LIBRARY_LINES[8].replace('>A<', '>A2<')),
      11,
      '        <span class="k-chip">B2</span>'
    )
  );
  assert.deepEqual(selectEdit(LIBRARY_PATH, LIBRARY, twoUnits), [
    { key: 'entry:0', signal: 'library', heading: '&lt;Chip&gt;' },
  ]);
  const removed = libraryWith(LIBRARY_LINES.toSpliced(18, 1));
  assert.deepEqual(keysOf(selectEdit(LIBRARY_PATH, LIBRARY, removed)), ['entry:1']);
});

test('a hunk whose context recurs in two entries stays at entry level in both', () => {
  const entry = (heading, middle) => [
    '  <div class="spec">',
    `    <div class="spec-head"><h4>${heading}</h4></div>`,
    '    <div class="unit">',
    '      <span class="cap">same</span>',
    '      <span class="k-x">one</span>',
    `      <span class="k-x">${middle}</span>`,
    '      <span class="k-x">three</span>',
    '    </div>',
    '  </div>',
  ];
  const page = (first) =>
    libraryWith([
      '<section id="a">',
      ...entry('First', first),
      ...entry('Second', 'two'),
      '</section>',
    ]);
  assert.deepEqual(keysOf(selectEdit(LIBRARY_PATH, page('TWO'), page('two'))), [
    'entry:0',
    'entry:1',
  ]);
});

test('a hunk the unit pass cannot wholly place stays at its entry, though it names one unit', () => {
  const status = editLine(LIBRARY_LINES, 6, LIBRARY_LINES[6].replace('>shipped<', '>target<'));
  const after = libraryWith(editLine(status, 8, LIBRARY_LINES[8].replace('>A<', '>A2<')));
  assert.deepEqual(selectEdit(LIBRARY_PATH, LIBRARY, after), [
    { key: 'entry:0', signal: 'library', heading: '&lt;Chip&gt;' },
  ]);
});

test('a section-head edit sits outside every entry, so it widens and is named', () => {
  const after = libraryWith(
    editLine(LIBRARY_LINES, 4, LIBRARY_LINES[4].replace('Marks', 'Marks 2'))
  );
  assert.deepEqual(keysOf(selectEdit(LIBRARY_PATH, LIBRARY, after)), [
    'coverage',
    `unlocated:${LIBRARY_PATH}:1`,
  ]);
});

test('a library hunk outside every entry, or a missing library, widens by coverage', () => {
  const styled = libraryWith(
    editLine(LIBRARY_LINES, 1, '<html><head><style>.unit{gap:6px}</style></head>')
  );
  assert.deepEqual(keysOf(selectEdit(LIBRARY_PATH, LIBRARY, styled)), [
    'coverage',
    `unlocated:${LIBRARY_PATH}:1`,
  ]);
  const missing = selectLibraryTargets([LIBRARY_PATH], {
    patches: { [LIBRARY_PATH]: unifiedPatch(LIBRARY, styled) },
    source: fakeSource({ [LIBRARY_PATH]: null }),
  });
  assert.deepEqual(keysOf(missing), ['coverage']);
});

test('a catalogue hunk spanning two rows selects both rows', () => {
  const after = json(
    MARK_ROWS.with(0, { ...MARK_ROWS[0], props: { tone: 'neutral' } }).with(1, {
      ...MARK_ROWS[1],
      draws: '.k-chip-x',
    })
  );
  assert.deepEqual(selectEdit(MARKS, json(MARK_ROWS), after), [
    { key: 'row:marks/0', signal: 'catalogue' },
    { key: 'row:marks/1', signal: 'catalogue' },
  ]);
});

test('a deleted row still selects the unit it stood in, by its address', () => {
  const middle = keysOf(selectEdit(MARKS, json(MARK_ROWS), json(MARK_ROWS.toSpliced(1, 1))));
  assert.ok(middle.includes(addressKey('<Chip>', 'removable')), middle.join(', '));
  assert.ok(!middle.includes('coverage'), 'a located deletion does not widen');
  const last = keysOf(selectEdit(MARKS, json(MARK_ROWS), json(MARK_ROWS.slice(0, 2))));
  assert.ok(last.includes(addressKey('<Button>', 'primary')), last.join(', '));
  assert.ok(!last.includes('coverage'), 'removing the last row lands on the row before it');
  assert.deepEqual(parseTargetKey(addressKey('<Button>', 'primary')), {
    kind: 'addr',
    spec: '<Button>',
    cap: 'primary',
  });
});

test('the last row owns the closing bracket, so a removal run ending at it lands on a row', () => {
  const after = json(MARK_ROWS.slice(0, 2));
  const at = after.split('\n').indexOf('    "fixture": "ChipRemovable"') + 1;
  const removed = json([MARK_ROWS[2]]).split('\n').slice(1, -2);
  // Hand-written, as a diff algorithm that keeps the bracket apart from the rewritten close may.
  const patch = [
    `@@ -${at},${removed.length + 3} +${at},3 @@`,
    '     "fixture": "ChipRemovable"',
    '-  },',
    '+  }',
    ...removed.map((line) => `-${line}`),
    ' ]',
    '',
  ].join('\n');
  const records = selectLibraryTargets([MARKS], {
    patches: { [MARKS]: patch },
    source: fakeSource({ [MARKS]: after }),
  });
  assert.deepEqual(keysOf(records), ['row:marks/1', addressKey('<Button>', 'primary')]);
});

test('a catalogue whose rows and row regions disagree in count widens and is named', () => {
  // The first row on one line: counted by its region, the third row would read as the second.
  const mixed = (rows) =>
    ['[', `  ${JSON.stringify(rows[0])},`, ...json(rows.slice(1)).split('\n').slice(1)].join('\n');
  const after = mixed(MARK_ROWS.with(2, { ...MARK_ROWS[2], draws: '.k-btn-x' }));
  assert.deepEqual(keysOf(selectEdit(MARKS, mixed(MARK_ROWS), after)), [
    'coverage',
    `unlocated:${MARKS}:1`,
  ]);
});

test('an inserted row selects the row it adds', () => {
  const inserted = { spec: '<Chip>', cap: 'filter', draws: '.k-chip', path: CHIP, props: {} };
  const keys = keysOf(
    selectEdit(MARKS, json(MARK_ROWS), json(MARK_ROWS.toSpliced(1, 0, inserted)))
  );
  assert.ok(keys.includes('row:marks/1'), keys.join(', '));
  assert.ok(
    keys.every((key) => key.startsWith('row:marks/')),
    keys.join(', ')
  );
});

test('an unreadable, renamed, removed or missing catalogue file widens by coverage', () => {
  const renamed = selectLibraryTargets([MARKS], { patches: { [MARKS]: '' }, source: fakeSource() });
  assert.deepEqual(keysOf(renamed), ['coverage'], 'a rename carries an empty patch');
  const malformed = selectEdit(MARKS, json(MARK_ROWS), json(MARK_ROWS).replace(/\]\n$/, ''));
  assert.deepEqual(keysOf(malformed), ['coverage']);
  const gone = `${CATALOGUE_DIRECTORY}/gone.json`;
  const missing = selectLibraryTargets([gone], {
    patches: { [gone]: unifiedPatch(json(CONTROL_ROWS), '') },
    source: fakeSource(),
  });
  assert.ok(keysOf(missing).includes('coverage'), keysOf(missing).join(', '));
});

test('a fixture selects the rows it stands up; a renamed one by its new name, a removed one none', () => {
  const select = (file) => selectLibraryTargets([file], { source: fakeSource() });
  assert.deepEqual(select(fixturePath('ChipRemovable')), [
    { key: 'row:marks/1', signal: 'fixture' },
  ]);
  assert.deepEqual(keysOf(select(fixturePath('ToggleOn'))), ['row:controls/1']);
  assert.deepEqual(select(fixturePath('RemovedFixture')), []);
});

test('an unreadable catalogue widens a fixture or manifest change by coverage', () => {
  const unreadable = fakeSource({ [MARKS]: null });
  assert.deepEqual(
    keysOf(selectLibraryTargets([fixturePath('ToggleOn')], { source: unreadable })),
    ['row:controls/1', 'coverage']
  );
  const edited = JSON.parse(MANIFEST);
  edited.designSystemPrimitives[0].why = 'Chips, re-measured.';
  const manifest = selectLibraryTargets([MANIFEST_PATH], {
    patches: { [MANIFEST_PATH]: unifiedPatch(MANIFEST, json(edited)) },
    source: fakeSource({ [MARKS]: null, [MANIFEST_PATH]: json(edited) }),
  });
  assert.deepEqual(keysOf(manifest), ['coverage']);
});

test('a manifest hunk confined to one entry selects only its path, never a neighbour', () => {
  const manifest = JSON.parse(MANIFEST);
  const edited = structuredClone(manifest);
  edited.designSystemPrimitives[1].why = 'Buttons, re-measured.';
  edited.designSystemPrimitives[1].status = 'shipped';
  assert.deepEqual(selectEdit(MANIFEST_PATH, MANIFEST, json(edited)), [
    { key: 'row:marks/2', signal: 'manifest' },
  ]);
});

test('a component path selects its rows, and machinery selects coverage', () => {
  assert.deepEqual(keysOf(selectLibraryTargets([CHIP], { source: fakeSource() })), [
    'row:marks/0',
    'row:marks/1',
  ]);
  for (const file of [
    'tests/view-lab/primitives/mount.js',
    'tests/view-lab/primitives.html',
    'tests/view-lab/vite.config.js',
    'scripts/primitive-lab-capture.mjs',
    'scripts/lib/primitiveLabSelection.js',
    'tests/helpers/designLibrary.js',
  ]) {
    assert.deepEqual(
      keysOf(selectLibraryTargets([file], { source: fakeSource() })),
      ['coverage'],
      file
    );
  }
  for (const file of ['tests/view-lab/mount.js', 'src/ui/svelte/views/Unrelated.svelte']) {
    assert.deepEqual(selectLibraryTargets([file], { source: fakeSource() }), [], file);
  }
});

test('a key keeps its highest signal, and the order is by signal whatever order files arrive in', () => {
  const removable = editLine(LIBRARY_LINES, 11, '        <span class="k-chip">B2</span>');
  const markEdit = json(MARK_ROWS.with(2, { ...MARK_ROWS[2], draws: '.k-btn-x' }));
  const files = [
    CHIP,
    fixturePath('ChipRemovable'),
    MARKS,
    LIBRARY_PATH,
    'tests/view-lab/primitives/mount.js',
  ];
  const options = {
    patches: {
      [MARKS]: unifiedPatch(json(MARK_ROWS), markEdit),
      [LIBRARY_PATH]: unifiedPatch(LIBRARY, libraryWith(removable)),
    },
    source: fakeSource({ [MARKS]: markEdit, [LIBRARY_PATH]: libraryWith(removable) }),
  };
  const expected = [
    { key: 'unit:0.1', signal: 'library', heading: '&lt;Chip&gt;', caption: 'removable' },
    { key: 'row:marks/2', signal: 'catalogue' },
    { key: 'row:marks/1', signal: 'fixture' },
    { key: 'row:marks/0', signal: 'component' },
    { key: 'coverage', signal: 'coverage' },
  ];
  assert.deepEqual(selectLibraryTargets(files, options), expected);
  assert.deepEqual(selectLibraryTargets(files.toReversed(), options), expected);
});

test('the cap deduplicates by element before it counts, and pins the overflow order', () => {
  const resolved = Array.from({ length: 26 }, (_, index) => ({
    key: `row:marks/${index}`,
    element: { entry: index, unit: 0 },
  }));
  resolved.push({ key: 'entry:0-twin', element: { entry: 0, unit: 0 } });
  const { units, overflow } = capDistinctUnits(resolved, 24);
  assert.equal(units.length, 24);
  assert.deepEqual(units[0].keys, ['row:marks/0', 'entry:0-twin'], 'a twin joins its element');
  assert.deepEqual(
    overflow.map((unit) => unit.keys[0]),
    ['row:marks/24', 'row:marks/25']
  );
});

test('recurring context from the real catalogue is located at every anchor without widening', () => {
  const real = readFileSync(path.join(ROOT, MARKS), 'utf8');
  const lines = real.split('\n');
  const window = (index) => lines.slice(index - 3, index + 4).join('\n');
  const recurring = lines.findIndex(
    (line, index) => index > 3 && /^ {4}"/.test(line) && real.split(window(index)).length > 2
  );
  assert.ok(recurring > 0, 'the real catalogue has a recurring seven-line window');
  const before = lines.with(recurring, `${lines[recurring]} `).join('\n');
  const records = selectLibraryTargets([MARKS], {
    patches: { [MARKS]: unifiedPatch(before, real) },
  });
  const keys = keysOf(records);
  assert.ok(keys.filter((key) => key.startsWith('row:marks/')).length >= 2, keys.join(', '));
  assert.ok(!keys.includes('coverage'), keys.join(', '));
});

test('drift: every real catalogue file has one row region per row', () => {
  for (const file of catalogueFiles(ROOT)) {
    const text = readFileSync(path.join(ROOT, CATALOGUE_DIRECTORY, file), 'utf8');
    assert.equal(
      catalogueRowRegions(text.split('\n')).length,
      JSON.parse(text).length,
      `${file}: a row is not written from its own "  {" line to its own "  }" line`
    );
  }
});

test('drift: the scanner reads the real library as happy-dom does', () => {
  const html = readFileSync(path.join(ROOT, LIBRARY_PATH), 'utf8');
  const { entries, units } = scanLibraryRegions(html);
  const window = new Window();
  try {
    const { document } = window;
    document.write(html);
    const normalize = (text) => (text ?? '').replaceAll(/\s+/g, ' ').trim();
    const decode = (raw) => {
      const template = document.createElement('template');
      template.innerHTML = raw;
      return normalize(template.content.textContent);
    };
    const specs = [...document.querySelectorAll('div.spec')];
    assert.ok(specs.length >= 50, `the library has ${specs.length} entries`);
    assert.deepEqual(
      entries.map((entry) => decode(entry.heading)),
      specs.map((spec) => normalize(spec.querySelector(':scope > .spec-head > h4')?.textContent))
    );
    for (const [index, spec] of specs.entries()) {
      const drawn = [...spec.querySelectorAll('.unit')].map((unit) => {
        const caption = unit.querySelector(':scope > .cap');
        return caption ? normalize(caption.textContent) : null;
      });
      const scanned = units
        .filter((unit) => unit.entry === index)
        .map((unit) => (unit.caption === null ? null : decode(unit.caption)));
      assert.deepEqual(scanned, drawn, `entry ${index}: ${entries[index].heading}`);
    }
  } finally {
    window.close();
  }
});

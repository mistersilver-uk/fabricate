/**
 * The Primitive Lab's liveness (issue 1487): `inject.js` `resolveSlots` stands each name up by its
 * per-name status, so every name the library declares is exactly one of replace, beside or drawing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

import { catalogueEntries } from '../scripts/lib/primitiveLabSmoke.js';

import { parseDesignLibrary, readDesignLibrary } from './helpers/designLibrary.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import {
  BESIDE,
  LIVE_LABEL_CLASS,
  LIVE_LABEL_TEXT,
  REPLACE,
  livenessFor,
  placeSpecimen,
} from './view-lab/primitives/liveness.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The spec's rule, restated as the oracle: the drawing is the authority until a name ships. */
const EXPECTED_MODE = Object.freeze({ shipped: 'replace', target: 'beside', divergent: 'beside' });

const DRAWING = 'drawing';

const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);
const MANIFEST_ROWS = [...MANIFEST.designSystemPrimitives, ...MANIFEST.notAPrimitive];

/** Resolve rows against a library document, closing its window afterwards. */
function resolveIn(html, rows, manifestRows) {
  const window = new Window();
  window.document.write(html);
  const resolved = resolveSlots(window.document.body, rows, manifestRows);
  const slots = resolved.slots.map(({ name, mode, row }) => ({ name, mode, path: row.path }));
  window.close();
  return { slots, problems: resolved.problems };
}

/** Each name's modes across its slots; a name with no slot keeps its drawing. */
function modesByName(names, slots) {
  return new Map(
    names.map((name) => {
      const modes = [...new Set(slots.filter((slot) => slot.name === name).map((s) => s.mode))];
      return [name, modes.length === 0 ? [DRAWING] : modes];
    })
  );
}

test('every name the library declares is exactly one of replace, beside or drawing', () => {
  const library = parseDesignLibrary(readDesignLibrary());
  const statusOf = new Map(library.blocks.flatMap((block) => Object.entries(block.perNameStatus)));
  const rows = catalogueEntries(REPO_ROOT).map((entry) => entry.row);
  const { slots, problems } = resolveIn(readDesignLibrary(), rows, MANIFEST_ROWS);
  assert.deepEqual(problems, []);
  assert.equal(slots.length, rows.length, 'a row was placed without a liveness decision');

  const recorded = new Set(MANIFEST_ROWS.map((row) => row.library));
  const modes = modesByName([...statusOf.keys()], slots);
  assert.ok(modes.size > 0, 'the parser derived no per-name status, so this rule has no domain');
  for (const [name, [mode, ...others]] of modes) {
    assert.deepEqual(
      others,
      [],
      `<${name}> is drawn live in more than one way: ${mode}, ${others}`
    );
    if (!recorded.has(`<${name}>`)) {
      assert.equal(mode, DRAWING, `<${name}> has no manifest row, so it keeps its drawing alone`);
    } else if (mode !== DRAWING) {
      assert.equal(mode, EXPECTED_MODE[statusOf.get(name)], `<${name}> is ${statusOf.get(name)}`);
    }
  }
  for (const slot of slots) {
    assert.ok(
      statusOf.has(slot.name),
      `${slot.path} stands up <${slot.name}>, which no entry names`
    );
  }
  const used = new Set(slots.map((slot) => slot.mode));
  assert.ok(
    used.has('replace') && used.has('beside'),
    `only ${[...used]} occur, so one is unproven`
  );
});

/** `<Planned>` and `<Kept>` share a heading; the prose entry draws `<Done>` away from its own. */
const FIXTURE = [
  '<!doctype html><html><body>',
  '<div class="spec" data-status="shipped" data-status-Done="shipped">',
  '<div class="spec-head"><h4>&lt;Done&gt;</h4></div><b class="d"></b></div>',
  '<div class="spec" data-status="divergent" data-status-Planned="target" ',
  'data-status-Kept="divergent"><div class="spec-head"><h4>&lt;Planned&gt; &lt;Kept&gt;</h4></div>',
  '<b class="p"></b><b class="k"></b></div>',
  '<div class="spec" data-status="target" data-status-Unbuilt="target">',
  '<div class="spec-head"><h4>&lt;Unbuilt&gt;</h4></div><b class="u"></b></div>',
  '<div class="spec" data-status="prose"><div class="spec-head"><h4>The vocabulary</h4></div>',
  '<b class="v"></b><b class="x"></b><b class="g"></b></div>',
  '</body></html>',
].join('');

const FIXTURE_MANIFEST = Object.freeze([
  { path: 'src/Done.svelte', library: '<Done>' },
  { path: 'src/Planned.svelte', library: '<Planned>' },
  { path: 'src/Kept.svelte', library: '<Kept>' },
  { path: 'src/Ghost.svelte', library: '<Ghost>' },
  { path: 'src/Plain.svelte', library: null },
]);

/** A catalogue row drawing `draws` under `spec`. */
function row(spec, draws, name) {
  return { spec, draws, path: `src/${name}.svelte` };
}

test('a fixture stands each status up as the spec says, by literal', () => {
  const { slots, problems } = resolveIn(
    FIXTURE,
    [
      row('<Done>', '.d', 'Done'),
      row('<Planned> <Kept>', '.p', 'Planned'),
      row('<Planned> <Kept>', '.k', 'Kept'),
      row('The vocabulary', '.v', 'Done'),
    ],
    FIXTURE_MANIFEST
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(
    [...modesByName(['Done', 'Planned', 'Kept', 'Unbuilt'], slots)],
    [
      ['Done', ['replace']],
      ['Planned', ['beside']],
      ['Kept', ['beside']],
      ['Unbuilt', [DRAWING]],
    ]
  );
  assert.equal(slots.length, 4, 'the prose entry stands its name up with that name’s own status');
});

test('a row whose liveness no status decides is reported, never placed', () => {
  const { slots, problems } = resolveIn(
    FIXTURE,
    [row('The vocabulary', '.x', 'Plain'), row('The vocabulary', '.g', 'Ghost')],
    FIXTURE_MANIFEST
  );
  assert.deepEqual(slots, []);
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.match(problems[0], /src\/Plain\.svelte: its component ships no library name/);
  assert.match(problems[1], /<Ghost> declares status null/);
});

/** Two names sharing one component path, one drawn under a heading that names only the other. */
const SHARED_MANIFEST = Object.freeze([
  { path: 'src/Shared.svelte', library: '<Done>' },
  { path: 'src/Shared.svelte', library: '<Planned>' },
]);

test('a path shipping several names takes the one its own entry declares', () => {
  const { slots, problems } = resolveIn(
    FIXTURE,
    [row('<Planned> <Kept>', '.p', 'Shared'), row('<Done>', '.d', 'Shared')],
    SHARED_MANIFEST
  );
  assert.deepEqual(problems, []);
  // <Planned> is the second name, and the only one this block declares.
  assert.deepEqual(slots, [
    { name: 'Planned', mode: BESIDE, path: 'src/Shared.svelte' },
    { name: 'Done', mode: REPLACE, path: 'src/Shared.svelte' },
  ]);
});

test('a path shipping several names that its entry names none of is reported, not guessed', () => {
  const { slots, problems } = resolveIn(
    FIXTURE,
    [row('<Unbuilt>', '.u', 'Shared')],
    SHARED_MANIFEST
  );
  assert.deepEqual(slots, []);
  assert.equal(problems.length, 1, problems.join(', '));
  assert.match(problems[0], /ships <Done> and <Planned>/);
});

test('a name never takes a mode from an inherited object property', () => {
  assert.equal(livenessFor('toString'), null);
  assert.equal(livenessFor('constructor'), null);
  assert.equal(livenessFor(null), null);
});

/** The names that two blocks declare different statuses for. */
function namesWithConflictingStatus(blocks) {
  const seen = new Map();
  const conflicts = new Set();
  for (const block of blocks) {
    for (const [name, status] of Object.entries(block.perNameStatus)) {
      if (seen.has(name) && seen.get(name) !== status) conflicts.add(name);
      seen.set(name, status);
    }
  }
  return [...conflicts];
}

test('each name has one status across every block, so first-declared cannot differ from last', () => {
  const { blocks } = parseDesignLibrary(readDesignLibrary());
  assert.ok(blocks.length > 20, 'the library parsed to too few blocks for this rule');
  assert.deepEqual(namesWithConflictingStatus(blocks), []);
  assert.deepEqual(
    namesWithConflictingStatus([
      { perNameStatus: { Planned: 'target' } },
      { perNameStatus: { Planned: 'shipped', Other: 'target' } },
    ]),
    ['Planned'],
    'the guard must see a name declared with two statuses'
  );
});

/** A slot over a drawing, in a happy-dom page; returns the page so the order can be read. */
function placed(mode) {
  const window = new Window();
  const { document } = window;
  document.write('<body><p id="before"></p><div id="drawing"></div><p id="after"></p></body>');
  const host = document.querySelector('#drawing');
  const iframe = document.createElement('iframe');
  placeSpecimen({ host, mode }, iframe, document);
  return { document, host, iframe };
}

test('a beside specimen keeps its drawing and follows it under a live label', () => {
  const { document, host, iframe } = placed(BESIDE);
  const [first, label, second] = [...document.body.children].slice(1, 4);
  assert.equal(first, host, 'the drawing must stay in place');
  assert.ok(document.body.contains(host));
  assert.equal(label.textContent, LIVE_LABEL_TEXT);
  assert.equal(label.className, LIVE_LABEL_CLASS);
  assert.equal(LIVE_LABEL_TEXT, 'live');
  assert.ok(!LIVE_LABEL_CLASS.includes('st-shipped'), 'a target entry must not read as shipped');
  assert.equal(second, iframe);
});

test('a replace specimen takes its drawing’s place and the drawing leaves', () => {
  const { document, host, iframe } = placed(REPLACE);
  assert.ok(!document.body.contains(host));
  assert.deepEqual(
    [...document.body.children].map((node) => node.id || node.localName),
    ['before', 'iframe', 'after']
  );
  assert.ok(document.body.contains(iframe));
});

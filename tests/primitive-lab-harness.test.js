/**
 * The Primitive Lab's browser-free harness (issue 1487): the Foundry globals one specimen realm
 * runs under, and the catalogue reader and mounted-set comparison `npm run lab:check` decides on.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CATALOGUE_DIRECTORY,
  CATALOGUE_README,
  catalogueEntries,
  catalogueFiles,
  cataloguePaths,
  describeMountFailure,
  emptyCatalogueMessage,
  expectedSpecimenCount,
} from '../scripts/lib/primitiveLabSmoke.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import CHROME_PROVENANCE from './view-lab/chrome-provenance.json' with { type: 'json' };
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import {
  MINIMAL_LAB_WORLD_FIELDS,
  createMinimalLabWorld,
} from './view-lab/foundry/minimalLabWorld.js';
import {
  LAB_RELEASE,
  installPrimitiveLabFoundry,
  parseLabRelease,
} from './view-lab/primitives/labFoundry.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const pattern = /requires a game\.i18n stub/;
  assert.throws(() => createMinimalLabWorld(), pattern);
  assert.throws(() => createMinimalLabWorld({ i18n: { localize: STUB_I18N.localize } }), pattern);
  assert.throws(() => createMinimalLabWorld({ i18n: { format: STUB_I18N.format } }), pattern);
  assert.throws(
    () => createMinimalLabWorld({ i18n: STUB_I18N, seed: NaN }),
    /requires a numeric seed/
  );
});

/**
 * Run `body` under installed globals, restoring them after.
 *
 * @param {() => {restore: () => void}} install Installs the globals.
 * @param {() => void} body The assertions.
 */
function withGlobals(install, body) {
  const shim = install();
  try {
    body();
  } finally {
    shim.restore();
  }
}

const installLab = () => installPrimitiveLabFoundry(STUB_I18N);
const installShared = () => installFoundryShim(createMinimalLabWorld({ i18n: STUB_I18N }));

test('the Primitive Lab declares the client release the harvested chrome is', () => {
  const [generation, build] = CHROME_PROVENANCE.foundryVersion.split('.').map(Number);
  assert.deepEqual(
    { ...LAB_RELEASE },
    { generation, build, version: CHROME_PROVENANCE.foundryVersion }
  );
  withGlobals(installLab, () => {
    assert.equal(globalThis.game.release, LAB_RELEASE);
    assert.equal(globalThis.game.version, CHROME_PROVENANCE.foundryVersion);
  });
});

test('the shared View Lab shim declares no release, so no View Lab frame changes icon path', () => {
  withGlobals(installShared, () => {
    assert.equal(globalThis.game.release, undefined);
    assert.equal(globalThis.game.version, undefined);
  });
});

test('the lab release parse fails closed on anything but a positive generation and a build', () => {
  assert.deepEqual(
    { ...parseLabRelease('13.351') },
    { generation: 13, build: 351, version: '13.351' }
  );
  for (const malformed of ['14.x', 'x.365', '0.365', '-1.365', '14', '14.365.1', '']) {
    assert.throws(
      () => parseLabRelease(malformed),
      /is not a <generation>\.<build> release/,
      JSON.stringify(malformed)
    );
  }
});

test('the Foundry shim answers getDragEventData on both TextEditor faces, {} on failure', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const drag = (text) => ({ dataTransfer: { getData: () => text } });
  withGlobals(installShared, () => {
    const editor = globalThis.foundry.applications.ux.TextEditor;
    for (const face of [editor, editor.implementation]) {
      assert.deepEqual(face.getDragEventData(drag('{"uuid":"Item.a"}')), { uuid: 'Item.a' });
      assert.deepEqual(face.getDragEventData(drag('not json')), {});
      assert.deepEqual(face.getDragEventData({}), {}, 'a non-DragEvent answers {}, as core does');
    }
  });
  assert.equal(warn.mock.callCount(), 2, 'core warns once per non-DragEvent');
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

test('the mounted-set comparison catches a count, an identity and a multiplicity disagreement', () => {
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
  assert.match(
    describeMountFailure({ expected, mounted: ['a.svelte', 'a.svelte', 'b.svelte'], reported: 2 }),
    /a\.svelte: catalogued 1, mounted 2/,
    'a path mounted more often than catalogued is a disagreement even when the count agrees'
  );
});

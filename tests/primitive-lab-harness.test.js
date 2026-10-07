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
  describeLiveLabelMismatch,
  describeMountFailure,
  describeSectionMismatch,
  describeUnstableSizes,
  emptyCatalogueMessage,
  expectedSpecimenCount,
  readLabExpectations,
} from '../scripts/lib/primitiveLabSmoke.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { readDesignLibrary } from './helpers/designLibrary.js';
import { readLibrarySections } from './helpers/designLibrarySections.js';
import CHROME_PROVENANCE from './view-lab/chrome-provenance.json' with { type: 'json' };
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import {
  MINIMAL_LAB_WORLD_FIELDS,
  createMinimalLabWorld,
} from './view-lab/foundry/minimalLabWorld.js';
import {
  MAX_APPLIED_RESIZES,
  createSizeGovernor,
  describeHost,
} from './view-lab/primitives/hostLayout.js';
import {
  LAB_RELEASE,
  installPrimitiveLabFoundry,
  parseLabRelease,
} from './view-lab/primitives/labFoundry.js';
import { readSlotInset } from './view-lab/primitives/slot.js';
import {
  SPECIMEN_SNIPPET_NAMES,
  readSpecimenSnippets,
} from './view-lab/primitives/specimenSnippets.js';
import { armReadyWatchdog } from './view-lab/primitives/specimenWatchdog.js';
import { worktreeWatchIgnores } from './view-lab/watchIgnore.js';

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

test('a row inset is a positive pixel count, and absent means none', () => {
  assert.equal(readSlotInset({}), 0);
  assert.equal(readSlotInset({ inset: 12 }), 12);
  for (const inset of [0, -4, '12', NaN, null]) {
    assert.throws(() => readSlotInset({ inset }), /positive number of CSS pixels/, String(inset));
  }
});

test('a row names only the snippets a specimen renders, each as a node array', () => {
  assert.ok(SPECIMEN_SNIPPET_NAMES.length > 0, 'a specimen renders no named snippet at all');
  assert.deepEqual(readSpecimenSnippets({}), {});
  const snippets = { body: ['Body text'], footer: [{ tag: 'button', text: 'Close' }] };
  assert.deepEqual(readSpecimenSnippets({ snippets }), snippets);
  assert.throws(() => readSpecimenSnippets({ snippets: { header: [] } }), /snippets\.header/);
  assert.throws(() => readSpecimenSnippets({ snippets: { body: 'text' } }), /must be a node array/);
});

test('a row names only the snippets a specimen renders, and never an array', () => {
  assert.throws(() => readSpecimenSnippets({ snippets: [] }), /must be an object/);
  assert.throws(() => readSpecimenSnippets({ snippets: ['body'] }), /must be an object/);
});

test('LiveSpecimen.svelte declares one snippet per name a row may supply, and no other', () => {
  const source = readFileSync(
    path.join(REPO_ROOT, 'tests/view-lab/primitives/LiveSpecimen.svelte'),
    'utf8'
  );
  const declared = [...source.matchAll(/\{#snippet (\w+)\(/g)].map((match) => match[1]);
  for (const name of SPECIMEN_SNIPPET_NAMES) {
    assert.ok(
      declared.includes(name),
      `SPECIMEN_SNIPPET_NAMES lists \`${name}\` and LiveSpecimen.svelte has no \`{#snippet ${name}(\``
    );
  }
  assert.deepEqual(
    declared.filter((name) => name !== 'nodes').toSorted(byCodePoint),
    [...SPECIMEN_SNIPPET_NAMES].sort(byCodePoint),
    'LiveSpecimen.svelte declares a snippet SPECIMEN_SNIPPET_NAMES does not list'
  );
});

test('an inset beside a boxed slot is refused, not silently dropped', () => {
  assert.throws(
    () => readSlotInset({ inset: 12, slot: { width: 300, height: 200 } }),
    /does nothing in a boxed `slot`/
  );
  assert.equal(readSlotInset({ inset: 12 }), 12);
});

const HOST = { display: 'block', maxWidth: 'none', drawnWidth: 300, availableWidth: 300 };

test('a block host presizes its specimen frame to the width it drew, before the first report', () => {
  assert.equal(describeHost(HOST).presize, '300px');
  assert.equal(describeHost({ ...HOST, drawnWidth: 180.2 }).presize, '181px');
  assert.equal(describeHost({ ...HOST, display: 'inline-block' }).presize, '');
  assert.equal(describeHost({ ...HOST, display: 'inline-block' }).fill, false);
});

test('a stretched host leaves the width to the page and a sized host keeps its own', () => {
  assert.equal(describeHost(HOST).inlineSize, '');
  assert.equal(describeHost({ ...HOST, drawnWidth: 180 }).inlineSize, '180px');
  assert.equal(describeHost({ ...HOST, maxWidth: '300px' }).maxInlineSize, '300px');
});

test('a host that drew no width (display: contents) is left to the page, never collapsed to 0px', () => {
  const host = describeHost({ ...HOST, display: 'contents', drawnWidth: 0 });
  assert.equal(host.inlineSize, '');
  assert.equal(host.presize, '');
  assert.equal(host.fill, true);
});

test('an identical report is a no-op and a changed one applies', () => {
  const admit = createSizeGovernor();
  assert.equal(admit({ width: 300, height: 80, fill: true }, 'mounted'), 'apply');
  assert.equal(admit({ width: 300, height: 80, fill: true }, 'resize'), 'same');
  assert.equal(admit({ width: 300, height: 90, fill: true }, 'resize'), 'apply');
  assert.equal(admit({ width: 300, height: 90, fill: false }, 'resize'), 'apply');
});

test('a height that follows its own iframe stops at the cap instead of growing', () => {
  const admit = createSizeGovernor();
  // A `min-height: 100vh` specimen: its content is as tall as the iframe viewport plus a border.
  let iframeHeight = 10;
  let applied = 0;
  let decision = admit({ width: 300, height: iframeHeight }, 'mounted');
  for (let report = 0; report < 1000 && decision !== 'runaway'; report += 1) {
    iframeHeight += 2;
    decision = admit({ width: 300, height: iframeHeight }, 'resize');
    if (decision === 'apply') applied += 1;
  }
  assert.equal(decision, 'runaway');
  assert.equal(applied, MAX_APPLIED_RESIZES);
  assert.ok(iframeHeight < 200, `the height ran to ${iframeHeight}px before stopping`);
});

test('iframes that moved after ready are reported by name, and steady ones are not', () => {
  const steady = [{ specimen: 'a.svelte', width: 300, height: 40 }];
  assert.equal(describeUnstableSizes(steady, [{ ...steady[0] }]), null);
  assert.match(
    describeUnstableSizes(steady, [{ specimen: 'a.svelte', width: 300, height: 52 }]),
    /a\.svelte: 300x40 at ready, 300x52 after/
  );
  assert.match(
    describeUnstableSizes(steady, [{ specimen: 'a.svelte', width: 310, height: 40 }]),
    /a\.svelte: 300x40 at ready, 310x40 after/
  );
  assert.match(describeUnstableSizes(steady, []), /a\.svelte: 300x40 at ready, gone after/);
});

/** Two library sections as `readLabExpectations` reads them, the second with no lede. */
const SECTIONS = Object.freeze([
  { id: 'controls', number: '06', title: 'Controls', ledes: ['Every API below.'] },
  { id: 'pickers', number: '07', title: 'Pickers & bars', ledes: [] },
]);

/** The same sections as the page draws them, every part with a box. */
function drawnSections() {
  return SECTIONS.map((section) => ({
    ...section,
    title: ` ${section.title}\n`,
    ledes: section.ledes.map((lede) => lede.replace(' ', '\n  ')),
    unseen: [],
  }));
}

test('a page that drew every section, number, title and lede passes, whitespace aside', () => {
  assert.equal(describeSectionMismatch(SECTIONS, drawnSections()), null);
});

test('a missing section, a wrong title, a lost lede and a part with no box are each reported', () => {
  const drawn = drawnSections();
  assert.match(
    describeSectionMismatch(SECTIONS, drawn.slice(0, 1)),
    /drew sections controls; the library has controls, pickers/
  );
  assert.match(
    describeSectionMismatch(SECTIONS, [{ ...drawn[0], title: 'Inputs' }, drawn[1]]),
    /#controls drew title "Inputs", not Controls/
  );
  assert.match(
    describeSectionMismatch(SECTIONS, [{ ...drawn[0], ledes: [] }, drawn[1]]),
    /#controls drew 0 lede\(s\); the library has 1/
  );
  assert.match(
    describeSectionMismatch(SECTIONS, [{ ...drawn[0], unseen: ['number', 'lede 1'] }, drawn[1]]),
    /#controls drew no box for number, lede 1/
  );
  assert.match(
    describeSectionMismatch([{ ...SECTIONS[0], number: null }], [{ ...drawn[0], number: null }]),
    /#controls has no number in the library/
  );
  assert.match(describeSectionMismatch([], []), /yielded no `section\[id\]`/);
});

test('every beside specimen carries one live label, directly before it', () => {
  assert.equal(describeLiveLabelMismatch({ expected: 2, labels: 2, unpaired: [] }), null);
  assert.match(
    describeLiveLabelMismatch({ expected: 2, labels: 1, unpaired: [] }),
    /2 specimen\(s\) stand beside their drawing and the page carries 1/
  );
  assert.match(
    describeLiveLabelMismatch({ expected: 1, labels: 1, unpaired: ['<Stepper>'] }),
    /not directly before its specimen in <Stepper>/
  );
});

test('lab:check expects every library section and every catalogued beside specimen', () => {
  const { sections, beside } = readLabExpectations(REPO_ROOT);
  assert.deepEqual(sections, readLibrarySections(readDesignLibrary()).sections);
  assert.ok(sections.length > 10, `${sections.length} sections, so the reader is not reading`);
  assert.ok(
    sections.some((section) => section.ledes.length > 0),
    'no section carries a lede, so the lede comparison has no domain'
  );
  assert.ok(
    beside > 0 && beside < expectedSpecimenCount(REPO_ROOT),
    `${beside} beside specimens, so the liveness decision is not deciding`
  );
});

test('the lab watcher ignores the worktrees of the served root and never the served tree itself', () => {
  const ignored = (root, file) =>
    worktreeWatchIgnores(root).some((glob) => file.startsWith(glob.replace(/\*\*$/, '')));
  const primary = path.resolve('/work/fabricate');
  const lane = path.join(primary, '.worktrees', '1487', 'lane');
  assert.ok(ignored(primary, path.join(lane, 'src', 'a.svelte').replaceAll(path.sep, '/')));
  assert.ok(!ignored(primary, path.join(primary, 'src', 'a.svelte').replaceAll(path.sep, '/')));
  // Served FROM a worktree: its own files sit under `.worktrees/` of the primary checkout.
  assert.ok(!ignored(lane, path.join(lane, 'src', 'a.svelte').replaceAll(path.sep, '/')));
  for (const glob of worktreeWatchIgnores(lane))
    assert.ok(!glob.includes(String.fromCodePoint(92)));
});

test('a specimen document that never announces ready is reported once its load has passed', () => {
  const calls = [];
  const timers = {
    setTimeout: (fn, ms) => {
      calls.push({ fn, ms });
      return calls.length;
    },
    clearTimeout: (handle) => {
      calls.push({ cleared: handle });
    },
  };
  const frame = new EventTarget();
  let silent = 0;
  armReadyWatchdog(frame, () => (silent += 1), timers, 50);
  assert.equal(calls.length, 0, 'the clock must not start before the document has loaded');
  frame.dispatchEvent(new Event('load'));
  assert.equal(calls[0].ms, 50);
  calls[0].fn();
  assert.equal(silent, 1);

  const answering = new EventTarget();
  const cancel = armReadyWatchdog(answering, () => (silent += 1), timers, 50);
  answering.dispatchEvent(new Event('load'));
  cancel();
  assert.ok(
    calls.some((call) => call.cleared === 2),
    'READY must cancel the pending watchdog'
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CORE_TOUR_IDS,
  TOUR_PROGRESS_STORAGE_KEY,
  SUPPRESSED_STEP_INDEX,
  withSuppressedTours,
  seedTourProgress,
} from '../scripts/lib/foundryTourSuppression.js';

const HARNESS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'foundry-test-run.mjs'
);

/** Minimal stand-in for `window.localStorage`. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    read: (k) => map.get(k),
  };
}

test('the storage key is the dotted setting id verbatim', () => {
  // `core.tourProgress` is registered {scope: "client"}, and ClientSettings#setClient writes
  // client-scope settings to localStorage under the setting id itself. A namespaced or
  // prefixed key would write somewhere Foundry never reads, and suppress nothing.
  assert.equal(TOUR_PROGRESS_STORAGE_KEY, 'core.tourProgress');
});

test('the suppressed step index is not -1 (the UNSTARTED sentinel)', () => {
  // Tour#status reports UNSTARTED for -1, and #showNewWorldTour() only starts an UNSTARTED
  // tour. Any other value suppresses it; -1 would suppress nothing.
  assert.notEqual(SUPPRESSED_STEP_INDEX, -1);
  assert.equal(typeof SUPPRESSED_STEP_INDEX, 'number');
});

test('core.welcome is seeded — it is the only tour that auto-starts unattended', () => {
  assert.ok(CORE_TOUR_IDS.includes('welcome'));
});

test('withSuppressedTours seeds every core tour from an empty value', () => {
  const result = withSuppressedTours(undefined);
  for (const id of CORE_TOUR_IDS) {
    assert.equal(result.core[id], SUPPRESSED_STEP_INDEX, `${id} must be seeded`);
  }
});

test('withSuppressedTours never lowers progress Foundry already recorded', () => {
  const result = withSuppressedTours({ core: { welcome: 3 } });
  assert.equal(result.core.welcome, 3, 'a real in-progress index must survive');
  assert.equal(result.core.sidebar, SUPPRESSED_STEP_INDEX, 'unseeded tours still get seeded');
});

test('withSuppressedTours preserves unrelated namespaces', () => {
  const result = withSuppressedTours({ dnd5e: { someTour: 2 }, core: { welcome: 1 } });
  assert.deepEqual(result.dnd5e, { someTour: 2 });
  assert.equal(result.core.welcome, 1);
});

test('withSuppressedTours treats a malformed value as absent rather than throwing', () => {
  for (const bad of ['nonsense', 42, null, [], { core: 'not-an-object' }, { core: [] }]) {
    const result = withSuppressedTours(bad);
    assert.equal(result.core.welcome, SUPPRESSED_STEP_INDEX, `malformed input ${JSON.stringify(bad)}`);
  }
});

test('seedTourProgress writes JSON.stringify output under the key', () => {
  // ClientSettings#cleanJSON is plain JSON.stringify for an Object-typed setting, so the
  // stored value must be a JSON string — not an object, and not double-encoded.
  const storage = fakeStorage();
  seedTourProgress(storage);
  const raw = storage.read(TOUR_PROGRESS_STORAGE_KEY);
  assert.equal(typeof raw, 'string');
  assert.equal(JSON.parse(raw).core.welcome, SUPPRESSED_STEP_INDEX);
});

test('seedTourProgress recovers from an unparseable stored value', () => {
  const storage = fakeStorage({ [TOUR_PROGRESS_STORAGE_KEY]: '{not json' });
  seedTourProgress(storage);
  assert.equal(JSON.parse(storage.read(TOUR_PROGRESS_STORAGE_KEY)).core.welcome, SUPPRESSED_STEP_INDEX);
});

test('seedTourProgress is idempotent', () => {
  const storage = fakeStorage();
  seedTourProgress(storage);
  const first = storage.read(TOUR_PROGRESS_STORAGE_KEY);
  seedTourProgress(storage);
  assert.equal(storage.read(TOUR_PROGRESS_STORAGE_KEY), first);
});

test('the harness seeds tours on the CONTEXT, before the first page exists', async () => {
  // Ordering is the whole fix. `addInitScript` on the context re-runs on every navigation,
  // so it survives the module-activation page.reload(); registering it after newPage() (or on
  // the page) would miss the first load, which is exactly when nue.initialize() runs.
  const harness = await readFile(HARNESS_PATH, 'utf8');
  const suppressAt = harness.indexOf('await suppressFoundryTours(context)');
  const newPageAt = harness.indexOf('const page = await context.newPage()');
  assert.ok(suppressAt > 0, 'the harness must call suppressFoundryTours');
  assert.ok(newPageAt > 0, 'the harness must create its page from the context');
  assert.ok(suppressAt < newPageAt, 'tours must be suppressed BEFORE the first page is created');
  assert.ok(
    harness.includes('context.addInitScript'),
    'suppression must use addInitScript so it survives page reloads'
  );
});

test('the inlined page copy stays consistent with the tested module', () => {
  // `addInitScript` serializes its callback into the page, where this module's imports do not
  // exist — so the merge logic is necessarily duplicated there. This pins the copy against the
  // module's constants: it cannot silently start writing a different key or a -1 index.
  const harnessPromise = readFile(HARNESS_PATH, 'utf8');
  return harnessPromise.then((harness) => {
    const call = harness.slice(harness.indexOf('async function suppressFoundryTours'));
    const body = call.slice(0, call.indexOf('\n}\n'));
    assert.ok(
      body.includes('key: TOUR_PROGRESS_STORAGE_KEY'),
      'the init script must take its key from the module, not a literal'
    );
    assert.ok(
      body.includes('stepIndex: SUPPRESSED_STEP_INDEX'),
      'the init script must take its step index from the module, not a literal'
    );
    assert.ok(
      body.includes('CORE_TOUR_IDS'),
      'the init script must take its tour ids from the module, not a literal'
    );
    assert.ok(
      body.includes("typeof core[id] !== 'number'"),
      'the init script must merge without lowering recorded progress, matching withSuppressedTours'
    );
  });
});

test('overlay detection is diagnostic only — it can never fail a healthy run', async () => {
  // Issue #996: the first attempt asserted "is the Items tab selected" with a selector that
  // does not match on Foundry 14, and failed a run whose sidebar was open, populated and
  // healthy. The craft button is the readiness signal; an overlay probe may only ENRICH the
  // resulting error. Pin both halves of that contract.
  const harness = await readFile(HARNESS_PATH, 'utf8');

  assert.ok(
    !harness.includes('Items sidebar tab did not activate after clicking it'),
    'the retired tab-activation assertion must not come back — it produced false failures'
  );

  const phaseE = harness.slice(harness.indexOf('Opening shared Fabricate app via "Craft Item"'));
  const block = phaseE.slice(0, phaseE.indexOf('const appShell'));
  assert.ok(
    block.includes('await craftButton.waitFor'),
    'the craft button must remain the readiness signal'
  );
  assert.ok(
    block.includes('describeBlockingOverlay'),
    'a timeout must be diagnosed for a blocking overlay before it is rethrown'
  );
  assert.ok(
    block.includes('throw waitError'),
    'with no overlay found, the original Playwright error must be rethrown unchanged'
  );
});

test('describeBlockingOverlay is only ever called on a failure path', async () => {
  // If it were awaited unconditionally it would become a de facto assertion, which is the
  // exact mistake issue #996 records.
  const harness = await readFile(HARNESS_PATH, 'utf8');
  // `await …` distinguishes a call from the `async function describeBlockingOverlay(page)`
  // declaration, which contains the same substring.
  const CALL = 'await describeBlockingOverlay(page)';
  const callSites = harness.split(CALL).length - 1;
  assert.equal(callSites, 1, 'exactly one call site expected');
  const before = harness.slice(0, harness.indexOf(CALL));
  assert.ok(
    before.lastIndexOf('catch (') > before.lastIndexOf('try {'),
    'the call must sit inside a catch block, not on the happy path'
  );
});

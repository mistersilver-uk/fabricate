/**
 * THE DEFERRED-ENTRY NOTICES (issue 1565) — the whole of what `src/main.js` cannot be made to
 * prove about them.
 *
 * `src/main.js` statically imports CSS, so no test can import it; every existing guard over it
 * reads its SOURCE TEXT. A source-text guard can pin a dispatch's position and can never
 * execute a classification, a fallback, a retain-and-reuse decision or a swallow/rethrow
 * contract — which is why all four live in `src/utils/deferredEntryNotice.js` and are asserted
 * here by running them.
 *
 * The measured reason this suite exists in this shape: `tests/item-directory-manager-launch.test.js`
 * used unanchored `assert.match` over a sliced region, and appending a `.catch(...)` to the call
 * site it guards left both of its regexes matching. A grep cannot catch the defect that a
 * reporter fails to report.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  buildDeferredChunkFailureNotice,
  buildStaleEntryNotice,
  createDeferredChunkFailureReporter,
  openDeferredApp,
  openDeferredAppRethrowing,
} from '../src/utils/deferredEntryNotice.js';

/** A localizer that resolves nothing, so every builder falls back to its literal sentence. */
const noLocalizer = () => undefined;

/**
 * A reporter over recording stubs.
 *
 * `notify` hands back an incrementing handle shaped like core's (`{ id }`), because
 * `Notifications#has` is only callable with `id > 0` and the reporter's live-notice probe is
 * capability-checked against exactly that.
 */
function reporterHarness({ hasNotice, handle } = {}) {
  const logged = [];
  const notified = [];
  let nextId = 0;
  const report = createDeferredChunkFailureReporter({
    log: (message, error) => {
      logged.push({ message, error });
    },
    notify: (message, options) => {
      notified.push({ message, options });
      nextId += 1;
      // The handle is produced by an injected FUNCTION rather than passed as a value, so a
      // harness can ask for an `undefined` handle — the shape the View Lab's shim really
      // returns — which a plain option value cannot express: a destructuring default fires on
      // `undefined` and would silently hand back core's shape instead.
      return typeof handle === 'function' ? handle(nextId) : { id: nextId };
    },
    localize: noLocalizer,
    hasNotice,
  });
  return { report, logged, notified };
}

const CHUNK_FAILURE = new TypeError(
  'Failed to fetch dynamically imported module: https://host/modules/fabricate/chunks/SvelteCraftingSystemManagerApp.svelte-B57jCpyM.js'
);

test('every engine’s dynamic-import failure text produces the reload notice', () => {
  // The three real texts, one per engine. Chromium/Edge, Firefox, Safari — verified against the
  // engines' own wording rather than paraphrased, because this classification is the only thing
  // standing between the user and the generic no-cause notice.
  const engineTexts = [
    'Failed to fetch dynamically imported module: https://host/modules/fabricate/chunks/a.js',
    'error loading dynamically imported module: https://host/modules/fabricate/chunks/a.js',
    'Importing a module script failed.',
  ];
  for (const text of engineTexts) {
    const message = buildDeferredChunkFailureNotice(new TypeError(text), noLocalizer);
    assert.match(message, /reload/i, `${text} should be reported as reload-recoverable`);
    assert.match(message, /bypassing the cache/i, 'and must carry the cache-bypass escalation');
  }
});

test('a rejection with no recognised text produces the generic notice, which claims no cause', () => {
  const generic = buildDeferredChunkFailureNotice(new Error('Cannot read properties of null'), noLocalizer);
  assert.match(generic, /could not open the crafting system manager/i);
  assert.match(generic, /console/i, 'it points at the console, which carries the error');
  // THE COPY MUST NOT INVENT A CAUSE. This branch cannot know one, so it must not tell the user
  // the module was updated, must not blame a cache, and must not instruct a reload.
  assert.doesNotMatch(generic, /updat/i, 'the generic branch must not say the module was updated');
  assert.doesNotMatch(generic, /reload/i, 'nor instruct a reload it cannot justify');
  assert.doesNotMatch(generic, /cache/i, 'nor blame a cache');
});

test('a non-Error rejection cannot re-break the fix, and takes the generic branch', () => {
  // Reading `.message` off `null`/`undefined` THROWS, and a throw inside the `catch` handler that
  // reports the failure would reproduce the original dead-button defect on the recovery path.
  const generic = buildDeferredChunkFailureNotice(new Error('unrelated'), noLocalizer);
  const shapes = [
    null,
    undefined,
    'Failed to fetch dynamically imported module: chunks/a.js',
    { name: 'TypeError' },
    { message: 42 },
    0,
  ];
  for (const shape of shapes) {
    assert.equal(
      buildDeferredChunkFailureNotice(shape, noLocalizer),
      generic,
      `${JSON.stringify(shape)} must return the generic notice without throwing`
    );
  }
});

test('a localized key wins, and a missing, key-echoing or throwing localizer falls back', () => {
  const key = 'FABRICATE.Admin.Manager.LoadFailedStaleEntry';
  assert.equal(buildDeferredChunkFailureNotice(CHUNK_FAILURE, () => 'Localizzato'), 'Localizzato');

  // `Localization#localize` returns the KEY when the key is missing, which would otherwise
  // render a dotted path to the user; and a localizer that throws must not escape a `catch`.
  const fallback = buildDeferredChunkFailureNotice(CHUNK_FAILURE, noLocalizer);
  assert.match(fallback, /^Fabricate could not open/);
  assert.equal(buildDeferredChunkFailureNotice(CHUNK_FAILURE, () => key), fallback);
  assert.equal(
    buildDeferredChunkFailureNotice(CHUNK_FAILURE, () => {
      throw new Error('i18n unavailable');
    }),
    fallback
  );
});

test('the stale-build notice fires for a real difference only', () => {
  const differing = buildStaleEntryNotice(
    { buildVersion: '1.9.3', installedVersion: '1.9.4' },
    noLocalizer
  );
  assert.match(differing, /1\.9\.4 is installed/);
  assert.match(differing, /still running Fabricate 1\.9\.3/);
  assert.match(differing, /bypassing the cache/i, 'the reload escalation is in the copy');

  assert.equal(
    buildStaleEntryNotice({ buildVersion: '1.9.4', installedVersion: '1.9.4' }, noLocalizer),
    '',
    'matching versions report nothing'
  );
  // An ABSENT side is the normal case wherever the build-time define is absent (the View Lab is
  // served from a config that declares no `define`; `node --test` has no build at all), so it
  // must no-op rather than warn on every capture frame and every dev session.
  const absent = [
    undefined,
    {},
    { buildVersion: '1.9.3' },
    { installedVersion: '1.9.4' },
    { buildVersion: '', installedVersion: '1.9.4' },
    { buildVersion: '\t', installedVersion: '1.9.4' },
    { buildVersion: 193, installedVersion: '1.9.4' },
  ];
  for (const versions of absent) {
    assert.equal(
      buildStaleEntryNotice(versions, noLocalizer),
      '',
      `${JSON.stringify(versions)} must report nothing`
    );
  }
});

test('the stale-build notice passes both versions to the localizer as format data', () => {
  const calls = [];
  const message = buildStaleEntryNotice(
    { buildVersion: '1.9.3', installedVersion: '1.9.4' },
    (key, data) => {
      calls.push({ key, data });
      return 'localized';
    }
  );
  assert.equal(message, 'localized');
  assert.deepEqual(calls, [
    {
      key: 'FABRICATE.Update.StaleEntryScript',
      data: { buildVersion: '1.9.3', installedVersion: '1.9.4' },
    },
  ]);
});

test('a reported failure writes exactly one console line and one un-mirrored notice', () => {
  const { report, logged, notified } = reporterHarness({ hasNotice: () => false });
  report(CHUNK_FAILURE);

  assert.equal(logged.length, 1, 'exactly one console write per failure');
  assert.equal(logged[0].message, DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE);
  assert.equal(logged[0].error, CHUNK_FAILURE, 'the console carries the underlying error');
  // The exported literal is what pins the console LEVEL, by being asserted against the built
  // bundle: `console.log`/`info`/`debug` are stripped from every published build, and a spy in
  // this suite would pass at any level. So it must not be empty, or that assertion is vacuous.
  assert.ok(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE.length > 0);

  assert.equal(notified.length, 1);
  assert.deepEqual(
    notified[0].options,
    { console: false },
    'core mirrors a notification to the console from its own queue drain, so the notice must opt out'
  );
  assert.match(notified[0].message, /reload/i);
});

test('a second failure while the notice is still live logs but does not re-notify', () => {
  let live = true;
  const { report, logged, notified } = reporterHarness({ hasNotice: () => live });

  report(CHUNK_FAILURE);
  report(CHUNK_FAILURE);
  assert.equal(logged.length, 2, 'the console carries each failure');
  assert.equal(notified.length, 1, 'the user is not notified again over a visible notice');

  // Once it has drained — a non-permanent notice lasts five seconds — a further failure must
  // notify again. A once-per-session flag would leave this user with nothing, which is the
  // invisible failure this change exists to remove.
  live = false;
  report(CHUNK_FAILURE);
  assert.equal(logged.length, 3);
  assert.equal(notified.length, 2, 'a failure after the notice is gone raises a fresh one');
});

test('a hasNotice-less, id-less or throwing probe never throws and always notifies', () => {
  const withoutProbe = reporterHarness();
  withoutProbe.report(CHUNK_FAILURE);
  withoutProbe.report(CHUNK_FAILURE);
  assert.equal(withoutProbe.notified.length, 2, 'no probe means no suppression');

  // The View Lab's shim returns `undefined` from `warn`/`error`, and a queued notice has no id
  // until it drains. `Notifications#has` THROWS on either, so the probe must never be reached.
  const idless = reporterHarness({ hasNotice: () => true, handle: () => undefined });
  const nullHandle = reporterHarness({ hasNotice: () => true, handle: () => null });
  const zeroId = reporterHarness({ hasNotice: () => true, handle: () => ({ id: 0 }) });
  for (const harness of [idless, nullHandle, zeroId]) {
    harness.report(CHUNK_FAILURE);
    harness.report(CHUNK_FAILURE);
    assert.equal(harness.notified.length, 2, 'an unusable handle must not suppress the notice');
  }

  const throwing = reporterHarness({
    hasNotice: () => {
      throw new Error('Notifications#has refused the handle');
    },
  });
  throwing.report(CHUNK_FAILURE);
  throwing.report(CHUNK_FAILURE);
  assert.equal(throwing.notified.length, 2, 'a throwing probe degrades to notifying');
});

test('openDeferredApp reports and resolves; openDeferredAppRethrowing reports and rejects', async () => {
  const shown = { app: 'crafting system manager' };
  const failing = () => Promise.reject(CHUNK_FAILURE);

  const swallowing = reporterHarness({ hasNotice: () => false });
  assert.equal(
    await openDeferredApp(() => Promise.resolve(shown), swallowing.report),
    shown,
    'a successful open returns the app’s own result'
  );
  assert.equal(swallowing.notified.length, 0, 'and reports nothing');
  // Nothing awaits the header button's handler, so a rethrow here is the unhandled rejection
  // this change exists to replace.
  assert.equal(await openDeferredApp(failing, swallowing.report), undefined);
  assert.equal(swallowing.notified.length, 1);

  const rethrowing = reporterHarness({ hasNotice: () => false });
  assert.equal(
    await openDeferredAppRethrowing(() => Promise.resolve(shown), rethrowing.report),
    shown
  );
  // The public API must keep returning a promise that rejects with the ORIGINAL error, so a
  // macro author's `await` still sees the failure rather than a resolved `undefined`.
  await assert.rejects(
    () => openDeferredAppRethrowing(failing, rethrowing.report),
    (error) => error === CHUNK_FAILURE
  );
  assert.equal(rethrowing.notified.length, 1, 'and it reports before rethrowing');
  assert.equal(rethrowing.logged.length, 1);
});

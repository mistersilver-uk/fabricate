/**
 * HOW `src/main.js` LAUNCHES THE DEFERRED GM MANAGER, and what happens when the deferred load fails
 * (issues 150 and 1565). AND EVERY ASSERTION IS `assert.ok(regex.test(...))` RATHER THAN
 * `assert.match`, for READABILITY.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { entrySources } from './helpers/bootstrapEntrySource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The module entry and the `src/bootstrap/` modules it split into (issue 1715), as one text: the
 * deferred loader and `openRecipeManager` stay in the entry, while the Items Directory button
 * moved to `src/bootstrap/hooks.js`. Read through ONE call, so the pin count does not rise.
 */
function mainSource() {
  return [
    entrySources['src/main.js'],
    entrySources['src/bootstrap/hooks.js'],
    entrySources['src/bootstrap/publicApi.js'],
  ].join('\n');
}

test('the deferred manager is opened through the memoized loader', () => {
  const source = mainSource();
  // Issue 150: the GM-only subtree is loaded once, lazily. Issue 1565 moved the memoization into
  // `src/utils/memoizedModuleLoad.js`, so the opener is the one place that chains the loader.
  assert.ok(
    /const showCraftingSystemManagerApp = \(\) =>\s*loadCraftingSystemManagerAppClass\(\)\.then\(\(AppClass\) => AppClass\.show\(\)\)/.test(source),
    'main.js should open the manager through the memoized loader'
  );
  assert.ok(
    /const loadCraftingSystemManagerAppClass = createMemoizedLoad\(/.test(source),
    'and the loader should be the shared memoization seam, not a hand-rolled module-level flag'
  );
  assert.ok(
    !/getCraftingSystemManagerAppClass\(\)\.show\(\)/.test(source),
    'nothing should reach the app class without going through the deferred load'
  );
});

test('the Items Directory manager button reports a failed load and swallows it', () => {
  const source = mainSource();
  const buttonStart = source.indexOf("createHeaderButton(\n        'Manage Crafting Systems'");
  assert.notEqual(buttonStart, -1, 'main.js should create a Manage Crafting Systems header button');
  const buttonSource = source.slice(buttonStart);

  // SWALLOWING, and brace-bounded to this button's own handler: nothing awaits a click handler,
  // so a rethrow would land as the unhandled rejection that made this failure invisible.
  assert.ok(
    /^[^}]*void openDeferredApp\(io\.showCraftingSystemManagerApp, io\.reportManagerLoadFailure\)/.test(
      buttonSource
    ),
    'the header button should dispatch through the swallowing wrapper'
  );
  assert.ok(
    !/^[^}]*openDeferredAppRethrowing\(/.test(buttonSource),
    'and not through the rethrowing one, which would leave an unhandled rejection'
  );
  assert.ok(
    !/^[^}]*loadCraftingSystemManagerAppClass\(\)/.test(buttonSource),
    'nor call the loader directly, which reports nothing to the user'
  );
});

test('openRecipeManager reports a failed load and rethrows it', () => {
  const source = mainSource();
  const apiStart = source.indexOf('openRecipeManager: () => {');
  assert.notEqual(apiStart, -1, 'main.js should expose openRecipeManager');
  const apiSource = source.slice(apiStart);

  // RETHROWING: a public API member must keep returning a promise that rejects, so a macro
  // author's `await` still sees the failure after the user has been told.
  assert.ok(
    /^[^}]*return openDeferredAppRethrowing\(\s*io\.showCraftingSystemManagerApp,\s*io\.reportManagerLoadFailure\s*\)/.test(
      apiSource
    ),
    'openRecipeManager should dispatch through the rethrowing wrapper'
  );
  assert.ok(
    !/^[^}]*openDeferredApp\(/.test(apiSource),
    'and not through the swallowing one, which would resolve undefined over a failure'
  );
  assert.ok(
    !/^[^}]*loadCraftingSystemManagerAppClass\(\)/.test(apiSource),
    'nor call the loader directly, which reports nothing to the user'
  );
});

test('the api export stays raw and un-notified', () => {
  const source = mainSource();
  const apiStart = source.indexOf('function buildApiClasses(io) {');
  assert.notEqual(apiStart, -1, 'the public API should expose the advanced-user api object');
  const apiSource = source.slice(apiStart, source.indexOf('\n  };', apiStart));

  // DELIBERATE (issue 1565): an API consumer owns its own error handling, and the Foundry smoke
  // is one of these consumers — a failure there must surface as a named failing step rather than
  // as a notification-mirrored console error.
  assert.ok(
    /^\s*loadCraftingSystemManagerAppClass: io\.loadCraftingSystemManagerAppClass,$/m.test(
      apiSource
    ),
    'the api member should be the bare loader'
  );
  assert.ok(
    !/loadCraftingSystemManagerAppClass: \(\)/.test(apiSource),
    'not a wrapped or notifying variant'
  );
});

test('the failure reporter is wired with closures over ui.notifications, not member values', () => {
  const source = mainSource();
  const reporterStart = source.indexOf(
    'const reportManagerLoadFailure = createDeferredChunkFailureReporter({'
  );
  assert.notEqual(reporterStart, -1, 'main.js should build the manager load-failure reporter');
  const reporterSource = source.slice(reporterStart);

  // D3, and brace-bounded to this call's own argument object for the same reason as the dispatch
  // assertions above (issue 1565).
  assert.ok(
    /^[^}]*notify: \(message, options\) => ui\.notifications\?\.error\?\.\(message, options\)/.test(
      reporterSource
    ),
    'notify should be a closure that reads ui.notifications.error at call time'
  );
  assert.ok(
    /^[^}]*hasNotice: \(notice\) => ui\.notifications\?\.has\?\.\(notice\)/.test(reporterSource),
    'hasNotice should be a closure that reads ui.notifications.has at call time'
  );
  assert.ok(
    !/^[^}]*notify: ui\.notifications/.test(reporterSource),
    'not a bare member value, which loses the receiver and throws on a private-field access'
  );
  assert.ok(
    !/^[^}]*hasNotice: ui\.notifications/.test(reporterSource),
    'nor hasNotice, for the same reason'
  );
});

test('both module console lines are written at a level the published build keeps', () => {
  const source = mainSource();

  // A MINIFIER-INDEPENDENT COMPANION to the bundle assertions in `tests/release-build.test.js`,
  // which remain the authority because they read the shipped artefact — but they need a full vite
  // build, so this one is what fails in the fast suite.
  assert.ok(
    /log: \(error\) => console\.error\(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error\)/.test(source),
    'the load-failure console line should be written at console.error'
  );
  assert.ok(
    /\n {2}console\.warn\(STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,/.test(source),
    'the stale-entry console line should be written at console.warn, or the build strips it'
  );
});

test('the stale-entry check is dispatched from the ready body, behind a typeof guard', () => {
  const source = mainSource();

  // IN the `ready` startup sequence, NOT `initialize()` (issue 1715 moved the body into
  // `src/bootstrap/hooks.js`; the entry still owns the check itself).
  const readyStart = source.indexOf('async function runReadyStartupSequence(io) {');
  assert.notEqual(readyStart, -1, 'the ready startup sequence should be declared');
  assert.ok(
    /^[^}]*\n {2}io\.reportStaleEntryScript\(\);/.test(source.slice(readyStart)),
    'the stale-entry check should be dispatched first from the ready startup sequence'
  );

  // EVERY READ OF THE BUILD-TIME DEFINE IS GUARDED.
  const code = source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
  const reads = code.match(/__FABRICATE_BUILD_VERSION__/g) ?? [];
  const guarded =
    code.match(
      /typeof __FABRICATE_BUILD_VERSION__ === 'string'\s*\? __FABRICATE_BUILD_VERSION__\s*: ''/g
    ) ?? [];
  assert.equal(guarded.length, 1, 'the define is read in one `typeof`-guarded ternary');
  assert.equal(reads.length, 2, 'and nowhere else — every other read would be a ReferenceError');
});

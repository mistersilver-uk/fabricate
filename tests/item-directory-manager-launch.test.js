/**
 * HOW `src/main.js` LAUNCHES THE DEFERRED GM MANAGER, and what happens when the deferred load
 * fails (issues 150 and 1565).
 *
 * A SOURCE-TEXT GUARD, because `src/main.js` statically imports CSS and no test can import it.
 * So this file can only pin DISPATCH — which wrapper is called where — and deliberately pins
 * nothing about what the wrappers DO; that behaviour is executed by
 * `tests/deferred-entry-notice.test.js` against the module the dispatches name.
 *
 * WHY THE ASSERTIONS ARE SHAPED LIKE THIS. The previous form of this file sliced a region and
 * ran unanchored `assert.match` over it. Measured during plan review: appending a `.catch(...)`
 * to the call site it guarded left BOTH of its regexes matching, so it survived the exact
 * mutation it existed to catch. Two things changed as a result.
 *
 *  1. Every assertion below anchors on the WRAPPER CALL, brace-bounded from its own call site's
 *     opening (`[^}]*`), so a match cannot run on into a later member of the same object. An
 *     unbounded `[\S\s]*?` gap would find the wrapper call somewhere else in a 12,000-line file
 *     and report success for a call site that lost its dispatch entirely.
 *  2. Nothing re-slices to the first `'},'`. That delimiter moves the moment Prettier breaks a
 *     chain across lines, which is exactly what happens when a `.catch` or a wrapper is added.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');

function mainSource() {
  return readFileSync(mainPath, 'utf8');
}

test('the deferred manager is opened through the memoized loader', () => {
  const source = mainSource();
  // Issue 150: the GM-only subtree is loaded once, lazily. Issue 1565 moved the memoization into
  // `src/utils/memoizedModuleLoad.js`, so the opener is the one place that chains the loader.
  assert.match(
    source,
    /const showCraftingSystemManagerApp = \(\) =>\s*loadCraftingSystemManagerAppClass\(\)\.then\(\(AppClass\) => AppClass\.show\(\)\)/,
    'main.js should open the manager through the memoized loader'
  );
  assert.match(
    source,
    /const loadCraftingSystemManagerAppClass = createMemoizedLoad\(/,
    'and the loader should be the shared memoization seam, not a hand-rolled module-level flag'
  );
  assert.doesNotMatch(
    source,
    /getCraftingSystemManagerAppClass\(\)\.show\(\)/,
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
  assert.match(
    buttonSource,
    /^[^}]*void openDeferredApp\(showCraftingSystemManagerApp, reportManagerLoadFailure\)/,
    'the header button should dispatch through the swallowing wrapper'
  );
  assert.doesNotMatch(
    buttonSource,
    /^[^}]*openDeferredAppRethrowing\(/,
    'and not through the rethrowing one, which would leave an unhandled rejection'
  );
  assert.doesNotMatch(
    buttonSource,
    /^[^}]*loadCraftingSystemManagerAppClass\(\)/,
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
  assert.match(
    apiSource,
    /^[^}]*return openDeferredAppRethrowing\(showCraftingSystemManagerApp, reportManagerLoadFailure\)/,
    'openRecipeManager should dispatch through the rethrowing wrapper'
  );
  assert.doesNotMatch(
    apiSource,
    /^[^}]*openDeferredApp\(/,
    'and not through the swallowing one, which would resolve undefined over a failure'
  );
  assert.doesNotMatch(
    apiSource,
    /^[^}]*loadCraftingSystemManagerAppClass\(\)/,
    'nor call the loader directly, which reports nothing to the user'
  );
});

test('the api export stays raw and un-notified', () => {
  const source = mainSource();
  const apiStart = source.indexOf('game.fabricate.api = {');
  assert.notEqual(apiStart, -1, 'main.js should expose the advanced-user api object');
  const apiSource = source.slice(apiStart, source.indexOf('\n  };', apiStart));

  // DELIBERATE (issue 1565): an API consumer owns its own error handling, and the Foundry smoke
  // is one of these consumers — a failure there must surface as a named failing step rather than
  // as a notification-mirrored console error.
  assert.match(
    apiSource,
    /^\s*loadCraftingSystemManagerAppClass,$/m,
    'the api member should be the bare loader'
  );
  assert.doesNotMatch(
    apiSource,
    /loadCraftingSystemManagerAppClass:/,
    'not a wrapped or notifying variant'
  );
});

test('the stale-entry check is dispatched from the ready body, behind a typeof guard', () => {
  const source = mainSource();

  // IN `ready`, NOT `initialize()`. The View Lab calls `fabricate.initialize()` directly and
  // then invokes the ready body's functions one by one, so anything moved into `initialize()`
  // also runs in the lab and in every suite that builds the lab world.
  const readyStart = source.indexOf("Hooks.once('ready', async () => {");
  assert.notEqual(readyStart, -1, 'main.js should register a ready hook');
  assert.match(
    source.slice(readyStart),
    /^[^}]*\n {2}reportStaleEntryScript\(\);/,
    'the stale-entry check should be dispatched from the ready body'
  );

  // EVERY READ OF THE BUILD-TIME DEFINE IS GUARDED. The identifier is genuinely undeclared
  // wherever the define is absent — the View Lab is served from a config that declares no
  // `define`, and `node --test` has no build at all — so an unguarded read is a `ReferenceError`
  // during module evaluation. ESLint cannot catch it: the identifier is declared to it as a
  // readonly global, which satisfies `no-undef` for a bare read.
  //
  // Counted over the source with COMMENTS STRIPPED, because the guard's own rationale names the
  // identifier several times in prose and a raw count would pass or fail on how much of that
  // prose survives an edit. (The strip is crude — it would also blank a `//` inside a string
  // literal — which is harmless here: its only use is counting this one identifier.)
  const code = source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
  const reads = code.match(/__FABRICATE_BUILD_VERSION__/g) ?? [];
  const guarded =
    code.match(
      /typeof __FABRICATE_BUILD_VERSION__ === 'string'\s*\? __FABRICATE_BUILD_VERSION__\s*: ''/g
    ) ?? [];
  assert.equal(guarded.length, 1, 'the define is read in one `typeof`-guarded ternary');
  assert.equal(reads.length, 2, 'and nowhere else — every other read would be a ReferenceError');
});

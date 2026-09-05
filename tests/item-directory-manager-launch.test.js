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
 *
 * AND EVERY ASSERTION IS `assert.ok(regex.test(...))`, NEVER `assert.match`. Measured: on failure
 * `node:assert` serialises the actual value to build its diff, and the actual value here is
 * `src/main.js` — 300,000 characters. That dump does not merely make the failure unreadable; it
 * overflows the test runner's IPC channel, and the sibling file in the same `node --test`
 * invocation died with `Unable to deserialize cloned data`, losing ITS results too. Same hazard,
 * and same remedy, as the repo's rule against asserting a mounted DOM node against `null`.
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
    /^[^}]*void openDeferredApp\(showCraftingSystemManagerApp, reportManagerLoadFailure\)/.test(buttonSource),
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
    /^[^}]*return openDeferredAppRethrowing\(showCraftingSystemManagerApp, reportManagerLoadFailure\)/.test(apiSource),
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
  const apiStart = source.indexOf('game.fabricate.api = {');
  assert.notEqual(apiStart, -1, 'main.js should expose the advanced-user api object');
  const apiSource = source.slice(apiStart, source.indexOf('\n  };', apiStart));

  // DELIBERATE (issue 1565): an API consumer owns its own error handling, and the Foundry smoke
  // is one of these consumers — a failure there must surface as a named failing step rather than
  // as a notification-mirrored console error.
  assert.ok(
    /^\s*loadCraftingSystemManagerAppClass,$/m.test(apiSource),
    'the api member should be the bare loader'
  );
  assert.ok(
    !/loadCraftingSystemManagerAppClass:/.test(apiSource),
    'not a wrapped or notifying variant'
  );
});

test('both module console lines are written at a level the published build keeps', () => {
  const source = mainSource();

  // A MINIFIER-INDEPENDENT COMPANION to the bundle assertions in `tests/release-build.test.js`,
  // which remain the authority because they read the shipped artefact — but they need a full vite
  // build, so this one is what fails in the fast suite.
  //
  // The level matters differently at the two sites, and conflating them is how the first version
  // of the bundle assertion came to be vacuous. `vite.config.js` declares `console.log`,
  // `console.info` and `console.debug` pure, and `manualPureFunctions` lets Rolldown drop such a
  // call only when its RETURN VALUE IS UNUSED:
  //
  //  - the load-failure write is the body of a concise arrow, so its value is used and the call
  //    survives DCE at any level. Its level is a deliberate contract (a failed open is an error),
  //    not a survival requirement.
  //  - the stale-entry write is an expression STATEMENT whose value is discarded, so a regression
  //    to `log`/`info`/`debug` really does delete the call, and its message with it, from every
  //    published build. Measured.
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

  // IN `ready`, NOT `initialize()`. The View Lab calls `fabricate.initialize()` directly and
  // then invokes the ready body's functions one by one, so anything moved into `initialize()`
  // also runs in the lab and in every suite that builds the lab world.
  const readyStart = source.indexOf("Hooks.once('ready', async () => {");
  assert.notEqual(readyStart, -1, 'main.js should register a ready hook');
  assert.ok(
    /^[^}]*\n {2}reportStaleEntryScript\(\);/.test(source.slice(readyStart)),
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

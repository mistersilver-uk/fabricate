/**
 * UNDEFINED IDENTIFIERS IN THE FILES CI's LINT GLOB DOES NOT REACH (issue 1370).
 *
 * PR 8a repointed seven call sites in `src/main.js` at the shared read seam and shipped without
 * the import. Every gate stayed green, and three independent blind spots line up on that one file
 * to make that possible:
 *
 *  1. **CI's `lint` glob excludes it.** The script covers
 *     `src/{models,utils,integrations,config,migration,canvas,systems}/**\/*.js` plus
 *     `src/toolBreakageRuntime.js`. `lint:all` is not run in CI.
 *  2. **No test imports it.** All 28 suites naming `src/main.js` read it with `readFileSync` for
 *     source-text assertions, because it statically imports CSS and cannot load under
 *     `node --test`. A source-text gate can pin a dispatch's POSITION and can never pin that its
 *     callee EXISTS.
 *  3. **The bundler emits an unresolved identifier as a free global**, so `npm run build`
 *     succeeded and `dist/main.js` shipped the bare names while every binding beside them was
 *     mangled.
 *
 * **HOW TO CHECK THE BUNDLE, AND ONE WAY NOT TO.** The absence of the bare names in `dist/` is
 * necessary but not sufficient — a module that was tree-shaken away is also absent. Proving the
 * module is PRESENT by grepping for a property-name string it uses only works if that string is
 * UNIQUE to it: `getComponentScopeStore` appears four times in `dist/main.js` and not one of
 * them is this seam's dispatch table, so that check proves nothing. Use the region marker the
 * bundler emits — `//#region src/systems/scopedEntityReads.js`, in the shared chunk rather than
 * in `dist/main.js` — or the source map's `sources`.
 *
 * Module code is strict, so each site was a hard `ReferenceError` the moment its enclosing
 * function ran — reachable from the Alchemy craft button, the Run Journal, and three published
 * companion API members.
 *
 * ## WHY THIS AND NOT "PUT `src/main.js` IN THE LINT GLOB"
 *
 * Measured: `src/main.js` alone carries **228 pre-existing errors across 19 rules** (104
 * `import-x/order`, 61 `unicorn/no-undeclared-class-members`, and seventeen more). Widening the
 * glob means either fixing 228 unrelated findings inside a consumer sweep or adding a file-level
 * suppression that would re-hide this defect class. This gate takes the one rule that catches the
 * defect and applies it to every file the glob misses.
 *
 * ## THE POPULATION IS DERIVED, NEVER RESTATED
 *
 * It is computed by subtracting the `lint` script's own glob — parsed out of `package.json` — from
 * every `.js` under `src/`. A hand-written list would rot the moment the glob moved, in the
 * silent direction: a file dropped from CI's glob and absent from a hand-written list here is
 * checked by nothing at all.
 *
 * **NOTHING IS EXCLUDED, AND AN EARLIER FORM OF THIS FILE WAS WRONG TO EXCLUDE ANYTHING.** It
 * dropped the fourteen `*.svelte.js` rune modules on the claim that including them "would force
 * a suppression that would swallow a real one". That was assumed, not measured, and the
 * measurement refutes it: the 148 baseline reports come from THREE distinct names, and declaring
 * the seven rune names readonly in `eslint.config.js` - the technique `foundryGlobals` there
 * already uses, whose own comment notes that over-declaring a readonly global is harmless -
 * takes them to ZERO. The cost was eight global declarations, not a suppression.
 *
 * That exclusion was the SAME DEFECT this file exists to catch, one level up: deleting an
 * imported name from `SvelteCraftingSystemManagerApp.svelte.js` while leaving its three call
 * sites intact produced three hard `ReferenceError`s in the 1577-line GM manager app, with this
 * guard, `lint`, `lint:svelte`, `build` and all 454 referencing tests green. The excluded set
 * also held `SvelteApplicationMixin.svelte.js`, the base of every V2 application, which no test
 * references at all.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ESLint } from 'eslint';

import { collectSources, repoRoot } from './helpers/sourceScan.js';

/** Repo-relative POSIX path, built without a backslash literal. */
const posix = (file) => file.split(String.fromCharCode(92)).join('/');

/** The directories CI's `lint` script already covers, parsed from the script itself. */
function coveredPrefixes() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const script = pkg.scripts.lint;
  const braced = /src\/\{([a-z,]+)\}\/\*\*\/\*\.js/.exec(script);
  assert.ok(braced, 'the `lint` script no longer carries the braced src/{...} glob this parses');
  return braced[1].split(',').map((dir) => `src/${dir}/`);
}

/** The named single files CI's `lint` script covers outside that glob. */
function coveredFiles() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return new Set(
    [...pkg.scripts.lint.matchAll(/(?<![\w/])(src\/[\w.-]+\.js)\b/g)].map(([, file]) => file)
  );
}

/** Every `.js` under `src/` that CI's lint glob does NOT reach. */
function unlintedSources() {
  const prefixes = coveredPrefixes();
  const files = coveredFiles();
  return Object.keys(collectSources(repoRoot + '/src', { extensions: ['.js'] }))
    .filter((file) => !prefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => !files.has(file))
    .sort();
}

/** Every `no-undef` report over `files`, using the REPOSITORY'S OWN config so the Foundry and
 * browser globals it declares are in scope — a private config would report `game` and `ui` as
 * undefined and force an allowlist that hid the real thing. */
async function undefinedIdentifiers(files) {
  const eslint = new ESLint({ errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(files);
  // A GUARD THAT CANNOT TELL "CLEAN" FROM "NEVER RAN" IS THE FAILURE THIS FILE IS ABOUT.
  // `errorOnUnmatchedPattern: false` turns a skip into silence, and an `ignores` entry covering
  // `src/` makes every assertion below pass with zero files linted. Both are checked here.
  assert.equal(
    results.length,
    files.length,
    `ESLint returned ${results.length} result(s) for ${files.length} file(s); some were skipped`
  );
  const ignored = results
    .filter((result) => result.messages.some((m) => /File ignored/i.test(m.message ?? '')))
    .map((result) => posix(result.filePath).split('/src/').pop());
  assert.deepEqual(ignored, [], 'these files were IGNORED rather than linted, so they are unchecked');
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === 'no-undef')
      .map(
        (message) =>
          `${posix(result.filePath).split('/src/').pop()}:${message.line} ${message.message}`
      )
  );
}

describe('every src/ file outside CI’s lint glob resolves its identifiers', () => {
  it('covers a NON-EMPTY population, including src/main.js and the seam’s other leaf caller', () => {
    // A gate over an empty file list reports success forever.
    const population = unlintedSources();
    assert.ok(population.length > 50, `expected a real population, got ${population.length}`);
    assert.ok(population.includes('src/main.js'), 'src/main.js must be in the population');
    assert.ok(population.includes('src/gatheringResultCreation.js'));
    // The rune modules an earlier form of this file excluded. `SvelteApplicationMixin` is the
    // base of every V2 application and no test references it; the manager app is 1577 lines and
    // is dynamically imported from `src/main.js`.
    for (const rune of [
      'src/ui/SvelteCraftingSystemManagerApp.svelte.js',
      'src/ui/svelte/SvelteApplicationMixin.svelte.js',
      'src/ui/svelte/stores/craftingStore.svelte.js',
    ]) {
      assert.ok(population.includes(rune), `${rune} must be in the population`);
    }
    assert.ok(
      population.filter((file) => file.endsWith('.svelte.js')).length >= 14,
      'every rune module is in the population'
    );
    for (const covered of ['src/systems/CraftingEngine.js', 'src/toolBreakageRuntime.js']) {
      assert.equal(
        population.includes(covered),
        false,
        `${covered} is already covered by CI's lint glob and must be subtracted`
      );
    }
  });

  it('reports no undefined identifier anywhere in that population', async () => {
    const offenders = await undefinedIdentifiers(unlintedSources());
    assert.deepEqual(
      offenders,
      [],
      'an unresolved identifier here is a ReferenceError that no lint, no test and no build ' +
        'reports — module code is strict, so it throws the moment its function runs'
    );
  });

  it('the rule really is armed — it reports a synthetic undefined identifier', async () => {
    // A "must print nothing" gate is worthless until you have watched it print something.
    const eslint = new ESLint({ errorOnUnmatchedPattern: false });
    const [result] = await eslint.lintText('export const a = () => definitelyNotDefined(1);\n', {
      filePath: `${repoRoot}/src/__synthetic-no-undef-probe.js`,
    });
    assert.deepEqual(
      result.messages.filter((message) => message.ruleId === 'no-undef').map((m) => m.message),
      ["'definitelyNotDefined' is not defined."]
    );
  });
});

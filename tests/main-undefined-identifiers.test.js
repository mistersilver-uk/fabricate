/** UNDEFINED IDENTIFIERS IN THE FILES CI's LINT GLOB DOES NOT REACH (issue 1370). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ESLint } from 'eslint';

import { LEGACY_GATE_FILES } from './helpers/legacyLintGate.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

/** Repo-relative POSIX path, built without a backslash literal. */
const posix = (file) => file.split(String.fromCharCode(92)).join('/');

/** Every `.js` under `src/` that the PRE-GLOB lint gate did not reach (issue 1660). */
function unlintedSources() {
  const legacy = new Set(LEGACY_GATE_FILES);
  return Object.keys(collectSources(repoRoot + '/src', { extensions: ['.js'] }))
    .filter((file) => !legacy.has(file))
    .sort(byCodePoint);
}

/** Every `no-undef` report over `files`, using the REPOSITORY'S OWN config so the Foundry and
 * browser globals it declares are in scope — a private config would report `game` and `ui` as
 * undefined and force an allowlist that hid the real thing. */
async function undefinedIdentifiers(files) {
  const eslint = new ESLint({ errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(files);
  // A GUARD THAT CANNOT TELL "CLEAN" FROM "NEVER RAN" IS THE FAILURE THIS FILE IS ABOUT.
  assert.equal(
    results.length,
    files.length,
    `ESLint returned ${results.length} result(s) for ${files.length} file(s); some were skipped`
  );
  const ignored = results
    .filter((result) => result.messages.some((m) => /File ignored/i.test(m.message ?? '')))
    .map((result) => posix(result.filePath).split('/src/').pop());
  assert.deepEqual(ignored, [], 'these files were IGNORED rather than linted, so they are unchecked');
  // A PARSE FAILURE IS NOT A CLEAN FILE.
  const fatal = results.flatMap((result) =>
    result.messages
      .filter((message) => message.fatal)
      .map((message) => `${posix(result.filePath).split('/src/').pop()}: ${message.message}`)
  );
  assert.deepEqual(fatal, [], 'these files could not be parsed, so no rule ran over them');
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
    // The rune modules an earlier form of this file excluded.
    for (const rune of [
      'src/ui/SvelteCraftingSystemManagerApp.svelte.js',
      'src/ui/svelte/SvelteApplicationMixin.svelte.js',
      'src/ui/svelte/stores/craftingStore.svelte.js',
    ]) {
      assert.ok(population.includes(rune), `${rune} must be in the population`);
    }
    // A floor re-derived by counting, never carried forward: `find src -name '*.svelte.js'`
    // answers 14, and none of the 14 sits under CI's lint glob, so all 14 must appear here.
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

  it('has no-undef ENABLED for every file in the population, not merely linted', async () => {
    // A SCOPED DISABLE IS THE REALISTIC WAY THIS GOES BLIND.
    const eslint = new ESLint({ errorOnUnmatchedPattern: false });
    const disabled = [];
    for (const file of unlintedSources()) {
      const config = await eslint.calculateConfigForFile(file);
      const severity = config?.rules?.['no-undef'];
      const level = Array.isArray(severity) ? severity[0] : severity;
      if (level === 'off' || level === 0 || level === undefined) disabled.push(file);
    }
    assert.deepEqual(
      disabled,
      [],
      'no-undef is OFF for these files, so they are in the population but checked by nothing'
    );
  });

  it('the rule really is armed — it reports a synthetic undefined identifier', async () => {
    // A "must print nothing" gate is worthless until you have watched it print something.
    const eslint = new ESLint({ errorOnUnmatchedPattern: false });
    const [result] = await eslint.lintText('export const a = () => definitelyNotDefined(1);\n', {
      // INSIDE the newly covered subtree, not at `src/` root: a probe at the root sits outside
      // any `src/ui/**` scoped disable and would stay green while the population went unchecked.
      filePath: `${repoRoot}/src/ui/svelte/stores/__synthetic-no-undef-probe.js`,
    });
    assert.deepEqual(
      result.messages.filter((message) => message.ruleId === 'no-undef').map((m) => m.message),
      ["'definitelyNotDefined' is not defined."]
    );
  });
});

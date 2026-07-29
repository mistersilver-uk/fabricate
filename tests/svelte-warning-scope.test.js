/**
 * Guard: the Svelte compiler-warning gate must actually reach every component, and must
 * actually fail on a warning.
 *
 * Issue 924 installed two halves of one gate — `onwarn` in `svelte.config.js`, which fails
 * `npm run build`, and `scripts/check-svelte-warnings.mjs`, the sweep CI runs over every
 * `src/**\/*.svelte`. Both are one edit away from going vacuous, and this programme has already
 * shipped a gate that reported success while inspecting nothing once (`.prettierignore` carried
 * a `*.svelte` entry, so `format:check` matched zero files and exited 0 — see
 * `tests/prettier-svelte-scope.test.js`, which this file mirrors).
 *
 * The four ways back, and which of them this covers:
 *
 *   - The sweep stops finding components (a moved root, a walker that lost its recursion). The
 *     script itself exits 2 on an empty walk rather than reporting clean; this pins the count as
 *     non-trivial so a walk that finds SOME files but not most of them is still caught.
 *   - The sweep stops failing on a warning. Driven end to end below against a fixture tree
 *     holding one deliberately warning-bearing component: a gate whose detection is never
 *     exercised is one refactor away from being a no-op.
 *   - CI stops running it. The `lint` job is parsed out of `.github/workflows/ci.yml` and the
 *     invocation asserted, and the npm script it names is asserted to invoke the real file.
 *   - The sweep and `onwarn` drift apart on compiler options, which would make a disagreement
 *     between them ambiguous — graph reachability, or config drift? Both read `svelte.config.js`
 *     through `scripts/lib/svelteCompilerWarnings.js`; that is asserted here, along with the one
 *     documented override (`compare-svelte-render.mjs`'s `css: 'external'`) being provably
 *     warning-neutral rather than merely claimed to be.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The same walker the sweep uses, so "every component" means one thing here too.
import { listSvelteComponents } from '../scripts/lib/svelteComponentFiles.js';
import {
  BUILD_COMPILER_OPTIONS,
  compileComponent,
  formatWarningSummary,
  scanComponentWarnings,
} from '../scripts/lib/svelteCompilerWarnings.js';
import svelteConfig from '../svelte.config.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sweepScript = 'scripts/check-svelte-warnings.mjs';
const sweepNpmScript = 'lint:svelte:warnings';

const components = listSvelteComponents(path.join(repoRoot, 'src'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

/**
 * A component that warns, and one that does not.
 *
 * `a11y_no_noninteractive_element_to_interactive_role` is chosen because it is one of the
 * classes issue 924 cleared, so this fixture also documents what the gate was installed for.
 */
const WARNING_COMPONENT = '<ul><li role="button" tabindex="0">warns</li></ul>\n';
const CLEAN_COMPONENT = '<ul><li>clean</li></ul>\n';

/** Run the real sweep over a throwaway source root. */
function runSweep(root) {
  try {
    const stdout = execFileSync(process.execPath, [sweepScript, '--root', root], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

/** A temp source root holding the named `<name>.svelte` sources, and a disposer. */
function withFixtureRoot(sources, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-svelte-warning-'));
  try {
    mkdirSync(path.join(root, 'nested'), { recursive: true });
    for (const [name, source] of Object.entries(sources)) {
      writeFileSync(path.join(root, name), source, 'utf8');
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the Svelte compiler-warning gate covers every component', () => {
  // Without this the sweep could pass by finding almost nothing — the same vacuity in a new
  // costume. Pinned as a floor rather than an exact count so adding a component is not a
  // failure; the count is ~246 today.
  it('finds a non-trivial number of components to compile', () => {
    assert.ok(
      components.length > 100,
      `expected the component tree under src/ to be found, got ${components.length} files`
    );
  });

  it('reports zero warnings across the whole component tree', () => {
    const result = scanComponentWarnings({
      files: components.map((file) => path.relative(repoRoot, file).split(path.sep).join('/')),
      readSource: (file) => readFileSync(path.join(repoRoot, file), 'utf8'),
    });
    assert.deepEqual(
      result.warnings,
      [],
      `the bar is zero — ${formatWarningSummary(result)}. Fix the code rather than widening` +
        ' the gate; see the issue 924 findings for why each class here was a real defect.'
    );
  });
});

describe('the sweep actually fails on a warning', () => {
  it('exits 1 and names the offending file, code and position', () => {
    const outcome = withFixtureRoot(
      { 'Warns.svelte': WARNING_COMPONENT, 'nested/Clean.svelte': CLEAN_COMPONENT },
      (root) => runSweep(root)
    );

    assert.equal(outcome.status, 1, 'a warning must fail the sweep');
    assert.match(outcome.stdout, /svelte_compiler_warnings=1 over 2 files/);
    assert.match(outcome.stdout, /Warns\.svelte:1:\d+ \[a11y_no_noninteractive_element_to_interactive_role]/);
  });

  it('exits 0 on a clean tree, including files in subdirectories', () => {
    const outcome = withFixtureRoot(
      { 'Clean.svelte': CLEAN_COMPONENT, 'nested/AlsoClean.svelte': CLEAN_COMPONENT },
      (root) => runSweep(root)
    );

    assert.equal(outcome.status, 0, `expected a clean sweep, got:\n${outcome.stdout}`);
    assert.match(
      outcome.stdout,
      /svelte_compiler_warnings=0 over 2 files/,
      'the walk must recurse — a sweep that saw only the top level would report 1 file'
    );
  });

  it('fails rather than reporting clean when it finds no components at all', () => {
    const outcome = withFixtureRoot({}, (root) => runSweep(root));
    assert.equal(outcome.status, 2, 'an empty walk is a failed run, not a pass');
    assert.match(outcome.stdout, /found no \*\.svelte/);
  });
});

describe('the gate is wired into CI and into npm', () => {
  it('runs the sweep as a step of the lint job', () => {
    const lintJob = workflow.slice(workflow.indexOf('\n  lint:'), workflow.indexOf('\n  validate-bindings:'));
    assert.ok(lintJob.length > 0, 'could not locate the lint job in ci.yml');
    assert.ok(
      lintJob.includes(`npm run ${sweepNpmScript}`),
      `the CI lint job must run "npm run ${sweepNpmScript}" — without it the sweep is a script` +
        ' nobody executes, and a new compiler warning reaches main unremarked'
    );
  });

  it('points that npm script at the real sweep', () => {
    assert.equal(packageJson.scripts?.[sweepNpmScript], `node ${sweepScript}`);
  });

  // #935's ratchet already fails `npm test` on an ungated `scripts/` file. This states the
  // requirement in the place someone adding to THIS gate will be reading, with its reason.
  it('gates its own new scripts/ files through lint, format and format:check', () => {
    for (const script of ['lint', 'format', 'format:check']) {
      const command = packageJson.scripts?.[script];
      for (const file of [sweepScript, 'scripts/lib/svelteCompilerWarnings.js']) {
        assert.ok(
          command.includes(file),
          `the ${script} script must cover ${file} — an ungated script under scripts/ is how a` +
            ' new BUG and VULNERABILITY reached SonarCloud in issue 933'
        );
      }
    }
  });
});

describe('the sweep and onwarn cannot drift apart on compiler options', () => {
  it('reads the build options out of svelte.config.js rather than restating them', () => {
    assert.equal(
      BUILD_COMPILER_OPTIONS.css,
      svelteConfig.compilerOptions.css,
      'the shared helper must take its options FROM the config the build uses'
    );
    assert.equal(BUILD_COMPILER_OPTIONS.generate, 'client');
    assert.equal(BUILD_COMPILER_OPTIONS.dev, false);
  });

  it('keeps onwarn present and throwing, so the build fails rather than logging', () => {
    assert.equal(typeof svelteConfig.onwarn, 'function', 'svelte.config.js must export onwarn');
    assert.throws(
      () =>
        svelteConfig.onwarn({
          code: 'a11y_role_supports_aria_props',
          message: 'probe',
          filename: 'Probe.svelte',
          start: { line: 1, column: 0 },
        }),
      /Probe\.svelte:1:0 \[a11y_role_supports_aria_props]/,
      'a handler that merely logs leaves the build exit code at 0'
    );
  });

  // The prose claim that `compare-svelte-render.mjs`'s `css: 'external'` override cannot move
  // the warning set, converted into evidence. It is checked against a REAL component that
  // exercises the CSS analysis, not a synthetic one.
  it('proves the one permitted css override is warning-neutral', () => {
    const file = 'src/ui/svelte/apps/manager/components/ComponentSelectionToolbar.svelte';
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    const codes = (options) =>
      compileComponent(source, file, options)
        .warnings.map((warning) => warning.code)
        .sort();

    assert.deepEqual(
      codes({ css: 'external' }),
      codes({}),
      'the css option selects where the stylesheet is EMITTED, not whether it is ANALYSED —' +
        ' if this ever fails, compare-svelte-render.mjs must stop overriding it'
    );
  });

  it('still reports a css_unused_selector under the build options', () => {
    const source = '<div class="a">x</div><style>.a{color:red}.b{color:blue}</style>';
    const codes = compileComponent(source, 'Probe.svelte').warnings.map((w) => w.code);
    assert.deepEqual(
      codes,
      ['css_unused_selector'],
      'a pruned selector must still be reported under css: injected — that class is what caught' +
        " ComponentSelectionToolbar's dead focus ring"
    );
  });
});

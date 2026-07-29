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
 *
 * A NOTE ON WHAT "PROVABLY" HAS TO MEAN HERE, because the first version of that last assertion
 * got it wrong. It compiled a REAL component under both option sets and compared the codes —
 * but every component under `src/` has zero warnings (the sibling assertion above is exactly
 * that bar), so both sides were `[]` and it read `assert.deepEqual([], [])`. Not incidentally
 * vacuous: structurally vacuous forever, guaranteed by the gate shipping beside it. Evidence
 * about a warning set has to be taken over a source that WARNS, and it has to show the override
 * was applied at all — otherwise a `compileComponent` that silently dropped its `overrides`
 * argument, the exact regression the override needs guarding against, would keep it green.
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
const viteConfigSource = readFileSync(path.join(repoRoot, 'vite.config.js'), 'utf8');

/**
 * A component that warns, and one that does not.
 *
 * `a11y_no_noninteractive_element_to_interactive_role` is chosen because it is one of the
 * classes issue 924 cleared, so this fixture also documents what the gate was installed for.
 */
const WARNING_COMPONENT = '<ul><li role="button" tabindex="0">warns</li></ul>\n';
const CLEAN_COMPONENT = '<ul><li>clean</li></ul>\n';

/**
 * A component that does not COMPILE, which is a different failure from one that warns.
 *
 * `scanComponentWarnings` turns a compiler throw into a synthetic `compile_error` finding
 * rather than skipping the file, so a sweep can never come back clean because it could not
 * read something. Untested, that rescue is one `continue` away from being the silent skip it
 * exists to prevent.
 */
const UNCOMPILABLE_COMPONENT = '<div>never closed\n';

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

  // A file the compiler REFUSES is the case where "skip it and carry on" is most tempting and
  // most dangerous: the sweep would report clean over a component it never inspected.
  it('attributes a component that fails to compile to that file rather than reporting clean', () => {
    const outcome = withFixtureRoot(
      { 'Broken.svelte': UNCOMPILABLE_COMPONENT, 'nested/Clean.svelte': CLEAN_COMPONENT },
      (root) => runSweep(root)
    );

    assert.equal(outcome.status, 1, 'an uncompilable component is a finding, not a skipped file');
    assert.match(outcome.stdout, /svelte_compiler_warnings=1 over 2 files/);
    assert.match(
      outcome.stdout,
      /Broken\.svelte \[compile_error]/,
      'the finding must name the file that could not be read, or it is not actionable'
    );
  });
});

describe('the gate is wired into CI and into npm', () => {
  it('runs the sweep as a step of the lint job', () => {
    // BOTH anchors are checked before the slice. `indexOf` returns -1 for a job that was
    // renamed or removed, and `slice(start, -1)` does not fail — it widens to the rest of the
    // file, whereupon a step in ANY later job would satisfy the assertion below and this would
    // stop being about the lint job at all.
    const start = workflow.indexOf('\n  lint:');
    const end = workflow.indexOf('\n  validate-bindings:');
    assert.ok(start > -1, 'could not locate the lint job in ci.yml');
    assert.ok(
      end > start,
      'could not locate the validate-bindings job that bounds the lint job in ci.yml — rename' +
        ' the anchor here rather than leaving the slice to widen to the whole workflow'
    );

    const lintJob = workflow.slice(start, end);
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

  // `compilerOptions` is spread wholesale by BOTH halves, so anything added to it lands in the
  // sweep, the build AND the whole-tree assertion above at once. `warningFilter` is the key
  // that turns all three clean while they check nothing: one line, no gate objecting, and no
  // pointer back to the code it silences. The config already states the no-allowlist rule in
  // prose next to `onwarn`; this is that rule with an exit code.
  it('carries no warningFilter — the no-allowlist rule is enforced, not just stated', () => {
    assert.ok(
      !Object.hasOwn(svelteConfig.compilerOptions, 'warningFilter'),
      'a warningFilter here is an unreviewed, unexpiring exemption with no pointer back to the' +
        ' code. Suppress at the site with `<!-- svelte-ignore <code> -->` and a reason, which' +
        ' `svelte/no-unused-svelte-ignore` then polices in the other direction'
    );
  });

  // The ONE way the "never config drift" claim can fail, and it is outside `compilerOptions`.
  //
  // `@sveltejs/vite-plugin-svelte` filters `css_unused_selector` out of the warning list
  // BEFORE `onwarn` is called whenever `emitCss` is false (`ignoreCompilerWarning` in
  // `src/utils/log.js`). `emitCss` is a PLUGIN option, not a compiler option, so the shared
  // read of `compilerOptions` does not cover it — and it is the natural-looking companion to
  // `css: 'injected'`, because the plugin derives that same value from it by default. Set it
  // false and the build stops reporting the exact class that motivated issue 924 while the
  // sweep, which never goes near the plugin, keeps reporting it.
  //
  // In this plugin version a root-level `emitCss` in `svelte.config.js` THROWS ("Move the
  // following options into 'vitePlugin:{...}'"), so the two silent routes are the
  // `vitePlugin` block here and an inline argument to `svelte()` in `vite.config.js`.
  it('leaves emitCss at its default on both surfaces that can set it', () => {
    assert.ok(
      !Object.hasOwn(svelteConfig, 'emitCss') && !Object.hasOwn(svelteConfig.vitePlugin ?? {}, 'emitCss'),
      'emitCss: false makes vite-plugin-svelte drop every css_unused_selector before onwarn' +
        ' sees it — the build would go quiet on the class this gate was installed for while the' +
        ' sweep kept reporting it, and the disagreement would look like graph reachability'
    );
    assert.match(
      viteConfigSource,
      /\bsvelte\(\s*\)/,
      'vite.config.js must invoke svelte() with no inline options — the plugin accepts emitCss' +
        ' there too, with the same effect and even less visibility'
    );
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
  // the warning set, converted into evidence.
  //
  // Two things have to be shown, and the first is the one the original version of this test
  // missed. (1) THE OVERRIDE IS ACTUALLY APPLIED: `external` returns the stylesheet in
  // `result.css` and `injected` returns `null` there, so that field is a direct observation of
  // which option took effect — and it is the very signal `compare-svelte-render.mjs` overrides
  // for. Without it, a `compileComponent` that ignored its `overrides` argument would compile
  // both sides identically and every comparison below would pass by construction. (2) GIVEN IT
  // IS APPLIED, THE WARNING SETS AGREE — over sources that actually warn, one per analysis
  // family, each pinned to its expected code so neither side can go quietly empty.
  //
  // The direction that matters most is `external` DROPPING a class: that would make
  // `compare-svelte-render.mjs`'s `svelte_compiler_warnings=N over M files` line understate,
  // silently, and issue 924's baseline figure came from exactly that line.
  describe('the one permitted css override is warning-neutral', () => {
    const codesOf = (source, options) =>
      compileComponent(source, 'Probe.svelte', options)
        .warnings.map((warning) => warning.code)
        .sort();
    const emitsStylesheet = (source, options) =>
      compileComponent(source, 'Probe.svelte', options).css !== null;

    // `.b` matches nothing, so the CSS analysis has something to report.
    const CSS_PROBE = '<div class="a">x</div><style>.a{color:red}.b{color:blue}</style>';
    // A style block the markup DOES use, so this probe reports the a11y class alone while
    // still carrying a stylesheet for the "was the override applied" observation.
    const A11Y_PROBE =
      '<ul><li role="button" tabindex="0">warns</li></ul><style>li{color:red}</style>';

    it('applies the override at all, rather than compiling both sides the same way', () => {
      assert.equal(
        emitsStylesheet(CSS_PROBE, { css: 'external' }),
        true,
        'under external the stylesheet comes back in result.css — if this fails the override is' +
          ' not reaching the compiler and every comparison in this block is vacuous'
      );
      assert.equal(
        emitsStylesheet(CSS_PROBE, {}),
        false,
        "under the build's own css: injected the compiler folds the stylesheet into the JS and" +
          ' returns result.css === null. That difference is the whole reason' +
          ' compare-svelte-render.mjs overrides the option, and it is what makes the two sides' +
          ' below genuinely different compiles rather than the same one twice'
      );
    });

    it('reports the same codes either way for the CSS analysis', () => {
      assert.deepEqual(
        codesOf(CSS_PROBE, { css: 'external' }),
        codesOf(CSS_PROBE, {}),
        'the css option selects where the stylesheet is EMITTED, not whether it is ANALYSED —' +
          ' if this ever fails, compare-svelte-render.mjs must stop overriding it'
      );
      assert.deepEqual(
        codesOf(CSS_PROBE, {}),
        ['css_unused_selector'],
        'a pruned selector must still be reported under css: injected — that class is what' +
          " caught ComponentSelectionToolbar's dead focus ring"
      );
      assert.deepEqual(
        codesOf(CSS_PROBE, { css: 'external' }),
        ['css_unused_selector'],
        'and under external, so a comparison of two empty sets can never pass for agreement'
      );
    });

    it('reports the same codes either way for the a11y analysis', () => {
      assert.deepEqual(
        codesOf(A11Y_PROBE, { css: 'external' }),
        codesOf(A11Y_PROBE, {}),
        'the other analysis family the sweep reports on, exercised for the same reason'
      );
      assert.deepEqual(codesOf(A11Y_PROBE, {}), [
        'a11y_no_noninteractive_element_to_interactive_role',
      ]);
      assert.deepEqual(codesOf(A11Y_PROBE, { css: 'external' }), [
        'a11y_no_noninteractive_element_to_interactive_role',
      ]);
    });

    // Kept as a smoke over the shape the gate actually runs against. It is NOT the evidence:
    // every component under `src/` is warning-free by the bar asserted above, so both sides
    // are `[]` here by construction and this can only catch a compile that THROWS.
    it('compiles a real component both ways without either side throwing', () => {
      const file = 'src/ui/svelte/apps/manager/components/ComponentSelectionToolbar.svelte';
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      const codes = (options) =>
        compileComponent(source, file, options)
          .warnings.map((warning) => warning.code)
          .sort();
      assert.deepEqual(codes({ css: 'external' }), codes({}));
    });
  });
});

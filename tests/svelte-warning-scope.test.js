/**
 * Guard: the Svelte compiler-warning gate must actually reach every component, and must actually
 * fail on a warning. The sweep stops finding components (a moved root, a walker that lost its
 * recursion) (issue 924).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The same walker the sweep uses, so "every component" means one thing here too.
import { ESLint } from 'eslint';
// Deep entry point: `npm test` runs Node with `--conditions=browser`, and Prettier's export map
// answers that condition with `standalone.mjs` — a bundle with no filesystem access, so no
// `getFileInfo`. `prettier/index.mjs` is the Node build.
import { getFileInfo } from 'prettier/index.mjs';

import { ESLINT_DEBT } from '../eslint.debt.js';
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

/** A component that warns, and one that does not (issue 924). */
const WARNING_COMPONENT = '<ul><li role="button" tabindex="0">warns</li></ul>\n';
const CLEAN_COMPONENT = '<ul><li>clean</li></ul>\n';

/** A component that does not COMPILE, which is a different failure from one that warns. */
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
  // costume.
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
    // BOTH anchors are checked before the slice.
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

  // `lint` and `format:check` are globs over the repository since issue #1660, so these two files
  // are covered by default rather than by being named.
  it('keeps its own scripts/ files inside the lint and format gates', async () => {
    const eslint = new ESLint();
    const baselined = new Set(Object.keys(ESLINT_DEBT.scripts));
    for (const file of [sweepScript, 'scripts/lib/svelteCompilerWarnings.js']) {
      assert.equal(
        await eslint.isPathIgnored(file),
        false,
        `${file} is excluded from \`npm run lint\` entirely`
      );
      assert.equal(
        baselined.has(file),
        false,
        `${file} has been recorded as lint debt in eslint.debt.js rather than kept clean`
      );
      const info = await getFileInfo(path.join(repoRoot, file), {
        ignorePath: [path.join(repoRoot, '.gitignore'), path.join(repoRoot, '.prettierignore')],
      });
      assert.equal(info.ignored, false, `${file} is excluded from \`npm run format:check\``);
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
  // sweep, the build AND the whole-tree assertion above at once.
  it('carries no warningFilter — the no-allowlist rule is enforced, not just stated', () => {
    assert.ok(
      !Object.hasOwn(svelteConfig.compilerOptions, 'warningFilter'),
      'a warningFilter here is an unreviewed, unexpiring exemption with no pointer back to the' +
        ' code. Suppress at the site with `<!-- svelte-ignore <code> -->` and a reason, which' +
        ' `svelte/no-unused-svelte-ignore` then polices in the other direction'
    );
  });

  // The ONE way the "never config drift" claim can fail, and it is outside `compilerOptions` (issue
  // 924).
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

  // The prose claim that `compare-svelte-render.mjs`'s `css: 'external'` override cannot move the
  // warning set, converted into evidence. Two things have to be shown, and the first is the one the
  // original version of this test missed (issue 924).
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
          " caught the bulk selection toolbar's dead focus ring"
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

    // Kept as a smoke over the shape the gate actually runs against.
    it('compiles a real component both ways without either side throwing', () => {
      const file = 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte';
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      const codes = (options) =>
        compileComponent(source, file, options)
          .warnings.map((warning) => warning.code)
          .sort();
      assert.deepEqual(codes({ css: 'external' }), codes({}));
    });
  });
});

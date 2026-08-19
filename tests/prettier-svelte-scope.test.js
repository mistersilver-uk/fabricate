/**
 * Guard: Prettier must actually reach `.svelte` components.
 *
 * Before issue 923 the Prettier gate was silently vacuous over components. `.prettierignore`
 * carried a `*.svelte` entry, so `prettier --check "src/**\/*.svelte"` matched ZERO files, printed
 * "All matched files use Prettier code style!" and exited 0. A gate that reports success while
 * inspecting nothing is worse than no gate: CI is green, so nobody looks.
 *
 * That state is one line away from returning, and only ONE of the two ways back announces itself:
 *
 *   - Deleting `"plugins"` from `.prettierrc.json` fails LOUDLY. `format:check` names
 *     `src/**\/*.svelte` explicitly, so Prettier matches the files, finds no parser for them and
 *     exits 2 with "No parser could be inferred". No guard needed for that path.
 *   - Re-adding `*.svelte` to `.prettierignore` is SILENT. `format:check` prints "All matched
 *     files use Prettier code style!" and exits 0 — the exact failure mode this gate exists to
 *     eliminate, sailing straight through CI.
 *
 * Issue 946 found a THIRD, more general way back that the guards below used to miss entirely:
 * appending `--ignore-path <a file that ignores *.svelte>` to the `format:check` SCRIPT ITSELF.
 * The tests that proved the command's scope did so by reconstructing the question through the
 * Prettier Node API with their OWN `ignorePath` array, never observing the argv the command
 * actually runs with, and the only command-level check was a substring match
 * (`command.includes(componentGlob)`) that a flag appended after the glob leaves untouched. So
 * this file now closes both halves: `assertGateArgv` (`tests/helpers/gateScope.js`) pins the
 * `format`/`format:check` scripts' PARSED argv by equality rather than substring, and a real,
 * PATH-free execution of `format:check` (`runPrettierCheck`) proves the real command reaches the
 * real component corpus, with a positive control proving Prettier actually reports an
 * unformatted component rather than reporting clean by construction.
 *
 * Issue 1017 added the last piece: that execution runs the real CLI over the live working tree, so
 * a file appearing or vanishing mid-run used to surface as a bare CLI error with nothing to say
 * the tree had moved. The failure report now discriminates on Prettier's EXIT CODE — 1 is
 * Prettier's own verdict about files it read, 2 is an operational error and no verdict at all —
 * and adds what it observed of the tree either side of the run. See `formatCheckReport` for why
 * the notes are additive rather than a substitution, and why additive does not mean last.
 *
 * `formatCheckReport` is the one thing here that a green run never inspects, so it gets the same
 * treatment as the positive control above: `describe('the failure report ...')` calls it directly
 * for each exit code. Without that, deleting its exit-2 note, breaking the constant that selects
 * it, or making its listing note unreachable all leave this file 11/11 green — measured, which is
 * why those tests exist.
 */

/**
 * Issue 1168: this file's runtime is governed by the `--test-timeout` on the `test` script in
 * `package.json`, and CANNOT be narrowed to just this file with a `describe`/`it` `{ timeout }`
 * option — that was tried and measured to not work, not assumed. `node:test` wraps every file
 * passed to the CLI in an implicit test whose own deadline is inherited from `--test-timeout`;
 * inheritance only flows DOWNWARD (a child adopts its parent's timeout as its own default), never
 * upward as an override. A `{ timeout: 300000 }` on the describe below, on the slow `it` inside
 * it, or on a describe wrapping this whole file's content, all still got cancelled at the CLI's
 * shorter value in testing, reported as `not ok 1 - <filepath>` rather than by the name of
 * whichever inner node supposedly owned the longer budget — the same shape the original bug
 * report showed. So the 300000 lives on the `test` script itself, applying to all files, not just
 * this one.
 *
 * The corpus-wide `format:check` invocation below (`inspects the real component corpus, not a
 * reconstruction of it`) is the reason: measured at ~7.5s run alone on an idle machine, ~17.8s as
 * part of a full idle `npm test`, and up to 128.1s under the kind of concurrent load this repo's
 * lane gates actually produce (2-3 other full `npm test` runs in flight at once) — well past the
 * previous 60000ms cap, which is exactly what turned a slow-but-healthy run into a `# cancelled 1`
 * that read as a flake. Narrowing this back down "to tidy it" reintroduces that.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Deep entry point on purpose. `npm test` runs Node with `--conditions=browser` (the mounted
// component harness needs it), and Prettier's export map answers the `browser` condition with
// `standalone.mjs` — a bundle with no filesystem access, so no `getFileInfo`/`resolveConfig`.
// `prettier/index.mjs` is reachable through the package's `"./*"` export and is the Node build.
import * as prettier from 'prettier/index.mjs';
// The same walker `scripts/compare-svelte-render.mjs` uses, so "every component" means one thing.
import { listSvelteComponents } from '../scripts/lib/svelteComponentFiles.js';
import { assertGateArgv, runPrettierCheck } from './helpers/gateScope.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const componentGlob = 'src/**/*.svelte';

// Mirrors the Prettier 3 CLI, which defaults `--ignore-path` to BOTH files. Passing them
// explicitly (rather than relying on the API default, which is no ignore file at all) is what
// makes this test read the repository's real exclusions instead of a convenient empty set.
const ignorePath = [path.join(repoRoot, '.gitignore'), path.join(repoRoot, '.prettierignore')];

const components = listSvelteComponents(path.join(repoRoot, 'src'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

// The full file scope `format`/`format:check` share, beyond the component glob. Both scripts are
// pinned FROM this one list rather than as two separately-typed ~30-entry arrays, so the two
// pins can never silently drift apart from each other by a copy-paste edit to only one of them.
const GATE_TARGETS = [
  componentGlob,
  'src/{models,utils,integrations,config,migration,canvas,systems}/**/*.js',
  'src/toolBreakageRuntime.js',
  'scripts/lib/semver.js',
  'scripts/lib/releaseTags.js',
  'scripts/lib/publishGuard.js',
  'scripts/lib/promoteGuards.js',
  'scripts/lib/hotfixPreflight.js',
  'scripts/lib/foundrySmokeSignal.js',
  'scripts/lib/managerLayoutGuards.js',
  'scripts/lib/screenshotCaptureMap.js',
  'scripts/lib/foundryCanvasReadiness.js',
  'scripts/lib/foundryRunIdentity.js',
  'scripts/lib/foundryRunBudget.js',
  'scripts/lib/foundryTourSuppression.js',
  'scripts/lib/agentModelTiers.js',
  'scripts/lib/foundryDataPreparation.js',
  'scripts/lib/smokeSectionFixture.js',
  'scripts/lib/svelteComponentFiles.js',
  'scripts/lib/svelteCompilerWarnings.js',
  'scripts/release-s3.js',
  'scripts/validate-release-tag.mjs',
  'scripts/hotfix-preflight.mjs',
  'scripts/compare-svelte-render.mjs',
  'scripts/check-svelte-warnings.mjs',
  'scripts/lib/zipRead.js',
  'scripts/lib/foundryImagePin.js',
  'scripts/lib/foundryChromeCache.js',
  'scripts/lib/foundryChromeSpec.js',
  'scripts/lib/viewLabCases.js',
  'scripts/lib/viewLabLayoutAssertion.js',
  'scripts/view-lab-chrome.mjs',
  'scripts/view-lab-screenshots.mjs',
  'scripts/lib/viewLabIndex.js',
  'scripts/view-lab-index.mjs',
  'scripts/lib/foundrySmokeArms.js',
  'scripts/lib/foundryBrowserBoot.js',
  'scripts/foundry-version-assert.mjs',
  // The screen-agnostic visual-parity harness (issue 1096). It replaced a single
  // prototype-specific extractor: the prototype, its region map and its fixture are
  // development-time artefacts under `tmp/` and are not in the tree at all.
  'scripts/visual-parity/extract.mjs',
  'scripts/visual-parity/compare.mjs',
  // The STRUCTURAL pass, which is what lets the harness see absence at all: a comparison
  // of computed styles can only ever measure regions that exist on both sides.
  'scripts/visual-parity/inventory.mjs',
  // The PAGE-SIDE runtime: every routine that runs inside the measured document, as real
  // code. It used to cross into the page as source strings reconstituted with `new Function`.
  'scripts/visual-parity/lib/page-runtime.js',
  'scripts/visual-parity/lib/schema.js',
  'scripts/visual-parity/lib/inventory.js',
  // The ONE live subject both passes measure, and the View Lab boot behind it.
  'scripts/visual-parity/lib/subject.js',
  // The deterministic performance harness (issue 1071). The three libraries carry all the
  // reusable behaviour — the two `.mjs` entry points export nothing, because
  // `unicorn/no-exports-in-scripts` forbids a CLI from also being a module.
  // The PATH-walking executable resolver, extracted out of compare-svelte-render.mjs so the
  // benchmark envelope can share it instead of copying a security-sensitive helper.
  'scripts/lib/resolveExecutable.js',
  'scripts/lib/benchmarkBaselines.js',
  'scripts/lib/benchmarkEnvelope.js',
  'scripts/lib/benchmarkStats.js',
  'scripts/lib/benchmarkRunner.js',
  'scripts/benchmark-performance.mjs',
  'scripts/benchmark-compare.mjs',
  // The Foundry performance profile (issue 1073): the pure derivations it depends on — the
  // measurement registry, the seeding transform, the preconditions, the run record, the
  // browser-side capture summarizers and the storage-arrangement axis (issue 1255) — plus the scenarios and the runner itself.
  'scripts/lib/foundryPerfArrangement.js',
  'scripts/lib/foundryPerfMeasurements.js',
  'scripts/lib/foundryPerfSeed.js',
  'scripts/lib/foundryPerfPreflight.js',
  'scripts/lib/foundryPerfRecord.js',
  'scripts/lib/foundryPerfCapture.js',
  'scripts/lib/foundryPerfScenarios.js',
  'scripts/foundry-perf-run.mjs',
  'scripts/visual-parity/lib/view-lab.js',
  // The screenshot-evidence matcher (issue 1133): the pure derivation that decides which
  // published frames answer a PR's changed files, shared by the evidence gate and its workflow.
  'scripts/lib/screenshotEvidenceMatching.js',
  'eslint.config.js',
];
const FORMAT_ARGV = ['prettier', '--write', ...GATE_TARGETS];
const FORMAT_CHECK_ARGV = ['prettier', '--check', ...GATE_TARGETS];

/** A throwaway directory holding one `Component.svelte`, and a disposer. */
function withFixtureComponent(source, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-prettier-svelte-'));
  try {
    writeFileSync(path.join(root, 'Component.svelte'), source, 'utf8');
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// No repo `.prettierrc.json` is reachable from a fixture directory outside `src/`, so these two
// flags stand in for it: `--plugin` supplies the Svelte parser directly (Prettier 3 does not
// auto-load plugins) and `--no-config` stops cosmiconfig from searching upward and picking up
// some unrelated config on the machine this happens to run on.
const SVELTE_PLUGIN_PATH = path.join(repoRoot, 'node_modules/prettier-plugin-svelte/plugin.js');
const FIXTURE_ARGV = ['--plugin', SVELTE_PLUGIN_PATH, '--no-config'];

const UNFORMATTED_COMPONENT = '<script>\n  let x = 1\n</script>\n\n<div>{x}</div>\n';
const FORMATTED_COMPONENT = '<script>\n  let x = 1;\n</script>\n\n<div>{x}</div>\n';

/**
 * Prettier's exit codes, which are the only trustworthy verdict this test has.
 *
 * `1` is Prettier's own answer about files it READ: at least one of them is unformatted. `2` is an
 * operational error — Prettier reporting that it could not do the job, not a verdict about
 * formatting. `legacy-cli.mjs` sets it at six distinct sites, so exit 2 is a CLASS rather than one
 * cause, and the report below names the class instead of diagnosing a member of it.
 *
 * Measured against this repository's own binary, because guessing here is how the previous wording
 * came to be wrong. `output` is stdout and stderr together, the way the report below joins them:
 *
 *   | condition                                       | exit | output                                        |
 *   |-------------------------------------------------|------|-----------------------------------------------|
 *   | glob matched no file                            | 2    | `All matched files use Prettier code style!`  |
 *   | no parser inferable (`--no-config` on `.svelte`)| 2    | `Error occurred when checking code style ...` |
 *   | parse error in a component's MARKUP             | 2    | `Error occurred when checking code style ...` |
 *   | parse error in an embedded `<script>`           | 0/1  | the SyntaxError, then the ordinary verdict    |
 *   | present but unformatted                         | 1    | `Code style issues found in the above file.`  |
 *
 * The two parse-error rows are one condition to a READER and two to the CLI, which is why they are
 * listed apart rather than jointly as "a parse error". A markup error throws out of the plugin and
 * is an operational error. An error inside an embedded `<script>` is swallowed, that region is
 * reproduced verbatim, and the exit code is then whatever the rest of the file deserves — measured
 * at 0 when the surrounding markup was already formatted, so a component Prettier could not fully
 * parse can pass `--check` with the SyntaxError printed beside the clean sweep.
 *
 * Two things follow, and both are why this file reads the exit code rather than the output. The
 * stdout line is NOT constant at exit 2 — the empty glob prints the clean sweep, the missing parser
 * does not — so no single sentence identifies the condition. And exit 2 OUTRANKS exit 1: the CLI
 * sets 1 only `if (... && !process.exitCode)`, so a run that both matched nothing and found real
 * formatting problems exits 2 while its output complains about code style.
 */
const PRETTIER_UNFORMATTED = 1;
const PRETTIER_OPERATIONAL_ERROR = 2;

/**
 * The failure report for a non-zero `format:check`: this test's own reading of the run, then
 * Prettier's output verbatim and complete.
 *
 * The notes are ADDITIVE, never a replacement, and that is the whole design. The realistic
 * collision is someone adding a new unformatted `.svelte` while this runs — the listing moved AND
 * Prettier genuinely complained — and a report that substituted "the worktree changed" for
 * Prettier's message would eat the real failure and send the reader to re-run a gate that will
 * fail again for the reason it just discarded.
 *
 * ADDITIVE DOES NOT MEAN LAST, which is the ordering this file learned the hard way. Measured on a
 * forced exit 2: appended, the note landed at TAP line 1670 against a lede at line 183, because
 * `--log-level debug` puts ~270 `resolve config from ...` lines in between — and the reader's
 * SECOND line was `All matched files use Prettier code style!`, the exact sentence the note exists
 * to contradict, 1,487 lines before the contradiction arrived. So the discriminating clause is
 * folded into the lede and the notes precede the verbatim block. Prettier's output is unabridged
 * either way; only its position moved.
 *
 * The exit code is the discriminator. The listing diff is only enrichment: it names WHICH paths
 * moved, and it is reported at any exit code, because a moving tree is worth knowing about
 * whatever Prettier concluded.
 *
 * @param {{status: number, stdout: string, stderr: string}} result The Prettier run.
 * @param {string[]} before Components listed immediately before the invocation.
 * @param {string[]} after Components listed immediately after it.
 * @returns {string} The report.
 */
function formatCheckReport(result, before, after) {
  const operational = result.status === PRETTIER_OPERATIONAL_ERROR;
  const report = [
    operational
      ? 'expected the current repository to already satisfy format:check, got exit 2 — an' +
        ' OPERATIONAL ERROR rather than a formatting verdict, so any "All matched files use' +
        ' Prettier code style!" line in the output below is meaningless:'
      : `expected the current repository to already satisfy format:check, got exit ${result.status}:`,
  ];

  if (operational) {
    report.push(
      'Exit 2 says Prettier could not do the job. It does not say which job it could not do, and' +
        ' the possibilities have opposite remedies, so read the output below rather than assuming' +
        ' one. "Unable to read file" is a tree moving under the run — re-run. "No parser could be' +
        ' inferred" is real and permanent — the resolved config lost prettier-plugin-svelte (see' +
        ' the module header) and every re-run fails identically. "No files matching the pattern' +
        ' were found" is the one this report will NOT pick for you, because Prettier prints it' +
        ' identically either way: a target may have vanished under this run, or it may have been' +
        ' deleted or renamed long ago and never taken out of the format:check argv — and this' +
        ' gate pins every one of those targets by equality, so a stale entry produces this' +
        ' message on every run, forever. Re-running tells you which: if it passes, it was the' +
        ' tree; if it names the same path again, drop it from GATE_TARGETS and from the script' +
        ' together. Exit 2 also outranks exit 1, so this run may ALSO have found genuinely' +
        ' unformatted files; the output below is worth reading in full.'
    );
  }

  const named = (files) => files.map((file) => path.relative(repoRoot, file)).join(', ');
  const appeared = after.filter((file) => !before.includes(file));
  const vanished = before.filter((file) => !after.includes(file));
  if (appeared.length > 0 || vanished.length > 0) {
    report.push(
      'The component listing also changed across the invocation, so the worktree was moving while' +
        ` this ran: ${appeared.length} appeared${appeared.length > 0 ? ` (${named(appeared)})` : ''},` +
        ` ${vanished.length} vanished${vanished.length > 0 ? ` (${named(vanished)})` : ''}.`
    );
  }

  report.push(`${result.stdout}${result.stderr}`);
  return report.join('\n\n');
}

describe('Prettier covers Svelte components', () => {
  // Without this the sweep below could pass by finding nothing to check — the same vacuity in a
  // new costume.
  it('finds components to check', () => {
    assert.ok(
      components.length > 100,
      `expected the component tree under src/ to be found, got ${components.length} files`
    );
  });

  it('does not exclude any component from the Prettier scope', async () => {
    const ignored = [];
    for (const component of components) {
      const info = await prettier.getFileInfo(component, { ignorePath });
      if (info.ignored) ignored.push(path.relative(repoRoot, component));
    }
    assert.deepEqual(
      ignored,
      [],
      `.prettierignore/.gitignore must not exclude components — ${ignored.length} excluded, e.g. ${ignored.slice(0, 3).join(', ')}`
    );
  });

  it('resolves a Svelte parser for a real component', async () => {
    const sample = path.join(repoRoot, 'src/ui/svelte/apps/manager/ExplainerCard.svelte');
    const info = await prettier.getFileInfo(sample, { ignorePath, resolveConfig: true });
    assert.deepEqual(
      info,
      { ignored: false, inferredParser: 'svelte' },
      'a real component must be in scope and parse as Svelte'
    );
  });

  // `inferredParser: 'svelte'` above comes from Prettier core's own language metadata and is
  // reported even with no plugin loaded, so it does NOT prove a parser exists. The plugin
  // registration is the half that does, and Prettier 3 removed plugin auto-loading: the
  // devDependency alone leaves `.svelte` unparseable. Dropping this entry is the loud failure
  // path (`format:check` exits 2), so this assertion is documentation of WHY the entry exists
  // rather than the only thing standing between us and a regression.
  it('registers prettier-plugin-svelte in the resolved config', async () => {
    const config = await prettier.resolveConfig(
      path.join(repoRoot, 'src/ui/svelte/apps/manager/ExplainerCard.svelte')
    );
    assert.ok(
      config?.plugins?.includes('prettier-plugin-svelte'),
      'the resolved Prettier config must register prettier-plugin-svelte'
    );
  });

  // The plugin's own options are pinned at the values that produced the landed formatting rather
  // than inherited. `svelteAllowShorthand` in particular decides whether `attr={attr}` is printed
  // as `{attr}`, which this repository's source-text contracts assert against in ~140 places; a
  // plugin major flipping any of these defaults would otherwise re-churn every component on the
  // next `npm update`, with nothing recording that the current behaviour was chosen.
  //
  // `svelteStrictMode` is deliberately absent: prettier-plugin-svelte 4 removed it, and setting
  // it makes every Prettier invocation print "Ignored unknown option".
  it('pins the plugin options that decide component formatting', async () => {
    const config = await prettier.resolveConfig(
      path.join(repoRoot, 'src/ui/svelte/apps/manager/ExplainerCard.svelte')
    );
    assert.equal(config?.svelteAllowShorthand, true, 'svelteAllowShorthand must be pinned');
    assert.equal(
      config?.svelteSortOrder,
      'options-scripts-markup-styles',
      'svelteSortOrder must be pinned'
    );
    assert.equal(
      config?.svelteIndentScriptAndStyle,
      true,
      'svelteIndentScriptAndStyle must be pinned'
    );
  });

  // Both globs, not just the checked one: `format` writing a scope that `format:check` does not
  // verify lets an unformatted component through CI, and the reverse makes `npm run format`
  // unable to fix what CI rejects. Pinned by EQUALITY on the parsed argv, not by substring — see
  // the header comment and issue 946: a `command.includes(componentGlob)` check is unmoved by a
  // flag appended after the glob (e.g. a decoy `--ignore-path`), while an equality pin on the
  // tokenized array sees the extra element immediately.
  it('pins the format and format:check scripts by argv equality', () => {
    assertGateArgv(packageJson, 'format', FORMAT_ARGV);
    assertGateArgv(packageJson, 'format:check', FORMAT_CHECK_ARGV);
  });
});

describe('the argv pin actually fails on the reported hole', () => {
  // Reproduces the issue 946 defect without touching the real package.json: appending a decoy
  // --ignore-path leaves `command.includes(componentGlob)` true (the substring is untouched) but
  // must break an equality pin on the parsed argv, because the appended flag is now an extra
  // array element the expected argv does not have.
  it('fails when a decoy --ignore-path is appended to the script', () => {
    const withDecoyIgnorePath = {
      scripts: {
        'format:check': `${packageJson.scripts['format:check']} --ignore-path decoy-ignore.txt`,
      },
    };
    assert.ok(
      withDecoyIgnorePath.scripts['format:check'].includes(componentGlob),
      'the decoy command must still contain the glob substring — that is exactly what the old' +
        ' substring-only assertion could not see past'
    );
    assert.throws(
      () => assertGateArgv(withDecoyIgnorePath, 'format:check', FORMAT_CHECK_ARGV),
      /parsed argv must equal/,
      'an appended --ignore-path must break the argv pin'
    );
  });

  it('fails when the component glob is removed from the script', () => {
    const withoutGlob = {
      scripts: {
        'format:check': packageJson.scripts['format:check'].replace(`"${componentGlob}" `, ''),
      },
    };
    assert.notEqual(
      withoutGlob.scripts['format:check'],
      packageJson.scripts['format:check'],
      'the replacement must actually have removed something, or this proves nothing'
    );
    assert.throws(
      () => assertGateArgv(withoutGlob, 'format:check', FORMAT_CHECK_ARGV),
      /parsed argv must equal/,
      'removing the component glob must break the argv pin'
    );
  });
});

describe('format:check actually reaches the component corpus when executed', () => {
  // The execution half of the fix: run the REAL, pinned `format:check` argv through Prettier's
  // real CLI entry point (PATH-free — see `runPrettierCheck`), not a reconstruction through the
  // Node API. `--log-level debug` is appended only to make Prettier log which files it resolved
  // config for; it does not change which files match or are ignored (verified against a decoy
  // --ignore-path while building this test: the debug log goes from ~250 `.svelte` lines to
  // zero, with the exit code staying 0 either way — the exact silent failure issue 946 reports).
  it('inspects the real component corpus, not a reconstruction of it', () => {
    const argv = assertGateArgv(packageJson, 'format:check', FORMAT_CHECK_ARGV);
    // Listed immediately either side of the invocation, deliberately rather than reusing the
    // module-level `components`: that binding is computed at load and separated from this run by
    // five async tests which each call `getFileInfo` over all 267 components, so comparing against
    // it would widen the window being described by seconds for no gain. These two calls bracket
    // the run and nothing else.
    const before = listSvelteComponents(path.join(repoRoot, 'src'));
    const result = runPrettierCheck([...argv.slice(1), '--log-level', 'debug']);
    const after = listSvelteComponents(path.join(repoRoot, 'src'));
    const report = formatCheckReport(result, before, after);
    // The bracketing is asserted, not just taken: `before`/`after` are what the listing diff is
    // computed FROM, so two empty arrays would leave the diff permanently silent while every
    // assertion here still passed. This is the only test that runs the real brackets.
    assert.ok(
      before.length > 100 && after.length > 100,
      `the bracketing listings must be the real component corpus — got ${before.length} before` +
        ` and ${after.length} after; an empty bracket makes the moved-file diff a no-op`
    );
    assert.equal(result.status, 0, report);
    // And the report this test would have failed with must be the report, not a stand-in: a green
    // run never reads its own failure message, so nothing else here notices if the call is
    // replaced by a literal or stops carrying Prettier's own output.
    assert.ok(
      report.includes(`${result.stdout}${result.stderr}`),
      'the failure report must carry the output Prettier produced, verbatim and complete — the' +
        ' notes are additive, and a report that dropped or abridged that output would eat the' +
        ' real failure'
    );
    const inspected = [
      ...`${result.stdout}${result.stderr}`.matchAll(/resolve config from '([^']+\.svelte)'/g),
    ].map((match) => match[1]);
    assert.ok(
      inspected.length > 100,
      `expected the real command to actually inspect >100 components, saw ${inspected.length}` +
        ' — a decoy --ignore-path (or a re-added *.svelte entry in .prettierignore) drives this' +
        ' to zero while format:check still exits 0'
    );
    assert.ok(
      inspected.some((file) => file.endsWith('ExplainerCard.svelte')),
      'expected a known real component to appear among the files Prettier actually inspected'
    );
  });

  // The positive control this gate never had: prove Prettier actually REPORTS an unformatted
  // component, rather than every assertion in this file passing because nothing here has ever
  // been checked against a source that fails.
  it('fails when a component is not formatted (positive control)', () => {
    const outcome = withFixtureComponent(UNFORMATTED_COMPONENT, (root) =>
      runPrettierCheck(['--check', 'Component.svelte', ...FIXTURE_ARGV], { cwd: root })
    );
    assert.equal(
      outcome.status,
      PRETTIER_UNFORMATTED,
      `expected an unformatted component to fail --check, got:\n${outcome.stdout}${outcome.stderr}`
    );
    assert.match(
      outcome.stderr,
      /Component\.svelte/,
      'the failure must name the offending file, or it is not actionable'
    );
  });

  // The counterpart to the control above: the same mechanism must also PASS on a properly
  // formatted component, so "fails when unformatted" is not just the default outcome of a
  // misconfigured fixture that fails on anything.
  it('passes when the component is already formatted', () => {
    const outcome = withFixtureComponent(FORMATTED_COMPONENT, (root) =>
      runPrettierCheck(['--check', 'Component.svelte', ...FIXTURE_ARGV], { cwd: root })
    );
    assert.equal(
      outcome.status,
      0,
      `expected a properly formatted component to pass --check, got:\n${outcome.stdout}${outcome.stderr}`
    );
  });
});

/**
 * The diagnostic itself, called directly.
 *
 * Everything above only ever reads `formatCheckReport` through a passing assertion, which never
 * looks at its message — so the whole of it was unproven, and measurably so: breaking the exit-2
 * constant, deleting the exit-2 note and making the listing note unreachable each left this file
 * 11/11 green. It is a pure function of `(result, before, after)`, so no CLI spawn is needed to
 * fix that; the fixtures below are the real CLI outputs, copied from runs against this
 * repository's own Prettier binary.
 */
describe('the report a failing format:check would actually print', () => {
  // The exit codes here are LITERALS, not `PRETTIER_OPERATIONAL_ERROR`/`PRETTIER_UNFORMATTED`, and
  // that is the difference between a test and a tautology. Prettier owns these numbers; the
  // constants are only this file's names for them. Written with the constants, this suite agrees
  // with the code by construction — measured: changing `PRETTIER_OPERATIONAL_ERROR` to 3 moved the
  // fixture along with the branch and left all 14 tests green, which is the very hole this whole
  // block exists to close.
  const EMPTY_GLOB = {
    status: 2,
    stdout: 'Checking formatting...\nAll matched files use Prettier code style!\n',
    stderr: '[error] No files matching the pattern were found: "src/**/*.svelte".\n',
  };
  const UNFORMATTED = {
    status: 1,
    stdout: 'Checking formatting...\n',
    stderr:
      '[warn] src/ui/svelte/apps/manager/ExplainerCard.svelte\n' +
      '[warn] Code style issues found in the above file. Run Prettier with --write to fix.\n',
  };
  const componentPath = (name) => path.join(repoRoot, 'src/ui/svelte/apps/manager', name);
  const steady = [componentPath('ExplainerCard.svelte')];

  it("reports exit 1 as Prettier's own verdict, with nothing added to it", () => {
    const report = formatCheckReport(UNFORMATTED, steady, steady);

    assert.ok(
      report.includes(`${UNFORMATTED.stdout}${UNFORMATTED.stderr}`),
      `exit 1 is Prettier's answer about files it read, and must survive verbatim:\n${report}`
    );
    assert.match(report, /got exit 1/, 'the exit code is the discriminator, so state it');
    assert.ok(
      !/operational error/i.test(report),
      `exit 1 IS the formatting verdict — calling it an operational error would send the reader` +
        ` to re-run a gate that is telling them the truth:\n${report}`
    );
    // The lede above is the only place the phrase "operational error" appears, so the assertion
    // before this one cannot see the exit-2 NOTE at all — measured: `if (operational)` mutated to
    // `if (true)` shipped 14/14 green, with an exit-1 run carrying the whole "read the output,
    // it may be a moving tree" paragraph. This names the note's first words instead.
    assert.ok(
      !/Exit 2 says/.test(report),
      `the exit-2 note must not be attached to a formatting verdict — it tells the reader the run` +
        ` reached no verdict, which at exit 1 is false:\n${report}`
    );
    assert.ok(
      !/listing also changed/.test(report),
      `an unmoved listing must produce no listing note at all:\n${report}`
    );
  });

  it('reports exit 2 as an operational error, ahead of the output that contradicts it', () => {
    const report = formatCheckReport(EMPTY_GLOB, steady, steady);
    const outputAt = report.indexOf(EMPTY_GLOB.stdout);
    // The report's own notes, with Prettier's verbatim output cut off. Scoped deliberately: the
    // fixture's stderr IS `[error] No files matching the pattern were found`, so an unscoped match
    // for that sentence passes on the fixture whether or not the note mentions it at all.
    const notes = report.slice(0, outputAt);

    assert.match(
      notes,
      /operational error/i,
      'exit 2 is not a formatting verdict, and the reader has to be told so'
    );
    // Named because their remedies are opposite. The earliest wording identified ONE cause ("a
    // pattern matched no file"), which is wrong: `No parser could be inferred` reaches this same
    // gate — it is the loud failure path the module header describes — and re-running never fixes
    // it. Enumerate and point at Prettier's own output instead of diagnosing.
    assert.match(notes, /No parser could be inferred/, 'name the permanent cause');
    assert.match(notes, /re-run/, 'and the remedy for the transient one');

    // The empty-glob message is pinned as UNDECIDABLE, and pinned because it has already regressed
    // once: a revision of this note bucketed it with the transient causes and told the reader to
    // re-run. Measured against this repository's own binary — `--check` on a literal path that is
    // not on disk prints exactly `[error] No files matching the pattern were found: "<path>".` and
    // exits 2, the same sentence a mid-run deletion produces, because a path that fails `lstat`
    // falls through as a glob and fast-glob matches nothing. `format:check` pins every one of its
    // target paths by argv equality, so a deleted or renamed target that nobody removed from
    // GATE_TARGETS is the likeliest producer of this message, and it is permanent. The note must
    // therefore refuse to choose, the way `readScannedDirectory`'s missing-root message does.
    const emptyGlobAt = notes.indexOf('"No files matching the pattern were found"');
    assert.ok(
      emptyGlobAt >= 0,
      'the exit-2 note must quote the empty-glob message — it is the cause the argv pin makes' +
        ` likeliest, and the one the previous wording got wrong:\n${notes}`
    );
    // Attached to that message specifically, not merely present somewhere: the refusal has to
    // follow the sentence it is about, or it reads as the remedy for the transient cause listed
    // before it — which is the shape the regression had.
    assert.ok(
      notes.indexOf('Re-running tells you which') > emptyGlobAt,
      'the empty-glob message must not be bucketed as transient: it reads identically whether a' +
        ' pinned target vanished under this run or was deleted weeks ago, so the note has to hand' +
        ` the reader the experiment instead of an answer it cannot have:\n${notes}`
    );

    assert.ok(
      report.includes(`${EMPTY_GLOB.stdout}${EMPTY_GLOB.stderr}`),
      `the note is additive: substituting it for Prettier's own output would eat a real failure in` +
        ` the collision where the tree moved AND something is genuinely unformatted:\n${report}`
    );

    // ORDERING, which is a real defect rather than a preference: appended, this note landed 1,487
    // TAP lines below the lede, behind ~270 lines of `--log-level debug` output, and the reader
    // met "All matched files use Prettier code style!" as their SECOND line — the exact sentence
    // the note exists to contradict.
    assert.ok(
      report.indexOf('Exit 2 says Prettier could not do the job') < outputAt,
      `the explanation must precede the verbatim output, not follow ~270 debug lines of it:\n${report}`
    );
    assert.ok(
      report.indexOf('All matched files') < outputAt,
      `the lede must disarm the clean-sweep line before the reader meets it:\n${report}`
    );
  });

  it('names the components that appeared and vanished across the invocation', () => {
    const vanished = componentPath('Vanished.svelte');
    const appeared = componentPath('Appeared.svelte');
    const kept = componentPath('ExplainerCard.svelte');
    // Exit 0 on purpose: the listing diff is enrichment reported at ANY exit code, because a tree
    // moving under the run is worth knowing about whatever Prettier concluded.
    const report = formatCheckReport(
      { status: 0, stdout: '', stderr: '' },
      [kept, vanished],
      [kept, appeared]
    );

    assert.ok(
      report.includes(`1 appeared (${path.relative(repoRoot, appeared)})`),
      `the report must name what appeared, not just count it:\n${report}`
    );
    assert.ok(
      report.includes(`1 vanished (${path.relative(repoRoot, vanished)})`),
      `the report must name what vanished, not just count it:\n${report}`
    );
    assert.ok(
      !report.includes('ExplainerCard'),
      `a component present either side of the run did not move and is not news:\n${report}`
    );
  });
});

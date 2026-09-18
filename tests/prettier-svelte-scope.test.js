/**
 * Guard: Prettier must actually reach `.svelte` components. Issue 946 found a THIRD, more general
 * way back that the guards below used to miss entirely: appending `--ignore-path <a file that
 * ignores *.svelte>` to the `format:check` SCRIPT ITSELF (issue 923).
 */

/**
 * Issue 1168: this file's runtime is governed by the `--test-timeout` on the `test` script in
 * `package.json`, and CANNOT be narrowed to just this file with a `describe`/`it` `{ timeout }`
 * option — that was tried and measured to not work, not assumed.
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
import * as prettier from 'prettier/index.mjs';
// The same walker `scripts/compare-svelte-render.mjs` uses, so "every component" means one thing.
import { listSvelteComponents } from '../scripts/lib/svelteComponentFiles.js';
import { assertGateArgv, runPrettierCheck } from './helpers/gateScope.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const componentGlob = 'src/**/*.svelte';

// Mirrors the Prettier 3 CLI, which defaults `--ignore-path` to BOTH files.
const ignorePath = [path.join(repoRoot, '.gitignore'), path.join(repoRoot, '.prettierignore')];

const components = listSvelteComponents(path.join(repoRoot, 'src'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

// The file scope `format` and `format:check` share (issue 1660).
const GATE_TARGETS = ['.'];
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

/** Prettier's exit codes, which are the only trustworthy verdict this test has. */
const PRETTIER_UNFORMATTED = 1;
const PRETTIER_OPERATIONAL_ERROR = 2;

/**
 * The failure report for a non-zero `format:check`: this test's own reading of the run, then
 * Prettier's output verbatim and complete. The notes are ADDITIVE, never a replacement, and that is
 * the whole design.
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
  // reported even with no plugin loaded, so it does NOT prove a parser exists.
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
  // than inherited.
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
  // verify lets an unformatted component through CI, and the reverse makes `npm run format` unable
  // to fix what CI rejects (issue 946).
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
      withDecoyIgnorePath.scripts['format:check'].includes('--check .'),
      'the decoy command must still contain the substring a naive check would look for — that is' +
        ' exactly what the old substring-only assertion could not see past. (It used to look for' +
        ' the component glob; the scope is the repository root since issue #1660, so the' +
        ' stand-in for "the command still looks right" is the check flag and its target.)'
    );
    assert.throws(
      () => assertGateArgv(withDecoyIgnorePath, 'format:check', FORMAT_CHECK_ARGV),
      /parsed argv must equal/,
      'an appended --ignore-path must break the argv pin'
    );
  });

  it('fails when the corpus target is removed from the script', () => {
    // `prettier --check` with nothing to check exits 0 having looked at no file at all, which is
    // the same silent success issue 946 reported by a different route.
    const withoutTarget = {
      scripts: {
        'format:check': packageJson.scripts['format:check'].replace(' .', ''),
      },
    };
    assert.notEqual(
      withoutTarget.scripts['format:check'],
      packageJson.scripts['format:check'],
      'the replacement must actually have removed something, or this proves nothing'
    );
    assert.throws(
      () => assertGateArgv(withoutTarget, 'format:check', FORMAT_CHECK_ARGV),
      /parsed argv must equal/,
      'removing the corpus target must break the argv pin'
    );
  });
});

describe('format:check actually reaches the component corpus when executed', () => {
  // The execution half of the fix: run the REAL, pinned `format:check` argv through Prettier's real
  // CLI entry point (PATH-free — see `runPrettierCheck`), not a reconstruction through the Node API
  // (issue 946).
  it('inspects the real component corpus, not a reconstruction of it', () => {
    const argv = assertGateArgv(packageJson, 'format:check', FORMAT_CHECK_ARGV);
    // Listed immediately either side of the invocation, deliberately rather than reusing the
    // module-level `components`: that binding is computed at load and separated from this run by
    // five async tests which each call `getFileInfo` over all 267 components, so comparing against
    // it would widen the window being described by seconds for no gain.
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

/** The diagnostic itself, called directly. */
describe('the report a failing format:check would actually print', () => {
  // The exit codes here are LITERALS, not `PRETTIER_OPERATIONAL_ERROR`/`PRETTIER_UNFORMATTED`, and
  // that is the difference between a test and a tautology.
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
    // The report's own notes, with Prettier's verbatim output cut off.
    const notes = report.slice(0, outputAt);

    assert.match(
      notes,
      /operational error/i,
      'exit 2 is not a formatting verdict, and the reader has to be told so'
    );
    // Named because their remedies are opposite.
    assert.match(notes, /No parser could be inferred/, 'name the permanent cause');
    assert.match(notes, /re-run/, 'and the remedy for the transient one');

    // The empty-glob message is pinned as UNDECIDABLE, and pinned because it has already regressed
    // once: a revision of this note bucketed it with the transient causes and told the reader to
    // re-run.
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

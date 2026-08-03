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
  'scripts/lib/foundryRunIdentity.js',
  'scripts/lib/foundryRunBudget.js',
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
  'scripts/view-lab-chrome.mjs',
  'scripts/view-lab-screenshots.mjs',
  'scripts/lib/viewLabIndex.js',
  'scripts/view-lab-index.mjs',
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
    const result = runPrettierCheck([...argv.slice(1), '--log-level', 'debug']);
    assert.equal(
      result.status,
      0,
      `expected the current repository to already satisfy format:check, got:\n${result.stdout}${result.stderr}`
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
      1,
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

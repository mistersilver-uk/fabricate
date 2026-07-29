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
 * So this test resolves the REAL `.prettierignore` (and `.gitignore`, which the Prettier 3 CLI
 * also honours by default) against every real component and asserts none of them is excluded.
 * It also pins the two `package.json` globs that must stay in step, because a scope that
 * `format` writes but `format:check` does not verify — or the reverse — is the same failure
 * wearing a different hat.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Deep entry point on purpose. `npm test` runs Node with `--conditions=browser` (the mounted
// component harness needs it), and Prettier's export map answers the `browser` condition with
// `standalone.mjs` — a bundle with no filesystem access, so no `getFileInfo`/`resolveConfig`.
// `prettier/index.mjs` is reachable through the package's `"./*"` export and is the Node build.
import * as prettier from 'prettier/index.mjs';
// The same walker `scripts/compare-svelte-render.mjs` uses, so "every component" means one thing.
import { listSvelteComponents } from '../scripts/lib/svelteComponentFiles.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const componentGlob = 'src/**/*.svelte';

// Mirrors the Prettier 3 CLI, which defaults `--ignore-path` to BOTH files. Passing them
// explicitly (rather than relying on the API default, which is no ignore file at all) is what
// makes this test read the repository's real exclusions instead of a convenient empty set.
const ignorePath = [path.join(repoRoot, '.gitignore'), path.join(repoRoot, '.prettierignore')];

const components = listSvelteComponents(path.join(repoRoot, 'src'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

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
  // unable to fix what CI rejects.
  it('names the component glob in both the format and format:check scripts', () => {
    for (const script of ['format', 'format:check']) {
      const command = packageJson.scripts?.[script];
      assert.ok(command, `package.json must define the ${script} script`);
      assert.ok(
        command.includes(componentGlob),
        `the ${script} script must cover "${componentGlob}", got: ${command}`
      );
    }
  });
});

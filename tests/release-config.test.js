import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * These tests exercise `release.config.js`, whose default export chooses its
 * plugin set from `GITHUB_REF_NAME`. Because ESM caches a module per specifier,
 * every re-import that must re-read the env var uses a DISTINCT `?v=N` query so
 * the module is re-evaluated. The classifier throw is pinned via the PURE
 * `classifyBranch` export — the default export cannot be relied on to throw
 * because it depends on an env var (and falls back to `main` when unset).
 */

const CONFIG_URL = new URL('../release.config.js', import.meta.url).href;
const GITHUB_PLUGIN = '@semantic-release/github';
const EXEC_PLUGIN = '@semantic-release/exec';

let importSeq = 0;

async function importFresh(refName) {
  process.env.GITHUB_REF_NAME = refName;
  importSeq += 1;
  return import(`${CONFIG_URL}?v=${importSeq}`);
}

async function loadDefault(refName) {
  const mod = await importFresh(refName);
  return mod.default;
}

async function loadClassifyBranch() {
  // Import under a KNOWN-safe ref so evaluating the default export never throws.
  const mod = await importFresh('main');
  return mod.classifyBranch;
}

function pluginName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function findPlugin(config, name) {
  return config.plugins.find((entry) => pluginName(entry) === name);
}

function pluginOptions(entry) {
  return Array.isArray(entry) ? entry[1] : undefined;
}

// ── classifyBranch: pure name → semantic-release branch TYPE ────────────────

const CLASSIFY_CASES = [
  { name: 'main', type: 'main' },
  { name: 'release', type: 'release' },
  { name: '1.4.x', type: 'maintenance' },
  { name: '2.0.x', type: 'maintenance' },
  { name: '10.20.x', type: 'maintenance' },
];

for (const { name, type } of CLASSIFY_CASES) {
  test(`classifyBranch('${name}') is '${type}'`, async () => {
    const classifyBranch = await loadClassifyBranch();
    assert.equal(classifyBranch(name), type);
  });
}

// `'1.x'` is load-bearing: it matches the SINGLE-numeric glob `+([0-9]).x`, not
// the maintenance glob `+([0-9]).+([0-9]).x`. Accepting it would mean the
// branches glob and the classifier regex have drifted apart, so it MUST throw.
const CLASSIFY_THROWS = [
  '1.x',
  '1',
  '1.4',
  '1.4.0',
  '1.4.x.5',
  'v1.4.x',
  'main-2',
  'feature/foo',
  'releases',
  '',
  undefined,
  null,
];

for (const bad of CLASSIFY_THROWS) {
  test(`classifyBranch(${JSON.stringify(bad)}) throws`, async () => {
    const classifyBranch = await loadClassifyBranch();
    assert.throws(() => classifyBranch(bad));
  });
}

// ── default export: plugin set per branch ───────────────────────────────────

test("main omits the github plugin (no public release object off 'main')", async () => {
  const config = await loadDefault('main');
  assert.equal(findPlugin(config, GITHUB_PLUGIN), undefined);
});

const GITHUB_PLUGIN_BRANCHES = ['release', '1.4.x'];

for (const ref of GITHUB_PLUGIN_BRANCHES) {
  test(`${ref} loads the github plugin with draftRelease: true`, async () => {
    const config = await loadDefault(ref);
    const github = findPlugin(config, GITHUB_PLUGIN);
    assert.ok(github, `expected a ${GITHUB_PLUGIN} entry on ${ref}`);
    assert.equal(pluginOptions(github).draftRelease, true);
  });
}

// The invariant that keeps early-access private: no branch may ever yield a
// github-plugin entry with `draftRelease: false`.
const ALL_BRANCH_REFS = ['main', 'release', '1.4.x', '2.0.x', '10.20.x'];

for (const ref of ALL_BRANCH_REFS) {
  test(`${ref} never yields draftRelease: false`, async () => {
    const config = await loadDefault(ref);
    const github = findPlugin(config, GITHUB_PLUGIN);
    if (github) {
      assert.notEqual(pluginOptions(github).draftRelease, false);
      assert.equal(pluginOptions(github).draftRelease, true);
    }
  });
}

// Unset GITHUB_REF_NAME falls back to `main` (the safe default): no github plugin.
test('unset GITHUB_REF_NAME defaults to main (no github plugin)', async () => {
  delete process.env.GITHUB_REF_NAME;
  importSeq += 1;
  const mod = await import(`${CONFIG_URL}?v=${importSeq}`);
  assert.equal(findPlugin(mod.default, GITHUB_PLUGIN), undefined);
});

// ── branches array shape ────────────────────────────────────────────────────

test('branches holds the maintenance glob, a non-prerelease release, and a beta main', async () => {
  const config = await loadDefault('main');
  const { branches } = config;

  assert.ok(branches.includes('+([0-9]).+([0-9]).x'), 'expected the maintenance glob in branches');

  const releaseEntry = branches.find(
    (b) => b === 'release' || (typeof b === 'object' && b.name === 'release')
  );
  assert.equal(releaseEntry, 'release', 'release must be a bare, non-prerelease entry');

  const mainEntry = branches.find((b) => typeof b === 'object' && b.name === 'main');
  assert.ok(mainEntry, 'expected a main branch object');
  assert.equal(mainEntry.prerelease, 'beta');
  assert.equal('channel' in mainEntry, false, "main entry must not carry a 'channel'");
});

// ── exec plugin: dist-version build + $GITHUB_OUTPUT emission ────────────────

test('exec plugin builds with --dist-version and never mutates tracked module.json', async () => {
  const config = await loadDefault('release');
  const exec = pluginOptions(findPlugin(config, EXEC_PLUGIN));
  assert.match(exec.prepareCmd, /--dist-version \$\{nextRelease\.version\}/);
  assert.doesNotMatch(exec.prepareCmd, /--version /);
});

test('exec plugin emits next_version and next_tag to $GITHUB_OUTPUT', async () => {
  const config = await loadDefault('release');
  const exec = pluginOptions(findPlugin(config, EXEC_PLUGIN));
  assert.match(exec.successCmd, /next_version=\$\{nextRelease\.version\}/);
  assert.match(exec.successCmd, /next_tag=\$\{nextRelease\.gitTag\}/);
  assert.match(exec.successCmd, /\$GITHUB_OUTPUT/);
});

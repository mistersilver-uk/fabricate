/**
 * `__FABRICATE_BUILD_VERSION__` MUST BE DEFINED IN THE `build` CONFIG AND ONLY THERE
 * (issue 1565).
 *
 * The module compares the version its running build was made from against the installed module
 * version to detect a stale cached entry script. That comparison is only as good as the define:
 * with it absent from a production build the identifier is a free variable, the `typeof` guard in
 * `src/main.js` yields `''`, and the check silently no-ops — the exact invisible failure this
 * change exists to remove, moved one layer down where no runtime test can see it.
 *
 * WHY `serve` MUST NOT CARRY IT, which is the other half of the invariant and the reason this file
 * asserts an absence as hard as it asserts a presence. `tests/helpers/extension-composition-
 * harness.js` starts Vite with `createServer({ root: repoRoot, ... })` and NO `configFile`, so
 * default config discovery loads the root `vite.config.js` and every mounted Svelte suite inherits
 * whatever the `serve` branch defines. Those suites install the View Lab Foundry shim, which
 * reports `0.0.0-viewlab` as the installed version of any module, and they dispatch `ready` — so a
 * baked version present in serve mode differs from the installed one and the stale-entry check
 * fires a user-facing "reload to complete the update" notice on every mounted run. Serve mode also
 * has nothing to detect: `npm run dev` reads its installed version from the same tracked
 * `module.json` the config falls back to, so the check would compare a value with itself. The
 * invariant is therefore uniform — the define exists in a production build and nowhere else —
 * and restoring symmetry between the two returns would reintroduce that notice.
 *
 * TWO CONFIGS, NOT ONE. `vite.config.js` returns EARLY for `command === 'serve'`, so each branch
 * is a separate object and each is asserted here against its own contract. Both assertions first
 * pin which branch they were handed (`server` versus `build`), so neither can pass vacuously if
 * the factory's shape changes.
 *
 * THE QUOTING IS PINNED, not incidental. A `define` value is substituted as an EXPRESSION, so
 * `1.9.5` would be spliced in as arithmetic and `0.1.0` is a syntax error that fails the build.
 * The value must therefore be a JSON-quoted string, and this asserts the quotes rather than the
 * parsed version.
 *
 * The config is re-imported per env value with a distinct `?v=N` query because ESM caches a
 * module per specifier (the precedent is `tests/release-config.test.js`). Unlike that file, this
 * one drags in `vite`, the Svelte plugin and `rollup-plugin-visualizer` — the first two are
 * already imported under this harness by `tests/components/overlay-portal-host-position.test.js`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_URL = new URL('../vite.config.js', import.meta.url).href;
const DEFINE_NAME = '__FABRICATE_BUILD_VERSION__';

/** The version the tracked manifest carries, which is the fallback when the env var is unset. */
const TRACKED_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'module.json'), 'utf8')).version;

let importSeq = 0;

/**
 * Re-evaluate `vite.config.js` with `FABRICATE_BUILD_VERSION` set (or removed) and return the
 * config it produces for one Vite command.
 *
 * @param {string|undefined} buildVersion The env value, or `undefined` to unset it.
 * @param {'serve'|'build'} command The Vite command to resolve the config for.
 * @returns {Promise<object>} The resolved config object.
 */
async function configFor(buildVersion, command) {
  if (buildVersion === undefined) delete process.env.FABRICATE_BUILD_VERSION;
  else process.env.FABRICATE_BUILD_VERSION = buildVersion;
  importSeq += 1;
  const mod = await import(`${CONFIG_URL}?v=${importSeq}`);
  // A function config is what `defineConfig` hands back untouched, so this IS the repo's factory.
  assert.equal(typeof mod.default, 'function', 'vite.config.js must export a config factory');
  return mod.default({ command, mode: command === 'serve' ? 'development' : 'production' });
}

/**
 * Resolve the `build` config and prove it is the tail return rather than the early `serve` one.
 *
 * @param {string|undefined} buildVersion The env value, or `undefined` to unset it.
 * @returns {Promise<object>} The build config object.
 */
async function buildConfigFor(buildVersion) {
  const config = await configFor(buildVersion, 'build');
  assert.ok(config.build, 'the build config must be the branch carrying `build` options');
  assert.ok(config.define, 'the build config must carry a define block');
  return config;
}

/**
 * Resolve the `serve` config and prove it is the early return rather than the tail `build` one.
 *
 * @param {string|undefined} buildVersion The env value, or `undefined` to unset it.
 * @returns {Promise<object>} The serve config object.
 */
async function serveConfigFor(buildVersion) {
  const config = await configFor(buildVersion, 'serve');
  assert.ok(config.server, 'the serve config must be the branch carrying `server` options');
  assert.ok(!config.build, 'the serve config must not be the build branch');
  return config;
}

test('the build config bakes FABRICATE_BUILD_VERSION as a JSON-quoted string', async () => {
  const config = await buildConfigFor('9.9.9-envtest');
  assert.equal(config.define[DEFINE_NAME], '"9.9.9-envtest"');
});

test('the build config falls back to the tracked module.json version', async () => {
  const config = await buildConfigFor(undefined);
  assert.equal(config.define[DEFINE_NAME], JSON.stringify(TRACKED_VERSION));
});

test('the build config treats an empty FABRICATE_BUILD_VERSION as unset', async () => {
  // An env var set to '' is how a shell passes "no value"; baking '' would make the runtime
  // guard read a known-empty version and stay silent forever.
  const config = await buildConfigFor('');
  assert.equal(config.define[DEFINE_NAME], JSON.stringify(TRACKED_VERSION));
});

for (const [label, envValue] of [
  ['set', '9.9.9-envtest'],
  ['unset', undefined],
  ['empty', ''],
]) {
  test(`the serve config defines no build version with FABRICATE_BUILD_VERSION ${label}`, async () => {
    // The absence is the product requirement, not a gap: see the file header. A define here is
    // inherited by every mounted suite (they start Vite on this repo root with no `configFile`)
    // and makes the stale-entry notice fire against the View Lab shim's `0.0.0-viewlab`.
    const config = await serveConfigFor(envValue);
    assert.ok(
      !Object.hasOwn(config.define ?? {}, DEFINE_NAME),
      `the serve config must not define ${DEFINE_NAME}; the mounted harness loads this config`
    );
    assert.equal(config.define?.[DEFINE_NAME], undefined);
  });
}

test('the baked value is a quoted string, never a bare expression', async () => {
  const config = await buildConfigFor('1.9.5');
  const baked = config.define[DEFINE_NAME];
  assert.ok(baked.startsWith('"') && baked.endsWith('"'), `must be JSON-quoted; got ${baked}`);
  // The real proof that it is substitutable: it parses as an expression on its own.
  assert.equal(JSON.parse(baked), '1.9.5');
});

test('the tracked module.json version is a non-empty string, so the fallback is real', () => {
  // Without this the fallback assertions above could pass vacuously against `undefined`.
  assert.equal(typeof TRACKED_VERSION, 'string');
  assert.ok(TRACKED_VERSION.length > 0, 'tracked module.json must carry a version');
});

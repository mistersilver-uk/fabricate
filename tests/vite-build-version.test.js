/**
 * `__FABRICATE_BUILD_VERSION__` MUST BE DEFINED IN EVERY CONFIG `vite.config.js` RETURNS
 * (issue 1565).
 *
 * The module compares the version its running build was made from against the installed module
 * version to detect a stale cached entry script. That comparison is only as good as the define:
 * with it absent the identifier is a free variable, the `typeof` guard in `src/main.js` yields
 * `''`, and the check silently no-ops — the exact invisible failure this change exists to remove,
 * moved one layer down where no runtime test can see it.
 *
 * TWO CONFIGS, NOT ONE. `vite.config.js` returns EARLY for `command === 'serve'`, so a define
 * added to the tail return alone would be missing from `npm run dev` and nothing would say so.
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

const COMMANDS = ['serve', 'build'];

for (const command of COMMANDS) {
  test(`the ${command} config bakes FABRICATE_BUILD_VERSION as a JSON-quoted string`, async () => {
    const config = await configFor('9.9.9-envtest', command);
    assert.ok(config.define, `the ${command} config must carry a define block`);
    assert.equal(config.define[DEFINE_NAME], '"9.9.9-envtest"');
  });

  test(`the ${command} config falls back to the tracked module.json version`, async () => {
    const config = await configFor(undefined, command);
    assert.equal(config.define[DEFINE_NAME], JSON.stringify(TRACKED_VERSION));
  });

  test(`the ${command} config treats an empty FABRICATE_BUILD_VERSION as unset`, async () => {
    // An env var set to '' is how a shell passes "no value"; baking '' would make the runtime
    // guard read a known-empty version and stay silent forever.
    const config = await configFor('', command);
    assert.equal(config.define[DEFINE_NAME], JSON.stringify(TRACKED_VERSION));
  });
}

test('both configs define the same value from one declaration', async () => {
  // Pinned as a PAIR rather than twice over, because the defect being guarded is divergence:
  // `serve` returns early, so the two returns are separate objects that can drift apart.
  const serve = await configFor('9.9.9-pairtest', 'serve');
  const build = await configFor('9.9.9-pairtest', 'build');
  assert.equal(serve.define[DEFINE_NAME], build.define[DEFINE_NAME]);
  assert.equal(build.define[DEFINE_NAME], '"9.9.9-pairtest"');
});

test('the baked value is a quoted string, never a bare expression', async () => {
  const config = await configFor('1.9.5', 'build');
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

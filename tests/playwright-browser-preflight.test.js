import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { INSTALL_HINT, assertChromiumInstalled } from './helpers/playwrightBrowserPreflight.js';

const TESTS = path.dirname(fileURLToPath(import.meta.url));
const GUARDED = path.join(TESTS, 'helpers', 'playwrightChromium.js');

test('a missing chromium binary throws naming the install command', () => {
  assert.throws(
    () => assertChromiumInstalled('/nowhere/chrome', () => false),
    (error) => error.message.includes('/nowhere/chrome') && error.message.includes(INSTALL_HINT)
  );
  assert.match(INSTALL_HINT, /npm run test:foundry:install/);
});

test('a present chromium binary passes silently', () => {
  assert.doesNotThrow(() => assertChromiumInstalled('/some/chrome', () => true));
});

test('importing the guarded chromium fails at load when no browser is installed', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'fabricate-no-browsers-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(GUARDED)});`],
      { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty }, encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0, 'the import must fail');
    assert.ok(result.stderr.includes(INSTALL_HINT), `stderr must name the fix:\n${result.stderr}`);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

function testSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testSources(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

// ESLint's no-restricted-imports does not see `import()`, so the dynamic spelling is checked here.
// Comment lines are dropped first: JSDoc names `import('playwright').Page` as a type only.
function code(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
    .join('\n');
}

test('no test reaches playwright except through the guarded helper', () => {
  const direct = /(?:from\s+|import\s*\(\s*)['"]playwright['"]/;
  const offenders = testSources(TESTS)
    .filter((file) => file !== GUARDED && direct.test(code(file)))
    .map((file) => path.relative(TESTS, file));
  assert.deepEqual(offenders, [], 'import chromium from tests/helpers/playwrightChromium.js');
});

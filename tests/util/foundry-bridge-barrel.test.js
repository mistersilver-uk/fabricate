/**
 * The barrel adds no symbol and renames none (issue 1668), and `FOUNDRY_BRIDGE_RAW_MODULES` names
 * exactly the modules it re-exports — a manifest short of one hangs every suite that declares it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { repoRoot } from '../helpers/sourceScan.js';

const BARREL_PATH = 'src/ui/svelte/util/foundryBridge.js';

const load = (modulePath) => import(pathToFileURL(resolve(repoRoot, modulePath)).href);

const barrel = await load(BARREL_PATH);
const concerns = FOUNDRY_BRIDGE_RAW_MODULES.filter((modulePath) => modulePath !== BARREL_PATH);
const namespaces = await Promise.all(
  concerns.map(async (modulePath) => [modulePath, await load(modulePath)])
);

test('the barrel names the same 28 symbols as its concern modules, together', () => {
  const owned = new Map();
  for (const [modulePath, namespace] of namespaces) {
    for (const name of Object.keys(namespace)) {
      assert.ok(!owned.has(name), `${name} is exported by both ${owned.get(name)} and ${modulePath}`);
      owned.set(name, modulePath);
    }
  }

  assert.equal(Object.keys(barrel).length, 28, 'the bridge surface is 28 symbols wide');
  assert.deepEqual(
    Object.keys(barrel).sort(),
    [...owned.keys()].sort(),
    'the barrel and the modules it re-exports must expose exactly the same names'
  );
});

test('every barrel export IS its module export, not a wrapper around one', () => {
  const byName = new Map();
  for (const [, namespace] of namespaces) {
    for (const [name, value] of Object.entries(namespace)) byName.set(name, value);
  }

  for (const name of Object.keys(barrel)) {
    assert.equal(
      barrel[name],
      byName.get(name),
      `${name} is not the binding its module exports; the barrel holds runtime code again`
    );
  }
});

test('FOUNDRY_BRIDGE_RAW_MODULES is the frozen closure a mounted manifest declares', () => {
  assert.ok(Object.isFrozen(FOUNDRY_BRIDGE_RAW_MODULES), 'a manifest a suite can mutate is not one');
  assert.ok(
    FOUNDRY_BRIDGE_RAW_MODULES.includes(BARREL_PATH),
    'the barrel itself is what the manifests name'
  );
  assert.equal(concerns.length, 8, 'the eight concern modules travel with it');
});

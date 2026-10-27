/**
 * The `init` handler's report of a refused Interactable config sheet registration (issue 1103):
 * `registerModuleHooks` composes `assignInteractableConfigSheet` with a console warning, which the
 * helper's own tests cannot see.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerModuleHooks } from '../../src/bootstrap/hooks.js';

class FakeRegionBehavior {}
class FakeRegionBehaviorConfig {}

/** Run the real `init` handler against fake Foundry globals and return the warnings it logged. */
async function warningsFromInit({ registerSheet, RegionBehaviorConfig, appsGetter }) {
  const handlers = new Map();
  const record = (event, handler) => handlers.set(event, handler);
  const apps = appsGetter ?? { DocumentSheetConfig: { registerSheet } };
  const fakes = {
    Hooks: { on: record, once: record },
    CONFIG: {},
    game: {},
    foundry: {
      documents: { RegionBehavior: FakeRegionBehavior },
      applications: { apps, sheets: { RegionBehaviorConfig } },
    },
  };
  const previous = Object.fromEntries(Object.keys(fakes).map((key) => [key, globalThis[key]]));
  const originalWarn = console.warn;
  const originalLog = console.log;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args);
  };
  console.log = () => {};
  Object.assign(globalThis, fakes);
  try {
    registerModuleHooks({ fabricate: {}, bindFabricateGlobal: () => {} });
    await handlers.get('init')();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    Object.assign(globalThis, previous);
  }
  return warnings.filter(([first]) => String(first).includes('config sheet registration failed'));
}

test('a registerSheet rejection is warned with the thrown error and init completes', async () => {
  const rejection = new Error('v14 reject');
  const warnings = await warningsFromInit({
    registerSheet: () => {
      throw rejection;
    },
    RegionBehaviorConfig: FakeRegionBehaviorConfig,
  });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0][1] === rejection, 'the warning carries the bound error');
});

test('a missing RegionBehaviorConfig is warned rather than skipped silently', async () => {
  const warnings = await warningsFromInit({
    registerSheet: () => {},
    RegionBehaviorConfig: undefined,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][1].message, /RegionBehaviorConfig/);
});

test('a throw while resolving the registrar is warned by the outer catch', async () => {
  const broken = new Error('registrar lookup broke');
  const warnings = await warningsFromInit({
    RegionBehaviorConfig: FakeRegionBehaviorConfig,
    appsGetter: {
      get DocumentSheetConfig() {
        throw broken;
      },
    },
  });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0][1] === broken);
});

test('a successful registration logs no warning', async () => {
  const registered = [];
  const warnings = await warningsFromInit({
    registerSheet: (...args) => {
      registered.push(args);
    },
    RegionBehaviorConfig: FakeRegionBehaviorConfig,
  });
  assert.deepEqual(warnings, []);
  assert.equal(registered.length, 1);
});

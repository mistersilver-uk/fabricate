/**
 * Two seams the frozen boot contract cannot carry, because both read a `src/bootstrap/` module that
 * the pre-change tree does not have: the one shared deprecation latch, and the GM recovery repairs
 * the module entry publishes to the facade.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withFabricateLifecycleReplay } from '../helpers/extension-composition-harness.js';

/** Every `Fabricate:` console warning one call produced. */
function captureWarnings(run) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    const [first] = args;
    if (typeof first === 'string' && first.startsWith('Fabricate: ')) warnings.push(first);
  };
  try {
    run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test('the bootstrap seams the entry wires are live', { timeout: 300000 }, async () => {
  await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
    globalThis.game.socket = { on: () => {}, off: () => {}, emit: () => {}, listeners: () => [] };
    await ready();
    const facade = globalThis.game.fabricate;

    // A GM recovery action wired to nothing answers the same `null` a clean world answers, so the
    // wiring is asserted rather than inferred.
    const { identityRepairsInstalled } = await loadModule('/src/bootstrap/migrations.js');
    assert.equal(identityRepairsInstalled(), true, 'the module entry installed both repairs');

    // The latch is shared: a name already warned through a slice member warns no second time
    // through the runtime module's own export. A slice with its own `Set` answers one warning.
    const { deprecate } = await loadModule('/src/bootstrap/gatheringRuntime.js');
    const first = captureWarnings(() => {
      try {
        facade.setGatheringPartyRegionOverride({});
      } catch {
        // The warning is the subject; the alias refuses on its arguments afterwards.
      }
    });
    assert.equal(first.length, 1, 'the slice member warns once');
    const second = captureWarnings(() =>
      deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride')
    );
    assert.deepEqual(second, [], 'one module-scope set holds every warned name');
  });
});

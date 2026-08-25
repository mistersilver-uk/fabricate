import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../../');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-record-inspector-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/gatheringImageDefaults.js',
    // The per-state tone / glyph / copy map (issue 1321), extracted out of
    // `CompositionStatePill.svelte`'s own `<script>` so the composition-state vocabulary can
    // be asserted against it. The pill is in `compiledModules` below, so this is a STATIC
    // import of the mounted graph; the map is import-free by design, which is why this chip
    // does not grow a `src/systems/` dependency and this single entry closes the edge.
    // Unlike its three sibling mount suites, this file goes through
    // `createMountedComponentHarness`, whose dependency-closure validator throws a named
    // "add it to rawModules" error for an omission. The other three hand-roll their compile
    // loops and report `# cancelled` behind one ERR_MODULE_NOT_FOUND instead, which is why
    // an omission there is far more dangerous than one here.
    'src/ui/svelte/apps/manager/environment/compositionStateMeta.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/environment/CompositionStatePill.svelte',
    'src/ui/svelte/apps/manager/environment/RuntimeStatePill.svelte',
    'src/ui/svelte/apps/manager/environment/MatchingEvidenceChips.svelte',
    'src/ui/svelte/apps/manager/environment/RecordInspector.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/environment/RecordInspector.svelte'
});

function makeTaskRecord(overrides = {}) {
  return {
    id: overrides.id || 'task1',
    name: overrides.name || 'Test Task',
    img: 'icons/svg/book.svg',
    nodes: overrides.nodes || {
      max: 10,
      current: 5,
      respawn: { policy: 'manual' }
    },
    ...overrides
  };
}

function makeEnvironment(overrides = {}) {
  return {
    id: overrides.id || 'env1',
    craftingSystemId: 'dnd5e',
    nodeRuntime: overrides.nodeRuntime || {},
    ...overrides
  };
}

function makeEntry(overrides = {}) {
  return {
    id: overrides.id || 'task1',
    record: overrides.record || makeTaskRecord(),
    compositionState: overrides.compositionState || 'candidate',
    runtimeState: overrides.runtimeState || 'unavailable',
    evidence: overrides.evidence || {},
    dropRateAdjustmentRows: overrides.dropRateAdjustmentRows || [],
    ...overrides
  };
}

function getNodeCountDisplay(root) {
  const countElement = root.querySelector('[data-node-count]');
  if (!countElement) return null;
  const strong = countElement.querySelector('strong');
  const span = countElement.querySelector('span:not([aria-hidden])');
  return {
    current: strong ? Number(strong.textContent) : null,
    max: span ? Number(span.textContent) : null
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecordInspector (mounted)', () => {
  describe('node capacity derivation (config-over-runtime precedence)', () => {
    it('reads max from config when both config and runtime have values', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { max: 10, current: 5, respawn: { policy: 'manual' } }
          })
        }),
        environment: makeEnvironment({
          nodeRuntime: {
            task1: { max: 20, current: 8 } // Runtime has different max
          }
        })
      });

      const display = getNodeCountDisplay(root);
      assert.equal(display.max, 10, 'Should read max from config (10), not runtime (20)');
    });

    it('falls back to runtime max only when config has no max', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { respawn: { policy: 'manual' } } // No max in config
          })
        }),
        environment: makeEnvironment({
          nodeRuntime: {
            task1: { max: 15, current: 8 }
          }
        })
      });

      const display = getNodeCountDisplay(root);
      assert.equal(display.max, 15, 'Should fall back to runtime max when config has none');
    });

    it('defaults to 0 when neither config nor runtime provides max', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { respawn: { policy: 'manual' } }
          })
        }),
        environment: makeEnvironment({ nodeRuntime: {} })
      });

      const hasNodesSection = root.querySelector('[data-record-inspector-section="nodes"]');
      assert.equal(hasNodesSection, null, 'Nodes section should not render when max is 0');
    });

    it('clamps runtime current to the config-derived max', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { max: 5, respawn: { policy: 'manual' } } // Config max is 5
          })
        }),
        environment: makeEnvironment({
          nodeRuntime: {
            task1: { max: 20, current: 18 } // Runtime current (18) exceeds config max (5)
          }
        })
      });

      const display = getNodeCountDisplay(root);
      assert.equal(display.current, 5, 'Current should be clamped to config max (5)');
      assert.equal(display.max, 5, 'Max should come from config (5)');
    });

    it('uses config current when no runtime entry exists', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { max: 10, current: 7, respawn: { policy: 'manual' } }
          })
        }),
        environment: makeEnvironment({ nodeRuntime: {} }) // No runtime entry
      });

      const display = getNodeCountDisplay(root);
      assert.equal(display.current, 7, 'Should use config current when no runtime entry');
      assert.equal(display.max, 10, 'Max should come from config');
    });

    it('falls back to max when config current is undefined', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: { max: 8, respawn: { policy: 'manual' } } // No current defined
          })
        }),
        environment: makeEnvironment({ nodeRuntime: {} })
      });

      const display = getNodeCountDisplay(root);
      assert.equal(display.current, 8, 'Should use max as fallback when no current defined');
    });

    it('shows read-only count for nonRegenerating pools', async () => {
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: {
              max: 5,
              current: 3,
              respawn: { policy: 'nonRegenerating' }
            }
          })
        }),
        environment: makeEnvironment()
      });

      const readonlySection = root.querySelector(
        '[data-record-inspector-section="nodes"] .manager-environment-node-count-readonly'
      );
      assert.ok(readonlySection, 'Should render read-only section for nonRegenerating pools');

      const display = getNodeCountDisplay(root);
      assert.equal(display.current, 3, 'Should display stored current');
      assert.equal(display.max, 5, 'Should display config max');
    });

    it('mirrors _mergeNodeConfigState clamping behavior exactly', async () => {
      // Scenario: GM lowered the task's max from 20 to 5, but the environment
      // runtime pool still has a current of 12 (from before the lowering).
      // The inspector must show 5 (clamped), matching what the runtime enforces.
      const root = await harness.mount({
        kind: 'task',
        entry: makeEntry({
          record: makeTaskRecord({
            nodes: {
              max: 5, // Lowered by GM
              current: 8, // Config's own current
              respawn: { policy: 'manual' }
            }
          })
        }),
        environment: makeEnvironment({
          nodeRuntime: {
            task1: {
              max: 20, // Old max before lowering
              current: 12 // Old current, exceeds new max
            }
          }
        })
      });

      const display = getNodeCountDisplay(root);
      assert.equal(
        display.current,
        5,
        'Should clamp runtime current to config max: Math.min(12, 5) = 5'
      );
      assert.equal(display.max, 5, 'Should read max from config: 5');
    });
  });

  describe('event entries (no nodes)', () => {
    it('does not render nodes section for events', async () => {
      const root = await harness.mount({
        kind: 'event',
        entry: makeEntry({
          record: { id: 'event1', name: 'Test Event' }
        }),
        environment: makeEnvironment()
      });

      const nodesSection = root.querySelector('[data-record-inspector-section="nodes"]');
      assert.equal(nodesSection, null, 'Nodes section should not render for events');
    });
  });
});

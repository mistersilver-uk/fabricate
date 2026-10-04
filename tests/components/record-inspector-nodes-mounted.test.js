/**
 * The available-node Stepper, mounted (issue 1522). It moved from the inspector rail into a
 * composition row's `CompositionOverrideBody`; the rail's read-only count is pinned by
 * `record-inspector-node-max.test.js`.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const BODY = 'src/ui/svelte/apps/manager/environment/CompositionOverrideBody.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-override-body-nodes-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/apps/manager/environment/recordNodePool.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    BODY,
  ],
  componentPath: BODY,
});

const SIBLING_POOL = Object.freeze({ 'other-task': { max: 2, current: 1 } });

function taskEntry(overrides = {}) {
  return {
    id: 'mine-ore',
    compositionState: 'includedByMatch',
    runtimeState: 'available',
    dropRateAdjustmentRows: [],
    record: { name: 'Mine Ore', nodes: { enabled: true, max: 5, current: 5 } },
    ...overrides,
  };
}

async function render(props = {}) {
  const patches = [];
  const root = await harness.mount({
    kind: 'task',
    environment: { id: 'environment-a', nodeRuntime: { ...SIBLING_POOL } },
    entry: taskEntry(),
    onUpdateEnvironment: (patch) => patches.push(patch),
    ...props,
  });
  return { root, patches };
}

const nodeSection = (root) => root.querySelector('[data-composition-override="nodes"]');
const nodeInput = (root) => nodeSection(root)?.querySelector('[data-node-count-input="mine-ore"]');

function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('CompositionOverrideBody available-node Stepper', () => {
  it('shows the stored pool, bounded 0..max', async () => {
    const { root } = await render({
      environment: { nodeRuntime: { 'mine-ore': { max: 5, current: 2 } } },
    });
    const input = nodeInput(root);
    assert.ok(Boolean(input), 'a regenerating pool renders the Stepper');
    assert.equal(input.value, '2');
    assert.equal(input.getAttribute('min'), '0');
    assert.equal(input.getAttribute('max'), '5');
  });

  it('writes the whole nodeRuntime map, keeping a sibling pool, through the input and adjuncts', async () => {
    const { root, patches } = await render({
      environment: { nodeRuntime: { ...SIBLING_POOL, 'mine-ore': { max: 5, current: 2 } } },
    });
    typeInto(nodeInput(root), '4');
    assert.deepEqual(patches.at(-1), {
      nodeRuntime: { ...SIBLING_POOL, 'mine-ore': { max: 5, current: 4 } },
    });
    nodeSection(root).querySelector('[data-stepper-decrement]').click();
    flushSync();
    assert.deepEqual(patches.at(-1), {
      nodeRuntime: { ...SIBLING_POOL, 'mine-ore': { max: 5, current: 1 } },
    });
  });

  it('seeds an unstored pool from the library config', async () => {
    const { root, patches } = await render();
    assert.equal(nodeInput(root).value, '5', 'no stored pool reads as full');
    typeInto(nodeInput(root), '3');
    assert.deepEqual(patches, [
      { nodeRuntime: { ...SIBLING_POOL, 'mine-ore': { enabled: true, max: 5, current: 3 } } },
    ]);
  });

  it('disables decrement at 0 and increment at max', async () => {
    let { root } = await render({ environment: { nodeRuntime: { 'mine-ore': { current: 0 } } } });
    assert.equal(nodeSection(root).querySelector('[data-stepper-decrement]').disabled, true);
    assert.equal(nodeSection(root).querySelector('[data-stepper-increment]').disabled, false);
    harness.remount();
    ({ root } = await render({ environment: { nodeRuntime: { 'mine-ore': { current: 5 } } } }));
    assert.equal(nodeSection(root).querySelector('[data-stepper-increment]').disabled, true);
  });

  it('draws no section for a task with no node config, or for an event', async () => {
    let { root } = await render({ entry: taskEntry({ record: { name: 'Forage' } }) });
    assert.ok(!nodeSection(root), 'a task with no capacity has no node section');
    harness.remount();
    ({ root } = await render({ kind: 'event', entry: taskEntry({ dropRateAdjustment: 0 }) }));
    assert.ok(!nodeSection(root), 'an event has no nodes');
  });

  // issue 301: a nonRegenerating pool can never be restocked.
  it('keeps a nonRegenerating pool read-only, with the no-restock hint', async () => {
    const nodes = { enabled: true, max: 5, current: 2, respawn: { policy: 'nonRegenerating' } };
    const { root } = await render({
      entry: taskEntry({ record: { name: 'Vein', nodes } }),
      environment: { nodeRuntime: { 'mine-ore': { ...nodes } } },
    });
    const section = nodeSection(root);
    assert.ok(!section.querySelector('.fab-stepper'), 'no Stepper for a permanent pool');
    assert.equal(
      section.querySelector('[data-node-count]').textContent.replace(/\s+/g, ' ').trim(),
      '2 / 5'
    );
    assert.ok(Boolean(section.querySelector('[data-node-no-restock-hint]')), 'the hint renders');
  });

  it('keeps the Stepper live for manual and overTime pools (regression)', async () => {
    for (const policy of ['manual', 'overTime']) {
      const nodes = { enabled: true, max: 5, current: 2, respawn: { policy } };
      const { root } = await render({ entry: taskEntry({ record: { name: 'Vein', nodes } }) });
      assert.equal(nodeInput(root).disabled, false, `the Stepper is live for ${policy}`);
      assert.ok(
        !root.querySelector('[data-node-no-restock-hint]'),
        `no restock hint for ${policy}`
      );
      harness.remount();
    }
  });
});

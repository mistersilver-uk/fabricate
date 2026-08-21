import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// The mount-time event-loop yield (issue 1278 fallout). Happy DOM memoizes `querySelector`
// results behind `WeakRef`s and V8 keeps a WeakRef's target strongly reachable for the rest of
// the job that read it, so a suite whose tests never await anything real pins every torn-down
// DOM tree — and its whole Svelte component graph — inside one turn. Left unyielded, the
// mounted manager suite needs over 2 GB of heap and can exhaust the machine; with the yield it
// runs green under `--max-old-space-size=768`. `EmptyState` is an import-free leaf, so this
// guards the harness contract rather than any one component.
describe('createMountedComponentHarness event-loop yield', () => {
  it('crosses a macrotask boundary before mounting, so the previous tree can be collected', async () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-svelte-harness-yield-',
      compiledModules: ['src/ui/svelte/apps/manager/EmptyState.svelte'],
      componentPath: 'src/ui/svelte/apps/manager/EmptyState.svelte'
    });
    await harness.setup();

    // Queued BEFORE mount(). `flushSync()` and `tick()` are microtasks, so this only runs
    // during mount() if mount() genuinely yields to a new event-loop turn first.
    let macrotaskRan = false;
    setImmediate(() => {
      macrotaskRan = true;
    });
    await harness.mount({ message: 'Nothing here yet' });

    assert.equal(
      macrotaskRan,
      true,
      'mount() must yield to a macrotask, or every mounted suite retains a DOM tree per test'
    );

    harness.teardown();
  });
});

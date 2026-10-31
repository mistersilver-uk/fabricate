/**
 * A suite's published entries on Fabricate's real Svelte runtime, through a fresh seam registered
 * with the adapter's own table, under a Fabricate window root (issues 2848 to 2851). Calling it
 * registers the suite's hooks, which assert that nothing escaped the seam and nothing was reported.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  shippedSeam,
} from './publishedComponentModules.js';
import { createMountedComponentHarness } from './svelte-component-harness.js';

/**
 * The suite's `ui()`, `freshTarget()`, an empty target the hooks remove, and
 * `mountEntry(name, props)`, which returns `{ target, handle }`.
 */
export function publishedEntrySeam(tmpPrefix) {
  const harness = createMountedComponentHarness({
    repoRoot: resolve(import.meta.dirname, '../..'),
    tmpPrefix,
    rawModules: PUBLISHED_RAW_MODULES,
    runeModules: PUBLISHED_RUNE_MODULES,
    compiledModules: PUBLISHED_COMPILED_MODULES,
    componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
  });
  let seamParts;
  let stopRecording;
  let reports = [];
  let escaped = [];
  let targets = [];

  before(async () => {
    await harness.setup();
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    seamParts = {
      createPublishedComponents,
      runtime,
      components,
      loaders: harnessLoaders(harness),
    };
    stopRecording = recordEscapes((error) => {
      escaped.push(error);
    });
  });
  after(() => {
    stopRecording();
    return harness.teardown();
  });
  beforeEach(() => {
    reports = [];
    escaped = [];
    targets = [];
  });
  afterEach(() => {
    for (const shell of targets) shell.remove();
    assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
    assert.deepEqual(reports, [], 'nothing was reported');
  });

  const ui = () =>
    shippedSeam({
      ...seamParts,
      report: (...args) => {
        reports.push(args);
      },
    });

  const freshTarget = () => fabricateTarget(targets);

  function mountEntry(name, props) {
    const target = freshTarget();
    return { target, handle: ui().mount(name, { target, props }) };
  }

  return { ui, freshTarget, mountEntry };
}

/**
 * A suite's published `ListRow` on Fabricate's real Svelte runtime, through a fresh seam registered
 * with the adapter's own table, under a Fabricate window root (issues 2850 and 2851). Calling it
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

/** The suite's `mountRow(props)`, over `name`, as `{ target, handle, row(), button(), mark() }`. */
export function publishedListRowSeam(tmpPrefix, name) {
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

  function mountRow(props = {}) {
    const target = fabricateTarget(targets);
    const handle = ui().mount('ListRow', { target, props: { name, ...props } });
    return {
      target,
      handle,
      row: () => target.querySelector('.fabricate-list-row'),
      button: () => target.querySelector('button.fabricate-list-row-open'),
      mark: () => target.querySelector('.fab-medallion'),
    };
  }

  return { ui, mountRow };
}

/**
 * `RunProgress` names each bar of its `StageBars` (issue 2455): an unnamed stage of several is
 * labelled "Stage n of m" through its own key, and a lone one takes the group's name, the kicker
 * when one is drawn and `ariaLabel` otherwise. A named stage of several reads "p%, stage n of m"
 * (issue 2610).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const UNNAMED = 'FABRICATE.Common.StageBars.Unnamed';
const POSITION = 'FABRICATE.Common.StageBars.Position';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-run-progress-',
  rawModules: FOUNDRY_BRIDGE_RAW_MODULES,
  compiledModules: ['FillBar', 'Kicker', 'StageBars', 'RunProgress'].map(component),
  componentPath: component('RunProgress'),
});

before(() => harness.setup());
afterEach(() => harness.remount());
after(() => harness.teardown());

const barsOf = (root) => [...root.querySelectorAll('[role="progressbar"]')];
const readingsOf = (root) => barsOf(root).map((bar) => bar.getAttribute('aria-valuetext'));

describe('RunProgress (mounted)', () => {
  it('labels each unnamed stage of several by its position, and a named one by its name', async () => {
    const root = await harness.mount({
      stages: [{ id: 'gather', name: 'Gather' }, { id: 'refine' }, { id: 'forge', stepName: '' }],
      current: 1,
      progress: 40,
      label: 'Progress',
    });
    assert.deepEqual(
      barsOf(root).map((bar) => [
        bar.getAttribute('aria-label'),
        bar.getAttribute('aria-valuenow'),
      ]),
      [
        ['Gather', '100'],
        [`${UNNAMED}:{"index":2,"count":3}`, '40'],
        [`${UNNAMED}:{"index":3,"count":3}`, '0'],
      ]
    );
    for (const bar of barsOf(root)) {
      assert.ok(!bar.hasAttribute('aria-labelledby'), 'a bar of several borrows no name');
    }
    assert.deepEqual(
      readingsOf(root),
      [`${POSITION}:{"percent":100,"index":1,"count":3}`, null, null],
      'a named stage of several reads its position, and an unnamed one, whose label states it, none'
    );
  });

  it('reads a named stage of several at its rounded percentage', async () => {
    const root = await harness.mount({
      stages: [{ name: 'Gather' }, { name: 'Refine' }, { id: 'x' }],
      current: 1,
      progress: 40.4,
      label: 'Progress',
    });
    assert.deepEqual(readingsOf(root), [
      `${POSITION}:{"percent":100,"index":1,"count":3}`,
      `${POSITION}:{"percent":40,"index":2,"count":3}`,
      null,
    ]);
  });

  it('reads a lone named stage by its percentage alone', async () => {
    const root = await harness.mount({
      stages: [{ name: 'Gather' }],
      progress: 30,
      label: 'Progress',
    });
    const [bar] = barsOf(root);
    assert.equal(bar.getAttribute('aria-label'), 'Gather');
    assert.ok(!bar.hasAttribute('aria-valuetext'), 'a lone stage has no position to state');
  });

  it('names an unnamed lone stage by the kicker it draws', async () => {
    const root = await harness.mount({ stages: [{ id: 'only' }], label: 'Progress' });
    const group = root.querySelector('[role="group"]');
    const kicker = group.getAttribute('aria-labelledby');
    assert.equal(root.querySelector(`[id="${kicker}"]`)?.textContent, 'Progress');
    const [bar] = barsOf(root);
    assert.equal(bar.getAttribute('aria-labelledby'), kicker, 'the lone bar takes the kicker');
    assert.ok(!bar.hasAttribute('aria-label'), 'and is not "Stage 1 of 1"');
  });

  it('names an unnamed lone stage by ariaLabel when it draws no kicker', async () => {
    const root = await harness.mount({ stages: [{ id: 'only' }], ariaLabel: 'Run progress' });
    assert.equal(root.querySelector('[role="group"]').getAttribute('aria-label'), 'Run progress');
    const [bar] = barsOf(root);
    assert.equal(bar.getAttribute('aria-label'), 'Run progress');
    assert.ok(!bar.hasAttribute('aria-labelledby'), 'exactly one naming route');
  });
});

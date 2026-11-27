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
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import { assertMatchesBaseline, normalizedMarkup } from '../helpers/markupBaseline.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const UNNAMED = 'FABRICATE.Common.StageBars.Unnamed';
const POSITION = 'FABRICATE.Common.StageBars.Position';

const repoRoot = resolve(import.meta.dirname, '../..');
const harness = createMountedComponentHarness({
  repoRoot,
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

  it('reads a named stage of several at its whole percentage, truncated', async () => {
    const refining = (progress) => ({
      stages: [{ name: 'Gather' }, { name: 'Refine' }, { id: 'x' }],
      current: 1,
      progress,
      label: 'Progress',
    });
    const root = await harness.mount(refining(40.4));
    assert.deepEqual(readingsOf(root), [
      `${POSITION}:{"percent":100,"index":1,"count":3}`,
      `${POSITION}:{"percent":40,"index":2,"count":3}`,
      null,
    ]);
    harness.remount();
    const nearlyDone = await harness.mount(refining(99.6));
    assert.equal(
      readingsOf(nearlyDone)[1],
      `${POSITION}:{"percent":99,"index":2,"count":3}`,
      'a stage short of done never reads 100%'
    );
  });

  it('reads each named stage of several in the shipped wording', async () => {
    const restoreI18n = installLangBackedI18n(repoRoot);
    try {
      const root = await harness.mount({
        stages: [{ name: 'Gather' }, { name: 'Refine' }, { id: 'x' }],
        current: 1,
        progress: 99.6,
        label: 'Progress',
      });
      assert.deepEqual(readingsOf(root), ['100%, stage 1 of 3', '99%, stage 2 of 3', null]);
    } finally {
      restoreI18n();
    }
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

  it('draws a failed stage in danger and reads it as failed, alone and among several', async () => {
    const restoreI18n = installLangBackedI18n(repoRoot);
    try {
      const lone = await harness.mount({
        stages: [{ name: 'Forge', status: 'failed' }],
        progress: 40,
        label: 'Progress',
      });
      assert.deepEqual(readingsOf(lone), ['40%, failed']);
      assert.equal(lone.querySelector('[data-stage-bars-state]').dataset.stageBarsState, 'danger');
      harness.remount();
      const several = await harness.mount({
        stages: [{ name: 'Draw', status: 'failed' }, { status: 'failed' }, { name: 'Temper' }],
        current: 2,
        label: 'Progress',
      });
      assert.deepEqual(readingsOf(several), [
        '100%, stage 1 of 3, failed',
        '100%, failed',
        '0%, stage 3 of 3',
      ]);
      assert.equal(barsOf(several)[1].getAttribute('aria-label'), 'Stage 2 of 3');
      assert.deepEqual(
        [...several.querySelectorAll('[data-stage-bars-state]')].map(
          (stage) => stage.dataset.stageBarsState
        ),
        ['danger', 'danger', 'accent']
      );
    } finally {
      restoreI18n();
    }
  });

  it('draws a note beside the kicker that describes the group, apart from the blocker', async () => {
    const root = await harness.mount({
      stages: [{ name: 'Shape' }],
      progress: 40,
      label: 'Progress',
      blocker: 'Waiting for the GM',
      note: 'Step 1: Shape 40 of 60',
    });
    const note = root.querySelector('[data-run-progress-note]');
    assert.equal(note.textContent, 'Step 1: Shape 40 of 60');
    assert.ok(!note.hasAttribute('data-run-progress-blocker'), 'the note is not the blocker');
    assert.equal(
      root.querySelector('[data-run-progress-blocker]').textContent,
      'Waiting for the GM'
    );
    assert.equal(root.querySelector('[role="group"]').getAttribute('aria-describedby'), note.id);
    harness.remount();
    const bare = await harness.mount({ stages: [{}], note: 'Step 1: Shape 40 of 60' });
    assert.ok(bare.querySelector(':scope .fab-run-progress-heading [data-run-progress-note]'));
    harness.remount();
    const none = await harness.mount({ stages: [{}], label: 'Progress' });
    assert.ok(!none.querySelector('[data-run-progress-note]'));
    assert.ok(!none.querySelector('[role="group"]').hasAttribute('aria-describedby'));
  });
});

const RUN_PROGRESS_BASELINE = resolve(import.meta.dirname, '../fixtures/runProgressBaseline.json');
/** The props `RunCard` and `RunDetail` pass, kept as the markup they drew before `status` and `note`. */
const RUN_PROGRESS_CALLERS = {
  card: { stages: [{}], current: 0, progress: 35, ariaLabel: 'Progress' },
  detail: {
    stages: [{ name: 'Gather', status: 'done' }, { stepName: 'Refine' }, {}],
    current: 1,
    progress: 40,
    blocker: 'Waiting for materials',
    label: 'Progress',
  },
  gate: { stages: [{}], current: 0, progress: 70, label: 'Progress' },
};

describe('RunProgress callers (mounted)', () => {
  it('draws every shipped caller as it drew before status and note', async () => {
    const found = {};
    for (const [caller, props] of Object.entries(RUN_PROGRESS_CALLERS)) {
      found[caller] = normalizedMarkup(await harness.mount(props));
      harness.remount();
    }
    assertMatchesBaseline(RUN_PROGRESS_BASELINE, found);
  });
});

/** The Checks Studio odds bars take their row's outcome-bounded tone (issue 2185), mounted. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  CHECK_EDITOR_RAW_MODULES,
  CHECKS_TREE_COMPILED_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PANEL = 'src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-check-odds-tone-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: [...CHECKS_TREE_COMPILED_MODULES],
  componentPath: PANEL,
});

const row = (id, success, percent = 25) => ({ id, label: id, percent, success });

/** Each bar's row id and the tone its fill is drawn in. */
async function tones(odds) {
  const target = await harness.mount({ odds: { enumerable: true, direction: 'over', ...odds } });
  return [...target.querySelectorAll('[data-banded-bar-track]')].map((track) => [
    track.dataset.bandedBarTrack,
    track.dataset.fillBarTone,
  ]);
}

describe('CheckOddsPanel bar tones (issue 2185)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws a lone botch in danger and a lone success in success', async () => {
    assert.deepEqual(await tones({ kind: 'passFail', rows: [row('botch', false, 100)] }), [
      ['botch', 'danger'],
    ]);
    assert.deepEqual(await tones({ kind: 'passFail', rows: [row('success', true, 100)] }), [
      ['success', 'success'],
    ]);
  });

  it('never draws a failing tier in a success hue beside the unrouted bucket', async () => {
    const rows = [row('unrouted', false), row('ruined', false), row('fine', true)];
    assert.deepEqual(await tones({ kind: 'routed', rows }), [
      ['unrouted', 'danger'],
      ['ruined', 'warning'],
      ['fine', 'accent'],
    ]);
  });

  it('floors a success at success, except where a progressive chart reads progress', async () => {
    const rows = [
      row('award-0', false),
      row('award-1', true),
      row('award-2', true),
      row('award-3', true),
    ];
    assert.deepEqual(await tones({ kind: 'routed', rows }), [
      ['award-0', 'danger'],
      ['award-1', 'success'],
      ['award-2', 'info'],
      ['award-3', 'accent'],
    ]);
    assert.deepEqual(await tones({ kind: 'progressive', rows }), [
      ['award-0', 'danger'],
      ['award-1', 'warning'],
      ['award-2', 'info'],
      ['award-3', 'accent'],
    ]);
  });
});

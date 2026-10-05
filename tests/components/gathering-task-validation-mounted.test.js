/** The gathering task editor's Validation tab, mounted, and its row action's wiring (issue 1522). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { gatheringTaskValidation } from '../../src/ui/svelte/apps/manager/gathering-task/gatheringTaskReadiness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  describeValidationAddressPairing,
  describeValidationHostContract,
} from '../helpers/validationAddressContracts.js';
import { railCounts, rowStatusTally } from '../helpers/validationSurfaceReadings.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-gathering-task-validation-',
  rawModules: FOUNDRY_BRIDGE_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/gathering-task/GatheringTaskValidationTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/gathering-task/GatheringTaskValidationTab.svelte',
});

const text = (_key, fallback) => fallback;
const drop = (id, componentId) => ({ id, componentId, quantity: 1, dropRate: 10 });

/** Mount the tab over one readiness reading, recording each row action. */
async function mountTab(context) {
  const selected = [];
  const root = await harness.mount({
    text,
    validation: gatheringTaskValidation(context, text),
    onSelectIssue: (...args) => {
      selected.push(args);
    },
  });
  const rows = () =>
    [...root.querySelectorAll(':scope [data-gathering-task-validation-check]')].map((row) => [
      row.dataset.gatheringTaskValidationCheck,
      /\bis-(pass|warn|block)\b/.exec(row.className)?.[1],
      row.querySelector('.manager-recipe-val-pill').textContent.trim(),
    ]);
  const verdict = () =>
    root.querySelector(':scope [data-editor-validation-summary]').dataset.editorValidationSummary;
  return { root, rows, verdict, selected };
}

describe('GatheringTaskValidationTab', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws a clean task as passing groups in tab order, with no View on a pass', async () => {
    const { root, rows, verdict } = await mountTab({
      task: { name: 'Forage', dropRows: [drop('a', 'c1')] },
      mode: 'd100',
      validation: { valid: true, errors: [] },
    });
    assert.ok(Boolean(root.querySelector('[data-gathering-task-validation]')), 'the editor hook');
    assert.deepEqual(
      [...root.querySelectorAll(':scope [data-validation-group]')].map(
        (group) => group.dataset.validationGroup
      ),
      ['overview', 'results']
    );
    assert.deepEqual(rows(), [
      ['name', 'pass', 'Pass'],
      ['results', 'pass', 'Pass'],
      ['rewardRule', 'pass', 'Pass'],
    ]);
    assert.equal(verdict(), 'pass');
    assert.match(root.textContent, /All clear/);
    assert.ok(!root.querySelector('[data-gathering-task-validation-view]'), 'nothing to fix');
  });

  it('draws warnings alone as saving with warnings', async () => {
    const { root, rows, verdict } = await mountTab({
      task: { name: 'Forage', dropRows: [drop('a', 'c1'), drop('b', 'c1')] },
      mode: 'd100',
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
    assert.deepEqual(rows().at(-1), ['rewardRule', 'warn', 'Warning']);
    assert.equal(verdict(), 'warn');
    assert.match(root.textContent, /Saves with warnings/);
    assert.deepEqual(railCounts(root), rowStatusTally(root), 'the counts are the rows');
  });

  it('draws each Save error as one row that blocks save, and routes its View', async () => {
    const errors = ['Task name is required', 'Task "x" check tier "Rich" needs one result group'];
    const { root, rows, verdict, selected } = await mountTab({
      task: { name: '' },
      mode: 'routed',
      validation: { valid: false, errors },
      routedOutcomeTiers: [{ id: 'rich', name: 'Rich' }],
    });
    assert.deepEqual(rows(), [
      ['name', 'block', 'Blocks save'],
      ['result-1', 'block', 'Blocks save'],
      ['routedTiers', 'pass', 'Pass'],
    ]);
    assert.equal(verdict(), 'block');
    assert.match(root.textContent, /Cannot be saved/);
    assert.match(root.textContent, /check tier "Rich" needs one result group/, 'the Save`s reason');
    assert.deepEqual(railCounts(root), { passing: 1, warnings: 0, blocking: errors.length });
    assert.deepEqual(railCounts(root), rowStatusTally(root), 'the counts are the rows');

    for (const id of ['name', 'result-1']) {
      root
        .querySelector(
          `[data-gathering-task-validation-check="${id}"] [data-gathering-task-validation-view]`
        )
        .click();
    }
    assert.deepEqual(selected, [
      ['overview', 'gathering-task-name'],
      ['results', undefined],
    ]);
  });
});

describeValidationAddressPairing({
  title: 'the gathering task name address the readiness emits is carried by the name input',
  producerFile: 'gathering-task/gatheringTaskReadiness.js',
  tableName: 'TASK_NAME_TARGET',
  tablePattern: /export const TASK_NAME_TARGET = ('[^']+');/u,
  addressPattern: /'([^']+)'/gu,
  expectedAddressCount: 1,
  expectation: 'the name input',
  destinations: { 'gathering-task-name': 'gathering-task/GatheringTaskOverviewTab.svelte' },
  routeNoun: 'tab',
  destinationNoun: 'tab',
});

describeValidationHostContract({
  title: 'GatheringTaskEditView wires the row action in the order the mechanism needs',
  hostFile: 'GatheringTaskEditView.svelte',
  tabComponent: 'GatheringTaskValidationTab',
  routeCall: 'onTabChange(route)',
  regionMarker: 'data-gathering-task-issue-announcement',
  regionOutsideNoun: 'tab chain',
  mustPrecede: [
    {
      marker: '{#if task}',
      present: 'the tab chain must exist',
      order: 'the region sits outside the tab chain',
    },
  ],
});

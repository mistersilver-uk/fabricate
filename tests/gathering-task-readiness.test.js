/** The gathering task editor's readiness rows, counts, verdict and notices (issue 1522). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TASK_NAME_TARGET,
  gatheringTaskReadiness,
  gatheringTaskValidation,
} from '../src/ui/svelte/apps/manager/gathering-task/gatheringTaskReadiness.js';

const text = (_key, fallback) => fallback;
const row = (id, componentId) => ({ id, componentId, quantity: 1, dropRate: 10 });
const statuses = (rows) => rows.map((entry) => [entry.id, entry.group, entry.status]);

describe('gatheringTaskReadiness', () => {
  it('passes a clean d100 task on its name, its drop rules and its reward rule', () => {
    const { rows, counts } = gatheringTaskReadiness({
      task: { name: 'Forage', dropRows: [row('a', 'c1'), row('b', 'c2')] },
      mode: 'd100',
      validation: { valid: true, errors: [] },
    });
    assert.deepEqual(statuses(rows), [
      ['name', 'overview', 'pass'],
      ['results', 'results', 'pass'],
      ['rewardRule', 'results', 'pass'],
    ]);
    assert.deepEqual(counts, { passing: 3, warnings: 0, blocking: 0 });
  });

  it('turns every error the Save reads into exactly one blocking row, the name first', () => {
    const errors = ['Task name is required', 'Task "unnamed" drop row "a" needs a component'];
    const { rows, counts } = gatheringTaskReadiness({
      task: { name: '  ', dropRows: [] },
      mode: 'd100',
      validation: { valid: false, errors },
    });
    assert.deepEqual(statuses(rows), [
      ['name', 'overview', 'block'],
      ['result-1', 'results', 'block'],
      ['rewardRule', 'results', 'pass'],
    ]);
    assert.deepEqual(
      rows.filter((entry) => entry.status === 'block').map((entry) => entry.message),
      errors
    );
    assert.equal(counts.blocking, errors.length, 'the blocking count is the error count');
  });

  it('files a named task`s errors under Results only', () => {
    const { rows } = gatheringTaskReadiness({
      task: { name: 'Ore' },
      mode: 'straight',
      validation: { valid: false, errors: ['Direct mode requires exactly one result group'] },
    });
    assert.deepEqual(statuses(rows), [
      ['name', 'overview', 'pass'],
      ['result-1', 'results', 'block'],
    ]);
  });

  it('warns, without blocking, of a routed task under a check with no tiers', () => {
    const { rows, counts } = gatheringTaskReadiness({
      task: { name: 'Ore' },
      mode: 'routed',
      validation: { valid: true, errors: [] },
      routedOutcomeTiers: [],
    });
    assert.deepEqual(statuses(rows).at(-1), ['routedTiers', 'results', 'warn']);
    assert.deepEqual(counts, { passing: 2, warnings: 1, blocking: 0 });
    const tiered = gatheringTaskReadiness({
      task: { name: 'Ore' },
      mode: 'routed',
      routedOutcomeTiers: [{ id: 'rich', name: 'Rich' }],
    });
    assert.equal(tiered.rows.at(-1).status, 'pass');
  });

  it('warns of a component on more than one drop row anywhere in the record', () => {
    const task = { name: 'Forage', dropRows: [row('a', 'c1'), row('b', 'c2'), row('c', 'c1')] };
    const warned = gatheringTaskReadiness({ task, mode: 'd100', rewardRules: null });
    assert.deepEqual(statuses(warned.rows).at(-1), ['rewardRule', 'results', 'warn']);
    const allDrops = gatheringTaskReadiness({
      task,
      mode: 'd100',
      rewardRules: { rewardSelectionMode: 'allDrops' },
    });
    assert.ok(
      allDrops.rows.every((entry) => entry.id !== 'rewardRule'),
      'an all-drops rule awards every row, so the check does not apply'
    );
  });

  it('runs no results check on a legacy Progressive task', () => {
    const { rows } = gatheringTaskReadiness({ task: { name: 'Old' }, mode: 'progressive' });
    assert.deepEqual(statuses(rows), [['name', 'overview', 'pass']]);
  });
});

describe('gatheringTaskValidation', () => {
  const blocked = () =>
    gatheringTaskValidation(
      {
        task: { name: '' },
        mode: 'routed',
        validation: { valid: false, errors: ['Task name is required', 'Rich tier needs a set'] },
        routedOutcomeTiers: [],
      },
      text
    );

  it('groups the rows in tab order, and counts them from the rows it draws', () => {
    const validation = blocked();
    assert.deepEqual(
      validation.groups.map((group) => [
        group.id,
        group.label,
        group.rows.map((entry) => entry.id),
      ]),
      [
        ['overview', 'Overview', ['name']],
        ['results', 'Results', ['result-1', 'routedTiers']],
      ]
    );
    const drawn = validation.groups.flatMap((group) => group.rows);
    assert.deepEqual(validation.counts, {
      passing: drawn.filter((entry) => entry.status === 'pass').length,
      warnings: drawn.filter((entry) => entry.status === 'warn').length,
      blocking: drawn.filter((entry) => entry.status === 'block').length,
    });
    assert.deepEqual(validation.marks, [
      { label: '2', tone: 'danger' },
      { label: '1', tone: 'warning' },
    ]);
  });

  it('says what Save prevents, and addresses each failing row', () => {
    const validation = blocked();
    assert.equal(validation.summary.status, 'block');
    assert.equal(validation.summary.title, 'Cannot be saved');
    const [name, result, tiers] = validation.groups.flatMap((group) => group.rows);
    assert.deepEqual(
      [name.target, name.focusTarget, name.title],
      ['overview', TASK_NAME_TARGET, 'It needs a name']
    );
    assert.deepEqual(
      [result.target, result.focusTarget, result.detail],
      ['results', undefined, 'Rich tier needs a set']
    );
    assert.equal(tiers.target, 'results');
  });

  it('shares one copy between a warning row and the Results notice that reads it', () => {
    const validation = blocked();
    assert.equal(
      validation.blockingNotice,
      '1 result issue blocks save',
      'the name is not a result'
    );
    assert.deepEqual(
      validation.warnings.map((entry) => [entry.id, entry.title]),
      [['routedTiers', 'Define outcome tiers in the gathering check before routing result sets.']]
    );
  });

  it('reads a clean task as all clear, with no marks, no notice and no View on a pass', () => {
    const validation = gatheringTaskValidation(
      { task: { name: 'Ore' }, mode: 'straight', validation: { valid: true, errors: [] } },
      text
    );
    assert.equal(validation.summary.title, 'All clear');
    assert.deepEqual(validation.marks, []);
    assert.equal(validation.blockingNotice, '');
    for (const entry of validation.groups.flatMap((group) => group.rows)) {
      assert.ok(!entry.target, `${entry.id} passes, so it has no address`);
    }
  });

  it('reads warnings alone as saving with warnings', () => {
    const validation = gatheringTaskValidation(
      { task: { name: 'Ore' }, mode: 'routed', routedOutcomeTiers: [] },
      text
    );
    assert.equal(validation.summary.status, 'warn');
    assert.equal(validation.summary.title, 'Saves with warnings');
  });
});

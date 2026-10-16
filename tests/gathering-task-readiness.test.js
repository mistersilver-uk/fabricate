/** The gathering task editor's readiness rows, counts, verdict and notices (issue 1522). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TASK_NAME_TARGET,
  gatheringTaskReadiness,
  gatheringTaskValidation,
  rowDetailOf,
} from '../src/ui/svelte/apps/manager/gathering-task/gatheringTaskReadiness.js';

import { createStore } from './helpers/manager/managerStoreFake.js';

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
      validation: { valid: false, errors, nameErrors: errors.slice(0, 1) },
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

  it('routes the name row on the store`s name errors, never on where they sit', () => {
    const errors = ['Rich tier needs a set', 'Task name is required'];
    const named = gatheringTaskReadiness({
      task: { name: '' },
      mode: 'routed',
      validation: { valid: false, errors, nameErrors: ['Task name is required'] },
      routedOutcomeTiers: [{ id: 'rich' }],
    });
    assert.deepEqual(
      named.rows.map((entry) => [entry.id, entry.status, entry.message]),
      [
        ['name', 'block', 'Task name is required'],
        ['result-1', 'block', 'Rich tier needs a set'],
        ['routedTiers', 'pass', undefined],
      ]
    );
    const unnamed = gatheringTaskReadiness({
      task: { name: '' },
      mode: 'straight',
      validation: { valid: false, errors: ['Name clash'] },
    });
    assert.deepEqual(
      statuses(unnamed.rows).slice(0, 2),
      [
        ['name', 'overview', 'pass'],
        ['result-1', 'results', 'block'],
      ],
      'an error the store does not file as a name error is not claimed by a blank name'
    );
  });

  it('passes a clean straight task on its name and its result set', () => {
    const { rows } = gatheringTaskReadiness({
      task: { name: 'Ore' },
      mode: 'straight',
      validation: { valid: true, errors: [] },
    });
    assert.deepEqual(statuses(rows), [
      ['name', 'overview', 'pass'],
      ['results', 'results', 'pass'],
    ]);
  });

  it('drops a blank error and trims the rest', () => {
    const { rows } = gatheringTaskReadiness({
      task: { name: 'Ore' },
      mode: 'straight',
      validation: { valid: false, errors: ['  ', ' x '] },
    });
    assert.deepEqual(
      rows.filter((entry) => entry.status === 'block').map((entry) => [entry.id, entry.message]),
      [['result-1', 'x']]
    );
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

  it('does not count drop rows with no component as a repeated component', () => {
    const task = { name: 'Forage', dropRows: [row('a', undefined), row('b', undefined)] };
    const { rows } = gatheringTaskReadiness({ task, mode: 'd100' });
    assert.deepEqual(statuses(rows).at(-1), ['rewardRule', 'results', 'pass']);
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
        validation: {
          valid: false,
          errors: ['Task name is required', 'Rich tier needs a set'],
          nameErrors: ['Task name is required'],
        },
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
      [name.target, name.focusTarget, name.title, name.detail],
      ['overview', TASK_NAME_TARGET, 'It needs a name', ''],
      'the name row says what to fix in its title, so it repeats no store sentence'
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

  it('titles a warning row by its check name and puts the sentence in its detail', () => {
    const rows = (context) =>
      gatheringTaskValidation(context, text)
        .groups.flatMap((group) => group.rows)
        .filter((entry) => entry.status === 'warn');
    assert.deepEqual(
      rows({ task: { name: 'Ore' }, mode: 'routed', routedOutcomeTiers: [] }).map((entry) => [
        entry.title,
        entry.detail,
      ]),
      [
        [
          'The gathering check defines outcome tiers',
          'Define outcome tiers in the gathering check before routing result sets.',
        ],
      ]
    );
    const [reward] = rows({
      task: { name: 'Ore', dropRows: [{ componentId: 'c' }, { componentId: 'c' }] },
      mode: 'd100',
    });
    assert.equal(reward.title, 'Each component has one drop row');
    assert.match(reward.detail, /^Multiple drop rows use this component/);
  });

  it('strips the internal task id from a store message shown as a row detail', () => {
    const errors = [
      'Task "hb-task-slowbloom" check tier "Abundant" requires one result group',
      'Task "Ore" result group "Ore" requires a result',
    ];
    const validation = gatheringTaskValidation(
      { task: { name: 'Ore' }, mode: 'routed', validation: { valid: false, errors } },
      text
    );
    assert.deepEqual(
      validation.groups
        .flatMap((group) => group.rows)
        .filter((entry) => entry.status === 'block')
        .map((entry) => entry.detail),
      ['Check tier "Abundant" requires one result group', 'Result group "Ore" requires a result']
    );
    assert.equal(rowDetailOf('Needs a thing'), 'Needs a thing', 'no prefix, no change');
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

  it('titles a straight task`s results row for its result set, not for drop rules', () => {
    const title = (validation) =>
      gatheringTaskValidation({ task: { name: 'Ore' }, mode: 'straight', validation }, text)
        .groups.flatMap((group) => group.rows)
        .find((entry) => entry.group === 'results').title;
    assert.equal(title({ valid: true, errors: [] }), 'Every result set is complete');
    assert.equal(title({ valid: false, errors: ['x'] }), 'The result sets are incomplete');
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

describe('the manager store double`s task validation', () => {
  const validate = (gatheringTaskValidation) =>
    createStore([], { gatheringTaskValidation }).validateGatheringLibraryTask({});

  it('refuses a fixture that blocks Save with no blocking row', () => {
    assert.throws(() => validate(() => ({ valid: false, errors: [] })), /store contract/);
    assert.throws(
      () => validate(() => ({ valid: false, errors: ['x'], nameErrors: ['y'] })),
      /store contract/,
      'a name error is one of the errors'
    );
  });

  it('blocks exactly when the fixture refuses Save', () => {
    for (const fixture of [
      undefined,
      () => ({ valid: false, errors: ['Name clash'] }),
      () => ({
        valid: false,
        errors: ['Task name is required'],
        nameErrors: ['Task name is required'],
      }),
    ]) {
      const validation = validate(fixture);
      const { counts } = gatheringTaskReadiness({
        task: { name: '' },
        mode: 'straight',
        validation,
      });
      assert.equal(counts.blocking > 0, !validation.valid);
    }
  });
});

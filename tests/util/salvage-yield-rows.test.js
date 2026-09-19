/**
 * The best-case salvage yield projection (issue 1695), tested directly now that it is a plain leaf
 * rather than a store-private helper. The store suites reach it through a loaded listing; these
 * assert the arithmetic per mode against the salvage projection alone.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  progressiveYieldRows,
  routedYieldRows,
  simpleYieldRows,
  yieldKeyOf,
  yieldRowsFor,
} from '../../src/ui/svelte/util/salvageYieldRows.js';

const result = (componentId, name, quantity = 1) => ({ componentId, name, quantity });
const stage = (id, componentId, name, threshold = 5) => ({ id, componentId, name, threshold });
const shape = (rows) => rows.map((row) => [row.componentId, row.quantity, row.guaranteedQuantity]);

describe('salvageYieldRows - simple', () => {
  it('guarantees the authored quantities when no check is usable', () => {
    const rows = simpleYieldRows({ results: [result('x', 'Shard', 2), result('y', 'Slag')] });
    assert.deepEqual(shape(rows), [
      ['x', 2, 2],
      ['y', 1, 1],
    ]);
  });

  it('guarantees nothing once a check can fail', () => {
    const rows = simpleYieldRows({ checkUsable: true, results: [result('x', 'Shard', 2)] });
    assert.deepEqual(shape(rows), [['x', 2, 0]]);
  });
});

describe('salvageYieldRows - routed', () => {
  const outcome = (id, success, results) => ({ id, success, results });

  it('takes the MAX over success outcomes and ignores a failure tier entirely', () => {
    const rows = routedYieldRows({
      routedOutcomes: [
        outcome('good', true, [result('x', 'Shard', 3)]),
        outcome('ok', true, [result('x', 'Shard')]),
        outcome('bad', false, [result('z', 'Dust', 9)]),
      ],
    });
    assert.deepEqual(shape(rows), [['x', 3, 0]], 'a failure tier is always reachable');
  });

  it('floors the guarantee at the MIN when every authored outcome succeeds', () => {
    const rows = routedYieldRows({
      routedOutcomes: [
        outcome('good', true, [result('x', 'Shard', 3)]),
        outcome('ok', true, [result('x', 'Shard')]),
      ],
    });
    assert.deepEqual(shape(rows), [['x', 3, 1]]);
  });

  it('guarantees nothing in FIXED mode, where the roll can miss every authored range', () => {
    const rows = routedYieldRows({
      routedType: 'fixed',
      routedOutcomes: [outcome('a', true, [result('x', 'Shard', 2)])],
    });
    assert.deepEqual(shape(rows), [['x', 2, 0]]);
  });

  it('contributes 0 for a success tier that authored no results at all', () => {
    const rows = routedYieldRows({
      routedOutcomes: [
        outcome('a', true, [result('x', 'Shard', 2)]),
        outcome('b', true, []),
      ],
    });
    assert.deepEqual(shape(rows), [['x', 2, 0]]);
  });
});

describe('salvageYieldRows - progressive', () => {
  it('counts one per stage and never guarantees any of them', () => {
    const rows = progressiveYieldRows({
      stages: [stage('s1', 'x', 'Shard'), stage('s2', 'x', 'Shard'), stage('s3', 'y', 'Slag')],
    });
    assert.deepEqual(shape(rows), [
      ['x', 2, 0],
      ['y', 1, 0],
    ]);
  });

  it('OMITS a stage unreachable at any budget', () => {
    const rows = progressiveYieldRows({
      stages: [stage('s1', 'x', 'Shard'), { ...stage('s2', 'y', 'Slag'), threshold: null }],
    });
    assert.deepEqual(shape(rows), [['x', 1, 0]]);
  });
});

describe('salvageYieldRows - the aggregation key', () => {
  it('keeps SAME-NAMED components apart, because the key is identity and not display name', () => {
    const rows = progressiveYieldRows({
      stages: [stage('s1', 'iron-a', 'Iron'), stage('s2', 'iron-b', 'Iron')],
    });
    assert.deepEqual(shape(rows), [
      ['iron-a', 1, 0],
      ['iron-b', 1, 0],
    ]);
  });

  it('falls back to a NAME-derived key only for a projection carrying no id', () => {
    assert.equal(yieldKeyOf({ componentId: 'x', name: 'Shard' }), 'x');
    assert.equal(yieldKeyOf({ name: 'Shard' }), 'name:Shard');
    assert.equal(yieldKeyOf({}), 'name:');
  });
});

describe('salvageYieldRows - the mode dispatch', () => {
  it('routes each mode to its own projection', () => {
    const simple = { mode: 'simple', results: [result('x', 'Shard')] };
    const routed = { mode: 'routed', routedOutcomes: [{ success: true, results: [result('y', 'Slag')] }] };
    const progressive = { mode: 'progressive', stages: [stage('s1', 'z', 'Dust')] };

    assert.deepEqual(shape(yieldRowsFor(simple)), [['x', 1, 1]]);
    assert.deepEqual(shape(yieldRowsFor(routed)), [['y', 1, 1]]);
    assert.deepEqual(shape(yieldRowsFor(progressive)), [['z', 1, 0]]);
  });

  it('projects nothing for a row with no salvage mode to dispatch on', () => {
    assert.deepEqual(yieldRowsFor(null), []);
    assert.deepEqual(yieldRowsFor({ mode: 'unknown' }), []);
  });
});

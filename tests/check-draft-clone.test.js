/** The Checks Studio's draft clones (issue 1721): defaults, detachment and the read aliases. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cloneCheckBreakage,
  cloneProgressiveCheck,
  cloneRoutedCheck,
  cloneSimpleCheck,
  readCheckActive,
} from '../src/ui/svelte/apps/manager/checks/checkDraftClone.js';

const EMPTY_BREAKAGE = Object.freeze({ triggers: [] });

describe('cloneCheckBreakage', () => {
  it('fills every trigger field and drops an unknown outcome to none', () => {
    const { triggers } = cloneCheckBreakage({
      triggers: [{ id: 't1', outcome: 'explode', condition: 'nat1' }],
    });
    assert.deepEqual(triggers, [
      {
        id: 't1',
        condition: null,
        outcome: 'none',
        breakTools: false,
        tierStep: { mode: 'none', steps: 1, tierId: null },
      },
    ]);
  });

  it('copies the condition and tier step rather than sharing them', () => {
    const source = {
      triggers: [
        {
          id: 't1',
          outcome: 'failure',
          breakTools: true,
          condition: { type: 'natural', value: 1 },
          tierStep: { mode: 'down', steps: 9, tierId: 'x' },
        },
      ],
    };
    const [trigger] = cloneCheckBreakage(source).triggers;
    assert.deepEqual(trigger.tierStep, { mode: 'down', steps: 9, tierId: 'x' }, 'unclamped');
    assert.equal(trigger.breakTools, true);
    assert.notEqual(trigger.condition, source.triggers[0].condition);
    assert.notEqual(trigger.tierStep, source.triggers[0].tierStep);
  });

  it('answers an empty trigger list for anything that is not an object', () => {
    for (const value of [undefined, null, 'x', { triggers: 'nope' }]) {
      assert.deepEqual(cloneCheckBreakage(value), EMPTY_BREAKAGE);
    }
  });
});

describe('cloneRoutedCheck', () => {
  it('defaults an absent config', () => {
    assert.deepEqual(cloneRoutedCheck(undefined), {
      type: 'relative',
      rollFormula: '',
      dc: 15,
      thresholdMode: 'meet',
      tiers: [],
      relativeOutcomes: [],
      fixedOutcomes: [],
      checkBreakage: EMPTY_BREAKAGE,
    });
  });

  it('folds the rollExpression read alias into rollFormula and never emits it', () => {
    const draft = cloneRoutedCheck({ rollExpression: '2d6' });
    assert.equal(draft.rollFormula, '2d6');
    assert.ok(!Object.hasOwn(draft, 'rollExpression'));
    assert.equal(cloneRoutedCheck({ rollFormula: '', rollExpression: '2d6' }).rollFormula, '');
  });

  it('truncates the DC and keeps the authored type and threshold', () => {
    const draft = cloneRoutedCheck({ type: 'fixed', dc: '12.9', thresholdMode: 'exceed' });
    assert.equal(draft.type, 'fixed');
    assert.equal(draft.dc, 12);
    assert.equal(draft.thresholdMode, 'exceed');
    assert.equal(cloneRoutedCheck({ dc: 'high' }).dc, 15);
  });

  it('copies each outcome and tier row', () => {
    const source = {
      tiers: [{ id: 'a' }],
      relativeOutcomes: [{ id: 'r' }],
      fixedOutcomes: [{ id: 'f' }],
    };
    const draft = cloneRoutedCheck(source);
    for (const key of ['tiers', 'relativeOutcomes', 'fixedOutcomes']) {
      assert.deepEqual(draft[key], source[key]);
      assert.notEqual(draft[key][0], source[key][0], `${key} rows are copies`);
    }
  });
});

describe('cloneSimpleCheck', () => {
  it('defaults an absent config', () => {
    assert.deepEqual(cloneSimpleCheck(null), {
      rollFormula: '',
      dc: 15,
      thresholdMode: 'meet',
      dcMode: 'static',
      tiers: [],
      macroUuid: null,
      checkBreakage: EMPTY_BREAKAGE,
    });
  });

  it('keeps a dynamic DC and its macro', () => {
    const draft = cloneSimpleCheck({
      dcMode: 'dynamic',
      macroUuid: 'Macro.m1',
      rollFormula: '1d20',
    });
    assert.equal(draft.dcMode, 'dynamic');
    assert.equal(draft.macroUuid, 'Macro.m1');
    assert.equal(draft.rollFormula, '1d20');
  });
});

describe('cloneProgressiveCheck', () => {
  it('defaults the award mode and attaches no preview when none is authored', () => {
    const draft = cloneProgressiveCheck({ awardMode: 'sideways' });
    assert.deepEqual(draft, { awardMode: 'equal', rollFormula: '', checkBreakage: EMPTY_BREAKAGE });
    assert.ok(!Object.hasOwn(draft, 'preview'), 'an absent sandbox stays absent');
  });

  it('carries an authored preview sandbox, in order', () => {
    const draft = cloneProgressiveCheck({
      awardMode: 'exceed',
      preview: { difficulties: [5, 2, 9] },
    });
    assert.equal(draft.awardMode, 'exceed');
    assert.deepEqual(draft.preview, { difficulties: [5, 2, 9] });
  });
});

describe('readCheckActive', () => {
  it('is true only for an enabled flag of exactly true', () => {
    assert.equal(readCheckActive({ enabled: true }), true);
    for (const value of [undefined, null, {}, { enabled: 'true' }, { enabled: 1 }]) {
      assert.equal(readCheckActive(value), false);
    }
  });
});

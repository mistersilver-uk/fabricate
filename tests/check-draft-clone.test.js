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
import { normalizeCheckAdvantage } from '../src/systems/normalize/checkAdvantage.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { normalizeSalvage } from '../src/systems/normalize/salvage.js';

const EMPTY_BREAKAGE = Object.freeze({ triggers: [] });
const DEFAULT_EVALUATION = Object.freeze(normalizeCheckEvaluation());
const DEFAULT_ADVANTAGE = Object.freeze(normalizeCheckAdvantage());
const AUTHORED_EVALUATION = normalizeCheckEvaluation({
  product: 'count',
  direction: 'under',
  target: { source: 'attribute', expression: '@skills.repair.value', baseAdjustment: -2 },
  pool: { die: 6, base: '@abilities.str.value', threshold: '5', required: 3 },
});

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
      evaluation: DEFAULT_EVALUATION,
      offerSituationalBonus: true,
      advantage: DEFAULT_ADVANTAGE,
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
      evaluation: DEFAULT_EVALUATION,
      offerSituationalBonus: true,
      advantage: DEFAULT_ADVANTAGE,
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
    assert.deepEqual(draft, {
      awardMode: 'equal',
      thresholdMode: 'meet',
      rollFormula: '',
      checkBreakage: EMPTY_BREAKAGE,
      evaluation: DEFAULT_EVALUATION,
      offerSituationalBonus: true,
      advantage: DEFAULT_ADVANTAGE,
    });
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

  it('carries the per-die comparison a counting check reads (issue 2067)', () => {
    assert.equal(cloneProgressiveCheck({ thresholdMode: 'exceed' }).thresholdMode, 'exceed');
    assert.equal(cloneProgressiveCheck({ thresholdMode: 'sideways' }).thresholdMode, 'meet');
  });
});

describe('the authored evaluation record', () => {
  for (const [name, clone] of [
    ['cloneRoutedCheck', cloneRoutedCheck],
    ['cloneSimpleCheck', cloneSimpleCheck],
    ['cloneProgressiveCheck', cloneProgressiveCheck],
  ]) {
    it(`${name} keeps it deep-equal and detached`, () => {
      const source = { evaluation: structuredClone(AUTHORED_EVALUATION) };
      const draft = clone(source);
      assert.deepEqual(draft.evaluation, AUTHORED_EVALUATION);
      assert.notEqual(draft.evaluation, source.evaluation);
      assert.notEqual(draft.evaluation.pool, source.evaluation.pool);
      assert.notEqual(draft.evaluation.target, source.evaluation.target);
    });
  }

  it('keeps tier and outcome difficulty siblings on the copied rows', () => {
    const draft = cloneRoutedCheck({
      tiers: [{ id: 't', dc: 12, adjustment: 1.5, successes: 3 }],
      relativeOutcomes: [{ id: 'o', dc: 0, adjustment: -1 }],
    });
    assert.deepEqual(draft.tiers[0], { id: 't', dc: 12, adjustment: 1.5, successes: 3 });
    assert.equal(draft.relativeOutcomes[0].adjustment, -1);
    assert.equal(cloneSimpleCheck({ tiers: [{ id: 't', successes: 4 }] }).tiers[0].successes, 4);
  });
});

describe('count data through update, save and reseed (issue 2004)', () => {
  const COUNT = normalizeCheckEvaluation({
    product: 'count',
    pool: {
      die: 10,
      base: '@skills.smith.rank + 2',
      threshold: '8',
      required: 2,
      explode: { enabled: true, faces: { kind: 'from', value: 9 }, once: true },
      cancel: { enabled: true, faces: { kind: 'worst', value: null } },
    },
  });

  for (const [name, clone] of [
    ['cloneRoutedCheck', cloneRoutedCheck],
    ['cloneSimpleCheck', cloneSimpleCheck],
    ['cloneProgressiveCheck', cloneProgressiveCheck],
  ]) {
    it(`${name} never aliases the count pool or its face rules`, () => {
      const source = { evaluation: structuredClone(COUNT) };
      const draft = clone(source);
      draft.evaluation.pool.explode.faces.value = 3;
      draft.evaluation.pool.cancel.enabled = false;
      draft.evaluation.pool.additionalDice.max = 5;
      assert.deepEqual(source.evaluation, COUNT, 'an update leaves the source untouched');
      const saved = clone(draft);
      assert.equal(saved.evaluation.pool.explode.faces.value, 3, 'the save keeps the edit');
      assert.notEqual(saved.evaluation.pool.explode, draft.evaluation.pool.explode);
      assert.notEqual(saved.evaluation.pool.cancel, draft.evaluation.pool.cancel);
      assert.deepEqual(clone(source).evaluation, COUNT, 'a reseed restores the authored pool');
    });
  }

  it('tier successes, zero included, copy onto detached rows', () => {
    const source = { tiers: [{ id: 't', dc: 12, successes: 0 }] };
    const draft = cloneSimpleCheck(source);
    draft.tiers[0].successes = 4;
    assert.equal(source.tiers[0].successes, 0);
    assert.equal(cloneSimpleCheck(draft).tiers[0].successes, 4);
    assert.equal(cloneRoutedCheck(source).tiers[0].successes, 0, 'zero is kept, not dropped');
  });

  it('a component successesOverride of 0 survives normalization, and null stays null', () => {
    assert.equal(normalizeSalvage({ successesOverride: 0 }).successesOverride, 0);
    assert.equal(normalizeSalvage({ successesOverride: null }).successesOverride, null);
    const source = { successesOverride: 2 };
    const normalized = normalizeSalvage(source);
    normalized.successesOverride = 5;
    assert.equal(source.successesOverride, 2);
  });
});

describe('the additional-dice resource name (issue 2008)', () => {
  for (const [name, clone] of [
    ['cloneRoutedCheck', cloneRoutedCheck],
    ['cloneSimpleCheck', cloneSimpleCheck],
    ['cloneProgressiveCheck', cloneProgressiveCheck],
  ]) {
    it(`${name} keeps the name through update, save and reseed`, () => {
      const additionalDice = { enabled: false, source: 'macro', label: ' Momentum ' };
      const source = { evaluation: { pool: { additionalDice } } };
      const draft = clone(source);
      assert.equal(draft.evaluation.pool.additionalDice.label, 'Momentum');
      draft.evaluation.pool.additionalDice.label = 'Focus';
      assert.equal(additionalDice.label, ' Momentum ', 'an update leaves the source untouched');
      assert.equal(clone(draft).evaluation.pool.additionalDice.label, 'Focus');
      draft.evaluation.pool.additionalDice.label = 7;
      assert.equal(clone(draft).evaluation.pool.additionalDice.label, '', 'never a non-string');
    });
  }
});

describe('the situational-bonus offer (issue 2005)', () => {
  for (const [name, clone] of [
    ['cloneRoutedCheck', cloneRoutedCheck],
    ['cloneSimpleCheck', cloneSimpleCheck],
    ['cloneProgressiveCheck', cloneProgressiveCheck],
  ]) {
    it(`${name} keeps an authored false and reads anything else as offered`, () => {
      assert.equal(clone({ offerSituationalBonus: false }).offerSituationalBonus, false);
      for (const offer of [undefined, null, true, 'false']) {
        assert.equal(clone({ offerSituationalBonus: offer }).offerSituationalBonus, true);
      }
    });

    it(`${name} rebaselines a saved false offer as clean`, () => {
      const saved = clone({ rollFormula: '1d20', offerSituationalBonus: false });
      assert.equal(JSON.stringify(clone(saved)), JSON.stringify(saved));
    });
  }
});

describe('the advantage record (issue 2007)', () => {
  const AUTHORED = Object.freeze({
    mode: 'bonus',
    extraDice: 3,
    bonusExpression: '1d8 + 1',
    offerDisadvantage: false,
    countEnabled: false,
    countDice: 4,
  });

  for (const [name, clone] of [
    ['cloneRoutedCheck', cloneRoutedCheck],
    ['cloneSimpleCheck', cloneSimpleCheck],
    ['cloneProgressiveCheck', cloneProgressiveCheck],
  ]) {
    it(`${name} keeps an authored record detached and rebaselines it clean`, () => {
      const source = { rollFormula: '1d20', advantage: { ...AUTHORED } };
      const draft = clone(source);
      assert.deepEqual(draft.advantage, AUTHORED);
      assert.notEqual(draft.advantage, source.advantage);
      draft.advantage.countDice = 2;
      assert.equal(source.advantage.countDice, 4, 'an edit leaves the source untouched');
      assert.equal(clone(draft).advantage.countDice, 2, 'the save keeps the edit');
      const saved = clone(source);
      assert.equal(JSON.stringify(clone(saved)), JSON.stringify(saved), 'a save rebaselines clean');
    });

    it(`${name} normalizes an out-of-range record as the save would`, () => {
      const draft = clone({ advantage: { mode: 'sideways', extraDice: 0, countDice: 6 } });
      assert.deepEqual(draft.advantage, { ...DEFAULT_ADVANTAGE, extraDice: 1, countDice: 5 });
    });
  }
});

describe('readCheckActive', () => {
  it('is true only for an enabled flag of exactly true', () => {
    assert.equal(readCheckActive({ enabled: true }), true);
    for (const value of [undefined, null, {}, { enabled: 'true' }, { enabled: 1 }]) {
      assert.equal(readCheckActive(value), false);
    }
  });
});

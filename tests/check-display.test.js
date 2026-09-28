/** Issue 2005 — the check display projection is an allowlist of plain, frozen, executed data. */
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckDisplay,
  executedCheckDisplay,
  executedCheckEvidence,
  foldTargetTerms,
  isPublicCheckDisplay,
  sanitizeTargetTerms,
} from '../src/ui/presenters/checkDisplay.js';

const PRIVATE = /SECRET_PATH|SECRET_LABEL|SECRET_POLICY|@skills/;

/** An authored evaluation carrying every private field a projection must never repeat. */
const EVALUATION = Object.freeze({
  product: 'sum',
  direction: 'under',
  target: {
    source: 'attribute',
    expression: '@skills.SECRET_PATH.value - 2',
    adjustmentKind: 'add',
    baseAdjustment: -2,
  },
  policy: 'SECRET_POLICY',
});

/** The executed `data` of a sum/under check: anchor 12, −2, library +1, then a situational 3. */
const EXECUTED = Object.freeze({
  product: 'sum',
  direction: 'under',
  comparison: 'meet',
  total: 9,
  target: 14,
  margin: 5,
  preRolls: [
    { source: 'situational', label: '', expression: '1d4', total: 3, destination: 'target' },
  ],
  targetTerms: [
    { kind: 'anchor', value: 12 },
    { kind: 'adjustment', value: -2 },
    { kind: 'benefit', value: 1, source: 'library' },
  ],
});

describe('foldTargetTerms', () => {
  it('reproduces the verification target of 14 from the terms and the pre-roll', () => {
    assert.equal(foldTargetTerms(EXECUTED.targetTerms, EXECUTED.preRolls), 14);
  });

  it('rounds each adjustment and multiplier down, as the resolver and the tiers do', () => {
    assert.equal(
      foldTargetTerms([
        { kind: 'anchor', value: 55 },
        { kind: 'multiplier', value: 0.5 },
      ]),
      27
    );
    assert.equal(
      foldTargetTerms([
        { kind: 'anchor', value: 12.5 },
        { kind: 'adjustment', value: 0.5 },
      ]),
      13
    );
  });

  it('answers null without a leading anchor or with a second one', () => {
    assert.equal(foldTargetTerms([{ kind: 'benefit', value: 1, source: 'tool' }]), null);
    assert.equal(
      foldTargetTerms([
        { kind: 'anchor', value: 1 },
        { kind: 'anchor', value: 2 },
      ]),
      null
    );
  });
});

describe('sanitizeTargetTerms', () => {
  it('keeps kind, value and a benefit source, and drops anything else a term carries', () => {
    const terms = sanitizeTargetTerms([
      { kind: 'anchor', value: 12, path: '@skills.SECRET_PATH.value', label: 'SECRET_LABEL' },
      { kind: 'benefit', value: 1, source: 'library', label: 'SECRET_LABEL' },
      { kind: 'adjustment', value: -2, source: 'library' },
      { kind: 'expression', value: 3 },
      { kind: 'benefit', value: Number.NaN, source: 'tool' },
    ]);
    assert.deepEqual(terms, [
      { kind: 'anchor', value: 12 },
      { kind: 'benefit', value: 1, source: 'library' },
      { kind: 'adjustment', value: -2 },
    ]);
  });
});

describe('executedCheckEvidence', () => {
  it('reads the executed data only, omitting what a legacy record lacks', () => {
    const { preRolls: _preRolls, targetTerms: _terms, ...legacy } = EXECUTED;
    const evidence = executedCheckEvidence(legacy);
    assert.deepEqual(evidence, { total: 9, target: 14, comparison: 'meet', margin: 5 });
    assert.ok(!Object.hasOwn(evidence, 'targetTerms'));
  });

  it('answers null for a refusal and for a check that never rolled', () => {
    assert.equal(executedCheckEvidence({ targetRefusal: 'unresolved-path' }), null);
    assert.equal(executedCheckEvidence({ dc: 12 }), null);
    assert.equal(executedCheckEvidence(null), null);
  });
});

describe('buildCheckDisplay', () => {
  it('never spreads the evaluation, its target expression or its policy (Q5)', () => {
    const display = buildCheckDisplay({
      evaluation: EVALUATION,
      target: 10,
      comparison: 'meet',
      terms: [{ kind: 'anchor', value: 12, path: '@skills.SECRET_PATH.value' }],
    });
    assert.deepEqual(display.evaluation, { product: 'sum', direction: 'under' });
    assert.deepEqual(Object.keys(display).sort(), [
      'comparison',
      'destination',
      'evaluation',
      'evidence',
      'target',
      'terms',
      'visibility',
    ]);
    assert.doesNotMatch(JSON.stringify(display), PRIVATE);
    assert.equal(display.destination, 'target', 'an under benefit raises the target');
  });

  it('is frozen all the way down', () => {
    const display = executedCheckDisplay({ data: EXECUTED, visibility: { rollMode: 'publicroll' } });
    assert.ok(Object.isFrozen(display));
    assert.ok(Object.isFrozen(display.evidence.targetTerms[0]));
    assert.throws(() => {
      display.evidence.target = 99;
    }, TypeError);
  });

  it('projects an executed result with its visibility, and a sum/over one with neither rows nor terms', () => {
    const under = executedCheckDisplay({
      data: EXECUTED,
      visibility: { rollMode: 'blindroll', secret: true, recipients: ['SECRET_LABEL'] },
    });
    assert.deepEqual(under.visibility, { rollMode: 'blindroll', secret: true });
    assert.equal(under.evidence.target, 14);
    assert.doesNotMatch(JSON.stringify(under), /SECRET_LABEL/);

    const over = executedCheckDisplay({
      data: { product: 'sum', direction: 'over', comparison: 'meet', total: 15, target: 12, margin: 3 },
    });
    assert.equal(over.destination, 'append');
    assert.equal(over.visibility, null, 'an unknown visibility is never read as public');
    assert.ok(!Object.hasOwn(over.evidence, 'targetTerms'));
  });
});

describe('isPublicCheckDisplay', () => {
  it('admits only a public, non-secret roll; an unknown visibility is never public', () => {
    const display = (visibility) => executedCheckDisplay({ data: EXECUTED, visibility });
    assert.equal(isPublicCheckDisplay(display({ rollMode: 'publicroll', secret: false })), true);
    for (const visibility of [
      { rollMode: 'publicroll', secret: true },
      { rollMode: 'gmroll' },
      { rollMode: 'blindroll' },
      { rollMode: 'selfroll' },
      { rollMode: 'public' },
      null,
    ]) {
      assert.equal(isPublicCheckDisplay(display(visibility)), false, JSON.stringify(visibility));
    }
    assert.equal(isPublicCheckDisplay(null), false);
  });

  it('keeps the executed target source beside its terms, and only there', () => {
    const withSource = executedCheckEvidence({ ...EXECUTED, targetSource: 'attribute' });
    assert.equal(withSource.targetSource, 'attribute');
    const { targetTerms: _terms, ...untermed } = EXECUTED;
    assert.ok(!Object.hasOwn(executedCheckEvidence({ ...untermed, targetSource: 'fixed' }), 'targetSource'));
    assert.ok(!Object.hasOwn(executedCheckEvidence({ ...EXECUTED, targetSource: '@x' }), 'targetSource'));
  });
});

describe('executedCheckEvidence (maintainer rulings, #2088 r1)', () => {
  it('keeps a difficulty step tier label, and a character value formula and name, only there', () => {
    const evidence = executedCheckEvidence({
      ...EXECUTED,
      targetSource: 'attribute',
      targetExpression: ' @skills.smith.level ',
      targetActor: 'Sera Vane',
      targetTerms: [
        { kind: 'anchor', value: 12, label: 'SECRET_LABEL' },
        { kind: 'adjustment', value: -2, label: 'Hard Work' },
        { kind: 'multiplier', value: 0.5, label: 7 },
        { kind: 'benefit', value: 1, source: 'library', label: 'SECRET_LABEL' },
      ],
    });
    assert.deepEqual(evidence.targetTerms, [
      { kind: 'anchor', value: 12 },
      { kind: 'adjustment', value: -2, label: 'Hard Work' },
      { kind: 'multiplier', value: 0.5 },
      { kind: 'benefit', value: 1, source: 'library' },
    ]);
    assert.equal(evidence.targetExpression, '@skills.smith.level');
    assert.equal(evidence.targetActor, 'Sera Vane');
    const fixed = executedCheckEvidence({
      ...EXECUTED,
      targetSource: 'fixed',
      targetExpression: '@x',
      targetActor: 'A',
    });
    assert.ok(!Object.hasOwn(fixed, 'targetExpression') && !Object.hasOwn(fixed, 'targetActor'));
  });

  it('keeps the executed formula and each die group kept faces for the dice line', () => {
    const evidence = executedCheckEvidence({
      ...EXECUTED,
      resolvedFormula: '3d6',
      diceGroups: [{ groupId: 0, group: '3d6', sum: 9, results: [2, 4, 'x', 3] }, { group: 7 }],
    });
    assert.equal(evidence.formula, '3d6');
    assert.deepEqual(evidence.dice, [{ group: '3d6', results: [2, 4, 3] }]);
    const legacy = executedCheckEvidence(EXECUTED);
    assert.ok(!Object.hasOwn(legacy, 'formula') && !Object.hasOwn(legacy, 'dice'));
  });
});

test('executedCheckEvidence drops a non-string or blank typed formula (QE r3 6)', () => {
  for (const rollFormula of [{ x: 1 }, 7, '  ']) {
    const evidence = executedCheckEvidence({ ...EXECUTED, resolvedFormula: '1d20', rollFormula });
    assert.equal(evidence.formula, '1d20', 'positive control: the resolved formula is kept');
    assert.ok(!Object.hasOwn(evidence, 'rollFormula'), JSON.stringify(rollFormula));
  }
});

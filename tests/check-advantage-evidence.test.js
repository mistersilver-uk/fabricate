/**
 * Issue 2007 — what a result box, result card and Journal row state for an executed bonus die
 * or count pool change, rolled through the real runner and read back through the one display
 * projection: a negated pre-roll lowers the target it names, and a removed die reads as
 * disadvantage.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { runFormulaPassFail } from '../src/systems/checkRoll.js';
import { executedCheckDisplay, foldTargetTerms } from '../src/ui/presenters/checkDisplay.js';
import { checkEvidenceRows } from '../src/ui/presenters/checkEvidenceRows.js';
import { countEvidenceRows, countSummaryText } from '../src/ui/presenters/countEvidenceRows.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation } from './helpers/countFixtures.js';
import { installTermBearingRoll } from './helpers/termBearingRoll.js';

const ACTOR = { name: 'Sera Vane', items: [], getRollData: () => ({}) };
const UNDER = Object.freeze({ product: 'sum', direction: 'under', target: { source: 'fixed' } });

let restore = () => {};
afterEach(() => restore());

/** A roll-under `1d20 + 3` against 12 under a bonus-die rule; the double's d8 rolls 5. */
async function rollUnder(choice, bonusExpression) {
  restore = installTermBearingRoll().restore;
  return runFormulaPassFail({
    formula: '1d20 + 3',
    dc: 12,
    actor: ACTOR,
    evaluation: UNDER,
    rollOptions: {
      interactive: true,
      reportVisibility: true,
      rollDecision: { advantage: choice },
      advantage: { mode: 'bonus', bonusExpression },
    },
  });
}

const rows = (display, build) => build(display, shippedLocalize).map(({ id, text }) => [id, text]);

describe('a roll-under bonus die', () => {
  it('Disadvantage names the unsigned pre-roll and the target it lowered', async () => {
    const result = await rollUnder('disadvantage', '1d8 + 1');
    assert.equal(result.data.target, 6);
    assert.equal(foldTargetTerms(result.data.targetTerms, result.data.preRolls), 6);
    assert.deepEqual(rows(executedCheckDisplay(result), checkEvidenceRows).slice(0, 2), [
      ['target', '6 · fixed, modifiers −6'],
      ['preRolled', 'Disadvantage 1d8 + 1 rolled 6, lowering the target'],
    ]);
  });

  it('Advantage names the pre-roll and the target it raised', async () => {
    const result = await rollUnder('advantage', '1d6');
    assert.equal(result.data.target, 16);
    assert.deepEqual(rows(executedCheckDisplay(result), checkEvidenceRows).slice(0, 2), [
      ['target', '16 · fixed, modifiers +4'],
      ['preRolled', 'Advantage 1d6 rolled 4, raising the target'],
    ]);
  });
});

/** A count check of 2d10 at 8+ with `choice` forwarded under `advantage`, its visibility reported. */
async function rollCount(advantage, choice, faces) {
  const dice = installCountDice({ faces, chat: false });
  restore = dice.restore;
  return runFormulaPassFail({
    formula: '',
    dc: 1,
    actor: ACTOR,
    evaluation: countEvaluation(),
    rollOptions: {
      interactive: true,
      reportVisibility: true,
      rollDecision: { advantage: choice },
      advantage,
    },
  });
}

describe('a counting pool change', () => {
  it('reads as the pool grown by the added dice', async () => {
    const result = await rollCount({ countDice: 3 }, 'advantage', [9, 3, 8, 1, 2]);
    assert.deepEqual(result.countDisplay.pool, {
      base: 2,
      terms: [{ source: 'advantage', value: 3 }],
      rolled: 5,
    });
    const display = executedCheckDisplay(result);
    assert.equal(
      countSummaryText(display, shippedLocalize),
      '5d10, each ≥ 8 (pool grown +3 by modifiers)'
    );
  });

  it('a pool that Disadvantage empties names disadvantage, not advantage', async () => {
    const result = await rollCount({ countDice: 3 }, 'disadvantage', []);
    const display = executedCheckDisplay(result);
    assert.equal(countSummaryText(display, shippedLocalize), '2d10 − 3 disadvantage = 0 dice');
    assert.deepEqual(rows(display, countEvidenceRows), [
      ['pool', 'Reduced to zero by a disadvantage penalty of −3'],
      ['result', 'A pool reduced to zero fails automatically. Nothing was rolled.'],
    ]);
  });
});

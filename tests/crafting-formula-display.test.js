/** Issue 3011 (P7) — the check formula line the crafting listing delegates to its own module. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  countFormulaDisplay,
  sumFormulaDisplay,
} from '../src/ui/presenters/craftingFormulaDisplay.js';

const refuse = () => {
  throw new Error('the resolver must not be asked');
};

describe('craftingFormulaDisplay', () => {
  it('states a summed formula unresolved, asking no resolver, when there is no actor', () => {
    const display = sumFormulaDisplay(
      { rollFormula: '1d20', craftingActor: null, system: {}, recipe: {}, evaluation: {} },
      { resolveCheckFormula: refuse }
    );
    assert.deepEqual(display, {
      rollFormula: '1d20',
      resolvedFormula: null,
      formulaResolved: null,
      appliedModifiers: [],
    });
  });

  it('states no summed formula, asking no resolver, for an empty one', () => {
    const display = sumFormulaDisplay(
      { rollFormula: '', craftingActor: { id: 'a' }, system: {}, recipe: {}, evaluation: {} },
      { resolveCheckFormula: refuse }
    );
    assert.equal(display.rollFormula, null);
    assert.equal(display.resolvedFormula, null);
  });

  it('states a count pool line unresolved when there is no actor', () => {
    const localize = (key, data) => `${key}:${JSON.stringify(data)}`;
    const display = countFormulaDisplay(
      {
        config: { thresholdMode: 'atLeast' },
        evaluation: { pool: { base: '5', die: 10, threshold: '8' }, direction: 'high' },
        craftingActor: null,
      },
      { localize }
    );
    assert.match(display.rollFormula, /^FABRICATE\.Check\.CountRoll\.Pool:/u);
    assert.deepEqual(
      { resolvedFormula: display.resolvedFormula, formulaResolved: display.formulaResolved },
      { resolvedFormula: null, formulaResolved: null }
    );
    assert.deepEqual(
      Object.keys(display).sort((left, right) => left.localeCompare(right)),
      ['formulaResolved', 'resolvedFormula', 'rollFormula']
    );
  });
});

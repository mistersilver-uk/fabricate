/**
 * The shared `<Stepper>` adjunct-name derivation (issue 1050).
 *
 * `stepper-call-site-contract.test.js` rules that every call site names its input and BOTH of its
 * adjuncts, and it accepts `{...stepperLabels(label)}` as satisfying all three. That acceptance is
 * only sound while this helper really returns all three, so this is the other half of that rule: it
 * is what stops the source scan reading a spread as coverage of something the spread does not
 * supply. A helper that silently dropped `decrementLabel` would otherwise ship an anonymous `−`
 * button on ~20 fields at once with the contract suite still green.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEPPER_DECREASE_KEY,
  STEPPER_INCREASE_KEY,
  stepperLabels,
} from '../../src/ui/svelte/components/stepperLabels.js';

/** `localize(key, data)` routes through `game.i18n.format`, so the stub records both. */
function stubI18n() {
  const formatted = [];
  globalThis.game = {
    i18n: {
      localize: (key) => key,
      format: (key, data) => {
        formatted.push({ key, data });
        return `${key}(${data.label})`;
      },
    },
  };
  return formatted;
}

afterEach(() => {
  delete globalThis.game;
});

describe('stepperLabels (issue 1050)', () => {
  it('names the input and both adjuncts from one field label', () => {
    stubI18n();
    assert.deepEqual(stepperLabels('Custom salvage DC'), {
      ariaLabel: 'Custom salvage DC',
      decrementLabel: `${STEPPER_DECREASE_KEY}(Custom salvage DC)`,
      incrementLabel: `${STEPPER_INCREASE_KEY}(Custom salvage DC)`,
    });
  });

  it('returns exactly those three props, which is what a spread call site relies on', () => {
    // `deepEqual` above already rejects an EXTRA key, but not the reading error this guards:
    // a call site spreads the result, so a fourth prop would land on the `<Stepper>` silently.
    stubI18n();
    assert.deepEqual(Object.keys(stepperLabels('DC')).sort(), [
      'ariaLabel',
      'decrementLabel',
      'incrementLabel',
    ]);
  });

  it('parametrizes the two shared keys on {label} rather than authoring a string per field', () => {
    // The whole reason one key serves every field. If either adjunct stopped passing `label`,
    // `localize` would take the no-data branch and return the raw key as the accessible name.
    const formatted = stubI18n();
    stepperLabels('Node count');
    assert.deepEqual(formatted, [
      { key: STEPPER_DECREASE_KEY, data: { label: 'Node count' } },
      { key: STEPPER_INCREASE_KEY, data: { label: 'Node count' } },
    ]);
  });

  it('leaves the label untranslated, because callers pass an already-localized one', () => {
    // `Stepper` is an import-free leaf that localizes nothing; its callers resolve the field's
    // own caption through `text(key, fallback)` first. A helper that localized the label again
    // would turn every caption into a missing-key echo.
    stubI18n();
    assert.equal(stepperLabels('Break below').ariaLabel, 'Break below');
  });
});

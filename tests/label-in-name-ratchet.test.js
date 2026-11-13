/**
 * Issue 2869 — the in-app label-in-name ratchet's own comparison: a button whose `aria-label`
 * omits its visible text is named, one that holds it is not, an `aria-hidden` glyph is no label,
 * and each name the five sites carried before the fix is refused. The mounted suites that draw those
 * sites call `assertButtonsHoldTheirLabels` on their markup.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { buttonsBreakingLabelInName } from './helpers/labelInNameRatchet.js';

const rootOf = (html) => {
  const root = new Window().document.createElement('div');
  root.innerHTML = html;
  return root;
};

describe('the in-app label-in-name ratchet', () => {
  it('names a button whose aria-label omits its visible text', () => {
    const root = rootOf(
      '<button data-a aria-label="Save Tool rules"><i aria-hidden="true">x</i><span>Save rules</span></button>'
    );
    assert.deepEqual(buttonsBreakingLabelInName(root), [
      { hook: 'data-a', name: 'Save Tool rules', label: 'Save rules' },
    ]);
  });

  it('refuses each name the five sites carried before the fix', () => {
    const pairs = [
      ['Back to the Tool Rules list', 'Back to Tool Rules'],
      ['Save Tool rules', 'Save rules'],
      ['Open this component in Forge', 'View system rules'],
      ['Add Iron to Forge', 'Add to system'],
      ['Spend one use of Tome', 'Expend use'],
    ];
    for (const [name, label] of pairs) {
      const root = rootOf(`<button aria-label="${name}"><span>${label}</span></button>`);
      assert.equal(buttonsBreakingLabelInName(root).length, 1, name);
    }
  });

  it('passes a name that holds the visible text, and a button with no aria-label or no text', () => {
    const root = rootOf(
      '<button aria-label="Save rules for this Tool"><span>Save rules</span></button>' +
        '<button><span>Save</span></button>' +
        '<button aria-label="Close"><i aria-hidden="true">x</i></button>'
    );
    assert.deepEqual(buttonsBreakingLabelInName(root), []);
  });
});

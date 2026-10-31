/**
 * The published `Field`'s `size`, `face`, `type` and `invalid` (issue 2848): each draws its class
 * on the column, an update changes or removes it in the same column with the companion's control
 * and its focus kept, and a value outside its set draws the default.
 * Limit: happy-dom lays nothing out, so the drawn heights, corners, faces, step buttons and error
 * face are `field-forms-rendered.test.js`'s; a rule's reach is read off `matches`, which
 * happy-dom caches per element, so it is read once per selector.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-field-forms-');
const COLUMN = Object.freeze({ as: 'div', children: true });
const KEYS = Object.freeze(['size', 'face', 'type', 'invalid']);

/** The control the field's chrome draws, its rung rule's subject, by the root class it needs. */
const CHROME = (rootClass) =>
  `.fabricate-field.fabricate-field.${rootClass} input:not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])`;

/** A field mounted with `props`, a companion's input of `inputType` in its slot: its parts. */
async function mountField(props, inputType = 'text') {
  const { target, handle } = mountEntry('Field', { ...COLUMN, ...props });
  await settle();
  const input = document.createElement('input');
  input.type = inputType;
  handle.slot('children').append(input);
  return { target, handle, input, column: () => target.firstElementChild };
}

/** Each key's published values and the class each writes, and values that draw the default. */
const FORMS = Object.freeze({
  size: {
    drawn: [
      [26, 'is-size-26'],
      [28, 'is-size-28'],
      [30, 'is-size-30'],
      [34, 'is-size-34'],
      ['28', 'is-size-28'],
      ['34', 'is-size-34'],
    ],
    defaulted: [38, '38', 44, 36, ' 30', '30px', '30.5', null, 0, true],
  },
  face: {
    drawn: [
      ['serif', 'is-face-serif'],
      ['mono', 'is-face-mono'],
    ],
    defaulted: ['sans', 'Mono', 'cursive', 1, null],
  },
  type: { drawn: [['number', 'is-type-number']], defaulted: ['text', 'Number', 'range', true] },
  invalid: { drawn: [[true, 'is-invalid']], defaulted: [false, 'true', 1, null] },
});

describe('the published Field describes its form keys', () => {
  it('lists each as an optional data key after as and children', () => {
    const { props } = ui().describe('Field');
    assert.deepEqual(Object.keys(props), ['as', 'children', ...KEYS]);
    for (const key of KEYS) {
      assert.deepEqual(props[key], { kind: 'data', required: false }, key);
    }
  });
});

for (const [key, { drawn, defaulted }] of Object.entries(FORMS)) {
  describe(`the published Field ${key}`, () => {
    for (const [value, written] of drawn) {
      it(`writes ${written} for ${JSON.stringify(value)}, and an update without it removes it in the same column`, async () => {
        const { handle, input, column } = await mountField({ [key]: value });
        const root = column();
        assert.equal(root.className, `fabricate-field ${written}`);
        input.focus();
        assert.equal(handle.update(COLUMN), true);
        await settle();
        assert.ok(column() === root, 'the same column');
        assert.equal(root.className, 'fabricate-field', 'the default writes no class');
        assert.ok(handle.slot('children').contains(input), 'the control stays in the slot');
        assert.ok(document.activeElement === input, 'and keeps focus');
        handle.destroy();
      });
    }

    for (const value of defaulted) {
      it(`draws the default for ${JSON.stringify(value)}`, async () => {
        const { handle, column } = await mountField({ [key]: value });
        assert.equal(column().className, 'fabricate-field');
        handle.destroy();
      });
    }
  });
}

describe('the published Field updates a form key in place', () => {
  it('moves the rung from 26 to 34, then adds the face, type and error state, in one column', async () => {
    const { handle, input, column } = await mountField({ size: 26 }, 'number');
    const root = column();
    assert.ok(input.matches(CHROME('is-size-26')), 'the 26 rung reaches the number input');
    assert.equal(handle.update({ ...COLUMN, size: 34 }), true);
    await settle();
    assert.equal(root.className, 'fabricate-field is-size-34');
    const all = { ...COLUMN, size: 28, face: 'mono', type: 'number', invalid: true };
    assert.equal(handle.update(all), true);
    await settle();
    assert.ok(column() === root, 'the same column');
    assert.equal(
      root.className,
      'fabricate-field is-size-28 is-face-mono is-type-number is-invalid',
      'each key writes its own class'
    );
    assert.ok(
      input.matches(".fabricate-field.fabricate-field.is-type-number input[type='number']")
    );
    handle.destroy();
  });
});

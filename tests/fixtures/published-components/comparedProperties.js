/**
 * The computed properties `re-rooted-controls-host-independence.test.js` compares across its three
 * hosts, which the standalone style root's rendered admission test compares too (issue 2456).
 */

/** The six properties acceptance 2 compares, computed, per control, across the three hosts. */
export const COMPARED = Object.freeze([
  'min-height',
  'border-radius',
  'box-sizing',
  'line-height',
  'font-family',
  'font-size',
]);

/** And on the card's own `<section>`: the padding, and the hairline border on every edge. */
export const CARD_COMPARED = Object.freeze([
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'display',
  'flex-direction',
  'gap',
  'min-height',
  'font-family',
  'font-size',
  'line-height',
]);

/** What acceptance 2 compares on the switch itself: its root `<button>`, which is the control. */
export const TOGGLE_COMPARED = Object.freeze([
  'max-width',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'display',
  'align-items',
  'gap',
  'font-family',
  'font-size',
  'line-height',
]);

/** The 38x22 rail and the 18x18 knob, which is the geometry the switch is recognisable by. */
export const TOGGLE_TRACK_COMPARED = Object.freeze([
  'width',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'background-clip',
  'box-sizing',
  'padding-top',
  'display',
  'align-items',
]);

export const TOGGLE_KNOB_COMPARED = Object.freeze([
  'width',
  'height',
  'border-radius',
  'background-color',
  'display',
  'margin-left',
]);

/** The reading beside the rail, whose type is the family's own at (0,2,0). */
export const TOGGLE_LABEL_COMPARED = Object.freeze([
  'font-size',
  'font-weight',
  'line-height',
  'overflow',
  'text-overflow',
]);

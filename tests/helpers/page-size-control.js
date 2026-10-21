/** Drives a pager's segmented page-size control from a mounted suite. */
import assert from 'node:assert/strict';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';

const group = (scope) => `${scope} [data-pagination-size]`.trim();

/** Chooses a page size the way a reader does: a click on the segment's label, never its radio. */
export function choosePageSize(root, scope, value) {
  const label = root.querySelector(`${group(scope)} [data-pagination-size-option="${value}"]`);
  assert.ok(Boolean(label), `${group(scope)} offers no page size ${value}`);
  label.click();
  flushSync();
}

/** The page sizes the control offers, in order, as the strings the segments are labelled with. */
export function pageSizeValues(root, scope = '') {
  return [...root.querySelectorAll(`${group(scope)} input[type="radio"]`)].map(
    (radio) => radio.value
  );
}

/** The page size currently chosen, or `null` when no control is drawn. */
export function pageSizeValue(root, scope = '') {
  return root.querySelector(`${group(scope)} input[type="radio"]:checked`)?.value ?? null;
}

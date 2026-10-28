/** The shared frame's report of an emptied bulk selection, held for each world catalogue. */
import assert from 'node:assert/strict';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';

const REGION = '[data-scoped-list-selection-announce]';
const TOOLBAR = '[data-scoped-list-toolbar]';

/** Focus `selector` inside `target`, so the pressed control holds the keyboard when it unmounts. */
export function focusControl(target, selector) {
  const control = target.querySelector(selector);
  assert.ok(Boolean(control), `no control matches ${selector}`);
  control.focus();
  assert.ok(document.activeElement === control, `${selector} did not take focus`);
  return control;
}

/**
 * Run `empty()` on a mounted catalogue whose selection is ticked, then hold the contract: the
 * polite region was empty before, the keyboard ends on the list toolbar, and the region says the
 * selection was cleared once the focus utterance has had its turn.
 */
export async function expectEmptiedSelectionReport(target, empty) {
  const region = () => target.querySelector(REGION);
  const toolbar = target.querySelector(TOOLBAR);
  assert.ok(Boolean(region()), 'the frame renders its report region');
  assert.equal(region().getAttribute('aria-live'), 'polite');
  assert.equal(region().textContent.trim(), '', 'the region is empty before the selection empties');

  await empty();
  await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
  flushSync();

  assert.ok(document.activeElement === toolbar, 'focus is re-homed on the list toolbar');
  assert.equal(region().textContent.trim(), 'Selection cleared.');
}

/** Whether, after `untick()` empties the selection, the frame reported nothing and moved nothing. */
export async function expectNoEmptiedSelectionReport(target, untick) {
  await untick();
  await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
  flushSync();
  assert.equal(target.querySelector(REGION).textContent.trim(), '', 'unticking reports nothing');
  assert.ok(
    document.activeElement !== target.querySelector(TOOLBAR),
    'and does not move the keyboard to the toolbar'
  );
}

/*
 * DRIVING A CONVERTED `<Select>` FROM A MOUNTED SUITE (issue 1504).
 *
 * Ten mounted suites drove the manager's page-size, category, check-tier and sort controls
 * as native `<select>`s: set `.value`, dispatch `change`, read `querySelectorAll('option')`.
 * Every one of those three moves is gone. The control is a `<button>` that opens a portaled
 * panel of `[role="option"]` rows, so choosing a value is TWO clicks and reading the offered
 * values means opening the panel first.
 *
 * IT IS ONE HELPER RATHER THAN TEN COPIES for two reasons. The mechanical one: the panel
 * is PORTALED to the nearest Fabricate application root, which in a mounted suite is the
 * harness's own mount target — so the row is NOT a descendant of the trigger's container, and a
 * suite that reached for it through the trigger's own subtree would find nothing. That is a fact
 * about the primitive, worth stating once. The other is that near-identical blocks repeated
 * across ten files are what the duplication gate exists to catch.
 *
 * `root` is always the harness's mount target — the element `createMountedComponentHarness`
 * gives `rootClass` to. A suite whose production host is the player window must declare
 * `rootClass: 'fabricate-app'`, or its panel portals to `<body>` and every lookup here misses.
 */
import assert from 'node:assert/strict';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';

/** The portaled panel a `<Select>` opens, addressed from the application root it lands on. */
const PANEL = '.fabricate-select-popover';

/**
 * Opens a converted select's panel and returns it.
 *
 * @param {HTMLElement} root The harness mount target, which is the portal host.
 * @param {string} triggerSelector A selector for the trigger — normally the call site's own
 *   stable `data-*` hook, which rides across the conversion onto the trigger button.
 * @returns {HTMLElement} The open panel.
 */
export function openSelectPanel(root, triggerSelector) {
  const trigger = root.querySelector(triggerSelector);
  assert.ok(Boolean(trigger), `no converted select trigger matches ${triggerSelector}`);
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click();
    flushSync();
  }
  const panel = root.querySelector(PANEL);
  assert.ok(
    Boolean(panel),
    `${triggerSelector} opened no panel. The panel is portaled to the nearest application root, ` +
      'so a suite whose production host is not the manager must pass `rootClass`'
  );
  // AND IT IS THIS TRIGGER'S PANEL. The lookup above is by CLASS over the whole portal host, so
  // it returns the first `<Select>` panel in the root rather than the one just opened — correct
  // today only because one panel can be open at a time, and silently wrong the moment a case
  // leaves an earlier select open. The combobox's own `aria-controls` is the binding the
  // primitive already publishes, so the pairing is asserted rather than assumed, and a miss
  // reports as a mismatched id instead of as an option this panel does not offer.
  const list = panel.querySelector('[role="listbox"]');
  assert.ok(Boolean(list), `${triggerSelector} opened a panel that renders no option list`);
  assert.equal(
    trigger.getAttribute('aria-controls'),
    list.id,
    `${triggerSelector} did not open the panel found: the trigger drives another list`
  );
  return panel;
}

/**
 * Chooses a value on a converted select, the way a GM does: open, then click the row.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 * @param {string|number} value The option's own value, as the caller declared it.
 * @returns {void}
 */
export function chooseSelectOption(root, triggerSelector, value) {
  const panel = openSelectPanel(root, triggerSelector);
  const wanted = String(value);
  const row = panel.querySelector(`[data-popover-option="${wanted}"]`);
  assert.ok(
    Boolean(row),
    `${triggerSelector} offers no option ${wanted}; it offers ` +
      (optionValuesIn(panel).join(', ') || '(nothing)')
  );
  row.click();
  flushSync();
}

/**
 * Every value a converted select currently offers, in rendered order.
 *
 * Indexed over `[role="option"]` rather than over `[data-popover-option]`, so a row that lost
 * its identity handle is a MISSING value here rather than an invisible absence.
 *
 * @param {HTMLElement} panel An open panel.
 * @returns {string[]} The values, in rendered order.
 */
export function optionValuesIn(panel) {
  return [...panel.querySelectorAll('[role="option"]')].map(
    (row) => row.getAttribute('data-popover-option') ?? ''
  );
}

/**
 * Every value a converted select offers, opening it first.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 * @returns {string[]} The values, in rendered order.
 */
export function selectOptionValues(root, triggerSelector) {
  return optionValuesIn(openSelectPanel(root, triggerSelector));
}

/**
 * Every label a converted select offers, opening it first.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 * @returns {string[]} The rendered labels, in rendered order.
 */
export function selectOptionLabels(root, triggerSelector) {
  const panel = openSelectPanel(root, triggerSelector);
  return [...panel.querySelectorAll('[role="option"]')].map((row) =>
    row.textContent.replaceAll(/\s+/g, ' ').trim()
  );
}

/**
 * The value a converted select currently shows on its trigger.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 * @returns {string} The rendered trigger text.
 */
export function selectTriggerText(root, triggerSelector) {
  const trigger = root.querySelector(triggerSelector);
  assert.ok(Boolean(trigger), `no converted select trigger matches ${triggerSelector}`);
  return trigger.querySelector('.fabricate-select-value')?.textContent?.trim() ?? '';
}

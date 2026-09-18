/**
 * DRIVING A CONVERTED `<Select>` FROM A MOUNTED SUITE (issue 1504). `root` is always the harness's
 * mount target — the element `createMountedComponentHarness` gives `rootClass` to.
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
  // AND IT IS THIS TRIGGER'S PANEL.
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
 * Closes a converted select's panel, the way clicking away from it does (issue 1510).
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 */
export function closeSelectPanel(root, triggerSelector) {
  const trigger = root.querySelector(triggerSelector);
  assert.ok(Boolean(trigger), `no converted select trigger matches ${triggerSelector}`);
  if (trigger.getAttribute('aria-expanded') !== 'true') return;
  trigger.click();
  flushSync();
  assert.equal(
    trigger.getAttribute('aria-expanded'),
    'false',
    `${triggerSelector} did not close when its trigger was clicked a second time`
  );
}

/**
 * Every value a converted select currently offers, in rendered order.
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

/**
 * The accessible NAME a converted trigger actually resolves to, asserted non-empty (issue 1510).
 * WHY A POSITIVE ASSERTION RATHER THAN A WARNING COUNT.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger — normally the call site's own hook.
 * @returns {string} The resolved name, so a suite can pin it against a pre-conversion value.
 */
export function assertSelectHasResolvedName(root, triggerSelector) {
  const trigger = root.querySelector(triggerSelector);
  assert.ok(Boolean(trigger), `no converted select trigger matches ${triggerSelector}`);

  const labelledBy = trigger.getAttribute('aria-labelledby');
  if (labelledBy) {
    // THE DOCUMENT, not `root`. The caption may sit outside the harness mount target when a
    // suite mounts a portaled surface, and an `aria-labelledby` is resolved against the whole
    // document either way — so scoping the lookup here would report a working name as broken.
    const caption = trigger.ownerDocument.getElementById(labelledBy);
    const name = caption?.textContent?.replaceAll(/\s+/gu, ' ').trim() ?? '';
    assert.ok(
      name.length > 0,
      `${triggerSelector} points \`aria-labelledby\` at "${labelledBy}", which names ` +
        `${caption ? 'an empty element' : 'no element in the document'}. A demoted wrapper whose ` +
        'caption never received its `id` fails here — and the primitive does not warn about it, ' +
        'because it was given a name prop.'
    );
    return name;
  }

  const ariaLabel = trigger.getAttribute('aria-label') ?? '';
  assert.ok(
    ariaLabel.trim().length > 0,
    `${triggerSelector} resolves to no accessible name at all: no \`aria-labelledby\` and no ` +
      '`aria-label` on the trigger'
  );
  return ariaLabel.trim();
}

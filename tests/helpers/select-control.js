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
 * Closes a converted select's panel, the way clicking away from it does (issue 1510).
 *
 * WHY A SUITE NEEDS THIS AT ALL. {@link openSelectPanel} finds the panel by CLASS over the whole
 * portal host and then proves the pairing through `aria-controls` — which is what turns "an
 * earlier select is still open" from a silently wrong reading into a named failure. In a real
 * browser the earlier panel would already be gone: `dismissOnOutsideClick` listens on `mousedown`
 * and a pointer press on the next trigger fires one. A mounted suite's `.click()` fires no
 * `mousedown` at all, so nothing dismisses anything and a screen with two converted controls
 * leaves both panels in the DOM. Reading one list and then another therefore needs the first
 * closed explicitly.
 *
 * Closing is the trigger's own toggle rather than a synthesized outside click, because that is
 * the affordance the primitive publishes and the one a keyboard user reaches.
 *
 * @param {HTMLElement} root The harness mount target.
 * @param {string} triggerSelector A selector for the trigger.
 * @returns {void}
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

/**
 * The accessible NAME a converted trigger actually resolves to, asserted non-empty (issue 1510).
 *
 * WHY A POSITIVE ASSERTION RATHER THAN A WARNING COUNT. `Select.svelte` warns only when all three
 * name props are absent, so "no `Fabricate | Select:` warning" proves AT LEAST ONE name rather
 * than the right one — and it is entirely silent for a demoted wrapper whose caption never
 * received its `id`, which is the exact defect the demotion rule can introduce. This resolves the
 * name the way an assistive technology does — `aria-labelledby` first, then `aria-label` — and
 * reds when the pointer names nothing, so a caption with no `id` fails here by name.
 *
 * It does NOT assert "never both". `Select.svelte` writes at most one of the two onto the trigger
 * by construction, so a DOM-level clause could never red; the check that can is the SOURCE-level
 * one over call sites, which is a different artifact.
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

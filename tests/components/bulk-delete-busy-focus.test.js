/* In a real browser: disabling the focused delete control blurs it, and its busy face does not (issue 1132). */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CARD_PATH = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';

const card = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-delete-focus-',
  // The card's ONE shared leaf (issue 1157).
  rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
  compiledModules: [
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    CARD_PATH,
  ],
  componentPath: CARD_PATH,
});

/** Focus the armed control, then disable it natively, as a caller's `disabled` does. */
function measureDisableWhileFocused() {
  const button = document.querySelector('.fab-bulk-delete-card .fabricate-button');
  if (!button) return { rendered: false };

  const events = [];
  button.addEventListener('blur', () => events.push('blur'));
  button.focus();
  const focusedBefore = document.activeElement === button;

  button.disabled = true;

  return {
    rendered: true,
    focusedBefore,
    blurCount: events.filter((name) => name === 'blur').length,
    focusedAfter: document.activeElement === button,
    activeAfter: document.activeElement?.tagName || '',
  };
}

/** Focus the armed control, then give it the busy render's attributes, as the caller's `busy` does. */
function measureBusyTransition(busyAttributes) {
  const button = document.querySelector('.fab-bulk-delete-card .fabricate-button');
  if (!button) return { rendered: false };

  const events = [];
  button.addEventListener('blur', () => {
    events.push('blur');
  });
  button.focus();
  const focusedBefore = document.activeElement === button;

  for (const name of button.getAttributeNames()) {
    if (!Object.hasOwn(busyAttributes, name)) button.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(busyAttributes)) button.setAttribute(name, value);

  return {
    rendered: true,
    focusedBefore,
    busyMatch: button.getAttribute('aria-busy') === 'true',
    blurCount: events.length,
    focusedAfter: document.activeElement === button,
    disabledMatch: button.matches(':disabled'),
  };
}

/** Load the product markup into a fresh page of `browser` and run `measure` against it. */
async function measureIn(browser, markup, measure, arg = null) {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${markup}</body></html>`,
    { waitUntil: 'load' }
  );
  return page.evaluate(measure, arg);
}

let measured = null;
let transition = null;
let sameNode = false;

// One mount and one browser launch for both describes: the armed markup, then the attributes
// the same control renders once its caller sets `busy`.
before(async () => {
  let markup;
  let busyAttributes;
  await card.setup();
  try {
    const target = await card.mount({
      token: 'delete-recipes',
      heading: 'Delete selected recipes',
      rows: [{ key: 'recipes', text: '3 recipes will be deleted.' }],
      idleLabel: 'Delete 3 recipes',
      armedLabel: 'Confirm delete',
      busyLabel: 'Deleting…',
      idleAriaLabel: 'Delete 3 recipes',
      armedAriaLabel: 'Confirm delete — 3 recipe(s) affected. This cannot be undone.',
      armed: true,
      cardAttr: 'data-recipe-bulk-delete-card',
      impactAttr: 'data-recipe-bulk-impact',
      rowAttr: 'data-recipe-bulk-impact-row',
    });
    markup = target.innerHTML;
    const idleButton = target.querySelector(':scope .fab-bulk-delete-card .fabricate-button');
    await card.setProps({ busy: true });
    const busyButton = target.querySelector(':scope .fab-bulk-delete-card .fabricate-button');
    sameNode = idleButton !== null && busyButton === idleButton;
    busyAttributes = Object.fromEntries(
      [...(busyButton?.attributes ?? [])].map(({ name, value }) => [name, value])
    );
  } finally {
    card.teardown();
  }

  const browser = await chromium.launch();
  try {
    measured = await measureIn(browser, markup, measureDisableWhileFocused);
    transition = await measureIn(browser, markup, measureBusyTransition, busyAttributes);
  } finally {
    await browser.close();
  }
});

describe('1132 disabling the focused delete control fires blur in a real browser', () => {
  it('renders a real, focusable control from the product markup', () => {
    // Anti-vacuity, asserted before anything it bounds.
    assert.ok(
      measured.rendered,
      `${CARD_PATH} rendered no .fab-bulk-delete-card .fabricate-button — the control this gate measures is not in the markup`
    );
    assert.ok(measured.focusedBefore, 'the control did not take focus, so the disable below cannot blur it');
  });

  // Issue 1157's guard: `BulkDeleteCard` restores focus after a write only when it is still on
  // `document.body`, so a GM who tabbed elsewhere keeps their place. That is the right guard only
  // if `<body>` is where a native disable leaves the keyboard; the mounted suite enters that
  // state by hand, so only a browser can say.
  it('leaves the keyboard on document.body, which is what the restore guard tests for', () => {
    assert.equal(
      measured.activeAfter,
      'BODY',
      'Chromium no longer parks focus on <body> when the focused control is disabled — re-derive '
        + "BulkDeleteCard's outcome focus guard, which only restores from that exact state"
    );
  });

  it('fires blur the moment the control is disabled, which happy-dom never does', () => {
    // The premise behind `focus()`, the body-only restore and the blur-while-busy guard, each of
    // which a happy-dom suite would pass without.
    assert.equal(
      measured.blurCount,
      1,
      'Chromium did not blur the focused control when it was disabled — the browser fact behind '
        + "ArmedDangerButton's focus() export, BulkDeleteCard's restore and the blur guard no "
        + 'longer holds, so re-derive them before deleting any'
    );
    assert.equal(measured.focusedAfter, false, 'and focus really left the control');
  });
});

describe('the busy face keeps focus across the real busy transition in a real browser', () => {
  it('takes focus before the transition, and the transition is to the busy render', () => {
    assert.ok(transition.rendered, `${CARD_PATH} rendered no .fab-bulk-delete-card .fabricate-button`);
    assert.ok(transition.focusedBefore, 'the control did not take focus, so nothing below is measured');
    assert.ok(transition.busyMatch, 'the busy render carried no aria-busy, so this is not the busy transition');
    assert.ok(sameNode, 'setting busy replaced the control element, so a real browser drops its focus');
  });

  it('fires no blur, keeps the keyboard on the control, and is not :disabled', () => {
    assert.equal(transition.blurCount, 0, 'setting busy blurred the focused control');
    assert.equal(transition.focusedAfter, true, 'focus left the control when busy was set');
    assert.equal(transition.disabledMatch, false, 'the busy face matches :disabled');
  });
});

/*
 * THE BLUR THAT MAKES THE BUSY FACE NECESSARY (issue 1132), in a real browser.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────
 * `BulkDeleteCard`'s `busy` prop is the CALLER's own in-flight flag and is deliberately not
 * derived from `armed`. The whole justification for that extra prop is one browser fact:
 *
 *   DISABLING A FOCUSED BUTTON FIRES `blur` ON IT.
 *
 * `ArmedDangerButton` disarms on blur, so within a frame of a write starting a real browser
 * has already set `armed: false` while the write is still running. A busy face keyed off
 * `armed` therefore renders the IDLE label — "Delete 3 recipes", on a disabled button — for
 * the entire duration of a destructive write.
 *
 * `bulk-delete-card-mounted.test.js` proves the component's half: fed `armed: false,
 * busy: true` it still renders "Deleting…", and it ignores a blur while busy. But it proves
 * that in happy-dom, WHICH DOES NOT FIRE THIS BLUR AT ALL — every one of those states has to
 * be entered by hand there. So the premise the design rests on is, in that suite, an
 * assumption dressed as a fixture: if Chromium did not really fire the blur, the busy prop
 * would be unnecessary machinery and nothing under `npm test` could tell.
 *
 * This gate asserts the premise itself, at focus level, in Chromium, against the card's own
 * rendered markup. It is deliberately narrow — it measures the BROWSER, not the component —
 * because that is exactly the half happy-dom cannot supply. Together the two suites cover
 * acceptance 16: the browser fires the blur (here), and the busy face survives it (there).
 *
 * ── THE MARKUP IS THE PRODUCT'S ──────────────────────────────────────────────────
 * The button is `ArmedDangerButton`'s, mounted through the shared harness and shipped into
 * the page as real `innerHTML`, so a change to the control's element type or its disabled
 * handling reaches this gate. A hand-written `<button>` would keep passing after the product
 * stopped rendering one, which is the class of rot every fixture header in this directory
 * already warns about.
 */
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
  // The card's ONE shared leaf (issue 1157): the "move the keyboard, then announce" ordering
  // rule it shares with the manager root. A static import, so the harness's closure validator
  // throws without it.
  rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
  compiledModules: ['src/ui/svelte/apps/manager/ArmedDangerButton.svelte', CARD_PATH],
  componentPath: CARD_PATH,
});

/**
 * Focus the armed control, then disable it exactly as a caller flipping `busy` would, and
 * report what the browser did. `disabled` is set directly rather than through Svelte because
 * the subject is the BROWSER's reaction to the attribute, not the framework's route to it.
 */
function measureDisableWhileFocused() {
  const button = document.querySelector('.fab-bulk-delete-card .manager-button');
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

describe('1132 disabling the focused delete control fires blur in a real browser', () => {
  let measured = null;
  let markup = '';

  before(async () => {
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
    } finally {
      card.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body>${markup}</body></html>`,
        { waitUntil: 'load' }
      );
      measured = await page.evaluate(measureDisableWhileFocused);
    } finally {
      await browser.close();
    }
  });

  it('renders a real, focusable control from the product markup', () => {
    // Anti-vacuity, asserted before anything it bounds: if the card stopped rendering a
    // `.manager-button`, or rendered something a browser cannot focus, every claim below
    // would pass trivially while measuring nothing.
    assert.ok(
      measured.rendered,
      `${CARD_PATH} rendered no .fab-bulk-delete-card .manager-button — the control this gate measures is not in the markup`
    );
    assert.ok(measured.focusedBefore, 'the control did not take focus, so the disable below cannot blur it');
  });

  // THE SECOND PREMISE, and the one issue 1157's guard rests on. `BulkDeleteCard` no longer
  // restores focus unconditionally after a refused write: it restores only when focus is
  // still on `document.body`, so a GM who tabbed into the browser's search field while the
  // write was running keeps their place. That guard is only the RIGHT guard if `<body>` is
  // genuinely where the disable leaves the keyboard — if Chromium parked focus somewhere else
  // the condition would never hold, the restore would never run, and the mounted suite (which
  // enters that state by hand with an explicit `document.body.focus()`) would agree it was
  // fine.
  it('leaves the keyboard on document.body, which is what the restore guard tests for', () => {
    assert.equal(
      measured.activeAfter,
      'BODY',
      'Chromium no longer parks focus on <body> when the focused control is disabled — re-derive '
        + "BulkDeleteCard's outcome focus guard, which only restores from that exact state"
    );
  });

  it('fires blur the moment the control is disabled, which happy-dom never does', () => {
    // THE PREMISE. Without it, `busy` would be an unnecessary prop and an `armed`-derived
    // busy face would be correct — and the mounted suite, running on an engine that raises no
    // such event, would agree.
    assert.equal(
      measured.blurCount,
      1,
      'Chromium did not blur the focused control when it was disabled — the browser fact the busy prop exists for no longer holds, so re-derive the design before deleting the prop'
    );
    assert.equal(measured.focusedAfter, false, 'and focus really left the control');
  });
});

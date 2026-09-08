/*
 * THE FOCUS HALF OF THE VALIDATION ROW ACTION, unit-tested where it can actually be tested
 * (issue 1517).
 *
 * ── WHY THIS FILE EXISTS AND IS NOT A MOUNTED SUITE ──────────────────────────────────────
 * happy-dom focuses ANYTHING. `.focus()` on a bare `<div>` sets `document.activeElement`, so
 * a mounted assertion of the form "after activating View, the heading holds focus" passes
 * even when the heading carries no `tabindex` and a real browser would have done nothing at
 * all. There is a NAMED mutation for it: delete `tabindex="-1"` from a destination and keep
 * `data-keyboard-focus="true"`, and both the mounted assertion AND
 * `tests/design-system-keyboard-focus.test.js` still pass — the second because removing the
 * attribute removes the element from the population it walks.
 *
 * So the branch that refuses an unfocusable target is not left to a mounted suite. It is
 * `isFocusable`, a pure predicate, and it is exercised here against an explicit true/false
 * table — the shape a browser would agree with, asserted directly rather than through a DOM
 * that would agree with anything.
 *
 * ── THE HAYSTACK OF EVERY CHECK BELOW IS A LIVE DOM, NOT SOURCE TEXT ──────────────────────
 * Nothing here greps a file. Each assertion reads an element built in this file, or an
 * attribute on it, so no comment, docblock or string literal in the product is inside any of
 * these checks' haystacks.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import {
  VALIDATION_FOCUS_ATTRIBUTE,
  VALIDATION_TARGET_ATTRIBUTE,
  focusValidationTarget,
  isFocusable,
} from '../../src/ui/svelte/apps/manager/validationFocus.js';

/**
 * Identity, asserted as a BOOLEAN. Handing a live happy-dom element to `node:assert` renders
 * its whole subtree, its parents and its owner document when the assertion fails, which takes
 * the process out with a heap OOM — a real failure wearing a crash's costume, and unreadable
 * exactly when someone is looking at it. So every identity check below compares a boolean and
 * carries its own message.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} message
 */
function assertIs(actual, expected, message) {
  assert.equal(actual === expected, true, message);
}

/**
 * Collect `console.warn` for the duration of one clause. Returned as a handle rather than
 * installed globally, so a clause that forgets to restore cannot silence the next one.
 *
 * @returns {{restore: () => string[]}} `restore` puts the real `console.warn` back and returns
 *   what was written while it was replaced.
 */
function captureWarnings() {
  const written = [];
  const real = console.warn;
  console.warn = (...args) => written.push(args.join(' '));
  return {
    restore() {
      console.warn = real;
      return written;
    },
  };
}

/**
 * Build an element from a tag and a flat attribute bag, appended to the document so focus
 * and blur behave the way they do in a rendered tree.
 *
 * @param {string} tag
 * @param {Record<string, string>} [attributes]
 * @returns {Element}
 */
function element(tag, attributes = {}) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  document.body.appendChild(node);
  return node;
}

/**
 * THE TABLE. One row per shape the predicate must rank, with the expectation stated as a
 * literal rather than derived from the predicate's own rules — a table computed from the
 * implementation would agree with any implementation.
 */
const FOCUSABLE_TABLE = [
  ['button', {}, true],
  ['input', {}, true],
  ['select', {}, true],
  ['textarea', {}, true],
  ['summary', {}, true],
  ['a', { href: '#somewhere' }, true],
  ['div', { tabindex: '-1' }, true],
  ['h3', { tabindex: '-1' }, true],
  ['span', { tabindex: '0' }, true],
  ['div', {}, false],
  ['h3', {}, false],
  ['p', {}, false],
  ['span', {}, false],
  ['a', {}, false],
  ['button', { disabled: '' }, false],
  ['input', { disabled: '' }, false],
  ['div', { tabindex: '-1', disabled: '' }, false],
  ['button', { inert: '' }, false],
  ['div', { tabindex: '-1', inert: '' }, false],
  // `aria-disabled` IS STILL FOCUSABLE, and the row is here to say so. It is the spelling a
  // control uses when it means to stay in the tab order while telling the user it cannot be
  // operated, so a browser DOES move focus there — which is what this predicate answers. The row
  // action declines it anyway, one layer up in `focusValidationTarget`, and the clauses below
  // prove that decline is silent. Ranking it `false` here would make the predicate lie about the
  // browser to express a policy that is not the predicate's.
  ['button', { 'aria-disabled': 'true' }, true],
];

describe('validationFocus: isFocusable ranks a destination the way a browser would', () => {
  before(setupDOM);
  after(teardownDOM);

  for (const [tag, attributes, expected] of FOCUSABLE_TABLE) {
    const shape = `<${tag}${Object.keys(attributes)
      .map((name) => ` ${name}`)
      .join('')}>`;
    it(`ranks ${shape} as ${expected}`, () => {
      assert.equal(isFocusable(element(tag, attributes)), expected);
    });
  }

  it('refuses anything that is not an element', () => {
    assert.equal(isFocusable(null), false);
    assert.equal(isFocusable(undefined), false);
    assert.equal(isFocusable({}), false);
  });
});

describe('validationFocus: focusValidationTarget resolves, focuses and marks', () => {
  before(setupDOM);
  after(teardownDOM);

  let root;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  /**
   * @param {string} tag
   * @param {string} address
   * @param {Record<string, string>} [attributes]
   * @returns {Element}
   */
  function destination(tag, address, attributes = {}) {
    const node = document.createElement(tag);
    node.setAttribute(VALIDATION_TARGET_ATTRIBUTE, address);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    root.appendChild(node);
    return node;
  }

  it('focuses the addressed control and resolves to it', async () => {
    const control = destination('input', 'recipe-name');

    const focused = await focusValidationTarget(root, 'recipe-name');

    assertIs(focused, control, 'the promise resolves to the control it focused');
    assertIs(document.activeElement, control, 'and the control holds focus');
  });

  it('marks the focused control, so a POINTER activation is visible too', async () => {
    // The keyboard path is painted by the sheet's `:focus-visible` repaint. A programmatic
    // `.focus()` after a pointer activation matches `:focus` and NOT `:focus-visible`, so
    // without this attribute the sheet's `:focus` reset strips the ring and nothing repaints
    // it — the action would be invisible on the commonest path a GM takes.
    const control = destination('input', 'recipe-name');

    await focusValidationTarget(root, 'recipe-name');

    assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), '');
  });

  it('removes the mark when focus moves elsewhere', async () => {
    // A LEAKED MARK IS THE DEFECT INVERTED: a permanent accent outline on the last-focused
    // control, which persists past the interaction rather than merely missing during it.
    const control = destination('input', 'recipe-name');
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);

    await focusValidationTarget(root, 'recipe-name');
    assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), '');

    elsewhere.focus();

    assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), null);
    assertIs(document.activeElement, elsewhere, 'focus really did move');
  });

  it('stays marked when the SAME control is addressed twice in a row', async () => {
    // The repeat path fires neither `blur` nor `focus` — `.focus()` on the active element is
    // a no-op — so a helper that only set the mark on a real focus change would leave the
    // second activation unmarked, and a helper that registered a fresh one-shot cleanup per
    // call would accumulate a dead listener per activation. The mark is re-set
    // unconditionally and the cleanup is a stable reference, which is what `addEventListener`
    // deduplicates.
    const control = destination('input', 'recipe-name');
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);

    await focusValidationTarget(root, 'recipe-name');
    await focusValidationTarget(root, 'recipe-name');

    assertIs(document.activeElement, control, 'the repeat left focus where it was');
    assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), '');

    // ONE cleanup, not two: a single blur clears the mark and nothing re-arms it.
    elsewhere.focus();
    assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), null);
  });

  it('registers ONE cleanup across repeat activations, by reference', async () => {
    // The assertion above cannot see this, and that is why this one exists: with `once: true`
    // a leaked second listener is removed by the same blur that removes the first, so a
    // listener LEAK is invisible to every state assertion available here. What makes the
    // repeat path genuinely idempotent is that the callback is a stable module-level
    // reference — `addEventListener` ignores a duplicate (type, callback, capture) triple —
    // and a fresh closure per call is exactly the shape that defeats that rule.
    const control = destination('input', 'recipe-name');
    const registered = [];
    const realAdd = control.addEventListener.bind(control);
    control.addEventListener = (type, listener, options) => {
      if (type === 'blur') registered.push(listener);
      return realAdd(type, listener, options);
    };

    await focusValidationTarget(root, 'recipe-name');
    await focusValidationTarget(root, 'recipe-name');

    assert.equal(registered.length, 2, 'the helper registers on every activation');
    assert.equal(
      registered[0],
      registered[1],
      'the same reference twice, which is the duplicate addEventListener drops'
    );
  });

  it('REFUSES a target it cannot really focus, and WARNS, naming it', async () => {
    // THE SHAPE REFUSAL. A destination that could never take focus is an AUTHORING defect — the
    // producer emits an address the destination cannot honour and nobody will ever see focus land
    // — so this one speaks, and the console line is part of the contract rather than debug noise.
    const heading = destination('h3', 'ingredient-group-abc');
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    const warnings = captureWarnings();

    const focused = await focusValidationTarget(root, 'ingredient-group-abc');

    assertIs(focused, null, 'the helper refuses rather than focusing it');
    assertIs(document.activeElement, elsewhere, 'focus must not have moved');
    assert.equal(heading.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), null);
    assert.equal(warnings.restore().length, 1, 'and it says so exactly once');
  });

  // ── THE STATE REFUSAL IS SILENT, AND THE SHAPE REFUSAL IS NOT ─────────────────────────────
  //
  // Both resolve `null` and leave focus alone, so no assertion on the OUTCOME can tell them
  // apart — which is how one console line ended up covering both. `disabled` and `inert` are
  // normal runtime states of a correctly authored pair: the Tool on-break fieldset is disabled
  // precisely while the Tool is immune, and `aria-disabled="true"` is what a control uses when it
  // means to STAY focusable while saying it cannot be operated — the recipe-item Link-recipe
  // trigger, once every recipe is already linked. Warning there printed a remedy that does not
  // apply ("give the control a tabindex") every time the feature worked as designed.
  for (const [label, attributes] of [
    ['disabled', { disabled: '' }],
    ['inert', { inert: '' }],
    ['aria-disabled="true"', { 'aria-disabled': 'true' }],
  ]) {
    it(`refuses a ${label} destination SILENTLY, and still resolves null`, async () => {
      const control = destination('button', 'recipe-item-link-recipe', attributes);
      const elsewhere = document.createElement('input');
      document.body.appendChild(elsewhere);
      elsewhere.focus();
      const warnings = captureWarnings();

      const focused = await focusValidationTarget(root, 'recipe-item-link-recipe');

      assertIs(focused, null, 'the row still changes route, and focuses nothing');
      assertIs(document.activeElement, elsewhere, 'focus must not have moved');
      assert.equal(control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE), null, 'and nothing is marked');
      assert.deepEqual(
        warnings.restore(),
        [],
        'a normal runtime state must not print an authoring remedy at a GM using the feature'
      );
    });
  }

  it('resolves null, and does NOT mark, when focus does not actually land', async () => {
    // `.focus()` RETURNS NOTHING AND MAY BE DECLINED. The mark's whole lifetime is a focus and
    // the `blur` that clears it, so stamping an element that never took the keyboard paints a
    // permanent accent ring: the blur that would remove it never comes. The refusal is read back
    // off `activeElement` rather than assumed from the call.
    const control = destination('input', 'recipe-name');
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    // A browser declining the move, reproduced at the only seam a unit test has for it.
    control.focus = () => {};

    const focused = await focusValidationTarget(root, 'recipe-name');

    assertIs(focused, null, 'a refused move is not a move');
    assertIs(document.activeElement, elsewhere, 'focus really did stay put');
    assert.equal(
      control.getAttribute(VALIDATION_FOCUS_ATTRIBUTE),
      null,
      'and the mark is not painted on a control that never took the keyboard'
    );
  });

  it('resolves null for a target nothing carries', async () => {
    destination('input', 'recipe-name');

    assertIs(
      await focusValidationTarget(root, 'result-group-missing'),
      null,
      'an address nothing carries resolves null'
    );
  });

  it('resolves null for a row that carries no focusTarget at all', async () => {
    // The route-only row. It must not degrade into "focus the first control in the panel",
    // which is what an empty selector would do.
    destination('input', 'recipe-name');

    assertIs(await focusValidationTarget(root, ''), null, 'an empty address');
    assertIs(await focusValidationTarget(root, null), null, 'a null address');
    assertIs(await focusValidationTarget(root, undefined), null, 'an absent address');
  });

  it('resolves null when there is no root to search', async () => {
    assertIs(await focusValidationTarget(null, 'recipe-name'), null, 'no root, no focus');
  });

  it('searches only inside the root it was given', async () => {
    const outside = document.createElement('input');
    outside.setAttribute(VALIDATION_TARGET_ATTRIBUTE, 'recipe-name');
    document.body.appendChild(outside);

    assertIs(
      await focusValidationTarget(root, 'recipe-name'),
      null,
      'a matching control OUTSIDE the root is not reached'
    );
  });

  it('defers, so the route assignment that preceded it has been flushed', async () => {
    // The host sets its route synchronously and FIRST; the destination panel does not exist
    // until Svelte flushes. A helper that queried synchronously would find nothing on every
    // cross-tab activation, which is every activation this action is for.
    let resolved = null;
    const pending = focusValidationTarget(root, 'recipe-name').then((value) => {
      resolved = value;
    });

    // The destination is added AFTER the call, in the same turn — the shape a synchronous
    // query would fail on.
    const control = destination('input', 'recipe-name');
    assertIs(resolved, null, 'the helper must not have run yet');

    await pending;
    assertIs(resolved, control, 'and once it does, it finds the destination that arrived');
  });
});

/*
 * THE MARK IS PAINTED, MEASURED IN A REAL BROWSER.
 *
 * Everything above is about the ATTRIBUTE. This is about what the attribute is for, and it
 * cannot be asserted in happy-dom, which does not compute a cascade: the question here is
 * which of two rules at the same specificity rank wins, over the same element, under a
 * pseudo-class whose match depends on how the focus was acquired. Only a browser answers it.
 *
 * ── THE DEFECT IT MEASURES, IN ITS OWN RIGHT ────────────────────────────────────────────
 * `styles/fabricate.css` carries the module's focus-ring contract as a PAIR: a `:focus` half
 * that strips whatever ring the browser or Foundry core would draw, and a `:focus-visible`
 * half that supplies Fabricate's accent ring. A programmatic `.focus()` following a POINTER
 * activation matches the first and not the second — so before the mark existed, a GM who
 * CLICKED a validation row's View button saw the tab change and no ring whatsoever on the
 * control it landed on. The first assertion below measures exactly that state and records it
 * as the reason the rule exists, rather than asserting only the fixed half.
 *
 * ── AND WHY THE RULE IS WRITTEN FLAT ────────────────────────────────────────────────────
 * A single `.fabricate [data-validation-focused]` selector is (0,2,0). Its competitor,
 * `.fabricate button:focus`, is (0,2,1) — and specificity is compared BEFORE source order, so
 * the one-selector form loses outright and paints nothing at all, on every destination, while
 * reading in review as a fix. The six-selector form ties each counterpart's rank and wins by
 * position. Collapsing the rule reds the second assertion below, which is what makes this a
 * gate on the ARITHMETIC and not merely on the declaration.
 */
describe('validationFocus: the pointer path is painted, measured in Chromium', () => {
  const sheet = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/fabricate.css'),
    'utf8'
  );

  let browser;

  before(async () => {
    browser = await chromium.launch();
  });

  after(async () => {
    await browser.close();
  });

  /**
   * The two element shapes the mark is stamped on, as a probe apiece.
   *
   * PARAMETERISED, because the rule is two ranks and the oracle used to measure ONE of them. The
   * five typed selectors are (0,2,1) and the `[tabindex]` one is (0,3,0), each tying its own
   * `:focus` counterpart and winning by position — different arithmetic, and it is the
   * `[tabindex]` rank that carries most destinations: every requirement card, result set card,
   * essence card, Tool section and identity panel a validation row addresses is a `[tabindex]`
   * carrier, and only the name/description/formula fields are the typed kind.
   *
   * `id="probe"` on both, so every measurement below reads the same selector.
   */
  const PROBES = [
    ['<button>', '<button id="probe" type="button">Probe</button>'],
    ['<div tabindex="-1">', '<div id="probe" tabindex="-1" data-keyboard-focus="true">Probe</div>'],
  ];

  /**
   * Click a probe with the MOUSE — the activation path the whole rule exists for — then read the
   * outline it actually paints, with and without the mark.
   *
   * @param {string} markup The probe's markup; it carries `id="probe"`.
   * @param {boolean} marked Whether to stamp `data-validation-focused` before measuring.
   * @returns {Promise<{focusVisible: boolean, active: boolean, width: string, style: string,
   *   color: string, accent: string, accentColor: string}>}
   */
  async function outlineAfterPointerFocus(markup, marked) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`<style>${sheet}</style><div class="fabricate">${markup}</div>`);
    await page.click('#probe');
    if (marked) {
      await page.evaluate(() =>
        document.querySelector('#probe').setAttribute('data-validation-focused', '')
      );
    }
    const measured = await page.evaluate(() => {
      const probe = document.querySelector('#probe');
      const computed = getComputedStyle(probe);
      // THE TOKEN, RESOLVED BY THE BROWSER ITSELF rather than restated as an rgb() triple here.
      // A pinned literal is a second copy of a design token in a test file: re-tuning the accent
      // reds this clause for no defect, and — worse — the two agreeing proves only that somebody
      // updated both. Painting the token onto a throwaway element makes the browser normalise it
      // exactly as it normalises the outline colour, so the comparison is of one value with
      // itself, through the cascade.
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--fab-accent')
        .trim();
      const swatch = document.createElement('span');
      swatch.style.color = accent;
      document.body.append(swatch);
      const accentColor = getComputedStyle(swatch).color;
      swatch.remove();
      return {
        active: probe === document.activeElement,
        focusVisible: probe.matches(':focus-visible'),
        width: computed.outlineWidth,
        style: computed.outlineStyle,
        color: computed.outlineColor,
        accent,
        accentColor,
      };
    });
    await context.close();
    return measured;
  }

  for (const [label, markup] of PROBES) {
    it(`states the defect on ${label}: pointer focus strips the ring and supplies none`, async () => {
      const measured = await outlineAfterPointerFocus(markup, false);
      assert.equal(measured.active, true, 'the click did focus the probe');
      assert.equal(
        measured.focusVisible,
        false,
        'and :focus-visible does NOT match, which is the whole premise'
      );
      assert.equal(
        measured.style,
        'none',
        'so the :focus reset wins and the repaint never fires — no mark on the destination'
      );
    });

    it(`paints the accent ring on a marked ${label}, at the repaint’s own declarations`, async () => {
      const measured = await outlineAfterPointerFocus(markup, true);
      assert.equal(measured.focusVisible, false, 'still a pointer focus, not a keyboard one');
      assert.equal(measured.style, 'solid');
      assert.equal(measured.width, '2px');
      assert.ok(
        measured.accent !== '',
        'the accent token resolves; an unresolved var() would invalidate the whole declaration'
      );
      assert.equal(
        measured.color,
        measured.accentColor,
        'and the colour is the accent TOKEN as this browser resolves it, so a GM cannot tell a ' +
          'pointer activation from a keyboard one'
      );
    });
  }

  /*
   * ── AND THE RING HAS TO FIT (issue 1517, review r1) ──────────────────────────────────────
   *
   * The repaint is `outline-offset: 2px`, which paints OUTSIDE the element's border box, and the
   * editor tab panels every destination sits in are `overflow: auto` with no left padding — a
   * combination that clips painting to the padding box. A card at the panel's flush-left edge
   * therefore loses the left arm of its own ring, which reads as three sides of a rectangle
   * rather than as a mark.
   *
   * MEASURED, NOT ASSUMED, and measured on the real sheet: the geometry below is read from a
   * Chromium layout of `.manager-editor-tab-panel` with a `[tabindex]` destination inside it,
   * exactly as the recipe editor renders one. The remedy is `outline-offset: -2px` on the
   * `[tabindex]` selector only — an INSET ring, which no overflow can clip — and it is confined
   * to that selector because the typed carriers are fields with their own inset spacing whose
   * declarations stay byte-identical to the repaint.
   */
  it('paints the mark INSIDE a flush-left destination, where an overflow clip cannot reach it', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(
      `<style>${sheet}</style>` +
        '<div class="fabricate fabricate-manager" style="width:400px">' +
        '<div class="manager-editor-tab-panel" style="height:120px">' +
        '<div id="probe" tabindex="-1" data-keyboard-focus="true" data-validation-focused="">' +
        'Requirement</div></div></div>'
    );
    const measured = await page.evaluate(() => {
      const panel = document.querySelector('.manager-editor-tab-panel');
      const probe = document.querySelector('#probe');
      const panelBox = panel.getBoundingClientRect();
      const probeBox = probe.getBoundingClientRect();
      const computed = getComputedStyle(probe);
      return {
        // How far the destination's own box sits inside the panel's, on the clipped edge.
        insetFromClip: probeBox.left - (panelBox.left + panel.clientLeft),
        panelPaddingLeft: getComputedStyle(panel).paddingLeft,
        panelOverflowX: getComputedStyle(panel).overflowX,
        offset: computed.outlineOffset,
        width: computed.outlineWidth,
        style: computed.outlineStyle,
      };
    });
    await context.close();

    // THE MEASUREMENT, RECORDED EITHER WAY. These three are the clip: the panel scrolls, it has
    // no left padding, and the destination is flush against that edge — so any positive offset
    // paints the left arm of the ring outside the padding box the panel clips to.
    assert.equal(measured.panelOverflowX, 'auto', 'the panel clips its own painting');
    assert.equal(measured.panelPaddingLeft, '0px', 'with nothing on the left for a ring to sit in');
    assert.equal(measured.insetFromClip, 0, 'and the destination is flush against that edge');

    assert.equal(measured.style, 'solid', 'the mark is painted');
    assert.equal(measured.width, '2px', 'at the repaint’s own width');
    assert.equal(
      measured.offset,
      '-2px',
      'and INSET, so the whole rectangle is inside the box the panel clips to. A positive offset ' +
        'here loses the left arm of the ring on every flush-left destination, which is most of ' +
        'them: the requirement and result-set cards, the essence cards and the Tool sections all ' +
        'span the panel’s full width'
    );
  });
});

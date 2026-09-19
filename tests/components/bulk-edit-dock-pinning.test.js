/*
 * THE BULK EDIT DOCK'S RENDERED PIN (issue 1015).
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────
 * The dock is the whole deliverable of issue 1015, and when it shipped it SURVIVED EVERY
 * MUTATION. `npm test` stayed green with `position: sticky` deleted from
 * `.fab-bulk-edit-dock`, with `bottom: calc(-1 * var(--fab-space-3))` reverted to
 * `bottom: 0`, with `background: var(--fab-bg-2)` changed to `transparent`, and
 * with the `<div class="fab-bulk-edit-dock">` wrapper deleted from the product markup
 * outright. The pin in `component-studio-font-size.test.js` measures the BUTTON's
 * `min-height` and `font-size` — the two values the dock is designed NOT to touch — so it
 * cannot tell "dock present and correct" from "dock never added". The two studio fixtures
 * mention `fab-bulk-edit-dock` but assert nothing about it, so the wrapper could leave the
 * product while both mirrors went on measuring markup nothing renders. That is exactly the
 * rot both of those fixture headers warn about in capitals.
 *   (a) the dock's border-box bottom sits on the inspector's PADDING box bottom, at every
 *       scroll offset  — kills `bottom: 0` AND the deletion of `position: sticky`;
 *   (b) the dock's left and right sit on the inspector's padding-box left and right
 *                      — kills the loss of the inline bleed;
 *   (c) the dock's computed `background-color` AND its computed `opacity` are both fully
 *       opaque         — kills `transparent` (a see-through dock is not a dock), and kills
 *                        an `opacity` below 1, which leaves the fill's own alpha at 1 and
 *                        makes the dock see-through anyway;
 *   (d) the dock element is in the RENDERED PRODUCT markup and is Apply's parent
 *                      — kills deleting the wrapper;
 *   (e) Apply's own left, right and bottom sit on the inspector's CONTENT box
 *                      — kills losing the `padding-inline` or `padding-bottom` that pay the
 *                        dock's negative margins back. Without (e) the shell's claim that
 *                        the padding "puts the button back exactly where it was" is
 *                        unmeasured, and deleting either declaration ships green with Apply
 *                        12px out of column or missing its bottom gutter.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
// Same import path the mounted suites use for `flushSync`.
import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL_PATH = 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';
const CARD_PATH = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const shellCss = scopedComponentCss(resolve(repoRoot, SHELL_PATH));
const cardCss = scopedComponentCss(resolve(repoRoot, CARD_PATH));

// Sub-pixel tolerance, not exact equality. At clamped maximum scroll an INTEGER `scrollTop`
// meets a fractional scroll maximum and leaves a fraction of a pixel behind; measured here
// at 0.09px and up to 0.44px in the design probe on the same markup. 1px absorbs that with
// room to spare while staying an order of magnitude under the smallest defect it must
// catch: every mutation this gate exists to kill moves an edge by `--fab-space-3` (12px) or
// by the rail's whole overhang.
const EPSILON_PX = 1;
// Anti-vacuity. A rail that does not overflow cannot prove anything about a sticky box.
const MIN_OVERFLOW_PX = 48;
const CONTAINER_WIDTH_PX = 1200;
// The height of the whole manager HOST, not a declaration on `.manager-inspector`.
const INSPECTOR_HOST_HEIGHT_PX = 520;
const AXIS_ROW_COUNT = 18;

const shell = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-edit-dock-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  // THE manager's labelled push-button (issue 1118). Apply renders through the primitive
  // now, so it is a static import of the shell and belongs in its closure. This suite is
  // NOT covered by `mounted-harness-primitive-allowlist.test.js`, which gates the
  // hand-rolled harnesses only — `createMountedComponentHarness` carries its own closure
  // validator, and that is what named this omission rather than hanging on it.
  compiledModules: ['src/ui/svelte/components/ManagerButton.svelte', SHELL_PATH],
  componentPath: SHELL_PATH,
});

// A SECOND harness rather than a second `componentPath`: the harness mounts one component.
const card = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-delete-card-',
  // Issue 1157 gave the card one raw import: the shared focus/announce ordering rule.
  rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
  compiledModules: [
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    CARD_PATH,
  ],
  componentPath: CARD_PATH,
});

/** Stand-in staged axes. Tall enough to overflow the rail; never measured. */
const stagedAxes = createRawSnippet(() => ({
  render: () =>
    `<div class="probe-axis">${Array.from(
      { length: AXIS_ROW_COUNT },
      (_, index) => `<p class="probe-row">Staged axis row ${index + 1}</p>`
    ).join('')}</div>`,
}));

/** The shell's real rendered markup, dropped into the rail it actually ships in. */
function inspectorPage(productMarkup) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${shellCss.css}</style>
    <style>${cardCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${CONTAINER_WIDTH_PX}px; height: ${INSPECTOR_HOST_HEIGHT_PX}px; }
      .probe-row { margin: 0; padding: 6px 0; font-size: 12px; }
    </style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="components">
          <div class="probe-shell-band"></div>
          <div class="probe-shell-band"></div>
          <div class="manager-body">
            <div class="manager-rail"></div>
            <div class="manager-main"></div>
            <aside class="manager-inspector" data-probe-inspector>${productMarkup}</aside>
          </div>
        </div>
      </div>
    </body></html>`;
}

/** Measures the dock against the inspector's padding box at the top. */
function measureDock() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  if (!dock) return { dockRendered: false };

  // The fill and the element's own alpha are read before the geometry.
  const dockStyle = getComputedStyle(dock);
  const paint = { backgroundColor: dockStyle.backgroundColor, opacity: dockStyle.opacity };

  const apply = dock.querySelector('[data-component-bulk-apply]');
  if (!apply) return { dockRendered: true, applyRendered: false, ...paint };

  const inspectorStyle = getComputedStyle(inspector);
  const border = {
    bottom: parseFloat(inspectorStyle.borderBottomWidth),
    left: parseFloat(inspectorStyle.borderLeftWidth),
    right: parseFloat(inspectorStyle.borderRightWidth),
  };
  const padding = {
    bottom: parseFloat(inspectorStyle.paddingBottom),
    left: parseFloat(inspectorStyle.paddingLeft),
    right: parseFloat(inspectorStyle.paddingRight),
  };

  const sampleAt = (label, scrollTop) => {
    inspector.scrollTop = scrollTop;
    const rail = inspector.getBoundingClientRect();
    const box = dock.getBoundingClientRect();
    const applyBox = apply.getBoundingClientRect();
    // The scrollport is the inspector's PADDING box.
    const padBottom = rail.bottom - border.bottom;
    const padLeft = rail.left + border.left;
    const padRight = rail.right - border.right;
    return {
      label,
      scrollTop: inspector.scrollTop,
      padBottom,
      padLeft,
      padRight,
      // The rail's CONTENT box — where every OTHER item in this column sits.
      contentBottom: padBottom - padding.bottom,
      contentLeft: padLeft + padding.left,
      contentRight: padRight - padding.right,
      dockBottom: box.bottom,
      dockLeft: box.left,
      dockRight: box.right,
      applyBottom: applyBox.bottom,
      applyLeft: applyBox.left,
      applyRight: applyBox.right,
    };
  };

  const overflow = inspector.scrollHeight - inspector.clientHeight;
  return {
    dockRendered: true,
    applyRendered: true,
    overflow,
    ...paint,
    samples: [
      sampleAt('scroll top', 0),
      sampleAt('mid scroll', Math.floor(overflow / 2)),
      // Deliberately past the end — `scrollHeight` always exceeds the maximum offset. The
      // browser clamps to the real maximum, which is where the fractional residue the
      // epsilon exists for shows up.
      sampleAt('max scroll', inspector.scrollHeight),
    ],
  };
}

/**
 * The same rail, with a real `BulkDeleteCard` rendered AFTER the shell.
 * Measures a DIFFERENT invariant from `measureDock`, because the sibling breaks that one BY
 * DESIGN: it shortens `.fab-bulk-edit-panel`, which is the dock's containing block, so at
 * maximum scroll the dock clamps to the PANEL's box rather than the rail's. What survives is
 * reachability, so this reads Apply against the SCROLLPORT rather than the dock against the
 * rail.
 */
function measureSiblingCard() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const panel = inspector.querySelector('.fab-bulk-edit-panel');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  const apply = dock?.querySelector('[data-component-bulk-apply]');
  const sibling = inspector.querySelector('.fab-bulk-delete-card');
  if (!panel || !dock || !apply || !sibling) {
    return {
      panelRendered: Boolean(panel),
      dockRendered: Boolean(dock),
      applyRendered: Boolean(apply),
      siblingRendered: Boolean(sibling),
    };
  }

  const inspectorStyle = getComputedStyle(inspector);
  const border = {
    top: parseFloat(inspectorStyle.borderTopWidth),
    bottom: parseFloat(inspectorStyle.borderBottomWidth),
  };
  // The dock's own negative bottom margin. Read rather than hard-coded.
  const dockMarginBottom = parseFloat(getComputedStyle(dock).marginBottom);

  const sampleAt = (label, scrollTop) => {
    inspector.scrollTop = scrollTop;
    const rail = inspector.getBoundingClientRect();
    const dockBox = dock.getBoundingClientRect();
    const applyBox = apply.getBoundingClientRect();
    return {
      label,
      scrollTop: inspector.scrollTop,
      // The scrollport is the rail's PADDING box — the region Apply has to stay inside.
      railPadTop: rail.top + border.top,
      railPadBottom: rail.bottom - border.bottom,
      panelBottom: panel.getBoundingClientRect().bottom,
      // The MARGIN-box bottom, which is the edge the containing-block clamp acts on.
      dockMarginBoxBottom: dockBox.bottom + dockMarginBottom,
      dockBottom: dockBox.bottom,
      applyTop: applyBox.top,
      applyBottom: applyBox.bottom,
    };
  };

  const overflow = inspector.scrollHeight - inspector.clientHeight;
  return {
    panelRendered: true,
    dockRendered: true,
    applyRendered: true,
    siblingRendered: true,
    overflow,
    scrollportHeight: inspector.clientHeight,
    siblingHeight: sibling.getBoundingClientRect().height,
    samples: [
      sampleAt('scroll top', 0),
      sampleAt('mid scroll', Math.floor(overflow / 2)),
      sampleAt('max scroll', inspector.scrollHeight),
    ],
  };
}

/** The alpha channel of a computed colour; `transparent` computes to `rgba(0, 0, 0, 0)`. */
function alphaOf(color) {
  const channels = String(color).match(/[\d.]+/g) || [];
  return channels.length > 3 ? Number(channels[3]) : 1;
}

describe('the bulk edit dock is pinned to the inspector scrollport', () => {
  const rendered = { markup: '', dockIsApplyParent: false, dockInMountedMarkup: false };
  let measured = null;

  before(async () => {
    await shell.setup();
    try {
      const target = await shell.mount({
        heading: '3 components selected',
        applyLabel: 'Apply to 3 components',
        canApply: true,
        children: stagedAxes,
      });
      const dock = target.querySelector('.fab-bulk-edit-dock');
      const apply = target.querySelector('[data-component-bulk-apply]');
      rendered.dockInMountedMarkup = Boolean(dock);
      rendered.dockIsApplyParent = Boolean(apply) && apply.parentElement === dock;
      rendered.markup = target.innerHTML;
    } finally {
      shell.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(inspectorPage(rendered.markup), { waitUntil: 'load' });
      measured = await page.evaluate(measureDock);
    } finally {
      await browser.close();
    }
  });

  it('ships the dock as Apply\'s wrapper in the rendered product markup', () => {
    // (d). Read off the MOUNTED component.
    assert.ok(
      rendered.dockInMountedMarkup,
      `${SHELL_PATH} rendered no .fab-bulk-edit-dock — the sticky dock issue 1015 added is gone from the product, and the studio font-size fixtures cannot see that because they hand-write their own copy of it`
    );
    assert.ok(
      rendered.dockIsApplyParent,
      'the bulk Apply button is no longer a child of .fab-bulk-edit-dock — it has been moved out of the dock, so it scrolls with the panel again'
    );
  });

  it('breathes the reference`s 13px above Apply and pins the delete at one 11px line (M24, both bulk panels)', async () => {
    // `proto:791` / `proto:1270` pad the foot `13px 17px`.
    // `margin-top`) and the delete wore the host button's 14px type on a 6px corner, wrapping the
    // system panel's `Remove 2 components from The Herbalist's Compendium…` to two lines. Both are
    // the SHELL's and the sheet's, so one measurement covers the world and the system panel alike.
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      // Spliced before the LAST `</div></section>`, which closes the dock and the panel.
      const dockClose = rendered.markup.lastIndexOf('</div></section>');
      const probe =
        '<div class="fab-bulk-inset-danger-probe"><button type="button" class="manager-button is-danger" data-danger-probe=""><i class="fas fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Remove 2 components from The Herbalist\u{2019}s Compendium of Forgotten Remedies and Sundries…</span></button></div>';
      // AND THE DOCK IS GIVEN ITS FOOT COLUMN (`has-foot`).
      const markupWithFoot = (
        dockClose === -1
          ? rendered.markup
          : rendered.markup.slice(0, dockClose) + probe + rendered.markup.slice(dockClose)
      ).replace('class="fab-bulk-edit-dock', 'class="fab-bulk-edit-dock has-foot');
      assert.notEqual(markupWithFoot, rendered.markup, 'NON-VACUITY: the probe delete was placed in the dock');
      await page.setContent(inspectorPage(markupWithFoot), { waitUntil: 'load' });
      const measured = await page.evaluate(() => {
        const dock = document.querySelector('.fab-bulk-edit-dock');
        const apply = document.querySelector('[data-component-bulk-apply]');
        const danger = document.querySelector('[data-danger-probe]');
        const label = danger.querySelector('span');
        const style = (element) => getComputedStyle(element);
        return {
          dockPaddingTop: style(dock).paddingTop,
          applyMarginTop: style(apply).marginTop,
          applyTopFromDockTop: apply.getBoundingClientRect().top - dock.getBoundingClientRect().top,
          dangerHeight: danger.getBoundingClientRect().height,
          dangerRadius: style(danger).borderTopLeftRadius,
          dangerFontSize: style(danger).fontSize,
          dangerFontWeight: style(danger).fontWeight,
          labelLines: Math.round(label.getBoundingClientRect().height / parseFloat(style(label).lineHeight || '11')),
          labelNoWrap: style(label).whiteSpace,
          labelClipped: label.scrollWidth > label.clientWidth,
          widths: {
            dock: dock.getBoundingClientRect().width,
            dockDisplay: style(dock).display,
            button: danger.getBoundingClientRect().width,
            buttonDisplay: style(danger).display,
            labelScroll: label.scrollWidth,
            labelClient: label.clientWidth,
            wrapper: danger.parentElement.getBoundingClientRect().width,
            wrapperMinWidth: style(danger.parentElement).minWidth,
            dockClass: dock.className,
            hasFootChildRule: [...document.styleSheets].some((sheet) => {
              try {
                return [...sheet.cssRules].some((rule) => /has-foot[^{]*>\s*\*/.test(rule.selectorText || ''));
              } catch {
                return false;
              }
            }),
          },
        };
      });
      assert.equal(measured.dockPaddingTop, '12px', 'the dock pads --fab-space-3 above its first control (the reference`s 13)');
      assert.equal(measured.applyMarginTop, '0px', 'and Apply no longer carries the 4px it used to');
      assert.equal(Math.round(measured.applyTopFromDockTop), 13, 'so Apply sits 12px + the hairline under the dock`s top edge');
      assert.equal(Math.round(measured.dangerHeight), 34, 'the delete is on the 34px rung…');
      assert.equal(measured.dangerRadius, '9px', '…on the 34-38px band`s corner…');
      assert.equal(measured.dangerFontSize, '11px', '…at the reference`s 11px…');
      assert.equal(measured.dangerFontWeight, '700', '…and weight 700');
      assert.equal(measured.labelNoWrap, 'nowrap', 'and its label is ONE line');
      assert.ok(
        measured.labelClipped,
        `NON-VACUITY: this label is longer than the rail, so it is the clipped case (${JSON.stringify(measured.widths)})`
      );
    } finally {
      await browser.close();
    }
  });

  it('holds the dock on the rail scrollport at the top, middle and bottom of the scroll range', () => {
    // (a) and (b), plus the anti-vacuity preconditions that make them mean anything.
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
    assert.ok(measured.applyRendered, 'the Apply button is absent from the rendered dock');
    assert.ok(
      measured.overflow >= MIN_OVERFLOW_PX,
      `the rail must genuinely overflow for a sticky assertion to say anything (overflow ${measured.overflow}px, need at least ${MIN_OVERFLOW_PX}px) — either the panel shrank or .manager-inspector stopped being the scrollport`
    );
    const offsets = measured.samples.map((sample) => sample.scrollTop);
    assert.ok(
      offsets[0] < offsets[1] && offsets[1] < offsets[2],
      `the three samples must be at DIFFERENT scroll offsets or they are one sample three times (measured ${offsets.join(', ')})`
    );

    for (const sample of measured.samples) {
      assert.ok(
        Math.abs(sample.dockBottom - sample.padBottom) <= EPSILON_PX,
        `at ${sample.label} (scrollTop ${sample.scrollTop}) the dock's bottom edge is ${sample.dockBottom}px but the inspector's padding-box bottom is ${sample.padBottom}px — the dock is not pinned to the scrollport (a deleted 'position: sticky', or a 'bottom' inset that no longer cancels the rail's padding)`
      );
      assert.ok(
        Math.abs(sample.dockLeft - sample.padLeft) <= EPSILON_PX,
        `at ${sample.label} the dock's left edge is ${sample.dockLeft}px but the inspector's padding-box left is ${sample.padLeft}px — the dock has lost its inline bleed and reads as a floating slab rather than the rail's edge`
      );
      assert.ok(
        Math.abs(sample.dockRight - sample.padRight) <= EPSILON_PX,
        `at ${sample.label} the dock's right edge is ${sample.dockRight}px but the inspector's padding-box right is ${sample.padRight}px — the dock has lost its inline bleed and reads as a floating slab rather than the rail's edge`
      );
    }
  });

  it('leaves the Apply button on the rail content box the dock bled out of', () => {
    // (e). The dock's three bleeds are paid back by matching padding.
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
    assert.ok(measured.applyRendered, 'the Apply button is absent from the rendered dock');

    for (const sample of measured.samples) {
      for (const [edge, actual, expected] of [
        ['bottom', sample.applyBottom, sample.contentBottom],
        ['left', sample.applyLeft, sample.contentLeft],
        ['right', sample.applyRight, sample.contentRight],
      ]) {
        assert.ok(
          Math.abs(actual - expected) <= EPSILON_PX,
          `at ${sample.label} (scrollTop ${sample.scrollTop}) Apply's ${edge} edge is ${actual}px but the inspector's content-box ${edge} is ${expected}px — the dock's bleed is no longer paid back by its matching padding, so the primary action has moved out of the column every other panel row sits on`
        );
      }
    }
  });

  it('fills the dock opaquely so staged rows cannot read through it', () => {
    // (c). The dock's only job while it covers the rail is to be a surface.
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
    assert.equal(
      alphaOf(measured.backgroundColor),
      1,
      `the dock's background-color computed to ${measured.backgroundColor} — a translucent or transparent dock lets the content it is pinned over read through it`
    );
    assert.equal(
      measured.opacity,
      '1',
      `the dock's opacity computed to ${measured.opacity} — the fill is opaque but the element is not, so the staged rows still read straight through it`
    );
  });
});

/*
 * ── THE ACCEPTED NON-PIN: A SIBLING CARD AFTER THE SHELL (issue 1132) ────────────────
 * WHY THE INVARIANT IS A DIFFERENT ONE, AND NOT A WEAKENED ONE. `.fab-bulk-edit-dock` is
 * `position: sticky` inside `.fab-bulk-edit-panel`, so the PANEL is its containing block, and a
 * sticky box may not escape its containing block. A sibling rendered after the shell shortens
 * that panel without shortening the rail, so at maximum scroll the clamp binds and Apply is
 * lifted off the rail's bottom edge — measured at −142px on a staged recipe panel and −154px on
 * a component panel. Asserting (a) from the suite above here would therefore be asserting that
 * the shipped layout is a bug.
 */
describe('the bulk edit dock with a sibling card after the shell', () => {
  const rendered = { shell: '', card: '' };
  let measured = null;

  before(async () => {
    await shell.setup();
    try {
      const target = await shell.mount({
        heading: '3 components selected',
        applyLabel: 'Apply to 3 components',
        canApply: true,
        children: stagedAxes,
      });
      rendered.shell = target.innerHTML;
    } finally {
      shell.teardown();
    }

    await card.setup();
    try {
      // The Component Studio's shipped call, at the impact its own View Lab frame photographs.
      const target = await card.mount({
        token: 'delete-components',
        heading: 'Delete selected components',
        rows: [
          { key: 'components', text: '3 components will be deleted.' },
          { key: 'recipes', text: '2 recipes will be rewritten.', count: 2 },
          {
            key: 'disabled',
            text: '1 of those recipes is enabled today and will be disabled.',
            count: 1,
          },
        ],
        idleLabel: 'Delete 3 components',
        armedLabel: 'Confirm delete',
        idleAriaLabel: 'Delete 3 components',
        armedAriaLabel: 'Confirm delete — 3 component(s), 2 recipe(s)',
        cardAttr: 'data-component-bulk-delete-card',
        impactAttr: 'data-component-bulk-impact',
        rowAttr: 'data-component-bulk-impact-row',
      });
      rendered.card = target.innerHTML;
    } finally {
      card.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(inspectorPage(`${rendered.shell}${rendered.card}`), {
        waitUntil: 'load',
      });
      measured = await page.evaluate(measureSiblingCard);
    } finally {
      await browser.close();
    }
  });

  it('renders both the shell and a real delete card in the rail', () => {
    assert.ok(measured.panelRendered, 'the bulk edit panel is absent from the rendered rail');
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
    assert.ok(measured.applyRendered, 'the Apply button is absent from the rendered dock');
    assert.ok(
      measured.siblingRendered,
      `${CARD_PATH} rendered no .fab-bulk-delete-card — the sibling this case exists to measure is not in the rail, so every assertion below would be about the shell alone`
    );
  });

  it('measures a sibling SHORTER than the scrollport, which is where the guarantee holds', () => {
    // The bound, asserted before anything it bounds. A taller sibling pushes Apply off the TOP
    // of the scrollport at maximum scroll: that is a reachability failure, it is not one of the
    // accepted non-pinning configurations, and this gate must not be read as evidence for it.
    assert.ok(
      measured.siblingHeight > 0,
      'the sibling card has no height, so it displaces nothing'
    );
    assert.ok(
      measured.siblingHeight < measured.scrollportHeight,
      `the delete card is ${measured.siblingHeight}px against a ${measured.scrollportHeight}px scrollport — at or above that height Apply is scrolled off the TOP at maximum scroll, which this case does NOT accept and does not measure`
    );
    assert.ok(
      measured.overflow >= MIN_OVERFLOW_PX,
      `the rail must genuinely overflow for a scroll assertion to say anything (overflow ${measured.overflow}px, need at least ${MIN_OVERFLOW_PX}px)`
    );
    const offsets = measured.samples.map((sample) => sample.scrollTop);
    assert.ok(
      offsets[0] < offsets[1] && offsets[1] < offsets[2],
      `the three samples must be at DIFFERENT scroll offsets or they are one sample three times (measured ${offsets.join(', ')})`
    );
  });

  it('clamps the dock to the panel box rather than the rail at maximum scroll', () => {
    // The ACCEPTED behaviour, pinned so it cannot silently become something else. A sticky box
    // may not escape its containing block, and that clamp acts on its MARGIN box — which is why
    // this reads `dockMarginBoxBottom` and not the border-box bottom the shell-alone suite uses.
    const max = measured.samples.at(-1);
    assert.ok(
      Math.abs(max.dockMarginBoxBottom - max.panelBottom) <= EPSILON_PX,
      `at max scroll the dock's margin-box bottom is ${max.dockMarginBoxBottom}px but the panel's bottom is ${max.panelBottom}px — the dock is no longer clamped to its containing block, so it is neither pinned nor accepted-un-pinned but something new`
    );
    // And it is genuinely OFF the rail's bottom edge.
    assert.ok(
      max.railPadBottom - max.dockBottom > EPSILON_PX,
      `at max scroll the dock's bottom is ${max.dockBottom}px against a rail padding-box bottom of ${max.railPadBottom}px — the dock is still pinned to the rail, so the sibling is not shortening the panel and this case is measuring nothing`
    );
  });

  it('keeps Apply wholly inside the scrollport at every scroll offset', () => {
    // THE INVARIANT THAT SURVIVES. Issue 1015's symptom was Apply being unreachable.
    for (const sample of measured.samples) {
      assert.ok(
        sample.applyTop >= sample.railPadTop - EPSILON_PX,
        `at ${sample.label} (scrollTop ${sample.scrollTop}) Apply's top edge is ${sample.applyTop}px, above the scrollport's top at ${sample.railPadTop}px — the primary action has scrolled off the TOP, which is issue 1015's original symptom and is not an accepted configuration`
      );
      assert.ok(
        sample.applyBottom <= sample.railPadBottom + EPSILON_PX,
        `at ${sample.label} (scrollTop ${sample.scrollTop}) Apply's bottom edge is ${sample.applyBottom}px, below the scrollport's bottom at ${sample.railPadBottom}px — the primary action is clipped by the rail`
      );
    }
  });
});

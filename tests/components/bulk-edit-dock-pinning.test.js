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
 *   (e) Apply's own left and right sit on the inspector's CONTENT box, and its bottom on the
 *       CONTENT box bottom
 *                      — kills losing the `padding-inline` or `padding-bottom` that pay the
 *                        dock's negative margins back. Without (e) the shell's claim that
 *                        the padding "puts the button back exactly where it was" is
 *                        unmeasured, and deleting either declaration ships green with Apply
 *                        12px out of column or missing its bottom gutter.
 * The dock is `InspectorPanel`'s foot (issue 2500), so each clause runs in both of its scrollers:
 * the system aside and a world catalogue's flush bulk scroller.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { railMarkup } from '../fixtures/bulk-edit-dock/rails.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { borrowBrowser } from '../helpers/layout-harness.js';
// Same import path the mounted suites use for `flushSync`.
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL_PATH = 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';
const CARD_PATH = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';
const PANEL_PATH = 'src/ui/svelte/apps/manager/InspectorPanel.svelte';
const FRAME_PATH = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';
const fabricateCss = readStylesheet();
const shellCss = scopedComponentCss(resolve(repoRoot, SHELL_PATH));
const cardCss = scopedComponentCss(resolve(repoRoot, CARD_PATH));
const panelCss = scopedComponentCss(resolve(repoRoot, PANEL_PATH));
// The world skeleton wears the frame's hash class, so its own scoped rules lay the scroller out.
const frameCss = scopedComponentCss(resolve(repoRoot, FRAME_PATH));
/** The dock's two scrollers. */
const FRAMES = Object.freeze({
  system: Object.freeze({ frame: 'system' }),
  world: Object.freeze({ frame: 'world' }),
});

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
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  // THE manager's labelled push-button (issue 1118). Apply renders through the primitive
  // now, so it is a static import of the shell and belongs in its closure. This suite is
  // NOT covered by `mounted-harness-primitive-allowlist.test.js`, which gates the
  // hand-rolled harnesses only — `createMountedComponentHarness` carries its own closure
  // validator, and that is what named this omission rather than hanging on it.
  compiledModules: [
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Notice.svelte',
    PANEL_PATH,
    SHELL_PATH,
  ],
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

/** The shell's real rendered markup, dropped into a scroller it actually ships in. */
function inspectorPage(productMarkup, { frame = 'system', view = '' } = {}) {
  const rail = railMarkup({
    frame,
    view,
    scope: frameCss.hashClass,
    height: INSPECTOR_HOST_HEIGHT_PX,
    content: productMarkup,
  });
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${shellCss.css}</style>
    <style>${panelCss.css}</style>
    <style>${cardCss.css}</style>
    <style>${frameCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${CONTAINER_WIDTH_PX}px; height: ${INSPECTOR_HOST_HEIGHT_PX}px; }
      .probe-row { margin: 0; padding: 6px 0; font-size: 12px; }
    </style></head>
    <body><div class="probe-host">${rail}</div></body></html>`;
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
    padBottomInset: padding.bottom,
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

/** The dock, Apply and the delete card inside it, against the rail's padding box at three offsets. */
function measureDockedDelete() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  const apply = dock?.querySelector('[data-component-bulk-apply]');
  const deleteCard = dock?.querySelector('.fab-bulk-delete-card');
  if (!apply || !deleteCard) return { rendered: false };

  const sampleAt = (label, scrollTop) => {
    inspector.scrollTop = scrollTop;
    const rail = inspector.getBoundingClientRect();
    const applyBox = apply.getBoundingClientRect();
    const cardBox = deleteCard.getBoundingClientRect();
    return {
      label,
      scrollTop: inspector.scrollTop,
      railTop: rail.top + inspector.clientTop,
      railBottom: rail.top + inspector.clientTop + inspector.clientHeight,
      dockBottom: dock.getBoundingClientRect().bottom,
      applyTop: applyBox.top,
      applyBottom: applyBox.bottom,
      cardTop: cardBox.top,
      cardBottom: cardBox.bottom,
    };
  };

  const overflow = inspector.scrollHeight - inspector.clientHeight;
  return {
    rendered: true,
    overflow,
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

/** The danger probe the 13px case measures, as the caller's `dockFoot`: a label longer than the rail. */
const dangerProbeFoot = createRawSnippet(() => ({
  render: () =>
    '<div class="fab-bulk-inset-danger-probe"><button type="button" class="fabricate-button is-danger" data-danger-probe=""><i class="fas fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Remove 2 components from The Herbalist\u{2019}s Compendium of Forgotten Remedies and Sundries…</span></button></div>',
}));

/** The dock's computed fill against probes painted with each candidate token, and the panel's rhythm. */
function readFill(tokens) {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  const manager = inspector.closest('.fabricate-manager');
  const probes = Object.fromEntries(
    tokens.map((token) => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;width:1px;height:1px;background-color:var(${token})`;
      manager.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [token, color];
    })
  );
  return {
    dock: getComputedStyle(dock).backgroundColor,
    probes,
    rowGap: getComputedStyle(dock.parentElement).rowGap,
  };
}

describe('the bulk edit dock is pinned to the inspector scrollport', () => {
  const rendered = { markup: '', dockIsApplyParent: false, dockInMountedMarkup: false, footed: '' };
  const measured = {};

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
      shell.remount();
      const footed = await shell.mount({
        heading: '3 components selected',
        applyLabel: 'Apply to 3 components',
        canApply: true,
        children: stagedAxes,
        dockFoot: dangerProbeFoot,
      });
      rendered.footed = footed.innerHTML;
    } finally {
      shell.teardown();
    }

    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      for (const [name, frame] of Object.entries(FRAMES)) {
        await page.setContent(inspectorPage(rendered.markup, frame), { waitUntil: 'load' });
        measured[name] = await page.evaluate(measureDock);
      }
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
    // The probe is the shell's `dockFoot`, so the foot wears `has-foot` through `footClass`.
    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(inspectorPage(rendered.footed), { waitUntil: 'load' });
      const measured = await page.evaluate(() => {
        const dock = document.querySelector('.fab-bulk-edit-dock');
        const apply = document.querySelector('[data-component-bulk-apply]');
        const danger = document.querySelector('[data-danger-probe]');
        if (!danger) return { rendered: false };
        const label = danger.querySelector('span');
        const style = (element) => getComputedStyle(element);
        return {
          rendered: dock.contains(danger) && dock.classList.contains('has-foot'),
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
          },
        };
      });
      assert.ok(measured.rendered, 'NON-VACUITY: the probe delete renders in a has-foot dock');
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
      assert.ok(
        measured.widths.wrapper <= measured.widths.dock + EPSILON_PX,
        `the long delete label widened the foot past the rail (${JSON.stringify(measured.widths)})`
      );
    } finally {
      await browser.close();
    }
  });

  for (const name of Object.keys(FRAMES)) {
    it(`holds the dock on the rail scrollport at the top, middle and bottom of the scroll range (${name})`, () => {
      // (a) and (b), plus the anti-vacuity preconditions that make them mean anything.
      const face = measured[name];
      assert.ok(face.dockRendered, 'the dock is absent from the rendered rail');
      assert.ok(face.applyRendered, 'the Apply button is absent from the rendered dock');
      assert.ok(
        face.overflow >= MIN_OVERFLOW_PX,
        `the rail must genuinely overflow for a sticky assertion to say anything (overflow ${face.overflow}px, need at least ${MIN_OVERFLOW_PX}px) — either the panel shrank or the scroller stopped being the scrollport`
      );
      const offsets = face.samples.map((sample) => sample.scrollTop);
      assert.ok(
        offsets[0] < offsets[1] && offsets[1] < offsets[2],
        `the three samples must be at DIFFERENT scroll offsets or they are one sample three times (measured ${offsets.join(', ')})`
      );

      for (const sample of face.samples) {
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

    it(`leaves the Apply button on the rail content box the dock bled out of (${name})`, () => {
      // (e). The dock's three bleeds are paid back by matching padding.
      const face = measured[name];
      assert.ok(face.dockRendered, 'the dock is absent from the rendered rail');
      assert.ok(face.applyRendered, 'the Apply button is absent from the rendered dock');
      assert.ok(face.padBottomInset >= 8, 'NON-VACUITY: the scroller pads its bottom edge');

      for (const sample of face.samples) {
        for (const [edge, actual, expected] of [
          ['bottom', sample.applyBottom, sample.contentBottom],
          ['left', sample.applyLeft, sample.contentLeft],
          ['right', sample.applyRight, sample.contentRight],
        ]) {
          assert.ok(
            Math.abs(actual - expected) <= EPSILON_PX,
            `at ${sample.label} (scrollTop ${sample.scrollTop}) Apply's ${edge} edge is ${actual}px but it belongs at ${expected}px (the rail's content box) — the dock's bleed is no longer paid back by its matching padding, so the primary action has moved out of the column every other panel row sits on`
          );
        }
      }
    });

    it(`fills the dock opaquely so staged rows cannot read through it (${name})`, () => {
      // (c). The dock's only job while it covers the rail is to be a surface.
      const face = measured[name];
      assert.ok(face.dockRendered, 'the dock is absent from the rendered rail');
      assert.equal(
        alphaOf(face.backgroundColor),
        1,
        `the dock's background-color computed to ${face.backgroundColor} — a translucent or transparent dock lets the content it is pinned over read through it`
      );
      assert.equal(
        face.opacity,
        '1',
        `the dock's opacity computed to ${face.opacity} — the fill is opaque but the element is not, so the staged rows still read straight through it`
      );
    });
  }
});

/** Each rail's own fill, which its foot takes (issue 2500). */
const FILLS = Object.freeze([
  { frame: 'system', view: 'components', token: '--fab-bg-2' },
  { frame: 'system', view: 'recipes', token: '--fab-bg-2' },
  { frame: 'system', view: 'essences', token: '--fab-bg-0' },
  { frame: 'world', view: 'world-components', token: '--fab-bg-1' },
]);
const FILL_TOKENS = ['--fab-bg-0', '--fab-bg-1', '--fab-bg-2'];

describe("the bulk edit dock takes its rail's own fill on the 8px rhythm (issue 2500)", () => {
  const read = {};

  before(async () => {
    await shell.setup();
    let markup;
    try {
      markup = (await shell.mount({ heading: '3 selected', canApply: true, children: stagedAxes }))
        .innerHTML;
    } finally {
      shell.teardown();
    }
    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      for (const fill of FILLS) {
        await page.setContent(inspectorPage(markup, fill), { waitUntil: 'load' });
        read[fill.view] = await page.evaluate(readFill, FILL_TOKENS);
      }
    } finally {
      await browser.close();
    }
  });

  for (const { frame, view, token } of FILLS) {
    it(`paints the ${view} dock with ${token} (${frame})`, () => {
      const { dock, probes, rowGap } = read[view];
      const others = FILL_TOKENS.filter((other) => other !== token).map((other) => probes[other]);
      assert.ok(
        !others.includes(probes[token]),
        `NON-VACUITY: ${token} must differ from the other fills (${JSON.stringify(probes)})`
      );
      assert.equal(dock, probes[token], `the ${view} dock is not on its rail's ${token}`);
      assert.equal(rowGap, '8px', 'the panel keeps its 8px section rhythm over the scroller gap');
    });
  }
});

/** One staged axis: far shorter than the rail, so only the panel's own fill can seat the dock. */
const shortAxis = createRawSnippet(() => ({
  render: () => '<p class="probe-row">One staged axis</p>',
}));

// The reported defect: a short panel drew its dock under the axes with the rail empty below it.
describe("the bulk edit dock sits on the rail's foot when the panel is shorter than the rail", () => {
  const faces = {};

  before(async () => {
    await shell.setup();
    let markup;
    try {
      const target = await shell.mount({ heading: '1 component selected', children: shortAxis });
      markup = target.innerHTML;
    } finally {
      shell.teardown();
    }
    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      for (const [name, frame] of Object.entries(FRAMES)) {
        await page.setContent(inspectorPage(markup, frame), { waitUntil: 'load' });
        faces[name] = await page.evaluate(measureDock);
        faces[name].innerWidth = await page.evaluate(
          () => document.querySelector('[data-probe-inspector]').clientWidth
        );
      }
    } finally {
      await browser.close();
    }
  });

  for (const name of Object.keys(FRAMES)) {
    it(`seats the dock on the rail's padding-box bottom at the rail's full inner width (${name})`, () => {
    const measured = faces[name];
    assert.ok(measured.applyRendered, 'the Apply button is absent from the rendered dock');
    assert.equal(measured.overflow, 0, 'NON-VACUITY: the panel must be shorter than the rail');
    const [sample] = measured.samples;
    assert.ok(
      Math.abs(sample.dockBottom - sample.padBottom) <= EPSILON_PX,
      `the dock's bottom is ${sample.dockBottom}px against the rail's foot at ${sample.padBottom}px — a short panel no longer fills its rail`
    );
    assert.ok(
      Math.abs(sample.dockRight - sample.dockLeft - measured.innerWidth) <= EPSILON_PX &&
        Math.abs(sample.dockLeft - sample.padLeft) <= EPSILON_PX,
      `the dock spans ${sample.dockLeft}–${sample.dockRight}px against the rail's ${measured.innerWidth}px inner width from ${sample.padLeft}px`
    );
    });
  }
});

/*
 * ── THE SET DELETE RIDES THE DOCK (maintainer ruling, 2026-10-14) ───────────────────────
 * The Essences and Recipes panels drew `BulkDeleteCard` AFTER the shell, which shortened the dock's
 * containing block and lifted Apply off the rail's foot. Both now pass the card as `dockFoot`, so
 * Apply and the delete sit in the dock at the foot, short panel or tall.
 */
describe('the bulk edit dock carrying the set delete', () => {
  const measured = {};

  before(async () => {
    await card.setup();
    let cardMarkup;
    try {
      // The Component Studio's shipped call, at the impact its own View Lab frame photographs.
      const target = await card.mount({
        token: 'delete-components',
        heading: 'Delete selected components',
        rows: [
          { key: 'components', text: '3 components will be deleted.' },
          { key: 'recipes', text: '2 recipes will be rewritten.', count: 2 },
        ],
        idleLabel: 'Delete 3 components',
        armedLabel: 'Confirm delete',
        idleAriaLabel: 'Delete 3 components',
        armedAriaLabel: 'Confirm delete — 3 component(s), 2 recipe(s)',
        cardAttr: 'data-component-bulk-delete-card',
      });
      cardMarkup = target.innerHTML;
    } finally {
      card.teardown();
    }
    const dockFoot = createRawSnippet(() => ({
      render: () => `<div class="probe-foot">${cardMarkup}</div>`,
    }));

    const markup = {};
    await shell.setup();
    try {
      for (const [name, children] of [['short', shortAxis], ['tall', stagedAxes]]) {
        const props = { heading: '3 components selected', canApply: true, children, dockFoot };
        const target = await shell.mount(props);
        markup[name] = target.innerHTML;
      }
    } finally {
      shell.teardown();
    }

    const browser = await borrowBrowser();
    try {
      for (const [face, frame] of Object.entries(FRAMES)) {
        for (const name of ['short', 'tall']) {
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          await page.setContent(inspectorPage(markup[name], frame), { waitUntil: 'load' });
          measured[`${name} ${face}`] = await page.evaluate(measureDockedDelete);
        }
      }
    } finally {
      await browser.close();
    }
  });

  for (const key of Object.keys(FRAMES).flatMap((face) => [`short ${face}`, `tall ${face}`])) {
    const [name, face] = key.split(' ');
    it(`holds Apply and the delete in the dock on the rail's foot (${name} panel, ${face})`, () => {
      const { rendered, overflow, samples } = measured[key];
      assert.ok(rendered, 'the dock carries no Apply or no delete card');
      assert.ok(
        name === 'short' ? overflow === 0 : overflow >= MIN_OVERFLOW_PX,
        `NON-VACUITY: the ${name} panel overflows the rail by ${overflow}px`
      );
      for (const sample of samples) {
        const at = `at ${sample.label} (scrollTop ${sample.scrollTop})`;
        assert.ok(
          Math.abs(sample.dockBottom - sample.railBottom) <= EPSILON_PX,
          `${at} the dock's bottom is ${sample.dockBottom}px against the rail's foot at ${sample.railBottom}px`
        );
        assert.ok(
          sample.applyTop >= sample.railTop - EPSILON_PX && sample.applyBottom <= sample.cardTop,
          `${at} Apply (${sample.applyTop}–${sample.applyBottom}px) is not above the delete card at ${sample.cardTop}px inside the rail`
        );
        assert.ok(
          sample.cardBottom <= sample.railBottom + EPSILON_PX,
          `${at} the delete card ends at ${sample.cardBottom}px, past the rail's foot at ${sample.railBottom}px`
        );
      }
    });
  }
});

/*
 * ── THE LIVE SHELL: FOCUS AND THE SMALLEST SUPPORTED RAIL ────────────────────────────────
 * The dock measures itself, which only a running component does, so these clauses mount the shell
 * through Vite (`tests/fixtures/bulk-edit-dock/`) in the same inspector skeleton as above.
 */
const dockFixture = createViteFixtureServer({ styleMountPrefix: '/@bulk-edit-dock-styles/' });
// The Manager's declared 1024x640 floor (`ui-system-studio`) at a width above the 1120 restack, where
// the inspector is still a rail: the View Lab measured that rail 454px tall (634px at 1280x820).
const FLOOR_RAIL_PX = 454;
// The control ladder's tallest rung, which Apply wears: the axes keep one control's room above the dock.
const ONE_CONTROL_PX = 38;

/** The live shell in one of its scrollers; the world face adds the frame's scoped CSS. */
async function openDockFixture(query, { frame = 'system' } = {}) {
  const page = await dockFixture.newPage({ viewport: { width: 1280, height: 900 } });
  const world = frame === 'world' ? `&frame=world&scope=${frameCss.hashClass}` : '';
  await page.goto(dockFixture.url(`/tests/fixtures/bulk-edit-dock/index.html?${query}${world}`));
  await page.waitForSelector('html[data-bulk-dock-ready="true"] .fab-bulk-edit-dock');
  if (world) await page.addStyleTag({ content: frameCss.css });
  await settleDock(page);
  return page;
}

/** A ResizeObserver delivers before the next paint and Svelte writes after it, so wait two frames. */
function settleDock(page) {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
}

/** Focus every body control from the top in tab order, then the last one from scroll top. */
function focusWalk() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  const controls = [...inspector.querySelectorAll('button')].filter((node) => !dock.contains(node));
  const under = (control) => {
    const bottom = control.getBoundingClientRect().bottom;
    const dockTop = dock.getBoundingClientRect().top;
    return bottom > dockTop + 1 ? `${control.textContent.trim()} ends ${bottom}px, dock top ${dockTop}px` : '';
  };
  inspector.scrollTop = 0;
  let scrolls = 0;
  const obscured = [];
  for (const control of controls) {
    const before = inspector.scrollTop;
    control.focus();
    if (inspector.scrollTop !== before) scrolls += 1;
    if (under(control)) obscured.push(under(control));
  }
  // Blurred first: focusing the element that already has focus does not scroll.
  document.activeElement.blur();
  inspector.scrollTop = 0;
  const last = controls.at(-1);
  last.focus();
  // `InspectorPanel` publishes the foot's height on its scroller, the panel's parent.
  const published = dock.parentElement.parentElement.style.getPropertyValue(
    '--fab-manager-inspector-scroll-pad'
  );
  return { count: controls.length, scrolls, obscured, last: under(last), dockHeight: dock.offsetHeight, published };
}

/** Apply, the delete's control and the room above the dock, against the rail at three offsets. */
function floorReading() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  const apply = dock.querySelector('[data-component-bulk-apply]');
  const confirm = dock.querySelector('[data-arm-token]');
  const overflow = inspector.scrollHeight - inspector.clientHeight;
  const sampleAt = (label, scrollTop) => {
    inspector.scrollTop = scrollTop;
    const railTop = inspector.getBoundingClientRect().top + inspector.clientTop;
    const box = (node) => node.getBoundingClientRect();
    return {
      label,
      railTop,
      railBottom: railTop + inspector.clientHeight,
      dockTop: box(dock).top,
      apply: { top: box(apply).top, bottom: box(apply).bottom },
      confirm: { top: box(confirm).top, bottom: box(confirm).bottom },
    };
  };
  return {
    rail: inspector.clientHeight,
    overflow,
    armed: confirm.dataset.armed,
    rows: dock.querySelectorAll(':scope .fab-bulk-delete-impact > li').length,
    hint: Boolean(dock.querySelector('.fab-bulk-delete-hint')),
    samples: [
      sampleAt('scroll top', 0),
      sampleAt('mid scroll', Math.floor(overflow / 2)),
      sampleAt('max scroll', inspector.scrollHeight),
    ],
  };
}

function assertNoneObscured(walk, face) {
  assert.ok(walk.count >= 18 && walk.scrolls > 0, `NON-VACUITY: ${face}, ${walk.count} controls, ${walk.scrolls} focus scrolls`);
  assert.deepEqual(walk.obscured, [], `${face}: a focused control sat under the ${walk.dockHeight}px dock`);
  assert.equal(walk.last, '', `${face}: the last body control, focused from scroll top, sat under the dock`);
  assert.equal(walk.published, `${walk.dockHeight}px`, `${face}: the panel publishes the dock's current height`);
}

/** The tab-order walk over every body control: idle, armed, and with the dock grown after mount. */
async function assertFocusWalk(frame) {
  const page = await openDockFixture('', frame);
  try {
    const idle = await page.evaluate(focusWalk);
    assertNoneObscured(idle, 'idle');
    await page.click('[data-arm-token]');
    await page.waitForSelector('[data-arm-token][data-armed="true"]');
    await settleDock(page);
    assertNoneObscured(await page.evaluate(focusWalk), 'armed');
    // The observer follows the dock after mount: a row the card did not have grows it by 60px.
    await page.evaluate(() => {
      const grown = Object.assign(document.createElement('div'), { style: 'height:60px' });
      document.querySelector('.fab-bulk-edit-dock').append(grown);
    });
    await settleDock(page);
    const grown = await page.evaluate(focusWalk);
    assert.ok(grown.dockHeight >= idle.dockHeight + 60, `NON-VACUITY: the dock grew (${idle.dockHeight} → ${grown.dockHeight}px)`);
    assertNoneObscured(grown, 'grown');
  } finally {
    await page.close();
  }
}

/**
 * Park the rail at `offset` with focus on its last body control, unscrolled, and read the guards
 * the foot-focus case needs before a foot control takes focus.
 */
function parkRail(offset) {
  const rail = document.querySelector('[data-probe-inspector]');
  const foot = rail.querySelector('.fab-inspector-panel-foot');
  const body = [...rail.querySelectorAll('button')].filter((node) => !foot.contains(node));
  document.activeElement?.blur();
  const overflow = rail.scrollHeight - rail.clientHeight;
  rail.scrollTop = offset === 'mid' ? Math.floor(overflow / 2) : 0;
  body.at(-1).focus({ preventScroll: true });
  return {
    overflow,
    scrollTop: rail.scrollTop,
    applyEnabled: !foot.querySelector('[data-component-bulk-apply]').disabled,
    armed: foot.querySelector('[data-arm-token]').dataset.armed,
    pad: getComputedStyle(rail).scrollPaddingBlockEnd,
    footHeight: `${foot.offsetHeight}px`,
  };
}

/** The rail's offset and reserve, and whether `selector` holds focus; `blur` drops it after. */
function readRail({ selector, blur = false }) {
  const rail = document.querySelector('[data-probe-inspector]');
  const focused = document.activeElement?.matches(selector) ?? false;
  const reading = { scrollTop: rail.scrollTop, focused, pad: getComputedStyle(rail).scrollPaddingBlockEnd };
  if (blur) document.activeElement?.blur();
  return reading;
}

/** Focus `selector` by `.focus()`, or by Tab from the parked body control. */
async function focusFootControl(page, selector, method) {
  if (method === 'focus()') {
    await page.evaluate((target) => document.querySelector(target).focus(), selector);
    return;
  }
  for (let presses = 0; presses < 3; presses += 1) {
    if ((await page.evaluate(readRail, { selector })).focused) return;
    await page.keyboard.press('Tab');
  }
}

/** The two foot controls the rail must not scroll for: Apply idle, and the delete once armed. */
const FOOT_TARGETS = Object.freeze([
  { name: 'Apply', selector: '[data-probe-inspector] [data-component-bulk-apply]', query: '' },
  { name: 'the armed delete', selector: '[data-probe-inspector] [data-arm-token]', query: 'armed' },
]);

async function assertFootFocusHoldsRail(frame, { name, selector, query }) {
  const page = await openDockFixture(query, frame);
  try {
    for (const offset of [0, 'mid']) {
      for (const method of ['focus()', 'Tab']) {
        const at = `${method} at scrollTop ${offset}`;
        const parked = await page.evaluate(parkRail, offset);
        assert.ok(
          parked.applyEnabled &&
            parked.overflow >= MIN_OVERFLOW_PX &&
            (query !== 'armed' || parked.armed === 'true') &&
            (offset === 0 ? parked.scrollTop === 0 : parked.scrollTop > 0),
          `NON-VACUITY (${at}): ${JSON.stringify(parked)}`
        );
        assert.equal(parked.pad, parked.footHeight, `NON-VACUITY (${at}): the rail reserves the foot's height`);
        await focusFootControl(page, selector, method);
        const held = await page.evaluate(readRail, { selector, blur: true });
        assert.ok(held.focused, `${at}: ${name} did not take focus`);
        assert.equal(held.scrollTop, parked.scrollTop, `${at}: focusing ${name} scrolled the rail`);
        assert.equal(held.pad, '0px', `${at}: the rail kept its reserve while the foot held focus`);
        const blurred = await page.evaluate(readRail, { selector });
        assert.equal(blurred.pad, parked.footHeight, `${at}: the reserve did not return on blur`);
      }
    }
  } finally {
    await page.close();
  }
}

describe('the live bulk edit dock', () => {
  before(() => dockFixture.start());
  after(() => dockFixture.stop());

  for (const [face, frame] of Object.entries(FRAMES)) {
    it(`stops a focus scroll above the dock, idle and after the delete arms (${face}, WCAG 2.4.11)`, () =>
      assertFocusWalk(frame));

    for (const target of FOOT_TARGETS) {
      it(`leaves the rail where it was when ${target.name} takes focus (${face}, WCAG 2.4.11)`, () =>
        assertFootFocusHoldsRail(frame, target));
    }
  }

  it('keeps Apply, Confirm and a control of room in view on the smallest supported rail', async () => {
    const page = await openDockFixture(`h=${FLOOR_RAIL_PX}&armed&card=recipe`);
    try {
      const floor = await page.evaluate(floorReading);
      assert.ok(Math.abs(floor.rail - FLOOR_RAIL_PX) <= EPSILON_PX, `NON-VACUITY: the rail is ${floor.rail}px`);
      assert.ok(
        floor.armed === 'true' && floor.rows === 3 && floor.hint && floor.overflow >= MIN_OVERFLOW_PX,
        `NON-VACUITY: the armed recipe card with all three rows and its hint, over a panel that overflows (${JSON.stringify(floor)})`
      );
      for (const sample of floor.samples) {
        const at = `at ${sample.label}`;
        for (const [name, box] of [['Apply', sample.apply], ['Confirm', sample.confirm]]) {
          assert.ok(
            box.top >= sample.railTop - EPSILON_PX && box.bottom <= sample.railBottom + EPSILON_PX,
            `${at} ${name} spans ${box.top}–${box.bottom}px outside the rail ${sample.railTop}–${sample.railBottom}px`
          );
        }
        const room = sample.dockTop - sample.railTop;
        assert.ok(room >= ONE_CONTROL_PX, `${at} the axes keep ${room}px above the dock, under one ${ONE_CONTROL_PX}px control`);
      }
    } finally {
      await page.close();
    }
  });
});

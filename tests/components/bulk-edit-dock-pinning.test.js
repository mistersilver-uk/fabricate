/*
 * THE BULK EDIT DOCK'S RENDERED PIN (issue 1015).
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────
 * The dock is the whole deliverable of issue 1015, and when it shipped it SURVIVED EVERY
 * MUTATION. `npm test` stayed green with `position: sticky` deleted from
 * `.fab-bulk-edit-dock`, with `bottom: calc(-1 * var(--fab-space-3))` reverted to
 * `bottom: 0`, with `background: var(--fab-mv2-surface-1)` changed to `transparent`, and
 * with the `<div class="fab-bulk-edit-dock">` wrapper deleted from the product markup
 * outright. The pin in `component-studio-font-size.test.js` measures the BUTTON's
 * `min-height` and `font-size` — the two values the dock is designed NOT to touch — so it
 * cannot tell "dock present and correct" from "dock never added". The two studio fixtures
 * mention `fab-bulk-edit-dock` but assert nothing about it, so the wrapper could leave the
 * product while both mirrors went on measuring markup nothing renders. That is exactly the
 * rot both of those fixture headers warn about in capitals.
 *
 * So this gate asserts the four things that ARE the dock, and each assertion is chosen to
 * kill one of those four mutations:
 *
 *   (a) the dock's border-box bottom sits on the inspector's PADDING box bottom, at every
 *       scroll offset  — kills `bottom: 0` AND the deletion of `position: sticky`;
 *   (b) the dock's left and right sit on the inspector's padding-box left and right
 *                      — kills the loss of the inline bleed;
 *   (c) the dock's computed `background-color` is fully opaque
 *                      — kills `transparent` (a see-through dock is not a dock);
 *   (d) the dock element is in the RENDERED PRODUCT markup and is Apply's parent
 *                      — kills deleting the wrapper.
 *
 * ── THE MARKUP IS THE PRODUCT'S, NOT A FIXTURE'S ─────────────────────────────────
 * (d) is only worth anything if the markup under test comes from the component. So this
 * gate MOUNTS `BulkEditPanelShell.svelte` through `createMountedComponentHarness` and ships
 * the mounted tree's real `innerHTML` into Chromium. Nothing here hand-writes a
 * `.fab-bulk-edit-dock`; deleting the wrapper from the shell empties this gate's markup and
 * (d) fails on the spot.
 *
 * The shell is mounted DIRECTLY rather than through one of its three studio callers. The
 * dock is the shell's, the shell's only dependency is `foundryBridge.js`, and mounting
 * `ComponentBulkEditPanel` instead would copy that suite's nine-entry module closure into a
 * second file for no assertion this gate makes.
 *
 * The staged axes arrive as `children` — that is the shell's actual contract, the rows are
 * the CALLER's and differ per studio — so this gate supplies its own through a snippet.
 * They exist only to make the rail overflow and are never measured; `MIN_OVERFLOW_PX`
 * below is what stops them quietly ceasing to do even that.
 *
 * ── WHY CHROMIUM, AND WHY BOTH STYLESHEETS ───────────────────────────────────────
 * happy-dom computes no cascade, no layout and no scrolling, so a mounted test can state
 * that the dock EXISTS but never that it is PINNED. And the two sheets are both
 * load-bearing in opposite directions: `.manager-inspector` (the scrollport, its padding
 * and its `overflow-y: auto`) is in the global `styles/fabricate.css`, while
 * `.fab-bulk-edit-dock` is Svelte-scoped and appears nowhere in that file. Injecting only
 * one of the two would leave half the geometry unstyled and the measurement meaningless.
 *
 * ── THE CONTAINER IS DELIBERATELY WIDE ───────────────────────────────────────────
 * At a `fabricate-manager` container width of 1120px or less, `styles/fabricate.css` gives
 * `.manager-body` `grid-auto-rows: max-content` + `overflow-y: auto`, which makes the BODY
 * the scrollport and leaves `.manager-inspector` sized to its content — so the inspector
 * never overflows and the dock never pins. That is pre-existing behaviour, identical on
 * `main`, out of scope here, and recorded in the dock's own comment in
 * `BulkEditPanelShell.svelte`. This gate measures the configuration the dock is FOR, so
 * `CONTAINER_WIDTH_PX` sits above that breakpoint on purpose. Lower it and this gate goes
 * vacuous rather than red, which is why `MIN_OVERFLOW_PX` is asserted first.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
// Same import path the mounted suites use for `flushSync`: the harness drives the compiled
// component with THIS copy of the client runtime, and a snippet built from a second copy
// would not be the same snippet type.
import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL_PATH = 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const shellCss = scopedComponentCss(resolve(repoRoot, SHELL_PATH));

// Sub-pixel tolerance, not exact equality. At clamped maximum scroll an INTEGER `scrollTop`
// meets a fractional scroll maximum and leaves a fraction of a pixel behind; measured here
// at 0.09px and up to 0.44px in the design probe on the same markup. 1px absorbs that with
// room to spare while staying an order of magnitude under the smallest defect it must
// catch: every mutation this gate exists to kill moves an edge by `--fab-space-3` (12px) or
// by the rail's whole overhang.
const EPSILON_PX = 1;
// Anti-vacuity. A rail that does not overflow cannot prove anything about a sticky box: all
// three scroll offsets collapse onto one, and every assertion below passes for a dock that
// is merely the last element in a short column. If the shell's chrome or the filler rows
// ever stop producing a real scroll range, this fails LOUDLY instead.
const MIN_OVERFLOW_PX = 48;
const CONTAINER_WIDTH_PX = 1200;
const INSPECTOR_HEIGHT_PX = 520;
const AXIS_ROW_COUNT = 18;

const shell = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-edit-dock-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [SHELL_PATH],
  componentPath: SHELL_PATH,
});

/** Stand-in staged axes. Tall enough to overflow the rail; never measured. */
const stagedAxes = createRawSnippet(() => ({
  render: () =>
    `<div class="probe-axis">${Array.from(
      { length: AXIS_ROW_COUNT },
      (_, index) => `<p class="probe-row">Staged axis row ${index + 1}</p>`
    ).join('')}</div>`,
}));

/**
 * The shell's real rendered markup, dropped into the rail it actually ships in.
 *
 * The three wrapper levels are the shipped ones — `.fabricate-manager` declares the
 * `--fab-mv2-*` tokens AND the `fabricate-manager` container the width branch above reads,
 * `.manager-body` supplies the three-column grid, and `.manager-inspector` is the scrollport
 * whose padding box the dock is asserted against.
 */
function inspectorPage(productMarkup) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${shellCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${CONTAINER_WIDTH_PX}px; height: ${INSPECTOR_HEIGHT_PX}px; }
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

/**
 * Measures the dock against the inspector's padding box at the top, middle and bottom of
 * the rail's scroll range.
 *
 * Runs wholly inside the page: `getBoundingClientRect` is only meaningful after the layout
 * the scroll assignment forces, so each offset is read back rather than assumed.
 */
function measureDock() {
  const inspector = document.querySelector('[data-probe-inspector]');
  const dock = inspector.querySelector('.fab-bulk-edit-dock');
  if (!dock) return { dockRendered: false };

  const inspectorStyle = getComputedStyle(inspector);
  const border = {
    bottom: parseFloat(inspectorStyle.borderBottomWidth),
    left: parseFloat(inspectorStyle.borderLeftWidth),
    right: parseFloat(inspectorStyle.borderRightWidth),
  };

  const sampleAt = (label, scrollTop) => {
    inspector.scrollTop = scrollTop;
    const rail = inspector.getBoundingClientRect();
    const box = dock.getBoundingClientRect();
    return {
      label,
      scrollTop: inspector.scrollTop,
      // The scrollport is the inspector's PADDING box, which is the edge the dock covers
      // out to; its border box is one hairline wider on the left.
      padBottom: rail.bottom - border.bottom,
      padLeft: rail.left + border.left,
      padRight: rail.right - border.right,
      dockBottom: box.bottom,
      dockLeft: box.left,
      dockRight: box.right,
    };
  };

  const overflow = inspector.scrollHeight - inspector.clientHeight;
  return {
    dockRendered: true,
    overflow,
    backgroundColor: getComputedStyle(dock).backgroundColor,
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
    // (d). Read off the MOUNTED component, so deleting the wrapper from
    // `BulkEditPanelShell.svelte` fails here however faithfully the studio fixtures still
    // mirror it.
    assert.ok(
      rendered.dockInMountedMarkup,
      `${SHELL_PATH} rendered no .fab-bulk-edit-dock — the sticky dock issue 1015 added is gone from the product, and the studio font-size fixtures cannot see that because they hand-write their own copy of it`
    );
    assert.ok(
      rendered.dockIsApplyParent,
      'the bulk Apply button is no longer a child of .fab-bulk-edit-dock — it has been moved out of the dock, so it scrolls with the panel again'
    );
  });

  it('holds the dock on the rail scrollport at the top, middle and bottom of the scroll range', () => {
    // (a) and (b), plus the anti-vacuity preconditions that make them mean anything.
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
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

  it('fills the dock opaquely so staged rows cannot read through it', () => {
    // (c). The dock's only job while it covers the rail is to be a surface: at less than
    // full alpha the staged rows scroll visibly UNDER the primary action, which is the
    // symptom issue 1015 was filed for wearing a sticky position.
    assert.ok(measured.dockRendered, 'the dock is absent from the rendered rail');
    assert.equal(
      alphaOf(measured.backgroundColor),
      1,
      `the dock's background-color computed to ${measured.backgroundColor} — a translucent or transparent dock lets the content it is pinned over read through it`
    );
  });
});

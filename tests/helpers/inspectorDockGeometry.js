/** An inspector column's pinned foot, measured against the column in Chromium (issues 2489, 2498). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

import { borrowBrowser } from './layout-harness.js';
import { scopedComponentCss } from './scoped-component-css.js';

/** The world catalogues' bulk dock, under the frame's scroller: what the defaults measure. */
const BULK_DOCK_PROBE = Object.freeze({
  aside: '[data-scoped-list-inspector]',
  foot: '.fab-bulk-edit-dock',
  scroller: '.manager-scoped-list-inspector-scroll',
  scrollTo: null,
});

/**
 * The mounted inspector column, laid out as the frame's grid track stretches it, with its dock's
 * painted box against the column's border-box inner edges. `componentPaths` supply the scoped CSS;
 * the rest of the options override `BULK_DOCK_PROBE` for `readInspectorFoot`.
 */
export async function measureInspectorDock(
  asideMarkup,
  { repoRoot, componentPaths, view, ...probe }
) {
  const css = componentPaths
    .map((path) => scopedComponentCss(resolve(repoRoot, path)).css)
    .join('\n');
  const browser = await borrowBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(
      `<!doctype html><html><head><style>${readStylesheet()}</style><style>${css}</style>
      <style>body { margin: 0; } .probe-track { display: grid; width: 340px; height: 640px; }</style>
      </head><body><div class="fabricate fabricate-manager" data-fabricate-theme="dark"
      data-manager-view="${view}"><div class="probe-track">${asideMarkup}</div></div></body></html>`,
      { waitUntil: 'load' }
    );
    return await page.evaluate(readInspectorFoot, { ...BULK_DOCK_PROBE, ...probe });
  } finally {
    await browser.close();
  }
}

/**
 * Run in the page: scroll `scroller` (the aside itself when `null`) to `scrollTo` — `'max'`, an
 * offset, or `null` to leave it — then read the foot against the aside. `dock` is the box as the
 * scroller clips it; `foot` is the unclipped box, so a foot laid out below the fold reads as such.
 */
export function readInspectorFoot({
  aside: asideAt,
  foot: footAt,
  scroller: scrollerAt,
  scrollTo,
}) {
  const aside = document.querySelector(asideAt);
  const footElement = aside.querySelector(footAt);
  const scroller = scrollerAt ? aside.querySelector(scrollerAt) : aside;
  if (scrollTo === 'max') scroller.scrollTop = scroller.scrollHeight;
  else if (typeof scrollTo === 'number') scroller.scrollTop = scrollTo;
  const box = aside.getBoundingClientRect();
  const foot = footElement.getBoundingClientRect();
  const clip = scroller.getBoundingClientRect();
  // Read off the content above, not the foot, so no mutation of the foot's own geometry trips it.
  const axesBottom = footElement.previousElementSibling.getBoundingClientRect().bottom;
  return {
    panelFits: axesBottom + foot.height < box.bottom,
    overflow: scroller.scrollHeight - scroller.clientHeight,
    scrollTop: scroller.scrollTop,
    column: {
      top: box.top,
      bottom: box.bottom,
      left: box.left + aside.clientLeft,
      right: box.right,
      height: box.height,
    },
    foot: { top: foot.top, bottom: foot.bottom, left: foot.left, right: foot.right },
    dock: {
      bottom: Math.min(foot.bottom, clip.bottom),
      left: Math.max(foot.left, clip.left),
      right: Math.min(foot.right, clip.right),
    },
  };
}

/** The dock sits on the column's foot at its full width, within a pixel on each edge. */
export function assertDockAtColumnFoot(measured, { box = 'dock', fits = true } = {}) {
  if (fits) assert.ok(measured.panelFits, 'NON-VACUITY: the panel must be shorter than the column');
  for (const [edge, actual, expected] of [
    ['bottom', measured[box].bottom, measured.column.bottom],
    ['left', measured[box].left, measured.column.left],
    ['right', measured[box].right, measured.column.right],
  ]) {
    assert.ok(
      Math.abs(actual - expected) <= 1,
      `the dock's ${edge} edge is ${actual}px against the column's ${expected}px`
    );
  }
}

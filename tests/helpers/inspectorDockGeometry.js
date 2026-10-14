/** The world catalogues' bulk dock, measured against the inspector column in Chromium (issue 2489). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

import { borrowBrowser } from './layout-harness.js';
import { scopedComponentCss } from './scoped-component-css.js';

/**
 * The mounted inspector column, laid out as the frame's grid track stretches it, with its dock's
 * painted box against the column's border-box inner edges. `componentPaths` supply the scoped CSS.
 */
export async function measureInspectorDock(asideMarkup, { repoRoot, componentPaths, view }) {
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
    return await page.evaluate(() => {
      const aside = document.querySelector('[data-scoped-list-inspector]');
      const dockElement = aside.querySelector('.fab-bulk-edit-dock');
      const box = aside.getBoundingClientRect();
      const dock = dockElement.getBoundingClientRect();
      // The scroller clips its content, so the dock is measured as it PAINTS, not as it is laid out.
      const clip = aside
        .querySelector('.manager-scoped-list-inspector-scroll')
        .getBoundingClientRect();
      // Read off the axes, not the dock, so no mutation of the dock's own geometry trips it.
      const axesBottom = dockElement.previousElementSibling.getBoundingClientRect().bottom;
      return {
        panelFits: axesBottom + dock.height < box.bottom,
        column: { bottom: box.bottom, left: box.left + aside.clientLeft, right: box.right },
        dock: {
          bottom: Math.min(dock.bottom, clip.bottom),
          left: Math.max(dock.left, clip.left),
          right: Math.min(dock.right, clip.right),
        },
      };
    });
  } finally {
    await browser.close();
  }
}

/** The dock sits on the column's foot at its full width, within a pixel on each edge. */
export function assertDockAtColumnFoot(measured) {
  assert.ok(measured.panelFits, 'NON-VACUITY: the panel must be shorter than the column');
  for (const [edge, actual, expected] of [
    ['bottom', measured.dock.bottom, measured.column.bottom],
    ['left', measured.dock.left, measured.column.left],
    ['right', measured.dock.right, measured.column.right],
  ]) {
    assert.ok(
      Math.abs(actual - expected) <= 1,
      `the dock's ${edge} edge is ${actual}px against the column's ${expected}px`
    );
  }
}

/** Fixtures and rendered-geometry readers for `manager-layout-browsers.js` (issue 1670). */

import { openLayoutContext } from '../helpers/layout-harness.js';

import { chipCss, css, withChipHash } from './manager-layout-shared.js';

// Mirrors the shipped two-line rhythm: name + type (+ quantity) on line 1.
const COPY_ROW = `<li class="manager-knowledge-copy-row"><span class="manager-knowledge-copy-identity"><span class="manager-knowledge-copy-copy"><span class="manager-knowledge-copy-heading"><strong class="manager-knowledge-copy-name">An Exceptionally Long Localized Recipe Item Name</strong><span class="manager-chip">4 Recipe Book</span><span class="manager-chip">×3</span></span><span class="manager-knowledge-copy-chips"><span class="manager-chip is-warning">2 of 5 uses spent</span><span class="manager-chip is-danger">Inert</span></span></span></span><span class="manager-knowledge-row-actions"><button class="fabricate-button manager-button fab-manager-button">Expend use</button><button class="fabricate-button manager-button is-danger">Delete</button></span></li>`;

// A nav taller than the body, so a missing cap on the stacked rail is measurable (issue 1972).
export const RAIL = `<aside class="manager-rail"><p class="manager-rail-title">GM management</p><nav class="manager-nav">${Array.from(
  { length: 40 },
  (_, index) => `<button class="manager-nav-button">Nav entry ${index + 1}</button>`
).join('')}</nav></aside>`;

function knowledgeMarkup(width, { collapsed, height }) {
  const name = 'Aria Thorn';
  const bodyClass = collapsed ? 'manager-body is-rail-collapsed' : 'manager-body';
  // Enough rows that the detail content outgrows `.manager-body` at every ladder width.
  const rows = COPY_ROW.repeat(16);
  return `<style>${css}</style><style>${chipCss}</style><div style="width:${width}px;height:${height}px"><div class="fabricate-manager" data-manager-view="knowledge"><div class="manager-titlebar">titlebar</div><div class="manager-header">header</div><div class="${bodyClass}">${RAIL}<main class="manager-main manager-knowledge-main" data-knowledge-view><section class="manager-knowledge-roster"><label class="fabricate-search manager-search"><input type="search"></label><div class="manager-knowledge-roster-scroll"><div class="manager-knowledge-roster-list"><button class="manager-knowledge-roster-row"><span class="fab-medallion" style="width:34px;height:34px"></span><span class="manager-knowledge-roster-copy"><strong class="manager-knowledge-roster-name">${name}</strong><small class="manager-knowledge-roster-meta">2 item(s) · 3 learned</small></span></button></div></div></section><section class="manager-knowledge-detail"><header class="manager-knowledge-detail-header"><div class="manager-knowledge-detail-identity"><div class="manager-knowledge-detail-copy"><h2 class="manager-knowledge-detail-name">${name}</h2></div></div><div class="manager-knowledge-fact-cluster"><div class="manager-fact"><span class="manager-fact-line"><strong>2</strong> <span class="manager-fact-label">Recipe items</span></span></div><div class="manager-fact"><span class="manager-fact-line"><strong>3</strong> <span class="manager-fact-label">Learned recipes</span></span></div></div><div class="manager-knowledge-reset-actions"><button class="fabricate-button manager-button fab-manager-button is-danger">Reset this system</button><button class="fabricate-button manager-button fab-manager-button is-danger">Reset all systems</button></div></header><div class="fabricate-tabs manager-editor-tabs manager-knowledge-tabs"><button class="manager-editor-tab-button is-active">Recipe items</button><button class="manager-editor-tab-button">Learned recipes</button></div><section class="manager-editor-tab-panel manager-knowledge-panel"><div class="manager-knowledge-tab-body"><ul class="manager-knowledge-row-list">${rows}</ul></div></section></section></main></div></div></div>`;
}

/**
 * Render the Knowledge route inside a real Manager root and read its geometry.
 *
 * @param {number} width Manager window width, in px
 * @param {{ collapsed?: boolean, height?: number }} [options]
 * @returns {Promise<object>} column boxes, scroll state of the body and tab panel, rail borders
 */
export async function readRenderedKnowledgeGeometry(
  width,
  { collapsed = false, height = 686 } = {}
) {
  const context = await openLayoutContext({
    viewport: { width, height: Math.max(720, height + 34) },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(withChipHash(knowledgeMarkup(width, { collapsed, height })));
    return await page.evaluate(() => {
      const box = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value
          ? {
              left: value.left,
              right: value.right,
              top: value.top,
              bottom: value.bottom,
              width: value.width,
              height: value.height,
            }
          : null;
      };
      const scroller = (selector) => {
        const node = document.querySelector(selector);
        return {
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          clientWidth: node.clientWidth,
          overflowY: getComputedStyle(node).overflowY,
        };
      };
      const root = document.querySelector('.fabricate-manager');
      const rowNode = document.querySelector('.manager-knowledge-copy-row');
      const railStyle = getComputedStyle(document.querySelector('.manager-rail'));
      return {
        rail: box('.manager-rail'),
        roster: box('.manager-knowledge-roster'),
        detail: box('.manager-knowledge-detail'),
        body: box('.manager-body'),
        panel: box('.manager-knowledge-panel'),
        headerHeight: box('.manager-knowledge-detail-header').height,
        tabBodyHeight: box('.manager-knowledge-tab-body').height,
        row: box('.manager-knowledge-copy-row'),
        actions: box('.manager-knowledge-row-actions'),
        bodyScroll: scroller('.manager-body'),
        panelScroll: scroller('.manager-knowledge-panel'),
        railBorder: { right: railStyle.borderRightWidth, bottom: railStyle.borderBottomWidth },
        inspectorPresent: Boolean(document.querySelector('.manager-inspector')),
        rowOverflow: rowNode.scrollWidth > rowNode.clientWidth + 1,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
  } finally {
    await context.close();
  }
}

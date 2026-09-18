/** Fixtures and rendered-geometry readers for `manager-layout-browsers.js` (issue 1670). */

import { openLayoutContext } from '../helpers/layout-harness.js';

import { chipCss, css, withChipHash } from './manager-layout-shared.js';

// The one Knowledge hazard source text cannot prove.
export async function readRenderedKnowledgeGeometry(width) {
  const context = await openLayoutContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // Mirrors the shipped two-line rhythm: name + type (+ quantity) on line 1.
    const row = `<li class="manager-knowledge-copy-row"><span class="manager-knowledge-copy-identity"><span class="manager-knowledge-copy-copy"><span class="manager-knowledge-copy-heading"><strong class="manager-knowledge-copy-name">An Exceptionally Long Localized Recipe Item Name</strong><span class="manager-chip">4 Recipe Book</span><span class="manager-chip">×3</span></span><span class="manager-knowledge-copy-chips"><span class="manager-chip is-warning">2 of 5 uses spent</span><span class="manager-chip is-danger">Inert</span></span></span></span><span class="manager-knowledge-row-actions"><button class="fabricate-button manager-button fab-manager-button">Expend use</button><button class="fabricate-button manager-button is-danger">Delete</button></span></li>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div style="width:${width}px;height:686px"><div class="fabricate-manager" data-manager-view="knowledge"><div class="manager-body"><aside class="manager-rail">Rail</aside><main class="manager-main manager-knowledge-main" data-knowledge-view><section class="manager-knowledge-roster"><label class="fabricate-search manager-search"><input type="search"></label><div class="manager-knowledge-roster-scroll"><div class="manager-knowledge-roster-list"><button class="manager-knowledge-roster-row"><span class="fab-medallion" style="width:34px;height:34px"></span><span class="manager-knowledge-roster-copy"><strong class="manager-knowledge-roster-name">Aria Thorn</strong><small class="manager-knowledge-roster-meta">2 item(s) · 3 learned</small></span></button></div></div></section><section class="manager-knowledge-detail"><header class="manager-knowledge-detail-header"><div class="manager-knowledge-detail-identity"><div class="manager-knowledge-detail-copy"><h2 class="manager-knowledge-detail-name">Aria Thorn</h2></div></div><div class="manager-knowledge-fact-cluster"><div class="manager-fact"><span class="manager-fact-line"><strong>2</strong> <span class="manager-fact-label">Recipe items</span></span></div><div class="manager-fact"><span class="manager-fact-line"><strong>3</strong> <span class="manager-fact-label">Learned recipes</span></span></div></div><div class="manager-knowledge-reset-actions"><button class="fabricate-button manager-button fab-manager-button is-danger">Reset this system</button><button class="fabricate-button manager-button fab-manager-button is-danger">Reset all systems</button></div></header><div class="fabricate-tabs manager-editor-tabs manager-knowledge-tabs"><button class="manager-editor-tab-button is-active">Recipe items</button><button class="manager-editor-tab-button">Learned recipes</button></div><section class="manager-editor-tab-panel manager-knowledge-panel"><div class="manager-knowledge-tab-body"><ul class="manager-knowledge-row-list">${row}</ul></div></section></section></main></div></div></div>`
      )
    );
    return await page.evaluate(() => {
      const box = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value ? { left: value.left, right: value.right, width: value.width } : null;
      };
      const root = document.querySelector('.fabricate-manager');
      const rowNode = document.querySelector('.manager-knowledge-copy-row');
      return {
        rail: box('.manager-rail'),
        roster: box('.manager-knowledge-roster'),
        detail: box('.manager-knowledge-detail'),
        row: box('.manager-knowledge-copy-row'),
        actions: box('.manager-knowledge-row-actions'),
        inspectorPresent: Boolean(document.querySelector('.manager-inspector')),
        rowOverflow: rowNode.scrollWidth > rowNode.clientWidth + 1,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
  } finally {
    await context.close();
  }
}
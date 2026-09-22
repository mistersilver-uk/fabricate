/** Fixtures and rendered-geometry readers for `manager-layout-downtime.js` (issue 1670). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import { css } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -- The GM Downtime preview at a real window width (issue 1185) ------------------------
const downtimePreviewPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/downtime/WorldDowntimePreview.svelte'
);
const downtimePreviewScoped = scopedComponentCss(downtimePreviewPath);

/**
 * Render the preview's own markup at one manager-pane width and read its two track counts.
 *
 * @param {number} paneWidth width of the manager main pane, in px
 * @returns {Promise<object>} track counts, the container's content width, and two box widths
 */
export async function readDowntimePreviewArrangement(paneWidth) {
  const hash = downtimePreviewScoped.hashClass;
  const context = await openLayoutContext({
    viewport: { width: 1920, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const card = (index) =>
      `<article class="${hash}">` +
      `<span class="downtime-feature-icon is-tint-accent ${hash}"><i class="fas fa-star"></i></span>` +
      `<h4 class="${hash}">Benefit ${index}</h4>` +
      `<p class="${hash}">A short line of benefit copy for card ${index}.</p></article>`;
    await page.setContent(
      `<style>${css}</style><style>${downtimePreviewScoped.css}</style>` +
        `<div class="fabricate-manager" data-manager-view="world-downtime">` +
        `<div style="width:${paneWidth}px">` +
        `<div class="downtime-preview ${hash}">` +
        `<section class="downtime-hero ${hash}">` +
        `<div class="downtime-hero-copy ${hash}"><h2 class="${hash}">Run downtime.</h2></div>` +
        `<div class="downtime-board ${hash}"><header class="${hash}">Party board</header></div>` +
        `</section>` +
        `<section class="downtime-benefits ${hash}">` +
        `<div class="downtime-feature-grid ${hash}">${[1, 2, 3, 4].map(card).join('')}</div>` +
        `</section></div></div></div>`
    );
    return await page.evaluate(() => {
      const at = (selector) => document.querySelector(selector);
      const tracks = (selector) =>
        getComputedStyle(at(selector)).gridTemplateColumns.trim().split(/\s+/).length;
      const boxWidth = (selector) => Math.round(at(selector).getBoundingClientRect().width);
      const panel = at('.downtime-preview');
      const panelStyle = getComputedStyle(panel);
      return {
        containerWidth: Math.round(
          panel.clientWidth -
            Number.parseFloat(panelStyle.paddingLeft) -
            Number.parseFloat(panelStyle.paddingRight)
        ),
        heroTracks: tracks('.downtime-hero'),
        gridTracks: tracks('.downtime-feature-grid'),
        boardWidth: boxWidth('.downtime-board'),
        cardWidth: boxWidth('.downtime-feature-grid > article'),
      };
    });
  } finally {
    await context.close();
  }
}

// -- Downtime rail tab badges, measured (issue 1302) --------------------------------------
const downtimeNavGroupPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/ManagerWorldDowntimeNavGroup.svelte'
);
const downtimeNavGroupSource = readFileSync(downtimeNavGroupPath, 'utf8');

export function assertBadgeFixtureMirrorsComponent() {
  // BOTH Downtime badges are the ISSUE-SUMMARY vehicle (issue 1515). The sub-item badge was
  // `.manager-nav-count`, which drew a companion's attention signal as a record count while
  // the parent rollup — the SUM of exactly those badges — drew as the issue pill. Matched as
  // ADJACENCY rather than as two independent `includes`, which any two unrelated lines satisfy
  // now that both marks name the same class.
  assert.match(
    downtimeNavGroupSource,
    /class="manager-nav-issue-badge"\s+data-world-downtime-badge=\{item\.id\}/,
    'the sub-item badge fixture below must be the marker the component actually emits'
  );
  assert.match(
    downtimeNavGroupSource,
    /class="manager-nav-issue-badge"\s+data-world-downtime-badge-total/,
    'and so must the parent rollup fixture'
  );
  assert.equal(
    /class="manager-nav-count"\s+data-world-downtime-badge/.test(downtimeNavGroupSource),
    false,
    'and neither Downtime badge has gone back to the record-count vehicle'
  );
}

// The rail chrome every fixture here needs, at the shipped 220px (or the collapsed 56px).
export function railPage(navMarkup, bodyClass = '') {
  return (
    `<style>${css}</style>` +
    `<div class="fabricate-manager"><div class="manager-body${bodyClass}">` +
    `<aside class="manager-rail"><nav class="manager-nav">${navMarkup}</nav></aside>` +
    `<main class="manager-main"></main></div></div>`
  );
}


// -- The companion Downtime panel's layout contract (issue 1213) -------------------------
// The chain is applied WHOLE, deliberately. Two earlier probes of this same rule reached the
// wrong conclusion by shortening it -- one set `height: 100%` on the companion root alone,
// which reads as definite while its ancestor is auto, and one appended a tall child to a
// `flex-direction: column` root, where `flex-shrink: 1` squashes the child so nothing ever
// overflows. So the fixture runs `.fabricate-manager` -> `.manager-body` -> `.manager-main` ->
// `.downtime-host` -> `.downtime-extension-panels` -> the panel region -> the mount target,
// with the host's own compiled CSS after the global sheet, and every overflow case below
// controls the flex factor explicitly.
const downtimeHostPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte'
);
export const downtimeHostScoped = scopedComponentCss(downtimeHostPath);

// A companion root, parameterised by the ONE thing each overflow case varies.
export const companionRoot = (style, children) =>
  `<div id="companion-root" style="height:100%;min-height:0;${style}">${children}</div>`;
export const companionRows = '<p style="height:200px;margin:0">row</p>'.repeat(12);
export const companionShort = companionRoot('', '<p style="margin:0">short</p>');
export const MANAGER_WIDTH_LADDER = [1400, 1200, 1100, 900, 700, 600];

/**
 * Render the Downtime route at one Manager width and read it with `readInPage`.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @param {string} hostClasses extra classes on `.downtime-host`
 * @param {string} hostChildren the host's own markup
 * @param {Function} readInPage evaluated in the page; returns the measurements
 * @returns {Promise<object>} whatever `readInPage` returned
 */
async function readDowntimeRoute(managerWidth, hostClasses, hostChildren, readInPage) {
  const context = await openLayoutContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><style>${downtimeHostScoped.css}</style>` +
        `<div style="width:${managerWidth}px;height:760px">` +
        `<div class="fabricate-manager" data-manager-view="world-downtime">` +
        `<div class="manager-titlebar">titlebar</div>` +
        `<div class="manager-header">header</div>` +
        `<div class="manager-body">` +
        `<aside class="manager-rail">rail</aside>` +
        `<main class="manager-main">` +
        `<section class="downtime-host ${hostClasses}" data-world-downtime-host>` +
        hostChildren +
        `</section></main></div></div></div>`
    );
    return await page.evaluate(readInPage);
  } finally {
    await context.close();
  }
}

/**
 * Render the provider-mode chain at one Manager width and read every link's box.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @param {string} companionMarkup what the companion mounts into the target
 * @returns {Promise<object>} client heights down the chain, plus the panel's scroll state
 */
export async function readCompanionPanelChain(managerWidth, companionMarkup) {
  const hash = downtimeHostScoped.hashClass;
  return readDowntimeRoute(
    managerWidth,
    hash,
    `<div class="downtime-extension-panels ${hash}">` +
      `<div class="downtime-extension-panel ${hash}" role="region" tabindex="-1">` +
      `<div class="downtime-extension-target ${hash}" data-downtime-extension-panel="board">` +
      companionMarkup +
      `</div></div></div>`,
    () => {
      const at = (selector) => document.querySelector(selector);
      const panels = at('.downtime-extension-panels');
      const host = at('.downtime-host');
      const target = at('.downtime-extension-target');
      const targetElement = target;
      const targetStyle = getComputedStyle(target);
      return {
        main: at('.manager-main').clientHeight,
        host: host.clientHeight,
        panels: panels.clientHeight,
        panelsScrollHeight: panels.scrollHeight,
        panelsOverflowY: getComputedStyle(panels).overflowY,
        // BOTH halves, because `scrollHeight` reports overflowing content whether or not the
        // box can scroll it: an `overflow: hidden` panel that CLIPS its companion reports the
        // identical `scrollHeight > clientHeight` as one that scrolls it, so overflow alone
        // reads as "the fallback works" over a panel that silently swallows the content.
        panelScrolls:
          /auto|scroll/.test(getComputedStyle(panels).overflowY) &&
          panels.scrollHeight > panels.clientHeight,
        panelsOverflows: panels.scrollHeight > panels.clientHeight,
        region: at('.downtime-extension-panel').clientHeight,
        target: targetElement.clientHeight,
        targetWidth: targetElement.clientWidth,
        targetPadding: [
          targetStyle.paddingTop,
          targetStyle.paddingRight,
          targetStyle.paddingBottom,
          targetStyle.paddingLeft,
        ].join(' '),
        targetOverflow: `${targetStyle.overflowX} ${targetStyle.overflowY}`,
        targetContainerType: targetStyle.containerType,
        // How far the mount target sits inside the host box. Core's old `12px 20px 24px` lived
        // on the panels row rather than on the target, so reading the target's OWN padding
        // could never have seen it — the inset has to be measured as an offset.
        insetTop: Math.round(target.getBoundingClientRect().top - host.getBoundingClientRect().top),
        insetLeft: Math.round(
          target.getBoundingClientRect().left - host.getBoundingClientRect().left
        ),
        hostWidth: host.clientWidth,
        companion: at('#companion-root').clientHeight,
      };
    }
  );
}

/**
 * Read the CORE-FALLBACK host, which keeps two grid tracks and its own preview scroller.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @returns {Promise<object>} the two rows' boxes and the host's resolved track list
 */
export async function readCoreFallbackHostRows(managerWidth) {
  const hash = downtimeHostScoped.hashClass;
  return readDowntimeRoute(
    managerWidth,
    `core-fallback ${hash}`,
    `<div class="downtime-preview-scroll ${hash}">` +
      '<p style="height:200px;margin:0">row</p>'.repeat(12) +
      `</div><div class="downtime-tab-card-stand-in" style="height:44px">strip</div>`,
    () => {
      const at = (selector) => document.querySelector(selector);
      const host = at('.downtime-host');
      const scroll = at('.downtime-preview-scroll');
      const strip = at('.downtime-tab-card-stand-in');
      return {
        host: host.clientHeight,
        scroll: scroll.clientHeight,
        scrollScrolls:
          /auto|scroll/.test(getComputedStyle(scroll).overflowY) &&
          scroll.scrollHeight > scroll.clientHeight,
        strip: strip.clientHeight,
        stripBottomGap: Math.round(
          host.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom
        ),
      };
    }
  );
}
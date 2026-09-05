/*
 * THE WORLD COMPONENT CATALOGUE, RENDERED IN A REAL BROWSER (issue 1371).
 *
 * Two things happy-dom cannot answer and this file therefore does: WHICH ELEMENT IS ON TOP at a
 * control's own centre (the pointer hit-tests the delta's acceptance criteria name), and WHAT THE
 * CASCADE ACTUALLY RESOLVES for a rule that has to beat an unlayered competitor (the toolbar's
 * two micro-type corrections). Both are read off the SHIPPED markup and the SHIPPED stylesheets.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The issue's own acceptance criteria require a pointer hit-test on the catalogue row's identity
 * button, its `open-entry` pen, the bulk selection checkbox and the armed bulk delete, with the
 * stated reason that the row's trailing meta run shares a flex row with `.manager-action-group`
 * and the dock is a `position: sticky` band with negative inline margins that the list scrolls
 * under. UX review rounds 1 and 2 both found the set untested (`review-r9-ux.md` F-H): nothing in
 * `tests/components/world-component-catalogue-mounted.test.js` calls `elementFromPoint`, and
 * nothing can — happy-dom computes no layout at all, so `document.elementFromPoint` there answers
 * `null` for every point on the page and an assertion built on it would be vacuous rather than
 * false. DOM presence is not the question here. Which element is ON TOP at the control's own
 * centre is.
 *
 * ── AND WHY THE MARKUP IS THE PRODUCT'S ──────────────────────────────────────────────────
 * `tests/components/tool-rules-list-parity.test.js` hand-writes its fixture, which is the right
 * trade for a type-and-cascade contract and the wrong one here: a hand-written row goes on being
 * hit-testable after the real row stops emitting the element the test probes. So this follows
 * `tests/components/bulk-edit-dock-pinning.test.js` instead — MOUNT the shipped
 * `WorldComponentCataloguePage` through the shared harness, take the rendered tree's own
 * `innerHTML`, and ship that into Chromium inside the manager shell it actually renders in.
 * Deleting the checkbox, the pen or the dock from the product empties this gate's markup and the
 * `found` assertions fail on the spot.
 *
 * ── BOTH STYLESHEETS, FOR THE REASON THE DOCK GATE RECORDS ───────────────────────────────
 * `styles/fabricate.css` owns `.manager-body`'s column grid, `.manager-inspector`'s scrollport
 * and the route-scoped row rules; each component's own appearance lives in a Svelte-scoped block
 * that appears nowhere in that file. Injecting one without the other leaves half the geometry
 * unstyled, and an unstyled row hit-tests differently from a real one. The rendered markup
 * already carries the real `svelte-<hash>` classes, so the two halves match by construction —
 * `HASH_PARITY` below asserts that rather than assuming it.
 *
 * ── THE NEGATIVE CONTROL IS IN THE FILE, NOT IN A LOST SHELL SESSION ─────────────────────
 * A hit test that has never been seen to FAIL is indistinguishable from one that reports `true`
 * for everything. The second page load injects one extra rule that overlays each row and the dock
 * with a transparent `::after`, and the suite asserts that EVERY target then misses and that the
 * interceptor is named in the report. That is the whole reddening argument, run on every CI
 * execution rather than pasted into a handoff once.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

// The frame's lifted view-state factory, so the paged mount below states the SHIPPED shape.
import { createScopedListBrowserState } from '../../src/utils/managerBrowserViewState.js';
import {
  COMPONENT_SYSTEMS,
  componentScopeFor,
  createWorldComponentCatalogueHarness,
  drainMicrotasks,
} from '../helpers/componentScopeMountModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createWorldComponentCatalogueHarness({
  repoRoot,
  tmpPrefix: 'fabricate-catalogue-pointer-',
});

// The manager host is deliberately wide: `styles/fabricate.css` collapses `.manager-body` to a
// single scrolling column at or below 1120px of container width, which would stack the list over
// the inspector and put the dock somewhere no GM sees it. This measures the configuration the
// screen is FOR, and `MIN_ROW_HEIGHT_PX` below is what stops a collapsed layout passing quietly.
const HOST_WIDTH_PX = 1280;
const HOST_HEIGHT_PX = 720;
// Anti-vacuity: a row laid out with no stylesheet is a few pixels tall and every point in it
// belongs to whatever painted last. A real row is the reference's 38px medallion plus padding.
const MIN_ROW_HEIGHT_PX = 40;
// Anti-vacuity for the collector: the tree's styled components. Measured at 20; a floor well
// under it still fails loudly if the collector silently stops finding blocks.
const MIN_SCOPED_BLOCKS = 12;

/**
 * Every scoped `<style>` block in the tree, in the order the harness compiles them.
 *
 * READ OFF THE HARNESS MANIFEST rather than off a second hand-written list, so a component added
 * to the screen cannot arrive styled in the browser and unstyled here. A module with no block at
 * all is skipped — `IconButton`, `ManagerButton`, `ManagerToolbar`, `ArmedDangerButton` and
 * `InspectorCard` all draw entirely from the global sheet — and the count is asserted so the
 * skip cannot quietly become "all of them".
 *
 * @returns {{css: string, hashes: string[], blocks: number}}
 */
function collectScopedCss() {
  const parts = [];
  const hashes = [];
  for (const modulePath of compiledModules) {
    const filename = resolve(repoRoot, modulePath);
    const { css } = compile(readFileSync(filename, 'utf8'), { filename, css: 'external' });
    if (!css?.code) continue;
    parts.push(css.code);
    const hash = css.code.match(/\.(svelte-[a-z0-9]+)\b/)?.[1];
    if (hash) hashes.push(hash);
  }
  return { css: parts.join('\n'), hashes, blocks: parts.length };
}

/**
 * The catalogue's rendered markup inside the manager shell it ships in.
 *
 * The page's own root IS `main.manager-main`, so the wrappers here are only what sits above it:
 * the themed area root that carries the route attribute every `[data-manager-view=…]` rule in
 * the sheet reads, `.manager-body`'s column grid, and the rail that occupies the first track.
 * The inspector is INSIDE the page — `EntityListInspectorFrame` renders it as the second track of
 * its own layout — so nothing here supplies one.
 *
 * @param {string} productMarkup
 * @param {string} scopedCss
 * @param {string} control an extra rule set; `''` for the honest page.
 * @returns {string}
 */
function cataloguePage(productMarkup, scopedCss, control) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${scopedCss}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${HOST_WIDTH_PX}px; height: ${HOST_HEIGHT_PX}px; }
    </style>
    <style>${control}</style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="world-components">
          <div class="manager-body">
            <nav class="manager-rail"></nav>
            ${productMarkup}
          </div>
        </div>
      </div>
    </body></html>`;
}

/**
 * The rule set that reddens every assertion below.
 *
 * A transparent `::after` stretched over each row and over the dock is the exact shape of the
 * defect a hit test exists to catch: nothing moves, nothing changes colour, every element is
 * still in the DOM at its right size, and every control stops being clickable. `position:
 * relative` on the row is part of the control rather than of the product — the row does not
 * declare one — because an absolutely positioned overlay needs a containing block to stretch to.
 */
const OVERLAY_CONTROL = `
  .manager-scoped-list-row { position: relative; }
  .manager-scoped-list-row::after { content: ''; position: absolute; inset: 0; }
  .fab-bulk-edit-dock { position: relative; }
  .fab-bulk-edit-dock::after { content: ''; position: absolute; inset: 0; }
  .fab-bulk-inset { position: relative; }
  .fab-bulk-inset::after { content: ''; position: absolute; inset: 0; }
  .fab-bulk-component-chips { position: relative; }
  .fab-bulk-component-chips::after { content: ''; position: absolute; inset: 0; }
  .manager-scoped-list-search-row { position: relative; }
  .manager-scoped-list-search-row::after { content: ''; position: absolute; inset: 0; }
`;

/**
 * The four controls the delta names, each as the point a GM aims at and the control it must hit —
 * and, since issue 1371 r17-b (quality N3), the five controls r16 put inside the bulk insets.
 *
 * `probe` and `target` differ for the checkbox and for the inset row. `SelectionCheckbox` keeps
 * the real `<input>` in the DOM at 1x1 `opacity: 0` and paints a sibling
 * `<span class="fab-selection-check">`; the pointer aims at the painted box and the control that
 * receives it is the `<label>` wrapping both. Probing the input would measure a one-pixel point
 * no GM can aim at. An inset row is a `<button>` whose label is a `<span>` child: a GM aims at the
 * name, and the point must belong to the row.
 *
 * The inset controls are the fragile kind a geometry read cannot see: 22px icon-only pager
 * buttons inside a 36px band inside a recessed card, 22px stepper adjuncts beside a 30px-capped
 * input, and a chip run painted above the inset, all inside a scroller the dock bleeds across.
 */
const TARGETS = [
  {
    label: 'row identity button',
    probe: '[data-scoped-list-row="resin"] [data-scoped-list-inspect]',
    target: '[data-scoped-list-row="resin"] [data-scoped-list-inspect]',
  },
  {
    label: 'row open-entry pen',
    probe: '[data-scoped-list-row="resin"] [data-scoped-list-action="open-entry"]',
    target: '[data-scoped-list-row="resin"] [data-scoped-list-action="open-entry"]',
  },
  {
    label: 'leading selection checkbox',
    probe: '[data-scoped-list-row="resin"] .fab-selection-check',
    target: '[data-scoped-list-row="resin"] .fab-selection-checkbox',
  },
  {
    label: 'armed bulk delete',
    probe: '[data-world-component-bulk-danger] [data-armed="true"]',
    target: '[data-world-component-bulk-danger] [data-armed="true"]',
  },
  // ── issue 1371 r17-b ──────────────────────────────────────────────────────────────────────
  {
    label: 'system inset row, aimed at its name',
    probe: '[data-bulk-inset="systems"] [data-world-component-bulk-option] .fab-bulk-inset-name',
    target: '[data-bulk-inset="systems"] [data-world-component-bulk-option]',
  },
  {
    // LIVE, not disabled: the honest mount hands the panel seven systems, so page two exists and
    // this button is the one a GM presses to reach the sixth.
    label: 'system inset pager next',
    probe: '[data-bulk-inset-next="systems"]',
    target: '[data-bulk-inset-next="systems"]',
  },
  {
    // The WELL is what a GM aims at and the `<input>` is the control, as with the checkbox: the
    // input must fill the well, or a click at the well's edge focuses nothing.
    label: 'tag inset search well, aimed at the well',
    probe: '[data-bulk-inset="tags"] .fab-bulk-inset-search',
    target: '[data-bulk-inset-search="tags"]',
  },
  {
    label: 'essence stepper increment',
    probe: '[data-world-component-bulk-essence="flame"] [data-stepper-increment]',
    target: '[data-world-component-bulk-essence="flame"] [data-stepper-increment]',
  },
  {
    label: 'staged tag chip',
    probe: '[data-world-component-bulk-tag-chip="fuel"]',
    target: '[data-world-component-bulk-tag-chip="fuel"]',
  },
  // ── issue 1371 r18-cat (M30) ─────────────────────────────────────────────────────────────
  {
    label: 'essence filter select',
    probe: '[data-scoped-list-filter="essence"]',
    target: '[data-scoped-list-filter="essence"]',
  },
];

/**
 * SEVEN systems for the honest mount (issue 1371 r17-b): five more than the shared roster, so the
 * systems inset pages and its `Next` is a live control rather than a disabled one. The corpus's
 * membership still names only the first two; the five extra hold nothing.
 */
const SEVEN_SYSTEMS = [
  ...COMPONENT_SYSTEMS,
  ...['Glass', 'Herb', 'Jewel', 'Loom', 'Mint'].map((name) => ({
    id: `sys-${name.toLowerCase()}`,
    name,
  })),
].map((system) =>
  // ONE SYSTEM'S RULES CARRY AN ESSENCE FOR `resin` (issue 1371 r18-cat, M30), so the measured
  // row draws a chip run and its geometry can be read; `coal` carries none, so a chipless row
  // stands beside it for the height comparison. Rules on a raw system are not membership — the
  // corpus's membership still names only the first two systems, so the delete plan is unmoved.
  system.id === 'sys-glass'
    ? { ...system, components: [{ id: 'resin', essences: { flame: 2 } }] }
    : system
);

/**
 * Hit-test every target at its own centre, wholly inside the page.
 *
 * `closest` rather than identity, because the topmost element at a control's centre is normally
 * one of its own children — the pen's `<i>`, the identity button's name `<span>`, the danger
 * button's label. What a pointer hit-test asks is whether the point belongs to the control, not
 * whether the control has no children.
 *
 * @param {Array<{label: string, probe: string, target: string}>} targets
 * @returns {Array<object>}
 */
function measurePointerTargets(targets) {
  return targets.map(({ label, probe, target }) => {
    const element = document.querySelector(probe);
    if (!element) return { label, probe, target, found: false };
    // AS A GM REACHES IT: the bulk panel is taller than its column, so a control below the fold
    // or under the sticky dock is scrolled to before it is aimed at. `elementFromPoint` answers
    // `null` outside the viewport and the dock for a point beneath it, and neither is a hit-test
    // of the control — the first measurement of the inset controls read exactly those two.
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      label,
      probe,
      target,
      found: true,
      width: Math.round(box.width),
      height: Math.round(box.height),
      matched: Boolean(hit?.closest?.(target)),
      hitTag: hit?.tagName ?? 'none',
      hitClass: String(hit?.getAttribute?.('class') ?? ''),
    };
  });
}

/**
 * The toolbar's two micro-type roles, as the cascade actually resolves them.
 *
 * READ IN THE BROWSER, because both values are decided by a LAYER contest rather than by
 * specificity alone: `styles/fabricate.css` is imported at `layer(modules)` and the frame's own
 * `css: 'injected'` block is unlayered, so the route correction has to live in the unlayered
 * block to win at all. Nothing in the source text says which rule won; only a computed style does.
 */
function measureToolbarType() {
  const read = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return { found: false, selector };
    const style = getComputedStyle(element);
    return {
      found: true,
      selector,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      color: style.color,
    };
  };
  return {
    membershipLabel: read('[data-scoped-list-filter-label="membership"]'),
    sortLabel: read('.manager-scoped-list-sort-label'),
    direction: read('[data-scoped-list-direction]'),
    // The ink the reference gives the direction toggle, resolved from the theme rather than
    // written here as a literal — the token is the design system's answer and a colour value is
    // not. Read through a PROBE rather than off the custom property, because a custom property
    // answers its authored form while `color` answers the computed one, and comparing the two
    // string forms would fail on notation alone.
    secondaryInk: readTokenAsColor('--fab-text-secondary'),
  };

  /**
   * One theme token, in the same computed notation `getComputedStyle().color` answers in.
   *
   * @param {string} token
   * @returns {string}
   */
  function readTokenAsColor(token) {
    const root = document.querySelector('.fabricate-manager');
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    root.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }
}

/**
 * The list column's LEAD and FOOT, measured against the column itself (issue 1371 r13-cat).
 *
 * M13: the drop zone takes the whole lead row now that the `+ Register item` action is gone.
 * M21 (issue 1371 r16-cat, superseding r13's M19): the whole list column runs edge to edge in its
 * pane — toolbar, rows scroller and pager all start and end at the column's own edges, the toolbar
 * sits at the pane's top and the pager flush at its bottom, the way the system Component Rules
 * list's `.manager-main` draws them. Measured in the lab before the change: a 321→1159 column
 * carrying a 16px inset on every side, so the toolbar and rows ran 337→1143 and the pager alone
 * bled through it (M19's negative margins). The rows keep their own inline inset INSIDE the
 * scroller, so they still sit inside the pager band exactly as the rules list's rows do.
 *
 * Read off a mount whose view-state pages at TWO rows, because the frame's pager is
 * `multiPageOnly` and the corpus is four records: at the default window there is no pager in
 * the markup to measure at all.
 */
function measureListFrame() {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const b = element.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width };
  };
  return {
    frame: box('.manager-scoped-list-frame'),
    column: box('.manager-scoped-list-column'),
    toolbar: box('.manager-scoped-list-toolbar'),
    rows: box('.manager-scoped-list-rows'),
    lead: box('.manager-scoped-list-lead'),
    dropZone: box('[data-item-drop-zone="component-create"]'),
    registerAction: box('[data-scoped-list-register-item]'),
    firstRow: box('[data-scoped-list-row]'),
    pager: box('.manager-scoped-list-column > .manager-pagination'),
    pagerSummary: box('[data-pagination-summary]'),
  };
}

/**
 * The bulk panel's geometry against the inspector column (issue 1371 r16-cat, maintainer ruling
 * M24), read off the honest mount, which has the panel on screen with a direction, a system and a
 * tag staged. Every number here is the prototype's (`proto:590-697`, `proto:5271-5340`,
 * `proto:791-796`) or the design-system rung it snaps to.
 */
function measureBulkGeometry() {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const b = element.getBoundingClientRect();
    const s = getComputedStyle(element);
    return {
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
      radius: s.borderTopLeftRadius,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      borderLeft: Number.parseFloat(s.borderLeftWidth),
      paddingLeft: s.paddingLeft,
      background: s.backgroundColor,
    };
  };
  return {
    aside: box('.manager-scoped-list-inspector'),
    scroller: box('.manager-scoped-list-inspector-scroll'),
    dock: box('.fab-bulk-edit-dock'),
    apply: box('[data-world-component-bulk-apply]'),
    danger: box('[data-world-component-bulk-danger] button'),
    segmentActive: box('[data-world-component-bulk-mode] .manager-segment.is-active'),
    segmentIdle: box('[data-world-component-bulk-mode] .manager-segment:not(.is-active)'),
    systemRow: box(
      '[data-bulk-inset="systems"] [data-world-component-bulk-option]'
    ),
    systemBox: box('[data-bulk-inset="systems"] .fab-bulk-inset-box'),
    categoryRow: box(
      '[data-bulk-inset="category"] [data-world-component-bulk-option]'
    ),
    tagRow: box('[data-bulk-inset="tags"] [data-world-component-bulk-option]'),
    tagChip: box('[data-world-component-bulk-tag-chip]'),
    insetPager: box('[data-bulk-inset="systems"] .fab-bulk-inset-pager'),
    searchWell: box('[data-bulk-inset="tags"] .fab-bulk-inset-search'),
    searchInput: box('[data-bulk-inset-search="tags"]'),
    pagerButton: box('[data-bulk-inset="systems"] .fab-bulk-inset-page'),
    essenceRow: box('[data-world-component-bulk-essence="flame"]'),
    essenceTile: box('[data-world-component-bulk-essence="flame"] [data-medallion="glyph"]'),
    essenceStep: box('[data-world-component-bulk-essence="flame"] [data-stepper-increment]'),
    essenceValue: box('[data-world-component-bulk-essence-input="flame"]'),
    essenceChip: box('[data-world-component-bulk-essence-chip="flame"]'),
  };
}

/** The row's leading edge order, which is the other half of the delta's own criterion. */
function measureRowOrder() {
  const row = document.querySelector('[data-scoped-list-row="resin"]');
  const box = row.getBoundingClientRect();
  const checkbox = row.querySelector('.fab-selection-checkbox').getBoundingClientRect();
  const medallion = row.querySelector('.fab-medallion').getBoundingClientRect();
  const pen = row.querySelector('[data-scoped-list-action="open-entry"]').getBoundingClientRect();
  // THE ESSENCE CHIP RUN AND THE STAT COLUMNS (issue 1371 r18-cat, M30), and a chipless row's
  // height to hold the chipped one against.
  const run = row.querySelector('[data-world-component-row-essences="resin"]');
  const chip = row.querySelector('[data-world-component-row-essence="flame"]');
  const stats = row.querySelector('[data-world-component-row-meta="resin"]');
  const chipless = document.querySelector('[data-scoped-list-row="coal"]');
  const rect = (element) => (element ? element.getBoundingClientRect() : null);
  return {
    rowHeight: box.height,
    rowLeft: box.left,
    rowRight: box.right,
    checkboxLeft: checkbox.left,
    medallionLeft: medallion.left,
    penLeft: pen.left,
    essenceRun: rect(run),
    essenceChip: rect(chip),
    essenceChipRadius: chip ? getComputedStyle(chip).borderTopLeftRadius : null,
    stats: rect(stats),
    chiplessRowHeight: chipless ? chipless.getBoundingClientRect().height : null,
  };
}

/**
 * The lead toolbar row's two selects (issue 1371 r18-cat, M30): the source select the prototype
 * draws (`proto:579`, measured by the parity region `cat-toolbar-source-filter`) and the essence
 * select the ruling adds beside it, which the prototype's catalogue does not draw and which has
 * therefore to match the control it stands beside rather than a prototype element of its own.
 */
function measureLeadRow() {
  const read = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return { found: false, selector };
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      found: true,
      selector,
      left: box.left,
      right: box.right,
      height: box.height,
      borderTopLeftRadius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
    };
  };
  return {
    source: read('[data-scoped-list-filter="source-type"]'),
    essence: read('[data-scoped-list-filter="essence"]'),
    search: read('[data-scoped-list-search]'),
  };
}

describe('the catalogue’s rendered pointer targets and toolbar micro-type', () => {
  const rendered = { markup: '', pagedMarkup: '', armed: false, scoped: null };
  let honest = null;
  let overlaid = null;
  let rowOrder = null;
  let toolbarType = null;
  let leadRow = null;
  let listFrame = null;
  let bulkGeometry = null;

  before(async () => {
    rendered.scoped = collectScopedCss();

    await harness.setup();
    try {
      const target = await harness.mount({
        // ONE VOCABULARY TAG, so the tag inset draws a row and a staged chip can be measured
        // (M24). `buildWorldScopeState` attaches this leg; the projection helper alone does not.
        scope: { ...componentScopeFor(), worldVocabulary: { categories: [], tags: ['fuel'] } },
        systems: SEVEN_SYSTEMS,
        // ONE WORLD ESSENCE, so the essence group draws a row whose geometry can be measured (M25).
        worldEssences: [{ id: 'flame', name: 'Flame', icon: 'fas fa-fire', colorToken: 'ember' }],
        // `resin` is the one record NO system holds, so the bulk delete plan frees it and the
        // dock's danger leg arms for real rather than branching to `Cannot delete`.
        actions: { deleteEntity: async () => true },
        worldItems: [{ uuid: 'Item.resin-source', name: 'Wildwood Resin', description: 'Tapped.' }],
      });
      target.querySelector('[data-scoped-list-select="resin"]').click();
      await drainMicrotasks();
      // STAGE ONE OF EVERYTHING THE GEOMETRY PASS MEASURES, before arming the delete — the danger
      // control disarms on blur, so it goes last: a direction (the ACTIVE segment's fill), a
      // system (a lit box) and a tag (a staged chip).
      target.querySelector(':scope [data-world-component-bulk-mode-option="add"]').click();
      await drainMicrotasks();
      target
        .querySelector(':scope [data-bulk-inset="systems"] [data-world-component-bulk-option]')
        .click();
      await drainMicrotasks();
      target
        .querySelector(':scope [data-bulk-inset="tags"] [data-world-component-bulk-option="fuel"]')
        .click();
      await drainMicrotasks();
      target
        .querySelector(':scope [data-world-component-bulk-essence="flame"] [data-stepper-increment]')
        .click();
      await drainMicrotasks();
      const danger = target.querySelector(':scope [data-world-component-bulk-danger] button');
      danger.click();
      await drainMicrotasks();
      rendered.armed = danger.getAttribute('data-armed') === 'true';
      rendered.markup = target.innerHTML;

      // A SECOND MOUNT, paged at two rows, so the foot pager is in the markup (see
      // `measureListFrame`). Nothing is ticked here: the bulk dock replaces the inspector, and
      // this mount measures the resting column.
      const paged = await harness.mount({
        scope: componentScopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: [],
        browserState: { ...createScopedListBrowserState(), pageSize: 2 },
      });
      await drainMicrotasks();
      rendered.pagedMarkup = paged.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX },
      });
      await page.setContent(cataloguePage(rendered.markup, rendered.scoped.css, ''), {
        waitUntil: 'load',
      });
      // GEOMETRY FIRST, hit-tests after: the hit-tests scroll the panel to each control, and the
      // geometry pass reads viewport-relative boxes.
      rowOrder = await page.evaluate(measureRowOrder);
      toolbarType = await page.evaluate(measureToolbarType);
      leadRow = await page.evaluate(measureLeadRow);
      bulkGeometry = await page.evaluate(measureBulkGeometry);
      honest = await page.evaluate(measurePointerTargets, TARGETS);
      await page.setContent(
        cataloguePage(rendered.markup, rendered.scoped.css, OVERLAY_CONTROL),
        { waitUntil: 'load' }
      );
      overlaid = await page.evaluate(measurePointerTargets, TARGETS);
      await page.setContent(cataloguePage(rendered.pagedMarkup, rendered.scoped.css, ''), {
        waitUntil: 'load',
      });
      listFrame = await page.evaluate(measureListFrame);
    } finally {
      await browser.close();
    }
  });

  it('ships the controls, armed, in the rendered product markup', () => {
    assert.ok(
      rendered.markup.length > 0,
      'the page rendered nothing at all — every measurement below would be about an empty tree'
    );
    assert.ok(
      rendered.armed,
      'the bulk delete did not reach its ARMED state, so the target measured below is the idle ' +
        'button and the armed one is unmeasured'
    );
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected from the harness ` +
        `manifest (expected at least ${MIN_SCOPED_BLOCKS}) — the components would lay out ` +
        'unstyled and every hit test below would be measuring a different screen'
    );
    // HASH PARITY. The injected CSS is compiled from the source tree and the markup from the
    // harness's temp copy; if those two ever produced different scoping hashes, every scoped
    // rule would match nothing and the page would silently lay out on the global sheet alone.
    const used = rendered.scoped.hashes.filter((hash) => rendered.markup.includes(hash));
    assert.ok(
      used.length >= MIN_SCOPED_BLOCKS / 2,
      `only ${used.length} of ${rendered.scoped.hashes.length} scoping hashes appear in the ` +
        'rendered markup — the injected blocks and the markup were compiled to different hashes'
    );
  });

  it('lays the row out at its real height, so the points below are real points', () => {
    assert.ok(
      rowOrder.rowHeight >= MIN_ROW_HEIGHT_PX,
      `the row is ${rowOrder.rowHeight}px tall (expected at least ${MIN_ROW_HEIGHT_PX}px) — the ` +
        'stylesheets did not reach it, and an unstyled row hit-tests nothing the product does'
    );
    assert.ok(
      rowOrder.rowRight - rowOrder.rowLeft > 400,
      'and the list column is a real width rather than a collapsed one'
    );
  });

  it('puts the selection box at the row’s LEADING edge, before the medallion', () => {
    // The delta's own criterion still says the box sits at the row's TRAILING edge. `proto:604`
    // puts `<span style="{{ r.box }}">` first, before the chip, and so does the shipped row —
    // so the criterion is what is wrong, and this is the measurement that says so.
    assert.ok(
      rowOrder.checkboxLeft < rowOrder.medallionLeft,
      `the selection box (${rowOrder.checkboxLeft}) is not left of the medallion ` +
        `(${rowOrder.medallionLeft}) — the reference draws it as the row's FIRST child`
    );
    assert.ok(
      rowOrder.penLeft > rowOrder.medallionLeft,
      'and the open-entry pen is at the trailing edge, which is where the box used to be'
    );
  });

  for (const { label } of TARGETS) {
    it(`delivers the pointer to the ${label}`, () => {
      const hit = honest.find((entry) => entry.label === label);
      assert.ok(hit.found, `${label} (${hit.probe}) is absent from the rendered product markup`);
      assert.ok(
        hit.width > 0 && hit.height > 0,
        `${label} rendered at ${hit.width}x${hit.height} — a zero box has no centre to aim at`
      );
      assert.ok(
        hit.matched,
        `${label} (${hit.width}x${hit.height}) missed ${hit.target}; ` +
          `hit ${hit.hitTag} ${hit.hitClass}`
      );
    });
  }

  it('draws `SORT BY` exactly as it draws `MEMBERSHIP`, which is what the reference does', () => {
    // UX round-2 finding F-K. `proto:582` and `proto:585` are the same declaration, and the
    // subject drew 8.5px/700/.09em beside 9.28px/600/.08em — two micro-labels, one row, two
    // treatments. Asserted AGAINST THE SIBLING rather than against three literals, because what
    // the reference states is that the two are identical.
    assert.ok(toolbarType.membershipLabel.found, 'the membership micro-label renders');
    assert.ok(toolbarType.sortLabel.found, 'and so does the sort one');
    assert.deepEqual(
      {
        fontSize: toolbarType.sortLabel.fontSize,
        fontWeight: toolbarType.sortLabel.fontWeight,
        letterSpacing: toolbarType.sortLabel.letterSpacing,
      },
      {
        fontSize: toolbarType.membershipLabel.fontSize,
        fontWeight: toolbarType.membershipLabel.fontWeight,
        letterSpacing: toolbarType.membershipLabel.letterSpacing,
      },
      'the two micro-labels on one toolbar row resolve to ONE treatment'
    );
    // NON-VACUITY: two labels that both resolved to nothing would satisfy the equality above.
    assert.equal(toolbarType.sortLabel.fontWeight, '700');
    assert.match(toolbarType.sortLabel.fontSize, /^8\.\d+px$/);
  });

  it('inks the direction toggle at the reference’s weight and secondary ink', () => {
    // `proto:587` is `font:600 11px var(--sans);color:var(--text2)`; the toggle shipped at the
    // manager's `--fab-recipe-control-font` (11.52px) at the inherited 400, in the primary ink.
    assert.ok(toolbarType.direction.found, 'the direction toggle renders');
    assert.equal(toolbarType.direction.fontWeight, '600');
    assert.equal(toolbarType.direction.fontSize, '11px');
    assert.equal(
      toolbarType.direction.color,
      toolbarType.secondaryInk,
      'and takes the secondary ink the reference gives it — compared against the TOKEN the ' +
        'theme resolves, so a theme change moves both sides together'
    );
  });

  // ── issue 1371 r18-cat (M30) ───────────────────────────────────────────────────────────────
  it('draws the essence select as the source select’s twin: same rung, corner, type and paint, to its right (M30)', () => {
    // The prototype's catalogue lead row is a search field and ONE select (`proto:577`-`579`);
    // the essence select is the maintainer's extra, so its reference is the control it stands
    // beside — the one `cat-toolbar-source-filter` measures against `proto:579` — and the
    // rules list's own essence select, which the fixture records at the same 38px / 9px / 12px
    // / 500 (`sys-toolbar-essence-filter`). Asserted AGAINST THE SIBLING rather than against
    // literals, then pinned to the rung so two selects that both resolved to nothing cannot pass.
    assert.ok(leadRow.source.found, 'NON-VACUITY: the source select renders');
    assert.ok(leadRow.essence.found, 'and so does the essence select');
    const face = ({ height, borderTopLeftRadius, fontSize, fontWeight, backgroundColor, borderTopColor }) => ({
      height,
      borderTopLeftRadius,
      fontSize,
      fontWeight,
      backgroundColor,
      borderTopColor,
    });
    assert.deepEqual(face(leadRow.essence), face(leadRow.source), 'one face for the two selects');
    assert.equal(leadRow.essence.height, 38, 'on the lead row’s 38px rung');
    assert.equal(leadRow.essence.borderTopLeftRadius, '9px', 'radius 9 for a 34-38px control');
    assert.ok(
      leadRow.essence.left >= leadRow.source.right,
      `the essence select stands to the RIGHT of the source select (${leadRow.essence.left} vs ${leadRow.source.right})`
    );
    assert.ok(
      leadRow.source.left >= leadRow.search.right,
      'and the source select still follows the search field, so the row reads search, source, essence'
    );
  });

  it('draws the row’s essence chips in the trailing column before the stat columns, without growing the row (M30)', () => {
    assert.ok(Boolean(rowOrder.essenceRun), 'NON-VACUITY: the resin row draws its chip run');
    assert.ok(Boolean(rowOrder.essenceChip), 'and the flame chip inside it');
    assert.ok(Boolean(rowOrder.stats), 'and its stat columns');
    assert.ok(
      rowOrder.essenceRun.right <= rowOrder.stats.left,
      `the chips end before the stat columns begin (${rowOrder.essenceRun.right} vs ${rowOrder.stats.left})`
    );
    assert.ok(
      rowOrder.essenceRun.left > rowOrder.medallionLeft,
      'and start after the medallion — the trailing column, not the identity cell'
    );
    assert.equal(
      rowOrder.rowHeight,
      rowOrder.chiplessRowHeight,
      'a row with chips is exactly as tall as a row without: the compact chip fits the row'
    );
    assert.ok(
      rowOrder.essenceChip.top >= rowOrder.essenceRun.top - 0.5 &&
        rowOrder.essenceChip.height <= 24,
      `the chip is the compact scale (${rowOrder.essenceChip.height}px), not the default badge`
    );
    // A PILL: the corner is at least half the chip's height, which is what makes the ends round
    // whatever literal the primitive declares (`Chip` computes 10px on its 20px compact face).
    assert.ok(
      Number.parseFloat(rowOrder.essenceChipRadius) >= rowOrder.essenceChip.height / 2,
      `a pill, as every manager chip is (${rowOrder.essenceChipRadius} on ${rowOrder.essenceChip.height}px)`
    );
  });

  it('gives the drop zone the WHOLE lead row, with no action beside it (M13)', () => {
    const { lead, dropZone, registerAction } = listFrame;
    assert.ok(Boolean(lead) && Boolean(dropZone), 'the lead and its zone render');
    assert.ok(
      !registerAction,
      'the `+ Register item` action is gone — before M13 it stood at 1011→1155 in the lab, ' +
        'past the lead`s own right edge at 1131'
    );
    assert.ok(dropZone.width > 400, 'NON-VACUITY: the zone is a real width, not a collapsed box');
    assert.equal(
      Math.round(dropZone.left),
      Math.round(lead.left),
      'the zone starts where the lead starts'
    );
    assert.equal(
      Math.round(dropZone.right),
      Math.round(lead.right),
      'and ends where the lead ends: it takes the whole row'
    );
  });

  it('runs the list column edge to edge in its pane, with the toolbar, the rows and the pager at the column`s own edges (M21)', () => {
    const { frame, column, toolbar, rows, pager, firstRow, pagerSummary } = listFrame;
    assert.ok(Boolean(pager), 'the two-row window puts a foot pager in the markup');
    assert.ok(column.width > 400, 'NON-VACUITY: the column is a real width');
    // THE COLUMN IS THE PANE'S WHOLE LEFT TRACK. Before M21 the column itself was already the
    // track; what the maintainer saw was the inset INSIDE it, so the pane edge is the reference
    // every child is measured against below, not the column's padding edge.
    assert.equal(Math.round(column.left), Math.round(frame.left), 'the column starts at the pane`s left edge');
    assert.equal(Math.round(column.top), Math.round(frame.top), 'and at its top');
    assert.equal(Math.round(column.bottom), Math.round(frame.bottom), 'and reaches its bottom');
    for (const [name, child] of [
      ['toolbar', toolbar],
      ['rows scroller', rows],
      ['pager', pager],
    ]) {
      assert.equal(
        Math.round(child.left),
        Math.round(column.left),
        `the ${name} starts at the column\`s left edge, not 16px inside it`
      );
      assert.equal(
        Math.round(child.right),
        Math.round(column.right),
        `and the ${name} ends at the column\`s right edge, which is the inspector\`s divider`
      );
    }
    assert.equal(
      Math.round(toolbar.top),
      Math.round(column.top),
      'the toolbar sits at the pane`s top, as the rules list`s toolbar does'
    );
    assert.equal(
      Math.round(pager.bottom),
      Math.round(column.bottom),
      'and the pager sits flush at the pane`s bottom, as the rules list`s footer does'
    );
    // THE ROWS SIT INSIDE THE BAND'S EDGES: the scroller keeps its own inline inset, so the band
    // and the toolbar frame the rows exactly as the rules list frames its own.
    assert.ok(
      firstRow.left > pager.left && firstRow.right < pager.right,
      `the rows (${firstRow.left}→${firstRow.right}) are inside the band ` +
        `(${pager.left}→${pager.right})`
    );
    assert.ok(
      pagerSummary.left > pager.left,
      'while the summary keeps the band`s own inset, so the text does not touch the pane edge'
    );
  });

  it('spans the bulk dock across the inspector column, with Apply and the delete the width of the panel (M24)', () => {
    const { aside, scroller, dock, apply, danger } = bulkGeometry;
    assert.ok(Boolean(dock) && Boolean(aside), 'NON-VACUITY: the panel and its dock render');
    assert.ok(dock.width > 250, 'NON-VACUITY: the dock is a real width');
    // THE DOCK BAND IS THE INSPECTOR'S WHOLE WIDTH, inside its divider hairline. Before M24 the
    // scroller clipped the shell's `--fab-space-3` bleed inside the column's `--fab-space-4`
    // inset, so the band (and both buttons) stopped 16px short of each edge.
    assert.equal(
      Math.round(dock.left),
      Math.round(aside.left + aside.borderLeft),
      'the band starts at the inspector`s divider'
    );
    assert.equal(Math.round(dock.right), Math.round(aside.right), 'and ends at its right edge');
    assert.equal(
      Math.round(scroller.right),
      Math.round(aside.right),
      'because the bulk scroller — not the column — now carries the inset the dock bleeds through'
    );
    // AND THE BUTTONS ARE THE PANEL'S WIDTH: the dock's own inset is the pane's 16px on each side,
    // `proto:791`'s `padding: 13px 17px` on the 4px scale.
    for (const [name, control] of [
      ['Apply', apply],
      ['delete', danger],
    ]) {
      assert.equal(
        Math.round(control.left),
        Math.round(dock.left) + 16,
        `${name} starts one pane inset inside the band`
      );
      assert.equal(
        Math.round(control.right),
        Math.round(dock.right) - 16,
        `and ${name} ends one pane inset before the band\`s right edge`
      );
    }
  });

  it('draws the rows, the chips, the direction track and the buttons at the reference`s dimensions (M24)', () => {
    const {
      systemRow,
      systemBox,
      categoryRow,
      tagRow,
      tagChip,
      segmentActive,
      segmentIdle,
      danger,
      apply,
      insetPager,
      pagerButton,
    } = bulkGeometry;
    // SYSTEM ROWS: `proto:5273` pads `7px 9px` around a 15px box, a 33px row — the 30 rung, with
    // a 16px box so the row centres on the 4px scale.
    assert.equal(Math.round(systemRow.height), 30, 'a system row is on the 30px rung');
    assert.ok(Boolean(systemBox), 'and carries the reference`s box');
    assert.equal(Math.round(systemBox.width), 16, 'the box is 16px wide');
    assert.equal(Math.round(systemBox.height), 16, 'and 16px tall');
    // CATEGORY AND TAG ROWS: `proto:5296` / `proto:5330` pad `6px 9px` around 10.5px type, a
    // 27px row — the 28 rung.
    assert.equal(Math.round(categoryRow.height), 28, 'a category row is on the 28px rung');
    assert.equal(Math.round(tagRow.height), 28, 'and so is a tag row');
    // THE STAGED CHIP: `proto:5313` pads `4px 9px` on a 999 corner — Chip's inspector density.
    assert.ok(Boolean(tagChip), 'NON-VACUITY: a chip is staged');
    assert.equal(tagChip.paddingLeft, '8px', 'the chip takes the 8px inset (9 on the 4px scale)');
    assert.equal(tagChip.radius, '999px', 'on the stadium corner');
    // THE DIRECTION TRACK: `proto:5155` draws 28px segments on a 7px corner, the chosen one
    // FILLED and the idle one bare. The segment's height is its `6px` insets around the label's
    // line box, so it is a font metric rather than a stated rung: 28.4px on the lab's real host
    // face, 26-27 on this harness's Arial. The 26-32px band is what the corner is read against,
    // and the band is what is asserted.
    assert.ok(
      segmentActive.height >= 26 && segmentActive.height <= 29,
      `a segment sits in the 26-32px band (measured ${segmentActive.height})`
    );
    assert.equal(segmentActive.radius, '7px', 'on the 26-32px band`s corner');
    assert.notEqual(
      segmentActive.background,
      segmentIdle.background,
      'the chosen direction is filled and the idle one is not'
    );
    assert.equal(
      segmentIdle.background,
      'rgba(0, 0, 0, 0)',
      'the idle direction paints nothing, as `modeStyle(false)` does'
    );
    // THE DOCK'S TWO BUTTONS: `proto:791` foot 36px → the 38 rung the shared Apply already takes;
    // `proto:5340` delete `height:34px; border-radius:8px; font:700 11px` → 34, radius 9, 11px.
    assert.equal(Math.round(apply.height), 38, 'Apply is on the 38px rung');
    assert.equal(Math.round(danger.height), 34, 'the delete is on the 34px rung');
    assert.equal(danger.radius, '9px', 'on the 34-38px band`s corner, not the host button`s 6');
    assert.equal(danger.fontSize, '11px', 'at the reference`s 11px…');
    assert.equal(danger.fontWeight, '700', '…and weight 700');
    // THE INSET PAGER: `proto:5200` pads `6px 8px` around 22px buttons — 36px.
    assert.equal(Math.round(pagerButton.width), 22, 'a pager button is 22px');
    assert.equal(Math.round(insetPager.height), 36, 'so the pager is the reference`s 36px');
  });

  it('makes the whole 28px search well the control, not a strip inside it (issue 1371 r17-b)', () => {
    // FOUND BY THE HIT-TEST, not by a geometry read: the first measurement of the well put the
    // `<input>` at 263x11 inside a 28px well, so a GM aiming at the well's upper or lower third
    // clicked the well's padding and focused nothing. `design-system/spec.md` puts a hit target
    // at 24px or more; the input now stretches to the well.
    const { searchWell, searchInput } = bulkGeometry;
    assert.ok(Boolean(searchWell) && Boolean(searchInput), 'NON-VACUITY: the well and its input render');
    assert.equal(Math.round(searchWell.height), 28, '`proto:1139`: the well is 28px');
    assert.ok(
      searchInput.height >= 24,
      `the input fills the well (measured ${searchInput.height}px) — a click anywhere in the ` +
        'well reaches the field'
    );
  });

  it('draws the essence rows at the reference`s dimensions: a 34px row, a 22px tile, 22px steppers (M25)', () => {
    const { essenceRow, essenceTile, essenceStep, essenceValue, essenceChip } = bulkGeometry;
    assert.ok(Boolean(essenceRow), 'NON-VACUITY: the essence group drew its row');
    // `proto:5627` pads `5px 9px` around a 22px tile — a 34px row, which is a rung.
    assert.equal(Math.round(essenceRow.height), 34, 'an essence row is on the 34px rung');
    assert.equal(essenceRow.radius, '7px', 'on the 26-32px band`s corner');
    assert.equal(Math.round(essenceTile.width), 22, '`proto:5628` chip: a 22px tile…');
    assert.equal(Math.round(essenceTile.height), 22);
    assert.equal(Math.round(essenceStep.width), 22, '`proto:1207`: the shared Stepper`s 22px adjunct…');
    assert.equal(Math.round(essenceStep.height), 22);
    assert.equal(essenceStep.radius, '6px', '…on a 6px corner');
    // `proto:5628`'s value column is a 26px LABEL; the shared `Stepper`'s is a typeable input, capped
    // at 30px in this layout context (the system panel's own cap) so the `n/N` stays on the row.
    assert.equal(Math.round(essenceValue.width), 30, 'the stepper`s input is capped at 30px');
    assert.ok(Boolean(essenceChip), 'and the staged chip is drawn above the inset');
    assert.equal(essenceChip.paddingLeft, '8px', 'at the inspector density the tag chips take');
  });

  it('and reports a MISS on every one of them under a transparent overlay', () => {
    // The control. Without it, `matched: true` for nine selectors is equally consistent with a
    // hit test that works and one that answers `true` for anything.
    const missed = overlaid.filter((entry) => entry.found && !entry.matched);
    assert.equal(
      missed.length,
      TARGETS.length,
      'an overlay stretched over the row, the dock, the insets, the chip run and the lead toolbar row must intercept ' +
        `ALL ${TARGETS.length} targets; it intercepted ${missed.length}: ` +
        JSON.stringify(overlaid, null, 2)
    );
    for (const entry of missed) {
      assert.ok(
        entry.hitTag !== 'none',
        `${entry.label} hit nothing at all under the overlay, which is a layout failure rather ` +
          'than an interception'
      );
    }
  });
});

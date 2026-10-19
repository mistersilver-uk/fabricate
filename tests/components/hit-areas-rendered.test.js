/**
 * Issue 1523 — every small pointer target offers 24 by 24 pixels (WCAG 2.2 section 2.5.8) without
 * its paint moving, measured in Chromium. For each control: the target (its box, joined with the
 * `::before` that extends it) is at least 24 by 24; the painted box keeps its pinned size and its
 * neighbour keeps its pinned gap; a point inside the extension resolves to the control, and a point
 * on the neighbour's own edge resolves to the neighbour, so no two hit areas overlap.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const GLYPH = '<i class="fas fa-xmark" aria-hidden="true"></i>';
/** A glyph with a drawn size, for a button the sheet does not size (Font Awesome is not loaded). */
const SQUARE_GLYPH = '<i style="display:inline-block;width:10px;height:10px"></i>';

/** The scoped CSS of the components whose own parents are drawn here, each with its hash class. */
const PARENTS = Object.freeze({
  essence: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte')
  ),
  inset: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkStagingInset.svelte')
  ),
  panel: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte')
  ),
  workbench: scopedComponentCss(resolve(repoRoot, 'src/ui/svelte/apps/alchemy/Workbench.svelte')),
  bulkPanel: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte')
  ),
  bulkRow: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte')
  ),
});

/** Adds a component's scope hash to every classed element of a fixture drawn from its markup. */
const scoped = (html, { hashClass }) =>
  html.replaceAll(/class="([^"]*)"/gu, (_whole, value) => `class="${value} ${hashClass}"`);

const PAGER = `<div class="fab-bulk-inset"><div class="fab-bulk-inset-pager">
  <span class="fab-bulk-inset-range">Showing 1-5 of 20</span>
  <div class="fab-bulk-inset-pages">
    <button type="button" class="fab-bulk-inset-page fab-hit-area" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
    <span class="fab-bulk-inset-page-label">Page 1 of 4</span>
    <button type="button" class="fab-bulk-inset-page fab-hit-area" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
  </div></div></div>`;

const PICK = `<div class="fab-bulk-book-pick"><div class="fab-bulk-book-pick-head">
  <span class="fab-bulk-book-pick-art"><i class="fas fa-book"></i></span>
  <span class="fab-bulk-book-pick-copy"><strong class="fab-bulk-book-pick-name">A long book name</strong><span class="fab-bulk-book-pick-meta">12 recipes</span></span>
  <button type="button" class="fab-bulk-book-pick-clear fab-hit-area" aria-label="Clear">${GLYPH}</button>
  </div></div>`;

const STAGED = `<ul class="fab-bulk-book-staged"><li class="fab-bulk-book-staged-row is-add">
  <span class="fab-bulk-book-staged-op"><i class="fas fa-plus"></i>Add</span>
  <span class="fab-bulk-book-staged-copy"><span class="fab-bulk-book-staged-name">A long book name</span><span class="fab-bulk-book-staged-count">12 recipes</span></span>
  <button type="button" class="fab-bulk-book-unstage fab-hit-area" aria-label="Unstage">${GLYPH}</button>
  </li></ul>`;

/** Two bench chips side by side, so each remove's target can be held inside its OWN chip. */
const BENCH_CHIP = `<div class="alchemy-bench-grid">${['Emberroot', 'Frostcap']
  .map(
    (name) => `<div class="alchemy-chip" role="button" tabindex="0">
  <button type="button" class="alchemy-chip-remove-one fab-hit-area" aria-label="Remove one">${GLYPH}</button>
  <button type="button" class="alchemy-chip-remove fab-hit-area" aria-label="Remove all">${GLYPH}</button>
  <span style="display:block;width:38px;height:38px"></span>
  <div class="alchemy-chip-name">${name}</div><span class="alchemy-chip-qty">×2</span>
  </div>`
  )
  .join('')}</div>`;

/** A queue row: `InventoryBulkRow`'s box and trailing group around the panel's own remove. */
const BULK_ROW = (row, panel) => `<ul style="list-style:none;margin:0;padding:0">
  <li class="bulk-row ${row}"><span style="display:block;width:30px;height:30px"></span>
  <span class="bulk-row-text ${row}"><span>A long component name</span></span>
  <span class="bulk-row-trailing ${row}"><span style="display:inline-block;width:60px;height:20px"></span><button type="button" class="bulk-remove fab-hit-area ${panel}" aria-label="Remove">${GLYPH}</button></span>
  </li></ul>`;

/** The mounted primitives, each by the harness that compiles it. */
const timeOfDayBar = (trackWidth) => ({
  name: 'ThresholdBandStrip',
  trackWidth,
  props: {
    binding: 'start',
    min: 4,
    max: 28,
    ticks: false,
    rangeSublabels: true,
    addable: true,
    railLabel: 'Add',
    addLabel: (band) => `Add within ${band.name}`,
    class: 'manager-time-of-day-bar',
    bands: [
      { id: 'dawn', name: 'The Long Grey Hour Before the Bells', from: 4, range: '04–06' },
      { id: 'early', name: 'Early', from: 6, range: '06–08' },
      { id: 'day', name: 'Day', from: 8, range: '08–17' },
      { id: 'dusk', name: 'Dusk', from: 17, range: '17–21' },
      { id: 'night', name: 'Night', from: 21, range: '21–04' },
    ],
    markers: [
      { id: 'clock', value: 14.5, label: 'World clock', valueText: '14:30' },
      { id: 'current', value: 12.5, label: 'Now', draggable: true, snap: 'band' },
    ],
  },
});

const MOUNTS = Object.freeze({
  stepper: { name: 'Stepper', props: { value: 3, min: 0, max: 9, ariaLabel: 'Count' } },
  fill: { name: 'Stepper', props: { value: 3, min: 0, max: 9, ariaLabel: 'Count', fill: true } },
  vertical: {
    name: 'Stepper',
    props: { value: 3, min: 0, max: 9, ariaLabel: 'Count', orientation: 'vertical' },
  },
  compact: { name: 'SelectionCheckbox', props: { density: 'compact', ariaLabel: 'Pick' } },
  default: { name: 'SelectionCheckbox', props: { density: 'default', ariaLabel: 'Pick' } },
  comfortable: {
    name: 'SelectionCheckbox',
    props: { density: 'comfortable', ariaLabel: 'Pick' },
  },
  chip: {
    name: 'Chip',
    props: {
      removable: true,
      removeLabel: 'Remove',
      onRemove: () => {},
      children: snippet('<span>Tag</span>'),
    },
  },
  recipeChip: {
    name: 'Chip',
    props: {
      tone: 'info',
      class: 'manager-recipe-filter-chip',
      children: snippet(
        `<span style="display:contents"><span>Filter</span><button type="button" class="manager-recipe-chip-clear" aria-label="Clear">${GLYPH}</button></span>`
      ),
    },
  },
  truncChip: {
    name: 'Chip',
    props: {
      truncate: true,
      removable: true,
      removeLabel: 'Remove',
      onRemove: () => {},
      children: snippet('<span>Tag</span>'),
    },
  },
  essenceChip: {
    name: 'Chip',
    props: {
      tone: 'info',
      class: 'manager-essence-filter-chip',
      children: snippet(
        `<span style="display:contents"><span>Filter</span><button type="button" class="manager-essence-chip-clear fab-hit-area ${PARENTS.essence.hashClass}" aria-label="Clear">${SQUARE_GLYPH}</button></span>`
      ),
    },
  },
  contents: {
    name: 'SelectionCheckbox',
    props: { density: 'compact', wrapper: 'contents', ariaLabel: 'Pick' },
  },
  decorative: { name: 'SelectionCheckbox', props: { density: 'compact', decorative: true } },
  tagPill: {
    name: 'Chip',
    props: {
      tone: 'positive',
      class: 'manager-selected-tag-pill',
      children: snippet(
        `<span style="display:contents"><span>Tag</span><button type="button" aria-label="Remove">${GLYPH}</button></span>`
      ),
    },
  },
  /** The time-of-day bar's narrowest allowed band, three hours at a 326px track (issue 2431). */
  rangeBar: {
    name: 'ThresholdBandStrip',
    props: {
      binding: 'start',
      min: 4,
      max: 28,
      ticks: false,
      addable: true,
      railLabel: 'Add',
      addLabel: (band) => `Add within ${band.name}`,
      bands: [
        { id: 'dawn', name: 'Dawn', from: 4 },
        { id: 'day', name: 'Day', from: 8 },
        { id: 'dusk', name: 'Dusk', from: 17 },
        { id: 'night', name: 'Night', from: 20 },
      ],
      markers: [
        { id: 'current', value: 18.5, label: 'Now', draggable: true, snap: 'band' },
        { id: 'clock', value: 17, label: 'Clock' },
      ],
    },
  },
  /** A check strip's shape, ticks on, for the specimen's grip, cursor and tick type (issue 2435). */
  rangeBarTicked: {
    name: 'ThresholdBandStrip',
    props: {
      binding: 'fixed',
      bands: [
        { id: 'slag', name: 'Slag', from: 1, to: 9 },
        { id: 'rough', name: 'Rough', from: 10, to: 17 },
        { id: 'fine', name: 'Fine', from: 18, to: 26 },
      ],
    },
  },
  /**
   * The Times of day panel's bar, which spans the settings grid's full row: 543px of track at a
   * 1121px manager, and 248px once the grid folds to one column and the panel is narrow.
   */
  rangeBarPanel: timeOfDayBar(543),
  rangeBarPanelNarrow: timeOfDayBar(248),
  /** The panel's fallback note, which keeps the bar's footprint beside it. */
  rangeBarFallback: {
    name: 'ThresholdBandStrip',
    props: {
      binding: 'start',
      bands: [],
      fallbackNote:
        'Give every time of day its own start hour below 24 to see the time-of-day bar. Check: Day and Night.',
      class: 'manager-time-of-day-bar',
    },
  },
  componentChip: {
    name: 'Chip',
    props: {
      tone: 'info',
      class: 'manager-component-filter-chip',
      children: snippet(
        `<span style="display:contents"><span>Filter</span><button type="button" class="manager-component-chip-clear" aria-label="Clear">${GLYPH}</button></span>`
      ),
    },
  },
});

/** What a mounted primitive renders besides itself, by name. */
const MOUNT_DEPENDENCIES = Object.freeze({
  ThresholdBandStrip: {
    rawModules: [
      'src/ui/svelte/util/rangeBarGeometry.js',
      'src/ui/svelte/util/rangeBarText.js',
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      ...LOCALIZE_OR_RAW_MODULES,
    ],
    compiledModules: [component('RangeBarMarker'), component('IconButton')],
  },
});

/** Sheet controls with no component to mount, drawn in their real parents. [class, wrapper class, w, h] */
const SHEET_CONTROLS = Object.freeze([
  ['manager-scope-collapse', '', 22, 22],
  ['manager-recipe-tool-remove', '', 22, 22],
  ['manager-recipe-option-clear', '', 22, 22],
  ['manager-recipe-option-remove', '', 24, 24],
  ['manager-availability-remove', 'fabricate-pill-select', 20, 20],
  ['manager-danger-tag-remove', '', 20, 20],
  ['manager-drop-rank-button', '', 18, 18],
  ['manager-condition-remove', '', 22, 22],
  ['fab-hit-area', '', 22, 22],
]);

/** The three checkbox densities and their drawn boxes. */
const CHECKBOX_SIZES = Object.freeze([
  ['compact', 16],
  ['default', 20],
  ['comfortable', 22],
]);

/**
 * The tightest gap a neighbour is drawn at: the control's reach plus the one pixel Chromium's hit
 * test counts at a transformed edge, since a gap of exactly the reach hands that pixel to the control.
 */
const reachOf = (size) => (24 - size) / 2 + 1;

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${readStylesheet()}}</style>
${['Stepper', 'SelectionCheckbox', 'Chip', 'ThresholdBandStrip', 'RangeBarMarker']
  .map((name) => `<style>${scopedComponentCss(resolve(repoRoot, component(name))).css}</style>`)
  .join('\n')}
${Object.values(PARENTS)
  .map(({ css }) => `<style>${css}</style>`)
  .join('\n')}
<style>:root{--font-primary:Arial,sans-serif}
.row{display:flex;align-items:center;gap:var(--gap,6px);margin:12px}
.row .neighbour{width:30px;height:30px;padding:0;border:1px solid #888}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
  <div data-case="stepper" class="row">${markup.stepper}</div>
  <div data-case="fill" class="row" style="width:240px">${markup.fill}</div>
  <div data-case="vertical" class="row" style="width:80px">${markup.vertical}</div>
  ${CHECKBOX_SIZES.map(
    ([key, size]) =>
      `<div data-case="${key}" class="row" style="--gap:${reachOf(size)}px"><button class="neighbour" data-neighbour="before"></button>${markup[key]}<button class="neighbour" data-neighbour="after"></button></div>`
  ).join('\n')}
  <div data-case="chip" class="row" style="--gap:${reachOf(20)}px">${markup.chip}<button class="neighbour" data-neighbour="after"></button></div>
  <div data-case="recipeChip" class="row">${markup.recipeChip}</div>
  <div data-case="componentChip" class="row">${markup.componentChip}</div>
  <div data-case="tagPill" class="row">${markup.tagPill}</div>
  <div data-case="truncChip" class="row">${markup.truncChip}</div>
  <div data-case="essenceChip" class="row">${markup.essenceChip}</div>
  <div data-case="rangeBar" style="width:326px;margin:12px">${markup.rangeBar}</div>
  <div data-case="rangeBarTicked" style="width:326px;margin:12px">${markup.rangeBarTicked}</div>
  <div class="fabricate-manager" style="width:1121px;height:auto"><div data-case="rangeBarPanel" style="width:601px"><div class="manager-gathering-settings"><section class="manager-condition-panel is-time-of-day">${markup.rangeBarPanel}</section><section class="manager-condition-panel">${markup.rangeBarFallback}</section></div></div></div>
  <div class="fabricate-manager" style="width:306px;height:auto"><div data-case="rangeBarPanelNarrow" style="width:306px"><div class="manager-gathering-settings" style="grid-template-columns:minmax(0,1fr)"><section class="manager-condition-panel is-time-of-day">${markup.rangeBarPanelNarrow}</section></div></div></div>
  <div data-case="contentsHost" class="row"><label class="host">${markup.contents}<span>Text</span></label></div>
  <div data-case="decorativeHost" class="row"><div class="host" role="option">${markup.decorative}<span>Text</span></div></div>
  <div data-case="pager" style="width:300px;margin:12px">${scoped(PAGER, PARENTS.inset)}</div>
  <div data-case="pick" style="width:300px;margin:12px">${scoped(PICK, PARENTS.panel)}</div>
  <div data-case="staged" style="width:300px;margin:12px">${scoped(STAGED, PARENTS.panel)}</div>
  <div data-case="benchChip" style="width:300px;margin:12px">${scoped(BENCH_CHIP, PARENTS.workbench)}</div>
  <div data-case="bulkRow" style="width:300px;margin:12px">${BULK_ROW(PARENTS.bulkRow.hashClass, PARENTS.bulkPanel.hashClass)}</div>
  ${SHEET_CONTROLS.map(
    ([cls, wrapper, width, height]) =>
      `<div data-case="${cls}" class="row ${wrapper}" style="--gap:${reachOf(width)}px;width:fit-content"><button class="neighbour" data-neighbour="before"></button><button type="button" class="${cls}" style="${cls === 'fab-hit-area' ? `width:${width}px;height:${height}px;padding:0` : ''}">${GLYPH}</button><button class="neighbour" data-neighbour="after"></button></div>`
  ).join('\n')}
  <div data-case="label-input" class="row"><input class="manager-condition-label-input" aria-label="Edit label" value="Label" /></div>
  <div data-case="range" class="row manager-gathering-task-edit-view"><input type="range" min="0" max="10" value="5" /></div>
</div></body></html>`;

let browser;
let tab;

/** Report `width` as the range bar track's `clientWidth`, which happy-dom lays out as 0. */
function stubTrackWidth(width) {
  const prototype = globalThis.HTMLElement.prototype;
  const own = Object.getOwnPropertyDescriptor(prototype, 'clientWidth');
  const inherited = Object.getOwnPropertyDescriptor(globalThis.Element.prototype, 'clientWidth');
  Object.defineProperty(prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList?.contains('fab-band-strip-track')
        ? width
        : (inherited?.get?.call(this) ?? 0);
    },
  });
  return () => {
    if (own) Object.defineProperty(prototype, 'clientWidth', own);
    else delete prototype.clientWidth;
  };
}

before(async () => {
  const markup = {};
  for (const name of new Set(Object.values(MOUNTS).map((mount) => mount.name))) {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: `fabricate-hit-areas-${name}-`,
      rawModules: MOUNT_DEPENDENCIES[name]?.rawModules ?? [],
      compiledModules: [component(name), ...(MOUNT_DEPENDENCIES[name]?.compiledModules ?? [])],
      componentPath: component(name),
    });
    await harness.setup();
    try {
      for (const [key, mount] of Object.entries(MOUNTS)) {
        if (mount.name !== name) continue;
        const restore = mount.trackWidth ? stubTrackWidth(mount.trackWidth) : () => {};
        try {
          markup[key] = (await harness.mount(mount.props)).innerHTML;
        } finally {
          restore();
        }
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 2600 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/**
 * Measures a control in the page: its painted box, its target (the box joined with its
 * `::before`), and what `elementFromPoint` resolves just inside each extended edge, just outside
 * it, and on the neighbour's near edge.
 */
const measure = (caseId, selector, neighbourSelector = null) =>
  tab.evaluate(
    ({ caseId, selector, neighbourSelector }) => {
      const root = document.querySelector(`[data-case="${caseId}"]`);
      const control = root.querySelector(selector);
      const box = control.getBoundingClientRect();
      const pseudo = getComputedStyle(control, '::before');
      const pw = pseudo.content === 'none' ? 0 : Number.parseFloat(pseudo.width) || 0;
      const ph = pseudo.content === 'none' ? 0 : Number.parseFloat(pseudo.height) || 0;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const target = { width: Math.max(box.width, pw), height: Math.max(box.height, ph) };
      const owner = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        if (hit === control || control.contains(hit)) return 'control';
        if (hit?.closest(neighbourSelector ?? '[data-neighbour]')) return 'neighbour';
        return hit ? hit.tagName.toLowerCase() : 'nothing';
      };
      // A probe sits at the centre of the pixel just inside the target's edge, and at the centre of
      // the second pixel past it: Chromium's hit test counts the pixel touching a transformed edge.
      const reach = { x: target.width / 2, y: target.height / 2 };
      const EDGE = 0.5;
      const PAST = 1.5;
      const near = (neighbourEdge) => {
        const neighbour = root.querySelector(neighbourEdge.selector);
        if (!neighbour) return null;
        const nb = neighbour.getBoundingClientRect();
        return owner(nb.left + neighbourEdge.dx(nb), nb.top + nb.height / 2);
      };
      return {
        box: { width: box.width, height: box.height },
        target,
        inside: {
          left: owner(cx - reach.x + EDGE, cy),
          right: owner(cx + reach.x - EDGE, cy),
          top: owner(cx, cy - reach.y + EDGE),
          bottom: owner(cx, cy + reach.y - EDGE),
        },
        outside: { left: owner(cx - reach.x - PAST, cy), right: owner(cx + reach.x + PAST, cy) },
        gaps: [...root.querySelectorAll('[data-neighbour]')].map((neighbour) => {
          const nb = neighbour.getBoundingClientRect();
          return nb.left >= box.right ? nb.left - box.right : box.left - nb.right;
        }),
        nearEdges: ['before', 'after'].map((which) =>
          near({
            selector: `[data-neighbour="${which}"]`,
            dx: (nb) => (which === 'before' ? nb.width - EDGE : EDGE),
          })
        ),
      };
    },
    { caseId, selector, neighbourSelector }
  );

/**
 * Measures a control inside its REAL parent: its target, what resolves at each extended edge, the
 * real gap to each sibling beside it, and the ancestors whose clip cuts the target.
 */
const probeParent = (caseId, selector, nth = 0) =>
  tab.evaluate(
    ({ caseId, selector, nth }) => {
      const root = document.querySelector(`[data-case="${caseId}"]`);
      const control = root.querySelectorAll(selector)[nth];
      const box = control.getBoundingClientRect();
      const pseudo = getComputedStyle(control, '::before');
      const width = Math.max(box.width, Number.parseFloat(pseudo.width) || 0);
      const height = Math.max(box.height, Number.parseFloat(pseudo.height) || 0);
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const owner = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit === control || control.contains(hit) ? 'control' : (hit?.className ?? 'nothing');
      };
      const target = {
        left: cx - width / 2,
        right: cx + width / 2,
        top: cy - height / 2,
        bottom: cy + height / 2,
      };
      const clippedBy = [];
      for (let up = control.parentElement; up && up !== root; up = up.parentElement) {
        const style = getComputedStyle(up);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const rect = up.getBoundingClientRect();
        const cut = [
          target.top < rect.top - 0.01 && 'top',
          target.bottom > rect.bottom + 0.01 && 'bottom',
          target.left < rect.left - 0.01 && 'left',
          target.right > rect.right + 0.01 && 'right',
        ].filter(Boolean);
        if (cut.length > 0) clippedBy.push({ by: String(up.className), cut });
      }
      const gaps = [control.previousElementSibling, control.nextElementSibling]
        .filter(Boolean)
        .map((sibling) => {
          const nb = sibling.getBoundingClientRect();
          return Math.max(nb.left - box.right, box.left - nb.right, nb.top - box.bottom, 0);
        });
      return {
        box: { width: box.width, height: box.height },
        target: { width, height },
        inside: {
          left: owner(target.left + 0.5, cy),
          right: owner(target.right - 0.5, cy),
          top: owner(cx, target.top + 0.5),
          bottom: owner(cx, target.bottom - 0.5),
        },
        clippedBy,
        gaps,
      };
    },
    { caseId, selector, nth }
  );

const assertTarget = (label, result, painted) => {
  assert.ok(
    result.target.width >= 24 && result.target.height >= 24,
    `${label}: target ${result.target.width}x${result.target.height} is under 24x24`
  );
  assert.deepEqual(result.box, painted, `${label}: the painted box moved`);
  for (const [side, edges, belongs] of [
    ['inside', result.inside, true],
    ['outside', result.outside, false],
  ]) {
    for (const [edge, owner] of Object.entries(edges)) {
      assert.equal(
        owner === 'control',
        belongs,
        `${label}: a point ${side} the ${edge} of the target resolved to ${owner}`
      );
    }
  }
  const reach = (result.target.width - result.box.width) / 2;
  const clear = [
    ...result.nearEdges
      .filter(Boolean)
      .map((owner) => [
        owner === 'neighbour',
        `${label}: the neighbour's own edge belongs to ${owner}`,
      ]),
    ...result.gaps.map((gap) => [
      reach <= gap + 0.01,
      `${label}: the extension reaches the neighbour (gap ${gap})`,
    ]),
  ];
  for (const [holds, message] of clear) assert.ok(holds, message);
};

describe('24px hit areas, paint unchanged (issue 1523)', () => {
  it('gives the stepper adjuncts a 24px target inside the 2px gap to the input', async () => {
    for (const selector of ['[data-stepper-decrement]', '[data-stepper-increment]']) {
      const adjunct = await tab.evaluate((query) => {
        const control = document.querySelector(`[data-case="stepper"] ${query}`);
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        const padding = Number.parseFloat(style.paddingLeft);
        const at = (x, y) => document.elementFromPoint(x, y) === control;
        const cy = box.top + box.height / 2;
        const cx = box.left + box.width / 2;
        return {
          target: { width: box.width, height: box.height },
          painted: {
            width: box.width - 2 * padding,
            height: box.height - 2 * padding,
            clip: style.backgroundClip,
          },
          margin: style.marginLeft,
          inside: [
            at(box.left + 0.5, cy),
            at(box.right - 0.5, cy),
            at(cx, box.top + 0.5),
            at(cx, box.bottom - 0.5),
          ],
          outside: [at(box.left - 1.5, cy), at(box.right + 1.5, cy)],
        };
      }, selector);
      assert.deepEqual(adjunct.target, { width: 24, height: 24 }, selector);
      assert.deepEqual(adjunct.painted, { width: 22, height: 22, clip: 'content-box' }, selector);
      assert.equal(adjunct.margin, '-1px', `${selector}: the row keeps its 22px`);
      assert.deepEqual(adjunct.inside, [true, true, true, true], selector);
      assert.deepEqual(adjunct.outside, [false, false], selector);
    }
    // The input beside them keeps its own edge.
    const edges = await tab.evaluate(() => {
      const root = document.querySelector('[data-case="stepper"]');
      const input = root.querySelector('[data-stepper-input]');
      const box = input.getBoundingClientRect();
      const at = (x, y) => document.elementFromPoint(x, y);
      const cy = box.top + box.height / 2;
      return {
        left: at(box.left + 0.5, cy) === input,
        right: at(box.right - 0.5, cy) === input,
        top: at(box.left + box.width / 2, box.top + 0.5) === input,
        bottom: at(box.left + box.width / 2, box.bottom - 0.5) === input,
        outsideTop: at(box.left + box.width / 2, box.top - 1.5) === input,
        height: box.height,
      };
    });
    assert.deepEqual(edges, {
      left: true,
      right: true,
      top: true,
      bottom: true,
      outsideTop: false,
      height: 24,
    });
  });

  it('keeps the stepper row at its drawn size', async () => {
    const sizes = await tab.evaluate(() => {
      const size = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { width: box.width, height: box.height };
      };
      const input = document.querySelector('[data-case="stepper"] [data-stepper-input]');
      return {
        stepper: size('[data-case="stepper"] .fab-stepper'),
        margin: getComputedStyle(input).marginBlockStart,
        fillInput: size('[data-case="fill"] [data-stepper-input]'),
        fillStepper: size('[data-case="fill"] .fab-stepper'),
      };
    });
    assert.deepEqual(sizes.stepper, { width: 102, height: 28 });
    assert.equal(sizes.margin, '-1px');
    assert.equal(sizes.fillStepper.height, 38);
    assert.equal(sizes.fillInput.height, 32);
  });

  it('leaves the vertical stepper, whose targets are already 26px or more, unextended', async () => {
    const adjunct = await measure('vertical', '[data-stepper-increment]', '[data-stepper-input]');
    assert.deepEqual(adjunct.box.height, 26);
    assert.equal(adjunct.target.height, 26);
  });

  for (const [key, size] of CHECKBOX_SIZES) {
    it(`gives the ${key} selection checkbox a 24px target beside a neighbour`, async () => {
      const label = await measure(key, '.fab-selection-checkbox');
      assertTarget(`${key} selection checkbox`, label, { width: size, height: size });
      const box = await tab.evaluate((caseId) => {
        const check = document.querySelector(`[data-case="${caseId}"] .fab-selection-check`);
        const { width, height } = check.getBoundingClientRect();
        return { width, height };
      }, key);
      assert.deepEqual(box, { width: size, height: size }, 'the drawn box');
    });
  }

  it('gives the chip remove a 24px target inside its chip', async () => {
    const remove = await measure('chip', '.manager-chip-remove');
    assertTarget('chip remove', remove, { width: 20, height: 20 });
  });

  for (const [key, box] of [
    ['recipeChip', 14],
    ['componentChip', 14],
    ['tagPill', 18],
  ]) {
    it(`gives the ${key} clear a 24px target inside its chip`, async () => {
      const clear = await measure(key, 'button', '.manager-chip');
      assert.deepEqual(clear.box, { width: box, height: box });
      assert.ok(
        clear.target.width >= 24 && clear.target.height >= 24,
        `${key}: ${JSON.stringify(clear.target)}`
      );
      assert.equal(clear.inside.left, 'control');
      assert.equal(clear.inside.right, 'control');
      assert.equal(clear.inside.top, 'control', 'the chip clips the target at its top');
      assert.equal(clear.inside.bottom, 'control', 'the chip clips the target at its bottom');
    });
  }

  for (const [cls, , width, height] of SHEET_CONTROLS) {
    it(`gives .${cls} a 24px target beside its neighbours`, async () => {
      const control = await measure(cls, `.${cls}`);
      assertTarget(`.${cls}`, control, { width, height });
    });
  }

  // The chip clears sit inside a chip at least 24px high, so the 24px target fits whole and the
  // truncating chip's `overflow: hidden` (the one chip that clips) cuts nothing of it.
  for (const key of ['recipeChip', 'componentChip', 'tagPill', 'essenceChip', 'truncChip']) {
    it(`fits the ${key} clear's 24px target inside its chip, uncut`, async () => {
      const real = await probeParent(key, 'button');
      const chip = await tab.evaluate(
        (id) =>
          document.querySelector(`[data-case="${id}"] .manager-chip`).getBoundingClientRect()
            .height,
        key
      );
      assert.ok(real.target.width >= 24 && real.target.height >= 24, JSON.stringify(real.target));
      assert.ok(chip >= real.target.height, `${key}: the chip is ${chip}px high`);
      assert.deepEqual(real.clippedBy, [], `${key}: the chip cuts the target`);
      assert.deepEqual(Object.values(real.inside), ['control', 'control', 'control', 'control']);
    });
  }

  // `wrapper="contents"` and `decorative` render no `.fab-selection-checkbox`, so they carry no
  // `::before` to reach or overlap anything: the host that wraps the box is the target.
  for (const [caseId, tag] of [
    ['contentsHost', 'label'],
    ['decorativeHost', 'div'],
  ]) {
    it(`leaves the ${caseId} box to its host, with no extension of its own`, async () => {
      const result = await tab.evaluate(
        ({ caseId, tag }) => {
          const host = document.querySelector(`[data-case="${caseId}"] ${tag}.host`);
          const box = host.querySelector('.fab-selection-check').getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            wrappers: host.querySelectorAll('.fab-selection-checkbox').length,
            box: { width: box.width, height: box.height },
            reach: [...host.querySelectorAll('*')].filter(
              (node) => getComputedStyle(node, '::before').content !== 'none'
            ).length,
            hitInHost: host.contains(hit),
          };
        },
        { caseId, tag }
      );
      assert.equal(result.wrappers, 0, 'no label wrapper');
      assert.deepEqual(result.box, { width: 16, height: 16 });
      assert.equal(result.reach, 0, 'no pseudo-element extends anything');
      assert.ok(result.hitInHost, 'a click on the box lands in the host');
    });
  }

  // The real parents of the shared `.fab-hit-area` class: the target must reach 24 and no ancestor
  // may cut it, or the probe states the cut.
  for (const [caseId, selector, nth, size] of [
    ['pager', '.fab-bulk-inset-page', 0, 22],
    ['pager', '.fab-bulk-inset-page', 1, 22],
    ['pick', '.fab-bulk-book-pick-clear', 0, 22],
    ['staged', '.fab-bulk-book-unstage', 0, 22],
    ['benchChip', '.alchemy-chip-remove-one', 0, 20],
    ['benchChip', '.alchemy-chip-remove', 0, 20],
    ['bulkRow', '.bulk-remove', 0, 20],
  ]) {
    it(`reaches 24px, uncut, for ${selector} #${nth} in its ${caseId} parent`, async () => {
      const real = await probeParent(caseId, selector, nth);
      assert.deepEqual(real.box, { width: size, height: size });
      assert.ok(real.target.width >= 24 && real.target.height >= 24, JSON.stringify(real.target));
      assert.deepEqual(real.clippedBy, [], `${caseId}: an ancestor cuts the target`);
      assert.deepEqual(Object.values(real.inside), ['control', 'control', 'control', 'control']);
      const reach = (real.target.width - real.box.width) / 2;
      for (const gap of real.gaps) assert.ok(reach <= gap, `${caseId}: gap ${gap} under ${reach}`);
    });
  }

  it('keeps each bench chip remove absolute, 6px into its own chip, its target inside it', async () => {
    const removes = await tab.evaluate(() =>
      [...document.querySelectorAll('[data-case="benchChip"] .alchemy-chip')].flatMap((chip) => {
        const c = chip.getBoundingClientRect();
        const edge = getComputedStyle(chip);
        const pad = {
          top: c.top + Number.parseFloat(edge.borderTopWidth),
          left: c.left + Number.parseFloat(edge.borderLeftWidth),
          right: c.right - Number.parseFloat(edge.borderRightWidth),
        };
        return ['.alchemy-chip-remove-one', '.alchemy-chip-remove'].map((selector) => {
          const button = chip.querySelector(selector);
          const b = button.getBoundingClientRect();
          const pseudo = getComputedStyle(button, '::before');
          const w = Math.max(b.width, Number.parseFloat(pseudo.width) || 0);
          const h = Math.max(b.height, Number.parseFloat(pseudo.height) || 0);
          const cx = b.left + b.width / 2;
          const cy = b.top + b.height / 2;
          return {
            selector,
            position: getComputedStyle(button).position,
            target: { width: w, height: h },
            inside:
              cx - w / 2 >= c.left - 0.01 &&
              cx + w / 2 <= c.right + 0.01 &&
              cy - h / 2 >= c.top - 0.01 &&
              cy + h / 2 <= c.bottom + 0.01,
            top: b.top - pad.top,
            side: selector === '.alchemy-chip-remove' ? pad.right - b.right : b.left - pad.left,
          };
        });
      })
    );
    assert.equal(removes.length, 4, 'two chips, two removes each');
    for (const { selector, position, target, inside, top, side } of removes) {
      assert.equal(position, 'absolute', `${selector}: the hit-area class moved it into flow`);
      assert.ok(target.width >= 24 && target.height >= 24, JSON.stringify(target));
      assert.ok(inside, `${selector}: the target leaves its own chip`);
      assert.deepEqual({ top, side }, { top: 6, side: 6 }, `${selector}: the painted inset`);
    }
  });

  it('puts the shared hit-area class on the buttons its components own', () => {
    for (const [path, token, count] of [
      [component('Chip'), 'manager-chip-remove fab-hit-area', 1],
      ['src/ui/svelte/apps/manager/BulkStagingInset.svelte', 'fab-bulk-inset-page fab-hit-area', 2],
      [
        'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte',
        'fab-bulk-book-pick-clear fab-hit-area',
        1,
      ],
      [
        'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte',
        'fab-bulk-book-unstage fab-hit-area',
        1,
      ],
      [
        'src/ui/svelte/apps/manager/EssenceBrowserView.svelte',
        'manager-essence-chip-clear fab-hit-area',
        1,
      ],
      ['src/ui/svelte/apps/alchemy/Workbench.svelte', 'alchemy-chip-remove-one fab-hit-area', 1],
      ['src/ui/svelte/apps/alchemy/Workbench.svelte', 'alchemy-chip-remove fab-hit-area', 1],
      [
        'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
        'bulk-remove fab-hit-area',
        1,
      ],
    ]) {
      assert.equal(read(path).split(`class="${token}"`).length - 1, count, `${path}: ${token}`);
    }
  });

  it("keeps the range bar's dot and rail apart from its dividers at a three-hour band", async () => {
    const bar = await tab.evaluate(() => {
      const root = document.querySelector('[data-case="rangeBar"]');
      const rect = (element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const centre = (element) => {
        const box = element.getBoundingClientRect();
        return [box.left + box.width / 2, box.top + box.height / 2];
      };
      const owns = (element) => {
        const [x, y] = centre(element);
        return element.contains(document.elementFromPoint(x, y));
      };
      const dot = root.querySelector('[data-band-strip-marker="current"]');
      const dusk = root.querySelector('[data-band-strip-add="dusk"]');
      const dividers = [...root.querySelectorAll('[data-band-strip-handle]')];
      return {
        dot: rect(dot),
        dotPaint: rect(dot.querySelector('.fab-band-strip-dot')),
        track: rect(root.querySelector('[data-band-strip-track]')),
        duskBand: rect(root.querySelector('[data-band-strip-band="dusk"]')),
        rail: rect(dusk),
        dividers: dividers.map(rect),
        dotOwnsCentre: owns(dot),
        railOwnsCentre: owns(dusk),
        dividersOwnCentres: dividers.map(owns),
      };
    });
    const overlaps = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const [name, box] of [
      ['dot', bar.dot],
      ['rail button', bar.rail],
    ]) {
      assert.ok(box.width >= 24 && box.height >= 24, `${name}: ${JSON.stringify(box)}`);
      for (const divider of bar.dividers) {
        assert.ok(!overlaps(box, divider), `${name} meets a divider: ${JSON.stringify(divider)}`);
      }
    }
    const paintMid = (bar.dotPaint.top + bar.dotPaint.bottom) / 2;
    assert.ok(
      Math.abs(paintMid - bar.track.top) <= 0.5,
      `the dot straddles the track's top edge: ${paintMid} vs ${bar.track.top}`
    );
    const dotMid = (bar.dot.left + bar.dot.right) / 2;
    assert.ok(
      dotMid > bar.duskBand.left && dotMid < bar.duskBand.right,
      'the dot sits over its band'
    );
    assert.ok(bar.dotOwnsCentre, 'the dot resolves at its own centre');
    assert.ok(bar.railOwnsCentre, 'the rail button resolves at its own centre');
    assert.deepEqual(bar.dividersOwnCentres, [true, true, true]);
  });

  const RAILS_ALL = ['dawn', 'early', 'day', 'dusk', 'night'];
  const RAILS_SKIPPED = ['dawn', 'day', 'dusk', 'night'];
  const measurePanelBar = (caseId) =>
    tab.evaluate((id) => {
      const root = document.querySelector(`[data-case="${id}"]`);
      const rect = (element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const owns = (element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return element.contains(hit);
      };
      const rails = [...root.querySelectorAll('[data-band-strip-add]')];
      const dot = root.querySelector('[data-band-strip-marker="current"]');
      return {
        track: rect(root.querySelector('[data-band-strip-track]')),
        scroller: rect(root.querySelector('.manager-gathering-settings')),
        panel: rect(root.querySelector('.manager-condition-panel')),
        rails: rails.map((rail) => ({ id: rail.dataset.bandStripAdd, ...rect(rail) })),
        railsOwnCentres: rails.map(owns),
        dot: rect(dot),
        dotOwnsCentre: owns(dot),
        dividers: [...root.querySelectorAll('[data-band-strip-handle]')].map(rect),
        bands: [...root.querySelectorAll('[data-band-strip-band]')].map((band) => ({
          id: band.dataset.bandStripBand,
          box: rect(band),
          name: rect(band.querySelector('.fab-band-strip-band-name')),
          range: rect(band.querySelector('[data-band-strip-range]')),
        })),
        barHeight: rect(root.querySelector('.fab-band-strip.manager-time-of-day-bar')).height,
        fallbackHeight: root.querySelector('[data-band-strip-fallback]')
          ? rect(root.querySelector('[data-band-strip-fallback]')).height
          : null,
      };
    }, caseId);

  const assertPanelBarApart = (bar, trackWidth, railIds) => {
    assert.ok(
      Math.abs(bar.track.width - trackWidth) <= 1,
      `the panel's track is ${bar.track.width}px`
    );
    const inside = (inner, outer) =>
      inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5;
    // The track is 46px with a 1px border, so each band fills the 44px inside it and never grows.
    assert.ok(Math.abs(bar.track.height - 46) <= 0.5, `the track is ${bar.track.height}px tall`);
    for (const band of bar.bands) {
      assert.ok(Math.abs(band.box.height - 44) <= 0.5, `${band.id} is ${band.box.height}px tall`);
      assert.ok(inside(band.name, band.box), `${band.id}'s name leaves its band`);
      assert.ok(inside(band.range, band.box), `${band.id}'s hours leave its band`);
    }
    if (bar.fallbackHeight !== null) {
      assert.ok(
        Math.abs(bar.fallbackHeight - bar.barHeight) <= 0.5,
        `the fallback note is ${bar.fallbackHeight}px beside the ${bar.barHeight}px bar`
      );
    }
    const overlaps = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    assert.deepEqual(
      bar.rails.map((rail) => rail.id),
      railIds,
      `the rails at a ${trackWidth}px track`
    );
    for (let index = 1; index < bar.rails.length; index += 1) {
      assert.ok(
        !overlaps(bar.rails[index - 1], bar.rails[index]),
        `${bar.rails[index - 1].id} and ${bar.rails[index].id} adds overlap`
      );
    }
    for (const box of [bar.dot, ...bar.rails]) {
      assert.ok(box.width >= 24 && box.height >= 24, JSON.stringify(box));
      for (const divider of bar.dividers) {
        assert.ok(!overlaps(box, divider), `${JSON.stringify(box)} meets a divider`);
      }
    }
    assert.ok(bar.dotOwnsCentre && bar.railsOwnCentres.every(Boolean));
    // The dot's inset focus ring sits inside its 24px box, which the panel and its scroller hold.
    for (const container of [bar.panel, bar.scroller]) {
      assert.ok(
        bar.dot.top >= container.top && bar.dot.left >= container.left,
        `the dot ${JSON.stringify(bar.dot)} leaves ${JSON.stringify(container)}`
      );
    }
  };

  it("draws the range bar's specimen grip, cursor and tick type over a 24px handle", async () => {
    const drawn = await tab.evaluate(() => {
      const root = document.querySelector('[data-case="rangeBarTicked"]');
      const handle = root.querySelector('[data-band-strip-handle]');
      const grip = handle.querySelector('.fab-band-strip-grip');
      const probe = document.createElement('span');
      probe.style.color = 'var(--fab-text-secondary)';
      root.append(probe);
      const secondary = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(grip);
      const box = (element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      };
      return {
        handle: box(handle),
        cursor: getComputedStyle(handle).cursor,
        grip: box(grip),
        radius: style.borderTopLeftRadius,
        border: style.borderTopWidth,
        opacity: style.opacity,
        paint: style.backgroundColor === secondary,
        ticks: [...root.querySelectorAll('.fab-band-strip-tick')].map(
          (tick) => getComputedStyle(tick).fontSize
        ),
      };
    });
    assert.deepEqual(drawn.handle, { width: 24, height: 24 }, 'the hit area is unchanged');
    assert.equal(drawn.cursor, 'col-resize');
    assert.deepEqual(drawn.grip, { width: 2, height: 16 }, 'the specimen 2×16 seam');
    // A pill on a 2px width, which renders the specimen's radius 1.
    assert.equal(drawn.radius, '999px');
    assert.equal(drawn.border, '0px', 'the grip draws no border');
    assert.equal(drawn.opacity, '1', 'the seam is not faded: .35 fails 3:1 on the tints');
    assert.ok(drawn.paint, 'the seam is painted in --fab-text-secondary');
    assert.deepEqual(
      drawn.ticks,
      ['10.5px', '10.5px'],
      "the ticks take the specimen's .k-count size"
    );
  });

  it('keeps the Times of day bar`s rail, dot and dividers apart across the full-width panel', async () => {
    assertPanelBarApart(await measurePanelBar('rangeBarPanel'), 543, RAILS_ALL);
  });

  it('skips the add that would overlap a neighbour once the panel folds to one narrow column', async () => {
    assertPanelBarApart(await measurePanelBar('rangeBarPanelNarrow'), 248, RAILS_SKIPPED);
  });

  it('finds the condition label field at 34px, whatever its own 20px declaration says', async () => {
    // The field baseline `.fabricate-manager input:not([type])` is (0,2,1) and out-ranks the
    // chromeless rule's (0,2,0), so the input already offers a target well past 24px.
    const height = await tab.evaluate(
      () => document.querySelector('[data-case="label-input"] input').getBoundingClientRect().height
    );
    assert.ok(height >= 24, `the label field is ${height}px`);
  });

  it('gives the task range a 24px track the row does not feel', async () => {
    const range = await tab.evaluate(() => {
      const input = document.querySelector('[data-case="range"] input');
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        height: box.height,
        occupied:
          box.height + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom),
      };
    });
    assert.deepEqual(range, { height: 24, occupied: 22 });
  });
});

/* THE SCOPED CATALOGUE'S INSPECTOR COLUMN. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { choosePageSize } from '../helpers/page-size-control.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  STATUS_TONE_RAW_MODULES,
  PAGINATION_COMPILED_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL = 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte';
const FRAME = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';

const fabricateCss = readStylesheet();
const frameCss = scopedComponentCss(resolve(repoRoot, FRAME));
const shellCss = scopedComponentCss(resolve(repoRoot, SHELL));
/** The unavailable warning is a `<p>`, so without its own sheet it measures a UA margin. */
const calloutCss = scopedComponentCss(resolve(repoRoot, 'src/ui/svelte/components/Callout.svelte'));
/** The selection band's own children (issue 1373, maintainer feedback round 4). */
const selectionToolbarCss = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte')
);

/** The threshold the frame declares. Read from its source so the two cannot drift apart. */
const THRESHOLD_PX = Number(
  /@container fabricate-scoped-list \(max-width: (\d+)px\)/.exec(
    readFileSync(resolve(repoRoot, FRAME), 'utf8')
  )?.[1]
);
/** The manager rail's width, which `main` does not get. */
const RAIL_PX = 220;
/** The inspector column's declared width, matching the shared aside it stands in for. */
const INSPECTOR_PX = Number(
  /\.manager-scoped-list-layout\.has-inspector\s*\{[^}]*?minmax\(0,\s*1fr\)\s+(\d+)px/s.exec(
    readFileSync(resolve(repoRoot, FRAME), 'utf8')
  )?.[1]
);
/** Sub-pixel tolerance; every defect this catches moves an edge by hundreds of pixels. */
const EPSILON_PX = 1;
/** MORE ROWS THAN THE VIEWPORT HOLDS, and the count is load-bearing. */
const ROW_COUNT = 25;
/** The size the tall fixture is driven to, so all {@link ROW_COUNT} rows render at once. */
const TALL_PAGE_SIZE = 25;
/** The manager host's height, so the column has a definite one to be bounded by. */
const HOST_HEIGHT_PX = 900;
/** A TALLER host for the short-but-multi-page probe, and the extra height is load-bearing. */
const TALL_HOST_HEIGHT_PX = 1400;
/** Entities in the short-but-multi-page fixture: more than one default page, driven down to ten. */
const PAGED_ROW_COUNT = 26;
/** The page size that probe is driven to, which is `Pagination`'s smallest offered option. */
const PAGED_PAGE_SIZE = 10;

// Two REAL window widths, one comfortably either side of the threshold once the rail is taken
// off. Asserted against the measured container width below rather than assumed.
const WIDE_WINDOW_PX = 1400;
const NARROW_WINDOW_PX = 900;

/** The window the world catalogues are photographed at. */
const CATALOGUE_WINDOW_PX = 1280;
/** The world Tools Catalogue's own corpus size: eleven records over a ten-row page. */
const SELECTION_ROW_COUNT = 11;
/** Rows ticked, matching the maintainer's own reproduction and the `-bulk` lab case. */
const SELECTION_TICKS = 4;
/** The world catalogues' short select-all caption, which both of them pass. */
const SELECT_ALL_SHORT = 'All';
/** `--fab-space-3`: the gutter the list column's boxed children keep inside its flush edges (M21). */
const GUTTER_PX = 12;

const laneInspectorBody = createRawSnippet(() => ({
  render: () => `<p data-lane-inspector-body>The lane's own panel.</p>`,
}));

/** A lane's `bulk` panel, standing in for `ToolCatalogueBulkPanel` (issue 1373, round 4). */
const laneBulkBody = createRawSnippet(() => ({
  render: () => `<p data-lane-bulk-body>The lane's own bulk panel.</p>`,
}));

/** A lane's `listLead`, standing in for the world Tool catalogue's create-from-drop zone. */
const laneListLead = createRawSnippet(() => ({
  render: () => `<div data-lane-list-lead style="height:60px">Drop zone</div>`,
}));

/** A lane's `columnLead`, standing in for the world Tools catalogue's scope band. */
const laneColumnLead = createRawSnippet(() => ({
  render: () => `<div data-lane-column-lead style="height:48px">Scope band</div>`,
}));

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-list-geometry-',
  rawModules: [
    // Issue 1506: the one tone map the converted status pills read at a dynamic site.
    ...STATUS_TONE_RAW_MODULES,
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
    // per-entry references now, so its own static closure reaches the vocabulary core and the
    // shipped counter. The harness validates this closure and names the miss, unlike the
    // hand-rolled trees elsewhere.
    'src/systems/worldVocabulary.js',
    'src/ui/model/vocabularyUsage.js',
    'src/utils/componentCategories.js',
    // #1663: the ONE implementation behind both category shims; imports nothing.
    'src/utils/categoryNormalization.js',
    'src/utils/recipeCategories.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/toolScope.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/scopedDefinitionStore.js',
    'src/utils/scalars.js',
    'src/systems/worldScopeEntityGrouping.js',
    'src/utils/definitionIndex.js',
    'src/utils/sourceReferenceUnion.js',
    'src/ui/model/browserPagination.js',
    'src/utils/bulkSelectionModel.js',
    'src/ui/model/scopedEntityListModel.js',
    // The frame's lifted view-state (issue 1438).
    'src/ui/model/managerBrowserViewState.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/FilterBar.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    ...PAGINATION_COMPILED_MODULES,
    // Issue 1504: the shared `<Select>`'s whole compiled closure, spread rather than copied.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    FRAME,
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    // The shared frame's membership filter is a segmented track since issue 1373.
    'src/ui/svelte/components/SegmentedControl.svelte',
    SHELL,
  ],
  componentPath: SHELL,
});

function page(productMarkup, windowWidth, hostHeight = HOST_HEIGHT_PX, view = 'world-components') {
  // ── THE MODULE SHEET IS LAYERED AND THE COMPONENT SHEETS ARE NOT ─────────────────────────────
  // `module.json` registers `styles/fabricate.css` with no explicit `layer`, and Foundry imports
  // an unlayered module stylesheet at `layer(modules)` — `tests/view-lab/cascade.css` reproduces
  // that verbatim and is the reference for it. A Svelte scoped block is injected as an ordinary
  // unlayered `<style>` at runtime, and an unlayered declaration beats a layered one WHATEVER the
  // specificity.
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>@layer modules { ${fabricateCss} }</style>
    <style>${frameCss.css}</style>
    <style>${shellCss.css}</style>
    <style>${selectionToolbarCss.css}</style>
    <style>${calloutCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${windowWidth}px; height: ${hostHeight}px; }
    </style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark"
             data-manager-view="${view}">
          <div class="probe-band"></div>
          <div class="probe-band"></div>
          <div class="manager-body" style="grid-template-columns: ${RAIL_PX}px minmax(0, 1fr);">
            <div class="manager-rail"></div>
            <main class="manager-main">${productMarkup}</main>
          </div>
        </div>
      </div>
    </body></html>`;
}

function measure() {
  const frame = document.querySelector('.manager-scoped-list-frame');
  if (!frame) return { frameRendered: false };
  const column = frame.querySelector('.manager-scoped-list-column');
  const inspector = frame.querySelector('[data-scoped-list-inspector]');
  if (!column || !inspector) return { frameRendered: true, inspectorRendered: Boolean(inspector) };
  const frameBox = frame.getBoundingClientRect();
  const columnBox = column.getBoundingClientRect();
  const inspectorBox = inspector.getBoundingClientRect();
  const rowsRegion = frame.querySelector('.manager-scoped-list-rows');
  const list = frame.querySelector('.manager-scoped-list');
  return {
    frameRendered: true,
    inspectorRendered: true,
    // The height chain. `frameHeight` is what `.manager-main` handed down.
    frameHeight: frameBox.height,
    inspectorHeight: inspectorBox.height,
    rowsHeight: rowsRegion ? rowsRegion.getBoundingClientRect().height : 0,
    rowsScrollHeight: rowsRegion ? rowsRegion.scrollHeight : 0,
    rowsCanScroll: rowsRegion ? rowsRegion.scrollHeight > rowsRegion.clientHeight + 1 : false,
    listHeight: list ? list.getBoundingClientRect().height : 0,
    viewportHeight: window.innerHeight,
    containerWidth: frameBox.width,
    columnRight: columnBox.right,
    columnBottom: columnBox.bottom,
    inspectorLeft: inspectorBox.left,
    inspectorTop: inspectorBox.top,
    inspectorWidth: inspectorBox.width,
    frameWidth: frameBox.width,
  };
}

describe("the catalogue shell's inspector column, measured in a real browser", () => {
  let browser = null;
  let markup = '';
  let unavailableMarkup = '';
  let unavailableLeadMarkup = '';
  let essenceMarkup = '';
  let shortMarkup = '';
  let shortPagedMarkup = '';
  let leadMarkup = '';
  let selectionMarkup = '';
  let selectionRestingMarkup = '';

  before(async () => {
    assert.ok(
      Number.isFinite(THRESHOLD_PX) && THRESHOLD_PX > 0,
      'the frame declares no `@container fabricate-scoped-list (max-width: Npx)` rule, so ' +
        'this whole gate measures a breakpoint that does not exist'
    );
    await harness.setup();
    const scope = projectWorldScopeEntity({
      entityType: 'component',
      corpus: {
        entities: Array.from({ length: ROW_COUNT }, (unused, index) => ({
          id: `component-${index}`,
          name: `Ash ${index}`,
          description: 'A component',
          img: 'icons/commodities/ash.webp',
        })),
        defaults: [],
        membership: [],
      },
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
    });
    const target = await harness.mount({
      scope,
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-components',
      title: 'Component catalogue',
      subtitle: 'One per world.',
      selectedId: 'component-0',
      inspectorBody: laneInspectorBody,
    });
    // DRIVEN TO A SIZE THAT SHOWS THE WHOLE CORPUS. See `ROW_COUNT`.
    const tallSizeSelect = target.querySelector(
      '.manager-scoped-list-column [data-pagination-size]'
    );
    assert.ok(
      Boolean(tallSizeSelect),
      `a ${ROW_COUNT}-entity corpus rendered no page-size control in the list column, so this ` +
        'fixture cannot be driven onto one page and the overflow below is unreachable'
    );
    choosePageSize(target, '', TALL_PAGE_SIZE);
    await harness.setProps({});
    assert.equal(
      target.querySelectorAll('[data-scoped-list-row]').length,
      ROW_COUNT,
      `the size control did not take: ${ROW_COUNT} entities rendered ` +
        `${target.querySelectorAll('[data-scoped-list-row]').length} rows, so the list is still ` +
        'a short page and every overflow assertion below is vacuous'
    );
    markup = target.innerHTML;
    const unavailableTarget = await harness.mount({
      scope: projectWorldScopeEntity({ entityType: 'component', corpus: null }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-components',
      title: 'Component catalogue',
      subtitle: 'One per world.',
      inspectorBody: laneInspectorBody,
    });
    unavailableMarkup = unavailableTarget.innerHTML;
    // The world Tools catalogue's shape: its scope band leads the column above the warning.
    const unavailableLeadTarget = await harness.mount({
      scope: projectWorldScopeEntity({ entityType: 'tool', corpus: null }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-tools',
      title: 'Tools Catalogue',
      subtitle: 'One Tool per game-world Item.',
      columnLead: laneColumnLead,
      inspectorBody: laneInspectorBody,
    });
    unavailableLeadMarkup = unavailableLeadTarget.innerHTML;
    // A one-page essence catalogue: no pager, so the rows scroller is the column's foot.
    const essenceTarget = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'essence',
        corpus: {
          entities: Array.from({ length: 3 }, (unused, index) => ({
            id: `essence-${index}`,
            name: `Fire ${index}`,
            description: 'An essence',
            img: 'icons/magic/fire.webp',
          })),
          defaults: [],
          membership: [],
        },
        systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-essences',
      title: 'Essence Catalogue',
      subtitle: 'One per world.',
      countUnit: 'essences',
      membershipFilter: false,
      inspectorBody: laneInspectorBody,
    });
    essenceMarkup = essenceTarget.innerHTML;
    const shortTarget = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'component',
        corpus: {
          entities: [
            { id: 'component-0', name: 'Ash 0', description: 'A component', img: 'icons/a.webp' },
          ],
          defaults: [],
          membership: [],
        },
        systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-components',
      title: 'Component catalogue',
      subtitle: 'One per world.',
      selectedId: 'component-0',
      inspectorBody: laneInspectorBody,
    });
    shortMarkup = shortTarget.innerHTML;

    // THE LEAD FIXTURE (issue 1373, maintainer feedback round 2). `listLead` renders inside the
    // list's own scroller, above the first row, and it had NO separation from whatever follows
    // it: the drop zone touched the `No tools yet` hero on an empty catalogue and butted straight
    // against the first row on a populated one. Those read as two defects and are one gap.
    const leadTarget = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'component',
        corpus: {
          entities: Array.from({ length: 3 }, (unused, index) => ({
            id: `component-${index}`,
            name: `Ash ${index}`,
            description: 'A component',
            img: 'icons/commodities/ash.webp',
          })),
          defaults: [],
          membership: [],
        },
        systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-components',
      title: 'Component catalogue',
      subtitle: 'One per world.',
      listLead: laneListLead,
      inspectorBody: laneInspectorBody,
    });
    leadMarkup = leadTarget.innerHTML;

    // THE SHORT-BUT-MULTI-PAGE FIXTURE, built by DRIVING the control rather than by a prop.
    const pagedTarget = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'component',
        corpus: {
          entities: Array.from({ length: PAGED_ROW_COUNT }, (unused, index) => ({
            id: `component-${index}`,
            name: `Ash ${index}`,
            description: 'A component',
            img: 'icons/commodities/ash.webp',
          })),
          defaults: [],
          membership: [],
        },
        systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-components',
      title: 'Component catalogue',
      subtitle: 'One per world.',
      selectedId: 'component-0',
      inspectorBody: laneInspectorBody,
    });
    const sizeSelect = pagedTarget.querySelector(
      '.manager-scoped-list-column [data-pagination-size]'
    );
    assert.ok(
      Boolean(sizeSelect),
      `a ${PAGED_ROW_COUNT}-entity corpus rendered no page-size control in the list column, so ` +
        'this fixture never reached the multi-page state it exists to measure'
    );
    choosePageSize(pagedTarget, '', PAGED_PAGE_SIZE);
    await harness.setProps({});
    shortPagedMarkup = pagedTarget.innerHTML;

    // ── THE SELECTION FIXTURE (issue 1373, maintainer feedback round 3) ──────────────────────
    // The toolbar the maintainer photographed: a world catalogue's own configuration — no
    // membership filter and the short `All` caption — over eleven records with four ticked, at
    // the lab's own window width. In that state the row carries four MORE controls than at rest
    // (the divider, `4 selected`, `Select all 11 results` and `Clear`), and the shipped row wrapped
    // `Asc` onto a second line by itself with the result count stranded beside it.
    const selectionTarget = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'tool',
        corpus: {
          entities: Array.from({ length: SELECTION_ROW_COUNT }, (unused, index) => ({
            id: `tool-${index}`,
            name: `Hammer ${index}`,
            description: 'A tool',
            img: 'icons/tools/smithing/hammer.webp',
          })),
          defaults: [],
          membership: [],
        },
        systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      }),
      actions: {},
      systems: [{ id: 'sys-a', name: 'Mythwright Forge' }],
      hookValue: 'world-tools',
      title: 'Tools Catalogue',
      subtitle: 'One Tool per game-world Item.',
      countUnit: 'tools',
      membershipFilter: false,
      selectAllLabel: SELECT_ALL_SHORT,
      inspectorBody: laneInspectorBody,
      bulk: laneBulkBody,
    });
    // THE SAME TOOLBAR AT REST, CAPTURED BEFORE THE FIRST TICK (issue 1373, round 4). The claim
    // the band exists to make is that the filter row's composition does not depend on selection
    // state, and that is a COMPARISON — a selected row measured on its own cannot state it. One
    // mount produces both halves, so the two markups differ in nothing but the ticks.
    selectionRestingMarkup = selectionTarget.innerHTML;
    assert.ok(
      !selectionRestingMarkup.includes('data-scoped-list-selection-count'),
      'the resting capture already carries a selection count, so the two markups below are the ' +
        'same state and every comparison between them is vacuous'
    );

    const boxes = [...selectionTarget.querySelectorAll('[data-scoped-list-select]')];
    assert.ok(
      boxes.length >= SELECTION_TICKS,
      `the selection fixture rendered ${boxes.length} row checkboxes, fewer than the ` +
        `${SELECTION_TICKS} this case ticks, so the selected state below is never reached`
    );
    for (const box of boxes.slice(0, SELECTION_TICKS)) {
      box.checked = true;
      box.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    }
    await harness.setProps({});
    assert.ok(
      Boolean(selectionTarget.querySelector('[data-scoped-list-selection-count]')),
      'ticking the row boxes produced no selection count in the toolbar, so this fixture is ' +
        'still the RESTING toolbar and the wrap it exists to measure cannot occur'
    );
    assert.ok(
      Boolean(selectionTarget.querySelector('[data-scoped-list-select-all-results]')),
      `${SELECTION_ROW_COUNT} records over a ${PAGED_PAGE_SIZE}-row page rendered no ` +
        '`Select all N results` link, so the widest state of this row is not what is measured'
    );
    selectionMarkup = selectionTarget.innerHTML;

    harness.teardown();
    assert.ok(
      markup.includes('data-scoped-list-inspector'),
      'the mounted catalogue rendered no inspector region, so nothing below is measuring one'
    );
    // NOT asserted as a string here: the shell's INSPECTOR renders its own persistent pager over
    // the system list, so `shortMarkup` contains `data-pagination-summary` whether or not the
    // FOOT pager does. That is exactly the confusion `measureShortColumn` resolves by scoping to
    // `.manager-scoped-list-column`, and each geometry case asserts its own `hasPagination`.
    browser = await chromium.launch();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  async function measureUnavailable(windowWidth, productMarkup = unavailableMarkup) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(productMarkup, windowWidth));
    const result = await tab.evaluate(() => {
      const layout = document.querySelector('.manager-scoped-list-layout');
      const column = document.querySelector('.manager-scoped-list-column');
      const wrapper = document.querySelector('.manager-scoped-list-unavailable');
      const callout = document.querySelector('[data-scoped-list-state="unavailable"]');
      if (!layout || !column || !wrapper || !callout) return { rendered: false };
      // The wrapper carries the gutter, so a callout filling it stops one gutter short of the
      // layout; the void this asserts against is an inspector TRACK, an order of magnitude larger.
      const style = getComputedStyle(wrapper);
      const columnBox = column.getBoundingClientRect();
      const wrapperBox = wrapper.getBoundingClientRect();
      const calloutBox = callout.getBoundingClientRect();
      const lead = document.querySelector('[data-lane-column-lead]')?.getBoundingClientRect();
      return {
        rendered: true,
        layoutRight: layout.getBoundingClientRect().right - (parseFloat(style.paddingRight) || 0),
        calloutRight: calloutBox.right,
        columns: getComputedStyle(layout).gridTemplateColumns,
        gutter: [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)],
        wrapperInset: [wrapperBox.left - columnBox.left, columnBox.right - wrapperBox.right],
        leadTop: lead ? lead.top - columnBox.top : null,
        leadGap: lead ? calloutBox.top - lead.bottom : null,
      };
    });
    await context.close();
    return result;
  }

  /**
   * Measure one short-list probe's column.
   *
   * @param {string} productMarkup
   * @param {number} windowWidth
   * @param {number} hostHeight
   */
  async function measureShortColumn(productMarkup, windowWidth, hostHeight) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: hostHeight },
    });
    const tab = await context.newPage();
    await tab.setContent(page(productMarkup, windowWidth, hostHeight));
    const result = await tab.evaluate(() => {
      const column = document.querySelector('.manager-scoped-list-column');
      const rowsRegion = column?.querySelector('.manager-scoped-list-rows');
      const list = column?.querySelector('.manager-scoped-list');
      if (!column || !rowsRegion || !list) return { rendered: false };
      const pagination = column.querySelector('.fabricate-pagination');
      return {
        rendered: true,
        hasPagination: Boolean(pagination),
        // The border box: the column carries no inset (M21), so its foot child fills to it.
        columnBottom: column.getBoundingClientRect().bottom,
        rowsBottom: rowsRegion.getBoundingClientRect().bottom,
        paginationBottom: pagination ? pagination.getBoundingClientRect().bottom : 0,
        paginationHeight: pagination ? pagination.getBoundingClientRect().height : 0,
        rowsHeight: rowsRegion.getBoundingClientRect().height,
        listHeight: list.getBoundingClientRect().height,
        listBottom: list.getBoundingClientRect().bottom,
      };
    });
    await context.close();
    return result;
  }

  /**
   * Measure the list toolbar's filter row as a FLEX LINE COUNT (issue 1373, round 3).
   *
   * @param {string} productMarkup
   * @param {number} windowWidth
   */
  async function measureToolbarLines(productMarkup, windowWidth) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(productMarkup, windowWidth));
    const result = await tab.evaluate(() => {
      // NOT `.manager-scoped-list-filter-row` on its own. `BulkSelectionToolbar` renders
      // `<div class="{rowClass} is-selection">` in its own template, so BOTH the filter row and
      // the selection register carry that class and a bare query answers whichever comes first
      // in the DOM — which is the filter row today and would silently become the band the moment
      // the band moved above it. `:not(.is-selection)` names the filter row itself.
      const row = document.querySelector(
        '.manager-scoped-list-column .manager-scoped-list-filter-row:not(.is-selection)'
      );
      if (!row) return { rendered: false };
      // WALK THROUGH ANY `display: contents` CHILD. The register was flattened into this row
      // with `display: contents` before it became its own band, and under that construction the
      // four selection controls are flex items of THIS row while their wrapper is not a box at
      // all. Keeping the walk is what lets this measurement describe both constructions, so the
      // pre-fix run reports the real item list rather than one opaque wrapper.
      const items = [];
      for (const child of row.children) {
        if (getComputedStyle(child).display === 'contents') items.push(...child.children);
        else items.push(child);
      }
      const described = items.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: String(element.getAttribute('class') || element.tagName),
          centre: Math.round(box.top + box.height / 2),
          width: Math.round(box.width),
        };
      });
      const rowBox = row.getBoundingClientRect();
      const search = row.querySelector('.fabricate-search');
      const band = document.querySelector('[data-scoped-list-selection-toolbar]');
      const bandBox = band ? band.getBoundingClientRect() : null;
      const bandStyle = band ? getComputedStyle(band) : null;
      const holds = (scope) =>
        scope
          ? {
              pageBox: Boolean(scope.querySelector('[data-scoped-list-select-all-page]')),
              count: Boolean(scope.querySelector('[data-scoped-list-selection-count]')),
              results: Boolean(scope.querySelector('[data-scoped-list-select-all-results]')),
              clear: Boolean(scope.querySelector('[data-scoped-list-clear-selection]')),
            }
          : { pageBox: false, count: false, results: false, clear: false };
      return {
        rendered: true,
        itemCount: items.length,
        rowWidth: Math.round(rowBox.width),
        rowHeight: Math.round(rowBox.height),
        rowBottom: Math.round(rowBox.bottom),
        tallestItem: Math.round(
          Math.max(...items.map((element) => element.getBoundingClientRect().height))
        ),
        overflowedBy: Math.round(row.scrollWidth - row.clientWidth),
        items: described,
        centres: [...new Set(described.map((item) => item.centre))].sort((a, b) => a - b),
        searchWidth: search ? Math.round(search.getBoundingClientRect().width) : 0,
        // The register's four controls, asked for on BOTH sides of the boundary.
        rowHolds: holds(row),
        band: {
          rendered: Boolean(band),
          display: bandStyle ? bandStyle.display : '',
          // A `display: contents` box has no geometry at all.
          top: bandBox ? Math.round(bandBox.top) : 0,
          height: bandBox ? Math.round(bandBox.height) : 0,
          width: bandBox ? Math.round(bandBox.width) : 0,
          background: bandStyle ? bandStyle.backgroundColor : '',
          borderTopColor: bandStyle ? bandStyle.borderTopColor : '',
          borderTopWidth: bandStyle ? bandStyle.borderTopWidth : '',
          borderBottomWidth: bandStyle ? bandStyle.borderBottomWidth : '',
          holds: holds(band),
          // The trailing pair, as EDGES rather than as a `margin-left` string. `getComputedStyle`
          // reports the USED value of an `auto` margin on a flex item, so "the auto margin is on
          // the right control" and "the auto margin is on both, splitting the gap" both read as a
          // plausible pixel number and only the geometry tells them apart.
          edges: (() => {
            const at = (selector) => {
              const found = band ? band.querySelector(selector) : null;
              if (!found) return null;
              const rect = found.getBoundingClientRect();
              return { left: Math.round(rect.left), right: Math.round(rect.right) };
            };
            return {
              band: bandBox
                ? { left: Math.round(bandBox.left), right: Math.round(bandBox.right) }
                : null,
              hint: at('.fab-bulk-selection-hint'),
              results: at('[data-scoped-list-select-all-results]'),
              clear: at('[data-scoped-list-clear-selection]'),
            };
          })(),
        },
      };
    });
    await context.close();
    return result;
  }

  async function measureAt(windowWidth) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(markup, windowWidth));
    const result = await tab.evaluate(measure);
    await context.close();
    return result;
  }

  it('puts the inspector BESIDE the list at 300px above the threshold', async () => {
    const box = await measureAt(WIDE_WINDOW_PX);
    assert.equal(box.inspectorRendered, true, 'the inspector region is absent from the page');
    assert.ok(
      box.containerWidth > THRESHOLD_PX,
      `the container measured ${box.containerWidth}px, which is NOT above the ${THRESHOLD_PX}px ` +
        'threshold — this case is on the wrong side of the query and proves nothing'
    );
    assert.ok(
      box.inspectorLeft >= box.columnRight - EPSILON_PX,
      `the inspector starts at ${box.inspectorLeft} but the list column ends at ${box.columnRight}`
    );
    assert.ok(
      Math.abs(box.inspectorWidth - INSPECTOR_PX) <= EPSILON_PX,
      `the inspector is ${box.inspectorWidth}px, not the ${INSPECTOR_PX}px of the shared aside ` +
        'it stands in for'
    );
  });

  it('BOUNDS the inspector to the frame and gives the rows the overflow', async () => {
    // ── WHAT A FOUR-ROW FIXTURE CANNOT SEE ──────────────────────────────────────────────────
    // `.manager-main` hands this frame a definite height. A `display: block` frame does not pass
    // it on, so the layout inside is content-sized, every `overflow-y: auto` in the component is
    // inert, and the inspector becomes a panel as tall as the whole list — measured at 1957px
    // holding 175px of content, reporting `canScroll: false`.
    const box = await measureAt(WIDE_WINDOW_PX);
    assert.equal(box.inspectorRendered, true);
    assert.ok(
      box.listHeight > box.viewportHeight,
      `the ${ROW_COUNT}-row list measured ${box.listHeight}px inside a ${box.viewportHeight}px ` +
        'viewport and does not overflow, so nothing below distinguishes a bounded column from ' +
        'an unbounded one'
    );
    assert.ok(
      box.frameHeight <= box.viewportHeight + EPSILON_PX,
      `the frame is ${box.frameHeight}px in a ${box.viewportHeight}px viewport, so it took its ` +
        'height from its content rather than from `.manager-main`'
    );
    assert.ok(
      box.inspectorHeight <= box.frameHeight + EPSILON_PX,
      `the inspector is ${box.inspectorHeight}px inside a ${box.frameHeight}px frame — it spans ` +
        'the whole scroll region, so clicking a row below the fold shows the GM nothing'
    );
    assert.equal(
      box.rowsCanScroll,
      true,
      `the rows region is ${box.rowsHeight}px around ${box.rowsScrollHeight}px of rows and ` +
        'cannot scroll, so its own `overflow-y: auto` is dead and the page scrolls instead'
    );
  });

  it('fills the resting inspector panel from inset top to inset bottom', async () => {
    const context = await browser.newContext({
      viewport: { width: CATALOGUE_WINDOW_PX, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(selectionRestingMarkup, CATALOGUE_WINDOW_PX));
    const box = await tab.evaluate(() => {
      const scroll = document.querySelector('.manager-scoped-list-inspector-scroll');
      const empty = scroll?.querySelector('[data-scoped-list-inspector-state="resting"]');
      if (!scroll || !empty) return { rendered: false };
      const scrollBox = scroll.getBoundingClientRect();
      const emptyBox = empty.getBoundingClientRect();
      return {
        rendered: true,
        topGap: emptyBox.top - scrollBox.top,
        bottomGap: scrollBox.bottom - emptyBox.bottom,
        height: emptyBox.height,
      };
    });
    await context.close();

    assert.equal(box.rendered, true, 'the resting inspector or its panel did not render');
    assert.ok(box.height > 0, 'the resting panel has no measurable height');
    assert.ok(Math.abs(box.topGap) <= EPSILON_PX, `the resting panel leaves ${box.topGap}px above`);
    assert.ok(
      Math.abs(box.bottomGap) <= EPSILON_PX,
      `the resting panel leaves ${box.bottomGap}px below`
    );
  });

  it('SEPARATES the list lead from whatever follows it, by more than the row rhythm', async () => {
    // FINDING 1, MEASURED RATHER THAN LOOKED AT. The gap belongs BELOW the lead and is stated
    // once there, so all three things that can follow it — the filtered hero, the empty hero and
    // the `<ul>` — inherit it. Measured against the list's OWN row gap rather than a pixel
    // literal: the claim is that a drop zone is a different kind of thing from the rows under it
    // and must not read as one of them, which a fixed number cannot express and which survives
    // the row rhythm being retuned.
    const context = await browser.newContext({
      viewport: { width: WIDE_WINDOW_PX, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(leadMarkup, WIDE_WINDOW_PX));
    const box = await tab.evaluate(() => {
      const lead = document.querySelector('.manager-scoped-list-lead');
      const list = document.querySelector('.manager-scoped-list');
      const rows = list ? [...list.querySelectorAll('.manager-scoped-list-row')] : [];
      if (!lead || !list || rows.length < 2) return { rendered: false, rowCount: rows.length };
      return {
        rendered: true,
        rowCount: rows.length,
        leadBottom: lead.getBoundingClientRect().bottom,
        listTop: list.getBoundingClientRect().top,
        rowGap: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom,
      };
    });
    await context.close();

    assert.equal(
      box.rendered,
      true,
      `the lead fixture rendered ${box.rowCount} rows and needs at least two: the row rhythm ` +
        'this case measures against is the distance between them'
    );
    assert.ok(
      box.rowGap > 0,
      'the rows measured no gap between them, so the bound below compares against nothing'
    );
    assert.ok(
      box.listTop - box.leadBottom > box.rowGap,
      `the lead ends at ${Math.round(box.leadBottom)} and the list starts at ` +
        `${Math.round(box.listTop)}, a ${Math.round(box.listTop - box.leadBottom)}px gap against ` +
        `a ${Math.round(box.rowGap)}px row rhythm: the lead reads as one more row`
    );
  });

  it('reserves NO inspector track on the unavailable branch', async () => {
    // The unavailable branch renders ONE callout and no inspector.
    const box = await measureUnavailable(WIDE_WINDOW_PX);
    assert.equal(box.rendered, true, 'the unavailable callout is absent from the page');
    assert.equal(
      box.columns.split(' ').length,
      1,
      `the layout is \`${box.columns}\` — a second track beside a warning with nothing in it`
    );
    assert.ok(
      box.calloutRight >= box.layoutRight - EPSILON_PX,
      `the callout ends at ${box.calloutRight} inside a layout ending at ${box.layoutRight}, ` +
        `leaving a ${Math.round(box.layoutRight - box.calloutRight)}px void`
    );
  });

  it('keeps the unavailable warning on the gutter, its wrapper flush to the column (issue 2373)', async () => {
    const box = await measureUnavailable(WIDE_WINDOW_PX);
    assert.equal(box.rendered, true, 'the unavailable wrapper or its callout is absent');
    assert.deepEqual(box.gutter, [GUTTER_PX, GUTTER_PX], 'one gutter on each side of the warning');
    assert.ok(
      box.wrapperInset.every((edge) => Math.abs(edge) <= EPSILON_PX),
      `the wrapper sits ${box.wrapperInset.join('/')}px inside the column's left/right edges`
    );
  });

  it('puts one gutter, not two, between a column lead and the unavailable warning (issue 2373)', async () => {
    const box = await measureUnavailable(WIDE_WINDOW_PX, unavailableLeadMarkup);
    assert.equal(box.rendered, true, 'the unavailable wrapper or its callout is absent');
    assert.ok(box.leadTop !== null, 'NON-VACUITY: the column lead rendered above the warning');
    assert.ok(
      Math.abs(box.leadTop - GUTTER_PX) <= EPSILON_PX,
      `the lead starts ${box.leadTop}px below the column's top, not one ${GUTTER_PX}px gutter`
    );
    assert.ok(
      Math.abs(box.leadGap - GUTTER_PX) <= EPSILON_PX,
      `the warning starts ${box.leadGap}px below the lead, not one ${GUTTER_PX}px gutter`
    );
  });

  /** The list column's padding and its bands' edges, under one route's surface ladder. */
  async function measureFlushColumn(productMarkup, view) {
    const context = await browser.newContext({
      viewport: { width: CATALOGUE_WINDOW_PX, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(productMarkup, CATALOGUE_WINDOW_PX, HOST_HEIGHT_PX, view));
    const result = await tab.evaluate(() => {
      const column = document.querySelector('.manager-scoped-list-column');
      const toolbar = column?.querySelector(':scope > .manager-scoped-list-toolbar');
      const rows = column?.querySelector(':scope > .manager-scoped-list-rows');
      const row = rows?.querySelector('[data-scoped-list-row]');
      if (!column || !toolbar || !rows || !row) return { rendered: false };
      const columnBox = column.getBoundingClientRect();
      const edges = (element) => {
        const box = element.getBoundingClientRect();
        return [box.left - columnBox.left, columnBox.right - box.right];
      };
      const style = getComputedStyle(column);
      const pager = column.querySelector(':scope > .fabricate-pagination');
      const probe = document.createElement('div');
      probe.style.background = 'var(--fab-bg-1)';
      document.body.append(probe);
      const bg1 = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        rendered: true,
        bg1,
        pagerFill: pager ? getComputedStyle(pager).backgroundColor : null,
        padding: ['Top', 'Right', 'Bottom', 'Left'].map((side) =>
          parseFloat(style[`padding${side}`])
        ),
        toolbar: edges(toolbar),
        rows: edges(rows),
        rowInset: row.getBoundingClientRect().left - columnBox.left,
        rowsPaddingBottom: parseFloat(getComputedStyle(rows).paddingBottom),
        footClass: String(column.lastElementChild.className),
        footGap: columnBox.bottom - column.lastElementChild.getBoundingClientRect().bottom,
      };
    });
    await context.close();
    return result;
  }

  for (const { view, markupOf, foot, footPadding } of [
    // Eleven tools over a ten-row page, so the pager is the foot and the scroller pads nothing.
    {
      view: 'world-tools',
      markupOf: () => selectionRestingMarkup,
      foot: 'fabricate-pagination',
      footPadding: 0,
    },
    {
      view: 'world-essences',
      markupOf: () => essenceMarkup,
      foot: 'manager-scoped-list-rows',
      footPadding: GUTTER_PX,
    },
  ]) {
    it(`runs the ${view} list column edge to edge, its rows on the gutter (M21, issue 2373)`, async () => {
      const box = await measureFlushColumn(markupOf(), view);
      assert.equal(box.rendered, true, 'the column, its toolbar, its rows or a row did not render');
      assert.deepEqual(box.padding, [0, 0, 0, 0], 'the list column carries no inset');
      assert.ok(
        box.rows.every((edge) => Math.abs(edge) <= EPSILON_PX),
        `the rows stop ${box.rows.join('/')}px short of the column's left/right edges`
      );
      assert.ok(
        box.toolbar.every((edge) => Math.abs(edge - GUTTER_PX) <= EPSILON_PX),
        `the filter bar stops ${box.toolbar.join('/')}px short of the column's left/right edges, ` +
          `not the ${GUTTER_PX}px inset`
      );
      assert.ok(
        Math.abs(box.toolbar[0] - box.rowInset) <= EPSILON_PX,
        `the filter bar's left edge (${box.toolbar[0]}px) is not the rows' gutter (${box.rowInset}px)`
      );
      assert.ok(
        Math.abs(box.rowInset - GUTTER_PX) <= EPSILON_PX,
        `a row starts ${box.rowInset}px inside the column, not on the ${GUTTER_PX}px gutter`
      );
      assert.ok(box.footClass.includes(foot), `NON-VACUITY: the foot is \`${box.footClass}\``);
      if (foot === 'fabricate-pagination') {
        assert.equal(box.pagerFill, box.bg1, 'the pager fill is --fab-bg-1 on this route (M4)');
      }
      assert.ok(
        Math.abs(box.footGap) <= EPSILON_PX,
        `the foot stops ${box.footGap}px above the column's bottom`
      );
      assert.equal(
        box.rowsPaddingBottom,
        footPadding,
        'the scroller pads its foot only when it is the foot'
      );
    });
  }

  it("lets no route repaint the pager: its fill is the primitive's --fab-bg-1 everywhere (M4)", () => {
    const rules = [...fabricateCss.matchAll(/([^{}]*)\{([^{}]*)\}/gu)];
    const bare = (selector) => selector.replaceAll(/\/\*[\s\S]*?\*\//gu, '').trim();
    const repaints = rules
      .filter(
        ([, selector, body]) =>
          bare(selector).includes('.fabricate-pagination') &&
          /background/u.test(body) &&
          !/^\.fabricate-pagination\.fabricate-pagination(?:\.is-compact)?$/u.test(bare(selector))
      )
      .map(([, selector]) => bare(selector));
    assert.deepEqual(repaints, [], 'a route rule paints the pager over its own fill');
    const owner = rules.find(([, selector]) =>
      /^\s*\.fabricate-pagination\.fabricate-pagination\s*$/u.test(selector)
    );
    assert.ok(Boolean(owner) && owner[2].includes('background: var(--fab-bg-1)'));
  });

  it('gives the ROWS REGION the slack on a short list rather than sizing it to its content', async () => {
    // WHAT THE ROWS REGION'S `flex: 1 1 auto` ACTUALLY BUYS.
    // a list taller than the column every child is shrinking, so the declaration changes nothing
    // and the overflow case above cannot see it — it survived a mutation run for exactly that
    // reason. Its effect appears on a SHORT list: without it the rows region is content-sized and
    // whatever sits under it rides directly beneath the last row, moving up and down the screen
    // as a filter changes how many rows there are.
    const box = await measureShortColumn(shortMarkup, WIDE_WINDOW_PX, HOST_HEIGHT_PX);
    assert.equal(box.rendered, true);
    assert.equal(
      box.hasPagination,
      false,
      'the one-row fixture drew a foot pager, so this case is not measuring the state it names'
    );
    assert.ok(
      box.columnBottom - box.listBottom > 100,
      `the fixture's single row already fills the column (${box.listBottom} against a column ` +
        `bottom of ${box.columnBottom}), so there is no slack for the rows region to take and ` +
        'this case proves nothing'
    );
    assert.ok(
      box.rowsBottom >= box.columnBottom - EPSILON_PX,
      `the rows region ends at ${box.rowsBottom} inside a column ending at ${box.columnBottom}: ` +
        'it took its height from its one row instead of from the column'
    );
  });

  it('keeps the pagination bar at the FOOT of a short MULTI-PAGE list rather than floating it up', async () => {
    // THE OTHER HALF, and it needs a fixture that actually draws a pager. The browse archetype's
    // rule is that the pagination bar sits outside the scroll area and never moves; with the bar
    // now suppressed on a single page, the only state in which that rule has a subject is a list
    // of more than one page whose first page is short — which is what this probe builds.
    const box = await measureShortColumn(shortPagedMarkup, WIDE_WINDOW_PX, TALL_HOST_HEIGHT_PX);
    assert.equal(box.rendered, true);
    assert.equal(
      box.hasPagination,
      true,
      `a ${PAGED_ROW_COUNT}-entity corpus at ${PAGED_PAGE_SIZE} a page drew NO foot pager, so ` +
        'every assertion below is about an element that is not there'
    );
    assert.ok(
      box.columnBottom - box.listBottom > 100,
      `the fixture's ${PAGED_PAGE_SIZE} rows already fill the column (${box.listBottom} against ` +
        `a column bottom of ${box.columnBottom}), so there is no slack to attribute and this ` +
        'case proves nothing'
    );
    assert.ok(
      box.paginationBottom >= box.columnBottom - EPSILON_PX,
      `the pagination bar ends at ${box.paginationBottom} inside a column ending at ` +
        `${box.columnBottom}: it floated up under the last row instead of staying at the foot`
    );
    // ── AND THE PAGER IS NOT THE THING THAT GREW ────────────────────────────────────────────
    // `.manager-scoped-list-column > :global(.fabricate-pagination) { flex: 0 0 auto }` is ungated
    // by the assertion above, because a pager that fills the column also ends at the column's
    // foot. The slack belongs to the rows region — that is what puts the footer at the bottom
    // rather than making the footer tall — so it is stated separately.
    const rowHeight = box.listHeight / PAGED_PAGE_SIZE;
    assert.ok(
      rowHeight > 0,
      'the list measured no height, so the bound below divides by nothing and asserts nothing'
    );
    assert.ok(
      box.paginationHeight < rowHeight * 1.5,
      `the pager is ${Math.round(box.paginationHeight)}px against a ${Math.round(rowHeight)}px ` +
        "row: the pagination bar took the column's slack instead of the list"
    );
  });

  it('keeps the list toolbar on ONE line once rows are selected', async () => {
    // FINDING 2 OF ROUND 3, MEASURED RATHER THAN LOOKED AT. Selecting four rows adds a divider,
    // `4 selected`, `Select all 11 results` and `Clear` to a row that already carries the
    // select-all box, the search field, `SORT BY`, the key select, the direction toggle and the
    // result count — and the shipped row wrapped, stranding `Asc` alone on a second line with
    // `11 of 11 tools` pushed right of it. Every UNSELECTED frame of the same screen draws that
    // toolbar as one row, and so does the reference (`proto:1970`), so the wrap is a state the
    // screen enters rather than a width it ran out of.
    const box = await measureToolbarLines(selectionMarkup, CATALOGUE_WINDOW_PX);
    assert.equal(box.rendered, true, 'the selection fixture rendered no list filter row');
    // THE PRECONDITION IS NOW THE SELECTION ITSELF.
    assert.equal(
      box.band.rendered,
      true,
      'no selection register rendered at all, so this fixture is the RESTING toolbar and the ' +
        'wrap this case exists to measure cannot occur'
    );
    assert.ok(
      box.rowHeight <= box.tallestItem + EPSILON_PX,
      `the filter row is ${box.rowHeight}px against a tallest control of ${box.tallestItem}px, ` +
        'so it WRAPPED. Item centres: ' +
        `${box.centres.join(', ')}. Items: ` +
        `${box.items.map((item) => `${item.label}@${item.centre}=${item.width}px`).join(' | ')}`
    );
    // AND IT FITS RATHER THAN OVERFLOWING. A basis tight enough to stop the wrap but a
    // `min-width` too wide to honour it produces a one-line row that runs out past its own edge,
    // which measures identically to a fix on the assertion above and reads far worse on screen.
    assert.ok(
      box.overflowedBy <= EPSILON_PX,
      `the filter row overflows its own ${box.rowWidth}px by ${box.overflowedBy}px: the controls ` +
        'stopped wrapping because they stopped fitting'
    );
  });

  it('gives the selection its own BAND under an unchanged filter row', async () => {
    // ── THE DESIGN'S OWN CONSTRUCTION (issue 1373, maintainer feedback round 4) ───────────────
    // Round 3 stopped the wrap by shrinking the search field to about 150px whenever rows were
    // selected. It worked and it is not what the reference does. `proto:1970` is the tool
    // catalogue's filter row — search, `Sort by`, the sort select, the direction toggle and the
    // count, with NO selection affordance in it at all — and `proto:591`-`597` puts the selection
    // state in a SEPARATE band directly beneath that row, rendered only while a selection is
    // active and painted `--accent-soft` inside an `--accent-border` edge.
    const resting = await measureToolbarLines(selectionRestingMarkup, CATALOGUE_WINDOW_PX);
    const selected = await measureToolbarLines(selectionMarkup, CATALOGUE_WINDOW_PX);
    assert.equal(resting.rendered, true, 'the resting fixture rendered no list filter row');
    assert.equal(selected.rendered, true, 'the selection fixture rendered no list filter row');

    // 1 · THE BAND IS A BOX, AND IT IS UNDER THE ROW. `display: contents` removes an element
    // from the box tree entirely, so the flattened construction answers this with zeros.
    assert.equal(selected.band.rendered, true, 'no selection register rendered');
    assert.notEqual(
      selected.band.display,
      'contents',
      'the selection register is still flattened into the filter row with `display: contents`, ' +
        'so it is a set of loose controls in that row rather than the band `proto:592` draws'
    );
    assert.ok(
      selected.band.height > 0 && selected.band.width > 0,
      `the band measured ${selected.band.width}x${selected.band.height}px, so it is not a box`
    );
    assert.ok(
      selected.band.top >= selected.rowBottom - EPSILON_PX,
      `the band's top is ${selected.band.top}px against a filter row ending at ` +
        `${selected.rowBottom}px: it is not BENEATH the row`
    );

    // 2 · AND IT IS PAINTED. `proto:592` fills it `--accent-soft` and edges it
    // `--accent-border` on all four sides — a tinted card, not the hairline-topped continuation
    // of the filter row that shipped. Both are read from the resolved cascade rather than from
    // the source text, because a rule that compiles to a selector matching nothing reads exactly
    // like the rule that works.
    assert.notEqual(
      selected.band.background,
      'rgba(0, 0, 0, 0)',
      'the band has no fill, so it is not the tinted card `proto:592` draws'
    );
    assert.notEqual(
      selected.band.borderBottomWidth,
      '0px',
      `the band is edged only on top (${selected.band.borderTopWidth} / ` +
        `${selected.band.borderBottomWidth}), which is the shipped separator rule rather than ` +
        'the enclosed band'
    );

    // 3 · THE REGISTER MOVED, rather than being drawn twice. Both halves are asserted.
    assert.deepEqual(
      selected.band.holds,
      { pageBox: true, count: true, results: true, clear: true },
      'the band does not carry the whole selection register'
    );
    assert.deepEqual(
      selected.rowHolds,
      { pageBox: false, count: false, results: false, clear: false },
      'the filter row still carries selection controls, so its composition still depends on ' +
        'selection state — which is exactly what `proto:1970` does not do'
    );

    // 4 · THE TWO TEXT ACTIONS ARE AT THE TRAILING EDGE.
    const edges = selected.band.edges;
    assert.ok(
      Boolean(edges.hint && edges.results && edges.clear && edges.band),
      'the band is missing the hint, the results link or Clear, so the arrangement below is not ' +
        'the state this clause measures'
    );
    const bandWidth = edges.band.right - edges.band.left;
    const leadingGap = edges.results.left - edges.hint.right;
    const pairGap = edges.clear.left - edges.results.right;
    assert.ok(
      leadingGap > bandWidth / 4,
      `the gap between the hint and \`Select all\` is ${leadingGap}px of a ${bandWidth}px band: ` +
        'the link is still sitting against the hint rather than at the trailing edge'
    );
    assert.ok(
      pairGap < leadingGap,
      `\`Select all\` and \`Clear\` are ${pairGap}px apart against a ${leadingGap}px leading gap, ` +
        'so the free space is SPLIT between two auto margins rather than sitting ahead of the pair'
    );

    // 5 · AND THE ROW IS THE SAME ROW. The item count and the search field's rendered width are
    // the two things round 3 moved, so they are the two things pinned: a 150px field under a
    // selection and a full-width one at rest is the state this replaces.
    assert.equal(
      selected.itemCount,
      resting.itemCount,
      `the filter row holds ${selected.itemCount} items selected against ${resting.itemCount} ` +
        'at rest, so selecting rows still changes what is in it'
    );
    assert.ok(
      resting.searchWidth > 0,
      'the resting search field measured no width, so the comparison below asserts nothing'
    );
    assert.ok(
      Math.abs(selected.searchWidth - resting.searchWidth) <= EPSILON_PX,
      `the search field is ${selected.searchWidth}px under a selection against ` +
        `${resting.searchWidth}px at rest: the row still yields its only flexible item to a ` +
        'state change'
    );
  });

  it('STACKS the inspector under the list below the threshold', async () => {
    const box = await measureAt(NARROW_WINDOW_PX);
    assert.equal(box.inspectorRendered, true);
    assert.ok(
      box.containerWidth <= THRESHOLD_PX,
      `the container measured ${box.containerWidth}px, which is NOT at or below the ` +
        `${THRESHOLD_PX}px threshold — raising the threshold above every tested width is the ` +
        'mutation this pair exists to catch'
    );
    assert.ok(
      box.inspectorTop >= box.columnBottom - EPSILON_PX,
      `the inspector's top is ${box.inspectorTop} but the list column ends at ${box.columnBottom}`
    );
    assert.ok(
      box.inspectorWidth > INSPECTOR_PX + EPSILON_PX,
      `stacked, the inspector takes the whole column; it measured ${box.inspectorWidth}px against ` +
        `a frame of ${box.frameWidth}px`
    );
  });
});

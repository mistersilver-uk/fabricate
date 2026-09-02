/*
 * THE SCOPED CATALOGUE'S INSPECTOR COLUMN, MEASURED ON BOTH SIDES OF ITS CONTAINER QUERY
 * (issue 1380, epic 1357).
 *
 * ── WHY THIS IS NOT A MOUNTED TEST ────────────────────────────────────────────────────────────
 * happy-dom computes no cascade and no layout, so a mounted suite can state that the inspector
 * EXISTS but never that it sits beside the list at 300px, and never that it stacks under the list
 * when the column narrows. A container query is exactly the kind of rule a source read cannot
 * evaluate: `@container (max-width: 760px)` is answered by the layout engine or by nothing.
 *
 * ── A ONE-WIDTH HARNESS REPORTS A BREAKPOINT THAT IS NOT THERE ────────────────────────────────
 * Both sides are measured, at REAL manager column widths, and the container's own width is
 * asserted to be on the expected side of the threshold before either geometry assertion runs. A
 * harness sized so that both cases land on one side of the query passes whatever the rule says —
 * including a rule that was deleted.
 *
 * ── THE MARKUP IS THE PRODUCT'S ───────────────────────────────────────────────────────────────
 * The shell is mounted through `createMountedComponentHarness` and its real rendered `innerHTML`
 * is shipped into Chromium, so deleting the inspector region from the frame empties this gate's
 * markup and it fails on the spot rather than measuring a fixture nothing renders. The two
 * stylesheets are both load-bearing and in opposite directions: `.manager-body`'s grid and the
 * `manager-scoped-list-*` row rules are in the global sheet, while the frame's grid tracks and
 * its container query live in its scoped `<style>` and appear nowhere in that file.
 *
 * ── THE WRAPPER LEVELS ARE THE SHIPPED ONES ───────────────────────────────────────────────────
 * All seven world scoped routes are classified `full-width-2-track`, so `.manager-body` is a
 * 220px rail plus `main` and the shared aside is suppressed. The two probe widths below are the
 * whole window; `main` is what is left after the rail, and that is what the frame's container
 * query actually measures.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL = 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte';
const FRAME = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';

const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const frameCss = scopedComponentCss(resolve(repoRoot, FRAME));
const shellCss = scopedComponentCss(resolve(repoRoot, SHELL));
/**
 * The selection band's own children (issue 1373, maintainer feedback round 4).
 *
 * `BulkSelectionToolbar` paints the count, the standing hint and the two text actions in its OWN
 * scoped block, and the band case below measures where those actions sit. Without this sheet the
 * band renders as unstyled text runs and the case would measure a layout no build produces.
 */
const selectionToolbarCss = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte')
);

/** The threshold the frame declares. Read from its source so the two cannot drift apart. */
const THRESHOLD_PX = Number(
  /@container \(max-width: (\d+)px\)/.exec(readFileSync(resolve(repoRoot, FRAME), 'utf8'))?.[1]
);
/** The manager rail's width, which `main` does not get. */
const RAIL_PX = 220;
/** The inspector column's declared width, matching the shared aside it stands in for. */
const INSPECTOR_PX = 300;
/** Sub-pixel tolerance; every defect this catches moves an edge by hundreds of pixels. */
const EPSILON_PX = 1;
/**
 * MORE ROWS THAN THE VIEWPORT HOLDS, and the count is load-bearing.
 *
 * This fixture rendered four rows, which is short enough that the whole column fits the viewport
 * — and a frame that never passes its height down is indistinguishable from one that does when
 * nothing overflows. At 25 the list is taller than the window, which is the ordinary case for a
 * world catalogue and the only one in which "the inspector is a bounded, scrollable column"
 * differs from "the inspector is a panel spanning the whole scroll region".
 *
 * IT IS NO LONGER ONE PAGE, and the fixture therefore DRIVES the size control to show all of it
 * (issue 1373, maintainer feedback round 2). The default window is ten rows now — an eleven-row
 * catalogue has to draw a pager, which a twenty-five-row window made impossible — so twenty-five
 * entities render ten rows and about 712px inside a 900px host, and the overflow every case below
 * measures simply is not there. The probe does what a GM does: opens the corpus, then picks the
 * bigger page size. Its own precondition assertion is what would catch this drifting again.
 */
const ROW_COUNT = 25;
/** The size the tall fixture is driven to, so all {@link ROW_COUNT} rows render at once. */
const TALL_PAGE_SIZE = 25;
/** The manager host's height, so the column has a definite one to be bounded by. */
const HOST_HEIGHT_PX = 900;
/**
 * A TALLER host for the short-but-multi-page probe, and the extra height is load-bearing.
 *
 * The foot pager renders only past one page since issue 1372, so the only fixture that draws one
 * AND leaves the column any slack is a list of more than one page whose FIRST page is short. The
 * smallest page size the pager offers is ten rows, which is around 500px of list — enough to fill
 * a 900px column once the toolbar and the pager are on it, and a fixture with no slack proves
 * nothing about who takes it. Every case below asserts its own slack precondition before
 * measuring, so a wrong value here reds rather than passing quietly.
 */
const TALL_HOST_HEIGHT_PX = 1400;
/** Entities in the short-but-multi-page fixture: more than one default page, driven down to ten. */
const PAGED_ROW_COUNT = 26;
/** The page size that probe is driven to, which is `Pagination`'s smallest offered option. */
const PAGED_PAGE_SIZE = 10;

// Two REAL window widths, one comfortably either side of the threshold once the rail is taken
// off. Asserted against the measured container width below rather than assumed.
const WIDE_WINDOW_PX = 1400;
const NARROW_WINDOW_PX = 900;

/**
 * The window the world catalogues are photographed at, and the width the toolbar case below
 * measures (issue 1373, maintainer feedback round 3).
 *
 * NOT {@link WIDE_WINDOW_PX}. A 1400px window gives the list column about 120px more than the
 * lab's, which is enough slack to hide a wrapping toolbar entirely — so a case measured only
 * there would report a single row while the published frame showed two. This is the View Lab's
 * own `position.width` for every `world-tool-catalogue-*` case.
 */
const CATALOGUE_WINDOW_PX = 1280;
/** The world Tools Catalogue's own corpus size: eleven records over a ten-row page. */
const SELECTION_ROW_COUNT = 11;
/** Rows ticked, matching the maintainer's own reproduction and the `-bulk` lab case. */
const SELECTION_TICKS = 4;
/** The world catalogues' short select-all caption, which both of them pass. */
const SELECT_ALL_SHORT = 'All';

const laneInspectorBody = createRawSnippet(() => ({
  render: () => `<p data-lane-inspector-body>The lane's own panel.</p>`,
}));

/**
 * A lane's `bulk` panel, standing in for `ToolCatalogueBulkPanel` (issue 1373, round 4).
 *
 * The selection fixture needs one because the band's standing hint — `Bulk actions are in the
 * inspector →` — is rendered only for `bulk && inspectorBody`, which is the frame refusing to
 * point at a rail that is not carrying a bulk panel. Without it the band draws its count and its
 * two actions and the case measures a narrower register than the screen ships.
 */
const laneBulkBody = createRawSnippet(() => ({
  render: () => `<p data-lane-bulk-body>The lane's own bulk panel.</p>`,
}));

/**
 * A lane's `listLead`, standing in for the world Tool catalogue's create-from-drop zone.
 *
 * Deliberately a plain block with a stated height rather than the real `ItemDropZone`: what the
 * case below measures is the SEPARATION the frame gives whatever a lane puts there, and a fixture
 * that composed the real zone would be measuring that component's own margins as well.
 */
const laneListLead = createRawSnippet(() => ({
  render: () => `<div data-lane-list-lead style="height:60px">Drop zone</div>`,
}));

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-list-geometry-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/toolScope.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/scopedDefinitionStore.js',
    'src/migration/worldScopeEntityGrouping.js',
    'src/utils/definitionIndex.js',
    'src/utils/sourceReferenceUnion.js',
    'src/utils/browserPagination.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/scopedEntityListModel.js',
    // The frame's lifted view-state (issue 1438).
    'src/utils/managerBrowserViewState.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    FRAME,
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    // The shared frame's membership filter is a segmented track since issue 1373.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    SHELL,
  ],
  componentPath: SHELL,
});

function page(productMarkup, windowWidth, hostHeight = HOST_HEIGHT_PX) {
  // ── THE MODULE SHEET IS LAYERED AND THE COMPONENT SHEETS ARE NOT ─────────────────────────────
  // `module.json` registers `styles/fabricate.css` with no explicit `layer`, and Foundry imports
  // an unlayered module stylesheet at `layer(modules)` — `tests/view-lab/cascade.css` reproduces
  // that verbatim and is the reference for it. A Svelte scoped block is injected as an ordinary
  // unlayered `<style>` at runtime, and an unlayered declaration beats a layered one WHATEVER the
  // specificity.
  //
  // This harness used to load all four sheets flat, which inverts that for every pair where the
  // two files touch the same property: a rule in the global sheet that production never applies
  // measured here as if it did. That is not hypothetical — it is exactly how a `margin-left` moved
  // in this sheet passed a browser measurement and then did nothing in the lab (issue 1373,
  // maintainer feedback round 4). The wrapper is one line and it makes this page's cascade the
  // shipped one.
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>@layer modules { ${fabricateCss} }</style>
    <style>${frameCss.css}</style>
    <style>${shellCss.css}</style>
    <style>${selectionToolbarCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${windowWidth}px; height: ${hostHeight}px; }
    </style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark"
             data-manager-view="world-components">
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
    // The height chain. `frameHeight` is what `.manager-main` handed down; `inspectorHeight` is
    // what the inspector took. They diverge by the whole overflow when the frame is a block box.
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
  let shortMarkup = '';
  let shortPagedMarkup = '';
  let leadMarkup = '';
  let selectionMarkup = '';
  let selectionRestingMarkup = '';

  before(async () => {
    assert.ok(
      Number.isFinite(THRESHOLD_PX) && THRESHOLD_PX > 0,
      'the frame declares no `@container (max-width: Npx)` rule, so this whole gate measures ' +
        'a breakpoint that does not exist'
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
    // DRIVEN TO A SIZE THAT SHOWS THE WHOLE CORPUS. See `ROW_COUNT`: at the ten-row default this
    // fixture renders one short page and nothing overflows, so the bounded-column assertions
    // below would all be measuring a column that never needed bounding.
    const tallSizeSelect = target.querySelector(
      '.manager-scoped-list-column [data-pagination-size]'
    );
    assert.ok(
      Boolean(tallSizeSelect),
      `a ${ROW_COUNT}-entity corpus rendered no page-size control in the list column, so this ` +
        'fixture cannot be driven onto one page and the overflow below is unreachable'
    );
    tallSizeSelect.value = String(TALL_PAGE_SIZE);
    tallSizeSelect.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
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

    // THE SHORT-BUT-MULTI-PAGE FIXTURE, built by DRIVING the control rather than by a prop: the
    // frame owns its own page size and exposes no way in, so the probe does what a GM does —
    // opens a corpus that pages, then picks the smallest size. Twenty-six entities is three pages
    // at the ten-row default, which is what makes the size selector reachable at all.
    //
    // The drive is IDEMPOTENT since the default window became ten (issue 1373, feedback round 2)
    // and is kept rather than deleted: it states the size this case's arithmetic depends on, and
    // it is what would keep this fixture at ten rows if the default moved again.
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
    sizeSelect.value = String(PAGED_PAGE_SIZE);
    sizeSelect.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    await harness.setProps({});
    shortPagedMarkup = pagedTarget.innerHTML;

    // ── THE SELECTION FIXTURE (issue 1373, maintainer feedback round 3) ──────────────────────
    // The toolbar the maintainer photographed: a world catalogue's own configuration — no
    // membership filter and the short `All` caption — over eleven records with four ticked, at
    // the lab's own window width. In that state the row carries four MORE controls than at rest
    // (the divider, `4 selected`, `Select all 11 results` and `Clear`), and the shipped row wrapped
    // `Asc` onto a second line by itself with the result count stranded beside it.
    //
    // Driven by ticking real boxes rather than by a prop, because selection is the frame's own
    // state and it exposes no way in — the same reason the paged fixture drives its size select.
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

  async function measureUnavailable(windowWidth) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: HOST_HEIGHT_PX },
    });
    const tab = await context.newPage();
    await tab.setContent(page(unavailableMarkup, windowWidth));
    const result = await tab.evaluate(() => {
      const layout = document.querySelector('.manager-scoped-list-layout');
      const callout = document.querySelector('[data-scoped-list-state="unavailable"]');
      if (!layout || !callout) return { rendered: false };
      return {
        rendered: true,
        layoutRight: layout.getBoundingClientRect().right,
        calloutRight: callout.getBoundingClientRect().right,
        columns: getComputedStyle(layout).gridTemplateColumns,
      };
    });
    await context.close();
    return result;
  }

  /**
   * Measure one short-list probe's column.
   *
   * `.manager-pagination` is resolved INSIDE `.manager-scoped-list-column`, never from the
   * document. The catalogue shell's inspector renders its OWN persistent pager over the system
   * list, so a document-wide lookup silently answers about the inspector's pager the moment the
   * foot one is absent — which is exactly the state this file now measures.
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
      const pagination = column.querySelector('.manager-pagination');
      return {
        rendered: true,
        hasPagination: Boolean(pagination),
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
   * ── WHY THE ROW'S HEIGHT IS THE ASSERTION AND ITEM TOPS ARE ONLY DIAGNOSTICS ──────────────
   * The row is `align-items: center`, so every item on one line has a different `top` — a
   * 34px search field and a 16px divider centred together share a line and differ by 9px at
   * the top edge. Counting distinct tops therefore reports several "lines" for a row that has
   * exactly one. A single-line flex row is as tall as its tallest item; a wrapped one is the
   * sum of its lines plus the row gap, which on this row is a ~40px step. So the height
   * against the tallest item is the claim, and the per-item centres are carried alongside it
   * purely so a failure says WHICH control fell through.
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
      const search = row.querySelector('.manager-search');
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
        // The register's four controls, asked for on BOTH sides of the boundary: "the band holds
        // them" and "the filter row does not" are two different claims and a construction that
        // renders them in both places satisfies only the first.
        rowHolds: holds(row),
        band: {
          rendered: Boolean(band),
          display: bandStyle ? bandStyle.display : '',
          // A `display: contents` box has no geometry at all, so every number below is zero for
          // the flattened construction — which is what makes "the band is a box under the row"
          // fail loudly rather than measure a phantom.
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
    //
    // The cost is the affordance, not a scrollbar: with the aside spanning the entire scroll
    // region it is never out of view, so `inspect()`'s focus call scrolls the page by a pixel
    // and the identity header, the inheriting-system counts and every Add / Remove / Enable
    // control stay about a thousand pixels above the fold. The `.is-selected` ring on the row is
    // the only feedback a GM gets.
    //
    // Four rows fit the viewport, so none of that is visible to a short fixture. This asserts
    // the overflow EXISTS first, for exactly that reason.
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
    // The unavailable branch renders ONE callout and no inspector, so a two-track grid there
    // paints a 300px void beside a warning. Measured before the fix: the layout was
    // `836px 300px` and the callout stopped 312px short of the frame's right edge.
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

  it('gives the ROWS REGION the slack on a short list rather than sizing it to its content', async () => {
    // WHAT THE ROWS REGION'S `flex: 1 1 auto` ACTUALLY BUYS, measured rather than assumed. With
    // a list taller than the column every child is shrinking, so the declaration changes nothing
    // and the overflow case above cannot see it — it survived a mutation run for exactly that
    // reason. Its effect appears on a SHORT list: without it the rows region is content-sized and
    // whatever sits under it rides directly beneath the last row, moving up and down the screen
    // as a filter changes how many rows there are.
    //
    // THIS FIXTURE DRAWS NO PAGER AT ALL since issue 1372 — one row is one page — so the claim is
    // stated about the region itself: it reaches the foot of the column while the LIST inside it
    // stops far short. That is the same declaration, read without needing something below it.
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
    // `.manager-scoped-list-column > :global(.manager-pagination) { flex: 0 0 auto }` is ungated
    // by the assertion above, because a pager that fills the column also ends at the column's
    // foot. The slack belongs to the rows region — that is what puts the footer at the bottom
    // rather than making the footer tall — so it is stated separately.
    //
    // IT IS BOUNDED AGAINST A ROW, and that is a correction rather than a flourish. This was
    // `rowsHeight > paginationHeight * 2`, which on this fixture PASSES the very mutation it was
    // written for: with both children growing they split the slack, and 976px of rows against a
    // 309px pager clears that bound comfortably while the pager is seven times its own content
    // height. A row is the fixture's own measure of what one line of this list costs, so "the
    // pager is chrome, not as tall as a row and a half" is a claim about the pager itself —
    // measured at 45px against a 71px row, and at 309px under the mutation.
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
    //
    // The search field is the control that yields: it is the only flexible item in the row, and
    // shrinking it changes nothing at rest — with one grow-able item the final width is the
    // container minus everything else, whatever the basis is. The basis only decides where the
    // row BREAKS.
    const box = await measureToolbarLines(selectionMarkup, CATALOGUE_WINDOW_PX);
    assert.equal(box.rendered, true, 'the selection fixture rendered no list filter row');
    // THE PRECONDITION IS NOW THE SELECTION ITSELF, not a count of items in this row (issue
    // 1373, round 4). Round 3 kept the register flattened into the filter row and asserted at
    // least nine flex items here; the register is its own band now, so the row is back to its
    // resting five and a nine-item floor would fail on the fix rather than on the defect. What
    // still has to be true for this case to mean anything is that a selection is ACTIVE — which
    // the band renders, and the sibling case below measures.
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
    //
    // So the row never changes composition and never needs to yield anything. That is two
    // claims, and both are measured against the SAME MOUNT at rest and selected: a selected-only
    // measurement can say the row fits and still be describing a row that grew and shrank.
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

    // 3 · THE REGISTER MOVED, rather than being drawn twice. Both halves are asserted: a
    // construction that renders the count in the band AND leaves it in the row satisfies the
    // first clause alone.
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

    // 4 · THE TWO TEXT ACTIONS ARE AT THE TRAILING EDGE, TOGETHER. `proto:595`-`596` puts the
    // auto margin on `Select all N results` with `Clear` directly after it; the shipped primitive
    // puts it on `Clear` alone, which in a band carrying the standing hint leaves the link jammed
    // against that sentence with the whole gap after it.
    //
    // MEASURED AS THREE EDGES, because the pixel number a `margin-left: auto` reports is
    // plausible under every wrong arrangement: put the auto margin on BOTH and the gap splits in
    // half, which is a real number in the right units that looks like nothing is wrong. The claim
    // is the ORDER of the gaps — a wide one before the link, a hairline one between the link and
    // `Clear` — checked against the band's own width so a narrow band cannot satisfy it by having
    // no gap anywhere.
    //
    // IT IS ALSO THE CLAUSE THAT ANSWERS FOR THE CASCADE. This grouping lives in
    // `BulkSelectionToolbar`'s scoped block rather than in `styles/fabricate.css`, because that
    // sheet ships at `layer(modules)` and loses to an unlayered component rule whatever its
    // specificity. `page()` above layers the sheet for exactly that reason, so an attempt to move
    // this back into the global sheet fails here instead of passing and doing nothing.
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

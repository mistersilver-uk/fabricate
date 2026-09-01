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
 * A FULL DEFAULT PAGE OF ROWS, and the count is load-bearing.
 *
 * This fixture rendered four rows, which is short enough that the whole column fits the viewport
 * — and a frame that never passes its height down is indistinguishable from one that does when
 * nothing overflows. At 25 the list is taller than the window, which is the ordinary case for a
 * world catalogue and the only one in which "the inspector is a bounded, scrollable column"
 * differs from "the inspector is a panel spanning the whole scroll region".
 */
const ROW_COUNT = 25;
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

const laneInspectorBody = createRawSnippet(() => ({
  render: () => `<p data-lane-inspector-body>The lane's own panel.</p>`,
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
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    FRAME,
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    SHELL,
  ],
  componentPath: SHELL,
});

function page(productMarkup, windowWidth, hostHeight = HOST_HEIGHT_PX) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${frameCss.css}</style>
    <style>${shellCss.css}</style>
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

    // THE SHORT-BUT-MULTI-PAGE FIXTURE, built by DRIVING the control rather than by a prop: the
    // frame owns its own page size and exposes no way in, so the probe does what a GM does —
    // opens a corpus that pages, then picks the smallest size. Twenty-six entities is two default
    // pages, which is what makes the size selector reachable at all; at ten a page it is three.
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

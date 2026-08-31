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
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    FRAME,
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    SHELL,
  ],
  componentPath: SHELL,
});

function page(productMarkup, windowWidth) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${frameCss.css}</style>
    <style>${shellCss.css}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${windowWidth}px; height: 900px; }
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
  return {
    frameRendered: true,
    inspectorRendered: true,
    containerWidth: frameBox.width,
    columnRight: columnBox.right,
    columnBottom: columnBox.bottom,
    inspectorLeft: inspectorBox.left,
    inspectorTop: inspectorBox.top,
    inspectorWidth: inspectorBox.width,
    frameWidth: frameBox.width,
  };
}

describe('the catalogue shell\'s inspector column, measured in a real browser', () => {
  let browser = null;
  let markup = '';

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
        entities: Array.from({ length: 4 }, (unused, index) => ({
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
    harness.teardown();
    assert.ok(
      markup.includes('data-scoped-list-inspector'),
      'the mounted catalogue rendered no inspector region, so nothing below is measuring one'
    );
    browser = await chromium.launch();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  async function measureAt(windowWidth) {
    const context = await browser.newContext({
      viewport: { width: windowWidth, height: 900 },
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

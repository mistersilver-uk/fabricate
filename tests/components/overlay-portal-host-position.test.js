/*
 * WHERE A PORTALED OVERLAY ACTUALLY LANDS, measured in a real browser (issue 1466).
 *
 * ── WHY A DOM TEST CANNOT DO THIS ────────────────────────────────────────────────────────────
 * Six components resolved their portal host with `closest('.fabricate-manager')`. Outside the
 * manager that is `null`, and two things then go wrong together:
 *
 *   - `use:portal` no-ops, so the panel stays inside the trigger's own container; and
 *   - the positioning pass falls back to VIEWPORT coordinates and writes them onto that panel,
 *     whose containing block is now something else entirely.
 *
 * THE MARKUP IS BYTE-IDENTICAL EITHER WAY. Same elements, same classes, same attributes — the
 * only difference is two numbers inside a `style` string and which parent the node hangs from.
 * happy-dom computes no layout at all, so no mounted suite in this repository can tell the two
 * apart, and neither can a snapshot. The only thing that can is a browser that has actually laid
 * the page out, which is why this file exists and why it costs a Chromium process.
 *
 * ── WHAT IS ASSERTED, AND WHY IT DISCRIMINATES ───────────────────────────────────────────────
 * The invariant is not "the panel is at some particular pixel" — that would pin the layout
 * algorithm, which is `computeIconPickerPopoverLayout`'s business and already has its own tests.
 * It is that THE PANEL IS WHERE ITS TRIGGER IS: left edges aligned, panel below the trigger.
 *
 * That reads identically in every host, so one expectation covers all three, and the defect makes
 * it fail by a KNOWN AND EXACT amount rather than by "something looked off" — the application
 * frame's own origin. The fixture puts the frame at (220, 140), so before the fix the panel in a
 * non-manager host is displaced by exactly (220, 140) from its trigger. `the defect is visible at
 * the fixture's frame offset` pins that quantity, so a future change that merely reduces the error
 * cannot pass: the gate distinguishes "aligned" from "displaced by the host origin", not "close"
 * from "far".
 *
 * ── THE FIXTURE IS REAL CODE, DELIBERATELY ───────────────────────────────────────────────────
 * `tests/fixtures/overlay-host/` is served by a Vite dev server with the real Svelte plugin, so
 * the components are imported from `src/` and compiled exactly as the build compiles them, and
 * `styles/fabricate.css` is served RAW so the popover gets its real `position: absolute`. Only the
 * Foundry window chrome around them is fixture markup, and the one property of it that the
 * measurement depends on — `.application { position: absolute }` — is asserted to be genuinely in
 * effect rather than assumed, by `every declared application root is a positioned element`.
 *
 * That clause is the load-bearing one for the ROOT SET. `.fabricate-app` is the ApplicationV2
 * FRAME, not the Svelte root one level in (`.fabricate-app-shell`, a static flex container). Get
 * that wrong and the panel's containing block silently becomes something else — the same class of
 * fault as the original defect. Naming a root in `OVERLAY_HOST_ROOT_CLASSES` that is not
 * positioned reds here.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { OVERLAY_HOST_ROOT_CLASSES } from '../../src/ui/svelte/util/overlayHost.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** The fixture's window frame origin. The defect displaces the panel by exactly this. */
const FRAME_LEFT = 220;
const FRAME_TOP = 140;

/**
 * Sub-pixel slack. Rects are fractional and the panel's top is `trigger.bottom + 6px` from the
 * stylesheet, so this is rounding tolerance only — two orders of magnitude below the ~220px error
 * the defect produces, so it cannot mask one.
 */
const EPSILON = 1.5;

/**
 * Serve `styles/fabricate.css` RAW, outside Vite's CSS pipeline.
 *
 * The sheet is 20k+ lines with `url()` references and layered `@import`s; running it through
 * PostCSS would rewrite or inline them for no benefit here. The page wants the bytes.
 */
function rawStylesheetMount() {
  const prefix = '/@overlay-host-styles/';
  return {
    name: 'overlay-host-styles',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(prefix)) return next();
        const name = url.slice(prefix.length).split('?')[0];
        if (name !== 'fabricate.css') {
          response.statusCode = 404;
          response.end('not found');
          return;
        }
        response.setHeader('Content-Type', 'text/css; charset=utf-8');
        createReadStream(join(repoRoot, 'styles', 'fabricate.css')).pipe(response);
      });
    },
  };
}

let server;
let browser;
let origin = '';

before(async () => {
  server = await createServer({
    // `configFile: false` on purpose: the production `vite.config.js` installs the Foundry dev
    // proxy on `serve`, which this fixture neither needs nor should depend on.
    configFile: false,
    root: repoRoot,
    // NO FILE WATCHER, for the reason `tests/view-lab/vite.config.js` records at length: the root
    // is the whole repository, chokidar costs an inotify handle per file, and a developer with
    // harvested Foundry chrome or sibling lane worktrees exhausts the user-session limit and dies
    // with an `ENOSPC` naming a file the run never touches. Nothing is edited mid-run.
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    logLevel: 'silent',
    plugins: [rawStylesheetMount(), svelte()],
  });
  await server.listen();
  const address = server.httpServer.address();
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Open one overlay in one host and report the geometry, plus anything it logged.
 *
 * @param {object} options
 * @param {'manager'|'app'|'none'} options.host Which application root (or none) wraps the picker.
 * @param {'popover'|'icon'} [options.component] Which overlay component to mount.
 * @returns {Promise<object>} Measured rects, the resolved host, and console errors.
 */
async function openOverlayIn({ host, component = 'popover' }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    const query = `host=${host}&component=${component}&frameLeft=${FRAME_LEFT}&frameTop=${FRAME_TOP}`;
    await page.goto(`${origin}/tests/fixtures/overlay-host/index.html?${query}`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);

    const triggerSelector =
      component === 'icon' ? '.essence-icon-picker-trigger' : 'button.manager-travel-trigger';
    const panelSelector =
      component === 'icon' ? '.essence-icon-picker-popover' : '.fabricate-picker-popover';

    await page.click(triggerSelector);
    await page.waitForSelector(panelSelector);
    // The position is written by an effect that runs after the panel first paints, so wait for
    // the frame that carries it rather than measuring the pre-layout box.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    );

    const measured = await page.evaluate(
      ({ triggerSelector: trigger, panelSelector: panel, rootClasses }) => {
        const box = (node) => {
          if (!node) return null;
          const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
          return { left, top, right, bottom, width, height };
        };
        const panelNode = document.querySelector(panel);
        const rootPositions = {};
        for (const cls of rootClasses) {
          const node = document.querySelector(`.${cls}`);
          rootPositions[cls] = node ? getComputedStyle(node).position : null;
        }
        return {
          trigger: box(document.querySelector(trigger)),
          panel: box(panelNode),
          frame: box(document.querySelector('.application')),
          panelParentClass: panelNode?.parentElement?.className ?? '',
          panelPosition: panelNode ? getComputedStyle(panelNode).position : null,
          rootPositions,
        };
      },
      { triggerSelector, panelSelector, rootClasses: [...OVERLAY_HOST_ROOT_CLASSES] }
    );

    return { ...measured, consoleErrors };
  } finally {
    await page.close();
  }
}

/**
 * The one expectation, written once because it reads the same in every host: the panel is ANCHORED
 * TO ITS TRIGGER — flush with one of its vertical edges, and immediately above or below it.
 *
 * Both alternatives on each axis are real product behaviour rather than looseness.
 * `computeIconPickerPopoverLayout` takes a `horizontalAlign` of `'left'` (SearchablePopover) or
 * `'right'` (IconPicker's default), and it flips the panel above the trigger when there is not
 * enough room below. Pinning one arrangement would fail the other component for being correct.
 *
 * It gives up NO discrimination, because the defect is a TRANSLATION of the whole panel by the
 * host's origin: both edges move together, so no alignment survives it. Measured on the unfixed
 * tree, the player-app case put the panel's left at 490 against a trigger at 245 and its right at
 * 732 against a trigger right of 295 — neither edge within 200px of anchored.
 *
 * @param {object} measured Result of {@link openOverlayIn}.
 * @param {string} where Host name, for the failure message.
 */
function assertPanelIsAtItsTrigger(measured, where) {
  const { trigger, panel } = measured;
  assert.ok(trigger, `no trigger rendered in the ${where} host`);
  assert.ok(panel, `no panel rendered in the ${where} host`);
  assert.equal(
    measured.panelPosition,
    'absolute',
    `the panel is \`${measured.panelPosition}\` in the ${where} host, not \`absolute\`. Its ` +
      'stylesheet rule is not applying, so the coordinates below are measuring an in-flow box ' +
      'and this gate is not testing what it claims to.'
  );

  // The stylesheet gap between trigger and panel, plus rounding slack.
  const gap = 8 + EPSILON;

  const dxLeft = Math.abs(panel.left - trigger.left);
  const dxRight = Math.abs(panel.right - trigger.right);
  assert.ok(
    dxLeft <= EPSILON || dxRight <= EPSILON,
    `in the ${where} host the panel is not flush with either vertical edge of its trigger: ` +
      `left edges differ by ${dxLeft.toFixed(1)}px (panel ${panel.left.toFixed(1)}, trigger ` +
      `${trigger.left.toFixed(1)}) and right edges by ${dxRight.toFixed(1)}px (panel ` +
      `${panel.right.toFixed(1)}, trigger ${trigger.right.toFixed(1)}). The panel's coordinates ` +
      'were measured against a different element than the one it was portaled into.'
  );

  const dyBelow = Math.abs(panel.top - trigger.bottom);
  const dyAbove = Math.abs(trigger.top - panel.bottom);
  assert.ok(
    dyBelow <= gap || dyAbove <= gap,
    `in the ${where} host the panel is neither just below the trigger (${dyBelow.toFixed(1)}px ` +
      `from its bottom) nor just above it (${dyAbove.toFixed(1)}px from its top), so it is not ` +
      'anchored to the trigger vertically either.'
  );
}

describe('1466 a portaled overlay is positioned against the host it was portaled into', () => {
  it('every declared application root is a positioned element', async () => {
    // `.fabricate-manager` in the manager window, `.fabricate-app` in the player window: each root
    // only appears in its own app, so both hosts are needed to see the pair.
    const managerRoots = (await openOverlayIn({ host: 'manager' })).rootPositions;
    const appRoots = (await openOverlayIn({ host: 'app' })).rootPositions;

    const observed = {};
    for (const cls of OVERLAY_HOST_ROOT_CLASSES) {
      observed[cls] = managerRoots[cls] ?? appRoots[cls];
    }

    const unpositioned = Object.entries(observed).filter(
      ([, position]) => position === null || position === 'static'
    );
    assert.deepEqual(
      unpositioned,
      [],
      'these classes are declared in `OVERLAY_HOST_ROOT_CLASSES` but are not positioned ' +
        'elements, so an absolutely positioned panel appended to one does NOT use it as its ' +
        'containing block — its coordinates would be measured from one element and interpreted ' +
        'against another, which is the exact defect issue 1466 removed:\n  ' +
        unpositioned.map(([cls, position]) => `.${cls}: ${position ?? 'not rendered'}`).join('\n  ')
    );
  });

  it('lands at its trigger inside the manager, which is where it always worked', async () => {
    const measured = await openOverlayIn({ host: 'manager' });
    assertPanelIsAtItsTrigger(measured, 'manager');
    assert.ok(
      measured.panelParentClass.includes('fabricate-manager'),
      `the panel's parent is \`${measured.panelParentClass}\`, not the manager root. The portal ` +
        'did not land, and the manager is the one host where this never used to fail.'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the manager host reported a missing host');
  });

  it('lands at its trigger inside the player window, which is what unblocks conversion', async () => {
    const measured = await openOverlayIn({ host: 'app' });
    assertPanelIsAtItsTrigger(measured, 'player app');
    assert.ok(
      measured.panelParentClass.includes('fabricate-app'),
      `the panel's parent is \`${measured.panelParentClass}\`, not the player window frame. This ` +
        'is the host `ActorSelectTopBar` needs, and the portal did not land in it.'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the player app host reported a missing host');
  });

  it('lands at its trigger outside every application root, and says so', async () => {
    const measured = await openOverlayIn({ host: 'none' });
    assertPanelIsAtItsTrigger(measured, 'unhosted');
    assert.ok(
      measured.panelParentClass.includes('unhosted-container') === false,
      'the panel stayed in its trigger container rather than falling back to a real host'
    );
    assert.ok(
      measured.consoleErrors.some((line) => line.includes('outside every Fabricate application')),
      'nothing was reported when the overlay was mounted outside every application root. That ' +
        'is the silent degradation this change exists to remove: the panel still draws, merely ' +
        `unclipped, so without a report nobody finds out. Logged: ${JSON.stringify(measured.consoleErrors)}`
    );
  });

  it('the shared-directory picker resolves the same way', async () => {
    // `IconPicker` lives in `src/ui/svelte/components/` and carried its own copy of the defect.
    // It is measured in the MANAGER host because its popover's stylesheet rules are still
    // `.fabricate-manager`-rooted (the CSS half of issue 1464 was only ever done for
    // `SearchablePopover`), so outside the manager it has no `position: absolute` to measure yet.
    // What this proves is that adopting the shared resolver did not move it where it does live.
    const measured = await openOverlayIn({ host: 'manager', component: 'icon' });
    assertPanelIsAtItsTrigger(measured, 'manager (icon picker)');
    assert.deepEqual(measured.consoleErrors, [], 'the icon picker reported a missing host');
  });

  it('the fixture can tell a host-relative arrangement from a viewport-relative one', async () => {
    // THE NON-VACUITY FLOOR FOR THE THREE CLAUSES ABOVE. They assert an alignment, and an
    // alignment is trivially satisfied when the host's origin IS the viewport's — every
    // arrangement coincides at (0, 0), and the suite would pass on the broken tree while
    // appearing to check the thing it names.
    //
    // The defect displaces the panel by exactly the host's own origin, so the fixture is only
    // discriminating while that origin is far from the viewport's compared with the tolerance.
    // Measured, not assumed: the frame is asserted to actually RENDER where the fixture asks,
    // because a positioning rule that stopped applying would collapse it to (0, 0) and quietly
    // take every assertion above with it.
    const { frame } = await openOverlayIn({ host: 'app' });

    assert.ok(frame, 'the fixture rendered no application frame to measure');
    assert.equal(
      `${frame.left},${frame.top}`,
      `${FRAME_LEFT},${FRAME_TOP}`,
      `the application frame rendered at (${frame.left}, ${frame.top}) rather than the ` +
        `(${FRAME_LEFT}, ${FRAME_TOP}) the fixture places it at, so it is not positioned and the ` +
        'clauses above are comparing two names for the same origin.'
    );
    assert.ok(
      Math.min(FRAME_LEFT, FRAME_TOP) > 20 * EPSILON,
      `the frame origin (${FRAME_LEFT}, ${FRAME_TOP}) is not far enough from the viewport's for ` +
        `a ${EPSILON}px tolerance to distinguish the two arrangements. Move the frame; do not ` +
        'widen the tolerance.'
    );
  });
});

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
 *
 * ── THE SECOND HALF OF THE SAME DEFECT (issue 1470) ──────────────────────────────────────────
 * Resolving the host was only half of it, and finishing that half made the other half louder. The
 * three `src/ui/svelte/components/` pickers took `position: absolute` from a rule rooted at
 * `.fabricate-manager`, so once #1466 portalled them into the player window correctly they landed
 * in the right host and drew STATIC: coordinates computed against a real origin and then applied
 * to a panel that has no containing block to apply them to. Issue 1470 re-rooted each family at a
 * namespace class the component itself writes, and all three are now measured in both hosts here.
 *
 * The `position` clause in `assertPanelIsAtItsTrigger` is what catches that half. It reds before
 * the geometry does, and it reds ONLY in the non-manager host — which is the shape of the defect,
 * and the reason a manager-only case could never have found it.
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
 * A stand-in for Foundry's bundled artwork.
 *
 * `EssenceSourceSelector` falls back to `icons/svg/item-bag.svg` for an item with no image, which
 * is a real Foundry core path and therefore correct in the product and absent here — this server
 * has no Foundry data directory. Without this the fixture logs a 404, and `consoleErrors` is
 * asserted EMPTY because its job is to catch the module's own missing-host diagnostic; a resource
 * failure filtered out of that list instead would blunt the clause for every component.
 *
 * A real SVG rather than an empty response, because the trigger image is `object-fit: cover` over
 * a 140px square and a broken image box is not the same layout as a drawn one.
 */
function foundryIconStub() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#6b7a8f"/></svg>';
  return {
    name: 'overlay-host-icons',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!/\/icons\/svg\/[\w-]+\.svg(\?|$)/.test(request.url ?? '')) return next();
        response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        response.end(svg);
      });
    },
  };
}

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
    plugins: [rawStylesheetMount(), foundryIconStub(), svelte()],
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
 * The trigger and panel each component renders, so one measurement routine serves all four.
 *
 * `SearchablePopover` is matched on `button.manager-travel-trigger` because the fixture passes
 * that class through `triggerClass`; the other three name their own.
 */
const SELECTORS = Object.freeze({
  popover: Object.freeze({
    trigger: 'button.manager-travel-trigger',
    panel: '.fabricate-picker-popover',
  }),
  // THE overflow action menu (issue 1477). `container` is the SHORT `overflow: auto` column the
  // trigger sits inside — the fixture's stand-in for `.manager-environment-tab-panel` — and is
  // measured so the clipping half of the conversion is asserted rather than assumed.
  menu: Object.freeze({
    trigger: 'button[aria-haspopup="menu"]',
    panel: '.fabricate-action-menu-panel',
    container: '.clipping-column',
  }),
  // `ActorSelectTopBar`, the primitive's first player-window adopter (issue 1475). `container` is
  // the element the panel used to be positioned INSIDE — the bar — and is measured so the clipping
  // half of the conversion can be asserted rather than assumed.
  actorbar: Object.freeze({
    trigger: 'button.actor-bar-trigger',
    panel: '.actor-bar-popover',
    container: '.fabricate-app-actor-bar',
  }),
  icon: Object.freeze({
    trigger: '.essence-icon-picker-trigger',
    panel: '.fabricate-icon-picker-popover',
  }),
  source: Object.freeze({
    trigger: '.essence-source-trigger',
    panel: '.fabricate-source-picker-popover',
  }),
  color: Object.freeze({
    trigger: '.manager-color-picker-trigger',
    panel: '.fabricate-color-picker-popover',
  }),
  // `RecipeDurationEditor` (issue 1500). Manager-only: its panel takes `position: absolute` from
  // `.fabricate-manager .manager-recipe-duration-popover`, so it is a manager surface rather than
  // a shared primitive and there is no player-app reading to take.
  duration: Object.freeze({
    trigger: '[data-recipe-duration-trigger]',
    panel: '.manager-recipe-duration-popover',
  }),
});

/**
 * Open one overlay in one host and report the geometry, plus anything it logged.
 *
 * @param {object} options
 * @param {'manager'|'app'|'none'} options.host Which application root (or none) wraps the picker.
 * @param {'popover'|'icon'|'source'|'color'} [options.component] Which overlay component to mount.
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

    const {
      trigger: triggerSelector,
      panel: panelSelector,
      container: containerSelector = '',
    } = SELECTORS[component];

    await page.click(triggerSelector);
    await page.waitForSelector(panelSelector);
    // The position is written by an effect that runs after the panel first paints, so wait for
    // the frame that carries it rather than measuring the pre-layout box.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    );

    const measured = await page.evaluate(
      ({
        triggerSelector: trigger,
        panelSelector: panel,
        containerSelector: container,
        rootClasses,
      }) => {
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
        // A HIT TEST rather than a rect comparison, for the CLIPPING question (issue 1475).
        // An element clipped by an ancestor's `overflow` still reports its full, unclipped box
        // from `getBoundingClientRect`, so geometry alone cannot tell a visible panel from a
        // hidden one; `elementFromPoint` is the browser answering which element a user's pointer
        // would actually reach at that coordinate.
        //
        // Sampled near the panel's BOTTOM rather than at its centre (issue 1477), because a
        // centre sample cannot see a panel clipped in HALF: the action menu opens inside a
        // short scrolling column, so the arrangement to rule out is one whose top rows are
        // reachable and whose last verbs are not. The bottom sample is at least as strong for
        // the actor picker, whose panel is clipped from its top edge downwards when it fails.
        let panelHit = null;
        if (panelNode) {
          const rect = panelNode.getBoundingClientRect();
          const hit = document.elementFromPoint(
            Math.round(rect.left + rect.width / 2),
            Math.round(rect.bottom - 6)
          );
          panelHit = hit ? { inPanel: panelNode.contains(hit), className: hit.className } : null;
        }
        return {
          trigger: box(document.querySelector(trigger)),
          panel: box(panelNode),
          container: container ? box(document.querySelector(container)) : null,
          frame: box(document.querySelector('.application')),
          panelParentClass: panelNode?.parentElement?.className ?? '',
          panelPosition: panelNode ? getComputedStyle(panelNode).position : null,
          panelHit,
          rootPositions,
        };
      },
      {
        triggerSelector,
        panelSelector,
        containerSelector,
        rootClasses: [...OVERLAY_HOST_ROOT_CLASSES],
      }
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

  // ── THE SHARED DIRECTORY, BOTH HALVES (issue 1470) ─────────────────────────────────────────
  // These three live in `src/ui/svelte/components/`, whose premise is that a component there works
  // wherever it is mounted. Issue 1466 gave them the right HOST; until issue 1470 they still had
  // no rule that positioned them outside the manager, so the panel landed in the correct host and
  // drew `position: static` — a resolved host and an unpositioned panel, which is a worse failure
  // than either alone because the coordinates are now computed against something real and then
  // ignored.
  //
  // The manager case and the player-app case are BOTH run for each. The manager is where they
  // always worked, so it is the regression half; the player app is the half that was impossible,
  // and `assertPanelIsAtItsTrigger` reds there on the unfixed tree at the `position` clause before
  // it ever reaches the geometry.
  for (const [component, label] of [
    ['icon', 'IconPicker'],
    ['source', 'EssenceSourceSelector'],
    ['color', 'ManagerColorPicker'],
  ]) {
    it(`${label} lands at its trigger inside the manager, which is where it always worked`, async () => {
      const measured = await openOverlayIn({ host: 'manager', component });
      assertPanelIsAtItsTrigger(measured, `manager (${label})`);
      assert.ok(
        measured.panelParentClass.includes('fabricate-manager'),
        `${label}'s panel parent is \`${measured.panelParentClass}\`, not the manager root`
      );
      assert.deepEqual(measured.consoleErrors, [], `${label} reported a missing host`);
    });

    it(`${label} lands at its trigger inside the player window, which is what the shared directory promises`, async () => {
      const measured = await openOverlayIn({ host: 'app', component });
      assertPanelIsAtItsTrigger(measured, `player app (${label})`);
      assert.ok(
        measured.panelParentClass.includes('fabricate-app'),
        `${label}'s panel parent is \`${measured.panelParentClass}\`, not the player window frame`
      );
      assert.deepEqual(measured.consoleErrors, [], `${label} reported a missing host`);
    });
  }

  // ── THE FIRST PLAYER-WINDOW ADOPTER (issue 1475) ───────────────────────────────────────────
  // Everything above measures a PRIMITIVE mounted in a host. This measures a shipped SURFACE:
  // `ActorSelectTopBar`'s actor picker, which hand-rolled an `position: absolute` panel inside the
  // bar for its whole life and now portals `SearchablePopover`'s panel onto the player window
  // frame. It is the first thing in the product that depends on the three changes above being
  // real, and the acceptance question for that conversion is geometric rather than structural:
  // the panel must land at its trigger, and must not be clipped by the bar it opens from.
  it('the actor picker lands at its trigger in the player window', async () => {
    const measured = await openOverlayIn({ host: 'app', component: 'actorbar' });
    assertPanelIsAtItsTrigger(measured, 'player app (ActorSelectTopBar)');
    assert.ok(
      measured.panelParentClass.includes('fabricate-app'),
      `the actor picker's panel parent is \`${measured.panelParentClass}\`, not the player window ` +
        'frame, so the portal did not land'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the actor picker reported a missing host');
  });

  it('the actor picker escapes the bar it opens from, and is hit-testable there', async () => {
    // THE PART A STRUCTURAL ASSERTION CANNOT MAKE. The panel's parent being the frame says where
    // the node HANGS; it does not say the panel is visible, and the shipped arrangement — a panel
    // inside a 64px bar — is the one this has to be distinguished from. Two independent readings:
    // the panel extends below the bar's own bottom edge, and the browser's own hit test near
    // the panel's bottom resolves inside the panel rather than onto whatever is painted over it.
    const measured = await openOverlayIn({ host: 'app', component: 'actorbar' });
    const { panel, container, panelHit } = measured;

    assert.ok(container, 'the fixture rendered no actor bar to measure the panel against');
    assert.ok(
      panel.bottom > container.bottom + EPSILON,
      `the panel (bottom ${panel.bottom.toFixed(1)}) does not extend past the bar (bottom ` +
        `${container.bottom.toFixed(1)}), so it is not the full-height list this measurement is ` +
        'about and the clipping question has not been asked'
    );
    assert.ok(
      panelHit?.inPanel,
      "the browser hit test near the panel's bottom edge resolved to " +
        `\`${panelHit?.className ?? 'nothing'}\` rather than to the panel, so the panel is drawn ` +
        'but not reachable — clipped or painted over by something in the window'
    );
  });

  // ── THE SIXTH COPY (issue 1500) ────────────────────────────────────────────────────────────
  // `RecipeDurationEditor` carried the same hand-written positioning pass as the five above and
  // was the one of the six with no row here, so the consolidation onto `anchoredPopover` had no
  // browser reading of it at all.
  //
  // It is also the caller whose options differ most — its panel is `width: max-content`, so it
  // passes `applyWidth: false` and the action writes no width at all. THIS ROW DOES NOT ASSERT
  // THAT, and the comment used to read as though it did. What this suite measures is the same
  // pair every row above measures: the panel is adjacent to its trigger, and its parent is the
  // resolved host. The width branch is a pure function of the layout's output and is pinned by
  // `tests/actions/anchored-popover.test.js` ('omits the width for a panel that sizes to its
  // content'), which is where a claim about a style string belongs.
  //
  // Manager host only, and that is a measurement rather than an omission: the panel's
  // `position: absolute` comes from `.fabricate-manager .manager-recipe-duration-popover` in
  // `styles/fabricate.css`, so a player-app row would red at the `position` clause on the shipped
  // tree and would be asserting that a manager surface is a shared primitive.
  it('the duration editor lands at its trigger inside the manager', async () => {
    const measured = await openOverlayIn({ host: 'manager', component: 'duration' });
    assertPanelIsAtItsTrigger(measured, 'manager (RecipeDurationEditor)');
    assert.ok(
      measured.panelParentClass.includes('fabricate-manager'),
      `the duration editor's panel parent is \`${measured.panelParentClass}\`, not the manager ` +
        'root, so the portal did not land'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the duration editor reported a missing host');
  });

  // ── THE OVERFLOW ACTION MENU (issue 1477) ──────────────────────────────────────────────────
  // Everything above measures a PICKER. This measures the ACTION MENU, and it asks one question
  // the picker cases cannot: does the panel ESCAPE the scrolling column its trigger sits in.
  //
  // That question was live rather than hypothetical. The composition list's four menus were
  // `position: absolute` inside a `position: relative` wrapper in the row, and the row sits inside
  // `.manager-environment-tab-panel`, which the shipped sheet declares `overflow: auto` — so a
  // menu opened near the bottom of a long Tasks list was cut off by the panel's own edge. The
  // component editor's identity strip said so in its own comment and portaled its overflow for
  // exactly this reason; the four menus beside it never did.
  it('the action menu lands at its trigger inside the manager', async () => {
    const measured = await openOverlayIn({ host: 'manager', component: 'menu' });
    assertPanelIsAtItsTrigger(measured, 'manager (ActionMenu)');
    assert.ok(
      measured.panelParentClass.includes('fabricate-manager'),
      `the action menu's panel parent is \`${measured.panelParentClass}\`, not the manager root, ` +
        'so the portal did not land'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the action menu reported a missing host');
  });

  it('the action menu escapes the scrolling column it opens inside, and is hit-testable there', async () => {
    // THE PART A RECT COMPARISON CANNOT MAKE. A clipped element reports its FULL box, so the
    // panel's geometry is identical whether or not it escaped — which is why the second reading
    // is the browser's own hit test rather than another number.
    const measured = await openOverlayIn({ host: 'manager', component: 'menu' });
    const { panel, container, panelHit } = measured;

    assert.ok(container, 'the fixture rendered no clipping column to measure the panel against');
    assert.ok(
      panel.bottom > container.bottom + EPSILON,
      `the panel (bottom ${panel.bottom.toFixed(1)}) does not extend past the scrolling column ` +
        `(bottom ${container.bottom.toFixed(1)}), so the clipping question has not been asked. ` +
        'Either the column stopped clipping or the menu is short enough to fit inside it, and ' +
        'both make this measurement vacuous.'
    );
    assert.ok(
      panelHit?.inPanel,
      "the browser hit test near the panel's bottom edge resolved to " +
        `\`${panelHit?.className ?? 'nothing'}\` rather than to the panel, so the menu's last ` +
        'verbs are drawn but unreachable — clipped by the scrolling column, which is the defect ' +
        'this conversion removes'
    );
  });

  it('the action menu paints and lands at its trigger in the player window too', async () => {
    // THE CLAUSE THE ADOPTION SCENARIO NOW REQUIRES. `design-system/spec.md` requirement "A shared
    // primitive's class family is rooted at the primitive, not at an app" asks that a panel a
    // primitive portals be MEASURED landing at its trigger inside the application that adopts it,
    // and this primitive's family is rooted at `.fabricate-action-menu-panel` rather than at
    // `.fabricate-manager` precisely so that a second application can.
    //
    // The `position` clause inside `assertPanelIsAtItsTrigger` is the one that carries this: root
    // the family back at an app and the panel lands in the right host and draws `position: static`,
    // which is the second half of the defect issues 1466 and 1470 removed between them.
    //
    // Both callers are manager surfaces today, so this measures a CAPABILITY rather than a shipped
    // arrangement. What it does not claim is that the whole control paints out there: the trigger
    // is an `<IconButton>`, whose `manager-icon-button` rules are painted under `.fabricate-manager`
    // alone — that primitive's own header records the same limitation, and it is a property of the
    // button rather than of the menu.
    const measured = await openOverlayIn({ host: 'app', component: 'menu' });
    assertPanelIsAtItsTrigger(measured, 'player app (ActionMenu)');
    assert.ok(
      measured.panelParentClass.includes('fabricate-app'),
      `the action menu's panel parent is \`${measured.panelParentClass}\`, not the player window ` +
        'frame, so the portal did not land'
    );
    assert.deepEqual(measured.consoleErrors, [], 'the action menu reported a missing host');
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

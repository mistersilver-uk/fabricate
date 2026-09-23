/**
 * The manager shell a RENDERED (real-Chromium) suite ships product markup into (issue 1371
 * r18-list).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

/** Every scoped `<style>` block in a harness's compiled tree, in manifest order. */
export function collectScopedCss({ repoRoot, compiledModules }) {
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
 * The rendered markup inside the manager shell it ships in.
 *
 * @param {string} options.fabricateCss the module sheet's text.
 * @param {string} options.view the `data-manager-view` route.
 * @param {string} options.productMarkup the mounted tree's `innerHTML`.
 * @param {string} options.scopedCss the tree's scoped blocks, from `collectScopedCss`.
 * @param {string} [options.chrome] rules laid before the module sheet; `''` for none.
 * @param {string} [options.control] rules laid after every sheet; `''` for the honest page.
 */
export function managerShellPage({
  fabricateCss,
  view,
  productMarkup,
  scopedCss,
  chrome = '',
  control = '',
  hostWidth = 1280,
  hostHeight = 720,
}) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${chrome}</style>
    <style>${fabricateCss}</style>
    <style>${scopedCss}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${hostWidth}px; height: ${hostHeight}px; }
    </style>
    <style>${control}</style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="${view}">
          <div class="manager-titlebar"></div>
          <header class="manager-header"></header>
          <div class="manager-body">
            <nav class="manager-rail"></nav>
            ${productMarkup}
          </div>
        </div>
      </div>
    </body></html>`;
}

/**
 * THE SHARED EDITOR FRAME'S RENDERED CONTRACT (issue 1371 r18-frame, maintainer ruling M32). The
 * world Component entry and the system component rules editor stand on ONE frame —
 * `manager-component-entry-page` / `-column` / `-panel` — and the maintainer's fourth live test
 * ruled on it as one thing: "the tab bar doesn't span the whole central rail and neither does the
 * scroll area".
 */

/** The frame's boxes, read IN THE PAGE. */
export function measureEntryFrame() {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  };
  const main =
    document.querySelector('main.manager-component-edit-main') ??
    document.querySelector('main[data-scoped-page="world-component-entry"]');
  const page = main.classList.contains('manager-component-entry-page')
    ? main
    : main.querySelector('.manager-component-entry-page');
  const column = page.querySelector('.manager-component-entry-column');
  const strip = column.querySelector('.manager-editor-tabs');
  const firstTab = strip.querySelector('[role="tab"]');
  const panel = column.querySelector('.manager-component-entry-panel');
  const rail = page.querySelector('[data-scoped-entry-preview]');
  const panelRect = panel.getBoundingClientRect();
  return {
    main: box(main),
    column: box(column),
    strip: box(strip),
    firstTab: box(firstTab),
    firstTabContent: box(firstTab.firstElementChild),
    // THE CASCADE FACT the harvested-chrome arms are non-vacuous on (issue 1371 r20-entry3, Foundry
    // review round 6).
    firstTabJustify: getComputedStyle(firstTab).justifyContent,
    panel: box(panel),
    panelInner: {
      left: panelRect.left + panel.clientLeft,
      right: panelRect.left + panel.clientLeft + panel.clientWidth,
    },
    cards: [...panel.children].map(box),
    gutter: parseFloat(getComputedStyle(panel).getPropertyValue('--fab-space-3')),
    rail: box(rail),
    railBorderLeft: parseFloat(getComputedStyle(rail).borderLeftWidth),
    railBorderStyle: getComputedStyle(rail).borderLeftStyle,
    panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
    columnScrolls: column.scrollHeight > column.clientHeight + 1,
    // WHETHER THE FRAME ITSELF OWNS A SCROLLER, over `main` OR the page, because which of the two
    // it is differs by consumer: the rules editor's page IS its `main`, and the world entry's is a
    // div inside one. Read as one fact so the shared checks can state one sentence about it.
    frameScrolls:
      main.scrollHeight > main.clientHeight + 1 || page.scrollHeight > page.clientHeight + 1,
  };
}

/**
 * The shipped CONTENT inset re-declared: the strip's `0 var(--fab-space-5)` and the panel's
 * `var(--fab-space-4) var(--fab-space-5) 40px` — the reference's own 22px transcribed to the
 * 20px rung, and the arrangement the maintainer's M32 frame shows: tabs and cards starting 20px
 * inside a column whose only edge-to-edge mark is a one-pixel hairline.
 */
export const ENTRY_FRAME_CONTENT_INSET_CONTROL = `
  .fabricate-manager .manager-component-entry-column > .manager-editor-tabs { padding: 0 var(--fab-space-5) !important; }
  .fabricate-manager .manager-component-entry-panel { padding: var(--fab-space-4) var(--fab-space-5) 40px !important; }
`;

/**
 * The rail un-stretched from the frame's row — sized to its content rather than to the row — the
 * geometry the maintainer's M26 frame showed. Keyed on the frame, so it reddens both consumers.
 */
export const ENTRY_FRAME_UNSTRETCHED_RAIL_CONTROL = `
  .fabricate-manager .manager-component-entry-page { align-items: start !important; }
`;

/** The frame's own container NARROWED below its stacking threshold (issue 1371 r19-entry2). */
export const ENTRY_FRAME_STACKED_ARRANGEMENT = `
  .probe-host { width: 900px !important; }
  .fabricate-manager .manager-main { height: 520px !important; max-height: 520px !important; }
`;

/**
 * Lay a suite's page out four times — honest, stacked, then under each reddening arrangement — and
 * return the frame measured in each.
 *
 * @param {(control: string) => string} pageFor the suite's page builder, given the control rules.
 */
export async function measureEntryFrameArrangements(pageFor, viewport) {
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({ viewport });
    const measured = async (control) => {
      await tab.setContent(pageFor(control), { waitUntil: 'load' });
      return tab.evaluate(measureEntryFrame);
    };
    const honest = await measured('');
    const stacked = await measured(ENTRY_FRAME_STACKED_ARRANGEMENT);
    const inset = await measured(ENTRY_FRAME_CONTENT_INSET_CONTROL);
    const unstretched = await measured(ENTRY_FRAME_UNSTRETCHED_RAIL_CONTROL);
    return { honest, stacked, inset, unstretched };
  } finally {
    await browser.close();
  }
}

const same = (a, b) => Math.abs(a - b) < 0.5;

/** The frame's checks, one `it` each, over `{honest, inset, unstretched, hostHeight}`. */
export const ENTRY_FRAME_CHECKS = Object.freeze([
  [
    'fills the pane to the window’s foot, and the panel scrolls while the column does not',
    ({ honest, hostHeight }) => {
      // The pane is the root's THIRD row, under the title bar and the header: its foot is the
      // window's foot, and its height is what those two rows leave — well over half the host.
      assert.ok(
        same(honest.main.bottom, hostHeight),
        `the pane ends at ${honest.main.bottom}px, not at the window’s foot`
      );
      assert.ok(
        honest.main.bottom - honest.main.top > hostHeight / 2,
        'the pane takes the window below the chrome'
      );
      assert.ok(
        honest.panelScrolls,
        'the cards overflow the panel at this height, so a column that grew instead of scrolling would be visible below'
      );
      assert.ok(!honest.columnScrolls, 'and the column itself does not scroll — the panel does');
    },
  ],
  [
    'runs the column edge to edge: its box is the pane’s box up to the rail (M26)',
    ({ honest: { main, column, rail } }) => {
      assert.ok(
        same(column.left, main.left),
        `the column starts ${column.left - main.left}px inside the pane`
      );
      assert.ok(
        same(column.top, main.top),
        `the column starts ${column.top - main.top}px below the pane`
      );
      assert.ok(
        same(column.bottom, main.bottom),
        `the column ends ${main.bottom - column.bottom}px above the pane’s foot`
      );
      assert.ok(
        same(column.right, rail.left),
        `the column ends ${rail.left - column.right}px short of the rail`
      );
    },
  ],
  [
    'runs the strip’s hairline from the column’s left edge to the rail’s divider, and the panel’s box is the column’s below it (M26, M32)',
    ({ honest: { column, strip, panel, rail } }) => {
      assert.ok(
        same(strip.left, column.left),
        `the strip starts ${strip.left - column.left}px inside the column`
      );
      assert.ok(
        same(strip.right, rail.left),
        `the strip’s hairline ends ${rail.left - strip.right}px short of the rail’s divider`
      );
      assert.ok(
        same(strip.top, column.top),
        `the strip starts ${strip.top - column.top}px below the column’s top`
      );
      assert.ok(
        same(panel.top, strip.bottom),
        `the panel starts ${panel.top - strip.bottom}px below the strip`
      );
      assert.ok(
        same(panel.left, column.left),
        `the panel starts ${panel.left - column.left}px inside the column`
      );
      assert.ok(
        same(panel.right, column.right),
        `the panel ends ${column.right - panel.right}px short of the column`
      );
      assert.ok(
        same(panel.bottom, column.bottom),
        `the panel ends ${column.bottom - panel.bottom}px above the column’s foot`
      );
    },
  ],
  [
    'begins the tab bar at the column’s edge: the first tab’s box starts where the column starts (M32)',
    ({ honest: { column, firstTab } }) => {
      assert.ok(
        same(firstTab.left, column.left),
        `the tab bar starts ${firstTab.left - column.left}px inside the column — the strip still carries an inline inset`
      );
    },
  ],
  [
    'insets every card inside the panel by the catalogue’s gutter, which is where the tab’s own label begins (M32)',
    ({ honest: { panelInner, cards, gutter, firstTabContent } }) => {
      assert.ok(cards.length > 0, 'the panel holds cards to measure');
      assert.ok(
        gutter > 0 && gutter < 16,
        `the gutter token resolved to ${gutter}px, not the catalogue’s row gutter`
      );
      for (const [index, card] of cards.entries()) {
        assert.ok(
          same(card.left - panelInner.left, gutter),
          `card ${index} starts ${card.left - panelInner.left}px inside the panel, not the ${gutter}px gutter`
        );
        assert.ok(
          same(panelInner.right - card.right, gutter),
          `card ${index} ends ${panelInner.right - card.right}px short of the panel, not the ${gutter}px gutter`
        );
      }
      assert.ok(
        same(firstTabContent.left, cards[0].left),
        `the first tab’s label begins at ${firstTabContent.left}px and the cards at ${cards[0].left}px — the two read from different edges`
      );
    },
  ],
  [
    'runs the rail’s left hairline the full height of the pane (M26)',
    ({ honest: { main, rail, railBorderLeft, railBorderStyle } }) => {
      assert.equal(railBorderStyle, 'solid');
      assert.equal(railBorderLeft, 1, `the rail’s left border resolved to ${railBorderLeft}px`);
      assert.ok(
        same(rail.top, main.top),
        `the rail starts ${rail.top - main.top}px below the pane`
      );
      assert.ok(
        same(rail.bottom, main.bottom),
        `the rail — and its border — end ${main.bottom - rail.bottom}px above the pane’s foot`
      );
      assert.ok(
        same(rail.right, main.right),
        `the rail ends ${main.right - rail.right}px short of the pane’s edge`
      );
    },
  ],
  [
    'keeps BOTH halves when it stacks over a pane of a definite height: each keeps its content, the tab strip stays in the column, and the frame scrolls (M26, M32)',
    ({ stacked: { main, column, strip, rail, frameScrolls } }) => {
      // WHY THIS CHECK EXISTS ────────────────────────────────────────────────────────────── The
      // frame stacks below `@container fabricate-manager (max-width: 1000px)`, and until r19-entry2
      // nothing measured the stacked side on either consumer — this suite's own comment said so, as
      // a reason to stay wide.
      const height = ({ top, bottom }) => bottom - top;
      // The precondition: this arrangement really is the stacked one. Without it every assertion
      // below is also true of the two-column frame, and the check would prove nothing.
      assert.ok(
        rail.top >= column.bottom - 0.5,
        `the rail starts ${column.bottom - rail.top}px above the column’s foot — the frame did not stack at this width`
      );
      assert.ok(
        height(column) > 0,
        'the content column collapsed to nothing: the rail took the whole pane and no scroller reaches the form'
      );
      assert.ok(height(rail) > 0, 'the rail collapsed to nothing: the column took the whole pane');
      // AND NEITHER HALF WAS SQUEEZED INTO THE PANE.
      assert.ok(
        height(column) + height(rail) > height(main) + 1,
        `the two halves fit inside the pane (${Math.round(height(column))}px + ${Math.round(height(rail))}px into ${Math.round(height(main))}px) — the frame divided the pane between them rather than keeping their content`
      );
      assert.ok(
        frameScrolls,
        'the frame overflows the pane and nothing scrolls it: the halves below the fold are unreachable'
      );
      // And the tab strip is IN the column rather than overhung by the rail stacked on top of it.
      assert.ok(height(strip) > 0, 'the tab strip drew nothing');
      assert.ok(
        same(strip.top, column.top),
        `the strip starts ${strip.top - column.top}px below the column’s top`
      );
      assert.ok(
        strip.bottom <= column.bottom + 0.5,
        `the strip ends ${strip.bottom - column.bottom}px past the column’s foot — it is overhanging the rail below it`
      );
    },
  ],
  [
    'CONTROL: with the shipped content inset re-declared, the tab bar and the cards move inside the column again',
    ({ inset }) => {
      // The M32 photograph: tabs and cards 20px inside a column whose only edge-to-edge mark is
      // the hairline. Proves the two M32 measurements above can fail.
      assert.ok(
        inset.firstTab.left - inset.column.left > 16,
        `under the control the tab bar still starts ${inset.firstTab.left - inset.column.left}px inside the column — the measurement cannot see the inset`
      );
      assert.ok(
        inset.cards[0].left - inset.panelInner.left > 16,
        `under the control the cards still sit ${inset.cards[0].left - inset.panelInner.left}px inside the panel — the measurement cannot see the inset`
      );
    },
  ],
  [
    'CONTROL: with the rail un-stretched from the row, its hairline stops short again',
    ({ unstretched }) => {
      // The M26 photograph: a rail sized to its content, so the border ends in mid-air with the
      // pane's foot below it. Proves the full-height assertion can fail.
      assert.ok(
        unstretched.main.bottom - unstretched.rail.bottom > 40,
        `under the control the rail still reaches ${unstretched.main.bottom - unstretched.rail.bottom}px of the pane’s foot — the measurement cannot see the short border`
      );
    },
  ],
]);

/*
 * THE SYSTEM COMPONENT RULES EDITOR'S FRAME, RENDERED IN A REAL BROWSER (issue 1371 r18-list,
 * maintainer ruling M26).
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The maintainer's third live test found the editor's middle column carrying an inset on every
 * side — the tab strip and the cards starting 24px inside the pane where the world entry's strip
 * runs edge to edge — and the rail's left hairline ending about 80% of the way down the screen.
 * Both are CASCADE facts — which declaration a box's edge actually resolves to — and happy-dom
 * computes no layout, so they can only be measured in a browser laying out the shipped markup
 * under the shipped stylesheets. This follows
 * `components-browser-rendered.test.js`: MOUNT the real `ComponentEditView` through the shared
 * harness, ship its `innerHTML` into Chromium inside the manager shell it renders in, and read
 * the boxes.
 * ── THE CLAIM, IN THE RULING'S OWN TERMS ─────────────────────────────────────────────────
 * "The form must occupy the column's full width and height like the catalogue's list column",
 * and "the border must run the full height of the pane". So: the column's box IS the pane's box
 * up to the rail; the strip and the scrolling panel are flush with the column on every side that
 * touches it; and the rail's box spans the pane's height with a 1px hairline on its left.
 * ── THE NEGATIVE CONTROLS ARE IN THE FILE ────────────────────────────────────────────────
 * Two second page loads each re-declare one arrangement and the suite asserts the measurement
 * then reports the defect. The inset control is the rule the column shipped under. The rail
 * control is an UN-STRETCHED rail — sized to its content rather than to the row — which is the
 * geometry the maintainer's frame showed; the View Lab frame at the assigned base did not
 * reproduce it (its hairline ran the pane's height, measured pixel by pixel), so the arrangement
 * that produced it in the maintainer's Foundry is not one this shell can restate. What the fix
 * does is structural rather than a repair of one declaration: the editor now stands on the world
 * entry's own frame — one explicit `minmax(0, 1fr)` row holding the entry's two-column grid —
 * which is the arrangement of the screen whose rail ran full height in the same live test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';
import {
  COMPONENT_SYSTEMS,
  componentCorpus,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { collectScopedCss, managerShellPage } from '../helpers/renderedManagerShell.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const compiledModules = [...COMPONENT_EDIT_VIEW_COMPILED_MODULES];
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-edit-frame-rendered-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules,
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

// Wide enough that the frame keeps both columns: the page frame stacks the rail under the column
// at or below 1000px of container width, and a stacked rail has no left hairline to measure.
const HOST_WIDTH_PX = 1280;
// Short enough that the editor's cards overflow their scroller, which is what makes "the panel
// scrolls and the column does not grow" a measurement rather than an assumption.
const HOST_HEIGHT_PX = 720;
// Anti-vacuity for the scoped-CSS collector; the editor's tree compiles to well over this.
const MIN_SCOPED_BLOCKS = 12;

/** The column's shipped inset, re-declared: the arrangement the maintainer's M26 frame shows. */
const INSET_CONTROL = `
  .fabricate-manager #manager-component-edit-form { padding: 0 var(--fab-space-6) 40px !important; }
`;

/** The rail un-stretched — sized to its content, the geometry the maintainer's frame showed. */
const UNSTRETCHED_RAIL_CONTROL = `
  .fabricate-manager .manager-main.manager-component-edit-main { align-items: start !important; }
`;

function page(productMarkup, scopedCss, control = '') {
  return managerShellPage({
    fabricateCss,
    view: 'component-edit',
    productMarkup,
    scopedCss,
    control,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
}

/**
 * The frame's boxes: the pane, the column, the strip and the scrolling panel in it, and the rail.
 *
 * Every edge is the border-box edge a GM sees. `railBorderLeft` is read as the computed value so
 * the assertion can say which declaration won, and the two `scrolls` facts separate a column
 * that fills the pane from one that merely grew to its content.
 */
function measureFrame() {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  };
  const main = document.querySelector('main.manager-component-edit-main');
  const form = document.querySelector('#manager-component-edit-form');
  const strip = form.querySelector('.manager-editor-tabs');
  const panel = form.querySelector('[data-component-edit-panel]');
  const rail = main.querySelector('[data-scoped-entry-preview]');
  return {
    main: box(main),
    form: box(form),
    strip: box(strip),
    panel: panel ? box(panel) : null,
    rail: box(rail),
    railBorderLeft: parseFloat(getComputedStyle(rail).borderLeftWidth),
    railBorderStyle: getComputedStyle(rail).borderLeftStyle,
    panelScrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : false,
    formScrolls: form.scrollHeight > form.clientHeight + 1,
  };
}

const same = (a, b) => Math.abs(a - b) < 0.5;

describe('the rules editor’s rendered frame (issue 1371 r18-list, M26)', () => {
  const rendered = { markup: '', scoped: null };
  let honest = null;
  let inset = null;
  let unstretched = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      const target = await harness.mount({
        component: {
          id: 'coal',
          name: 'Coal',
          img: 'icons/commodities/metal/ingot-worn-iron.webp',
          description: '',
          category: 'Raw',
          tags: [],
          essences: {},
        },
        scope: projectWorldScopeEntity({
          entityType: 'component',
          corpus: componentCorpus(),
          systems: COMPONENT_SYSTEMS,
        }),
        actions: recordingComponentActions().actions,
        systemId: 'sys-forge',
        showTags: true,
        // EVERY SECTION ON, so the cards overflow a 720px host: a panel that fills the column and
        // scrolls is only distinguishable from one that grew to its content when there is more
        // content than column.
        showEssences: true,
        essenceOptions: [
          { id: 'air', name: 'Air', icon: 'fas fa-wind', enabled: true, quantity: 0 },
          { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 2 },
          { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: true, quantity: 0 },
          { id: 'water', name: 'Water', icon: 'fas fa-droplet', enabled: true, quantity: 1 },
        ],
        showSalvage: true,
        tagOptions: [
          { tag: 'ore', checked: true },
          { tag: 'ingot', checked: false },
        ],
        categoryOptions: ['Refined', 'Raw'],
        onSave: async () => true,
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      await tab.setContent(page(rendered.markup, rendered.scoped.css), { waitUntil: 'load' });
      honest = await tab.evaluate(measureFrame);
      await tab.setContent(page(rendered.markup, rendered.scoped.css, INSET_CONTROL), { waitUntil: 'load' });
      inset = await tab.evaluate(measureFrame);
      await tab.setContent(page(rendered.markup, rendered.scoped.css, UNSTRETCHED_RAIL_CONTROL), { waitUntil: 'load' });
      unstretched = await tab.evaluate(measureFrame);
    } finally {
      await browser.close();
    }
  });

  it('lays the editor out with its real content, so the measurement is of the product', () => {
    assert.ok(rendered.markup.length > 0, 'the editor rendered nothing at all');
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected (expected at least ${MIN_SCOPED_BLOCKS})`
    );
    // The pane is the root's THIRD row, under the title bar and the header: its foot is the
    // window's foot, and its height is what those two rows leave — well over half the host here.
    assert.ok(same(honest.main.bottom, HOST_HEIGHT_PX), `the pane ends at ${honest.main.bottom}px, not at the window’s foot`);
    assert.ok(honest.main.bottom - honest.main.top > HOST_HEIGHT_PX / 2, 'the pane takes the window below the chrome');
    assert.ok(Boolean(honest.panel), 'the strip is followed by ONE scrolling panel holding the tab body');
    assert.ok(
      honest.panelScrolls,
      'the editor’s cards overflow the panel at this height, so a column that grew instead of scrolling would be visible below'
    );
    assert.ok(!honest.formScrolls, 'and the column itself does not scroll — the panel does');
  });

  it('runs the column edge to edge: its box is the pane’s box up to the rail (M26)', () => {
    const { main, form, rail } = honest;
    assert.ok(same(form.left, main.left), `the column starts ${form.left - main.left}px inside the pane`);
    assert.ok(same(form.top, main.top), `the column starts ${form.top - main.top}px below the pane`);
    assert.ok(same(form.bottom, main.bottom), `the column ends ${main.bottom - form.bottom}px above the pane’s foot`);
    assert.ok(same(form.right, rail.left), `the column ends ${rail.left - form.right}px short of the rail`);
  });

  it('and its strip and panel are flush with it, so nothing inside carries the pane’s inset', () => {
    const { form, strip, panel } = honest;
    assert.ok(same(strip.left, form.left), `the strip starts ${strip.left - form.left}px inside the column`);
    assert.ok(same(strip.right, form.right), `the strip ends ${form.right - strip.right}px short of the column`);
    assert.ok(same(strip.top, form.top), `the strip starts ${strip.top - form.top}px below the column’s top`);
    assert.ok(same(panel.left, form.left), `the panel starts ${panel.left - form.left}px inside the column`);
    assert.ok(same(panel.right, form.right), `the panel ends ${form.right - panel.right}px short of the column`);
    assert.ok(same(panel.bottom, form.bottom), `the panel ends ${form.bottom - panel.bottom}px above the column’s foot`);
  });

  it('runs the rail’s left hairline the full height of the pane (M26)', () => {
    const { main, rail, railBorderLeft, railBorderStyle } = honest;
    assert.equal(railBorderStyle, 'solid');
    assert.equal(railBorderLeft, 1, `the rail’s left border resolved to ${railBorderLeft}px`);
    assert.ok(same(rail.top, main.top), `the rail starts ${rail.top - main.top}px below the pane`);
    assert.ok(same(rail.bottom, main.bottom), `the rail — and its border — end ${main.bottom - rail.bottom}px above the pane’s foot`);
    assert.ok(same(rail.right, main.right), `the rail ends ${main.right - rail.right}px short of the pane’s edge`);
  });

  it('CONTROL: with the column’s shipped inset re-declared, the strip moves inside the column again', () => {
    // The defect the maintainer photographed: 24px of dead inset on the column's every side.
    assert.ok(
      inset.strip.left - inset.form.left > 16,
      `under the control the strip still starts ${inset.strip.left - inset.form.left}px inside the column — the measurement cannot see the inset`
    );
  });

  it('CONTROL: with the rail un-stretched from the row, its hairline stops short again', () => {
    // The other half of the photograph: a rail sized to its content, so the border ends in
    // mid-air with the pane's foot below it. Proves the full-height assertion can fail.
    assert.ok(
      unstretched.main.bottom - unstretched.rail.bottom > 40,
      `under the control the rail still reaches ${unstretched.main.bottom - unstretched.rail.bottom}px of the pane’s foot — the measurement cannot see the short border`
    );
  });
});

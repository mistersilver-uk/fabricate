/*
 * THE SYSTEM COMPONENT RULES EDITOR'S FRAME, RENDERED IN A REAL BROWSER (issue 1371 r18-list,
 * maintainer ruling M26; r18-frame, maintainer ruling M32).
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The maintainer's third live test found the editor's middle column carrying an inset on every
 * side — the tab strip and the cards starting 24px inside the pane where the world entry's strip
 * runs edge to edge — and the rail's left hairline ending about 80% of the way down the screen.
 * His fourth found the tab bar and the scroll area still not spanning the column: the column was
 * flush by then, but the tabs and the cards began 20px inside it and the strip's only edge-to-edge
 * mark was a one-pixel hairline. All of these are CASCADE facts — which declaration a box's edge
 * actually resolves to — and happy-dom computes no layout, so they can only be measured in a
 * browser laying out the shipped markup under the shipped stylesheets. This follows
 * `components-browser-rendered.test.js`: MOUNT the real `ComponentEditView` through the shared
 * harness, ship its `innerHTML` into Chromium inside the manager shell it renders in, and read
 * the boxes.
 * ── THE CLAIM IS THE FRAME'S, NOT THIS SCREEN'S ──────────────────────────────────────────
 * The editor stands on the world entry's frame (M27), so the checks here are the frame's shared
 * contract in `tests/helpers/renderedManagerShell.js` — the same sentences
 * `world-component-entry-frame-rendered.test.js` holds the entry to — and the two reddening
 * arrangements (the shipped content inset re-declared; the rail un-stretched) are in the same
 * place. What is this suite's own is the MOUNT: the editor with every section on, so its cards
 * overflow a 720px host and "the panel scrolls and the column does not" is a measurement rather
 * than an assumption.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

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
import {
  harvestedFoundryChromeCss,
  harvestedFoundryVersion,
  measureEntryFrameUnderHarvestedChrome,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import {
  ENTRY_FRAME_CHECKS,
  collectScopedCss,
  managerShellPage,
  measureEntryFrameArrangements,
} from '../helpers/renderedManagerShell.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
/** Foundry's own stylesheet, where a harvest exists; `''` in CI, where the arms below skip. */
const harvestedChrome = harvestedFoundryChromeCss(repoRoot);

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

function page(productMarkup, scopedCss, control = '', chrome = '') {
  return managerShellPage({
    fabricateCss,
    view: 'component-edit',
    productMarkup,
    scopedCss,
    chrome,
    control,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
}

describe('the rules editor’s rendered frame (issue 1371 r18-list M26, r18-frame M32)', () => {
  const rendered = { markup: '', scoped: null };
  const frames = { hostHeight: HOST_HEIGHT_PX, honest: null, inset: null, unstretched: null };
  // The same three arrangements re-measured under FOUNDRY'S OWN sheet, where one is harvested
  // (issue 1371 r19-gates2, Foundry review round 5 finding 7). `null` where none is.
  let chromeFrames = null;

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

    Object.assign(
      frames,
      await measureEntryFrameArrangements(
        (control) => page(rendered.markup, rendered.scoped.css, control),
        {
          width: HOST_WIDTH_PX,
          height: HOST_HEIGHT_PX,
        }
      )
    );
    chromeFrames = await measureEntryFrameUnderHarvestedChrome({
      chrome: harvestedChrome,
      pageFor: (control) => page(rendered.markup, rendered.scoped.css, control, harvestedChrome),
      viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX },
    });
  });

  it('lays the editor out with its real content, so the measurement is of the product', () => {
    assert.ok(rendered.markup.length > 0, 'the editor rendered nothing at all');
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected (expected at least ${MIN_SCOPED_BLOCKS})`
    );
    assert.ok(Boolean(frames.honest), 'the frame was measured');
  });

  for (const [name, check] of ENTRY_FRAME_CHECKS) it(name, () => check(frames));

  it('really laid Foundry’s own sheet over this frame, not an empty string', { skip: skipWithoutHarvest(harvestedChrome) }, () => {
    // Non-vacuity for every arm below. The frame's geometry is chrome-INVARIANT today, which is
    // the finding's own good news and also the reason a chrome arm could quietly measure nothing:
    // pass `''` instead of the sheet and every sentence still passes. What Foundry does move is
    // the tab's LABEL METRICS — it declares `--font-sans` and the tab inherits it — so the first
    // tab's box is measurably wider under it. That is the fact that says the sheet arrived.
    const width = (box) => box.right - box.left;
    assert.ok(
      Math.abs(width(chromeFrames.honest.firstTab) - width(frames.honest.firstTab)) > 1,
      `the first tab measured ${width(chromeFrames.honest.firstTab)}px under Foundry ${harvestedFoundryVersion(repoRoot)} and ${width(frames.honest.firstTab)}px without it — the sheet did not reach the page`
    );
  });

  // AND EVERY ONE OF THE FRAME'S OWN SENTENCES AGAIN UNDER THAT SHEET. See
  // `harvestedFoundryChrome.js` for why it matters here: the frame's tabs are
  // `<button role="tab">` and the strip's rule never declares `justify-content`, so Foundry's
  // `a.button, button { justify-content: center }` still arbitrates them.
  for (const [name, check] of ENTRY_FRAME_CHECKS) {
    it(`${name} — under Foundry ${harvestedFoundryVersion(repoRoot)}’s own sheet`, { skip: skipWithoutHarvest(harvestedChrome) }, () =>
      check(chromeFrames)
    );
  }
});

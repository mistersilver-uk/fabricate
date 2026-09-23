/*
 * THE SYSTEM COMPONENT RULES EDITOR'S FRAME.
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The maintainer's third live test found the editor's middle column carrying an inset on every
 * side — the tab strip and the cards starting 24px inside the pane where the world entry's strip
 * runs edge to edge — and the rail's left hairline ending about 80% of the way down the screen.
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
  registerChromeRunnerGuards,
  registerHarvestedChromeFrameArms,
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

// See the SKIP POLICY block at the head of this file: on the runner that harvests.
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/component-edit-frame-rendered.test.js',
  chrome: harvestedChrome,
});

const compiledModules = [...COMPONENT_EDIT_VIEW_COMPILED_MODULES];
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-edit-frame-rendered-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules,
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

// Wide enough that the frame keeps both columns.
const HOST_WIDTH_PX = 1280;
// Short enough that the editor's cards overflow their scroller.
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
  const frames = {
    hostHeight: HOST_HEIGHT_PX,
    honest: null,
    stacked: null,
    inset: null,
    unstretched: null,
  };
  // The same three arrangements re-measured under FOUNDRY'S OWN sheet.
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
        // EVERY SECTION ON, so the cards overflow a 720px host.
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

  // AND EVERY ONE OF THE FRAME'S OWN SENTENCES AGAIN UNDER FOUNDRY'S OWN SHEET. See
  // `harvestedFoundryChrome.js` for why it matters here: the frame's tabs are
  // `<button role="tab">` and the strip's rule never declares `justify-content`, so Foundry's
  // `a.button, button { justify-content: center }` still arbitrates them.
  registerHarvestedChromeFrameArms({
    chrome: harvestedChrome,
    version: harvestedFoundryVersion(repoRoot),
    honestFrames: () => frames,
    chromeFrames: () => chromeFrames,
    checks: ENTRY_FRAME_CHECKS,
  });
});

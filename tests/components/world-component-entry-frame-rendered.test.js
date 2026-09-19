/* THE WORLD COMPONENT ENTRY'S FRAME. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import {
  SCOPED_SHARED_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  componentScopeFor,
  createComponentScopeHarness,
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

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
/** Foundry's own stylesheet, where a harvest exists; `''` in CI, where the arms below skip. */
const harvestedChrome = harvestedFoundryChromeCss(repoRoot);

// See the SKIP POLICY block at the head of this file: on the runner that harvests.
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/world-component-entry-frame-rendered.test.js',
  chrome: harvestedChrome,
});

const componentPath = 'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPage.svelte';
// THE ENTRY'S STATIC TREE beyond the shared scoped tier.
const compiledExtras = [
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySourceCard.svelte',
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySystemsCard.svelte',
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPreviewRail.svelte',
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  'src/ui/svelte/components/Callout.svelte',
  'src/ui/svelte/components/EditorTabs.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/components/ItemDropZone.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
];
const compiledModules = [...SCOPED_SHARED_COMPILED_MODULES, componentPath, ...compiledExtras];
const harness = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-entry-frame-rendered-',
  componentPath,
  rawExtras: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js',
    'src/ui/model/essenceValidation.js',
  ],
  compiledExtras,
});

// The same host the editor's twin measures in, for the same two reasons.
const HOST_WIDTH_PX = 1280;
const HOST_HEIGHT_PX = 720;
// Anti-vacuity for the scoped-CSS collector; the entry's tree compiles to well over this.
const MIN_SCOPED_BLOCKS = 10;

const ENTRY_SYSTEMS = Object.freeze([
  Object.freeze({ id: 'sys-forge', name: 'Forge', resolutionMode: 'progressive' }),
  Object.freeze({ id: 'sys-alchemy', name: 'Alchemy', resolutionMode: 'simple' }),
]);

function page(productMarkup, scopedCss, control = '', chrome = '') {
  return managerShellPage({
    fabricateCss,
    // The entry's OWN route attribute.
    view: 'world-component-entry',
    productMarkup,
    scopedCss,
    chrome,
    control,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
}

describe('the world component entry’s rendered frame (issue 1371 r18-frame, M32)', () => {
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
        scope: componentScopeFor(),
        actions: recordingComponentActions().actions,
        // `ingot` is the fixture's LINKED record adopted by two systems.
        entityId: 'ingot',
        systemId: 'sys-forge',
        systems: ENTRY_SYSTEMS,
        worldItems: [],
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

  it('lays the entry out with its real content, so the measurement is of the product', () => {
    assert.ok(rendered.markup.length > 0, 'the entry rendered nothing at all');
    assert.ok(
      rendered.markup.includes('data-scoped-page="world-component-entry"'),
      'the entry rendered its page root rather than the missing-record state'
    );
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

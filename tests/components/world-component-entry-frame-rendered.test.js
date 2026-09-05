/*
 * THE WORLD COMPONENT ENTRY'S FRAME, RENDERED IN A REAL BROWSER (issue 1371 r18-frame, maintainer
 * ruling M32).
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The entry and the system component rules editor stand on ONE frame — the entry's own
 * `manager-component-entry-page` / `-column` / `-panel` (M27) — and the maintainer's fourth live
 * test ruled on that frame: the tab bar and the scroll area must span the whole central column.
 * `component-edit-frame-rendered.test.js` proves the frame under the editor; this suite is its
 * TWIN under the entry, because a frame proven on one consumer and assumed on the other is a
 * frame that can be fixed on one and left broken on the other — and the two screens have carried
 * different insets before (M26). Both hold the frame to the SAME checks, held once in
 * `tests/helpers/renderedManagerShell.js`: the column flush with the pane, the tab bar beginning
 * at the column's edge, the panel's box the column's, the cards inset inside the panel by the
 * catalogue's gutter, the rail's hairline the pane's full height — and the two reddening
 * arrangements. What is this suite's own is the MOUNT: the entry opened on a LINKED record held by
 * two systems, whose definition tab stacks the identity, source, classification, essence, systems
 * and danger cards and so overflows a 720px host.
 * ── SKIP POLICY, AND WHERE THE SKIPPED ARM RUNS IN CI ────────────────────────────────────
 * (issue 1371 r20-entry3; Foundry review round 6 finding 3, quality review round 6 R2.)
 * The arms that lay FOUNDRY'S OWN harvested sheet under this frame skip where no harvest exists,
 * because `npm test` must stay runnable without a Foundry licence and `.foundry-chrome/` is a
 * licensed local artefact that `ci.yml`'s runner never holds. r19 added those arms, wrote that
 * policy in `harvestedFoundryChrome.js` — and named this file in no workflow at all, so with the
 * harvest moved aside it reported `tests 40, pass 20, skipped 20` and stayed GREEN even under
 * `VIEWLAB_REQUIRE_CHROME=1`: half its contract executed on a maintainer's machine and nowhere
 * else. `registerChromeRunnerGuards` below closes both halves — it FAILS when the harvest is
 * missing and `VIEWLAB_REQUIRE_CHROME=1`, and it asserts against `pr-screenshots.yml` that this
 * file is still named on the chrome-dependent step that sets it. The step's name is spelled once,
 * as `CHROME_STEP_NAME` in that helper; open it to find the runner where the skip cannot be taken.
 */
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

// See the SKIP POLICY block at the head of this file: on the runner that harvests, a missing
// harvest is a FAILURE rather than a quietly green run whose chrome arms were all skipped —
// and this file's presence on that runner's step is asserted against the workflow itself.
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/world-component-entry-frame-rendered.test.js',
  chrome: harvestedChrome,
});

const componentPath = 'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPage.svelte';
// THE ENTRY'S STATIC TREE beyond the shared scoped tier — the same closure
// `world-component-entry-mounted.test.js` declares, because a `.svelte` the tree renders and this
// list omits does not fail the suite, it HANGS it (`# cancelled`). Named here as well as passed
// to the harness because the scoped-CSS collector reads the same list: a component compiled for
// the mount but absent from the collector lays out unstyled in the browser.
const compiledExtras = [
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySourceCard.svelte',
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySystemsCard.svelte',
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPreviewRail.svelte',
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/EditorTabs.svelte',
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/ItemDropZone.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
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
    'src/utils/essenceValidation.js',
  ],
  compiledExtras,
});

// The same host the editor's twin measures in, for the same two reasons: wide enough that the
// frame keeps both columns (the rail stacks under the column at or below 1000px of container
// width), short enough that the definition tab's cards overflow the panel. The STACKED side is
// measured too, in the shared contract's own narrowed arrangement (issue 1371 r19-entry2).
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
    // The entry's OWN route attribute, because its `.manager-main` is padded by the world-route
    // group rule and un-padded again by the page's own hook: the cascade this suite measures is
    // the one the route renders under.
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
  // The same three arrangements re-measured under FOUNDRY'S OWN sheet, where one is harvested
  // (issue 1371 r19-gates2, Foundry review round 5 finding 7). `null` where none is.
  let chromeFrames = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      const target = await harness.mount({
        scope: componentScopeFor(),
        actions: recordingComponentActions().actions,
        // `ingot` is the fixture's LINKED record adopted by two systems: its definition tab draws
        // the locked identity, the source card with its uuid and drop zone, the classification
        // card, the essence card, the systems table over two rows and the danger card.
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

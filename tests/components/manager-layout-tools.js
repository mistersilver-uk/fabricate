/**
 * Tool Studio, Checks Studio, modifier and outcome-band layout, measured in a real browser (issue 1670).
 *
 * A surface module of `manager-layout.test.js`. It registers its tests on import and owns no
 * browser: `tests/helpers/layout-harness.js` holds the one Chromium every surface shares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { openLayoutContext, renderWithCascade } from '../helpers/layout-harness.js';

import {
  blockFor,
  css,
  managerButtonClassesFor,
  managerComponentDir,
  readWorkspaceGrid,
  stepperScoped,
  withoutComments,
  compareStrings,
} from './manager-layout-shared.js';
import {
  AUTHORITY_PROBES,
  CHECKS_RAIL_FOUNDRY_CSS,
  CHECKS_REDIRECT_VIEW,
  CHECKS_VIEWS,
  MODIFIER_BOUNDS_ROW_WIDTHS,
  bandStripFixture,
  checkEditorSource,
  checksRollEdges,
  en,
  modifiersCombinationRuleMetrics,
  oddsScoped,
  previewScoped,
  readRenderedToolGeometry,
  withBandStripPage,
  withStepperHash,
} from './manager-layout-tools-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('Tool library renders 210px and 340px fixed columns through the 832px product root', async () => {
  for (const width of [1212, 832]) {
    const report = await readRenderedToolGeometry(width, 'tools');
    assert.equal(Math.round(report.rail.width), 210);
    assert.equal(Math.round(report.inspector.width), 340);
    assert.equal(report.overflow, false);
    assert.ok(report.main.left >= report.rail.right - 1);
    assert.ok(report.inspector.left >= report.main.right - 1);
  }
  const stacked = await readRenderedToolGeometry(831, 'tools');
  assert.ok(stacked.main.top >= stacked.rail.bottom - 1);
  assert.equal(stacked.overflow, false);
});

// The rail track is 340, not 320 (issue 1373). The Tool Rules list holds its inspector at 340
// against `proto:2496`'s 326, and that deviation justifies itself on the figure being shared
// with the collapsed variant AND the editor route — which it was not, because this route was
// 320, so the rail jumped 20px every time a GM opened a Tool from the list and came back.
test('Tool editor header spans the 210px/editor/340px triptych and stacks only below 832px', async () => {
  for (const width of [1212, 832]) {
    const report = await readRenderedToolGeometry(width, 'tool-edit');
    assert.equal(Math.round(report.rail.width), 210);
    assert.equal(Math.round(report.preview.width), 340);
    assert.ok(Math.abs(report.header.left - report.root.left) <= 1);
    assert.ok(Math.abs(report.header.right - report.root.right) <= 1);
    assert.ok(report.tabs.left >= report.rail.right - 1);
    assert.ok(Math.abs(report.rail.top - report.tabs.top) <= 1);
    assert.ok(Math.abs(report.panel.top - report.tabs.bottom) <= 1);
    assert.ok(report.preview.left >= report.panel.right - 1);
    assert.equal(report.overflow, false);
  }
  const stacked = await readRenderedToolGeometry(831, 'tool-edit');
  assert.ok(stacked.rail.top >= stacked.header.bottom - 1);
  assert.ok(stacked.tabs.top >= stacked.rail.bottom - 1);
  assert.ok(stacked.preview.top >= stacked.panel.bottom - 1);
  assert.equal(stacked.overflow, false);
  const wrapped = await readRenderedToolGeometry(680, 'tool-edit');
  assert.ok(wrapped.actions.bottom <= wrapped.header.bottom + 1);
  assert.equal(wrapped.overflow, false);
});

test('Tool Breakage keeps three shared radio cards wide and stacks them inside the 832px editor panel', async () => {
  const wide = await readRenderedToolGeometry(1212, 'tool-edit');
  const narrow = await readRenderedToolGeometry(832, 'tool-edit');

  assert.equal(wide.choices.length, 3);
  assert.ok(
    wide.choices.every((choice) => Math.abs(choice.top - wide.choices[0].top) <= 1),
    'wide shared radio cards render in three columns'
  );
  assert.ok(wide.choices[1].left >= wide.choices[0].right - 1);
  assert.ok(wide.choices[2].left >= wide.choices[1].right - 1);
  assert.equal(narrow.panelContainerType, 'inline-size');
  assert.equal(narrow.choices.length, 3);
  assert.ok(narrow.choices[1].top >= narrow.choices[0].bottom - 1);
  assert.ok(narrow.choices[2].top >= narrow.choices[1].bottom - 1);
  for (const [index, choice] of narrow.choices.entries()) {
    assert.ok(choice.left >= narrow.choiceOptions.left - 1);
    assert.ok(choice.right <= narrow.choiceOptions.right + 1);
    assert.ok(narrow.choiceBodies[index].right <= choice.right + 1);
  }
  assert.ok(
    narrow.authority.bottom - narrow.authority.top <= 125,
    '832px authority summary stays compact'
  );
  assert.ok(narrow.panelPaddingInline >= 20 && narrow.panelPaddingInline <= 22);
  assert.ok(Math.abs(narrow.authorityTitleSize - 12.48) <= 0.6);
  assert.ok(Math.abs(narrow.authorityCopySize - 10.24) <= 0.6);
  assert.notEqual(narrow.previewBackground, narrow.previewCardBackground);
});

test('manager character modifier search suggestions keep icons in row flow', () => {
  const searchIconBlock = blockFor('.fabricate-search.manager-search > i');
  const characterModifierSuggestionBlock = blockFor(
    '.fabricate-manager .manager-tag-suggestion.manager-character-modifier-add-suggestion'
  );
  const characterModifierSuggestionIconBlock = blockFor(
    '.fabricate-manager .manager-character-modifier-add-suggestion > i'
  );

  assert.ok(
    searchIconBlock.includes('position: absolute;') && searchIconBlock.includes('left: 11px;'),
    'search field leading icon should remain positioned inside the input chrome'
  );
  assert.equal(
    css.includes('.fabricate-search.manager-search i {\n  position: absolute;'),
    false,
    'search icon positioning must not catch suggestion icons inside search popovers'
  );
  assert.ok(
    characterModifierSuggestionBlock.includes('grid-template-columns: 22px minmax(0, 1fr);') &&
      characterModifierSuggestionBlock.includes('min-height: 32px;') &&
      characterModifierSuggestionBlock.includes('padding: var(--fab-space-1) var(--fab-space-2);'),
    'character modifier suggestions should use the same icon column and row rhythm as availability menu options'
  );
  assert.ok(
    characterModifierSuggestionIconBlock.includes('text-align: center;'),
    'character modifier suggestion icons should be centered inside the fixed icon column'
  );
});

test('manager character modifier search suggestions render with availability-style icon geometry', async () => {
  const context = await openLayoutContext({
    viewport: { width: 760, height: 320 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, sans-serif;
            }
            .harness-grid {
              display: grid;
              grid-template-columns: 320px 320px;
              gap: 32px;
              align-items: start;
            }
            .harness-availability-anchor {
              position: relative;
              width: 260px;
            }
            .fa-solid::before {
              content: "■";
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness-grid">
              <section>
                <!-- The availability menu’s own root rides this anchor since issue 1515: the
                     trigger’s rule is rooted at .fabricate-pill-select now, so a copy without
                     the namespace root would measure an unstyled button. The two classes are the
                     primitive’s own; the option rows below keep theirs, which stay
                     application-rooted under issue 1480. (No backticks in here — this whole
                     block is a JS template literal.) -->
                <div class="harness-availability-anchor fabricate-pill-select manager-availability-multi">
                  <button type="button" class="manager-availability-menu-button">
                    <span>Biomes</span>
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <div class="manager-availability-menu" role="listbox" aria-label="Biomes">
                    <button type="button" class="manager-availability-option" role="option">
                      <i class="fa-solid fa-tree" aria-hidden="true"></i>
                      <span>Ancient Forest</span>
                    </button>
                    <button type="button" class="manager-availability-option" role="option">
                      <i class="fa-solid fa-mountain" aria-hidden="true"></i>
                      <span>High Mountain</span>
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <label class="fabricate-search manager-search is-compact manager-character-modifier-add-search">
                  <i class="fa-solid fa-search" aria-hidden="true"></i>
                  <input type="search" value="wis" aria-label="Search character modifiers">
                  <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" role="listbox" aria-label="Character modifiers">
                    <button type="button" class="manager-tag-suggestion manager-character-modifier-add-suggestion" role="option">
                      <i class="fa-solid fa-user" aria-hidden="true"></i>
                      <span>Wisdom modifier</span>
                    </button>
                    <button type="button" class="manager-tag-suggestion manager-character-modifier-add-suggestion" role="option">
                      <i class="fa-solid fa-hand-fist" aria-hidden="true"></i>
                      <span>Strength modifier</span>
                    </button>
                  </div>
                </label>
              </section>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const rowFor = (element) => {
        const icon = element.querySelector('i');
        const label = element.querySelector('span');
        const rowStyle = getComputedStyle(element);
        const iconStyle = getComputedStyle(icon);
        return {
          row: rectFor(element),
          icon: rectFor(icon),
          label: rectFor(label),
          rowStyle: {
            display: rowStyle.display,
            gridTemplateColumns: rowStyle.gridTemplateColumns,
          },
          iconStyle: {
            position: iconStyle.position,
            textAlign: iconStyle.textAlign,
            transform: iconStyle.transform,
          },
        };
      };

      return {
        availabilityRows: Array.from(document.querySelectorAll('.manager-availability-option')).map(
          rowFor
        ),
        characterRows: Array.from(
          document.querySelectorAll('.manager-character-modifier-add-suggestion')
        ).map(rowFor),
      };
    });

    const availabilityFirst = report.availabilityRows[0];
    const characterFirst = report.characterRows[0];
    const availabilityInset = availabilityFirst.icon.left - availabilityFirst.row.left;
    const characterInset = characterFirst.icon.left - characterFirst.row.left;
    const availabilityGap = availabilityFirst.label.left - availabilityFirst.icon.right;
    const characterGap = characterFirst.label.left - characterFirst.icon.right;

    assert.equal(
      characterFirst.iconStyle.position,
      'static',
      'character suggestion icons should remain in normal row flow'
    );
    assert.equal(
      characterFirst.iconStyle.textAlign,
      'center',
      'character suggestion icons should be centered in their icon column'
    );
    assert.equal(
      characterFirst.rowStyle.gridTemplateColumns.startsWith('22px '),
      true,
      'character suggestion rows should reserve the availability icon column'
    );
    assert.ok(
      characterFirst.icon.right <= characterFirst.label.left,
      'character suggestion icons should sit before labels'
    );
    assert.ok(
      report.characterRows[0].icon.bottom <= report.characterRows[1].icon.top ||
        report.characterRows[1].icon.bottom <= report.characterRows[0].icon.top,
      'character suggestion icons from different rows should not overlap'
    );
    assert.ok(
      Math.abs(availabilityInset - characterInset) <= 3,
      'character suggestion icon inset should match availability rows'
    );
    assert.ok(
      Math.abs(availabilityGap - characterGap) <= 3,
      'character suggestion icon gap should match availability rows'
    );
  } finally {
    await context.close();
  }
});

// Issue 883: the Checks rail was the last manager inspector still building its own cards.
// It rendered the standing explanation as a `.manager-setup-card` — the format the numbered
// first-run "Set up X" procedures use — so this one rail had a card shell, a 38px icon tile
// and a 0.98rem heading no other inspector had, sitting directly beside a `.manager-inspector-card`.
// `.manager-setup-card` itself is NOT dead: the first-run procedures still use it, which is
// exactly why the rail could not simply be left alone.
test("the checks rail follows the Tool Studio's inspector convention", () => {
  const rightMenu = withoutComments(
    readFileSync(resolve(managerComponentDir, 'checks/ChecksRightMenu.svelte'), 'utf8')
  );

  for (const dead of [
    'manager-setup-card',
    'manager-setup-card-header',
    'manager-setup-links',
    'manager-setup-list',
  ]) {
    assert.equal(
      rightMenu.includes(dead),
      false,
      `${dead} is the first-run procedure format; the checks rail must not borrow it`
    );
  }

  // ── The heading convention INVERTED (issue 1096) ────────────────────────────────────
  //
  // This block used to assert the opposite: a `.manager-card-title` inside each card and
  // NO `.manager-kicker` anywhere on the rail. The maintainer made the Tool Studio's
  // inspector the authority for this rail's structure, and the Tool Studio's
  // (`ToolBehaviorPreview.svelte`) is a flat uppercase `.manager-kicker` naming the
  // section with its card directly beneath — never a card wrapping the section with a
  // title inside it. Two studios cannot both be right, so the assertion moves with the
  // ruling rather than being deleted.
  // RETARGETED at the primitive (issue 1427), for the reason the explainer-card assertion
  // above records: the shell class is `<InspectorCard>`'s to emit, and this rail passes only the
  // Active card's own modifier plus its on/off state.
  assert.match(
    rightMenu,
    /<InspectorCard\s+class=\{`manager-checks-active-card /,
    'the Active card wears the shared inspector-card shell'
  );
  assert.ok(
    rightMenu.includes('<p class="manager-kicker">{title}</p>'),
    'sections are named by a flat kicker above their card, as the Tool Studio does'
  );
  assert.equal(
    rightMenu.includes('manager-card-title'),
    false,
    'a card-title inside a rail card is the convention the Tool Studio replaced'
  );

  // …and the ACTIVATION section is named by nothing at all (issue 1096, maintainer inspector
  // comparison). The prototype gives that card no heading: the switch and the words beside it
  // are the statement, and an `ACTIVE` kicker over a card reading `On` said it twice. The
  // convention above is unchanged for the five sections that DO carry a heading.
  assert.equal(
    rightMenu.includes('{activeTitle}'),
    false,
    'the Active kicker is gone; the card states its own subject'
  );

  // Every heading row leads with the prototype's glyph. A kicker with no glyph is the reading
  // this replaced, and the snippet is the only place a heading is built — so one assertion
  // covers all five.
  assert.ok(
    rightMenu.includes('manager-checks-rail-head-icon'),
    'the heading row leads with a glyph'
  );

  // The two collapsibles are gone with it. The prototype has no disclosure anywhere in
  // this rail, and a panel whose whole content is one sentence of pre-roll copy has
  // nothing to collapse.
  for (const dead of ['RowDisclosure', 'manager-checks-rail-body', 'ExplainerCard']) {
    assert.equal(
      rightMenu.includes(dead),
      false,
      `${dead} was removed from the checks rail (issue 1096); it must not come back`
    );
  }

  // The procedure format stays available to the surfaces it belongs to, so this is a
  // conversion rather than a deletion.
  assert.ok(
    css.includes('.fabricate-manager .manager-setup-card {'),
    'the first-run procedure card keeps its own format'
  );
});

test('Tool replacement Component picker resists Foundry button height and image overrides', () => {
  const triggerBlock = blockFor(
    '.fabricate-button.manager-button.manager-salvage-component-trigger,\n' +
      '.fabricate-button.manager-button.manager-recipe-component-trigger,\n' +
      '.fabricate-button.manager-button.manager-tool-replacement-component-trigger'
  );
  const portraitBlock = blockFor(
    '.fabricate-manager .manager-salvage-component-trigger .manager-travel-portrait,\n' +
      '.fabricate-manager .manager-recipe-component-trigger .manager-travel-portrait,\n' +
      '.fabricate-manager .manager-tool-replacement-component-trigger .manager-travel-portrait'
  );
  const toolOverrideSelector =
    '.fabricate-manager .manager-tool-replacement-card .manager-tool-replacement-component-trigger';
  const toolOverrideStart = css.lastIndexOf(`${toolOverrideSelector} {`);
  const toolOverrideBlock = css.slice(toolOverrideStart, css.indexOf('}', toolOverrideStart) + 1);

  assert.ok(triggerBlock.includes('height: auto;'), 'the shared picker resets Foundry height');
  assert.ok(portraitBlock.includes('width: 24px;') && portraitBlock.includes('height: 24px;'));
  assert.ok(
    toolOverrideBlock.includes('padding: var(--fab-space-2);'),
    'the full-width Tool picker centers its portrait with equal inset padding'
  );
});

test('Tool library pins a full-width pagination footer outside its scrolling result region', () => {
  const mainBlock = blockFor('.fabricate-manager[data-manager-view="tools"] .manager-tools-main');
  const mainContentBlock = blockFor('.fabricate-manager .manager-tools-main-content');
  const libraryBlock = blockFor('.fabricate-manager .manager-tools-library-card');
  const scrollBlock = blockFor('.fabricate-manager .manager-tools-library-scroll');
  const footerBlock = blockFor('.fabricate-manager .manager-tools-browser-pagination');
  const paginationBlock = blockFor(
    '.fabricate-manager .manager-tools-browser-pagination .manager-pagination'
  );

  assert.ok(mainBlock.includes('padding: 0;'));
  assert.ok(mainBlock.includes('overflow: hidden;'));
  assert.ok(mainContentBlock.includes('flex: 1 1 auto;'));
  assert.ok(mainContentBlock.includes('overflow: hidden;'));
  assert.ok(libraryBlock.includes('min-height: 0;'));
  assert.ok(scrollBlock.includes('flex: 1 1 auto;'));
  assert.ok(scrollBlock.includes('overflow: hidden auto;'));
  assert.ok(footerBlock.includes('flex: 0 0 auto;'));
  assert.ok(footerBlock.includes('width: 100%;'));
  assert.ok(footerBlock.includes('margin-top: auto;'));
  assert.ok(paginationBlock.includes('width: 100%;'));
});

test('Tool Overview source and disabled-preview copy stays localized and exact', () => {
  const editor = en.FABRICATE.Admin.Manager.Tools.Editor;
  assert.equal(editor.CopySourceUuid, 'Copy source UUID');
  assert.equal(editor.SourceDropHint, 'Drop another Item here to replace the linked source.');
  assert.equal(editor.PreviewPrerequisitesDisabled, 'No prerequisites to use');
  assert.equal(editor.PreviewBonusDisabled, 'No check bonus');
});

test('every checks child route releases the shared inspector column', async () => {
  // The aside is unconditionally suppressed on a Checks route by the root's `!isChecksRoute`
  // guard, so the 300px column MUST be released for every child or the studio renders against
  // a dead strip. `recipe-edit` has this guard already (recipe-edit-placeholder.test.js); the
  // Checks half is the one that was missing.
  for (const view of [...CHECKS_VIEWS, CHECKS_REDIRECT_VIEW]) {
    const { bodyColumns } = await readWorkspaceGrid(1280, view);
    assert.equal(bodyColumns, 2, `${view} must render rail + main, with no dead inspector track`);
  }
  // A negative control: an ordinary route keeps the three-column body, so the assertion above
  // is discriminating rather than true of everything.
  const { bodyColumns } = await readWorkspaceGrid(1280, 'recipes');
  assert.equal(bodyColumns, 3, 'a non-editor route still has its inspector column');
});

test('the Checks Studio really renders into the classes those measurements measure', () => {
  // `readWorkspaceGrid` builds its DOM from CLASS LITERALS and measures the stylesheet, so
  // every assertion above survives ChecksView renaming its own wrapper — the measurement
  // would keep proving a fact about a shell the studio no longer uses. This is the join.
  const checksView = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/ChecksView.svelte'),
    'utf8'
  );
  for (const className of ['manager-environment-workspace', 'manager-environment-tab-panel']) {
    assert.match(
      withoutComments(checksView),
      new RegExp(`class="${className}"`),
      `ChecksView must render into .${className} for the restack measurements to be about it`
    );
  }
});

test('the recipe difficulty tier row shares the Difficulty card radio-card edges, and the bare card shell reintroduces the inset', async () => {
  const context = await openLayoutContext({
    viewport: { width: 960, height: 800 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();

    const edges = await checksRollEdges(
      page,
      'fabricate-card manager-inspector-card manager-checks-card'
    );
    assert.equal(
      edges.rowLeft,
      edges.radioLeft,
      `tier row left (${edges.rowLeft}) must equal the Difficulty card's radio-card left (${edges.radioLeft})`
    );
    assert.equal(
      edges.rowRight,
      edges.radioRight,
      `tier row right (${edges.rowRight}) must equal the Difficulty card's radio-card right (${edges.radioRight})`
    );
    assert.equal(
      edges.addTierLeft,
      edges.radioLeft,
      `the dashed Add control's left (${edges.addTierLeft}) must equal the radio-card left (${edges.radioLeft})`
    );
    assert.equal(
      edges.addTierRight,
      edges.radioRight,
      `the dashed Add control's right (${edges.addTierRight}) must equal the radio-card right (${edges.radioRight})`
    );

    // MUTATION PROOF, same page: reintroducing the defect — wrapping the tier list in the bare
    // `.manager-inspector-card` shell CraftingCheckEditor actually shipped — must desynchronise
    // the edges the assertions above exist to pin. If this cannot fail, they prove nothing.
    //
    // THE CONTROL ARM CARRIES THE FAMILY ROOT TOO (issue 1508). What this arm removes is the
    // CALLER's `manager-checks-card`, not the primitive's root: since the card family is rooted
    // at `fabricate-card`, an arm written without it matches no card rule at all, so both arms
    // would render unstyled and the `notEqual`s below would pass on two identical defaults —
    // a mutation proof turned into a vacuous one. Both arms are rooted; only the caller class
    // differs between them, which is the difference the assertions are about.
    const broken = await checksRollEdges(page, 'fabricate-card manager-inspector-card');
    assert.notEqual(
      broken.rowLeft,
      broken.radioLeft,
      'expected the bare card shell to inset the tier row past the radio-card left edge'
    );
    assert.notEqual(
      broken.rowRight,
      broken.radioRight,
      'expected the bare card shell to inset the tier row past the radio-card right edge'
    );
  } finally {
    await context.close();
  }
});

test('both interpolated card fixtures are rooted at the class the primitive emits', () => {
  // THE ONE CARRIER NO SCANNER SEES, GUARDED (issue 1508). The two card fixtures above build
  // their `class` attribute by INTERPOLATION — `<section class="${tiersWrapperClass}">` and
  // `<section class="${cardWrapperClass}">` — so `searchable-popover-area-scope.test.js`'s
  // fixture clauses, which walk `class="…"` in `tests/**`, cannot read either one. That blind
  // spot is the defect that cost issue 1502 a whole extra phase, when twelve `triggerClass="…"`
  // sites went unrepaired because the census probe only matched `class="manager-button`.
  //
  // AND THE MUTATION-CONTROL ARMS ARE THE HALF THAT FAILS SILENTLY. Each pair's control arm is a
  // one-sided `notEqual`, so an arm that lost the family root would go on satisfying it — the
  // bare CARD SHELL and an UNSTYLED `<section>` both differ from the studio card, and the suite
  // cannot tell which one it measured. Measured on this tree: unrooting only the two control
  // arms leaves all 128 tests in this file green. So the root is asserted on all four call
  // sites here, read out of `InspectorCard.svelte` rather than restated, which is what makes
  // that mutation red.
  const card = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/InspectorCard.svelte'),
    'utf8'
  );
  const array = card.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(array, 'InspectorCard must declare its emitted classes as one array literal');
  const root = (array[1].match(/'([a-z][\w-]*)'/) ?? [])[1];
  assert.equal(
    root,
    'fabricate-card',
    'InspectorCard must emit its family root as the FIRST literal of its class array; the ' +
      'fixtures below are rooted at whatever it emits, so a rename here is a rename there'
  );

  const suite = readFileSync(resolve(__dirname, 'manager-layout-tools.js'), 'utf8');
  const wrapperArguments = [
    ...suite.matchAll(
      /(?:checksRollEdges|modifiersCombinationRuleMetrics)\(\s*page,\s*'([^']*)'\s*\)/g
    ),
  ].map(([, value]) => value);
  assert.equal(
    wrapperArguments.length,
    4,
    `expected four interpolated card-fixture call sites and read ${wrapperArguments.length}. ` +
      'Either a call site moved to a form this reader cannot see — in which case retarget the ' +
      'reader rather than deleting the assertion — or one was added or removed.'
  );
  // TWO fixed arms and TWO controls, so the pair below is a discriminator rather than one value
  // four times: the controls drop the CALLER's `manager-checks-card` and keep the root.
  assert.deepEqual(
    [...new Set(wrapperArguments)].sort(compareStrings),
    [`${root} manager-inspector-card`, `${root} manager-inspector-card manager-checks-card`],
    'every interpolated card fixture must carry the family root; the control arms remove the ' +
      'CALLER class and nothing else, because "the primitive unrooted" is a different mutation ' +
      'from the one those tests are proofs of'
  );
});

test('CraftingCheckEditor really wraps the routed tier list in the checks-card contract', () => {
  // The two measurement tests above are built from class LITERALS, so this is the join: it
  // proves the real component renders the wrapper class combination the passing test measured,
  // not merely that some markup string with the right classes exists somewhere in this file.
  const craftingCheckEditor = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte'),
    'utf8'
  );
  // RETARGETED at the primitive (issue 1427). The shell is `<InspectorCard>`, which emits
  // `manager-inspector-card` itself and APPENDS this caller's `class`, so the rendered class
  // attribute the measurement above is built from is unchanged; what moved is where it is
  // written. The `=""` on the hook is load-bearing rather than cosmetic: a bare `data-*` on a
  // COMPONENT tag is the boolean `true` and would render `data-routed-tiers="true"`.
  assert.match(
    withoutComments(craftingCheckEditor),
    /<InspectorCard class="manager-checks-card" data-routed-tiers="">/,
    'the routed tier section must carry manager-checks-card, or it falls back to the bare ' +
      '.manager-inspector-card shell and its own 12px padding re-insets the tier row'
  );
});

test('the modifiers card and its combination-rule cards take the studio scale, and the bare shell reintroduces the generic one', async () => {
  const context = await openLayoutContext({
    viewport: { width: 960, height: 700 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();

    const fixed = await modifiersCombinationRuleMetrics(
      page,
      'fabricate-card manager-inspector-card manager-checks-card'
    );
    assert.equal(fixed.cardRadius, 11, "the studio card contract's own radius is 11px");
    assert.equal(
      fixed.optionPaddingLeft,
      13,
      "the combination-rule card's studio padding is 13px left/right"
    );
    assert.equal(
      fixed.optionPaddingTop,
      12,
      "the combination-rule card's studio padding is 12px top/bottom"
    );
    assert.equal(fixed.optionRadius, 10, "the combination-rule card's studio radius is 10px");

    // MUTATION PROOF, same page: reintroducing the defect — wrapping the card in the bare
    // `.manager-inspector-card` shell `CraftingModifierCatalogueCard` actually shipped with —
    // must desynchronise both the card's own look AND the combination-rule scale, because the
    // studio's selector for the latter is scoped to the ancestor carrying `manager-checks-card`
    // and fires only then. If this cannot fail, the assertions above prove nothing.
    //
    // BOTH ARMS CARRY `fabricate-card` (issue 1508), for the reason the tier-row control above
    // records: the arm removes the CALLER's class, never the family's root, and an unrooted
    // control arm would compare two unstyled defaults instead of two card treatments.
    const broken = await modifiersCombinationRuleMetrics(
      page,
      'fabricate-card manager-inspector-card'
    );
    assert.notEqual(
      broken.cardRadius,
      fixed.cardRadius,
      `expected the bare card shell to fall back off the studio's 11px radius (bare: ${broken.cardRadius}px)`
    );
    assert.notEqual(
      broken.cardBackground,
      fixed.cardBackground,
      'expected the bare card shell to fall back to the generic translucent fill'
    );
    assert.notEqual(
      broken.optionPaddingLeft,
      fixed.optionPaddingLeft,
      `expected the bare shell to drop the combination-rule cards off 13px padding ` +
        `(bare: ${broken.optionPaddingLeft}px)`
    );
    assert.notEqual(
      broken.optionGap,
      fixed.optionGap,
      `expected the bare shell to drop the combination-rule cards off the studio's 11px gap ` +
        `(bare: ${broken.optionGap})`
    );
  } finally {
    await context.close();
  }
});

test('CraftingModifierCatalogueCard really wraps its card in the checks-card contract', () => {
  // The measurement test above is built from class LITERALS, so this is the join: it proves the
  // real component renders the wrapper class combination the passing test measured, not merely
  // that some markup string with the right classes exists somewhere in this file.
  const modifierCatalogueSource = readFileSync(
    resolve(
      __dirname,
      '../../src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte'
    ),
    'utf8'
  );
  // RETARGETED at the primitive (issue 1427), same reasoning as the routed-tier join above.
  assert.match(
    withoutComments(modifierCatalogueSource),
    /<InspectorCard\s+class="manager-checks-card"\s+data-crafting-modifier-catalogue=/,
    'the modifiers card must carry manager-checks-card, or it falls back to the bare ' +
      '.manager-inspector-card shell and the combination-rule cards fall back to the generic scale'
  );
});

// ── ONE MODIFIER ROW, REACHING BOTH SCREENS THAT DRAW THE LIBRARY (issue 1373, round 4) ────
//
// The Tool Requirements bonus list drew the world modifier library as a stack of option cards.
// The Checks Studio draws the SAME roster — `characterLibraries.modifiers[]` — as compact rows
// one screen away, and reserves the card group for `How they combine`, a closed set of
// behaviours. The maintainer's ruling moves the bonus list onto that row.
//
// The markup is shared as a component (`ModifierLibraryRow.svelte`, asserted in
// `manager-contract.test.js`). What CANNOT be shared that way is the geometry: it lives in this
// sheet, anchored on `.manager-checks-card`, so the row rendered on any other route would have
// had NO metrics at all — a silent failure, since every class selector would still resolve. So
// the two anchors JOIN one block per cell rather than the Tool route authoring a second copy.
test('the modifier library row is one block per cell, reaching both screens that draw it', () => {
  // THE GLYPH LEFT THIS LIST AT ROUND 6, and deliberately. `proto:2332` draws the prerequisite
  // row's glyph BARE - `font-size:11px; color:var(--accent); flex:0 0 auto` and no box at all -
  // where `proto:2363` gives the bonus row the 26px tile this block states. The tile is not
  // suppressed by a rule resetting five properties; the block simply stops naming the one route
  // that does not draw one, and the bare face is stated once, on the ROW's own variant class, in
  // `the leading-control variant carries the reference bare glyph` below.
  const CELLS = [
    'manager-modifier-readonly-row',
    'manager-modifier-readonly-label',
    'manager-modifier-readonly-expression',
  ];
  for (const cell of CELLS) {
    // THREE ANCHORS SINCE ISSUE 1373's ROUND 5. The Tool tab's PREREQUISITE list joined the
    // bonus list on this row: `proto:4741` and `proto:4752` state the two lists' rows byte for
    // byte identically, so the reference draws ONE row where our tab drew two.
    assert.ok(
      css.includes(
        `.fabricate-manager .manager-checks-card .${cell},\n` +
          `.fabricate-manager .manager-tool-prerequisite-list .${cell},\n` +
          `.fabricate-manager .manager-tool-bonus-list .${cell} {`
      ),
      `${cell} must be ONE joined block naming all three routes, not a copy per Tool list`
    );
    // The non-vacuity half: a second declaring block would satisfy the join above and still
    // let the two screens drift, so each cell is declared exactly once OUTSIDE a variant — in
    // the joined selector, and nowhere else.
    //
    // A VARIANT BLOCK IS EXEMPT, and by NAME rather than by pattern. Round 6 gave the row two
    // declared variants, and `is-text-stacked` restates the expression cell's `flex` for a
    // COLUMN context the joined value was not written for. That is an extension of the one
    // owner rather than a second one, and it is reachable only from a row that asked for it.
    // Exempting the two variant classes and nothing else is what keeps a plain copy on a
    // third route failing here exactly as it did before.
    const declaringLines = css
      .split('\n')
      .filter((line) => line.trimEnd().endsWith(`.${cell} {`))
      .filter((line) => !/is-text-stacked|is-control-leading/.test(line));
    assert.equal(
      declaringLines.length,
      1,
      `${cell} must be declared exactly once outside the row's declared variants`
    );
  }
  // AND THE PICK CONTROL IS THE MANAGER'S SHIPPED RADIO, joined the same way. Foundry's core
  // sheet draws a native radio's inner chrome through ::before/::after that `appearance: none`
  // does not remove, so a hand-rolled themed radio is not a few lines — it is the whole block
  // `.manager-resolution-option` already carries, and a copy of it is a second owner.
  for (const rule of [
    "input[type='radio'] {",
    "input[type='radio']::before,",
    "input[type='radio']:checked {",
  ]) {
    assert.ok(
      css.includes(`.fabricate-manager .manager-tool-bonus-row ${rule}`),
      `the Tool bonus row must join the shipped radio treatment (${rule})`
    );
  }
  // The negative control on the widening: joining must not have reached radios generally.
  assert.equal(
    /\n\.fabricate-manager input\[type='radio'\]/.test(css),
    false,
    'the themed radio stays scoped to the surfaces that opt into it, never radios globally'
  );
});

// ── ONE ROW, TWO DECLARED VARIANTS, AND BOTH TRAVEL WITH THE PRIMITIVE (round 6) ────────────
//
// Round 5 put both Tool lists on this row and RECORDED two deviations from the reference rather
// than reproducing them. The maintainer's round-6 ruling is that the reference's two rows
// genuinely differ in exactly those two ways, and that the answer is declared variants on ONE
// component — not two components, and not one shape forced on both:
//
//   `proto:2331`-`2333`  control FIRST, glyph BARE at 11px, label stacked over the expression
//   `proto:2361`-`2364`  no leading control, label and expression INLINE, dot trailing
//
// Both variants are stated on the ROW's own class rather than on a route container, and that is
// what makes them the primitive's rather than the Tool tab's: a fourth caller opting in gets the
// rendering with the prop. A `.manager-tool-prerequisite-list`-anchored copy renders identically
// today and gives that caller nothing, so the rooting is asserted rather than left to reading.
test('the leading-control variant carries the reference bare glyph', () => {
  // The TILE keeps two anchors — the two routes that still draw one.
  const tile =
    '.fabricate-manager .manager-checks-card .manager-modifier-readonly-glyph,\n' +
    '.fabricate-manager .manager-tool-bonus-list .manager-modifier-readonly-glyph {';
  assert.ok(css.includes(tile), 'the glyph tile is one block naming the two routes that draw it');
  assert.equal(
    css.includes('.manager-tool-prerequisite-list .manager-modifier-readonly-glyph'),
    false,
    'and `proto:2332` draws that row bare, so the tile block does not reach it at all'
  );

  const bare =
    '.fabricate-manager .manager-modifier-readonly-row.is-control-leading > ' +
    '.manager-modifier-readonly-glyph {';
  assert.ok(
    css.includes(bare),
    "the bare glyph is stated once, on the row's own variant class, so it travels with the row"
  );
  const bareDeclarations = css.slice(css.indexOf(bare) + bare.length).split('}')[0];
  assert.match(bareDeclarations, /font-size: 11px/, '`proto:2332`');
  assert.match(bareDeclarations, /color: var\(--fab-accent\)/, 'and its accent ink');
  // The non-vacuity half. A bare glyph reached by RESETTING the tile is the same five properties
  // written twice in opposite directions, and the next property added to the tile would leak
  // straight through it. The variant states what the glyph IS.
  for (const reset of ['width:', 'height:', 'border-radius:', 'background:']) {
    assert.equal(
      bareDeclarations.includes(reset),
      false,
      `the bare face states what it is, never what the tile is not (${reset})`
    );
  }
});

test('the stacked-text variant is the row own, not the Tool tab', () => {
  const stack =
    '.fabricate-manager .manager-modifier-readonly-row.is-text-stacked > ' +
    '.manager-modifier-readonly-text {';
  assert.ok(css.includes(stack), "the text block is stated on the row's own variant class");
  const stackDeclarations = css.slice(css.indexOf(stack) + stack.length).split('}')[0];
  assert.match(stackDeclarations, /flex-direction: column/, '`proto:2333` sets name over value');
  assert.match(stackDeclarations, /min-width: 0/, 'so a long expression ellipses inside the row');

  // The expression cell is `flex: 1 1 0` in the INLINE row, which is what puts a trailing control
  // against the row's right edge with no auto margin. Left alone inside a COLUMN that same
  // declaration grows it to the row's height, so the variant restates it — at (0,4,0) against the
  // joined cell's (0,3,0) rather than relying on source order, because the blocks are far apart.
  const expression =
    '.fabricate-manager .manager-modifier-readonly-row.is-text-stacked ' +
    '.manager-modifier-readonly-expression {';
  assert.ok(css.includes(expression), 'and the expression cell is re-stated for the column');
  const expressionDeclarations = css
    .slice(css.indexOf(expression) + expression.length)
    .split('}')[0];
  assert.match(expressionDeclarations, /flex: 0 0 auto/, "it does not grow to the row's height");
  assert.match(
    expressionDeclarations,
    /margin-top: var\(--fab-space-2xs\)/,
    "`proto:2333`'s 2px, taken from the published scale rather than written as a literal"
  );

  // AND NEITHER VARIANT IS GATED ON A ROUTE. This is the assertion that keeps them the row's.
  for (const variant of ['is-control-leading', 'is-text-stacked']) {
    for (const line of css.split('\n').filter((row) => row.includes(variant))) {
      assert.equal(
        /manager-tool-[a-z]+-list|manager-checks-card/.test(line),
        false,
        `the ${variant} variant must not be gated on a route container: ${line.trim()}`
      );
    }
  }
});

// ── THE TWO PICK ROWS SHARE ONE SELECTED FACE, AT THE REFERENCE'S OWN TOKENS (round 5) ─────
//
// `proto:4741` and `proto:4752` are the same string: `background: bg1 | surface-active` and
// `border: 1px solid (border | accent-border)`. Round 4 gave the bonus row the manager's OPTION
// treatment instead, by joining `.manager-resolution-option.is-active` — which paints
// `--fab-accent-soft` behind a 3px inset accent BAR at the row's leading edge. That bar is a
// radio-card affordance, and it is doubly wrong on a checkbox list where several rows are active
// at once and a leading bar reads as "this is the chosen one".
//
// So the two rows take one joined block at the reference's tokens. The RADIO reset stays joined
// to the option treatment above, because that is Foundry's native-control chrome and is
// genuinely shared; only the row's own fill and edge move.
test('the Tool pick rows share one selected face, at the reference tokens', () => {
  const restingRow =
    '.fabricate-manager .manager-tool-prerequisite-row,\n' +
    '.fabricate-manager .manager-tool-bonus-row {';
  assert.ok(css.includes(restingRow), 'the two Tool pick rows are one block, not two copies');
  const activeRow =
    '.fabricate-manager .manager-tool-prerequisite-row.is-active,\n' +
    '.fabricate-manager .manager-tool-bonus-row.is-active {';
  assert.ok(css.includes(activeRow), 'and so is their selected face');
  const activeBlock = css.slice(css.indexOf(activeRow) + activeRow.length);
  const declarations = activeBlock.slice(0, activeBlock.indexOf('}'));
  assert.match(
    declarations,
    /background: var\(--fab-surface-active\)/,
    '`proto:4741` fills a selected row with `--surface-active`'
  );
  assert.match(
    declarations,
    /border-color: var\(--fab-accent-border\)/,
    'and edges it with `--accent-border`'
  );
  assert.equal(
    /box-shadow/.test(declarations),
    false,
    'and draws no inset bar: the reference states a fill and an edge and nothing else'
  );
  // The non-vacuity half. The bonus row must no longer ride the option treatment's own selected
  // block, or the block above would be a second declaration deciding nothing but source order.
  assert.equal(
    /\.manager-resolution-option\.is-active,\n\.fabricate-manager \.manager-tool-bonus-row\.is-active/.test(
      css
    ),
    false,
    'and no longer joins the option-card treatment for it'
  );
});

// ── THE SELECTION BOX IS THE REFERENCE'S, NOT A 14px TICK IN AN 18px SQUARE (round 5) ──────
//
// `proto:4740` states the prerequisite box exactly: `width:16px; height:16px; border-radius:5px;
// font-size:8px; color:var(--on-accent)`, over `background: transparent | var(--accent)` and
// `border: 1px solid (--border-strong | --accent)`, with `fa-solid fa-check` drawn only when
// checked. The shipped `sm` size declared NO font-size at all, so its tick inherited the row's
// 14px into an 18px box and touched all four edges.
//
// READ OUT OF THE COMPONENT, not the sheet: `SelectionCheckbox` owns its appearance in its own
// scoped block, and `styles/fabricate.css` is imported at `layer(modules)` while that block is
// injected unlayered — so a sheet rule aimed at these properties would be emitted, would match,
// and would have its declarations discarded with no gate objecting.
test('the small selection box is the reference box', () => {
  const { css: selectionCss } = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SelectionCheckbox.svelte')
  );
  const flat = selectionCss.replace(/\.svelte-[a-z0-9]+/g, '');
  const start = flat.indexOf('.fab-selection-check.is-sm {');
  assert.ok(start >= 0, 'the small size keeps a block of its own');
  const smDeclarations = flat.slice(start, flat.indexOf('}', start));
  assert.match(smDeclarations, /width: 16px/, '`proto:4740` sizes the box at 16px');
  assert.match(smDeclarations, /height: 16px/);
  assert.match(smDeclarations, /border-radius: 5px/);
  assert.match(
    smDeclarations,
    /font-size: 8px/,
    'and states the tick size, which the inherited 14px overflowed'
  );
  // The checked ink is the reference's `--on-accent`, stated for THIS size rather than for every
  // size: `md` and `lg` are the toolbar and browser boxes, whose own frames measured
  // `--fab-bg-1`, and re-inking those is a different screen's change.
  const onAccentStart = flat.indexOf('.fab-selection-check.is-sm.is-checked {');
  assert.ok(onAccentStart >= 0, 'the small box states its own checked ink');
  assert.match(
    flat.slice(onAccentStart, flat.indexOf('}', onAccentStart)),
    /color: var\(--fab-on-accent\)/,
    'which is the reference ink for a tick on an accent fill'
  );
});

// ── THE EYEBROW IS THE REFERENCE'S, AND IT IS THE SHARED CLASS THAT SAYS SO (issue 1373) ──
//
// `proto:2324` states every section eyebrow on this tab as `font: 700 8.5px var(--sans);
// letter-spacing: .11em; text-transform: uppercase; color: var(--subtle)`, and 63 further
// eyebrows across the reference state it identically. The shared `.manager-kicker` shipped at
// `0.72rem` — 11.52px, 35% over — with NO tracking and the MUTED ink, so every head that drew
// one read as a small heading rather than as the quiet rule it is.
//
// FIXED ON THE SHARED CLASS. Three tool screens had each re-achieved the value locally, and the
// world Tool entry still rendered two uppercase micro-labels at two sizes one tab apart. This
// test now pins the shared class itself; a component that still restates the same figures is
// harmless duplication, but a component that restates a DIFFERENT one is the defect returning.
//
// The cascade happens to favour a scoped rule in the card (the sheet is layered, the component
// block is not), but the component assertions read the COMPILED scoped CSS rather than the
// source, so what they pin is what Svelte emits.
test('the Tool rule card eyebrow carries the reference type, not the shared kicker size', () => {
  const start = css.indexOf('.fabricate-manager .manager-kicker {');
  assert.ok(start >= 0, 'the shared eyebrow keeps a block of its own');
  const declarations = css.slice(start, css.indexOf('}', start));
  assert.match(declarations, /font-size: 8\.5px/, '`proto:2324` sets the eyebrow at 8.5px');
  assert.match(declarations, /letter-spacing: 0\.11em/, 'and tracks it at .11em');
  assert.match(declarations, /font-weight: 700/, 'at the reference weight');
  assert.match(declarations, /text-transform: uppercase/, 'and the reference casing');
  assert.match(
    declarations,
    /color: var\(--fab-text-subtle\)/,
    'and inks it `--subtle`, one rung quieter than the muted this shipped with'
  );

  // AND NOTHING RESTATES A SECOND SIZE FOR IT. The eyebrow was 35% oversized for as long as it
  // took three tool screens to narrow it locally, one at a time, which is how the world entry
  // came to draw two uppercase micro-labels at two sizes one tab apart. A local block may still
  // carry the eyebrow's GEOMETRY — its grid cell, its margin, its flex rule — and one still has
  // to restate the size where a heading rule out-specifies the shared class. What none of them
  // may do is name a DIFFERENT figure, which is the defect returning under a new address.
  const kickerFontSize = /font-size: ([^;]+);/;
  for (const [file, selector] of [
    ['tools/ToolInheritCard.svelte', '.manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-eyebrow'],
    ['tools/ToolBrowserInspector.svelte', '.manager-tool-inspector-kicker'],
    ['tools/ToolRequirementsTab.svelte', '.manager-tool-bonus-kicker {'],
  ]) {
    const { css: componentCss } = scopedComponentCss(
      resolve(__dirname, `../../src/ui/svelte/apps/manager/${file}`)
    );
    const flat = componentCss.replace(/\.svelte-[a-z0-9]+/g, '');
    const blockStart = flat.indexOf(selector);
    assert.ok(blockStart >= 0, `${file} keeps a block for its eyebrow`);
    const block = flat.slice(blockStart, flat.indexOf('}', blockStart));
    const stated = kickerFontSize.exec(block);
    assert.ok(
      !stated || stated[1] === '8.5px',
      `${file} either defers to the shared eyebrow or restates its exact size, not ${stated?.[1]}`
    );
  }

  // The sheet's own two restatements answer to the same rule. `.manager-tool-rule-card-title h3`
  // out-specifies the shared class at (0,2,1), so the world entry's card head HAS to repeat the
  // size; the Tool Studio rail does not, and its retired 0.66rem was a third figure with no
  // reference behind it (`proto:2404`, `:2409`, `:2418`, `:2436`, `:2466` are all 8.5px).
  for (const selector of [
    '.fabricate-manager .manager-tool-rule-card-title h3.manager-kicker {',
    '.fabricate-manager .manager-tool-preview > .manager-kicker {',
  ]) {
    const blockStart = css.indexOf(selector);
    assert.ok(blockStart >= 0, `${selector} keeps a block of its own`);
    const block = css.slice(blockStart, css.indexOf('}', blockStart));
    const stated = kickerFontSize.exec(block);
    assert.ok(
      !stated || stated[1] === '8.5px',
      `${selector} states no size of its own, or the shared one, not ${stated?.[1]}`
    );
  }
});

// ── THE VALIDATION SUMMARY'S CLASSES AND THE SHEET'S RULES ARE ONE SET (issue 1373) ────────
//
// `EditorValidationSurface` emitted `is-${summary.status}` verbatim, and `summary.status` is the
// CALL SITE's word: four of the six sites spell it `pass`/`warn`/`block` and two spell it
// `clear`/`warning`/`blocked`. The sheet painted the second spelling only, plus one route-scoped
// `is-pass` for the Checks Studio — so on the Tool editor's Validation tab, at both scopes, a
// blocked record and a clean one rendered the same neutral card. The component's own doc
// asserted the sheet painted both.
//
// TWO DIRECTIONS, because one alone is half a guard. A sheet rule for a class the surface cannot
// emit is dead cascade; an emittable class with no rule is an unpainted status. Both were true
// at once here, which is exactly how it survived: each half looked deliberate beside the other.
//
// The canonical set is read out of the COMPONENT's own source rather than re-typed, so widening
// the vocabulary widens the gate and neither half can be greened by editing this file.
test('the validation summary paints every status class it can emit, and only those', () => {
  const surface = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/EditorValidationSurface.svelte'),
    'utf8'
  );

  const declared = /const SUMMARY_STATUSES = \[([^\]]+)\];/.exec(surface);
  assert.ok(declared, 'the surface declares its status vocabulary as a closed list');
  const statuses = declared[1].match(/'([a-z-]+)'/g).map((quoted) => quoted.slice(1, -1));
  assert.deepEqual(statuses, ['pass', 'warn', 'block'], 'and it is the ROW vocabulary, once');

  // The template may interpolate ONLY the resolved word. An `is-${summary.status}` here is the
  // defect itself: it lets a call site put any word it likes into a class name.
  assert.ok(
    surface.includes('`manager-recipe-rail-summary is-${summaryStatusClass}`'),
    'the summary class comes from the resolved status, never from the raw prop'
  );
  assert.ok(
    !/manager-recipe-rail-summary is-\$\{summary[.?]/.test(surface),
    'so the raw prop cannot reach a class name'
  );

  // Every alias resolves INTO the canonical set, so no call site's word escapes it.
  const aliasBlock = /const SUMMARY_STATUS_ALIASES = \{([^}]+)\};/.exec(surface);
  assert.ok(aliasBlock, 'the surface records the spellings its call sites reached it with');
  const aliasTargets = aliasBlock[1].match(/: '([a-z-]+)'/g).map((quoted) => quoted.slice(3, -1));
  assert.ok(aliasTargets.length >= 3, 'all three of the second spelling are mapped');
  for (const target of aliasTargets) {
    assert.ok(statuses.includes(target), `the alias resolves to \`${target}\`, a painted status`);
  }

  // DIRECTION ONE: every emittable class has a rule.
  for (const status of statuses) {
    assert.ok(
      css.includes(`.manager-recipe-rail-summary.is-${status} {`),
      `\`is-${status}\` is painted — an emittable status with no rule is an invisible one`
    );
    assert.ok(
      css.includes(
        `.manager-recipe-rail-summary.is-${status} .manager-recipe-rail-summary-medallion {`
      ),
      `\`is-${status}\` tones its medallion`
    );
  }

  // DIRECTION TWO: no rule anchors this element on a class the surface cannot emit.
  const painted = new Set(
    [...css.matchAll(/\.manager-recipe-rail-summary\.is-([a-z-]+)/g)].map((match) => match[1])
  );
  for (const status of painted) {
    assert.ok(
      statuses.includes(status),
      `the sheet paints \`is-${status}\`, which the surface can never emit`
    );
  }
});

test('the locked activation indicator offers no hover affordance', async () => {
  // `.manager-status-toggle.is-locked` is a `<span role="img">`: an indicator, not a control.
  // The hover rule excluded `:disabled` and `.is-disabled`, and a span can be neither, so the
  // pointer brightened a thing nothing happens when you press — a false affordance measurable
  // only in a browser, since the rule is a `:hover` over a `color-mix()`.
  const context = await openLayoutContext({ viewport: { width: 600, height: 300 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><div class="fabricate-manager">` +
        `<button type="button" class="fabricate-toggle manager-status-toggle is-on" id="live">` +
        `<span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>` +
        `<span class="manager-status-toggle-label">On</span></button>` +
        `<span class="fabricate-toggle manager-status-toggle is-locked is-on" role="img" aria-label="Check is on" id="locked">` +
        `<span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>` +
        `<span class="manager-status-toggle-label">On</span></span>` +
        `</div>`
    );
    const trackStyle = (id) =>
      page.evaluate((selector) => {
        const track = document.querySelector(selector);
        const style = getComputedStyle(track);
        return `${style.backgroundColor}|${style.borderColor}`;
      }, `#${id} .manager-status-toggle-track`);

    const liveResting = await trackStyle('live');
    const lockedResting = await trackStyle('locked');
    await page.hover('#live');
    const liveHovered = await trackStyle('live');
    await page.hover('#locked');
    const lockedHovered = await trackStyle('locked');

    // The positive control: the real switch DOES respond, so the negative below means something.
    assert.notEqual(liveHovered, liveResting, 'an actionable switch still lifts under the pointer');
    assert.equal(lockedHovered, lockedResting, 'the locked indicator does not');
  } finally {
    await context.close();
  }
});

test('the band fill is painted by rules that still match', async () => {
  const painted = await withBandStripPage(async (page) => {
    await page.setContent(
      bandStripFixture(
        `<div class="fabricate-manager"><div class="fab-band-strip-track">` +
          // `left`/`width` as the component emits them, so the band is a real bounded box
          // and the long name below has something to be truncated against.
          `<span class="fab-band-strip-band" id="tinted" style="left: 0%; width: 90px; --fab-band-strip-fill: rgb(20, 90, 40); --fab-band-strip-ink: rgb(250, 200, 10);">` +
          // A long localized tier name, because the rule that keeps it on one line is the
          // reason the strip's height is stable — a wrapped name shoves the tier rows down.
          `<span class="fab-band-strip-band-name" id="longname">Ausserordentlich Meisterhaft Geschmiedet</span></span>` +
          `<span class="fab-band-strip-band" id="plain">` +
          `<span class="fab-band-strip-band-name" id="plainname">Ruined</span></span>` +
          `</div>` +
          `</div>`
      )
    );
    return page.evaluate(() => {
      const read = (id) => {
        const node = document.getElementById(id);
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          width: node.getBoundingClientRect().width,
          position: style.position,
          overflow: style.overflow,
        };
      };
      const longName = document.querySelector('#longname');
      const longNameStyle = getComputedStyle(longName);
      return {
        tinted: read('tinted'),
        plain: read('plain'),
        inkedName: longNameStyle.color,
        plainName: getComputedStyle(document.querySelector('#plainname')).color,
        longName: {
          whiteSpace: longNameStyle.whiteSpace,
          textOverflow: longNameStyle.textOverflow,
          overflow: longNameStyle.overflow,
          // `line-height` computes to the keyword `normal` here, so the number of lines is
          // derived from the rendered height against the font size instead: one line lands
          // near 1.2em and two lines cannot fit under 2em.
          height: longName.getBoundingClientRect().height,
          fontSize: parseFloat(longNameStyle.fontSize),
          overflowed: longName.scrollWidth > longName.clientWidth,
        },
      };
    });
  });

  // The consuming rule exists AND reads the inline property: the same element with and
  // without it must not paint the same colour.
  assert.equal(painted.tinted.background, 'rgb(20, 90, 40)', 'the band paints its inline fill');
  assert.notEqual(
    painted.plain.background,
    painted.tinted.background,
    'an unset fill falls back to the declared neutral rather than to the tinted colour'
  );
  // The rest of the rule the mounted assertion also cannot see.
  assert.equal(painted.tinted.position, 'absolute', 'the band is placed against the track');
  assert.equal(painted.tinted.overflow, 'hidden', 'a long band name truncates rather than wraps');

  // The band NAME's own rule, which nothing measured until this fixture started stamping the
  // scope hash onto it. The component states the contract ("a long localized band name wraps
  // to nothing and truncates instead, so a wide name cannot change the strip's height"), and
  // a wrapped name is the failure: it grows the 44px track and pushes the tier rows down.
  assert.equal(painted.longName.whiteSpace, 'nowrap', 'a long tier name stays on one line');
  assert.equal(painted.longName.textOverflow, 'ellipsis', 'and is elided rather than clipped');
  assert.equal(painted.longName.overflow, 'hidden', 'with the overflow the ellipsis needs');
  assert.ok(
    painted.longName.height < painted.longName.fontSize * 2,
    `so it occupies one line box, got ${painted.longName.height}px at ${painted.longName.fontSize}px`
  );
  // The positive control: the name really is wider than its box, so "one line" is a fact
  // about the rule rather than about a string that happened to fit.
  assert.ok(painted.longName.overflowed, 'the fixture name is long enough to need truncating');

  // The band's INK is per-band and inline (issue 1096), so the name rule has to READ it. A
  // hard-coded `color: var(--fab-text)` here would leave the AA gate below measuring an ink no
  // band ever wears; the untinted control proves the declared fallback still applies.
  assert.equal(painted.inkedName, 'rgb(250, 200, 10)', 'a band name takes its own inline ink');
  assert.notEqual(painted.plainName, painted.inkedName, 'and falls back when the band omits one');

});

// The band-strip hint's separation from the first tier row (maintainer parity round 4). The
// REAL defect two attempts at this fix both missed was never the pixel value: `.fabricate-
// manager .manager-muted` (this sheet, below) states `margin: var(--fab-space-2xs) 0 0` — a
// SHORTHAND that zeroes `margin-bottom` — at the SAME (0,2,0) specificity as an unscoped
// `.fabricate-manager [data-outcome-band-strip-hint]` rule and LATER in source order, so the
// unscoped rule always lost and the hint's bottom margin computed to 0 no matter what number
// it declared. The fix is scoped to `[data-outcome-bands]` at (0,3,0), and 20px reproduces the
// prototype's rhythm without the 10px a deliberately-dropped column-header row occupied there
// (see the CSS comment on `[data-outcome-band-strip-hint]`, and `scripts/visual-parity`
// region `band-strip-hint`). This fixture mirrors the card's own DOM order — `.manager-muted`
// hint, then `.manager-checks-tier-list` — so a regression back to the unscoped selector, or
// to the shorthand reset winning again, reds here exactly as it would on screen.
test('the band-strip hint keeps its 20px separation from the first tier row', async () => {
  const gap = await withBandStripPage(async (page) => {
    await page.setContent(
      `<style>${css}</style>` +
        '<div class="fabricate-manager">' +
        '<section class="fabricate-card manager-inspector-card manager-checks-card" data-outcome-bands>' +
        '<div class="manager-checks-card-body is-roomy">' +
        '<p class="manager-muted" data-outcome-band-strip-hint>' +
        'Drag or arrow-key a band edge to move its threshold.</p>' +
        '<div class="manager-checks-tier-list" role="list">' +
        '<div class="manager-checks-tier-row" role="listitem">Common Craft &middot; DC 8</div>' +
        '<div class="manager-checks-tier-row" role="listitem">Uncommon Craft &middot; DC 12</div>' +
        '</div></div></section></div>'
    );
    return page.evaluate(() => {
      const hint = document.querySelector('[data-outcome-band-strip-hint]').getBoundingClientRect();
      const row = document.querySelector('.manager-checks-tier-row').getBoundingClientRect();
      return Math.round((row.top - hint.bottom) * 100) / 100;
    });
  });
  assert.equal(
    gap,
    20,
    `the hint must sit 20px above the first tier row (14px block separation + the list's own ` +
      `6px row cadence), got ${gap}px`
  );
});

test('every outcome band name clears WCAG AA in every shipped theme', async () => {
  // The ramp is READ OUT OF the editor rather than restated, so adding a tone or widening the
  // mix without re-checking contrast fails here. `bandFill`'s expression and the ink's are
  // pinned too — otherwise this could go on measuring a formula the component no longer uses.
  const toneNames = /const BAND_TONES = \[([^\]]+)\];/
    .exec(checkEditorSource)?.[1]
    .split(',')
    .map((name) => name.trim().replace(/^'|'$/g, ''));
  const toneMix = Number(/const BAND_TONE_MIX = (\d+);/.exec(checkEditorSource)?.[1]);
  const toneBase = /const BAND_TONE_BASE = '([^']+)';/.exec(checkEditorSource)?.[1];
  assert.ok(toneNames?.length >= 2, 'the ramp tones are readable');
  assert.ok(toneMix > 0, 'the mix percentage is readable');
  assert.match(
    checkEditorSource,
    /color-mix\(in oklab, var\(--fab-\$\{tone\}\) \$\{BAND_TONE_MIX\}%, \$\{BAND_TONE_BASE\}\)/,
    'bandFill still composes exactly the expression measured here'
  );
  // Each tone brings its OWN ink, which is the headroom this ramp is spending. Pinning the
  // expression stops the component quietly reverting to one `--fab-text` for the whole strip
  // while this file goes on measuring five inks it no longer paints.
  assert.match(
    checkEditorSource,
    /ink: `var\(--fab-\$\{tone\}-text\)`/,
    'and each band still takes its own tone-text ink'
  );
  // An OPAQUE base is what makes this measurable at all: mixed into a translucent surface the
  // fill's painted colour depends on whatever the strip is stacked on, so no fixture could
  // state the contrast a GM actually sees.
  assert.equal(toneBase, 'var(--fab-bg-0)', 'the ramp is mixed into an opaque base');

  const themes = [...css.matchAll(/:root\[data-fabricate-theme="([\w-]+)"\]/g)].map((m) => m[1]);
  assert.ok(themes.length >= 6, `every palette is measured, found ${themes.length}`);

  const measured = await withBandStripPage(async (page) => {
    const cells = themes
      .map(
        (theme) =>
          `<div class="fabricate" data-fabricate-theme="${theme}">` +
          `<div class="fab-band-strip-track">` +
          toneNames
            .map(
              (tone) =>
                `<span class="fab-band-strip-band" data-probe="${theme}|${tone}" ` +
                `style="--fab-band-strip-fill: color-mix(in oklab, var(--fab-${tone}) ${toneMix}%, ${toneBase}); ` +
                `--fab-band-strip-ink: var(--fab-${tone}-text);">` +
                `<span class="fab-band-strip-band-name">Masterwork</span></span>`
            )
            .join('') +
          `</div></div>`
      )
      .join('');
    await page.setContent(bandStripFixture(`<div class="fabricate-manager">${cells}</div>`));
    return page.evaluate(() => {
      // THE COLOUR IS RASTERISED, because scraping numbers out of the computed string is
      // what made the first version of this gate vacuous.
      //
      // `color-mix(in srgb, …)` does NOT compute to `rgb()`. It computes to
      // `color(srgb 0.303059 0.374588 0.346039)` — fractional channels in 0..1. The old
      // `colour.match(/[\d.]+/g)` read those three fractions as 0..255 channels, so EVERY
      // fill measured as very nearly black, every ratio came back at 12-19:1, and the gate
      // could not have failed whatever the ramp did. (`color-mix(in oklab, …)` computes to
      // `oklab(…)` and breaks it the same way, with the added trap of negative a/b channels
      // the regex silently drops the sign from.)
      //
      // A canvas does the colour-space conversion the browser itself does when painting, so
      // the bytes that come back are the pixels a GM actually sees, in any colour space.
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const rasterise = (value) => {
        // Two different sentinels: `fillStyle` IGNORES an unparseable value and keeps the
        // previous one, so painting the same colour twice from opposite sentinels is what
        // tells "the browser refused this" apart from "this really is that colour".
        const samples = ['#000000', '#ffffff'].map((sentinel) => {
          ctx.fillStyle = sentinel;
          ctx.fillStyle = value;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data];
        });
        const [first, second] = samples;
        if (first.some((channel, index) => channel !== second[index])) return null;
        return first;
      };
      const channel = (value) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const luminance = ([r, g, b]) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

      return [...document.querySelectorAll('[data-probe]')].map((band) => {
        const name = band.querySelector('.fab-band-strip-band-name');
        const fill = getComputedStyle(band).backgroundColor;
        const ink = getComputedStyle(name).color;
        const fillPixel = rasterise(fill);
        const inkPixel = rasterise(ink);
        if (!fillPixel || !inkPixel) {
          return { probe: band.dataset.probe, fill, ink, unreadable: true, ratio: 0 };
        }
        // Alpha, measured rather than pattern-matched: a translucent fill in ANY colour
        // space would make the ratio below a statement about a fixture, not about a GM's
        // screen. `rgba(…)` was the only shape the old test could recognise.
        const translucent = fillPixel[3] < 255 || inkPixel[3] < 255;
        const [light, dark] = [luminance(inkPixel), luminance(fillPixel)].sort((a, b) => b - a);
        return {
          probe: band.dataset.probe,
          fill,
          ink,
          fillPixel: `rgb(${fillPixel.slice(0, 3).join(', ')})`,
          translucent,
          ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100,
        };
      });
    });
  });

  // ── The measurement's own preconditions, asserted rather than assumed ──────────────────
  //
  // Every one of these is a way this gate can go green while measuring nothing, and the
  // shipped version of it tripped the second.

  // 1. The colour parsed at all. A value `fillStyle` refuses leaves the previous paint on the
  //    canvas, so a refusal must not read as a colour.
  const unreadable = measured.filter((m) => m.unreadable).map((m) => `${m.probe}: ${m.fill}`);
  assert.deepEqual(unreadable, [], `unrasterisable colours:\n- ${unreadable.join('\n- ')}`);

  // 2. The fill did not collapse to black, which is exactly where a `color(srgb 0.30 …)`
  //    string lands when it is scraped as three 0..255 channels — the failure that made this
  //    gate report a comfortable 12-19:1 for every band regardless of the ramp.
  assert.ok(
    measured.every((m) => m.fillPixel !== 'rgb(0, 0, 0)'),
    'a fill measured as pure black means the colour never survived conversion'
  );

  // 3. The inline fill is REACHING the element. Every probe painting the same pixels would
  //    mean the fixture's custom property is inert and the ramp is not under test at all.
  const distinctFills = new Set(measured.map((m) => m.fillPixel));
  assert.ok(
    distinctFills.size > 5,
    `the ramp must paint distinct fills, got ${distinctFills.size}: ${[...distinctFills].join(' ')}`
  );

  if (process.env.FAB_REPORT_BAND_AA) {
    for (const m of measured) {
      console.log(`${m.probe} ${m.ratio.toFixed(2)}:1 ${m.ink} on ${m.fillPixel}`);
    }
  }

  const failures = measured
    .filter((m) => m.translucent || m.ratio < 4.5)
    .map((m) =>
      m.translucent
        ? `${m.probe}: translucent fill ${m.fill}`
        : `${m.probe}: ${m.ratio.toFixed(2)}:1 (${m.ink} on ${m.fillPixel})`
    );

  assert.deepEqual(
    failures,
    [],
    `a band name at 0.72rem/600 is normal-size text and needs 4.5:1:\n- ${failures.join('\n- ')}`
  );

  // PER-BAND IDENTITY, measured per palette rather than inferred from the tone TOKENS having
  // different names. `foundry-native` shipped `--fab-accent` byte-identical to `--fab-warning`,
  // so five differently-named tones painted four colours and bands 2 and 5 were one band —
  // invisible to every check on this ramp, because they all reasoned about token names.
  const collisions = [];
  for (const theme of themes) {
    const inTheme = measured.filter((m) => m.probe.startsWith(`${theme}|`));
    for (let i = 0; i < inTheme.length; i += 1) {
      for (let j = i + 1; j < inTheme.length; j += 1) {
        if (inTheme[i].fillPixel !== inTheme[j].fillPixel) continue;
        collisions.push(
          `${inTheme[i].probe} and ${inTheme[j].probe} both paint ${inTheme[i].fillPixel}`
        );
      }
    }
  }
  assert.deepEqual(
    collisions,
    [],
    `two bands of one strip must never paint the same colour:\n- ${collisions.join('\n- ')}`
  );
});

test('a Modifiers card button renders exactly like the tool studio button of the same role', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const toolButtons = AUTHORITY_PROBES.map(
      (role) =>
        `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="tool-${role}"><i class="fas fa-save"></i><span>Save tool</span></button>`
    ).join('');
    const cardButtons = AUTHORITY_PROBES.map(
      (role) =>
        `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="card-${role}"><i class="fa-solid fa-plus"></i><span>Delete modifier</span></button>`
    ).join('');
    // The NEGATIVE CONTROL: the class string this card shipped before the conversion. If it
    // measured the same as the converted one, the primitive would be changing nothing and
    // every assertion below would pass vacuously.
    const unconverted =
      '<button type="button" class="manager-button is-danger" data-probe="card-unconverted"><i class="fa-solid fa-plus"></i><span>Delete modifier</span></button>';

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 16px; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <header class="manager-tool-edit-header">
              <div class="manager-header-actions manager-tool-edit-actions">${toolButtons}</div>
            </header>
            <section class="manager-edit-card manager-character-modifier-card">
              <div class="manager-modifier-body manager-character-modifier-editor">
                <div class="manager-character-modifier-actions">${cardButtons}${unconverted}</div>
              </div>
            </section>
          </main>
        </body>
      </html>
    `);

    const measured = await page.evaluate(() => {
      const read = (probe) => {
        const element = document.querySelector(`[data-probe="${probe}"]`);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          height: `${Math.round(element.getBoundingClientRect().height)}px`,
          borderRadius: style.borderRadius,
        };
      };
      return Object.fromEntries(
        ['tool-primary', 'card-primary', 'tool-danger', 'card-danger', 'card-unconverted'].map(
          (probe) => [probe, read(probe)]
        )
      );
    });

    for (const probe of Object.keys(measured)) {
      assert.ok(measured[probe], `${probe} rendered`);
    }

    // The gate would be vacuous if the sheet styled nothing: an unstyled button reports the
    // UA default on both sides and matches trivially. These pin that the authority's own
    // rule reached the fixture. 34px and 0.72rem are what `.manager-tool-edit-actions
    // .manager-button` renders, and 34px is now the whole header cluster's height too: the
    // 38px `.manager-header-actions` used to declare was RETIRED in issue 1118 rather than
    // arbitrated, because it tied the primitive at (0,3,0) and won on source order alone.
    assert.equal(measured['tool-primary'].fontSize, '11.52px', 'the tool studio label is 0.72rem');
    assert.equal(measured['tool-primary'].height, '34px', 'at the tool studio control height');

    // …and the control proves the conversion is doing work: the shipped bare class string
    // renders at the app's inherited body size, which is the reported defect.
    assert.notEqual(
      measured['card-unconverted'].fontSize,
      measured['tool-primary'].fontSize,
      'an unconverted card button must NOT already match the authority, or this gate proves nothing'
    );

    for (const role of AUTHORITY_PROBES) {
      const authority = measured[`tool-${role}`];
      const card = measured[`card-${role}`];
      for (const property of ['fontSize', 'fontWeight', 'padding', 'height', 'borderRadius']) {
        assert.equal(
          card[property],
          authority[property],
          `${role}: the Modifiers card's ${property} (${card[property]}) must match the tool studio's (${authority[property]})`
        );
      }
    }
  } finally {
    await context.close();
  }
});

test('the Checks rail states its own control type scale instead of inheriting one', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    // The rail is the workspace grid's 300px column, so the panel sibling is load-bearing:
    // without it the rail lands in the `minmax(0, 1fr)` track and every control measures a
    // width no product surface has.
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>${CHECKS_RAIL_FOUNDRY_CSS}</style>
          <style>${css}</style>
          <style>:root { --font-primary: Arial, sans-serif; }</style>
        </head>
        <body class="game">
          <div class="application theme-dark">
            <section class="window-content">
              <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="checks">
                <div class="manager-body">
                  <div class="manager-environment-workspace">
                    <div class="manager-environment-tab-panel"></div>
                    <aside class="manager-inspector manager-environment-inspector manager-checks-rail" data-checks-rail="crafting">
                      <section class="fabricate-card manager-inspector-card" data-checks-preview-as>
                        <div class="fabricate-picker manager-travel-picker manager-checks-preview-actor">
                          <button type="button" data-probe="preview-actor" data-checks-preview-actor
                            class="fabricate-button manager-button manager-travel-picker-trigger manager-checks-preview-actor-trigger">
                            <i class="fas fa-user-slash"></i><span class="manager-travel-picker-value">No actor</span>
                          </button>
                        </div>
                        <label class="fabricate-field manager-field">
                          <span class="visually-hidden">Preview against record</span>
                          <select data-probe="preview-record" data-checks-preview-record><option>Uncommon Craft</option></select>
                        </label>
                        <label class="fabricate-field manager-field">
                          <span>Result difficulties</span>
                          <input type="text" data-probe="preview-difficulties" value="6, 9, 14">
                        </label>
                      </section>
                      <section class="fabricate-card manager-inspector-card" data-checks-simulator>
                        <div class="manager-checks-simulator">
                          <button type="button" data-probe="roll" data-checks-simulator-roll
                            class="fabricate-button manager-button fab-manager-button is-primary manager-checks-simulator-roll">
                            <i class="fas fa-dice-d20"></i><span>Roll a test check</span>
                          </button>
                          <button type="button" data-probe="roll-unconverted"
                            class="manager-button is-primary">
                            <i class="fas fa-dice-d20"></i><span>Roll a test check</span>
                          </button>
                        </div>
                      </section>
                    </aside>
                  </div>
                </div>
              </div>
              <!-- OUTSIDE the rail, on purpose: the same field markup, unreached by the rail
                   rule, is what the two pickers measured before it existed. -->
              <div class="fabricate fabricate-manager" data-fabricate-theme="dark">
                <label class="fabricate-field manager-field">
                  <select data-probe="field-select-elsewhere"><option>Uncommon Craft</option></select>
                </label>
              </div>
            </section>
          </div>
        </body>
      </html>
    `);

    const measured = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-probe]')].map((element) => {
          const style = getComputedStyle(element);
          return [
            element.dataset.probe,
            {
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              width: Math.round(element.getBoundingClientRect().width),
              height: Math.round(element.getBoundingClientRect().height),
            },
          ];
        })
      )
    );

    // 11.5px/500 is the prototype's own declaration on both of its rail pickers
    // (`font: 500 11.5px var(--sans)`), read off the artefact rather than chosen. The
    // sandbox input is joined to them because it stands in the same card, in the same slot.
    for (const probe of ['preview-actor', 'preview-record', 'preview-difficulties']) {
      assert.equal(measured[probe].fontSize, '11.5px', `${probe} reads at the prototype's size`);
      assert.equal(measured[probe].fontWeight, '500', `${probe} reads at the prototype's weight`);
    }

    // The NEGATIVE CONTROL for the pickers: the identical `.manager-field` control one card
    // away still inherits 0.82rem/700, which is what the rail's two controls rendered as.
    assert.equal(
      measured['field-select-elsewhere'].fontSize,
      '13.12px',
      'a field control outside the rail is unchanged — this gate must not be measuring a ' +
        'global re-type of every select in the manager'
    );
    assert.notEqual(
      measured['preview-record'].fontSize,
      measured['field-select-elsewhere'].fontSize,
      'and the rail rule is therefore doing work'
    );

    // The roll action takes the PRIMITIVE's scale, not a value chosen here: 11.52px is
    // `.manager-button.fab-manager-button`'s 0.72rem, the Tool Studio's authority, and it is
    // within half a pixel of the prototype's own 11.5px/700 roll button.
    assert.equal(measured.roll.fontSize, '11.52px', 'the roll button reads at the primitive');
    assert.equal(measured.roll.fontWeight, '700');
    // The Foundry reset. Core's `button` rule pins a height and centres content; the button
    // is a full-width icon+label pair inside a card, so the rail block releases the height
    // and the width. `height: auto` is the load-bearing half — `min-height` does not cancel
    // a fixed `height`.
    assert.equal(measured.roll.height, 34, 'released from Foundry’s fixed button height');
    assert.equal(
      measured.roll.width,
      measured['preview-record'].width,
      'and spans the card exactly as the controls above it do'
    );

    // The NEGATIVE CONTROL for the button: the bare class string it shipped with lands on
    // Foundry's app base, which is the reported "font is too large".
    assert.equal(
      measured['roll-unconverted'].fontSize,
      '14px',
      'the unconverted class string still bleeds Foundry’s 14px app base'
    );
    assert.notEqual(
      measured.roll.fontSize,
      measured['roll-unconverted'].fontSize,
      'so converting to the primitive is what changes the reading'
    );
  } finally {
    await context.close();
  }
});

test('the modifier row gives every field room for its longest content at every manager width', async () => {
  const context = await openLayoutContext({ deviceScaleFactor: 1 });

  try {
    const stepper = (bound) =>
      `<div class="fab-stepper is-fill"><button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button><input type="number" class="fab-stepper-input" data-stepper-input data-world-modifier-field="${bound}" placeholder="Unbounded"><button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button></div>`;
    const boundField = (bound, caption) =>
      `<div class="fabricate-field manager-field manager-modifier-bound-field" data-bound="${bound}"><span class="manager-recipe-micro-label">${caption}</span>${stepper(bound)}</div>`;
    // The icon field's picker root element, which this copy omitted until issue 1470. The
    // trigger's geometry rules are rooted at it now, so without it the field measures a bare
    // button rather than the 38px combo the row is being asserted to have room for. Since issue
    // 1503 the product writes the SHARED primitive's pair on that element too, because the
    // picker renders through `SearchablePopover` and the caller's own pair arrives through
    // `pickerClass` — so this copy carries all four. The measurement was re-run and is
    // unchanged: the extra classes add `position: relative; min-width: 0`, and the field's width
    // comes from its grid track.
    const editor = `
      <div class="manager-modifier-body manager-character-modifier-editor">
        <div class="manager-modifier-name-row">
          <div class="fabricate-field manager-field manager-modifier-icon-field"><span>Icon</span><div class="fabricate-picker manager-travel-picker fabricate-icon-picker essence-icon-picker"><button type="button" class="essence-icon-picker-trigger"><i class="fas fa-leaf"></i></button></div></div>
          <label class="fabricate-field manager-field manager-modifier-label-field"><span>Label</span><input type="text" data-modifier-label value="Herbalism"></label>
          <div class="manager-modifier-bounds-row" data-world-modifier-bounds="mod-probe">
            ${boundField('min', 'Minimum')}${boundField('max', 'Maximum')}
          </div>
        </div>
      </div>`;

    const failures = [];
    for (const width of MODIFIER_BOUNDS_ROW_WIDTHS) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 800 });
      try {
        await page.setContent(`
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8">
              <style>
                ${css}
                ${stepperScoped.css}
                body { margin: 0; font-family: Arial, sans-serif; font-size: 16px; }
                /* The real manager container, so the shipped fabricate-manager container
                   queries resolve against this width rather than never matching. */
                .fabricate-manager { container-type: inline-size; container-name: fabricate-manager; }
                .manager-settings-pane { box-sizing: border-box; width: 100%; padding: 16px; }
                .fas::before { content: "x"; }
              </style>
            </head>
            <body>
              <main class="fabricate-manager"><div class="manager-settings-pane">${withStepperHash(editor)}</div></main>
            </body>
          </html>
        `);

        const report = await page.evaluate(() => {
          const measureText = (element, text) => {
            const style = getComputedStyle(element);
            const context = document.createElement('canvas').getContext('2d');
            context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            return context.measureText(text).width;
          };
          const row = document.querySelector('.manager-modifier-name-row');
          const label = document.querySelector('[data-modifier-label]');
          const labelStyle = getComputedStyle(label);
          return {
            rowOverflow: row.scrollWidth > row.clientWidth + 1,
            label: {
              content: Math.round(
                label.getBoundingClientRect().width -
                  Number.parseFloat(labelStyle.paddingLeft) -
                  Number.parseFloat(labelStyle.paddingRight)
              ),
              // The longest label the product itself authors, measured in the FIELD'S OWN
              // font rather than compared to a round number someone picked.
              needed: Math.round(measureText(label, 'Herbalism Training')),
            },
            bounds: ['min', 'max'].map((bound) => {
              const input = document.querySelector(`[data-world-modifier-field="${bound}"]`);
              const style = getComputedStyle(input);
              const content =
                input.getBoundingClientRect().width -
                Number.parseFloat(style.paddingLeft) -
                Number.parseFloat(style.paddingRight);
              return {
                bound,
                content: Math.round(content),
                needed: Math.round(measureText(input, input.placeholder)),
                fieldWidth: Math.round(
                  document.querySelector(`[data-bound="${bound}"]`).getBoundingClientRect().width
                ),
              };
            }),
          };
        });

        if (report.rowOverflow) failures.push(`${width}px: the row overflows its track`);
        if (report.label.content < report.label.needed) {
          failures.push(
            `${width}px label: "Herbalism Training" needs ${report.label.needed}px and the field offers ${report.label.content}px`
          );
        }
        for (const bound of report.bounds) {
          if (bound.content < bound.needed) {
            failures.push(
              `${width}px ${bound.bound}: "Unbounded" needs ${bound.needed}px and the input offers ${bound.content}px (field ${bound.fieldWidth}px)`
            );
          }
        }
      } finally {
        await page.close();
      }
    }

    assert.deepEqual(
      failures,
      [],
      `a truncated "Unbounded" reads as "Unb" and destroys the empty-is-not-zero contract:\n- ${failures.join('\n- ')}`
    );
  } finally {
    await context.close();
  }
});

test('the simulator face tile layers the rolled digit ON the medallion, not beside it', async () => {
  // Svelte scopes DESCENDANTS with `:where(.svelte-<hash>)`, so the hash has to land on
  // every element the rules reach — not only on the token `withScopeHash` stamps. A
  // fixture that stamped the wrapper alone would compute `position: static` and read as
  // a defect in the component rather than in the fixture.
  const hash = previewScoped.hashClass;
  const view = await renderWithCascade(
    `<div class="fabricate-manager"><div class="manager-checks-simulator-readout ${hash}">` +
      `<span class="manager-checks-simulator-face ${hash}" id="tile">` +
      `<span style="display:block;width:44px;height:44px"></span>` +
      `<small id="value" class="${hash}"><strong class="${hash}">20</strong>` +
      `<span class="${hash}">d20</span></small>` +
      `</span></div></div>`,
    [css, previewScoped.css],
    { viewport: { width: 900, height: 400 } }
  );
  try {
    const tile = (await view.measure('#tile')).box;
    const digit = await view.measure('#value');
    const value = digit.box;
    const geometry = {
      position: digit.style.position,
      overlaps:
        value.left >= tile.left - 0.5 &&
        value.right <= tile.right + 0.5 &&
        value.top >= tile.top - 0.5 &&
        value.bottom <= tile.bottom + 0.5,
      width: Math.round(value.width),
      tileWidth: Math.round(tile.width),
    };
    assert.equal(geometry.position, 'absolute', 'the rule that positions it still matches');
    assert.equal(geometry.tileWidth, 44, 'the tile is the medallion’s own 44px square');
    assert.equal(
      geometry.width,
      geometry.tileWidth,
      '`inset: 0` makes the digit span the tile; without it the box collapses to its content'
    );
    assert.ok(geometry.overlaps, 'the digit sits INSIDE the tile rather than beside it');
  } finally {
    await view.close();
  }
});

test('an odds row keeps its bar between a bounded label and a pinned percentage', async () => {
  const hash = oddsScoped.hashClass;
  const view = await renderWithCascade(
    `<div class="fabricate-manager"><ul class="manager-checks-odds-list ${hash}">` +
      `<li class="manager-checks-odds-row ${hash}" id="row">` +
      `<span class="manager-checks-odds-label ${hash}" id="label">` +
      `An extremely long localized outcome tier name that must not squeeze the bar</span>` +
      `<span class="fab-fill-bar" id="bar" style="display:block;height:6px"></span>` +
      `<span class="manager-checks-odds-percent ${hash}" id="percent">100%</span>` +
      `</li></ul></div>`,
    [css, oddsScoped.css],
    { viewport: { width: 320, height: 300 } }
  );
  try {
    const row = await view.measure('#row');
    // `overflow` is a SHORTHAND, so it is asked for by name; the enumerated snapshot holds
    // `overflow-x`/`-y` only and an unnamed read would be `undefined` against every expectation.
    const label = await view.measure('#label', ['overflow']);
    const bar = await view.measure('#bar');
    const percent = await view.measure('#percent');
    const geometry = {
      display: row.style.display,
      label: Math.round(label.box.width),
      bar: Math.round(bar.box.width),
      percent: Math.round(percent.box.width),
      overflow: label.style.overflow,
    };
    assert.equal(geometry.display, 'grid', 'the grid rule still matches this row');
    assert.equal(geometry.overflow, 'hidden', 'and the label truncates rather than wrapping');
    assert.ok(
      geometry.label <= 90,
      `a long tier name is bounded at the 5.5rem track (got ${geometry.label}px)`
    );
    assert.ok(geometry.bar > 40, `the bar keeps real width beside it (got ${geometry.bar}px)`);
  } finally {
    await view.close();
  }
});
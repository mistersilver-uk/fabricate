import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

// ONE Chromium process for this whole file (issue tests-perf follow-up). This file carries
// every computed-style parity guard in the repo and used to launch a fresh browser per test —
// 20 separate `chromium.launch()` calls — and Chromium's own startup cost dominated the file's
// runtime badly enough to blow its CI budget under load. A browser process is expensive to
// start and cheap to reuse; the isolation that actually matters is per-TEST state (cookies,
// `document`, injected markup), which a fresh browser CONTEXT gives for a fraction of the cost.
// So every test below opens its own `sharedBrowser.newContext()` (or `.newPage()` on one, where
// a helper hands back a bare page) and closes ONLY that context, never the shared browser.
let sharedBrowser;

before(async () => {
  sharedBrowser = await chromium.launch();
});

after(async () => {
  await sharedBrowser.close();
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const colorPickerPath = resolve(
  __dirname,
  '../../src/ui/svelte/components/ManagerColorPicker.svelte'
);
const enPath = resolve(__dirname, '../../lang/en.json');
// The shared no-state and standing-statement primitives keep their CSS in their own
// scoped `<style>` blocks (issue 785), not in the global sheet, so the rules that used to
// be read out of `styles/fabricate.css` are read out of the component source instead.
const emptyStatePath = resolve(__dirname, '../../src/ui/svelte/apps/manager/EmptyState.svelte');
const calloutPath = resolve(__dirname, '../../src/ui/svelte/apps/manager/Callout.svelte');
// The shared side-panel explainer card and icon fact row (issue 881) follow the same rule:
// their appearance is in their own scoped block, so it is read out of the component.
const explainerCardPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/ExplainerCard.svelte'
);
const iconFactRowPath = resolve(__dirname, '../../src/ui/svelte/apps/manager/IconFactRow.svelte');
// The shared chip (issue 883) owns its appearance in its own scoped block for the same
// reason, so its scale is read out of the component rather than the global sheet.
const chipPath = resolve(__dirname, '../../src/ui/svelte/apps/manager/Chip.svelte');
const partyExpandedBodyPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/PartyExpandedBody.svelte'
);
const partiesTabPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/GatheringPartiesTab.svelte'
);
const partiesTabSource = readFileSync(partiesTabPath, 'utf8');
const partiesTabScoped = scopedComponentCss(partiesTabPath);
const managerComponentDir = resolve(__dirname, '../../src/ui/svelte/apps/manager');
const css = readFileSync(cssPath, 'utf8');
const colorPickerSource = readFileSync(colorPickerPath, 'utf8');
const emptyStateSource = readFileSync(emptyStatePath, 'utf8');
const calloutSource = readFileSync(calloutPath, 'utf8');
const explainerCardSource = readFileSync(explainerCardPath, 'utf8');
const iconFactRowSource = readFileSync(iconFactRowPath, 'utf8');
const chipSource = readFileSync(chipPath, 'utf8');
const en = JSON.parse(readFileSync(enPath, 'utf8'));

// Only the scoped `<style>` block, with CSS comments stripped. Both primitives document the
// global layout-context rules they deliberately left behind, and those doc comments quote
// selectors (and the words `<style>`) — matching prose instead of a rule would assert
// nothing, so the block is located by its column-0 delimiters rather than by a loose match.
const STYLE_OPEN = '\n<style>\n';

function scopedStyles(componentSource) {
  const start = componentSource.lastIndexOf(STYLE_OPEN);
  const end = componentSource.lastIndexOf('\n</style>');
  if (start < 0 || end <= start) return '';
  return componentSource.slice(start + STYLE_OPEN.length, end).replace(/\/\*[\s\S]*?\*\//g, '');
}

const emptyStateStyles = scopedStyles(emptyStateSource);
const calloutStyles = scopedStyles(calloutSource);
const explainerCardStyles = scopedStyles(explainerCardSource);
const iconFactRowStyles = scopedStyles(iconFactRowSource);
const chipStyles = scopedStyles(chipSource);

// "This name must not survive" assertions read component SOURCE, and this repo's components
// carry long doc comments that name the very thing they replaced — which is the point of
// them. Stripping HTML and block comments keeps such a guard pointed at markup and code.
// `//` line comments are deliberately left in place: a URL contains `//`, so removing to
// end-of-line would delete real code (`https://…/fabricate` in the checks rail, for one).
function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// A caller here names the RULE it wants to read, and a rule's identity is not the exact
// characters the sheet spells its prelude with. Three things rewrite that prelude without
// changing which rule it is, all of them from issue 1118: `ManagerButton` chains a second
// marker class into the same compound wherever a rule had to be lifted above the primitive
// (`.manager-button` becomes `.manager-button.fab-manager-button`); every rule that states a
// RESTING PAINT gained a `:not(:disabled)` qualifier, so that a switched-off button paints
// from the disabled rule rather than from its role; and a prelude that grows past the print
// width is re-wrapped onto continuation lines.
//
// A literal substring lookup cannot see through any of them, and it fails SILENTLY: it
// returns '', every `.includes(...)` below reads false, and the assertion fails naming a
// property that is in fact declared. That is a lookup breaking, not a stylesheet regressing,
// and the two must not be indistinguishable — both of the tests that broke here reported
// "should use a light green outline treatment" and "should have an amber warning-action
// button style" about rules that still say exactly that.
//
// So this matches a PATTERN of the selector: whitespace flexible, the primitive marker
// optional at each `.manager-button`, and the enabled-state qualifier optional at the end of
// each selector in the list. The list is split on a comma-NEWLINE, which is how both this
// sheet and these callers write one; the comma inside `:is(select, input…)` is left alone.
const CHAINED_MANAGER_BUTTON = String.raw`\.manager-button(?:\.fab-manager-button)?`;
const OPTIONAL_ENABLED_STATE = String.raw`(?::not\(:disabled\))?`;

function selectorPattern(selector) {
  return selector
    .split(',\n')
    .map(
      (one) =>
        one
          .trim()
          .replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
          .replaceAll(/\s+/g, String.raw`\s+`)
          .replaceAll(String.raw`\.manager-button`, CHAINED_MANAGER_BUTTON) + OPTIONAL_ENABLED_STATE
    )
    .join(String.raw`,\s+`);
}

function blockIn(source, selector) {
  const match = source.match(new RegExp(`${selectorPattern(selector)}\\s*\\{[\\s\\S]*?\\}`));
  return match?.[0] || '';
}

function blockFor(selector) {
  return blockIn(css, selector);
}

// The global sheet no longer styles a chip at all — the base rule and its eight tone rules
// were deleted with the last conversion (issue 883), because a surviving base is what the
// next hand-rolled chip would land on. So a real-browser fixture that renders a chip and
// loads only `styles/fabricate.css` now measures an UNSTYLED chip: no border, no padding,
// no min-height. Every geometry assertion downstream of one would still pass, and would be
// measuring something the app never renders.
//
// These two restore the truth by reproducing what Svelte actually ships: `chipCss` is the
// component's real compiled CSS, which each fixture places AFTER the global sheet exactly
// as `css: 'injected'` injects it, and `withChipHash` stamps the real scoping hash onto the
// fixture's chips so the specificity matches too. Both halves are needed — the CSS without
// the hash matches nothing, and the hash without the ordering proves the wrong winner.
// `withScopeHash` matches the whole `manager-chip` token only, so a `manager-chip-row`
// container is left alone.
const chipScoped = scopedComponentCss(chipPath);
const chipCss = chipScoped.css;
const partyExpandedBodyScoped = scopedComponentCss(partyExpandedBodyPath);

function withChipHash(markup) {
  return withScopeHash(markup, 'manager-chip', chipScoped.hashClass);
}

async function readRenderedToolGeometry(width, view) {
  const context = await sharedBrowser.newContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const editor =
      view === 'tool-edit'
        ? `<main class="manager-main manager-tool-edit-main" data-tool-edit-view>
          <header class="manager-tool-edit-header" data-tool-editor-header><div class="manager-tool-edit-header-main"><div class="manager-tool-edit-identity"><div class="manager-tool-edit-identity-copy"><h2>Smith's Hammer with a deliberately long localized identity</h2><p>Linked game-world Item</p></div></div><div class="manager-tool-edit-actions"><button class="manager-button fab-manager-button is-ghost">Back</button><button class="manager-button fab-manager-button is-danger">Delete</button><button class="manager-button fab-manager-button is-primary" data-tool-editor-save>Save Tool</button></div></div></header>
          <div class="manager-tool-editor-tabs"><button>Overview</button><button>Breakage</button><button>Requirements</button><button>Validation</button></div>
          <div class="manager-tool-edit-composition"><section class="manager-tool-editor-panel" data-tool-editor-panel><div class="manager-tool-tab-stack">
            <section class="manager-tool-authority-readonly"><span class="manager-tool-authority-icon">A</span><div><p class="manager-kicker">System breakage</p><h3>Tool-specific</h3><p>Set for every Tool from the Tools library.</p></div><span class="manager-chip">System-wide</span></section>
            <section class="manager-tool-breakage-method"><div class="manager-tool-section-heading"><div><p class="manager-kicker">Breakage</p><h3>How this Tool breaks</h3></div><p>Each Tool tracks its own breakage. Pick the method for this one.</p></div><fieldset class="manager-field is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards" data-radio-card-group="tool-breakage-mode">
              <legend class="manager-resolution-mode-legend">Breakage mechanic</legend>
              <div class="manager-resolution-mode-options" style="--manager-radio-card-columns: 3">
                <label class="manager-resolution-option is-active" data-radio-card-option="limitedUses"><input type="radio" name="tool-breakage-mode" value="limitedUses" checked><span class="manager-resolution-option-icon" data-tool-choice-icon><i class="fas fa-hourglass-half"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name" data-tool-choice-title>Limited uses</span><span class="manager-resolution-option-desc" data-tool-choice-description>A fixed number of uses, then it breaks.</span></span></label>
                <label class="manager-resolution-option" data-radio-card-option="breakageChance"><input type="radio" name="tool-breakage-mode" value="breakageChance"><span class="manager-resolution-option-icon" data-tool-choice-icon><i class="fas fa-percent"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name" data-tool-choice-title>Breakage chance</span><span class="manager-resolution-option-desc" data-tool-choice-description>A % chance to break each use.</span></span></label>
                <label class="manager-resolution-option" data-radio-card-option="diceExpression"><input type="radio" name="tool-breakage-mode" value="diceExpression"><span class="manager-resolution-option-icon" data-tool-choice-icon><i class="fas fa-dice-d20"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name" data-tool-choice-title>Dice expression</span><span class="manager-resolution-option-desc" data-tool-choice-description>Roll a separate breakage check.</span></span></label>
              </div>
            </fieldset></section>
          </div></section><aside class="manager-tool-preview" data-tool-behavior-preview><div class="manager-tool-preview-identity"><div><h3>Smith's Hammer</h3></div></div><ul class="manager-tool-preview-rules"><li>5 uses</li></ul></aside></div>
        </main>`
        : `<main class="manager-main manager-tools-main"><div class="manager-tools-library-list"><article data-manager-tool-id="hammer"><button class="manager-tools-select-target"><span></span><span class="manager-tools-library-copy"><strong>Smith's Hammer</strong></span></button><div class="manager-tools-library-actions"></div></article></div></main><aside class="manager-inspector"><section data-tool-browser-inspector>Inspector</section></aside>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div style="width:${width}px;height:686px"><div class="fabricate-manager" data-manager-view="${view}"><div class="manager-body"><aside class="manager-rail">Rail</aside>${editor}</div></div></div>`
      )
    );
    return await page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value
          ? {
              left: value.left,
              right: value.right,
              top: value.top,
              bottom: value.bottom,
              width: value.width,
            }
          : null;
      };
      const styleValue = (selector, property) => {
        const value = document.querySelector(selector);
        return value ? getComputedStyle(value)[property] : null;
      };
      const rects = (selector) =>
        Array.from(document.querySelectorAll(selector), (node) => {
          const value = node.getBoundingClientRect();
          return {
            left: value.left,
            right: value.right,
            top: value.top,
            bottom: value.bottom,
            width: value.width,
          };
        });
      const root = document.querySelector('.fabricate-manager');
      return {
        root: rect('.fabricate-manager'),
        rail: rect('.manager-rail'),
        main: rect('.manager-main'),
        inspector: rect('.manager-inspector'),
        header: rect('[data-tool-editor-header]'),
        actions: rect('.manager-tool-edit-actions'),
        tabs: rect('.manager-tool-editor-tabs'),
        panel: rect('[data-tool-editor-panel]'),
        preview: rect('[data-tool-behavior-preview]'),
        authority: rect('.manager-tool-authority-readonly'),
        authorityTitle: rect('.manager-tool-authority-readonly h3'),
        authorityCopy: rect('.manager-tool-authority-readonly p:last-child'),
        choiceOptions: rect('.manager-resolution-mode-options'),
        choices: rects('.manager-resolution-option'),
        choiceBodies: rects('.manager-resolution-option-body'),
        panelContainerType: styleValue('[data-tool-editor-panel]', 'containerType'),
        panelPaddingInline: Number.parseFloat(
          styleValue('[data-tool-editor-panel]', 'paddingLeft')
        ),
        authorityTitleSize: Number.parseFloat(
          styleValue('.manager-tool-authority-readonly h3', 'fontSize')
        ),
        authorityCopySize: Number.parseFloat(
          styleValue('.manager-tool-authority-readonly p:last-child', 'fontSize')
        ),
        previewBackground: styleValue('[data-tool-behavior-preview]', 'backgroundColor'),
        previewCardBackground: styleValue('.manager-tool-preview-identity', 'backgroundColor'),
        overflow: root.scrollWidth > root.clientWidth,
      };
    });
  } finally {
    await context.close();
  }
}

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

test('manager root defines a scoped responsive app container', () => {
  const block = blockFor('.fabricate-manager');

  assert.ok(block.includes('container-type: inline-size;'), 'manager should use container queries');
  assert.ok(
    block.includes('container-name: fabricate-manager;'),
    'manager should name its container'
  );
  assert.ok(block.includes('isolation: isolate;'), 'manager should isolate its shell');
  assert.ok(block.includes('height: 100%;'), 'manager should fill the ApplicationV2 body');
  // `clip`, deliberately, and NOT `hidden` — see the dedicated issue-1286 test below. Both
  // hide the overflow; only `clip` refuses to be a scroll container, and `hidden` left focus
  // able to scroll the entire app out of its own frame.
  assert.ok(block.includes('overflow: clip;'), 'manager shell should own overflow');
});

test('Fabricate app shells suppress host click focus outlines while preserving keyboard focus', () => {
  const managerFocusBlock = blockFor(
    '.fabricate-manager a:focus,\n.fabricate-manager button:focus,\n.fabricate-manager input:focus,\n.fabricate-manager select:focus,\n.fabricate-manager textarea:focus,\n.fabricate-manager [tabindex]:focus'
  );
  const managerFocusVisibleBlock = blockFor(
    '.fabricate-manager a:focus-visible,\n.fabricate-manager button:focus-visible,\n.fabricate-manager input:focus-visible,\n.fabricate-manager select:focus-visible,\n.fabricate-manager textarea:focus-visible,\n.fabricate-manager [tabindex]:focus-visible'
  );
  const shellFocusBlock = blockFor(
    '.fabricate-app button:focus,\n.fabricate-app input:focus,\n.fabricate-app select:focus,\n.fabricate-app textarea:focus,\n.fabricate-app [tabindex]:focus'
  );
  const shellFocusVisibleBlock = blockFor(
    '.fabricate-app button:focus-visible,\n.fabricate-app input:focus-visible,\n.fabricate-app select:focus-visible,\n.fabricate-app textarea:focus-visible,\n.fabricate-app [tabindex]:focus-visible'
  );

  assert.ok(
    managerFocusBlock.includes('outline: none;') && managerFocusBlock.includes('box-shadow: none;'),
    'manager controls should clear host click focus outlines'
  );
  assert.ok(
    shellFocusBlock.includes('outline: none;') && shellFocusBlock.includes('box-shadow: none;'),
    'unified Fabricate shell controls should clear host click focus outlines'
  );
  assert.ok(
    managerFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'manager keyboard focus should remain visible'
  );
  assert.ok(
    shellFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'unified shell keyboard focus should remain visible'
  );

  // THE TWO HALVES ARE A PAIR AND MUST NAME THE SAME ELEMENTS (issue 1118). The suppressing
  // half strips whatever ring Foundry's core or the browser draws; the supplying half puts the
  // manager's own back on keyboard focus. An element in the first list and not the second gets
  // NO ring at all, which is what a focused manager `textarea` did, and an element in neither
  // keeps the host's, which is what the twelve anchor manager buttons did. Both were live and
  // both were invisible to the two blocks read above, because each of those only asks whether
  // its own block declares an outline.
  const elementsIn = (prelude) => [
    ...new Set(
      [...prelude.matchAll(/\.fabricate-\w+\s+([a-z]+|\[tabindex])(?=:)/g)].map(([, one]) => one)
    ),
  ];
  for (const [area, suppressing, supplying] of [
    ['manager', managerFocusBlock, managerFocusVisibleBlock],
    ['app shell', shellFocusBlock, shellFocusVisibleBlock],
  ]) {
    assert.deepEqual(
      elementsIn(supplying).sort(),
      elementsIn(suppressing).sort(),
      `the ${area}'s focus-visible list must name exactly the elements its :focus list ` +
        'suppresses, or one element type is stripped of a ring and given none'
    );
  }
});

test('Fabricate app shell suppresses the host outline on the selected-tab state class', () => {
  // Core's `button.active` carries the same orange outline + glow as `button:focus`,
  // so the selected nav-rail button keeps a Foundry ring once focus leaves it. The
  // :focus reset above only masks it while the button is focused.
  const shellActiveBlock = blockFor(
    '.fabricate-app button.active,\n.fabricate-app a.button.active'
  );

  assert.ok(
    shellActiveBlock.includes('outline: none;') && shellActiveBlock.includes('box-shadow: none;'),
    'selected shell buttons should clear the host active outline and glow'
  );
});

test('manager character modifier search suggestions keep icons in row flow', () => {
  const searchIconBlock = blockFor('.fabricate-manager .manager-search > i');
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
    css.includes('.fabricate-manager .manager-search i {\n  position: absolute;'),
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
  const context = await sharedBrowser.newContext({
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
                <div class="harness-availability-anchor">
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
                <label class="manager-search is-compact manager-character-modifier-add-search">
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

test('manager body starts as a three-region grid and stacks at narrow width', () => {
  const bodyBlock = blockFor('.fabricate-manager .manager-body');

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'),
    'normal manager layout should have rail, main region, and inspector'
  );
  assert.ok(
    css.includes('@container fabricate-manager (max-width: 1120px)'),
    'manager should stack before the center table becomes unreadable'
  );
  assert.ok(
    css.includes('@container fabricate-manager (max-width: 680px)'),
    'manager should define a narrow container query'
  );
  assert.ok(
    css.includes('grid-template-columns: 1fr;'),
    'narrow manager layout should stack to one column'
  );
  assert.ok(
    css.includes('grid-template-columns: minmax(0, 1.55fr) minmax(92px, 0.42fr) 72px 118px;'),
    'normal systems table should use compact System, Resolution, Status, and Actions columns'
  );
  assert.ok(
    css.includes('min-width: 0;'),
    'manager table rows should avoid forcing default-width horizontal overflow'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-table-head') &&
      mediumQuery.includes('display: none;'),
    'medium manager layout should switch rows to stacked cards before row actions become hidden'
  );
});

test('manager systems text and action cells are constrained at normal widths', () => {
  const nameBlock = blockFor('.fabricate-manager .manager-system-name');
  const descriptionBlock = blockFor('.fabricate-manager .manager-system-description');

  assert.ok(
    nameBlock.includes('-webkit-line-clamp: 2;'),
    'row names should clamp instead of overflowing rows'
  );
  assert.ok(
    descriptionBlock.includes('-webkit-line-clamp: 1;'),
    'row descriptions should stay on one line inside compact rows'
  );
  const gatheringNameClampBlock = css.match(
    /\.manager-environment-identity \.manager-system-name,[\s\S]*?\.manager-gathering-events-table \.manager-gathering-event-identity \.manager-system-name\s*\{[^}]*\}/
  );
  assert.ok(
    gatheringNameClampBlock &&
      gatheringNameClampBlock[0].includes(
        '.manager-gathering-tasks-table .manager-gathering-task-identity .manager-system-name'
      ) &&
      gatheringNameClampBlock[0].includes('-webkit-line-clamp: 1;'),
    'gathering identity rows (environments, tasks, and events) should clamp the name to one line so the 64px thumbnail drives row height and image + text stay centered'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-inspector-name {\n  display: -webkit-box;') &&
      css.includes('-webkit-line-clamp: 3;'),
    'inspector names should stay readable without dominating the inspector'
  );
  assert.ok(
    !css.includes('.fabricate-manager .manager-count-cluster'),
    'system row counts should not duplicate the inspector counts'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-system-row .manager-action-group'),
    'system row actions should have stable width rules'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-system-row:focus-visible'),
    'system rows should own the accessible focus state'
  );
  assert.ok(
    css.includes('overflow-wrap: break-word;'),
    'text should avoid single-letter wrapping unless needed for long strings'
  );
});

test('manager systems status cells use stable interactive on-off toggles', () => {
  const toggleBlock = blockFor('.fabricate-manager .manager-status-toggle');
  const onBlock = blockFor('.fabricate-manager .manager-status-toggle.is-on');
  const offBlock = blockFor('.fabricate-manager .manager-status-toggle.is-off');
  const trackBlock = blockFor('.fabricate-manager .manager-status-toggle-track');
  const knobBlock = blockFor('.fabricate-manager .manager-status-toggle-knob');
  const onKnobBlock = blockFor(
    '.fabricate-manager .manager-status-toggle.is-on .manager-status-toggle-knob'
  );
  const focusBlock = blockFor('.fabricate-manager .manager-status-toggle:focus');
  const focusVisibleBlock = blockFor('.fabricate-manager .manager-status-toggle:focus-visible');

  assert.ok(
    toggleBlock.includes('appearance: none;'),
    'system status toggles should normalize host button styles'
  );
  assert.ok(
    toggleBlock.includes('width: auto;'),
    'system status toggles should size to their On/Off label instead of filling the status column'
  );
  assert.ok(
    toggleBlock.includes('max-width: 78px;'),
    'system status toggles should keep compact geometry'
  );
  assert.ok(
    toggleBlock.includes('border-radius: 999px;'),
    'system status toggles should read as toggle buttons'
  );
  assert.ok(
    focusBlock.includes('outline: none;') && focusBlock.includes('box-shadow: none;'),
    'mouse focus should not inherit the host orange focus ring'
  );
  assert.ok(
    focusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus should keep a manager focus-visible ring'
  );
  // ONE ACCENT FOR BOTH POSITIONS (issue 1373). This asserted the SUCCESS family for `on`,
  // beside the note below asserting a neutral track and a `--fab-text-secondary` (tan) knob for
  // `off` — so the manager's most semantically loaded control changed HUE when it changed
  // meaning, and the off position was the louder of the two. On the Tool rules editor that is
  // two accents for one control type on one screen: the enable switch sits inches from four
  // inherit switches. The reference builds every switch it draws from one pair —
  // `svTrack(on)` / `svKnob(on)` — which is the accent track with the on-accent knob when on,
  // and a raised neutral track with a subtle knob when off.
  assert.ok(
    onBlock.includes('var(--fab-accent)'),
    'the lit switch is the ACCENT family, which is the one accent this manager has'
  );
  assert.ok(
    onBlock.includes('--fab-toggle-knob: var(--fab-on-accent);'),
    'and its knob is the ink that family reads against'
  );
  // Issue 643: OFF is now NEUTRAL (bg-3 / border-strong), not amber. A disabled
  // recipe, component or environment is an ordinary state, not a warning. The
  // state colour moved onto the TRACK via the local --fab-toggle-* properties,
  // so these assertions read the custom-property declarations, not a background.
  assert.ok(
    offBlock.includes('var(--fab-surface-raised)'),
    'disabled status should read as a neutral off switch, not a warning'
  );
  assert.ok(offBlock.includes('var(--fab-border)'), 'the off track should keep a visible edge');
  // AND ITS KNOB IS SUBTLE, NOT THE TAN SECONDARY INK (issue 1373). The off knob used to be the
  // brightest part of the whole control, so the switch shouted loudest in the position that
  // means "nothing is happening here".
  assert.ok(
    offBlock.includes('--fab-toggle-knob: var(--fab-text-subtle);'),
    'the off knob recedes; the lit position is the loud one'
  );
  // The switch sets `border: 0` on the BUTTON, so a `:hover { border-color }` rule on
  // the button is inert. The hover affordance has to live on the TRACK, which is the
  // part with an edge — otherwise every switch in the manager has no hover state at all.
  const toggleHoverBlock = blockFor(
    '.fabricate-manager .manager-status-toggle:not(:disabled, .is-disabled, .is-locked):hover .manager-status-toggle-track'
  );
  assert.ok(
    toggleHoverBlock.includes('border-color:') && toggleHoverBlock.includes('background:'),
    'hovering a switch must visibly change its track'
  );
  assert.equal(
    /\.manager-status-toggle:hover \{/.test(css),
    false,
    'a hover rule on the border-less button itself is dead code'
  );
  assert.ok(
    trackBlock.includes('width: 34px;'),
    'toggle track should use the 34x20 switch geometry'
  );
  assert.ok(
    trackBlock.includes('height: 20px;'),
    'toggle track should use the 34x20 switch geometry'
  );
  assert.ok(
    trackBlock.includes('background: var(--fab-toggle-track);'),
    'the track should carry the state colour'
  );
  assert.ok(knobBlock.includes('width: 14px;'), 'toggle knob should use the 14x14 switch geometry');
  assert.ok(
    knobBlock.includes('transition: transform'),
    'toggle knob should expose a clear state change'
  );
  // 34px track - 2px inset - 14px knob - 2px inset = 14px of travel (left 2 -> 16).
  assert.ok(
    onKnobBlock.includes('transform: translateX(14px);'),
    'enabled status should move the toggle knob on'
  );
});

// The rail's crafting-system card SELECTS (issue 643). It used to be a fixed 64px box
// holding the system's name and an icon-only button, with no way to switch system from
// the rail at all — so the card is now a micro-label, a real `<select>` over every
// system, and a text back link out to the system library.
test('the rail crafting-system card selects a system and links back to the library', () => {
  const scopeBlock = blockFor('.fabricate-manager .manager-scope-card');
  const selectBlock = blockFor('.fabricate-manager .manager-scope-select');
  const returnBlock = blockFor('.fabricate-manager .manager-scope-return');
  const returnFocusBlock = blockFor(
    '.fabricate-manager .manager-scope-return:hover,\n.fabricate-manager .manager-scope-return:focus-visible'
  );
  const focusBlock = blockFor(
    '.fabricate-manager a:focus-visible,\n.fabricate-manager button:focus-visible,\n.fabricate-manager input:focus-visible,\n.fabricate-manager select:focus-visible,\n.fabricate-manager textarea:focus-visible,\n.fabricate-manager [tabindex]:focus-visible'
  );

  assert.ok(
    scopeBlock.includes('display: grid;'),
    'the card stacks its label, select and back link'
  );
  assert.ok(
    scopeBlock.includes('grid-template-columns: minmax(0, 1fr);'),
    'the card is one column, not name + icon button'
  );
  assert.equal(
    scopeBlock.includes('height: 64px;'),
    false,
    'a select cannot be clamped into the old fixed-height box'
  );
  assert.ok(
    scopeBlock.includes('white-space: normal;'),
    'scope card should not inherit host nowrap rules'
  );
  assert.ok(
    scopeBlock.includes('overflow: hidden;'),
    'scope card should prevent long names from affecting nav layout'
  );
  // NO BOX (issue 1373). The reference's rail is a flat run — its section label, then nav rows
  // — and draws nothing around the scope controls at the top; ours opened with a bordered,
  // filled card, so the rail began with a panel where the design begins with a list. The
  // CONTROLS are unchanged and still asserted below: the reference is a static mock with one
  // crafting system and no switcher, and this rail carries the live system select, the route
  // back to the library and the collapse toggle, which have no other home.
  assert.equal(
    scopeBlock.includes('border: 1px solid var(--fab-border-strong);'),
    false,
    'the scope block draws no card edge: the reference rail is a flat run of rows'
  );
  assert.equal(
    scopeBlock.includes('background: var(--fab-bg-2);'),
    false,
    'and no card fill either — half of the treatment reads as neither'
  );

  // The system's name is set in the display face wherever it is named — here it is the
  // select's own value, so the serif moves onto the control.
  assert.ok(
    selectBlock.includes('font-family: var(--fab-font-serif);'),
    'the selected system name keeps the display face'
  );
  assert.ok(selectBlock.includes('min-width: 0;'), 'the select may shrink inside the rail');
  assert.ok(
    selectBlock.includes('text-overflow: ellipsis;'),
    'a long system name ellipsises rather than reflowing the nav'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-scope-name'),
    false,
    'the retired static name span should be gone, not merely unused'
  );

  // The back link is a text link inside the card, not a 28px icon button beside a name.
  assert.ok(
    returnBlock.includes('color: var(--fab-text-muted);'),
    'the back link reads as quiet navigation, not an action'
  );
  assert.ok(returnBlock.includes('border: 0;'), 'the back link is a link, not a bordered button');
  assert.ok(
    returnBlock.includes('text-overflow: ellipsis;') || returnBlock.includes('min-width: 0;'),
    'the back link may shrink'
  );
  assert.ok(
    returnFocusBlock.includes('background: var(--fab-surface-soft);'),
    'the back link keeps a manager-styled hover'
  );
  assert.ok(
    focusBlock.includes('outline: 2px solid var(--fab-accent);'),
    'manager focus should remain visible'
  );
  assert.equal(
    scopeBlock.includes('orange'),
    false,
    'scope card should not use orange focus styling'
  );
  assert.equal(scopeBlock.includes('red'), false, 'scope card should not use red focus styling');
});

test('manager nav buttons clear host mouse focus and keep green keyboard focus', () => {
  const navFocusBlock = blockFor('.fabricate-manager .manager-nav-button:focus');
  const activeNavFocusBlock = blockFor('.fabricate-manager .manager-nav-button.is-active:focus');
  const navFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-button:focus-visible');

  assert.ok(
    navFocusBlock.includes('outline: none;'),
    'mouse focus on nav buttons should not inherit the host outline'
  );
  assert.ok(
    navFocusBlock.includes('box-shadow: none;'),
    'mouse focus on nav buttons should not inherit the host orange focus shadow'
  );
  assert.ok(activeNavFocusBlock.includes('box-shadow: none;'), 'active nav focus stays neutral');
  assert.ok(
    navFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus on nav buttons should use the manager accent'
  );
  assert.equal(navFocusBlock.includes('orange'), false, 'nav focus should not use orange');
  assert.equal(
    navFocusVisibleBlock.includes('orange'),
    false,
    'nav keyboard focus should not use orange'
  );
});

test('manager gathering rail submenu controls clear host mouse focus and keep green keyboard focus', () => {
  const expandedGroupBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded');
  const parentBlock = blockFor('.fabricate-manager .manager-nav-parent');
  const expandedParentBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent'
  );
  const expandedParentHoverBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent:hover'
  );
  const submenuBlock = blockFor('.fabricate-manager .manager-nav-submenu');
  const toggleBlock = blockFor('.fabricate-manager .manager-nav-toggle');
  const expandedToggleBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-toggle'
  );
  const toggleFocusBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus');
  const toggleFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus-visible');
  const subitemBlock = blockFor('.fabricate-manager .manager-nav-subitem');
  const subitemFocusBlock = blockFor('.fabricate-manager .manager-nav-subitem:focus');
  const activeSubitemBlock = blockFor('.fabricate-manager .manager-nav-subitem.is-active');
  const activeSubitemFocusBlock = blockFor(
    '.fabricate-manager .manager-nav-subitem.is-active:focus'
  );
  const subitemFocusVisibleBlock = blockFor(
    '.fabricate-manager .manager-nav-subitem:focus-visible'
  );

  // AN EXPANDED GROUP IS INDENTED ROWS AGAINST A GUIDE, NOT A SECOND CARD (issue 1373). The
  // filled, ring-inset box drew a panel around a run of nav rows in a rail that is otherwise a
  // flat list — and on the Tool Rules screen the boxed `Crafting` group sits directly above
  // `Tool Rules`, which is NOT in it, so the box read as a claim about membership that the
  // breadcrumb had also been making and that was equally untrue. The reference indents the
  // children and marks them with a thin vertical rule.
  assert.equal(
    expandedGroupBlock.includes('border-radius: 8px;'),
    false,
    'an expanded group draws no card corner'
  );
  assert.equal(
    expandedGroupBlock.includes('background: var(--fab-overlay-light-035);'),
    false,
    'and no card fill: it is a guide, not a container'
  );
  assert.equal(
    expandedGroupBlock.includes('box-shadow: inset 0 0 0 1px var(--fab-border);'),
    false,
    'and no inset ring: that WAS the container edge, drawn as a shadow so it shifted nothing'
  );
  // THE GUIDE IS ON THE SUBMENU, which is where the children actually are — so it starts and
  // ends exactly where they do, which a rule around the whole group could not do.
  const submenuGuide = blockFor('.fabricate-manager .manager-nav-submenu');
  assert.ok(
    submenuGuide.includes('border-left: 1px solid var(--fab-border);'),
    'the indented children are marked with a thin vertical rule instead'
  );
  assert.equal(
    expandedGroupBlock.includes('padding:'),
    false,
    'expanded gathering nav should not add layout padding that shifts the parent row'
  );
  assert.equal(
    expandedGroupBlock.includes('border:'),
    false,
    'expanded gathering nav should not add layout border that shifts the parent row'
  );
  assert.ok(
    parentBlock.includes('grid-template-columns: 24px minmax(0, 1fr) auto;'),
    'gathering parent should keep count chips inside the row before the toggle'
  );
  assert.ok(
    expandedParentBlock.includes('border-color: transparent;'),
    'expanded gathering parent should not use selected border styling'
  );
  assert.ok(
    expandedParentBlock.includes('background: transparent;'),
    'expanded gathering parent should not use selected fill styling'
  );
  assert.ok(
    expandedParentBlock.includes('box-shadow: none;'),
    'expanded gathering parent should not use the selected left accent'
  );
  assert.ok(
    expandedParentHoverBlock.includes('background: var(--fab-overlay-light-04);'),
    'expanded gathering parent may have a subtle hover without becoming selected'
  );
  assert.ok(
    toggleBlock.includes('top: 4px;') && toggleBlock.includes('right: 4px;'),
    'gathering toggle should have stable collapsed geometry'
  );
  assert.equal(
    expandedToggleBlock,
    '',
    'expanded gathering toggle should not override collapsed geometry'
  );
  assert.ok(
    submenuBlock.includes('padding-left: var(--fab-space-3);'),
    'gathering submenu entries should be nested inside the group'
  );
  assert.ok(
    // FOUR tracks since issue 1096: a Checks child can carry an unsaved marker AND an issue
    // badge beside its label, and the three-track grid put the second one into the ICON cell
    // of the row below it. The claim is unchanged — a submenu entry's trailing markers stay
    // inside its own row — and the extra track is simply empty for every other rail group.
    subitemBlock.includes('grid-template-columns: 20px minmax(0, 1fr) auto auto;'),
    'gathering submenu entries should keep count chips inside their rows'
  );
  // Issue 1179: World established the neutral active language and every corresponding
  // selected-system link now shares it.
  assert.ok(
    activeSubitemBlock.includes('background: var(--fab-surface-active);'),
    'selected submenu entries should use the neutral active fill'
  );
  assert.ok(
    activeSubitemBlock.includes('border-color: transparent;'),
    'selected submenu entries should not add a strong edge'
  );
  assert.equal(
    activeSubitemBlock.includes('var(--fab-success'),
    false,
    'the rail selected state should not reuse the enabled-status success family'
  );
  assert.ok(activeSubitemBlock.includes('box-shadow: none;'), 'selected entries have no stripe');
  assert.ok(
    toggleFocusBlock.includes('outline: none;'),
    'mouse focus on gathering toggle should not inherit the host outline'
  );
  assert.ok(
    toggleFocusBlock.includes('box-shadow: none;'),
    'mouse focus on gathering toggle should not inherit the host orange focus shadow'
  );
  assert.ok(
    toggleFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus on gathering toggle should use the manager accent'
  );
  assert.ok(
    subitemFocusBlock.includes('outline: none;'),
    'mouse focus on gathering submenu entries should not inherit the host outline'
  );
  assert.ok(
    subitemFocusBlock.includes('box-shadow: none;'),
    'mouse focus on gathering submenu entries should not inherit the host orange focus shadow'
  );
  assert.ok(activeSubitemFocusBlock.includes('box-shadow: none;'), 'active focus stays neutral');
  assert.ok(
    subitemFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus on gathering submenu entries should use the manager accent'
  );
  assert.equal(
    toggleFocusBlock.includes('orange'),
    false,
    'gathering toggle focus should not use orange'
  );
  assert.equal(
    subitemFocusVisibleBlock.includes('orange'),
    false,
    'gathering submenu keyboard focus should not use orange'
  );
});

test('manager inspector count labels wrap without truncation', () => {
  const factBlock = blockFor('.fabricate-manager .manager-fact');
  const factLineBlock = blockFor('.fabricate-manager .manager-fact-line');
  const factLeadingBlock = blockFor('.fabricate-manager .manager-fact-leading');
  const featureListBlock = blockFor('.fabricate-manager .manager-feature-list');
  const conditionShortcutListBlock = blockFor(
    '.fabricate-manager .manager-condition-shortcut-list'
  );
  const conditionShortcutLabelBlock = blockFor(
    '.fabricate-manager .manager-condition-shortcut-label'
  );
  const conditionShortcutSelectBlock = blockFor(
    '.fabricate-manager .manager-condition-shortcut select'
  );

  assert.ok(
    css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'count facts should use a two-column inspector grid'
  );
  assert.ok(
    factBlock.includes('display: block;'),
    'count facts should render one phrase instead of wrapping separate flex children'
  );
  assert.ok(
    !factBlock.includes('display: flex;'),
    'count facts should not split values and labels into separate flex items'
  );
  assert.ok(
    factLineBlock.includes('display: inline;'),
    'count facts should keep value and label in normal inline text flow'
  );
  assert.ok(
    factLeadingBlock.includes('white-space: nowrap;'),
    'count facts should keep the value and first label word together'
  );
  assert.ok(
    !factBlock.includes('white-space: nowrap;'),
    'count fact cards should not force single-line labels'
  );
  assert.ok(
    factLineBlock.includes('overflow-wrap: break-word;'),
    'count fact text should wrap at word boundaries with long-word fallback'
  );
  assert.ok(
    !factLineBlock.includes('overflow: hidden;'),
    'count fact text should not clip full labels'
  );
  assert.ok(
    !factLineBlock.includes('text-overflow: ellipsis;'),
    'count fact text should not ellipsize full labels'
  );
  assert.ok(
    !factLineBlock.includes('overflow-wrap: anywhere;'),
    'count facts should not allow character-level wrapping'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-fact.is-off'),
    'disabled count facts should span the count grid'
  );
  assert.ok(
    css.includes('grid-column: 1 / -1;'),
    'disabled count facts should have enough width for label-first text'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-fact strong.is-disabled'),
    'disabled count values should preserve emphasis'
  );
  assert.ok(
    featureListBlock.includes('align-items: flex-start;'),
    'feature pills should align to the top of the card'
  );
  assert.ok(
    featureListBlock.includes('place-content: flex-start flex-start;'),
    'feature pills should align to the top-left of the card'
  );
  assert.ok(
    conditionShortcutListBlock.includes('grid-template-columns: minmax(0, 1fr);'),
    'condition shortcut card should keep compact one-column inspector controls'
  );
  assert.ok(
    conditionShortcutListBlock.includes('gap: var(--fab-space-2);'),
    'condition shortcut controls should have stable spacing'
  );
  assert.ok(
    conditionShortcutLabelBlock.includes('display: inline-flex;'),
    'condition shortcut labels should align icons and text'
  );
  assert.ok(
    conditionShortcutSelectBlock.includes('font-weight: 400;'),
    'condition shortcut select text should not inherit bold label weight'
  );
});

test('manager empty states use refined heading and setup-panel styling', () => {
  // Read from the PRIMITIVE, not the global sheet (issue 785): `EmptyState.svelte` owns the
  // appearance in its scoped block so a change to it maps to the views that render it
  // rather than to the broad `theme-or-global-ui` screenshot recipe.
  const emptyPanelBlock = blockIn(emptyStateStyles, '.manager-empty');
  const emptyIconBlock = blockIn(emptyStateStyles, '.manager-empty > div > i');
  const emptyHeadingBlock = blockIn(emptyStateStyles, '.manager-empty h3');
  const emptyBodyBlock = blockIn(emptyStateStyles, '.manager-empty p');
  const emptyCompactIconBlock = blockIn(emptyStateStyles, '.manager-empty.is-compact > div > i');
  const setupCardBlock = blockFor('.fabricate-manager .manager-setup-card');
  const setupHeaderBlock = blockFor('.fabricate-manager .manager-setup-card-header');
  const setupListBlock = blockFor('.fabricate-manager .manager-setup-list');
  const setupLinksBlock = blockFor('.fabricate-manager .manager-setup-links');

  // Matched to the reference prototype: a 46px rounded tile holding an 18px SUBTLE glyph,
  // a 13px/600 serif title in the secondary tone, and an 11px body capped at 280px. The
  // icon is deliberately quieter than the title — it used to render at 1.55rem in the full
  // text colour and was the loudest thing in an otherwise quiet panel.
  assert.ok(
    emptyPanelBlock.includes('border: 1.5px dashed var(--fab-border);') &&
      emptyPanelBlock.includes('border-radius: 12px;'),
    'the no-state panel should be a rounded 1.5px dashed panel'
  );
  // A shared primitive must be portable across app areas. `--fab-manager-*` is the prefix
  // for an AREA-SCOPED custom property, declared inside `.fabricate-manager` only, so
  // referencing it makes the declaration invalid at computed-value time anywhere else
  // (`.fabricate-app`, `.fabricate-admin`, `.fabricate-interactables-manager`) and the
  // value silently falls back to inheritance. Nothing fails; it just looks wrong, and the
  // trigger is the reuse the primitive exists to enable. Theme-root tokens (`:root` + all
  // seven theme blocks) resolve everywhere.
  //
  // The failure mode is NARROWED by issue 1399, not removed: the manager's twelve colour
  // aliases are inlined onto their foundation tokens, but five layout properties are still
  // declared inside `.fabricate-manager`, so a primitive that reads one still renders
  // unstyled in the player app. `tests/token-generation-gate.test.js` DOES catch that now —
  // its scoped-style test scans every `<style>` under `src/` for the prefix, a strict
  // superset of these five primitives — and this guard stays because it is the narrower,
  // louder one: it names the primitive that broke and the token it reached for.
  for (const [name, styles] of Object.entries({
    EmptyState: emptyStateStyles,
    Callout: calloutStyles,
    ExplainerCard: explainerCardStyles,
    IconFactRow: iconFactRowStyles,
    Chip: chipStyles,
  })) {
    assert.equal(
      /--fab-manager-/.test(styles),
      false,
      `${name} must reference theme-root tokens, not .fabricate-manager-scoped properties`
    );
  }
  assert.ok(
    !emptyPanelBlock.includes('min-height:'),
    'panel height should be padding-driven as in the prototype, not floored'
  );
  assert.ok(!emptyPanelBlock.includes('background:'), 'the prototype panel carries no fill');
  assert.ok(
    emptyIconBlock.includes('font-size: 18px;') &&
      emptyIconBlock.includes('color: var(--fab-text-subtle);') &&
      emptyIconBlock.includes('background: var(--fab-surface-soft);'),
    'the glyph should be a small subtle icon on a soft rounded tile'
  );
  // A per-icon OR per-screen size exception would reintroduce the inconsistency the
  // primitive exists to remove, so every empty state shares one tile and type scale. The
  // global sheet is checked too: it may only carry LAYOUT-CONTEXT rules for the panel, and
  // a `font-size` reaching it through an ancestor is how the Tool Studio inspector once
  // grew a 2rem glyph and a 1.2rem title of its own (issue 785).
  assert.equal(
    css.includes('.manager-empty > div > i.fa-layer-group'),
    false,
    'no empty-state icon should carry its own size exception'
  );
  for (const [selector, block] of Object.entries({
    '.fabricate-manager .manager-task-required-tools-scroll > .manager-empty': blockFor(
      '.fabricate-manager .manager-task-required-tools-scroll > .manager-empty'
    ),
    '.fabricate-manager .manager-tool-browser-inspector-empty': blockFor(
      '.fabricate-manager .manager-tool-browser-inspector-empty'
    ),
    '.fabricate-manager .manager-recipe-tab-empty': blockFor(
      '.fabricate-manager .manager-recipe-tab-empty'
    ),
    '.fabricate-manager .manager-vocabulary-empty-panel': blockFor(
      '.fabricate-manager .manager-vocabulary-empty-panel'
    ),
  })) {
    assert.ok(block, `${selector} should still carry its layout-context rule`);
    assert.equal(
      /font-size|font-family|font-weight|border-radius|border:|background:/.test(block),
      false,
      `${selector} may place the shared panel, never restyle it`
    );
  }
  assert.ok(
    emptyHeadingBlock.includes('font-weight: 600;') &&
      emptyHeadingBlock.includes('font-size: 13px;') &&
      emptyHeadingBlock.includes('font-family: var(--fab-font-serif);'),
    'the title should be the prototype 13px/600 serif'
  );
  assert.ok(
    emptyBodyBlock.includes('font-size: 11px;') && emptyBodyBlock.includes('max-width: 280px;'),
    'the body should be 11px and capped so it wraps into a readable column'
  );
  // The sidebar/inline scale is the SAME vocabulary, not a second look.
  assert.ok(
    emptyCompactIconBlock.includes('width: 32px;') &&
      emptyCompactIconBlock.includes('font-size: 14px;'),
    'the compact variant should shrink the same tile rather than restyle it'
  );
  assert.ok(
    setupCardBlock.includes('display: grid;'),
    'no-systems inspector setup panel should use compact grid layout'
  );
  assert.ok(
    setupCardBlock.includes('border: 1px solid var(--fab-border);'),
    'setup panel should use manager flat borders'
  );
  assert.ok(
    setupHeaderBlock.includes('grid-template-columns: 38px minmax(0, 1fr);'),
    'setup panel should reserve icon space'
  );
  assert.ok(
    setupListBlock.includes('line-height: 1.35;'),
    'setup tips should stay dense and readable'
  );
  assert.ok(
    setupLinksBlock.includes('flex-wrap: wrap;'),
    'setup links should wrap in narrow inspectors'
  );
});

// Issue 785: the two Knowledge tabs rendered the same standing statement at two sizes —
// a compact 0.66rem info banner on one tab and a taller 0.7rem warning band on the other.
// `Callout` is ONE shape for both tones; a tone that also changed the geometry or the type
// would put the drift straight back.
test('the shared callout keeps one shape and lets tone change only its colours', () => {
  const calloutBlock = blockIn(calloutStyles, '.manager-callout');
  const calloutIconBlock = blockIn(calloutStyles, '.manager-callout > i');
  const warningBlock = blockIn(calloutStyles, '.manager-callout.is-warning');
  const warningIconBlock = blockIn(calloutStyles, '.manager-callout.is-warning > i');

  // The taller treatment — the one already approved visually — is the ONLY shape.
  for (const declaration of [
    'padding: var(--fab-space-3);',
    'font-size: 0.7rem;',
    'font-weight: 500;',
    'line-height: 1.45;',
    'border-radius: 8px;',
  ]) {
    assert.ok(calloutBlock.includes(declaration), `the callout should declare ${declaration}`);
  }
  assert.ok(
    calloutBlock.includes('border: 1px solid var(--fab-info-border);') &&
      calloutBlock.includes('background: var(--fab-info-soft);'),
    'the default tone is info, drawn from the info token ramp'
  );
  assert.ok(
    calloutIconBlock.includes('color: var(--fab-info);'),
    'the glyph carries the tone at full strength'
  );

  // Tone is a colour concern only.
  assert.ok(
    warningBlock.includes('border-color: var(--fab-warning-border);') &&
      warningBlock.includes('background: var(--fab-warning-soft);'),
    'the warning tone repaints the edge and the fill'
  );
  assert.ok(
    warningIconBlock.includes('color: var(--fab-warning);'),
    'the warning tone repaints the glyph'
  );
  assert.equal(
    /padding|font-size|font-weight|line-height|gap:/.test(warningBlock),
    false,
    'a tone must not change the callout geometry or type scale'
  );
});

// Issue 881: three surfaces explained themselves three ways. The Tool Studio preview
// rendered `.manager-tool-how-it-works` (its own bordered card, its own 0.625rem heading,
// a glyph-led list at 0.6875rem/1.5); the Tags & Categories inspector rendered the same
// meaning as a disc-bulleted `.manager-evidence-list` at 0.82rem AND as a bare
// `.manager-muted` paragraph. `ExplainerCard` is the one implementation, and it reuses the
// manager's existing card shell and card-title contract rather than restating them.
test('the shared explainer card reuses the card shell and owns only the explainer parts', () => {
  const titleBlock = blockIn(explainerCardStyles, '.manager-explainer-card-title');
  const listBlock = blockIn(explainerCardStyles, '.manager-explainer-card-list');
  const rowBlock = blockIn(explainerCardStyles, '.manager-explainer-card-list > li');
  const rowGlyphBlock = blockIn(explainerCardStyles, '.manager-explainer-card-list > li > i');

  // The card shell and the heading come from the manager's ONE contract for each, applied
  // as classes on the primitive's own elements — not re-declared in this scoped block.
  // RETARGETED at the primitive (issue 1427). The shell is `<InspectorCard>` now, so the class
  // it once wrote by hand is emitted by that component and the caller passes only its own
  // modifier. The assertion is the same one — this card does not re-declare the shell — stated
  // against the markup that carries it today.
  assert.ok(
    explainerCardSource.includes('<InspectorCard class="manager-explainer-card"'),
    'the explainer wears the shared side-panel card shell'
  );
  assert.ok(
    explainerCardSource.includes('class="manager-card-title manager-explainer-card-title"'),
    'the explainer title wears the shared card-title contract'
  );
  assert.equal(
    /padding:|border-radius:|border: 1px|font-weight:|text-transform:|font-family:/.test(
      titleBlock + blockIn(explainerCardStyles, '.manager-explainer-card')
    ),
    false,
    'the explainer must not restate the card shell or the heading scale, weight or family'
  );

  // The body treatment is the Tool Studio's, which issue 881 names as the reference.
  for (const declaration of [
    'grid-template-columns: 20px minmax(0, 1fr);',
    'font-size: 0.6875rem;',
    'line-height: 1.5;',
    'color: var(--fab-text-muted);',
  ]) {
    assert.ok(rowBlock.includes(declaration), `an explainer row should declare ${declaration}`);
  }
  assert.ok(listBlock.includes('list-style: none;'), 'the explainer list drops disc markers');
  assert.ok(
    rowGlyphBlock.includes('color: var(--fab-accent);'),
    'the row glyph is the accent, as in the Tool Studio reference'
  );

  // Issue 883: the primitive takes a LIST of links, because the Checks rail offers two ways
  // out of its card and a one-link primitive is exactly the incompatibility that kept a
  // hand-rolled card alive beside it. The single `docsHref`/`docsLabel` pair is gone rather
  // than kept alongside — two ways to express one link is the drift this pass removes.
  assert.ok(/\blinks = \[\]/.test(explainerCardSource), 'the explainer takes a list of docs links');
  for (const dead of ['docsHref', 'docsLabel']) {
    assert.equal(
      withoutComments(explainerCardSource).includes(dead),
      false,
      `${dead} was replaced by the link list and must not survive as a second way in`
    );
  }
  // The link ROW is the manager's existing `.manager-setup-links` contract, reused rather
  // than re-derived: a scoped copy of its flex/wrap/gap would be a second declaration of
  // the same values.
  assert.ok(
    explainerCardSource.includes('<div class="manager-setup-links">'),
    'the explainer links reuse the shared card-link row'
  );
  assert.equal(
    /manager-explainer-card-docs\s*\{/.test(explainerCardStyles),
    false,
    'the explainer must not re-derive the card-link row it now reuses'
  );

  // Every re-derivation is gone from the global sheet, not merely unused: a surviving
  // rule is what the next copy gets written against.
  for (const dead of [
    'manager-tool-how-it-works',
    'manager-tool-docs-link',
    'manager-evidence-list',
    'manager-tool-inspector-rule-card',
  ]) {
    assert.equal(css.includes(dead), false, `${dead} was replaced and must not survive as CSS`);
  }
});

// The second half of the same change: the Tool Studio built one fact row twice, from the
// SAME `projectToolBehaviorFacts` projection, at two geometries.
test('the shared icon fact row is one well, used by every behavior-fact surface', () => {
  const rowBlock = blockIn(iconFactRowStyles, '.manager-icon-fact-row');
  const glyphBlock = blockIn(iconFactRowStyles, '.manager-icon-fact-row > i');
  const titleBlock = blockIn(iconFactRowStyles, '.manager-icon-fact-row strong');
  const subtitleBlock = blockIn(iconFactRowStyles, '.manager-icon-fact-row small');

  for (const declaration of [
    'grid-template-columns: 28px minmax(0, 1fr);',
    'padding: 9px 11px;',
    'border-radius: 6px;',
    'background: var(--fab-bg-1);',
    'border: 1px solid var(--fab-border);',
  ]) {
    assert.ok(rowBlock.includes(declaration), `the fact row should declare ${declaration}`);
  }
  assert.ok(glyphBlock.includes('color: var(--fab-accent);'), 'the leading glyph is the accent');
  assert.ok(titleBlock.includes('font-size: 0.76rem;'), 'the fact title keeps the reference scale');
  assert.ok(
    subtitleBlock.includes('font-size: 0.64rem;') &&
      subtitleBlock.includes('color: var(--fab-text-muted);'),
    'the qualifying line is the muted micro scale'
  );

  // The container keeps only what a scoped block cannot reach: how rows are stacked.
  const listBlock = blockFor('.fabricate-manager .manager-tool-preview-rules > li');
  assert.equal(
    /border|background|padding|grid-template-columns/.test(listBlock),
    false,
    'the rules list must not re-derive the row it now renders through the primitive'
  );
});

// A primitive that coexists with unconverted duplicates is a fourth way of doing the same
// thing, so the CONTRACT MARKUP must exist in exactly one place: the primitive itself.
test('every explainer and fact-row site renders through the primitive, not by hand', () => {
  const managerComponents = readdirSync(managerComponentDir, {
    recursive: true,
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.svelte') &&
        entry.name !== 'ExplainerCard.svelte' &&
        entry.name !== 'IconFactRow.svelte'
    )
    .map((entry) => readFileSync(resolve(entry.parentPath, entry.name), 'utf8'))
    .join('\n');

  for (const dead of [
    'manager-tool-how-it-works',
    'manager-tool-docs-link',
    'manager-evidence-list',
    'manager-tool-inspector-rule-card',
    'manager-explainer-card-list',
    'manager-icon-fact-row',
  ]) {
    assert.equal(
      managerComponents.includes(dead),
      false,
      `${dead} should render through the shared primitive, not hand-rolled markup`
    );
  }

  // And the converted sites really do import it — an assertion that only deleted the old
  // class names would pass on a screen that had simply dropped the card.
  for (const [componentPath, imports] of [
    // The Tool preview renders through the shared scoped-entity shell since issue 1362, so
    // the chain is asserted rather than the leaf: the site must still render A preview shell,
    // and that shell must still render both primitives. Asserting only the site's own imports
    // would have gone red on a faithful conversion; asserting only the shell's would pass on a
    // site that had dropped the card entirely, which is what this test exists to catch.
    ['tools/ToolBehaviorPreview.svelte', ['ScopedEntityPreview']],
    ['scoped/ScopedEntityPreview.svelte', ['ExplainerCard', 'IconFactRow']],
    ['tools/ToolBrowserInspector.svelte', ['IconFactRow']],
    ['CraftingSystemManagerRoot.svelte', ['ExplainerCard']],
    // `checks/ChecksRightMenu.svelte` is NOT on this list any more (issue 1096). The
    // maintainer removed the `ABOUT CRAFTING CHECKS` explainer outright: the prototype's
    // rail has no such card, and it pushed every panel with a subject below the fold. This
    // row asserted the card was rendered through the primitive rather than by hand, which
    // is a different question from whether it should be rendered at all — the rail now
    // renders no explainer, and `the checks rail follows the Tool Studio's inspector
    // convention` below is what holds that.
  ]) {
    const source = readFileSync(resolve(managerComponentDir, componentPath), 'utf8');
    for (const primitive of imports) {
      assert.ok(
        new RegExp(`import ${primitive} from '[^']*${primitive}\\.svelte'`).test(source),
        `${componentPath} should import the shared ${primitive}`
      );
    }
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

test('manager gathering rules inspector stacks descriptions above normal-weight selects', () => {
  const ruleRowBlock = blockFor('.fabricate-manager .manager-rule-row');
  const ruleCopyBlock = blockFor('.fabricate-manager .manager-rule-copy');
  const ruleCopyDescriptionBlock = blockFor('.fabricate-manager .manager-rule-copy span');
  const ruleFieldBlock = blockFor('.fabricate-manager .manager-rule-field');
  // Was a two-selector rule that also painted `.manager-rule-stepper input`. That field is
  // the shared `Stepper` now (issue 1050) and brings its own chrome, so the rule is the
  // `<select>` alone.
  const ruleInputBlock = blockFor('.fabricate-manager .manager-rule-field select');

  assert.ok(
    ruleRowBlock.includes('grid-template-columns: 34px minmax(0, 1fr);'),
    'rule rows should place icon and description on the same row'
  );
  assert.ok(
    ruleCopyBlock.includes('display: flex;') && ruleCopyBlock.includes('flex-direction: column;'),
    'rule copy should stack label and description beside the icon'
  );
  assert.ok(
    ruleCopyDescriptionBlock.includes('color: var(--fab-text-muted);'),
    'rule descriptions should read as supporting copy'
  );
  assert.ok(
    ruleFieldBlock.includes('grid-column: 2;'),
    'rule selects should sit underneath the description column'
  );
  assert.ok(
    ruleFieldBlock.includes('font-weight: 400;'),
    'rule field text should not force bold select text'
  );
  assert.ok(
    ruleInputBlock.includes('font-weight: 400;'),
    'rule select and input text should not inherit bold labels'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-gathering-settings-summary'),
    false,
    'settings center panel should not keep the duplicated rules summary'
  );
});

test('manager gathering settings condition panels use a two-column responsive grid', () => {
  const settingsBlock = blockFor('.fabricate-manager .manager-gathering-settings');
  const panelBlock = blockFor('.fabricate-manager .manager-condition-panel');
  const addBlock = blockFor('.fabricate-manager .manager-condition-add');
  const biomeAddBlock = blockFor('.fabricate-manager .manager-biome-add');
  const pillBlock = blockFor('.fabricate-manager .manager-condition-pill');
  const regionPillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-region');
  const biomePillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-biome');
  const biomeCombinedTriggerBlock = blockFor(
    '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger'
  );
  const biomeCombinedTriggerIconBlock = blockFor(
    '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger i'
  );
  // Issue 1470 re-rooted the colour family off `.fabricate-manager` and onto the namespace
  // classes `ManagerColorPicker` and `ManagerColorPopover` write, so the two shared components
  // paint in whatever application they are mounted in. Same declarations, same specificity, same
  // place in the file — only the root moved, and these lookups follow it.
  const colorPickerPopoverBlock = blockFor(
    '.fabricate-color-picker-popover.manager-color-picker-popover'
  );
  const colorPresetGridBlock = blockFor('.fabricate-color-picker-popover .manager-color-preset-grid');
  const colorCustomInputBlock = blockFor('.fabricate-color-picker-popover .manager-color-custom input');
  const labelInputBlock = blockFor('.fabricate-manager .manager-condition-label-input');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));

  assert.ok(
    settingsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'settings conditions should sit side by side at normal widths'
  );
  assert.ok(
    settingsBlock.includes('align-items: stretch;'),
    'condition panels should stretch to equal height in the two-column layout'
  );
  assert.ok(
    settingsBlock.includes('padding: var(--fab-space-3);'),
    'settings panel should use uniform workspace padding on all sides'
  );
  assert.ok(
    panelBlock.includes('align-content: start;'),
    'condition panel content should pack to its natural height'
  );
  assert.ok(
    panelBlock.includes('height: 100%;'),
    'condition panel backgrounds should fill the stretched grid row'
  );
  // The trailing track is `max-content`, not 48px (issue 1118). A number here sized the
  // column to the two words the Add button happens to hold today; converted, that button
  // takes the primary role's `0 var(--fab-space-4)` — 32px of padding in a 48px box — and
  // clips its own label whatever it says. `.manager-region-add` re-templated this same grid
  // for a region row and was retired in the same edit: no component carries the class.
  assert.ok(
    addBlock.includes('grid-template-columns: 36px minmax(0, 1fr) max-content;'),
    'condition add controls should reserve icon picker, label input, and a content-sized Add column'
  );
  assert.equal(
    blockFor('.fabricate-manager .manager-region-add'),
    '',
    'the dead region-add grid override must not come back'
  );
  assert.ok(
    biomeAddBlock.includes('grid-template-columns: 36px 36px minmax(0, 1fr) max-content;'),
    'biome add controls should align icon, colour, input, and a content-sized Add column'
  );
  // The one declaration `.manager-add-button` keeps: the height that lines it up with the
  // input beside it. Its width, padding and font-size are the primitive's now.
  assert.ok(
    blockFor('.fabricate-manager .manager-add-button').includes('height: 36px;'),
    'the Add button still matches the sibling input height'
  );
  assert.equal(
    blockFor('.fabricate-manager .manager-add-button').includes('width: 48px;'),
    false,
    'and no longer pins itself to the retired 48px box'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-condition-pill-list {\n  display: grid;'),
    'condition pills should use grid rows instead of wrapping as single full-width flex pills'
  );
  assert.ok(
    css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'condition pills should fit two per line'
  );
  assert.ok(
    pillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'),
    'condition pills should reserve icon, label, and remove columns'
  );
  assert.ok(
    regionPillBlock.includes('grid-template-columns: minmax(0, 1fr) 24px;'),
    'region pills should expose editable labels and remove controls without icon columns'
  );
  assert.ok(
    biomePillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'),
    'biome pills should reserve combined icon/color, label, and remove columns'
  );
  assert.ok(
    !biomePillBlock.includes('28px 30px minmax(0, 1fr) 30px 24px;'),
    'biome pills should not reserve separate swatch and colour columns'
  );
  assert.ok(
    biomeCombinedTriggerBlock.includes('color: var(--fab-biome-icon-foreground);'),
    'biome combined icon trigger should use fixed charcoal foreground across themes'
  );
  assert.ok(
    biomeCombinedTriggerBlock.includes(
      'background: var(--manager-color-swatch, var(--fab-tag-sage));'
    ),
    'biome combined icon trigger should keep token/custom swatch backgrounds'
  );
  assert.ok(
    biomeCombinedTriggerIconBlock.includes('color: var(--fab-biome-icon-foreground);'),
    'biome combined nested icons should not inherit theme button colours'
  );
  assert.ok(
    css.includes('--fab-biome-icon-foreground: #202124;'),
    'biome icon foreground token should stay fixed charcoal in theme declarations'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('box-sizing: border-box;'),
    'biome color picker popover should contain its padding and border in its width'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('z-index: 120;'),
    'biome color picker popover should layer with Manager portaled pickers'
  );
  assert.equal(
    colorPickerPopoverBlock.includes('top: calc(100% + 6px);'),
    false,
    'biome color picker popover position should come from computed inline placement'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('width: 220px;'),
    'biome color picker popover should be wide enough for presets and custom hex input'
  );
  assert.ok(
    colorPickerSource.includes('computeIconPickerPopoverLayout'),
    'biome color picker should use shared popover positioning'
  );
  assert.ok(
    colorPickerSource.includes('minWidth: 220') && colorPickerSource.includes('maxWidth: 220'),
    'biome color picker layout should keep a fixed compact width'
  );
  assert.ok(
    colorPickerSource.includes("horizontalAlign: 'left'"),
    'biome color picker layout should left-align with the trigger'
  );
  assert.ok(
    colorPresetGridBlock.includes('grid-template-columns: repeat(4, 1fr);'),
    'biome color picker presets should render as a compact grid'
  );
  assert.ok(
    colorCustomInputBlock.includes('width: 100%;'),
    'biome custom hex input should fill the popover without overflowing'
  );
  assert.ok(
    colorCustomInputBlock.includes('min-width: 0;'),
    'biome custom hex input should be allowed to shrink inside the popover grid'
  );
  assert.ok(
    pillBlock.includes('border-radius: 6px;'),
    'condition pills should be rounded rectangles rather than ovals'
  );
  assert.ok(
    labelInputBlock.includes('align-self: center;'),
    'condition label edit inputs should center inside the pill'
  );
  assert.ok(
    labelInputBlock.includes('min-height: 0;'),
    'condition label edit inputs should override inherited input minimum height'
  );
  assert.ok(
    labelInputBlock.includes('height: 20px;'),
    'condition label edit inputs should stay visually shorter than the pill'
  );
  assert.ok(
    labelInputBlock.includes('max-height: 20px;'),
    'condition label edit inputs should not expand to fill the pill on focus'
  );
  assert.equal(
    labelInputBlock.includes('font-size'),
    false,
    'condition label edit input should not reduce text size to shrink the control'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only'
    ) && css.includes('justify-content: center;'),
    'condition pill icon picker buttons should center icons'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-gathering-settings') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'condition panels should stack at medium widths'
  );
});

// The recipe library is a list of CARD rows (issue 643), not a column grid. The old
// assertions pinned a recipe-grid column template, the `has-no-category` grid variant and
// the medium-query column stacking — none of which a card row has. What replaces them
// is the pair that actually prevents horizontal overflow: the identity cell is the ONLY
// shrinkable flex child, and the control cluster never shrinks.
//
// The absence assertion on that retired column template is GONE (issue 1399). Its needle
// was a legacy generation name the sheet had already stopped declaring, so it could only
// ever pass; `tests/token-generation-gate.test.js` bans the whole name shape from a
// population that is not empty, which is the same guarantee from a gate that can fail.
test('manager recipes browser defines a non-overflowing card row', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  const rowBlock = blockFor('.fabricate-manager .manager-recipe-row');
  const identityBlock = blockFor('.fabricate-manager .manager-recipe-row .manager-recipe-identity');
  const clusterBlock = blockFor('.fabricate-manager .manager-recipe-cluster');
  const groupListBlock = blockFor('.fabricate-manager .manager-recipe-group-list');

  assert.ok(tableBlock.includes('display: flex;'), 'the recipes table stacks its category groups');
  // A single column header sits above the whole list (issue 643). It mirrors the row's
  // flex split (identity + cluster) and its cluster shares the row cluster's fixed
  // template, so the labels line up with the cells beneath them.
  const headBlock = blockFor('.fabricate-manager .manager-recipe-table-head');
  assert.ok(headBlock.includes('display: flex;'), 'the column header mirrors the row flex split');
  const headClusterBlock = blockFor('.fabricate-manager .manager-recipe-head-cluster');
  assert.ok(
    headClusterBlock.includes('grid-template-columns: var(--fab-recipe-cluster-cols);'),
    'the header cluster shares the row cluster column template so the two align'
  );
  assert.ok(
    clusterBlock.includes('grid-template-columns: var(--fab-recipe-cluster-cols);'),
    'the row cluster consumes the same shared column template'
  );
  // The header hides at the stacked breakpoint, where a column header over a stack of
  // cards means nothing — it rides the same rule as the other browsers' table heads.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-table-head,\n  .fabricate-manager .manager-recipe-table-head {\n    display: none;'
    ),
    'the recipe column header hides at the stacked breakpoint alongside the shared table head'
  );
  assert.ok(rowBlock.includes('display: flex;'), 'the recipe row is a flex card');
  assert.ok(rowBlock.includes('min-width: 0;'), 'the recipe row may shrink inside the main column');
  assert.ok(
    identityBlock.includes('flex: 1 1 0;') && identityBlock.includes('min-width: 0;'),
    'the identity cell is the row content that gives way'
  );
  assert.ok(
    clusterBlock.includes('flex-shrink: 0;'),
    'the control cluster (lock / enable / edit) must never be squeezed'
  );
  assert.ok(
    groupListBlock.includes('list-style: none;'),
    'the rows render as a real, unstyled list'
  );

  // The recipe row LEFT the shared 76px row-card geometry group: it is a denser card at
  // 11px/12px and radius 9 (~62px tall), so a page of recipes shows more of the library
  // and less of the gaps between it. The COMPONENT row followed it (issue 676, ruling 1:
  // where the Component Studio and the Recipe Studio disagree, the Recipe Studio wins).
  // The other three browser rows keep the 76px group — this change never visited them.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-row,\n.fabricate-manager .manager-gathering-task-row,\n.fabricate-manager .manager-essence-row {\n  width: 100%;\n  min-height: 76px;'
    ),
    'environment, gathering task, and essence rows keep the shared 76px row height'
  );
  for (const row of ['manager-recipe-row', 'manager-component-row']) {
    assert.equal(
      new RegExp(`\\.${row},\\n[^{]*min-height: 76px`).test(css),
      false,
      `the ${row} must not still be in the 76px geometry group`
    );
  }
  assert.ok(rowBlock.includes('min-height: 62px;'), 'the recipe row is the denser library card');
  assert.ok(
    rowBlock.includes('padding: 11px 12px;'),
    'the recipe row uses the library card padding'
  );
  // The recipe row's own radius (9px) was retired by issue 883: the edge, corner and fill
  // are the ONE browser-row treatment now, so the row block must declare none of them.
  // Asserting their ABSENCE is what stops the copy being written back in.
  assert.equal(
    /border-radius:|border: 1px|background:/.test(rowBlock),
    false,
    'the recipe row must not restate the shared browser-row edge, corner or fill'
  );

  // A disabled row reads at .55, not .62 — far enough back that a page of rows separates
  // at a glance into what is live and what is not.
  assert.ok(
    blockFor('.fabricate-manager .manager-recipe-row.is-off').includes('opacity: 0.55;'),
    'a disabled row recedes'
  );

  // Selection is the accent BORDER. A ring plus an inset left bar is the same statement
  // made twice, and the bar bit into the row's medallion. The COMPONENT row joined the
  // opt-out in issue 676: it now leads with the same Medallion, so it had the same defect.
  // The ESSENCE row joined in issue 1036 on the same precondition — its redesign gave it
  // the 40px Medallion lead — and it is also the only one of the three that renders as a
  // GRID CARD, where an inset left bar is not even the right axis. The environment and
  // gathering-task rows are deliberately NOT here: they still lead differently.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected'
    ).includes('box-shadow: none;'),
    'the selected recipe, component and essence rows ring in the accent and add no left bar'
  );
  for (const row of ['manager-environment-row', 'manager-gathering-task-row']) {
    assert.equal(
      css.includes(`.fabricate-manager .${row}.is-selected,\n`) ||
        css.includes(`.fabricate-manager .${row}.is-selected {`),
      true,
      `${row} still declares the shared selected treatment`
    );
    assert.equal(
      new RegExp(`\\.${row}\\.is-selected[^{]*\\{[^}]*box-shadow: none`).test(css),
      false,
      `${row} keeps the inset bar — it was not re-skinned by the essence change`
    );
  }
});

// The collapse ladder (issue 643 §8). Drop order is fixed and monotonic, and the
// lock / enable / edit controls are never in it.
//
// The ladder measures the ROW's own container, not the manager. `.manager-body` is
// `220px + 1fr + 300px` above 1120px and only collapses to one column at or below it,
// so a manager-keyed ladder fired NONE of its steps in the 1121-1280px band — exactly
// where the row is at its narrowest (~570-760px) — and every step once the layout
// stacked, where the row has the whole window. Keying it to `.manager-recipes-table`
// makes each step fire when the row is actually short of room.
test('manager recipe row collapses in the specified order and never drops its controls', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  assert.ok(
    tableBlock.includes('container-type: inline-size;') &&
      tableBlock.includes('container-name: fabricate-recipes;'),
    'the row ladder needs a container that measures the ROW, not the whole manager'
  );

  // The ladder's old fourth rung dropped the switch's "On"/"Off" text at 440px. That text
  // is no longer rendered in the row at all — the track colour is the state, the aria-label
  // names it, and the Disabled pill says it in words — so the rung is gone rather than left
  // as a rule matching nothing.
  // Each rung moved out by 34px for issue 1010 — the 22px bulk selection track plus one
  // more 12px grid gap — so every band gives the identity cell exactly the room it did
  // before. Holding the thresholds fixed would have spent the identity's own budget on the
  // checkbox; the arithmetic is stated beside the ladder in the sheet.
  const LADDER = [
    [714, '.fabricate-manager .manager-recipe-row .manager-recipe-description'],
    [634, '.fabricate-manager .manager-recipe-row .manager-recipe-io'],
    [554, '.fabricate-manager .manager-recipe-row .manager-recipe-check'],
  ];

  for (const [width, selector] of LADDER) {
    const query = css.slice(css.indexOf(`@container fabricate-recipes (max-width: ${width}px)`));
    assert.ok(query.length > 0, `a ${width}px recipe-container query should exist`);
    const rule = query.slice(query.indexOf(selector));
    assert.ok(
      query.includes(selector) && rule.slice(0, rule.indexOf('}')).includes('display: none;'),
      `${selector} should drop at ${width}px of ROW width`
    );
  }

  assert.equal(
    css.includes('.fabricate-manager .manager-recipe-row .manager-status-toggle-label'),
    false,
    'the row renders no On/Off text, so nothing should still be styled to hide it'
  );

  for (const kept of ['.manager-recipe-lock', '.manager-recipe-status', '.manager-action-group']) {
    assert.equal(
      new RegExp(`\\.manager-recipe-row \\${kept} \\{\\n  display: none;`).test(css),
      false,
      `${kept} must survive every width — it is an operable control`
    );
  }

  // The three status pills are all `white-space: nowrap`, and the identity cell set no
  // overflow: they could spill out of it. The name gives way first; the row clips.
  const nameRowBlock = blockFor('.fabricate-manager .manager-recipe-name-row');
  const nameBlock = blockFor('.fabricate-manager .manager-recipe-name-row .manager-system-name');
  assert.ok(
    nameRowBlock.includes('overflow: hidden;'),
    'the pills cannot escape the identity cell'
  );
  assert.ok(
    nameBlock.includes('flex: 0 1 auto;') && nameBlock.includes('min-width: 0;'),
    'the name is what gives way, so the pills stay readable'
  );
});

// Issue 1010 — the bulk selection column. It is APPENDED to the cluster template rather
// than prepended, and that is what makes the column header's four explicit `grid-column`
// placements survive: a prepend would have shifted every one of them by a track.
//
// The ladder rewrites the template at each rung, so "appended" has to hold in ALL THREE
// declarations — the base and the two rungs — or the checkbox lands under the edit pencil
// at the very widths where the row is tightest.
test('the recipe cluster appends a bulk selection column that the ladder never drops', () => {
  const declarations = [...css.matchAll(/--fab-recipe-cluster-cols:\s*([^;]+);/g)].map(
    ([, value]) => value.replace(/\s+/g, ' ').trim()
  );
  assert.equal(
    declarations.length,
    3,
    "the base template plus the ladder's two rewrites — a fourth would be an unpinned band"
  );

  for (const declaration of declarations) {
    const tracks = [...declaration.matchAll(/var\(--fab-recipe-col-([a-z]+)\)/g)].map(
      ([, name]) => name
    );
    assert.equal(
      tracks.at(-1),
      'select',
      `the select track must be LAST in "${declaration}" — the header placements assume an append`
    );
    // Never dropped: a truncated readout is a compromise, a selection the GM cannot reach
    // is a control that has silently stopped working.
    assert.equal(
      tracks.filter((track) => track === 'select').length,
      1,
      'the select track appears exactly once in every band'
    );
  }

  assert.ok(
    blockFor('.fabricate-manager .manager-recipes-table').includes(
      '--fab-recipe-col-select: 22px;'
    ),
    'the track is the SelectionCheckbox `lg` box, declared rather than derived'
  );
});

// The three multi-select browsers state the ticked-row treatment ONCE. A per-studio copy is
// the variant the shared-primitive rule refuses, and it would drift the moment any one
// surface is re-toned.
//
// The ESSENCE row joined for issue 1036. Its absence was a live defect, not a missing
// nicety: `EssenceRow.svelte` already wrote `class:is-bulk-selected` and NOTHING matched it
// in either the sheet or the component's own scoped block, so a ticked essence read exactly
// like an unticked one — in the one studio whose bulk panel can also DELETE what is ticked.
test('the bulk-selected row state is one joined selector across every multi-select studio', () => {
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-component-row.is-bulk-selected,\n.fabricate-manager .manager-recipe-row.is-bulk-selected,\n.fabricate-manager .manager-essence-row.is-bulk-selected {'
    ),
    'the recipe and essence rows JOIN the component row rule rather than authoring a second block'
  );
  // ── A ROUTE MAY RESTATE THE TONE, AND MAY NOT RE-TONE IT (issue 1373) ────────────────────
  // Three routes flatten their rows to `background: transparent` so that a 1px border is what
  // makes a row a row, which is the reference's own construction on those screens. That
  // flattening is written at (0,3,0) — the SAME weight as the shared rule above — and stands
  // LATER in the sheet, so it cancelled the ticked fill outright and a ticked row on those
  // screens painted nothing at all. The repair is a route-scoped RESTATEMENT, and that is a
  // different object from the per-studio copy this test was written to forbid: it must name
  // `var(--fab-surface-active)`, the shared rule's own value, so re-toning one studio still
  // fails here. What stays capped at one is the UNSCOPED statement.
  //
  // The scoped-list row joins the loop although it is not in the join above — it has a block of
  // its own by design, and it is the row class two of those three routes render.
  //
  // Comments are stripped first: a paragraph naming a selector is not a declaration of it, and
  // every one of these rules is explained at length directly above itself.
  const declarations = css.replaceAll(/[/][*][^]*?[*][/]/g, '');
  const ruleAt = (selector) => {
    const at = declarations.indexOf(selector);
    return at < 0 ? '' : declarations.slice(at, declarations.indexOf('}', at) + 1);
  };
  const bulkRows = [
    'manager-component-row',
    'manager-recipe-row',
    'manager-essence-row',
    'manager-scoped-list-row',
  ];
  for (const row of bulkRows) {
    // Every selector that names this row's ticked state, each taken back to the start of its
    // own line so the route attribute — the thing that distinguishes a restatement from a copy
    // — travels with it. Selectors in this sheet are written one per line.
    const needle = `.${row}.is-bulk-selected`;
    const written = declarations
      .split(needle)
      .slice(0, -1)
      .map((before) => before.slice(before.lastIndexOf('\n') + 1) + needle);
    const routed = written.filter((selector) => selector.includes('[data-manager-view='));
    assert.equal(
      written.length - routed.length,
      1,
      `${row}.is-bulk-selected must be written exactly once outside any route`
    );
    for (const selector of routed) {
      assert.ok(
        ruleAt(selector).includes('background: var(--fab-surface-active)'),
        `${selector} may restate the shared ticked fill, never re-tone it`
      );
    }
  }
  // The negative control on the widening: the environments and gathering-task browsers have
  // no bulk selection at all, so adding the essence row must not have turned the join into
  // "every browser row". A ticked treatment on a row nothing can tick is a dead rule.
  for (const row of ['manager-environment-row', 'manager-gathering-task-row']) {
    assert.equal(
      css.includes(`.${row}.is-bulk-selected`),
      false,
      `${row} carries no bulk selection, so it must not join the ticked-row treatment`
    );
  }

  // The selection ROW joins the same way, for the same reason: one primitive renders it in
  // all three toolbars and its `rowClass` prop picks which third applies.
  //
  // The essence library joined for issue 1036, and its absence was a live defect rather
  // than a cosmetic one: it passed `rowClass="manager-essence-filter-row"` while authoring
  // that class only in its own scoped `<style>`, which a child component's root element
  // cannot see. The selection row therefore rendered with NO row metrics at all.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-recipe-filter-row.is-selection,\n.fabricate-manager .manager-component-filter-row.is-selection,\n.fabricate-manager .manager-essence-filter-row.is-selection {'
    ),
    'every toolbar rendering the shared selection row joins one selection-row block'
  );
  assert.equal(
    css.includes('has no selection row at all'),
    false,
    "that block's stated reason is retired by issue 1010 and must not survive as a false claim"
  );
});

// Two long-label regressions the shared switch caused, both confirmed on a real smoke
// frame. `.manager-status-toggle` is a STATUS cell: it caps at 78px and ellipsises its
// label, which is right for "On"/"Off" and wrong for anything the GM has to read.
test('long-labelled switches escape the status cell geometry', () => {
  // (1) The library's grouping switch used to render as "Grou…": 78px - 34px track - gap
  // leaves ~36px. It now carries NO label of its own — the uppercase micro-label beside it
  // is its accessible name (`aria-labelledby`) — so it is track-only, and it opts out of
  // the status-cell cap so the track is not squeezed either.
  // The component library's grouping switch (issue 676) shares the rule: it shipped as a
  // `.manager-button` under a class carrying NO CSS at all, so its pressed state had no
  // visual expression whatsoever.
  const groupToggleBlock = blockFor(
    '.fabricate-manager .manager-recipe-filter-row .manager-status-toggle[data-recipe-group-toggle],\n.fabricate-manager .manager-component-filter-row .manager-status-toggle[data-component-group-by-category]'
  );
  assert.ok(
    groupToggleBlock.includes('max-width: none;'),
    'the group-by-category switch must not inherit the 78px status-cell cap'
  );
  assert.ok(groupToggleBlock.includes('width: auto;'), 'a track-only switch is sized by its track');

  // The micro-label is what titles the control, and `white-space: nowrap` is the whole
  // reason "Sort by" no longer breaks onto two lines in the flagship frame.
  const filterLabelBlock = blockFor(
    '.fabricate-manager .manager-recipe-filter-label,\n.fabricate-manager .manager-component-filter-label,\n.fabricate-manager .manager-essence-filter-label'
  );
  assert.ok(filterLabelBlock.includes('white-space: nowrap;'), 'a filter micro-label never wraps');
  assert.ok(
    filterLabelBlock.includes('text-transform: uppercase;'),
    'a filter micro-label is a micro-label'
  );
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-filter-divider,\n.fabricate-manager .manager-component-filter-divider'
    ).includes('width: 1px;'),
    'the view controls are ruled apart'
  );

  // (2) The Overview Enabled/Locked status cards are left-aligned rows (icon + copy
  // + switch), not the media column's centred, 14ch-clamped stack (issue 643).
  const statusCardBlock = blockFor('.fabricate-manager .manager-recipe-status-card');
  const statusSubBlock = blockFor('.fabricate-manager .manager-recipe-status-sub');
  assert.ok(
    statusCardBlock.includes('display: flex;') && statusCardBlock.includes('align-items: center;'),
    'a status card is an icon + copy + switch row, not a centred stack'
  );
  assert.equal(
    statusSubBlock.includes('max-width:'),
    false,
    'the status sub-line must not be clamped to the 96px media column width'
  );
  assert.equal(
    statusSubBlock.includes('text-align: center;'),
    false,
    'the status sub-line reads left-aligned, not centred mid-card'
  );
});

// Selection is an identity cue ("you are here"), never a status. Success/amber stay
// reserved for enabled and warning states — a selected row tinted `--fab-success-soft`
// wears the exact colour its own ON switch uses, inches away (issue 643).
test('a selected browser row reads as an identity cue in the accent family, not a status', () => {
  const selectedRowBlock = blockFor(
    '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-environment-row.is-selected,\n.fabricate-manager .manager-gathering-task-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected'
  );
  const selectedSystemBlock = blockFor('.fabricate-manager .manager-system-row.is-selected');
  const identityFocusBlock = blockFor(
    '.fabricate-manager .manager-system-identity:focus-visible,\n.fabricate-manager .manager-recipe-identity:focus-visible,\n.fabricate-manager .manager-component-identity:focus-visible,\n.fabricate-manager .manager-environment-identity:focus-visible,\n.fabricate-manager .manager-gathering-task-identity:focus-visible,\n.fabricate-manager .manager-essence-identity:focus-visible'
  );

  for (const [name, block] of [
    ['the selected row', selectedRowBlock],
    ['the selected system card', selectedSystemBlock],
  ]) {
    assert.ok(
      block.includes('background: var(--fab-surface-soft);'),
      `${name} uses a neutral soft surface`
    );
    assert.ok(
      block.includes('border-color: var(--fab-accent-border);'),
      `${name} rings in the accent`
    );
    assert.equal(
      block.includes('var(--fab-success-soft)'),
      false,
      `${name} must not wear the enabled-status colour`
    );
  }

  assert.ok(
    identityFocusBlock.includes('outline: 2px solid var(--fab-accent);'),
    'the identity focus ring follows the accent focus standard, not the success family'
  );
});

// The typographic contract (issue 643, `openspec/specs/ui-integration/spec.md`
// § Typographic contract): serif on names and headings, mono + tabular figures on
// every numeric. A count badge that shifts width between 9 and 10 moves the control
// beside it, so tabular-nums is part of the contract, not a nicety.
test('the typographic contract sets names in the serif and numerics in the mono face', () => {
  const SERIF = [
    '.fabricate-manager .manager-rail-title,\n.fabricate-manager .manager-card-title',
    '.fabricate-manager .manager-inspector-name',
    '.fabricate-manager .manager-recipe-name-row .manager-system-name',
    // The rail's selected system is now the `<select>`'s own value, not a static span.
    '.fabricate-manager .manager-scope-select',
    '.fabricate-manager .manager-recipe-ingredient-set-name',
    '.fabricate-manager input[data-recipe-field="name"]',
  ];
  for (const selector of SERIF) {
    assert.ok(
      blockFor(selector).includes('font-family: var(--fab-font-serif);'),
      `${selector} is a name or a heading and belongs in the serif`
    );
  }

  const MONO = [
    // Read out of `Chip.svelte`'s scoped block, since the chip owns its own appearance
    // (issue 883); everything else in this list is still global-sheet.
    '.manager-chip.is-mono',
    // Three classes deliberately, so it outranks the scoped chip block rather than tying
    // with it and losing on source order (issue 883).
    '.fabricate-manager .manager-chip.manager-editor-tab-badge',
    '.fabricate-manager .manager-environment-comp-order',
    '.fabricate-manager .manager-nav-count',
  ];
  for (const selector of MONO) {
    const block = selector.startsWith('.manager-chip')
      ? blockIn(chipStyles, selector)
      : blockFor(selector);
    assert.ok(
      block.includes('font-family: var(--fab-font-mono);'),
      `${selector} renders a number and belongs in the mono face`
    );
    assert.ok(
      block.includes('font-variant-numeric: tabular-nums;'),
      `${selector} must not change width between 9 and 10`
    );
  }

  // The last clause of the contract, applied: "a control whose text is words rather than
  // a number stays in the UI face". "2 in · 1 out" is a PHRASE — the mono face marks a
  // numeric (a quantity, a DC, a count badge), it does not decorate a readout, and the
  // mono digits visibly widened this one.
  assert.equal(
    blockFor('.fabricate-manager .manager-recipe-io-counts').includes(
      'font-family: var(--fab-font-mono);'
    ),
    false,
    "the row's I/O readout is a phrase, not a numeric, and stays in the UI face"
  );
});

test('Tool replacement Component picker resists Foundry button height and image overrides', () => {
  const triggerBlock = blockFor(
    '.fabricate-manager .manager-button.manager-salvage-component-trigger,\n' +
      '.fabricate-manager .manager-button.manager-recipe-component-trigger,\n' +
      '.fabricate-manager .manager-button.manager-tool-replacement-component-trigger'
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

test('manager gathering task browser defines bounded toolbar and compact table geometry without reorder controls', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-task-toolbar');
  const panelBlock = blockFor('.fabricate-manager .manager-gathering-panel-tasks');
  const tableBlock = blockFor('.fabricate-manager .manager-gathering-tasks-table');
  const rowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-table-head,\n.fabricate-manager .manager-gathering-task-row'
  );
  const identityBlock = blockFor(
    '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity,\n.fabricate-manager .manager-gathering-task-identity,\n.fabricate-manager .manager-essence-identity'
  );
  const toolsRowBlock = blockFor('.fabricate-manager .manager-tools-row');
  const toolsSelectedRowBlock = blockFor('.fabricate-manager .manager-tools-row.is-selected');
  // THE RULE THAT ACTUALLY PAINTS A SELECTED ROW. `ToolsBrowserView` renders
  // `<article class="manager-tools-row"><button class="manager-tools-select-target">`, so the
  // two `> .manager-tools-row-body` rules this used to read were DEAD — nothing has rendered
  // that element since the list was rewritten, and the `--fab-success-soft` one was the rule
  // finding 8 of the parity pass cited without it ever reaching a pixel (issue 1373).
  const toolsSelectedListRowBlock = blockFor(
    '.fabricate-manager .manager-tools-library-list > article.is-selected'
  );
  const toolsIdentityBlock = blockFor('.fabricate-manager .manager-tools-identity');
  const editorBlock = blockFor('.fabricate-manager .manager-gathering-task-edit-view');
  const availabilityBlock = blockFor('.fabricate-manager .manager-task-availability-row');
  const componentBrowserBlock = blockFor('.fabricate-manager .manager-task-component-browser-card');
  const componentBrowserControlsBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-controls'
  );
  const componentBrowserScrollBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-scroll'
  );
  const componentGridBlock = blockFor('.fabricate-manager .manager-task-component-grid');
  const componentCardBlock = blockFor('.fabricate-manager .manager-task-component-card');
  const componentCardCopySharedBlock = blockFor(
    '.fabricate-manager .manager-task-component-card-copy strong,\n.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags)'
  );
  const componentCardGripBlock = blockFor('.fabricate-manager .manager-task-component-card-grip');
  const componentBrowserFooterBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-footer'
  );
  const componentBrowserFooterPaginationBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-footer .manager-pagination'
  );
  const componentPillsBlock = blockFor('.fabricate-manager .manager-task-component-pills');
  // Three classes since issue 883: the pill is a `Chip`, whose scoped block also sits at
  // two classes and is injected after this sheet, so the two-class form would lose.
  const selectedTagPillBlock = blockFor(
    '.fabricate-manager .manager-chip.manager-selected-tag-pill'
  );
  const dropCardBlock = blockFor('.fabricate-manager .manager-task-drops-card');
  const dropHeaderBlock = blockFor(
    '.fabricate-manager .manager-task-drops-card .manager-task-card-header'
  );
  const dropControlsBlock = blockFor('.fabricate-manager .manager-task-drop-controls');
  const dropSearchBlock = blockFor(
    '.fabricate-manager .manager-task-drop-controls .manager-search.is-compact'
  );
  const dropSearchInputBlock = blockFor(
    '.fabricate-manager .manager-task-drop-controls .manager-search.is-compact input'
  );
  const dropFooterBlock = blockFor('.fabricate-manager .manager-task-drop-footer');
  const dropFooterPaginationBlock = blockFor(
    '.fabricate-manager .manager-task-drop-footer .manager-pagination'
  );
  const dropScrollBlock = blockFor(
    '.fabricate-manager .manager-task-drops-card .manager-table-scroll'
  );
  const dropTableBlock = blockFor('.fabricate-manager .manager-gathering-task-drops-table');
  const dropTableRankedBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drops-table.is-ranked-mode'
  );
  const dropRankCellBlock = blockFor('.fabricate-manager .manager-drop-rank-cell');
  const dropRankValueBlock = blockFor('.fabricate-manager .manager-drop-rank-value');
  const dropRankButtonBlock = blockFor('.fabricate-manager .manager-drop-rank-button');
  const dropTableHeadBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head');
  const dropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head,\n.fabricate-manager .manager-gathering-task-drop-row'
  );
  const firstDropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head + .manager-gathering-task-drop-row'
  );
  const dropCellBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head > *,\n.fabricate-manager .manager-gathering-task-drop-row > *'
  );
  const dropCellSeparatorBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head > * + *,\n.fabricate-manager .manager-gathering-task-drop-row > * + *'
  );
  const selectedDropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-row.is-selected'
  );
  const dropComponentButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button,\n.fabricate-manager .manager-drop-empty-component'
  );
  const dropEmptyComponentBlock = blockFor('.fabricate-manager .manager-drop-empty-component');
  const dropEmptyComponentIconBlock = blockFor(
    '.fabricate-manager .manager-drop-empty-component .manager-inline-drop-zone'
  );
  const dropComponentCopyBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button .manager-system-copy,\n.fabricate-manager .manager-drop-empty-component .manager-system-copy'
  );
  const dropComponentNameBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button .manager-system-name'
  );
  const dropRateBlock = blockFor('.fabricate-manager .manager-drop-rate-cell');
  const dropRateValueBlock = blockFor('.fabricate-manager .manager-drop-rate-value');
  const dropRatePercentBlock = blockFor('.fabricate-manager .manager-drop-rate-percent');
  const dropRatePercentInputBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-percent input:is([type="text"], [type="number"])'
  );
  const dropRatePercentInputOverrideBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-edit-view .manager-drop-rate-percent input:is([type="text"], [type="number"])'
  );
  const dropRatePercentSuffixBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-percent > span[aria-hidden="true"]'
  );
  const dropRateControlBlock = blockFor('.fabricate-manager .manager-drop-rate-control');
  const guaranteedDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-guaranteed'
  );
  const commonDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-common'
  );
  const uncommonDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-uncommon'
  );
  const rareDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-rare'
  );
  const veryRareDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-very-rare'
  );
  const legendaryDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-legendary'
  );
  const noneDropRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.is-none'
  );
  const dropRateTrackBlock = blockFor('.fabricate-manager .manager-drop-rate-track');
  const dropRateFillBlock = blockFor('.fabricate-manager .manager-drop-rate-fill');
  const continuousGradientFillBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control.has-continuous-gradient .manager-drop-rate-fill'
  );
  const dropRateRangeBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control input[type="range"]'
  );
  const dropRateWebkitTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track'
  );
  const dropRateWebkitThumbBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control input[type="range"]::-webkit-slider-thumb'
  );
  const dropRateMozProgressBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-progress'
  );
  const dropRateMozThumbBlock = blockFor(
    '.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-thumb'
  );
  const toolBreakageChanceControlBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-control'
  );
  const toolBreakageChanceCardBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-card'
  );
  const toolBreakageChanceSliderBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-card .manager-chance-slider'
  );
  const dropModifierListBlock = blockFor('.fabricate-manager .manager-drop-modifier-list');
  const dropModifierPillBlock = blockFor('.fabricate-manager .manager-drop-modifier-pill');
  const positiveDropModifierPillBlock = blockFor(
    '.fabricate-manager .manager-drop-modifier-pill.is-positive'
  );
  const negativeDropModifierPillBlock = blockFor(
    '.fabricate-manager .manager-drop-modifier-pill.is-negative'
  );
  const dropModifierOverflowBlock = blockFor('.fabricate-manager .manager-drop-modifier-overflow');
  const dropEditorInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))'
  );
  const dropEditorValuesBlock = blockFor('.fabricate-manager .manager-drop-editor-values');
  const dropEditorRatePercentBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card .manager-drop-rate-percent input[type="number"]'
  );
  const dropEditorRateValueBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-value'
  );
  const dropEditorRateInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input[type="number"]'
  );
  const dropEditorRateSuffixBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent > span[aria-hidden="true"]'
  );
  const dropEditorRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control'
  );
  const dropEditorRateTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-track'
  );
  const dropEditorRateFillBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-fill'
  );
  const dropEditorRateRangeBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]'
  );
  const dropEditorRateWebkitTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track'
  );
  const dropEditorRateMozTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-moz-range-track'
  );
  const dropEditorCountBlock = blockFor('.fabricate-manager .manager-drop-count-editor');
  const dropEditorCountInputBlock = blockFor(
    '.fabricate-manager .manager-drop-count-editor input[type="text"]'
  );
  const dropEditorInspectorCountInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card .manager-drop-count-editor[data-gathering-drop-inspector-count] input[type="text"]'
  );
  const dropInspectorButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-button'
  );
  const dropInspectorIconButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-icon-button'
  );
  const dropInspectorSearchInputBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-search input'
  );
  const dropInspectorCharacterFieldBlock = blockFor(
    '.fabricate-manager .manager-character-modifier-row-card .manager-field :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))'
  );
  const dropInspectorCharacterOperatorBlock = blockFor(
    '.fabricate-manager .manager-character-modifier-operator-select select'
  );
  const dropEditorActionsBlock = blockFor('.fabricate-manager .manager-drop-editor-actions');
  const dropInspectorStackBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack');
  const dropInspectorRouteBlock = blockFor(
    '.fabricate-manager[data-manager-view="gathering-task-edit"] .manager-inspector'
  );
  const dropInspectorDividerBlock = blockFor('.fabricate-manager .manager-drop-inspector-divider');
  const dropInspectorScrollBlock = blockFor('.fabricate-manager .manager-drop-inspector-scroll');
  const dropQuantityCellBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-row > .manager-drop-quantity-cell'
  );
  const dropQuantityInputBlock = blockFor(
    '.fabricate-manager .manager-drop-quantity-cell input[type="text"]'
  );
  const dropQuantityInputOverrideBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-edit-view .manager-drop-quantity-cell input[type="text"]'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const taskEditorIntermediateQuery = css.slice(
    css.indexOf('@container fabricate-manager (max-width: 1320px)'),
    css.indexOf('@container fabricate-manager (max-width: 1120px)')
  );

  assert.ok(
    toolbarBlock.includes('max-height: 112px;') && toolbarBlock.includes('overflow-y: auto;'),
    'task toolbar should stay bounded when filters wrap or labels are long'
  );
  assert.ok(
    panelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'),
    'task panel should reserve toolbar, table scroll, and pagination rows'
  );
  assert.ok(
    tableBlock.includes('--fab-manager-gathering-task-grid:'),
    'task browser should define a compact desktop grid'
  );
  assert.ok(!tableBlock.includes('reorder'), 'task browser should not reserve a reorder column');
  assert.ok(
    rowBlock.includes('grid-template-columns: var(--fab-manager-gathering-task-grid);'),
    'task rows should use the shared task grid'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);'),
    'task identity should reserve thumbnail space'
  );
  assert.ok(
    toolsRowBlock.includes('position: relative;'),
    'tool rows should anchor the dirty pip overlay without involving header flow'
  );
  // SELECTION IS AN ACCENT EDGE AND THE ACTIVE FILL (issue 1373). This asserted
  // `--fab-border-strong` against a `--fab-surface-soft` fill — roughly an 11-level luminance
  // step over the row's own overlay, which reads as an accident of lighting rather than as a
  // chosen row — and forbade the accent alongside it. The reference marks a selected row the
  // way it marks every other chosen thing on these screens: `--fab-accent-border` with
  // `--fab-surface-active`.
  //
  // THE INSET MARKER STAYS FORBIDDEN, and that half of the original ratchet is intact: an
  // accent BORDER is the edge of the card, while `box-shadow: inset 3px 0 0` is a second
  // vocabulary this list does not use anywhere else.
  assert.ok(
    toolsSelectedListRowBlock.includes('border-color: var(--fab-accent-border);') &&
      toolsSelectedListRowBlock.includes('background: var(--fab-surface-active);') &&
      toolsSelectedListRowBlock.includes('box-shadow: none;') &&
      !toolsSelectedListRowBlock.includes('box-shadow: inset 3px 0 0 var(--fab-accent);'),
    'a selected tool row takes the accent edge and the active fill, never an inset line marker'
  );
  assert.ok(
    toolsSelectedRowBlock.includes('border-color: var(--fab-accent-border);') &&
      toolsSelectedRowBlock.includes('box-shadow: none;'),
    'and the shared row rule agrees with it rather than stating a second answer'
  );
  assert.equal(
    toolsSelectedListRowBlock.includes('var(--fab-success'),
    false,
    'never the SUCCESS family: green is this screen `Enabled` tone, and one colour cannot say ' +
      'both "selected" and "enabled" on a list whose every row carries an enable switch'
  );
  assert.ok(
    toolsIdentityBlock.includes('width: 100%;'),
    'tool identity drop zones should fill the stable component column'
  );
  assert.ok(
    editorBlock.includes('grid-auto-rows: auto;'),
    'task edit route should size rows to each card so sections can be reordered; the fixed-height cards (component browser, drops) set their own height'
  );
  assert.ok(
    editorBlock.includes('overflow: auto;'),
    'task editor should allow vertical scrolling without horizontal overflow'
  );
  assert.ok(
    availabilityBlock.includes('grid-template-columns: repeat(2, minmax(160px, 1fr));'),
    'task availability controls should form a stable two-column grid'
  );
  assert.ok(
    componentBrowserBlock.includes('height: 340px;') &&
      componentBrowserBlock.includes('max-height: 340px;') &&
      componentBrowserBlock.includes('overflow: hidden;'),
    'component browser should own a fixed bounded height that keeps the footer visible'
  );
  assert.ok(
    componentBrowserBlock.includes('grid-template-rows: auto auto minmax(0, 1fr) auto;'),
    'component browser should reserve header, optional pills, card scroll, and footer rows'
  );
  assert.ok(
    componentPillsBlock.includes('border-top: 1px solid var(--fab-border);'),
    'component browser selected tags should occupy a distinct pill row'
  );
  assert.ok(
    selectedTagPillBlock.includes('background: var(--fab-success-soft);'),
    'selected component tag filters should use removable selected-tag pill styling'
  );
  assert.ok(
    componentBrowserControlsBlock.includes(
      'grid-template-columns: minmax(180px, 0.9fr) minmax(180px, 0.9fr);'
    ),
    'component browser should keep name and tag search in a compact control grid'
  );
  assert.ok(
    componentBrowserScrollBlock.includes('overflow: hidden auto;'),
    'component browser card area should scroll internally without horizontal overflow'
  );
  assert.ok(
    componentGridBlock.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'),
    'component browser should use a three-column card grid'
  );
  assert.ok(
    componentCardBlock.includes('grid-template-columns: 38px minmax(0, 1fr) 18px;') &&
      componentCardBlock.includes('min-height: 72px;'),
    'component browser cards should reserve image, copy, and grip columns'
  );
  assert.ok(
    componentCardCopySharedBlock.includes('text-overflow: ellipsis;'),
    'component card shared copy should truncate within the card'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-task-component-card-copy strong {\n  -webkit-line-clamp: 1;'
    ) &&
      css.includes(
        '.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags) {\n  -webkit-line-clamp: 1;'
      ),
    'component card name and description should clamp to one line'
  );
  assert.ok(
    componentCardGripBlock.includes('letter-spacing: 0;'),
    'component grip should avoid viewport-scaled or negative tracking'
  );
  assert.ok(
    componentBrowserFooterBlock.includes('border-top: 1px solid var(--fab-border);'),
    'component browser should own a pagination footer'
  );
  assert.ok(
    componentBrowserFooterPaginationBlock.includes('background: transparent;'),
    'component browser footer should not nest pagination chrome'
  );
  assert.ok(
    dropCardBlock.includes('--fab-manager-task-drop-table-visible-height: 262px;'),
    'drop rules card should define an exact table viewport equal to header plus three rows'
  );
  assert.ok(
    dropCardBlock.includes(
      'grid-template-rows: auto var(--fab-manager-task-drop-table-visible-height) auto;'
    ),
    'drop rules card should keep the table viewport definite between the card header and footer'
  );
  assert.ok(
    dropCardBlock.includes('height: 410px;') && dropCardBlock.includes('max-height: 410px;'),
    'task editor drop rules card should be exactly tall enough for the three-row table viewport and footer'
  );
  assert.ok(
    dropHeaderBlock.includes('grid-template-columns: minmax(0, 1fr) auto;'),
    'drop rules header should put copy left and controls right'
  );
  assert.ok(
    dropControlsBlock.includes('display: inline-flex;') &&
      dropControlsBlock.includes('justify-content: flex-end;'),
    'drop rules search and add action should share a compact toolbar'
  );
  assert.ok(
    dropSearchBlock.includes('min-width: min(220px, 100%);'),
    'drop rules search should not collapse until its icon overlaps the text area'
  );
  assert.ok(
    dropSearchInputBlock.includes('padding-left: 36px;'),
    'drop rules search input should reserve text inset for the leading search icon'
  );
  assert.ok(
    dropFooterBlock.includes('border-top: 1px solid var(--fab-border);'),
    'drop rules count should live in a footer area with pagination'
  );
  assert.ok(
    dropFooterPaginationBlock.includes('background: transparent;'),
    'drop rules footer should not nest pagination chrome'
  );
  assert.ok(
    dropScrollBlock.includes('height: var(--fab-manager-task-drop-table-visible-height);') &&
      dropScrollBlock.includes('max-height: var(--fab-manager-task-drop-table-visible-height);'),
    'drop rules table scroll region should show exactly three complete rows before scrolling'
  );
  assert.ok(
    dropScrollBlock.includes('padding: var(--fab-space-3) 0 0;'),
    'drop rules table scroll region should not add horizontal inset'
  );
  assert.ok(
    dropScrollBlock.includes('overflow: hidden auto;'),
    'drop rules table should suppress horizontal scroll while retaining vertical scrolling'
  );
  assert.ok(
    dropTableBlock.includes('--fab-manager-task-drop-grid:'),
    'task editor drop rows should define compact desktop geometry'
  );
  assert.ok(
    dropTableBlock.includes('minmax(0, 1.05fr)') &&
      dropTableBlock.includes('minmax(220px, 1.35fr)') &&
      dropTableBlock.includes('56px') &&
      dropTableBlock.includes('minmax(180px, 1.65fr)'),
    'drop row desktop grid should keep component/chance/quantity geometry while widening modifiers'
  );
  assert.equal(
    dropTableBlock.includes('88px'),
    false,
    'drop row desktop grid should not reserve a row actions column'
  );
  assert.ok(
    dropTableBlock.includes('width: 100%;') && dropTableBlock.includes('max-width: 100%;'),
    'drop table should fill the drop rules card without exceeding it'
  );
  assert.ok(
    dropTableHeadBlock.includes('padding: 0;'),
    'drop rules header row should clear generic table-head padding so columns align with value rows'
  );
  assert.ok(
    dropRowBlock.includes('grid-template-columns: var(--fab-manager-task-drop-grid);'),
    'drop rows should use the shared single-line editor grid'
  );
  assert.ok(
    dropRowBlock.includes('gap: 0;') && dropRowBlock.includes('max-width: 100%;'),
    'drop rows should use separators instead of gap-driven overflow'
  );
  assert.ok(
    firstDropRowBlock.includes('border-top: 0;'),
    'first drop row should not double the header bottom border'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-gathering-task-drop-row {\n  min-height: 72px;'),
    'drop rows should be tall enough for two visible modifier chip lines'
  );
  assert.ok(
    dropCellBlock.includes('padding: var(--fab-space-1) var(--fab-space-2);') &&
      dropCellBlock.includes('box-sizing: border-box;'),
    'drop cells should keep padding inside full-width rows'
  );
  assert.ok(
    dropCellSeparatorBlock.includes('border-left: 1px solid var(--fab-border);'),
    'drop cells should use vertical separators'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-gathering-task-drop-row.is-drop-active'),
    'drop rows should expose a full-row active drop target state'
  );
  assert.ok(
    selectedDropRowBlock.includes('background: var(--fab-success-soft);') &&
      selectedDropRowBlock.includes('var(--fab-accent)'),
    'selected drop rows should use the component-browser success/accent family'
  );
  assert.ok(
    selectedDropRowBlock.includes('inset 0 1px 0 var(--fab-border-strong)') &&
      selectedDropRowBlock.includes('inset 0 -1px 0 var(--fab-border-strong)'),
    'selected drop row outline should avoid a right edge next to the card border'
  );
  assert.equal(
    selectedDropRowBlock.includes('inset 0 0 0 1px'),
    false,
    'selected drop row should not draw a full inset border against the card edge'
  );
  assert.equal(
    selectedDropRowBlock.includes('var(--fab-info'),
    false,
    'selected drop rows should not use the info family'
  );
  assert.equal(
    selectedDropRowBlock.includes('var(--fab-warning'),
    false,
    'selected drop rows should not use the warning family'
  );
  assert.ok(
    dropComponentButtonBlock.includes('grid-template-columns: 42px minmax(0, 1fr);') &&
      dropComponentButtonBlock.includes('min-height: 40px;'),
    'drop component cells should keep compact thumbnail/name geometry'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-drop-empty-component {\n  min-height: 52px;\n  padding: var(--fab-space-chip) var(--fab-space-2);\n  border: 1px dashed var(--fab-border-strong);'
    ),
    'empty component placeholders should show the full drop-zone boundary'
  );
  assert.ok(
    dropEmptyComponentIconBlock.includes('border: 0;'),
    'empty component placeholders should avoid a nested icon-only dashed border'
  );
  assert.ok(
    dropComponentCopyBlock.includes('align-content: center;'),
    'drop component text should be vertically centered after description removal'
  );
  assert.ok(
    dropComponentNameBlock.includes('display: -webkit-box;') &&
      dropComponentNameBlock.includes('-webkit-line-clamp: 2;') &&
      dropComponentNameBlock.includes('white-space: normal;'),
    'drop component names should wrap to two lines instead of relying on descriptions'
  );
  assert.ok(
    dropRateBlock.includes('display: block;'),
    'drop chance cell should expose one wrapped value'
  );
  assert.ok(
    dropRateValueBlock.includes('grid-template-columns: 52px minmax(0, 1fr);') &&
      dropRateValueBlock.includes('gap: var(--fab-space-1);'),
    'drop chance value should keep the row editable percent close to a wider slider'
  );
  assert.ok(
    dropRatePercentBlock.includes('position: relative;') &&
      dropRatePercentBlock.includes('display: block;'),
    'drop chance percent should overlay the suffix without taking slider width'
  );
  assert.ok(
    css.includes('--fab-drop-rate-none: #E26F6B;'),
    'drop chance slider should define a distinct exact-zero colour token'
  );
  assert.ok(
    dropRatePercentInputBlock.includes('height: 28px;') &&
      dropRatePercentInputBlock.includes('box-sizing: border-box;') &&
      dropRatePercentInputBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropRatePercentInputBlock.includes('text-align: center;'),
    'drop chance row percent should keep its existing compact centered editable numeric field'
  );
  assert.ok(
    dropRatePercentInputOverrideBlock.includes('min-height: 28px;') &&
      dropRatePercentInputOverrideBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropRatePercentInputOverrideBlock.includes('box-shadow: none;'),
    'drop chance row percent should override generic gathering task input chrome without affecting other fields'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-drop-rate-percent > span[aria-hidden="true"] {\n  position: absolute;\n  right: 6px;'
    ) && css.includes('pointer-events: none;'),
    'drop chance row percent suffix should keep its existing placement'
  );
  assert.ok(
    dropRateControlBlock.includes('--fab-drop-rate-value: 1%;') &&
      dropRateControlBlock.includes('--fab-drop-rate-color: var(--fab-drop-rate-very-rare);'),
    'drop chance slider should expose value and tier colour variables'
  );
  assert.ok(
    dropRateTrackBlock.includes('left: var(--fab-chance-slider-thumb-radius);') &&
      dropRateTrackBlock.includes('right: var(--fab-chance-slider-thumb-radius);') &&
      dropRateTrackBlock.includes('background: var(--fab-overlay-dark-18);') &&
      dropRateTrackBlock.includes('overflow: hidden;'),
    'shared chance sliders should inset the clipped track to the thumb centers without endpoint tails'
  );
  assert.ok(
    dropRateFillBlock.includes('width: var(--fab-drop-rate-value);') &&
      dropRateFillBlock.includes('background: var(--fab-drop-rate-color);'),
    'Gathering chance sliders should retain their active-width rarity-derived fill'
  );
  assert.ok(
    continuousGradientFillBlock.includes('width: 100%;') &&
      continuousGradientFillBlock.includes('background: var(--fab-chance-slider-track-gradient);'),
    'configured chance sliders should paint their semantic gradient across the complete inset track'
  );
  assert.ok(
    dropRateRangeBlock.includes('appearance: none;') &&
      dropRateRangeBlock.includes('-webkit-appearance: none;') &&
      dropRateRangeBlock.includes('padding: 0;') &&
      dropRateRangeBlock.includes('background: transparent;') &&
      dropRateRangeBlock.includes('box-shadow: none;'),
    'drop chance range should clear native and Foundry host slider rendering'
  );
  assert.ok(
    dropRateRangeBlock.includes('accent-color: var(--fab-drop-rate-color);'),
    'drop chance native range should inherit the current tier colour'
  );
  assert.ok(
    dropRateWebkitTrackBlock.includes('border: 0;') &&
      dropRateWebkitTrackBlock.includes('background: transparent;'),
    'the WebKit native track should stay invisible behind the inset shared rail'
  );
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-drop-rate-control input[type="range"]::-moz-range-track'
    ).includes('border: 0;'),
    'the Firefox native track should stay invisible behind the inset shared rail'
  );
  assert.ok(
    dropRateMozProgressBlock.includes('background: transparent;'),
    'the Firefox native progress segment should not create endpoint tails over the shared fill'
  );
  assert.ok(
    dropRateWebkitThumbBlock.includes('background: var(--fab-drop-rate-color);') &&
      dropRateMozThumbBlock.includes('background: var(--fab-drop-rate-color);'),
    'drop chance range thumbs should retain current-tier colour'
  );
  assert.ok(
    toolBreakageChanceCardBlock.includes('display: grid;') &&
      toolBreakageChanceCardBlock.includes('padding: var(--fab-space-3);') &&
      toolBreakageChanceCardBlock.includes('border: 1px solid var(--fab-border);'),
    'tool breakage chance should present the shared slider in a full-width configuration card'
  );
  assert.ok(
    toolBreakageChanceSliderBlock.includes('grid-template-columns: 72px minmax(0, 1fr);') &&
      toolBreakageChanceSliderBlock.includes('gap: var(--fab-space-3);'),
    'tool breakage chance should give its synchronized number field and slider comfortable space'
  );
  assert.ok(
    toolBreakageChanceControlBlock.includes('min-width: 0;'),
    'tool breakage chance should reuse the common slider rail without overflow'
  );
  assert.ok(
    guaranteedDropRateControlBlock.includes('var(--fab-drop-rate-guaranteed)') &&
      commonDropRateControlBlock.includes('var(--fab-drop-rate-common)') &&
      uncommonDropRateControlBlock.includes('var(--fab-drop-rate-uncommon)') &&
      rareDropRateControlBlock.includes('var(--fab-drop-rate-rare)') &&
      veryRareDropRateControlBlock.includes('var(--fab-drop-rate-very-rare)') &&
      legendaryDropRateControlBlock.includes('var(--fab-drop-rate-legendary)') &&
      noneDropRateControlBlock.includes('var(--fab-drop-rate-none)'),
    'drop chance control classes should map the selected rarity palette to the current value'
  );
  assert.ok(
    dropQuantityCellBlock.includes('display: flex;') &&
      dropQuantityCellBlock.includes('justify-content: center;') &&
      dropQuantityCellBlock.includes('padding: var(--fab-space-chip);'),
    'quantity cells should spend less horizontal space while centering the input'
  );
  assert.ok(
    dropQuantityInputBlock.includes('max-width: 44px;') &&
      dropQuantityInputBlock.includes('box-sizing: border-box;') &&
      dropQuantityInputBlock.includes('text-align: center;') &&
      dropQuantityInputBlock.includes('font-variant-numeric: tabular-nums;'),
    'quantity should remain a compact numeric text input sized for three digits'
  );
  assert.ok(
    dropQuantityInputOverrideBlock.includes('min-height: 28px;') &&
      dropQuantityInputOverrideBlock.includes('padding: var(--fab-space-1);'),
    'quantity should override generic gathering input padding without widening the column'
  );
  assert.ok(
    dropModifierListBlock.includes('flex-wrap: wrap;') &&
      dropModifierListBlock.includes('align-content: flex-start;'),
    'drop modifiers should wrap into a top-aligned chip group'
  );
  assert.ok(
    dropModifierListBlock.includes('max-height: 58px;') &&
      dropModifierListBlock.includes('overflow-y: auto;'),
    'drop modifiers should scroll after the two-line chip budget'
  );
  assert.ok(
    dropModifierPillBlock.includes('background: var(--fab-overlay-light-06);'),
    'drop modifier pills should use restrained neutral chip backgrounds'
  );
  assert.ok(
    positiveDropModifierPillBlock.includes('color: var(--fab-text);') &&
      negativeDropModifierPillBlock.includes('color: var(--fab-text);'),
    'drop modifier chips should avoid saturated text across the whole pill'
  );
  assert.ok(
    dropModifierOverflowBlock.includes('text-overflow: ellipsis;') &&
      dropModifierOverflowBlock.includes('white-space: nowrap;'),
    'the modifier overflow hint should stay a single clipped table label'
  );
  assert.ok(
    dropEditorInputBlock.includes(':not([type="range"])'),
    'selected drop inspector generic input chrome should not override row-style range sliders'
  );
  assert.ok(
    dropEditorInputBlock.includes('height: 28px;') &&
      dropEditorInputBlock.includes('min-height: 28px;') &&
      dropEditorInputBlock.includes('padding: var(--fab-space-2xs) var(--fab-space-2);'),
    'selected drop inspector generic inputs and selects should use compact 28px right-sidebar geometry'
  );
  assert.ok(
    dropEditorValuesBlock.includes('grid-template-columns: minmax(0, 1fr) 72px;') &&
      dropEditorValuesBlock.includes('align-items: end;'),
    'selected drop inspector should place chance and count in a compact two-column grid'
  );
  assert.ok(
    dropEditorRateValueBlock.includes('grid-template-columns: 64px minmax(0, 1fr);'),
    'selected drop inspector chance should widen only the right-menu percent column'
  );
  assert.ok(
    dropEditorRatePercentBlock.includes('height: 28px;') &&
      dropEditorRatePercentBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropEditorRatePercentBlock.includes('background: var(--fab-overlay-dark-18);'),
    'selected drop inspector broad chance input rule should not carry the right-menu suffix padding'
  );
  assert.ok(
    dropEditorRateInputBlock.includes('height: 28px;') &&
      dropEditorRateInputBlock.includes('min-height: 28px;') &&
      dropEditorRateInputBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-chip);'
      ) &&
      dropEditorRateInputBlock.includes('box-shadow: none;'),
    'selected drop inspector chance input should keep compact row-style geometry without extra suffix padding'
  );
  assert.ok(
    dropEditorRateSuffixBlock.includes('right: 8px;'),
    'selected drop inspector percent suffix should sit away from three-digit values'
  );
  assert.ok(
    dropEditorRateControlBlock.includes('height: 28px;') &&
      dropEditorRateControlBlock.includes('padding: 0 var(--fab-space-2);') &&
      dropEditorRateControlBlock.includes('background: var(--fab-overlay-dark-18);') &&
      dropEditorRateControlBlock.includes('overflow: hidden;'),
    'selected drop inspector slider should own the dark backing box instead of relying on native range chrome'
  );
  assert.ok(
    dropEditorRateTrackBlock.includes('left: 7px;') &&
      dropEditorRateTrackBlock.includes('right: 7px;') &&
      dropEditorRateTrackBlock.includes('border: 0;') &&
      dropEditorRateTrackBlock.includes('background: var(--fab-overlay-dark-18);'),
    'selected drop inspector custom track should be inset to the thumb radius to avoid endpoint tails'
  );
  assert.ok(
    dropEditorRateFillBlock.includes('border-radius: 999px;'),
    'selected drop inspector fill should be rounded without relying on a wider track border'
  );
  assert.equal(
    dropRateTrackBlock.includes('linear-gradient'),
    false,
    'drop chance slider styling should keep the flat-ui no-gradient contract'
  );
  assert.equal(
    dropEditorRateTrackBlock.includes('linear-gradient'),
    false,
    'selected drop inspector slider styling should keep the flat-ui no-gradient contract'
  );
  assert.ok(
    dropEditorRateRangeBlock.includes('height: 26px;') &&
      dropEditorRateRangeBlock.includes('padding: 0;') &&
      dropEditorRateRangeBlock.includes('background: transparent;') &&
      dropEditorRateRangeBlock.includes('box-shadow: none;'),
    'selected drop inspector native range should remain a transparent thumb hit target over the custom track'
  );
  assert.ok(
    dropEditorRateWebkitTrackBlock.includes('border: 0;') &&
      dropEditorRateWebkitTrackBlock.includes('background: transparent;'),
    'selected drop inspector WebKit native range track should not draw over the custom track'
  );
  assert.ok(
    dropEditorRateMozTrackBlock.includes('border: 0;') &&
      dropEditorRateMozTrackBlock.includes('background: transparent;'),
    'selected drop inspector Firefox native range track should not draw over the custom track'
  );
  assert.ok(
    dropEditorCountBlock.includes('display: grid;') &&
      dropEditorCountBlock.includes('gap: var(--fab-space-chip);'),
    'selected drop inspector count editor should use a compact labeled field'
  );
  assert.ok(
    dropEditorCountInputBlock.includes('min-height: 28px;') &&
      dropEditorCountInputBlock.includes('text-align: center;'),
    'selected drop inspector count input should match row count input geometry'
  );
  assert.ok(
    dropEditorInspectorCountInputBlock.includes('height: 28px;') &&
      dropEditorInspectorCountInputBlock.includes('min-height: 28px;') &&
      dropEditorInspectorCountInputBlock.includes('padding: var(--fab-space-1);') &&
      dropEditorInspectorCountInputBlock.includes('box-shadow: none;'),
    'selected drop inspector count input should override generic inspector input chrome with chance-field geometry'
  );
  assert.ok(
    dropInspectorButtonBlock.includes('min-height: 28px;') &&
      dropInspectorButtonBlock.includes('padding: 0 var(--fab-space-2);'),
    'selected drop inspector text buttons should match the compact 28px sidebar rhythm'
  );
  assert.ok(
    dropInspectorIconButtonBlock.includes('width: 28px;') &&
      dropInspectorIconButtonBlock.includes('height: 28px;') &&
      dropInspectorIconButtonBlock.includes('flex: 0 0 28px;'),
    'selected drop inspector icon buttons should match the compact 28px sidebar rhythm'
  );
  assert.ok(
    dropInspectorSearchInputBlock.includes('height: 28px;') &&
      dropInspectorSearchInputBlock.includes('min-height: 28px;') &&
      dropInspectorSearchInputBlock.includes('padding-block: 0;'),
    'selected drop inspector search input should keep icon padding while using 28px height'
  );
  assert.ok(
    dropInspectorCharacterFieldBlock.includes('height: 28px;') &&
      dropInspectorCharacterFieldBlock.includes('min-height: 28px;') &&
      dropInspectorCharacterFieldBlock.includes(
        'padding: var(--fab-space-2xs) var(--fab-space-2);'
      ),
    'selected drop inspector character modifier fields should override shared 36px field height'
  );
  assert.ok(
    dropInspectorCharacterOperatorBlock.includes('height: 28px;') &&
      dropInspectorCharacterOperatorBlock.includes('min-height: 28px;') &&
      dropInspectorCharacterOperatorBlock.includes('padding: 0 var(--fab-space-chip);'),
    'selected drop inspector character modifier operator select should keep compact 28px height'
  );
  assert.ok(
    dropEditorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));') &&
      dropEditorActionsBlock.includes('margin-top: 0;'),
    'selected drop rule actions should sit beneath the inspector title row'
  );
  assert.ok(
    dropInspectorStackBlock.includes('grid-template-rows: auto auto minmax(0, 1fr);'),
    'selected drop inspector should reserve fixed header, divider, and lower scroll rows'
  );
  assert.ok(
    dropInspectorStackBlock.includes('height: 100%;') &&
      dropInspectorStackBlock.includes('overflow: visible;'),
    'selected drop inspector stack should allow the divider to span the full right inspector width'
  );
  assert.ok(
    dropInspectorRouteBlock.includes('overflow: hidden;'),
    'gathering task edit inspector should delegate selected-drop scrolling to the lower viewport'
  );
  assert.ok(
    dropInspectorDividerBlock.includes('width: calc(100% + 24px);') &&
      dropInspectorDividerBlock.includes(
        'margin: var(--fab-space-3) calc(-1 * var(--fab-space-3)) 0;'
      ),
    'selected drop inspector divider should bleed through the right inspector padding'
  );
  assert.ok(
    dropInspectorDividerBlock.includes('height: 1px;') &&
      dropInspectorDividerBlock.includes('background: var(--fab-border);'),
    'selected drop inspector should render a visible divider below the header'
  );
  assert.ok(
    dropInspectorScrollBlock.includes('overflow: hidden auto;'),
    'selected drop lower editor content should own vertical scrolling without horizontal overflow'
  );
  assert.ok(
    dropInspectorScrollBlock.includes('padding-top: var(--fab-space-3);') &&
      dropInspectorScrollBlock.includes('gap: var(--fab-space-3);'),
    'selected drop scroll viewport should visually separate lower cards from the divider'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-drop-actions'),
    false,
    'drop row actions should not reserve row layout or styling'
  );
  assert.equal(
    taskEditorIntermediateQuery.includes(
      '.manager-gathering-task-drop-row {\n    grid-template-columns: minmax(0, 1fr);'
    ),
    false,
    'task editor should not stack drop rows at the intermediate desktop width'
  );
  assert.ok(
    taskEditorIntermediateQuery.includes('minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr)'),
    'intermediate task editor drop grid should preserve drop chance width while widening modifiers'
  );
  assert.ok(
    dropTableRankedBlock.includes(
      '--fab-manager-task-drop-grid: 44px minmax(0, 0.92fr) minmax(220px, 1.35fr) 56px minmax(180px, 1.65fr);'
    ),
    'ranked-mode drop grid should prepend a narrow 44px rank column and take width from the component column while preserving drop chance and quantity widths'
  );
  assert.ok(
    taskEditorIntermediateQuery.includes(
      '--fab-manager-task-drop-grid: 44px minmax(0, 0.96fr) minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr);'
    ),
    'intermediate ranked-mode drop grid should keep drop chance and quantity widths while reducing the component column'
  );
  assert.ok(
    dropRankCellBlock.includes('display: flex;') &&
      dropRankCellBlock.includes('flex-direction: column;'),
    'rank cell should stack the up button, label, and down button vertically'
  );
  assert.ok(
    dropRankValueBlock.includes('text-align: center;') &&
      dropRankValueBlock.includes('line-height: 1;'),
    'rank value should sit centered between the buttons with a tight line height'
  );
  assert.ok(
    dropRankButtonBlock.includes('width: 18px;') && dropRankButtonBlock.includes('height: 18px;'),
    'rank reorder buttons should be small enough to stack inside the row'
  );
  assert.ok(
    mediumQuery.includes(
      '.fabricate-manager .manager-gathering-task-drop-table-head,\n  .fabricate-manager .manager-gathering-task-drop-row'
    ) && mediumQuery.includes('grid-template-columns: var(--fab-manager-task-drop-grid);'),
    'medium manager layout should preserve the drop row grid and headers instead of duplicate row labels'
  );
  assert.equal(
    css.includes(
      '.fabricate-manager .manager-gathering-task-row .manager-environment-reorder-stack'
    ),
    false,
    'task rows should not render environment reorder controls'
  );
});

test('chance slider rails clip continuous Tool gradients at thumb-centre endpoints without changing Gathering fill', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 240 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <style>${css}</style><style>${partiesTabScoped.css}</style>
      <main class="fabricate-manager" style="padding: 24px;">
        <span
          class="manager-drop-rate-control has-continuous-gradient"
          data-slider="tool"
          style="width: 240px; --fab-drop-rate-value: 62%; --fab-drop-rate-color: var(--fab-badge-gold); --fab-chance-slider-track-gradient: linear-gradient(90deg, var(--fab-success) 0%, var(--fab-warning) 33%, var(--fab-badge-gold) 66%, var(--fab-danger) 100%);"
        >
          <span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>
          <input type="range" min="0" max="100" value="62">
        </span>
        <span
          class="manager-drop-rate-control is-uncommon"
          data-slider="gathering"
          style="width: 240px; --fab-drop-rate-value: 40%; --fab-drop-rate-color: var(--fab-drop-rate-uncommon);"
        >
          <span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>
          <input type="range" min="0" max="100" value="40">
        </span>
      </main>
    `);

    const report = await page.evaluate(() => {
      const inspect = (kind) => {
        const control = document.querySelector(`[data-slider="${kind}"]`);
        const track = control.querySelector('.manager-drop-rate-track');
        const fill = control.querySelector('.manager-drop-rate-fill');
        const controlRect = control.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        const fillRect = fill.getBoundingClientRect();
        const fillStyle = getComputedStyle(fill);
        return {
          leftInset: trackRect.left - controlRect.left,
          rightInset: controlRect.right - trackRect.right,
          trackWidth: trackRect.width,
          fillWidth: fillRect.width,
          fillOffset: fillRect.left - trackRect.left,
          backgroundImage: fillStyle.backgroundImage,
          backgroundColor: fillStyle.backgroundColor,
        };
      };
      return {
        tool: inspect('tool'),
        gathering: inspect('gathering'),
      };
    });

    assert.equal(report.tool.leftInset, 7);
    assert.equal(report.tool.rightInset, 7);
    assert.equal(report.gathering.leftInset, 7);
    assert.equal(report.gathering.rightInset, 7);
    assert.ok(
      Math.abs(report.tool.fillWidth - (report.tool.trackWidth - 2)) <= 0.1,
      'Tool gradient should occupy the full clipped track inside its border'
    );
    assert.equal(report.tool.fillOffset, 1);
    assert.match(report.tool.backgroundImage, /^linear-gradient\(/);
    assert.ok(
      Math.abs(report.gathering.fillWidth / (report.gathering.trackWidth - 2) - 0.4) <= 0.01,
      'Gathering should retain a percentage-width fill'
    );
    assert.equal(report.gathering.backgroundImage, 'none');
    assert.notEqual(report.gathering.backgroundColor, 'rgba(0, 0, 0, 0)');
  } finally {
    await context.close();
  }
});

test('manager components browser defines drop target and compact responsive list geometry', () => {
  // Issue 676: the component library is a LIST, not a column grid. The
  // `.manager-components-table` block and its six component-grid column-template
  // permutations are gone with the table scaffolding, and rows flex + wrap instead —
  // which is what makes the narrow (stacked) surface the smoke harness photographs
  // reflow rather than crush fixed tracks.
  const listBlock = blockFor('.fabricate-manager .manager-components-list');
  const rowBlock = blockFor('.fabricate-manager .manager-component-row');
  const rowMetaBlock = blockFor('.fabricate-manager .manager-component-row-meta');
  const toolbarBlock = Array.from(
    css.matchAll(/\.fabricate-manager \.manager-toolbar\s*\{[\s\S]*?\}/g)
  )
    .map((match) => match[0])
    .join('\n');
  const dropBlock = blockFor('.fabricate-manager .manager-component-drop-zone');
  const identityBlock = blockFor('.fabricate-manager .manager-component-identity');
  const componentCopyBlock = blockFor(
    '.fabricate-manager .manager-component-identity .manager-system-copy'
  );

  // Drop target, toolbar, LIST (it takes the slack), pager. The view's own duplicate page
  // header is gone (issue 676 — the shell already renders one), so the growing track must
  // be the list; leaving the old four-`auto`-then-`1fr` template handed it to the PAGER.
  assert.ok(
    blockFor('.fabricate-manager[data-manager-view="components"] .manager-main').includes(
      'grid-template-rows: auto auto minmax(0, 1fr) auto;'
    ),
    'components route should give the growing row to the list, not the pager'
  );
  // The absence assertion on that dropped column template is GONE (issue 1399): its
  // needle named a legacy generation the sheet no longer declares, so it could only ever
  // pass. `tests/token-generation-gate.test.js` bans the shape from a live population.
  assert.ok(listBlock.includes('display: flex;'), 'the component list stacks its rows');
  assert.ok(
    rowBlock.includes('display: flex;'),
    'a component row is a flex row, not a column grid'
  );
  assert.ok(rowBlock.includes('flex-wrap: wrap;'), 'a component row wraps rather than compressing');
  assert.ok(rowMetaBlock.includes('flex-wrap: wrap;'), 'the badge run wraps inside the row');
  // The row's identity tile is the shared `Medallion` component (issue 676, ruling 1 —
  // the recipe row already leads with it), which is flat-by-contract in its own scoped
  // style and carries a real glyph fallback. The hand-rolled `.manager-component-chip` /
  // `.manager-component-thumb` pair it replaced must not linger as dead CSS.
  for (const dead of [
    'manager-component-chip',
    'manager-component-thumb',
    'manager-component-preview',
  ]) {
    assert.equal(
      new RegExp(`\\.${dead}[\\s,{:]`).test(css),
      false,
      `${dead} was replaced by the shared Medallion and must not survive as dead CSS`
    );
  }
  // The row geometry matches the recipe row, not the 76px group it left.
  assert.ok(rowBlock.includes('min-height: 62px;'), 'the component row is the denser ~62px card');
  // As for the recipe row: issue 883 retired the per-surface 9px corner in favour of the
  // one shared browser-row treatment, so the row block declares size and nothing else.
  assert.equal(
    /border-radius:|border: 1px|background:/.test(rowBlock),
    false,
    'the component row must not restate the shared browser-row edge, corner or fill'
  );
  assert.ok(
    dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'),
    'component drop zone should reserve icon and copy space'
  );
  assert.ok(
    dropBlock.includes('margin: var(--fab-space-3);'),
    'component drop zone should keep balanced vertical spacing around the toolbar'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-component-drop-zone.is-drop-active'),
    'component drop zone should expose an active drag state'
  );
  assert.ok(
    toolbarBlock.includes('display: grid;'),
    'manager toolbar should own a grid layout for primary controls and auxiliary rows'
  );
  assert.ok(
    toolbarBlock.includes('grid-template-columns: minmax(0, 1fr);'),
    'manager toolbar grid should keep rows bounded to the main content width'
  );
  // The component toolbar adopted the recipe bar's three-row shape (issue 676, ruling 1),
  // so it JOINS those rules rather than re-deriving a second, drifting filter bar. Its
  // own selects carried no font-size at all and were rendering at Foundry's 14px app base.
  // The essence library joined both lists for issue 1036 — see the selection-row assertion
  // above for why its scoped copy of them was not equivalent.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-filter-row,\n.fabricate-manager .manager-component-filter-row,\n.fabricate-manager .manager-essence-filter-row'
    ).includes('flex-wrap: wrap;'),
    'the component and essence filter rows share the recipe filter row rule'
  );
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-toolbar .manager-search input,\n.fabricate-manager .manager-recipe-toolbar select,\n.fabricate-manager .manager-component-toolbar .manager-search input,\n.fabricate-manager .manager-component-toolbar select,\n.fabricate-manager .manager-essence-toolbar .manager-search input,\n.fabricate-manager .manager-essence-toolbar select'
    ).includes('font-size: var(--fab-recipe-control-font);'),
    'the component and essence toolbar controls are typed by the shared control font, not the Foundry bleed'
  );
  // The essence toolbar's selects also take the Fabricate select TREATMENT. Without it they
  // rendered with Foundry core's own chrome — full-width, taller than the segmented controls
  // beside them, and wrapping one filter row into three.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-toolbar select,\n.fabricate-manager .manager-component-toolbar select,\n.fabricate-manager .manager-essence-toolbar select'
    ).includes('height: 34px;'),
    'every studio filter bar dresses its own selects rather than inheriting Foundry core chrome'
  );
  // The ESSENCE browser's toggle is the third selector in that group (issue 1118). It is
  // addressed by its `data-*` hook because the class it used to carry styled nothing at all —
  // the sheet declared `.manager-essence-sort-direction` NOWHERE — so the third instance of
  // this control rendered at the base 6px/700 scale beside two siblings at 9px/600. Naming all
  // three here is what makes `blockFor` read the whole group: it anchors on `{`, so a selector
  // appended to the list leaves a two-selector lookup matching nothing and failing silently.
  const sortDirectionBlock = blockFor(
    '.fabricate-manager .manager-button.manager-recipe-sort-direction,\n.fabricate-manager .manager-button.manager-component-sort-direction,\n.fabricate-manager .manager-button.fab-manager-button[data-essence-sort-direction]'
  );
  assert.ok(
    sortDirectionBlock.includes('border-radius: 9px;'),
    'the component sort-direction button escapes the boxy base .manager-button scale'
  );
  assert.ok(
    sortDirectionBlock.includes('font-weight: 600;'),
    'and all three sort-direction toggles are typed by one rule rather than three scales'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);') ||
      css.includes(
        '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity'
      ),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    componentCopyBlock.includes('max-height: 52px;') &&
      componentCopyBlock.includes('overflow: hidden;'),
    'component identity copy should clamp inside the row instead of overflowing below the thumbnail'
  );
  // No medium-query stacking rule is needed any more: the row wraps natively, so the
  // narrow surface reflows without a breakpoint re-templating its columns.
});

// Issue 1036. The essence-grid column template, its `.has-no-source` variant,
// the `.manager-essence-source-cell-image` block and the narrow-container `grid-template-
// columns` stacking rule are all RETIRED here, and that is a deliberate edit rather than
// incidental churn: the essence row is a FLEX card that wraps, so a column template on it
// would place nothing, and the narrow join's `align-items: stretch` is a live flex property
// that would stretch the medallion and the whole control cluster to full card height. The
// replacement narrow behaviour is authored in `EssenceRow.svelte`'s own scoped block.
//
// What stays global is what a scoped child block cannot reach: the route-level `.manager-
// main` row template, and the identity button's reset — which must beat Foundry's host
// button geometry — joined to the three siblings that already carry it.
test('manager essence browser defines a wrapping card row rather than a column template', () => {
  const identityResetBlock = blockFor(
    '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity,\n.fabricate-manager .manager-gathering-task-identity,\n.fabricate-manager .manager-essence-identity'
  );

  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="essences"] .manager-main'),
    'essences route should define route-specific rows'
  );
  assert.ok(
    blockFor('.fabricate-manager[data-manager-view="essences"] .manager-main').includes(
      'grid-template-rows: auto minmax(0, 1fr) auto;'
    ),
    'essences route should put the slack on the LIST, between the toolbar and the pager'
  );

  // The retirements, asserted as absences so a re-introduction is caught rather than
  // silently coexisting with the flex row. Each needle carries the punctuation that only a
  // DECLARATION or a RULE OPENER has — a bare class-name match would be satisfied by the
  // retirement comments themselves, which name what they retired.
  // The essence column template's own absence assertion is GONE (issue 1399): its needle
  // was a legacy generation name the sheet no longer declares, so it could only ever pass.
  // `tests/token-generation-gate.test.js` bans the shape from a population that is not
  // empty. The three needles below name live selectors and stay.
  assert.equal(
    css.includes('.manager-essences-table.has-no-source {'),
    false,
    'and so is its no-source variant'
  );
  assert.equal(
    css.includes('.manager-essence-source-cell-image {'),
    false,
    'and the source column cell, which reported one bit in a column of its own'
  );
  assert.equal(
    css.includes('.manager-essence-table-head,') || css.includes('.manager-essence-table-head {'),
    false,
    'and the table head itself'
  );

  // The identity button JOINS the shared reset, so a `<button>` used as a row identity is
  // not cropped by Foundry's fixed button height — a defect no mounted test can see.
  assert.ok(
    identityResetBlock.includes('appearance: none;'),
    'the essence identity button joins the shared manager button reset'
  );
  assert.ok(
    identityResetBlock.includes('min-height: 46px;'),
    'including the min-height that stops Foundry cropping it'
  );
  // `min-height` ALONE does not stop the crop. Foundry pins a fixed `height` on every
  // `button`, so used height is `max(height, min-height)` and a grow-tall variant still
  // resolves to 46px — which is what the essence grid CARD is: the same button laid out as
  // a ~150px stack. The four row-shaped siblings escape it only because their content never
  // exceeds 46px, so the property was missing without being visible. CONTRIBUTING.md's
  // "Instance 1 — button layout" states the pair; happy-dom computes no cascade, so this
  // source assertion and the rendered `manager-essences-grid` frame are the only proofs.
  assert.ok(
    identityResetBlock.includes('height: auto;'),
    'and the height:auto that lets the grid card grow past it'
  );

  // The row still joins the four shared lists, so the one-consistent-selected-row-signal
  // rule holds by construction rather than by convention.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-environment-row,\n.fabricate-manager .manager-gathering-task-row,\n.fabricate-manager .manager-essence-row'
    ).includes('min-height: 76px;'),
    'the essence row keeps the shared 76px row height'
  );
});

test('manager essence edit route defines a tabbed two-row shell', () => {
  const mainBlock = blockFor('.fabricate-manager[data-manager-view="essence-edit"] .manager-main');
  const editGridBlock = blockFor('.fabricate-manager .manager-essence-edit-grid');
  const sourceSummaryBlock = blockFor('.fabricate-manager .manager-essence-source-summary');
  const inspectorSourceActionsBlock = blockFor(
    '.fabricate-manager .manager-essence-inspector-source-actions'
  );
  // Issue 1315 retired the `.manager-icon-button` half of this pair with the manual-mode icon
  // Force add that was its only consumer, so the rule is now the labelled button alone.
  const warningActionBlock = blockFor('.fabricate-manager .manager-button.is-warning-action');
  const sourceDropBlock = blockFor(
    '.fabricate-manager .manager-essence-source-drop-zone .essence-source-trigger'
  );
  const usageGridBlock = blockFor('.fabricate-manager .manager-essence-usage-grid');
  const usageItemBlock = blockFor('.fabricate-manager .manager-essence-usage-item');
  // Both blocks moved off `.fabricate-manager` onto the pickers' own namespace roots (issue
  // 1470): `IconPicker` and `EssenceSourceSelector` are shared components, and a rule rooted at
  // one application cannot paint them anywhere else.
  const iconTriggerBlock = blockFor('.fabricate-icon-picker .essence-icon-picker-trigger');
  const sourceTriggerBlock = blockFor('.fabricate-source-picker .essence-source-trigger');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  // TWO tracks now, not one: the tab strip and the scrolling tab body. A single `1fr`
  // would stretch the strip, which is what the shipped single-card editor did not have.
  assert.ok(
    mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'),
    'essence edit route reserves a row for the tab strip and gives the body the slack'
  );
  assert.ok(
    editGridBlock.includes(
      'grid-template-columns: 124px minmax(0, 1fr);'
    ),
    'essence edit identity fields should reserve stable square-icon picker space'
  );
  // TWO tracks. The third reserved an inline clear button that no surface renders any more
  // (issue 1036, maintainer round 2): the editor's linked source is the shared `ItemDropZone`
  // card, whose actions are the primitive's own, and the browser inspector always overrode
  // the third track away. The per-inspector override is retired with it, so this asserts the
  // ONE geometry rather than a base and the rule that cancelled it.
  assert.ok(
    sourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr);'),
    'essence source summary should be the linked item evidence card, image beside evidence'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-essence-inspector-source-summary {'),
    false,
    'and no per-inspector override survives to re-declare it'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('margin-top: var(--fab-space-3);'),
    'inspector source action row should sit below the linked item card'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('display: grid;'),
    'inspector source actions should use stable row geometry'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'inspector source actions should keep copy and unlink on the same row'
  );
  assert.ok(
    !mediumQuery.includes(
      '.fabricate-manager .manager-essence-inspector-source-actions .manager-button'
    ),
    'narrow manager layout should not stack the selected essence source actions'
  );
  assert.ok(
    warningActionBlock.includes('var(--fab-warning'),
    'unlink source should have an amber warning-action button style'
  );
  assert.ok(
    sourceDropBlock.includes('width: 100%;'),
    'essence source drop target should use the full source panel width'
  );
  assert.ok(
    sourceDropBlock.includes('height: 84px;'),
    'essence source drop target should have a stable wide drop-zone height'
  );
  assert.ok(
    iconTriggerBlock.includes(
      'grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr) 16px;'
    ),
    'icon picker trigger should be a real picker control, not a raw text field'
  );
  assert.ok(
    sourceTriggerBlock.includes('aspect-ratio: 1 / 1;'),
    'source picker should keep a stable drop target'
  );
  assert.ok(
    usageGridBlock.includes('max-height: 132px;'),
    'essence usage thumbnails should stay scroll-contained in the inspector'
  );
  assert.ok(
    usageItemBlock.includes('aspect-ratio: 1 / 1;'),
    'essence usage thumbnails should be square image-only controls'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-essence-edit-grid') &&
      mediumQuery.includes('.fabricate-manager .manager-essence-source-summary'),
    'narrow manager layout should stack essence edit controls'
  );
});

test('manager environments browser and edit route define compact responsive geometry', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-environments-toolbar');
  const gatheringPanelBlock = blockFor('.fabricate-manager .manager-gathering-panel');
  const gatheringEnvironmentsPanelBlock = blockFor(
    '.fabricate-manager .manager-gathering-panel-environments'
  );
  const tableScrollBlock = blockFor('.fabricate-manager .manager-table-scroll');
  const tableBlock = blockFor('.fabricate-manager .manager-environments-table');
  const taskCountBlock = blockFor('.fabricate-manager .manager-environment-task-count');
  const actionsBlock = blockFor('.fabricate-manager .manager-environment-actions');
  const actionGridBlock = blockFor('.fabricate-manager .manager-environment-action-grid');
  const reorderStackBlock = blockFor('.fabricate-manager .manager-environment-reorder-stack');
  const editorShellBlock = blockFor('.fabricate-manager .manager-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager .manager-environment-edit-view');
  // NOT `blockFor`: that returns the FIRST block matching the selector, and the workspace's
  // narrow override — which sets only the column token — is declared EARLIER in the file than
  // the base rule this assertion is about. The base rule is the unindented one.
  const workspaceBlock = (css.match(
    /^\.fabricate-manager \.manager-environment-workspace \{[\s\S]*?\}/m
  ) || [''])[0];
  const weightFieldBlock = blockFor('.fabricate-manager .manager-environment-comp-weight-field');
  // The overflow menu is the shared `<ActionMenu>` primitive since issue 1477, so its family is
  // rooted at the two namespace classes THAT COMPONENT writes rather than at `.fabricate-manager`
  // and the environment editor's own name. Everything asserted below is the same declaration set
  // at the same specificity — the item rules keep their `button` type selector precisely so that
  // re-rooting moves nothing in this screen's cascade.
  const compMenuBlock = blockFor(
    '.fabricate-action-menu-panel.manager-action-menu-panel'
  );
  const compMenuButtonBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item'
  );
  const compMenuIconBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item > i'
  );
  const compMenuLabelBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item > span'
  );
  const compMenuDisabledBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item:disabled'
  );
  const compQuickActionBlock = blockFor(
    '.fabricate-manager .manager-environment-comp-quick-action'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const environmentCompContainerQuery = css.slice(
    css.indexOf('@container fabricate-manager (max-width: 960px)')
  );

  assert.ok(
    toolbarBlock.includes('max-height: 100px;') && toolbarBlock.includes('overflow-y: auto;'),
    'environments toolbar should keep wrapped filters height-bounded instead of pushing the empty state down'
  );
  assert.ok(
    toolbarBlock.includes('align-content: flex-start;'),
    'environments toolbar should keep wrapped filter rows pinned to the top of its bounded scroll area'
  );
  assert.ok(
    gatheringPanelBlock.includes('min-height: 0;') &&
      gatheringPanelBlock.includes('overflow: hidden;'),
    'gathering panels should participate in the manager bounded grid instead of expanding to content height'
  );
  assert.ok(
    gatheringEnvironmentsPanelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'),
    'environments gathering panel should reserve a bounded scroll row between toolbar and pagination'
  );
  assert.ok(
    tableScrollBlock.includes('overflow: auto;') && tableScrollBlock.includes('min-height: 0;'),
    'environment table scroll region should own internal overflow once bounded by the gathering panel'
  );
  assert.ok(
    tableBlock.includes('--fab-manager-environment-grid: minmax(0, 1fr) 120px 56px 88px 116px;'),
    'environments table should define one flexible identity column and fixed compact columns so headers and rows align'
  );
  assert.ok(
    !css.includes(
      '.fabricate-manager .manager-environment-row {\n  position: relative;\n  min-height: 88px;\n}'
    ),
    'environment rows should no longer carry the taller reorder-overlay height override'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row,') &&
      css.includes('min-height: 76px;'),
    'environment rows should share the compact 76px row height with the task and event browsers'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-identity {\n  grid-template-columns: 64px minmax(0, 1fr);\n  gap: var(--fab-space-3);\n  align-self: center;\n  min-height: 64px;'
    ),
    'environment identity should reserve a square 64px thumbnail column like the task and event browsers'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-thumb {\n  display: block;\n  align-self: center;\n  width: 64px;\n  height: 64px;'
    ),
    'environment thumbnails should render as a square 64px image that suits both scene thumbnails and chosen images'
  );
  assert.ok(
    taskCountBlock.includes('font-weight: 800;'),
    'environment task count should render as plain emphasized text'
  );
  assert.ok(
    actionGridBlock.includes('display: flex;'),
    'environment edit duplicate delete buttons should sit inline in a flex row'
  );
  assert.ok(
    !css.includes(
      '.fabricate-manager .manager-environment-action-grid .manager-icon-button.is-danger {\n  grid-column: 2;\n}'
    ),
    'environment delete quick action should no longer be forced into a second reorder-era grid column'
  );
  assert.ok(
    !css.includes('manager-environment-reorder-stack'),
    'environment reorder controls and their styles should be removed'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row .manager-status-cell'),
    'environment status cells should align the shared compact status toggle'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(
    editorShellBlock.includes('overflow: hidden;') &&
      editorShellBlock.includes('grid-template-rows: minmax(0, 1fr);'),
    'environment editor shell should bound the editor height (not scroll) so the tab bar stays fixed'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-tab-panel').includes('overflow: auto;'),
    'the environment editor tab panel should own internal scroll while the tab bar stays pinned'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-body') &&
      css.includes('grid-template-columns: 220px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(
    editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'),
    'environment editor should reserve details band plus scrollable workspace'
  );
  assert.ok(
    workspaceBlock.includes(
      'grid-template-columns: var(--fab-env-workspace-grid, minmax(0, 1fr) 300px);'
    ),
    'environment editor workspace should pair the main composition column with a fixed 300px inspector (matching the standard manager inspector width) at normal widths, through the token its narrow override sets'
  );
  const compBlock = blockFor('.fabricate-manager .manager-environment-comp');
  assert.ok(
    compBlock.includes('--fab-env-comp-grid: minmax(0, 1fr) 92px 132px 92px;'),
    'composition grid keeps the shared fallback layout for non-task rows'
  );
  assert.ok(
    css.includes('.manager-environment-comp[data-composition-kind="task"]') &&
      css.includes('--fab-env-comp-grid: minmax(0, 1fr) 72px 132px 72px;'),
    'task rows reserve space for a quick action icon beside the overflow-menu action'
  );
  assert.ok(
    css.includes(
      '.manager-environment-comp[data-composition-kind="task"][data-composition-selection="blind"]'
    ) && css.includes('--fab-env-comp-grid: minmax(0, 1fr) 158px 72px 132px 72px;'),
    'blind-mode tasks reserve a Weight column wide enough for the stepper and its calculated percentage'
  );
  assert.ok(
    environmentCompContainerQuery.includes(
      '.fabricate-manager .manager-environment-comp[data-composition-kind="task"]'
    ) &&
      environmentCompContainerQuery.includes(
        '--fab-env-comp-grid: minmax(0, 1fr) 64px 110px 72px;'
      ),
    'narrow task rows key off manager container width and keep enough action-column width for quick action plus menu buttons'
  );
  // The NARROW blind row, pinned nowhere before the weight field became a Stepper. The
  // weight track must NOT shrink with the container — 102px is the primitive's natural
  // width and the selection-share readout still sits beside it — so only the name column
  // gives. Without this pin the container-query branch could drift back to a width the
  // control overflows, on exactly the 880/900px View Lab cases that render it.
  assert.ok(
    environmentCompContainerQuery.includes(
      '.fabricate-manager .manager-environment-comp[data-composition-kind="task"][data-composition-selection="blind"]'
    ) &&
      environmentCompContainerQuery.includes(
        '--fab-env-comp-grid: minmax(0, 1fr) 158px 64px 110px 72px;'
      ),
    'narrow blind task rows keep the full-width Weight column so the stepper never overflows it'
  );
  assert.ok(
    weightFieldBlock.includes('flex: 0 0 102px;') &&
      weightFieldBlock.includes('--fab-stepper-fill-height: 28px;'),
    'the blind task weight slot pins the stepper to its natural width and to the row height the bare input had'
  );
  assert.ok(
    compQuickActionBlock.includes('flex: 0 0 34px;'),
    'composition quick actions should keep the same fixed geometry as manager icon buttons'
  );
  assert.ok(
    compMenuBlock.includes('position: absolute;') && !compMenuBlock.includes('right: 0;'),
    'the overflow menu is PORTALED (issue 1477), so its placement is measured against the host ' +
      'it lands in and written inline by `computeActionMenuLayout`. A `right: 0` here would be ' +
      'read against the portal host rather than the row, which is a panel in the wrong place ' +
      'with byte-identical markup — the exact failure `util/overlayHost.js` documents'
  );
  assert.ok(
    compMenuBlock.includes('width: max-content;') &&
      compMenuBlock.includes('max-width: min(260px, calc(100vw - 32px));') &&
      compMenuBlock.includes('min-width: 176px;'),
    'composition overflow menus should size to single-line labels with compact minimum and bounded maximum widths'
  );
  assert.ok(
    compMenuButtonBlock.includes('display: grid;') &&
      compMenuButtonBlock.includes('grid-template-columns: 18px minmax(0, 1fr);'),
    'composition overflow menu items should reserve a fixed icon column before a truncating label column'
  );
  assert.ok(
    compMenuButtonBlock.includes('min-width: 0;'),
    'composition overflow menu rows should be allowed to shrink inside the flex menu container'
  );
  assert.ok(
    compMenuButtonBlock.includes('justify-content: start;') &&
      compMenuButtonBlock.includes('place-items: center start;') &&
      compMenuButtonBlock.includes('text-align: left;'),
    'composition overflow menu item content should be left-aligned'
  );
  assert.ok(
    compMenuButtonBlock.includes('white-space: nowrap;'),
    'composition overflow menu labels should remain on one line'
  );
  assert.ok(
    compMenuButtonBlock.includes('font-size: 0.82rem;') &&
      compMenuButtonBlock.includes('font-weight: 500;'),
    'composition overflow menu items should use compact lighter text'
  );
  assert.ok(
    compMenuIconBlock.includes('justify-self: center;'),
    'composition overflow menu icons should stack in the center of the fixed icon column'
  );
  assert.ok(
    compMenuLabelBlock.includes('display: block;') &&
      compMenuLabelBlock.includes('min-width: 0;') &&
      compMenuLabelBlock.includes('max-width: 100%;') &&
      compMenuLabelBlock.includes('overflow: hidden;') &&
      compMenuLabelBlock.includes('text-overflow: ellipsis;'),
    'composition overflow menu labels should truncate inside the bounded menu width'
  );
  // The disabled NOTE ("Enable in library first") used to be a second, near-identical rule plus a
  // `::before` spacer, because it was the one menu row with no glyph. `<ActionMenu>` renders the
  // icon cell for every item, so the note takes the item rule's geometry unchanged and the pair
  // is retired rather than re-rooted. What is left is the disabled STATE.
  assert.ok(
    compMenuDisabledBlock.includes('opacity: 0.45;') &&
      compMenuDisabledBlock.includes('cursor: default;'),
    'a disabled menu item still reads as inert'
  );
  // A RULE, not a mention: the re-rooting comment above the new family names the retired
  // selectors in prose, and `css` is the raw sheet. Requiring the opening brace is what makes
  // this a claim about selectors rather than about words.
  assert.ok(
    !/\.manager-environment-comp-menu[\w-]*(::[\w-]+)?[^{}\n]*\{/.test(css),
    'and the note rule and its icon-column spacer are gone rather than left behind matching ' +
      'nothing, which is what a class that moves onto a component tag otherwise leaves in a sheet'
  );
  assert.ok(
    compBlock.includes('--fab-env-comp-grid-ranked: 30px minmax(0, 1fr) 92px 132px 92px;') &&
      css.includes('.fabricate-manager .manager-environment-comp-head.has-rank-controls') &&
      css.includes('.fabricate-manager .manager-environment-comp-row.has-rank-controls'),
    'ranked events opt into a leading 30px handle column ahead of the task/override/runtime cells'
  );
  assert.ok(
    !compBlock.includes('minmax(150px'),
    'composition grid should not hard-floor flexible columns and overflow the panel'
  );
  assert.ok(
    !css.includes('manager-environment-evidence-column'),
    'environment editor CSS should no longer reference the removed evidence column'
  );
  assert.ok(
    !css.includes('.manager-environment-comp-evidence'),
    'environment editor CSS should no longer reference the removed inline-row evidence cell'
  );
  assert.ok(
    css.includes('.fabricate-manager .image-path-picker.is-button-only .image-path-picker-button'),
    'environment editor should style the button-only ImagePathPicker variant'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-environment-details-tabs'),
    false,
    'environment editor should not define removed environment advanced tabs'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-row') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager layout should stack environment rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-editor-shell') &&
      mediumQuery.includes('overflow: visible;'),
    'stacked environment edit layout should release nested scroll containment'
  );
  // The workspace's own narrow override is NOT asserted as text here. It was, and the
  // assertion passed for the whole life of a rule that never applied: a container query adds
  // no specificity, so `grid-template-columns` inside this block tied with the base rule
  // declared later in the sheet and lost on source order. A source-text assertion cannot tell
  // a live rule from a dead one — `manager workspace restacks at the declared floor` below
  // measures the rendered grid instead.
});

test('manager environment inspector evidence table wraps compact pills without horizontal overflow', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 360, height: 360 },
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
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              width: 260px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <section class="manager-inspector-card harness">
              <h3 class="manager-card-title">Matching evidence</h3>
              <table class="manager-environment-evidence is-checks manager-environment-evidence-table" aria-label="Matching evidence">
                <tbody>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="biome" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Biome</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">Forest</span>
                        <span class="manager-environment-evidence-value-pill is-danger" data-evidence-value-state="mismatch">VeryLongUnbrokenBiomeNameThatMustWrapInsideTheInspectorColumn</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="region" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Region</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">North</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="weather" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Weather</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Storm</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="time" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Time</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Night</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-any" data-evidence-field="danger" data-evidence-state="any">
                    <th class="manager-environment-evidence-dimension" scope="row">Danger</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-any" data-evidence-value-state="any">Any danger</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
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
      const table = document.querySelector('.manager-environment-evidence-table');
      const card = document.querySelector('.manager-inspector-card');
      const longPill = Array.from(
        document.querySelectorAll('.manager-environment-evidence-value-pill')
      ).find((pill) => pill.textContent.includes('VeryLongUnbroken'));
      const rowStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-row')
      );
      const tableStyle = getComputedStyle(table);
      const dimensionStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-dimension')
      );
      const valueCellStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-values')
      );
      const valueListStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-value-list')
      );
      const pillStyle = getComputedStyle(longPill);
      const valueCells = Array.from(
        document.querySelectorAll('.manager-environment-evidence-values')
      ).map(rectFor);

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        rowFields: Array.from(document.querySelectorAll('.manager-environment-evidence-row')).map(
          (row) => row.dataset.evidenceField
        ),
        table: rectFor(table),
        card: rectFor(card),
        longPill: rectFor(longPill),
        firstValueCell: valueCells[0],
        valueLefts: valueCells.map((cell) => Math.round(cell.left)),
        rowBorderBottom: rowStyle.borderBottomWidth,
        rowBackgroundColor: rowStyle.backgroundColor,
        tableStyle: {
          display: tableStyle.display,
          tableLayout: tableStyle.tableLayout,
          backgroundColor: tableStyle.backgroundColor,
        },
        dimensionStyle: {
          width: dimensionStyle.width,
          fontWeight: dimensionStyle.fontWeight,
          backgroundColor: dimensionStyle.backgroundColor,
        },
        valueCellStyle: {
          backgroundColor: valueCellStyle.backgroundColor,
        },
        valueListStyle: {
          display: valueListStyle.display,
          flexWrap: valueListStyle.flexWrap,
        },
        pillStyle: {
          borderRadius: pillStyle.borderRadius,
          overflowWrap: pillStyle.overflowWrap,
          backgroundColor: pillStyle.backgroundColor,
        },
      };
    });

    assert.deepEqual(
      report.rowFields,
      ['biome', 'region', 'weather', 'time', 'danger'],
      'inspector evidence table should render all five rows'
    );
    assert.equal(
      report.tableStyle.display,
      'table',
      'inspector evidence should keep table layout despite shared evidence flex styles'
    );
    assert.equal(
      report.tableStyle.tableLayout,
      'fixed',
      'inspector evidence table should keep fixed columns'
    );
    assert.equal(
      report.tableStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence table should not draw a dark inset panel'
    );
    assert.equal(
      report.rowBackgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence rows should not draw alternating backgrounds'
    );
    assert.equal(
      report.dimensionStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence label cells should not draw row fill'
    );
    assert.equal(
      report.valueCellStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence value cells should not draw row fill'
    );
    assert.equal(
      report.rowBorderBottom,
      '1px',
      'inspector evidence rows should use horizontal separators'
    );
    assert.ok(
      report.dimensionStyle.width.startsWith('82'),
      'inspector evidence labels should keep a fixed left column'
    );
    assert.ok(
      Number(report.dimensionStyle.fontWeight) >= 650,
      'inspector evidence labels should render as strong labels'
    );
    assert.equal(
      report.valueListStyle.display,
      'flex',
      'inspector values should align as inline pill rows'
    );
    assert.equal(
      report.valueListStyle.flexWrap,
      'wrap',
      'inspector value pills should wrap inside the right column'
    );
    assert.equal(
      new Set(report.valueLefts).size,
      1,
      'inspector value columns should align across rows'
    );
    assert.ok(
      report.table.right <= report.card.right + 1,
      'evidence table should stay inside the inspector card'
    );
    assert.ok(
      report.documentWidth <= report.viewportWidth,
      'evidence table should not create page-level horizontal overflow'
    );
    assert.ok(
      report.longPill.width <= report.firstValueCell.width + 1,
      'long value pills should stay inside the right column'
    );
    assert.ok(
      report.longPill.height > 20,
      'long value pills should wrap to multiple compact lines instead of clipping'
    );
    assert.equal(
      report.pillStyle.borderRadius,
      '4px',
      'value pills should use compact chip corners'
    );
    assert.equal(
      report.pillStyle.overflowWrap,
      'anywhere',
      'value pills should be able to break long localized values'
    );
    assert.notEqual(
      report.pillStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'status pills should retain subtle state backgrounds'
    );
  } finally {
    await context.close();
  }
});

test('manager environment composition overflow menu renders bounded single-line rows', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 360, height: 260 },
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
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              position: relative;
              width: 320px;
              height: 180px;
            }
            .harness .fabricate-action-menu {
              width: 34px;
              margin-left: 260px;
            }
            /*
              The panel is PORTALED in the product, so its placement is written inline against the
              host it lands in. This fixture measures the DECLARATIONS the sheet supplies — sizing,
              the icon column, truncation — so it supplies that placement itself, right-aligned to
              the trigger exactly as computeActionMenuLayout computes it. No backticks in here: the
              whole page is a JS template literal.
            */
            .harness .fabricate-action-menu-panel {
              right: 0;
              top: 38px;
            }
            .harness .manager-icon-button {
              width: 34px;
              height: 34px;
            }
            .fa-solid::before,
            .fas::before {
              content: "■";
              display: inline-block;
              width: 10px;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness">
              <div class="fabricate-action-menu manager-action-menu">
                <button type="button" class="manager-icon-button" aria-haspopup="menu" aria-label="Open task actions">
                  <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                </button>
                <div class="fabricate-action-menu-panel manager-action-menu-panel" role="menu" tabindex="-1" data-keyboard-focus="true" aria-label="Open task actions">
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item">
                    <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                    <span>OpenSourceRecordWithAnIntentionallyExtendedLocalizedMenuLabelThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item is-danger">
                    <i class="fas fa-ban" aria-hidden="true"></i>
                    <span>Exclude from environment</span>
                  </button>
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item" disabled>
                    <i class="" aria-hidden="true"></i>
                    <span>EnableInLibraryFirstWithAnIntentionallyExtendedLocalizedNoteThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                </div>
              </div>
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
        const labelStyle = getComputedStyle(label);
        return {
          row: rectFor(element),
          icon: icon ? rectFor(icon) : null,
          label: rectFor(label),
          rowStyle: {
            display: rowStyle.display,
            gridTemplateColumns: rowStyle.gridTemplateColumns,
            justifyContent: rowStyle.justifyContent,
            justifyItems: rowStyle.justifyItems,
            textAlign: rowStyle.textAlign,
            whiteSpace: rowStyle.whiteSpace,
            fontSize: rowStyle.fontSize,
            fontWeight: rowStyle.fontWeight,
          },
          labelStyle: {
            overflow: labelStyle.overflow,
            textOverflow: labelStyle.textOverflow,
            whiteSpace: labelStyle.whiteSpace,
          },
          labelClientWidth: label.clientWidth,
          labelScrollWidth: label.scrollWidth,
        };
      };

      return {
        viewportWidth: window.innerWidth,
        wrap: rectFor(document.querySelector('.fabricate-action-menu')),
        menu: rectFor(document.querySelector('.fabricate-action-menu-panel')),
        rows: Array.from(
          document.querySelectorAll('.fabricate-action-menu-panel button')
        ).map(rowFor),
      };
    });

    const [firstRow, dangerRow, noteRow] = report.rows;
    const iconCenters = [firstRow, dangerRow].map((row) => row.icon.left + row.icon.width / 2);
    const labelLefts = report.rows.map((row) => row.label.left);

    assert.ok(
      report.menu.width <= 261,
      'composition menu should render within the bounded maximum width'
    );
    assert.ok(
      report.menu.right <= report.viewportWidth - 16,
      'composition menu should avoid viewport horizontal overflow'
    );
    assert.ok(
      Math.abs(report.menu.right - report.wrap.right) <= 1,
      'composition menu should remain right-aligned to the action button'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.display === 'grid'),
      'composition menu rows should render as grid rows'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.gridTemplateColumns.startsWith('18px ')),
      'composition menu rows should render the fixed icon column'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.whiteSpace === 'nowrap'),
      'composition menu rows should render as single-line actions'
    );
    assert.ok(
      report.rows.every(
        (row) => row.rowStyle.justifyContent === 'start' && row.rowStyle.justifyItems === 'start'
      ),
      'composition menu row content should be left-aligned'
    );
    assert.ok(
      report.rows.every(
        (row) => row.rowStyle.fontSize === '13.12px' && row.rowStyle.fontWeight === '500'
      ),
      'composition menu rows should render compact medium-weight text'
    );
    assert.ok(
      Math.abs(iconCenters[0] - iconCenters[1]) <= 1,
      'composition menu icons should stack in one vertical column'
    );
    assert.ok(
      Math.max(...labelLefts) - Math.min(...labelLefts) <= 1,
      'composition menu labels and disabled notes should align in one text column'
    );
    assert.equal(firstRow.labelStyle.overflow, 'hidden', 'long menu labels should hide overflow');
    assert.equal(
      firstRow.labelStyle.textOverflow,
      'ellipsis',
      'long menu labels should use an ellipsis'
    );
    assert.ok(
      firstRow.labelScrollWidth > firstRow.labelClientWidth,
      'long menu labels should truncate within the bounded label column'
    );
    assert.ok(
      noteRow.labelScrollWidth > noteRow.labelClientWidth,
      'disabled note labels should truncate within the same bounded label column'
    );
  } finally {
    await context.close();
  }
});

test('manager system edit view defines scoped stable form and toggle layout', () => {
  const mainBlock = blockFor('.fabricate-manager .manager-system-edit-main');
  const formBlock = blockFor('.fabricate-manager .manager-system-edit-form');
  const gridBlock = blockFor('.fabricate-manager .manager-edit-grid');
  // `:not(.fab-stepper-input)` (issue 676): the shared `Stepper` brings its own
  // borderless chrome from a component-scoped <style>, which this rule out-specifies —
  // so a Stepper inside any `.manager-field` was being stretched to 100%/36px and
  // re-bordered. The exclusion is part of the selector's source text, so this
  // source-text lookup has to carry it.
  // `blockFor` anchors on the selector text IMMEDIATELY followed by `{`, so this must
  // name the whole selector list of the height rule — which is what distinguishes it
  // from the width rule above it (that one also lists `textarea`).
  //
  // `:not(.fab-stepper-input)` (issue 676): the shared `Stepper` brings its own
  // borderless chrome from a component-scoped <style>, which this rule out-specifies —
  // so a Stepper inside any `.manager-field` was being stretched to 100%/36px and
  // re-bordered. `:not([type='radio'])` excludes the custom resolution radios for the
  // same reason — the text-field treatment tied their own rule on specificity and, later
  // in the file, squared the dot and stretched it to fill the flex line.
  // `:not([type='range'])` (issue 883) excludes the chance slider, whose 6px track and
  // coloured fill are painted BEHIND a transparent input that this rule was stretching to
  // 36px and filling opaquely.
  // The list used to end in `.manager-component-inline-control`, a class no source file
  // emits since the issue-1371 rebuild gave the Category select a card of its own. It was
  // removed from all three of the sheet's lists at revision 8, and this anchor with it: a
  // retired selector kept inside a live selector list is dead CSS the block-granular
  // dead-class gate cannot see, and a test anchor naming it kept it alive by hand.
  const fieldInputBlock = blockFor(
    ".fabricate-manager .manager-field input:not(.fab-stepper-input):not([type='radio']):not([type='range']),\n" +
      '.fabricate-manager .manager-field select'
  );
  const toggleListBlock = blockFor('.fabricate-manager .manager-toggle-list');
  const featureTileBlock = blockFor('.fabricate-manager .manager-feature-tile');
  const featureTileIconBlock = blockFor('.fabricate-manager .manager-feature-tile-icon');
  const featureTileIconOnBlock = blockFor('.fabricate-manager .manager-feature-tile-icon.is-on');
  const featureTileIconOffBlock = blockFor('.fabricate-manager .manager-feature-tile-icon.is-off');
  const featureTileBodyBlock = blockFor('.fabricate-manager .manager-feature-tile-body');
  const featureTileHeadBlock = blockFor('.fabricate-manager .manager-feature-tile-head');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const narrowQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  assert.ok(
    mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'),
    'system edit main should reserve scrollable form space'
  );
  assert.ok(
    formBlock.includes('overflow: auto;'),
    'system edit form should own scroll containment at normal widths'
  );
  assert.ok(
    gridBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'system edit fields should use a stable two-column grid'
  );
  assert.ok(
    fieldInputBlock.includes('height: 36px;'),
    'system edit inputs and selects should have stable control height'
  );
  assert.ok(
    toggleListBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'feature toggles should use stable two-column rows'
  );
  assert.ok(
    featureTileBlock.includes('flex-direction: row;'),
    'feature tiles should seat the state icon beside the copy'
  );
  assert.ok(
    featureTileIconBlock.includes('flex: 0 0 40px;'),
    'feature tile icon should hold the resolution card chip width without shrinking'
  );
  assert.ok(
    featureTileIconOnBlock.includes('background: var(--fab-bg-3);') &&
      featureTileIconOnBlock.includes('color: var(--fab-accent);'),
    'an enabled feature chip should match the resolution mode card chip fill'
  );
  assert.ok(
    featureTileIconOffBlock.includes('background: transparent;') &&
      featureTileIconOffBlock.includes('border-style: dashed;'),
    'a disabled feature chip should read as a hollow outline rather than a lit chip'
  );
  assert.ok(
    featureTileBodyBlock.includes('flex-direction: column;'),
    'feature tile body should stack heading and hint vertically'
  );
  assert.ok(
    featureTileBodyBlock.includes('min-width: 0;'),
    'feature tile body should allow the label and hint to wrap in the grid track'
  );
  assert.ok(
    featureTileHeadBlock.includes('justify-content: space-between;'),
    'feature tile heading should push the pill toggle to the trailing edge'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-toggle-list') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium edit layout should collapse feature toggles before text becomes cramped'
  );
  assert.ok(
    narrowQuery.includes('.fabricate-manager .manager-edit-card-heading') &&
      narrowQuery.includes('flex-direction: column;'),
    'narrow edit card headings should stack actions under titles'
  );
});

test('manager pagination footer uses scoped chrome with stable summary, nav, and per-page controls', () => {
  const block = blockFor('.fabricate-manager .manager-pagination');

  assert.ok(block.includes('display: flex;'), 'pagination footer should layout horizontally');
  assert.ok(
    block.includes('justify-content: space-between;'),
    'pagination footer should distribute summary, nav, per-page across the row'
  );
  assert.ok(block.includes('flex-wrap: wrap;'), 'pagination footer should wrap on narrow widths');
  assert.ok(
    block.includes('border-top: 1px solid var(--fab-border);'),
    'pagination footer should anchor to the table with a manager border'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-pagination-page'),
    'pagination should expose a stable Page-of label for keyboard users'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-pagination-size select'),
    'pagination should style the per-page selector inside the manager scope'
  );
});

test('design-system colour tokens are declared in the theme layer as the agreed source of truth', () => {
  const rootBlock = blockFor(':root');
  const themeBlock = [
    blockFor(
      ':root,\n:root[data-fabricate-theme="fabricate"],\n.fabricate[data-fabricate-theme="fabricate"]'
    ),
    blockFor(
      ':root[data-fabricate-theme="mythwright"],\n.fabricate[data-fabricate-theme="mythwright"]'
    ),
  ].join('\n');

  for (const token of [
    '--fab-bg-0:',
    '--fab-bg-1:',
    '--fab-bg-2:',
    '--fab-bg-3:',
    '--fab-surface:',
    '--fab-surface-soft:',
    '--fab-surface-raised:',
    '--fab-border:',
    '--fab-border-strong:',
    '--fab-text:',
    '--fab-text-muted:',
    '--fab-text-subtle:',
    '--fab-accent:',
    '--fab-accent-hover:',
    '--fab-accent-strong:',
    '--fab-accent-soft:',
    '--fab-info:',
    '--fab-info-soft:',
    '--fab-warning:',
    '--fab-warning-soft:',
    '--fab-danger:',
    '--fab-danger-soft:',
    '--fab-purple:',
    '--fab-purple-soft:',
  ]) {
    assert.ok(
      themeBlock.includes(token),
      `theme layer should declare design-system colour token ${token.replace(':', '')}`
    );
  }

  for (const token of [
    '--fab-space-1:',
    '--fab-space-2:',
    '--fab-space-3:',
    '--fab-space-4:',
    '--fab-space-5:',
    '--fab-space-6:',
  ]) {
    assert.ok(
      rootBlock.includes(token),
      `root layer should declare design-system layout token ${token.replace(':', '')}`
    );
  }
});

test('manager icon buttons normalize host button defaults and keep pointer targets stable', () => {
  const block = blockFor(
    '.fabricate-manager .manager-button,\n.fabricate-manager .manager-icon-button'
  );
  const primaryIconBlock = blockFor('.fabricate-manager .manager-icon-button.is-primary');
  const primaryIconHoverBlock = blockFor(
    '.fabricate-manager .manager-icon-button.is-primary:not(:disabled):hover'
  );
  const iconBlocks = Array.from(
    css.matchAll(/\.fabricate-manager \.manager-icon-button\s*\{[\s\S]*?\}/g)
  );
  const iconBlock = iconBlocks.at(-1)?.[0] || '';

  assert.ok(block.includes('appearance: none;'), 'manager buttons should clear host appearance');
  assert.ok(
    block.includes('-webkit-appearance: none;'),
    'manager buttons should clear WebKit host appearance'
  );
  assert.ok(
    block.includes('box-sizing: border-box;'),
    'manager buttons should use border-box sizing'
  );
  assert.ok(
    block.includes('display: inline-flex;'),
    'manager buttons should center contents with inline-flex'
  );
  assert.ok(
    block.includes('min-width: 0;'),
    'manager buttons should clear host min-width defaults'
  );
  assert.ok(
    iconBlock.includes('width: 34px;'),
    'icon buttons should have a stable width of at least 32px'
  );
  assert.ok(
    iconBlock.includes('height: 34px;'),
    'icon buttons should have a stable height of at least 32px'
  );
  assert.ok(
    primaryIconBlock.includes('color: var(--fab-success-text);'),
    'primary icon buttons should use a light green outline treatment'
  );
  assert.equal(
    primaryIconBlock.includes('background: var(--fab-success);'),
    false,
    'primary icon buttons should not use the heavy solid primary background'
  );
  assert.ok(
    primaryIconHoverBlock.includes('background: var(--fab-success-soft);'),
    'primary icon buttons should keep a soft green hover state'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-button:disabled'),
    'disabled manager buttons should have explicit disabled styling'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-button:not(:disabled):hover'),
    'manager hover styles should not target disabled buttons'
  );
});

test('collapsed manager rail reclaims content width and keeps section nav as an icon strip', () => {
  const bodyBlock = blockFor('.fabricate-manager .manager-body');
  const collapsedBodyBlock = blockFor('.fabricate-manager .manager-body.is-rail-collapsed');
  const toggleBlock = blockFor('.fabricate-manager .manager-rail-toggle');
  const collapsedRailBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-rail'
  );
  const collapsedNavButtonBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button'
  );

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'),
    'expanded manager body keeps the fixed 220px rail column'
  );
  assert.ok(
    collapsedBodyBlock.includes('grid-template-columns: 56px minmax(0, 1fr) 300px;'),
    'collapsed manager body narrows the rail column so the main column reclaims the freed width'
  );
  assert.ok(
    toggleBlock.includes('appearance: none;') && toggleBlock.includes('cursor: pointer;'),
    'rail toggle should be a normalized button control'
  );
  assert.ok(
    collapsedRailBlock.includes('padding:'),
    'collapsed rail should tighten its padding for the icon strip'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label,\n.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {'
    ),
    'collapsed rail should hide nav labels and counts to leave an icon-only strip'
  );
  assert.ok(
    collapsedNavButtonBlock.includes('grid-template-columns: minmax(0, 1fr);'),
    'collapsed nav buttons should collapse to a single centered icon column'
  );
  assert.ok(
    stackedBodyRule().includes('grid-template-columns: 1fr;'),
    'narrow container query should still stack the collapsed body to a single column'
  );
});

// The stacked body rule, read out of the 1120px container query rather than off the base
// `.manager-body` block (`blockFor` returns the FIRST match, which is the base rule).
function stackedBodyRule() {
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const selector =
    '.fabricate-manager .manager-body,\n  .fabricate-manager .manager-body.is-rail-collapsed {';
  const start = query.indexOf(selector);
  if (start < 0) return '';
  const rule = query.slice(start);
  return rule.slice(0, rule.indexOf('}') + 1);
}

// Issue 643 — the bug that made the recipe library render ZERO visible rows at 900px.
//
// Stacked, `.manager-body`'s three children land in implicit `auto` rows inside a box of
// DEFINITE height, and each of them carries `min-height: 0` + `overflow: hidden` — so each
// contributes a min-content size of ZERO and the track-sizing algorithm SHARES the body's
// height between them rather than sizing each to its content. Measured at 900x700: rail
// 225px (its whole nav clipped away), main 200px, inspector 179px, `.manager-table-scroll`
// squeezed to 24px, and every recipe row still in the DOM at its full 76px — which is
// precisely why `assertManagerLayoutStable` (a DOM row count plus an overflow measurement)
// passed on a library that showed nothing at all.
//
// `max-content` tracks cannot be squeezed. This is a correctness rule, not tidiness.
test('the stacked manager body sizes its regions to content instead of sharing its height', () => {
  const bodyRule = stackedBodyRule();
  assert.ok(bodyRule, 'the 1120px query must still carry a stacked-body rule');
  assert.ok(
    bodyRule.includes('grid-auto-rows: max-content;'),
    'stacked rail / main / inspector rows must size to content, or each is squeezed to a share of the body height'
  );
  assert.ok(
    bodyRule.includes('overflow-y: auto;'),
    'the body is what scrolls once its regions keep their own height'
  );

  // Left at its content height the stacked rail is ~650px of navigation ABOVE the content
  // it navigates to, so the GM would scroll past the entire nav to reach row one.
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const railStart = query.indexOf('.fabricate-manager .manager-rail {');
  const railRule = query.slice(railStart, query.indexOf('}', railStart) + 1);
  assert.ok(
    railRule.includes('max-height:'),
    'the stacked rail is bounded, not a full-height wall of nav'
  );
  assert.ok(
    railRule.includes('overflow: hidden auto;'),
    'the bounded stacked rail scrolls its own nav'
  );
});

// The rail nav was unreachable in a SHORT window.
//
// Every rule that ever gave the rail a scroller lived in an `inline-size` container query — the
// 1120px stacked block above and the per-view 831px ones — so a window that stayed WIDE and only
// lost height never reached one. The rail's height is definite (the shell's `1fr` row) and it
// carries `overflow: hidden` from the grouped region rule, so the bottom of the section list was
// clipped: Tools, Checks, Gathering and the placeholders sat in the DOM and could not be reached
// with a pointer. `assertManagerLayoutStable` cannot see this either — a CLIPPED rail does not
// overflow, the same blind spot the issue-643 note above records.
//
// The fixture is the real shell shape on purpose: two `auto` header rows ABOVE the body, so
// `.manager-body` lands in the `1fr` row and the rail inherits a window-bound height. Rendering
// the body alone would put it in an implicit `auto` row, size it to its content, and the bug
// would be unreproducible.
function shortWindowRailMarkup(navItems) {
  const items = Array.from({ length: navItems }, (item, index) => {
    const last = index === navItems - 1 ? ' data-last-nav' : '';
    return `<button class="manager-nav-button"${last}><span class="manager-nav-icon"><i class="fas fa-gem"></i></span><span class="manager-nav-label">Section ${index + 1}</span><span class="manager-nav-count">${index}</span></button>`;
  }).join('');
  return `<div class="fabricate-manager" data-manager-view="systems">
      <div class="manager-titlebar" data-manager-titlebar><span>Fabricate</span></div>
      <header class="manager-header"><h1>Crafting systems</h1></header>
      <div class="manager-body">
        <aside class="manager-rail">
          <p class="manager-rail-title" data-manager-rail-section>GM management</p>
          <section class="manager-rail-block">
            <div class="manager-scope-card" data-scope-card>
              <div class="manager-scope-card-head"><p class="manager-kicker">Crafting system</p><button class="manager-rail-toggle manager-scope-collapse" data-manager-rail-toggle>&lsaquo;</button></div>
              <select class="manager-scope-select"><option>Lab Smithing</option></select>
              <button class="manager-scope-return">All crafting systems</button>
            </div>
          </section>
          <nav class="manager-nav">${items}</nav>
        </aside>
        <main class="manager-main"><div class="manager-table-scroll">Rows</div></main>
        <aside class="manager-inspector"><section class="manager-inspector-card">Inspector</section></aside>
      </div>
    </div>`;
}

async function readShortWindowRailGeometry({ width = 1280, height = 560, navItems = 14 } = {}) {
  const context = await sharedBrowser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><style>html,body{margin:0}</style><div style="width:${width}px;height:${height}px">${shortWindowRailMarkup(navItems)}</div>`
    );
    return await page.evaluate(() => {
      const rail = document.querySelector('.manager-rail');
      const nav = document.querySelector('.manager-nav');
      const scope = document.querySelector('[data-scope-card]');
      const last = document.querySelector('[data-last-nav]');
      const scopeTopBefore = scope.getBoundingClientRect().top;
      const navScrollable = nav.scrollHeight - nav.clientHeight;

      // Reaching the bottom entry is the whole question, so drive the scroller rather than
      // measuring its resting position: a clipped box reports a bottom entry that is simply
      // off the end of the rail and stays there.
      nav.scrollTop = nav.scrollHeight;

      const navRect = nav.getBoundingClientRect();
      const scopeRect = scope.getBoundingClientRect();
      return {
        navOverflowY: getComputedStyle(nav).overflowY,
        navScrollable,
        navScrolledBy: nav.scrollTop,
        navTop: navRect.top,
        navBottom: navRect.bottom,
        lastItemBottom: last.getBoundingClientRect().bottom,
        railBottom: rail.getBoundingClientRect().bottom,
        railScrollable: rail.scrollHeight - rail.clientHeight,
        scopeTopBefore,
        scopeTopAfter: scopeRect.top,
        scopeBottom: scopeRect.bottom,
      };
    });
  } finally {
    await context.close();
  }
}

test('a short window scrolls the rail nav instead of clipping its bottom entries', async () => {
  const report = await readShortWindowRailGeometry();

  assert.equal(
    report.navOverflowY,
    'auto',
    'the rail nav must be a real scroller at full width, not a clipped box'
  );
  assert.ok(
    report.navScrollable > 0,
    'the fixture must actually overflow the rail, or this proves nothing'
  );
  assert.ok(report.navScrolledBy > 0, 'the nav must accept a scroll, not sit pinned at the top');
  assert.ok(
    report.lastItemBottom <= report.navBottom + 1,
    'the last nav entry must be reachable inside the nav once it is scrolled to the end'
  );
  assert.ok(
    report.navBottom <= report.railBottom + 1,
    'the scrolling nav must stay inside the rail rather than run past it'
  );

  // The user-facing claim, stated against the rail rather than the nav: with the scroller
  // removed this fixture puts the last entry ~340px BELOW the rail, clipped and unclickable,
  // while every nav-relative measurement still looks healthy.
  assert.ok(
    report.lastItemBottom <= report.railBottom + 1,
    'the last nav entry must be on screen inside the rail, not clipped below it'
  );

  // The scope card carries the rail collapse toggle and the system picker. Scrolling the
  // sections must not take them off screen — that is why the nav is the scroller and not the
  // whole rail.
  assert.equal(
    report.scopeTopAfter,
    report.scopeTopBefore,
    'the crafting-system scope card stays pinned while the section list scrolls'
  );
  assert.ok(
    report.scopeBottom <= report.navTop + 1,
    'the pinned scope card sits above the scrolling section list'
  );

  // The nav absorbs the rail's slack, so the rail itself must not also become a scroller here:
  // two nested scrollbars in one 220px column is a worse bug than the one being fixed.
  assert.ok(
    report.railScrollable <= 1,
    'the rail itself must not scroll while the nav has room to absorb the overflow'
  );
});

test('the rail nav declares the scroller and the stacked breakpoint hands it back', () => {
  const navBlock = blockFor('.fabricate-manager .manager-nav');
  assert.ok(
    navBlock.includes('flex: 1 1 auto;') &&
      navBlock.includes('min-height:') &&
      navBlock.includes('overflow: hidden auto;'),
    'the nav grows into the rail and scrolls, with a floor so the pinned blocks cannot crush it'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-rail').includes('overflow: hidden auto;'),
    'the rail keeps a backstop scroller for a window too short even for the nav floor'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-rail > .manager-rail-title,\n.fabricate-manager .manager-rail > .manager-rail-block {'
    ),
    'the blocks above the nav must opt out of shrinking, or they absorb the nav scroller'
  );

  // Stacked, the rail is already a bounded 232px strip that scrolls itself, so the nav must
  // hand the scrolling back rather than scroll inside whatever the pinned blocks leave of it.
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const navStart = query.indexOf('.fabricate-manager .manager-nav {');
  assert.ok(navStart > -1, 'the 1120px query must reset the nav scroller');
  const stackedNavRule = query.slice(navStart, query.indexOf('}', navStart) + 1);
  assert.ok(
    stackedNavRule.includes('flex: 0 0 auto;') && stackedNavRule.includes('overflow: visible;'),
    'the stacked nav keeps its content height and lets the bounded rail do the scrolling'
  );
});

// Issue 643: the Studio rail adds a section label, a crafting-system card and count
// numerals. Each has to opt out of the 56px collapsed strip explicitly, or it blows the
// icon column out.
//
// A rail count is a BARE NUMERAL, not a badge. It used to borrow `.manager-chip` and then
// spend five declarations undoing it (the 999px border, the fill, the 24px min-height), so
// every nav row still wore a button-shaped badge. Its own rule owes the chip nothing.
test('collapsed manager rail hides scope content but keeps its expand control and nav icons', () => {
  const collapsedRailTitleBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-rail-title'
  );
  const collapsedRailBlockBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-rail-block'
  );
  const collapsedScopeCardBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-scope-card'
  );
  const compactToggleBlock = blockFor('.fabricate-manager .manager-scope-collapse');
  const collapsedToggleBlock = blockFor(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-scope-collapse'
  );
  const railTitleBlock = blockFor('.fabricate-manager .manager-rail-title');
  const navCountBlock = blockFor('.fabricate-manager .manager-nav-count');

  assert.ok(
    collapsedRailTitleBlock.includes('display: none;'),
    'collapsed rail should hide the uppercase section label'
  );
  assert.ok(
    collapsedRailBlockBlock.includes('display: flex;'),
    'collapsed rail should retain the scope block that owns the expand control'
  );
  assert.ok(
    collapsedScopeCardBlock.includes('border: 0;') &&
      collapsedScopeCardBlock.includes('background: transparent;'),
    'the collapsed scope card should shed its expanded card chrome'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-body.is-rail-collapsed .manager-scope-card-head .manager-kicker,\n' +
        '.fabricate-manager .manager-body.is-rail-collapsed .manager-scope-select,\n' +
        '.fabricate-manager .manager-body.is-rail-collapsed .manager-scope-return,'
    ),
    'collapsed rail should hide the scope label, selector and return link'
  );
  assert.ok(
    compactToggleBlock.includes('width: 22px;') && compactToggleBlock.includes('height: 22px;'),
    'the expanded scope-card toggle should be smaller than the old standalone control'
  );
  assert.ok(
    collapsedToggleBlock.includes('width: 30px;') && collapsedToggleBlock.includes('height: 30px;'),
    'the collapsed expand control should retain a usable icon-strip target'
  );
  assert.ok(
    railTitleBlock.includes('letter-spacing:'),
    'the rail section label should track wider than a card title'
  );

  assert.ok(
    navCountBlock.includes('flex: 0 0 auto;'),
    'a rail count should not shrink the nav label away'
  );
  assert.ok(
    navCountBlock.includes('font-family: var(--fab-font-mono);'),
    'a rail count is a numeric and reads in the mono face'
  );
  assert.ok(
    navCountBlock.includes('font-variant-numeric: tabular-nums;'),
    'a rail count must not change width between 9 and 10'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-nav-count.manager-chip'),
    false,
    'the rail count should own its rule rather than borrowing (and undoing) the content chip'
  );

  const collapsedHideIndex = css.indexOf(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {'
  );
  const groupedHideIndex = css.indexOf(
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label,\n.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count {'
  );
  assert.ok(
    collapsedHideIndex >= 0 || groupedHideIndex >= 0,
    'collapsed rail must still hide the nav counts'
  );
});

test('the manager titlebar caps the premium badge and keeps the status line on one line', () => {
  const rootBlock = blockFor('.fabricate-manager');
  const titlebarBlock = blockFor('.fabricate-manager .manager-titlebar');
  const badgeBlock = blockFor('.fabricate-manager .manager-titlebar-badge');
  const statusBlock = blockFor('.fabricate-manager .manager-titlebar-status');
  const statusTextBlock = blockFor('.fabricate-manager .manager-titlebar-status-text');
  const titleBlock = blockFor('.fabricate-manager .manager-title');

  assert.ok(
    rootBlock.includes('grid-template-rows: auto auto 1fr;'),
    'the manager shell must reserve a row for the titlebar, or the header takes the 1fr row and the body collapses'
  );
  assert.ok(
    titlebarBlock.includes('display: flex;'),
    'the titlebar should lay its identity strip out in one row'
  );
  assert.ok(
    titlebarBlock.includes('min-width: 0;'),
    'the titlebar must be allowed to shrink inside the manager grid'
  );
  // The badge carries the localized PREMIUM mark (issue 1185; it used to carry the selected
  // system's name, which the rail's crafting-system card already shows).
  //
  // Its gold pair is stated ONCE, in a rule it SHARES with the rail's Downtime PREMIUM chip.
  // Two marks that must stay the same colour must not name that colour twice: a second copy
  // is a second thing to keep in step across all seven palettes. So the pair is asserted on
  // the shared rule, and the badge's own block is asserted NOT to restate it.
  const goldChipBlock =
    /\.fabricate-manager \.manager-titlebar-badge,\s*\.fabricate-manager \.manager-nav-button \.manager-nav-count\.manager-nav-premium \{[\s\S]*?\}/.exec(
      withoutComments(css)
    )?.[0] ?? '';
  assert.ok(
    goldChipBlock.includes('background: var(--fab-badge-gold);'),
    'the gold chip rule should fill both marks from the gold badge token'
  );
  assert.ok(
    goldChipBlock.includes('color: var(--fab-on-badge-gold);'),
    'and ink both from its paired on-gold token'
  );
  assert.ok(
    !badgeBlock.includes('--fab-badge-gold'),
    'the badge must take the pair from the shared rule rather than repeating it'
  );
  assert.ok(
    badgeBlock.includes('max-width:'),
    'the premium badge must cap its width against a long localized mark'
  );
  assert.ok(
    badgeBlock.includes('text-overflow: ellipsis;') && badgeBlock.includes('white-space: nowrap;'),
    'the premium badge should ellipsis rather than push the status line off the strip'
  );
  // Both sources are now the literal localized string `PREMIUM`, so neither mark uppercases
  // in CSS — shouting an already-uppercase word is how a translation gets shouted twice.
  assert.ok(
    !badgeBlock.includes('text-transform:'),
    'the premium badge should leave casing to the translation'
  );
  assert.ok(statusBlock.includes('margin-left: auto;'), 'the status line should sit right-aligned');
  assert.ok(
    statusBlock.includes('color: var(--fab-text-muted);'),
    'the status line should read as muted metadata'
  );
  assert.ok(
    statusTextBlock.includes('text-overflow: ellipsis;'),
    'a long resolution-mode label should ellipsis, not wrap the strip'
  );
  assert.ok(
    titleBlock.includes('font-family: var(--fab-font-serif);'),
    'the manager screen title should override the host h1 font with the studio serif'
  );
});

test('every view-specific manager-body grid override narrows the rail column when collapsed', () => {
  // Find each top-level view-specific `.manager-body` grid override (those that keep a
  // distinct fixed rail column). Each must ship a matching `.is-rail-collapsed` override that
  // narrows column one to 56px, otherwise the later view rule wins on equal specificity and the
  // collapse no-ops (issue #331 regression: a wide, mostly-empty icon strip).
  //
  // Two simple, linear-time regexes are used deliberately (rather than one combined pattern with
  // chained `+` quantifiers) to keep the matching free of any backtracking concern.
  const viewNames = Array.from(
    css.matchAll(/data-manager-view="(\w[\w-]*)"\] \.manager-body \{/g),
    (m) => m[1]
  );
  const views = Array.from(new Set(viewNames));

  assert.ok(
    views.length > 0,
    'expected at least one view-specific manager-body grid override to pin'
  );

  for (const view of views) {
    const overrideBlock = blockFor(`.fabricate-manager[data-manager-view="${view}"] .manager-body`);
    const columnsMatch = overrideBlock.match(/grid-template-columns:\s*(\S+)/);
    const firstColumn = columnsMatch ? columnsMatch[1] : '';
    // A view that stacks to a single column (e.g. inside a narrow container query) has no rail
    // column to narrow, so it does not need a collapsed override.
    if (firstColumn === '1fr' || firstColumn.startsWith('minmax')) {
      continue;
    }

    const collapsedBlock = blockFor(
      `.fabricate-manager[data-manager-view="${view}"] .manager-body.is-rail-collapsed`
    );
    assert.ok(
      collapsedBlock,
      `view "${view}" overrides the manager-body grid but is missing a .is-rail-collapsed override; the collapse will be overridden on equal specificity`
    );
    assert.ok(
      collapsedBlock.includes('grid-template-columns: 56px '),
      `view "${view}" collapsed override should narrow the rail column to 56px`
    );
  }
});

// The GM Knowledge surface (issue 785). Its layout is FIVE pieces, and the failure
// mode of doing only some of them is silent: a dead 300px inspector strip, or an
// action cluster clipped with no scrollbar. The paired `.is-rail-collapsed` sibling
// is already covered by the generic guard above; the rest is pinned here.
test('the Knowledge surface owns its third column and wraps its row action clusters', () => {
  const bodyBlock = blockFor('.fabricate-manager[data-manager-view="knowledge"] .manager-body');
  const collapsedBlock = blockFor(
    '.fabricate-manager[data-manager-view="knowledge"] .manager-body.is-rail-collapsed'
  );
  // `display: contents` is authored ONCE for every view that owns its own columns,
  // so the Knowledge main shares the Tool editor's rule rather than restating it.
  const mainBlock = blockFor(
    '.fabricate-manager .manager-tool-edit-main,\n.fabricate-manager .manager-knowledge-main'
  );
  const rowBlock = blockFor(
    '.fabricate-manager .manager-knowledge-copy-row,\n.fabricate-manager .manager-knowledge-learned-row'
  );
  const copyColumnBlock = blockFor('.fabricate-manager .manager-knowledge-copy-identity');
  const factBlock = blockFor('.fabricate-manager .manager-knowledge-fact-cluster .manager-fact');
  const spentBlock = blockFor(
    '.fabricate-manager .manager-knowledge-copy-row.is-spent .manager-knowledge-copy-name'
  );

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px 250px minmax(0, 1fr);'),
    'the knowledge route re-templates the body as rail, roster, detail'
  );
  assert.ok(
    collapsedBlock.includes('grid-template-columns: 56px 250px minmax(0, 1fr);'),
    'the collapsed rail keeps the roster and detail columns'
  );
  assert.ok(
    mainBlock.includes('display: contents;'),
    "the view's own main must not become a fourth grid item"
  );
  // The 832-1000px band is the real hazard: three columns still hold while the
  // detail pane is at its narrowest, so the action cluster has to wrap.
  assert.ok(rowBlock.includes('flex-wrap: wrap;'), 'rows wrap rather than clip');
  assert.ok(copyColumnBlock.includes('min-width: 0;'), 'the copy column may shrink');
  assert.ok(
    factBlock.includes('width: auto;'),
    '.manager-fact is authored width:100% for grids and must hug content in this flex cluster'
  );
  // A spent row is muted by COLOUR on its name, never by a group `opacity`: a group
  // dim composites the chips — the row's only status signal — below the 4.5:1 floor
  // their 10px text needs, in six of the seven themes. And `.manager-button:disabled`
  // already carries opacity 0.62, so a row-level dim would take the disabled Expend
  // button to about 0.38.
  assert.ok(
    spentBlock.includes('color: var(--fab-text-muted);'),
    'the spent row is muted by colour on its name'
  );
  assert.equal(
    spentBlock.includes('opacity'),
    false,
    'the spent state must not use a group opacity'
  );
  for (const forbidden of [
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-row-actions',
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-copy-identity',
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-copy-chips',
  ]) {
    assert.equal(css.includes(forbidden), false, `the spent mute must not reach ${forbidden}`);
  }
  assert.ok(
    css.includes(
      '  .fabricate-manager[data-manager-view="knowledge"] .manager-body,\n  .fabricate-manager[data-manager-view="knowledge"] .manager-body.is-rail-collapsed {'
    ),
    'the knowledge surface collapses to one column in the 831px container query'
  );
});

// Every Knowledge rule that an existing rule already expressed is authored ONCE, as a
// joined selector list. A byte-identical second block is what the maintainer's
// "do not duplicate CSS for minor variations" instruction rules out, and it is also
// what SonarCloud's duplication gate reads.
test('the Knowledge surface joins the rules it shares instead of restating them', () => {
  const occurrences = (needle) => css.split(needle).length - 1;

  for (const [shared, ruleOpener, expected] of [
    [
      '.fabricate-manager .manager-tool-edit-main,\n.fabricate-manager .manager-knowledge-main {',
      '.manager-knowledge-main {',
      1,
    ],
    // The compact chip scale used to be a fourth entry here — an opt-in join listing the
    // Tools library and the two Knowledge row containers. Issue 883 made the compact scale
    // the ONLY scale, owned by `Chip.svelte`, so there is no join left to assert; its
    // absence is checked by the chip's own contract test instead.
    [
      // The Tool Studio editor's Back/Delete/Save cluster is canonical for action-button
      // scale; the Knowledge row actions and reset cluster join it rather than restating
      // min-height/padding/font-size.
      '.fabricate-manager .manager-tool-edit-actions .manager-button,\n' +
        '.fabricate-manager .manager-knowledge-row-actions .manager-button,\n' +
        '.fabricate-manager .manager-knowledge-reset-actions .manager-button {',
      '.manager-knowledge-reset-actions .manager-button {',
      1,
    ],
    [
      '.fabricate-manager .manager-access-roster .manager-search,\n.fabricate-manager .manager-knowledge-roster .manager-search {',
      // The class the markup used to carry solely to re-derive the Access roster's
      // rule; it is gone from both the stylesheet and the component.
      '.manager-knowledge-roster-search',
      0,
    ],
  ]) {
    assert.ok(css.includes(shared), `expected the joined rule ${shared}`);
    assert.equal(
      occurrences(ruleOpener),
      expected,
      `${ruleOpener} should appear ${expected} time(s) — a second block is a restatement`
    );
  }

  // Class names that carry no CSS and no consumer: each sat beside a `data-knowledge-*`
  // attribute already doing the hook job.
  //
  // The second block (issue 785) is the bespoke no-state and standing-statement classes the
  // shared `EmptyState` / `Callout` primitives replaced. Each was a per-screen re-derivation
  // of one meaning — a dashed panel, an icon tile, or a bare "nothing here" sentence — and
  // leaving any of them in the sheet is how the next copy gets written against it.
  const retired = [
    'manager-knowledge-quantity-chip',
    'manager-knowledge-type-pill',
    'manager-knowledge-uses-chip',
    'manager-knowledge-inert-chip',
    'manager-knowledge-match-chip',
    'manager-knowledge-category-pill',
    'manager-knowledge-expend',
    // Central no-state panels that were hand-rolled beside the primitive.
    'manager-recipe-empty-filtered',
    'manager-component-empty-filtered',
    'manager-recipe-section-empty',
    'manager-vocabulary-empty-icon',
    'manager-vocabulary-noresults',
    // Bare inline "nothing here" sentences with their own bespoke class.
    'manager-travel-empty-hint',
    'manager-environment-comp-empty',
    'manager-character-modifier-empty',
    'manager-character-modifier-row-empty',
    'manager-condition-modifier-row-empty',
    'manager-recipe-item-prereq-empty',
    'manager-travel-map-links-empty',
    'manager-travel-realms-empty',
    'manager-travel-parties-empty',
    'manager-recipe-tools-empty',
    'manager-recipe-tags-empty',
    // The per-screen re-size of the shared warning band.
    'manager-knowledge-learned-band',
    // The Knowledge page-header roll-up pill: every other browser surface reports its
    // count in the nav-rail badge, so a header pill was a one-screen divergence.
    'manager-knowledge-header-pills',
    // The reserved row's inline explanatory sentence: ellipsised to fit one line it
    // truncated to "Built…", so it became the row's tooltip instead (issue 878).
    'manager-vocabulary-locked-hint',
    // The third block (issue 772): classes retired by extracting three shared primitives
    // and CONVERTING the duplicates that would otherwise have sat beside them. A primitive
    // whose duplicate survives has added a variant rather than removed one, so each of
    // these names is the proof that the conversion actually happened.
    //
    // The Tool Studio checklist row's hand-rolled check box, now `SelectionCheckbox`.
    'manager-checklist-card-check',
    // The fourth block (issue 1373, round 5): the Tool Studio's checklist ROW itself, with its
    // icon and copy cells. `proto:4741` states the reference's prerequisite row identically to
    // `proto:4752`'s bonus row, so the maintainer ruled the prerequisite list onto the SAME
    // `ModifierLibraryRow` the bonus list already draws — and `ChecklistCardRow.svelte`, whose
    // only caller that list was, went with it. The names are ratcheted for the reason the third
    // block records: a retired row left in the sheet is a fourth row waiting to be copied.
    'manager-checklist-card-row',
    'manager-checklist-card-icon',
    'manager-checklist-card-copy',
    // And the hand-rolled box it used before issue 772, dead in the sheet ever since.
    'manager-tool-prerequisite-check',
    // The component editor's hand-rolled tag pill, now `Chip tone="tag"`.
    //
    // The CONTAINER is retired with it, and that is not tidiness: this assertion is a bare
    // `css.includes(dead)` substring test, and `manager-component-tag-toggles` (plural)
    // CONTAINS `manager-component-tag-toggle`. Left in the sheet as layout context under
    // the "layout stays global" rule, it would have kept the singular entry below true
    // forever and made this ratchet impossible to satisfy. The surviving run is
    // `manager-component-tag-run`.
    'manager-component-tag-toggles',
    'manager-component-tag-toggle',
    // The component editor's hand-rolled −/input/+ essence row, now the shared `Stepper`
    // inside `EssenceQuantityCard`. The card's own appearance classes are deliberately NOT
    // here: they MOVED into that component's scoped block rather than dying, so they are
    // absent from the sheet for a different reason and are still rendered.
    'manager-component-essence-stepper',
    'manager-component-essence-quantity',
  ];
  for (const dead of retired) {
    assert.equal(css.includes(dead), false, `${dead} carries no CSS and should not exist`);
  }

  // And they must be gone from the MARKUP too, not merely unstyled: an unconverted site is
  // what makes a primitive a fourth way of doing the same thing.
  const managerComponents = readdirSync(managerComponentDir, {
    recursive: true,
    withFileTypes: true,
  })
    // The primitives themselves are the ONE place the contract markup may be written.
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.svelte') &&
        entry.name !== 'EmptyState.svelte' &&
        entry.name !== 'Callout.svelte'
    )
    // COMMENTS ARE NOT MARKUP. This half asks whether a retired class is still RENDERED;
    // a component that documents why it stopped rendering one is the opposite of the
    // failure, and several already do. Stripping the two block-comment forms — Svelte's
    // `<!-- -->` doc block and the `/* */` used inside `<script>` — is what lets the list
    // below be the ratchet's own list rather than a hardcoded pair (issue 772).
    .map((entry) =>
      readFileSync(resolve(entry.parentPath, entry.name), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
    )
    .join('\n');
  // The markup half used to walk a HARDCODED two-string list, which made it vacuous for
  // every name added to the ratchet after it was written: a retired class could be deleted
  // from the sheet and left rendering in a component, and both halves would still pass. It
  // walks the SAME list now, so retiring a name is one edit and both halves bite.
  for (const dead of [...retired, 'class="manager-empty', 'manager-recipe-section-empty"']) {
    assert.equal(
      managerComponents.includes(dead),
      false,
      `${dead} should render through the shared primitive, not hand-rolled markup`
    );
  }
});

// Issue 883: eight manager browser rows and value cards each declared their own edge,
// corner and fill, and had already drifted to three corner radii (8px, 9px, 10px) and two
// fills. The Tool Studio's row is canonical, and every other surface JOINS it.
//
// This guard is deliberately two-sided. Asserting the joined rule exists proves the shared
// treatment is authored; asserting each row block no longer carries the properties proves
// no surface kept a private copy, which is the failure mode a one-sided check misses.
test('every manager browser row joins ONE edge, corner and fill treatment', () => {
  const occurrences = (needle) => css.split(needle).length - 1;

  const ROWS = [
    // The canonical row, and the value card issue 883 names as the furthest drifted.
    '.manager-tools-row',
    '.manager-vocabulary-card',
    '.manager-system-row',
    '.manager-recipe-row',
    '.manager-component-row',
    '.manager-environment-row',
    '.manager-gathering-task-row',
    '.manager-gathering-event-row',
    // Not in issue 883's list, but it shared the geometry group with the environment and
    // gathering-task rows: converting those two and leaving it behind would have made it
    // the one surviving per-surface copy of the very treatment being unified.
    '.manager-essence-row',
  ];

  const shared = `${ROWS.map((row) => `.fabricate-manager ${row}`).join(',\n')} {`;
  // Counted on the WHOLE selector list, not on its last selector. The Knowledge guard
  // above can anchor on its last selector because that one is unique; every row class
  // here legitimately opens other blocks too (a grid template, a responsive override),
  // so only the full list identifies this rule.
  assert.equal(
    occurrences(shared),
    1,
    'the browser-row treatment should be authored exactly once, as one join'
  );

  const treatment = blockIn(css, shared.slice(0, -2));
  for (const declaration of [
    'border: 1px solid var(--fab-border);',
    'border-radius: 8px;',
    'background: var(--fab-overlay-light-03);',
  ]) {
    assert.ok(treatment.includes(declaration), `the shared row treatment declares ${declaration}`);
  }

  // No surface restates it, in ANY of its blocks — a private copy hiding in a later
  // override is exactly what a first-match-only check would miss. The retired values were
  // `border-radius: 9px` (recipe, component), `border-radius: 10px` (the vocabulary card)
  // and a solid `--fab-bg-3` fill on six of the nine.
  for (const row of ROWS) {
    const escaped = row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blocks = [
      ...css.matchAll(new RegExp(`\\.fabricate-manager ${escaped}\\s*\\{[\\s\\S]*?\\}`, 'g')),
    ].map(([block]) => block);
    for (const block of blocks) {
      // The shared rule itself matches here, starting at whichever of its selectors this
      // is, so every such match is a SUFFIX of the treatment block rather than equal to
      // it. Skipping on containment covers both, and a genuine restatement can only be
      // skipped by being byte-identical to a suffix of the shared rule — i.e. by being it.
      if (treatment.includes(block)) continue;
      assert.equal(
        /border-radius:|border: 1px solid|background: var\(--fab-bg-3\);/.test(block),
        false,
        `${row} must not restate the shared browser-row treatment:\n${block}`
      );
    }
  }

  // The selected Tool Studio row moved the EDGE only. It used to repaint the identical
  // fill, which is the same statement made twice.
  assert.equal(
    blockFor('.fabricate-manager .manager-tools-row.is-selected').includes('background:'),
    false,
    'selection changes the edge, not the fill it already shares'
  );
});

// Issue 883: the chip had two scales. The base `.manager-chip` rule in the global sheet was
// 24px/`0.75rem`/700, and the Tool Studio and Knowledge surfaces opted OUT of it through a
// three-selector join restating a compact 20px/`0.62rem`/1 scale — so chips out-sized the
// Tool Studio's everywhere else, and fixing a screen meant lengthening that join.
//
// `Chip.svelte` is the one implementation and the compact scale is simply what a chip is.
test('the shared chip owns ONE scale, and no surface can opt into a second', () => {
  const chipBlock = blockIn(chipStyles, '.manager-chip');

  for (const declaration of [
    'min-height: 20px;',
    // Vertical padding is REAL, not min-height slack. At `padding: 0` the space above and
    // below a single line was only the gap between the 20px min-height and a 9.92px line
    // box; a wrapped label spent it and sat flush against the border. 4px keeps a
    // single-line chip at 17.92px — under the min-height, so unchanged — while a wrapped
    // one keeps its padding (issue 883).
    'padding: var(--fab-space-1) var(--fab-space-chip);',
    'font-size: 0.62rem;',
    'line-height: 1;',
  ]) {
    assert.ok(chipBlock.includes(declaration), `the chip declares the compact ${declaration}`);
  }

  // 10px is the SAME as 999px at the 20px single-line height (999px clamps to half the
  // shorter side), so a normal chip is unchanged; they diverge only once a chip wraps,
  // where a stadium around two lines reads as broken. The pill returns for `truncate`,
  // which is single-line by construction.
  assert.ok(
    chipBlock.includes('border-radius: 10px;'),
    'the chip radius must follow a wrap rather than drawing a stadium around two lines'
  );
  assert.ok(
    blockIn(chipStyles, '.manager-chip.is-truncated').includes('border-radius: 999px;'),
    'a truncated chip is single-line, so it keeps the pill'
  );

  // The opt-in join is gone from the global sheet, not merely unused: a surviving rule is
  // what the next screen gets added to.
  assert.equal(
    css.includes('.manager-tools-library-chips .manager-chip'),
    false,
    'the opt-in compact-scale join must not survive'
  );
  assert.equal(
    css.includes('.manager-tool-inspector-hero .manager-chip'),
    false,
    'the Tool inspector hero must not keep its own copy of the compact scale'
  );

  // Tone is COLOUR only. A tone that resized would rebuild the very drift the primitive
  // removes, so no tone rule may carry a size property.
  for (const tone of ['is-active', 'is-warning', 'is-info', 'is-danger', 'is-neutral']) {
    const toneBlock = blockIn(chipStyles, `.manager-chip.${tone}`);
    assert.equal(
      /min-height:|padding:|font-size:|line-height:/.test(toneBlock),
      false,
      `${tone} must change colour only, never the chip's size`
    );
  }

  // Any global rule that still needs to beat a chip declaration must be written at three
  // classes or more. At two it TIES with the scoped `.manager-chip.svelte-<hash>` block and
  // loses on source order, because `css: 'injected'` puts component CSS after the sheet —
  // a silent regression no mounted test can see. The tab badge is the live case: it is
  // deliberately SMALLER than a chip (18px/0.56rem) and would otherwise grow back.
  assert.ok(
    css.includes('.fabricate-manager .manager-chip.manager-editor-tab-badge {'),
    'the smaller tab badge must outrank the chip block on specificity, not source order'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-editor-tab-badge {'),
    false,
    'the two-class form would tie with the scoped chip block and lose'
  );
});

// A staged conversion needs a ratchet, or it stalls half-done and the primitive becomes a
// fourth variant. This pinned the EXACT set of files still rendering a chip by hand: a new
// hand-rolled site failed because the file was not on the list, and a converted one failed
// because a listed file no longer matched. Both directions are what made it a ratchet
// rather than a fading reminder — the list could only shrink, and it had to reach empty.
//
// It IS empty: every manager chip renders through `Chip.svelte`, and the global base rule
// and its eight tone rules are gone from the sheet, so a hand-rolled `manager-chip` would
// now render unstyled as well as failing here. The test STAYS at empty — that is what it
// is for. It is the assertion that stops the next screen from starting the drift again.
test('every remaining hand-rolled chip site is declared, so the migration can only shrink', () => {
  const UNCONVERTED = [];

  const remaining = readdirSync(managerComponentDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
    .map((entry) => ({
      path: resolve(entry.parentPath, entry.name),
      // POSIX, relative to the manager directory, so the list reads the same on every OS.
      name: relative(managerComponentDir, resolve(entry.parentPath, entry.name)).replaceAll(
        '\\',
        '/'
      ),
    }))
    // `Chip.svelte` IS the contract markup and is the one place it may be written.
    .filter(({ name }) => name !== 'Chip.svelte')
    // Matched anywhere in the file, not just in a `class=` attribute: one site passes the
    // chip classes to another component as a STRING prop (`RecipeIngredientGroupCard`'s
    // `triggerClass`), and an attribute-shaped check silently missed it. `manager-chip-row`
    // and `manager-chip-field` are CONTAINERS, not chips, so the token must not match those
    // or the ratchet could never reach empty.
    .filter(({ path }) => /\bmanager-chip\b(?!-)/.test(readFileSync(path, 'utf8')))
    .map(({ name }) => name)
    .sort();

  assert.deepEqual(
    remaining,
    [...UNCONVERTED].sort(),
    'the hand-rolled chip list may only shrink: convert the file and delete its entry'
  );
});

test('the armed danger button paints a solid danger fill with its own readable foreground', () => {
  const armedBlock = blockFor('.fabricate-manager .manager-button.is-danger.is-armed');
  const rosterRowBlock = blockFor('.fabricate-manager .manager-knowledge-roster-row');
  const rosterFocusBlock = blockFor(
    '.fabricate-manager .manager-knowledge-roster-row:focus-visible'
  );

  assert.ok(armedBlock.includes('background: var(--fab-danger);'), 'armed uses the danger fill');
  assert.ok(armedBlock.includes('border-color: var(--fab-danger);'), 'armed uses the danger edge');
  assert.ok(
    armedBlock.includes('color: var(--fab-on-danger);'),
    'armed text uses the dedicated on-danger token, not on-accent or danger-text'
  );

  // Without the reset, the host's fixed global button height crops the roster
  // portrait — a defect no mounted test can see, because it does not compute the
  // host cascade. Modelled on `.manager-tools-select-target`.
  for (const declaration of [
    'appearance: none;',
    'height: auto;',
    'min-height: 52px;',
    'justify-content: flex-start;',
  ]) {
    assert.ok(
      rosterRowBlock.includes(declaration),
      `the roster row should reset ${declaration} like the tools select target`
    );
  }
  assert.ok(
    rosterFocusBlock.includes('outline: 2px solid var(--fab-accent);'),
    'the roster row owns its keyboard focus ring'
  );
});

// The one Knowledge hazard source text cannot prove: at 832-1000px three columns
// still hold while the detail pane is at its narrowest, so a non-wrapping row clips
// its action cluster with no scrollbar. Measured, not asserted from CSS text.
async function readRenderedKnowledgeGeometry(width) {
  const context = await sharedBrowser.newContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // Mirrors the shipped two-line rhythm: name + type (+ quantity) on line 1, the
    // whole state vocabulary as chips on line 2.
    const row = `<li class="manager-knowledge-copy-row"><span class="manager-knowledge-copy-identity"><span class="manager-knowledge-copy-copy"><span class="manager-knowledge-copy-heading"><strong class="manager-knowledge-copy-name">An Exceptionally Long Localized Recipe Item Name</strong><span class="manager-chip">4 Recipe Book</span><span class="manager-chip">×3</span></span><span class="manager-knowledge-copy-chips"><span class="manager-chip is-warning">2 of 5 uses spent</span><span class="manager-chip is-danger">Inert</span></span></span></span><span class="manager-knowledge-row-actions"><button class="manager-button fab-manager-button">Expend use</button><button class="manager-button is-danger">Delete</button></span></li>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div style="width:${width}px;height:686px"><div class="fabricate-manager" data-manager-view="knowledge"><div class="manager-body"><aside class="manager-rail">Rail</aside><main class="manager-main manager-knowledge-main" data-knowledge-view><section class="manager-knowledge-roster"><label class="manager-search"><input type="search"></label><div class="manager-knowledge-roster-scroll"><div class="manager-knowledge-roster-list"><button class="manager-knowledge-roster-row"><span class="fab-medallion" style="width:34px;height:34px"></span><span class="manager-knowledge-roster-copy"><strong class="manager-knowledge-roster-name">Aria Thorn</strong><small class="manager-knowledge-roster-meta">2 item(s) · 3 learned</small></span></button></div></div></section><section class="manager-knowledge-detail"><header class="manager-knowledge-detail-header"><div class="manager-knowledge-detail-identity"><div class="manager-knowledge-detail-copy"><h2 class="manager-knowledge-detail-name">Aria Thorn</h2></div></div><div class="manager-knowledge-fact-cluster"><div class="manager-fact"><span class="manager-fact-line"><strong>2</strong> <span class="manager-fact-label">Recipe items</span></span></div><div class="manager-fact"><span class="manager-fact-line"><strong>3</strong> <span class="manager-fact-label">Learned recipes</span></span></div></div><div class="manager-knowledge-reset-actions"><button class="manager-button fab-manager-button is-danger">Reset this system</button><button class="manager-button fab-manager-button is-danger">Reset all systems</button></div></header><div class="manager-editor-tabs manager-knowledge-tabs"><button class="manager-editor-tab-button is-active">Recipe items</button><button class="manager-editor-tab-button">Learned recipes</button></div><section class="manager-editor-tab-panel manager-knowledge-panel"><div class="manager-knowledge-tab-body"><ul class="manager-knowledge-row-list">${row}</ul></div></section></section></main></div></div></div>`
      )
    );
    return await page.evaluate(() => {
      const box = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value ? { left: value.left, right: value.right, width: value.width } : null;
      };
      const root = document.querySelector('.fabricate-manager');
      const rowNode = document.querySelector('.manager-knowledge-copy-row');
      return {
        rail: box('.manager-rail'),
        roster: box('.manager-knowledge-roster'),
        detail: box('.manager-knowledge-detail'),
        row: box('.manager-knowledge-copy-row'),
        actions: box('.manager-knowledge-row-actions'),
        inspectorPresent: Boolean(document.querySelector('.manager-inspector')),
        rowOverflow: rowNode.scrollWidth > rowNode.clientWidth + 1,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
  } finally {
    await context.close();
  }
}

test('Knowledge keeps a rail/roster/detail triptych with unclipped row actions from 1000px to 832px', async () => {
  for (const width of [1212, 1000, 880, 832]) {
    const report = await readRenderedKnowledgeGeometry(width);
    assert.equal(Math.round(report.rail.width), 220, `${width}px rail column`);
    assert.equal(Math.round(report.roster.width), 250, `${width}px roster column`);
    assert.ok(report.roster.left >= report.rail.right - 1, `${width}px roster follows the rail`);
    assert.ok(
      report.detail.left >= report.roster.right - 1,
      `${width}px detail follows the roster`
    );
    assert.equal(report.inspectorPresent, false, `${width}px no fourth inspector column`);
    assert.ok(
      report.actions.right <= report.row.right + 1,
      `${width}px row actions stay inside the row`
    );
    assert.equal(report.rowOverflow, false, `${width}px row does not overflow`);
    assert.equal(report.overflow, false, `${width}px surface does not overflow`);
  }
});

// ── EVERY DECLARATION ON THE TAG CHIP'S RULE ACTUALLY WINS (issue 1373) ────────────────────
//
// Regression it started as: chips WERE `<li>`s in a `<ul>` on a second line, and a host
// (Foundry) global list rule giving non-last items a margin-bottom inflated only the first
// chip's box — 34px against the last chip's 30px. Maintainer round 5 moved the chips onto the
// ROW itself (`proto:2254`), so they are `<span>`s and that particular host rule can no longer
// reach them. The hostile `li` rule stays in the fixture as the negative half: it must reach
// nothing.
//
// == WHY THE OLD FIXTURE COULD NOT FAIL, AND WHAT REPAIRED IT ==============================
// It injected `styles/fabricate.css` UNLAYERED and stamped no scoping hash on its chips, which
// is a cascade production has never had. `module.json` registers the sheet with no explicit
// `layer`, so Foundry imports it at `layer(modules)`; `Chip.svelte` ships `css: 'injected'`,
// which lands its block in `document.head` unlayered — and an unlayered author declaration
// beats every layered one at ANY specificity. Unlayered, the sheet's three-class rule won
// everything it declared and the fixture measured a chip nobody renders; layered, four of that
// rule's eight declarations were being discarded in the product with nothing able to say so.
//
// Both halves are needed and both are here now: `@layer modules { … }` around the sheet
// reproduces Foundry's import, `chipCss` after it reproduces the injection order, and
// `withChipHash` stamps the real `svelte-<hash>` so the specificity matches too. Svelte 5 puts
// that hash on the LEADING compound as a real class, which is what makes the primitive's block
// (0,2,0) rather than (0,1,0).
//
// == WHAT IT ASSERTS, AND WHY THAT CANNOT GO VACUOUS =======================================
// Not a hand-listed set of values: it reads the sheet rule's OWN declarations and requires each
// one to win in the composed cascade. A value is compared against a probe carrying that exact
// declaration inline, so `var(--fab-space-chip)` and `4.5rem` resolve the same way for both
// sides and no token is frozen into this file. Add a fifth declaration the primitive already
// owns and this goes red naming the property; delete the rule and the loop reads zero
// declarations, so an explicit floor refuses that too.
test('every declaration on the recipe tag chip rule wins the real cascade', async () => {
  const selector = '.fabricate-manager .manager-chip.manager-recipe-tag-chip {';
  const ruleStart = css.indexOf(selector);
  assert.ok(ruleStart >= 0, 'the tag chip rule is still in the sheet');
  const body = css.slice(ruleStart + selector.length, css.indexOf('}', ruleStart));
  const declarations = body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colon = declaration.indexOf(':');
      return { property: declaration.slice(0, colon).trim(), value: declaration.slice(colon + 1).trim() };
    });
  assert.ok(
    declarations.length >= 4,
    'the rule still states the position and size the primitive has no opinion about'
  );

  const context = await sharedBrowser.newContext({
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
            @layer modules {
              ${css}
            }
          </style>
          <style>
            ${chipCss}
          </style>
          <style>
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            /* Simulate a host global list rhythm declared after our stylesheet. */
            li:not(:last-child) { margin-bottom: 4px; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <span class="manager-recipe-option-tags" data-recipe-option-tags>
              <span class="manager-recipe-tag-policy" data-recipe-tag-policy>Any of</span>
              ${withChipHash(
                '<span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="reagent"><span>reagent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>' +
                  '<span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="rare"><span>rare</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>'
              )}
            </span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate((wanted) => {
      const chips = Array.from(document.querySelectorAll('.manager-recipe-tag-chip'));
      const chip = chips[0];
      // The probe is a CLONE of the chip carrying one declaration inline, so both sides resolve
      // the same tokens in the same place and the comparison is of used values, not of strings.
      const declared = wanted.map(({ property, value }) => {
        const probe = chip.cloneNode(true);
        probe.style.setProperty(property, value);
        chip.parentElement.appendChild(probe);
        const won = getComputedStyle(chip).getPropertyValue(property);
        const asked = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return { property, won, asked };
      });
      return {
        declared,
        chips: chips.map((each) => {
          const style = getComputedStyle(each);
          return {
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
            height: each.getBoundingClientRect().height,
          };
        }),
      };
    }, declarations);

    for (const { property, won, asked } of report.declared) {
      // A property Chromium cannot serialise would compare '' against '' and pass over an empty
      // domain, which is the failure mode a cascade gate is most likely to acquire silently.
      assert.notEqual(asked, '', `\`${property}\` resolves to a comparable used value`);
      assert.equal(
        won,
        asked,
        `the sheet declares \`${property}\` on the tag chip and it must WIN — the primitive's ` +
          'unlayered block discards a layered declaration of any specificity, so a property ' +
          'this rule and `Chip.svelte` both name is a rule that reads as covered and is not'
      );
    }

    assert.equal(report.chips.length, 2, 'both tag chips should render');
    for (const [index, chip] of report.chips.entries()) {
      assert.equal(
        chip.marginBottom,
        '0px',
        `chip ${index} should have no bottom margin despite the host list rule`
      );
      assert.equal(chip.marginTop, '0px', `chip ${index} should have no top margin`);
    }
    assert.equal(
      report.chips[0].height,
      report.chips[1].height,
      'both chips should derive the same height'
    );
  } finally {
    await context.close();
  }
});

test('the tag requirement row keeps its arm whole, and an EMPTY one is a row like any other', async () => {
  // REPLACES `recipe tag list spans the full row width on its own line below the controls`
  // (issue 1373, maintainer round 5). That test pinned the shape the design names as the
  // defect: `.manager-recipe-option-tags-detail` carried `flex: 1 1 100%`, so the tag arm
  // ALWAYS wrapped to a second full-width line whatever the row's width was, taking the match
  // toggle, an `Add tag` dropdown and a bordered `No tags set` box with it.
  //
  // `proto:2252`-`2268` draws `[Tag v] Any of [chips] [+ Tag] ... [Any of|All of] [- 1 +] [x]`.
  // The claim is geometric and this is where it can be made: nothing else in the corpus
  // computes a real cascade, and the mounted suites cannot see a wrap at all.
  //
  // == WHAT THIS GUARD COULD NOT SEE, TWICE (round 7) ======================================
  // Round 6 widened it to two widths after finding the fixture was missing the `or...` chip,
  // the divider and the real `Stepper` - most of a hundred pixels. It was still green through
  // the defect the maintainer reported next, and the reason is not the width list:
  //
  //   1. It only ever rendered a POPULATED arm. Two chips make the arm the widest flexible
  //      item in the row, so it is never the item the row squeezes, and "the arm is one line"
  //      was TRUE throughout. The row a GM meets the instant they press `Add tag` - the policy
  //      word and `+ Tag`, nothing between them - was never measured.
  //   2. It asserted nothing about the ROW at all. The maintainer's report is that an empty tag
  //      row stands at 96px where every sibling requirement row stands at 46, and an arm can be
  //      perfectly whole inside a row that has grown a second line underneath it.
  //   3. It rendered no sibling row, so it had nothing to be wrong AGAINST. A pinned constant
  //      would not have helped: the number it encodes is every control height in the row at once.
  //
  // So the fixture now renders a COMPONENT row beside the two tag rows and the empty tag row is
  // asserted against ITS height, and the `+ Tag` pill is wrapped in the `div.fabricate-picker`
  // namespace root `SearchablePopover` actually renders it inside
  // (`SearchablePopover.svelte:476`) rather than dropped bare into the arm - a flex item the
  // shipped tree has and the old fixture did not.
  //
  // WHAT IS ASSERTED IS NOT "one line" AT BOTH WIDTHS. At the narrow width `Any of` + two chips
  // + `+ Tag` + the segments + the stepper + `or...` + `x` do not fit on one line and no CSS
  // can make them; the design's own frame is the wide one. What must hold is that the tag ARM
  // stays whole - one line, with its policy word, its chips and its `+ Tag` together - so the
  // row degrades by moving a WHOLE control down rather than by shredding the arm; and that an
  // EMPTY tag row, which asks for less room than a named component row does, is no taller.
  const stepperScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
  );
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/SegmentedControl.svelte')
  );
  const stamp = (markup) =>
    [
      ['manager-chip', chipScoped.hashClass],
      ['fab-stepper', stepperScoped.hashClass],
      ['fab-stepper-input', stepperScoped.hashClass],
      ['fab-stepper-adjunct', stepperScoped.hashClass],
      ['manager-segmented', segmentedScoped.hashClass],
      ['manager-segment', segmentedScoped.hashClass],
      ['manager-segment-input', segmentedScoped.hashClass],
      ['manager-segment-label', segmentedScoped.hashClass],
    ].reduce((html, [className, hash]) => withScopeHash(html, className, hash), markup);

  // The trailing cluster is identical on every requirement row whatever its kind, so it is
  // written once: a second copy would be the very thing the two rows are supposed to share.
  const controls = `
      <div class="manager-recipe-option-controls">
        <div class="fab-stepper">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
          <input type="number" class="fab-stepper-input manager-recipe-option-quantity" value="2">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
        </div>
        <span class="manager-recipe-option-divider"></span>
        <div class="fabricate-picker manager-travel-picker manager-recipe-or-picker"><button type="button" class="manager-recipe-or-trigger"><i class="fa-solid fa-code-branch"></i><span class="manager-travel-picker-value">or…</span></button></div>
        <button type="button" class="manager-recipe-option-remove"><i class="fas fa-xmark"></i></button>
      </div>`;

  const tagChips = `
        <span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="abrasive"><span>abrasive</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>
        <span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="hide"><span>hide</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>`;

  // The row exactly as `RecipeIngredientOption` renders a tag requirement: the plate, the kind
  // select, the tag arm, the Any of / All of segments and the trailing control cluster.
  const tagRow = (caseName, chips) =>
    stamp(`
    <div class="manager-recipe-ingredient-option-row is-tag" data-recipe-option data-case="${caseName}">
      <span class="manager-recipe-option-lead is-tag"><i class="fas fa-tag"></i></span>
      <select class="manager-recipe-option-kind" data-recipe-option-kind>
        <option value="tags" selected>Tag</option>
      </select>
      <span class="manager-recipe-option-tags" data-recipe-option-tags>
        <span class="manager-recipe-tag-policy" data-recipe-tag-policy>Any of</span>${chips}
        <div class="fabricate-picker manager-travel-picker manager-recipe-tag-picker">
          <button type="button" class="manager-recipe-tag-trigger" data-recipe-add-tag><i class="fa-solid fa-plus"></i><span class="manager-travel-picker-value">Tag</span></button>
        </div>
      </span>
      <div class="manager-segmented is-tag" role="radiogroup" aria-label="Tag match">
        <label class="manager-segment is-active"><input type="radio" class="manager-segment-input" name="tag-match-1" checked><span class="manager-segment-label">Any of</span></label>
        <label class="manager-segment"><input type="radio" class="manager-segment-input" name="tag-match-1"><span class="manager-segment-label">All of</span></label>
      </div>${controls}
    </div>`);

  // The reference: a NAMED component requirement, the commonest row on either surface.
  const componentRow = stamp(`
    <div class="manager-recipe-ingredient-option-row is-component" data-recipe-option data-case="component">
      <span class="manager-recipe-option-lead is-component"><i class="fas fa-cube"></i></span>
      <select class="manager-recipe-option-kind" data-recipe-option-kind>
        <option value="component" selected>Component</option>
      </select>
      <span class="manager-recipe-option-name-field">
        <span class="manager-recipe-option-chosen" data-recipe-option-chosen><i class="fas fa-cube manager-recipe-option-mark is-component"></i><span class="manager-recipe-option-chosen-name">Iron Ingot</span><button type="button" class="manager-recipe-option-clear"><i class="fa-solid fa-xmark"></i></button></span>
      </span>${controls}
    </div>`);

  // `manager-recipe-edit-ingredients-cost` photographs the first; `world-tool-entry-on-break-repair`
  // and `manager-tool-stress-repair` photograph the second, and it is the one that broke.
  //
  // The third and fourth are neither, and they do NOT claim row parity. Below about 560px the
  // row's five controls do not fit on one line and no CSS makes them; what those two are here
  // to hold is the OTHER half of the report — that however hard the row is squeezed, the arm's
  // answer is a WHOLE control moving down and never the policy word parting from `+ Tag`.
  //
  // THE FOURTH RAISES THE ROOT FONT rather than narrowing the column, because that is the axis
  // the two halves of this row disagree on: the sheet sizes the policy word and the `+ Tag`
  // pill in `rem`, so Foundry's interface font-size setting widens them, while
  // `.manager-recipe-option-kind` states a 132px WIDTH and does not move. A guard that only
  // ever renders at 16px cannot see a row that only fails on a GM's own font setting, and the
  // reported stack was never reproduced at 16px at any width.
  for (const surface of [
    { label: 'the recipe tab', width: 1006, rootFontSize: 16, rowParity: true },
    { label: 'a Tool inspector', width: 622, rootFontSize: 16, rowParity: true },
    { label: 'a squeezed inspector', width: 430, rootFontSize: 16, rowParity: false },
    {
      label: 'a Tool inspector at a raised interface font',
      width: 622,
      rootFontSize: 20,
      rowParity: false,
    },
  ]) {
    const context = await sharedBrowser.newContext({
      viewport: { width: surface.width + 60, height: 500 },
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
              ${chipCss}
              ${stepperScoped.css}
              ${segmentedScoped.css}
              html { font-size: ${surface.rootFontSize}px; }
              body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
              .harness-row-width { width: ${surface.width}px; }
              .fas::before, .fa-solid::before { content: "x"; }
            </style>
          </head>
          <body>
            <main class="fabricate-manager">
              <div class="harness-row-width">
                ${componentRow}
                ${tagRow('populated', tagChips)}
                ${tagRow('empty', '')}
              </div>
            </main>
          </body>
        </html>
      `);

      const report = await page.evaluate(() => {
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, height: rect.height, width: rect.width };
        };
        const read = (caseName) => {
          const row = document.querySelector(`[data-case="${caseName}"]`);
          const arm = row.querySelector('[data-recipe-option-tags]');
          return {
            row: box(row),
            arm: arm ? box(arm) : null,
            // Every MEMBER of the arm, so a chip that dropped below its neighbours is visible.
            armMembers: arm ? [...arm.children].map((child) => box(child)) : [],
          };
        };
        return { component: read('component'), populated: read('populated'), empty: read('empty') };
      });

      for (const [caseName, measured] of [
        ['a populated', report.populated],
        ['an empty', report.empty],
      ]) {
        // THE ARM IS ONE LINE. Measured as "the arm is no taller than its tallest member", which
        // is the same claim as "no member wrapped" and survives a rung change on the spacing
        // ladder in a way a pinned pixel height would not.
        const tallest = Math.max(...measured.armMembers.map((member) => member.height));
        assert.ok(
          measured.arm.height <= tallest + 1,
          `${surface.label} (${surface.width}px): ${caseName} tag arm is ONE line - the policy ` +
            `word, the chips and + Tag stay together (arm ${measured.arm.height}px vs tallest ` +
            `member ${tallest}px)`
        );
        for (const [index, member] of measured.armMembers.entries()) {
          assert.ok(
            member.top - measured.arm.top < tallest,
            `${surface.label}: ${caseName} arm's member ${index} wrapped onto a line of its own ` +
              `(top +${member.top - measured.arm.top}px against a ${tallest}px member)`
          );
        }
        assert.ok(
          measured.row.width <= surface.width + 1,
          `${surface.label}: ${caseName} tag row stays inside its column ` +
            `(${measured.row.width} vs ${surface.width})`
        );
      }

      // AN EMPTY TAG ROW IS A ROW LIKE ANY OTHER, at every width the row's controls fit on one
      // line at all. It asks for LESS room than the named component row beside it - a policy
      // word and a dashed pill against an image, a name and a clear button - so there is no
      // such width at which it may stand taller. Against the SIBLING rather than a constant,
      // for the reason the third failure above gives.
      if (!surface.rowParity) continue;
      assert.equal(
        Math.round(report.empty.row.height),
        Math.round(report.component.row.height),
        `${surface.label} (${surface.width}px): an EMPTY tag requirement row is no taller than ` +
          `the component row beside it (${Math.round(report.empty.row.height)}px vs ` +
          `${Math.round(report.component.row.height)}px) - a taller one has either stacked its ` +
          `policy word above + Tag or moved a whole control onto a second line`
      );
    } finally {
      await context.close();
    }
  }
});

test('a suggestion reads from the left edge the typed query does, under the host button rule', async () => {
  // `proto:2280` draws a suggestion as `display:flex; align-items:center; gap:8px; height:30px;
  // padding:0 8px`, then a 12px glyph and a label at `font:500 11px var(--sans)`. There is no
  // centring anywhere in it, and there cannot be: the panel sits directly beneath the field it
  // completes, so a suggestion that does not start where the query starts is not continuing the
  // GM's own typing (issue 1373, maintainer round 7).
  //
  // IT SHIPPED CENTRED, and the sheet looked right. `.manager-recipe-option-suggestion` is a
  // `<button>` declaring `display: flex` and `text-align: left` - and `text-align` positions
  // the CONTENT of a text container, not the ITEMS of a flex one, so it landed on nothing.
  // What placed them was Foundry's own `a.button, button { justify-content: center }`, which
  // our rule left standing because it named no `justify-content` of its own to displace it.
  //
  // So the host rule is in the fixture, exactly as the hostile `li` margin is in the tag-chip
  // guard above. Without it this file loads `styles/fabricate.css` alone, the initial
  // `justify-content: normal` applies, the label sits at the left, and the guard passes over
  // the defect it exists for.
  //
  // AND IT IS IN ITS REAL LAYER, which is the half a specificity comparison cannot answer.
  // `foundry2.css` declares the cascade layers `reset, variables, elements, blocks,
  // applications, compatibility, layouts, system, modules, exceptions` and puts that button
  // rule in `elements.forms`; `module.json` registers `styles/fabricate.css` with no explicit
  // layer, so Foundry imports it at `modules`. The winner is decided by LAYER ORDER before
  // specificity is consulted at all - `modules` sorts after `elements`, so one declaration is
  // enough and no extra class is needed to buy it. Rendering both sheets flat would prove a
  // different cascade from the one that ships, in either direction.
  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 400 },
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
            /* Foundry's own layer order, its own selector and its own declaration, taken
               from the harvested \`foundry-chrome/css/foundry2.css\` the View Lab renders
               against, with our sheet at the \`modules\` layer \`module.json\` gives it. */
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .harness { width: 300px; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness">
              <span class="manager-recipe-option-name-field">
                <span class="manager-recipe-option-search is-typing">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" data-recipe-option-search value="ingot" placeholder="Search components...">
                </span>
                <span class="manager-recipe-option-suggestions">
                  <button type="button" class="manager-recipe-option-suggestion" data-recipe-option-suggestion="sm-iron-ingot">
                    <i class="fas fa-cube manager-recipe-option-mark is-component"></i><span>Iron Ingot</span>
                  </button>
                </span>
              </span>
            </div>
            <!-- The tag picker's own option row (proto:2261), the same shape from the same
                 panel family and therefore exposed to the same host rule. It is here because
                 reading its declaration is not the same as measuring it: the question the
                 sheet cannot answer on its own is which of two declarations the cascade keeps,
                 and this fixture is where that is settled for both rows at once. -->
            <div class="fabricate-picker-popover manager-travel-popover harness">
              <button type="button" class="manager-travel-option" data-popover-option="reagent">
                <i class="fas fa-tag"></i><span class="manager-travel-option-name">reagent</span>
              </button>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const suggestion = document.querySelector('[data-recipe-option-suggestion]');
      const glyph = suggestion.querySelector('i');
      const label = suggestion.querySelector('span');
      const field = document.querySelector('[data-recipe-option-search]');
      const pickerOption = document.querySelector('[data-popover-option]');
      const style = getComputedStyle(suggestion);
      const left = (element) => element.getBoundingClientRect().left;
      return {
        justifyContent: style.justifyContent,
        pickerOptionJustifyContent: getComputedStyle(pickerOption).justifyContent,
        // The offset of the row's FIRST item from its own padding edge. Zero means the glyph
        // starts where the row starts; anything else is slack the row put in front of it.
        glyphIndent:
          left(glyph) - (left(suggestion) + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth)),
        // …and where the LABEL lands against the query it is completing, which is the thing the
        // maintainer actually saw: `ingot` at the field's left edge, `Iron Ingot` mid-panel.
        labelIndent: left(label) - left(field),
        suggestionWidth: suggestion.getBoundingClientRect().width,
        fieldTextAlign: getComputedStyle(field).textAlign,
        fieldFlexBasis: getComputedStyle(field).flexBasis,
        fieldFlexGrow: getComputedStyle(field).flexGrow,
      };
    });

    assert.notEqual(
      report.justifyContent,
      'center',
      'a suggestion row must displace the host button rule rather than inherit its centring'
    );
    // The tag picker's option row already named its own justification and so was never
    // centred; asserted alongside rather than taken on trust, because the two rows sit in
    // sibling panels and the next one written in either place inherits whichever answer is
    // guarded here.
    assert.notEqual(
      report.pickerOptionJustifyContent,
      'center',
      'a tag picker option row displaces the host button rule too'
    );
    assert.ok(
      Math.abs(report.glyphIndent) <= 1,
      `the suggestion's kind glyph starts at the row's own left edge (indent ` +
        `${report.glyphIndent.toFixed(1)}px in a ${report.suggestionWidth.toFixed(1)}px row)`
    );
    // Within a glyph and a gap of the query above it: the panel is inset by its own padding,
    // so the two left edges are near-flush rather than identical, and a centred label is half
    // the panel away.
    assert.ok(
      report.labelIndent < 40,
      `the suggestion label continues the typed query rather than sitting mid-panel ` +
        `(+${report.labelIndent.toFixed(1)}px against the field's own text)`
    );
    // The field itself, measured in the same document rather than read off the sheet:
    // `proto:2276` and premium's `RewardRow` `.search input` both give it `flex: 1; min-width: 0`
    // and no alignment of its own, and this is where a disagreement would show.
    assert.equal(report.fieldTextAlign, 'start', 'the search field itself reads from the left');
    assert.equal(report.fieldFlexGrow, '1', 'the search field absorbs the row slack');
    assert.equal(report.fieldFlexBasis, '0%', 'the search field takes a zero flex base');
  } finally {
    await context.close();
  }
});

test('the picker popover is the design’s panel, field and rows, not a heavy sheet', async () => {
  // THE `+ Tag` PICKER THE MAINTAINER PUT BESIDE THE DESIGN (issue 1373). `proto:2258`-`2263`
  // states the whole panel: a 7px-inset column over `var(--bg0)` with a 10px corner and a 5px
  // gap; a 7px/9px field with a 7px corner edged in `--accent-border` over `var(--bg1)`; a 2px-
  // gapped list carrying its own scroll; and 30px rows at `0 8px` with a 7px corner. Ours drew
  // a 240px sheet on `--fab-bg-3` — the LIGHTEST rung, over a pane painted darker than it — with
  // a 6px corner, an 8px-inset divider-ruled field, an 8px-inset list and 40px rows.
  //
  // ── THE ONE SUBSTITUTION, AND WHY IT IS A JUDGEMENT ──────────────────────────────────────
  // The design's ramp is shifted a rung against ours: its `--bg1` is our `--fab-bg-0` and its
  // `--bg2` our `--fab-bg-1`, so the `--bg0` it paints this panel with sits BELOW our darkest
  // token and has no equivalent. Inventing an eighth rung across seven themes to transcribe one
  // popover would be a token-generation change; the relationship the design is expressing is
  // that the panel is DARKER than the block it floats over, separated by `--border-strong` and
  // a deep shadow. `--fab-bg-0` is the darkest rung we publish and preserves that relationship,
  // so it is what the panel takes. Every theme's ramp runs the same direction — all seven are
  // dark and `--fab-bg-0` is the darkest in each — so no theme inverts the reading.
  //
  // The 7px and 5px insets are not transcribed either: `spacing-scale-ratchet.test.js` bans a
  // new raw literal in `padding`/`margin`/`gap`, so each takes its nearest published step —
  // 7 to `--fab-space-chip` (6) and 5 to `--fab-space-1` (4) — exactly as `EmptyState`'s
  // `is-filtered` variant took the design's 26 to 24.
  //
  // ── MEASURED, NOT READ ───────────────────────────────────────────────────────────────────
  // `styles/fabricate.css` is layered at `modules` and `SearchablePopover`'s own block is
  // UNLAYERED, so a scoped declaration beats a sheet declaration at any specificity. That makes
  // "the sheet says 10px" and "the panel is 10px" different questions, and only the second one
  // is the product. The component's compiled CSS (`css: 'external'`) is appended after the
  // layered sheet and its hash stamped onto the fixture, so a compact-mode rule that grew past
  // its `.is-compact-option-rows` qualifier would be caught here rather than shipping.
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopover.svelte')
  );
  const stamp = (markup) =>
    [
      'manager-travel-popover',
      'manager-travel-popover-search',
      'manager-travel-popover-options',
      'manager-travel-option',
      'manager-travel-option-name',
    ].reduce((html, className) => withScopeHash(html, className, popoverScoped.hashClass), markup);

  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 400 },
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
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            ${popoverScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
            .probe { width: 10px; height: 10px; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${stamp(`
            <div class="fabricate-picker-popover manager-travel-popover" data-probe="panel">
              <div class="manager-travel-popover-search">
                <input type="text" data-probe="field" placeholder="Search tags...">
              </div>
              <div class="manager-travel-popover-options" role="listbox" data-probe="list">
                <button type="button" class="manager-travel-option" data-probe="row">
                  <i class="fas fa-tag"></i><span class="manager-travel-option-name">reagent</span>
                </button>
              </div>
            </div>`)}
            <div class="probe" data-probe="bg0" style="background: var(--fab-bg-0)"></div>
            <div class="probe" data-probe="bg3" style="background: var(--fab-bg-3)"></div>
            <div class="probe" data-probe="accent-edge" style="background: var(--fab-accent-border)"></div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const at = (name) => document.querySelector(`[data-probe="${name}"]`);
      const of = (name) => getComputedStyle(at(name));
      const panel = of('panel');
      const field = of('field');
      const list = of('list');
      const row = of('row');
      return {
        panel: {
          radius: panel.borderTopLeftRadius,
          padding: panel.paddingTop,
          gap: panel.rowGap,
          background: panel.backgroundColor,
        },
        field: {
          radius: field.borderTopLeftRadius,
          height: at('field').getBoundingClientRect().height,
          borderColour: field.borderTopColor,
          background: field.backgroundColor,
        },
        list: { gap: list.rowGap, padding: list.paddingTop, paddingLeft: list.paddingLeft },
        row: {
          radius: row.borderTopLeftRadius,
          height: at('row').getBoundingClientRect().height,
          gap: row.columnGap,
          justify: row.justifyContent,
        },
        bg0: of('bg0').backgroundColor,
        bg3: of('bg3').backgroundColor,
        accentEdge: of('accent-edge').backgroundColor,
      };
    });

    assert.equal(report.panel.radius, '10px', 'proto:2258 corners the panel at 10px');
    assert.equal(report.panel.padding, '6px', 'proto:2258 insets it by 7px, nearest step 6');
    assert.equal(report.panel.gap, '4px', 'proto:2258 gaps its column by 5px, nearest step 4');
    assert.equal(
      report.panel.background,
      report.bg0,
      'the panel takes the darkest rung we publish, as proto:2258 takes the one below its pane'
    );
    assert.notEqual(
      report.panel.background,
      report.bg3,
      'and no longer the LIGHTEST rung, which drew the panel brighter than the pane under it'
    );

    assert.equal(report.field.radius, '7px', 'proto:2259 corners the field at 7px');
    assert.equal(
      report.field.borderColour,
      report.accentEdge,
      'proto:2259 edges the field in the accent border, not the neutral one'
    );
    assert.equal(
      report.field.background,
      report.bg0,
      'proto:2259 fills the field with the rung our --fab-bg-0 answers for'
    );
    assert.ok(
      Math.abs(report.field.height - 30) <= 1,
      `the field stands on the ladder's 30 (measured ${report.field.height.toFixed(1)}px)`
    );

    assert.equal(report.list.gap, '2px', 'proto:2260 gaps the list by 2px');
    assert.equal(report.list.padding, '0px', 'proto:2260 gives the list no inset of its own');
    assert.equal(
      report.list.paddingLeft,
      '0px',
      'the panel’s own inset is what the list’s left edge sits on'
    );

    assert.equal(report.row.radius, '7px', 'proto:2261 corners an option row at 7px');
    assert.equal(report.row.gap, '8px', 'proto:2261 gaps the row’s glyph from its label by 8px');
    assert.ok(
      Math.abs(report.row.height - 30) <= 1,
      `proto:2261 stands an option row at 30px (measured ${report.row.height.toFixed(1)}px)`
    );
    assert.notEqual(
      report.row.justify,
      'center',
      'and it still displaces Foundry’s `button { justify-content: center }` host rule'
    );
  } finally {
    await context.close();
  }
});

test('the any-of / all-of toggle is edged and lit in the tag hue, not the warm one', async () => {
  // `proto:4628` is `segStyle`: the chosen segment takes the design's own translucent tag value
  // and `var(--text)`, the unchosen one is transparent over `var(--subtle)`, and `proto:2268`
  // edges the track in the same hue at a lower alpha. That hue is the tag family - it is the
  // value the row's own border, the tag chips and the `+ Tag` pill already carry here, which is
  // `--fab-purple` - so a warm track puts the one control that is ABOUT tags in a different
  // family from everything beside it (issue 1373, maintainer round 7).
  //
  // MEASURED THROUGH PROBES IN THE SAME DOCUMENT, for the reason the kind-tint guard gives: a
  // rule that reaches the element but loses the cascade reads as correct in the source. Both
  // tokens are resolved here and the assertion is a computed-value comparison.
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/SegmentedControl.svelte')
  );
  const stamp = (markup) =>
    [
      ['manager-segmented', segmentedScoped.hashClass],
      ['manager-segment', segmentedScoped.hashClass],
      ['manager-segment-input', segmentedScoped.hashClass],
      ['manager-segment-label', segmentedScoped.hashClass],
    ].reduce((html, [className, hash]) => withScopeHash(html, className, hash), markup);

  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 300 },
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
            ${segmentedScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${stamp(`
            <div class="manager-segmented is-tag" role="radiogroup" aria-label="Tag match" data-tag-match>
              <label class="manager-segment is-active" data-segment="any"><input type="radio" class="manager-segment-input" name="tm" checked><span class="manager-segment-label">Any of</span></label>
              <label class="manager-segment" data-segment="all"><input type="radio" class="manager-segment-input" name="tm"><span class="manager-segment-label">All of</span></label>
            </div>`)}
            <span data-probe="edge" style="color: color-mix(in srgb, var(--fab-purple) 40%, transparent)"></span>
            <span data-probe="lit" style="color: color-mix(in srgb, var(--fab-purple) 22%, transparent)"></span>
            <span data-probe="warm" style="color: var(--fab-surface-active)"></span>
            <span data-probe="resting" style="color: var(--fab-text-subtle)"></span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const probe = (name) =>
        getComputedStyle(document.querySelector(`[data-probe="${name}"]`)).color;
      const track = document.querySelector('[data-tag-match]');
      const lit = document.querySelector('[data-segment="any"]');
      const unlit = document.querySelector('[data-segment="all"]');
      // The ring is `:has(:focus-visible)`, so the radio has to be really focused by the
      // keyboard for the rule to match; a click leaves `:focus` without `:focus-visible`.
      unlit.querySelector('input[type="radio"]').focus();
      return {
        trackEdge: getComputedStyle(track).borderTopColor,
        trackOverflow: getComputedStyle(track).overflow,
        focusOutlineOffset: getComputedStyle(unlit).outlineOffset,
        litBackground: getComputedStyle(lit).backgroundColor,
        unlitBackground: getComputedStyle(unlit).backgroundColor,
        unlitColour: getComputedStyle(unlit).color,
        probes: {
          edge: probe('edge'),
          lit: probe('lit'),
          warm: probe('warm'),
          resting: probe('resting'),
        },
      };
    });

    assert.equal(
      report.trackEdge,
      report.probes.edge,
      'the track is edged in the tag hue the row border and the chips already carry'
    );
    assert.equal(
      report.litBackground,
      report.probes.lit,
      'the chosen segment is lit in the tag hue rather than the warm active tile'
    );
    assert.notEqual(
      report.litBackground,
      report.probes.warm,
      'the chosen segment must not fall back to the shared warm active tile'
    );
    assert.equal(
      report.unlitBackground,
      'rgba(0, 0, 0, 0)',
      'the unchosen segment paints nothing, so the track reads as one control'
    );
    assert.equal(
      report.unlitColour,
      report.probes.resting,
      'the unchosen segment takes the resting ink'
    );
    // `overflow: hidden` is what lets the segments meet the track's own rounded ends without
    // each restating a corner radius (`proto:2268`).
    assert.equal(report.trackOverflow, 'hidden', 'the track clips its segments to its own ends');
    // …and the clip is exactly why the focus ring has to turn inward. An outline paints outside
    // the border box, so the shared positive offset would be clipped away and a keyboard user
    // would see no focus at all on the one track that clips. The two are asserted together
    // because it is the clip that creates the obligation.
    assert.ok(
      Number.parseFloat(report.focusOutlineOffset) < 0,
      `a clipped track paints its focus ring INSIDE the segment (offset ${report.focusOutlineOffset})`
    );
  } finally {
    await context.close();
  }
});

test('every requirement kind marks itself in its OWN tint, on the plate and on the chosen chip', async () => {
  // `proto:4624`-`4627` is the design's `KINDMETA`, and a tint is half of every entry in it:
  // `comp` is `--success`, `tag` is `--tag`, `cur` is `--accent`, and `ess` is `--water` — an
  // essence/water hue the design's own `:root` never declares, so its own frames render that
  // one glyph uncoloured. `--fab-info` is the token that hue names here, and the other three
  // map exactly: the design's `--success`, `--accent` and `--info` are byte-for-byte our
  // `--fab-success`, `--fab-accent` and `--fab-info`, and `--fab-purple` is this repo's tag
  // family (`Chip`'s `is-tag`, the tag row's own edge, the `+ Tag` pill).
  //
  // `proto:4645` resolves the entry PER ROW, and premium's `RewardRow` puts the same
  // `presentation.tint` on the plate (`:62`) AND on the chosen chip's glyph (`:80`) and on
  // each suggestion's (`:129`). The plate shipped tinted; the chip and the suggestions did
  // not, so a NAMED row's mark was one inherited ink whatever kind the row was.
  //
  // MEASURED, NOT MATCHED. A rule that reaches the element but loses the cascade — an `<i>`
  // whose colour an ancestor pill sets, a `layer(modules)` sheet rule against a component's
  // own unlayered block — reads as correct in the source and renders as one colour. So this
  // resolves each token through a probe element in the same document and compares computed
  // values rather than asserting a selector exists.
  const context = await sharedBrowser.newContext({
    viewport: { width: 900, height: 420 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const rowFor = (kind, icon) => `
      <div class="manager-recipe-ingredient-option-row is-${kind}" data-recipe-option>
        <span class="manager-recipe-option-lead is-${kind}" data-plate="${kind}"><i class="${icon}"></i></span>
        <select class="manager-recipe-option-kind"><option>${kind}</option></select>
        <span class="manager-recipe-option-name-field">
          <span class="manager-recipe-option-chosen" data-recipe-option-chosen>
            <i class="${icon} manager-recipe-option-mark is-${kind}" data-mark="${kind}"></i>
            <span class="manager-recipe-option-chosen-name">Named</span>
          </span>
        </span>
      </div>`;
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${rowFor('component', 'fa-solid fa-cube')}
            ${rowFor('tag', 'fa-solid fa-tag')}
            ${rowFor('essence', 'fa-solid fa-flask-vial')}
            ${rowFor('currency', 'fa-solid fa-coins')}
            <span data-token="component" style="color: var(--fab-success)"></span>
            <span data-token="tag" style="color: var(--fab-purple)"></span>
            <span data-token="essence" style="color: var(--fab-info)"></span>
            <span data-token="currency" style="color: var(--fab-accent)"></span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const colourOf = (selector) => getComputedStyle(document.querySelector(selector)).color;
      return ['component', 'tag', 'essence', 'currency'].map((kind) => ({
        kind,
        plate: colourOf(`[data-plate="${kind}"] i`),
        mark: colourOf(`[data-mark="${kind}"]`),
        token: colourOf(`[data-token="${kind}"]`),
      }));
    });

    for (const kind of report) {
      assert.equal(
        kind.plate,
        kind.token,
        `the ${kind.kind} plate glyph carries the ${kind.kind} token, not an inherited ink`
      );
      assert.equal(
        kind.mark,
        kind.token,
        `the chosen chip's ${kind.kind} glyph takes the same tint the plate does (RewardRow.svelte:80)`
      );
    }
    // …and the four are four, not one token wearing four class names: a sheet that resolved
    // every kind to the same colour would satisfy every assertion above.
    assert.equal(
      new Set(report.map((kind) => kind.plate)).size,
      4,
      `the four kinds resolve to four distinct tints (${report.map((k) => `${k.kind}=${k.plate}`).join(', ')})`
    );
  } finally {
    await context.close();
  }
});


// Until issue 785 the Books & Scrolls surface carried its own duplicate page header, so it
// had FOUR unconditional grid children against the shared three-track `auto auto 1fr`: the
// `1fr` landed on the TOOLBAR — it swallowed every pixel of slack and floated mid-panel —
// while the table fell into an implicit `auto` row pinned to the bottom of the view. The
// header is gone (the shell renders one already) and the route names its own tracks. This
// guard ties the template to the markup rather than to a literal value: adding a section
// without widening the template reintroduces exactly that defect, and before this test no
// coverage existed for this route at all.
/**
 * ONE GUARD FOR THE THREE ROUTES THAT DECLARE THEIR OWN `grid-template-rows` (issue 1371,
 * round 3), because it is one defect family and it has now shipped three times.
 *
 * ## The defect
 *
 * `.manager-main` is a grid whose row track list is named in the sheet, per route. A child added
 * to the markup without a track added to the sheet shifts every later child one track down: the
 * last named track is `minmax(0, 1fr)` and its MIN IS 0, so whichever child lands there collapses
 * to nothing and paints over its neighbours. On `components` that put the toolbar — its filter
 * row, its inherit summary and its count — on top of rows 1 to 3 of the list. The sheet's own
 * comments record the same off-by-one for the same route from issue 676; it happened again
 * because nothing measured it.
 *
 * ## Why one function rather than three tests
 *
 * The three guards were near-identical bodies differing in a file name, a selector, a count and
 * two message strings. SonarCloud's copy-paste detector matches by token SHAPE rather than by
 * literal, so that is duplicated new lines against the quality gate — and worse, the three copies
 * had already DRIFTED: `books-scrolls` used a hand-listed tag alternation while the other two used
 * the general matcher, so the same markup was counted two ways in one file. One function makes the
 * matcher one thing by construction.
 *
 * ## The child matcher
 *
 * ANY two-space-indented opening tag, element or COMPONENT, rather than a hand-listed alternation.
 * A list does not fail on an unknown tag: it silently stops counting one, and the track assertion
 * then compares a short count against a short template and passes. Issue 1429 turned a grid child
 * into `<VocabularyTabs>`, a name no list was holding, and `<Pagination>` and
 * `<SharedDefinitionCallout>` are capitalised too.
 *
 * That opener is DESCRIBED rather than quoted, deliberately. This file's own `withoutComments`
 * strips comments with a non-greedy regex over the RAW text, so a comment that spells the opener
 * pairs with the next closer anywhere below it and deletes everything between — it once silently
 * blanked two fixtures 200k characters later. The lookahead is not decoration either: without it
 * the pattern ends in a `*` quantifier followed by the regex's closing slash, and that sequence IS
 * a block-comment terminator to every raw-text stripper here.
 *
 * ## And the count must be UNCONDITIONAL
 *
 * A `{#if}` at grid level makes the child count a function of state, and no static track list can
 * be right for two different counts — the collapsing track simply moves depending on what is
 * rendered. So a top-level block opener is a FAILURE rather than something to count: the repair is
 * always the same, wrap the conditional content in an unconditional element. That is exactly what
 * `.manager-component-head` does on `components`, and without this assertion a probe child added
 * as `{#if …}<section/>{/if}` was counted as zero and the whole guard passed green.
 *
 * @param {object} args
 * @param {string} args.viewFile the `.svelte` under `apps/manager/`.
 * @param {string} args.route the `data-manager-view` token, which is also the sheet selector key.
 * @param {number} args.expectedChildren how many unconditional top-level children the view renders.
 * @param {number} [args.growingTrackIndex] which track must be `minmax(0, 1fr)`; last by default.
 * @param {number} [args.impliedTrailingTracks] children the sheet deliberately leaves to IMPLICIT
 *   auto rows, with the reason at the call site. Not a licence: it is a recorded shortfall.
 * @param {string} args.growingLabel what the growing child is, for the failure message.
 * @param {string} args.autoLabel what the content-sized children are, for the failure message.
 * @param {(main: string, children: string[]) => void} [args.also] route-specific extra assertions.
 */
function assertOneTrackPerGridChild({
  viewFile,
  route,
  expectedChildren,
  growingTrackIndex,
  impliedTrailingTracks = 0,
  growingLabel,
  autoLabel,
  also = () => {},
}) {
  const source = readFileSync(resolve(managerComponentDir, viewFile), 'utf8');
  // Anchored on the TAG NAME rather than on `<main class="manager-main`, because two of these
  // views write their attributes one per line and the class is not on the opening tag's own line.
  const mainIndex = source.search(/<main\b/);
  assert.notEqual(mainIndex, -1, `${viewFile} should render a <main> element`);
  assert.ok(
    /<main\b[^<]*class="manager-main[\s"]/.test(source),
    `${viewFile} should render its content region as .manager-main`
  );
  const main = source.slice(mainIndex);

  const conditionals = main.match(/^ {2}\{#\w+/gm) || [];
  assert.deepEqual(
    conditionals,
    [],
    `${viewFile} renders a CONDITIONAL direct child of .manager-main (${conditionals.join(', ')}). ` +
      'The child count then depends on state, so the collapsing `minmax(0, 1fr)` track lands on a ' +
      'different child in each state and no single track list is right for both. Wrap the ' +
      'conditional content in an unconditional element, as `.manager-component-head` does.'
  );

  const children = main.match(/^ {2}<[A-Za-z][\w-]*(?=[\s>])/gm) || [];
  assert.equal(
    children.length,
    expectedChildren,
    `expected ${expectedChildren} unconditional top-level grid children in ${viewFile}, got ` +
      `${children.length}: ${children.join(', ')}`
  );
  assert.equal(
    main.includes('manager-section-header'),
    false,
    `${viewFile} must not render a second page header (issue 676/785/878)`
  );

  const block = blockFor(`.fabricate-manager[data-manager-view="${route}"] .manager-main`);
  const template = block.match(/grid-template-rows:([^;]+);/)?.[1]?.trim();
  assert.ok(template, `the ${route} route must declare its own grid-template-rows`);

  // Tracks are SPACE-separated, and `minmax(0, 1fr)` contains a space of its own, so tokenize
  // functional notation as one unit rather than splitting on whitespace.
  const tracks = template.match(/[a-z-]+\([^)]*\)|\S+/g) || [];
  assert.equal(
    tracks.length,
    children.length - impliedTrailingTracks,
    `expected ${children.length - impliedTrailingTracks} tracks for ${children.length} children ` +
      `in ${route}, got "${template}"`
  );

  const growing = growingTrackIndex ?? tracks.length - 1;
  assert.equal(
    tracks[growing],
    'minmax(0, 1fr)',
    `${growingLabel} takes the slack, got "${template}"`
  );
  assert.ok(
    tracks.every((track, index) => index === growing || track === 'auto'),
    `only ${growingLabel} may grow; ${autoLabel} must be auto, got "${template}"`
  );

  also(main, children);
}

test('the Books & Scrolls route names one grid track per section and grows the table', () => {
  // THE PAGER IS A FOURTH CHILD AND THE SHEET NAMES THREE TRACKS, which the old hand-listed
  // matcher hid by not counting `<Pagination>` at all. It is recorded rather than repaired: an
  // unnamed trailing child falls into an IMPLICIT row, which grid sizes `auto` — the same value
  // the sheet would name — so the route renders correctly today and naming the track is a change
  // to a route this issue does not touch. What matters is that the shortfall is now written down
  // and a FIFTH child would fail here instead of passing.
  assertOneTrackPerGridChild({
    viewFile: 'BooksScrollsView.svelte',
    route: 'books-scrolls',
    expectedChildren: 4,
    impliedTrailingTracks: 1,
    growingLabel: 'the scrolling table',
    autoLabel: 'header/drop-zone/toolbar',
  });
});

// The same defect family on the Tags & Categories route (issue 878). It carried its own duplicate
// page header until then, which happened to give it exactly three children for the shared
// three-track `auto auto 1fr`. Deleting the header took it to TWO, and the shared template's `1fr`
// would have landed on an EMPTY third row — the vocabulary workspace sizing to its content with
// the panel's remaining height sitting dead below it, the mirror image of the books-scrolls
// toolbar float.
test('the Tags & Categories route names one grid track per section and grows the workspace', () => {
  assertOneTrackPerGridChild({
    viewFile: 'TagsCategoriesView.svelte',
    route: 'tags',
    expectedChildren: 2,
    growingLabel: 'the scrolling vocabulary workspace',
    autoLabel: 'the tab strip',
  });
});

// The SAME defect family, a third time, on the Component Rules route (issue 1371). Issue 1371
// added a fifth top-level child to a four-track template: the attribution banner went in FIRST,
// every child shifted one track down, and the toolbar landed in the zero-min growing track.
test('the Component Rules route names one grid track per child and grows the list', () => {
  assertOneTrackPerGridChild({
    viewFile: 'ComponentsBrowserView.svelte',
    route: 'components',
    expectedChildren: 4,
    // THE LIST IS THE THIRD OF FOUR, not the last: the pager is a real child below it, and this
    // is the one route whose sheet names a track for it. So the growing track is asserted by
    // POSITION rather than by "last".
    growingTrackIndex: 2,
    growingLabel: 'the scrolling list',
    autoLabel: 'head/toolbar/pager',
    also: (main) => {
      // THE COUNT IS UNCONDITIONAL, which is the whole repair. The banner renders inside a
      // `.manager-component-head` wrapper precisely so a null `bannerEntry` — a system whose
      // components the world corpus has no record of — leaves the same four children. A banner
      // hoisted back out to be a direct child would make this five, and a template widened to
      // five tracks would misplace the list in the state the banner is absent.
      assert.ok(
        main.includes('class="manager-component-head"'),
        'the banner and the drop zone share one head wrapper, so the child count does not ' +
          'depend on whether a component is selected'
      );
    },
  });
});

// Rendered-geometry guard for the reserved General row (issue 878). Its explanatory
// sentence used to stack under the name, making it the one card in an `align-items: start`
// grid whose content exceeded the 34px icon tile — so it stood visibly taller than every
// sibling. Source-reading cannot see that; only layout can, so this measures both cards.
//
// The fixture's tab strip and workspace are a `<div role="tablist">` / `<div role="tabpanel">`
// because that is what the view now ships (issue 924 — the `<nav>`/`<section>` forms carried
// implicit landmark roles for the ARIA roles to override). Every governing selector below is
// class-based, so nothing here depends on the element; the fixture is updated so it keeps
// MIRRORING shipped markup rather than quietly describing a shape that no longer exists.
//
// Issue 1429 moved the strip onto `EditorTabs` and corrected its mark from the neutral chip to
// the Rail Marker Family's RECORD COUNT, so the fixture's tab now carries
// `<span class="manager-editor-tab-count">` rather than a `.manager-chip`. This is a hand-written
// COPY of shipped markup, which is exactly the kind that keeps passing after the product stops
// emitting it — the `<div role="tablist">` host and both container classes are unchanged, so the
// copy is faithful again rather than merely still green.
//
// Issue 1470 added the `<div class="fabricate-icon-picker essence-icon-picker">` the picker
// actually renders around its trigger. That element was missing here from the start, which cost
// nothing while every trigger rule hung off `.fabricate-manager` and costs the whole block once
// they hang off the picker's own namespace root: without it this row measures an unstyled button
// and still reports on the vocabulary row's height by name.
test('the reserved vocabulary row renders exactly as tall as a custom row', async () => {
  const context = await sharedBrowser.newContext({ viewport: { width: 760, height: 600 } });
  const page = await context.newPage();
  try {
    const lockedRow = `<div class="manager-vocabulary-row">
      <span class="manager-vocabulary-icon is-locked-icon"><i class="fas fa-lock"></i></span>
      <div class="manager-vocabulary-main is-inline" title="Built-in fallback &mdash; cannot be renamed or removed."><strong>General</strong></div>
      <span class="manager-chip manager-vocabulary-chip-locked"><i class="fas fa-lock"></i>Locked</span>
    </div>`;
    const customRow = `<div class="manager-vocabulary-row">
      <span class="manager-vocabulary-icon-picker" data-vocabulary-icon-picker="potions"><div class="fabricate-icon-picker essence-icon-picker"><button type="button" class="essence-icon-picker-trigger icon-only manager-vocabulary-icon-trigger"><span class="essence-icon-picker-preview"><i class="fas fa-folder"></i></span><span class="essence-icon-picker-trigger-caret"><i class="fas fa-chevron-down"></i></span></button></div></span>
      <div class="manager-vocabulary-main"><strong>Potions</strong></div>
      <span class="manager-chip is-warning"><i class="fas fa-link"></i>8 references</span>
      <button type="button" class="manager-icon-button"><i class="fas fa-trash"></i></button>
    </div>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div class="fabricate-manager" data-manager-view="tags"><div class="manager-body"><main class="manager-main manager-tags-categories"><div class="manager-editor-tabs manager-vocabulary-tabs" role="tablist"><button type="button" class="manager-editor-tab-button is-active"><span>Recipe categories</span><span class="manager-editor-tab-count">17</span></button></div><div class="manager-tags-categories-workspace" role="tabpanel"><section class="manager-vocabulary-panel"><div class="manager-vocabulary-list"><div class="manager-vocabulary-card is-locked" data-vocabulary-locked-card>${lockedRow}</div><div class="manager-vocabulary-card" data-vocabulary-custom-card>${customRow}</div></div></section><span class="manager-chip" data-default-chip-reference>Default</span></div></main></div></div>`
      )
    );
    const geometry = await page.evaluate(() => {
      const locked = document.querySelector('[data-vocabulary-locked-card]');
      const custom = document.querySelector('[data-vocabulary-custom-card]');
      const trigger = custom.querySelector('.manager-vocabulary-icon-trigger');
      const triggerRect = trigger.getBoundingClientRect();
      return {
        lockedHeight: Math.round(locked.getBoundingClientRect().height),
        customHeight: Math.round(custom.getBoundingClientRect().height),
        hintRendered: Boolean(locked.querySelector('.manager-vocabulary-locked-hint')),
        triggerWidth: Math.round(triggerRect.width),
        triggerHeight: Math.round(triggerRect.height),
        lockedChipHeight: Math.round(
          locked.querySelector('.manager-chip').getBoundingClientRect().height
        ),
        lockedChipBackground: getComputedStyle(locked.querySelector('.manager-chip'))
          .backgroundColor,
        // A chip that exists to BE the default, named by its own hook. It used to be read off
        // `.manager-editor-tab-button .manager-chip` — the tab badge — which made an assertion
        // about the LOCKED ROW's fill depend on the vehicle the tab strip happened to draw.
        // Issue 1429 corrected that badge to the bare-numeral record count, and this clause fell
        // over with `getComputedStyle` on null rather than saying what it had lost. The
        // comparison only ever needed a default chip on the same page.
        defaultChipBackground: getComputedStyle(
          document.querySelector('[data-default-chip-reference]')
        ).backgroundColor,
      };
    });
    // The IconPicker's own `.essence-icon-picker-trigger` block is a full-width, 36px-min
    // three-column combo declared LATER in the sheet, so the row tile only stays a 34px
    // square while the vocabulary override outranks it on specificity, not source order.
    assert.deepEqual(
      { width: geometry.triggerWidth, height: geometry.triggerHeight },
      { width: 34, height: 34 },
      'the row icon picker trigger must render as the 34px vocabulary tile'
    );
    assert.equal(
      geometry.lockedHeight,
      geometry.customHeight,
      `the reserved row must match its siblings exactly (locked ${geometry.lockedHeight}px vs custom ${geometry.customHeight}px)`
    );

    // Two facts about the chip that ONLY a real browser can establish, and that the whole
    // of issue 883 rests on.
    //
    // First, the row's chip renders at the primitive's compact 20px. The global sheet has
    // no chip rule left at all, so this measures `Chip.svelte`'s own scoped block reaching
    // a real page — if the injection or the scoping hash ever stopped matching, the chip
    // would collapse to bare text and this drops well below 20.
    assert.ok(
      geometry.lockedChipHeight >= 20,
      `the locked chip renders at the primitive's compact scale, got ${geometry.lockedChipHeight}px`
    );
    // Second, `manager-vocabulary-chip-locked` still WINS its fill. It is a global rule
    // overriding a declaration the scoped block also makes, so it is written at three
    // classes; at two it would tie and lose on source order, and the locked chip would
    // silently repaint as an ordinary one. Comparing it against a default chip on the same
    // page is what makes that a fact rather than a colour constant copied out of the sheet.
    assert.notEqual(
      geometry.lockedChipBackground,
      geometry.defaultChipBackground,
      'the locked chip must keep its own fill, not fall back to the default chip fill'
    );
    // The sentence itself is gone: ellipsised at real column widths it truncated to
    // "Built…", which read as breakage beside untruncated custom rows. It survives as the
    // row's tooltip, so the card carries the name alone and the height follows for free.
    assert.equal(
      geometry.hintRendered,
      false,
      'the reserved row must not render an inline explanatory sentence'
    );
  } finally {
    await context.close();
  }
});

// The chance slider paints a coloured fill in a 6px track BEHIND a transparent range
// input, so anything that gives that input a background hides the bar completely and
// leaves only the thumb — which reads as "the slider renders a dot and no bar".
//
// The gathering edit views carry a blanket field rule over `:is(input…, select, textarea)`
// that computes to (0,4,1) and outranks the slider's own (0,3,1) reset. It excluded
// checkbox and radio but not range, so every drop row in the task and event editors lost
// its bar while the inspector — whose twin rule already excluded range — kept it.
//
// Asserted on the RENDERED background rather than on the selector text, so a future rule
// that reintroduces a background by some other route fails too (issue 883).
test('a range input inside the gathering edit views stays transparent for the slider fill', async () => {
  const context = await sharedBrowser.newContext({ viewport: { width: 900, height: 200 } });
  try {
    for (const view of ['manager-gathering-task-edit-view', 'manager-gathering-event-edit-view']) {
      const page = await context.newPage();
      try {
        await page.setContent(
          `<style>${css}</style>` +
            `<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate"><div class="${view}">` +
            '<div class="manager-gathering-task-drop-row" role="row" style="width:640px">' +
            '<span role="cell" class="manager-drop-cell manager-drop-rate-cell">' +
            '<span class="manager-chance-slider manager-drop-rate-value">' +
            '<span class="manager-chance-slider-control manager-drop-rate-control is-common" ' +
            'style="--fab-drop-rate-value:90%; --fab-drop-rate-color:#5EC3B0;">' +
            '<span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>' +
            '<input type="range" min="0" max="100" step="1" value="90"/>' +
            '</span></span></span></div></div></div>'
        );
        const seen = await page.evaluate(() => {
          const input = document.querySelector('input[type="range"]');
          const fill = document.querySelector('.manager-drop-rate-fill');
          return {
            inputBackground: getComputedStyle(input).backgroundColor,
            fillWidth: Math.round(fill.getBoundingClientRect().width),
            fillBackground: getComputedStyle(fill).backgroundColor,
          };
        });
        assert.equal(
          seen.inputBackground,
          'rgba(0, 0, 0, 0)',
          `${view}: the range input must stay transparent or it hides the slider fill, got ${seen.inputBackground}`
        );
        assert.ok(
          seen.fillWidth > 0 && seen.fillBackground !== 'rgba(0, 0, 0, 0)',
          `${view}: the slider fill must render, got ${seen.fillWidth}px ${seen.fillBackground}`
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});

// The gathering task library's inspector rail stacks three cards: "Gathering task details",
// "Drops summary" and "Used in environments". The middle one restated the whole
// `.manager-inspector-card` contract and then diverged on the two values it changed — a
// `--fab-bg-3` fill instead of the shell's, and 16px of horizontal padding instead
// of 12px — so it read as a different KIND of card from its neighbours.
//
// Asserted on the RENDERED box rather than on the absence of a selector, so a fill
// reintroduced by any route (a new rule, an ancestor, a different class) fails too, and so
// this stays true if the shell's own values are ever retuned (issue 883).
test('the gathering inspector rail cards render as one card, not three treatments', async () => {
  const context = await sharedBrowser.newContext({ viewport: { width: 420, height: 600 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style>` +
        '<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">' +
        '<aside class="manager-inspector" style="width:320px">' +
        '<section class="manager-inspector-card" data-card="details">' +
        '<h3 class="manager-card-title">Gathering task details</h3><p>Three facts</p>' +
        '</section>' +
        '<section class="manager-inspector-card" data-task-drops-summary data-card="drops">' +
        '<h3 class="manager-card-title">Drops summary</h3>' +
        '<div class="manager-task-drops-summary-list"><span class="manager-task-drop-summary-chip">' +
        '<span class="manager-task-drop-summary-label">Nightshade</span>' +
        '<strong class="manager-task-drop-summary-percent">80%</strong></span></div>' +
        '</section>' +
        '<section class="manager-inspector-card manager-task-environment-usage-card" data-card="usage">' +
        '<h3 class="manager-card-title">Used in environments</h3><p>Not used yet.</p>' +
        '</section>' +
        '</aside></div>'
    );
    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-card]')).map((card) => {
        const style = getComputedStyle(card);
        return {
          card: card.dataset.card,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderTopLeftRadius,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          width: Math.round(card.getBoundingClientRect().width),
        };
      })
    );

    const [details, drops, usage] = measured;
    assert.equal(measured.length, 3, 'the fixture should render all three rail cards');
    // A real fill, not a transparent card that trivially "matches".
    assert.notEqual(
      details.backgroundColor,
      'rgba(0, 0, 0, 0)',
      `the shared card shell should paint a fill, got ${details.backgroundColor}`
    );
    for (const property of [
      'backgroundColor',
      'borderColor',
      'borderWidth',
      'borderRadius',
      'padding',
      'width',
    ]) {
      assert.equal(
        drops[property],
        details[property],
        `drops summary ${property} should match the details card, got ${drops[property]} vs ${details[property]}`
      );
      assert.equal(
        usage[property],
        details[property],
        `environment usage ${property} should match the details card, got ${usage[property]} vs ${details[property]}`
      );
    }
  } finally {
    await context.close();
  }
});

// Issue 883 retired the last two hand-rolled copies of the chance slider — the gathering
// drop INSPECTOR and the gathering EVENT editor — in favour of `ChanceSlider`. Both had
// been surviving on unrelated CSS accidents: the inspector's fill was visible only because
// `.manager-drop-editor-card` happened to exclude `[type="range"]` from its blanket field
// rule, and the event editor's rows needed f4402c27 to add the same exclusion.
//
// This asserts the RENDERED result at both converted sites: a transparent range input, a
// fill with real width and colour, and a number field that is actually sized — the last
// because the conversion moved those fields from `[type="text"]` to `[type="number"]`, so a
// stylesheet still keyed on the old type would leave them unstyled and this would catch it.
const CHANCE_SLIDER_FIXTURE =
  '<span class="manager-chance-slider manager-drop-rate-value" data-chance-slider>' +
  '<span class="manager-chance-slider-number manager-drop-rate-percent">' +
  '<input type="number" min="0" max="100" step="1" value="80" aria-label="Chance"/>' +
  '<span aria-hidden="true">%</span></span>' +
  '<span class="manager-chance-slider-control manager-drop-rate-control is-common" ' +
  'style="--fab-drop-rate-value:80%; --fab-drop-rate-color:#5EC3B0;">' +
  '<span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>' +
  '<input type="range" min="0" max="100" step="1" value="80"/>' +
  '</span></span>';

test('both converted chance-slider sites render a real fill, not a bare thumb', async () => {
  // The fixture is hand-written, so it is pinned to what the component actually renders —
  // otherwise a renamed class would leave this measuring markup the app never produces.
  const chanceSliderSource = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/ChanceSlider.svelte'),
    'utf8'
  );
  for (const claim of [
    'manager-chance-slider manager-drop-rate-value',
    'manager-chance-slider-number manager-drop-rate-percent',
    'manager-chance-slider-control manager-drop-rate-control',
    'manager-drop-rate-track',
    'manager-drop-rate-fill',
    'type="number"',
    'type="range"',
  ]) {
    assert.ok(
      chanceSliderSource.includes(claim),
      `the fixture assumes ChanceSlider renders ${claim}`
    );
  }

  const sites = [
    {
      name: 'gathering drop inspector',
      // The dense inspector treatment: 28px, matching the drop rows it mirrors.
      percentHeight: 28,
      markup:
        '<aside class="manager-inspector manager-drop-inspector-stack" style="width:320px">' +
        '<section class="manager-inspector-card manager-drop-editor-card">' +
        '<div class="manager-drop-editor-values">' +
        '<label class="manager-field manager-drop-rate-editor" data-gathering-drop-inspector-rate>' +
        `<span>Drop chance</span>${CHANCE_SLIDER_FIXTURE}</label>` +
        '</div></section></aside>',
    },
    {
      name: 'gathering event editor',
      // 36px, and deliberately NOT normalised to the inspector's 28px. This field is a
      // full-width form control in a normal editor card, so it takes the manager standard
      // `.manager-field` height; 28px is the DENSE treatment for a table cell and the
      // inspector rail. The divergence pre-dates this conversion and is a real difference
      // of context, not a second spelling of one control (issue 883).
      percentHeight: 36,
      markup:
        '<main class="manager-main manager-gathering-event-edit-view" style="width:640px">' +
        '<section class="manager-task-availability-card" data-gathering-event-drop-rate>' +
        '<div class="manager-task-availability-row">' +
        '<label class="manager-field manager-drop-rate-editor">' +
        `<span>Drop rate (%)</span>${CHANCE_SLIDER_FIXTURE}</label>` +
        '</div></section></main>',
    },
  ];

  const context = await sharedBrowser.newContext({ viewport: { width: 900, height: 260 } });
  try {
    for (const site of sites) {
      const page = await context.newPage();
      try {
        await page.setContent(
          `<style>${css}</style>` +
            `<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">${site.markup}</div>`
        );
        const seen = await page.evaluate(() => {
          const range = document.querySelector('input[type="range"]');
          const number = document.querySelector('.manager-drop-rate-percent input');
          const track = document.querySelector('.manager-drop-rate-track');
          const fill = document.querySelector('.manager-drop-rate-fill');
          return {
            rangeBackground: getComputedStyle(range).backgroundColor,
            fillWidth: Math.round(fill.getBoundingClientRect().width),
            trackWidth: Math.round(track.getBoundingClientRect().width),
            fillBackground: getComputedStyle(fill).backgroundColor,
            numberHeight: Math.round(number.getBoundingClientRect().height),
            numberWidth: Math.round(number.getBoundingClientRect().width),
          };
        });

        assert.equal(
          seen.rangeBackground,
          'rgba(0, 0, 0, 0)',
          `${site.name}: the range input must stay transparent or it hides the fill, got ${seen.rangeBackground}`
        );
        assert.ok(
          seen.trackWidth > 0,
          `${site.name}: the slider track must have width, got ${seen.trackWidth}px`
        );
        // Not merely present: at 80% the fill must cover most of the track, in its colour.
        assert.ok(
          seen.fillWidth > seen.trackWidth * 0.7,
          `${site.name}: the fill should span ~80% of the ${seen.trackWidth}px track, got ${seen.fillWidth}px`
        );
        assert.equal(
          seen.fillBackground,
          'rgb(94, 195, 176)',
          `${site.name}: the fill should paint its tier colour, got ${seen.fillBackground}`
        );
        // The number field moved from `[type="text"]` to `[type="number"]` in this
        // conversion; a rule still keyed on the old type leaves it at the unstyled default.
        assert.equal(
          seen.numberHeight,
          site.percentHeight,
          `${site.name}: the percent field should keep its ${site.percentHeight}px control height, got ${seen.numberHeight}px`
        );
        assert.ok(
          seen.numberWidth > 20,
          `${site.name}: the percent field should be laid out, got ${seen.numberWidth}px`
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});

/*
  The OPEN state of a manager `<select>` (issue 772).

  `.fabricate-manager select` themes the CLOSED field, so a manager dropdown looks correct
  until it is opened — and then the option list fell back to the browser's black-on-white
  default, in every native select the manager renders. The player app has carried
  `.fabricate-app select option` for a long time; the manager root is `.fabricate-manager`
  and never inherited it.

  This is asserted from the STYLESHEET rather than from a rendered frame because it cannot
  be photographed: a native select's popup is painted by the browser, not into the page DOM,
  so Playwright never sees it and no smoke screenshot can contain the defect. It was found
  by opening the control by hand. A source assertion is therefore the only gate available,
  and its job is to stop the rule being deleted as "unused".
*/
test('the manager themes select options, not just the closed select', () => {
  const optionRule = blockFor('.fabricate-manager select option');
  assert.ok(optionRule, 'the manager must theme its option list, not only the closed field');
  assert.match(
    optionRule,
    /background:\s*var\(--fab-bg-3\)/,
    'an option list must take its background from `--fab-bg-3`, so it re-themes with the ' +
      'rest of the manager; unpainted, it falls back to whatever the browser draws, which ' +
      'in every engine tested is a light list inside a dark app'
  );
  assert.match(optionRule, /color:\s*var\(--fab-text\)/);

  // The selected row must be marked the SAME way on both rendering paths — the engines
  // that paint the list in-page and the customizable-select picker. An accent-filled bar
  // on one and a subtle overlay on the other is one control reading as two designs
  // depending on which browser the GM happens to run.
  const checkedRule = blockFor('.fabricate-manager select option:checked');
  assert.ok(checkedRule, 'the selected row needs its own treatment');
  assert.match(
    checkedRule,
    /background:\s*var\(--fab-overlay-light-08\)/,
    'the checked row shares the picker treatment rather than painting a filled bar'
  );
  assert.match(checkedRule, /color:\s*var\(--fab-accent\)/);

  // `color-scheme` is the only layer here that reaches every engine: it is what makes the
  // platform-drawn popup dark at all, and without it the rules above are cosmetic.
  assert.match(
    blockFor('.fabricate-manager'),
    /color-scheme:\s*dark/,
    'the manager root must declare the dark UA scheme, as the player root already does'
  );

  // …and the opt-in that makes those colours visible at all. Without it the rules above
  // are correct and inert on the engines most players use, because a legacy select popup
  // is painted by the platform rather than the page.
  assert.match(
    css,
    /@supports \(appearance: base-select\)/,
    'the option colours only reach a Chromium popup through the customizable-select opt-in'
  );
  const picker = blockFor('.fabricate-manager select::picker(select)');
  assert.ok(picker, 'the picker surface must be themed, not left as the platform default');
  assert.match(picker, /background:\s*var\(--fab-bg-3\)/);
});

/*
  Every manager `<select>` must carry an OPAQUE background (issue 772).

  A native select's option popup is painted by the browser, which derives its surface from
  the control's own computed background. A translucent background looks correct on the
  CLOSED control — it composites over whatever dark surface it sits on — but the popup has
  nothing to composite against, so it opens LIGHT while every other manager dropdown opens
  dark. `color-scheme: dark` does not rescue it: an author background wins over the UA
  scheme.

  This shipped once. The bulk edit panel's category select used `--fab-surface-soft`, a
  5%-alpha light tint, and opened light beside a pagination select that opened dark in the
  same window. It is invisible to every other gate: the closed control looks correct in any
  screenshot, and the popup is browser chrome that Playwright cannot photograph at all.

  The scan covers component SCOPED styles as well as the global sheet, because that is
  where it shipped — a global-sheet-only guard would have missed it entirely.
*/
test('every manager select paints an opaque background, so its popup opens dark', () => {
  // `rgb(… / 5%)`, `rgba(…, 0.05)` — any alpha below 1.
  const TRANSLUCENT = /(?:rgba?|hsla?)\([^)]*(?:\/\s*(?:0?\.\d+|[0-9]{1,2})%|,\s*0?\.\d+)\s*\)/i;

  // Resolve `var(--a)` chains against the sheet's own token declarations.
  const tokens = new Map(
    [...css.matchAll(/^\s*(--fab-[\w-]+):\s*([^;]+);/gm)].map(([, name, value]) => [
      name,
      value.trim(),
    ])
  );
  function resolveToken(value, depth = 0) {
    if (depth > 8) return value;
    const ref = /var\(\s*(--fab-[\w-]+)/.exec(value);
    if (!ref) return value;
    const next = tokens.get(ref[1]);
    return next ? resolveToken(next, depth + 1) : value;
  }
  const backgroundOf = (body) => /background(?:-color)?:\s*([^;]+)/.exec(body)?.[1]?.trim() || '';

  const offenders = [];

  // 1. The global sheet: rules whose selector ends at a bare `select` under the manager.
  //
  // THE `\b` BELOW WAS A LITERAL BACKSPACE (issue 1373, round 8, found while editing this file).
  // U+0008 is what an editor writes when a `\b` is passed through a shell heredoc or a non-raw
  // Python string, and it is invisible in every diff, every review and every editor. The pattern
  // therefore required a control character between the selector and `select`, matched NOTHING,
  // and half of this gate had been scanning an empty set: 0 rules against the 27 the repaired
  // pattern finds. Only branch 2, the scoped-block correlation, was ever doing any work.
  //
  // Repaired rather than reported, because the repair is provably safe: neither branch reports an
  // offender on this tree, so the gate goes from vacuous to real without moving.
  for (const [, selector, body] of css.matchAll(
    /(\.fabricate-manager[^{},]*\bselect)\s*\{([^}]*)\}/g
  )) {
    const declared = backgroundOf(body);
    if (declared && TRANSLUCENT.test(resolveToken(declared))) {
      offenders.push(`styles/fabricate.css ${selector.trim()} -> ${declared}`);
    }
  }

  // 2. Component scoped styles: correlate `<select class="x">` with `.x { background }` in
  //    the same file's `<style>` block. This is the shape the defect actually took, so a
  //    global-sheet-only scan would have missed it.
  const managerFiles = readdirSync(managerComponentDir, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'));

  for (const entry of managerFiles) {
    const full = resolve(entry.parentPath, entry.name);
    const source = readFileSync(full, 'utf8');
    const style = /<style>([\s\S]*)<\/style>/.exec(source)?.[1];
    if (!style) continue;
    const shortPath = relative(managerComponentDir, full).replaceAll('\\', '/');
    for (const [, classAttr] of source.matchAll(/<select[^>]*class="([^"]+)"/g)) {
      for (const className of classAttr.split(/\s+/).filter(Boolean)) {
        if (className.includes('{')) continue;
        const rule = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(style);
        if (!rule) continue;
        const declared = backgroundOf(rule[1]);
        if (declared && TRANSLUCENT.test(resolveToken(declared))) {
          offenders.push(`${shortPath} .${className} -> ${declared}`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a translucent select background opens a LIGHT popup:\n- ${offenders.join('\n- ')}`
  );
});

// ── The Checks Studio restacks at the declared floor, MEASURED (issue 1096) ──────────────
//
// This replaces two source-text assertions, and the replacement is the whole point. Both of
// the rules below were asserted by `css.includes(...)` and both passed while broken:
//
//  - the workspace's `@container … (max-width: 1120px)` override tied with the base rule on
//    specificity (a container query adds none) and LOST on source order, so between 1120 and
//    961 — a band that contains the declared 1024x640 floor — `.manager-body` restacked while
//    the workspace stayed a 300px side column. The acceptance frame that exists to show a
//    stacked studio at the floor showed a side rail.
//  - `[data-manager-view^="checks"]` is a PREFIX match because `checks` became four child
//    routes. Narrowing it to `=` matched nothing, and an `includes('…checks…')` assertion
//    cannot see the difference between the two.
//
// A rendered measurement can see both. `chromium` is already this file's tool for exactly
// this reason: happy-dom applies no stylesheet and computes no cascade, so nothing in a
// mounted suite could ever have caught either.
async function readWorkspaceGrid(width, view, worldTravelTab = '') {
  const context = await sharedBrowser.newContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style>` +
        `<div style="width:${width}px;height:640px">` +
        `<div class="fabricate-manager" data-manager-view="${view}" data-world-travel-tab="${worldTravelTab}">` +
        `<div class="manager-body"><aside class="manager-rail">Rail</aside>` +
        `<main class="manager-main"><div class="manager-environment-edit-view">` +
        `<div class="manager-environment-workspace">` +
        `<div class="manager-environment-tab-panel">Panel</div>` +
        `<aside class="manager-inspector manager-environment-inspector">Rail</aside>` +
        `</div></div></main></div></div></div>`
    );
    return await page.evaluate(() => {
      const columns = (selector) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 0;
      };
      const workspace = document.querySelector('.manager-environment-workspace');
      return {
        bodyColumns: columns('.manager-body'),
        workspaceColumns: columns('.manager-environment-workspace'),
        workspaceWidth: workspace ? workspace.getBoundingClientRect().width : 0,
        panelWidth: document
          .querySelector('.manager-environment-tab-panel')
          ?.getBoundingClientRect().width,
        inspectorWidth: document
          .querySelector('.manager-environment-inspector')
          ?.getBoundingClientRect().width,
      };
    });
  } finally {
    await context.close();
  }
}

// Imported rather than restated, so a change to the route set is a change to this guard too.
const { CHECKS_VIEWS, CHECKS_REDIRECT_VIEW } =
  await import('../../src/ui/svelte/apps/manager/checks/checksNav.js');

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

test('the manager workspace restacks at the declared 1024 floor, not only below 960', async () => {
  // 1280: the side-rail state, which must survive.
  const wide = await readWorkspaceGrid(1280, 'checks-crafting');
  assert.equal(wide.workspaceColumns, 2, 'the workspace is panel + rail above the breakpoint');
  assert.ok(
    Math.abs(wide.inspectorWidth - 300) < 1,
    `the side rail is 300px wide, got ${wide.inspectorWidth}`
  );

  // 1024x640 — the DECLARED FLOOR, and the width `manager-checks-stacked-floor` photographs.
  // It sits inside the 1120→961 band, which is exactly where the dead rule left a side rail.
  const floor = await readWorkspaceGrid(1024, 'checks-crafting');
  assert.equal(floor.bodyColumns, 1, 'the body is stacked at the floor');
  assert.equal(floor.workspaceColumns, 1, 'and so is the workspace — no 300px side column');
  assert.ok(
    floor.panelWidth > 600,
    `the panel takes the full stacked width, got ${floor.panelWidth}`
  );

  // 1100: the top of the same band, to prove the boundary is 1120 and not 960.
  const band = await readWorkspaceGrid(1100, 'checks-crafting');
  assert.equal(band.workspaceColumns, 1, 'the whole 1120→961 band is stacked');
});

test('the environment, tags and system studios restack at the same floor', async () => {
  // The dead rule was never Checks-specific: `.manager-environment-workspace` is the shared
  // editor shell, so every studio built on it carried the same 1120→961 side rail.
  for (const view of ['environment-edit', 'system-edit', 'crafting-settings']) {
    const floor = await readWorkspaceGrid(1024, view);
    assert.equal(floor.workspaceColumns, 1, `${view} stacks its workspace at the floor`);
  }
});

test('World Parties preserves the shared stacked rail and body layout at narrow widths', async () => {
  // The World route deliberately releases the unused inspector at desktop widths. Its route
  // rule is more specific than the shared 1120px stack, however, so this must be measured:
  // a source-text assertion would pass while the cascade left the two desktop tracks alive.
  const wide = await readWorkspaceGrid(1280, 'world', 'parties');
  assert.equal(wide.bodyColumns, 2, 'wide World Parties keeps its rail beside the full-width body');

  for (const width of [1100, 1024]) {
    const narrow = await readWorkspaceGrid(width, 'world', 'parties');
    assert.equal(
      narrow.bodyColumns,
      1,
      `World Parties uses the shared stacked rail/body layout at ${width}px`
    );
  }
});

test('World Parties keeps its card scroller and sibling pager independently reachable at 1100px', async () => {
  // `gathering-parties-tab.test.js` mounts this component and pins the sibling DOM. This
  // source join keeps the Chromium geometry below attached to those real rendered classes:
  // deleting or renaming either node fails here instead of leaving a stale layout fixture.
  const contentAt = partiesTabSource.indexOf('class="manager-travel-parties-content"');
  const footerAt = partiesTabSource.indexOf('class="manager-travel-parties-pagination"');
  assert.ok(contentAt > -1, 'the product component renders the card scroller class');
  assert.ok(footerAt > contentAt, 'the product component renders the sibling pager after it');

  const hash = partiesTabScoped.hashClass;
  const cards = Array.from(
    { length: 4 },
    (_, index) =>
      `<div class="manager-travel-parties-row ${hash}" data-manager-travel-party-id="party-${index + 1}"><div class="probe-card-editor">Party ${index + 1} editor</div></div>`
  ).join('');
  const productContractMarkup = `<div class="manager-travel-parties ${hash}">
    <div class="manager-travel-parties-content ${hash}">
      <div class="manager-travel-parties-list ${hash}">${cards}</div>
    </div>
    <div class="manager-travel-parties-pagination ${hash}" data-manager-party-pagination>
      <div class="manager-pagination"><span>Showing 1-4 of 8</span><select data-pagination-size><option>4</option></select></div>
    </div>
  </div>`;

  const context = await sharedBrowser.newContext({
    viewport: { width: 1100, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const nav = Array.from(
      { length: 10 },
      (_, index) =>
        `<button class="manager-nav-button"><span class="manager-nav-label">Section ${index + 1}</span></button>`
    ).join('');
    // The component's OWN scoped CSS, after the global sheet — the same pairing every
    // other probe in this file uses (see the components-route probe above) and matching
    // `css: 'injected'`, which puts a component's block in `document.head` after Foundry's
    // `<link>`. Omitting it is what disabled this test: the fixture carried the real hash
    // class but nothing declared `.manager-travel-parties` or its content child, so the
    // pane rendered `display: block; overflow: visible`, the scroller sized to its cards,
    // and the opening `scrollRange > 100` precondition read 0 — a fixture that proved
    // nothing rather than a product regression.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <style>${css}</style>
      <style>${partiesTabScoped.css}</style>
      <style>
        html, body { margin: 0; width: 100%; height: 100%; }
        :root { --font-primary: Arial, sans-serif; }
        .probe-titlebar { height: 28px; }
        .probe-header { height: 76px; }
        .probe-card-editor { height: 220px; }
      </style></head><body>
      <div class="fabricate fabricate-manager" data-fabricate-theme="fabricate"
        data-manager-view="world" data-world-travel-tab="parties">
        <div class="probe-titlebar"></div><div class="probe-header"></div>
        <div class="manager-body">
          <aside class="manager-rail"><nav class="manager-nav">${nav}</nav></aside>
          <main class="manager-main">
            <section class="manager-section-header"><div class="manager-heading"><h2>World Parties</h2></div></section>
            <div class="manager-gathering-panel manager-travel-view is-parties-pane">${productContractMarkup}</div>
          </main>
        </div>
      </div></body></html>`);

    const report = await page.evaluate(() => {
      const body = document.querySelector('.manager-body');
      const main = document.querySelector('.manager-main');
      const pane = document.querySelector('.manager-travel-parties');
      const scroller = document.querySelector('.manager-travel-parties-content');
      const footer = document.querySelector('[data-manager-party-pagination]');
      const pagerControl = footer.querySelector('[data-pagination-size]');
      const before = footer.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const scrollRange = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = scroller.scrollHeight;
      const after = footer.getBoundingClientRect();
      const controlBox = pagerControl.getBoundingClientRect();
      const hit = document.elementFromPoint(
        controlBox.left + controlBox.width / 2,
        controlBox.top + controlBox.height / 2
      );
      const horizontalOverflow = [body, main, pane, scroller].map(
        (element) => element.scrollWidth - element.clientWidth
      );
      return {
        scrollRange,
        scrolledBy: scroller.scrollTop,
        scrollerOverflowY: getComputedStyle(scroller).overflowY,
        footerIsSibling: footer.parentElement === pane && !scroller.contains(footer),
        footerFullWidth:
          Math.abs(before.left - paneBox.left) <= 1 && Math.abs(before.right - paneBox.right) <= 1,
        footerVisible: before.top >= mainBox.top - 1 && before.bottom <= mainBox.bottom + 1,
        footerStable:
          Math.abs(before.top - after.top) <= 1 &&
          Math.abs(before.bottom - after.bottom) <= 1 &&
          Math.abs(before.left - after.left) <= 1 &&
          Math.abs(before.right - after.right) <= 1,
        pagerControlHit: hit === pagerControl || pagerControl.contains(hit),
        pagerControlVisible:
          controlBox.width > 0 &&
          controlBox.height > 0 &&
          controlBox.top >= mainBox.top - 1 &&
          controlBox.bottom <= mainBox.bottom + 1,
        bodyScrollRange: body.scrollHeight - body.clientHeight,
        bodyScrollTop: body.scrollTop,
        mainScrollRange: main.scrollHeight - main.clientHeight,
        horizontalOverflow,
      };
    });

    assert.ok(
      report.scrollRange > 100,
      `cards must overflow the pane (got ${report.scrollRange}px)`
    );
    assert.equal(report.scrollerOverflowY, 'auto', 'the card content remains the scroll node');
    assert.ok(report.scrolledBy > 0, 'the card scroller accepts an independent scroll');
    assert.equal(report.footerIsSibling, true, 'the pager is a sibling outside the scroll node');
    assert.equal(report.footerFullWidth, true, 'the sibling footer spans the full Parties pane');
    assert.equal(report.footerVisible, true, 'the footer remains visible inside the bounded main');
    assert.equal(report.footerStable, true, 'inner scrolling does not move the footer bounds');
    assert.equal(report.pagerControlVisible, true, 'a pager control remains visibly reachable');
    assert.equal(report.pagerControlHit, true, 'the visible pager control owns its pointer target');
    assert.ok(report.bodyScrollRange <= 1, 'the outer manager body must not scroll the footer');
    assert.equal(report.bodyScrollTop, 0, 'inner scrolling leaves the manager body fixed');
    assert.ok(report.mainScrollRange <= 1, 'the main column does not become a second scroller');
    assert.ok(
      report.horizontalOverflow.every((overflow) => overflow <= 1),
      `the 1100px route has no horizontal overflow (${report.horizontalOverflow.join(', ')})`
    );
  } finally {
    await context.close();
  }
});

test('a 680px manager container stacks each party body without viewport coupling or overflow', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const markup = withScopeHash(
      `<div class="fabricate-manager" style="container: fabricate-manager / inline-size; width: 680px">
        <div class="manager-party-body">
          <div class="manager-party-members-col"><button>Add a member</button></div>
          <div class="manager-party-travel-col"><button>Link an actor</button></div>
        </div>
      </div>`,
      'manager-party-body',
      partyExpandedBodyScoped.hashClass
    );
    await page.setContent(`<style>${partyExpandedBodyScoped.css}</style>${markup}`);
    const report = await page.evaluate(() => {
      const root = document.querySelector('.fabricate-manager');
      const body = document.querySelector('.manager-party-body');
      const rootRect = root.getBoundingClientRect();
      const controls = Array.from(body.querySelectorAll('button'), (button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          selfHit: hit === button || button.contains(hit),
        };
      });
      return {
        viewportWidth: document.documentElement.clientWidth,
        columns: getComputedStyle(body).gridTemplateColumns.split(' ').length,
        overflow: body.scrollWidth > body.clientWidth + 1,
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        controls,
      };
    });

    assert.ok(report.viewportWidth > 720, 'the outer browser viewport stays above the breakpoint');
    assert.equal(report.columns, 1, 'the 680px manager container selects one party column');
    assert.equal(report.overflow, false, 'the stacked body has no horizontal overflow');
    for (const control of report.controls) {
      assert.ok(control.width > 0 && control.height > 0, 'each editing control has a hit box');
      assert.ok(
        control.left >= report.rootLeft - 1,
        'each editing control starts inside the manager'
      );
      assert.ok(control.right <= report.rootRight + 1, 'each editing control remains reachable');
      assert.equal(control.selfHit, true, 'each editing control owns its pointer target');
    }
  } finally {
    await context.close();
  }
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

// The Difficulty card and the recipe-tier list beneath it (issue 1096 follow-up, "The roll").
// Both card contracts render into `.manager-checks-card-body` — Difficulty's plain (14px each
// side) and the tier list's `is-stack` (12px 14px) — so a row that fills its OWN list should
// already land at the same 14px inset as the radio cards above. The routed editor's tier
// section broke that by wrapping `CheckRecipeTiers` in the bare shared `.manager-inspector-card`
// shell instead of `.manager-inspector-card.manager-checks-card`: the bare shell carries its
// OWN `padding: var(--fab-space-3)` (12px) plus a border and background the card-with-padding-0
// override exists to strip, so the tier row's edges landed 12px further in on both sides than
// the Difficulty card's radio cards. Real Chromium + the real stylesheet, because happy-dom
// applies no cascade and could not see either the extra padding or the fix.
//
// ONE shared page for both the fixed and the reintroduced-defect measurement below — a second
// `page.setContent()` on the same page is all a second measurement ever needed, whether the
// browser behind it is this file's shared one or a fresh one.
async function checksRollEdges(page, tiersWrapperClass) {
  const difficultyCard = `
    <section class="manager-inspector-card manager-checks-card" data-check-difficulty-card>
      <div class="manager-checks-card-head">
        <div><h3 class="manager-checks-card-title">Difficulty</h3></div>
      </div>
      <div class="manager-checks-card-body">
        <fieldset class="manager-field is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
          <legend class="manager-resolution-mode-legend">DC source</legend>
          <div class="manager-resolution-mode-options" style="--manager-radio-card-columns: 2">
            <label class="manager-resolution-option is-active" data-dc-mode-option="static">
              <span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Static</span></span>
            </label>
            <label class="manager-resolution-option" data-dc-mode-option="dynamic">
              <span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Dynamic</span></span>
            </label>
          </div>
        </fieldset>
        <div class="manager-checks-difficulty-fields">
          <div class="manager-checks-difficulty-field is-dc">
            <span class="manager-checks-difficulty-label">Base DC</span>
          </div>
          <div class="manager-checks-difficulty-field is-comparison">
            <span class="manager-checks-difficulty-label">Comparison</span>
          </div>
        </div>
      </div>
    </section>`;
  const tiersCard = `
    <section class="${tiersWrapperClass}" data-routed-tiers>
      <div class="manager-checks-card-head">
        <div><h3 class="manager-checks-card-title">Recipe difficulty tiers</h3></div>
      </div>
      <div class="manager-checks-card-body is-stack">
        <div class="manager-checks-tier-list" role="list" aria-label="Recipe difficulty tiers">
          <div class="manager-checks-tier-row" role="listitem" data-tier-row="t1">
            <button type="button" class="manager-checks-tier-grip"><i class="fas fa-grip-vertical"></i></button>
            <input class="manager-checks-tier-name" data-tier-name value="Apprentice work">
            <span class="manager-checks-tier-unit">DC</span>
            <div class="manager-checks-tier-stepper is-narrow">
              <div class="fab-stepper is-fill">
                <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
                <input type="number" class="fab-stepper-input" data-tier-dc value="8">
                <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
              </div>
            </div>
            <button type="button" class="manager-button fab-manager-button is-danger manager-checks-tier-remove" data-remove-tier>
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <button type="button" class="manager-button fab-manager-button is-dashed" data-add-tier>
          <i class="fas fa-plus"></i><span>Add difficulty tier</span>
        </button>
      </div>
    </section>`;
  await page.setContent(
    `<style>${css}</style>` +
      `<div style="width:900px;height:800px">` +
      `<div class="fabricate-manager" data-fabricate-theme="fabricate" data-manager-view="checks-crafting">` +
      `<div class="manager-checks-editor">${difficultyCard}${tiersCard}</div>` +
      `</div></div>`
  );
  return await page.evaluate(() => {
    const round = (value) => Math.round(value);
    const options = [
      ...document.querySelectorAll('[data-check-difficulty-card] .manager-resolution-option'),
    ];
    const firstOption = options[0].getBoundingClientRect();
    const lastOption = options[options.length - 1].getBoundingClientRect();
    const row = document.querySelector('[data-tier-row]').getBoundingClientRect();
    const addTier = document.querySelector('[data-add-tier]').getBoundingClientRect();
    return {
      radioLeft: round(firstOption.left),
      radioRight: round(lastOption.right),
      rowLeft: round(row.left),
      rowRight: round(row.right),
      addTierLeft: round(addTier.left),
      addTierRight: round(addTier.right),
    };
  });
}

test('the recipe difficulty tier row shares the Difficulty card radio-card edges, and the bare card shell reintroduces the inset', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 960, height: 800 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();

    const edges = await checksRollEdges(page, 'manager-inspector-card manager-checks-card');
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
    const broken = await checksRollEdges(page, 'manager-inspector-card');
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

// The Modifiers card and its "How they combine" combination-rule grid (issue 1096 follow-up,
// found by pointing the visual-parity tooling at the real app). The studio's own control scale
// for a combination-rule card is scoped `.manager-checks-card .manager-resolution-mode-card
// .is-config-cards .manager-resolution-option`, so it only fires when the CARD ancestor carries
// `manager-checks-card`. `CraftingModifierCatalogueCard` shipped wrapped in the bare shared
// `.manager-inspector-card` shell instead — the identical defect the recipe-tier list above was
// fixed for — so the card took the generic 8px radius and translucent fill, and the
// combination-rule cards fell back to the shared `RadioCardGroup` primitive's own generic
// padding and gap instead of the studio's 13px/11px. Real Chromium + the real stylesheet, for
// the same reason the tier-row measurement above needs both.
async function modifiersCombinationRuleMetrics(page, cardWrapperClass) {
  const card = `
    <section class="${cardWrapperClass}" data-crafting-modifier-catalogue="crafting">
      <h3 class="manager-card-title">Named modifiers</h3>
      <fieldset class="manager-field is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
        <legend class="manager-resolution-mode-legend">How they combine</legend>
        <div class="manager-resolution-mode-options" style="--manager-radio-card-columns: 2">
          <label class="manager-resolution-option is-active" data-crafting-modifier-policy-option="addAll">
            <span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Add all</span></span>
          </label>
          <label class="manager-resolution-option" data-crafting-modifier-policy-option="highest">
            <span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Highest</span></span>
          </label>
        </div>
      </fieldset>
    </section>`;
  await page.setContent(
    `<style>${css}</style>` +
      `<div style="width:900px;height:600px">` +
      `<div class="fabricate-manager" data-fabricate-theme="fabricate" data-manager-view="checks-crafting">` +
      `<div class="manager-checks-editor">${card}</div>` +
      `</div></div>`
  );
  return await page.evaluate(() => {
    const round = (value) => Math.round(value * 100) / 100;
    const section = document.querySelector('[data-crafting-modifier-catalogue]');
    const sectionCs = getComputedStyle(section);
    const option = document.querySelector('.manager-resolution-option');
    const optionCs = getComputedStyle(option);
    return {
      cardRadius: round(parseFloat(sectionCs.borderTopLeftRadius)),
      cardBackground: sectionCs.backgroundColor,
      optionPaddingLeft: round(parseFloat(optionCs.paddingLeft)),
      optionPaddingTop: round(parseFloat(optionCs.paddingTop)),
      optionGap: optionCs.columnGap,
      optionRadius: round(parseFloat(optionCs.borderTopLeftRadius)),
    };
  });
}

test('the modifiers card and its combination-rule cards take the studio scale, and the bare shell reintroduces the generic one', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 960, height: 700 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();

    const fixed = await modifiersCombinationRuleMetrics(
      page,
      'manager-inspector-card manager-checks-card'
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
    const broken = await modifiersCombinationRuleMetrics(page, 'manager-inspector-card');
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
    resolve(__dirname, '../../src/ui/svelte/apps/manager/EditorValidationSurface.svelte'),
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
  const context = await sharedBrowser.newContext({ viewport: { width: 600, height: 300 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><div class="fabricate-manager">` +
        `<button type="button" class="manager-status-toggle is-on" id="live">` +
        `<span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>` +
        `<span class="manager-status-toggle-label">On</span></button>` +
        `<span class="manager-status-toggle is-locked is-on" role="img" aria-label="Check is on" id="locked">` +
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

// ── The outcome band strip's fill, its swatch key, and the AA the names need (issue 1096) ──
//
// Everything below is measured in a real browser, and the reason is that NOTHING else in the
// repo can see these facts. The mounted suites assert the inline custom property the editor
// emits, which stays true after the rule that CONSUMES it is renamed or deleted: renaming
// `.fab-band-strip-band` to `.fab-band-strip-band-unused` — a total visual break, since that
// rule carries `position`, `width`, `overflow` AND the background — left the mounted suite
// green. And `color-mix()` cannot be evaluated at all outside a browser, so the contrast the
// band names actually get was invisible to every gate here until this one.
const bandStripPath = resolve(
  __dirname,
  '../../src/ui/svelte/components/ThresholdBandStrip.svelte'
);
const checkEditorPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte'
);
const bandStripScoped = scopedComponentCss(bandStripPath);
const checkEditorSource = readFileSync(checkEditorPath, 'utf8');

/** Renders a fixture against the real sheet plus the strip's own scoped CSS, in one context. */
async function withBandStripPage(run) {
  const context = await sharedBrowser.newContext({ viewport: { width: 900, height: 400 } });
  const page = await context.newPage();
  try {
    return await run(page);
  } finally {
    await context.close();
  }
}

/**
 * The strip's fixture, stamped with the real scope hash on EVERY class the component's own
 * `<style>` addresses — not just the band.
 *
 * `withScopeHash` matches a whole class token, so stamping only `fab-band-strip-band` left
 * `fab-band-strip-band-name` unstamped and its scoped rule matching nothing. That was
 * invisible while the rule declared `color: var(--fab-text)`, because an unmatched rule and
 * an inherited `--fab-text` paint the same pixels; it stops being invisible the moment the
 * name takes an ink of its own, which is exactly the change this fixture now has to see.
 */
function bandStripFixture(body) {
  const stamped = [
    'fab-band-strip-track',
    'fab-band-strip-band',
    'fab-band-strip-band-name',
  ].reduce(
    (markup, className) => withScopeHash(markup, className, bandStripScoped.hashClass),
    body
  );
  return `<style>${css}</style><style>${bandStripScoped.css}</style>${stamped}`;
}

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
        '<section class="manager-inspector-card manager-checks-card" data-outcome-bands>' +
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

// ── The tool studio is the AUTHORITY for a manager button (issue 1096) ─────────────────────
//
// The reported defect was that the Modifiers card's buttons did not look like the Tool
// Studio's: a bare `manager-button` for a destructive verb, and a visibly different label
// scale. The cause is structural rather than a typo. The Tool Studio's refined treatment
// comes from ANCESTOR-CONTEXT rules — `.manager-header-actions .manager-button` and
// `.manager-tool-edit-actions .manager-button` — so a card that is inside neither could
// never match them however carefully its class string was written.
//
// A shared component that merely emits the same class names would not have caught this and
// will not catch the next one: the drift lives in the SHEET, not in the markup. So the
// equivalence is measured, in a real browser, on the two roles the maintainer's screenshot
// shows drifting. `ManagerButton.svelte`'s own class list is read out of the component
// rather than restated here, so a fixture that stopped matching what the component emits
// fails instead of quietly measuring markup the product no longer renders.
const managerButtonPath = resolve(__dirname, '../../src/ui/svelte/components/ManagerButton.svelte');
const managerButtonSource = readFileSync(managerButtonPath, 'utf8');

// The role modifier is read from the component's NAMED mapping rather than rebuilt here as
// `is-${role}`. `warning` emits `is-warning-action` — the sheet declares no
// `.manager-button.is-warning` at all — so a template would hand this harness a class string
// the product never renders, and the probe would measure a selector that matches nothing
// while reporting green (issue 1118).
const managerButtonRoleClasses = (() => {
  const mapping = managerButtonSource.match(/const ROLE_CLASSES = \{([\s\S]*?)\};/);
  assert.ok(mapping, 'ManagerButton declares its role-to-class mapping as one named object');
  return Object.fromEntries(
    [...mapping[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map(([, role, className]) => [role, className])
  );
})();

// The two unconditional classes, likewise read out of the component rather than restated.
const managerButtonBaseClasses = (() => {
  const literal = managerButtonSource.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, 'ManagerButton declares its emitted classes as one array literal');
  const base = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(
    base.includes('manager-button') && base.includes('fab-manager-button'),
    `ManagerButton must emit both the convention class and the primitive class, got ${base.join(' ')}`
  );
  return base;
})();

function managerButtonClassesFor(role) {
  // `neutral` is the EMPTY modifier — the primitive emits the two base classes and nothing
  // more — so it is the one role that cannot be probed by looking a class name up, and the
  // one role a mutation cannot flip by deleting a prop.
  if (role === 'neutral') return managerButtonBaseClasses.join(' ');
  const modifier = managerButtonRoleClasses[role];
  assert.ok(
    modifier,
    `ManagerButton must declare a class for the '${role}' role, got ${Object.keys(managerButtonRoleClasses).join(' ')}`
  );
  return `${managerButtonBaseClasses.join(' ')} ${modifier}`;
}

const AUTHORITY_PROBES = ['primary', 'danger'];

test('a Modifiers card button renders exactly like the tool studio button of the same role', async () => {
  const context = await sharedBrowser.newContext({
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

// ── A SWITCHED-OFF manager button looks switched off, in every role AND every container ───
//
// The reported state of the sheet was that it did not. `.manager-button:disabled` is (0,3,0);
// `.manager-button.is-primary`, `.is-danger` and `.is-warning-action` are (0,3,0) too and
// stand LATER in the file, and the primitive's `is-ghost` and `is-dashed` companions are
// (0,4,0) and beat it outright. Every one of those declares border-color, colour and
// background with no `:disabled` requirement, so a disabled button kept its enabled paint in
// every role. `opacity: 0.62` and `cursor: default` still applied — which is why it read as a
// dimmed LIVE control rather than a dead one, and why three rounds of plan review walked past
// it. It was already shipping on the screen this conversion designates as the authority:
// `ToolEditView` renders `role="ghost"` with `disabled={saving}`, so the Back button looked
// available for the whole of a tool save.
//
// The repair qualifies every resting-paint rule with `:not(:disabled)` rather than chaining
// the disabled rule above them, because that selector also serves `.manager-icon-button` and
// every hand-written button the sweep does not convert; chaining it would have taken the
// disabled paint from exactly the controls with no other. So this measures the INVARIANT the
// repair states — the disabled paint is role-independent — rather than re-deriving the
// arithmetic that made it false.
//
// ── WHY IT PROBES EVERY CONTAINER, AND WHY THE CONTAINER LIST IS DERIVED ─────────────────
// The first version of this gate mounted its six probes inside `.manager-edit-card` and
// nothing else, so it measured the invariant against the ROLE rules alone. It was green while
// `.fabricate-manager .manager-tool-edit-actions .manager-button.is-ghost` — (0,4,0),
// unqualified, three colour declarations — still beat the disabled rule outright in the one
// container the Tool Studio's Back button actually sits in. The defect this whole section is
// named for was live, in the exact control the issue cites, underneath a passing test.
//
// A hand-written container list would have repeated that failure one container later, so the
// list is DERIVED from the sheet: every rule whose key compound is a `.manager-button` and
// which names an ancestor between `.fabricate-manager` and that compound contributes its
// ancestor chain, materialized as real elements. Add an ancestor-context rule to the sheet
// and the probe follows it there on the next run, with no edit here. `ANCESTOR_CONTEXT_FLOOR`
// and the named-context assertion below are what stop a parse break from emptying the list
// and reporting green over nothing.
//
// Ancestors are materialized as nested elements, so a `>` combinator is honoured and a `+`
// or `~` one is not: a sibling context is collected as UNMATERIALIZABLE and reds the gate
// rather than being silently dropped. The sheet has none today.
const DISABLED_ROLE_PROBES = ['neutral', 'primary', 'ghost', 'danger', 'dashed', 'warning'];

/**
 * Every rule prelude in a stylesheet, with comments blanked and at-rule preludes dropped.
 *
 * Rules nested inside an `@media`/`@container` block are included: a container is a container
 * whatever guards it, and a probe that skipped them would be blind to exactly the responsive
 * overrides this sheet uses to re-type a header cluster at narrow widths.
 *
 * @param {string} sheet stylesheet text
 * @returns {Array<string>} one prelude per rule
 */
function rulePreludes(sheet) {
  const text = sheet.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
  const preludes = [];
  let depth = 0;
  let start = 0;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char !== '{' && char !== '}' && !(char === ';' && depth <= 1)) continue;
    if (char === '{' && depth <= 1) preludes.push(text.slice(start, cursor).trim());
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    start = cursor + 1;
  }
  return preludes.filter((prelude) => prelude !== '' && !prelude.startsWith('@'));
}

const CLASS_TOKEN = /\.([\w-]+)/g;
const ATTRIBUTE_TOKEN = /\[([\w-]+)="([^"]*)"]/g;

/**
 * A compound selector as a renderable element, or `null` when it cannot be one.
 *
 * Classes and quoted attribute selectors are materialized; anything else left in the compound
 * — a pseudo-class, a type selector, a universal — means the caller must not pretend it can
 * render this context, so it says so instead of rendering an approximation.
 *
 * @param {string} compound one compound selector, e.g. `.fabricate-manager[data-x="y"]`
 * @returns {{classes: Array<string>, attributes: string}|null} the element, or null
 */
function elementForCompound(compound) {
  const classes = [...compound.matchAll(CLASS_TOKEN)].map(([, name]) => name);
  const attributes = [...compound.matchAll(ATTRIBUTE_TOKEN)]
    .map(([, name, value]) => ` ${name}="${value}"`)
    .join('');
  const residue = compound.replaceAll(CLASS_TOKEN, '').replaceAll(ATTRIBUTE_TOKEN, '');
  if (residue !== '' || classes.length === 0) return null;
  return { classes, attributes };
}

/**
 * The ancestor chain a manager-button selector names, or `null` when it names none.
 *
 * @param {string} selector one selector from a rule's prelude
 * @returns {{id: string, root: object, chain: Array<object>}|null|'unmaterializable'}
 */
function ancestorContextIn(selector) {
  const one = selector.trim().replaceAll(/\s+/g, ' ');
  if (!one.includes('.manager-button')) return null;
  // A comma inside `:is(…)`/`:not(…)` would have been split by the caller, leaving a fragment
  // with unbalanced parentheses. Such a fragment is not a selector and is not reasoned about.
  if ((one.match(/\(/g) || []).length !== (one.match(/\)/g) || []).length) return null;
  const compounds = one.split(/\s*>\s*|\s+/).filter(Boolean);
  if (!compounds.at(-1).includes('.manager-button')) return null;
  const ancestors = compounds.slice(1, -1);
  if (ancestors.length === 0) return null;
  if (/[+~]/.test(one)) return 'unmaterializable';
  const root = elementForCompound(compounds[0]);
  const chain = ancestors.map((compound) => elementForCompound(compound));
  if (!root || !root.classes.includes('fabricate-manager') || chain.includes(null)) {
    return 'unmaterializable';
  }
  return { id: [compounds[0], ...ancestors].join(' '), root, chain };
}

// The Modifiers card, kept as the first context because it is the one the reported defect was
// first measured in and the only one that is NOT an ancestor-context rule of its own — a
// manager button with no container opinion at all is the base case the roles are ruled for.
const BASE_DISABLED_CONTEXT = {
  id: '.fabricate-manager .manager-edit-card',
  root: { classes: ['fabricate-manager'], attributes: '' },
  chain: [{ classes: ['manager-edit-card'], attributes: '' }],
};

// A floor, not a count: the exact number moves whenever the sheet gains or retires a container
// rule, and pinning it would turn every such edit into a failure here. What must never happen
// is the list going empty or near-empty through a parse break, which is the failure mode that
// would make this whole gate vacuous while reporting green.
const ANCESTOR_CONTEXT_FLOOR = 10;

// Named because each is a container the issue's own findings turn on: the Tool Studio's Back
// button cluster, the 27-site editor header, the knowledge rows, the drop inspector's stack
// and the Checks Studio preset row, whose `background` was the SECOND rule found beating the
// disabled invariant from a container.
const REQUIRED_DISABLED_CONTEXTS = [
  '.manager-tool-edit-actions',
  '.manager-header-actions',
  '.manager-knowledge-row-actions',
  '.manager-drop-inspector-stack',
  '.manager-checks-trigger-presets',
];

const { contexts: DISABLED_CONTEXTS, unmaterializable: UNMATERIALIZABLE_CONTEXTS } = (() => {
  const found = new Map([[BASE_DISABLED_CONTEXT.id, BASE_DISABLED_CONTEXT]]);
  const rejected = new Set();
  for (const prelude of rulePreludes(css)) {
    for (const selector of prelude.split(',')) {
      const context = ancestorContextIn(selector);
      if (context === null) continue;
      if (context === 'unmaterializable') rejected.add(selector.trim());
      else if (!found.has(context.id)) found.set(context.id, context);
    }
  }
  return { contexts: [...found.values()], unmaterializable: [...rejected] };
})();

function disabledProbeMarkup(context, index) {
  const probes = DISABLED_ROLE_PROBES.map(
    (role) =>
      `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="on-${index}-${role}"><span>Save</span></button>` +
      `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="off-${index}-${role}" disabled><span>Save</span></button>`
  ).join('');
  const open = context.chain
    .map((element) => `<div class="${element.classes.join(' ')}"${element.attributes}>`)
    .join('');
  const close = context.chain.map(() => '</div>').join('');
  return `<main class="${context.root.classes.join(' ')}"${context.root.attributes}>${open}${probes}${close}</main>`;
}

test('a disabled manager button paints from the disabled rule in every role and container', async () => {
  assert.deepEqual(
    UNMATERIALIZABLE_CONTEXTS,
    [],
    'every ancestor-context rule for a manager button must be renderable by this probe — ' +
      'teach `elementForCompound` the new shape rather than letting a container go unprobed'
  );
  assert.ok(
    DISABLED_CONTEXTS.length >= ANCESTOR_CONTEXT_FLOOR,
    `the sheet must yield at least ${ANCESTOR_CONTEXT_FLOOR} manager-button containers, got ` +
      `${DISABLED_CONTEXTS.length} — a shorter list means the prelude scan broke, not that the ` +
      'sheet stopped styling containers'
  );
  for (const required of REQUIRED_DISABLED_CONTEXTS) {
    assert.ok(
      DISABLED_CONTEXTS.some((context) => context.id.includes(required)),
      `${required} must be among the derived containers, got ${DISABLED_CONTEXTS.map((context) => context.id).join(' | ')}`
    );
  }

  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const roots = DISABLED_CONTEXTS.map((entry, index) => disabledProbeMarkup(entry, index)).join(
      ''
    );

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 16px; }
          </style>
        </head>
        <body>
          ${roots}
          <main class="fabricate-manager">
            <!-- The tokens the disabled rule NAMES, resolved by the browser in this theme, so
                 the assertions below pin the paint to that rule rather than to whatever the
                 six probes happen to agree on. -->
            <span data-token="border" style="color: var(--fab-overlay-light-12)"></span>
            <span data-token="ink" style="color: var(--fab-text-muted)"></span>
            <span data-token="surface" style="color: var(--fab-overlay-light-04)"></span>
            <span data-token="ghost-border" style="color: var(--fab-border)"></span>
          </main>
        </body>
      </html>
    `);

    const measured = await page.evaluate(
      ({ roles, count }) => {
        const paintOf = (element) => {
          const style = getComputedStyle(element);
          return {
            borderColor: style.borderTopColor,
            color: style.color,
            background: style.backgroundColor,
            opacity: style.opacity,
            borderStyle: style.borderTopStyle,
            height: `${Math.round(element.getBoundingClientRect().height)}px`,
          };
        };
        const read = (probe) => {
          const element = document.querySelector(`[data-probe="${probe}"]`);
          return element ? paintOf(element) : null;
        };
        const perContext = (state) =>
          Array.from({ length: count }, (unused, index) =>
            Object.fromEntries(roles.map((role) => [role, read(`${state}-${index}-${role}`)]))
          );
        const token = (name) =>
          getComputedStyle(document.querySelector(`[data-token="${name}"]`)).color;
        return {
          on: perContext('on'),
          off: perContext('off'),
          tokens: {
            border: token('border'),
            ink: token('ink'),
            surface: token('surface'),
            ghostBorder: token('ghost-border'),
          },
        };
      },
      { roles: DISABLED_ROLE_PROBES, count: DISABLED_CONTEXTS.length }
    );

    // Collected rather than thrown one at a time. `assert` stops at the first failure, and
    // the first container in sheet order is not the interesting one — the run that proved
    // this widening reds before the repair reported only `.manager-checks-trigger-presets`
    // and said nothing at all about `.manager-tool-edit-actions`, which is the container the
    // issue names. A gate over a matrix has to report the matrix.
    const violations = [];
    const record = (condition, message) => {
      if (!condition) violations.push(message);
    };
    const samePaint = (left, right) =>
      left.borderColor === right.borderColor &&
      left.color === right.color &&
      left.background === right.background;

    for (const [index, entry] of DISABLED_CONTEXTS.entries()) {
      const on = measured.on[index];
      const off = measured.off[index];

      for (const role of DISABLED_ROLE_PROBES) {
        record(on[role], `${entry.id}: the enabled ${role} probe did not render`);
        record(off[role], `${entry.id}: the disabled ${role} probe did not render`);
      }
      if (DISABLED_ROLE_PROBES.some((role) => !on[role] || !off[role])) continue;

      // NON-VACUITY, and the one that would have caught the defect on its own: the sheet must
      // actually reach these probes. If it did not, every role would report the UA default and
      // the equality below would hold over nothing.
      record(
        on.ghost.borderColor === measured.tokens.ghostBorder,
        `${entry.id}: the enabled ghost must take the primitive's resting border ` +
          `${measured.tokens.ghostBorder}, got ${on.ghost.borderColor} — this fixture is unstyled`
      );

      const disabledPaint = {
        borderColor: measured.tokens.border,
        color: measured.tokens.ink,
        background: measured.tokens.surface,
      };

      for (const role of DISABLED_ROLE_PROBES) {
        record(
          samePaint(off[role], disabledPaint),
          `${entry.id}: a disabled ${role} button must paint from .manager-button:disabled, ` +
            `not from its role or its container — got border ${off[role].borderColor}, ink ` +
            `${off[role].color}, fill ${off[role].background}; expected border ` +
            `${disabledPaint.borderColor}, ink ${disabledPaint.color}, fill ${disabledPaint.background}`
        );
        record(
          off[role].opacity === '0.62',
          `${entry.id}: a disabled ${role} button must keep the disabled rule's opacity, got ${off[role].opacity}`
        );
        record(
          !samePaint(off[role], on[role]),
          `${entry.id}: the ${role} role must PAINT differently when enabled, or its probe proves nothing`
        );
      }

      // The dashed role is why the reconciliation splits paint from geometry rather than
      // qualifying one rule: switching a control off must take its colours, never its shape.
      // A `border` shorthand under `:not(:disabled)` would have taken the dashed edge with it.
      record(
        off.dashed.borderStyle === 'dashed',
        `${entry.id}: a disabled dashed button must keep its dashed edge, got ${off.dashed.borderStyle}`
      );
      record(
        off.dashed.height === on.dashed.height,
        `${entry.id}: a disabled dashed button must keep the control height it had when ` +
          `enabled, got ${off.dashed.height} against ${on.dashed.height}`
      );
    }

    assert.deepEqual(
      violations,
      [],
      `the disabled paint must be role-independent AND container-independent:\n- ${violations.join('\n- ')}`
    );
  } finally {
    await context.close();
  }
});

// ── The `warning` role paints, and the spelling it replaces never did (issue 1118) ────────
//
// This is the defect that put a sixth role in the primitive's vocabulary, measured from both
// sides. `environment/CompositionList.svelte` renders ONE verb — the same `onForceInclude`,
// the same `data-action="force-include"`, the same localization key — from two places, and one
// of them wrote `class="manager-button is-warning"`. The sheet declares
// `.manager-button.is-warning-action` and declares `.manager-button.is-warning` NOWHERE, so
// that Force add shipped with no warning treatment at all while the amber treatment shipped
// with no call site: a defect and a dead rule, from one typo, on a pair of buttons that are the
// same verb.
//
// The role is what makes the typo unrepeatable — `role="warning"` names a vocabulary entry and
// the primitive owns which class it emits — so the assertion is on the emitted class rather
// than on a class string anyone has to remember. The MISSPELT probe is kept beside it as the
// negative control, and it is not decoration: it is the only thing that distinguishes "the
// warning role paints" from "these two probes both landed on the base control and agree".
test('the warning role paints amber, and the is-warning spelling it replaces paints nothing', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const neutral = managerButtonClassesFor('neutral');
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 16px; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <section class="manager-edit-card">
              <button type="button" class="${managerButtonClassesFor('warning')}" data-probe="warning"><span>Force add</span></button>
              <button type="button" class="${neutral} is-warning" data-probe="misspelt"><span>Force add</span></button>
              <button type="button" class="${neutral}" data-probe="neutral"><span>Force add</span></button>
              <span class="manager-icon-button is-warning-action" data-probe="icon"></span>
            </section>
            <span data-token="border" style="color: var(--fab-warning-border)"></span>
            <span data-token="ink" style="color: var(--fab-warning-text)"></span>
            <span data-token="surface" style="color: var(--fab-warning-soft)"></span>
          </main>
        </body>
      </html>
    `);

    const measured = await page.evaluate(() => {
      const paintOf = (probe) => {
        const style = getComputedStyle(document.querySelector(`[data-probe="${probe}"]`));
        return {
          borderColor: style.borderTopColor,
          color: style.color,
          background: style.backgroundColor,
        };
      };
      const token = (name) =>
        getComputedStyle(document.querySelector(`[data-token="${name}"]`)).color;
      return {
        warning: paintOf('warning'),
        misspelt: paintOf('misspelt'),
        neutral: paintOf('neutral'),
        icon: paintOf('icon'),
        tokens: { border: token('border'), ink: token('ink'), surface: token('surface') },
      };
    });

    assert.deepEqual(
      measured.warning,
      {
        borderColor: measured.tokens.border,
        color: measured.tokens.ink,
        background: measured.tokens.surface,
      },
      'a warning manager button computes the three amber tokens the sheet names for it'
    );
    // The defect itself, still measurable: `is-warning` selects nothing, so a button wearing
    // it is indistinguishable from a bare neutral one.
    assert.deepEqual(
      measured.misspelt,
      measured.neutral,
      'the `is-warning` spelling this role replaces still matches NO rule, which is why the ' +
        'site that used it shipped with no warning treatment at all'
    );
    assert.notDeepEqual(
      measured.warning,
      measured.neutral,
      'and the role must differ from neutral, or the amber assertion above proves nothing'
    );
    // The pair this repair originally reunited no longer exists. Issue 1315 moved Force add to
    // automatic composition mode, where it renders as the labelled button alone; the icon twin
    // lived in the manual-mode Available-to-add list, which is now plain add/remove, and it was
    // deleted along with `.manager-icon-button.is-warning-action`. Asserting the two paint alike
    // would compare the live control against a class nothing writes — green, and about nothing.
    // What still matters is the half that survived, already asserted above: the role paints amber
    // and the `is-warning` spelling it replaces paints nothing.
  } finally {
    await context.close();
  }
});

// ── One toolbar control, three browsers, one scale (issue 1118) ───────────────────────────
//
// Asc/Desc beside a sort select is the same control in the recipe, component and essence
// browsers, and the essence one has never rendered like the other two. It carried
// `manager-essence-sort-direction`, a class this sheet declares NOWHERE — so it matched no
// rule of its own and painted from the base control: a 6px corner at weight 700 beside two
// siblings at 9px and 600, in a toolbar whose selects and segmented toggles are all at the
// compact scale.
//
// That divergence PRE-DATES the conversion sweep, which is why it is measured rather than
// asserted from the sheet. A source pin cannot tell "this rule reaches the control" from
// "this rule exists and reaches nothing", and the whole defect was the second of those: the
// class was written, looked deliberate, and styled nothing for as long as it shipped.
//
// The essence probe is addressed by the `data-*` hook rather than a class because the dead
// class went with the conversion — the primitive emits the two base classes and the site
// keeps the hook it always had.
const SORT_DIRECTION_PROBES = Object.freeze([
  Object.freeze({ probe: 'recipe', attributes: 'class="manager-recipe-sort-direction"' }),
  Object.freeze({ probe: 'component', attributes: 'class="manager-component-sort-direction"' }),
  Object.freeze({ probe: 'essence', attributes: 'data-essence-sort-direction="asc"' }),
]);

test('all three browser sort-direction toggles render as one control', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const base = managerButtonClassesFor('neutral');
    const toggles = SORT_DIRECTION_PROBES.map(({ probe, attributes }) => {
      // The bespoke class travels through the primitive's APPENDING `class` prop, so the
      // rendered element carries both — build the string the way the component joins it
      // rather than restating one of the two spellings.
      const extra = /class="([^"]*)"/.exec(attributes)?.[1] ?? '';
      const hook = extra ? '' : ` ${attributes}`;
      return `<button type="button" class="${[base, extra].filter(Boolean).join(' ')}"${hook} data-probe="${probe}"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;
    }).join('');
    // NEGATIVE CONTROL: the same primitive with neither the class nor the hook. It is what
    // the essence toggle measured before this rule, so if it matched the three below, the
    // rule would be reaching nothing and every equality here would hold trivially.
    const bare = `<button type="button" class="${base}" data-probe="bare"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;
    // AND A SECOND CONTROL, added when the primitive's own control rule took the 34-38px band's
    // 9px corner (issue 1371, maintainer ruling M12a). Before that, `borderRadius` was the
    // discriminator this test used to prove the toolbar rule had reached its fixture at all: 9px
    // against the bare primitive's 6px. The primitive is 9px now, so that half of the control has
    // been superseded rather than lost — `fontWeight` still discriminates (600 against 700), and
    // this probe carries `manager-button` WITHOUT `fab-manager-button`, which is what an
    // unconverted hand-written button is and is still on the base rule's 6px. So the corner is
    // measured in a real browser on both sides of the conversion boundary instead.
    //
    // IT MODELS A STRING THE PRODUCT STILL RENDERS, which is what earns it its row in
    // `manager-button-source-contract.test.js`'s fixture allowlist rather than a conversion:
    // `ComponentComplicationsSection.svelte` passes a bare `triggerClass="manager-button"` to
    // `SearchablePopover`, so this is population B as well as the unconverted half of a pair.
    // That allowlist row names the file and the literal and READS them, so this fixture cannot
    // outlive the call site it models. Converting this probe would make it measure 9px, the
    // equality below would hold trivially, and M12a's blast-radius claim would be gone.
    const unconverted = `<button type="button" class="manager-button" data-probe="unconverted"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 16px; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="manager-toolbar">${toggles}${bare}${unconverted}</div>
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
          gap: style.gap,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          height: `${Math.round(element.getBoundingClientRect().height)}px`,
          borderRadius: style.borderRadius,
        };
      };
      return Object.fromEntries(
        ['recipe', 'component', 'essence', 'bare', 'unconverted'].map((probe) => [
          probe,
          read(probe)
        ])
      );
    });

    for (const probe of ['recipe', 'component', 'essence', 'bare', 'unconverted']) {
      assert.ok(measured[probe], `the ${probe} probe rendered`);
    }

    // Non-vacuity: the rule reached the fixture at all. 9px and 600 are what it declares; the
    // bare PRIMITIVE declares 700 and, since issue 1371's M12a ruling, the same 9px — so weight
    // is the discriminator and the corner is now the thing the third probe measures.
    assert.equal(measured.recipe.borderRadius, '9px', 'the toolbar rule reached the fixture');
    assert.equal(measured.bare.fontWeight, '700', 'and the bare primitive is at the base weight');
    assert.notEqual(
      measured.bare.fontWeight,
      measured.recipe.fontWeight,
      'so the bare probe still discriminates — an equality that held for every property would mean the rule was reaching nothing'
    );

    // M12a, measured: the CONVERTED control is on the 34-38px band's 9px corner and the
    // unconverted hand-written button is still on the base rule's 6px, so the ruling moved the
    // primitive and not the whole `.manager-button` family.
    assert.equal(measured.bare.borderRadius, '9px', 'a converted manager button paints the band corner');
    assert.equal(
      measured.unconverted.borderRadius,
      '6px',
      'and an unconverted hand-written one still paints the base control, so the edit is scoped to the primitive'
    );

    for (const property of ['gap', 'fontSize', 'fontWeight', 'padding', 'height', 'borderRadius']) {
      assert.equal(
        measured.essence[property],
        measured.recipe[property],
        `the essence toggle's ${property} (${measured.essence[property]}) must match the recipe browser's (${measured.recipe[property]})`
      );
      assert.equal(
        measured.component[property],
        measured.recipe[property],
        `the component toggle's ${property} (${measured.component[property]}) must match the recipe browser's (${measured.recipe[property]})`
      );
    }
  } finally {
    await context.close();
  }
});

// ── The Checks rail's CONTROL TYPE SCALE (issue 1097 follow-up) ────────────────────────────
//
// Three reported defects, one measurement, because all three are the same failure: a control
// that matched no rule stating its type and silently took whatever it inherited.
//
//  - The two "Preview as" controls sat in a `.manager-field`, so they took that wrapper's
//    0.82rem/700 BY INHERITANCE. Inheritance is invisible to every gate this repo has: no
//    rule declares it, so a source-text pin cannot see it and a per-region parity comparison
//    has no region to compare. They rendered at 13.12px/700 against the prototype's 11.5/500.
//  - The simulator's roll action was a hand-written `manager-button is-primary`, and the base
//    `.manager-button` rule states no `font-size` at all — so it landed on Foundry's own 14px
//    app base, larger still, next to a studio whose every other button reads at 11.52px.
//
// MEASURED, in Chromium, under the real Foundry core sheet, because that last one only
// happens when Foundry's stylesheet is present. The two NEGATIVE CONTROLS below are what
// stop this passing vacuously: they are the exact class strings the defect shipped with, and
// each must still measure WRONG, or the rules being asserted are doing nothing.
const CHECKS_RAIL_FOUNDRY_CSS = readFileSync(
  resolve(__dirname, '../fixtures/foundry-core-min.css'),
  'utf8'
);

test('the Checks rail states its own control type scale instead of inheriting one', async () => {
  const context = await sharedBrowser.newContext({
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
                      <section class="manager-inspector-card" data-checks-preview-as>
                        <div class="fabricate-picker manager-travel-picker manager-checks-preview-actor">
                          <button type="button" data-probe="preview-actor" data-checks-preview-actor
                            class="manager-button manager-travel-picker-trigger manager-checks-preview-actor-trigger">
                            <i class="fas fa-user-slash"></i><span class="manager-travel-picker-value">No actor</span>
                          </button>
                        </div>
                        <label class="manager-field">
                          <span class="sr-only">Preview against record</span>
                          <select data-probe="preview-record" data-checks-preview-record><option>Uncommon Craft</option></select>
                        </label>
                        <label class="manager-field">
                          <span>Result difficulties</span>
                          <input type="text" data-probe="preview-difficulties" value="6, 9, 14">
                        </label>
                      </section>
                      <section class="manager-inspector-card" data-checks-simulator>
                        <div class="manager-checks-simulator">
                          <button type="button" data-probe="roll" data-checks-simulator-roll
                            class="manager-button fab-manager-button is-primary manager-checks-simulator-roll">
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
                <label class="manager-field">
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

// ── The bounds steppers must render "Unbounded" in full (issue 1096) ───────────────────────
//
// Reported from a live build: with icon and label taking the row's growth, the two bound
// steppers collapsed to roughly 70px each and the `Unbounded` placeholder truncated to
// `Unb`. That placeholder is the ONLY thing on the control that says an empty bound means
// no limit rather than a limit of zero, so a truncation there is not cosmetic — it deletes
// the field's meaning. `empty is not zero` is a documented product rule, and this is where a
// GM reads it.
//
// It is MEASURED rather than eyeballed, and measured the only way an `<input>` placeholder
// can be: an input's `scrollWidth` always equals its `clientWidth`, so overflow is invisible
// to the DOM. The text is measured against the input's own computed font with a canvas
// metric and compared to the content box.
const MODIFIER_BOUNDS_ROW_WIDTHS = [1280, 1120, 960, 831, 680];

// `Stepper` owns its chrome in a scoped `<style>`, and the whole measurement turns on ONE of
// its rules: `.fab-stepper.is-fill … .fab-stepper-input { flex: 1 1 0; width: auto;
// min-width: 0 }` is what makes the input obey the track it is given. Without the compiled
// CSS the fixture renders a UA-default `<input>` — 181px wide and happily overflowing an
// 80px stepper — so every width would "fit" and the gate would prove nothing. It is stamped
// with the real scoping hash and appended after the global sheet, exactly as `css: 'injected'`
// ships it.
const stepperScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
);

function withStepperHash(markup) {
  return ['fab-stepper', 'fab-stepper-input', 'fab-stepper-adjunct'].reduce(
    (current, token) => withScopeHash(current, token, stepperScoped.hashClass),
    markup
  );
}

test('the modifier row gives every field room for its longest content at every manager width', async () => {
  const context = await sharedBrowser.newContext({ deviceScaleFactor: 1 });

  try {
    const stepper = (bound) =>
      `<div class="fab-stepper is-fill"><button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button><input type="number" class="fab-stepper-input" data-stepper-input data-world-modifier-field="${bound}" placeholder="Unbounded"><button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button></div>`;
    const boundField = (bound, caption) =>
      `<div class="manager-field manager-modifier-bound-field" data-bound="${bound}"><span class="manager-recipe-micro-label">${caption}</span>${stepper(bound)}</div>`;
    // The icon field's `<div class="fabricate-icon-picker essence-icon-picker">` is the picker's
    // own root element, which this copy omitted until issue 1470. The trigger's geometry rules are
    // rooted at it now, so without it the field measures a bare button rather than the 38px combo
    // the row is being asserted to have room for.
    const editor = `
      <div class="manager-modifier-body manager-character-modifier-editor">
        <div class="manager-modifier-name-row">
          <div class="manager-field manager-modifier-icon-field"><span>Icon</span><div class="fabricate-icon-picker essence-icon-picker"><button type="button" class="essence-icon-picker-trigger"><i class="fas fa-leaf"></i></button></div></div>
          <label class="manager-field manager-modifier-label-field"><span>Label</span><input type="text" data-modifier-label value="Herbalism"></label>
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

// ── The simulator's face tile and the odds row (issue 1097) ─────────────────────────────
//
// Both are surfaces a mounted assertion CANNOT judge. `CheckOutcomePreview` layers the
// rolled face over a `Medallion` with `position: absolute; inset: 0`, and `CheckOddsPanel`
// lays its rows out on a three-track grid — neither of which happy-dom computes, so a
// scoped selector renamed out from under either rule would leave every mounted assertion
// green while the tile printed its digit beside the medallion instead of on it. That is
// not hypothetical: the FIRST version of the face tile omitted the offsets, so the digit
// landed at its static position to the RIGHT of the medallion and underneath the breakdown
// line. It rendered, it was in the DOM, and it was invisible in the published frame.
const previewScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte')
);
const oddsScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte')
);

test('the simulator face tile layers the rolled digit ON the medallion, not beside it', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
    // Svelte scopes DESCENDANTS with `:where(.svelte-<hash>)`, so the hash has to land on
    // every element the rules reach — not only on the token `withScopeHash` stamps. A
    // fixture that stamped the wrapper alone would compute `position: static` and read as
    // a defect in the component rather than in the fixture.
    const hash = previewScoped.hashClass;
    await page.setContent(
      `<style>${css}</style><style>${previewScoped.css}</style>` +
        `<div class="fabricate-manager"><div class="manager-checks-simulator-readout ${hash}">` +
        `<span class="manager-checks-simulator-face ${hash}" id="tile">` +
        `<span style="display:block;width:44px;height:44px"></span>` +
        `<small id="value" class="${hash}"><strong class="${hash}">20</strong>` +
        `<span class="${hash}">d20</span></small>` +
        `</span></div></div>`
    );
    const geometry = await page.evaluate(() => {
      const tile = document.getElementById('tile').getBoundingClientRect();
      const value = document.getElementById('value').getBoundingClientRect();
      return {
        position: getComputedStyle(document.getElementById('value')).position,
        overlaps:
          value.left >= tile.left - 0.5 &&
          value.right <= tile.right + 0.5 &&
          value.top >= tile.top - 0.5 &&
          value.bottom <= tile.bottom + 0.5,
        width: Math.round(value.width),
        tileWidth: Math.round(tile.width),
      };
    });
    assert.equal(geometry.position, 'absolute', 'the rule that positions it still matches');
    assert.equal(geometry.tileWidth, 44, 'the tile is the medallion’s own 44px square');
    assert.equal(
      geometry.width,
      geometry.tileWidth,
      '`inset: 0` makes the digit span the tile; without it the box collapses to its content'
    );
    assert.ok(geometry.overlaps, 'the digit sits INSIDE the tile rather than beside it');
  } finally {
    await browser.close();
  }
});

test('an odds row keeps its bar between a bounded label and a pinned percentage', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 300 } });
    const hash = oddsScoped.hashClass;
    await page.setContent(
      `<style>${css}</style><style>${oddsScoped.css}</style>` +
        `<div class="fabricate-manager"><ul class="manager-checks-odds-list ${hash}">` +
        `<li class="manager-checks-odds-row ${hash}" id="row">` +
        `<span class="manager-checks-odds-label ${hash}" id="label">` +
        `An extremely long localized outcome tier name that must not squeeze the bar</span>` +
        `<span class="fab-fill-bar" id="bar" style="display:block;height:6px"></span>` +
        `<span class="manager-checks-odds-percent ${hash}" id="percent">100%</span>` +
        `</li></ul></div>`
    );
    const geometry = await page.evaluate(() => {
      const read = (id) => document.getElementById(id).getBoundingClientRect();
      return {
        display: getComputedStyle(document.getElementById('row')).display,
        label: Math.round(read('label').width),
        bar: Math.round(read('bar').width),
        percent: Math.round(read('percent').width),
        overflow: getComputedStyle(document.getElementById('label')).overflow,
      };
    });
    assert.equal(geometry.display, 'grid', 'the grid rule still matches this row');
    assert.equal(geometry.overflow, 'hidden', 'and the label truncates rather than wrapping');
    assert.ok(
      geometry.label <= 90,
      `a long tier name is bounded at the 5.5rem track (got ${geometry.label}px)`
    );
    assert.ok(geometry.bar > 40, `the bar keeps real width beside it (got ${geometry.bar}px)`);
  } finally {
    await browser.close();
  }
});

// -- The GM Downtime preview at a real window width (issue 1185) ------------------------
//
// A container query is measured against the CONTENT box, so a threshold reads far larger
// than the window it actually fires in. The shipped preview collapsed at `max-width: 1040px`
// and an ordinary 1314px Foundry window gives this panel 1052px: the board dropped below the
// hero and the four feature cards folded to 2x2 on a window nobody would call narrow. The
// visual-parity harness could not see it either, because it ran at the one width that cleared
// the breakpoint -- by four pixels.
//
// So this gate measures the arrangement at the width the defect was reported from, and at the
// widths where the layout is SUPPOSED to fold, in a real browser with the component's own
// compiled CSS. Nothing else in the repository can evaluate a container query: happy-dom
// cannot compute a cascade, and a source assertion on the breakpoint number would pass on any
// arithmetic somebody wrote down.
const downtimePreviewPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/downtime/WorldDowntimePreview.svelte'
);
const downtimePreviewScoped = scopedComponentCss(downtimePreviewPath);

/**
 * Render the preview's own markup at one manager-pane width and read its two track counts.
 *
 * @param {number} paneWidth width of the manager main pane, in px
 * @returns {Promise<object>} track counts, the container's content width, and two box widths
 */
async function readDowntimePreviewArrangement(paneWidth) {
  const hash = downtimePreviewScoped.hashClass;
  const context = await sharedBrowser.newContext({
    viewport: { width: 1920, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const card = (index) =>
      `<article class="${hash}">` +
      `<span class="downtime-feature-icon is-tint-accent ${hash}"><i class="fas fa-star"></i></span>` +
      `<h4 class="${hash}">Benefit ${index}</h4>` +
      `<p class="${hash}">A short line of benefit copy for card ${index}.</p></article>`;
    await page.setContent(
      `<style>${css}</style><style>${downtimePreviewScoped.css}</style>` +
        `<div class="fabricate-manager" data-manager-view="world-downtime">` +
        `<div style="width:${paneWidth}px">` +
        `<div class="downtime-preview ${hash}">` +
        `<section class="downtime-hero ${hash}">` +
        `<div class="downtime-hero-copy ${hash}"><h2 class="${hash}">Run downtime.</h2></div>` +
        `<div class="downtime-board ${hash}"><header class="${hash}">Party board</header></div>` +
        `</section>` +
        `<section class="downtime-benefits ${hash}">` +
        `<div class="downtime-feature-grid ${hash}">${[1, 2, 3, 4].map(card).join('')}</div>` +
        `</section></div></div></div>`
    );
    return await page.evaluate(() => {
      const at = (selector) => document.querySelector(selector);
      const tracks = (selector) =>
        getComputedStyle(at(selector)).gridTemplateColumns.trim().split(/\s+/).length;
      const boxWidth = (selector) => Math.round(at(selector).getBoundingClientRect().width);
      const panel = at('.downtime-preview');
      const panelStyle = getComputedStyle(panel);
      return {
        containerWidth: Math.round(
          panel.clientWidth -
            Number.parseFloat(panelStyle.paddingLeft) -
            Number.parseFloat(panelStyle.paddingRight)
        ),
        heroTracks: tracks('.downtime-hero'),
        gridTracks: tracks('.downtime-feature-grid'),
        boardWidth: boxWidth('.downtime-board'),
        cardWidth: boxWidth('.downtime-feature-grid > article'),
      };
    });
  } finally {
    await context.close();
  }
}

test('the downtime preview keeps a two-column hero and a four-across grid in an ordinary Foundry window', async () => {
  // 1092px is what a 1314px Foundry window -- the reported one -- leaves `.manager-main`.
  const real = await readDowntimePreviewArrangement(1092);
  assert.equal(
    real.containerWidth,
    1052,
    'the pane arithmetic this gate rests on: a 1092px main pane is a 1052px query container'
  );
  assert.equal(
    real.heroTracks,
    2,
    `the hero keeps the board beside the copy at a real window width (got ${real.heroTracks})`
  );
  assert.equal(
    real.gridTracks,
    4,
    `the four benefit cards stay four-across at a real window width (got ${real.gridTracks})`
  );
  assert.ok(
    real.boardWidth < 400,
    `and the board is still the narrow column, not a half-width block (${real.boardWidth}px)`
  );

  // The fallbacks are half the claim: a breakpoint low enough to survive a real window must
  // still fold where the content genuinely stops fitting, or "it never collapses" is the bug.
  const narrow = await readDowntimePreviewArrangement(960);
  assert.equal(narrow.gridTracks, 2, 'the grid folds to 2x2 once a card would go under 228px');
  assert.equal(narrow.heroTracks, 2, 'and the hero, with far more room, does not fold with it');

  const tight = await readDowntimePreviewArrangement(700);
  assert.equal(tight.heroTracks, 1, 'the hero stacks once its copy column would drop under 420px');

  const smallest = await readDowntimePreviewArrangement(660);
  assert.equal(smallest.gridTracks, 1, 'and the existing 640px stage still stacks the cards');
});

test('the rail Downtime premium mark renders as the shared gold badge chip', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // One row shape, rendered twice: Core's preview state (gold) and the companion-installed
    // state (muted). Writing the markup once is what makes the two frames comparable — and
    // keeps a second near-identical block out of the SonarCloud duplication gate.
    const downtimeRow = (rowId, chipId, chipModifier) =>
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item is-active"` +
      ` data-world-nav-item="downtime" id="${rowId}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">Downtime</span>` +
      `<span class="manager-nav-count manager-nav-premium${chipModifier}" id="${chipId}">PREMIUM</span>` +
      `</button>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager">` +
        `<span class="manager-titlebar-badge" id="titlebar">PREMIUM</span>` +
        `<nav class="manager-rail"><div class="manager-world-nav">` +
        downtimeRow('row', 'chip', '') +
        downtimeRow('row-installed', 'chip-installed', ' is-installed') +
        `<button class="manager-nav-button manager-nav-parent is-active" id="plain-active">` +
        `<i class="fas fa-users"></i>` +
        `<span class="manager-nav-label">Parties</span>` +
        `<span class="manager-nav-count">5</span>` +
        `</button>` +
        `<button class="manager-nav-button manager-nav-parent" id="plain">` +
        `<span class="manager-nav-label">Parties</span>` +
        `<span class="manager-nav-count" id="count">10</span>` +
        `</button>` +
        `</div></nav></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id) => {
        const computed = getComputedStyle(document.getElementById(id));
        return {
          background: computed.backgroundColor,
          color: computed.color,
          weight: computed.fontWeight,
          radius: computed.borderTopLeftRadius,
          padding: computed.paddingLeft,
          borderColor: computed.borderTopColor,
        };
      };
      // Line boxes, counted by the browser rather than derived from a computed line-height:
      // this fixture sets none, so `line-height` computes to `normal` and any arithmetic on it
      // is NaN — which an `=== 1` check reads as a pass-shaped failure.
      const lineCount = (selector) => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(selector));
        return range.getClientRects().length;
      };
      return {
        chip: of('chip'),
        chipInstalled: of('chip-installed'),
        titlebar: of('titlebar'),
        count: of('count'),
        row: of('row'),
        plainActive: of('plain-active'),
        labelLines: lineCount('#row .manager-nav-label'),
        installedLabelLines: lineCount('#row-installed .manager-nav-label'),
      };
    });

    // The chip is asserted against the SHIPPED chip rather than against a hex, because the
    // point of the change is that one gold pair serves both marks: a literal here would pass
    // just as happily with the pair copied into a second place, which is what it must not be.
    assert.equal(
      read.chip.background,
      read.titlebar.background,
      'the rail chip fills with the same gold as the title bar badge'
    );
    assert.equal(
      read.chip.color,
      read.titlebar.color,
      'and inks with the same dark pair, rather than the rail count colour'
    );
    assert.equal(read.chip.weight, '700', 'the chip is a badge weight, not the count weight');
    assert.notEqual(
      read.chip.background,
      'rgba(0, 0, 0, 0)',
      'a transparent chip is the reported defect: bare tan lettering rather than a mark'
    );
    assert.notEqual(
      read.chip.color,
      read.count.color,
      'the chip must beat the later nav-count rules that re-tone every trailing marker'
    );
    assert.equal(read.chip.radius, '4px', 'at the rail scale the design draws a 4px chip');
    // 5px, one pixel tighter each side than the design's own `2px 6px`: this rail row ends in
    // a real 28px expand/collapse button where the design's ends in an inert chevron, and at
    // the design's exact padding the row's label broke `Downtime` across two lines mid-word.
    // The row height is the assertion that matters — the pixel is only how it was bought.
    assert.equal(read.chip.padding, '5px', 'the rail chip keeps its filled-chip padding');
    assert.ok(
      read.labelLines === 1,
      `the chip must not squeeze the label into a second line (got ${read.labelLines})`
    );

    // Issue 1185 — the MUTED state. With a companion installed the title bar carries the loud
    // gold signal, so the rail chip steps down. "Somewhat mute" is the whole requirement, so
    // both halves are asserted: it must stop being gold, AND it must still be a filled chip.
    assert.notEqual(
      read.chipInstalled.background,
      read.chip.background,
      'an installed companion mutes the rail chip off the gold fill'
    );
    assert.notEqual(
      read.chipInstalled.color,
      read.chip.color,
      'and off the dark on-gold ink with it'
    );
    assert.notEqual(
      read.chipInstalled.background,
      'rgba(0, 0, 0, 0)',
      'muted is not removed: the row must still say which route premium provides'
    );
    assert.notEqual(
      read.chipInstalled.color,
      read.count.color,
      'and it must still read as a marker rather than collapsing into a plain rail count'
    );
    assert.equal(read.chipInstalled.weight, '600', 'the muted chip drops one weight step');
    // Geometry is NOT part of the mute: the muted rule restates colour and weight only, so
    // the row cannot change height or break its label when a companion registers.
    assert.equal(read.chipInstalled.radius, read.chip.radius, 'the muted chip keeps its radius');
    assert.equal(read.chipInstalled.padding, read.chip.padding, 'and its padding');
    assert.ok(
      read.installedLabelLines === 1,
      `and still leaves the label on one line (got ${read.installedLabelLines})`
    );

    // The active Downtime ROW is an ordinary active rail row and nothing more. It briefly
    // carried the prototype's bespoke accent fill, border and ink, which made one row in the
    // rail look like a different control; the premium signal lives in the chip and the title
    // bar, not in the row. Asserted against a plain active row rather than against literals,
    // so a change to the rail's selected language moves both or fails here.
    assert.equal(
      read.row.background,
      read.plainActive.background,
      'the active Downtime row fills exactly like any other active rail row'
    );
    assert.equal(read.row.color, read.plainActive.color, 'and inks like one');
    assert.equal(
      read.row.borderColor,
      read.plainActive.borderColor,
      'and borders like one — no accent outline of its own'
    );
    assert.notEqual(
      read.row.background,
      'rgba(0, 0, 0, 0)',
      'and the shared active fill is still a real fill, so the comparison is not two blanks'
    );
  } finally {
    await context.close();
  }
});

// Issue 1185 — the Downtime children are RAIL SUB-ITEMS, and had stopped looking like it.
// They carried the prototype's own 32px indent and 10px gap, which put them visibly further
// right than the Crafting and Gathering children immediately above them. Measured against a
// real sibling rather than against the numbers, so the two move together or this fails.
test('the Downtime rail children sit on the same indent and gap as every other rail child', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const subitem = (id, extraClass) =>
      `<button class="manager-nav-subitem${extraClass}" id="${id}">` +
      `<i class="fas fa-flask"></i>` +
      `<span class="manager-nav-label">Recipes</span>` +
      `<span class="manager-nav-count">7</span>` +
      `</button>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager"><div class="manager-body"><aside class="manager-rail">` +
        `<nav class="manager-nav">` +
        `<div class="manager-nav-group is-expanded"><div class="manager-nav-submenu" id="crafting-submenu">` +
        subitem('crafting-child', '') +
        `</div></div>` +
        `<div class="manager-nav-group is-expanded"><div class="manager-nav-submenu" id="downtime-submenu">` +
        subitem('downtime-child', ' manager-downtime-subitem') +
        `</div></div>` +
        `</nav></aside><main class="manager-main"></main></div></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id, submenuId) => {
        const button = document.getElementById(id);
        const computed = getComputedStyle(button);
        return {
          // The visible indent is what a GM compares, so measure where the GLYPH lands
          // relative to the group that holds it, not the declared padding.
          glyphOffset: +(
            button.querySelector('i').getBoundingClientRect().left -
            document.getElementById(submenuId).getBoundingClientRect().left
          ).toFixed(2),
          gap: computed.columnGap,
          paddingLeft: computed.paddingLeft,
          minHeight: computed.minHeight,
          radius: computed.borderTopLeftRadius,
          columns: computed.gridTemplateColumns,
        };
      };
      return {
        crafting: of('crafting-child', 'crafting-submenu'),
        downtime: of('downtime-child', 'downtime-submenu'),
      };
    });

    assert.equal(
      read.downtime.glyphOffset,
      read.crafting.glyphOffset,
      `a Downtime child starts where a Crafting child starts (got ${read.downtime.glyphOffset} vs ${read.crafting.glyphOffset})`
    );
    assert.equal(read.downtime.paddingLeft, read.crafting.paddingLeft, 'same indent');
    assert.equal(read.downtime.gap, read.crafting.gap, 'same gap between glyph and label');
    assert.equal(read.downtime.minHeight, read.crafting.minHeight, 'same row floor');
    assert.equal(read.downtime.radius, read.crafting.radius, 'same corner');
    assert.equal(read.downtime.columns, read.crafting.columns, 'same four-track grid');
  } finally {
    await context.close();
  }
});

// Issue 1185 — a rail label degrades by wrapping at a SPACE and then by ELLIPSIS, never by
// splitting a word. `overflow-wrap: anywhere` used to lower the label's min-content width so
// the `minmax(0, 1fr)` track could shrink under the widest word, and `Downtime` rendered as
// `Downtim` / `e`. A companion supplies its own labels, so this has to hold for text that is
// not ours to shorten.
test('a rail label wraps at a space and ellipsises, and never splits a word', async () => {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const row = (id, label) =>
      `<div class="manager-nav-group" style="position:relative">` +
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item" id="${id}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">${label}</span>` +
      `<span class="manager-nav-count manager-nav-premium">PREMIUM</span>` +
      `</button></div>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager"><div class="manager-body"><aside class="manager-rail">` +
        `<nav class="manager-nav"><section class="manager-world-nav">` +
        row('short', 'Downtime') +
        row('oneword', 'Handelsverwaltungsuebersicht') +
        row('twowords', 'Trade Administration') +
        `</section></nav></aside><main class="manager-main"></main></div></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id) => {
        const label = document.getElementById(id).querySelector('.manager-nav-label');
        const range = document.createRange();
        range.selectNodeContents(label);
        // Count LINE BOXES by distinct top edge: a range yields several rects for one visual
        // line, so `rects.length` reads a single line as two and passes a split as fine.
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        return {
          lines: lines.size,
          clipped: label.scrollWidth > label.clientWidth,
          trackWidth: +label.getBoundingClientRect().width.toFixed(1),
          overflow: getComputedStyle(label).overflow,
          textOverflow: getComputedStyle(label).textOverflow,
          wrap: getComputedStyle(label).overflowWrap,
        };
      };
      return { short: of('short'), oneWord: of('oneword'), twoWords: of('twowords') };
    });

    assert.equal(read.short.lines, 1, 'the shipped Downtime label still fits on one line');
    assert.equal(read.short.clipped, false, 'and is not ellipsised at the shipped rail width');

    // The proof that a word is not split: one line, and the overflow taken by the clip.
    assert.equal(
      read.oneWord.lines,
      1,
      'a label too wide for its track stays on ONE line rather than breaking mid-word'
    );
    assert.ok(read.oneWord.clipped, 'and is clipped, which is what `text-overflow` ellipsises');
    assert.equal(read.oneWord.overflow, 'hidden', 'the clip is what puts ellipsis in scope');
    assert.equal(read.oneWord.textOverflow, 'ellipsis');
    assert.notEqual(
      read.oneWord.wrap,
      'anywhere',
      '`anywhere` is what produced the reported mid-word break'
    );

    // And a label that CAN break at a space still does, rather than ellipsising whole words.
    assert.equal(read.twoWords.lines, 2, 'a multi-word label still wraps at its space');
  } finally {
    await context.close();
  }
});

// -- Downtime rail tab badges, measured (issue 1302) --------------------------------------
//
// A companion's badge is a bare mono numeral in the sub-item's trailing track, and its label
// is the companion's own and is not Core's to shorten. So the interesting question is not
// whether the numeral fits — it is what YIELDS when it does not, and that is a computed-layout
// fact no other harness in the repository can evaluate: happy-dom applies no stylesheet and
// returns `0` for every box metric.
//
// The fixtures below are hand-built markup, which is the shipped idiom in this file and the
// only way to reach a state at a chosen viewport. The cost of a hand-built fixture is that it
// keeps passing after the component stops emitting that markup, so each one opens by checking
// its own marker against the component source; the render sites' BRANCHES are pinned
// separately, by AC-15 in `manager-contract.test.js`.
const managerRootPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'
);
const managerRootSource = readFileSync(managerRootPath, 'utf8');

function assertBadgeFixtureMirrorsComponent() {
  assert.ok(
    managerRootSource.includes('class="manager-nav-count"\n') &&
      managerRootSource.includes('data-world-downtime-badge={item.id}'),
    'the sub-item badge fixture below must be the marker the component actually emits'
  );
  assert.ok(
    managerRootSource.includes('class="manager-nav-issue-badge"\n') &&
      managerRootSource.includes('data-world-downtime-badge-total'),
    'and so must the parent rollup fixture'
  );
}

// The rail chrome every fixture here needs, at the shipped 220px (or the collapsed 56px).
function railPage(navMarkup, bodyClass = '') {
  return (
    `<style>${css}</style>` +
    `<div class="fabricate-manager"><div class="manager-body${bodyClass}">` +
    `<aside class="manager-rail"><nav class="manager-nav">${navMarkup}</nav></aside>` +
    `<main class="manager-main"></main></div></div>`
  );
}

// Counting LINE BOXES by distinct top edge, not by rect count: a range yields several rects
// for one visual line, so `rects.length` reads a single line as two and passes a split as fine.
const READ_ROW = `(id) => {
  const row = document.getElementById(id);
  const label = row.querySelector('.manager-nav-label');
  const badge = row.querySelector('.manager-nav-count');
  const range = document.createRange();
  range.selectNodeContents(label);
  const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
  const rowBox = row.getBoundingClientRect();
  const labelBox = label.getBoundingClientRect();
  const badgeBox = badge.getBoundingClientRect();
  return {
    lines: lines.size,
    clipped: label.scrollWidth > label.clientWidth,
    wrap: getComputedStyle(label).overflowWrap,
    labelWidth: +labelBox.width.toFixed(1),
    labelFirstLineBottom: Math.min(...[...range.getClientRects()].map((rect) => rect.bottom)),
    badgeWidth: +badgeBox.width.toFixed(1),
    badgeHeight: +badgeBox.height.toFixed(1),
    badgeClipped: badge.scrollWidth > badge.clientWidth,
    badgeCentreY: +(badgeBox.top + badgeBox.height / 2).toFixed(1),
    badgeInsideRow:
      badgeBox.left >= rowBox.left - 0.5 &&
      badgeBox.right <= rowBox.right + 0.5 &&
      badgeBox.top >= rowBox.top - 0.5 &&
      badgeBox.bottom <= rowBox.bottom + 0.5,
    badgeClearsLabel: badgeBox.left >= labelBox.right - 0.5,
    rowHeight: +rowBox.height.toFixed(1),
    rowCentreY: +(rowBox.top + rowBox.height / 2).toFixed(1),
    rowVerticallyClipped: row.scrollHeight > row.clientHeight + 1,
  };
}`;

// AC-16 — the widest sub-item case, at the shipped 220px rail.
test('a four-digit companion badge takes width from the LABEL, which never splits a word', async () => {
  assertBadgeFixtureMirrorsComponent();
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const subitem = (id, label, count) =>
      `<button class="manager-nav-subitem manager-downtime-subitem" id="${id}">` +
      `<i class="fas fa-scroll"></i>` +
      `<span class="manager-nav-label">${label}</span>` +
      `<span class="manager-nav-count" data-world-downtime-badge="${id}" role="img" ` +
      `aria-label="${count} waiting">${count}</span>` +
      `</button>`;
    await page.setContent(
      railPage(
        `<div class="manager-nav-group is-expanded">` +
          `<div class="manager-nav-submenu" id="downtime-submenu">` +
          subitem('wide', 'Trade Administration Overview', '1200') +
          subitem('control', 'Trade Administration Overview', '7') +
          subitem('oneword', 'Handelsverwaltungsuebersicht', '1200') +
          subitem('short', 'Ledger', '1200') +
          `</div></div>`
      )
    );
    const read = await page.evaluate((body) => {
      const of = eval(`(${body})`);
      return {
        wide: of('wide'),
        control: of('control'),
        oneWord: of('oneword'),
        short: of('short'),
      };
    }, READ_ROW);

    // THE NUMERAL IS NEVER TRUNCATED. A truncated numeral actively lies — "12" for "128" —
    // while a truncated label is fully recoverable from the row's `title` and its
    // `aria-label`, so the label is the right thing to yield.
    assert.equal(read.wide.badgeClipped, false, 'a four-digit badge holds its declared size');
    assert.ok(read.wide.badgeWidth > 0 && read.wide.badgeHeight > 0, 'and is a real box');
    assert.ok(
      read.wide.badgeWidth > read.control.badgeWidth,
      `four digits are wider than one (got ${read.wide.badgeWidth} vs ${read.control.badgeWidth})`
    );
    assert.ok(
      read.wide.labelWidth < read.control.labelWidth,
      'and the extra width comes out of the LABEL track, which is what `minmax(0, 1fr)` is for'
    );
    assert.ok(read.wide.badgeInsideRow, 'the badge stays inside its own row');
    assert.ok(read.wide.badgeClearsLabel, 'in the trailing track, never over the label');

    // The label degrades by WRAPPING AT A SPACE and then by ellipsis, never by splitting a
    // word. `white-space: nowrap` would make the first assertion pass and silently reverse
    // issue 1185's ruling, which is why the one-word row is measured beside it.
    assert.ok(read.wide.lines >= 2, 'a long multi-word label wraps at its spaces');
    assert.equal(
      read.oneWord.lines,
      1,
      'a label too wide for its track stays on ONE line rather than breaking mid-word'
    );
    assert.ok(read.oneWord.clipped, 'and is clipped, which is what `text-overflow` ellipsises');
    assert.notEqual(
      read.oneWord.wrap,
      'anywhere',
      '`anywhere` is what produced the reported mid-word break'
    );
    assert.equal(read.short.lines, 1, 'a short label needs neither');
    assert.equal(read.short.clipped, false);

    // THE ROW GROWS rather than clipping, which is what `height: auto` at
    // `.manager-downtime-subitem` exists for: Foundry core sets a FIXED button height, and a
    // wrapped label overflowed onto the three rows below it.
    assert.ok(
      read.wide.rowHeight > read.short.rowHeight,
      `a wrapped label grows its row (got ${read.wide.rowHeight} vs ${read.short.rowHeight})`
    );
    assert.equal(read.wide.rowVerticallyClipped, false, 'and nothing is cut off inside it');

    // THE TWO-LINE CASE, measured rather than assumed: `.manager-nav-subitem` sets
    // `align-items: center`, so beside a wrapped label the numeral floats at the row's
    // vertical middle, BELOW the first line of its own label. That combination ships nowhere
    // today, and its published frame is to be judged explicitly — if a reviewer reads the
    // numeral as detached from its label the fix is a one-declaration `align-self: start`,
    // which puts `styles/fabricate.css` back in the affected set.
    assert.ok(
      Math.abs(read.wide.badgeCentreY - read.wide.rowCentreY) <= 1,
      'the badge is centred on the ROW, not aligned to the label’s first line'
    );
    assert.ok(
      read.wide.badgeCentreY > read.wide.labelFirstLineBottom,
      'so on a two-line label it sits below the line it counts — the state Decision 8 reopens on'
    );
  } finally {
    await context.close();
  }
});

// AC-17 — the parent row does not regress, expanded and collapsed.
test('the Downtime parent rollup keeps the row’s label on one line, and survives a collapsed rail', async () => {
  assertBadgeFixtureMirrorsComponent();
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // The parent's single trailing track carries EITHER the rollup or the muted chip. Both
    // rows are rendered so the trade is measured rather than asserted: the chip is ≈47.5px
    // and the rollup ≈18-26px, so while the rollup shows the label track GROWS.
    const parentRow = (id, trailing) =>
      `<div class="manager-nav-group" style="position:relative">` +
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item" id="${id}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">Downtime</span>` +
      trailing +
      `</button>` +
      `<button class="manager-nav-toggle" id="${id}-toggle">` +
      `<i class="fas fa-chevron-down"></i></button></div>`;
    const rollup =
      `<span class="manager-nav-issue-badge" data-world-downtime-badge-total role="img" ` +
      `aria-label="5 updates">5</span>`;
    const chip = `<span class="manager-nav-count manager-nav-premium is-installed">PREMIUM</span>`;
    const nav =
      `<section class="manager-world-nav">` +
      parentRow('rollup', rollup) +
      parentRow('chip', chip) +
      `</section>`;

    const readParent = `(id, markSelector) => {
      const row = document.getElementById(id);
      const label = row.querySelector('.manager-nav-label');
      const mark = row.querySelector(markSelector);
      const toggle = document.getElementById(id + '-toggle');
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
      const rowBox = row.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      const toggleBox = toggle.getBoundingClientRect();
      return {
        lines: lines.size,
        clipped: label.scrollWidth > label.clientWidth,
        labelWidth: +label.getBoundingClientRect().width.toFixed(1),
        markDisplay: getComputedStyle(mark).display,
        markWidth: +markBox.width.toFixed(1),
        markHeight: +markBox.height.toFixed(1),
        markInsideRow:
          markBox.left >= rowBox.left - 0.5 &&
          markBox.right <= rowBox.right + 0.5 &&
          markBox.top >= rowBox.top - 0.5 &&
          markBox.bottom <= rowBox.bottom + 0.5,
        overlapsToggle:
          markBox.right > toggleBox.left + 0.5 &&
          markBox.left < toggleBox.right - 0.5 &&
          markBox.bottom > toggleBox.top + 0.5 &&
          markBox.top < toggleBox.bottom - 0.5,
      };
    }`;

    await page.setContent(railPage(nav));
    const expanded = await page.evaluate((body) => {
      const of = eval(`(${body})`);
      return {
        rollup: of('rollup', '[data-world-downtime-badge-total]'),
        chip: of('chip', '.manager-nav-premium'),
      };
    }, readParent);

    assert.equal(
      expanded.rollup.lines,
      1,
      'the shipped Downtime label still renders on ONE line with the rollup in the track'
    );
    assert.equal(expanded.rollup.clipped, false, 'and unclipped at the shipped 220px rail');
    assert.ok(expanded.rollup.markInsideRow, 'the rollup sits inside the parent button');
    assert.ok(
      !expanded.rollup.overlapsToggle,
      'and clears the disclosure toggle, which is a `position: absolute` sibling at `right: 4px` ' +
        'with 36px of padding reserved for it'
    );
    assert.ok(
      expanded.rollup.labelWidth > expanded.chip.labelWidth,
      `the rollup is narrower than the chip it replaces, so the label track GROWS while it ` +
        `shows (got ${expanded.rollup.labelWidth} vs ${expanded.chip.labelWidth})`
    );

    // COLLAPSED. `.manager-nav-button` becomes a single centred column, and the rollup is
    // deliberately outside the `.manager-nav-count` hide rule — that badge is the only signal
    // left once the labels and the children are gone. This is the guard chosen for accepted
    // limitation 8 in place of a further View Lab case: a measurement rather than a picture.
    await page.setContent(railPage(nav, ' is-rail-collapsed'));
    const collapsed = await page.evaluate((body) => {
      const of = eval(`(${body})`);
      return {
        rollup: of('rollup', '[data-world-downtime-badge-total]'),
        chip: of('chip', '.manager-nav-premium'),
      };
    }, readParent);

    assert.equal(
      collapsed.chip.markDisplay,
      'none',
      'the collapsed rail really did apply: the chip rides `.manager-nav-count`, which it hides'
    );
    assert.notEqual(collapsed.rollup.markDisplay, 'none', 'and the rollup survives that hide');
    assert.ok(
      collapsed.rollup.markWidth > 0 && collapsed.rollup.markHeight > 0,
      `the rollup is a real box on a 56px rail (got ${collapsed.rollup.markWidth}x${collapsed.rollup.markHeight})`
    );
    assert.ok(
      collapsed.rollup.markInsideRow,
      'and stays inside the parent button, which grows from its 36px floor to hold it'
    );
  } finally {
    await context.close();
  }
});

// -- The companion Downtime panel's layout contract (issue 1213) -------------------------
//
// This is the Manager counterpart of the player seam's panel contract, and every claim in it
// is a computed-style fact that nothing else in the repository can evaluate: happy-dom cannot
// compute a cascade, so a mounted suite can only assert that a DECLARATION exists, never that
// it lands on a real box.
//
// The chain is applied WHOLE, deliberately. Two earlier probes of this same rule reached the
// wrong conclusion by shortening it -- one set `height: 100%` on the companion root alone,
// which reads as definite while its ancestor is auto, and one appended a tall child to a
// `flex-direction: column` root, where `flex-shrink: 1` squashes the child so nothing ever
// overflows. So the fixture runs `.fabricate-manager` -> `.manager-body` -> `.manager-main` ->
// `.downtime-host` -> `.downtime-extension-panels` -> the panel region -> the mount target,
// with the host's own compiled CSS after the global sheet, and every overflow case below
// controls the flex factor explicitly.
//
// One thing is deliberately NOT asserted anywhere here: `contain`. The Manager root's
// `container-type: inline-size` implies layout containment, but reading the `contain` property
// returns `none`, so an assertion on it would be measuring the absence of a declaration rather
// than the presence of the behaviour.
const downtimeHostPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte'
);
const downtimeHostScoped = scopedComponentCss(downtimeHostPath);

// A companion root, parameterised by the ONE thing each overflow case varies.
const companionRoot = (style, children) =>
  `<div id="companion-root" style="height:100%;min-height:0;${style}">${children}</div>`;
const companionRows = '<p style="height:200px;margin:0">row</p>'.repeat(12);
const companionShort = companionRoot('', '<p style="margin:0">short</p>');
const MANAGER_WIDTH_LADDER = [1400, 1200, 1100, 900, 700, 600];

/**
 * Render the Downtime route at one Manager width and read it with `readInPage`.
 *
 * The Manager chrome around the host is what makes the block size definite, so it is stated
 * once here and every case below shares it — the two modes differ only in the host's own
 * class and children.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @param {string} hostClasses extra classes on `.downtime-host`
 * @param {string} hostChildren the host's own markup
 * @param {Function} readInPage evaluated in the page; returns the measurements
 * @returns {Promise<object>} whatever `readInPage` returned
 */
async function readDowntimeRoute(managerWidth, hostClasses, hostChildren, readInPage) {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><style>${downtimeHostScoped.css}</style>` +
        `<div style="width:${managerWidth}px;height:760px">` +
        `<div class="fabricate-manager" data-manager-view="world-downtime">` +
        `<div class="manager-titlebar">titlebar</div>` +
        `<div class="manager-header">header</div>` +
        `<div class="manager-body">` +
        `<aside class="manager-rail">rail</aside>` +
        `<main class="manager-main">` +
        `<section class="downtime-host ${hostClasses}" data-world-downtime-host>` +
        hostChildren +
        `</section></main></div></div></div>`
    );
    return await page.evaluate(readInPage);
  } finally {
    await context.close();
  }
}

/**
 * Render the provider-mode chain at one Manager width and read every link's box.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @param {string} companionMarkup what the companion mounts into the target
 * @returns {Promise<object>} client heights down the chain, plus the panel's scroll state
 */
async function readCompanionPanelChain(managerWidth, companionMarkup) {
  const hash = downtimeHostScoped.hashClass;
  return readDowntimeRoute(
    managerWidth,
    hash,
    `<div class="downtime-extension-panels ${hash}">` +
      `<div class="downtime-extension-panel ${hash}" role="region" tabindex="-1">` +
      `<div class="downtime-extension-target ${hash}" data-downtime-extension-panel="board">` +
      companionMarkup +
      `</div></div></div>`,
    () => {
      const at = (selector) => document.querySelector(selector);
      const panels = at('.downtime-extension-panels');
      const host = at('.downtime-host');
      const target = at('.downtime-extension-target');
      const targetElement = target;
      const targetStyle = getComputedStyle(target);
      return {
        main: at('.manager-main').clientHeight,
        host: host.clientHeight,
        panels: panels.clientHeight,
        panelsScrollHeight: panels.scrollHeight,
        panelsOverflowY: getComputedStyle(panels).overflowY,
        // BOTH halves, because `scrollHeight` reports overflowing content whether or not the
        // box can scroll it: an `overflow: hidden` panel that CLIPS its companion reports the
        // identical `scrollHeight > clientHeight` as one that scrolls it, so overflow alone
        // reads as "the fallback works" over a panel that silently swallows the content.
        panelScrolls:
          /auto|scroll/.test(getComputedStyle(panels).overflowY) &&
          panels.scrollHeight > panels.clientHeight,
        panelsOverflows: panels.scrollHeight > panels.clientHeight,
        region: at('.downtime-extension-panel').clientHeight,
        target: targetElement.clientHeight,
        targetWidth: targetElement.clientWidth,
        targetPadding: [
          targetStyle.paddingTop,
          targetStyle.paddingRight,
          targetStyle.paddingBottom,
          targetStyle.paddingLeft,
        ].join(' '),
        targetOverflow: `${targetStyle.overflowX} ${targetStyle.overflowY}`,
        targetContainerType: targetStyle.containerType,
        // How far the mount target sits inside the host box. Core's old `12px 20px 24px` lived
        // on the panels row rather than on the target, so reading the target's OWN padding
        // could never have seen it — the inset has to be measured as an offset.
        insetTop: Math.round(target.getBoundingClientRect().top - host.getBoundingClientRect().top),
        insetLeft: Math.round(
          target.getBoundingClientRect().left - host.getBoundingClientRect().left
        ),
        hostWidth: host.clientWidth,
        companion: at('#companion-root').clientHeight,
      };
    }
  );
}

/**
 * Read the CORE-FALLBACK host, which keeps two grid tracks and its own preview scroller.
 *
 * @param {number} managerWidth width of the whole Manager window, in px
 * @returns {Promise<object>} the two rows' boxes and the host's resolved track list
 */
async function readCoreFallbackHostRows(managerWidth) {
  const hash = downtimeHostScoped.hashClass;
  return readDowntimeRoute(
    managerWidth,
    `core-fallback ${hash}`,
    `<div class="downtime-preview-scroll ${hash}">` +
      '<p style="height:200px;margin:0">row</p>'.repeat(12) +
      `</div><div class="downtime-tab-card-stand-in" style="height:44px">strip</div>`,
    () => {
      const at = (selector) => document.querySelector(selector);
      const host = at('.downtime-host');
      const scroll = at('.downtime-preview-scroll');
      const strip = at('.downtime-tab-card-stand-in');
      return {
        host: host.clientHeight,
        scroll: scroll.clientHeight,
        scrollScrolls:
          /auto|scroll/.test(getComputedStyle(scroll).overflowY) &&
          scroll.scrollHeight > scroll.clientHeight,
        strip: strip.clientHeight,
        stripBottomGap: Math.round(
          host.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom
        ),
      };
    }
  );
}

test('the companion Downtime panel states a height at every link, which Chromium alone cannot gate', () => {
  // MEASUREMENT CANNOT PROVE THIS ONE, and saying so is the point of a separate test.
  //
  // Chromium resolves a percentage height through a chain of `height: auto` in-flow block
  // ancestors up to the nearest definite one, so with the host grid correct the companion's
  // own `height: 100%` lands on the pane's height whether or not the wrapper and the target
  // state a height themselves.
  //
  // MEASURED, and an earlier note here overstated it. Removing BOTH declarations leaves every
  // number in the width ladder below identical — that test stays green — but it is not true
  // that nothing changes: the last case of the overflow test does move, because a companion
  // that states NO height of its own has nothing left to propagate through and its target
  // collapses to content height (18px against the pane's 685). So one measuring test is blind
  // to this and one is not, which is exactly why the declaration is asserted here as well.
  //
  // The declarations are load-bearing beyond that, because Chromium is not the only engine
  // Foundry runs in and CSS 2.1's own rule is the opposite one — a percentage against a
  // containing block whose height depends on content computes to `auto`. Only Chromium is
  // installed here, so the honest gate is the declaration rather than a second engine's
  // measurement.
  const hash = downtimeHostScoped.hashClass;
  for (const selector of ['.downtime-extension-panel', '.downtime-extension-target']) {
    const rule = blockIn(downtimeHostScoped.css, `${selector}.${hash}`);
    assert.ok(rule, `${selector} should own a rule in the host's scoped CSS`);
    // ANCHORED. `/height:\s*100%/` is also satisfied by `min-height: 100%`, and swapping the
    // one for the other is precisely the regression this test exists to catch: it left the
    // declaration looking present while the box stopped being sized by it.
    assert.match(
      rule,
      /(^|[;{\s])height:\s*100%/,
      `${selector} must state its own height — Chromium's propagation hides its absence`
    );
  }
});

test("the companion Downtime panel hands over the Manager pane's whole height, at every width", async () => {
  // The full ladder, because the block-size guarantee is what a companion's own `height: 100%`
  // rests on, and `styles/fabricate.css` exempts this route from the shared `.manager-body`
  // stack inside `@container fabricate-manager (max-width: 1120px)`. That exemption is the ONLY
  // reason the host stays a definite-height grid below 1120px instead of becoming content-sized,
  // which would silently invert every companion's percentage height into a page-length scroll.
  // Delete it and the three narrow rungs here are what fails.
  for (const managerWidth of MANAGER_WIDTH_LADDER) {
    const read = await readCompanionPanelChain(managerWidth, companionShort);
    const at = `at ${managerWidth}px`;
    assert.equal(
      read.target,
      read.panels,
      `the target is the panel's whole content box ${at} (got ${read.target} vs ${read.panels})`
    );
    assert.equal(
      read.region,
      read.panels,
      `the panel region fills that box too ${at} (got ${read.region} vs ${read.panels})`
    );
    // The link the one-track host grid buys, and the one a vacuous equality hides: with two
    // tracks left in place the panels landed in the `auto` one and collapsed to content height,
    // while `target === panels` went on reading true because both sides collapsed together.
    assert.equal(
      read.panels,
      read.host,
      `and the panel row is the host's whole content box ${at} (got ${read.panels} vs ${read.host})`
    );
    assert.equal(
      read.host,
      read.main,
      `and the host fills the Manager pane ${at} (got ${read.host} vs ${read.main})`
    );
    assert.ok(
      read.main > 400,
      `the pane is a REAL height ${at}, not a collapsed one every link agrees on (${read.main})`
    );
    assert.equal(
      read.companion,
      read.target,
      `so a companion root asking for height: 100% actually gets it ${at}`
    );
  }
});

test('the companion Downtime panel is a bare box whose inline size is not guaranteed', async () => {
  const widths = [];
  for (const managerWidth of MANAGER_WIDTH_LADDER) {
    const read = await readCompanionPanelChain(managerWidth, companionShort);
    widths.push(read.targetWidth);
    assert.equal(read.targetPadding, '0px 0px 0px 0px', 'the companion supplies its own inset');
    assert.equal(read.targetOverflow, 'visible visible', 'and its own scroller, if it wants one');
    assert.equal(read.targetContainerType, 'normal', 'Core imposes no CSS container on it');
    // Core's own `12px 20px 24px` is GONE. It lived on the panels row, not on the target, so
    // the padding read above could never have seen it; the offset from the host is what can.
    assert.equal(read.insetTop, 0, `the target starts at the top of the host at ${managerWidth}px`);
    assert.equal(read.insetLeft, 0, `and at its left edge at ${managerWidth}px`);
    assert.equal(
      read.targetWidth,
      read.hostWidth,
      `so the companion is handed the host's whole inline box at ${managerWidth}px`
    );
  }
  // Core enforces no minimum Manager size and makes no no-horizontal-overflow promise for this
  // panel, explicitly unlike the player seam's enforced 1024x640 floor. Pin the ladder so the
  // contract's "not guaranteed" is a measured fact rather than a caveat nobody checked.
  assert.ok(
    widths.every((width, index) => index === 0 || width < widths[index - 1]),
    `the target's inline size tracks the window all the way down (${widths.join(' -> ')})`
  );
  assert.ok(widths.at(-1) < 400, `and reaches a genuinely narrow box (${widths.at(-1)}px)`);
});

test('Core keeps the Downtime panel scroller for a visibly overflowing companion, and only then', async () => {
  // Every case below states `height: 100%` on the companion root, so height is held CONSTANT
  // and the only variable is how the root treats its own content. That is the whole point:
  // "a full-height companion kills Core's scroller" and "a definite height kills Core's
  // scroller" are both false, and each was believed once.
  const visible = await readCompanionPanelChain(
    1400,
    companionRoot('display:block', companionRows)
  );
  assert.equal(
    visible.panelsOverflowY,
    'auto',
    'Core keeps a real scroller on the panel row, not a clip that swallows the overflow'
  );
  assert.ok(
    visible.panelScrolls,
    `a full-height companion overflowing VISIBLY still scrolls (${visible.panelsScrollHeight} vs ${visible.panels})`
  );

  const nonShrinking = await readCompanionPanelChain(
    1400,
    companionRoot(
      'display:flex;flex-direction:column',
      '<div style="height:2400px;flex-shrink:0">tall</div>'
    )
  );
  assert.ok(
    nonShrinking.panelScrolls,
    'a flex column whose child cannot shrink overflows visibly too, and still scrolls'
  );

  // The confound, pinned so it cannot be reintroduced as a probe: the SAME markup with the
  // default flex factor squashes its child instead of overflowing, and reads as "full height
  // killed the scroller" while nothing about height changed.
  const shrinkable = await readCompanionPanelChain(
    1400,
    companionRoot('display:flex;flex-direction:column', '<div style="height:2400px">tall</div>')
  );
  assert.equal(
    shrinkable.panelsOverflows,
    false,
    'a shrinkable child is SQUASHED rather than scrolled -- this is flex-shrink, not height'
  );
  assert.equal(
    shrinkable.panels,
    shrinkable.panelsScrollHeight,
    'nothing overflowed at all, which is why the earlier probe measured no scroll'
  );

  const ownScroller = await readCompanionPanelChain(
    1400,
    companionRoot('overflow:auto', companionRows)
  );
  assert.equal(
    ownScroller.panelsOverflows,
    false,
    'and a companion absorbing its own content with a non-visible overflow makes Core inert'
  );

  // The height stays OPT-IN either way: a companion that states none renders at content height
  // rather than being stretched, so the contract adds a reachable box and forces nothing.
  const noHeight = await readCompanionPanelChain(
    1400,
    '<div id="companion-root"><p style="margin:0">no height stated</p></div>'
  );
  assert.ok(
    noHeight.companion < 100 && noHeight.target > 400,
    `a companion stating no height keeps content height in a full-height target (${noHeight.companion} in ${noHeight.target})`
  );
});

test("Core's preview keeps its own two-track host, with the tab strip on the bottom edge", async () => {
  // CORE-FALLBACK HAD NO `npm test` LAYOUT GATE AT ALL (issue 1213 review) — its two-row host
  // was exercised only by Playwright frames — so this rung states what a free user actually
  // gets: the strip on the bottom edge and the preview scroller taking everything above it.
  //
  // ONE CORRECTION, measured rather than reasoned. The finding this rung answers claimed that
  // losing `.downtime-host.core-fallback { grid-template-rows: minmax(0,1fr) auto }` would
  // stack both children in one cell now that the base rule is the single provider track. It
  // would not, in Chromium: with one explicit track and two children the second child lands in
  // an IMPLICIT row, `grid-auto-rows` defaults to `auto`, and the resolved tracks are
  // "638px 44px" either way — byte-identical geometry with the override deleted. So the
  // override is an explicit statement of intent rather than the thing producing this layout,
  // and a test asserting its presence by measurement could not fail.
  //
  // What this rung DOES catch is the failure that has actually happened here twice: the tracks
  // in the wrong ORDER. Inverting them to `auto minmax(0,1fr)` puts the strip 44px above the
  // host's bottom edge and fails below.
  const read = await readCoreFallbackHostRows(1400);
  assert.equal(read.strip, 44, 'the strip takes its own content height in the `auto` track');
  assert.equal(read.stripBottomGap, 0, 'and sits on the bottom edge of the host');
  assert.equal(
    read.scroll,
    read.host - read.strip,
    `the preview scroller takes the rest (${read.scroll} of ${read.host} beside a ${read.strip} strip)`
  );
  assert.ok(read.scrollScrolls, 'and it still scrolls its own overflowing preview content');
});

test('the manager root clips rather than hides, so focus cannot scroll the app away (issue 1286)', () => {
  // `.fabricate-manager {` opens more than one block in this sheet, so the LAYOUT one is found
  // by the declaration only it carries rather than by taking the first match.
  const blocks = css
    .split('\n.fabricate-manager {')
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf('\n}')));
  const body = blocks.find((chunk) => chunk.includes('grid-template-rows'));
  assert.ok(body, 'the manager root layout block must still be findable by its grid rows');
  assert.match(
    body,
    /overflow:\s*clip;/,
    'the manager root must use `overflow: clip`, which creates NO scroll container'
  );
  assert.doesNotMatch(
    body,
    /overflow:\s*hidden;/,
    // `hidden` looks equivalent — no scrollbar either way — and is not. It leaves the box
    // scrollable PROGRAMMATICALLY, and focus scrolls it: clicking a control low in a tall panel
    // scrolled this root by ~738px, carrying the rail and body up out of the frame and leaving
    // the bottom third of the window an unrecoverable void, because with no scrollbar there was
    // no way back. The complications editor merely made the root tall enough to reach it.
    'the manager root must not use `overflow: hidden`: it still creates a scroll container that ' +
      'focus can drive, which is the issue-1286 blank-window defect'
  );
});

// ── THE "or…" MENU (issue 1373, maintainer round 8) ──────────────────────────────────────
// The panel a requirement row opens to accept a different KIND of ingredient in its place.
// `proto:2292` is the panel, `proto:2293` its header and `proto:4682`-`4683` its entries.
const orMenuGroupCardPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte'
);
const orMenuGroupCardSource = readFileSync(orMenuGroupCardPath, 'utf8');

const OR_MENU_KINDS = ['component', 'tag', 'essence', 'currency'];
const OR_MENU_LABELS = {
  component: 'Component',
  tag: 'Tag',
  essence: 'Essence',
  currency: 'Currency',
};
const OR_MENU_GLYPHS = {
  component: 'fa-solid fa-cube',
  tag: 'fa-solid fa-tag',
  essence: 'fa-solid fa-flask-vial',
  currency: 'fa-solid fa-coins',
};

test('the "or…" menu is a 150px panel of four tinted, one-word entries under its own header', async () => {
  // WHY IT IS MEASURED AND NOT READ. Three of this panel's claims are cascade questions that a
  // sheet cannot answer on its own:
  //
  //   1. the ENTRY is a `<button>`, so Foundry's `a.button, button { justify-content: center }`
  //      in `@layer elements.forms` reaches it — the same host rule that centred the suggestion
  //      row one round ago. `styles/fabricate.css` imports at `layer(modules)`, which sorts
  //      after `elements`, so one declaration displaces it; whether one is WRITTEN is the
  //      question, and only a rendered cascade answers it.
  //   2. the panel's frame is stated twice — `.fabricate-picker-popover.manager-travel-popover`
  //      gives every picker an 8px corner on `--fab-bg-3`, and this menu's own rule has to
  //      out-specify it inside the same layer.
  //   3. the entry TINT is not written for this panel at all. The glyph carries the ROW's own
  //      `.manager-recipe-option-mark.is-<kind>` class, so the menu is inked by the same four
  //      rules the plate and the chosen chip are and cannot drift from them. That claim holds
  //      only if those rules still reach a glyph inside a PORTALED panel, which is a different
  //      DOM position from the row's.
  //
  // So the fixture renders the four reference marks a ROW draws beside the panel and compares
  // colour for colour, rather than pinning four token names a rename would walk away from.
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopover.svelte')
  );
  const stamp = (markup) =>
    [
      'manager-travel-popover',
      'manager-travel-popover-header',
      'manager-travel-popover-title',
      'manager-travel-popover-options',
      'manager-travel-option',
      'manager-travel-option-name',
    ].reduce((html, className) => withScopeHash(html, className, popoverScoped.hashClass), markup);

  // The panel exactly as `SearchablePopover` portals it: the primitive's own two classes, the
  // caller's `popoverClass`, the header the `popoverTitle` prop renders, and one option button
  // per kind carrying the row's tinted-mark glyph. `width: 150px` is written inline because
  // that is where it comes from in the product — the primitive computes its width from
  // `minWidth`/`maxWidth` and writes it onto the node, so no rule in the sheet states it and
  // the source assertion at the foot of this test is what pins the number.
  const panel = stamp(
    '<div class="fabricate-picker-popover manager-travel-popover manager-recipe-or-popover" ' +
      'role="dialog" aria-label="Accept instead" style="width: 150px;">' +
      '<div class="manager-travel-popover-header" data-popover-header>' +
      '<span class="manager-travel-popover-title">Accept instead</span></div>' +
      '<div class="manager-travel-popover-options" role="listbox" aria-label="Accept instead">' +
      OR_MENU_KINDS.map(
        (kind) =>
          `<button type="button" class="manager-travel-option" role="option" data-recipe-add="alternative-${kind}" data-kind="${kind}">` +
          `<i class="${OR_MENU_GLYPHS[kind]} manager-recipe-option-mark is-${kind}"></i>` +
          `<span class="manager-travel-option-name">${OR_MENU_LABELS[kind]}</span></button>`
      ).join('') +
      '</div></div>'
  );

  // The reference marks: the same four classes, on the plate a requirement ROW draws.
  const referenceRows = OR_MENU_KINDS.map(
    (kind) =>
      `<span class="manager-recipe-option-lead is-${kind}">` +
      `<i class="${OR_MENU_GLYPHS[kind]} manager-recipe-option-mark is-${kind}" data-reference-mark="${kind}"></i></span>`
  ).join('');

  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 520 },
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
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            ${popoverScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${referenceRows}
            ${panel}
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const panelNode = document.querySelector('.manager-recipe-or-popover');
      const panelStyle = getComputedStyle(panelNode);
      const heading = panelNode.querySelector('.manager-travel-popover-title');
      const entries = [...panelNode.querySelectorAll('[data-recipe-add]')].map((entry) => {
        const glyph = entry.querySelector('i');
        const label = entry.querySelector('.manager-travel-option-name');
        const style = getComputedStyle(entry);
        const box = entry.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        return {
          kind: entry.dataset.kind,
          justifyContent: style.justifyContent,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          // The offset of the glyph from the entry's own padding edge: zero means the row
          // reads from its left edge, as `proto:4683` draws it.
          glyphIndent: Number(
            (
              glyph.getBoundingClientRect().left -
              (box.left +
                Number.parseFloat(style.paddingLeft) +
                Number.parseFloat(style.borderLeftWidth))
            ).toFixed(2)
          ),
          glyphColor: getComputedStyle(glyph).color,
          glyphWidth: getComputedStyle(glyph).width,
          glyphFontSize: getComputedStyle(glyph).fontSize,
          labelHeight: Number(label.getBoundingClientRect().height.toFixed(2)),
          labelLineHeight:
            Number.parseFloat(labelStyle.lineHeight) ||
            Number.parseFloat(labelStyle.fontSize) * 1.2,
          referenceColor: getComputedStyle(
            document.querySelector(`[data-reference-mark="${entry.dataset.kind}"]`)
          ).color,
        };
      });
      return {
        panel: {
          width: Number(panelNode.getBoundingClientRect().width.toFixed(2)),
          borderRadius: panelStyle.borderTopLeftRadius,
        },
        headerText: heading ? heading.textContent : '',
        headerTransform: heading ? getComputedStyle(heading).textTransform : '',
        entries,
      };
    });

    assert.equal(report.panel.width, 150, '`proto:2292` draws a 150px panel');
    assert.equal(report.panel.borderRadius, '9px', '`proto:2292`: a 9px corner');
    assert.equal(report.headerText, 'Accept instead');
    assert.equal(report.headerTransform, 'uppercase', '`proto:2293` sets the eyebrow in caps');

    for (const entry of report.entries) {
      assert.notEqual(
        entry.justifyContent,
        'center',
        `the ${entry.kind} entry must displace the host button rule rather than inherit its centring`
      );
      assert.ok(
        Math.abs(entry.glyphIndent) <= 1,
        `the ${entry.kind} entry's glyph starts at its own left edge (indent ${entry.glyphIndent}px)`
      );
      assert.equal(entry.fontSize, '11px', `\`proto:4683\`: the ${entry.kind} entry is 11px`);
      assert.equal(entry.fontWeight, '600', `\`proto:4683\`: the ${entry.kind} entry is 600`);
      assert.equal(entry.glyphFontSize, '10px', '`proto:4683`: a 10px glyph');
      assert.equal(entry.glyphWidth, '14px', '`proto:4683`: a 14px glyph column');
      assert.ok(
        entry.labelHeight <= entry.labelLineHeight * 1.5,
        `the ${entry.kind} entry's one-word label fits a 150px panel on one line ` +
          `(${entry.labelHeight}px over a ${entry.labelLineHeight}px line)`
      );
      // THE ANTI-DRIFT CLAIM, and the reason the reference marks are in this document at all.
      assert.equal(
        entry.glyphColor,
        entry.referenceColor,
        `the ${entry.kind} entry is inked by the same rule the row's own mark is`
      );
    }

    // …and four DIFFERENT inks, so "each carries its kind's colour" is a statement about four
    // kinds rather than about one colour applied four times.
    assert.equal(
      new Set(report.entries.map((entry) => entry.glyphColor)).size,
      4,
      `the four kinds are four colours (got ${report.entries.map((entry) => entry.glyphColor).join(', ')})`
    );
  } finally {
    await context.close();
  }

  // THE WIDTH'S OWN SOURCE. The primitive writes the computed width onto the node, so the
  // measurement above proves the geometry a 150px panel produces and this proves 150 is the
  // number the caller asks for.
  assert.match(
    orMenuGroupCardSource,
    /minWidth=\{150\}/,
    '`proto:2292` fixes the panel at 150px, so the caller must ask for exactly that'
  );
  assert.match(orMenuGroupCardSource, /maxWidth=\{150\}/, 'and must not let it grow past it');
});



test("the requirement row's two dashed affordances paint at all, and at the design's two scales", async () => {
  // MEASURED, BECAUSE THE SHEET SAID OTHERWISE AND WAS NOT PAINTING (issue 1373, round 8).
  //
  // `or…` and `+ Tag` are the two affordances a requirement row carries, and `styles/fabricate.css`
  // stated a dashed edge, a tint and a transparent fill for each — bound to the shared chip class,
  // because both rendered through `Chip`. Every one of those properties is ALSO declared in
  // `Chip.svelte`'s own scoped block, which `svelte.config.js` injects UNLAYERED while
  // `module.json` imports the sheet at `layer(modules)`. An unlayered declaration beats a layered
  // one at any specificity, so both rules matched, both were discarded, and the two shipped as
  // the default filled neutral chip: 20px tall, a SOLID `--fab-border` edge, `--fab-text` ink, a
  // 10px corner and a fill. Two rounds of this issue believed otherwise, and no gate could
  // disagree — stylelint does not read `.svelte`, Svelte's unused-selector pass never sees the
  // sheet, and a fixture that loads both flat reports the sheet winning.
  //
  // So this test is written in the LAYER ORDER THAT SHIPS, and it measures the CHIP as a control:
  // the same fixture renders a plain `Chip` beside the two, so "these two are not chips" is a
  // measured difference against the real primitive rather than an assertion about a token name.
  const chipScopedForTriggers = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/Chip.svelte')
  );
  const chipProbe = withScopeHash(
    '<button type="button" class="manager-chip" data-plain-chip><i class="fa-solid fa-plus"></i><span>Chip</span></button>',
    'manager-chip',
    chipScopedForTriggers.hashClass
  );

  const context = await sharedBrowser.newContext({
    viewport: { width: 640, height: 240 },
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
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: 2rem; }
            }
            @layer modules { ${css} }
            ${chipScopedForTriggers.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="fabricate-picker manager-travel-picker manager-recipe-or-picker">
              <button type="button" class="manager-recipe-or-trigger" data-or-trigger>
                <i class="fa-solid fa-code-branch"></i><span class="manager-travel-picker-value">or…</span>
              </button>
            </div>
            <div class="fabricate-picker manager-travel-picker manager-recipe-tag-picker">
              <button type="button" class="manager-recipe-tag-trigger" data-tag-trigger>
                <i class="fa-solid fa-plus"></i><span class="manager-travel-picker-value">Tag</span>
              </button>
            </div>
            ${chipProbe}
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const read = (selector) => {
        const node = document.querySelector(selector);
        const style = getComputedStyle(node);
        return {
          height: Number(node.getBoundingClientRect().height.toFixed(2)),
          borderStyle: style.borderTopStyle,
          borderRadius: style.borderTopLeftRadius,
          color: style.color,
          background: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          justifyContent: style.justifyContent,
        };
      };
      return {
        or: read('[data-or-trigger]'),
        tag: read('[data-tag-trigger]'),
        chip: read('[data-plain-chip]'),
      };
    });

    // THE CONTROL IN BOTH SENSES. This is what the two affordances were rendering as, so every
    // claim below is a measured difference from it rather than a value read off the sheet.
    assert.equal(
      report.chip.borderStyle,
      'solid',
      'the plain chip is the filled solid-edged badge both affordances were shipping as'
    );

    // `proto:2290`: 26px — a rung on the control-height ladder, and the height of the stepper it
    // stands beside — with a 7px corner, 9.5px/600 text and a dashed `--border-strong` edge.
    assert.equal(report.or.borderStyle, 'dashed', 'the "or…" trigger is an affordance, not a fill');
    assert.equal(report.or.height, 26, '`proto:2290`: 26px');
    assert.equal(report.or.borderRadius, '7px', '`proto:2290`: a 7px corner');
    assert.equal(report.or.fontSize, '9.5px', '`proto:2290`: 9.5px');
    assert.equal(report.or.fontWeight, '600', '`proto:2290`: 600');
    assert.equal(
      report.or.background,
      'rgba(0, 0, 0, 0)',
      '`proto:2290` gives the affordance no fill of its own'
    );
    assert.notEqual(
      report.or.justifyContent,
      'center',
      'and it displaces the host `button { justify-content: center }` rather than inheriting it'
    );

    // `proto:2256`: a ~20px stadium in the TAG tint at 10px/600, which is a different scale from
    // `or…` on purpose — one is a control among controls, the other a chip among chips.
    assert.equal(report.tag.borderStyle, 'dashed', 'the `+ Tag` pill is an affordance too');
    assert.equal(report.tag.borderRadius, '999px', '`proto:2256`: a stadium');
    assert.equal(report.tag.fontSize, '10px', '`proto:2256`: 10px');
    assert.equal(report.tag.fontWeight, '600', '`proto:2256`: 600');
    assert.equal(
      report.tag.background,
      'rgba(0, 0, 0, 0)',
      '`proto:2256` gives it no fill either — the chips beside it are the filled things'
    );
    assert.ok(
      report.tag.height <= 22,
      `\`proto:2256\` draws a pill no taller than the chips it stands among (got ${report.tag.height}px)`
    );
    // The two carry DIFFERENT inks, and neither is the chip's. `+ Tag` is in the tag family
    // because a tag is what it adds; `or…` is quiet because it offers four kinds and favours none.
    assert.notEqual(report.tag.color, report.chip.color, 'the `+ Tag` pill carries the tag tint');
    assert.notEqual(report.or.color, report.tag.color, 'and `or…` is not in the tag family');
  } finally {
    await context.close();
  }

  // THE MARKUP HALF. A fixture goes on measuring itself long after the component stops emitting
  // it, so the claim that these ARE the two triggers is pinned at both call sites: neither may
  // ask for the chip shape whose own scoped block is what discarded the rules above.
  assert.doesNotMatch(
    orMenuGroupCardSource,
    /\n\s+triggerChip\b/,
    'the "or…" trigger is a bare button this sheet can style, not a Chip'
  );
  assert.doesNotMatch(
    readFileSync(
      resolve(__dirname, '../../src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte'),
      'utf8'
    ),
    /\n\s+triggerChip\b/,
    'and so is `+ Tag`'
  );
  for (const retired of ['manager-recipe-or-trigger', 'manager-recipe-tag-trigger']) {
    assert.doesNotMatch(
      css,
      new RegExp(`\\.manager-chip\\.${retired}`),
      `the discarded chip-bound rules for \`${retired}\` are retired rather than left reading as live`
    );
  }
});

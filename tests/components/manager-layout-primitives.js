/**
 * App shell, rail, titlebar, empty state, callout, card and chip layout, measured in a real browser (issue 1670).
 *
 * A surface module of `manager-layout.test.js`. It registers its tests on import and owns no
 * browser: `tests/helpers/layout-harness.js` holds the one Chromium every surface shares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { declaration, splitTopLevel, topLevelRules } from '../helpers/fullWidthRoute.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  blockFor,
  blockIn,
  chipStyles,
  css,
  managerButtonClassesFor,
  managerComponentDir,
  readWorkspaceGrid,
  withoutComments,
} from './manager-layout-shared.js';
import {
  ANCESTOR_CONTEXT_FLOOR,
  DISABLED_CONTEXTS,
  DISABLED_ROLE_PROBES,
  REQUIRED_DISABLED_CONTEXTS,
  UNMATERIALIZABLE_CONTEXTS,
  calloutPath,
  calloutStyles,
  disabledProbeMarkup,
  emptyStateStyles,
  explainerCardSource,
  explainerCardStyles,
  iconFactRowStyles,
  readShortWindowRailGeometry,
  stackedBodyRule,
} from './manager-layout-primitives-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  // ONE PAIR, at the module root (issue 1501). The `.fabricate-app` pair and the byte-identical
  // `.fabricate-manager` pair this test used to read separately are collapsed onto `.fabricate`,
  // the class every Fabricate application root emits, at the same (0,2,1) rank and at the app
  // pair's earlier position. Both areas are covered by this one block because `.fabricate` is
  // the player app's own root and the manager `<div>`'s ancestor.
  const moduleFocusBlock = blockFor(
    '.fabricate a:focus,\n.fabricate button:focus,\n.fabricate input:focus,\n.fabricate select:focus,\n.fabricate textarea:focus,\n.fabricate [tabindex]:focus'
  );
  const moduleFocusVisibleBlock = blockFor(
    '.fabricate a:focus-visible,\n.fabricate button:focus-visible,\n.fabricate input:focus-visible,\n.fabricate select:focus-visible,\n.fabricate textarea:focus-visible,\n.fabricate [tabindex]:focus-visible'
  );

  assert.ok(
    moduleFocusBlock.includes('outline: none;') && moduleFocusBlock.includes('box-shadow: none;'),
    'module-rooted controls should clear host click focus outlines'
  );
  assert.ok(
    moduleFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'module-rooted keyboard focus should remain visible'
  );
  assert.equal(
    css.includes('.fabricate-app button:focus,'),
    false,
    'the app-area copy of the reset is collapsed into the module-rooted pair, not left beside it'
  );
  assert.equal(
    css.includes('.fabricate-manager a:focus,'),
    false,
    'and so is the manager copy — two roots restating one pair is the duplication 1501 ends'
  );

  // THE TWO HALVES ARE A PAIR AND MUST NAME THE SAME ELEMENTS (issue 1118). The suppressing
  // half strips whatever ring Foundry's core or the browser draws; the supplying half puts
  // Fabricate's own back on keyboard focus. An element in the first list and not the second gets
  // NO ring at all, which is what a focused manager `textarea` did, and an element in neither
  // keeps the host's, which is what the twelve anchor manager buttons did. Both were live and
  // both were invisible to the two blocks read above, because each of those only asks whether
  // its own block declares an outline.
  //
  // The root token is OPTIONALLY hyphenated, and that is load-bearing rather than tidy: the
  // collapsed pair is rooted at the bare `.fabricate`, so the `\.fabricate-\w+` this matched
  // before finds nothing in it and the comparison below degrades to `deepEqual([], [])` — a
  // green test that has stopped checking the pairing it exists to check.
  const elementsIn = (prelude) => [
    ...new Set(
      [...prelude.matchAll(/\.fabricate(?:-\w+)?\s+([a-z]+|\[tabindex])(?=:)/g)].map(
        ([, one]) => one
      )
    ),
  ];
  for (const [area, suppressing, supplying] of [
    ['module root', moduleFocusBlock, moduleFocusVisibleBlock],
  ]) {
    const suppressed = elementsIn(suppressing).sort();
    // NON-EMPTY, asserted rather than assumed, for the reason the note above gives: an empty
    // pair of lists satisfies the `deepEqual` below without comparing anything.
    assert.deepEqual(
      suppressed,
      ['[tabindex]', 'a', 'button', 'input', 'select', 'textarea'],
      `the ${area}'s :focus list must name the six element targets the pair is written for, ` +
        'or the comparison below is between two empty lists'
    );
    assert.deepEqual(
      elementsIn(supplying).sort(),
      suppressed,
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
  // The manager's keyboard ring is the module-rooted pair's supplying half (issue 1501).
  const focusBlock = blockFor(
    '.fabricate a:focus-visible,\n.fabricate button:focus-visible,\n.fabricate input:focus-visible,\n.fabricate select:focus-visible,\n.fabricate textarea:focus-visible,\n.fabricate [tabindex]:focus-visible'
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
// `Callout` is ONE shape for every tone; a tone that also changed the geometry or the type
// would put the drift straight back.
//
// THE ONE SHAPE IS NOW THE SPECIMEN'S, AND THE DEFAULT TONE IS NEUTRAL (issue 1505). This
// test used to pin r8 / 0.7rem / 500 / 1.45 over an info-tinted default with a `--fab-info`
// glyph — the taller treatment, defended as "the one already approved visually". The design
// system's own specimen draws the control quietly (r11 / 11.5px / 1.6 / `--fab-text-muted`
// on the surface fill and the ordinary border) and reserves the info tint for "a note about
// live state", and the Checks studio was already overriding the component back to exactly
// that. So the numbers below move with the convergence; what does NOT move is the property
// this test exists for — a tone still changes colour and nothing else.
test('the shared callout keeps one shape and lets tone change only its colours', () => {
  const calloutBlock = blockIn(calloutStyles, '.manager-callout');
  const calloutIconBlock = blockIn(calloutStyles, '.manager-callout > i');
  const warningBlock = blockIn(calloutStyles, '.manager-callout.is-warning');
  const warningIconBlock = blockIn(
    calloutStyles,
    '.manager-callout.is-warning > i,\n  .manager-callout.is-warning .manager-callout-title'
  );

  // The specimen's treatment — `library.html:219-220` — is the ONLY shape.
  for (const declaration of [
    'padding: var(--fab-space-3);',
    'font-size: 11.5px;',
    'font-weight: 400;',
    'line-height: 1.6;',
    'border-radius: 11px;',
  ]) {
    assert.ok(calloutBlock.includes(declaration), `the callout should declare ${declaration}`);
  }
  assert.ok(
    calloutBlock.includes('border: 1px solid var(--fab-border);') &&
      calloutBlock.includes('background: var(--fab-surface-soft);'),
    'the default tone is NEUTRAL: the surface fill and the ordinary border'
  );
  assert.ok(
    calloutIconBlock.includes('color: var(--fab-text-subtle);'),
    'and its glyph is quiet too — the tint is what a tone spends, so neutral spends none'
  );

  // Tone is a colour concern only.
  assert.ok(
    warningBlock.includes('border-color: var(--fab-warning-border);') &&
      warningBlock.includes('background: var(--fab-warning-soft);'),
    'the warning tone repaints the edge and the fill'
  );
  assert.ok(
    warningIconBlock.includes('color: var(--fab-warning-text);'),
    'the warning tone repaints the glyph — and the title with it, in ONE rule as `.k-notice` does'
  );
  assert.equal(
    /padding|font-size|font-weight|line-height|gap:/.test(warningBlock),
    false,
    'a tone must not change the callout geometry or type scale'
  );
});

// Issue 1505: the widened `Callout` takes an `actions` snippet, and the Tool Studio's identity
// notice is its first caller — its `World Tool` button MOVED from a sibling of the strip into
// the strip's own body. `Notice` does the same with its action and dismiss controls. A control
// that has been repositioned INSIDE another component's flex row is exactly the case a mounted
// test cannot see: happy-dom computes no cascade, so a body that grew over the button, or a
// glyph column that overlapped it, would still report a button in the DOM and a handler bound
// to it. So the press is measured where a user makes it — at the control's own centre, in a
// real browser, against the components' real scoped CSS injected in the real order.
test('the controls nested inside a callout and a notice own their own pointer targets', async () => {
  const calloutScoped = scopedComponentCss(calloutPath);
  const noticeScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Notice.svelte')
  );

  // The rendered shapes, element for element: a `<div role="note">` once a title or an action is
  // present, the body between the glyph and the controls, and the controls last.
  let fixture = `
    <div class="fabricate">
      <main class="fabricate-manager">
        <div class="strip">
          <div role="note" class="manager-callout is-warning">
            <i class="fas fa-link-slash" aria-hidden="true"></i>
            <span class="manager-callout-body"
              ><span class="manager-callout-text">This Tool names no game-world Item. Its identity
              is set on the world Tool, not here, and it cannot be saved until that link is
              restored.</span></span
            >
            <span class="manager-callout-actions"
              ><button
                type="button"
                class="fabricate-button manager-button fab-manager-button"
                data-probe="callout-action"
                ><i class="fas fa-globe" aria-hidden="true"></i><span>World Tool</span></button
              ></span
            >
          </div>
          <div class="fab-notice is-danger">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <div class="fab-notice-body">
              <div class="fab-notice-title">This recipe cannot be saved</div>
              <div class="fab-notice-detail">Step 2 has no ingredients, and the Critical result
              set routes to a tier that no longer exists.</div>
            </div>
            <button type="button" class="fab-notice-button" data-probe="notice-action">Show both</button>
            <button type="button" class="fab-notice-button is-dismiss" data-probe="notice-dismiss"
              aria-label="Dismiss"><i class="fas fa-xmark" aria-hidden="true"></i></button>
          </div>
        </div>
      </main>
    </div>
  `;
  for (const contractClass of [
    'manager-callout',
    'manager-callout-body',
    'manager-callout-text',
    'manager-callout-actions',
  ]) {
    fixture = withScopeHash(fixture, contractClass, calloutScoped.hashClass);
  }
  for (const contractClass of [
    'fab-notice',
    'fab-notice-body',
    'fab-notice-title',
    'fab-notice-detail',
    'fab-notice-button',
  ]) {
    fixture = withScopeHash(fixture, contractClass, noticeScoped.hashClass);
  }

  const context = await openLayoutContext({
    viewport: { width: 900, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // The scoped blocks come AFTER the global sheet, which is the order `css: 'injected'`
    // produces at runtime — see `tests/helpers/scoped-component-css.js`.
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>@layer modules { ${css} }</style>
          <style>${calloutScoped.css}</style>
          <style>${noticeScoped.css}</style>
          <style>
            :root { font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fabricate { font-size: 14px; }
            .fas::before { content: "x"; }
            .strip { width: 520px; display: grid; gap: 12px; }
          </style>
        </head>
        <body>${fixture}</body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const probe = (name) => {
        const element = document.querySelector(`[data-probe="${name}"]`);
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          own: hit === element || element.contains(hit),
          tag: hit?.tagName ?? 'none',
          className: String(hit?.className ?? ''),
          width: box.width,
          height: box.height,
        };
      };
      return {
        'callout-action': probe('callout-action'),
        'notice-action': probe('notice-action'),
        'notice-dismiss': probe('notice-dismiss'),
      };
    });

    for (const [name, measured] of Object.entries(report)) {
      assert.ok(
        measured.width > 0 && measured.height > 0,
        `${name}: the nested control collapsed to ${measured.width}x${measured.height} — a flex ` +
          'row whose sibling took the whole line leaves a control that cannot be pressed'
      );
      assert.ok(
        measured.own,
        `${name}: the press at its centre landed on <${measured.tag} ` +
          `class="${measured.className}"> instead of the control itself`
      );
    }
  } finally {
    await context.close();
  }
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
    '.fabricate-button.manager-button,\n.fabricate-icon-button.manager-icon-button'
  );
  const primaryIconBlock = blockFor('.fabricate-icon-button.manager-icon-button.is-primary');
  const primaryIconHoverBlock = blockFor(
    '.fabricate-icon-button.manager-icon-button.is-primary:not(:disabled):hover'
  );
  const iconBlocks = Array.from(
    css.matchAll(/\.fabricate-icon-button\.manager-icon-button\s*\{[\s\S]*?\}/g)
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
    css.includes('.fabricate-button.manager-button:disabled'),
    'disabled manager buttons should have explicit disabled styling'
  );
  assert.ok(
    css.includes('.fabricate-button.manager-button:not(:disabled):hover'),
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
  // The hide rule lists each trailing marker by name as of issue 1515: the planned-view word
  // and the premium chip used to inherit it by wearing `.manager-nav-count`.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label,\n' +
        '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count,\n' +
        '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-planned,\n' +
        '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-premium {'
    ),
    'collapsed rail should hide nav labels and every trailing marker to leave an icon-only strip'
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

  // The collapsed rail's hide rule NAMES every trailing marker it hides (issue 1515). The
  // planned-view word and the premium chip used to inherit this hide by wearing
  // `.manager-nav-count`, which is how a tier gate and a placeholder word came to be drawn
  // through the record-count vehicle. Each has its own vehicle now, so the rule lists them.
  const collapsedHideSelectors = [
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-label',
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-count',
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-planned',
    '.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-premium',
  ];
  assert.ok(
    css.includes(collapsedHideSelectors.join(',\n') + ' {\n  display: none;\n}'),
    'collapsed rail must hide the nav label and every trailing marker that reports on the row'
  );
  // Comments stripped: the rule this replaced NAMES the old compound in its own prose, and a
  // negative control that a comment can satisfy tests nothing.
  assert.equal(
    withoutComments(css).includes('.manager-nav-count.manager-nav-premium'),
    false,
    'and the premium chip must not draw through the record-count vehicle again'
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
    /\.fabricate-manager \.manager-titlebar-badge,\s*\.fabricate-manager \.manager-nav-premium \{[\s\S]*?\}/.exec(
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
  // Read each selector in grouped rules, including task-mode attributes and wrapped lines.
  // Only top-level rules own a rail; narrow container-query stacks do not.
  const rules = topLevelRules(css).flatMap(({ prelude, declarations }) =>
    splitTopLevel(prelude, ',').map((selector) => ({
      selector: selector.replace(/\s+/g, ' '),
      columns: declaration(declarations, 'grid-template-columns'),
    }))
  );
  const views = rules.filter(({ selector, columns }) =>
    selector.includes('[data-manager-view') && selector.endsWith(' .manager-body') && columns
  );
  assert.ok(views.length > 0, 'expected view-specific manager-body grid overrides');

  for (const { selector, columns } of views) {
    const firstColumn = columns.split(/\s+/)[0];
    // A view that stacks to a single column (e.g. inside a narrow container query) has no rail
    // column to narrow, so it does not need a collapsed override.
    if (firstColumn === '1fr' || firstColumn.startsWith('minmax')) {
      continue;
    }

    const collapsed = rules.find((rule) => rule.selector === `${selector}.is-rail-collapsed`);
    assert.ok(collapsed, `${selector} is missing its collapsed override`);
    assert.match(collapsed.columns ?? '', /^56px\s/, `${selector} must narrow the rail to 56px`);
  }
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

  // THE TAB BADGE IS WRITTEN AT THREE CLASSES, and issue 1509 corrects WHY while changing
  // neither assertion's subject, the rule's declarations, nor any rendered value.
  //
  // Issue 883's reason was that three classes out-rank `Chip.svelte`'s own scoped
  // `.manager-chip.svelte-<hash>` block, so the badge renders at its own deliberately smaller
  // 18px/0.56rem rather than at the chip's scale. That is not how the contest resolves.
  // Foundry loads `styles/fabricate.css` into `layer(modules)` and `svelte.config.js` injects a
  // scoped block UNLAYERED, and an unlayered declaration beats a layered one at ANY specificity
  // — so the chip's block wins every property it declares whatever this selector's class count
  // is, and only the properties `Chip` does NOT declare (the margin, the min-width, the mono
  // face and the tabular figures) actually land from here. The badge does not render at
  // 18px/0.56rem in the product today; that defect, and the fact that
  // `tests/helpers/scoped-component-css.js` models injection order and specificity but no
  // layers at all and therefore cannot see it, are both filed to issue 1507.
  //
  // So the three-class form is preserved for a smaller and true reason: CHANGING THE CLASS
  // COUNT IS A CHANGE, and issue 1509 re-roots this family at `fabricate-tabs` with the rank,
  // the layer, the position and the declarations all unchanged. The first assertion below is
  // the one the re-root moves, and it moves by exactly one compound.
  assert.ok(
    css.includes('.fabricate-tabs .manager-chip.manager-editor-tab-badge {'),
    'the tab badge rule must stay at three classes, rooted at the class `EditorTabs` emits ' +
      'rather than at the manager window'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-editor-tab-badge {'),
    false,
    'the two-class, manager-rooted form is the shape this rule must never be rewritten back ' +
      'to: it is neither three classes nor rooted at the primitive'
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
  const armedBlock = blockFor('.fabricate-button.manager-button.is-danger.is-armed');
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

  const context = await openLayoutContext({
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
  const context = await openLayoutContext({
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
              <span class="fabricate-icon-button manager-icon-button is-warning-action" data-probe="icon"></span>
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
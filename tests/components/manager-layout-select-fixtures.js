/**
 * Fixtures and rendered-geometry readers for `manager-layout-select.js` (issue 1670).
 *
 * Shared Select, picker popover, browser toolbar control and pager layout: the markup, the component sources and the
 * page readers that surface's tests measure through. Nothing here asserts.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
/**
 * The class list a fixture host must carry to impersonate `SvelteFabricateApp`'s window FRAME.
 *
 * WHY THE THIRD CLASS IS LOAD-BEARING IN A LAYOUT HARNESS. `styles/fabricate.css` is injected
 * below at `@layer modules`, exactly as the product ships it, so whatever floors the real player
 * frame floors these hosts too. Issue 1520 split that floor off the shared `.fabricate-app` area
 * class onto `.fabricate.fabricate-app-window`, because three canvas windows 420-560px wide now
 * adopt `.fabricate-app` and a floor on it would have inflated all three. These hosts run at
 * 900x700, 900x400 and 640x320 viewports and are meant to BE the player frame, so they take the
 * window class as well; drop it and each host silently narrows to its viewport width — 124, 124
 * and 384 pixels off the box the select-panel and popover-row probes measure inside, with no
 * assertion naming the geometry that moved.
 */
export const PLAYER_FRAME_CLASSES = 'fabricate fabricate-app fabricate-app-window';

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
export const SORT_DIRECTION_PROBES = Object.freeze([
  Object.freeze({ probe: 'recipe', attributes: 'class="manager-recipe-sort-direction"' }),
  Object.freeze({ probe: 'component', attributes: 'class="manager-component-sort-direction"' }),
  Object.freeze({ probe: 'essence', attributes: 'data-essence-sort-direction="asc"' }),
]);

// ── THE COMPOSED PICKER CASCADE, ENUMERATED IN A REAL BROWSER (issue 1503) ──────────────────
//
// `IconPicker` and `EssenceSourceSelector` render through `SearchablePopover` now, so the panel,
// the search row, the list and every option row carry the PRIMITIVE's class AND the caller's on
// one element. Four rules then tie at (0,2,0), and in every one the shared rule is thousands of
// lines further down this sheet and wins on source order. Which declarations the callers had to
// keep, and at what specificity, is not something to reason about in prose: it is a cascade, and
// this is the only instrument in the repository that can resolve one.
//
// WHY HERE AND NOT IN A MOUNTED SUITE. `styles/fabricate.css` is a GLOBAL sheet. No mounted
// harness ever loads it — they compile components with `css: 'injected'`, and
// `tests/helpers/scoped-component-css.js` records that happy-dom cannot compute a cascade at
// all. A `document.styleSheets` walk in a mounted test sees Svelte's scoped blocks and nothing
// else. This file launches Chromium, injects the real sheet, and asks the browser.
//
// WHAT IT ENUMERATES. For each element of the composed panel it walks every rule in the sheet,
// keeps the ones the element MATCHES, records each declaration with its selector, its
// specificity and its source order, and computes the winner per property. TWO THINGS PIN THAT
// WINNER. Each of the ~40 properties the clauses below name is compared by SELECTOR against a
// hard-coded expectation, which is what reds when the tie-break is inverted; and every winner
// over a contested property WHOSE DECLARED VALUE IS A LITERAL is compared with the browser's own
// `getComputedStyle` as it is enumerated. Without the second, the report printed below — every
// property on eleven surfaces — was checked against nothing, and a confident wrong report was a
// state this file could reach.
//
// THE SECOND IS NARROWER THAN IT SOUNDS, and the number is measured rather than estimated: of
// the ~175 contested (probe, property) pairs, 33 are compared, on five of the eleven probes.
// `var()`, `calc()`, `min()`, `max()`, `inherit`, a percentage and an unsubstituted shorthand
// longhand are all skipped, because for those a declared value and a computed one are different
// strings by construction rather than by disagreement. This sheet is heavily tokenised, so
// ordinary design-token work moves properties OUT of that set — which is why the count itself is
// returned and floored below rather than left implicit.
//
// The report itself is printed under `FABRICATE_CASCADE_REPORT=1`, which is how the PR's
// acceptance evidence is produced. The assertions run either way.

/** The composed panel, as the two pickers now render it through the shared primitive. */
export const PICKER_CASCADE_FIXTURE = `
  <div class="fabricate-manager" data-manager-view="world-essences">
    <div class="fabricate-picker manager-travel-picker fabricate-icon-picker essence-icon-picker" data-probe="icon-root">
      <button type="button" class="essence-icon-picker-trigger" data-probe="icon-trigger">
        <span class="essence-icon-picker-preview" data-probe="trigger-chip"><i class="fas fa-cog"></i></span>
        <span class="essence-icon-picker-trigger-label">Cog</span>
        <span class="essence-icon-picker-trigger-caret"><i class="fas fa-chevron-down"></i></span>
      </button>
    </div>
    <div class="fabricate-picker-popover manager-travel-popover fabricate-icon-picker-popover essence-icon-picker-popover" role="dialog" data-probe="icon-panel">
      <div class="manager-travel-popover-search essence-icon-picker-search" data-probe="icon-search-row">
        <input type="text" data-probe="icon-search-input">
      </div>
      <div class="manager-travel-popover-options essence-icon-picker-options" role="listbox" data-picker-as="list" data-probe="icon-list">
        <button type="button" class="manager-travel-option essence-icon-picker-option pinned" role="option" tabindex="-1" data-keyboard-focus="true" aria-selected="true" data-active-option="true" data-probe="icon-row-active-selected">
          <span class="essence-icon-picker-preview" data-probe="row-chip"><i class="fas fa-cog"></i></span><span>Cog</span>
        </button>
        <button type="button" class="manager-travel-option essence-icon-picker-option" role="option" tabindex="-1" data-keyboard-focus="true" aria-selected="false" data-probe="icon-row-resting">
          <span class="essence-icon-picker-preview"><i class="fas fa-flask"></i></span><span>Flask</span>
        </button>
      </div>
    </div>
    <div class="fabricate-picker manager-travel-picker fabricate-source-picker essence-source-selector" data-probe="source-root">
      <div class="essence-source-selector-shell">
        <button type="button" class="essence-source-trigger has-value" data-probe="source-trigger"><img class="essence-source-trigger-image" alt=""></button>
      </div>
    </div>
    <div class="fabricate-picker-popover manager-travel-popover fabricate-source-picker-popover essence-source-picker-popover" role="dialog" data-probe="source-panel">
      <div class="manager-travel-popover-search essence-source-picker-search"><input type="text" data-probe="source-search-input"></div>
      <div class="manager-travel-popover-options essence-source-picker-grid" role="listbox" data-picker-as="grid" data-picker-columns="2" data-probe="source-list">
        <button type="button" class="manager-travel-option essence-source-picker-option" role="option" tabindex="-1" data-keyboard-focus="true" aria-selected="true" data-probe="source-row-selected"><img alt=""><span>Linen Cloth</span></button>
        <button type="button" class="manager-travel-option essence-source-picker-option" role="option" tabindex="-1" data-keyboard-focus="true" aria-selected="false" data-probe="source-row-resting"><img alt=""><span>Iron Ore</span></button>
      </div>
    </div>
  </div>`;

/**
 * The four RETAINED declarations whose token is TRANSLUCENT, so a value being unchanged does not
 * mean the rendered colour is (issue 1503). The panel's backdrop moves `--fab-bg-3` →
 * `--fab-bg-0`, and a translucent fill composites against whatever is behind it. A chip sits on
 * a ROW, so its ground is the row's own composited fill rather than the panel's — which is
 * exactly why it is the one that stops working.
 */
export const TRANSLUCENT_RETENTIONS = Object.freeze([
  Object.freeze({ what: 'option row fill', token: '--fab-overlay-light-06', over: 'panel' }),
  Object.freeze({ what: 'option row border', token: '--fab-border', over: 'panel' }),
  Object.freeze({ what: 'selected/hover fill', token: '--fab-success-soft', over: 'panel' }),
  Object.freeze({ what: 'preview chip', token: '--fab-overlay-dark-16', over: 'row' }),
]);

export const CALLER_ROW =
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option';
export const SHARED_PANEL = '.fabricate-picker-popover.manager-travel-popover';
export const SHARED_ROW = '.fabricate-picker-popover .manager-travel-option';
// CSSOM normalises an attribute selector's quoting to double quotes when it re-serialises
// `selectorText`, so these two constants spell what the BROWSER reports rather than what the
// sheet is authored with. `icon-picker-layout.test.js` reads the sheet's own text and asserts
// the authored single-quoted form there.
export const ACTIVE_OUTLINE = `${SHARED_PANEL} .manager-travel-option[data-active-option="true"]`;

// ── THE SOURCE PICKER'S TRIGGER, MEASURED AT BOTH SHIPPED SITES (issue 1503) ────────────────
//
// `computeIconPickerPopoverLayout` sizes the panel to `clamp(max(triggerWidth, minWidth),
// minWidth, maxWidth)`, so a CEILING above the floor binds only for a trigger WIDER than it.
// This picker's band moved from 280-420 to the shared 280-340, and whether that is a no-op or a
// real narrowing is a question about a RENDERED width — which no source read and no prose
// derivation can answer, because the trigger fills whatever column its drop zone sits in.
//
// The two shipped sites put that column at very different widths, and the register entry for
// this component quotes the two numbers this test measures.
//
//   THE INSPECTOR RAIL (`EssenceBrowserInspector`), inside the shell's 300px third track.
//   THE ESSENCE EDITOR (`EssenceOnCraftTab`), inside a `.manager-edit-card` that declares no
//   `max-width` at all and fills the editor pane of the same 1280px window.
//
// Both are built from the real ancestor chains rather than from a bare drop zone: the width is
// entirely a question of what the ancestors are, so a fixture that dropped one of them would
// measure a number the product never renders. The scoped blocks in `EssenceBrowserInspector`,
// `EssenceEditView` and `EssenceOnCraftTab` declare no horizontal padding, so the global sheet
// this file injects is the whole of what sizes these two.
const SOURCE_TRIGGER_SHELL = (view, main, inspector) => `
  <div style="width:1280px;height:800px">
    <div class="fabricate-manager" data-manager-view="${view}" style="display:grid;grid-template-rows:minmax(0,1fr);height:100%">
      <div class="manager-body">
        <aside class="manager-rail">Rail</aside>
        ${main}
        <aside class="manager-inspector">${inspector}</aside>
      </div>
    </div>
  </div>`;

/** The picker as both callers render it: the shell, the drop-target tile, no stored value. */
const SOURCE_TRIGGER_MARKUP = (probe) => `
  <div class="fabricate-picker manager-travel-picker fabricate-source-picker essence-source-selector">
    <div class="essence-source-selector-shell">
      <button type="button" class="essence-source-trigger" data-probe="${probe}">
        <span class="essence-source-trigger-empty"><i class="fas fa-download"></i><span>Drop or pick a source item</span></span>
        <span class="essence-source-trigger-corner"><i class="fas fa-search"></i></span>
      </button>
    </div>
  </div>`;

export const SOURCE_TRIGGER_SITES = [
  // The BROWSER route, whose inspector holds the unlinked drop zone. Its own class rides beside
  // the shared one, which is the pair the sheet's `width: 100%` override is keyed on.
  SOURCE_TRIGGER_SHELL(
    'essences',
    '<main class="manager-main">Browser</main>',
    `<section class="manager-essence-inspector-section" data-essence-section="source">
       <div class="manager-essence-source-drop-zone manager-essence-inspector-source-drop-zone">
         ${SOURCE_TRIGGER_MARKUP('inspector-trigger')}
       </div>
     </section>`
  ),
  // The EDITOR route, which keeps all three tracks — it is in neither aside-releasing list in the
  // sheet — so the editor pane is `minmax(0, 1fr)` between the 220px rail and the 300px column.
  SOURCE_TRIGGER_SHELL(
    'essence-edit',
    `<main class="manager-main manager-essence-edit-main">
       <div class="manager-essence-edit-head">Tabs</div>
       <form class="manager-essence-edit-view">
         <div class="manager-essence-tab-panel">
           <div class="manager-essence-tab-stack">
             <section class="manager-edit-card" data-essence-section="effect-source">
               <div class="manager-edit-card-heading"><h3 class="manager-card-title">Active effect source</h3></div>
               <div class="manager-essence-source-drop-zone">
                 ${SOURCE_TRIGGER_MARKUP('editor-trigger')}
               </div>
             </section>
           </div>
         </div>
       </form>
     </main>`,
    '<section class="fabricate-card manager-inspector-card">Inspector</section>'
  ),
  // THE PICKER'S OWN RULE, outside any drop zone: the 140px square the component ships with
  // wherever a caller does not override it. Both sites above DO override it, so without this
  // third probe the 140 in the register entry would be a figure read off the sheet rather than
  // one anything renders.
  `<div style="width:1280px;height:200px">
     <div class="fabricate-manager" data-manager-view="essences">
       ${SOURCE_TRIGGER_MARKUP('own-rule-trigger')}
     </div>
   </div>`,
  // THE PANEL ITSELF, at the inline 380px ceiling `computeIconPickerPopoverLayout` writes, so the
  // chrome and the tile pitch the caller's `measureListMetrics` reads can be measured off the
  // composed box rather than restated from the sheet's own figures.
  `<div style="width:1280px;height:800px">
     <div class="fabricate-manager" data-manager-view="essences">
       <div class="fabricate-picker-popover manager-travel-popover fabricate-source-picker-popover essence-source-picker-popover"
            role="dialog" data-probe="measured-panel" style="width:340px;max-height:380px">
         <div class="manager-travel-popover-search essence-source-picker-search"><input type="text"></div>
         <div class="manager-travel-popover-options essence-source-picker-grid" role="listbox" data-picker-as="grid" data-picker-columns="2">
           ${Array.from(
             { length: 16 },
             (item, index) =>
               `<button type="button" class="manager-travel-option essence-source-picker-option" role="option" tabindex="-1"><img alt=""><span>Component ${index}</span></button>`
           ).join('')}
         </div>
       </div>
     </div>
   </div>`,
].join('');

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SHARED SELECT'S PAINT, IN A REAL BROWSER (issue 1504)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `tests/helpers/scoped-component-css.js` records that happy-dom cannot compute a cascade and that
// no mounted harness loads `styles/fabricate.css`, so NONE of the claims below can be made in
// `tests/components/select-mounted.test.js`. They are made here, in this file's shared Chromium
// process, because there are three independent things only a real cascade can decide:
//
//   1. WHETHER `<Select>` PAINTS AT ALL OUTSIDE THE MANAGER. Its whole point is that a converted
//      player pager and a converted manager toolbar are ONE control, and the failure mode is not
//      subtle-but-wrong, it is a control that renders at Foundry's 14px app base with core's own
//      fixed button height. So the same fixture is measured with NO `.fabricate-manager` ancestor
//      and again inside one, and the two are asserted IDENTICAL rung for rung.
//   2. WHETHER THE FAMILY'S OWN RULES BEAT THE `.fabricate-picker*` RULES IT INHERITS.
//      `<Select>` renders inside `SearchablePopover`'s own root and panel, so
//      `.fabricate-picker-popover.manager-travel-popover` — (0,2,0) ON ONE ELEMENT — reaches its
//      panel and declares `min-width: 240px`, `max-width: 340px` and `border-radius: 10px`. The
//      `.fabricate-select*` family lives in THIS SHEET, in the same `layer(modules)` (issue
//      1504), so there is no layer axis to win on: the panel variant is written in the same
//      two-compound shape and wins on SOURCE ORDER, exactly as the shipped
//      `.manager-recipe-or-popover` variant does for the same two declarations. These are the
//      declarations that prove it landed: an inline panel opening at 240px over a list of
//      two-digit numbers is the defect.
//   3. WHETHER FOUNDRY'S OWN FOCUS RING IS REPLACED RATHER THAN JOINED. Core paints a burnt-orange
//      outline plus a 4px glow on `button:focus`; `.fabricate button:focus` strips both and
//      `.fabricate button:focus-visible` restores a 2px accent OUTSET outline at (0,2,1). The
//      specimen's focus state is "border to accent-border, no glow", so the family's own rule
//      has to beat the SUPPLYING half on specificity alone — and because the winning rule draws no
//      outset ring at all, the clipped-edge defect that `.fabricate-app select:focus-visible`'s
//      INSET ring EXISTED for cannot arise on a `<button>` trigger. That rule is history: it was
//      deleted at issue 1511 when the player app's last native select converted, so nothing under
//      `.fabricate-app` carries an inset ring today and this clause records why none is needed
//      rather than which of two rules wins.
//
// The `toolbar` rung carries a fourth claim of its own. Its type size is written as the LITERAL
// `0.72rem` rather than as a read of the area-scoped control-font property, and the observable
// difference is exactly this: a rule reading that property computes the INHERITED size outside
// `.fabricate-manager`, so the player half of clause 1 would fail there. The fixture therefore
// gives the player area Foundry's own 14px app base, so "inherited" and "11.52px" cannot coincide.
export const framePath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte'
);

/** The three rungs, and everything each one publishes. Read straight off the specimen. */
export const SELECT_RUNGS = Object.freeze([
  Object.freeze({
    rung: 'form',
    height: 38,
    radius: '9px',
    fill: 'surface-soft',
    fontSize: '12.5px',
    minWidth: '240px',
    maxWidth: '340px',
  }),
  Object.freeze({
    rung: 'inline',
    height: 30,
    radius: '7px',
    fill: 'bg-2',
    fontSize: '11.5px',
    minWidth: '96px',
    maxWidth: '240px',
  }),
  Object.freeze({
    rung: 'toolbar',
    height: 34,
    radius: '9px',
    fill: 'bg-1',
    // 0.72rem against a 16px ROOT. `rem` is root-relative, which is the whole reason the literal
    // is area-independent where the control-font property is not.
    fontSize: '11.52px',
    minWidth: '160px',
    maxWidth: '320px',
  }),
]);

/** One `<Select>` trigger's markup, at one rung, exactly as the component renders it. */
export function selectTriggerFixture(area, rung) {
  return `
    <div class="fabricate-picker manager-travel-picker fabricate-select">
      <button
        type="button"
        class="fabricate-select-trigger fabricate-select-trigger-${rung}"
        data-select-size="${rung}"
        data-probe="${area}-${rung}"
        aria-haspopup="listbox"
        aria-expanded="false"
        role="combobox"
      ><span class="manager-travel-picker-value fabricate-select-value">Routed by check</span><i
        class="fas fa-chevron-down" aria-hidden="true"></i></button>
    </div>`;
}

/**
 * One open panel's markup, at one rung, with or without its tick column.
 *
 * The panel is PORTALED out of the picker root in the product, so it is a SIBLING here rather than
 * a descendant — which is the arrangement that makes `.fabricate-picker-popover.manager-travel-popover`
 * a same-element (0,2,0) contest rather than a descendant one.
 */
export function selectPanelFixture(area, rung, { ticked }) {
  const tick = ticked
    ? '<span class="fabricate-select-tick" aria-hidden="true"><i class="fas fa-check"></i></span>'
    : '';
  const tickedClass = ticked ? ` fabricate-select-popover-ticked` : '';
  return `
    <div
      class="fabricate-picker-popover manager-travel-popover fabricate-select-popover fabricate-select-popover-${rung}${tickedClass}"
      data-probe="${area}-panel-${rung}"
      role="dialog"
    >
      <div class="manager-travel-popover-options fabricate-select-options" role="listbox">
        <div class="manager-travel-popover-group" role="group" data-popover-group="instructions">
          <p class="manager-travel-popover-group-label" data-probe="${area}-heading-${rung}">Instructions</p>
          <button
            type="button"
            class="manager-travel-option fabricate-select-option"
            role="option"
            aria-selected="true"
            data-probe="${area}-row-${rung}"
          >${tick}<span class="fabricate-select-label">Leave unchanged</span></button>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONVERTED PAGER'S SEVEN SITES, MEASURED RATHER THAN REASONED ABOUT (issue 1504)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Issue 1504 replaces the pager's native `<select>` with a shared `<Select size="inline">`, and
// the six per-site fills that used to paint that select are RETARGETED onto its trigger rather
// than deleted — five player pagers on `--fab-surface` and the journal on the same token as a
// stated decision. Each of those blocks lives in its caller's own scoped `<style>`, so each wins
// on TWO axes: unlayered against this sheet's `layer(modules)`, and three compiled compounds
// against the family's (0,2,0) rung rules.
//
// A CLAIM ON TWO AXES IS EXACTLY THE CLAIM NOT TO REASON ABOUT. So every fill is measured here,
// in the real cascade, with each caller's real compiled CSS appended after the sheet in the order
// `css: 'injected'` uses — and the manager's own 64px floor is measured beside them, because it
// is the one declaration the pager still makes about this control and it must reach the manager
// and NOTHING else.
export const CONVERTED_PAGER_SITES = Object.freeze([
  Object.freeze({
    probe: 'inventory',
    padding: '12px',
    area: 'fabricate-app',
    wrapper: 'inventory-grid-pagination',
    component: 'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    fill: 'surface',
    floored: false,
    declaredArrow: 26,
  }),
  Object.freeze({
    probe: 'recipes',
    padding: '8px',
    area: 'fabricate-app',
    wrapper: 'crafting-browser-pagination',
    component: 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
    fill: 'surface',
    floored: false,
    declaredArrow: 26,
  }),
  Object.freeze({
    probe: 'environments',
    padding: '12px',
    area: 'fabricate-app',
    wrapper: 'gathering-env-pagination',
    component: 'src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte',
    fill: 'surface',
    floored: false,
    declaredArrow: 26,
  }),
  Object.freeze({
    probe: 'tasks',
    padding: '12px',
    area: 'fabricate-app',
    wrapper: 'gathering-detail-pagination',
    component: 'src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte',
    fill: 'surface',
    floored: false,
    declaredArrow: 26,
  }),
  Object.freeze({
    probe: 'events',
    padding: '12px',
    area: 'fabricate-app',
    wrapper: 'gathering-detail-pagination',
    component: 'src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte',
    fill: 'surface',
    floored: false,
    declaredArrow: 26,
  }),
  Object.freeze({
    probe: 'journal',
    padding: '12px',
    area: 'fabricate-app',
    wrapper: 'journal-list-section',
    component: 'src/ui/svelte/apps/journal/HistoryList.svelte',
    // The recomposed Journal footer uses the Pagination rung's own fill.
    fill: 'bg-2',
    floored: true,
    declaredArrow: 28,
  }),
  // The manager pager states no fill of its own, so it takes the `inline` rung's `--fab-bg-2` —
  // which is the visible move the frames carry — and it is the ONLY site with a width floor.
  Object.freeze({
    probe: 'manager',
    padding: '12px',
    area: 'fabricate-manager',
    wrapper: 'manager-main',
    component: '',
    fill: 'bg-2',
    floored: true,
    declaredArrow: 28,
  }),
]);
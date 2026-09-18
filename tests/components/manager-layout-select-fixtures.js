/** Fixtures and rendered-geometry readers for `manager-layout-select.js` (issue 1670). */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A caller here names the RULE it wants to read.
/** The class list a fixture host must carry to impersonate `SvelteFabricateApp`'s window FRAME. */
export const PLAYER_FRAME_CLASSES = 'fabricate fabricate-app fabricate-app-window';

// ── One toolbar control, three browsers.
export const SORT_DIRECTION_PROBES = Object.freeze([
  Object.freeze({ probe: 'recipe', attributes: 'class="manager-recipe-sort-direction"' }),
  Object.freeze({ probe: 'component', attributes: 'class="manager-component-sort-direction"' }),
  Object.freeze({ probe: 'essence', attributes: 'data-essence-sort-direction="asc"' }),
]);

// ── THE COMPOSED PICKER CASCADE.

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

/** The four RETAINED declarations whose token is TRANSLUCENT. */
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

// ── THE SOURCE PICKER'S TRIGGER.
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
  // The EDITOR route, which keeps all three tracks.
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
  // THE PICKER'S OWN RULE, outside any drop zone.
  `<div style="width:1280px;height:200px">
     <div class="fabricate-manager" data-manager-view="essences">
       ${SOURCE_TRIGGER_MARKUP('own-rule-trigger')}
     </div>
   </div>`,
  // THE PANEL ITSELF, at the inline 380px ceiling `computeIconPickerPopoverLayout` writes.
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

// THE SHARED SELECT'S PAINT, IN A REAL BROWSER (issue 1504)
//      `<Select>` renders inside `SearchablePopover`'s own root and panel, so
//      `.fabricate-picker-popover.manager-travel-popover` — (0,2,0) ON ONE ELEMENT — reaches its
//      panel and declares `min-width: 240px`, `max-width: 340px` and `border-radius: 10px`. The
//      `.fabricate-select*` family lives in THIS SHEET, in the same `layer(modules)` (issue
//      1504), so there is no layer axis to win on: the panel variant is written in the same
//      two-compound shape and wins on SOURCE ORDER, exactly as the shipped
//      `.manager-recipe-or-popover` variant does for the same two declarations. These are the
//      declarations that prove it landed: an inline panel opening at 240px over a list of
//      two-digit numbers is the defect.
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
    // 0.72rem against a 16px ROOT. `rem` is root-relative.
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

/** One open panel's markup, at one rung, with or without its tick column. */
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

// THE CONVERTED PAGER'S SEVEN SITES.
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
  // The manager pager states no fill of its own.
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
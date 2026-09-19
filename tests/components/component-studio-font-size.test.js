/* Component Studio font-size gate (issue 676). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// One representative element per role.
const FIXTURE = `
  <div class="application theme-dark">
    <section class="window-content">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="components">
        <section class="fabricate-filter-bar manager-toolbar manager-component-toolbar">
          <div class="manager-component-filter-row">
            <label class="fabricate-search manager-search">
              <input type="search" data-m="search" value="iron">
            </label>
            <select class="manager-component-essence-filter" data-m="essence-select"><option>All essences</option></select>
          </div>
          <div class="manager-component-filter-row is-secondary">
            <select class="manager-component-category-filter" data-m="filter-select"><option>All categories (4)</option></select>
            <span class="manager-component-filter-divider"></span>
            <div class="manager-component-filter-field">
              <span class="manager-component-filter-label" data-m="filter-label">Group by category</span>
              <button class="fabricate-toggle manager-status-toggle is-on" data-component-group-by-category>
                <span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>
              </button>
            </div>
            <span class="manager-component-filter-divider"></span>
            <div class="manager-component-filter-field">
              <span class="manager-component-filter-label">Sort by</span>
              <select data-m="sort-select"><option>Name</option></select>
              <!-- Carries fab-manager-button because the shipped control does (issue 1118):
                   ComponentsBrowserView renders this toggle through ManagerButton, and the
                   .manager-button.manager-component-sort-direction rule was chained onto the
                   primitive class so its 9px radius and compact scale stop depending on source
                   order. Note this fixture still measured 11.52px WITHOUT the marker, because
                   the components view has a toolbar rule of its own that supplies it — so it
                   would have gone on passing while measuring a rule it does not name. -->
              <button class="fabricate-button manager-button fab-manager-button manager-component-sort-direction" data-m="toolbar-button"><span>Asc</span></button>
            </div>
          </div>
          <div class="manager-component-filter-row is-chips">
            <span class="manager-chip is-info manager-component-filter-chip" data-m="filter-chip"><span>Category: Reagent</span></span>
            <span class="manager-component-count" data-m="count">1–2 of 2</span>
          </div>
          <!-- The multi-select row (issue 772) — the toolbar's FOURTH row, above the list.
               Its markup moved to the shared BulkSelectionToolbar.svelte under apps/manager/
               (issue 1010) and its own classes were renamed with it; the host row class
               ".manager-component-filter-row is-selection" is a PROP of that primitive,
               defaulted to this studio's string, so the row context below is unchanged.

               The input/box pair below is a HAND-COPY of what SelectionCheckbox.svelte renders
               inside BulkSelectionToolbar.svelte, and it silently duplicates a structural
               contract: that component's focus ring is drawn by the adjacent-sibling selector
               ".fab-selection-input:focus-visible + .fab-selection-check", written inside
               :global() because it reaches across a component boundary — so nothing analyses
               it (issue 924). This fixture is a font-size probe and does not check the ring;
               the ring's structure and the drift of those class tokens are asserted in
               tests/components/bulk-selection-toolbar-mounted.test.js. If either class name
               changes in SelectionCheckbox.svelte, update this fixture too, so the two stop
               disagreeing about what the studio renders.
               (No backticks in here — this whole block is a JS template literal.) -->
          <div class="manager-component-filter-row is-selection" data-component-selection-toolbar>
            <label class="fab-bulk-selection-all" data-m="bulk-select-all">
              <input type="checkbox" class="fab-selection-input">
              <span class="fab-selection-check is-md"><i class="fas fa-minus"></i></span>
              <span class="fab-bulk-selection-all-label">Select all</span>
            </label>
            <span class="fab-bulk-selection-divider"></span>
            <span class="fab-bulk-selection-count" data-m="bulk-selected-count"><i class="fas fa-layer-group"></i><span>2 selected</span></span>
            <button type="button" class="fab-bulk-selection-link" data-m="bulk-results-link">Select all 4 results</button>
            <button type="button" class="fab-bulk-selection-clear" data-m="bulk-clear"><i class="fas fa-xmark"></i><span>Clear</span></button>
          </div>
        </section>
        <div class="manager-components-list">
          <ul class="manager-component-group-body">
            <li class="manager-component-row">
              <button class="manager-component-identity">
                <span class="manager-system-copy">
                  <span class="manager-system-name" data-m="row-name">Iron Ore</span>
                  <span class="manager-system-description" data-m="row-description">Unrefined metal.</span>
                </span>
              </button>
              <span class="manager-component-row-meta">
                <span class="manager-chip manager-component-category-badge" data-m="row-badge">Reagent</span>
                <span class="manager-chip is-info manager-component-difficulty-badge" data-m="row-difficulty" title="Progressive difficulty"><span>2</span></span>
              </span>
            </li>
          </ul>
        </div>
        <section class="manager-component-browser-inspector">
          <p class="manager-component-browser-inspector-label" data-m="inspector-label">Selected component</p>
          <p class="manager-component-browser-inspector-flavour" data-m="inspector-flavour">Unrefined metal, dug from a hillside.</p>
          <div class="manager-component-stat-grid">
            <div class="manager-component-stat">
              <strong class="manager-component-stat-value" data-m="stat-value">2</strong>
              <span class="manager-component-stat-label" data-m="stat-label">Tags</span>
            </div>
          </div>
          <!-- Tags in effect, as ComponentBrowserInspector renders it: the shared Chip at
               density="inspector" inside manager-chip-row. It was a hand-copy of
               .manager-availability-pill.is-tag until issue 1515, which is a class the inspector
               stopped emitting and whose rule that change swept - the mirror rot this file's
               header records, caught by the area-scope gate rather than by this one.
               (No backticks in here - this whole block is a JS template literal.) -->
          <div class="manager-chip-row" data-component-tag-list>
            <span class="manager-chip is-tag is-inspector" data-m="tag-pill">metal</span>
          </div>
        </section>

        <!--
          The BULK EDIT panel (issue 772). It REPLACES the inspector above in the same rail
          while the selection is non-empty, so both surfaces are pinned here: the swap must
          not re-type the rail. Its appearance is a scoped block, which is why the panel is
          in the scoped-component pairing below - without that treatment every role in
          here would match nothing and land on Foundry's 14px app base.

          Its CHROME moved to BulkEditPanelShell / BulkEditSection / BulkEditSelect under
          apps/manager/ (issue 1010) and its classes were renamed with it; only the essence
          grid and the DC row are still the component panel's own. Every EXPECTED px value
          below is unchanged, which is the point: the extraction is a pure move.
        -->
        <section class="fab-bulk-edit-panel" data-component-bulk-panel>
          <header class="fab-bulk-edit-header">
            <p class="fab-bulk-edit-eyebrow" data-m="bulk-eyebrow">Bulk edit</p>
            <button type="button" class="fab-bulk-edit-clear" data-m="bulk-clear-selection"><i class="fas fa-xmark"></i><span>Clear selection</span></button>
          </header>
          <div class="fab-bulk-edit-hero">
            <span class="fab-bulk-edit-hero-icon"><i class="fas fa-layer-group"></i></span>
            <div class="fab-bulk-edit-hero-copy">
              <strong class="fab-bulk-edit-hero-title" data-m="bulk-hero-title">2 components selected</strong>
              <span class="fab-bulk-edit-hero-hint" data-m="bulk-hero-hint">Stage changes below, then apply to all at once.</span>
            </div>
          </div>
          <p class="fab-bulk-edit-label" data-m="bulk-label">Category</p>
          <!--
            THE BULK EDIT AXIS, no longer a native select (issue 1504). What is written here is
            the converted control's own markup: Select's picker ROOT with the trigger nested
            inside it, because the root is where .fabricate-select lands and the three rungs are
            declared as .fabricate-select .fabricate-select-trigger-RUNG. A trigger-only fixture
            would match none of them and would measure the 14px Foundry app base instead — and
            searchable-popover-area-scope.test.js's mirrored pairs are what hold this shape,
            since they pair the family's root and panel anchors with the INHERITED
            fabricate-picker / manager-travel-picker classes that must ride beside them.

            The pinned number below moved with the markup, from the manager control-text scale
            to the shared form rung's own 12.5px. (No backticks in here: this fixture is a
            JavaScript template literal.)
          -->
          <div class="fabricate-picker manager-travel-picker fabricate-select fab-bulk-edit-select">
            <button
              type="button"
              class="fabricate-select-trigger fabricate-select-trigger-form"
              data-m="bulk-select"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label="Category"
            ><span class="manager-travel-picker-value fabricate-select-value">Leave unchanged</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
          </div>
          <div class="fab-bulk-edit-label-row">
            <p class="fab-bulk-edit-label">Tags</p>
            <span class="fab-bulk-edit-hint" data-m="bulk-hint">click to add · again to remove · again to leave unchanged</span>
          </div>
          <div class="manager-chip-row">
            <button type="button" class="manager-chip is-positive" data-m="bulk-tag-chip"><i class="fas fa-tag"></i>metal<i class="fas fa-plus"></i></button>
          </div>
          <!-- The panel's SECOND hint scale: a standing sentence, not the inline aside
               above. Both are pinned, because the whole point of splitting them is that
               they are different sizes — one map entry could not state that. -->
          <p class="fab-bulk-edit-subhint" data-m="bulk-subhint">Applying essences overwrites the essence values on every selected component.</p>
          <div class="manager-component-bulk-essence-grid">
            <article class="manager-component-essence-card is-inactive" data-component-edit-essence="fire">
              <div class="manager-component-essence-identity">
                <span class="manager-component-essence-icon"><i class="fas fa-fire"></i></span>
                <strong class="manager-component-essence-name" data-m="bulk-essence-name">Fire</strong>
              </div>
              <div class="manager-component-essence-control">
                <div class="fab-stepper">
                  <button type="button" class="fab-stepper-adjunct" data-stepper-decrement><i class="fas fa-minus"></i></button>
                  <input type="number" class="fab-stepper-input" data-m="bulk-stepper-input" value="0">
                  <button type="button" class="fab-stepper-adjunct" data-stepper-increment><i class="fas fa-plus"></i></button>
                </div>
              </div>
            </article>
          </div>
          <div class="manager-component-bulk-dc-row">
            <i class="fas fa-dice-d20"></i>
            <span class="manager-component-bulk-dc-copy" data-m="bulk-dc-copy">Set every selected component to</span>
          </div>
          <!-- Apply is wrapped in its sticky dock (issue 1015). The wrapper is part of the
               shipped markup, so it is mirrored here: a fixture that kept Apply as a direct
               child of the panel would go on measuring a box the product no longer renders. -->
          <div class="fab-bulk-edit-dock">
            <!-- Carrying fab-manager-button since issue 1118 converted BulkEditPanelShell.
                 The marking and the re-chain landed in ONE commit, and had to: while
                 .fab-bulk-edit-apply was a SCOPED rule at (0,2,0), the primitive's (0,3,0)
                 control would have taken its 38px/0.78rem down to 34px/0.72rem and broken the
                 bottom-slot equality below against a shipped control that has not moved.
                 That rule now names .manager-button.fab-manager-button and compiles to
                 (0,4,0), so the box this fixture measures is the same box it always was. -->
            <button type="button" class="fabricate-button manager-button fab-manager-button fab-bulk-edit-apply" data-m="bulk-apply"><i class="fas fa-check-double"></i><span>Apply to 2 components</span></button>
          </div>
          <!--
            THE OTHER HALF OF THE SWAP, rendered as a SIBLING of the dock rather than inside
            it. The two buttons never coexist in the product — this one is the browser
            inspector's primary action and Apply replaces it the moment a box is ticked —
            but the swap only reads as one slot if they share a geometry, so both must be
            measurable in the same cascade context to compare them at all. Inside the dock
            it would inherit the dock's box and the comparison would be circular.

            The pair is asserted as a RELATIONSHIP below, not as two constants, because the
            two sides get their geometry from DIFFERENT mechanisms: this one from the global
            rule at styles/fabricate.css (.manager-button.manager-recipe-browser-inspector-edit,
            .manager-button.manager-component-browser-inspector-edit) and Apply from
            BulkEditPanelShell.svelte's scoped block. A source-substring pin on either file
            cannot see a cascade change that moves one RENDERED value while both sources sit
            unchanged, which is the drift that desynchronises the slot.
          -->
          <!-- Carries fab-manager-button because the shipped control does (issue 1118). The
               inspector's stacked action column was chained onto the primitive class: at
               (0,3,0) it only TIED the primitive's own control and held its 38px and 0.78rem
               by source order alone. Unmarked, this fixture matched no rule at all and fell to
               Foundry's 14px app base — which is how it failed, loudly, rather than drifting. -->
          <button type="button" class="fabricate-button manager-button fab-manager-button manager-component-browser-inspector-edit" data-m="inspector-edit"><span>Edit component</span></button>
        </section>
      </div>

      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="component-edit">
        <form class="manager-component-edit-view">
          <!-- THE STRIP AS ComponentIdentityStrip.svelte NOW RENDERS IT (issue 1371). The chip,
               the lock badge, the description paragraph and the 186px drop target are gone from
               the product, and their rules with them; a fixture that kept drawing them would pin
               CSS that paints nothing, which is the exact rot this gate exists to catch.
               No backticks in here: this markup is a template literal. -->
          <section class="manager-component-panel manager-component-identity-strip">
            <div class="manager-component-identity-copy">
              <div class="manager-component-identity-name-row">
                <button type="button" class="manager-component-identity-name" data-m="identity-name">Iron Ore</button>
              </div>
              <p class="manager-component-identity-note" data-m="identity-note"><span>Name, image &amp; description follow the linked item.</span></p>
            </div>
          </section>
          <section class="manager-component-panel manager-component-inline-panel">
            <div class="manager-task-card-heading">
              <div>
                <h3 data-m="panel-title">Category</h3>
                <p class="manager-muted" data-m="panel-sub">Groups this component in the browser.</p>
              </div>
              <!-- The shared Select since issue 1510, drawn as the bulk axis above is: the picker
                   root carries the caller's class and the trigger carries the rung, so the rule
                   this role measures has to reach a button rather than a select. (No backticks in
                   here: this markup is a template literal.) -->
              <div class="fabricate-picker manager-travel-picker fabricate-select manager-component-category-select">
                <button
                  type="button"
                  class="fabricate-select-trigger fabricate-select-trigger-form"
                  data-m="field-select"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  aria-label="Component category"
                ><span class="manager-travel-picker-value fabricate-select-value">General</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
              </div>
            </div>
          </section>
          <section class="manager-component-panel" data-salvage-section>
            <div class="manager-task-card-heading">
              <div><h3>Salvage</h3></div>
              <div class="manager-component-heading-controls manager-task-card-heading-control">
                <span class="manager-chip is-info manager-salvage-mode-pill" data-m="salvage-mode-pill"><span>Progressive · ordered</span></span>
                <span class="manager-component-heading-divider"></span>
                <span class="manager-component-micro-label" data-m="micro-label">Enabled</span>
              </div>
            </div>
            <div class="fabricate-field manager-field">
              <span class="manager-component-readonly-label" data-m="readonly-label"><span>Results</span></span>
              <ul class="manager-salvage-stage-list">
                <li class="manager-salvage-stage-row">
                  <span class="manager-salvage-result-ordinal" data-m="stage-ordinal">1</span>
                  <span class="manager-salvage-component-field">
                    <span class="fabricate-picker manager-travel-picker manager-salvage-component-picker">
                      <button type="button" class="fabricate-button manager-button manager-salvage-component-trigger" data-m="stage-picker">
                        <span class="manager-travel-portrait"><img src="" alt=""></span>
                        <span class="manager-travel-picker-value manager-salvage-component-name" data-m="stage-picker-name">Brass Casing</span>
                        <i class="fas fa-chevron-down"></i>
                      </button>
                    </span>
                  </span>
                  <span class="manager-salvage-result-difficulty" data-m="stage-dc">DC 8</span>
                  <button class="manager-salvage-stage-edit" data-m="stage-edit"><span>Edit</span></button>
                  <span class="manager-salvage-stage-reorder">
                    <button class="manager-salvage-stage-move" data-m="stage-move"><i class="fas fa-chevron-up"></i></button>
                  </span>
                </li>
              </ul>
            </div>
            <div class="manager-component-tag-run">
              <!-- The label alone: the own-tag run dropped its leading tag glyph and its
                   trailing state circle at issue 1371 r11 (UX F-F), because proto:1337 draws the
                   label and carries the selection in the chip's fill. This fixture is a COPY of
                   the component's markup, so it keeps passing whatever the component emits; it
                   is re-cut here so the copy does not go on describing a chip nobody renders. -->
              <button type="button" class="manager-chip is-tag" data-m="tag-toggle">Brass</button>
            </div>
          </section>
          <input type="text" data-m="bleed-baseline" value="bare">
        </form>
      </div>
    </section>
  </div>`;

// See the twin note in `recipe-studio-font-size.test.js`.
const SCOPED_COMPONENTS = [
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  // `BulkEditSelect.svelte` is NOT here any more (issue 1504).
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte',
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

// The contract classes are DERIVED from each component's own emitted CSS rather than
// hand-listed beside it. A hand-list is one more mirror in a file whose header already
// records what mirror rot cost here once: renaming a scoped class would leave its role
// unstamped, and the failure would read as a size change rather than a stale fixture.
function stampScopedClasses(fixture, { css, hashClass }) {
  const classes = new Set(
    [...css.matchAll(new RegExp(`\\.([\\w-]+)\\.${hashClass}\\b`, 'g'))].map((match) => match[1])
  );
  return [...classes].reduce(
    (markup, className) => withScopeHash(markup, className, hashClass),
    fixture
  );
}

const SCOPED_FIXTURE = SCOPED_COMPONENTS.reduce(stampScopedClasses, FIXTURE);
const SCOPED_CSS = SCOPED_COMPONENTS.map((component) => component.css).join('\n');

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style><style>${SCOPED_CSS}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">${SCOPED_FIXTURE}</body></html>`;
}

// px at the 16px root: rem * 16. Each entry names the Phase 0 prototype target it
// corresponds to, so drift from the design is visible rather than merely tolerated.
const EXPECTED = {
  // ── The toolbar. It is the Recipe Studio's bar now (issue 676, ruling 1), so every
  // control reads at the shared --fab-recipe-control-font and the micro-label at the
  // recipe micro-label size. Both numbers MOVED in that change, and both moved TOWARD
  // the prototype — the map below is re-measured against the real markup, not carried
  // over. The old map pinned the drift and its own comments admitted it
  // ("filter-label: 12.48, // prototype toolbar micro-label 8.5px").
  search: 11.52, // 0.72rem — prototype search input 12.5px sans
  // `proto:1062` — the toolbar micro-label at 8.5px, which is now the SHIPPED value rather than
  // the target this pin's own comment used to name (issue 1371 r11, UX finding F-K). The 0.08em
  // tracking is unchanged and resolves against this size, so the reference's 0.68px comes with
  // it. Route-scoped in the sheet, so the Recipe Studio's and the Essence library's labels are
  // untouched at 8.8 — which is why this fixture's root carries `data-manager-view="components"`.
  'filter-label': 8.5, // proto:1062 toolbar micro-label 8.5px @ .08em (was 8.8, and 12.48 before)
  // 0.72rem. These were 14 — Foundry's app base bleeding through — because the Component
  // Studio's own bleed patch covers `.manager-search input` and `.manager-toolbar
  // .manager-button` but NOT `select`, and the browser's selects had no font-size rule
  // at all. Joining `.manager-component-toolbar select` to the recipe rule closed it.
  // The two FILTER selects moved to the reference's own 12px at issue 1371 r11 (F-K); the SORT
  // select did not, because the reference draws that one at 11.5px (`proto:1066`) against the
  // shipped 11.52px and a fiftieth of a pixel is rounding rather than drift. Three selects in one
  // bar with two pinned sizes is the reference's own arrangement, not an oversight.
  'filter-select': 12, // proto:1054 — the category filter (was 11.52)
  'sort-select': 11.52, // proto:1066 draws 11.5; the residual is 0.02px
  'essence-select': 12, // proto:1056 — the essence filter (was 11.52)
  'toolbar-button': 11, // proto:1067 — the sort-direction toggle at `600 11px` (was 11.52)
  // Every chip role below MOVED from 12 (0.75rem) to 9.92 (0.62rem) in issue 883. That is
  // the deliberate change, not drift: the compact Tool Studio scale is now the only chip
  // scale, so these five roles are re-pinned to it rather than being relaxed or dropped.
  // They also read much closer to the prototype numbers their old comments quoted (9px,
  // 9.5px) than the 12px they were pinned at.
  'filter-chip': 9.92, // 0.62rem — the one chip scale (was 12)
  count: 10.88, // 0.68rem — quiet right-aligned metadata, not a control
  // ── The list.
  // `proto:1087` (`font:600 13.5px var(--serif)`) — the C5 rebuild writes the row name in the
  // reference's own 13.5px/600 serif. Authored as a px literal because a font size is a
  // literal, not a scale member; this pin previously carried the drift its own comment named.
  // (The cite read `proto:1084`, which is the row's bulk-select checkbox, until issue 1371
  // revision 8; a cite nobody can check is a pin taken on trust.)
  'row-name': 13.5,
  // `proto:1088` (`font:400 11px var(--sans)`).
  'row-description': 11,
  'row-badge': 9.92, // 0.62rem — prototype row badge/chip 9px sans (was 12)
  'row-difficulty': 9.92, // same chip family
  // ── The browser inspector (issue 676). It shares the recipe inspector's rules.
  'inspector-label': 9.28, // 0.58rem — a section micro-label on the panel background
  'inspector-flavour': 11.52, // 0.72rem — the description, whole
  'stat-value': 14.72, // 0.92rem serif, tabular figures
  'stat-label': 9.92, // 0.62rem
  // 10px, and a REAL change (issue 1515). The role used to measure a hand-copy of
  // `.manager-availability-pill.is-tag` at 0.76rem; the inspector renders the shared `Chip` at
  // `density="inspector"`, whose own scoped rule states 10px, and the fixture now names what
  // the product draws. `proto:5663` draws this pill at `font: 600 10px`, so the role moves ONTO
  // the reference rather than away from it.
  'tag-pill': 10,
  // ── The editor column.
  'panel-title': 16, // 1rem — prototype panel h3 14px serif
  'panel-sub': 12.48, // 0.78rem — prototype panel sub 10px sans
  'readonly-label': 13.12, // 0.82rem — a section micro-label inside a panel
  // 12.5px, the shared `<Select>`'s `form` rung, and a REAL change (issue 1510). It was 12 — the
  // literal `.manager-component-category-select` stated for the native control it painted, which
  // has no carrier now that the card's one control is the shared picker. The role still follows
  // the control rather than the markup: the fixture draws the trigger the product draws, and the
  // rung states the size itself, so the anti-bleed loop below still proves it is stated rather
  // than inherited. (px, not rem: a font size is a literal — `design-system/spec.md:218-222`.)
  'field-select': 12.5,
  // ── The identity STRIP (issue 676, rebuilt at 1371). It is display, not a form.
  'identity-name': 15.04,
  // 0.72rem. `proto:1314` is `font:400 11.5px/1.55 var(--sans)`.
  'identity-note': 11.52,
  // ── The salvage panel.
  'salvage-mode-pill': 9.92, // 0.62rem — prototype mode pill 9.5px sans (was 12)
  'micro-label': 8.48, // 0.53rem @ .08em — prototype "ENABLED" eyebrow 8.5px. Near-exact.
  'stage-ordinal': 10.88, // 0.68rem mono — prototype order badge 11px mono. Near-exact.
  // The yield picker replaced the stage row's native <select> (issue 676). It measures the
  // SAME 13.12 the select did — the `.manager-field`'s 0.82rem, inherited — so swapping a
  // native control for a popover trigger re-typed nothing. That is the point of checking:
  // a <button> is exactly the element Foundry's core `button` rule would otherwise size.
  'stage-picker': 13.12, // 0.82rem — inherits the field size, as the select did
  'stage-picker-name': 13.12, // the name inside the trigger reads at the trigger's size
  'stage-dc': 13, // 0.8125rem mono 700 — prototype read-only DC chip 13px mono. Exact.
  // It is the ONLY route to the DC rendered beside it, so it is sized as a real link
  // rather than the 0.56rem speck it shipped as — smaller than its own caption. Raised
  // again from 0.72rem: it now MATCHES `stage-dc`, so the read-only fact and the control
  // that changes it read as one pair rather than a number with a speck beside it.
  'stage-edit': 13, // 0.8125rem — deliberately identical to stage-dc
  'stage-move': 10.88, // 0.68rem — the reorder chevron glyph; reorder IS the authoring act
  // The editor's tag pill converged on the shared `Chip` (issue 772), so it MOVED from
  // 11.2 (its own 0.7rem, near-exact against the prototype's 11px pill) to the one chip
  // scale it now shares with every other chip on this screen. That is the declared cost of
  // the conversion, not drift: the alternative was a second pill implementation sitting
  // beside the bulk-edit panel's, which is what issue 772 exists to remove. The role is
  // re-authored above as a real `.manager-chip` and re-measured here.
  'tag-toggle': 9.92, // 0.62rem — the one chip scale (was 11.2)
  // ── The multi-select row (issue 772). One scale for the whole row: the box's caption,
  // the count readout and the two text actions are peers, and a row that sized them
  // differently would read as three registers stacked in one bar.
  'bulk-select-all': 10.88, // 0.68rem
  'bulk-selected-count': 10.88, // 0.68rem — accent, but the SAME size
  'bulk-results-link': 10.88,
  'bulk-clear': 10.88,
  // ── The BULK EDIT panel. It replaces the browser inspector in the same rail, so its
  // micro-label matches `inspector-label` exactly (0.58rem) and its hero sits just under
  // the inspector's `stat-value`: the swap must not re-type the rail.
  'bulk-eyebrow': 9.28, // 0.58rem — the rail micro-label scale, in accent
  'bulk-clear-selection': 9.92, // 0.62rem
  'bulk-hero-title': 14.72, // 0.92rem serif
  'bulk-hero-hint': 9.92, // 0.62rem
  'bulk-label': 9.28, // 0.58rem — identical to `inspector-label`
  // The INLINE hint only (the tri-state chip cycle, "click to add · again to remove ·
  // again to leave unchanged"), which sits on a label row's baseline and must not
  // out-weigh the label beside it.
  'bulk-hint': 9.28, // 0.58rem — sits WITH its label, not above the body scale
  // A STANDING SENTENCE addressed to the GM — the essence-overwrite warning, the DC's
  // meaning, the no-tags empty state. It is read rather than glanced at, and one of them
  // is the only prose explaining a destructive axis, so it is a step up from the inline
  // hint and matches the hero's own hint. It used to share `bulk-hint`, which made that
  // sentence the SMALLEST text in the panel.
  'bulk-subhint': 9.92, // 0.62rem — identical to `bulk-hero-hint`
  // 12.5px, the shared `<Select>` `form` rung, and a REAL change (issue 1504). It was 11.52 —
  // the manager control-text scale the retired native `<select>` took from its own scoped block.
  // The staged axis is a FORM control in a 300px rail of full-width fields, and the shared
  // primitive's form rung is 38px / radius 9 / 12.5px / weight 500. The literal is written here
  // because the rung is: the family may not read `--fab-recipe-control-font`, which is declared
  // only under `.fabricate-manager`.
  'bulk-select': 12.5,
  'bulk-tag-chip': 9.92, // 0.62rem — the one chip scale, as everywhere else
  // 0.72rem. `proto:1348` is `font:600 11.5px var(--sans);color:var(--text2)`: the tile's
  // subject is the numeral under it, so the name recedes a rung instead of competing.
  // Still the extracted card, and still shared with the editor grid.
  'bulk-essence-name': 11.52,
  'bulk-stepper-input': 11.84, // 0.74rem mono — the shared Stepper, shared with the editor
  'bulk-dc-copy': 9.92, // 0.62rem
  // 0.78rem, matching `.manager-component-browser-inspector-edit` — the button this one
  // SWAPS PLACES with in the rail's bottom slot. The swap must not re-type the slot.
  'bulk-apply': 12.48,
  // The cascade context. A bare control inherits Foundry's 14px app base.
  'bleed-baseline': 14,
};

test('component studio font-sizes are pinned under real Foundry core CSS', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p.setContent(page(), { waitUntil: 'load' });

    const rootPx = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize)
    );
    assert.equal(rootPx, 16, 'html root font-size is the 16px rem anchor');

    // `minHeight` rides along with `fontSize` because the rail's bottom slot is pinned as a
    // RELATIONSHIP below, and a font-size alone cannot state that two buttons share a box.
    const measured = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-m]').forEach((el) => {
        const style = getComputedStyle(el);
        out[el.getAttribute('data-m')] = {
          fontSize: parseFloat(style.fontSize),
          minHeight: style.minHeight,
        };
      });
      return out;
    });

    for (const [role, expected] of Object.entries(EXPECTED)) {
      assert.equal(
        measured[role]?.fontSize,
        expected,
        `${role} should compute to ${expected}px (measured ${measured[role]?.fontSize}px)`
      );
    }

    // Every studio role except the deliberate baseline must be free of the bleed.
    for (const [role, box] of Object.entries(measured)) {
      if (role === 'bleed-baseline') continue;
      assert.notEqual(
        box.fontSize,
        14,
        `${role} is at the Foundry 14px app base — its rule stopped applying`
      );
    }

    // ── THE RAIL'S BOTTOM SLOT (issue 1015) ──────────────────────────────────────────
    // Apply and the browser inspector's Edit SWAP PLACES in that slot, so the swap must
    // neither resize nor re-type it. Asserted as an equality between the two RENDERED
    // boxes rather than as two independent constants: the values come from different
    // mechanisms (a global rule in styles/fabricate.css vs BulkEditPanelShell.svelte's
    // scoped block), so only a comparison can catch a cascade change that moves one side.
    assert.equal(
      measured['bulk-apply'].minHeight,
      measured['inspector-edit'].minHeight,
      `the bulk Apply button and the browser inspector's Edit button share the rail's bottom slot and must have an equal min-height (Apply ${measured['bulk-apply'].minHeight}, Edit ${measured['inspector-edit'].minHeight})`
    );
    assert.equal(
      measured['bulk-apply'].fontSize,
      measured['inspector-edit'].fontSize,
      `the bulk Apply button and the browser inspector's Edit button share the rail's bottom slot and must have an equal font-size (Apply ${measured['bulk-apply'].fontSize}px, Edit ${measured['inspector-edit'].fontSize}px)`
    );
    // Anti-vacuity: an equality between two roles that both fell back to the same inherited
    // value would pass while proving nothing, so the shared box must be a real declared one.
    assert.notEqual(
      measured['bulk-apply'].minHeight,
      'auto',
      'the shared bottom-slot min-height must be a declared length, not the initial `auto`'
    );
  } finally {
    await browser.close();
  }
});

test('the category fixture spells `-form`, matching the product Select that declares no size', () => {
  const editViewSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte'),
    'utf8'
  );
  const tagStart = editViewSource.indexOf('class="manager-component-category-select"');
  assert.notEqual(tagStart, -1, 'the category `<Select>` call site moved or was renamed');
  const openStart = editViewSource.lastIndexOf('<Select', tagStart);
  const openEnd = editViewSource.indexOf('>', tagStart);
  const tag = editViewSource.slice(openStart, openEnd);
  assert.ok(
    !/\bsize=/.test(tag),
    'the category `<Select>` must declare no `size`, so it falls to the `form` rung the ' +
      '`field-select` fixture (12.5px, `-form`) actually measures'
  );
});

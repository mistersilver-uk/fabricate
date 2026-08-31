/*
 * Component Studio font-size gate (issue 676) — the sibling of
 * `recipe-studio-font-size.test.js`.
 *
 * happy-dom cannot compute the CSS cascade, so a mounted test can never prove the
 * RENDERED font-size. This gate renders the real Component Studio classes in Chromium
 * under a minimal-but-faithful stand-in for Foundry V13 core CSS (tests/fixtures/
 * foundry-core-min.css — the @layer reset + 14px app base) plus the real
 * styles/fabricate.css, and asserts the computed px per role.
 *
 * It also proves the cascade context: a bare <input> inherits the 14px Foundry app
 * base (the bleed baseline). A studio role landing on 14 is the signature of a rule
 * that stopped applying and let Foundry's default through.
 *
 * ── THE PHASE 0 RESOLVED SCALE ───────────────────────────────────────────────────
 * The brief's §2 type scale contains RANGES ("eyebrow labels 700 9–9.5px",
 * "filter/sort selects 500 11.5–12px", "micro-labels 700 7.5–8.5px") and then resolves
 * them with "read it off the prototype". A gate needs ONE number per role, and if the
 * implementer picks, the guess acquires the authority of a committed test forever.
 *
 * So the ranges were resolved ONCE, by extracting the prototype's own declarations
 * (`tmp/GM Component Studio.html`). Its resolved per-role scale is:
 *
 *   browser page title (h2)        600 22px   serif
 *   browser page subtitle          400 12.5px sans
 *   breadcrumb                     600 11px   sans
 *   rail eyebrow ("GM MANAGEMENT") 700 9px    sans, letter-spacing .14em
 *   toolbar micro-label            700 8.5px  sans, letter-spacing .08em
 *   filter / sort select           500 11.5px sans
 *   search input                   400 12.5px sans
 *   row name                       600 13.5px serif
 *   row description                400 11px   sans
 *   row badge / chip               600 9px    sans
 *   panel title (h3)               600 14px   serif
 *   panel sub (p)                  400 10px   sans
 *   editor title (h2)              600 20px   serif
 *   primary button                 700 12.5px sans
 *
 * That is the DESIGN INTENT. What this gate pins is what Fabricate RENDERS, because
 * the studio is built from Fabricate's existing shared manager classes (`.manager-title`,
 * `.manager-chip`, `.manager-system-name`, …) whose rem-based sizes are already
 * established and shared with six other editors. Decision 1 accepts small drift from
 * the prototype for exactly this reason: re-authoring those shared sizes to hit the
 * prototype's px exactly would silently re-type every other manager surface.
 *
 * The EXPECTED map below is therefore measured from the real cascade and cross-checked
 * against the scale above; each entry notes the prototype target it corresponds to.
 * Change a size on purpose -> update this map on purpose.
 *
 * ── THE FIXTURE IS A MIRROR, AND MIRRORS ROT ─────────────────────────────────────
 * The fixture below is hand-maintained markup standing in for the real components. That
 * makes this gate able to measure a cascade the DOM can't — and able to go on happily
 * measuring markup the product no longer renders. It did exactly that: it pinned a
 * `.manager-filter` span and a `.manager-button.manager-component-group-toggle` (a class
 * with no CSS anywhere), and its own comments recorded the resulting drift as if it were
 * a finding rather than a defect. Issue 676 rebuilt the browser on the Recipe Studio's
 * toolbar and this fixture was re-derived from the shipped markup and re-measured.
 *
 * So: when you change the Component Studio's markup, UPDATE THIS FIXTURE FIRST, then
 * re-measure. A green run against stale fixture markup proves nothing at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// One representative element per role, using the exact Component Studio classes,
// wrapped in the Foundry app shell so `.application`'s 14px base + the @layer reset
// apply. Both routes are represented: the browser list and the editor column.
const FIXTURE = `
  <div class="application theme-dark">
    <section class="window-content">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="components">
        <section class="manager-toolbar manager-component-toolbar">
          <div class="manager-component-filter-row">
            <label class="manager-search">
              <input type="search" data-m="search" value="iron">
            </label>
            <select class="manager-component-essence-filter" data-m="essence-select"><option>All essences</option></select>
          </div>
          <div class="manager-component-filter-row is-secondary">
            <select class="manager-component-category-filter" data-m="filter-select"><option>All categories (4)</option></select>
            <span class="manager-component-filter-divider"></span>
            <div class="manager-component-filter-field">
              <span class="manager-component-filter-label" data-m="filter-label">Group by category</span>
              <button class="manager-status-toggle is-on" data-component-group-by-category>
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
              <button class="manager-button fab-manager-button manager-component-sort-direction" data-m="toolbar-button"><span>Asc</span></button>
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
          <span class="manager-availability-pill is-tag" data-m="tag-pill"><span>metal</span></span>
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
          <select class="fab-bulk-edit-select" data-m="bulk-select"><option>Leave unchanged</option></select>
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
            <button type="button" class="manager-button fab-manager-button fab-bulk-edit-apply" data-m="bulk-apply"><i class="fas fa-check-double"></i><span>Apply to 2 components</span></button>
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
          <button type="button" class="manager-button fab-manager-button manager-component-browser-inspector-edit" data-m="inspector-edit"><span>Edit component</span></button>
        </section>
      </div>

      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="component-edit">
        <form class="manager-component-edit-view">
          <section class="manager-component-panel manager-component-identity-strip">
            <span class="manager-component-identity-chip"><i class="fas fa-box-open"></i></span>
            <div class="manager-component-identity-copy">
              <div class="manager-component-identity-name-row">
                <button type="button" class="manager-component-identity-name" data-m="identity-name">Iron Ore</button>
                <span class="manager-chip manager-component-identity-lock" data-m="identity-lock"><span>Linked Items Directory</span></span>
              </div>
              <p class="manager-component-identity-description" data-m="identity-description">Unrefined metal.</p>
              <p class="manager-component-identity-note" data-m="identity-note"><span>Name, image &amp; description follow the linked item.</span></p>
            </div>
            <div class="manager-component-source-drop-target" data-m="drop-target"><span>Drop a world or compendium item to replace</span></div>
          </section>
          <section class="manager-component-panel manager-component-inline-panel">
            <div class="manager-task-card-heading">
              <div>
                <h3 data-m="panel-title">Category</h3>
                <p class="manager-muted" data-m="panel-sub">Groups this component in the browser.</p>
              </div>
              <select class="manager-input manager-component-inline-control" data-m="field-select"><option>General</option></select>
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
            <p class="manager-component-info-banner" data-m="info-banner"><span>Roll budget flows down the list</span></p>
            <div class="manager-field">
              <span class="manager-component-readonly-label" data-m="readonly-label"><span>Results</span></span>
              <ul class="manager-salvage-stage-list">
                <li class="manager-salvage-stage-row">
                  <span class="manager-salvage-result-ordinal" data-m="stage-ordinal">1</span>
                  <span class="manager-salvage-component-field">
                    <span class="manager-travel-picker manager-salvage-component-picker">
                      <button type="button" class="manager-button manager-salvage-component-trigger" data-m="stage-picker">
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
              <button type="button" class="manager-chip is-tag" data-m="tag-toggle"><i class="fas fa-tag"></i>Brass<i class="fas fa-circle-check"></i></button>
            </div>
          </section>
          <input type="text" data-m="bleed-baseline" value="bare">
        </form>
      </div>
    </section>
  </div>`;

// See the twin note in `recipe-studio-font-size.test.js`: the chip's appearance moved into
// `Chip.svelte`'s scoped block (issue 883), so this gate reproduces Svelte's real delivery
// — the component's compiled CSS appended after the global sheet, and the real scoping hash
// on the fixture's elements — rather than dropping those roles and losing the coverage.
//
// Issue 772 added four more scoped components to this studio (the selection box, the
// selection toolbar, the extracted essence card and the bulk edit panel), and every one of
// them needs BOTH halves of the treatment: appending the CSS without the hash class makes
// the rules match nothing, and adding the hash without the real ordering proves the wrong
// winner. A role that gets neither silently measures Foundry's 14px app base and trips the
// anti-bleed loop at the end of this file.
//
// Issue 1010 split the toolbar and the panel's chrome into four shared primitives under
// `apps/manager/`, so the list below grew rather than moved: the panel still owns the
// essence grid and the DC row, while the header, hero, section scales, select and Apply are
// emitted by their own components and therefore carry their own scope hashes. Miss one and
// its roles fall to 14px — which is why no `EXPECTED` value needed touching to make this
// pass, and why a green run is evidence the extraction preserved the cascade.
const SCOPED_COMPONENTS = [
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
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
  'filter-label': 8.8, // 0.55rem — prototype toolbar micro-label 8.5px @ .08em (was 12.48)
  // 0.72rem. These were 14 — Foundry's app base bleeding through — because the Component
  // Studio's own bleed patch covers `.manager-search input` and `.manager-toolbar
  // .manager-button` but NOT `select`, and the browser's selects had no font-size rule
  // at all. Joining `.manager-component-toolbar select` to the recipe rule closed it.
  'filter-select': 11.52, // prototype filter/sort select 11.5px sans — near-exact
  'sort-select': 11.52,
  'essence-select': 11.52,
  'toolbar-button': 11.52, // 0.72rem — the sort-direction toggle at the compact scale
  // Every chip role below MOVED from 12 (0.75rem) to 9.92 (0.62rem) in issue 883. That is
  // the deliberate change, not drift: the compact Tool Studio scale is now the only chip
  // scale, so these five roles are re-pinned to it rather than being relaxed or dropped.
  // They also read much closer to the prototype numbers their old comments quoted (9px,
  // 9.5px) than the 12px they were pinned at.
  'filter-chip': 9.92, // 0.62rem — the one chip scale (was 12)
  count: 10.88, // 0.68rem — quiet right-aligned metadata, not a control
  // ── The list.
  'row-name': 12.16, // 0.76rem serif — bleed fix; prototype row name 13.5px serif
  'row-description': 12.48, // 0.78rem — prototype row description 11px sans
  'row-badge': 9.92, // 0.62rem — prototype row badge/chip 9px sans (was 12)
  'row-difficulty': 9.92, // same chip family
  // ── The browser inspector (issue 676). It shares the recipe inspector's rules.
  'inspector-label': 9.28, // 0.58rem — a section micro-label on the panel background
  'inspector-flavour': 11.52, // 0.72rem — the description, whole
  'stat-value': 14.72, // 0.92rem serif, tabular figures
  'stat-label': 9.92, // 0.62rem
  'tag-pill': 12.16, // 0.76rem — the shared availability pill, now purple via `is-tag`
  // ── The editor column.
  'panel-title': 16, // 1rem — prototype panel h3 14px serif
  'panel-sub': 12.48, // 0.78rem — prototype panel sub 10px sans
  'readonly-label': 13.12, // 0.82rem — a section micro-label inside a panel
  // 0.82rem. The Category select renders OUTSIDE a `.manager-field` (the heading row),
  // and `.manager-field`'s 0.82rem is INHERITED — no rule sizes a select directly. This
  // measured 14 (Foundry's app base) until `.manager-component-inline-control` stated
  // the size itself. That is precisely the bleed this gate exists to catch, caught here.
  'field-select': 13.12,
  // ── The identity STRIP (issue 676). It is display, not a form: the read-only boxed
  // Name/Description fields it replaced are gone, and with them `readonly-value`.
  'identity-name': 18, // 1.125rem serif — prototype identity name 18px/600. Exact.
  'identity-lock': 9.92, // 0.62rem — prototype lock badge 9px sans (was 12)
  'identity-description': 13, // 0.8125rem/1.65 — prototype description 13px/1.65. Exact.
  'identity-note': 10, // 0.625rem — prototype premise note 10px sans. Exact.
  'drop-target': 10, // 0.625rem — prototype drop-target label 10px/1.4 sans. Exact.
  // ── The salvage panel.
  'salvage-mode-pill': 9.92, // 0.62rem — prototype mode pill 9.5px sans (was 12)
  'micro-label': 8.48, // 0.53rem @ .08em — prototype "ENABLED" eyebrow 8.5px. Near-exact.
  'info-banner': 10.56, // 0.66rem — prototype roll-budget banner 10.5px sans
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
  'bulk-select': 11.52, // 0.72rem — the shared manager control-text scale
  'bulk-tag-chip': 9.92, // 0.62rem — the one chip scale, as everywhere else
  'bulk-essence-name': 12.16, // 0.76rem — the extracted card, shared with the editor grid
  'bulk-stepper-input': 11.84, // 0.74rem mono — the shared Stepper, shared with the editor
  'bulk-dc-copy': 9.92, // 0.62rem
  // 0.78rem, matching `.manager-component-browser-inspector-edit` — the button this one
  // SWAPS PLACES with in the rail's bottom slot. The swap must not re-type the slot.
  'bulk-apply': 12.48,
  // The cascade context. A bare control inherits Foundry's 14px app base; any role
  // above landing on 14 means its rule stopped applying and Foundry bled through.
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
    // Wrapping Apply in the sticky dock is exactly such a change, which is why it is
    // pinned here rather than assumed.
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

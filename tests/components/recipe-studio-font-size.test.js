/*
 * Recipe Studio font-size gate (issue 643).
 *
 * happy-dom cannot compute the CSS cascade, so a mounted test can never prove the
 * RENDERED font-size. This gate renders the real recipe-studio classes in Chromium
 * under a minimal-but-faithful stand-in for Foundry V13 core CSS (tests/fixtures/
 * foundry-core-min.css — the @layer reset + 14px app base) plus the real
 * styles/fabricate.css, and asserts the computed px against the prototype's scale.
 *
 * It also proves the cascade context: a bare <input> inherits the 14px Foundry app
 * base (bleed baseline), and `.manager-nav-label` must NOT be 14 — it once bled to
 * Foundry's default and is now pinned to the design.
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

// One representative element per role, using the exact recipe-studio classes, wrapped
// in the Foundry app shell so `.application`'s 14px base + the @layer reset apply.
const FIXTURE = `
  <div class="application theme-dark">
    <section class="window-content">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="recipe-edit">
        <div class="manager-recipe-edit-heading-copy">
          <h1 class="manager-title" data-m="title">Craft Acid-Bite Arrows</h1>
          <p class="manager-subtitle" data-m="subtitle">Ammunition · Routed by check · DC 10</p>
        </div>
        <div class="manager-header-actions">
          <button class="manager-button is-ghost" data-m="header-button"><span>Back</span></button>
        </div>
        <div class="manager-editor-tabs">
          <button class="manager-editor-tab-button is-active" data-m="tab-label"><span>Ingredients</span>
            <span class="manager-chip is-neutral manager-editor-tab-badge" data-m="tab-badge">4</span>
          </button>
        </div>
        <div class="manager-nav-button">
          <span class="manager-nav-label" data-m="nav-label">Recipes</span>
          <span class="manager-nav-count" data-m="nav-count">105</span>
        </div>
        <div class="manager-recipe-ingredient-set-add">
          <button class="manager-button is-dashed" data-m="dashed-add"><span>Add tag requirement</span></button>
        </div>
        <p class="manager-muted" data-m="muted">The components, tags and essences this recipe consumes.</p>
        <!-- The FLAT (non-progressive) ingredient/result row's component picker (issue
             676). It now carries the name INSIDE the trigger and joins the SAME shared
             rule as the salvage yield trigger and the progressive stage trigger, so it
             is pinned to their number — 0.82rem — not to whatever it used to inherit.
             It previously had no font-size of its own at all and bled to Foundry's 14px
             app base; the flat-picker vs bleed-baseline assertions below prove it no
             longer does. -->
        <div class="manager-recipe-ingredient-option-row">
          <span class="manager-recipe-option-lead is-component" data-m="option-lead"><i class="fas fa-cubes"></i></span>
          <div class="manager-recipe-option-target">
            <div class="manager-recipe-option-component">
              <span class="manager-travel-picker manager-recipe-component-picker">
                <button class="manager-button manager-recipe-component-trigger" data-m="flat-picker">
                  <img class="manager-travel-portrait" alt="">
                  <span class="manager-travel-picker-value manager-recipe-component-name" data-m="flat-picker-name">Venom Gland</span>
                </button>
              </span>
            </div>
          </div>
        </div>
        <!-- The progressive stage row (issue 676). It is the SAME surface as the
             progressive SALVAGE stage row and shares its rules by joining their selector
             lists, so these roles are pinned to the numbers component-studio-font-size.js
             already commits for the salvage row — the design source — NOT read off this
             markup. If the two ever disagree, the sharing has broken. -->
        <div class="manager-recipe-result-row is-reorderable">
          <span class="manager-recipe-stage-grip" data-m="stage-grip"><i class="fas fa-grip-vertical"></i></span>
          <span class="manager-recipe-stage-ordinal" data-m="stage-ordinal">1</span>
          <div class="manager-recipe-ingredient-option-row">
            <div class="manager-recipe-option-target">
              <div class="manager-recipe-option-component">
                <span class="manager-recipe-component-picker">
                  <button class="manager-button manager-recipe-component-trigger manager-recipe-stage-trigger" data-m="stage-picker">
                    <img class="manager-travel-portrait" alt="">
                    <span class="manager-recipe-stage-trigger-name" data-m="stage-picker-name">Mountain Herb</span>
                  </button>
                </span>
              </div>
            </div>
            <div class="manager-recipe-option-controls">
              <span class="manager-recipe-stage-dc" data-m="stage-dc">DC 12</span>
              <button class="manager-recipe-stage-edit" data-m="stage-edit"><span>Edit</span><i class="fas fa-arrow-up-right-from-square"></i></button>
              <span class="manager-recipe-stage-reorder">
                <button class="manager-recipe-stage-move" data-m="stage-move"><i class="fas fa-chevron-up"></i></button>
              </span>
            </div>
          </div>
        </div>
        <!-- The Validation tab's aggregate header (issue 676), rehomed from the deleted
             context rail. Pinned to the rail's OWN committed values — the design source —
             not read off the rehomed markup: a gate authored from the implementation
             enshrines the implementation. Only the rail's LAYOUT changed here (a 300px
             column became a ~1060px tab), never its type. -->
        <section class="manager-recipe-validation-summary-row">
          <div class="manager-recipe-rail-summary is-blocked">
            <span class="manager-recipe-rail-summary-medallion" data-m="summary-medallion"><i class="fas fa-circle-xmark"></i></span>
            <span class="manager-recipe-rail-summary-copy">
              <span class="manager-recipe-rail-summary-title" data-m="summary-title">Cannot be enabled</span>
              <span class="manager-recipe-rail-summary-sub manager-muted" data-m="summary-sub">Clear every blocking issue first.</span>
            </span>
          </div>
          <ul class="manager-recipe-rail-counts">
            <li class="manager-recipe-rail-count is-passing">
              <i class="fas fa-circle-check"></i>
              <span class="manager-recipe-rail-count-label" data-m="count-label">Passing</span>
              <span class="manager-recipe-rail-count-value" data-m="count-value">7</span>
            </li>
          </ul>
        </section>
        <input type="text" data-m="bleed-baseline" value="bare">
      </div>

      <!--
        The recipe BROWSER (issue 1010). Its multi-select toolbar row and its bulk edit
        panel render through the SAME shared primitives the Component Studio's gate already
        commits numbers for, so every value below is that gate's number rather than a fresh
        reading: the two studios share the rules, so they must share the sizes, and a
        divergence here means the sharing broke.

        Its own container, at the browser's view attribute rather than the editor's, so
        anything the recipes VIEW scopes applies as it does in the shipped tree.
      -->
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="recipes">
        <section class="manager-toolbar manager-recipe-toolbar">
          <!-- The multi-select row is the LAST row of this toolbar, immediately above the
               list. The host row class is a PROP of the shared toolbar primitive, so this
               studio names its own ("manager-recipe-filter-row") and its own data hook.
               The input/box pair is a HAND-COPY of what SelectionCheckbox.svelte renders;
               its structural contract (the adjacent-sibling focus ring written inside
               :global()) is asserted in tests/components/bulk-selection-toolbar-mounted.test.js,
               not here — this fixture is a font-size probe. -->
          <div class="manager-recipe-filter-row is-selection" data-recipe-selection-toolbar>
            <label class="fab-bulk-selection-all" data-m="bulk-select-all">
              <input type="checkbox" class="fab-selection-input">
              <span class="fab-selection-check is-md"><i class="fas fa-minus"></i></span>
              <span class="fab-bulk-selection-all-label">Select all</span>
            </label>
            <span class="fab-bulk-selection-divider"></span>
            <span class="fab-bulk-selection-count" data-m="bulk-selected-count"><i class="fas fa-layer-group"></i><span>3 selected</span></span>
            <button type="button" class="fab-bulk-selection-link" data-m="bulk-results-link">Select all 7 results</button>
            <button type="button" class="fab-bulk-selection-clear" data-m="bulk-clear"><i class="fas fa-xmark"></i><span>Clear</span></button>
          </div>
        </section>
        <!--
          The BULK EDIT panel. It REPLACES the recipe browser inspector in the same rail
          while the selection is non-empty, so the swap must not re-type the rail. Unlike
          its Component Studio sibling the recipe panel owns NO scoped CSS of its own — it
          is chrome primitives plus SegmentedControl, Chip and Callout end to end — which is
          why it is absent from the scoped-component pairing below and why nothing here
          would be stamped for it.
        -->
        <section class="fab-bulk-edit-panel" data-recipe-bulk-panel>
          <header class="fab-bulk-edit-header">
            <p class="fab-bulk-edit-eyebrow" data-m="bulk-eyebrow">Bulk edit</p>
            <button type="button" class="fab-bulk-edit-clear" data-m="bulk-clear-selection"><i class="fas fa-xmark"></i><span>Clear selection</span></button>
          </header>
          <div class="fab-bulk-edit-hero">
            <span class="fab-bulk-edit-hero-icon"><i class="fas fa-layer-group"></i></span>
            <div class="fab-bulk-edit-hero-copy">
              <strong class="fab-bulk-edit-hero-title" data-m="bulk-hero-title">3 recipes selected</strong>
              <span class="fab-bulk-edit-hero-hint" data-m="bulk-hero-hint">Stage changes below, then apply to all at once.</span>
            </div>
          </div>
          <p class="fab-bulk-edit-label" data-m="bulk-label">Category</p>
          <select class="fab-bulk-edit-select" data-m="bulk-select"><option>Leave unchanged</option></select>
          <p class="fab-bulk-edit-subhint" data-m="bulk-subhint">Enabling is gated by the activation check, so a refused recipe is left switched off.</p>
          <!-- Both segmented axes are full-width tracks under a full-width select. -->
          <div class="manager-segmented is-fill" role="radiogroup" aria-label="Status">
            <label class="manager-segment is-active">
              <input type="radio" class="manager-segment-input" checked>
              <span class="manager-segment-label" data-m="bulk-segment-label">Unchanged</span>
            </label>
          </div>
          <p class="manager-callout is-warning" data-callout-tone="warning"><i class="fas fa-triangle-exclamation"></i><span data-m="bulk-callout">At least 2 of 3 selected recipes can't be enabled yet and will stay off.</span></p>
          <div class="fab-bulk-edit-label-row">
            <p class="fab-bulk-edit-label">Recipe books</p>
            <span class="fab-bulk-edit-hint" data-m="bulk-hint">click to add · again to remove · again to leave unchanged</span>
          </div>
          <div class="manager-chip-row">
            <button type="button" class="manager-chip is-positive" data-m="bulk-book-chip"><i class="fas fa-book"></i>Alchemist Primer<i class="fas fa-plus"></i></button>
          </div>
          <button type="button" class="manager-button fab-bulk-edit-apply" data-m="bulk-apply"><i class="fas fa-check-double"></i><span>Apply to 3 recipes</span></button>
        </section>
      </div>
    </section>
  </div>`;

// The chip owns its appearance in `Chip.svelte`'s scoped block (issue 883), so the global
// sheet alone no longer styles it and every chip role here would fall to the 14px bleed
// baseline. The gate keeps the coverage by reproducing what Svelte actually ships: the
// component's real compiled CSS, appended AFTER the global sheet exactly as `css:
// 'injected'` injects it, with the real scoping hash stamped onto the fixture's chips so
// the SPECIFICITY matches too. Both halves matter — this is the only place in the repo
// where a global rule that ties with the scoped block, and silently loses on source order,
// can be caught.
//
// Issue 1010 made this a LIST rather than the single chip pairing it started as: the
// browser's multi-select toolbar and its bulk edit panel are built from shared primitives
// that each own their appearance in a scoped block, so every one of them needs BOTH halves
// of the treatment. Appending the CSS without the hash class makes the rules match nothing;
// adding the hash without the real ordering proves the wrong winner. A role that gets
// neither silently measures Foundry's 14px app base, which the anti-bleed loop then catches.
const SCOPED_COMPONENTS = [
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  // `recipes/RecipeBulkEditPanel.svelte` is deliberately ABSENT: it emits no scoped CSS at
  // all, because it renders entirely through the primitives above. `scopedComponentCss`
  // throws on a component with no emitted CSS, which is the correct outcome — there is
  // nothing of its own to pair.
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

// The contract classes are DERIVED from each component's own emitted CSS rather than
// hand-listed beside it: renaming a scoped class would otherwise leave its role unstamped,
// and the failure would read as a size change rather than as a stale fixture.
const SCOPED_FIXTURE = SCOPED_COMPONENTS.reduce((markup, { css, hashClass }) => {
  const contractClasses = new Set(
    [...css.matchAll(new RegExp(`\\.([\\w-]+)\\.${hashClass}\\b`, 'g'))].map(([, name]) => name)
  );
  let stamped = markup;
  for (const contractClass of contractClasses) {
    stamped = withScopeHash(stamped, contractClass, hashClass);
  }
  return stamped;
}, FIXTURE);
const SCOPED_CSS = SCOPED_COMPONENTS.map((component) => component.css).join('\n');

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style><style>${SCOPED_CSS}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">${SCOPED_FIXTURE}</body></html>`;
}

// px at the 16px root: rem * 16.
const EXPECTED = {
  title: 20, // 1.25rem  (recipe editor title)
  subtitle: 11.52, // 0.72rem
  'header-button': 11.52, // 0.72rem
  'tab-label': 12.48, // 0.78rem
  'tab-badge': 8.96, // 0.56rem
  'nav-label': 12.48, // 0.78rem — bleed fix (was inheriting 14)
  'nav-count': 10, // 0.625rem
  'dashed-add': 11.2, // 0.7rem
  muted: 10.24, // 0.64rem — recipe-view-scoped
  // ── The FLAT component picker (issue 676). Same shared rule as the stage/salvage
  // triggers below, so it reads at the same 0.82rem — a flat row and a stage row name a
  // component identically. If these ever diverge from `stage-picker`, the sharing broke.
  'option-lead': 13.12, // 0.82rem — the type-tinted lead chip's glyph
  'flat-picker': 13.12, // 0.82rem — shared .manager-recipe-component-trigger rule
  'flat-picker-name': 13.12, // the name inside the trigger reads at the trigger's size
  // ── The progressive stage row (issue 676). Every number below is the one the salvage
  // stage row already commits in component-studio-font-size.test.js: the two rows are
  // the same surface and SHARE their CSS rules, so a divergence here means the sharing
  // broke, not that this row wants its own scale.
  'stage-grip': 11.2, // 0.7rem — shared .manager-salvage-stage-grip rule
  'stage-ordinal': 10.88, // 0.68rem mono — shared with salvage's order badge
  'stage-picker': 13.12, // 0.82rem — the picker trigger, as salvage's measures
  'stage-picker-name': 13.12, // the name inside the trigger reads at the trigger's size
  'stage-dc': 13, // 0.8125rem mono 700 — shared read-only DC
  'stage-edit': 13, // 0.8125rem — deliberately identical to stage-dc, as on salvage
  'stage-move': 10.88, // 0.68rem — the reorder chevron glyph
  // ── The Validation tab's aggregate header (issue 676). Every value is the one the
  // deleted RecipeContextRail committed for the same roles; the rehome changed the
  // layout, not the type scale.
  'summary-medallion': 21.6, // 1.35rem — the 52px status medallion's glyph
  'summary-title': 16, // 1rem serif 600
  'summary-sub': 11.52, // 0.72rem
  'count-label': 12.48, // 0.78rem — the count row
  'count-value': 12.48, // 0.78rem mono 700 — inherits the count row's size
  // ── The browser's multi-select row (issue 1010). One scale for the whole row: the box's
  // caption, the count readout and the two text actions are peers, and a row that sized
  // them differently would read as three registers stacked in one bar. Every number here
  // is the one component-studio-font-size.test.js already commits for the SAME shared
  // primitive — the two studios render one toolbar, so a divergence means the sharing broke.
  'bulk-select-all': 10.88, // 0.68rem
  'bulk-selected-count': 10.88, // 0.68rem — accent, but the SAME size
  'bulk-results-link': 10.88,
  'bulk-clear': 10.88,
  // ── The BULK EDIT panel. Same rule: these are the shared chrome's committed numbers.
  // It replaces the recipe browser inspector in the same rail, so its micro-label matches
  // that inspector's section label exactly and its hero sits just under the inspector's
  // stat value — the swap must not re-type the rail.
  'bulk-eyebrow': 9.28, // 0.58rem — the rail micro-label scale, in accent
  'bulk-clear-selection': 9.92, // 0.62rem
  'bulk-hero-title': 14.72, // 0.92rem serif
  'bulk-hero-hint': 9.92, // 0.62rem
  'bulk-label': 9.28, // 0.58rem — the section micro-label
  'bulk-hint': 9.28, // 0.58rem — the INLINE aside, on its label's baseline
  'bulk-subhint': 9.92, // 0.62rem — a STANDING SENTENCE, a step up from the inline hint
  'bulk-select': 11.52, // 0.72rem — the shared manager control-text scale
  // ── The two roles the recipe panel adds to that chrome. Both are shipped primitives the
  // Component Studio's panel does not render, so neither has a committed number there.
  // The segment reads at the SAME control-text scale as the select it sits under, which is
  // the point of a full-width track: the axis reads as one control, not two registers.
  'bulk-segment-label': 11.52, // 0.72rem — inherits `.manager-segment`
  'bulk-callout': 11.2, // 0.7rem — the shared standing-statement strip
  'bulk-book-chip': 9.92, // 0.62rem — the one chip scale, as everywhere else
  // 0.78rem, matching the browser inspector's primary button — the button this one SWAPS
  // PLACES with in the rail's bottom slot.
  'bulk-apply': 12.48,
  'bleed-baseline': 14, // Foundry app base (bare control)
};

test('recipe studio font-sizes match the prototype scale under real Foundry core CSS', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p.setContent(page(), { waitUntil: 'load' });

    const rootPx = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    assert.equal(rootPx, 16, 'html root font-size is the 16px rem anchor');

    const measured = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-m]').forEach((el) => {
        out[el.getAttribute('data-m')] = parseFloat(getComputedStyle(el).fontSize);
      });
      return out;
    });

    for (const [key, expected] of Object.entries(EXPECTED)) {
      assert.ok(
        Math.abs(measured[key] - expected) < 0.1,
        `${key}: computed ${measured[key]}px should be ~${expected}px`
      );
    }

    // The bleed contract: the bare control proves Foundry's 14px base is in play, and
    // the nav label must NOT sit at that base — it is now design-pinned, not bleeding.
    assert.equal(measured['bleed-baseline'], 14, 'bare <input> inherits the Foundry 14px app base');
    assert.notEqual(measured['nav-label'], 14, 'nav label must not bleed to the Foundry base');

    // And every OTHER role, generally (issue 1010). This is what turns a stale fixture
    // class or an unpaired scoped component into a failure rather than a plausible-looking
    // number: a rule that stopped applying lands the role on Foundry's app base.
    for (const [role, px] of Object.entries(measured)) {
      if (role === 'bleed-baseline') continue;
      assert.notEqual(
        px,
        14,
        `${role} is at the Foundry 14px app base — its rule stopped applying`
      );
    }

    // The flat and stage component pickers SHARE one rule (issue 676), so they must read
    // identically. Asserting the relationship (not just two equal constants) is what
    // catches the sharing being broken by a new rule that only one of them matches.
    assert.equal(
      measured['flat-picker'],
      measured['stage-picker'],
      'the flat and progressive component pickers share a rule, so they share a size'
    );
    assert.notEqual(measured['flat-picker'], 14, 'the flat component picker must not bleed to the Foundry base');
  } finally {
    await browser.close();
  }
});

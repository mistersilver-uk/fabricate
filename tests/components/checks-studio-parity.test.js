/*
 * CHECKS STUDIO VISUAL PARITY (issue 1096).
 *
 * ── The defect this gate exists for ───────────────────────────────────────────────────
 * Every review in the Checks Studio stack asked "does this control exist and behave
 * correctly". Nothing asked "does it RENDER like the prototype", and nothing COULD: the
 * UX reviewer's authority table passed rows on presence and behaviour, and the two frame
 * sets were captured at different viewport widths, so a side-by-side was distorted before
 * anyone looked at it. No gate in this repository could fail on visual drift. That, not
 * any one wrong colour, is the actual defect — so the fix is a gate, and the drift work is
 * driven by it.
 *
 * ── How it works ─────────────────────────────────────────────────────────────────────
 * `tests/fixtures/checks-studio-parity.json` records the PROTOTYPE's computed styles for a
 * set of named regions, measured in real Chromium by
 * `scripts/checks-studio-parity-extract.mjs`. This test renders Fabricate's corresponding
 * surfaces in real Chromium — the real `styles/fabricate.css` plus the real compiled scoped
 * CSS of every primitive involved — and compares the same computed properties.
 *
 * COMPUTED VALUES, NEVER SCREENSHOTS. The prototype is a fixed 1480px app and Fabricate is
 * not; a screenshot diff cannot survive that and every attempt to eyeball one has already
 * failed. Each surface is measured at its own natural width and only width-invariant
 * properties are recorded, so the two widths never enter the comparison.
 *
 * ── Exemptions ───────────────────────────────────────────────────────────────────────
 * Some values legitimately differ — Foundry chrome, a shared primitive this screen may not
 * restyle, an explicit maintainer instruction that overrides the prototype. Those are
 * recorded IN THE FIXTURE, per region and per property, each with a reason, and this test
 * REQUIRES the reason to be non-empty and the region and property to exist. Dropping a
 * region or a property to make the gate pass is the failure mode the whole file exists to
 * prevent: it would come back one assertion narrower, and green.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const fixture = JSON.parse(
  readFileSync(resolve(repoRoot, 'tests/fixtures/checks-studio-parity.json'), 'utf8')
);

// Every primitive rendered below owns part of its appearance in a scoped `<style>`. Svelte
// compiles `.manager-segment` to `.manager-segment.svelte-<hash>` and `css: 'injected'`
// puts that block in `document.head` AFTER the global sheet, so a fixture that loaded only
// `styles/fabricate.css` would measure an UNSTYLED control and pass on values the app never
// renders. Both halves are needed: the real CSS, and the real hash stamped onto the fixture.
const SCOPED = {
  segmented: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/SegmentedControl.svelte')
  ),
  stepper: scopedComponentCss(resolve(repoRoot, 'src/ui/svelte/components/Stepper.svelte')),
  bandStrip: scopedComponentCss(
    resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte')
  ),
};

// The contract class each scoped block hangs off, per primitive. A fixture element carrying
// one of these gets that primitive's hash so its specificity matches the shipped tree.
const SCOPE_CLASSES = {
  segmented: ['manager-segmented', 'manager-segment', 'manager-segment-label'],
  stepper: ['fab-stepper', 'fab-stepper-input', 'fab-stepper-adjunct'],
  bandStrip: ['fab-band-strip', 'fab-band-strip-track', 'fab-band-strip-band'],
};

/**
 * Where each fixture region lives in Fabricate's own tree.
 *
 * These selectors are a HAND-MAINTAINED MIRROR of the components' markup, so
 * `checks studio parity: every selector is emitted by a real component` below re-derives
 * each one from component SOURCE. Without that, a component could stop emitting a class,
 * the fixture markup here would keep rendering it, and this gate would go on measuring
 * something the app no longer draws.
 */
const FABRICATE_SELECTORS = {
  'pane-background': { selector: '.manager-environment-tab-panel', effectiveBackground: true },
  'pane-container': { selector: '.manager-environment-workspace' },
  'studio-shell': { selector: '.manager-environment-editor-shell' },
  'editor-stack': { selector: '.manager-environment-edit-view' },
  'pane-heading': { selector: '.manager-checks-pane-title' },
  'pane-description': { selector: '.manager-checks-pane-lead' },
  'card-surface': { selector: '[data-outcome-bands]' },
  'card-title': { selector: '[data-outcome-bands] .manager-checks-card-title' },
  'card-description': { selector: '[data-check-type-card] .manager-checks-card-description' },
  'check-type-card': { selector: '.manager-resolution-option:not(.is-active)' },
  'check-type-card-selected': { selector: '.manager-resolution-option.is-active' },
  'check-type-icon-tile': {
    selector: '.manager-resolution-option.is-active .manager-resolution-option-icon',
  },
  'check-type-title': {
    selector: '.manager-resolution-option.is-active .manager-resolution-option-name',
  },
  'check-type-description': {
    selector: '.manager-resolution-option.is-active .manager-resolution-option-desc',
  },
  'preview-against-label': { selector: '.manager-checks-preview-against-label' },
  'preview-against-select': { selector: '.manager-checks-preview-against select' },
  'band-strip': { selector: '.fab-band-strip-track' },
  'tier-row': { selector: '.manager-checks-tier-row' },
  'tier-swatch': { selector: '.manager-checks-tier-swatch' },
  'tier-name-input': { selector: '.manager-checks-tier-name' },
  stepper: { selector: '.manager-checks-tier-stepper .fab-stepper' },
  'stepper-value': { selector: '.manager-checks-tier-stepper .fab-stepper-input' },
  'segmented-toggle': { selector: '.manager-checks-tier-row .manager-segmented' },
  'segmented-option-selected': {
    selector: '.manager-checks-tier-row .manager-segment.is-active',
  },
  'segmented-option-unselected': {
    selector: '.manager-checks-tier-row .manager-segment:not(.is-active)',
  },
  'tier-delete-button': { selector: '.manager-checks-tier-remove' },
  'add-tier-button': { selector: '.manager-button.is-dashed' },
  'inspector-surface': { selector: '.manager-checks-rail', effectiveBackground: true },
  'inspector-card': { selector: '.manager-checks-rail [data-checks-preview-as]' },
  'inspector-section-heading': { selector: '.manager-checks-rail .manager-kicker' },
  'inspector-links': { selector: '.manager-checks-rail-links' },
  'inspector-link': { selector: '.manager-checks-rail-link' },
  'inspector-active-card': { selector: '.manager-checks-active-card' },
  'inspector-active-track': {
    selector: '.manager-checks-active-card .manager-status-toggle-track',
  },
  'inspector-active-reading': {
    selector: '.manager-checks-active-card .manager-status-toggle-label',
  },
  'inspector-active-hint': { selector: '.manager-checks-active-card .manager-muted' },
  'inspector-active-lock': { selector: '.manager-checks-active-lock' },
  'inspector-head-icon': { selector: '.manager-checks-rail-head-icon' },
  'inspector-head-note': { selector: '.manager-checks-rail-head-note' },
  'inspector-panel-copy': { selector: '[data-checks-simulator] .manager-muted' },
  'inspector-list-card': { selector: '[data-checks-digest]' },
  'inspector-list-inset': { selector: '[data-checks-digest]' },
  'inspector-list-row': { selector: '[data-checks-digest-row="outcomes"]' },
  'inspector-list-row-icon': { selector: '[data-checks-digest-row="outcomes"] > i:first-child' },
  'inspector-list-row-text': { selector: '[data-checks-digest-row="outcomes"] .manager-checks-rail-row-text' },
  'inspector-list-row-chevron': { selector: '.manager-checks-rail-row-chevron' },
};

// The class / attribute tokens the fixture markup below asserts on, mapped to the component
// that must emit them. Read by the mirror guard, not by the rendering.
const SELECTOR_PROVENANCE = {
  'src/ui/svelte/apps/manager/checks/ChecksView.svelte': [
    'manager-checks-pane-title',
    'manager-checks-pane-lead',
  ],
  'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte': [
    'manager-checks-card',
    'manager-checks-card-title',
    'manager-checks-card-description',
    'manager-checks-preview-against',
    'manager-checks-preview-against-label',
    'manager-checks-tier-list',
    'manager-checks-tier-row',
    'manager-checks-tier-swatch',
    'manager-checks-tier-name',
    'manager-checks-tier-stepper',
    'manager-checks-tier-remove',
    'data-outcome-bands',
    'data-check-type-card',
  ],
  'src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte': [
    'manager-checks-rail',
    'manager-kicker',
    'manager-checks-rail-links',
    'manager-checks-rail-link',
    'manager-checks-rail-head',
    'manager-checks-rail-head-icon',
    'manager-checks-rail-head-note',
    'manager-checks-active-card',
    'manager-checks-active-lock',
    'manager-checks-rail-row',
    'manager-checks-rail-row-text',
    'manager-checks-rail-row-chevron',
    'data-checks-digest',
    'data-checks-digest-row',
    'data-checks-simulator',
    'data-checks-preview-as',
  ],
  'src/ui/svelte/apps/manager/SegmentedControl.svelte': ['manager-segmented', 'manager-segment'],
  'src/ui/svelte/components/Stepper.svelte': ['fab-stepper', 'fab-stepper-input'],
  'src/ui/svelte/components/ThresholdBandStrip.svelte': [
    'fab-band-strip-track',
    'fab-band-strip-band',
  ],
  'src/ui/svelte/apps/manager/RadioCardGroup.svelte': [
    'manager-resolution-option',
    'manager-resolution-option-icon',
    'manager-resolution-option-name',
    'manager-resolution-option-desc',
  ],
  // The primitive builds its modifier as `is-${role}`, so the token that must survive is
  // the ROLE in its closed set, not the rendered class.
  'src/ui/svelte/components/ManagerButton.svelte': ["'dashed'"],
};

/**
 * Fabricate's Outcomes screen, as its components render it.
 *
 * Hand-written rather than mounted because this gate needs a REAL CASCADE — happy-dom
 * cannot compute one and Svelte's SSR output would still need the same host chrome. The
 * mirror guard below is what keeps it honest.
 */
function outcomesFixture() {
  const stepper = (hook, value) => `
    <div class="manager-checks-tier-stepper">
      <div class="fab-stepper is-fill">
        <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
        <input type="number" class="fab-stepper-input" ${hook} value="${value}">
        <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
      </div>
    </div>`;

  // The prototype's first tier is a FAILURE tier, so its `Failure` segment is the lit one.
  // The fixture reproduces that, because the selected/unselected regions were measured on
  // the danger variant and matching them against the success variant would compare two
  // different treatments under one name.
  const segmented = `
    <div class="manager-segmented is-compact" role="radiogroup" aria-label="Success">
      <label class="manager-segment"><input type="radio" class="manager-segment-input" name="s1"><span class="manager-segment-label">Success</span></label>
      <label class="manager-segment is-active is-danger"><input type="radio" class="manager-segment-input" name="s1" checked><span class="manager-segment-label">Failure</span></label>
    </div>`;

  // THE REAL ANCESTOR CHAIN, not an abbreviation of it. The first version of this fixture
  // started at the tab panel, and that is exactly why it passed while the maintainer was
  // looking at 36px of stacked dead space: the shell's padding and the workspace's gap were
  // not in the tree at all, so nothing could measure them (issue 1096, parity round 2).
  // `data-manager-view` is LOAD-BEARING, not decoration. The studio's own gutter rule is
  // (0,4,0) precisely because `[data-environment-editor]` — which the checks editor also
  // carries — ties it at (0,3,0) and wins on source order; a fixture root without the route
  // attribute would measure the losing side and pass a 12px band nobody wanted.
  return `
<div class="fabricate-manager" data-fabricate-theme="fabricate" data-manager-view="checks-crafting">
  <div class="manager-body">
    <main class="manager-main manager-environment-edit-main">
      <section class="manager-environment-editor-shell" data-checks-shell>
      <div class="manager-environment-edit-view" data-environment-editor data-checks-editor>
        <div class="manager-environment-tabs manager-checks-sections" role="tablist"></div>
        <div class="manager-environment-workspace">
          <div class="manager-environment-tab-panel">
            <header class="manager-checks-pane-head" data-checks-pane-head="outcomes">
              <h2 class="manager-checks-pane-title">Outcomes</h2>
              <p class="manager-checks-pane-lead">What each result of the roll produces. A record binds its result groups to the tiers set here.</p>
            </header>
            <div class="manager-checks-editor">
              <section class="manager-inspector-card manager-checks-card" data-check-type-card>
                <div class="manager-checks-card-head">
                  <div>
                    <h3 class="manager-checks-card-title">Check type</h3>
                    <p class="manager-checks-card-description">How the outcome tiers are anchored. Both tier lists are kept, so switching never discards the other.</p>
                  </div>
                </div>
                <div class="manager-checks-card-body">
                  <fieldset class="manager-field is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
                    <legend class="manager-resolution-mode-legend">Check type</legend>
                    <div class="manager-resolution-mode-options" style="--manager-radio-card-columns: 2">
                      <label class="manager-resolution-option is-active" data-check-type-option="relative"><span class="manager-resolution-option-icon"><i class="fas fa-plus-minus"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Relative</span><span class="manager-resolution-option-desc">Tier thresholds are relative to the recipe DC.</span></span><input type="radio" name="check-type" value="relative" checked></label>
                      <label class="manager-resolution-option" data-check-type-option="fixed"><span class="manager-resolution-option-icon"><i class="fas fa-ruler-horizontal"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Fixed</span><span class="manager-resolution-option-desc">Each tier owns a segment of the value range.</span></span><input type="radio" name="check-type" value="fixed"></label>
                    </div>
                  </fieldset>
                </div>
              </section>

              <section class="manager-inspector-card manager-checks-card" data-outcome-bands>
                <div class="manager-checks-card-head is-inline">
                  <h3 class="manager-checks-card-title">Outcome bands</h3>
                  <p class="manager-checks-card-description">Transition points between the tiers below.</p>
                  <button type="button" class="manager-button fab-manager-button" data-add-outcome><i class="fas fa-plus"></i><span>Add outcome</span></button>
                </div>
                <div class="manager-checks-card-body is-roomy">
                  <div class="manager-checks-preview-against" data-preview-against>
                    <span class="manager-checks-preview-against-label" id="pa">Preview against</span>
                    <select data-preview-against-select aria-labelledby="pa"><option>Default · DC 12</option></select>
                  </div>
                  <div class="fab-band-strip">
                    <div class="fab-band-strip-track">
                      <div class="fab-band-strip-band" style="left:0%;width:50%"><span>Disaster</span></div>
                      <div class="fab-band-strip-band" style="left:50%;width:50%"><span>Good</span></div>
                    </div>
                  </div>
                  <div class="manager-checks-tier-list" role="list" aria-label="Outcome tiers">
                    <div class="manager-checks-tier-row" role="listitem" data-outcome-row="a">
                      <span class="manager-checks-tier-swatch" style="--fab-outcome-swatch: var(--fab-danger);"></span>
                      <input class="manager-checks-tier-name" data-outcome-name value="Disaster">
                      ${stepper('data-outcome-dc', '-10')}
                      ${segmented}
                      <button type="button" class="manager-button fab-manager-button is-danger manager-checks-tier-remove" data-remove-outcome aria-label="Remove outcome"><i class="fas fa-trash"></i></button>
                    </div>
                  </div>
                  <button type="button" class="manager-button fab-manager-button is-dashed" data-add-outcome-tier><i class="fas fa-plus"></i><span>Add outcome tier</span></button>
                </div>
              </section>
            </div>
          </div>
          <aside class="manager-inspector manager-environment-inspector manager-checks-rail" data-checks-rail="crafting">
            <div class="manager-checks-rail-links">
              <a class="manager-checks-rail-link" href="#docs"><i class="fas fa-book-open"></i><span>Documentation</span></a>
              <a class="manager-checks-rail-link" href="#quickstart"><i class="fas fa-circle-question"></i><span>Quickstart</span></a>
            </div>
            <section class="manager-inspector-card manager-checks-active-card is-on" data-checks-active="crafting">
              <span class="manager-status-toggle is-locked is-on" data-checks-active-locked="on" role="img" aria-label="Check is on">
                <span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">Check is on</span>
                <i class="fas fa-lock manager-checks-active-lock"></i>
              </span>
              <p class="manager-muted" data-checks-active-required>The routed by check resolution mode requires this check, so it cannot be turned off here.</p>
            </section>
            <div class="manager-checks-rail-head">
              <i class="fas fa-user manager-checks-rail-head-icon"></i>
              <p class="manager-kicker">Preview as</p>
            </div>
            <section class="manager-inspector-card" data-checks-preview-as><p class="manager-muted">Reading this check against an actor and record arrives with the outcome preview.</p></section>
            <div class="manager-checks-rail-head">
              <i class="fas fa-flask-vial manager-checks-rail-head-icon"></i>
              <p class="manager-kicker">Outcome preview</p>
            </div>
            <section class="manager-inspector-card" data-checks-simulator><p class="manager-muted">Roll a test check to see exactly which outcome a record lands on and what it costs the character.</p></section>
            <div class="manager-checks-rail-head">
              <i class="fas fa-chart-column manager-checks-rail-head-icon"></i>
              <p class="manager-kicker">Chance per outcome</p>
              <span class="manager-checks-rail-head-note" data-checks-odds-domain>all 20 faces</span>
            </div>
            <section class="manager-inspector-card" data-checks-odds><p class="manager-muted">Once this check has a formula and its outcome bands are set, the chance of landing on each one is listed here.</p></section>
            <div class="manager-checks-rail-head">
              <i class="fas fa-clipboard-check manager-checks-rail-head-icon"></i>
              <p class="manager-kicker">This check</p>
              <span class="manager-chip is-positive">OK</span>
            </div>
            <section class="manager-inspector-card is-rail-list" data-checks-digest>
              <button type="button" class="manager-checks-rail-row is-set" data-checks-digest-row="formula"><i class="fas fa-dice-d20"></i><span class="manager-checks-rail-row-body"><span class="manager-checks-rail-row-text">Formula · 1d20 + @prof</span></span><i class="fas fa-chevron-right manager-checks-rail-row-chevron"></i></button>
              <button type="button" class="manager-checks-rail-row is-set" data-checks-digest-row="outcomes"><i class="fas fa-code-branch"></i><span class="manager-checks-rail-row-body"><span class="manager-checks-rail-row-text">5 outcome tiers, 3 count as success</span></span><i class="fas fa-chevron-right manager-checks-rail-row-chevron"></i></button>
            </section>
          </aside>
        </div>
      </div>
      </section>
    </main>
  </div>
</div>`;
}

function stampScopeHashes(markup) {
  let out = markup;
  for (const [key, classes] of Object.entries(SCOPE_CLASSES)) {
    for (const className of classes) out = withScopeHash(out, className, SCOPED[key].hashClass);
  }
  return out;
}

function page(markup) {
  return `<!doctype html><html><head><style>${css}</style>
<style>${SCOPED.segmented.css}</style>
<style>${SCOPED.stepper.css}</style>
<style>${SCOPED.bandStrip.css}</style>
</head><body style="margin:0">${markup}</body></html>`;
}

async function measureFabricate() {
  const browser = await chromium.launch();
  try {
    // Fabricate's own natural width for this screen, NOT the prototype's 1480. The whole
    // point of comparing computed values rather than pixels-on-screen is that each app is
    // measured where it actually lives.
    const tab = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    await tab.setContent(page(stampScopeHashes(outcomesFixture())), { waitUntil: 'load' });
    return await tab.evaluate((selectors) => {
      function paintedBackground(el) {
        let node = el;
        while (node) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          node = node.parentElement;
        }
        return 'rgba(0, 0, 0, 0)';
      }
      const out = {};
      for (const [name, spec] of Object.entries(selectors)) {
        const el = document.querySelector(spec.selector);
        if (!el) {
          out[name] = { missing: spec.selector };
          continue;
        }
        const cs = getComputedStyle(el);
        const props = {};
        for (const prop of spec.properties) {
          props[prop] = prop === 'backgroundColor' && spec.effectiveBackground
            ? paintedBackground(el)
            : cs[prop];
        }
        out[name] = { properties: props };
      }
      const chrome = [];
      // The DANGER FAMILY, as this theme's tokens resolve it. A studio chrome element — a
      // shell, a pane, a rail, a strip — must never paint one: nothing in the prototype's
      // Outcomes screen is red except a tier's own Failure segment and its remove button,
      // and both of those are inside a card. The maintainer reported two full-height red
      // rules at the pane's edges that every named region passed straight over, because a
      // per-region list can only ever catch a colour on a region someone thought to name.
      // This sweep is the complement: it catches the ones nobody named.
      const DANGER = ['185, 124, 120', '231, 189, 186'];
      const CHROME = [
        '.manager-environment-editor-shell',
        '.manager-environment-edit-view',
        '.manager-environment-tabs',
        '.manager-environment-workspace',
        '.manager-environment-tab-panel',
        '.manager-checks-rail',
        '.manager-checks-editor',
      ];
      for (const selector of CHROME) {
        for (const el of document.querySelectorAll(selector)) {
          const cs = getComputedStyle(el);
          for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
            const width = cs[`border${side}Width`];
            const color = cs[`border${side}Color`];
            if (width !== '0px' && DANGER.some((rgb) => color.includes(rgb))) {
              chrome.push(`${selector} border-${side.toLowerCase()}: ${width} ${color}`);
            }
          }
          if (cs.outlineWidth !== '0px' && DANGER.some((rgb) => cs.outlineColor.includes(rgb))) {
            chrome.push(`${selector} outline: ${cs.outlineWidth} ${cs.outlineColor}`);
          }
          if (DANGER.some((rgb) => cs.scrollbarColor.includes(rgb))) {
            chrome.push(`${selector} scrollbar-color: ${cs.scrollbarColor}`);
          }
        }
      }
      return { regions: out, chrome };
    }, buildQuery());
  } finally {
    await browser.close();
  }
}

/**
 * Whether two computed values say the same thing.
 *
 * Exactly ONE normalisation, and it is a CSS fact rather than a tolerance: on a grid or flex
 * container `column-gap: normal` IS zero — the initial value computes to `normal` and lays
 * out as 0 — so a fixture recording `normal` and a sheet declaring `0` describe one gutter.
 * Nothing else is normalised. A tolerance band on colours or lengths would be the beginning
 * of a gate that cannot fail, which is the state this file exists to end.
 */
function sameComputedValue(property, actual, expected) {
  if (property === 'columnGap' || property === 'rowGap') {
    const zero = (value) => (value === 'normal' ? '0px' : value);
    return zero(actual) === zero(expected);
  }
  return actual === expected;
}

/** The per-region selector plus the exact property list the fixture recorded for it. */
function buildQuery() {
  const query = {};
  for (const [name, region] of Object.entries(fixture.regions)) {
    const target = FABRICATE_SELECTORS[name];
    if (!target) continue;
    query[name] = {
      selector: target.selector,
      effectiveBackground: target.effectiveBackground === true,
      properties: Object.keys(region.properties),
    };
  }
  return query;
}

test('checks studio parity: the fixture and the selector map cover the same regions', () => {
  const measured = Object.keys(fixture.regions).sort();
  const mapped = Object.keys(FABRICATE_SELECTORS).sort();
  // Both directions. A region present in the fixture but absent from the map would be
  // measured against the prototype and never compared to anything; a selector with no
  // region would assert nothing at all. Either is a gate that silently narrowed.
  assert.deepEqual(
    mapped,
    measured,
    'every prototype region needs a Fabricate selector and vice versa'
  );
  assert.ok(
    fixture.provenance?.generator,
    'the fixture must record how it was produced so it can be regenerated'
  );
});

test('checks studio parity: every exemption names a real region, property and reason', () => {
  for (const [name, region] of Object.entries(fixture.regions)) {
    if (!region.exemptions) continue;
    for (const [prop, reason] of Object.entries(region.exemptions)) {
      assert.ok(
        Object.hasOwn(region.properties, prop),
        `${name}.${prop}: exempted a property this region does not measure`
      );
      assert.ok(
        typeof reason === 'string' && reason.trim().length >= 40,
        `${name}.${prop}: an exemption needs a stated reason, not a placeholder`
      );
    }
  }
});

test('checks studio parity: every selector is emitted by a real component', () => {
  for (const [file, tokens] of Object.entries(SELECTOR_PROVENANCE)) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
      // Doc comments in this repo name the very classes they replaced, so matching prose
      // would let a deleted class keep passing.
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const token of tokens) {
      assert.ok(
        source.includes(token),
        `${file} no longer emits \`${token}\`, which the parity fixture measures`
      );
    }
  }
});

test('checks studio parity: Fabricate matches the prototype region by region', async (t) => {
  const { regions: measured, chrome } = await measureFabricate();

  await t.test('no studio chrome paints a danger-family colour', () => {
    assert.deepEqual(chrome, [], chrome.join('\n'));
  });

  for (const [name, region] of Object.entries(fixture.regions)) {
    await t.test(name, () => {
      const actual = measured[name];
      assert.ok(
        !actual?.missing,
        `${name}: no element matched \`${FABRICATE_SELECTORS[name].selector}\``
      );
      const exemptions = region.exemptions || {};
      // COLLECTED, not asserted one at a time. `assert.equal` throws on the first mismatch,
      // so a region drifting on four properties reported one and hid the rest — and the
      // next run reported the second, which is how a drift sweep turns into four rounds.
      const drifted = [];
      for (const [prop, expected] of Object.entries(region.properties)) {
        if (Object.hasOwn(exemptions, prop)) continue;
        if (!sameComputedValue(prop, actual.properties[prop], expected)) {
          drifted.push(`${name}.${prop}: Fabricate ${actual.properties[prop]} !== prototype ${expected}`);
        }
      }
      assert.deepEqual(drifted, [], drifted.join('\n'));
    });
  }
});

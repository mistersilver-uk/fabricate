/** Fixtures and rendered-geometry readers for `manager-layout-tools.js` (issue 1670). */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  chipCss,
  css,
  stepperScoped,
  withChipHash,
} from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const enPath = resolve(__dirname, '../../lang/en.json');
export const en = JSON.parse(readFileSync(enPath, 'utf8'));

export async function readRenderedToolGeometry(width, view) {
  const context = await openLayoutContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const editor =
      view === 'tool-edit'
        ? `<main class="manager-main manager-tool-edit-main" data-tool-edit-view>
          <header class="manager-tool-edit-header" data-tool-editor-header><div class="manager-tool-edit-header-main"><div class="manager-tool-edit-identity"><div class="manager-tool-edit-identity-copy"><h2>Smith's Hammer with a deliberately long localized identity</h2><p>Linked game-world Item</p></div></div><div class="manager-tool-edit-actions"><button class="fabricate-button manager-button fab-manager-button is-ghost">Back</button><button class="fabricate-button manager-button fab-manager-button is-danger">Delete</button><button class="fabricate-button manager-button fab-manager-button is-primary" data-tool-editor-save>Save Tool</button></div></div></header>
          <div class="manager-tool-editor-tabs"><button>Overview</button><button>Breakage</button><button>Requirements</button><button>Validation</button></div>
          <div class="manager-tool-edit-composition"><section class="manager-tool-editor-panel" data-tool-editor-panel><div class="manager-tool-tab-stack">
            <section class="manager-tool-authority-readonly"><span class="manager-tool-authority-icon">A</span><div><p class="manager-kicker">System breakage</p><h3>Tool-specific</h3><p>Set for every Tool from the Tools library.</p></div><span class="manager-chip">System-wide</span></section>
            <section class="manager-tool-breakage-method"><div class="manager-tool-section-heading"><div><p class="manager-kicker">Breakage</p><h3>How this Tool breaks</h3></div><p>Each Tool tracks its own breakage. Pick the method for this one.</p></div><fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards" data-radio-card-group="tool-breakage-mode">
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

// Imported rather than restated, so a change to the route set is a change to this guard too.
export const { CHECKS_VIEWS, CHECKS_REDIRECT_VIEW } =
  await import('../../src/ui/svelte/apps/manager/checks/checksNav.js');

// The Difficulty card and the recipe-tier list beneath it (issue 1096 follow-up, "The roll").
export async function checksRollEdges(page, tiersWrapperClass) {
  const difficultyCard = `
    <section class="fabricate-card manager-inspector-card manager-checks-card" data-check-difficulty-card>
      <div class="manager-checks-card-head">
        <div><h3 class="manager-checks-card-title">Difficulty</h3></div>
      </div>
      <div class="manager-checks-card-body">
        <fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
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
        <ul class="fabricate-sortable-list">
          <li class="fabricate-sortable-list-row manager-checks-tier-row" data-tier-row="t1">
            <div class="fabricate-sortable-list-line">
              <button type="button" class="fabricate-icon-button manager-icon-button is-size-24 fabricate-sortable-list-grip" data-keyboard-focus="true" data-sortable-grip="t1"><i class="fas fa-grip-vertical"></i></button>
              <span class="fabricate-sortable-list-ordinal" data-sortable-ordinal="t1">1</span>
              <div class="fabricate-sortable-list-content">
                <input class="manager-checks-tier-name" data-tier-name value="Apprentice work">
                <span class="manager-checks-tier-unit">DC</span>
                <div class="manager-checks-tier-stepper is-narrow">
                  <div class="fab-stepper is-fill">
                    <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
                    <input type="number" class="fab-stepper-input" data-tier-dc value="8">
                    <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
                <button type="button" class="fabricate-button manager-button fab-manager-button is-danger manager-checks-tier-remove" data-remove-tier>
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <span class="fabricate-sortable-list-rocker">
                <button type="button" class="fabricate-icon-button manager-icon-button is-size-24 fabricate-sortable-list-move" data-keyboard-focus="true" data-sortable-move="up" disabled><i class="fas fa-chevron-up"></i></button>
                <button type="button" class="fabricate-icon-button manager-icon-button is-size-24 fabricate-sortable-list-move" data-keyboard-focus="true" data-sortable-move="down" disabled><i class="fas fa-chevron-down"></i></button>
              </span>
            </div>
          </li>
          <li class="manager-checks-tier-add">
            <button type="button" class="fabricate-button manager-button fab-manager-button is-dashed" data-add-tier>
              <i class="fas fa-plus"></i><span>Add difficulty tier</span>
            </button>
          </li>
        </ul>
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
      listPaddingLeft: getComputedStyle(document.querySelector('.fabricate-sortable-list'))
        .paddingLeft,
      listPaddingRight: getComputedStyle(document.querySelector('.fabricate-sortable-list'))
        .paddingRight,
      addTierLeft: round(addTier.left),
      addTierRight: round(addTier.right),
    };
  });
}

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
export async function modifiersCombinationRuleMetrics(page, cardWrapperClass) {
  const card = `
    <section class="${cardWrapperClass}" data-crafting-modifier-catalogue="crafting">
      <h3 class="manager-card-title">Named modifiers</h3>
      <fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
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

// ── The outcome band strip's fill, its swatch key.
const bandStripPath = resolve(
  __dirname,
  '../../src/ui/svelte/components/ThresholdBandStrip.svelte'
);
const checkEditorPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte'
);
const bandStripScoped = scopedComponentCss(bandStripPath);
export const checkEditorSource = readFileSync(checkEditorPath, 'utf8');

/** Renders a fixture against the real sheet plus the strip's own scoped CSS, in one context. */
export async function withBandStripPage(run) {
  const context = await openLayoutContext({ viewport: { width: 900, height: 400 } });
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
 */
export function bandStripFixture(body) {
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

export const AUTHORITY_PROBES = ['primary', 'danger'];

// ── The Checks rail's CONTROL TYPE SCALE (issue 1097 follow-up) ────────────────────────────
export const CHECKS_RAIL_FOUNDRY_CSS = readFileSync(
  resolve(__dirname, '../fixtures/foundry-core-min.css'),
  'utf8'
);

// ── The bounds steppers must render "Unbounded" in full (issue 1096) ───────────────────────
export const MODIFIER_BOUNDS_ROW_WIDTHS = [1280, 1120, 960, 831, 680];

export function withStepperHash(markup) {
  return ['fab-stepper', 'fab-stepper-input', 'fab-stepper-adjunct'].reduce(
    (current, token) => withScopeHash(current, token, stepperScoped.hashClass),
    markup
  );
}

// ── The simulator's face tile and the odds row (issue 1097) ─────────────────────────────
export const previewScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte')
);
export const oddsScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte')
);
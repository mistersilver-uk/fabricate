/*
 * THE RE-ROOTED CONTROLS, RENDERED IN THREE HOSTS (issues 1502, 1508 and 1509).
 * ── THE MARKUP IS THE PRIMITIVE'S OWN CLASS LIST, READ OUT OF THE PRIMITIVE ─────────────────
 * The controls are rendered as markup rather than by compiling and mounting three Svelte
 * components into a browser page, on `manager-layout.test.js`'s precedent (`:8790`) and for its
 * reason: what is under measurement is which rules in the sheet reach the classes the primitive
 * EMITS, and mounting adds a compile step that changes none of it. What keeps that honest is that
 * no class string is restated here — each is read from the component's own source, so a primitive
 * that stopped emitting its root leaves this file measuring nothing and saying so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { specificityOf } from '../../scripts/lib/stylesheetSelectorCensus.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHEET_PATH = resolve(repoRoot, 'styles/fabricate.css');
const sheet = readFileSync(SHEET_PATH, 'utf8');

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

/**
 * The unconditional class literals of a primitive's `const classes = $derived([…])` array.
 *
 * @param {string} source A Svelte component's source text.
 * @param {string} label The component, for the failure message.
 * @returns {string[]} Every unconditional string literal in the array, in order.
 */
function composedClasses(source, label) {
  const literal = source.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, `${label} must declare its emitted classes as one array literal`);
  const tokens = [...literal[1].matchAll(/(?:^|,)\s*'([a-z][\w-]*)'\s*(?=,|$)/g)].map(
    ([, token]) => token
  );
  assert.ok(tokens.length > 0, `${label}'s class array holds no unconditional literal`);
  return tokens;
}

const MANAGER_BUTTON_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerButton.svelte'),
  'ManagerButton'
).join(' ');
const ICON_BUTTON_CLASSES = composedClasses(
  read('src/ui/svelte/components/IconButton.svelte'),
  'IconButton'
).join(' ');

/**
 * `Pagination` writes its classes inline on its root `<section>` rather than composing them,
 * so its contract is read from the markup instead — by the same rule that nothing is restated.
 */
/** `Field` composes exactly two unconditional literals — its root and its hook class. */
const FIELD_CLASSES = composedClasses(
  read('src/ui/svelte/components/Field.svelte'),
  'Field'
).join(' ');

/** `ManagerSearchField`'s `is-compact` literal belongs to a conditional expression. */
const SEARCH_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerSearchField.svelte'),
  'ManagerSearchField'
).join(' ');

/** `ManagerToolbar` and `InspectorCard` each compose exactly two unconditional literals. */
const TOOLBAR_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerToolbar.svelte'),
  'ManagerToolbar'
).join(' ');
const CARD_CLASSES = composedClasses(
  read('src/ui/svelte/components/InspectorCard.svelte'),
  'InspectorCard'
).join(' ');

/** `StatusToggle`'s array holds MORE than its unconditional literals — the host's own class. */
const TOGGLE_CLASSES = composedClasses(
  read('src/ui/svelte/components/StatusToggle.svelte'),
  'StatusToggle'
).join(' ');

/** `ChanceSlider` composes nothing: it writes every class it emits as a literal. */
const SLIDER_CLASSES = (() => {
  const source = read('src/ui/svelte/components/ChanceSlider.svelte');
  const match = source.match(/class="(fabricate-slider[^"]*)"/);
  assert.ok(match, 'ChanceSlider must write its family root inline on its root element');
  return match[1];
})();

/**
 * `EditorTabs` writes its root as a LITERAL at the head of an interpolated template and its
 * container class as a frozen PROP DEFAULT, so its contract is read out of both (issue 1509).
 */
const TABS_ROOT = (() => {
  const source = read('src/ui/svelte/components/EditorTabs.svelte');
  const match = source.match(/class=\{`(fabricate-tabs) \$\{containerClass\}`\}/);
  assert.ok(match, 'EditorTabs must write its family root ahead of the container class it takes');
  return match[1];
})();
const TABS_CONTAINER_CLASS = (() => {
  const source = read('src/ui/svelte/components/EditorTabs.svelte');
  const match = source.match(/container: '([\w-]+)'/);
  assert.ok(match, 'EditorTabs must declare its container class in `DEFAULT_CLASSES`');
  return match[1];
})();
const TABS_BUTTON_CLASS = (() => {
  const source = read('src/ui/svelte/components/EditorTabs.svelte');
  const match = source.match(/button: '([\w-]+)'/);
  assert.ok(match, 'EditorTabs must declare its button class in `DEFAULT_CLASSES`');
  return match[1];
})();
const TABS_CLASSES = `${TABS_ROOT} ${TABS_CONTAINER_CLASS}`;

/**
 * `EditorValidationSurface` composes FOUR unconditional literals and the root is the first
 * (issue 1509), which is what `composedClassRegion` in the area-scope gate reads.
 */
const VALIDATION_CLASSES = composedClasses(
  read('src/ui/svelte/components/EditorValidationSurface.svelte'),
  'EditorValidationSurface'
).join(' ');

/** The class list `RadioCardGroup` hands `Field`, read out of the component's own template. */
const OPTION_CARDS_OWN_CLASSES = (() => {
  const source = read('src/ui/svelte/components/RadioCardGroup.svelte');
  const match = source.match(/class=\{`([^`$]*)\$\{/u);
  assert.ok(
    match,
    'RadioCardGroup must hand `Field` a `` class={`…`} `` template whose leading run is literal'
  );
  return match[1].trim();
})();

const OPTION_CARDS_CLASSES = `${FIELD_CLASSES} ${OPTION_CARDS_OWN_CLASSES} is-config-cards`;

/** The class list `ToggleCard` writes on its own root `<div>`, read out of its template. */
const TOGGLE_CARD_CLASSES = (() => {
  const source = read('src/ui/svelte/components/ToggleCard.svelte');
  const match = source.match(/class=\{`([^`$]*)\$\{/u);
  assert.ok(
    match,
    'ToggleCard must write a `` class={`…`} `` template whose leading run is literal, with its ' +
      'namespace root at the head of it'
  );
  return match[1].trim();
})();

/** The class list `ItemDropZone` writes on its own root `<div>`, a plain literal attribute. */
const LINK_FIELD_CLASSES = (() => {
  const source = read('src/ui/svelte/components/ItemDropZone.svelte');
  const match = source.match(/class="(fabricate-link-field[^"]*)"/u);
  assert.ok(match, 'ItemDropZone must write its family root inline on its root element');
  return match[1];
})();

/** The class list `ModifierPillSelect` hands `Field`, read out of its own markup (issue 1515). */
const PILL_SELECT_OWN_CLASSES = (() => {
  const source = read('src/ui/svelte/components/ModifierPillSelect.svelte');
  const match = source.match(/class="(fabricate-pill-select[^"]*)"/u);
  assert.ok(match, 'ModifierPillSelect must write its family root at the head of the class it hands `Field`');
  return match[1];
})();

const PILL_SELECT_CLASSES = `${FIELD_CLASSES} ${PILL_SELECT_OWN_CLASSES}`;

const PAGINATION_CLASSES = (() => {
  const source = read('src/ui/svelte/components/Pagination.svelte');
  const match = source.match(/class="(fabricate-pagination[^"]*)"/);
  assert.ok(match, 'Pagination must write its family root inline on its root element');
  return match[1];
})();

// NON-VACUITY ON THE READS THEMSELVES. Every assertion in this file is about what the sheet does
// to these three strings, so a read that quietly returned the wrong thing would leave the whole
// file measuring an element the product does not render — passing, and proving nothing.
test('the class reader excludes conditional literals from default-control fixtures', () => {
  assert.deepEqual(
    composedClasses(
      "const classes = $derived(['root', size === 24 ? 'is-size-24' : '', compact && 'is-compact', 'tail', extraClass])",
      'conditional fixture'
    ),
    ['root', 'tail']
  );
});

test('the fifteen class strings under measurement are the ones the primitives emit', () => {
  assert.equal(MANAGER_BUTTON_CLASSES, 'fabricate-button manager-button fab-manager-button');
  assert.equal(ICON_BUTTON_CLASSES, 'fabricate-icon-button manager-icon-button');
  assert.equal(PAGINATION_CLASSES, 'fabricate-pagination manager-pagination');
  assert.equal(FIELD_CLASSES, 'fabricate-field manager-field');
  assert.equal(SEARCH_CLASSES, 'fabricate-search manager-search');
  assert.equal(TOOLBAR_CLASSES, 'fabricate-filter-bar manager-toolbar');
  assert.equal(CARD_CLASSES, 'fabricate-card manager-inspector-card');
  assert.equal(TOGGLE_CLASSES, 'fabricate-toggle manager-status-toggle');
  assert.equal(SLIDER_CLASSES, 'fabricate-slider manager-chance-slider manager-drop-rate-value');
  assert.equal(TABS_CLASSES, 'fabricate-tabs manager-editor-tabs');
  assert.equal(
    VALIDATION_CLASSES,
    'fabricate-validation manager-recipe-tab manager-recipe-validation ' +
      'manager-editor-validation-surface',
    'the surface emits its namespace root and its three `manager-*` classes, in that order'
  );
  assert.equal(
    OPTION_CARDS_CLASSES,
    'fabricate-field manager-field fabricate-option-cards is-wide ' +
      'manager-resolution-mode-card manager-radio-card-group is-config-cards',
    'the fieldset carries `Field`s pair, then this family`s root, then this family`s own classes'
  );
  assert.equal(
    TOGGLE_CARD_CLASSES,
    'fabricate-toggle-card manager-recipe-status-card',
    'the status card emits its namespace root ahead of its own card class, and the variant and ' +
      'the on/off state are interpolated after them'
  );
  assert.equal(
    LINK_FIELD_CLASSES,
    'fabricate-link-field manager-item-drop-zone',
    'the link field emits its namespace root ahead of its own zone class'
  );
  assert.equal(
    PILL_SELECT_CLASSES,
    'fabricate-field manager-field fabricate-pill-select manager-availability-multi',
    'the pill select emits `Field`s pair, then its own namespace root, then its family root'
  );
  assert.equal(
    PILL_SELECT_OWN_CLASSES.split(/\s+/u)[0],
    'fabricate-pill-select',
    'ModifierPillSelect must declare its namespace root as the FIRST token of the class it hands ' +
      '`Field`, which is where the area-scope gate`s markup reader takes it from'
  );
  assert.equal(
    OPTION_CARDS_OWN_CLASSES.split(/\s+/u)[0],
    'fabricate-option-cards',
    'RadioCardGroup must declare its namespace root as the FIRST token of the class template it ' +
      'hands `Field`, which is where the area-scope gate`s markup reader takes it from'
  );
  assert.equal(
    TABS_BUTTON_CLASS,
    'manager-editor-tab-button',
    'the tab button class the fixture below writes is the primitive`s own default, read out of ' +
      'its frozen map rather than restated here'
  );

  // AND THE ROOT IS THE ARRAY'S FIRST LITERAL.
  // style note: `searchable-popover-area-scope.test.js` reads the composed region by taking the
  // first `]` after the opener, so a root moved off the head of the array is a root that gate
  // reports as unemitted while every re-rooted rule in the sheet keeps matching.
  for (const [file, label, root] of [
    ['src/ui/svelte/components/Field.svelte', 'Field', 'fabricate-field'],
    ['src/ui/svelte/components/ManagerSearchField.svelte', 'ManagerSearchField', 'fabricate-search'],
    ['src/ui/svelte/components/ManagerToolbar.svelte', 'ManagerToolbar', 'fabricate-filter-bar'],
    ['src/ui/svelte/components/InspectorCard.svelte', 'InspectorCard', 'fabricate-card'],
    ['src/ui/svelte/components/StatusToggle.svelte', 'StatusToggle', 'fabricate-toggle'],
    [
      'src/ui/svelte/components/EditorValidationSurface.svelte',
      'EditorValidationSurface',
      'fabricate-validation',
    ],
  ]) {
    assert.equal(
      composedClasses(read(file), label)[0],
      root,
      `${label} must declare \`${root}\` as the FIRST literal of its class array`
    );
  }

  // AND THE FIXTURE BELOW WRITES EXACTLY THOSE STRINGS. The markup states its classes as
  // literals so the repository's own fixture census can read them (see `CONTROLS`), which only
  // stays honest while the literal and the component agree — so the agreement is asserted rather
  // than assumed. A primitive that changes what it emits reds here, naming the control, instead
  // of leaving this file measuring markup the product stopped rendering.
  for (const control of CONTROLS) {
    assert.ok(
      control.markup('bare').includes(`class="${control.classes}"`),
      `the ${control.id} fixture does not write \`class="${control.classes}"\`, which is what ` +
        'the primitive emits'
    );
  }
});

/** The three hosts, which differ ONLY in the class on the wrapping `<div>`. */
const HOSTS = Object.freeze([
  Object.freeze({ id: 'bare', className: '' }),
  Object.freeze({ id: 'app', className: 'fabricate fabricate-app' }),
  Object.freeze({ id: 'manager', className: 'fabricate fabricate-manager' }),
]);

/** The controls, and the element inside each host that is measured. */
const CONTROLS = Object.freeze([
  Object.freeze({
    id: 'manager-button',
    classes: MANAGER_BUTTON_CLASSES,
    markup: (host) =>
      `<button type="button" class="fabricate-button manager-button fab-manager-button" data-probe="${host}-manager-button"><span>Save</span></button>`,
  }),
  Object.freeze({
    id: 'icon-button',
    classes: ICON_BUTTON_CLASSES,
    markup: (host) =>
      `<button type="button" class="fabricate-icon-button manager-icon-button" data-probe="${host}-icon-button" aria-label="Delete"><i class="fas fa-trash"></i></button>`,
  }),
  Object.freeze({
    id: 'pagination',
    classes: PAGINATION_CLASSES,
    markup: (host) =>
      `<section class="fabricate-pagination manager-pagination" data-probe="${host}-pagination"><span class="manager-pagination-summary">Showing 1-4 of 8</span><nav class="manager-pagination-nav"><button type="button" class="fabricate-icon-button manager-icon-button" data-probe="${host}-pagination-arrow" aria-label="Previous"><i class="fas fa-chevron-left"></i></button><span class="manager-pagination-page">1 of 2</span></nav></section>`,
  }),
  // THE PROBE IS THE CONTROL, NOT THE ROOT (issue 1508). `Field`'s root is a `<label>` and the
  // thing the family's chrome reaches is the `<input type="text">` inside it, so that is what
  // carries the `data-probe`. The root element still writes the family's class string, which is
  // what the pinning test above reads and what the sheet's own rules are anchored on.
  Object.freeze({
    id: 'field',
    classes: FIELD_CLASSES,
    comparesBox: false,
    markup: (host) =>
      `<label class="fabricate-field manager-field" data-probe="${host}-field-root"><span>Name</span><input type="text" data-probe="${host}-field"></label>`,
  }),
  Object.freeze({
    id: 'search',
    classes: SEARCH_CLASSES,
    markup: (host) =>
      `<label class="fabricate-search manager-search" data-probe="${host}-search-root"><i class="fas fa-search"></i><input type="search" data-probe="${host}-search"></label>`,
  }),
  // THE PROBE IS THE ROOT FOR BOTH OF THESE.
  Object.freeze({
    id: 'toolbar',
    classes: TOOLBAR_CLASSES,
    markup: (host) =>
      `<section class="fabricate-filter-bar manager-toolbar" data-probe="${host}-toolbar" aria-label="Filter"><div></div></section>`,
  }),
  Object.freeze({
    id: 'card',
    classes: CARD_CLASSES,
    markup: (host) =>
      `<section class="fabricate-card manager-inspector-card" data-probe="${host}-card"><h3>Matching evidence</h3><p>Body</p></section>`,
  }),
  // THE PROBE IS THE ROOT AGAIN FOR THE TOGGLE, and here that is not a shortcut either.
  Object.freeze({
    id: 'toggle',
    classes: TOGGLE_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON.
    comparesBox: false,
    markup: (host) =>
      `<button type="button" class="fabricate-toggle manager-status-toggle" data-probe="${host}-toggle" data-keyboard-focus="true"><span class="manager-status-toggle-track" data-probe="${host}-toggle-track"><span class="manager-status-toggle-knob" data-probe="${host}-toggle-knob"></span></span><span class="manager-status-toggle-label" data-probe="${host}-toggle-label">On</span></button>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE SLIDER. Its root `<span>` is neither of the two controls
  // it owns, so the root carries the class string the pinning test reads while the number input,
  // the range input, the rail and the fill each carry a probe of their own — those are what the
  // family's rules actually paint.
  Object.freeze({
    id: 'slider',
    classes: SLIDER_CLASSES,
    markup: (host) =>
      `<span class="fabricate-slider manager-chance-slider manager-drop-rate-value" data-probe="${host}-slider-root" data-chance-slider><span class="manager-chance-slider-number manager-drop-rate-percent" data-probe="${host}-slider-percent"><input type="number" min="0" max="100" step="1" value="40" data-probe="${host}-slider-number"><span aria-hidden="true">%</span></span><span class="manager-chance-slider-control manager-drop-rate-control is-common" data-probe="${host}-slider" style="width: 240px; --fab-drop-rate-value: 40%;"><span class="manager-drop-rate-track" data-probe="${host}-slider-track"><span class="manager-drop-rate-fill" data-probe="${host}-slider-fill"></span></span><input type="range" min="0" max="100" step="1" value="40" data-probe="${host}-slider-range"></span></span>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE TAB STRIP EITHER (issue 1509). Its root is a
  // `<div role="tablist">`, and the control it owns is the `<button role="tab">` inside it — two
  // of them here, because the RESTING and the ACTIVE tab are painted by two different rules and
  // the active underline is the thing this strip is recognisable by. The root carries the class
  // string the pinning test reads; the two buttons carry the probes.
  Object.freeze({
    id: 'tabs',
    classes: TABS_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON.
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-tabs manager-editor-tabs" role="tablist" data-probe="${host}-tabs"><button type="button" role="tab" class="manager-editor-tab-button is-active" data-probe="${host}-tabs-active" aria-selected="true" data-keyboard-focus="true"><span>Overview</span></button><button type="button" role="tab" class="manager-editor-tab-button" data-probe="${host}-tabs-button" aria-selected="false" data-keyboard-focus="true"><span>Results</span></button></div>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE VALIDATION SURFACE EITHER (issue 1509). This family
  // owns no CONTROL at all — its root is a `<section>` and everything under it is sections,
  // lists and spans — so what is measured is the four things the surface draws: the summary card
  // with its medallion, the count rail, and the grouped row stack. Eighteen probes, because
  // every one of them is painted by a rule this change re-rooted and none of them may depend on
  // the host.
  Object.freeze({
    id: 'validation',
    classes: VALIDATION_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON for the residue above.
    comparesBox: false,
    markup: (host) =>
      `<section class="fabricate-validation manager-recipe-tab manager-recipe-validation manager-editor-validation-surface" data-probe="${host}-validation"><section class="manager-recipe-validation-summary-row" data-probe="${host}-validation-summary-row"><div class="manager-recipe-rail-summary is-block" data-probe="${host}-validation-summary"><span class="manager-recipe-rail-summary-medallion" data-probe="${host}-validation-medallion"><i class="fas fa-circle-xmark"></i></span><span class="manager-recipe-rail-summary-copy" data-probe="${host}-validation-copy"><span class="manager-recipe-rail-summary-title" data-probe="${host}-validation-title">Cannot be enabled</span><span class="manager-recipe-rail-summary-sub manager-muted" data-probe="${host}-validation-sub">Clear every blocking issue first.</span></span></div><ul class="manager-recipe-rail-counts" data-probe="${host}-validation-counts"><li class="manager-recipe-rail-count is-passing" data-probe="${host}-validation-count"><i class="fas fa-circle-check"></i><span class="manager-recipe-rail-count-label" data-probe="${host}-validation-count-label">Passing</span><span class="manager-recipe-rail-count-value" data-probe="${host}-validation-count-value">7</span></li></ul></section><div class="manager-recipe-val-group" data-probe="${host}-validation-group"><p class="manager-recipe-val-group-label" data-probe="${host}-validation-group-label">Requirements</p><ul class="manager-recipe-val-rows" data-probe="${host}-validation-rows"><li class="manager-recipe-val-row is-block" data-probe="${host}-validation-row"><i class="manager-recipe-val-status fas fa-circle-xmark" data-probe="${host}-validation-status"></i><div class="manager-recipe-val-copy" data-probe="${host}-validation-row-copy"><span class="manager-recipe-val-title" data-probe="${host}-validation-row-title">A game-world Item is linked</span></div></li></ul></div></section>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE OPTION CARDS EITHER (issue 1509 phase 3).
  Object.freeze({
    id: 'option-cards',
    classes: OPTION_CARDS_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON, for the icon tile's reason stated in the header.
    comparesBox: false,
    markup: (host) =>
      `<fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards" data-probe="${host}-option-cards"><legend class="manager-resolution-mode-legend" data-probe="${host}-option-cards-legend">Resolution</legend><div class="manager-resolution-mode-options" data-probe="${host}-option-cards-options"><label class="manager-resolution-option is-active" data-probe="${host}-option-cards-row-active"><input type="radio" name="${host}-option-cards" checked data-probe="${host}-option-cards-radio-checked"><span class="manager-resolution-option-icon" data-probe="${host}-option-cards-icon"><i class="fas fa-wand-magic-sparkles"></i></span><span class="manager-resolution-option-body" data-probe="${host}-option-cards-body"><span class="manager-resolution-option-name" data-probe="${host}-option-cards-name">Simple</span><span class="manager-resolution-option-desc" data-probe="${host}-option-cards-desc">One ingredient set and one result group.</span></span></label><label class="manager-resolution-option" data-probe="${host}-option-cards-row"><input type="radio" name="${host}-option-cards" data-probe="${host}-option-cards-radio"><span class="manager-resolution-option-icon"><i class="fas fa-layer-group"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Routed by ingredients</span></span></label></div></fieldset>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE STATUS CARD EITHER (issue 1509 phase 4). This family
  // owns NO CONTROL: the switch inside it is `StatusToggle`'s, composed rather than written, and
  // it is rendered here exactly as the card renders it — with its own namespace root on it — so
  // the fixture is the card the product draws rather than a card-shaped approximation. It carries
  // no probe of its own, because the `toggle` entry above already measures that primitive.
  Object.freeze({
    id: 'toggle-card',
    classes: `${TOGGLE_CARD_CLASSES} is-enabled is-on`,
    // OPTED OUT OF THE BOX COMPARISON, for the sub-line's reason above.
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-toggle-card manager-recipe-status-card is-enabled is-on" data-probe="${host}-toggle-card"><span class="manager-recipe-status-icon" aria-hidden="true" data-probe="${host}-toggle-card-icon"><i class="fas fa-circle-check"></i></span><div class="manager-recipe-status-copy" data-probe="${host}-toggle-card-copy"><p class="manager-recipe-status-title" data-probe="${host}-toggle-card-title">Enabled</p><p class="manager-recipe-status-sub manager-muted" data-probe="${host}-toggle-card-sub">Craftable by players</p></div><button type="button" class="fabricate-toggle manager-status-toggle is-on" aria-pressed="true" data-keyboard-focus="true"><span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span></button></div>`,
  }),
  Object.freeze({
    id: 'toggle-card-locked',
    classes: `${TOGGLE_CARD_CLASSES} is-locked is-on`,
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-toggle-card manager-recipe-status-card is-locked is-on" data-probe="${host}-toggle-card-locked"><span class="manager-recipe-status-icon" aria-hidden="true"><i class="fas fa-lock"></i></span><div class="manager-recipe-status-copy"><p class="manager-recipe-status-title">Locked</p><p class="manager-recipe-status-sub manager-muted">Players cannot edit this</p></div></div>`,
  }),
  Object.freeze({
    id: 'toggle-card-info',
    classes: `${TOGGLE_CARD_CLASSES} is-info is-on`,
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-toggle-card manager-recipe-status-card is-info is-on" data-probe="${host}-toggle-card-info"><span class="manager-recipe-status-icon" aria-hidden="true" data-probe="${host}-toggle-card-info-icon"><i class="fas fa-circle-info"></i></span><div class="manager-recipe-status-copy"><p class="manager-recipe-status-title">Policy</p><p class="manager-recipe-status-sub manager-muted">Set by the world</p></div></div>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE LINK FIELD EITHER (issue 1509 phase 4).
  Object.freeze({
    id: 'link-field',
    classes: `${LINK_FIELD_CLASSES} is-linked`,
    markup: (host) =>
      `<div class="fabricate-link-field manager-item-drop-zone is-linked" data-manager-item-drop-zone="" data-probe="${host}-link-field"><span class="manager-item-drop-zone-icon" aria-hidden="true" data-probe="${host}-link-field-icon"><img src="icons/svg/item-bag.svg" alt="" data-probe="${host}-link-field-art"></span><span class="manager-item-drop-zone-copy" data-probe="${host}-link-field-copy"><strong data-probe="${host}-link-field-name">Dragon Scale</strong><code class="manager-item-drop-zone-uuid" data-item-drop-zone-uuid data-probe="${host}-link-field-uuid">Item.7Yq0cS1n</code><small data-probe="${host}-link-field-hint">Drop another Item here to replace the linked source.</small></span><span class="manager-item-drop-zone-actions" data-probe="${host}-link-field-actions"><button type="button" class="fabricate-icon-button manager-icon-button" aria-label="Copy UUID"><i class="fas fa-copy" aria-hidden="true"></i></button><button type="button" class="fabricate-icon-button manager-icon-button is-danger" aria-label="Unlink"><i class="fas fa-link-slash" aria-hidden="true"></i></button></span></div>`,
  }),
  Object.freeze({
    id: 'link-field-compact',
    classes: `${LINK_FIELD_CLASSES} is-compact`,
    markup: (host) =>
      `<div class="fabricate-link-field manager-item-drop-zone is-compact" data-manager-item-drop-zone="" data-probe="${host}-link-field-compact"><span class="manager-item-drop-zone-icon" aria-hidden="true" data-probe="${host}-link-field-compact-icon"><i class="fas fa-right-left"></i></span><span class="manager-item-drop-zone-copy" data-probe="${host}-link-field-compact-copy"><strong data-probe="${host}-link-field-compact-name">Drop an item to replace the source</strong><small data-probe="${host}-link-field-compact-hint">World item, compendium entry, or pack.</small></span></div>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE PILL SELECT EITHER (issue 1515). Its root is the
  // `<Field as="div">` it renders, so that element carries `fabricate-field` and
  // `fabricate-pill-select` together — the second and last co-rooted family here — and the
  // controls this family owns are the add TRIGGER and the removable pill inside the row.
  Object.freeze({
    id: 'pill-select',
    classes: PILL_SELECT_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON, for the bordered rails' cause rather than one of its own:
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-field manager-field fabricate-pill-select manager-availability-multi" role="group" aria-label="Modifiers" data-probe="${host}-pill-select"><button type="button" class="manager-availability-menu-button" data-keyboard-focus="true" data-probe="${host}-pill-select-menu"><span>Add modifier</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button><div class="manager-availability-pill-row" data-probe="${host}-pill-select-row"><span class="manager-availability-pill is-modifier" data-probe="${host}-pill-select-pill"><i class="fas fa-dice-d20" aria-hidden="true" data-probe="${host}-pill-select-glyph"></i><span data-probe="${host}-pill-select-label">Medicine</span><button type="button" class="manager-availability-remove" data-keyboard-focus="true" aria-label="Remove Medicine" data-probe="${host}-pill-select-remove"><i class="fas fa-xmark" aria-hidden="true"></i></button></span></div></div>`,
  }),
  Object.freeze({
    id: 'pill-select-empty',
    classes: PILL_SELECT_CLASSES,
    comparesBox: false,
    markup: (host) =>
      `<div class="fabricate-field manager-field fabricate-pill-select manager-availability-multi" role="group" aria-label="Modifiers" data-probe="${host}-pill-select-empty"><div class="manager-availability-pill-row" data-probe="${host}-pill-select-empty-row"><span class="manager-muted manager-availability-any" data-probe="${host}-pill-select-any">No modifiers selected.</span></div></div>`,
  }),
]);

/** Probes measured across the three hosts that are not themselves `CONTROLS` entries. */
const EXTRA_PROBES = Object.freeze([
  'toggle-track',
  'toggle-knob',
  'toggle-label',
  'slider-root',
  'slider-percent',
  'slider-number',
  'slider-range',
  'slider-track',
  'slider-fill',
  'tabs-active',
  'tabs-button',
  'validation-summary-row',
  'validation-summary',
  'validation-medallion',
  'validation-copy',
  'validation-title',
  'validation-sub',
  'validation-counts',
  'validation-count',
  'validation-count-label',
  'validation-count-value',
  'validation-group',
  'validation-group-label',
  'validation-rows',
  'validation-row',
  'validation-status',
  'validation-row-copy',
  'validation-row-title',
  'option-cards-legend',
  'option-cards-options',
  'option-cards-row',
  'option-cards-row-active',
  'option-cards-icon',
  'option-cards-body',
  'option-cards-name',
  'option-cards-desc',
  'option-cards-radio',
  'option-cards-radio-checked',
  'toggle-card-icon',
  'toggle-card-copy',
  'toggle-card-title',
  'toggle-card-sub',
  'toggle-card-info-icon',
  'link-field-icon',
  'link-field-art',
  'link-field-copy',
  'link-field-name',
  'link-field-uuid',
  'link-field-hint',
  'link-field-actions',
  'link-field-compact-icon',
  'link-field-compact-copy',
  'link-field-compact-name',
  'link-field-compact-hint',
  // AND THE PILL SELECT'S SIX (issue 1515). Every one of them is painted by a rule this change
  // re-roots: the add trigger, the row, the pill, the pill's leading glyph, its truncating label
  // span and its remove button, plus the placeholder line the empty face renders instead.
  'pill-select-menu',
  'pill-select-row',
  'pill-select-pill',
  'pill-select-glyph',
  'pill-select-label',
  'pill-select-remove',
  'pill-select-empty-row',
  'pill-select-any',
]);

/** The two family RAILS whose rendered border box follows the host's `box-sizing`. */
const BORDERED_TRACK_PROBES = Object.freeze(['toggle-track', 'slider-track']);

/** Those two rails, plus the fill INSIDE one of them, which inherits the same dependence. */
const HOST_BOX_DEPENDENT_PROBES = Object.freeze([
  ...BORDERED_TRACK_PROBES,
  'slider-fill',
  // THE TWO TAB BUTTONS, for the bordered rails' reason (issue 1509).
  'tabs-active',
  'tabs-button',
  // AND SEVEN OF THE OPTION CARD'S PROBES (issue 1509 phase 3), for ONE cause rather than seven.
  // The two RADIO probes are deliberately NOT here: the radio declares `box-sizing: border-box`
  // in its own rule, so it lays out 16x16 in every host and its box is compared.
  'option-cards-options',
  'option-cards-row',
  'option-cards-row-active',
  'option-cards-icon',
  'option-cards-body',
  'option-cards-name',
  'option-cards-desc',
  // AND THE STATUS CARD'S COPY COLUMN AND ITS TWO LINES (issue 1509 phase 4).
  'toggle-card-copy',
  'toggle-card-title',
  'toggle-card-sub',
  // AND THREE OF THE PILL SELECT'S (issue 1515).
  'pill-select-menu',
  'pill-select-pill',
  'pill-select-row',
]);

/**
 * The two validation-surface probes whose laid-out BOX follows a MANAGER class rather than a
 * family one (issue 1509).
 */
const HOST_LEADING_PROBES = Object.freeze([
  'validation-copy',
  'validation-sub',
  // AND THE PILL SELECT'S PLACEHOLDER LINE (issue 1515), for the identical reason a third time:
  'pill-select-any',
  // AND THE ROW THAT HOLDS IT, whose own box follows the line's. `.fabricate-manager
  // .manager-muted` declares a `--fab-space-2xs` TOP MARGIN as well as the size, and the row is
  // a flex container solved from its one child, so it lays out 30 high inside the manager
  // against the 28 the family's floor gives it everywhere else — measured, not predicted. The
  // row's own declarations are compared in all three hosts; only its solved box is excluded.
  'pill-select-empty-row',
  // AND THE STATUS CARD'S TWO, for the identical reason one family later (issue 1509 phase 4):
  'toggle-card-sub',
]);

/** The one probe that is a Font Awesome GLYPH and nothing else (issue 1509). */
const GLYPH_ONLY_PROBES = Object.freeze([
  'validation-status',
  // AND THE PILL'S LEADING GLYPH (issue 1515). It is an empty `<i>` whose whole rendered content
  // is a Font Awesome ligature this core-less harness does not load, so it lays out at 0x0 in
  // every host; what the family declares about it — the warning tone and the centring inside the
  // pill's icon slot — is compared instead, in all three.
  'pill-select-glyph',
  // AND THE LINK FIELD'S COMPACT GLYPH TILE (issue 1509 phase 4). The compact face's whole point
  // is that it does NOT show the art, so the family replaces the default face's 44x44 plate with
  // `width: auto; height: auto` and lets the glyph size itself — and the glyph is a Font Awesome
  // ligature this core-less harness does not load, so the tile lays out at 0x0 in every host. Its
  // DECLARED values are compared instead, in all three, which is where the family's claim lives.
  'link-field-compact-icon',
]);

/** The family's shared base rule, as the browser serialises its prelude. */
const BASE_RULE_SELECTOR =
  '.fabricate-button.manager-button, .fabricate-icon-button.manager-icon-button';

/** The family's bare-element type baseline, as the browser serialises its prelude. */
const FLOOR_RULE_SELECTOR = '.fabricate-button, .fabricate-icon-button';

/** The issue-1508 families' font floor, as the browser serialises its prelude. */
const FAMILY_FONT_FLOOR_MEMBERS = Object.freeze([
  '.fabricate-field :is(input, select, textarea)',
  '.fabricate-search input',
  '.fabricate-slider input',
  // AND THE TAB STRIP'S (issue 1509). Its root is a `<div role="tablist">` and the control it
  // owns is the `<button role="tab">` inside it, so it takes the (0,1,1) shape the other three
  // members take rather than `StatusToggle`'s (0,1,0). It is this group's first `button` member;
  // the two BUTTON FAMILIES floor at their own root instead, because there the root IS the
  // control.
  '.fabricate-tabs button',
]);
const FAMILY_FONT_FLOOR_SELECTOR = FAMILY_FONT_FLOOR_MEMBERS.join(', ');

/** `StatusToggle`'s floor, at the family root ALONE — the (0,1,0) shape, not the (0,1,1) one. */
const TOGGLE_FONT_FLOOR_SELECTOR = '.fabricate-toggle';

/** `Field`'s element-typed chrome rule, as the browser serialises its prelude. */
const FIELD_CHROME_MEMBERS = Object.freeze([
  '.fabricate-field input[type="text"]',
  '.fabricate-field input[type="url"]',
  '.fabricate-field input[type="email"]',
  '.fabricate-field input[type="tel"]',
  '.fabricate-field input[type="password"]',
  '.fabricate-field input:not([type])',
  '.fabricate-field textarea',
]);
const FIELD_CHROME_SELECTOR = FIELD_CHROME_MEMBERS.join(', ');

/**
 * A rule's specificity as (ids, classes, elements), counted off the browser-serialised prelude.
 *
 * @param {string} selectorText A browser-serialised selector list.
 * @returns {string} `a,b,c` when every compound agrees, or a list of the disagreeing compounds.
 */
function specificity(selectorText) {
  const each = selectorText.split(',').map((compound) => {
    const one = compound.trim();
    const ids = (one.match(/#[\w-]+/g) ?? []).length;
    const classes = (one.match(/[.:][\w-]+/g) ?? []).length;
    const elements = (one.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []).length;
    return `${ids},${classes},${elements}`;
  });
  return new Set(each).size === 1 ? each[0] : each.join(' | ');
}

/** The six properties acceptance 2 compares, computed, per control, across the three hosts. */
const COMPARED = Object.freeze([
  'min-height',
  'border-radius',
  'box-sizing',
  'line-height',
  'font-family',
  'font-size',
]);

/** `box-sizing` is compared on the two BUTTON families and not on the pager. */
const COMPARED_PAGINATION = Object.freeze(COMPARED.filter((property) => property !== 'box-sizing'));

/** What acceptance 2 compares on `Field`'s control, measured on an `<input type="text">`. */
const FIELD_COMPARED = Object.freeze([
  'appearance',
  '-webkit-appearance',
  'min-height',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'font-family',
  'font-size',
  'line-height',
]);

/** And on `ManagerSearchField`'s own `<input type="search">`. */
const SEARCH_COMPARED = Object.freeze([
  'height',
  'border-radius',
  'padding-left',
  'padding-right',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'font-family',
  'font-size',
  'line-height',
]);

/** What acceptance 2 compares on the filter bar's own `<section>`. */
const TOOLBAR_COMPARED = Object.freeze([
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'background-color',
  'display',
  'align-items',
  'flex-wrap',
  'gap',
  'min-height',
  'font-family',
  'font-size',
  'line-height',
]);

/** And on the card's own `<section>` — the padding, the hairline border on ALL four edges. */
const CARD_COMPARED = Object.freeze([
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'display',
  'flex-direction',
  'gap',
  'min-height',
  'font-family',
  'font-size',
  'line-height',
]);

/** What acceptance 2 compares on the switch itself — its root `<button>`, which IS the control. */
const TOGGLE_COMPARED = Object.freeze([
  'max-width',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'display',
  'align-items',
  'gap',
  'font-family',
  'font-size',
  'line-height',
]);

/** The 34x20 rail and the 14x14 knob, which is the geometry the switch is recognisable by. */
const TOGGLE_TRACK_COMPARED = Object.freeze([
  'width',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'position',
  'display',
  'align-items',
]);
const TOGGLE_KNOB_COMPARED = Object.freeze([
  'width',
  'height',
  'border-radius',
  'background-color',
  'position',
  'top',
  'left',
]);
/** The reading beside the rail, whose type is the family's own at (0,2,0). */
const TOGGLE_LABEL_COMPARED = Object.freeze([
  'font-size',
  'font-weight',
  'line-height',
  'overflow',
  'text-overflow',
]);

/** What acceptance 2 compares on the slider's two INPUTS, which are the controls it owns. */
const SLIDER_NUMBER_COMPARED = Object.freeze([
  'height',
  'box-sizing',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'text-align',
  'font-family',
  'font-size',
  'line-height',
]);
const SLIDER_RANGE_COMPARED = Object.freeze([
  'appearance',
  '-webkit-appearance',
  'height',
  'border-top-width',
  'background-color',
  'font-family',
  'font-size',
  'line-height',
]);
/** And the rail and the fill the range input is laid over. */
const SLIDER_TRACK_COMPARED = Object.freeze([
  'height',
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'background-color',
  'position',
  'overflow',
]);
const SLIDER_FILL_COMPARED = Object.freeze(['display', 'background-color']);
/** The control span and the number wrapper, which lay the two halves out. */
const SLIDER_CONTROL_COMPARED = Object.freeze(['position', 'display', 'align-items', 'min-width']);
const SLIDER_ROOT_COMPARED = Object.freeze([
  'display',
  'grid-template-columns',
  'align-items',
  'gap',
]);

/** What acceptance 2 compares on the tab strip's own `<div role="tablist">`. */
const TABS_COMPARED = Object.freeze([
  'display',
  'align-items',
  'flex-wrap',
  'gap',
  'min-width',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'font-family',
  'font-size',
]);

/** And on each of the two `<button role="tab">`s, which are the controls the strip owns. */
const TABS_BUTTON_COMPARED = Object.freeze([
  'appearance',
  '-webkit-appearance',
  'min-height',
  'padding-left',
  'padding-right',
  'border-radius',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'background-color',
  'color',
  'display',
  'align-items',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
]);

/** What acceptance 2 compares on the validation surface's own root `<section>`. */
const VALIDATION_COMPARED = Object.freeze(['display', 'flex-direction']);

/** The two-column header row: a flex row that wraps, at the surface's own gap. */
const VALIDATION_SUMMARY_ROW_COMPARED = Object.freeze([
  'display',
  'flex-wrap',
  'align-items',
  'gap',
]);

/** The summary CARD, which is the thing a GM reads first. */
const VALIDATION_SUMMARY_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'min-width',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'flex-basis',
]);

/** The 52px medallion tile, its shape and the tone its status face gives it. */
const VALIDATION_MEDALLION_COMPARED = Object.freeze([
  'display',
  'align-items',
  'justify-content',
  'width',
  'height',
  'border-radius',
  'font-size',
  'color',
  'background-color',
]);

/** The card's copy column, and the two lines in it. */
const VALIDATION_COPY_COMPARED = Object.freeze(['display', 'flex-direction', 'gap', 'min-width']);
const VALIDATION_TITLE_COMPARED = Object.freeze(['font-family', 'font-size', 'font-weight']);
/** The sub-line, and ONLY its size. */
const VALIDATION_SUB_COMPARED = Object.freeze(['font-size']);

/** The count RAIL and one count row, including the tone the row's own status gives its glyph. */
const VALIDATION_COUNTS_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'gap',
  'margin-top',
  'padding-left',
  'list-style-type',
  'flex-basis',
]);
const VALIDATION_COUNT_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'font-size',
]);
const VALIDATION_COUNT_LABEL_COMPARED = Object.freeze(['flex-grow', 'flex-shrink', 'flex-basis']);
const VALIDATION_COUNT_VALUE_COMPARED = Object.freeze([
  'flex-grow',
  'flex-basis',
  'font-family',
  'font-weight',
  'font-variant-numeric',
]);

/** The GROUPED ROW STACK: the group, its label, the bordered list and one row inside it. */
const VALIDATION_GROUP_COMPARED = Object.freeze(['display', 'flex-direction', 'gap']);
const VALIDATION_GROUP_LABEL_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'margin-top',
  'color',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-transform',
]);
const VALIDATION_ROWS_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'margin-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'list-style-type',
  'overflow-x',
]);
const VALIDATION_ROW_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'padding-top',
  'padding-left',
  // THE FIRST ROW'S border is reset to 0 by `:first-child`.
  'border-top-width',
]);
const VALIDATION_STATUS_COMPARED = Object.freeze([
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'color',
]);
const VALIDATION_ROW_COPY_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'gap',
  'min-width',
  'flex-grow',
]);
const VALIDATION_ROW_TITLE_COMPARED = Object.freeze(['font-weight']);

/** The compared set per control, for the entries that do not take the button families' default. */
/** What this acceptance compares on the radio-card group, probe by probe (issue 1509 phase 3). */
const OPTION_CARDS_ROOT_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'gap',
  'min-width',
  'padding-top',
  'border-top-width',
  'border-radius',
]);

/** The legend the config-cards face hides, which is the group's accessible name. */
const OPTION_CARDS_LEGEND_COMPARED = Object.freeze([
  'position',
  'width',
  'height',
  'overflow',
  'white-space',
  'margin-top',
  'padding-top',
]);

/** The two-column grid the face is named for. */
const OPTION_CARDS_OPTIONS_COMPARED = Object.freeze([
  'display',
  'grid-template-columns',
  'gap',
  'min-width',
]);

/** The card ROW, resting and active, whose border and fill are what a selection reads as. */
const OPTION_CARDS_ROW_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'cursor',
]);

/** The 40x40 glyph plate, compared as the size and edge it DECLARES. */
const OPTION_CARDS_ICON_COMPARED = Object.freeze([
  'order',
  'display',
  'align-items',
  'justify-content',
  'width',
  'height',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'color',
  'font-size',
]);

/** The copy column the tile leads, and the two lines inside it. */
const OPTION_CARDS_BODY_COMPARED = Object.freeze([
  'order',
  'display',
  'flex-direction',
  'gap',
  'flex-grow',
  'min-width',
]);
const OPTION_CARDS_NAME_COMPARED = Object.freeze(['font-size', 'font-weight', 'color']);
const OPTION_CARDS_DESC_COMPARED = Object.freeze([
  'font-size',
  'font-weight',
  'color',
  'line-height',
]);

/** The control the family OWNS, in both states. */
const OPTION_CARDS_RADIO_COMPARED = Object.freeze([
  'appearance',
  '-webkit-appearance',
  'width',
  'height',
  'box-sizing',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'box-shadow',
  'cursor',
  'align-self',
  'margin-top',
  'flex-shrink',
  'font-family',
]);


/** ── THE TWO FAMILIES THAT OWN NO CONTROL AT ALL (issue 1509 phase 4) ──────────────────── */

/** The status card's own box: a centred row of glyph, copy and switch on a toned surface. */
const TOGGLE_CARD_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'min-width',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'background-color',
]);

/** The two other variants: their whole claim is a border tone and a fill. */
const TOGGLE_CARD_VARIANT_COMPARED = Object.freeze([
  'border-top-color',
  'background-color',
  'display',
  'align-items',
]);

/** The glyph column, and its `color` is the state tone the `is-enabled.is-on` rule gives it. */
const TOGGLE_CARD_ICON_COMPARED = Object.freeze([
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'display',
  'align-items',
  'justify-content',
  'width',
  'color',
]);

/**
 * The INFO variant's glyph, which is the one rule in this family that tones a CHILD from a variant
 * class on the parent — `.is-info.is-on .manager-recipe-status-icon` at (0,5,0). One property,
 * because that is the whole of what the rule declares.
 */
const TOGGLE_CARD_INFO_ICON_COMPARED = Object.freeze(['color']);

/** The copy column: the flexible middle of the row. */
const TOGGLE_CARD_COPY_COMPARED = Object.freeze([
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'min-width',
]);

/** The title line. */
const TOGGLE_CARD_TITLE_COMPARED = Object.freeze(['margin-top', 'margin-bottom', 'font-weight']);

/** The sub-line, scoped to what this family owns. */
const TOGGLE_CARD_SUB_COMPARED = Object.freeze(['min-width']);

/** The link field's default face: the three-column linked card on a dashed edge. */
const LINK_FIELD_COMPARED = Object.freeze([
  'display',
  'grid-template-columns',
  'align-items',
  'gap',
  'width',
  'min-height',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'box-sizing',
  'background-color',
]);

/** The compact face: a centred glyph over a title over a note, on a narrower well. */
const LINK_FIELD_COMPACT_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'width',
  'min-height',
  'padding-top',
  'padding-left',
  'border-radius',
  'text-align',
]);

/** The 44px art tile. */
const LINK_FIELD_ICON_COMPARED = Object.freeze([
  'display',
  'align-items',
  'justify-content',
  'width',
  'height',
  'border-radius',
  'overflow-x',
  'background-color',
  'color',
]);

/** And the art inside it, which the family sizes and crops. */
const LINK_FIELD_ART_COMPARED = Object.freeze(['width', 'height', 'object-fit']);

/** The compact face's glyph, which the family re-sizes and re-tones rather than re-boxes. */
const LINK_FIELD_COMPACT_ICON_COMPARED = Object.freeze(['width', 'height', 'font-size', 'color']);

/** The copy column. */
const LINK_FIELD_COPY_COMPARED = Object.freeze(['display', 'row-gap', 'min-width']);

/** And the compact face's, which is a centred flex column rather than a grid. */
const LINK_FIELD_COMPACT_COPY_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'align-items',
  'row-gap',
  'text-align',
]);

/** The name line: the family's whole claim on it is that it truncates. */
const LINK_FIELD_NAME_COMPARED = Object.freeze(['overflow-x', 'text-overflow']);

/** The compact face's name line, which the family also types down. */
const LINK_FIELD_COMPACT_NAME_COMPARED = Object.freeze([
  'font-size',
  'font-weight',
  'line-height',
  'color',
]);

/** The hint line. */
const LINK_FIELD_HINT_COMPARED = Object.freeze([
  'color',
  'font-size',
  'line-height',
  'overflow-x',
  'text-overflow',
]);

/** The compact face's note. */
const LINK_FIELD_COMPACT_HINT_COMPARED = Object.freeze(['font-size', 'line-height', 'color']);

/** The ADDRESS LINE, probed for the opposite reason to every other entry in this table. */
const LINK_FIELD_UUID_COMPARED = Object.freeze(['display', 'font-family', 'font-size']);

/** The action cluster, which is a gap and nothing else — the buttons are `IconButton`'s. */
const LINK_FIELD_ACTIONS_COMPARED = Object.freeze(['display', 'gap']);

/** What acceptance 2 compares on the pill select (issue 1515). */
const PILL_SELECT_ROOT_COMPARED = Object.freeze([
  'display',
  'flex-direction',
  'gap',
  'min-width',
  'font-size',
  'font-weight',
]);

const PILL_SELECT_MENU_COMPARED = Object.freeze([
  'display',
  'align-items',
  'justify-content',
  'gap',
  'width',
  'min-height',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'color',
  'background-color',
  'font-size',
  'font-weight',
]);

const PILL_SELECT_ROW_COMPARED = Object.freeze(['display', 'flex-wrap', 'gap', 'min-width']);

const PILL_SELECT_PILL_COMPARED = Object.freeze([
  'display',
  'align-items',
  'gap',
  'min-height',
  'max-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'color',
  'background-color',
  'font-size',
  'font-weight',
]);

/** The pill's leading glyph, whose whole family contribution is its tone and its centring. */
const PILL_SELECT_GLYPH_COMPARED = Object.freeze(['color', 'text-align']);

/** The label span, whose family contribution is the truncation contract and nothing else. */
const PILL_SELECT_LABEL_COMPARED = Object.freeze([
  'min-width',
  'overflow',
  'text-overflow',
  'white-space',
]);

/** The remove control: a 20x20 borderless circle that keeps its hit box at every density. */
const PILL_SELECT_REMOVE_COMPARED = Object.freeze([
  'display',
  'align-items',
  'justify-content',
  'width',
  'height',
  'padding-top',
  'border-top-width',
  'border-radius',
  'color',
  'background-color',
]);

/** The empty face's placeholder line — the family's own 28px floor and its centring. */
const PILL_SELECT_ANY_COMPARED = Object.freeze(['min-height', 'display', 'align-items']);

const COMPARED_BY_CONTROL = Object.freeze({
  pagination: COMPARED_PAGINATION,
  field: FIELD_COMPARED,
  search: SEARCH_COMPARED,
  toolbar: TOOLBAR_COMPARED,
  card: CARD_COMPARED,
  toggle: TOGGLE_COMPARED,
  'toggle-track': TOGGLE_TRACK_COMPARED,
  'toggle-knob': TOGGLE_KNOB_COMPARED,
  'toggle-label': TOGGLE_LABEL_COMPARED,
  slider: SLIDER_CONTROL_COMPARED,
  'slider-root': SLIDER_ROOT_COMPARED,
  'slider-percent': SLIDER_CONTROL_COMPARED,
  'slider-number': SLIDER_NUMBER_COMPARED,
  'slider-range': SLIDER_RANGE_COMPARED,
  'slider-track': SLIDER_TRACK_COMPARED,
  'slider-fill': SLIDER_FILL_COMPARED,
  tabs: TABS_COMPARED,
  'tabs-active': TABS_BUTTON_COMPARED,
  'tabs-button': TABS_BUTTON_COMPARED,
  validation: VALIDATION_COMPARED,
  'validation-summary-row': VALIDATION_SUMMARY_ROW_COMPARED,
  'validation-summary': VALIDATION_SUMMARY_COMPARED,
  'validation-medallion': VALIDATION_MEDALLION_COMPARED,
  'validation-copy': VALIDATION_COPY_COMPARED,
  'validation-title': VALIDATION_TITLE_COMPARED,
  'validation-sub': VALIDATION_SUB_COMPARED,
  'validation-counts': VALIDATION_COUNTS_COMPARED,
  'validation-count': VALIDATION_COUNT_COMPARED,
  'validation-count-label': VALIDATION_COUNT_LABEL_COMPARED,
  'validation-count-value': VALIDATION_COUNT_VALUE_COMPARED,
  'validation-group': VALIDATION_GROUP_COMPARED,
  'validation-group-label': VALIDATION_GROUP_LABEL_COMPARED,
  'validation-rows': VALIDATION_ROWS_COMPARED,
  'validation-row': VALIDATION_ROW_COMPARED,
  'validation-status': VALIDATION_STATUS_COMPARED,
  'validation-row-copy': VALIDATION_ROW_COPY_COMPARED,
  'validation-row-title': VALIDATION_ROW_TITLE_COMPARED,
  'option-cards': OPTION_CARDS_ROOT_COMPARED,
  'option-cards-legend': OPTION_CARDS_LEGEND_COMPARED,
  'option-cards-options': OPTION_CARDS_OPTIONS_COMPARED,
  'option-cards-row': OPTION_CARDS_ROW_COMPARED,
  'option-cards-row-active': OPTION_CARDS_ROW_COMPARED,
  'option-cards-icon': OPTION_CARDS_ICON_COMPARED,
  'option-cards-body': OPTION_CARDS_BODY_COMPARED,
  'option-cards-name': OPTION_CARDS_NAME_COMPARED,
  'option-cards-desc': OPTION_CARDS_DESC_COMPARED,
  'option-cards-radio': OPTION_CARDS_RADIO_COMPARED,
  'option-cards-radio-checked': OPTION_CARDS_RADIO_COMPARED,
  'toggle-card': TOGGLE_CARD_COMPARED,
  'toggle-card-locked': TOGGLE_CARD_VARIANT_COMPARED,
  'toggle-card-info': TOGGLE_CARD_VARIANT_COMPARED,
  'toggle-card-icon': TOGGLE_CARD_ICON_COMPARED,
  'toggle-card-info-icon': TOGGLE_CARD_INFO_ICON_COMPARED,
  'toggle-card-copy': TOGGLE_CARD_COPY_COMPARED,
  'toggle-card-title': TOGGLE_CARD_TITLE_COMPARED,
  'toggle-card-sub': TOGGLE_CARD_SUB_COMPARED,
  'link-field': LINK_FIELD_COMPARED,
  'link-field-compact': LINK_FIELD_COMPACT_COMPARED,
  'link-field-icon': LINK_FIELD_ICON_COMPARED,
  'link-field-art': LINK_FIELD_ART_COMPARED,
  'link-field-compact-icon': LINK_FIELD_COMPACT_ICON_COMPARED,
  'link-field-copy': LINK_FIELD_COPY_COMPARED,
  'link-field-compact-copy': LINK_FIELD_COMPACT_COPY_COMPARED,
  'link-field-name': LINK_FIELD_NAME_COMPARED,
  'link-field-compact-name': LINK_FIELD_COMPACT_NAME_COMPARED,
  'link-field-uuid': LINK_FIELD_UUID_COMPARED,
  'link-field-hint': LINK_FIELD_HINT_COMPARED,
  'link-field-compact-hint': LINK_FIELD_COMPACT_HINT_COMPARED,
  'link-field-actions': LINK_FIELD_ACTIONS_COMPARED,
  'pill-select': PILL_SELECT_ROOT_COMPARED,
  'pill-select-empty': PILL_SELECT_ROOT_COMPARED,
  'pill-select-menu': PILL_SELECT_MENU_COMPARED,
  'pill-select-row': PILL_SELECT_ROW_COMPARED,
  'pill-select-empty-row': PILL_SELECT_ROW_COMPARED,
  'pill-select-pill': PILL_SELECT_PILL_COMPARED,
  'pill-select-glyph': PILL_SELECT_GLYPH_COMPARED,
  'pill-select-label': PILL_SELECT_LABEL_COMPARED,
  'pill-select-remove': PILL_SELECT_REMOVE_COMPARED,
  'pill-select-any': PILL_SELECT_ANY_COMPARED,
});

/** Every property any control compares, which is what one page load has to collect. */
const ALL_COMPARED = Object.freeze([
  ...new Set([
    ...COMPARED,
    ...Object.values(COMPARED_BY_CONTROL).flat(),
  ]),
]);

/**
 * One page holding all three hosts.
 *
 * @param {string} css The module sheet text to load, unlayered.
 * @returns {string} A complete document.
 */
function document_(css) {
  const hosts = HOSTS.map(
    (host) =>
      `<div class="${host.className}" data-host="${host.id}">` +
      // A NEUTRAL, CLASSLESS SLOT between the host and the control. `.fabricate-manager` is a
      // grid container, so without this its children are grid ITEMS and Chromium computes their
      // `min-height` as `auto` where a block child computes `0px` — a difference produced
      // entirely by the fixture's own nesting and not by any rule in the family. Measured before
      // the slot was added: `pagination` read `auto` in the manager host and `0px` in the other
      // two, which is a false positive of exactly the kind this file exists to report as real.
      `<div>${CONTROLS.map((control) => control.markup(host.id)).join('')}</div>` +
      '</div>'
  ).join('');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    // THE HARNESS DECLARES THE TYPOGRAPHIC CONTEXT EXACTLY ONCE.
    '<style>html, body { margin: 0; padding: 0; }' +
    'body { font-family: "Signika", sans-serif; font-size: 16px; }</style>' +
    `<style id="module-sheet">${css}</style>` +
    `</head><body>${hosts}</body></html>`
  );
}

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/**
 * The compared properties for every control in every host, from one page load.
 *
 * @param {string} css The module sheet text to load.
 * @returns {Promise<Record<string, Record<string, Record<string, string>>>>} control → host → property → value.
 */
async function measure(css) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(document_(css));
    return await tab.evaluate(
      ({ hosts, controls, compared }) => {
        const out = {};
        for (const control of controls) {
          out[control] = {};
          for (const host of hosts) {
            const node = globalThis.document.querySelector(`[data-probe="${host}-${control}"]`);
            if (!node) {
              out[control][host] = null;
              continue;
            }
            const style = globalThis.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            out[control][host] = {
              ...Object.fromEntries(
                compared.map((property) => [property, style.getPropertyValue(property)])
              ),
              // THE RENDERED BORDER BOX, rounded to the pixel. This is the "no frame moves"
              // claim itself rather than a proxy for it, and it is the only comparison that
              // stays meaningful for a control whose box-sizing keyword differs while its
              // laid-out geometry does not.
              'rendered-size': `${Math.round(box.width)}x${Math.round(box.height)}`,
            };
          }
        }
        return out;
      },
      {
        hosts: HOSTS.map((host) => host.id),
        controls: [...CONTROLS.map((control) => control.id), ...EXTRA_PROBES],
        compared: ALL_COMPARED,
      }
    );
  } finally {
    await tab.close();
  }
}

/** Every probe held to the three-host equality, and whether its laid-out BOX is compared too. */
const MEASURED_PROBES = Object.freeze([
  ...CONTROLS.map((control) =>
    Object.freeze({ id: control.id, comparesBox: control.comparesBox !== false })
  ),
  // TWO PROBES OPT OUT, and both for the switch's own reason above.
  ...EXTRA_PROBES.map((id) =>
    Object.freeze({
      id,
      comparesBox:
        !HOST_BOX_DEPENDENT_PROBES.includes(id) &&
        !HOST_LEADING_PROBES.includes(id) &&
        !GLYPH_ONLY_PROBES.includes(id),
    })
  ),
]);

test('each re-rooted control computes the same geometry and type in all three hosts', async () => {
  const measured = await measure(sheet);

  for (const { id: control, comparesBox } of MEASURED_PROBES) {
    for (const { id: host } of HOSTS) {
      assert.ok(measured[control]?.[host], `the ${host} host rendered no ${control} probe`);
    }
    const compared = COMPARED_BY_CONTROL[control] ?? COMPARED;
    for (const property of compared) {
      const values = HOSTS.map((host) => measured[control][host.id][property]);
      // PER-PROPERTY NON-VACUITY. An engine that returned `""` for a property would make the
      // equality below hold over three empty strings, which is the shape of a comparison that
      // cannot fail. Every compared property must have a value on at least one host.
      assert.ok(
        values.some((value) => value !== ''),
        `${control}: every host computed an empty \`${property}\`, so comparing them proves nothing`
      );
      assert.equal(
        new Set(values).size,
        1,
        `${control} computes a different \`${property}\` depending on which application class is ` +
          `above it — ${HOSTS.map((host, index) => `${host.id}=${values[index]}`).join(', ')}. A ` +
          'rule in this family still depends on an application root.'
      );
    }

    // AND THE LAID-OUT BOX AGREES, which is the promise the issue actually makes.
    if (!comparesBox) continue;
    const boxes = HOSTS.map((host) => measured[control][host.id]['rendered-size']);
    assert.ok(
      boxes.every((box) => box !== '0x0'),
      `${control} laid out at 0x0 in every host, so comparing the boxes proves nothing`
    );
    assert.equal(
      new Set(boxes).size,
      1,
      `${control} renders a different border box depending on which application class is above ` +
        `it — ${HOSTS.map((host, index) => `${host.id}=${boxes[index]}`).join(', ')}`
    );
  }
});

test('the pager’s box-sizing keyword differs by host, and nothing in the sheet lets that render', async () => {
  // THE ONE MEASURED RESIDUAL, recorded rather than reconciled away.
  const measured = await measure(sheet);
  const declaresNone =
    'the pager root declares no `box-sizing` of its own and takes it from host chrome; in this ' +
    'core-less harness that means `content-box` outside the manager, and a change here means ' +
    'the family has started declaring one';
  assert.equal(measured.pagination.bare['box-sizing'], 'content-box', declaresNone);
  assert.equal(measured.pagination.app['box-sizing'], 'content-box', declaresNone);
  assert.equal(
    measured.pagination.manager['box-sizing'],
    'border-box',
    'the manager area`s universal rule must still be what supplies the pager root its border-box'
  );

  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(document_(sheet));
    const sized = await tab.evaluate(() => {
      const node = globalThis.document.querySelector('[data-probe="bare-pagination"]');
      const out = [];
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) walk(rule.cssRules);
          if (!rule.selectorText) continue;
          // A sheet this size holds selectors this engine can parse but `matches` rejects.
          const matches = (() => {
            try {
              return node.matches(rule.selectorText);
            } catch {
              return false;
            }
          })();
          if (!matches) continue;
          if (/(?:^|;\s*)(?:width|height)\s*:/.test(rule.style.cssText)) {
            out.push(`${rule.selectorText} :: ${rule.style.cssText}`);
          }
        }
      };
      walk(globalThis.document.querySelector('#module-sheet').sheet.cssRules);
      return out;
    });
    assert.deepEqual(
      sized,
      [],
      'a rule now gives the pager root an explicit width or height outside the manager, which is ' +
        'the condition that turns its host-supplied `box-sizing` into a different rendered box. ' +
        'That is invisible in Foundry, where core`s `@layer reset` universal rule gives every ' +
        'host `border-box`, and visible in any host without it — including this harness. Give ' +
        '`.fabricate-pagination.manager-pagination` its own `box-sizing: border-box` and add the ' +
        'property back to `COMPARED_PAGINATION`.'
    );
  } finally {
    await tab.close();
  }
});

test('the values the comparison holds over are the ones the family declares, not defaults', async () => {
  const measured = await measure(sheet);
  const bare = (control) => measured[control].bare;

  // The four properties acceptance 2 says DO resolve.
  assert.equal(bare('manager-button')['box-sizing'], 'border-box');
  // 9px, not the shared base block's 6: the probe carries `fab-manager-button`.
  assert.equal(bare('manager-button')['border-radius'], '9px');
  assert.equal(bare('manager-button')['min-height'], '34px');
  assert.equal(bare('icon-button')['box-sizing'], 'border-box');
  assert.equal(bare('icon-button')['border-radius'], '6px');

  // `line-height: 1` — the declaration the `font: inherit` baseline would delete wherever it
  // outranked the block that declares it. Chromium reports a NUMERIC line-height as its used px
  // value, so "is it 1" is asked as "does it equal the font size", which is what `1` means and is
  // engine-independent.
  for (const control of ['manager-button', 'icon-button']) {
    const style = bare(control);
    assert.ok(
      Number.parseFloat(style['font-size']) > 0,
      `${control} computed no font-size, so the line-height ratio below proves nothing`
    );
    assert.equal(
      Number.parseFloat(style['line-height']),
      Number.parseFloat(style['font-size']),
      `${control} must compute line-height 1; \`font: inherit\` is a shorthand that resets ` +
        'line-height along with the rest — to the inherited value — and the `line-height: 1` declaration is MORE SPECIFIC, so that block is what resolves'
    );
  }

  // AND `font: inherit` REACHED, read on `font-family` alone. The harness declares the body font
  // once and nothing below it, so a button that inherits carries the body's FAMILY; one that does
  // not carries the UA's default button font, which in Chromium is Arial. This is the single
  // computed observation that proves the family no longer depends on
  // `.fabricate-manager button, … { font: inherit }` (`fabricate.css:1088-1093`) to get there.
  for (const control of ['manager-button', 'icon-button']) {
    assert.match(
      bare(control)['font-family'],
      /Signika/,
      `${control} in a bare host does not inherit the ambient font family, so the family's own ` +
        '`font: inherit` is not reaching it'
    );
  }
});

/**
 * Every rule in the sheet, as parsed by the browser, flattened out of any layer or media block.
 *
 * @param {import('playwright').Page} tab An open page holding the module sheet.
 * @returns {Promise<Array<{selectorText: string, cssText: string, properties: string[]}>>} The rules.
 */
function readRules(tab) {
  return tab.evaluate(() => {
    const out = [];
    // THE AT-CONTEXT IS CARRIED (issue 1508) because two rules in this sheet share the prelude
    // `.fabricate-manager select` — the (0,1,1) select baseline at the top level, and the one
    // inside `@supports (appearance: base-select)` that restates `line-height: 1`. The floor's
    // position clause below is about the SECOND of those, and a filter on `selectorText` alone
    // cannot tell them apart.
    const walk = (rules, at) => {
      for (const rule of rules) {
        const nested = rule.conditionText ? [...at, rule.conditionText] : at;
        if (rule.cssRules) walk(rule.cssRules, nested);
        if (!rule.selectorText) continue;
        out.push({
          selectorText: rule.selectorText,
          at: at.join(' >> '),
          cssText: rule.style.cssText,
          properties: [...rule.style],
        });
      }
    };
    walk(globalThis.document.querySelector('#module-sheet').sheet.cssRules, []);
    return out;
  });
}

test('the `font: inherit` rule is above the `line-height: 1` rule, and the latter is more specific', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    // Both rules by their exact preludes.
    const floorIndex = rules.findIndex((rule) => rule.selectorText === FLOOR_RULE_SELECTOR);
    const floors = rules.filter((rule) => rule.selectorText === FLOOR_RULE_SELECTOR);
    assert.equal(
      floors.length,
      1,
      `\`${FLOOR_RULE_SELECTOR}\` must be declared exactly once; found ${floors.length}. It is ` +
        "the family's bare-element type baseline and the only rule that carries `font: inherit`."
    );
    const baseIndex = rules.findIndex((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    const base = rules.filter((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    assert.equal(
      base.length,
      1,
      `\`${BASE_RULE_SELECTOR}\` must be declared exactly once; found ${base.length}. It is the ` +
        "family's shared control contract and the rule that declares `line-height: 1`."
    );

    // THE DECLARED VALUE IS `inherit`.
    assert.match(
      floors[0].cssText,
      /font(?:-family)?:\s*inherit/,
      'the family baseline must declare `font: inherit`, which is what frees the family from the ' +
        `manager's bare-element baseline; declared: ${floors[0].cssText}`
    );
    assert.ok(
      base[0].properties.includes('line-height'),
      'the shared base rule must still declare the `line-height: 1` that the `font` shorthand ' +
        `above it would otherwise reset; declared: ${base[0].properties.join(', ')}`
    );

    // ORDER. The baseline is written ABOVE the block that declares `line-height: 1`. Order alone
    // does not decide this pair — the specificity below does — but the two together are what make
    // the resolution independent of any engine's shorthand expansion, and a baseline that drifted
    // BELOW the base block would be decided by order alone if the two ever tied again.
    assert.ok(
      floorIndex !== -1 && baseIndex !== -1,
      `neither rule index resolved: floor=${floorIndex}, base=${baseIndex}`
    );
    assert.ok(
      floorIndex < baseIndex,
      'the `font: inherit` baseline must be declared ABOVE the block that declares ' +
        `\`line-height: 1\`; found floor at ${floorIndex} and base at ${baseIndex}`
    );

    // AND SPECIFICITY, which is the half that actually decides it and the half issue 1502's r2
    // pass got wrong. The baseline is rooted at the family root ALONE at (0,1,0); the base block
    // chains a per-app class onto it at (0,2,0). That gap is the FLOOR: it is why the base
    // block's `line-height: 1` survives the shorthand, and — the same fact, measured on real
    // controls in the test below — why a caller's own per-site `font-size` at (0,2,0) still
    // beats the baseline instead of being silently deleted by it.
    assert.equal(
      specificity(FLOOR_RULE_SELECTOR),
      '0,1,0',
      'the family baseline must be rooted at the family root ALONE. At the base block`s own ' +
        '(0,2,0) it TIES every caller per-site rule and wins on source order against each one ' +
        'declared earlier in the sheet, which is the regression this rooting exists to prevent'
    );
    assert.equal(
      specificity(BASE_RULE_SELECTOR),
      '0,2,0',
      'the shared base block must stay the more specific of the two, or its `line-height: 1` is ' +
        'no longer what resolves'
    );

    // AND THE BASELINE HAS NOT CRAWLED BACK ONTO THE BASE BLOCK. This is the regression itself,
    // stated as its own assertion so a re-added `font: inherit` there reds by name rather than
    // as a font-size number in some other file.
    assert.ok(
      base[0].properties.every((property) => !property.startsWith('font')),
      'the shared base block must declare no `font` longhand at all: the baseline belongs on the ' +
        `family root alone, at (0,1,0). Declared: ${base[0].properties.join(', ')}`
    );
  } finally {
    await tab.close();
  }
});

/* WHAT THE FLOOR IS FOR, MEASURED ON THE TWO CONTROLS THAT PROVED IT MATTERS. */
const CALLER_SIZED = Object.freeze([
  Object.freeze({
    id: 'recipe-lock',
    passThrough: 'manager-recipe-lock',
    markup:
      '<button type="button" class="fabricate-icon-button manager-icon-button manager-recipe-lock" data-probe="caller-recipe-lock" aria-label="Lock"><i class="fas fa-lock"></i></button>',
  }),
  Object.freeze({
    id: 'recipe-edit',
    passThrough: 'manager-recipe-edit',
    markup:
      '<button type="button" class="fabricate-icon-button manager-icon-button manager-recipe-edit" data-probe="caller-recipe-edit" aria-label="Edit"><i class="fas fa-pen"></i></button>',
  }),
]);

/** The compact scale those two rules declare, read out of the sheet rather than restated. */
const CALLER_FONT_SIZE = '0.68rem';

/**
 * The two caller-sized controls in the manager host, plus a bare-host icon button beside them.
 *
 * @param {string} css The module sheet text to load.
 * @returns {Promise<Record<string, {fontSize: string, lineHeight: string, fontFamily: string, box: string}>>} probe → measurement.
 */
async function measureCallerSized(css) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html, body { margin: 0; padding: 0; }' +
        'body { font-family: "Signika", sans-serif; font-size: 14px; }</style>' +
        `<style id="module-sheet">${css}</style></head><body>` +
        `<div class="fabricate fabricate-manager"><div>${CALLER_SIZED.map((one) => one.markup).join('')}</div></div>` +
        '<div><div><button type="button" class="fabricate-icon-button manager-icon-button" data-probe="caller-bare-icon" aria-label="Delete"><i class="fas fa-trash"></i></button></div></div>' +
        '</body></html>'
    );
    return await tab.evaluate(() => {
      const out = {};
      for (const node of globalThis.document.querySelectorAll('[data-probe]')) {
        const style = globalThis.getComputedStyle(node);
        const box = node.getBoundingClientRect();
        out[node.dataset.probe] = {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontFamily: style.fontFamily,
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      }
      return out;
    });
  } finally {
    await tab.close();
  }
}

test('a caller`s per-site font rule still beats the family`s baseline', async () => {
  // NON-VACUITY, BOTH WAYS. The rules must still declare the compact scale.
  const recipesBrowserSource = read('src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
  const declaredSize = CALLER_FONT_SIZE.replaceAll('.', String.raw`\.`);
  for (const { id, passThrough } of CALLER_SIZED) {
    assert.match(
      sheet,
      new RegExp(
        String.raw`\.fabricate-manager \.${passThrough} \{[^}]*font-size: ${declaredSize}`
      ),
      `\`.fabricate-manager .${passThrough}\` must still declare \`font-size: ${CALLER_FONT_SIZE}\`, ` +
        `or the ${id} measurement below holds over a value nothing states`
    );
    assert.match(
      recipesBrowserSource,
      new RegExp(String.raw`${passThrough}(?![\w-])`),
      `RecipesBrowserView must still pass \`${passThrough}\` through to IconButton, or this ` +
        'probe measures markup the product no longer renders'
    );
  }

  const measured = await measureCallerSized(sheet);
  // 0.68rem against the ROOT font size.
  const expected = `${Number.parseFloat(CALLER_FONT_SIZE) * 16}px`;
  for (const { id } of CALLER_SIZED) {
    const probe = measured[`caller-${id}`];
    assert.ok(probe, `the manager host rendered no ${id} probe`);
    assert.equal(
      probe.fontSize,
      expected,
      `\`.manager-${id}\` must compute the ${CALLER_FONT_SIZE} its own rule declares. A ` +
        '`font: inherit` on the family`s (0,2,0) shared base block ties that rule and wins on ' +
        'source order, which renders this glyph 28.7% larger in the recipe row'
    );
    assert.equal(
      probe.lineHeight,
      expected,
      `\`.manager-${id}\` must keep line-height 1 against its own font size`
    );
  }

  // AND THE FLOOR STILL REACHES A HOST THAT DECLARES NOTHING.
  assert.equal(measured['caller-bare-icon'].fontSize, '14px');
  assert.match(
    measured['caller-bare-icon'].fontFamily,
    /Signika/,
    'a bare-host icon button must still inherit the ambient font, or the baseline is not a floor ' +
      'but simply gone'
  );
});

/* THE SECOND NEGATIVE CONTROL, ON THE FLOOR ITSELF. */
const FLOOR_RULE_PRELUDE = '.fabricate-button,\n.fabricate-icon-button {\n  font: inherit;\n}';
const RE_FAMILY_ROOTED_FLOOR =
  '.fabricate-button.manager-button,\n.fabricate-icon-button.manager-icon-button {\n  font: inherit;\n}';

test('the caller-override measurement reds when the baseline is written at the family`s own (0,2,0)', async () => {
  assert.equal(
    sheet.split(FLOOR_RULE_PRELUDE).length - 1,
    1,
    'the family baseline is not spelled as this control expects, so the control below would ' +
      'perturb nothing and pass. Re-derive the prelude from `styles/fabricate.css`.'
  );
  const perturbed = sheet.replace(FLOOR_RULE_PRELUDE, RE_FAMILY_ROOTED_FLOOR);
  assert.notEqual(
    perturbed,
    sheet,
    'the substitution must apply before the run below means anything'
  );

  const measured = await measureCallerSized(perturbed);
  const expected = `${Number.parseFloat(CALLER_FONT_SIZE) * 16}px`;
  const kept = CALLER_SIZED.filter(({ id }) => measured[`caller-${id}`].fontSize === expected);
  assert.deepEqual(
    kept.map(({ id }) => id),
    [],
    'writing the baseline at the family`s own (0,2,0) left the caller-sized controls at ' +
      `${expected}, so the measurement above is not actually testing the rooting`
  );
  // AND THE PERTURBATION IS THE REGRESSION, not merely A change: they take the ambient instead.
  for (const { id } of CALLER_SIZED) {
    assert.equal(measured[`caller-${id}`].fontSize, '14px');
  }
});

test('each re-rooted family declares its own focus ring, and none of them reaches a select', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);

    // `getComputedStyle` returns `''` for `outline` in a non-focused element and cannot be asked
    // "which rule said so" at all, so the ring is read as a DECLARED rule — the same route
    // `import-folder-mapping-modal-focus.test.js` takes for the same reason.
    for (const [strip, repaint] of [
      ['.fabricate-button:focus', '.fabricate-button:focus-visible'],
      ['.fabricate-icon-button:focus', '.fabricate-icon-button:focus-visible'],
      ['.fabricate-pagination button:focus', '.fabricate-pagination button:focus-visible'],
      [
        '.fabricate-field :is(input, textarea):focus',
        '.fabricate-field input:focus-visible, .fabricate-field textarea:focus-visible',
      ],
      ['.fabricate-search input:focus', '.fabricate-search input:focus-visible'],
      ['.fabricate-slider input:focus', '.fabricate-slider input:focus-visible'],
      // THE TAB STRIP'S PAIR (issue 1509).
      ['.fabricate-tabs button:focus', '.fabricate-tabs button:focus-visible'],
      // THE TOGGLE'S TWO PAIRS. The first is the one this change CONVERTED rather than added.
      [
        '.fabricate-toggle.manager-status-toggle:focus',
        '.fabricate-toggle.manager-status-toggle:focus-visible',
      ],
      [
        '.fabricate-toggle .manager-tool-setting-toggle-input:focus',
        '.fabricate-toggle.manager-tool-setting-toggle:has(.manager-tool-setting-toggle-input:focus-visible)',
      ],
    ]) {
      const ring = rules.filter((rule) => rule.selectorText === repaint);
      assert.equal(ring.length, 1, `${repaint} must be declared exactly once`);
      assert.match(
        ring[0].cssText,
        /outline:\s*2px solid var\(--fab-accent\)/,
        `${repaint} must carry the same outline the module ring declares`
      );
      assert.match(
        ring[0].cssText,
        /outline-offset:\s*2px/,
        `${repaint} must carry the module ring's outline offset`
      );

      const reset = rules.filter((rule) => rule.selectorText === strip);
      assert.equal(
        reset.length,
        1,
        `${strip} must be declared exactly once: without the strip half, a control in a host ` +
          "carrying no Fabricate root keeps Foundry core's orange focus outline and 4px glow " +
          'under the accent ring instead of having it replaced'
      );
      assert.match(
        reset[0].cssText,
        /outline:\s*none/,
        `${strip} must strip core's focus outline, as the module reset does`
      );
      assert.match(
        reset[0].cssText,
        /box-shadow:\s*none/,
        `${strip} must strip core's 4px focus glow, which is a box-shadow rather than an outline`
      );
      assert.ok(
        rules.findIndex((rule) => rule.selectorText === strip) <
          rules.findIndex((rule) => rule.selectorText === repaint),
        `${strip} and ${repaint} tie on specificity, so the strip must be declared above the ` +
          'repaint or source order deletes the accent ring it exists to supply'
      );
    }

    // NO RE-ROOTED FAMILY REACHES A FOCUSED `select`, and this is now the whole of that claim.
    const roots = [
      'fabricate-button',
      'fabricate-icon-button',
      'fabricate-pagination',
      'fabricate-field',
      'fabricate-search',
      'fabricate-slider',
      'fabricate-toggle',
      'fabricate-tabs',
    ];
    const selectReach = rules
      .filter((rule) => roots.some((root) => rule.selectorText.includes(`.${root}`)))
      .filter((rule) =>
        rule.selectorText
          .split(',')
          .some((one) => /(?:^|[\s>+~])select(?![\w-])/.test(one.trim()) && /:focus/.test(one))
      );
    assert.deepEqual(
      selectReach.map((rule) => rule.selectorText),
      [],
      'a rule rooted at one of the eight namespace classes reaches a focused `select`. That is ' +
        'element chrome the module ring already writes, at the same rank, so which one paints ' +
        'would be decided by source order — and the manager still renders the selects it would ' +
        'be decided over'
    );
  } finally {
    await tab.close();
  }
});

/* ── THE ISSUE-1508 FAMILIES: WHAT THEY DECLARE. */

/** The two new families' own controls, in a bare host, at the values their own rules declare. */
test('the issue-1508 families declare their own control chrome rather than inheriting it', async () => {
  const measured = await measure(sheet);
  const field = measured.field.bare;
  const search = measured.search.bare;

  // NON-VACUITY FIRST: an engine returning `''` would satisfy every equality below.
  for (const [label, style, properties] of [
    ['field', field, FIELD_COMPARED],
    ['search', search, SEARCH_COMPARED],
  ]) {
    for (const property of properties) {
      assert.ok(
        style[property] !== undefined,
        `${label} computed nothing at all for \`${property}\`, so the pins below prove nothing`
      );
    }
  }

  // FIELD. `min-height: 34px` and `appearance: none` come from the family's element-typed chrome
  // rule — the one that restates the area baseline's predicate leg for leg — and `height: 36px`,
  // the 6px corner, the border and the fill from the family's own re-rooted control block. All
  // six are values the manager used to supply and the family now declares for itself.
  assert.equal(field['min-height'], '34px');
  assert.equal(field.appearance, 'none');
  assert.equal(field['-webkit-appearance'], 'none');
  assert.equal(field.height, '36px');
  assert.equal(field['border-radius'], '6px');
  assert.equal(field['border-top-width'], '1px');
  assert.equal(field['border-top-style'], 'solid');
  assert.match(
    field['font-family'],
    /Signika/,
    'a bare-host field input must inherit the ambient font family, or the family`s own `font: ' +
      'inherit` floor is not reaching it'
  );

  // SEARCH. No `min-height` and no `appearance`.
  assert.equal(search.height, '34px');
  assert.equal(search['border-radius'], '6px');
  assert.equal(search['padding-left'], '34px');
  assert.equal(search['padding-right'], '34px');
  assert.equal(search['border-top-width'], '1px');
  assert.match(search['font-family'], /Signika/);
});

/** The switch and the slider's two halves, in a bare host, at the values their own rules declare. */
test('the toggle and the slider declare their own control chrome rather than inheriting it', async () => {
  const measured = await measure(sheet);
  const bare = (probe) => measured[probe].bare;

  // NON-VACUITY FIRST, the clause above's own guard.
  for (const probe of ['toggle', 'toggle-track', 'toggle-knob', 'slider-number', 'slider-range']) {
    for (const property of COMPARED_BY_CONTROL[probe]) {
      assert.ok(
        bare(probe)[property] !== undefined,
        `${probe} computed nothing at all for \`${property}\`, so the pins below prove nothing`
      );
    }
  }

  // THE SWITCH. `max-width: 78px`, `height: 24px`.
  const toggle = bare('toggle');
  assert.equal(toggle['max-width'], '78px');
  assert.equal(toggle.height, '24px');
  assert.equal(toggle['border-radius'], '999px');
  assert.equal(toggle['border-top-width'], '0px', 'the switch declares `border: 0` on the BUTTON');
  assert.equal(toggle.display, 'inline-flex');
  assert.match(
    toggle['font-family'],
    /Signika/,
    'a bare-host switch must inherit the ambient font family, or its own (0,1,0) `font: inherit` ' +
      'floor is not reaching it'
  );

  // AND `width: auto` IS READ AS A DECLARATION.
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    const base = rules.filter(
      (rule) => rule.selectorText === '.fabricate-toggle.manager-status-toggle'
    );
    assert.equal(base.length, 1, 'the switch`s base rule must be declared exactly once');
    assert.match(base[0].cssText, /width:\s*auto/, 'the switch sizes to its content, not its cell');
    assert.match(base[0].cssText, /max-width:\s*78px/);

    // THE TOGGLE'S FLOOR IS AT THE FAMILY ROOT ALONE.
    const floor = rules.filter((rule) => rule.selectorText === TOGGLE_FONT_FLOOR_SELECTOR);
    assert.equal(floor.length, 1, 'the switch`s font floor must be declared exactly once');
    assert.deepEqual(
      specificityOf(TOGGLE_FONT_FLOOR_SELECTOR),
      [0, 1, 0],
      'the switch`s root IS its control, so its floor is written at that root ALONE — the shape ' +
        'the two button families take, and the reason its position in the sheet is free'
    );
    assert.match(
      floor[0].cssText,
      /font(?:-family)?:\s*inherit/,
      `the switch's floor must declare \`font: inherit\`; declared: ${floor[0].cssText}`
    );
    // AND NOTHING ELSE, read as the `font` SHORTHAND'S OWN LONGHANDS.
    assert.deepEqual(
      floor[0].properties.filter(
        (property) => !property.startsWith('font') && property !== 'line-height'
      ),
      [],
      'the switch`s floor must declare `font: inherit` and nothing else, for the (0,1,1) group`s ' +
        `own reason. Declared: ${floor[0].properties.join(', ')}`
    );
    assert.ok(
      !FAMILY_FONT_FLOOR_MEMBERS.includes(TOGGLE_FONT_FLOOR_SELECTOR),
      'the switch`s floor must stay out of the (0,1,1) group: that group is positioned where it ' +
        'is because its members TIE the area baseline, and this one does not'
    );
  } finally {
    await tab.close();
  }

  // THE SLIDER'S TWO CONTROLS. The number half declares its own 28px box, 6px corner.
  const number = bare('slider-number');
  assert.equal(number.height, '28px');
  assert.equal(number['border-radius'], '6px');
  assert.equal(number['border-top-width'], '1px');
  assert.equal(number['text-align'], 'center');
  assert.match(number['font-family'], /Signika/);

  const range = bare('slider-range');
  assert.equal(range.appearance, 'none');
  assert.equal(range['-webkit-appearance'], 'none');
  assert.equal(range.height, '28px');
  assert.match(
    range['font-family'],
    /Signika/,
    'the family`s floor is `.fabricate-slider input`, which names the ELEMENT rather than a type, ' +
      'so it must reach the range half as well as the number half'
  );

  // AND THE RAIL AND KNOB GEOMETRY the two families are recognisable by.
  assert.equal(bare('toggle-track').width, '34px');
  assert.equal(bare('toggle-track').height, '20px');
  assert.equal(bare('toggle-knob').width, '14px');
  assert.equal(bare('toggle-knob').height, '14px');
  assert.equal(bare('slider-track').height, '6px');
});

test('the issue-1508 controls depend on host chrome for box-sizing, and nothing lets that render', async () => {
  // THE OPT-OUT FROM THE BOX COMPARISON, STATED AS ITS OWN MEASUREMENT.
  const measured = await measure(sheet);
  assert.equal(
    measured.field.bare['box-sizing'],
    'content-box',
    'the field control declares no `box-sizing` of its own and takes it from host chrome; a ' +
      'change here means the family has started declaring one, and `comparesBox` should go with it'
  );
  assert.equal(
    measured.field.manager['box-sizing'],
    'border-box',
    'the manager area`s universal rule must still be what supplies the field control its border-box'
  );
  for (const host of HOSTS) {
    assert.equal(
      measured.search[host.id]['box-sizing'],
      'border-box',
      'a `type="search"` input takes `border-box` from the UA sheet in EVERY host, which is why ' +
        'this control compares its rendered box while the field does not'
    );
  }

  // THE BAR AND THE CARD TAKE THE SAME DEPENDENCE and are NOT opted out of the box comparison,
  // which is the pager's case rather than the field's: both are block `<section>`s with `width:
  for (const control of ['toolbar', 'card']) {
    assert.equal(
      measured[control].bare['box-sizing'],
      'content-box',
      `the ${control} declares no \`box-sizing\` of its own and takes it from host chrome; a ` +
        'change here means the family has started declaring one'
    );
    assert.equal(
      measured[control].manager['box-sizing'],
      'border-box',
      `the manager area's universal rule must still be what supplies the ${control} its border-box`
    );
  }

  // THE TWO BORDERED RAILS, which are the field's case rather than the pager's.
  for (const probe of BORDERED_TRACK_PROBES) {
    assert.equal(
      measured[probe].bare['box-sizing'],
      'content-box',
      `the ${probe} rail declares no \`box-sizing\` of its own and takes it from host chrome; a ` +
        'change here means the family has started declaring one and `comparesBox` should go with it'
    );
    assert.equal(
      measured[probe].manager['box-sizing'],
      'border-box',
      `the manager area's universal rule must still be what supplies the ${probe} rail its border-box`
    );
    assert.equal(
      measured[probe].bare['border-top-width'],
      '1px',
      `the ${probe} rail must still declare the 1px border that is why its border box differs by ` +
        'host at all; without it the opt-out above would be hiding a real move'
    );
  }

  // AND THE SLIDER'S NUMBER INPUT DOES DECLARE ONE, in its own rule.
  // out and its box is compared in every host.
  for (const host of HOSTS) {
    assert.equal(
      measured['slider-number'][host.id]['box-sizing'],
      'border-box',
      'the slider`s number input declares `box-sizing: border-box` in the family`s own rule, so ' +
        'its box is comparable in every host and is compared'
    );
  }

  // THE FILL FILLS ITS RAIL, IN EVERY HOST. Its `height: 100%` and percentage `width` resolve
  // against the rail's CONTENT box, so their values follow the keyword — but the relationship does
  // not, and the relationship is the whole of what the family declares. Asserted as the fill's
  // rendered box against the rail's own content box, which is the rail's border box less its two
  // borders, so a fill that stopped filling reds here whichever keyword is in force.
  for (const host of HOSTS) {
    const railBox = measured['slider-track'][host.id]['rendered-size'].split('x').map(Number);
    const fillBox = measured['slider-fill'][host.id]['rendered-size'].split('x').map(Number);
    const border = Number.parseFloat(measured['slider-track'][host.id]['border-top-width']);
    assert.equal(
      fillBox[1],
      railBox[1] - 2 * border,
      `the slider fill must be the full height of its rail's content box in the ${host.id} host`
    );
    assert.ok(
      Math.abs(fillBox[0] / (railBox[0] - 2 * border) - 0.4) <= 0.01,
      `the slider fill must be 40 per cent of its rail's content width in the ${host.id} host, ` +
        `which is what \`--fab-drop-rate-value\` sets; measured ${fillBox[0]} of ${railBox[0]}`
    );
  }
});

/*
 * ── THE TWO FAMILIES THAT OWN NO CONTROL (issue 1508, phase 2) ──────────────────────────────
 * `ManagerToolbar` and `InspectorCard` are the first re-rooted families whose root is not a
 * control and does not CONTAIN one of their own: the bar renders `{@render children?.()}` and the
 * card renders its caller's children. So they declare no font floor and no focus pair, and the
 * two clauses below are the two halves of that decision.
 */

test('the filter bar and the card declare their own box rather than inheriting it', async () => {
  const measured = await measure(sheet);
  const toolbar = measured.toolbar.bare;
  const card = measured.card.bare;

  // NON-VACUITY FIRST, as everywhere else in this file.
  for (const [label, style, properties] of [
    ['toolbar', toolbar, TOOLBAR_COMPARED],
    ['card', card, CARD_COMPARED],
  ]) {
    for (const property of properties) {
      assert.ok(
        style[property] !== undefined && style[property] !== '',
        `${label} computed nothing at all for \`${property}\`, so the pins below prove nothing`
      );
    }
  }

  // THE BAR. `--fab-space-3` padding, the hairline bottom rule.
  assert.equal(toolbar['padding-top'], '12px');
  assert.equal(toolbar['padding-left'], '12px');
  assert.equal(toolbar['border-bottom-width'], '1px');
  assert.equal(toolbar['border-bottom-style'], 'solid');
  assert.equal(toolbar.display, 'flex');
  assert.equal(toolbar['flex-wrap'], 'wrap');
  assert.equal(toolbar['align-items'], 'center');
  assert.equal(toolbar.gap, '8px');
  assert.notEqual(
    toolbar['background-color'],
    'rgba(0, 0, 0, 0)',
    'the bar declares its own translucent fill; a transparent one means the rule stopped matching'
  );

  // AND THE BRANCH THAT PAINTS IT IS THE FLEX ONE. `display: grid` is what
  // `.fabricate-filter-bar.manager-toolbar` states on its own; the `:not(:has(…))` branch
  // overrides it to `flex`, and no component under `src/` writes `manager-toolbar-primary`, so
  // that branch is ALWAYS taken. Measuring `flex` here is what says the branch re-rooted too —
  // leaving it behind would give a bare-host bar the grid form nothing ships.
  assert.equal(
    toolbar.display,
    'flex',
    'the always-taken `:not(:has(.manager-toolbar-primary))` branch must travel with the family, ' +
      'or a bar outside the manager renders the grid form no screen in the product uses'
  );

  // THE CARD. Padding, a hairline border on all four edges, the 8px corner.
  assert.equal(card['padding-top'], '12px');
  assert.equal(card['border-top-width'], '1px');
  assert.equal(card['border-top-style'], 'solid');
  assert.equal(card['border-radius'], '8px');
  assert.equal(card.display, 'flex');
  assert.equal(card['flex-direction'], 'column');
  assert.equal(card.gap, '8px');
  assert.notEqual(
    card['background-color'],
    'rgba(0, 0, 0, 0)',
    'the card declares its own surface fill; a transparent one means the rule stopped matching'
  );

  // AND NEITHER IS TYPED BY ITS FAMILY. Both inherit the harness's ambient font.
  for (const [label, style] of [['toolbar', toolbar], ['card', card]]) {
    assert.match(
      style['font-family'],
      /Signika/,
      `${label} must INHERIT its type: neither family owns a control, so neither declares a floor`
    );
  }
});

test('neither the filter bar nor the card declares a font floor or a focus pair', async () => {
  // THE NEGATIVE CONTROL FOR A POSITIVE DECISION. `openspec/specs/design-system/spec.md` forbids
  // a primitive displacing an area's chrome for a control it does not own — the clause the
  // pager's `<select>` established. These two families own no control at all, so the honest
  // shape of "they declare neither" is an assertion that no rule rooted at either names a focus
  // state or carries type. Without it, a later change adding a floor "for consistency with the
  // other four" would pass every other gate in this repository.
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    for (const root of ['.fabricate-filter-bar', '.fabricate-card']) {
      const named = new RegExp(`\\${root}(?![\\w-])`);
      const family = rules.filter((rule) => named.test(rule.selectorText));
      assert.ok(
        family.length >= 3,
        `only ${family.length} rules are rooted at \`${root}\`, so the absences below hold over ` +
          'nothing. The family has been renamed or the re-root has been undone.'
      );

      const focused = family.filter((rule) => /:focus/.test(rule.selectorText));
      assert.deepEqual(
        focused.map((rule) => rule.selectorText),
        [],
        `\`${root}\` declares a focus rule. This family owns no control of its own, so a strip ` +
          'or a repaint here paints chrome for a control the caller owns — which is what the ' +
          'design-system requirement forbids. The four families that DO own a control declare ' +
          'the pair; these two must not.'
      );

      const typed = family.filter((rule) =>
        rule.properties.some(
          (property) => property.startsWith('font') || property === 'line-height'
        )
      );
      assert.deepEqual(
        typed.map((rule) => `${rule.selectorText} :: ${rule.cssText}`),
        [],
        `\`${root}\` declares type. Neither of these families owns a control, so neither gets a ` +
          'font floor: every control in the bar is the CALLER\'s, and flooring one here is the ' +
          'displacement the requirement refuses.'
      );

      // AND NO FAMILY RULE REACHES A CONTROL. A height or a corner written here for a caller's
      // control is the same displacement as a font floor; a caller lifts its own control in a
      // rule keyed on its own bar.
      const reaching = family.filter((rule) =>
        rule.selectorText
          .split(',')
          .map((selector) => selector.split(named).slice(1).join(''))
          .some((tail) => /(?:^|[\s>+~(])(?:select|input|button|textarea)(?![\w-])/.test(tail))
      );
      assert.deepEqual(
        reaching.map((rule) => rule.selectorText),
        [],
        `\`${root}\` declares a rule that reaches a control the CALLER renders. This family owns ` +
          'no control, so a rung or a skin for one belongs to the caller’s own bar rule.'
      );
    }

    // AND THE FAMILY RULES THE THREE-HOST COMPARISON DOES NOT COVER, EXCLUDED BY COUNT.
    for (const [root, expected] of [
      ['.fabricate-filter-bar', 1],
      ['.fabricate-search', 2],
    ]) {
      const named = new RegExp(`\\${root}(?![\\w-])`);
      const containerScoped = rules.filter(
        (rule) => named.test(rule.selectorText) && rule.at !== ''
      );
      assert.equal(
        containerScoped.length,
        expected,
        `expected exactly ${expected} container-scoped \`${root}\` rule(s), found ` +
          `${containerScoped.length}: ` +
          containerScoped.map((rule) => `${rule.at} :: ${rule.selectorText}`).join(', ')
      );
      for (const rule of containerScoped) {
        assert.match(
          rule.at,
          /fabricate-manager/,
          `an excluded \`${root}\` rule must be inside the \`fabricate-manager\` container ` +
            'query; a rule under any other condition is not covered by this exclusion and needs ' +
            `its own reason — ${rule.at} :: ${rule.selectorText}`
        );
      }
    }
    assert.match(
      sheet,
      /container-name: fabricate-manager;/,
      'the container NAME must still be established by `.fabricate-manager` itself, which is the ' +
        'whole reason those rules cannot travel to a bare host'
    );
  } finally {
    await tab.close();
  }
});

/** The elements a widened floor would have reached. */
const NEGATIVE_CONTROLS =
  '<fieldset class="fabricate-field manager-field fabricate-option-cards" data-probe="neg-root">' +
  '<label class="manager-resolution-option"><input type="radio" data-probe="neg-radio"></label>' +
  '<label><input type="checkbox" data-probe="neg-checkbox"></label>' +
  '<span class="fabricate-slider manager-chance-slider"><span class="manager-drop-rate-control"><input type="range" data-probe="neg-range"></span></span>' +
  '<span class="fab-stepper"><input type="number" class="fab-stepper-input" data-probe="neg-stepper"></span>' +
  '<select data-probe="neg-select"><option>A</option></select>' +
  '<textarea data-probe="neg-textarea"></textarea>' +
  '</fieldset>' +
  // OUTSIDE THE FIELDSET, because a switch is not a field's control and nesting it inside one
  // would make the comparison below answer a question about `Field` rather than about the toggle.
  '<button type="button" class="fabricate-toggle manager-status-toggle" data-probe="neg-toggle"><span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span></button>' +
  '<label class="fabricate-toggle manager-tool-setting-toggle" data-probe="neg-toggle-host"><input type="checkbox" class="manager-tool-setting-toggle-input" data-probe="neg-toggle-input"><span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span></label>' +
  // AND A TAB STRIP (issue 1509), for the toggle's reason and the floor group's. Its
  // `.fabricate-tabs button` member is a (0,1,1) TIE with the area's own bare-element baseline,
  // declared later and so winning on source order with the identical declaration — which means
  // that inside the manager it must be a no-op, and this is the element that says so with a
  // measurement rather than with an argument. The button's own (0,2,0) rule states the 0.78rem
  // and the 700 weight, and the floor must not disturb either.
  '<div class="fabricate-tabs manager-editor-tabs" role="tablist" data-probe="neg-tabs"><button type="button" role="tab" class="manager-editor-tab-button is-active" data-probe="neg-tab"><span>Overview</span></button></div>';

/**
 * Those elements measured in the manager host under a given sheet text.
 *
 * @param {string} css The module sheet text to load.
 * @returns {Promise<Record<string, Record<string, string>>>} probe → property → value.
 */
async function measureNegativeControls(css) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html, body { margin: 0; padding: 0; }' +
        'body { font-family: "Signika", sans-serif; font-size: 16px; }</style>' +
        `<style id="module-sheet">${css}</style></head><body>` +
        `<div class="fabricate fabricate-manager"><div>${NEGATIVE_CONTROLS}</div></div>` +
        '</body></html>'
    );
    return await tab.evaluate(() => {
      const out = {};
      for (const node of globalThis.document.querySelectorAll('[data-probe]')) {
        const style = globalThis.getComputedStyle(node);
        const box = node.getBoundingClientRect();
        out[node.dataset.probe] = {
          height: style.height,
          'min-height': style['min-height'],
          appearance: style.appearance,
          'line-height': style['line-height'],
          'font-size': style['font-size'],
          'font-family': style['font-family'],
          // READ FOR THE TOGGLE'S CHECKBOX INPUT.
          opacity: style.opacity,
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      }
      return out;
    });
  } finally {
    await tab.close();
  }
}

/** The blocks issues 1508 and 1509 ADD that can move a resting measurement. */
const ADDED_BLOCKS = Object.freeze([
  '.fabricate-field :is(input, select, textarea),\n.fabricate-search input,\n' +
    '.fabricate-slider input,\n.fabricate-tabs button {\n  font: inherit;\n}',
  '.fabricate-toggle {\n  font: inherit;\n}',
  '.fabricate-field input[type="text"],\n.fabricate-field input[type="url"],\n' +
    '.fabricate-field input[type="email"],\n.fabricate-field input[type="tel"],\n' +
    '.fabricate-field input[type="password"],\n.fabricate-field input:not([type]),\n' +
    '.fabricate-field textarea {\n  appearance: none;\n  -webkit-appearance: none;\n' +
    '  min-height: 34px;\n}',
]);

test('the validation surface`s sub-line takes its LEADING from a manager class, not this family', async () => {
  // THE OPT-OUT FROM THE BOX COMPARISON, STATED AS ITS OWN MEASUREMENT.
  const measured = await measure(sheet);

  assert.equal(
    measured['validation-sub'].bare['line-height'],
    'normal',
    'the family declares no leading for the sub-line, so a bare host must resolve `normal`; a ' +
      'value here means this family has started declaring one and `HOST_LEADING_PROBES` should ' +
      'go with it'
  );
  assert.notEqual(
    measured['validation-sub'].manager['line-height'],
    'normal',
    'the manager must still be what supplies that line its leading, or the opt-out above is ' +
      'hiding a difference this family did make'
  );
  for (const host of HOSTS) {
    assert.equal(
      measured['validation-sub'][host.id]['font-size'],
      '11.52px',
      'the 0.72rem the family declares at (0,3,0) must beat `manager-muted`s 0.78rem in the ' +
        'manager AND stand alone everywhere else: the SIZE is the family`s and travels, which ' +
        'is the half of this line that is not a residue'
    );
  }

  assert.match(
    sheet,
    /\.fabricate-manager \.manager-muted \{[^}]*line-height: 1\.35;/u,
    'the leading must still come from `.fabricate-manager .manager-muted`, which is the manager`s ' +
      'own vocabulary rather than this family`s — the residue issue 1507 owns'
  );
  assert.ok(
    !/\.fabricate-validation [^{]*summary-sub[^{]*\{[^}]*line-height/u.test(sheet),
    'and this family must NOT restate that leading at its own root: doing so would make the ' +
      'sub-line travel by DISPLACING a manager rule for an element the manager also styles, ' +
      'which is the displacement the design-system requirement refuses'
  );
});

/* ── THE FAMILY THAT OWNS NO CONTROL AT ALL (issue 1509) ─────────────────────────────── */

test('the validation surface declares no font floor and no focus pair', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const named = /\.fabricate-validation(?![\w-])/u;
    const family = rules.filter((rule) => named.test(rule.selectorText));
    assert.ok(
      family.length >= 30,
      `only ${family.length} rules are rooted at \`.fabricate-validation\`, so the absences below ` +
        'hold over nothing. The family has been renamed or the re-root has been undone.'
    );

    const focused = family.filter((rule) => /:focus/u.test(rule.selectorText));
    assert.deepEqual(
      focused.map((rule) => rule.selectorText),
      [],
      '`.fabricate-validation` declares a focus rule. This family owns no control of its own, so ' +
        'a strip or a repaint here would paint chrome for a control ANOTHER primitive owns — and ' +
        'it would WIN: `<root> <element>:focus-visible` is (0,2,1) and out-ranks the composed ' +
        '`ManagerButton`s own `.fabricate-button:focus-visible` ring at (0,2,0), so the row`s ' +
        'View action would lose its family ring to this one. That displacement is what the ' +
        'design-system requirement refuses, and it is why the pair is REFUSED here rather than ' +
        'merely absent.'
    );

    // AND NO FLOOR. A floor is a rule that types a BARE ELEMENT under the family root.
    const bareElement = family.filter((rule) =>
      rule.selectorText
        .split(/\s*(?:>|\+|~|\s)\s*/u)
        .slice(1)
        .some((compound) => compound !== '' && !compound.includes('.'))
    );
    assert.equal(
      bareElement.length,
      3,
      'expected exactly the three `> i` count glyph rules to name a bare element under this ' +
        `root, found ${bareElement.length}: ` +
        bareElement.map((rule) => rule.selectorText).join(', ')
    );
    const typedBareElement = bareElement.filter((rule) =>
      rule.properties.some(
        (property) => property.startsWith('font') || property === 'line-height'
      )
    );
    assert.deepEqual(
      typedBareElement.map((rule) => `${rule.selectorText} :: ${rule.cssText}`),
      [],
      '`.fabricate-validation` types a bare element, which is a font floor for a control this ' +
        'family does not own. The four families that DO own a control declare one; this one must ' +
        'not, and its own type sits on its own classes instead.'
    );
  } finally {
    await tab.close();
  }
});

/* ── THE FAMILY WHOSE ROOT ELEMENT IS ANOTHER FAMILY'S (issue 1509 phase 3) ──────────── */

test('the option-card family declares no font floor of its own', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const named = /\.fabricate-option-cards(?![\w-])/u;
    const family = rules.filter((rule) => named.test(rule.selectorText));
    assert.ok(
      family.length >= 27,
      `only ${family.length} rules are rooted at \`.fabricate-option-cards\`, so the absence below ` +
        'holds over nothing. The family has been renamed or the re-root has been undone.'
    );

    // THE DOMAIN IS REAL. This family DOES name bare elements under its root.
    const bareElement = family.filter((rule) =>
      rule.selectorText
        .split(/\s*(?:>|\+|~|\s)\s*/u)
        .slice(1)
        .some((compound) => compound !== '' && !compound.includes('.'))
    );
    assert.ok(
      bareElement.length >= 7,
      `only ${bareElement.length} rules name a bare element under this root, so the type check ` +
        'below examines almost nothing: ' +
        bareElement.map((rule) => rule.selectorText).join(', ')
    );
    const typedBareElement = bareElement.filter((rule) =>
      rule.properties.some((property) => property.startsWith('font') || property === 'line-height')
    );
    assert.deepEqual(
      typedBareElement.map((rule) => `${rule.selectorText} :: ${rule.cssText}`),
      [],
      '`.fabricate-option-cards` types a bare element, which is a font FLOOR. This family must ' +
        'not declare one: its root element is `Field`s fieldset and carries `fabricate-field` ' +
        'too, so `.fabricate-field :is(input, select, textarea)` already floors every input in ' +
        'the group at the same (0,1,1) rank. A second floor restates a property rather than ' +
        'establishing one, and whichever of the two came later would win on source order alone.'
    );

    // AND IT IS NOT A MEMBER OF THE SHARED FLOOR GROUP EITHER.
    const floorGroup = rules.filter((rule) => rule.selectorText === FAMILY_FONT_FLOOR_SELECTOR);
    assert.equal(
      floorGroup.length,
      1,
      `expected exactly one shared font-floor group, found ${floorGroup.length}. Its members are`+
        ' pinned in `FAMILY_FONT_FLOOR_MEMBERS`, so a change to the group reds there first; this'+
        ' clause reads nothing if the prelude has moved.'
    );
    assert.ok(
      !named.test(floorGroup[0].selectorText),
      '`.fabricate-option-cards` has joined the shared font-floor group. It must not: the same '+
        'group already carries `.fabricate-field :is(input, select, textarea)`, which reaches '+
        'this family`s radios through the root the two families share.'
    );
  } finally {
    await tab.close();
  }
});

test('the option-card radio takes its type from the field floor it shares a root with', async () => {
  // THE NEGATIVE CONTROL FOR THE REFUSAL ABOVE, and it is a perturbation rather than an argument:
  const FIELD_FLOOR_MEMBER = '.fabricate-field :is(input, select, textarea),\n';
  assert.equal(
    sheet.split(FIELD_FLOOR_MEMBER).length - 1,
    1,
    '`Field`s member of the font-floor group is not spelled as this control expects, so removing ' +
      'it would perturb nothing and the comparison below would pass vacuously'
  );
  const base = sheet.replace(FIELD_FLOOR_MEMBER, '');
  assert.notEqual(base, sheet, 'the perturbed sheet must actually differ from the shipped one');

  const shipped = await measure(sheet);
  const atBase = await measure(base);

  const shippedFont = shipped['option-cards-radio'].bare['font-family'];
  const baseFont = atBase['option-cards-radio'].bare['font-family'];
  assert.ok(shippedFont !== '', 'the shipped radio computed no `font-family` at all');
  assert.equal(
    shippedFont,
    shipped.field.bare['font-family'],
    'in a BARE host the option-card radio must resolve the same `font-family` as `Field`s own ' +
      'control, because the rule typing both of them is `Field`s floor'
  );
  assert.notEqual(
    baseFont,
    shippedFont,
    'deleting `Field`s member of the font-floor group left the option-card radio typed anyway, ' +
      'so something ELSE is flooring it and the refusal above rests on the wrong reason. Find ' +
      'what, and say so here — do not add a floor to this family until it is the answer.'
  );

  // AND NOTHING ELSE MOVED IN THE MANAGER.
  assert.equal(
    atBase['option-cards-radio'].manager['font-family'],
    shipped['option-cards-radio'].manager['font-family'],
    'the manager host lost the radio`s type when `Field`s floor member went, which would mean ' +
      'the area baseline no longer reaches it and this control is measuring two things at once'
  );
});

/*
 * ── THE TWO FAMILIES THAT OWN NO CONTROL AT ALL (issue 1509 phase 4) ─────────────────
 * THE STATUS CARD TYPES NONE AT ALL: all ten of its rules name a class in every compound, so the
 * floor predicate is quantifying over an empty domain and its zero would hold whatever the
 * predicate said. What carries that clause is therefore not the zero but the two guards around it
 * — `familyRootedAt`'s size floor, which proves the family is present and was not renamed away,
 * and the predicate's own proof that it FIRES on the shipped `.fabricate-tabs button` — plus the
 * published rank beside the refusal. Stated here because "no rule of this shape" and "no rule that
 * could have had this shape" read identically in a passing run, and only the link field is the
 * first one.
 */

/**
 * Every rule in `rules` rooted at `root`, with the family's non-vacuity floor asserted.
 *
 * @param {Array<{selectorText: string, cssText: string, properties: string[]}>} rules
 * @param {string} root The namespace class, without its leading dot.
 * @param {number} floor The smallest family size that makes the absences below meaningful.
 * @returns {Array<{selectorText: string, cssText: string, properties: string[]}>}
 */
function familyRootedAt(rules, root, floor) {
  const named = new RegExp(`\\.${root}(?![\\w-])`, 'u');
  const family = rules.filter((rule) => named.test(rule.selectorText));
  assert.ok(
    family.length >= floor,
    `only ${family.length} rules are rooted at \`.${root}\`, so the absences below hold over ` +
      'nothing. The family has been renamed or the re-root has been undone.'
  );
  return family;
}

/**
 * The rules in `family` that are a FLOOR: the namespace root, then a bare element, and no more.
 *
 * @param {Array<{selectorText: string}>} family
 * @param {string} root The namespace class, without its leading dot.
 * @returns {Array<{selectorText: string}>}
 */
function floorShaped(family, root) {
  return family.filter((rule) => {
    const compounds = rule.selectorText.split(/\s*(?:>|\+|~|\s)\s*/u).filter(Boolean);
    if (compounds.length !== 2) return false;
    return compounds[0] === `.${root}` && !/[.#[]/u.test(compounds[1]);
  });
}

/**
 * The rules in `family` whose selector ENDS in a bare element, floor-shaped or not.
 *
 * @param {Array<{selectorText: string}>} family
 * @returns {Array<{selectorText: string}>}
 */
function endingInBareElement(family) {
  return family.filter((rule) => /(?:^|[\s>+~])[a-z][\w-]*$/u.test(rule.selectorText));
}

test('the status card family declares no font floor and no focus pair', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const family = familyRootedAt(rules, 'fabricate-toggle-card', 9);

    // THE FLOOR PREDICATE FIRES, proved on the shipped group before it is used to report a zero.
    assert.ok(
      floorShaped(
        [{ selectorText: '.fabricate-tabs button' }, { selectorText: '.fabricate-tabs .x button' }],
        'fabricate-tabs'
      ).length === 1,
      'the floor predicate no longer recognises `.fabricate-tabs button`, the shipped (0,1,1) ' +
        'shape it exists to find, so the zeroes it reports below mean nothing'
    );

    assert.deepEqual(
      floorShaped(family, 'fabricate-toggle-card').map((rule) => rule.selectorText),
      [],
      '`.fabricate-toggle-card` declares a font floor. This family renders no control of its own ' +
        '— the switch inside the card is `StatusToggle`s, composed — so a floor here would type a ' +
        'bare element for a primitive that already floors its own, and would reach any element a ' +
        'CALLER put inside the card as well.'
    );

    // AND THE ZERO ABOVE IS A TAUTOLOGY HERE.
    assert.deepEqual(
      endingInBareElement(family).map((rule) => rule.selectorText),
      [],
      'the status card now ends a rule in a bare element. That is not a failure by itself, but ' +
        'the refusal above was recorded over an EMPTY domain and is no longer the same claim: ' +
        're-read whether a floor is now the right answer for this family rather than deleting ' +
        'this line.'
    );

    // AND NO FOCUS PAIR, AND THE RANK IS PUBLISHED RATHER THAN ASSERTED. A pair would be
    // `.fabricate-toggle-card button:focus-visible` at (0,2,1). The switch's own repaint is
    // `.fabricate-toggle.manager-status-toggle:focus-visible` at (0,3,0) — measured below — so on
    // THIS family the hypothetical pair would LOSE rather than replace, which is the opposite of
    // what happens one clause down at the link field. That difference is why the refusal is a rule
    // about OWNERSHIP and not a rank argument: `StatusToggle` happens to write its pair at three
    // classes today, and a pair here would silently become a displacement the day it wrote it at
    // two. The one control this card contains belongs to another primitive either way.
    const focused = family.filter((rule) => /:focus/u.test(rule.selectorText));
    assert.deepEqual(
      focused.map((rule) => rule.selectorText),
      [],
      '`.fabricate-toggle-card` declares a focus rule. The only focusable thing inside this card ' +
        'is the switch, which is `StatusToggle`s and paints its own ring; a rule here is a claim ' +
        'on another primitive`s chrome, and it becomes a displacement the moment that primitive ' +
        'writes its pair at two classes rather than three.'
    );

    const switchRepaint = rules.find(
      (rule) => rule.selectorText === '.fabricate-toggle.manager-status-toggle:focus-visible'
    );
    assert.ok(
      Boolean(switchRepaint),
      'the switch`s own focus repaint is no longer in the sheet, so the rank comparison this ' +
        'refusal is published with cannot be measured'
    );
    assert.equal(
      specificity(switchRepaint.selectorText),
      '0,3,0',
      'the switch`s repaint has moved off (0,3,0). A pair at `.fabricate-toggle-card ' +
        'button:focus-visible` is (0,2,1), so it loses to (0,3,0) and WINS against (0,2,0) — ' +
        'this number is the whole reason the refusal here is stated as ownership rather than rank.'
    );
    assert.equal(specificity('.fabricate-toggle-card button:focus-visible'), '0,2,1');
  } finally {
    await tab.close();
  }
});

test('the link field family declares no font floor and no focus pair', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const family = familyRootedAt(rules, 'fabricate-link-field', 13);

    assert.deepEqual(
      floorShaped(family, 'fabricate-link-field').map((rule) => rule.selectorText),
      [],
      '`.fabricate-link-field` declares a font floor. This family renders no control of its own — ' +
        'its copy and unlink actions are `IconButton`s, composed — so a floor here would type ' +
        'every bare element under the zone, including two buttons another primitive already ' +
        'floors at its own root.'
    );

    // THE DOMAIN THE ZERO ABOVE WAS MEASURED OVER IS NOT EMPTY.
    assert.equal(
      endingInBareElement(family).length,
      5,
      'the link field no longer ends five rules in a bare element, so `floorShaped`s zero above ' +
        'has stopped discriminating and the docblock`s contrast with the status card is stale: ' +
        endingInBareElement(family)
          .map((rule) => rule.selectorText)
          .join(', ')
    );

    // Of those five, the three that TYPE it. Asserted separately because the zero above cannot be
    // mistaken for "this family types nothing" — the predicate is shape, not absence, and a
    // reader reconciling the two needs the second number.
    const typedBareElement = endingInBareElement(family).filter((rule) =>
      rule.properties.some((property) => property.startsWith('font') || property === 'line-height')
    );
    assert.equal(
      typedBareElement.length,
      3,
      'expected exactly the three name-and-note rules to type a bare element under this root — ' +
        'the default face`s `small`, and the compact face`s `strong` and `small` — found ' +
        `${typedBareElement.length}: ` +
        typedBareElement.map((rule) => rule.selectorText).join(', ')
    );

    // AND NO FOCUS PAIR, AND HERE THE RANK ARGUMENT IS THE WHOLE OF IT. A pair would be
    // `.fabricate-link-field button:focus-visible` at (0,2,1), and `IconButton`'s own repaint is
    // `.fabricate-icon-button:focus-visible` at (0,2,0) — so the pair would OUT-RANK it and
    // REPLACE the ring on both of this zone's action buttons. Its strip half would displace
    // `.fabricate-icon-button:focus` the same way. Both displaced rules are named and their ranks
    // measured, so the refusal is published rather than argued.
    const focused = family.filter((rule) => /:focus/u.test(rule.selectorText));
    assert.deepEqual(
      focused.map((rule) => rule.selectorText),
      [],
      '`.fabricate-link-field` declares a focus rule. This family owns no control, so a strip or ' +
        'a repaint here paints chrome for a control `IconButton` owns — and it WINS: `<root> ' +
        '<element>:focus-visible` is (0,2,1) and out-ranks that primitive`s own ' +
        '`.fabricate-icon-button:focus-visible` at (0,2,0), so both of the zone`s actions would ' +
        'lose their family ring to this one.'
    );

    for (const displaced of ['.fabricate-icon-button:focus', '.fabricate-icon-button:focus-visible']) {
      const rule = rules.find((candidate) => candidate.selectorText === displaced);
      assert.ok(
        Boolean(rule),
        `${displaced} is no longer in the sheet, so the displacement this refusal publishes ` +
          'cannot be measured'
      );
      assert.equal(
        specificity(displaced),
        '0,2,0',
        `${displaced} has moved off (0,2,0), which is the rank a link-field pair at (0,2,1) ` +
          'would have beaten. Re-derive the refusal before trusting it.'
      );
    }
    assert.equal(specificity('.fabricate-link-field button:focus-visible'), '0,2,1');
    assert.equal(specificity('.fabricate-link-field button:focus'), '0,2,1');
  } finally {
    await tab.close();
  }
});

test('the chrome these families declare reaches the control they own and nothing else', async () => {
  // THE CONTROL IS A COMPARISON AGAINST BASE, not a list of remembered numbers.
  let base = sheet;
  for (const block of ADDED_BLOCKS) {
    assert.equal(
      base.split(block).length - 1,
      1,
      'an issue-1508 block is not spelled as this control expects, so removing it would perturb ' +
        `nothing and the comparison below would pass vacuously. Re-derive it from the sheet:\n${block}`
    );
    base = base.replace(block, '');
  }
  assert.notEqual(base, sheet, 'the base sheet must actually differ from the shipped one');

  const shipped = await measureNegativeControls(sheet);
  const atBase = await measureNegativeControls(base);

  const moved = [];
  for (const probe of Object.keys(shipped)) {
    for (const property of Object.keys(shipped[probe])) {
      assert.ok(
        shipped[probe][property] !== undefined && shipped[probe][property] !== '',
        `${probe} computed no \`${property}\`, so comparing it against base proves nothing`
      );
      if (shipped[probe][property] !== atBase[probe][property]) {
        moved.push(
          `${probe}.${property}: base=${atBase[probe][property]} shipped=${shipped[probe][property]}`
        );
      }
    }
  }
  assert.deepEqual(
    moved,
    [],
    'the font floor or the element-typed chrome rule moved a measurement inside the manager. ' +
      'Both are written to be no-ops there — the floor copies the area baseline`s own ' +
      '`font: inherit` and the chrome rule copies the area baseline`s own three declarations over ' +
      `the area baseline's own predicate — so any difference here is a real move:\n  ${moved.join('\n  ')}`
  );

  // AND THE ABSOLUTE VALUES, because "unchanged" is only reassuring once the reader can see WHAT
  // was unchanged. Each is the height the element's own rule gives it, and none of them is 34.
  assert.equal(shipped['neg-radio'].box, '16x16', 'the resolution radio keeps its 16px dot');
  assert.equal(shipped['neg-range'].height, '28px', 'the drop-rate range keeps its 28px track');
  assert.notEqual(shipped['neg-stepper'].height, '34px', 'a stepper input is never floored to 34');
  assert.notEqual(shipped['neg-checkbox'].height, '34px', 'a checkbox is never floored to 34');
  assert.equal(shipped['neg-textarea']['min-height'], '92px', 'the field textarea keeps its 92');

  // THE TWO AREA RULES THE FLOOR TIES.
  assert.equal(
    shipped['neg-textarea']['line-height'],
    `${Number.parseFloat(shipped['neg-textarea']['font-size']) * 1.4}px`,
    '`.fabricate-manager textarea { line-height: 1.4 }` must still beat the family font floor'
  );
  assert.equal(
    shipped['neg-select']['line-height'],
    shipped['neg-select']['font-size'],
    "`@supports (appearance: base-select)`'s `.fabricate-manager select { line-height: 1 }` must " +
      'still beat the family font floor'
  );
  assert.equal(
    shipped['neg-select'].appearance,
    'base-select',
    'a select in a field keeps the area`s own `appearance`; the family declares none for it'
  );
});

test('the font floor is declared between the area baseline and the two rules that restate a font longhand', async () => {
  // N1's INTERVAL, STATED AS AN ASSERTION. The floor ties `.fabricate-manager button, … textarea`
  // at (0,1,1) and beats it on source order with that rule's own declaration, which is a no-op.
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const only = (predicate, label) => {
      const found = rules.filter(predicate);
      assert.equal(found.length, 1, `${label} must be declared exactly once; found ${found.length}`);
      return rules.indexOf(found[0]);
    };

    const baselineIndex = only(
      (rule) =>
        rule.selectorText ===
        '.fabricate-manager button, .fabricate-manager input, .fabricate-manager select, .fabricate-manager textarea',
      'the area`s bare-element font baseline'
    );
    const floorIndex = only(
      (rule) => rule.selectorText === FAMILY_FONT_FLOOR_SELECTOR,
      'the issue-1508 family font floor'
    );
    const textareaIndex = only(
      (rule) => rule.selectorText === '.fabricate-manager textarea' && rule.at === '',
      'the area`s own textarea block'
    );
    const supportsSelectIndex = only(
      (rule) =>
        rule.selectorText === '.fabricate-manager select' && rule.at === '(appearance: base-select)',
      'the `@supports (appearance: base-select)` select block'
    );

    assert.ok(
      baselineIndex < floorIndex,
      `the floor must be declared AFTER the area baseline it ties, so it wins on source order ` +
        `with that baseline's own declaration; baseline=${baselineIndex} floor=${floorIndex}`
    );
    assert.ok(
      floorIndex < textareaIndex && floorIndex < supportsSelectIndex,
      'the floor must be declared BEFORE both rules that restate a `font` longhand at its own ' +
        `rank; floor=${floorIndex}, textarea=${textareaIndex}, @supports select=${supportsSelectIndex}`
    );

    // AND ITS REACH IS READ AS THE DECLARATION, never as a resolved value.
    const floor = rules[floorIndex];
    assert.match(
      floor.cssText,
      /font(?:-family)?:\s*inherit/,
      `the family font floor must declare \`font: inherit\`; declared: ${floor.cssText}`
    );
    // AND NOTHING ELSE. Any declaration the tied baseline does not also carry is a real move
    // inside the manager, which is why `appearance` and `min-height` are a separate rule. The
    // property list is read as the `font` SHORTHAND'S OWN LONGHANDS — every `font-*` plus
    // `line-height`, which is the one longhand the shorthand covers under another name — so a
    // fourth declaration of any kind reds here by name.
    const stray = floor.properties.filter(
      (property) => !property.startsWith('font') && property !== 'line-height'
    );
    assert.deepEqual(
      stray,
      [],
      'the family font floor must declare `font: inherit` and NOTHING else: it TIES the area ' +
        'baseline rather than out-ranking it, so any declaration that baseline does not also ' +
        `carry is a real move inside the manager. Declared: ${floor.properties.join(', ')}`
    );

    // THE RANK, per member, from the repository's own specificity implementation rather than this
    // file's naive counter — which cannot read an `:is()` at all.
    for (const member of FAMILY_FONT_FLOOR_MEMBERS) {
      assert.deepEqual(
        specificityOf(member),
        [0, 1, 1],
        `\`${member}\` must be (0,1,1): the family root plus the bare element it owns, which TIES ` +
          'the area baseline rather than out-ranking it'
      );
    }
    for (const member of FIELD_CHROME_MEMBERS) {
      assert.deepEqual(
        specificityOf(member),
        // Six `input` legs carry an attribute — five `[type=…]` and one `:not([type])`.
        member.includes('[') ? [0, 2, 1] : [0, 1, 1],
        `\`${member}\` must carry the same rank as its donor leg in the area baseline`
      );
    }
  } finally {
    await tab.close();
  }
});

test('the family base rule declares its background rather than inheriting one', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    // `background: var(--fab-overlay-light-06)` resolves through a custom property.
    const base = rules.filter((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    assert.equal(
      base.length,
      1,
      `the shared base rule must be declared once, found ${base.length}`
    );
    assert.match(
      base[0].cssText,
      /background-color:\s*var\(--fab-overlay-light-06\)|background:\s*var\(--fab-overlay-light-06\)/,
      'the family declares its own resting background on its lowest-specificity rule'
    );
  } finally {
    await tab.close();
  }
});

/* THE NEGATIVE CONTROL, PERMANENT AND IN-FILE. */
const BASE_RULE_PRELUDE =
  '.fabricate-button.manager-button,\n.fabricate-icon-button.manager-icon-button {';
const RE_APP_ROOTED_PRELUDE =
  '.fabricate-manager .manager-button,\n.fabricate-manager .manager-icon-button {';

test('the comparison reds when the family base rule is app-rooted again', async () => {
  assert.equal(
    sheet.split(BASE_RULE_PRELUDE).length - 1,
    1,
    'the shared base rule is not spelled as this control expects, so the control below would ' +
      'perturb nothing and pass. Re-derive the prelude from `styles/fabricate.css`.'
  );
  const perturbed = sheet.replace(BASE_RULE_PRELUDE, RE_APP_ROOTED_PRELUDE);
  assert.notEqual(
    perturbed,
    sheet,
    'the substitution must apply before the run below means anything'
  );

  const measured = await measure(perturbed);
  const divergent = [];
  for (const control of ['manager-button', 'icon-button']) {
    for (const property of COMPARED) {
      if (measured[control].bare[property] !== measured[control].manager[property]) {
        divergent.push(`${control}.${property}`);
      }
    }
  }
  assert.ok(
    divergent.length > 0,
    'app-rooting the family base rule again left the bare host identical to the manager host, so ' +
      'the equality this file asserts is not actually measuring that rule'
  );
});

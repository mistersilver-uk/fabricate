/*
 * THE RE-ROOTED CONTROLS, RENDERED IN THREE HOSTS (issues 1502, 1508 and 1509).
 *
 * ── WHAT ISSUE 1509 PHASE 3 ADDED ─────────────────────────────────────────────
 * `RadioCardGroup`, and it is the first family here whose ROOT ELEMENT BELONGS TO ANOTHER
 * PRIMITIVE. The component renders `<Field as="fieldset">` unconditionally, so its fieldset
 * carries `fabricate-field` and `fabricate-option-cards` together and the two families are
 * co-rooted on ONE element rather than nested.
 *
 * That is why this family declares NO FONT FLOOR, and the refusal is measured rather than
 * asserted: `Field`'s own `.fabricate-field :is(input, select, textarea)` at (0,1,1) already
 * reaches every radio inside this group in every host, so a floor here would restate the same
 * property at the same rank rather than establish one. The negative control below DELETES
 * `Field`'s member from the floor group and shows the bare host's radio losing its type, which
 * is what says the resolution really comes from there.
 *
 * Its focus PAIR is neither new nor refused: the family already declared one, and this change
 * re-rooted it IN PLACE after SPLITTING the six selector lists it shared with the Tool
 * Requirements bonus row. That split is what makes the strip half a single-compound rule and
 * therefore a recognisable `PRIMITIVE_FOCUS_STRIPS` member at all.
 *
 * EVERY PROBE UNDER THIS CARD OPTS OUT OF THE BOX COMPARISON, and they all opt out for ONE
 * cause rather than seven: the icon tile declares a 40x40 size over a 1px border, so its border
 * box is 42x42 wherever `box-sizing` falls to `content-box` and 40x40 where the host supplies
 * `border-box` — and it is the tallest thing in the row, so the row, the grid and the fieldset
 * inherit the 2px from it. That is this core-less harness rather than Foundry, where core's
 * `@layer reset` gives every host `border-box`, and the tile's DECLARED 40x40 is compared in all
 * three hosts instead. The two RADIO probes keep their box comparison, because the radio
 * declares `box-sizing: border-box` itself and lays out 16x16 everywhere.
 *
 * ── WHAT ISSUE 1509 PHASES 1 AND 2 ADDED ───────────────────────────────────────
 * `EditorTabs`, the manager's editor tab strip, and it is the first family here whose root is not
 * a control and whose control is a `<button>` rather than an `<input>`. Its root is a
 * `<div role="tablist">` and the control it owns is the `<button role="tab">` inside it, so its
 * font floor takes the (0,1,1) shape — `.fabricate-tabs button` — and joins the same group as
 * `Field`'s, `ManagerSearchField`'s and `ChanceSlider`'s rather than sitting at its own root the
 * way the two button FAMILIES' floors do.
 *
 * TWO probes rather than one, because the strip's ACTIVE UNDERLINE is what it is recognisable by:
 * the resting tab's bottom border is transparent and the selected tab's is the accent, and a
 * single probe would compare one of those and call the strip proved.
 *
 * Its focus PAIR is new on both halves, which nothing before it here was. The strip carried no
 * focus chrome of its own at all — inside a Fabricate window the module pair reached its buttons,
 * and outside one there was no strip — so both halves are added, at the module pair's own (0,2,1)
 * and with its declarations verbatim.
 *
 * ── WHAT ISSUE 1508 ADDED ───────────────────────────────────────────────────────────────────
 * Two more families, and they differ from the first three in the one way that matters to this
 * file: their root is NOT the control. `ManagerButton`, `IconButton` and `Pagination` are rooted
 * on the thing being measured (or, for the pager, on a `<section>` whose buttons carry their own
 * primitive's root); `Field` is a `<label>`/`<div>`/`<fieldset>` whose CONTROL is the caller's
 * `<input>`, `<select>` or `<textarea>`, and `ManagerSearchField` is a `<label>` around its own
 * `<input type="search">`. So each declares its floor at the family root PLUS the bare element it
 * owns, (0,1,1), and the measured probe is the CONTROL rather than the root.
 *
 * That rank ties the manager's own bare-element baseline instead of losing to it, which makes
 * POSITION load-bearing in a way it never was for the (0,1,0) button floor — and the negative
 * controls below are what hold that down: inside `.fabricate-manager`, a textarea's `line-height`
 * and a select's `line-height` under `@supports (appearance: base-select)` must still come from
 * the area's own later rules, not from the floor.
 *
 * ── WHAT THIS FILE IS FOR ───────────────────────────────────────────────────────────────────
 * Issue 1502 moved `ManagerButton`, `IconButton` and `Pagination` off `.fabricate-manager` and
 * onto a namespace class each primitive emits on its own root element. Every other gate in this
 * repository asks a SPELLING question about that move — does the selector name the root, does the
 * component emit it, does a fixture copy it. This is the only one that asks the question the move
 * was made to settle: does the control render the SAME outside the manager as inside it.
 *
 * That question has exactly one honest form. Put one control in three hosts that differ only in
 * the class on an ancestor — a bare `<div>` carrying neither app class, `.fabricate fabricate-app`
 * and `.fabricate-manager` — and compare its COMPUTED geometry and type across the three. If any
 * of them disagree, some rule still depends on an application root, and the control the player app
 * renders is not the control the manager renders.
 *
 * ── WHY THE BARE HOST IS THE ONE THAT MATTERS ───────────────────────────────────────────────
 * `.fabricate` declares the module focus pair for every application, and `.fabricate-app` its own
 * select chrome, so comparing the two APPS against each other can pass while both are being rescued
 * by a rule neither of them owns. The bare `<div>` is rescued by nothing: it is the state a
 * re-rooted control reaches when it is rendered somewhere no `.fabricate-*` area class exists,
 * which is precisely what "rooted at the primitive" claims to make safe.
 *
 * ── WHAT THE HARNESS LOADS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────
 * `styles/fabricate.css` UNLAYERED, and nothing else. No Foundry core sheet, no scoped component
 * CSS, no font declaration of the harness's own.
 *
 * Loading core's sheet here would make this file unable to fail. Core declares
 * `@layer reset { input, button, textarea, select { font: inherit } }`, which applies in ALL THREE
 * hosts equally — so a `<button>` in the bare host would inherit its font from core whether or not
 * the primitive declared anything, and the `font-family` / `font-size` / `line-height` comparisons
 * would agree for a reason that has nothing to do with this change. The one declaration this file
 * exists to prove — `font: inherit` on the family's own baseline rule, replacing the manager's
 * `.fabricate-manager button, … { font: inherit }` at `fabricate.css:1442-1447` — would be
 * unobservable. Without core's sheet a bare `<button>` falls to the UA default button font, which
 * is NOT the inherited one, so deleting the primitive's declaration reds here. That is the whole
 * design of the fixture and it is why it diverges from `world-vocabulary-control-row-cascade.js`,
 * which loads core precisely BECAUSE its defect is a contest with a core rule.
 *
 * The three hosts sit inside one `<body>` that declares `font-family` and `font-size` once, so
 * `font: inherit` resolves from the same ancestor in all three and an equality between them is a
 * statement about the sheet rather than about the fixture.
 *
 * ── WHY A REAL BROWSER, AND WHY SOME ASSERTIONS ARE CSSOM RATHER THAN COMPUTED ──────────────
 * happy-dom computes no cascade at all, so a mounted suite cannot answer any of this. Chromium
 * can, and it resolves `var()`, so the six compared properties are read as COMPUTED values.
 *
 * Two things are read through the CSSOM instead, because a computed value cannot prove them:
 *
 *  1. WHERE THE BASELINE IS ROOTED, AND IN WHAT ORDER. `font: inherit` is the family's
 *     BARE-ELEMENT baseline, so it has to be a FLOOR: rooted at the family root ALONE, at
 *     (0,1,0), high enough to beat the UA button font in a host that declares nothing and
 *     deliberately too low to beat a caller's own per-site rule at (0,2,0). Written on the
 *     family's own (0,2,0) shared base block it tied every such rule and won on source order
 *     against each one declared earlier in the sheet, which is how it deleted
 *     `.manager-recipe-lock`'s and `.manager-recipe-edit`'s 0.68rem and made both glyphs 28.7%
 *     larger. `font` is a shorthand, so it resets `line-height` along with the rest — to the
 *     inherited value in the `inherit` form — and the shared base block declares `line-height: 1`;
 *     being MORE SPECIFIC and later, that block is what resolves. A computed value can show the consequence only in
 *     an engine that expands the shorthand and only for the properties the fixture happens to
 *     measure; reading the two rules' rooting and order shows the CAUSE, in any engine. The
 *     caller-override half is measured as well, on the two classes the regression moved.
 *  2. THE RINGS. Each primitive now declares its own `:focus-visible` outline, and a ring is only
 *     observable on a focused element in a browser that has decided `:focus-visible` applies. The
 *     rule's declared text is the thing under contract here — that it exists, that its
 *     declarations are the two the module ring uses, and that nothing this change added reaches a
 *     `<select>` and so displaces `.fabricate-app select:focus-visible`'s inset ring.
 *
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
 * Reading the array rather than restating its tokens is the same decision `manager-layout.js`
 * makes about the same two components, and for the same reason: a probe built from a restated
 * string keeps measuring the old control after the component stops emitting it, and reports green
 * while doing so.
 *
 * @param {string} source A Svelte component's source text.
 * @param {string} label The component, for the failure message.
 * @returns {string[]} Every unconditional string literal in the array, in order.
 */
function composedClasses(source, label) {
  const literal = source.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, `${label} must declare its emitted classes as one array literal`);
  const tokens = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
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
/**
 * `Field` composes exactly two unconditional literals — its root and its hook class — so the whole
 * array is what a default `<Field>` emits.
 */
const FIELD_CLASSES = composedClasses(
  read('src/ui/svelte/components/Field.svelte'),
  'Field'
).join(' ');

/**
 * `ManagerSearchField`'s array holds a THIRD literal, `is-compact`, behind `compact ? … : ''`, so
 * the reader above — which matches every quoted literal in the array text — sees one token more
 * than a default render emits. The fixture renders the DEFAULT control, so it writes the leading
 * two, and the pinning test below asserts that exact pair rather than leaving the slice implicit.
 *
 * The slice is taken from the HEAD deliberately, and that is the same constraint the area-scope
 * gate depends on: `composedClassRegion` truncates at the first `]` in the file after the array
 * opener, so a family root that is not the array's FIRST literal is a root that gate reports as
 * unemitted. Asserting `[0]` here says so out loud.
 */
const SEARCH_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerSearchField.svelte'),
  'ManagerSearchField'
)
  .slice(0, 2)
  .join(' ');

/**
 * `ManagerToolbar` and `InspectorCard` each compose exactly two unconditional literals — their
 * root and their hook class — so the whole array is what a default render emits. Neither owns a
 * control of its own, which is why neither appears in the floor or the ring populations below.
 */
const TOOLBAR_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerToolbar.svelte'),
  'ManagerToolbar'
).join(' ');
const CARD_CLASSES = composedClasses(
  read('src/ui/svelte/components/InspectorCard.svelte'),
  'InspectorCard'
).join(' ');

/**
 * `StatusToggle`'s array holds MORE than its unconditional literals — the host's own class, the
 * caller's extra and the state modifier all follow — but the reader above stops at the array's
 * first `]`, which in this component is `HOST_CLASSES[host]`'s own. So it sees exactly the two
 * literals a default `button`-host render emits first, which is what the fixture writes.
 *
 * That truncation is not a limitation being worked around here: it is the CONSTRAINT the
 * area-scope gate depends on, and asserting `[0]` below says so out loud.
 */
const TOGGLE_CLASSES = composedClasses(
  read('src/ui/svelte/components/StatusToggle.svelte'),
  'StatusToggle'
).join(' ');

/**
 * `ChanceSlider` composes nothing: it writes every class it emits as a literal, its root inline on
 * its root `<span>`, so its contract is read from the markup exactly as `Pagination`'s is.
 */
const SLIDER_CLASSES = (() => {
  const source = read('src/ui/svelte/components/ChanceSlider.svelte');
  const match = source.match(/class="(fabricate-slider[^"]*)"/);
  assert.ok(match, 'ChanceSlider must write its family root inline on its root element');
  return match[1];
})();

/**
 * `EditorTabs` writes its root as a LITERAL at the head of an interpolated template and its
 * container class as a frozen PROP DEFAULT, so its contract is read out of both (issue 1509).
 *
 * That split is the whole shape of this family and is why the two halves are read separately
 * rather than as one string: the root is the primitive's and no caller can drop it, while the
 * container class is a DEFAULT nine wrappers override with a vocabulary of their own. A reader
 * that took the rendered pair as one literal would keep measuring the default after a caller
 * became the only site that renders.
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
 *
 * The whole array is what a caller passing no `class` of its own emits, so it is the literal the
 * fixture below writes. The three `manager-*` names travel with it deliberately:
 * `manager-recipe-tab` is the RECIPE EDITOR's tab vocabulary and stays application-rooted, and
 * its presence on the fixture root is what makes the residue this file records MEASURABLE rather
 * than argued.
 */
const VALIDATION_CLASSES = composedClasses(
  read('src/ui/svelte/apps/manager/EditorValidationSurface.svelte'),
  'EditorValidationSurface'
).join(' ');

/**
 * The class list `RadioCardGroup` hands `Field`, read out of the component's own template.
 *
 * The template's LEADING LITERAL is the family root, and the position is a constraint rather than
 * a style note: `searchable-popover-area-scope.test.js` reads this component's family out of its
 * markup, and `Field` prepends its own two classes to whatever arrives — so what the fieldset
 * renders is `Field`'s pair, then this family's root, then this family's own classes. That is the
 * one place in this file where TWO namespace roots land on ONE element.
 *
 * `is-config-cards` is appended rather than read, because it arrives through an interpolation the
 * literal reader cannot see; the pinning test below asserts the whole assembled string.
 */
const OPTION_CARDS_OWN_CLASSES = (() => {
  const source = read('src/ui/svelte/apps/manager/RadioCardGroup.svelte');
  const match = source.match(/class=\{`([^`$]*)\$\{/u);
  assert.ok(
    match,
    'RadioCardGroup must hand `Field` a `` class={`…`} `` template whose leading run is literal'
  );
  return match[1].trim();
})();

const OPTION_CARDS_CLASSES = `${FIELD_CLASSES} ${OPTION_CARDS_OWN_CLASSES} is-config-cards`;

/**
 * The class list `ToggleCard` writes on its own root `<div>`, read out of its template.
 *
 * Its template interpolates the `variant` and the on/off state, so what is READ is the LEADING
 * LITERAL RUN — the namespace root and the family's own card class — and the two state tokens are
 * appended by the fixture. That split is the same one `RadioCardGroup`'s read makes below, and it
 * is what `searchable-popover-area-scope.test.js` reads the family from.
 */
const TOGGLE_CARD_CLASSES = (() => {
  const source = read('src/ui/svelte/apps/manager/ToggleCard.svelte');
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
  const source = read('src/ui/svelte/apps/manager/ItemDropZone.svelte');
  const match = source.match(/class="(fabricate-link-field[^"]*)"/u);
  assert.ok(match, 'ItemDropZone must write its family root inline on its root element');
  return match[1];
})();

const PAGINATION_CLASSES = (() => {
  const source = read('src/ui/svelte/components/Pagination.svelte');
  const match = source.match(/class="(fabricate-pagination[^"]*)"/);
  assert.ok(match, 'Pagination must write its family root inline on its root element');
  return match[1];
})();

// NON-VACUITY ON THE READS THEMSELVES. Every assertion in this file is about what the sheet does
// to these three strings, so a read that quietly returned the wrong thing would leave the whole
// file measuring an element the product does not render — passing, and proving nothing.
test('the fourteen class strings under measurement are the ones the primitives emit', () => {
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

  // AND THE ROOT IS THE ARRAY'S FIRST LITERAL, for both. This is a CONSTRAINT rather than a
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
      'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
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

/**
 * The controls, and the element inside each host that is measured.
 *
 * THE CLASS ATTRIBUTES ARE LITERALS, and the reads above are what stop them drifting. Building
 * them by interpolation was the first shape of this file and it was wrong for a reason worth
 * recording: `searchable-popover-area-scope.test.js` is a TEXT SCANNER over `tests/`, and a
 * fixture that spells its classes as `class="${…}"` is invisible to it. This file would then have
 * been a new blind spot in the census — and a carrier no scanner could see is precisely the defect
 * that cost issue 1502 a whole extra phase, when twelve `triggerClass="…"` sites went unrepaired
 * because the census probe only matched `class="manager-button`.
 *
 * So the markup says what it renders, in the open, and the pinning test above asserts every
 * literal against the value read out of the component. A literal that drifts from the primitive
 * reds there rather than quietly measuring the wrong control here.
 *
 * EACH FRAGMENT IS ONE UNBROKEN TEMPLATE LITERAL, and that is a constraint rather than a style.
 * The same scanner walks `<tag …>` with an attribute run that alternates `"[^"]*"` and `'[^']*'`,
 * so an OPEN TAG split across a `'…' + \`…\`` join puts the join's own apostrophe inside the tag
 * and lets the alternation run past the `>` that should have ended it. Measured on the first draft
 * of this file: splitting the pager arrow's `<button …>` across two fragments corrupted the tag
 * stack and made the census report this file's `<nav>` and page label as rootless — a false
 * offender produced entirely by where the source happened to wrap. Long lines here, one tag each.
 */
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
  // THE PROBE IS THE ROOT FOR BOTH OF THESE, and that is the point rather than a shortcut. The
  // bar and the card own NO control: each renders its caller's children, so the whole of what
  // either family declares is on the `<section>` itself. The bar carries one `<select>` all the
  // same, because `.fabricate-filter-bar.manager-toolbar select.is-size-38` is the one family
  // rule that REACHES a caller's control, and its own clause below measures what does and does
  // not travel with it.
  Object.freeze({
    id: 'toolbar',
    classes: TOOLBAR_CLASSES,
    markup: (host) =>
      `<section class="fabricate-filter-bar manager-toolbar" data-probe="${host}-toolbar" aria-label="Filter"><div><select class="is-size-38" data-probe="${host}-toolbar-select"><option>All</option></select></div></section>`,
  }),
  Object.freeze({
    id: 'card',
    classes: CARD_CLASSES,
    markup: (host) =>
      `<section class="fabricate-card manager-inspector-card" data-probe="${host}-card"><h3>Matching evidence</h3><p>Body</p></section>`,
  }),
  // THE PROBE IS THE ROOT AGAIN FOR THE TOGGLE, and here that is not a shortcut either: the
  // switch's root IS its control, a `<button>`, which is why its font floor is written at the
  // family root alone. Its track and knob are measured as separate probes below, because the
  // 34x20 / 14x14 geometry the switch is recognisable by lives on those two children and a
  // comparison on the button alone would not see it move.
  Object.freeze({
    id: 'toggle',
    classes: TOGGLE_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON, for the field's reason and no other. The switch's own box
    // is `width: auto`, solved from its content, and its content is the 34x20 TRACK — which
    // declares a 1px border over a 34x20 size and therefore lays out at 36x22 wherever
    // `box-sizing` falls to `content-box`. That is this core-less harness outside
    // `.fabricate-manager`, and it is nowhere in Foundry, where core's `@layer reset` declares the
    // universal rule for every host. Both halves are asserted by the box-sizing clause below, so
    // the opt-out cannot outlive its reason.
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
    // OPTED OUT OF THE BOX COMPARISON, for its CHILDREN's reason rather than its own. The strip
    // declares no height at all — it is solved from the tallest button — and each button declares
    // a 38px `min-height` under a 2px bottom border, so a button lays out 2px taller wherever
    // `box-sizing` falls to `content-box` and the strip grows with it. That is the bordered
    // rails' case exactly, it is a property of this core-less harness rather than of Foundry, and
    // the box-sizing clause below asserts both halves so the opt-out cannot outlive its reason.
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
  //
  // THE ROOT ITSELF IS THE RESIDUE, and the fixture states it rather than hiding it. The section
  // carries `manager-recipe-tab` beside the namespace root, and
  // `.fabricate-manager .manager-recipe-tab` is (0,2,0) declared LATER in the sheet than the
  // surface's own (0,2,0) root rule — so inside the manager the root's `gap` is `--fab-space-3`
  // and its `min-width` is 0, and outside it the surface's own `--fab-space-4` stands with no
  // `min-width` at all. That is the one thing about this family that is NOT host-independent, it
  // is owned by issue 1507, and `VALIDATION_COMPARED` below is scoped to the two declarations
  // both rules agree on so the exclusion is a named set rather than a silent gap.
  Object.freeze({
    id: 'validation',
    classes: VALIDATION_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON for the residue above: two different `gap`s in two hosts
    // put the row stack at two different offsets and give the section two different heights.
    // Every element INSIDE it is compared as normal, which is where this family's claim lives.
    comparesBox: false,
    markup: (host) =>
      `<section class="fabricate-validation manager-recipe-tab manager-recipe-validation manager-editor-validation-surface" data-probe="${host}-validation"><section class="manager-recipe-validation-summary-row" data-probe="${host}-validation-summary-row"><div class="manager-recipe-rail-summary is-block" data-probe="${host}-validation-summary"><span class="manager-recipe-rail-summary-medallion" data-probe="${host}-validation-medallion"><i class="fas fa-circle-xmark"></i></span><span class="manager-recipe-rail-summary-copy" data-probe="${host}-validation-copy"><span class="manager-recipe-rail-summary-title" data-probe="${host}-validation-title">Cannot be enabled</span><span class="manager-recipe-rail-summary-sub manager-muted" data-probe="${host}-validation-sub">Clear every blocking issue first.</span></span></div><ul class="manager-recipe-rail-counts" data-probe="${host}-validation-counts"><li class="manager-recipe-rail-count is-passing" data-probe="${host}-validation-count"><i class="fas fa-circle-check"></i><span class="manager-recipe-rail-count-label" data-probe="${host}-validation-count-label">Passing</span><span class="manager-recipe-rail-count-value" data-probe="${host}-validation-count-value">7</span></li></ul></section><div class="manager-recipe-val-group" data-probe="${host}-validation-group"><p class="manager-recipe-val-group-label" data-probe="${host}-validation-group-label">Requirements</p><ul class="manager-recipe-val-rows" data-probe="${host}-validation-rows"><li class="manager-recipe-val-row is-block" data-probe="${host}-validation-row"><i class="manager-recipe-val-status fas fa-circle-xmark" data-probe="${host}-validation-status"></i><div class="manager-recipe-val-copy" data-probe="${host}-validation-row-copy"><span class="manager-recipe-val-title" data-probe="${host}-validation-row-title">A game-world Item is linked</span></div></li></ul></div></section>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE OPTION CARDS EITHER (issue 1509 phase 3), for a reason
  // no other entry here has: the root element is `Field`'s `<fieldset>`, so it carries TWO
  // namespace roots and what this family declares about it is only part of what paints it. The
  // control the family owns is its own `<input type="radio">`, and it is probed in BOTH states,
  // because the checked ring is an inset `box-shadow` written by a rule of its own and a single
  // resting probe would compare the hollow ring and call the family proved.
  //
  // ELEVEN PROBES, and the icon tile is the one this fixture exists to draw: the two-column
  // `is-config-cards` face is the only presentation that renders it, and the 40x40 plate over a
  // hairline is what the card is recognisable by.
  Object.freeze({
    id: 'option-cards',
    classes: OPTION_CARDS_CLASSES,
    // OPTED OUT OF THE BOX COMPARISON, for the icon tile's reason stated in the header: the tile
    // declares 40x40 over a 1px border, so it is 42 high wherever `box-sizing` falls to
    // `content-box`, and it is the tallest thing in the row — so the row, the grid and this
    // fieldset are all 2px taller in the two hosts this core-less harness leaves without a
    // universal box-sizing rule. The tile's DECLARED size is compared instead, in all three hosts.
    comparesBox: false,
    markup: (host) =>
      `<fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards" data-probe="${host}-option-cards"><legend class="manager-resolution-mode-legend" data-probe="${host}-option-cards-legend">Resolution</legend><div class="manager-resolution-mode-options" data-probe="${host}-option-cards-options"><label class="manager-resolution-option is-active" data-probe="${host}-option-cards-row-active"><input type="radio" name="${host}-option-cards" checked data-probe="${host}-option-cards-radio-checked"><span class="manager-resolution-option-icon" data-probe="${host}-option-cards-icon"><i class="fas fa-wand-magic-sparkles"></i></span><span class="manager-resolution-option-body" data-probe="${host}-option-cards-body"><span class="manager-resolution-option-name" data-probe="${host}-option-cards-name">Simple</span><span class="manager-resolution-option-desc" data-probe="${host}-option-cards-desc">One ingredient set and one result group.</span></span></label><label class="manager-resolution-option" data-probe="${host}-option-cards-row"><input type="radio" name="${host}-option-cards" data-probe="${host}-option-cards-radio"><span class="manager-resolution-option-icon"><i class="fas fa-layer-group"></i></span><span class="manager-resolution-option-body"><span class="manager-resolution-option-name">Routed by ingredients</span></span></label></div></fieldset>`,
  }),
  // AND THE PROBE IS NOT THE ROOT FOR THE STATUS CARD EITHER (issue 1509 phase 4). This family
  // owns NO CONTROL: the switch inside it is `StatusToggle`'s, composed rather than written, and
  // it is rendered here exactly as the card renders it — with its own namespace root on it — so
  // the fixture is the card the product draws rather than a card-shaped approximation. It carries
  // no probe of its own, because the `toggle` entry above already measures that primitive.
  //
  // THREE CARDS, because the family's ten rules are three variants and their shared base, and one
  // card would leave five of them unrendered. `is-enabled.is-on` carries the copy probes and the
  // success-toned glyph, `is-locked.is-on` the accent tone and `is-info.is-on` the info tone and
  // ITS glyph — the one rule in the family that tones a child from a variant on the parent.
  //
  // THE SUB-LINE IS THE RESIDUE, and the fixture states it rather than hiding it: it carries
  // `manager-muted` beside the family class exactly as the component writes it, and
  // `.fabricate-manager .manager-muted` is a (0,2,0) rule declared LATER in the sheet that gives
  // it a colour, a `font-size` and a margin this family does not restate. So inside the manager
  // that line is 0.78rem muted and outside it takes its type from its ancestor, and what the
  // FAMILY promises about it — `min-width: 0` and the 1.35 leading — travels and is compared.
  // `manager-muted` is the manager's vocabulary, not this primitive's; issue 1507 owns it.
  Object.freeze({
    id: 'toggle-card',
    classes: `${TOGGLE_CARD_CLASSES} is-enabled is-on`,
    // OPTED OUT OF THE BOX COMPARISON, for the sub-line's reason above: a 0.78rem line inside the
    // manager and an inherited-size line outside it give the copy column two heights, and the
    // card is a `align-items: center` row solved from its tallest child. Every property the
    // family declares on the card itself is compared in all three hosts.
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
  // AND THE PROBE IS NOT THE ROOT FOR THE LINK FIELD EITHER (issue 1509 phase 4), and this family
  // owns no control either: its two actions are `IconButton`s, composed and rendered here with
  // that primitive's own root on them.
  //
  // TWO FACES, because `compact` is not a density knob but a different claim about what the zone
  // is FOR, and the two share only the root class. The default face is the three-column linked
  // card — art, copy, actions — and the compact one is the centred glyph-over-title-over-note
  // prompt. Between them they render thirteen of the fifteen rules this change re-roots; the two
  // that are missing are `.is-drop-active` and `.is-disabled`, single-declaration state tones
  // that no static fixture reaches, and they are covered by the CSSOM clause below instead.
  //
  // ONE EXCLUSION, NAMED RATHER THAN LEFT TO BE DISCOVERED, and it belongs to ONE CALLER rather
  // than to the family. `styles/fabricate.css` declares `.fabricate-manager [data-tool-create-card]
  // { flex: 0 0 auto; width: 100% }`, a STYLING hook the Tools catalogue's create prompt passes
  // through this primitive's `hookAttrs` bag. That rule is application-rooted and its selector
  // names no class of this family at all, so it is outside every census this change made and it
  // does not travel: the create prompt keeps its `flex` and its full width only inside the
  // manager. `fabricate-link-field` is therefore host-independent for eight of its nine callers
  // and host-DEPENDENT for the ninth, the residue is issue 1507's, and no fixture here carries
  // that attribute — a probe for it would be measuring the exclusion rather than the family.
  //
  // THE ADDRESS LINE IS PROBED FOR THE OPPOSITE REASON TO EVERYTHING ELSE HERE. Its type comes
  // from the component's OWN scoped block, which this harness deliberately does not load, so the
  // global sheet gives it nothing and all three hosts compute the same UA default. That agreement
  // is the assertion: the moment anybody writes `.fabricate-manager .manager-item-drop-zone-uuid`
  // the three stop agreeing and this probe reds, which is exactly the regression this file is for.
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
]);

/**
 * Probes measured across the three hosts that are not themselves `CONTROLS` entries.
 *
 * `toolbar-select` is a caller's control INSIDE the bar rather than a control of the bar's, so it
 * has no class string of its own to pin and no entry above; the bar's markup renders it and the
 * rung clause below is what asks about it.
 */
const EXTRA_PROBES = Object.freeze([
  'toolbar-select',
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
]);

/**
 * The extra probes that are the issue-1508 families' OWN elements, and are therefore held to the
 * same three-host equality the `CONTROLS` entries are.
 *
 * `toolbar-select` is deliberately absent: it is a CALLER's control inside the bar, only two of
 * whose properties travel, and its own clause below measures both halves of that residue. These
 * ten are different — every one of them is an element `StatusToggle` or `ChanceSlider` writes
 * itself, painted by a rule this change re-rooted, so nothing about them may depend on the host.
 */
const FAMILY_EXTRA_PROBES = Object.freeze(
  EXTRA_PROBES.filter((probe) => probe !== 'toolbar-select')
);

/**
 * The two family RAILS whose rendered border box follows the host's `box-sizing`.
 *
 * Both declare a 1px border over a size they also declare — the switch's 34x20 rail and the
 * slider's 6px-high rail — so in this core-less harness they lay out 2px larger in each dimension
 * wherever `box-sizing` falls to `content-box`, which is every host but the manager. That
 * difference does not exist in Foundry, where core's `@layer reset` declares the universal rule
 * for every host; it is a property of the fixture. Both halves are asserted by the box-sizing
 * clause below so neither opt-out can outlive its reason.
 */
const BORDERED_TRACK_PROBES = Object.freeze(['toggle-track', 'slider-track']);

/**
 * Those two rails, plus the fill INSIDE one of them, which inherits the same dependence.
 *
 * `.fabricate-slider .manager-drop-rate-fill` is `width: var(--fab-drop-rate-value)` and
 * `height: 100%` — both percentages, both resolved against its rail's CONTENT box, which is the
 * box the keyword decides. So the fill's size differs by host for exactly the rail's reason and
 * not for one of its own, and comparing it as a VALUE would report the harness rather than the
 * sheet. What the family actually promises about it is a RELATIONSHIP — the fill fills its rail —
 * and that is asserted directly by the box-sizing clause below, in every host.
 */
const HOST_BOX_DEPENDENT_PROBES = Object.freeze([
  ...BORDERED_TRACK_PROBES,
  'slider-fill',
  // THE TWO TAB BUTTONS, for the bordered rails' reason (issue 1509): each declares a 38px
  // `min-height` under a 2px bottom border, so its border box is 40 high wherever `box-sizing`
  // falls to `content-box` and 38 where the host supplies `border-box`. The DECLARED 38 is
  // compared instead, in all three hosts, which is the claim that matters.
  'tabs-active',
  'tabs-button',
  // AND SEVEN OF THE OPTION CARD'S PROBES (issue 1509 phase 3), for ONE cause rather than seven.
  // `.fabricate-option-cards… .manager-resolution-option-icon` declares a 40x40 tile over a 1px
  // border, so its border box is 42x42 wherever `box-sizing` falls to `content-box` and 40x40
  // where the host supplies `border-box`. The tile is the tallest thing in an option row, so the
  // row's box follows it, the grid's follows the row's and the fieldset's follows the grid's; the
  // body, the name and the desc follow the row's CONTENT width for the same reason. Their
  // DECLARED values are compared instead, in all three hosts, and the tile's 40x40 is among them.
  // The two RADIO probes are deliberately NOT here: the radio declares `box-sizing: border-box`
  // in its own rule, so it lays out 16x16 in every host and its box is compared.
  'option-cards-options',
  'option-cards-row',
  'option-cards-row-active',
  'option-cards-icon',
  'option-cards-body',
  'option-cards-name',
  'option-cards-desc',
  // AND THE STATUS CARD'S COPY COLUMN AND ITS TWO LINES (issue 1509 phase 4), for the card's own
  // `box-sizing` dependence rather than for a cause of theirs. The card declares no `box-sizing`,
  // so inside the manager it takes `border-box` from `.fabricate-manager *` and its 1px border and
  // 12px padding come out of its width; elsewhere in this core-less harness they are added to it,
  // and the flexible copy column is 2px narrower. Every DECLARED value on all three is compared in
  // all three hosts, and the card's own box-sizing exclusion is asserted with its reason below.
  'toggle-card-copy',
  'toggle-card-title',
  'toggle-card-sub',
]);

/**
 * The two validation-surface probes whose laid-out BOX follows a MANAGER class rather than a
 * family one (issue 1509).
 *
 * The summary card's sub-line carries `manager-muted` beside the family class, and
 * `.fabricate-manager .manager-muted` declares `line-height: 1.35` and a top margin that this
 * family does not and must not restate. So the sub's LINE BOX is 12 high in a bare host and 16
 * in the manager, and the copy column that stacks it under the title is 35 against 41. What the
 * family promises about that line — its 0.72rem, at (0,3,0) over the muted class's 0.78rem — DOES
 * travel and is compared on the `validation-sub` probe.
 *
 * The sub-line is a FLEX ITEM of that column, so it is blockified and its own border box follows
 * the same leading; both are opted out together rather than one of them being reported as a
 * different kind of difference. Both halves of the reason are asserted by the clause below so the
 * opt-out cannot outlive it. `manager-muted` is the manager's vocabulary, not
 * this primitive's; retiring it from this surface is issue 1507's.
 */
const HOST_LEADING_PROBES = Object.freeze([
  'validation-copy',
  'validation-sub',
  // AND THE STATUS CARD'S TWO, for the identical reason one family later (issue 1509 phase 4):
  // its sub-line also carries `manager-muted`, so inside the manager that line is 0.78rem with a
  // margin the family does not restate and outside it takes its size from its ancestor. The
  // sub-line's own border box follows that leading and the copy column that stacks it under the
  // title follows the sub-line's, so the two are opted out together rather than one of them being
  // reported as a different kind of difference. What the FAMILY declares about both is compared.
  'toggle-card-sub',
]);

/**
 * The one probe that is a Font Awesome GLYPH and nothing else (issue 1509).
 *
 * `.manager-recipe-val-status` is an empty `<i>` whose whole rendered content is a ligature from
 * a webfont this core-less harness does not load, so it lays out at 0x0 in every host and a box
 * comparison over it would be three zeroes agreeing. It is probed anyway because what the family
 * declares about it DOES travel and is worth asserting: `flex: 0 0 auto`, and the per-status tone
 * the row's own `is-block` gives it, which is the only place in this fixture where a row status
 * reaches a colour.
 */
const GLYPH_ONLY_PROBES = Object.freeze([
  'validation-status',
  // AND THE LINK FIELD'S COMPACT GLYPH TILE (issue 1509 phase 4). The compact face's whole point
  // is that it does NOT show the art, so the family replaces the default face's 44x44 plate with
  // `width: auto; height: auto` and lets the glyph size itself — and the glyph is a Font Awesome
  // ligature this core-less harness does not load, so the tile lays out at 0x0 in every host. Its
  // DECLARED values are compared instead, in all three, which is where the family's claim lives.
  'link-field-compact-icon',
]);

/**
 * The family's shared base rule, as the browser serialises its prelude.
 *
 * This is the lowest-specificity (0,2,0) rule of BOTH button families — the one that declares the
 * control contract and the `line-height: 1` the baseline above it must not reset. It is named
 * once here because four assertions below ask about the same rule.
 */
const BASE_RULE_SELECTOR =
  '.fabricate-button.manager-button, .fabricate-icon-button.manager-icon-button';

/**
 * The family's bare-element type baseline, as the browser serialises its prelude.
 *
 * Rooted at the two family roots ALONE — (0,1,0) — which is the whole of the FLOOR property: it
 * beats the UA button font in a host that declares nothing, and loses to every caller's per-site
 * rule at (0,2,0) or above.
 */
const FLOOR_RULE_SELECTOR = '.fabricate-button, .fabricate-icon-button';

/**
 * The issue-1508 families' font floor, as the browser serialises its prelude.
 *
 * ONE rule with one member per family whose root is NOT its control, declared as a group
 * immediately below the area's own bare-element baseline. All FOUR members are (0,1,1) and every
 * one of them TIES that baseline, which is what makes the group's position load-bearing and is
 * asserted as a CSSOM index below.
 *
 * `StatusToggle` has a font floor too and is deliberately not on this list: its root IS its
 * control, so its floor is `.fabricate-toggle` alone at (0,1,0), which LOSES to the area baseline
 * rather than tying it. Its position is therefore free and it sits in the family's own block, as
 * the two button families' floor does. `TOGGLE_FONT_FLOOR_SELECTOR` below is what asserts that.
 */
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

/**
 * `Field`'s element-typed chrome rule, as the browser serialises its prelude.
 *
 * It restates the area baseline's OWN element predicate leg for leg — six `input` legs at (0,2,1)
 * and `textarea` at (0,1,1) — rather than widening the (0,1,1) floor above, because `appearance`
 * and `min-height` written over `:is(input, select, textarea)` reach radios, ranges, steppers and
 * selects that the area deliberately excludes and that neither a higher-specificity `height` nor
 * a higher-specificity `appearance` can undo.
 */
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
 * Only the shapes this family actually writes are counted — class tokens, id tokens and element
 * names — which is enough to separate (0,1,0) from (0,2,0) and is checked below against the two
 * preludes it is asked about rather than trusted in the abstract. Every comma-separated compound
 * must agree, because a selector list is only as specific as the compound that matched.
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

/**
 * `box-sizing` is compared on the two BUTTON families and not on the pager, and the exclusion is
 * a measured fact rather than a convenience.
 *
 * The button families declare `box-sizing: border-box` on their own shared base rule at
 * `fabricate.css:13667-13668`, so the comparison is live for them and reds if that declaration
 * goes. `Pagination`'s root `<section>` declares none. It is a DEPENDENCE on host chrome rather
 * than a value the family owns: in the manager it picks `border-box` up from
 * `.fabricate-manager * { box-sizing: border-box }` (`:1427-1428`), a UNIVERSAL rule that is the
 * manager area's own chrome and belongs to no primitive family, and everywhere else it takes
 * whatever the host declares.
 *
 * The `content-box` this harness measures outside the manager is a PROPERTY OF THIS HARNESS, not
 * of the product. This file loads `styles/fabricate.css` and nothing else, deliberately (see the
 * header), and Foundry core's own `@layer reset` declares `*, *::before, *::after { box-sizing:
 * border-box }` — so in Foundry every host computes `border-box` and the keyword does not differ
 * by host at all. What is asserted below is therefore the dependence itself, in the one
 * environment that can expose it, plus the guard that keeps it inert.
 *
 * That difference is RENDERED-INERT, and the test below proves it rather than assuming it: no rule
 * anywhere declares an explicit `width` or `height` on that section outside the manager, and for a
 * block box with `width: auto` the used width is solved so that margin + border + padding +
 * content fills the containing block WHATEVER the box-sizing keyword says. Measured on this tree,
 * all three hosts lay the section out at an identical 1264 x 31 border box. So the honest
 * assertion for this control is the rendered BOX, which is asserted for all three controls, plus a
 * guard that the condition making the keyword inert still holds.
 */
const COMPARED_PAGINATION = Object.freeze(COMPARED.filter((property) => property !== 'box-sizing'));

/**
 * What acceptance 2 compares on `Field`'s control, measured on an `<input type="text">`.
 *
 * `appearance` and `-webkit-appearance` are here because they are two of the three declarations
 * Field's element-typed chrome rule restates from the area baseline; `min-height` and `height`
 * because they are the pair that decides the box; `border-*` and `background-color` because the
 * family's own control chrome paints them. `line-height` is compared on the INPUT and
 * deliberately not on a `<textarea>` or a `<select>` — see the negative controls below, where the
 * area's own later same-rank rules are asserted to keep winning for exactly those two elements.
 */
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

/**
 * And on `ManagerSearchField`'s own `<input type="search">`.
 *
 * No `appearance` or `min-height`: the area's element-typed baseline matches no `type="search"`,
 * so this family restates none of it. Its pill declares its own 34 height and 6 radius, and the
 * 34px side padding is what leaves room for the leading glyph.
 */
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

/**
 * What acceptance 2 compares on the filter bar's own `<section>`.
 *
 * Every one of these is a declaration the bar's three re-rooted rules make: the `--fab-space-3`
 * padding and the hairline bottom rule from its box, the overlay fill and the flex row from the
 * always-taken `:not(:has(.manager-toolbar-primary))` branch. `border-TOP-color` is deliberately
 * absent and `border-BOTTOM-*` present: the bar declares a bottom border only, so the top edge
 * resolves to `currentColor` and differs by host for a reason that belongs to the area's own
 * `color`, not to this family. `box-sizing` is excluded for the pager's reason and is asserted
 * separately below; `font-*` and `line-height` are compared because they must be INHERITED — the
 * bar owns no control and declares no floor, so a family rule that started typing this section
 * would show up here.
 */
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

/**
 * And on the card's own `<section>` — the padding, the hairline border on ALL four edges, the 8px
 * corner, the surface fill and the stacked column its two re-rooted rules declare between them.
 */
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

/**
 * The two properties the bar's one control-reaching rule declares, and the only two of that
 * select's that may be compared across hosts.
 *
 * `.fabricate-filter-bar.manager-toolbar select.is-size-38` states 38px and the 34-38px band's 9px
 * corner and NOTHING else, because the bar owns no control and therefore declares no font floor
 * for one. So the rung travels and the select's type does not — measured below as a pair, because
 * the residue is as much a fact of this change as the rung is.
 */
const TOOLBAR_SELECT_COMPARED = Object.freeze(['height', 'border-radius']);

/**
 * What acceptance 2 compares on the switch itself — its root `<button>`, which IS the control.
 *
 * Every one is a declaration the family's own base rule makes: `width: auto` and the 78px cap that
 * keep the switch from filling a status column, the 24px height, the 999px corner and the
 * `border: 0` that makes it a bare flex row rather than a tinted pill. `font-*` and `line-height`
 * are compared because the family declares its own (0,1,0) floor for them, which is what a bare
 * host has instead of the area's bare-element baseline.
 */
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

/**
 * The 34x20 rail and the 14x14 knob, which is the geometry the switch is recognisable by.
 *
 * The rail's `width`/`height` are compared as the family's own DECLARED 34 and 20 rather than as a
 * rendered box: it declares a 1px border, so its border box is 36x22 wherever `box-sizing` falls
 * to `content-box` and 34x20 where the host supplies `border-box`. The knob declares no border and
 * lays out identically in every host, so it keeps the box comparison.
 */
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

/**
 * What acceptance 2 compares on the slider's two INPUTS, which are the controls it owns.
 *
 * The `font-*` triple is the point of the family's floor and is compared on both halves. The
 * number input adds the box its own rule paints — the 28px height, the 6px corner, the border and
 * the fill — and the range input adds the 28px track height and the `appearance: none` that
 * removes the platform slider so the family's own rail can show through.
 */
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

/**
 * What acceptance 2 compares on the tab strip's own `<div role="tablist">`.
 *
 * Every one is a declaration the strip's own re-rooted rule makes: the stretched flex row, the
 * wrap, the `--fab-space-1` gap, the `min-width: 0` that lets a long tab list shrink, and the
 * hairline the strip draws under itself. `box-sizing` is excluded for the pager's reason and is
 * asserted separately below; `font-*` are compared because they must be INHERITED — the strip's
 * own rule types nothing, so a family rule that started typing this container would show up here.
 */
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

/**
 * And on each of the two `<button role="tab">`s, which are the controls the strip owns.
 *
 * `appearance` is here because the button rule declares `none` itself rather than borrowing the
 * area's; `min-height` and the two paddings are the box; `border-bottom-*` is the ACTIVE
 * UNDERLINE, which is transparent on the resting tab and the accent on the selected one and is
 * what makes the two probes different measurements rather than a duplicate. `font-family`,
 * `font-size`, `font-weight` and `line-height` are the type: the size and the weight come from
 * the button's own (0,2,0) rule and the family name and the line-height come from the strip's
 * (0,1,1) font floor, which is what a bare host has instead of the manager's bare-element
 * baseline.
 */
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

/**
 * What acceptance 2 compares on the validation surface's own root `<section>`, and why it is TWO
 * properties rather than the three its rule declares (issue 1509).
 *
 * `.fabricate-validation.manager-recipe-validation` declares `display`, `flex-direction` and
 * `gap`; the RECIPE EDITOR's `.fabricate-manager .manager-recipe-tab` declares the first two
 * identically, a DIFFERENT `gap` and a `min-width: 0`, at the same (0,2,0) and later in the
 * sheet. That class is on this root because six other recipe tabs write it too, so this change
 * deliberately left it and its two head-block rules application-rooted rather than un-styling six
 * tabs — and the consequence is that the surface's own outer gap is the manager's inside the
 * manager and the surface's outside it.
 *
 * So `gap` and `min-width` are EXCLUDED BY NAME and recorded as the residue issue 1507 owns, and
 * what stays compared is the pair both rules agree on: the surface is a vertical stack wherever
 * it is mounted. Everything the family actually paints — the card, the medallion, the rail and
 * the row stack — is compared in full on the probes below.
 */
const VALIDATION_COMPARED = Object.freeze(['display', 'flex-direction']);

/** The two-column header row: a flex row that wraps, at the surface's own gap. */
const VALIDATION_SUMMARY_ROW_COMPARED = Object.freeze([
  'display',
  'flex-wrap',
  'align-items',
  'gap',
]);

/**
 * The summary CARD, which is the thing a GM reads first.
 *
 * Its border colour is the status face's — `is-block` here, so `--fab-danger-border` — and is
 * compared because a status face that stopped travelling would leave every non-manager host
 * drawing a neutral card for a blocking verdict.
 */
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
/**
 * The sub-line, and ONLY its size.
 *
 * It also carries `manager-muted`, whose colour is the manager's and not this family's, so
 * comparing `color` here would report the residue of a class this change does not own. The
 * 0.72rem is the whole of what the surface promises about this line, and it is the number
 * `recipe-studio-font-size.test.js` pins in Chromium.
 */
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
  // THE FIRST ROW'S border is reset to 0 by `:first-child`, which is the rule that keeps the
  // stack's own rounded border from doubling on the top row. Comparing it is what proves that
  // reset travels too.
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

/**
 * The compared set per control, for the entries that do not take the button families' default.
 *
 * Declared here rather than on the `CONTROLS` entries themselves because those entries are built
 * above these constants and a forward reference would be a temporal-dead-zone error at import.
 */
/**
 * What this acceptance compares on the radio-card group, probe by probe (issue 1509 phase 3).
 *
 * `box-sizing` is absent from every one of these lists but the radio's, and the exclusion is the
 * pager's own: nothing under this card declares a keyword except the radio, so the rest take
 * `border-box` from `.fabricate-manager *` inside the manager and whatever this core-less harness
 * leaves elsewhere. The radio DOES declare one, so it is compared there and reds if it goes.
 *
 * `color` is absent from the two radio lists for a different reason and a measured one: a radio
 * inherits `color` from the `.fabricate` module root, which the bare host does not carry, so it
 * is black there and `--fab-text` in both apps. That is the module's vocabulary rather than this
 * family's, and the family declares no `color` on its radios at all.
 */
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

/**
 * The control the family OWNS, in both states.
 *
 * `font-family` is here and it is the point: this family declares NO floor of its own, so the
 * only thing typing this radio in a bare host is `Field`'s (0,1,1) floor reaching it through the
 * root they SHARE. The clause that deletes that floor and watches this value move is below.
 */
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


/**
 * ── THE TWO FAMILIES THAT OWN NO CONTROL AT ALL (issue 1509 phase 4) ────────────────────
 *
 * `ToggleCard` and `ItemDropZone` are the first two entries here whose root is neither a control
 * nor the parent of one they wrote: the card's switch is `StatusToggle`'s and the link field's two
 * actions are `IconButton`'s, both COMPOSED. So neither declares a font floor and neither declares
 * a focus pair, and both refusals are asserted below over the sheet rather than left implicit.
 *
 * What is compared here is therefore the four things each family DRAWS.
 */

/**
 * The status card's own box: a centred row of glyph, copy and switch on a toned surface.
 *
 * `box-sizing` is EXCLUDED, and it is the pager's exclusion rather than a new one: this card
 * declares none, so inside the manager it takes `border-box` from `.fabricate-manager *` and
 * elsewhere it takes whatever the host gives. The dependence is inert while no rule gives the card
 * an explicit `width` or `height` — none does — and in Foundry core's own `@layer reset` supplies
 * the keyword to every host anyway. The card's DECLARED box is compared in full instead.
 */
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

/**
 * The sub-line, scoped to what this family owns.
 *
 * The element carries `manager-muted` beside the family class, exactly as the component writes it,
 * and `.fabricate-manager .manager-muted` is a (0,2,0) rule declared LATER in the sheet that gives
 * it a `margin`, a `color` and a `font-size: 0.78rem`. Those three are the MANAGER's vocabulary
 * rather than this primitive's, they are EXCLUDED BY NAME, and issue 1507 owns retiring the class.
 * `line-height` is excluded for a SECOND-ORDER form of the same fact, and the distinction matters:
 * the family declares `line-height: 1.35` and that RATIO is identical in every host, but a
 * unitless line-height computes against the element's own `font-size` — which is 0.78rem inside
 * the manager and the inherited size outside it — so the computed pixel value differs while the
 * declaration does not. Comparing it would report `manager-muted`'s font size a second time.
 *
 * What is left is `min-width: 0`, the one thing this family says about this line that survives the
 * residue. The card's own rules are compared in full on the three card probes above.
 */
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

/**
 * The ADDRESS LINE, probed for the opposite reason to every other entry in this table.
 *
 * Its type comes from the component's OWN scoped `<style>` block, which this harness deliberately
 * does not load, so the global sheet gives it nothing and all three hosts compute the same UA
 * default. That agreement IS the assertion here: the moment anybody writes
 * `.fabricate-manager .manager-item-drop-zone-uuid` into the sheet, the three stop agreeing and
 * this probe reds — which is the regression this whole file exists to report.
 *
 * `color` is excluded and the exclusion is the harness's rather than the family's: nothing styles
 * this element, so its colour is INHERITED, and the two app hosts declare a text colour on their
 * own root while the bare `<div>` declares none. That difference is host chrome — the same chrome
 * `.fabricate-app` and `.fabricate-manager` give every uncoloured descendant — and reporting it
 * here would be reporting the fixture. Everything a rule could set on this element is compared.
 */
const LINK_FIELD_UUID_COMPARED = Object.freeze(['display', 'font-family', 'font-size']);

/** The action cluster, which is a gap and nothing else — the buttons are `IconButton`'s. */
const LINK_FIELD_ACTIONS_COMPARED = Object.freeze(['display', 'gap']);

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
});

/** Every property any control compares, which is what one page load has to collect. */
const ALL_COMPARED = Object.freeze([
  ...new Set([
    ...COMPARED,
    ...Object.values(COMPARED_BY_CONTROL).flat(),
    ...TOOLBAR_SELECT_COMPARED,
  ]),
]);

/**
 * One page holding all three hosts, with the sheet supplied as a STRING so a negative control can
 * perturb it without touching the file on disk.
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
      // With the slot, every measured control's containing block is a plain block `<div>` in all
      // three hosts and the ONLY difference between them is the class name being tested.
      `<div>${CONTROLS.map((control) => control.markup(host.id)).join('')}</div>` +
      '</div>'
  ).join('');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    // THE HARNESS DECLARES THE TYPOGRAPHIC CONTEXT EXACTLY ONCE, on a common ancestor of all
    // three hosts, and declares no font anywhere below it. That is what makes `font: inherit`
    // resolve to the same thing in every host and an equality between them a fact about the
    // sheet. It deliberately does NOT restate anything the sheet declares.
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

/**
 * Every probe held to the three-host equality, and whether its laid-out BOX is compared too.
 *
 * The `CONTROLS` entries and the families' own extra probes are one population for this clause:
 * the question asked of `.fabricate-toggle .manager-status-toggle-track` is exactly the question
 * asked of `.fabricate-card.manager-inspector-card`, and splitting them into two loops would be
 * two copies of it. `toolbar-select` is the one probe outside this list, because it is a CALLER's
 * control and only part of it travels; its own clause below measures both halves of that.
 */
const MEASURED_PROBES = Object.freeze([
  ...CONTROLS.map((control) =>
    Object.freeze({ id: control.id, comparesBox: control.comparesBox !== false })
  ),
  // TWO PROBES OPT OUT, and both for the switch's own reason above: each declares a 1px border
  // over a declared size, so its BORDER box follows the host's `box-sizing` while the size it
  // declares does not. `toggle-track` is 34x20 + 1 and `slider-track` is 6 high + 1. Everything
  // else here either declares its own `box-sizing` (the slider's number input does, in its own
  // rule) or declares no border over a declared size, and lays out identically in all three hosts.
  ...FAMILY_EXTRA_PROBES.map((id) =>
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

    // AND THE LAID-OUT BOX AGREES, which is the promise the issue actually makes: no frame
    // moves, in either app. A computed-property comparison can agree while two hosts lay the
    // control out differently; this cannot.
    //
    // OPTED OUT FOR `field` ONLY, for the pager's own reason and no other. Field's control is an
    // `<input type="text">`, which declares no `box-sizing` and which Chromium's UA sheet does not
    // give one either: inside `.fabricate-manager` the area's universal `* { box-sizing:
    // border-box }` supplies it, and elsewhere in THIS core-less harness it falls to
    // `content-box` — so a 36px-high input with a 1px border lays out at 36 in the manager and 38
    // outside it. That difference does not exist in Foundry, where core's `@layer reset` declares
    // the universal rule for every host; it is a property of the fixture rather than of the
    // sheet. `search` is NOT opted out and must not be: its control is an `<input type="search">`,
    // which the UA sheet gives `border-box` in every host, so its box is comparable and is
    // compared. The clause below asserts both halves, so neither can outlive its reason.
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
  // THE ONE MEASURED RESIDUAL, recorded rather than reconciled away: the pager root DEPENDS on
  // host chrome for its `box-sizing` rather than declaring one, taking `border-box` from the
  // manager area's universal rule and whatever the host supplies elsewhere. The `content-box`
  // below is a property of THIS HARNESS, which loads the module sheet alone; in Foundry core's
  // `@layer reset` universal rule gives every host `border-box`, so the keyword does not differ
  // by host there. The dependence is inert while no rule gives that section an explicit `width`
  // or `height` — the moment one does, the two keywords produce two different boxes and the
  // `rendered-size` equality above becomes the thing that reds. This states both halves so the
  // exclusion from `COMPARED_PAGINATION` cannot quietly outlive its reason.
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
          // A sheet this size holds selectors this engine can parse but `matches` rejects, and
          // one of them must not take the walk down with it.
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

  // The four properties acceptance 2 says DO resolve, pinned at the values the shared base rule
  // and the button's own block declare. Without these the equality above would still pass on a
  // tree where the whole family stopped matching in every host at once.
  assert.equal(bare('manager-button')['box-sizing'], 'border-box');
  // 9px, not the shared base block's 6: the probe carries `fab-manager-button`, and issue 1371's
  // maintainer ruling M12a gave the converted control the radius ladder's 34-38px rung on
  // `.fabricate-button.manager-button.fab-manager-button`. `icon-button` below still reads the
  // base block's 6, which is what keeps this pair a discriminator rather than one value twice.
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
  // `.fabricate-manager button, … { font: inherit }` (`fabricate.css:1442-1447`) to get there.
  //
  // `font-size` is deliberately NOT read this way. `font: inherit` sets it to the inherited
  // value, but the family then declares its own type scale further down the sheet — measured
  // 11.52px (0.72rem) on the manager button — so a "did it inherit 16px" assertion would fail
  // against a value the design states on purpose. What matters about `font-size` is that all
  // three hosts agree on it, which the equality above already requires.
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

    // Both rules by their exact preludes, not by "a rule in the family that declares one" —
    // `.manager-checks-card-head-link` also declares both properties, and matching loosely
    // catches it too, which would make these assertions depend on which one sorted first.
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

    // THE DECLARED VALUE IS `inherit`, on the FLOOR rule. The computed comparison can only ever
    // show that the three hosts agree; this shows WHAT they agree on, which is the declaration
    // acceptance 2 asks to be proved by reach rather than by a resolved value.
    //
    // EITHER SERIALISATION IS ACCEPTED, and the alternation is a measured fact rather than
    // caution. Chromium round-trips `font: inherit` as the SHORTHAND on this rule, because every
    // longhand the shorthand covers holds the same CSS-wide keyword and nothing else in the block
    // disturbs that; on the shared base block, where it stood beside a dozen other declarations,
    // the same engine serialised it into `font-family: inherit` and its siblings. Pinning one
    // spelling would make this assertion a statement about the engine.
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

/*
 * WHAT THE FLOOR IS FOR, MEASURED ON THE TWO CONTROLS THAT PROVED IT MATTERS.
 *
 * The specificity assertion above states the rooting; this states its CONSEQUENCE, on real
 * classes, in the host that renders them. `.fabricate-manager .manager-recipe-lock` and
 * `.manager-recipe-edit` size the recipe row's lock and pencil at 0.68rem — the deliberate
 * compact scale of that row, beside `manager-recipe-io` at 0.68rem and
 * `manager-recipe-table-head` at 0.72rem. They are app-rooted rules naming a class the CALLER
 * passes through to `IconButton`, so no family gate in this repository can see them: the family
 * detector keys on the literal `manager-icon-button` token, and these carry neither family class
 * in their prelude.
 *
 * That is what made them the ones a baseline written at the family's own (0,2,0) deleted. It tied
 * them and won on source order, and both glyphs rendered 28.7% larger — the only pixel change in
 * the whole conversion, and one no gate in the tree could see. The floor rooting is what puts
 * them back, so this measures the outcome rather than the rule.
 */
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
  // NON-VACUITY, BOTH WAYS. The rules must still declare the compact scale, and the components
  // must still pass those classes through — a probe measuring a class the product stopped
  // rendering, or a rule that stopped declaring a size, would pass while proving nothing.
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
  // 0.68rem against the ROOT font size, which the harness leaves at the browser default while
  // declaring 14px on the body — so a control that took the baseline instead reads the body's
  // 14px and a control that took the caller's rule reads 10.88px. The two differ, which is the
  // whole point, and the expected value is computed rather than hard-coded.
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

  // AND THE FLOOR STILL REACHES A HOST THAT DECLARES NOTHING, which is the half a narrower fix
  // would have kept while giving up. Without the baseline this button falls to the UA button
  // font, which in Chromium is 13.3333px Arial rather than the ambient 14px Signika.
  assert.equal(measured['caller-bare-icon'].fontSize, '14px');
  assert.match(
    measured['caller-bare-icon'].fontFamily,
    /Signika/,
    'a bare-host icon button must still inherit the ambient font, or the baseline is not a floor ' +
      'but simply gone'
  );
});

/*
 * THE SECOND NEGATIVE CONTROL, ON THE FLOOR ITSELF.
 *
 * The measurement above is only evidence once it has been shown to break, and the way it breaks
 * is the exact spelling this fix retired: the baseline written on the family's own (0,2,0) shared
 * base block. This re-roots it there in the sheet TEXT, asserts the substitution applied, and
 * requires the two caller-sized controls to leave 0.68rem.
 */
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
    //
    // THE CHROME A FAMILY DECLARES IS A PAIR, and only the pair is host-independent. Foundry core
    // paints every focused button with an orange outline and a 4px glow (`a.button:focus,
    // button:focus` in core's `elements` layer), and the MODULE reset strips it only inside
    // `.fabricate`, the root every Fabricate application emits (issue 1501). A control rooted at a
    // class the primitive emits renders in hosts carrying no Fabricate root at all, where the
    // repaint half alone would lay the accent ring OVER core's glow instead of replacing it. So
    // each family declares the strip at `:focus` as well as the repaint at `:focus-visible` — the
    // same pairing CONTRIBUTING.md states for the module — and the strip must be declared FIRST,
    // because the two halves tie on specificity and a `:focus-visible` element matches both.
    //
    // THE TWO ISSUE-1508 PAIRS ARE WRITTEN IN TWO DIFFERENT SHAPES ON PURPOSE, and both are
    // asserted here by their exact serialised prelude so neither can be "unified" into the other.
    // `Field`'s STRIP is ONE `:is(input, textarea):focus` member, because
    // `design-system-debt-ratchets.test.js`'s strip register is an exact list of SINGLE compounds;
    // its REPAINT is TWO comma-separated legs, because that file's `RING_ROOTS` recogniser reads
    // `<root> <element>:focus-visible` per member and would not see an `:is()` at all. Each form
    // is what keeps its half inside the population that governs it.
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
      // THE TAB STRIP'S PAIR (issue 1509), and it is the first this file has seen that is NEW on
      // BOTH halves rather than a re-rooted one. The strip had no focus chrome of its own at all:
      // inside a Fabricate window the module pair reached its buttons and nothing more was
      // needed, and outside one there was no strip. Rooted at the class it emits, the strip
      // renders where no `.fabricate` root exists, so it declares both halves — at the module
      // pair's own (0,2,1) and with the module pair's declarations verbatim, which is what keeps
      // the two identical wherever both reach. `.fabricate-pagination button:focus` is the shape.
      ['.fabricate-tabs button:focus', '.fabricate-tabs button:focus-visible'],
      // THE TOGGLE'S TWO PAIRS. The first is the one this change CONVERTED rather than added: it
      // existed at (0,3,0) before the re-root and was re-rooted in place, declarations and rank
      // unchanged. The second is the checkbox host's, and its two halves sit on two DIFFERENT
      // elements by construction: the host is a `<label>`, which never matches `:focus`, so the
      // strip is written on the transparent `<input>` the label wraps while the repaint stays a
      // `:has()` ring on the label. `design-system/spec.md` records that case; the ordering
      // assertion below still holds, and the strip's own reach is measured by the negative
      // controls rather than argued.
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

    // THE SELECT'S INSET RING IS INTACT. `.fabricate-pagination :is(button, select)` would have
    // tied `.fabricate-app select:focus-visible` and won on source order, deleting its
    // `outline: none` + inset `box-shadow` and reinstating the clipped-outline defect that rule
    // exists to prevent. Proved twice: the rule still says what it said, and no rule rooted at
    // one of the three new namespace classes names a `select` at all.
    const selectRing = rules.filter(
      (rule) => rule.selectorText === '.fabricate-app select:focus-visible'
    );
    assert.equal(selectRing.length, 1, 'the player app`s select ring must still be declared once');
    assert.match(selectRing[0].cssText, /outline:\s*none/, 'the select ring stays outline-less');
    assert.match(
      selectRing[0].cssText,
      /box-shadow:\s*inset 0(?:px)? 0(?:px)? 0(?:px)? 2px var\(--fab-accent\)/,
      'the select ring stays an INSET box-shadow, which is the part that is never clipped'
    );

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
      'a rule rooted at one of the eight namespace classes reaches a focused `select`, which ' +
        'is what would displace the inset ring above'
    );
  } finally {
    await tab.close();
  }
});

/*
 * ── THE ISSUE-1508 FAMILIES: WHAT THEY DECLARE, AND WHAT THEY MUST NOT REACH ────────────────
 *
 * The two blocks below are the two halves of one claim. The first pins the values `Field`'s and
 * `ManagerSearchField`'s own controls resolve to in a host that declares nothing, so the
 * three-host equality above cannot pass on a tree where both families stopped matching in every
 * host at once. The second is the NEGATIVE half, and it is the one this change actually turns on:
 * the chrome these families declare must reach the control each of them OWNS and nothing else.
 */

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

  // SEARCH. No `min-height` and no `appearance`: the area's element-typed baseline matches no
  // `type="search"`, so this family restates none of it and the pill's own rule is the whole of
  // its chrome — 34 high, a 6px corner, and 34px of side padding for the leading glyph.
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

  // NON-VACUITY FIRST, the clause above's own guard: an engine returning `''` would satisfy every
  // equality below.
  for (const probe of ['toggle', 'toggle-track', 'toggle-knob', 'slider-number', 'slider-range']) {
    for (const property of COMPARED_BY_CONTROL[probe]) {
      assert.ok(
        bare(probe)[property] !== undefined,
        `${probe} computed nothing at all for \`${property}\`, so the pins below prove nothing`
      );
    }
  }

  // THE SWITCH. `max-width: 78px`, `height: 24px`, the 999px corner and `border: 0` are the whole
  // of what makes it a bare flex row rather than a tinted pill, and all four now come from the
  // family's own re-rooted base rule rather than from the manager.
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

  // AND `width: auto` IS READ AS A DECLARATION, never as a resolved value. The switch's used width
  // is solved from its content, so a resolved reading would be a fact about the fixture's label
  // rather than about the sheet — and it is the `auto` keyword that keeps the switch from filling
  // a status column, which is what the family's own rule promises.
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

    // THE TOGGLE'S FLOOR IS AT THE FAMILY ROOT ALONE, and is NOT in the (0,1,1) group. That is the
    // whole reason its position is free: at (0,1,0) it LOSES to the area's bare-element baseline
    // rather than tying it, so it cannot re-type a manager textarea or select whatever comes
    // after it. A later editor folding it into the group above would change that, and reds here.
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
    // AND NOTHING ELSE, read as the `font` SHORTHAND'S OWN LONGHANDS, which is how the CSSOM
    // reports it — the same reading the (0,1,1) group's clause below uses, so a declaration of
    // any other kind reds here by name.
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

  // THE SLIDER'S TWO CONTROLS. The number half declares its own 28px box, 6px corner, border and
  // fill; the range half declares `appearance: none` so the platform slider is replaced by the
  // family's own rail, and its own 28px height. BOTH inherit the ambient font, which is what the
  // family's `.fabricate-slider input` floor is for and what a bare host would otherwise lose.
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

  // AND THE RAIL AND KNOB GEOMETRY the two families are recognisable by, declared rather than
  // inherited: 34x20 and 14x14 for the switch, 6px high for the slider's rail.
  assert.equal(bare('toggle-track').width, '34px');
  assert.equal(bare('toggle-track').height, '20px');
  assert.equal(bare('toggle-knob').width, '14px');
  assert.equal(bare('toggle-knob').height, '14px');
  assert.equal(bare('slider-track').height, '6px');
});

test('the issue-1508 controls depend on host chrome for box-sizing, and nothing lets that render', async () => {
  // THE OPT-OUT FROM THE BOX COMPARISON, STATED AS ITS OWN MEASUREMENT, exactly as the pager's
  // is. Neither `<input>` declares a `box-sizing`: in the manager the area's universal rule
  // supplies `border-box`, and in this core-less harness they fall to `content-box` elsewhere. In
  // Foundry that difference does not exist, because core's `@layer reset` declares the universal
  // rule for every host. If either family ever declares its own keyword, this reds and the
  // `comparesBox: false` opt-out above should go with it.
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
  // auto` and no declared height, so the used width is solved to fill the containing block and
  // the used height is solved from the content WHATEVER the keyword says. Measured on this tree,
  // all three hosts lay each of them out at an identical border box, which is why `comparesBox`
  // is left at its default for both and the equality above is the assertion with teeth. The
  // keyword itself is stated here so the difference cannot be mistaken for one this change made.
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

  // THE TWO BORDERED RAILS, which are the field's case rather than the pager's: each declares a
  // 1px border over a size it also declares, so the two keywords really do produce two different
  // border boxes and the rendered-box equality is what has to be opted out of. Their DECLARED
  // sizes are compared instead, and are equal in all three hosts, which is the claim that matters:
  // the rail is 34x20 and 6 high because the family says so, not because a host does.
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

  // AND THE SLIDER'S NUMBER INPUT DOES DECLARE ONE, in its own rule, which is why it is NOT opted
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
 *
 * `ManagerToolbar` and `InspectorCard` are the first re-rooted families whose root is not a
 * control and does not CONTAIN one of their own: the bar renders `{@render children?.()}` and the
 * card renders its caller's children. So they declare no font floor and no focus pair, and the
 * three clauses below are the two halves of that decision plus its one residue.
 */

test('the filter bar and the card declare their own box rather than inheriting it', async () => {
  const measured = await measure(sheet);
  const toolbar = measured.toolbar.bare;
  const card = measured.card.bare;

  // NON-VACUITY FIRST, as everywhere else in this file: an engine returning `''` would satisfy
  // every equality below and the three-host comparison above along with it.
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

  // THE BAR. `--fab-space-3` padding, the hairline bottom rule, the `--fab-overlay-light-03` fill
  // and the wrapping flex row — the four things eleven hand-rolled bars used to get from
  // `.fabricate-manager .manager-toolbar`, now declared by the family itself.
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

  // THE CARD. Padding, a hairline border on all four edges, the 8px corner, the surface fill and
  // the stacked column.
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

  // AND NEITHER IS TYPED BY ITS FAMILY. Both inherit the harness's ambient font, which is what a
  // section that declares no floor does. A family rule that started declaring type here would
  // show up as a font-family that is not the body's.
  for (const [label, style] of [['toolbar', toolbar], ['card', card]]) {
    assert.match(
      style['font-family'],
      /Signika/,
      `${label} must INHERIT its type: neither family owns a control, so neither declares a floor`
    );
  }
});

test('the bar`s 38px select rung travels with the family, and the select`s type does not', async () => {
  // THE ONE FAMILY RULE THAT REACHES A CALLER'S CONTROL, and both halves of what that means.
  //
  // `.fabricate-filter-bar.manager-toolbar select.is-size-38` states 38px and the 34-38px band's
  // 9px corner, so those two travel to a bare host with the family. Everything else about that
  // select does NOT, because the bar declares no font floor for a control it does not own — a
  // stated residue owned by issues 1510/1511, not a defect of this change. Asserting the rung
  // without the residue would read as a claim that the whole control travels.
  const measured = await measure(sheet);
  for (const property of TOOLBAR_SELECT_COMPARED) {
    const values = HOSTS.map((host) => measured['toolbar-select'][host.id][property]);
    assert.ok(
      values.some((value) => value !== ''),
      `the rung computed an empty \`${property}\` in every host, so comparing them proves nothing`
    );
    assert.equal(
      new Set(values).size,
      1,
      `the toolbar select rung computes a different \`${property}\` depending on which ` +
        `application class is above it — ${HOSTS.map((host, index) => `${host.id}=${values[index]}`).join(', ')}`
    );
  }
  assert.equal(measured['toolbar-select'].bare.height, '38px', 'the rung is the ladder`s 38');
  assert.equal(measured['toolbar-select'].bare['border-radius'], '9px', 'and the band`s 9 corner');

  // THE RESIDUE, MEASURED. Outside the manager that select takes Foundry-less defaults for its
  // type, because no rule this family declares reaches it.
  assert.doesNotMatch(
    measured['toolbar-select'].bare['font-family'],
    /Signika/,
    'the toolbar select inherits the ambient font outside the manager, which would mean some ' +
      'rule IS flooring a control the bar does not own — the thing this family deliberately ' +
      'refuses to declare'
  );
  assert.match(
    measured['toolbar-select'].manager['font-family'],
    /Signika/,
    'inside the manager the AREA`s own bare-element baseline still types that select, which is ' +
      'what makes the bare-host difference a residue rather than a regression'
  );
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
          'font floor: the bar`s own `select.is-size-38` rung reaches a control the CALLER owns, ' +
          'and flooring it here is the displacement the requirement refuses. Its unfloored type ' +
          'in a bare host is a recorded residue owned by issues 1510/1511.'
      );
    }

    // AND THE FAMILY RULES THE THREE-HOST COMPARISON DOES NOT COVER, EXCLUDED BY COUNT.
    // `.fabricate-filter-bar.manager-toolbar:not(:has(.manager-toolbar-primary))` is declared a
    // second time inside `@container fabricate-manager (max-width: 680px)`, and so are the
    // search family's `.is-compact { width: 100% }` and `{ flex-basis: 100% }`. That container
    // NAME is established by `.fabricate-manager` itself (`container-name: fabricate-manager`,
    // `styles/fabricate.css:1382`), so none of them can travel to a bare host WHATEVER it is
    // rooted at. They re-root for family consistency and move nothing; the inability to travel
    // is a residue of the responsive layer rather than a defect of this change, and they are
    // named here so that the equality above is not read as covering them.
    //
    // COUNTED PER ROOT rather than asserted as one exclusion, because the two families reached
    // this state independently: an unrecorded THIRD rule under either root is a residue nobody
    // has decided about, which is exactly what this clause exists to make loud.
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

/**
 * The elements a widened floor would have reached, rendered inside a `.fabricate-field` in the
 * manager host — which is the host where a move would be a regression rather than the point.
 *
 * Every one is a REAL shape from the tree, not an invented one: the resolution and tool-bonus
 * radios live in a `<Field as="fieldset">` (`RadioCardGroup`), the range and the stepper in a
 * `<Field as="label">`, and the `<select>` and `<textarea>` in ordinary fields everywhere.
 *
 * THE SLIDER WRAPPER CARRIES `fabricate-slider` ALREADY, and that is deliberate rather than
 * premature: `.manager-drop-rate-control`'s own rules re-root onto that class in this change's
 * third phase, and a fixture element carrying a family class with no root above it is exactly the
 * offender `searchable-popover-area-scope.test.js`'s ancestry clause reports. Writing the wrapper
 * now means this file does not become that phase's repair work.
 *
 * AND THE FIELDSET CARRIES `fabricate-option-cards` AS OF ISSUE 1509 PHASE 3, for a reason that
 * is not bookkeeping: the resolution radio's own (0,3,1) chrome rule re-rooted onto that class in
 * that phase, so without it this control's radio would stop matching the rule it has always been
 * measured under and every value below would move for a reason that has nothing to do with a
 * floor. The root restores the match exactly, at the same rank, which is what keeps this a
 * NEGATIVE control rather than a changed subject. It is also what the ancestry clause asks for,
 * and the two repairs are the same edit.
 */
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
  // It is here so the toggle's own (0,1,0) floor has something to be measured on: inside the
  // manager the area's bare-element baseline OUT-RANKS that floor at (0,1,1) and declares the
  // identical value, so the floor is a no-op — and this is what says so with a measurement rather
  // than with an argument. The checkbox host is rendered too, because its `:focus` strip is the
  // one rule in this change whose interval walk is not empty and the input it lands on is
  // `opacity: 0`, which is the fact that makes the move zero pixels.
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
          // READ FOR THE TOGGLE'S CHECKBOX INPUT, whose `opacity: 0` is what makes the one
          // non-empty interval this change has cost zero pixels.
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

/**
 * The blocks issues 1508 and 1509 ADD that can move a resting measurement, spelled exactly as the
 * sheet spells them, so a "base" sheet can be built by removing them.
 *
 * Issue 1509 adds no block of its own: its `.fabricate-tabs button` floor is a fifth MEMBER of the
 * group below, so removing that group already removes it and the tab button in the fixture is
 * measured against a sheet that has none.
 *
 * The focus PAIRS are not on this list and do not need to be: they declare `:focus` and
 * `:focus-visible` chrome only, which no resting measurement reads, and their own neutrality is
 * asserted by the ring clause below and by the select-reach check inside it.
 */
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
  // THE OPT-OUT FROM THE BOX COMPARISON, STATED AS ITS OWN MEASUREMENT, exactly as the two
  // bordered rails' is. `manager-recipe-rail-summary-sub` is written beside `manager-muted`, and
  // `.fabricate-manager .manager-muted` declares a `line-height` and a top margin the family does
  // not — so the line box, and the column that stacks it under the title, differ by host while
  // everything the family itself declares does not.
  //
  // BOTH HALVES, so the exclusion cannot be read as a gap nobody measured: the SIZE the family
  // declares travels, and the LEADING the manager declares does not.
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

/*
 * ── THE FAMILY THAT OWNS NO CONTROL AT ALL (issue 1509) ───────────────────────────────
 *
 * `EditorValidationSurface` goes further than the bar and the card above: its root is a
 * `<section>`, everything under it is sections, lists and spans, and the only two INTERACTIVE
 * things it renders — the row's View action and its status pill — are a composed `ManagerButton`
 * and a composed `Chip`, which carry their own families' chrome. So it declares neither a font
 * floor nor a focus pair, and the clause below is the negative control for that decision.
 */

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

    // AND NO FLOOR. A floor is a rule that types a BARE ELEMENT under the family root, which is
    // what reaches a control the family does not write. This family has three bare-element rules
    // — the three `> i` count glyphs — and every one of them declares `color` alone, so the
    // predicate has a real domain and is not vacuously true of an empty set.
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

/*
 * ── THE FAMILY WHOSE ROOT ELEMENT IS ANOTHER FAMILY'S (issue 1509 phase 3) ────────────
 *
 * `RadioCardGroup` owns a control — its `<input type="radio">` — and still declares no font floor,
 * which no other entry in this file does. The reason is CO-ROOTING rather than composition: the
 * component renders `<Field as="fieldset">`, so `fabricate-field` and `fabricate-option-cards` are
 * on the SAME element and `Field`'s (0,1,1) floor already reaches every input inside the group in
 * every host. A floor of this family's own would restate the same property at the same rank.
 *
 * The two clauses below are the two halves of that: the refusal is asserted over the sheet, and
 * the thing it rests on is proved by DELETING `Field`'s member of the floor group and watching the
 * bare host's radio lose its type.
 */

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

    // THE DOMAIN IS REAL. This family DOES name bare elements under its root — the six radio rules
    // the split produced, plus the note glyph — so a predicate that found none would be reporting
    // a broken reader rather than a clean sheet, and the count says which it is.
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

    // AND IT IS NOT A MEMBER OF THE SHARED FLOOR GROUP EITHER, which is the other shape a floor
    // could take here — `EditorTabs` joined that group rather than writing a block of its own.
    // The group is found by its PRELUDE rather than by its declaration, because Chromium expands
    // the `font` shorthand in `cssText` and a text search for it finds nothing.
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
  // "this family needs no floor because another one already reaches its control" is a claim about
  // the cascade, and the only honest way to state it is to remove the other one and show the
  // control lose its type in the host that has nothing else.
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

  // AND NOTHING ELSE MOVED IN THE MANAGER, which is the other half of "the floor is not this
  // family's": inside `.fabricate-manager` the area's own bare-element baseline types the radio,
  // so removing `Field`s member changes nothing there and the difference above is exactly the
  // bare host's.
  assert.equal(
    atBase['option-cards-radio'].manager['font-family'],
    shipped['option-cards-radio'].manager['font-family'],
    'the manager host lost the radio`s type when `Field`s floor member went, which would mean ' +
      'the area baseline no longer reaches it and this control is measuring two things at once'
  );
});

/*
 * ── THE TWO FAMILIES THAT OWN NO CONTROL AT ALL (issue 1509 phase 4) ─────────────────
 *
 * `ToggleCard`'s switch is `StatusToggle`'s and `ItemDropZone`'s two actions are `IconButton`'s.
 * Both are COMPOSED, so both families declare no font floor and no focus pair — and the refusals
 * are asserted over the sheet, with the rank each would have taken published beside the rule it
 * would have met, because "there was nothing to floor" and "a floor here would have been wrong"
 * are two different claims and only the second is true.
 *
 * WHAT A FLOOR IS, STATED PRECISELY, because both these families DO type bare elements and none of
 * those rules is a floor. A floor is `<root> <bare element>` and nothing else — two compounds, the
 * first the namespace root alone, the second carrying no class, attribute or id — which is the
 * (0,1,1) shape every shipped member of the `fabricate.css` floor group takes. The link field's
 * `.fabricate-link-field .manager-item-drop-zone-copy small` is NOT that: it is (0,2,1), it types
 * a `<small>` inside a class the component itself writes, and it reaches no control anybody else
 * could put there. The predicate below is written to that shape and is proved to FIRE on the
 * shipped floor group, so its zero for these two families is a measurement rather than a filter
 * that stopped matching.
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

test('the status card family declares no font floor and no focus pair', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    const family = familyRootedAt(rules, 'fabricate-toggle-card', 9);

    // THE FLOOR PREDICATE FIRES, proved on the shipped group before it is used to report a zero.
    // `.fabricate-tabs button` is a real member of `fabricate.css`'s floor group and is exactly
    // the shape this predicate exists to recognise.
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

    // The family DOES type bare elements, five of them, and none is a floor. Asserted so the zero
    // above cannot be mistaken for "this family types nothing" — the predicate is shape, not
    // absence, and a reader reconciling the two needs the second number.
    const typedBareElement = family.filter(
      (rule) =>
        /(?:^|[\s>+~])[a-z][\w-]*$/u.test(rule.selectorText) &&
        rule.properties.some(
          (property) => property.startsWith('font') || property === 'line-height'
        )
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
  // THE CONTROL IS A COMPARISON AGAINST BASE, not a list of remembered numbers, because that is
  // the claim: the floor and the chrome rule move NOTHING inside the manager. The base sheet is
  // this sheet with both added blocks removed, and the removal is proved to have applied before
  // the run means anything.
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

  // THE TWO AREA RULES THE FLOOR TIES, measured rather than argued. Both restate a `font`
  // longhand at the floor's own (0,1,1) and both are declared LATER in the sheet, so both must
  // still win inside the manager — which is the whole reason the floor group sits immediately
  // below the area baseline instead of in either family's own block.
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
  // It ALSO ties every LATER same-rank rule in the area, and two of those restate a `font`
  // longhand for controls the floor reaches. So the floor has exactly one safe position: after
  // the baseline and before both of them. A later editor moving it into a family block reds here
  // rather than silently re-typing every manager textarea and select.
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

    // AND ITS REACH IS READ AS THE DECLARATION, never as a resolved value: `font: inherit`
    // computes to whatever the ancestor says, so a resolved reading cannot tell a floor that
    // reached from an ancestor chain that happened to agree.
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
        // Six `input` legs carry an attribute — five `[type=…]` and one `:not([type])`, whose
        // `:not()` argument counts in the class column just the same — so each is (0,2,1); the
        // `textarea` leg names no attribute and is (0,1,1). Both are the rank of the donor leg
        // they restate in `.fabricate-manager input[type="text"], … .fabricate-manager textarea`.
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
    // `background: var(--fab-overlay-light-06)` resolves through a custom property, and a host
    // that failed to define it computes the same `rgba(0, 0, 0, 0)` a control with NO background
    // computes — so a computed comparison would agree for the wrong reason. The declared value is
    // read instead, which is what acceptance 2 asks for.
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

/*
 * THE NEGATIVE CONTROL, PERMANENT AND IN-FILE.
 *
 * A three-host equality is only evidence once it has been shown to break. This re-prefixes the
 * family's shared base rule with `.fabricate-manager` — the exact spelling this issue retired —
 * in the sheet TEXT, asserts the substitution actually applied before loading it, and then
 * requires the bare host to diverge from the manager host. A substitution that silently matched
 * nothing would leave this passing while perturbing nothing, which is the failure mode that makes
 * a negative control worthless, so the count is asserted first.
 *
 * It mutates a string, never the file: the sheet on disk is read once at module load.
 */
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

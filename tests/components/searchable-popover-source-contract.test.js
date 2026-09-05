/**
 * The END STATE of the `.manager-travel-picker` conversion, and the contract its trigger
 * capability creates (issue 1458).
 *
 * ── WHERE THE FIVE SHARED CLAUSES LIVE ──────────────────────────────────────────────────
 * `tests/helpers/primitiveAdoptionContract.js`, shared with `field-source-contract.test.js`
 * and `manager-filter-bar-source-contract.test.js`. That file records why those five questions
 * are shared and why they are NOT the ones `tests/helpers/primitiveSourceContract.js` asks.
 *
 * The short version is sharper here than anywhere it has been so far, because this contract
 * class is a prefix of FOUR other real classes that ship on real elements —
 * `.manager-travel-picker-value` on the trigger's label span, `.manager-travel-picker-trigger`
 * on three call sites' buttons, `.manager-travel-picker-inline` on the inline search row and
 * `.manager-travel-picker-inline-close` on its dismiss button. A `\b`-terminated token pattern
 * matches before a hyphen and would count every one of them; the factory's
 * `classTokenPattern` terminates `(?![\w-])` and does not. The family is broader still:
 * `manager-travel-parties*`, which `GatheringPartiesTab` writes on nine raw elements, shares
 * the `manager-travel` stem and has nothing to do with this primitive.
 *
 * ── THE NAMING DEBT THIS FILE PINS RATHER THAN FIXES ────────────────────────────────────
 * `.manager-travel-*` is a legacy World › Travel name that now carries the manager's ONE
 * picker: 113 rules in `styles/fabricate.css` name it, and every one of them is scoped under
 * `.fabricate-manager`. That misnomer is knowingly SPREAD by this change and not renamed by
 * it, and the ordering is the argument: converting CONCENTRATES the debt, because the family
 * stops being written by hand-rolled call sites and starts being written by one component, so
 * a rename afterwards touches the primitive plus the sheet while a rename now would touch
 * every site. The clauses below are what makes that concentration real — they refuse a new
 * raw writer of the class — so the later rename has exactly one producer to retarget.
 *
 * ── AND THE CLAUSES THAT EARN THIS FILE ─────────────────────────────────────────────────
 * Two, and both are about the popover's ARIA contract rather than its markup:
 *
 *  - Every call site names BOTH surfaces. `triggerAriaLabel` or a visible `triggerLabel` names
 *    the button; `dialogAriaLabel` names the portaled `role="dialog"` AND the `role="listbox"`
 *    inside it, because the primitive passes that one string to both. A site that forgets it
 *    renders an unnamed dialog containing an unnamed listbox, which is invisible in a frame,
 *    is not a compiler error and is not an ESLint rule. One shipped site was exactly that —
 *    `ComponentIdentityStrip`'s source-actions overflow menu — and this clause is what found
 *    it.
 *  - `triggerHasPopup="listbox"` implies `showSearch={false}`. The capability exists because
 *    the ten hand-rolled popovers this primitive absorbs disagreed on what the trigger
 *    announces, and the disagreement tracked what each of them actually opened: a panel with a
 *    query field is a dialog, a bare list of choices is a listbox. Absorbing the difference as
 *    a prop makes it possible to announce `listbox` over a panel that renders a search field,
 *    which promises assistive technology a control the GM never gets. Nothing else can catch
 *    that: both spellings render, both pass every mounted assertion, and the defect is a
 *    sentence a screen reader says.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from 'svelte/compiler';

import {
  definePrimitiveAdoptionContract,
  walkTemplate,
} from '../helpers/primitiveAdoptionContract.js';

const POPOVER_PATH = 'src/ui/svelte/components/SearchablePopover.svelte';

/**
 * The primitive itself, and it is the WHOLE allowlist.
 *
 * It is here for a structural reason rather than as a carve-out, and the reason is worth
 * stating because the sibling contract for `ManagerToolbar` records the opposite. That bar
 * emits its class from `class={classes}` — a bare identifier — so the raw-element detector,
 * which reads the `class` attribute's SOURCE TEXT, cannot see the token and the bar needs no
 * entry. This one writes ``class={`manager-travel-picker ${pickerClass}`}``, a template
 * literal with the token spelled out in it, so the detector counts it. Same primitive shape,
 * opposite answer, decided by how the class is interpolated.
 *
 * One site, pinned by exact count: the picker root is the only element in the component whose
 * class names this token, and a second would mean the primitive had grown a second root.
 */
const RAW_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: POPOVER_PATH,
    sites: 1,
    why:
      'The primitive itself. Its picker root writes the token inside a TEMPLATE LITERAL — ' +
      '`class={`manager-travel-picker ${pickerClass}`}` — so unlike `ManagerToolbar`, whose ' +
      'class comes from a bare identifier, the source-text detector sees it. Exactly one ' +
      'element in the component carries it; a second would mean a second root.',
  }),
]);

/**
 * A synthetic source with a KNOWN raw-site count, driven through the detector by the factory.
 *
 * Deliberately written out rather than produced by a per-primitive factory function. The
 * sibling filter-bar contract builds two fixtures from one `detectorSource(tokens)` helper
 * because it registers two primitives in one file and the two fixtures differ only in their
 * tokens; there is one primitive here, and a second copy of that helper's shape would be new
 * duplicated lines on new code for no second caller.
 *
 * Every line of it discriminates something the detector must NOT count:
 *  - the prose mention, which is how this primitive documents itself;
 *  - `manager-travel-picker-value` and `manager-travel-parties`, the prefix and the stem-mate;
 *  - the `<SearchablePopover>` component tag, which is the converted shape;
 *  - the scoped rule at the bottom.
 * Two raw elements are left, and the lowering substitution converts one of them.
 */
const DETECTOR_FIXTURE = [
  '<!--',
  '  Prose mentioning manager-travel-picker, which is how this primitive documents itself.',
  '-->',
  '<script>',
  "  import SearchablePopover from '../../components/SearchablePopover.svelte';",
  '</script>',
  '',
  '<div class="manager-travel-picker">a converted-looking site that is still raw</div>',
  '<span class="wrapper manager-travel-picker is-open">a second one, mid-list</span>',
  '<span class="manager-travel-picker-value">a longer class the token is a PREFIX of</span>',
  '<div class="manager-travel-parties">a stem-mate that is a different widget entirely</div>',
  '<SearchablePopover triggerClass="modifier">the converted shape</SearchablePopover>',
  '',
  '<style>',
  '  .manager-travel-picker { color: red; }',
  '</style>',
].join('\n');

const popover = definePrimitiveAdoptionContract({
  label: 'manager-travel-picker',
  tag: 'SearchablePopover',
  primitive: POPOVER_PATH,
  contractClass: 'manager-travel-picker',
  allowlist: RAW_ALLOWLIST,
  // 22 call sites in 21 components as issue 1503 lands (20 in 19 before it; the two pickers
  // joined). 16 and 13 leave headroom for a conversion that merges two sites without letting a
  // third of the corpus vanish unnoticed.
  callSiteFloor: 16,
  fileFloor: 13,
  // Declared boolean props with a `false` default, so a bare attribute correctly sets them to
  // `true`. The factory reads the primitive's own source and refuses a name it does not declare
  // that way, so a `data-*` hook cannot be smuggled through this list.
  booleanProps: Object.freeze([
    'triggerChip',
    'inlineSearchTrigger',
    'showFilteredCount',
    'compactOptionRows',
    'disabled',
    'triggerAriaDisabled',
    // Issue 1503. `IconPicker` writes it as `ignoreScrollWithin={true}` rather than bare, which
    // is identical at runtime — but the omission was forced by this list rather than chosen, and
    // a list of the primitive's boolean props that is missing one is a trap for the next caller.
    // The loop below still reads the primitive's own source and refuses a name it does not
    // declare with a `false` default, so this is a declaration being recorded, not a widening.
    'ignoreScrollWithin',
  ]),
  detectorFixture: {
    source: DETECTOR_FIXTURE,
    expected: 2,
    lowered: ['<div class="manager-travel-picker">', '<div class="manager-picker">'],
    loweredExpected: 1,
  },
  rawRemedy:
    'these components hand-roll the trigger-plus-popover that ' +
    '`src/ui/svelte/components/SearchablePopover.svelte` owns. Render `<SearchablePopover ' +
    'options={…} onChoose={…}>` instead — a per-site modifier travels on `triggerClass`, ' +
    '`popoverClass`, `valueClass` or `pickerClass`, a `data-*` hook on the trigger rides ' +
    '`triggerData` and one on an option rides that option`s `data` map. If the site is a ' +
    'typeahead COMBOBOX with no trigger, or a `role="menu"` of actions, it is a different ' +
    'widget and belongs in `scripts/lib/designSystemPrimitives.json`, not here',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread, where a bare `data-x` arrives as the boolean `true` and renders `="true"`. ' +
    'Presence selectors resolve either way, which is why the mounted suites and the smoke ' +
    'steps that use them would not catch it. The same is true of a `triggerData` entry and of ' +
    'an option`s `data` map: spell the value `\'\'`',
});

/**
 * The accessible name a `trigger` SNIPPET writes on the element that receives the primitive's
 * spread, or null (issue 1503).
 *
 * WHY THE SPREAD TARGET AND NOT "SOMEWHERE IN THE SNIPPET". The snippet may draw a whole shell
 * around the button — `EssenceSourceSelector`'s is a drop zone with an image tile and a clear
 * button beside it — and an `aria-label` on any of those names something that is not the
 * trigger. The element carrying `{...attributes}` IS the trigger, because that is the object
 * holding the primitive's `onclick`, its `aria-expanded` and the attachment that anchors the
 * panel to it.
 *
 * The snippet's source is re-parsed rather than pattern-matched. A tag-span regex cannot be
 * trusted here: these buttons carry template-literal `class` values and expression attributes,
 * and the `>` that ends the tag is not the first `>` in its text.
 *
 * @param {{snippetSource: (name: string) => string|null}} site an adoption call site.
 * @returns {string|null} the verbatim `aria-label` attribute source, or null.
 */
function snippetTriggerName(site) {
  const snippet = site.snippetSource('trigger');
  if (!snippet) return null;
  let found = null;
  walkTemplate(parse(snippet, { modern: true, filename: 'trigger-snippet.svelte' }).fragment, (node) => {
    if (found || node.type !== 'RegularElement') return;
    const attributes = node.attributes ?? [];
    if (attributes.every((attribute) => attribute.type !== 'SpreadAttribute')) return;
    const label = attributes.find(
      (attribute) => attribute.type === 'Attribute' && attribute.name === 'aria-label'
    );
    if (label) found = snippet.slice(label.start, label.end);
  });
  return found;
}

test('the snippet-trigger naming route reads the element the spread lands on', () => {
  // NON-VACUITY, and it is the whole reason this route can be trusted: the two pickers are the
  // only sites that take it, so a reader that silently found nothing would push them into the
  // `unnamed` list — the failing direction, which cannot hide — while a reader that returned a
  // constant would let a nameless snippet pass. This clause pins the reader against both.
  const snippetSites = popover.callSites.filter((site) => site.snippetSource('trigger'));
  assert.equal(
    snippetSites.length,
    2,
    `${snippetSites.length} call sites hand the primitive a \`trigger\` snippet; two do — ` +
      '`IconPicker` and `EssenceSourceSelector`. A different number means the route has gained ' +
      'or lost a caller and the figures in this file need re-measuring.'
  );

  for (const site of snippetSites) {
    assert.ok(
      snippetTriggerName(site),
      `${site.file} hands the primitive a \`trigger\` snippet and writes no \`aria-label\` on ` +
        'the element the primitive`s attributes are spread onto, so the button it renders in ' +
        'place of the primitive`s own has no accessible name'
    );
    assert.ok(
      !site.attribute('triggerAriaLabel'),
      `${site.file} passes BOTH a \`trigger\` snippet and \`triggerAriaLabel\`. The primitive ` +
        'renders no button of its own in that shape, and the prop rides the spread — so it ' +
        'would silently override the name the snippet writes rather than naming anything.'
    );
    // THE TWIN, for the quieter of the two overriding props. `triggerTitle` reaches the caller's
    // own button by the same route — non-empty, it rides the spread and lands on the element the
    // snippet wrote its own `title` on — and it is the tooltip rather than the accessible name,
    // so nothing reports it: the button still has a name, still renders, and the GM simply reads
    // a different sentence on hover. Neither shipped picker passes it, which is what makes this a
    // guard for the NEXT snippet caller rather than a fix.
    assert.ok(
      !site.attribute('triggerTitle'),
      `${site.file} passes BOTH a \`trigger\` snippet and \`triggerTitle\`. The prop rides the ` +
        'spread, so it would override the tooltip the snippet writes rather than adding one.'
    );
  }

  // THE READER DISCRIMINATES. A label on an element that is NOT the spread target names some
  // other part of the caller's shell, and must not be accepted as the trigger's name.
  const decoy =
    '{#snippet trigger({ attributes })}' +
    '<div aria-label="the shell, not the button">' +
    '<button {...attributes}>go</button>' +
    '</div>{/snippet}';
  assert.ok(
    !snippetTriggerName({ snippetSource: () => decoy }),
    'the reader accepts an `aria-label` on an element that does not receive the spread, so a ' +
      'nameless trigger inside a labelled wrapper would pass'
  );
  const named = decoy.replace('<button {...attributes}>', '<button aria-label="Go" {...attributes}>');
  assert.notEqual(named, decoy, 'the discrimination control did not perturb the fixture');
  assert.ok(
    snippetTriggerName({ snippetSource: () => named }),
    'the reader does not find an `aria-label` on the spread target either, so the control above ' +
      'measured a reader that never works rather than one that discriminates'
  );
});

test('every popover names its trigger and the panel that opens', () => {
  // NON-VACUITY first, read through a different accessor than the factory's own floors: a
  // broken `attribute()` would report every site as unnamed, which is the failing direction and
  // cannot hide, while one that returned a constant would leave every site passing. The count
  // is what tells those apart.
  assert.ok(
    popover.callSites.length >= 16,
    `only ${popover.callSites.length} call sites, so this clause has lost most of its domain`
  );

  const unnamed = [];
  for (const site of popover.callSites) {
    // The TRIGGER is named by `triggerAriaLabel` or by a visible `triggerLabel`, and either is
    // enough: a button with text has an accessible name from its content. `triggerTitle` is
    // deliberately NOT accepted — a `title` is a tooltip that some assistive technology reads
    // as a name and some does not, so accepting it would let a site pass on a maybe.
    //
    // THE THIRD ROUTE (issue 1503): a site that hands the primitive a `trigger` SNIPPET renders
    // its own button, and the primitive renders none — so `triggerAriaLabel` cannot name
    // anything and would in fact be harmful, because it rides the spread and would override the
    // name the snippet writes. Such a site names the button INSIDE the snippet, on the element
    // the primitive's attributes are spread onto, and this clause asserts that rather than
    // accepting the snippet's mere presence.
    //
    // A SOURCE READ IS NOT SUFFICIENT ON ITS OWN, and this file does not pretend otherwise. The
    // spread runs LAST, so an `aria-label: undefined` key in the object the primitive hands the
    // snippet would REMOVE the very attribute read here and this clause would still pass. The
    // runtime half lives where it can be run: `icon-picker-mounted.test.js` and
    // `essence-source-selector-keyboard-mounted.test.js` mount each picker and assert the
    // RENDERED trigger's `aria-label`, its `title` and that a caller-set `disabled` survived —
    // and `manager-mounted.test.js` has asserted `.essence-icon-picker-trigger`'s `title` since
    // long before this route existed, which is the standing regression net for exactly this.
    const triggerName =
      site.attribute('triggerAriaLabel') ??
      site.attribute('triggerLabel') ??
      snippetTriggerName(site);
    if (!triggerName) unnamed.push(`${site.file}: the trigger has no accessible name`);
    // The PANEL is named only by `dialogAriaLabel`, which the primitive passes to BOTH the
    // portaled `role="dialog"` and the `role="listbox"` inside it. Present AND non-empty:
    // `dialogAriaLabel=""` satisfies a presence check and names nothing, and an empty
    // `aria-label` attribute on a dialog is worse than omitting it, because it suppresses the
    // element's other naming routes while contributing none of its own.
    const panelName = site.attribute('dialogAriaLabel');
    if (!panelName || /^dialogAriaLabel=(""|'')$/.test(panelName)) {
      unnamed.push(`${site.file}: the popover panel has no accessible name`);
    }
  }

  assert.deepEqual(
    unnamed.sort((left, right) => left.localeCompare(right)),
    [],
    'a `<SearchablePopover>` renders a portaled `role="dialog"` containing a `role="listbox"`, ' +
      'and it names both from `dialogAriaLabel` alone. Without it a GM using a screen reader ' +
      'is told a dialog opened and is not told what it is for, then lands in a list with no ' +
      'name either. Nothing else reports this: it is invisible in a frame, it is not a ' +
      'compiler error and no lint rule covers it. `ComponentIdentityStrip``s source-actions ' +
      `menu shipped in exactly that state:\n  ${unnamed.join('\n  ')}`
  );
});

test('a popover announcing a listbox does not render a search field', () => {
  const withPopup = popover.callSites.filter((site) => site.attribute('triggerHasPopup'));
  // The capability has to be REACHED for this clause to mean anything, and it is new — so a
  // floor rather than a count, and a floor above zero. Four sites convert with it as this
  // lands; at zero, the clause below quantifies over nothing and reports clean.
  assert.ok(
    withPopup.length >= 4,
    `only ${withPopup.length} call sites pass triggerHasPopup, so this clause is vacuous`
  );

  const offenders = [];
  for (const site of popover.callSites) {
    const declared = site.attribute('triggerHasPopup');
    // The default is `dialog`, which is truthful for a searchable panel, so an omission is
    // correct by construction and is not this clause's business.
    if (!declared) continue;
    // The two informational values, and nothing else. `aria-haspopup` also accepts `menu`,
    // `tree` and `grid`, and this primitive renders none of those — a site asking for one
    // would announce a widget that is not there, which is the same defect in a wider form.
    if (!/^triggerHasPopup="(dialog|listbox)"$/.test(declared)) {
      offenders.push(`${site.file}: ${declared} is not one of dialog / listbox`);
      continue;
    }
    if (declared !== 'triggerHasPopup="listbox"') continue;
    if (site.attribute('showSearch') === 'showSearch={false}') continue;
    offenders.push(`${site.file}: announces a listbox and renders the search field`);
  }

  assert.deepEqual(
    offenders.sort((left, right) => left.localeCompare(right)),
    [],
    '`aria-haspopup` states what activating the trigger OPENS. With the search field rendered ' +
      'this primitive opens a dialog that CONTAINS a listbox, so announcing a bare listbox ' +
      'promises a control the GM never gets. Either pass `showSearch={false}`, which is the ' +
      'shape the four converted menus have, or drop `triggerHasPopup` and take the truthful ' +
      `\`dialog\` default:\n  ${offenders.join('\n  ')}`
  );
});

test('a popover that renders no search field announces a listbox', () => {
  // THE CONVERSE OF THE CLAUSE ABOVE, and it is a separate test rather than a second loop in it
  // because it quantifies over a different population: that one reads the sites that DECLARE
  // `triggerHasPopup`, this one reads the sites that suppress the search field. Checking only the
  // first direction is what let one site ship the contradiction — `RecipeIngredientGroupCard`'s
  // row-level `or…` menu passed `showSearch={false}` and no `triggerHasPopup`, so it took the
  // `dialog` default while rendering the primitive's bare-listbox shape, and under the focus
  // model its trigger announces `aria-haspopup="dialog"` beside `role="combobox"` and an
  // `aria-controls` naming a `role="listbox"`. The other four search-suppressed sites all
  // declare it, so the odd one out was invisible to every reader that looked at the four.
  const suppressed = popover.callSites.filter(
    (site) => site.attribute('showSearch') === 'showSearch={false}'
  );
  // A floor rather than a count, and above zero: at zero this clause quantifies over nothing and
  // reports clean. Five sites suppress the field as issue 1503 lands.
  assert.ok(
    suppressed.length >= 5,
    `only ${suppressed.length} call sites suppress the search field, so this clause is vacuous`
  );

  const offenders = suppressed
    .filter((site) => site.attribute('triggerHasPopup') !== 'triggerHasPopup="listbox"')
    .map((site) => `${site.file}: ${site.attribute('triggerHasPopup') ?? 'no triggerHasPopup'}`);

  assert.deepEqual(
    offenders.sort((left, right) => left.localeCompare(right)),
    [],
    '`aria-haspopup` states what activating the trigger OPENS, and with `showSearch={false}` ' +
      'this primitive opens a bare list of choices with no query field in it. The `dialog` ' +
      'default is truthful only for the searchable shape, so a suppressed-search site that ' +
      'takes it promises assistive technology a panel the GM never gets — while the same ' +
      'trigger already carries `role="combobox"` and an `aria-controls` naming a ' +
      `\`role="listbox"\`:\n  ${offenders.join('\n  ')}`
  );
});

test('no call site restates a class the primitive emits itself', () => {
  // Restating it would still WORK — every one of these props APPENDS rather than replaces —
  // which is exactly why it needs a gate rather than a bug report: the site renders
  // identically, the token is emitted twice, and the convention this component exists to
  // close is back. The raw-element clause cannot see it, because
  // `<SearchablePopover triggerClass="manager-travel-picker">` is a COMPONENT node and that
  // detector skips those by design.
  //
  // `manager-travel-picker-trigger` is NOT a restatement and three shipped sites pass it: it
  // is a real, separate class in `styles/fabricate.css` that the primitive does not emit. The
  // `(?![\w-])` termination is what tells the two apart.
  const emitted = [
    'manager-travel-picker',
    'manager-travel-popover',
    'manager-travel-popover-options',
    'manager-travel-option',
    'manager-travel-picker-value',
  ];
  const props = ['triggerClass', 'popoverClass', 'valueClass', 'pickerClass'];
  const offenders = [];
  for (const site of popover.callSites) {
    for (const prop of props) {
      const declared = site.attribute(prop);
      if (!declared) continue;
      for (const token of emitted) {
        if (!new RegExp(String.raw`(?<![\w-])${token}(?![\w-])`).test(declared)) continue;
        offenders.push(`${site.file}: ${declared}`);
      }
    }
  }
  assert.deepEqual(
    offenders.sort((left, right) => left.localeCompare(right)),
    [],
    'the primitive emits these classes itself and APPENDS the caller`s prop after them, so ' +
      `restating one emits the token twice:\n  ${offenders.join('\n  ')}`
  );
});

/**
 * The END STATE of the `.manager-travel-picker` conversion.
 * The short version is sharper here than anywhere it has been so far, because this contract
 * class is a prefix of FOUR other real classes that ship on real elements —
 * `.manager-travel-picker-value` on the trigger's label span, `.manager-travel-picker-trigger`
 * on three call sites' buttons, `.manager-travel-picker-inline` on the inline search row and
 * `.manager-travel-picker-inline-close` on its dismiss button. A `\b`-terminated token pattern
 * matches before a hyphen and would count every one of them; the factory's
 * `classTokenPattern` terminates `(?![\w-])` and does not. The family is broader still:
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from 'svelte/compiler';

import { measureImporters } from '../../scripts/lib/componentImporters.js';
import { repoRoot } from '../helpers/sourceScan.js';
import {
  definePrimitiveAdoptionContract,
  walkTemplate,
} from '../helpers/primitiveAdoptionContract.js';

const POPOVER_PATH = 'src/ui/svelte/components/SearchablePopover.svelte';

/** The primitive itself, and it is the WHOLE allowlist. */
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

/** A synthetic source with a KNOWN raw-site count, driven through the detector by the factory. */
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
  // 23 call sites in 22 components as issue 1503 lands (21 in 20 before it; the two pickers
  // joined), and 24 in 23 as issue 1504 composes `components/Select.svelte` over it. Both
  // figures are the `<SearchablePopover>` component NODES this factory parses, not `grep` hits.
  callSiteFloor: 16,
  fileFloor: 13,
  // Declared boolean props with a `false` default.
  booleanProps: Object.freeze([
    'triggerChip',
    'inlineSearchTrigger',
    'showFilteredCount',
    'compactOptionRows',
    'disabled',
    'triggerAriaDisabled',
    // Issue 1503. `IconPicker` writes it as `ignoreScrollWithin={true}` rather than bare.
    'ignoreScrollWithin',
    // Issue 1513's two, and they have DIFFERENT callers.
    'multiple',
    'stayOpen',
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

/** ISSUE 1513'S TWO CAPABILITIES ARE DEFAULT-OFF, AND THAT IS ASSERTED AS A CONJUNCTION. */
const MULTI_SELECT_ADOPTERS = Object.freeze([
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
  // The link-recipe picker, which takes the GATE ALONE (issue 1513, phase 4). Linking stays one
  // choice at a time — no `multiple`, so the panel still announces a single-value listbox — but
  // linking a second recipe is the common next action and each choice SHRINKS the option list it
  // was made from, which is the case the gate's cursor clamp exists for.
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
]);

// THE TWO PROPS ARE READ THROUGH SEPARATE NON-VACUITY PROBES rather than through the adopter
// list's first entry, because the entries no longer agree about which prop they pass. A single
// probe against one file cannot see a reader that has stopped finding the other, and the
// set-equality clause above passes either way: a pattern matching nothing makes it pass the day
// both adopters are removed, which is the direction that hides.
const MULTIPLE_ADOPTER = 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte';
const STAY_OPEN_ADOPTER = 'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte';

/** Every file with a `<SearchablePopover>` node that passes one of the two capability props. */
function adopterFiles() {
  return [
    ...new Set(
      popover.callSites
        .filter((site) => site.attribute('multiple') || site.attribute('stayOpen'))
        .map((site) => site.file)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

test('`multiple` and `stayOpen` are passed by the adopters alone, so every other importer is unmoved', () => {
  // THE READER IS THE AST, NOT THE FILE TEXT.
  assert.deepEqual(
    adopterFiles(),
    [...MULTI_SELECT_ADOPTERS].sort((left, right) => left.localeCompare(right)),
    'a file outside the adopter set passes `multiple` or `stayOpen`. Both props are additive and ' +
      'default-off precisely so the other importers render exactly as they did, and a new one ' +
      'is a decision about where a multi-selectable listbox is announced'
  );

  // THE POPULATION IS STILL EVERY IMPORTER.
  const importers = measureImporters(repoRoot).importersOf(POPOVER_PATH);
  assert.ok(
    importers.length >= 20,
    `only ${importers.length} importing files, so the import graph stopped seeing this ` +
      'primitive and the clause above quantifies over a corpus nothing verified'
  );
  assert.deepEqual(
    adopterFiles().filter((file) => !importers.includes(file)),
    [],
    'an adopter renders `<SearchablePopover>` without importing it, so the component walk and ' +
      'the import graph disagree about which files this contract is over'
  );

  // NON-VACUITY, on the reader rather than on the result.
  assert.ok(
    popover.callSites.some((site) => site.file === MULTIPLE_ADOPTER && site.attribute('multiple')),
    'the reader must find a `multiple` ATTRIBUTE on the call site in the one file that passes ' +
      'it, or it is finding nothing anywhere and this clause is decorative'
  );
  assert.ok(
    popover.callSites.some((site) => site.file === STAY_OPEN_ADOPTER && site.attribute('stayOpen')),
    'the reader must find a `stayOpen` ATTRIBUTE on the call site in the one file that passes ' +
      'it WITHOUT `multiple`, or the gate is being asserted through the prop that implies it ' +
      'and its own adoption is unmeasured'
  );
});

test('the snippet-trigger naming route reads the element the spread lands on', () => {
  // NON-VACUITY, and it is the whole reason this route can be trusted.
  const snippetSites = popover.callSites.filter((site) => site.snippetSource('trigger'));
  assert.equal(
    snippetSites.length,
    3,
    `${snippetSites.length} call sites hand the primitive a \`trigger\` snippet; three do — ` +
      '`IconPicker`, `EssenceSourceSelector` and, since issue 1513, ' +
      '`apps/crafting/ComponentSourcesBar`. A different number means the route has gained or ' +
      'lost a caller and the figures in this file need re-measuring. The third took the route ' +
      'for a reason neither of the first two states: its trigger is a 40px dashed well sized to ' +
      'the row of portrait buttons beside it, and the rule that draws it is in the CALLER`s ' +
      'scoped block — which cannot reach the primitive`s own button, so `triggerClass` would ' +
      'have named an element no rule of its could paint.'
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
  // NON-VACUITY first, read through a different accessor than the factory's own floors.
  assert.ok(
    popover.callSites.length >= 16,
    `only ${popover.callSites.length} call sites, so this clause has lost most of its domain`
  );

  const unnamed = [];
  for (const site of popover.callSites) {
    // The TRIGGER is named by `triggerAriaLabel` or by a visible `triggerLabel`.
    const triggerName =
      site.attribute('triggerAriaLabel') ??
      site.attribute('triggerLabel') ??
      snippetTriggerName(site);
    if (!triggerName) unnamed.push(`${site.file}: the trigger has no accessible name`);
    // The PANEL is named by `dialogAriaLabel` or by `dialogAriaLabelledBy`.
    const panelName = ['dialogAriaLabel', 'dialogAriaLabelledBy']
      .map((prop) => site.attribute(prop))
      .find((written) => written && !/=(""|'')$/.test(written));
    if (!panelName) {
      unnamed.push(`${site.file}: the popover panel has no accessible name`);
    }
  }

  assert.deepEqual(
    unnamed.sort((left, right) => left.localeCompare(right)),
    [],
    'a `<SearchablePopover>` renders a portaled `role="dialog"` containing a `role="listbox"`, ' +
      'and it names both from `dialogAriaLabel`, or from `dialogAriaLabelledBy` where the ' +
      'caller has a caption rather than a string. With neither, a GM using a screen reader ' +
      'is told a dialog opened and is not told what it is for, then lands in a list with no ' +
      'name either. Nothing else reports this: it is invisible in a frame, it is not a ' +
      "compiler error and no lint rule covers it. `ComponentIdentityStrip`'s source-actions " +
      `menu shipped in exactly that state:\n  ${unnamed.join('\n  ')}`
  );
});

test('a popover announcing a listbox does not render a search field', () => {
  const withPopup = popover.callSites.filter((site) => site.attribute('triggerHasPopup'));
  // The capability has to be REACHED for this clause to mean anything, and it is new.
  assert.ok(
    withPopup.length >= 4,
    `only ${withPopup.length} call sites pass triggerHasPopup, so this clause is vacuous`
  );

  const offenders = [];
  for (const site of popover.callSites) {
    const declared = site.attribute('triggerHasPopup');
    // The default is `dialog`, which is truthful for a searchable panel.
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
  // THE CONVERSE OF THE CLAUSE ABOVE.
  const suppressed = popover.callSites.filter(
    (site) => site.attribute('showSearch') === 'showSearch={false}'
  );
  // A floor rather than a count, and above zero.
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

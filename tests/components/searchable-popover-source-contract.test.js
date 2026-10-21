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
import { createHash } from 'node:crypto';

import { parse } from 'svelte/compiler';

import { measureImporters } from '../../scripts/lib/componentImporters.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { declaredPropNames } from '../helpers/sveltePropsDeclaration.js';
import {
  SOURCES,
  callSitesIn,
  componentCallSites,
  definePrimitiveAdoptionContract,
  walkTemplate,
} from '../helpers/primitiveAdoptionContract.js';

const POPOVER_PATH = 'src/ui/svelte/components/SearchablePopover.svelte';
const PANEL_PATH = 'src/ui/svelte/components/SearchablePopoverPanel.svelte';

/** The primitive itself, and it is the WHOLE allowlist. */
const RAW_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: POPOVER_PATH,
    sites: 1,
    why:
      'The primitive itself. Its picker root writes the token inside a TEMPLATE LITERAL — ' +
      '`class={`manager-travel-picker ${pickerClass}`}` — so unlike `FilterBar`, whose ' +
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
    // Issue 2459's grid-form capabilities, both passed bare by `TintPicker`.
    'squareTiles',
    'keyHints',
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
    'options={…} onSelect={…}>` instead — a per-site modifier travels on `triggerClass`, ' +
    '`popoverClass`, `valueClass` or `pickerClass`, a `data-*` hook on the trigger rides ' +
    '`triggerProps` and one on an option rides that option`s `data` map. If the site is a ' +
    'typeahead COMBOBOX with no trigger, or a `role="menu"` of actions, it is a different ' +
    'widget and belongs in `scripts/lib/designSystemPrimitives.json`, not here',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread, where a bare `data-x` arrives as the boolean `true` and renders `="true"`. ' +
    'Presence selectors resolve either way, which is why the mounted suites and the smoke ' +
    'steps that use them would not catch it. The same is true of a `triggerProps` entry and of ' +
    "an option`s `data` map: spell the value `''`",
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
  walkTemplate(
    parse(snippet, { modern: true, filename: 'trigger-snippet.svelte' }).fragment,
    (node) => {
      if (found || (node.type !== 'RegularElement' && node.type !== 'Component')) return;
      const attributes = node.attributes ?? [];
      if (attributes.every((attribute) => attribute.type !== 'SpreadAttribute')) return;
      const label = attributes.find(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'aria-label'
      );
      if (label) found = snippet.slice(label.start, label.end);
    }
  );
  return found;
}

/** ISSUE 1513'S TWO CAPABILITIES ARE DEFAULT-OFF, AND THAT IS ASSERTED AS A CONJUNCTION. */
const MULTI_SELECT_ADOPTERS = Object.freeze([
  // `SetPicker` (issue 1782) is the set-picking adopter: the crafting sources bar and the
  // recipe-item contents tab, the two files issue 1513 converted onto `multiple` and `stayOpen`,
  // reach the panel through it rather than passing either prop themselves.
  'src/ui/svelte/components/SetPicker.svelte',
  // The Journal's run-type filter (issue 1644): a multi-select over the four kinds by maintainer
  // ruling 2026-10-05, applying each choice as it is made with no query field.
  'src/ui/svelte/apps/journal/JournalKindFilter.svelte',
  // The requirement row's tag adder (issue 2430): each choice writes one add or one remove at
  // once, so its held tags are announced selected through `multiple` rather than `SetPicker`.
  'src/ui/svelte/components/PickerRow.svelte',
  // The routing line's Assign (issue 2512): each choice assigns or unassigns one source at once,
  // so a set's assigned sources are announced selected through `multiple`.
  'src/ui/svelte/components/RouteSources.svelte',
]);

// The reader is probed rather than trusted: a pattern matching nothing makes the set-equality
// clause pass the day the adopter is removed, which is the direction that hides.
const MULTIPLE_ADOPTER = 'src/ui/svelte/components/SetPicker.svelte';

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
    'the reader must find a `multiple` ATTRIBUTE on the call site in the set-picking adopter, ' +
      'or it is finding nothing anywhere and this clause is decorative'
  );
});

/**
 * The primitive's `$props()` destructure, verbatim — the opening `let {` through the closing
 * `} = $props();`.
 */
function propsBlock() {
  const source = SOURCES[POPOVER_PATH] ?? '';
  const closer = '} = $props();';
  const start = source.indexOf('  let {');
  const end = source.indexOf(closer, start);
  assert.ok(start !== -1 && end > start, `${POPOVER_PATH} declares no \`let { … } = $props()\``);
  return source.slice(start, end + closer.length);
}

/** The destructure's digest (issues 1719, 1507). */
// Re-derived at issue 1782, which added `source`, `loading` and `error` after `options`, and at
// issue 2459, which added `squareTiles` after `columns`, `keyHints` and `footerAction` after
// `footer`, and `anchor` (default `undefined`, so its presence is the mode) after `bounds`.
const PROPS_BLOCK_DIGEST = '7452c440d73141452e983d1231bc4b63fc64d39b25941d68f0ae76dc9170d824';
const PROPS_BLOCK_NAMES = 66;

test('the declared prop surface is byte-identical to the pre-decomposition block', () => {
  // Why a digest and not a list. The decomposition at issue 1719 moved two thirds of this
  // component out of it, and the one thing it must not have moved is what its 24 importers pass:
  // a name, an order or a default silently changed here is a behaviour change at every one of
  // them, and the mounted suites would keep passing because they pass their props by name. A
  // names-only assertion cannot see a changed default and a sorted one cannot see a reordering,
  // so the whole block is compared; the count below is the readable half of the same claim.
  const block = propsBlock();
  assert.equal(
    declaredPropNames(block + '\n').length,
    PROPS_BLOCK_NAMES,
    'the number of declared props changed, so the public surface changed'
  );
  assert.equal(
    createHash('sha256').update(block).digest('hex'),
    PROPS_BLOCK_DIGEST,
    'the `$props()` destructure is no longer byte-identical to the block this component shipped ' +
      'before its panel was extracted. A decomposition must not touch it. If the surface is ' +
      'meant to change, re-derive this digest in the same commit and say which name, order or ' +
      `default moved and why. The block read:\n${block}`
  );
});

// `SetPicker` forwards its `trigger` snippet to this primitive as a prop (issue 1782), so a snippet
// handed to a `<SetPicker>` never appears at a `<SearchablePopover>` node and is read at its own.
const setPickerSites = componentCallSites('SetPicker');

test('the snippet-trigger naming route reads the element the spread lands on', () => {
  // NON-VACUITY, and it is the whole reason this route can be trusted.
  const snippetSites = popover.callSites.filter((site) => site.snippetSource('trigger'));
  assert.equal(
    snippetSites.length,
    4,
    `${snippetSites.length} call sites hand the primitive a \`trigger\` snippet; four do — ` +
      "`IconPicker`, `EssenceSourceSelector`, `ComponentSalvageCard`'s salvage adder (issue " +
      "1516) and `RouteSources`' Assign (issue 2512). A different number means the route has " +
      'gained or lost a caller and the figures in this file need re-measuring.'
  );
  const setPickerSnippetSites = setPickerSites.filter((site) => site.snippetSource('trigger'));
  assert.deepEqual(
    setPickerSnippetSites.map((site) => site.file),
    ['src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte'],
    'one `<SetPicker>` hands it a `trigger` snippet: the crafting sources bar, whose 40px `+` ' +
      'well is sized to its portraits. The contents tab names the default Add by `addLabel`.'
  );

  for (const site of setPickerSnippetSites) {
    assert.ok(
      snippetTriggerName(site),
      `${site.file} hands \`SetPicker\` a \`trigger\` snippet and writes no \`aria-label\` on ` +
        'the element the forwarded attributes are spread onto, so its button has no name'
    );
    for (const prop of ['addLabel', 'addProps']) {
      assert.ok(
        !site.attribute(prop),
        `${site.file} passes both a \`trigger\` snippet and \`${prop}\`, which belongs to the ` +
          'default Add the snippet replaces: a label would name nothing, and the attributes ride ' +
          'the spread onto the snippet’s button, overriding what it writes.'
      );
    }
  }

  for (const site of snippetSites) {
    assert.ok(
      snippetTriggerName(site),
      `${site.file} hands the primitive a \`trigger\` snippet and writes no \`aria-label\` on ` +
        'the element the primitive`s attributes are spread onto, so the button it renders in ' +
        'place of the primitive`s own has no accessible name'
    );
    assert.ok(
      !site.attribute('ariaLabel'),
      `${site.file} passes both a \`trigger\` snippet and \`ariaLabel\`. The primitive ` +
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
  const named = decoy.replace(
    '<button {...attributes}>',
    '<button aria-label="Go" {...attributes}>'
  );
  assert.notEqual(named, decoy, 'the discrimination control did not perturb the fixture');
  assert.ok(
    snippetTriggerName({ snippetSource: () => named }),
    'the reader does not find an `aria-label` on the spread target either, so the control above ' +
      'measured a reader that never works rather than one that discriminates'
  );
});

test('the anchor the picker hands its panel is what the panel positions against', () => {
  // One chain across two files (issue 1719). The picker owns the trigger element and the panel owns
  // the attachment, so the fact `anchoredPopover` is measured against the trigger — not the picker
  // root, and not a `triggerButton` options object — is now two spellings that have to agree. A
  // mounted assertion cannot see the difference: happy-dom returns a zero-valued
  // `getBoundingClientRect` for either node, so the panel lands at the same place when it is wrong.
  const picker = SOURCES[POPOVER_PATH] ?? '';
  const panel = SOURCES[PANEL_PATH] ?? '';
  assert.match(
    picker,
    /anchor=\{anchorNode\(\) \?\? triggerElement \?\? pickerRoot\}/,
    `${POPOVER_PATH} no longer hands the panel a caller's anchor first, then the trigger element, ` +
      'falling back to its own root (issue 2459)'
  );
  assert.match(
    panel,
    /trigger: anchor,/,
    `${PANEL_PATH} no longer positions against the anchor it was handed, so the panel would be ` +
      'measured against whatever the attachment defaults to'
  );
  assert.ok(
    declaredPropNames(panel).includes('anchor'),
    `${PANEL_PATH} no longer declares an \`anchor\` prop, so the regex above could match a ` +
      'renamed local rather than the prop the picker actually passes'
  );
});

const TINT_PICKER_PATH = 'src/ui/svelte/components/TintPicker.svelte';

/**
 * `TintPicker` forwards its caller's `anchor` and `trigger` to the one site it renders, and
 * either may be `undefined`, so that site alone writes both — and only as the bare identities.
 */
const isTintForwardingSite = (site) =>
  site.file === TINT_PICKER_PATH &&
  site.attribute('anchor') === '{anchor}' &&
  site.attribute('trigger') === '{trigger}';

/** What an `anchor` call site passes that the anchored shape refuses (issue 2459). */
function anchorSiteRefusals(site) {
  if (!site.attribute('anchor')) return [];
  const refused = [];
  const passed = (name) => site.attribute(name) && site.attribute(name) !== name.concat('={false}');
  const forwards = isTintForwardingSite(site);
  if ((site.attribute('trigger') && !forwards) || site.snippetSource('trigger')) {
    refused.push('trigger');
  }
  if (site.attribute('showSearch') === 'showSearch={false}') refused.push('showSearch={false}');
  for (const name of ['inlineSearchTrigger', 'disabled', 'triggerAriaDisabled']) {
    if (passed(name)) refused.push(name);
  }
  const bindsOpen = (site.node.attributes ?? []).some(
    (attribute) => attribute.type === 'BindDirective' && attribute.name === 'open'
  );
  if (!bindsOpen) refused.push('no bind:open');
  return refused.map((what) => `${site.file}: ${what}`);
}

test('an anchored popover passes no trigger prop and binds `open`', () => {
  // The reader is proved on fixtures first, then on the one shipped forwarding site.
  const fixture = (attributes, children = '') =>
    callSitesIn(
      'anchor-fixture.svelte',
      [
        '<SearchablePopover anchor={node} panelLabel="Icons" ',
        attributes,
        '>',
        children,
        '</SearchablePopover>',
      ].join(''),
      'SearchablePopover'
    )[0];
  assert.deepEqual(anchorSiteRefusals(fixture('bind:open')), [], 'the accepted shape');
  for (const [attributes, children, what] of [
    ['', '', 'no bind:open'],
    ['bind:open trigger={button}', '', 'trigger'],
    ['bind:open', '{#snippet trigger({ attributes })}<b {...attributes}></b>{/snippet}', 'trigger'],
    ['bind:open showSearch={false}', '', 'showSearch={false}'],
    ['bind:open inlineSearchTrigger', '', 'inlineSearchTrigger'],
    ['bind:open disabled={busy}', '', 'disabled'],
    ['bind:open triggerAriaDisabled', '', 'triggerAriaDisabled'],
  ]) {
    assert.deepEqual(
      anchorSiteRefusals(fixture(attributes, children)),
      [`anchor-fixture.svelte: ${what}`],
      `${attributes} ${children}`
    );
  }

  // The forwarding exemption is the file and the bare identities, and nothing else of the shape.
  const forwarding = (file, trigger = '{trigger}', more = '') =>
    anchorSiteRefusals(
      callSitesIn(
        file,
        [
          '<SearchablePopover',
          '{anchor}',
          trigger,
          'bind:open panelLabel="Tints"',
          more,
          '/>',
        ].join(' '),
        'SearchablePopover'
      )[0]
    );
  assert.deepEqual(forwarding(TINT_PICKER_PATH), [], "TintPicker's forwarding site");
  assert.deepEqual(forwarding('anchor-fixture.svelte'), ['anchor-fixture.svelte: trigger']);
  assert.deepEqual(forwarding(TINT_PICKER_PATH, 'trigger={swatch}'), [
    `${TINT_PICKER_PATH}: trigger`,
  ]);
  assert.deepEqual(forwarding(TINT_PICKER_PATH, '{trigger}', 'disabled'), [
    `${TINT_PICKER_PATH}: disabled`,
  ]);
  assert.deepEqual(
    popover.callSites.filter(isTintForwardingSite).map((site) => site.file),
    [TINT_PICKER_PATH],
    'exactly one shipped site forwards both an anchor and a trigger: the tint popover'
  );

  assert.deepEqual(
    popover.callSites.flatMap(anchorSiteRefusals),
    [],
    'an `anchor` site renders no trigger, so every trigger prop is a dead letter and the caller ' +
      'must own `open`, because nothing of the primitive’s can open the panel'
  );
});

// `TintPicker` forwards its popover props to this primitive, so its own sites are read here too.
const tintPickerSites = componentCallSites('TintPicker');
const TINT_PICKER_PROPS = new Set(declaredPropNames(SOURCES[TINT_PICKER_PATH] ?? ''));
const RETIRED_TINT_PROPS = ['manageDismiss', 'onDismiss', 'registerPopoverNode'];

/** What a `<TintPicker>` site passes that the forwarded popover refuses (issue 2459). */
function tintPickerSiteRefusals(site) {
  const refused = [];
  const bindsOpen = (site.node.attributes ?? []).some(
    (attribute) => attribute.type === 'BindDirective' && attribute.name === 'open'
  );
  const trigger = site.attribute('trigger') ?? site.snippetSource('trigger');
  if (site.attribute('anchor')) {
    if (!bindsOpen) refused.push('anchor with no bind:open');
    if (trigger) refused.push('anchor with a trigger');
  } else if (site.attribute('layout') !== 'layout="inline"' && !trigger) {
    refused.push('a popover with neither an anchor nor a trigger');
  }
  if (site.snippetSource('trigger') && !snippetTriggerName(site)) {
    refused.push('a trigger snippet whose button has no aria-label');
  }
  for (const attribute of site.node.attributes ?? []) {
    if (!attribute.name || TINT_PICKER_PROPS.has(attribute.name)) continue;
    refused.push(`undeclared ${attribute.name}`);
  }
  return refused.map((what) => `${site.file}: ${what}`);
}

test('a tint picker site opens its popover by an anchor it binds or by a named trigger', () => {
  const fixture = (attributes, children = '') =>
    tintPickerSiteRefusals(
      callSitesIn(
        'tint-fixture.svelte',
        `<TintPicker ${attributes}>${children}</TintPicker>`,
        'TintPicker'
      )[0]
    );
  const named =
    '{#snippet trigger({ attributes })}<button aria-label="Tint" {...attributes}></button>{/snippet}';
  assert.deepEqual(fixture('anchor={node} bind:open'), [], 'the anchored shape');
  assert.deepEqual(fixture('', named), [], 'the trigger shape');
  assert.deepEqual(fixture('layout="inline"'), [], 'the inline strip');
  for (const [attributes, children, what] of [
    ['anchor={node}', '', 'anchor with no bind:open'],
    ['anchor={node} bind:open', named, 'anchor with a trigger'],
    ['', '', 'a popover with neither an anchor nor a trigger'],
    [
      '',
      named.replace(' aria-label="Tint"', ''),
      'a trigger snippet whose button has no aria-label',
    ],
    ['layout="inline" manageDismiss={false}', '', 'undeclared manageDismiss'],
  ]) {
    assert.deepEqual(fixture(attributes, children), [`tint-fixture.svelte: ${what}`], what);
  }
  assert.ok(TINT_PICKER_PROPS.has('anchor'), 'the declared-prop reader reads TintPicker');

  // Non-vacuity: the shipped sites are the anchored biome, the swatch trigger and four strips.
  assert.equal(tintPickerSites.length, 6, `${tintPickerSites.length} <TintPicker> sites`);
  assert.deepEqual(
    tintPickerSites.flatMap(tintPickerSiteRefusals),
    [],
    'a <TintPicker> popover is opened by a caller-bound anchor or by a named trigger snippet, ' +
      'and passes only the props TintPicker declares; it declares no rest, so an unknown prop ' +
      `is silently dropped. ${RETIRED_TINT_PROPS.join(', ')} retired at issue 2459, when the ` +
      'panel became the picker grid form and stopped positioning or dismissing through its caller'
  );
});

/** What a `squareTiles` call site passes that the square-tile shape refuses (issue 2459). */
function squareTileSiteRefusals(site) {
  const passed = (name) => site.attribute(name) && site.attribute(name) !== name.concat('={false}');
  if (!passed('squareTiles')) return [];
  return ['compactOptionRows', 'multiple']
    .filter((name) => passed(name))
    .map((name) => `${site.file}: squareTiles with ${name}`);
}

test('a square-tile grid is neither the compact rows nor a multi-select', () => {
  // A square tile is text-free and marks selection by its ground alone, so the compact rows'
  // bordered two-line row and a multi-select's membership face have nothing to draw on.
  // Non-vacuity: no shipped caller draws square tiles yet, so the reader is proved on fixtures first.
  const fixture = (attributes) =>
    callSitesIn(
      'square-tile-fixture.svelte',
      `<SearchablePopover as="grid" columns={4} panelLabel="Icons" ${attributes} />`,
      'SearchablePopover'
    )[0];
  assert.deepEqual(squareTileSiteRefusals(fixture('squareTiles')), [], 'the accepted shape');
  assert.deepEqual(squareTileSiteRefusals(fixture('compactOptionRows multiple')), []);
  for (const name of ['compactOptionRows', 'multiple']) {
    assert.deepEqual(
      squareTileSiteRefusals(fixture(`squareTiles ${name}`)),
      [`square-tile-fixture.svelte: squareTiles with ${name}`],
      name
    );
  }
  assert.deepEqual(squareTileSiteRefusals(fixture('squareTiles multiple={false}')), []);

  assert.deepEqual(
    popover.callSites.flatMap(squareTileSiteRefusals),
    [],
    'a square tile renders no text and draws only its own ground, so it cannot carry the ' +
      'compact rows or a multi-select'
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
    // The trigger is named by `ariaLabel` or by a visible `triggerLabel`. An `anchor` site renders
    // no trigger, so the caller's own control is named where it is drawn (issue 2459).
    const triggerName =
      site.attribute('anchor') ??
      site.attribute('ariaLabel') ??
      site.attribute('triggerLabel') ??
      snippetTriggerName(site);
    if (!triggerName) unnamed.push(`${site.file}: the trigger has no accessible name`);
    // The panel is named by `panelLabel` or by `panelLabelledBy`.
    const panelName = ['panelLabel', 'panelLabelledBy']
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
      'and it names both from `panelLabel`, or from `panelLabelledBy` where the ' +
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

/**
 * Specimens: a shipped component mounted DIRECTLY by a fixture-only wrapper under
 * `tests/view-lab/fixtures/`, for props no shipped caller passes yet (issue 1782). A specimen frame
 * depicts a state no GM can reach today, so each label says so; it is not a smoke counterpart.
 */

import { INSPECTOR_PANEL_PATTERN } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

/**
 * The seam, its lazy loading, its prop kinds, its callbacks, its values, its overlay chain, its
 * manifest, its adapter and its host: each redraws what it mounts.
 */
const PUBLISHED_SEAM_SOURCES = Object.freeze([
  /^src\/ui\/publishedComponentSeam\.js$/,
  /^src\/ui\/publishedComponentLoading\.js$/,
  /^src\/ui\/publishedComponentProps\.js$/,
  /^src\/ui\/publishedComponentCallbacks\.js$/,
  /^src\/ui\/publishedComponentValues\.js$/,
  /^src\/ui\/publishedComponentOverlays\.js$/,
  /^src\/ui\/publishedComponentManifest\.js$/,
  /^src\/ui\/publishedComponents\.svelte\.js$/,
  /^src\/ui\/svelte\/published\/PublishedComponentHost\.svelte$/,
]);

/** The leaves fixture mounts two empty panels, so a selector says which: the hero, or the filtered. */
const HERO_PANEL = '.manager-empty:not(.is-filtered)';
const FILTERED_PANEL = '.manager-empty.is-filtered';

/** The leaves fixture's ground: the one `div` whose sections hold every mounted root. */
const LEAVES_GROUND = [
  '.fab-avatar[data-avatar="image"]',
  '.fab-avatar[data-avatar="initials"]',
  '.fab-medallion[data-medallion="image"]',
  '.fab-medallion[data-medallion="glyph"]',
  '.fab-fill-bar',
  '.fab-meter[aria-labelledby]',
  '.fab-banded-bar.is-single',
  '.fab-banded-bar.is-histogram',
  '.fab-stat-box',
  '.fab-kicker.is-accent > span',
  '.manager-chip.is-warning.is-list > span',
  '.fab-rail',
  '.fabricate-card',
  HERO_PANEL,
  '.fab-notice',
  FILTERED_PANEL,
].reduce((ground, root) => `${ground}:has(> section > div > ${root})`, 'div');

/** How many mounts `tests/view-lab/fixtures/PublishedLeaves.svelte` makes, one section each. */
const LEAF_MOUNTS = 28;

/** Each mount that fixture makes inside another's content slot, as host, host root and nested names. */
const NESTED_LEAF_MOUNTS = Object.freeze([
  ['Rail', '.fab-rail', ['Meter', 'InfoStrip']],
  ['InspectorCard', '.fabricate-card', ['Kicker', 'StatBox']],
  ['EmptyState', HERO_PANEL, ['Button']],
  ['EmptyState', FILTERED_PANEL, ['Button']],
]);

/** One containment per nested mount: its root inside the root of the mount whose slot holds it. */
const NESTED_LEAF_CONTAINMENT = NESTED_LEAF_MOUNTS.flatMap(([host, root, nested]) => {
  const container = `${LEAVES_GROUND} > section[data-published="${host}"] > div > ${root}`;
  return nested.map((name) => ({ container, target: `${container} [data-nested="${name}"] > *` }));
});

/** The one mounted chip at the default density, whose long label wraps inside its 88px track. */
const WRAPPED_CHIP = `${LEAVES_GROUND} > section > div > .manager-chip:not(.is-list)`;

/** A slot element and the wrapper that holds it: neither takes a box in its host's column. */
const SLOT_BOX = 'display: contents';

/** The portrait ladder's single mark, whose edge includes its border under Foundry's reset. */
const PORTRAIT_BOX = 'box-sizing: border-box; width: 32px; height: 32px';

/** The controls fixture's ground, and one of its sections by the key the fixture gives it. */
const CONTROLS_GROUND = '[data-lab-controls]';
const CONTROL_SECTION = (key) => `[data-lab-control="${key}"]`;
const CONTROL = (key) => `${CONTROLS_GROUND} > ${CONTROL_SECTION(key)}`;
const CONTROL_ACTION = (key) => `${CONTROL(key)} [data-notice-action]`;

/** The ground once the first two steps have acted: the first notice redrawn, the second's count at one. */
const ACTED_GROUND = [
  CONTROLS_GROUND,
  `:has(> ${CONTROL_SECTION('resume')} .fab-notice.is-success)`,
  `:has(> ${CONTROL_SECTION('count')} .fab-notice[data-lab-presses="1"])`,
].join('');

/** Each notice `tests/view-lab/fixtures/PublishedControls.svelte` mounts, by its section's key. */
const CONTROL_KEYS = Object.freeze(['resume', 'count', 'wide', 'hold', 'undo']);

/** The action button's own box, type and ink, the same at every tone. */
const ACTION_BUTTON = 'height: 28px; font-size: 12.5px; color: var(--fab-text-secondary)';

/** The same fixture's band of published buttons, and one of them by its section's key. */
const BUTTONS_GROUND = '[data-lab-buttons]';
const BUTTON_SECTION = (key) => `[data-lab-button="${key}"]`;
const LAB_BUTTON = (key) => `${BUTTONS_GROUND} ${BUTTON_SECTION(key)} button`;

/** Each button that fixture mounts, by its section's key. */
const BUTTON_KEYS = Object.freeze([
  'clear',
  'create',
  'back',
  'delete',
  'review',
  'add',
  'add-wide',
  'wide',
  'off',
  'off-primary',
  'long',
  'card-back',
  'card-add',
]);

/**
 * Each visual role at rest in the sheet's own declared values, then `fullWidth` at its cell's
 * width and at the two-cell span's, the disabled look at two roles, and the 34px box a four-line
 * label spills past without growing it.
 */
const RESTING_BUTTONS = Object.freeze(
  [
    [
      'clear',
      'min-height: 34px; border-radius: 9px; color: var(--fab-text); background-color: var(--fab-surface-soft)',
    ],
    ['create', 'color: var(--fab-on-success); background-color: var(--fab-success)'],
    [
      'back',
      'color: var(--fab-text-muted); background-color: rgba(0, 0, 0, 0); border-color: var(--fab-border)',
    ],
    ['delete', 'color: var(--fab-danger-text); border-color: var(--fab-danger-border)'],
    ['review', 'color: var(--fab-warning-text); background-color: var(--fab-warning-soft)'],
    ['add', 'border-top-style: dashed; color: var(--fab-text-muted)'],
    ['add-wide', 'width: 568px'],
    ['wide', 'width: 280px'],
    ['off', 'opacity: 0.62; cursor: default; color: var(--fab-text-muted)'],
    ['off-primary', 'opacity: 0.62; color: var(--fab-text-muted)'],
    ['long', 'height: 34px'],
  ].map(([key, styles]) => ({ selector: LAB_BUTTON(key), styles }))
);

/** The band once both of the buttons case's steps have acted: each pressed button's count at one. */
const PRESSED_BUTTONS = [
  BUTTONS_GROUND,
  `:has(> ${BUTTON_SECTION('clear')} button[data-lab-presses="1"])`,
  `:has(> ${BUTTON_SECTION('create')} button[data-lab-presses="1"])`,
].join('');

/** The same fixture's band of published switches, and one of them by its section's key. */
const TOGGLES_GROUND = '[data-lab-toggles]';
const TOGGLE_SECTION = (key) => `[data-lab-toggle="${key}"]`;
const LAB_TOGGLE = (key) => `${TOGGLES_GROUND} ${TOGGLE_SECTION(key)} button`;
const TOGGLE_TRACK = (key) => `${LAB_TOGGLE(key)} > .manager-status-toggle-track`;

/** Each switch that fixture mounts, by its section's key. */
const TOGGLE_KEYS = Object.freeze([
  'group',
  'hide',
  'press',
  'key',
  'long',
  'dangling',
  'card-on',
  'card-off',
]);

/** The band once both of the toggles case's steps have acted: the clicked switch on, its count at one. */
const PRESSED_TOGGLES = [
  TOGGLES_GROUND,
  `:has(> ${TOGGLE_SECTION('press')} button[data-lab-presses="1"][aria-pressed="true"])`,
].join('');

/**
 * The same fixture's band of dismissable notices, one of its sections by the notice's tone, and
 * the published button beneath each that stands for the companion's next control.
 */
const DISMISSALS_GROUND = '[data-lab-dismissals]';
const DISMISSAL_SECTION = (tone) => `[data-lab-dismissal="${tone}"]`;
const DISMISSAL = (tone) =>
  `${CONTROLS_GROUND} > ${DISMISSALS_GROUND} > ${DISMISSAL_SECTION(tone)}`;
const NEXT_BUTTON = (tone) => `${DISMISSAL(tone)} > [data-lab-next] button`;

/** Each dismissable notice that fixture mounts, by its section's tone. */
const DISMISSAL_TONES = Object.freeze(['danger', 'accent']);

/** The 2px accent keyboard ring with 2px of ground between ring and control. */
const ACCENT_RING =
  'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent)';

/**
 * Each notice, each button, each switch and each dismissal's section and next control inside the
 * ground, and the ground inside the window. A dismissal's section, not its notice, because one
 * case's press removes the notice.
 */
const CONTROLS_CONTAINMENT = Object.freeze([
  ...CONTROL_KEYS.map((key) => ({
    container: CONTROLS_GROUND,
    target: `${CONTROL(key)} > div > .fab-notice`,
  })),
  ...BUTTON_KEYS.map((key) => ({ container: CONTROLS_GROUND, target: LAB_BUTTON(key) })),
  ...TOGGLE_KEYS.map((key) => ({ container: CONTROLS_GROUND, target: LAB_TOGGLE(key) })),
  ...DISMISSAL_TONES.flatMap((tone) => [
    { container: CONTROLS_GROUND, target: DISMISSAL(tone) },
    { container: CONTROLS_GROUND, target: NEXT_BUTTON(tone) },
  ]),
  { container: '.window-content', target: CONTROLS_GROUND },
]);

/** Sized to the fixture's 592px ground and the height of its notices, buttons, switches and dismissals. */
const CONTROLS_WINDOW = Object.freeze({ width: 680, height: 940 });

/** The values fixture's ground, one of its sections by key, and a part of that section's stepper. */
const VALUES_GROUND = '[data-lab-values]';
const STEPPER_SECTION = (key) => `[data-lab-stepper="${key}"]`;
const LAB_STEPPER = (key, part) => `${VALUES_GROUND} ${STEPPER_SECTION(key)} ${part}`;
const INCREMENT = 'button[data-stepper-increment]';

/** Each stepper `tests/view-lab/fixtures/PublishedValues.svelte` mounts, by its section's key. */
const STEPPER_KEYS = Object.freeze(['credit', 'count', 'even', 'limit', 'card']);

/**
 * The ground once the steppers case's first five steps have acted: `credit` and `count` stepped up,
 * `even` holding 2 and showing it after refusing a typed 3, and `card` stepped down by its key.
 */
const STEPPED_VALUES = [
  VALUES_GROUND,
  `:has(> ${STEPPER_SECTION('credit')}[data-lab-value="4"])`,
  `:has(> ${STEPPER_SECTION('count')}[data-lab-value="3"])`,
  `:has(> ${STEPPER_SECTION('even')}[data-lab-value="2"][data-lab-shown="2"]:not([data-lab-refused="0"]))`,
  `:has(${STEPPER_SECTION('card')}[data-lab-value="3"])`,
].join('');

/** Each stepper inside the ground, and the ground inside the window. */
const VALUES_CONTAINMENT = Object.freeze([
  ...STEPPER_KEYS.map((key) => ({ container: VALUES_GROUND, target: LAB_STEPPER(key, 'input') })),
  { container: '.window-content', target: VALUES_GROUND },
]);

/** The 2px accent ring at the focused part's own edge, by its shape alone. */
const STEPPER_RING = 'outline-style: solid; outline-width: 2px; outline-offset: 0px';

/** Sized to the fixture's 320px ground and the height of its five rows. */
const VALUES_WINDOW = Object.freeze({ width: 480, height: 520 });

/** The search fixture's ground, one of its sections by key, and a part of that section's field. */
const SEARCH_GROUND = '[data-lab-search-ground]';
const SEARCH_SECTION = (key) => `[data-lab-search="${key}"]`;
const LAB_SEARCH = (key, part) => `${SEARCH_GROUND} ${SEARCH_SECTION(key)} ${part}`;

/** Each field `tests/view-lab/fixtures/PublishedSearch.svelte` mounts, by its section's key. */
const SEARCH_KEYS = Object.freeze(['empty', 'filled', 'transform']);

/** Each field inside the ground, and the ground inside the window. */
const SEARCH_CONTAINMENT = Object.freeze([
  ...SEARCH_KEYS.map((key) => ({
    container: SEARCH_GROUND,
    target: LAB_SEARCH(key, '.fabricate-search'),
  })),
  { container: '.window-content', target: SEARCH_GROUND },
]);

/** Sized to the fixture's 320px ground and the height of its three fields. */
const SEARCH_WINDOW = Object.freeze({ width: 480, height: 360 });

/** The select fixture's ground, one of its sections by key, and a part of that section's select. */
const SELECT_GROUND = '[data-lab-select-ground]';
const SELECT_SECTION = (key) => `[data-lab-select="${key}"]`;
const LAB_SELECT = (key, part) => `${SELECT_GROUND} ${SELECT_SECTION(key)} ${part}`;
const SELECT_TRIGGER = '.fabricate-select-trigger';

/** The list the ground hosts as `hosted`'s `overlayHost`, in the container the seam mounts there. */
const HOSTED_LIST = `${SELECT_GROUND} > div > .fabricate-select-popover`;
/** The list the seam's standalone layer hosts for `layer`, whose frame carries no app root. */
const LAYER_LIST =
  'body > .fabricate.fabricate-standalone-overlay > div > .fabricate-select-popover';
/** One option of a list, by the value the fixture passes. */
const SELECT_OPTION = (list, value) => `${list} [data-popover-option="${value}"]`;

/** Each trigger inside the ground, and the ground inside the window. */
const SELECT_CONTAINMENT = Object.freeze([
  ...['hosted', 'layer'].map((key) => ({
    container: SELECT_GROUND,
    target: LAB_SELECT(key, SELECT_TRIGGER),
  })),
  { container: '.window-content', target: SELECT_GROUND },
]);

/** Sized to the fixture's 320px ground, the room it reserves for the hosted list, and the layer's list beneath the second select. */
const SELECT_WINDOW = Object.freeze({ width: 480, height: 440 });

/** The stage bars fixture's ground, and one of its sections by key: relative to the ground, for inside its `:has()`, and from the document. */
const STAGE_BARS_GROUND = '[data-lab-stage-bars-ground]';
const STAGE_BARS_SECTION_IN_GROUND = (key) => `> [data-lab-stage-bars="${key}"]`;
const STAGE_BARS_SECTION = (key) => `${STAGE_BARS_GROUND} ${STAGE_BARS_SECTION_IN_GROUND(key)}`;

/** Each group `tests/view-lab/fixtures/PublishedStageBars.svelte` mounts, by its section's key. */
const STAGE_BARS_KEYS = Object.freeze(['forge', 'brew', 'copy']);

/** Sized to the fixture's 360px ground and the height of its three groups. */
const STAGE_BARS_WINDOW = Object.freeze({ width: 480, height: 320 });

/** The field fixture's ground, and its one section's companion input and caption span. */
const FIELD_GROUND = '[data-lab-field-ground]';
const FIELD_SECTION = `${FIELD_GROUND} > [data-lab-field="name"]`;
const FIELD_INPUT = `${FIELD_SECTION} .fabricate-field input`;
const FIELD_CAPTION = `${FIELD_SECTION} #lab-published-field-caption`;

/** Sized to the fixture's 320px ground and the height of its one field. */
const FIELD_WINDOW = Object.freeze({ width: 440, height: 240 });

/** The well fixture's ground, the published well inside its card, and the companion's element. */
const WELL_GROUND = '[data-lab-well-ground]';
const WELL = `${WELL_GROUND} .fabricate-card .fab-well`;
const WELL_CONTENT = `${WELL} [data-lab-well-content]`;

/** Sized to the fixture's 320px ground and the height of its one card. */
const WELL_WINDOW = Object.freeze({ width: 440, height: 320 });

/** The callout fixture's ground, one section's published note by its key, and its actions host. */
const CALLOUT_GROUND = '[data-lab-callout-ground]';
const CALLOUT = (key) => `${CALLOUT_GROUND} > [data-lab-callout="${key}"] .manager-callout`;
const CALLOUT_ACTIONS = `${CALLOUT('actions')} > .manager-callout-actions`;

/** Sized to the fixture's 360px ground and the height of its six notes. */
const CALLOUT_WINDOW = Object.freeze({ width: 480, height: 560 });

/** The icon button fixture's ground, one row and its published button by key, and the notes. */
const ICON_BUTTONS = '[data-lab-icon-buttons]';
const ICON_ROW = (key) => `${ICON_BUTTONS} > [data-lab-icon-button="${key}"]`;
const ICON_BUTTON = (key) => `${ICON_ROW(key)} button`;
const ICON_NOTES = `${ICON_BUTTONS} > [data-lab-icon-notes]`;
const ICON_BUTTON_KEYS = Object.freeze([
  'neutral',
  'primary',
  'ghost',
  'danger',
  'ghost-danger',
  'size-24',
  'size-26',
  'disabled',
  'expand',
]);

/** Sized to the fixture's 360px ground and the height of its nine rows and the notes beneath. */
const ICON_BUTTONS_WINDOW = Object.freeze({ width: 480, height: 560 });

/**
 * The tabs fixture's ground, the strip's target and tablist, its first two tabs, Inputs and
 * Outputs, by place, and the companion's panel.
 */
const TABS_GROUND = '[data-lab-tabs]';
const TABS_TARGET = `${TABS_GROUND} > [data-lab-tabs-target]`;
const TABLIST = `${TABS_TARGET} > [role="tablist"]`;
const INPUTS_TAB = `${TABLIST} > [role="tab"]:first-child`;
const OUTPUTS_TAB = `${TABLIST} > [role="tab"]:nth-child(2)`;
const TABS_PANEL = `${TABS_GROUND} > [data-lab-tabs-panel]`;

/** Sized to the fixture's 360px ground, its strip and its one panel. */
const TABS_WINDOW = Object.freeze({ width: 480, height: 240 });

/**
 * The option cards fixture's ground and the group's target, its fieldset and legend, and the
 * Breakable and Immune cards and their radios, by value.
 */
const CARDS_GROUND = '[data-lab-option-cards]';
const CARDS_TARGET = `${CARDS_GROUND} > [data-lab-option-cards-target]`;
const CARDS_FIELDSET = `${CARDS_TARGET} > fieldset`;
const CARDS_LEGEND = `${CARDS_FIELDSET} > legend`;
const optionCard = (value) => `${CARDS_FIELDSET} [data-radio-card-option="${value}"]`;
const optionRadio = (value) => `${optionCard(value)} input[type="radio"]`;

/** Sized to the fixture's 420px ground and its two rows of cards. */
const CARDS_WINDOW = Object.freeze({ width: 540, height: 300 });

/** The segmented fixture's filter ground and target, and a filter segment and its radio, by value. */
const SEGMENTED_GROUND = '[data-lab-segmented-ground="filter"]';
const SEGMENTED_TARGET = `${SEGMENTED_GROUND} > [data-lab-segmented="filter"]`;
const filterRadio = (value) => `[data-lab-segmented="filter"] input[value="${value}"]`;
const filterSegment = (value) =>
  `[data-lab-segmented="filter"] label.manager-segment:has(> input[value="${value}"])`;

/** Sized to the fixture's two 360px grounds, one above the other. */
const SEGMENTED_WINDOW = Object.freeze({ width: 480, height: 240 });

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-bulk-edit-panel-shell-specimen',
    label:
      'Specimen, props no caller sets yet — Bulk edit panel: blocked forecast, clean report, report with skips',
    // Beyond the smoke: no studio passes `subjectCount`, `blocked` or `report`, so no walk reaches these.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'bulk-edit-panel-shell' },
    steps: [],
    // The hardest of the three states: a warning report listing its skipped rows inside the notice.
    expectSelector: '[data-bulk-report][data-notice-tone="warning"] [data-bulk-blocked-row]',
    kinds: ['manager', 'specimen'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BulkEditPanelShell\.svelte$/,
      INSPECTOR_PANEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-published-tier-track-specimen',
    label:
      'Specimen, mounted through the published seam — Tier track: a descending ladder whose middle rung is current. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: no Fabricate screen renders it; a companion mounts it through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-tier-track' },
    steps: [],
    expectSelector: '.fab-tier-track > ol[role="list"][aria-label] > li[aria-current="step"]',
    kinds: ['manager', 'specimen'],
    // `TierTrack.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-leaves-specimen',
    label:
      'Specimen, mounted through the published seam — the seven data-only leaves, then three kickers and three chips, then a rail and a card that each hold two more mounts in a content slot, reading left to right, top to bottom: three portraits, four art tiles; fill bars at 0, 64 and 100; the meter, the single banded bar, the histogram; three stat boxes, the info strip, a kicker wrapped to two lines; a heading kicker in the accent ink, an inline kicker, a warning and a neutral list chip, a chip whose label wraps; a rail labelled Standing whose meter starts 10px under the label, with an info strip 8px under the meter, and a card on the lighter ground holding a kicker over a stat box; then, each on that lighter ground, a dashed empty panel holding a glyph tile, a serif title and a hint over a centred primary button, a warning notice whose detail wraps to two lines, and the quieter filtered panel holding a hint over a centred neutral button. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: a companion mounts each through `api.ui`, in states no one screen draws together.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-leaves' },
    steps: [],
    // Spelt from hooks `src/` emits, each root the direct child of its target, so a `FillBar`
    // nested in `Meter` cannot stand in for the mounted one.
    expectSelector: `${LEAVES_GROUND} > section > div > .fabricate-info-strip`,
    // Each mount inside the ground, each nested mount inside its host, the wrapped label inside its
    // chip, and the ground inside the window, so a row the window clips fails the capture.
    expectContained: [
      ...Array.from({ length: LEAF_MOUNTS }, (_, index) => ({
        container: LEAVES_GROUND,
        target: `${LEAVES_GROUND} > section:nth-child(${index + 1}) > div > *`,
      })),
      ...NESTED_LEAF_CONTAINMENT,
      { container: WRAPPED_CHIP, target: `${WRAPPED_CHIP} > span` },
      { container: '.window-content', target: LEAVES_GROUND },
    ],
    expectLayout: {
      controls: [
        { selector: '.fab-avatar[data-avatar="image"]', styles: PORTRAIT_BOX },
        { selector: '.fab-avatar-img', styles: 'object-fit: cover' },
        { selector: '.fab-avatar[data-avatar="initials"]:not(.is-square)', styles: PORTRAIT_BOX },
        {
          selector: '.fab-medallion.is-corner-7:not(.is-tone-danger)',
          styles: 'width: 26px; height: 26px; border-radius: 7px',
        },
        {
          selector: '.fab-meter[aria-valuetext] > .fab-meter-hidden',
          styles: 'position: absolute; width: 1px; height: 1px',
        },
        {
          selector: '.fab-stat-box:has(.has-icon) .fab-kicker',
          styles: 'font-size: 8.5px; color: var(--fab-text-muted)',
        },
        { selector: '.fab-kicker.is-accent', styles: 'font-size: 8.5px; color: var(--fab-accent)' },
        {
          selector: '.manager-chip.is-warning.is-list',
          styles: 'font-size: 9px; color: var(--fab-warning-text)',
        },
        {
          selector: '.manager-chip.is-neutral.is-list',
          styles: 'font-size: 9px; color: var(--fab-text-muted)',
        },
        { selector: '.fab-rail', styles: 'display: flex; row-gap: 8px' },
        {
          selector: '.fabricate-card',
          styles:
            'display: flex; row-gap: 8px; padding-top: 16px; border-radius: 11px; background-color: var(--fab-bg-2)',
        },
        { selector: '.fab-rail > div', styles: SLOT_BOX },
        { selector: '.fab-rail > div > div', styles: SLOT_BOX },
        { selector: '.fabricate-card > div', styles: SLOT_BOX },
        { selector: '.fabricate-card > div > div', styles: SLOT_BOX },
        {
          selector: HERO_PANEL,
          styles:
            'border-top-style: dashed; border-top-width: 1px; border-top-color: var(--fab-border-strong); background-color: rgba(0, 0, 0, 0)',
        },
        { selector: `${HERO_PANEL} > div`, styles: 'display: flex; row-gap: 8px' },
        {
          selector: `${HERO_PANEL} > div > i`,
          styles:
            'width: 38px; height: 38px; border-radius: 9px; color: var(--fab-text-secondary); background-color: var(--fab-bg-3); font-size: 15px',
        },
        { selector: `${HERO_PANEL} > div > div`, styles: SLOT_BOX },
        { selector: `${HERO_PANEL} > div > div > div`, styles: SLOT_BOX },
        {
          selector: '.manager-empty h3',
          styles: 'color: var(--fab-text); font-size: 15px; font-weight: 600',
        },
        {
          selector: `${HERO_PANEL} > div > p`,
          styles: 'color: var(--fab-text-muted); font-size: 10.5px',
        },
        {
          selector: FILTERED_PANEL,
          styles:
            'padding: 16px; border-top-style: dashed; border-top-width: 1px; border-top-color: var(--fab-border-strong); border-radius: 11px',
        },
        { selector: `${FILTERED_PANEL} > div`, styles: 'row-gap: 8px' },
        {
          selector: `${FILTERED_PANEL} p`,
          styles: 'color: var(--fab-text-muted); font-size: 10.5px',
        },
        {
          selector: `${HERO_PANEL} .fabricate-button`,
          styles: 'color: var(--fab-on-success); background-color: var(--fab-success)',
        },
        {
          selector: `${FILTERED_PANEL} .fabricate-button`,
          styles: 'color: var(--fab-text); background-color: var(--fab-surface-soft)',
        },
        {
          selector: '.fab-notice',
          styles: 'display: flex; background-color: var(--fab-warning-soft)',
        },
        { selector: '.fab-notice-title', styles: 'color: var(--fab-warning-text)' },
        { selector: '.fab-notice-detail', styles: 'color: var(--fab-text-muted)' },
      ],
    },
    // Sized to the fixture's 880px ground and the height of its seven rows; `expectContained` holds
    // the ground inside `.window-content`.
    position: { width: 1024, height: 720 },
    kinds: ['manager', 'specimen'],
    // Every component mounted here is a broad signal, routed here by its override: the seven
    // leaves (issue 2448), then `Kicker`, `Chip`, `Rail`, `InspectorCard`, `EmptyState` and
    // `Notice` (issue 2451), then `Button` (issue 2452).
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-controls-specimen',
    label:
      'Specimen, mounted through the published seam — five notices that each carry an action, on the lighter ground, after three steps that press what the fixture mounts: a click on the first action, whose callback redrew that notice in the success tone with no button; Enter on the second, whose callback kept its button and counted the press in its title; and Tab from the second, which put keyboard focus on the third. Reading left to right, top to bottom: the success notice with no button; an info notice whose title reads Attempts allowed: 1; a danger notice across both cells whose detail wraps under its title, its button on the title’s row carrying the accent ring; a warning notice in one cell whose button has dropped beneath the text; and a success notice with its button on the title’s row. Beneath them, thirteen published buttons at rest: a neutral and a primary; a ghost and a danger; a warning and a dashed adder that hugs its label; a dashed adder across both cells; a neutral across one cell beside a disabled neutral; a disabled primary beside a neutral in a 120px target whose long label takes four lines, its first and last spilling unclipped past the top and bottom edges of its 34px box; and, on a darker strip, a ghost and a dashed adder. Beneath those, eight published switches at rest beside their labels: Group by category off and Hidden tasks on; Sort by name and Essences in the list off, the second over its hint; a long label wrapping beside a switch that is on; Group by tag off; and, on a darker strip, Crafter notifications on and Shared results off. Beneath those, two dismissable notices at rest, a danger and an accent one, each with its action and a dismiss control after it, and each above a Next step button. The frame draws inside the manager window, so it shows the ring’s declarations and not the bare host: the control gate’s focus-mark clause is the evidence for no Fabricate ancestor',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each press.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-controls' },
    steps: [
      { selector: CONTROL_ACTION('resume') },
      { selector: CONTROL_ACTION('count'), press: 'Enter' },
      { selector: CONTROL_ACTION('count'), press: 'Tab' },
    ],
    // All three acted states, none of which exists before its step: the first notice redrawn with
    // no action, the second's count, and keyboard focus on the third's action.
    expectSelector: `${ACTED_GROUND} > ${CONTROL_SECTION('wide')} [data-notice-action]:focus-visible`,
    expectCenterHit: CONTROL_ACTION('wide'),
    // A row the window clips fails the capture.
    expectContained: CONTROLS_CONTAINMENT,
    expectLayout: {
      controls: [
        // One button per tone once the first notice has lost its own: a control selector names
        // one element.
        // Scoped to the five notices' sections, beside the dismissals' band.
        ...['info', 'danger', 'warning', 'success'].map((tone) => ({
          selector: `${CONTROLS_GROUND} > section .fab-notice.is-${tone} [data-notice-action]`,
          styles: ACTION_BUTTON,
        })),
        // The third action under keyboard focus: `:focus-visible` alone says focus, not a ring.
        {
          selector: `${CONTROL_ACTION('wide')}:focus-visible`,
          styles: 'outline-style: solid; outline-offset: 2px',
        },
        {
          selector: `${CONTROL('resume')} .fab-notice.is-success .fab-notice-title`,
          styles: 'color: var(--fab-success-text)',
        },
        {
          selector: `${CONTROLS_GROUND} > section .fab-notice:not(.is-warning, .is-info, .is-success) .fab-notice-title`,
          styles: 'color: var(--fab-danger-text)',
        },
        ...RESTING_BUTTONS,
      ],
    },
    // The PR body shows the ring at 100%; `expectContained` holds the ground inside
    // `.window-content`.
    position: CONTROLS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Notice.svelte` and `Button.svelte` are broad signals, each routed here by its
    // `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-buttons-specimen',
    label:
      'Specimen, mounted through the published seam — the same fixture after two steps that press its buttons: a click on the neutral Clear filters, whose callback redrew it as Filters cleared, and Space on the primary New project, whose callback redrew it as Projects: 1. The first button stands on the raised tile under the pointer, and the second carries the accent keyboard ring, 2px wide with 2px of ground between ring and fill, kept across its own update. No other ring is drawn, the five notices above are unpressed and the eight switches and two dismissable notices beneath are at rest. The frame draws inside the manager window; the census of the sheet, the mounted player-shell clause and the measured equality are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each press.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-controls' },
    steps: [{ selector: LAB_BUTTON('clear') }, { selector: LAB_BUTTON('create'), press: 'Space' }],
    // Both pressed states, neither of which exists before its step, and keyboard focus on the
    // primary, where ring against fill is lowest.
    expectSelector: `${PRESSED_BUTTONS} > ${BUTTON_SECTION('create')} button:focus-visible`,
    expectCenterHit: LAB_BUTTON('create'),
    expectContained: CONTROLS_CONTAINMENT,
    expectLayout: {
      controls: [
        // `:focus-visible` alone says focus, not a ring.
        {
          selector: `${LAB_BUTTON('create')}:focus-visible`,
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent)',
        },
        // Still under the pointer; the lab emulates reduced motion, so the read is not mid-fade.
        {
          selector: LAB_BUTTON('clear'),
          styles: 'background-color: var(--fab-surface-raised)',
        },
      ],
    },
    position: CONTROLS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Notice.svelte` and `Button.svelte` are broad signals, each routed here by its
    // `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-toggles-specimen',
    label:
      'Specimen, mounted through the published seam — the same fixture after two steps that press its switches: a click on Sort by name, whose callback turned it on and counted the press, and Space on Essences in the list, whose callback turned it on in place, so the accent keyboard ring, 2px wide with 2px of ground between ring and track, stays on it. Beneath the unpressed notices and the buttons at rest, reading left to right, top to bottom: Group by category off and Hidden tasks on, each beside its own label; Sort by name on, under the pointer; Essences in the list on and ringed, over its hint; a long label wrapping beside a switch that keeps its width, on; Group by tag off, whose aria-labelledby names no element, which the frame cannot show; and, on a darker strip, Crafter notifications on and Shared results off; beneath them, the two dismissable notices are at rest. The frame draws inside the manager window under Foundry 14’s own core sheet, so the button stands 28px tall here at the window’s 14px type size, and taller in a form or dialog row; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each press.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-controls' },
    steps: [{ selector: LAB_TOGGLE('press') }, { selector: LAB_TOGGLE('key'), press: 'Space' }],
    // Both pressed states, neither of which exists before its step, and keyboard focus on the
    // switch the Space press turned on.
    expectSelector: `${PRESSED_TOGGLES} > ${TOGGLE_SECTION('key')} button[aria-pressed="true"]:focus-visible`,
    expectCenterHit: LAB_TOGGLE('key'),
    expectContained: CONTROLS_CONTAINMENT,
    expectLayout: {
      controls: [
        // The sheet's declared track, and its quiet and accent grounds; no host height: it follows
        // the inherited font size and the container, which a companion's own window sets, so a lab
        // figure would pin the fixture rather than the contract.
        {
          selector: TOGGLE_TRACK('group'),
          styles: 'width: 38px; height: 22px; background-color: var(--fab-surface-soft)',
        },
        { selector: TOGGLE_TRACK('hide'), styles: 'background-color: var(--fab-accent)' },
        // A label that wraps beside the switch leaves it its own width.
        { selector: LAB_TOGGLE('long'), styles: 'width: 38px' },
        // `:focus-visible` alone says focus, not a ring; its colour fades in under Foundry's
        // own transition, so only its shape is read.
        {
          selector: `${LAB_TOGGLE('key')}:focus-visible`,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: CONTROLS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `StatusToggle.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES`
    // entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-notice-dismiss-focus',
    label:
      'Specimen, mounted through the published seam — the controls fixture after one step: Tab from the action of the accent notice beneath the switches, which put keyboard focus on its dismiss control, the xmark glyph alone. That control carries the accent keyboard ring, 2px wide with 2px of the notice’s own fill between ring and tile, at the tone whose fill shares the ring’s hue. No other ring is drawn: the danger notice beside it is at rest with its dismiss control after its action, each notice stands above its Next step button, and the notices, buttons and switches above are at rest. The accent tone is the notice’s own and not a companion’s to pass; it is drawn here because its fill shares the ring’s hue. The frame draws inside the manager window; the control gate’s focus-mark clause is the evidence for no Fabricate ancestor',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of the dismissal.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-controls' },
    steps: [{ selector: `${DISMISSAL('accent')} [data-notice-action]`, press: 'Tab' }],
    // Keyboard focus on the dismiss control the action precedes, which exists only once Tab has
    // moved it there.
    expectSelector: `${DISMISSAL('accent')} [data-notice-action] ~ [data-notice-dismiss]:focus-visible`,
    expectCenterHit: `${DISMISSAL('accent')} [data-notice-dismiss]`,
    expectContained: CONTROLS_CONTAINMENT,
    expectLayout: {
      controls: [
        // `:focus-visible` alone says focus, not a ring.
        {
          selector: `${DISMISSAL('accent')} [data-notice-dismiss]:focus-visible`,
          styles: ACCENT_RING,
        },
        // The glyph-only control's square tile, at each tone.
        ...DISMISSAL_TONES.map((tone) => ({
          selector: `${DISMISSAL(tone)} [data-notice-dismiss]`,
          styles: 'width: 28px; height: 28px',
        })),
      ],
    },
    position: CONTROLS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Notice.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-notice-dismissed',
    label:
      'Specimen, mounted through the published seam — the controls fixture after one step: Enter on the dismiss control of the danger notice beneath the switches, whose callback moved focus to the Next step button beneath it and then destroyed the notice. The danger notice is gone and that button, risen into its place, carries the accent keyboard ring, 2px wide with 2px of ground between ring and fill, so focus never fell to the page body. The accent notice beside it is at rest above its own Next step button, and the notices, buttons and switches above are at rest. The frame draws inside the manager window; the mounted dismissal clauses are the evidence for the pointer and Space presses',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of the dismissal.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-controls' },
    steps: [{ selector: `${DISMISSAL('danger')} [data-notice-dismiss]`, press: 'Enter' }],
    // The danger notice gone and focus on the next control, neither of which holds before the press.
    expectSelector: `${DISMISSAL('danger')}:not(:has(.fab-notice)) > [data-lab-next] button:focus`,
    expectCenterHit: NEXT_BUTTON('danger'),
    expectContained: CONTROLS_CONTAINMENT,
    expectLayout: {
      controls: [
        // Focus arrived by a keyboard press, so the next control draws its ring.
        { selector: `${NEXT_BUTTON('danger')}:focus-visible`, styles: ACCENT_RING },
        {
          selector: `${DISMISSAL('accent')} .fab-notice [data-notice-dismiss]`,
          styles: 'width: 28px',
        },
      ],
    },
    position: CONTROLS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Notice.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-steppers-specimen',
    label:
      'Specimen, mounted through the published seam — five steppers, each beside its label, after six steps that edit what the fixture mounts: a click on the plus of Days to credit, whose callback passed 4 back; Space on the plus of Crafters at the bench, which passed 3 back; 3 typed into Pairs of gloves, whose callback refused the odd number and said why beneath it; Tab from that field, which reported the 3 again, refused it again, and snapped the field back to 2; the Down arrow on Rations carried, on the darker strip, which stepped it to 3; and the Up arrow on Attempts allowed, which stepped it from 9 to its bound of 10. Reading top to bottom: Days to credit 4; Crafters at the bench 3; Pairs of gloves 2 over its reason; Attempts allowed 10 with its plus dimmed and its field carrying the accent keyboard ring at its own edge; and Rations carried 3. The frame draws inside the manager window; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each edit.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-values' },
    steps: [
      { selector: LAB_STEPPER('credit', INCREMENT) },
      { selector: LAB_STEPPER('count', INCREMENT), press: 'Space' },
      { selector: LAB_STEPPER('even', 'input'), fill: '3' },
      { selector: LAB_STEPPER('even', 'input'), press: 'Tab' },
      { selector: LAB_STEPPER('card', 'input'), press: 'ArrowDown' },
      { selector: LAB_STEPPER('limit', 'input'), press: 'ArrowUp' },
    ],
    // Every edited state, none of which exists before its step, the refused field snapped back,
    // and keyboard focus on the field the Up arrow took to its bound, whose plus is disabled.
    expectSelector: `${STEPPED_VALUES} > ${STEPPER_SECTION('limit')}[data-lab-value="10"]:has(${INCREMENT}:disabled) input:focus-visible`,
    expectCenterHit: LAB_STEPPER('limit', 'input'),
    expectContained: VALUES_CONTAINMENT,
    expectLayout: {
      controls: [
        // The sheet's declared group corner and value type; no host height: the stepper's box is
        // its own, so a lab figure would pin the fixture rather than the contract.
        { selector: LAB_STEPPER('credit', '.fab-stepper'), styles: 'border-radius: 7px' },
        { selector: LAB_STEPPER('credit', 'input'), styles: 'font-size: 11.5px' },
        { selector: `${LAB_STEPPER('limit', 'input')}:focus-visible`, styles: STEPPER_RING },
      ],
    },
    position: VALUES_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Stepper.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-steppers-button-focus',
    label:
      'Specimen, mounted through the published seam — the same five steppers at rest after one step: Tab from the field of Rations carried, on the darker strip, which put keyboard focus on its plus. That button carries the accent keyboard ring, 2px wide at its own edge and inside the stepper’s outer edge; no other ring is drawn and every number is the one the fixture started at. The frame draws inside the manager window; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-values' },
    steps: [{ selector: LAB_STEPPER('card', 'input'), press: 'Tab' }],
    expectSelector: `${LAB_STEPPER('card', INCREMENT)}:focus-visible`,
    expectCenterHit: LAB_STEPPER('card', INCREMENT),
    expectContained: VALUES_CONTAINMENT,
    expectLayout: {
      controls: [
        { selector: `${LAB_STEPPER('card', INCREMENT)}:focus-visible`, styles: STEPPER_RING },
      ],
    },
    position: VALUES_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Stepper.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-search-specimen',
    label:
      'Specimen, mounted through the published seam — three search fields, each beneath the text that names it, after two steps that type into what the fixture mounts: Iron typed into Search components, which reported it; and “  SALT” typed into Search tags, whose callback passed salt back, trimmed and in lower case, from inside the call. Reading top to bottom: Search recipes empty, showing its placeholder; Search components holding Iron; and Search tags holding salt and keyboard focus, its field’s border taking the accent while its input draws no ring of its own. The frame draws inside the manager window; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each query.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-search' },
    steps: [
      { selector: LAB_SEARCH('filled', 'input'), fill: 'Iron' },
      { selector: LAB_SEARCH('transform', 'input'), fill: '  SALT' },
    ],
    // Both reported values, neither of which exists before its step, the transformed one passed
    // back from inside the call, and focus on the field that transformed.
    expectSelector: `${SEARCH_GROUND}:has(> ${SEARCH_SECTION('filled')}[data-lab-value="Iron"]) > ${SEARCH_SECTION('transform')}[data-lab-value="salt"] .fabricate-search:focus-within`,
    expectCenterHit: LAB_SEARCH('transform', 'input'),
    expectContained: SEARCH_CONTAINMENT,
    expectLayout: {
      controls: [
        // The default shell's declared corner, and the focused input's want of a ring of its own.
        { selector: LAB_SEARCH('empty', '.fabricate-search'), styles: 'border-radius: 9px' },
        { selector: `${LAB_SEARCH('transform', 'input')}:focus`, styles: 'outline-style: none' },
        // The focused field's shell takes the accent, the keyboard mark a field whose wrapper draws the box.
        {
          selector: `${LAB_SEARCH('transform', '.fabricate-search')}:focus-within`,
          styles: 'border-color: var(--fab-accent)',
        },
      ],
    },
    position: SEARCH_WINDOW,
    kinds: ['manager', 'specimen'],
    // `SearchField.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-select-specimen',
    label:
      'Specimen, mounted through the published seam — two selects, each beneath the text that names it, after one step: a press on Rows per page, which opened its list inside the ground the companion passed as its overlay host. The list reads 10, ticked and filled as the chosen row, then 25 and All, drawn over the ground below the trigger, clipped by nothing and ending above Sort recipes by, which stays closed, uncovered and showing its placeholder. The frame draws inside the manager window; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-select' },
    steps: [{ selector: LAB_SELECT('hosted', SELECT_TRIGGER) }],
    // The list the press opened, in the overlay host, with the chosen row marked, and the second
    // select's trigger left uncovered beneath it.
    expectSelector: `${SELECT_GROUND}:has(${SELECT_SECTION('hosted')} ${SELECT_TRIGGER}[aria-expanded="true"]) > div > .fabricate-select-popover [data-popover-option="10"][aria-selected="true"]`,
    expectCenterHit: [SELECT_OPTION(HOSTED_LIST, '25'), LAB_SELECT('layer', SELECT_TRIGGER)],
    expectContained: [...SELECT_CONTAINMENT, { container: SELECT_GROUND, target: HOSTED_LIST }],
    expectLayout: {
      controls: [
        // The inline rung's declared corner, and the panel's own.
        { selector: LAB_SELECT('hosted', SELECT_TRIGGER), styles: 'border-radius: 7px' },
        { selector: HOSTED_LIST, styles: 'border-radius: 11px' },
      ],
    },
    position: SELECT_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Select.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-select-layer',
    label:
      'Specimen, mounted through the published seam — the same two selects after three steps: All chosen from the list of Rows per page, whose callback passed all back so the trigger reads All; then a press on Sort recipes by, which passed no overlay host and whose window carries no app root, so its list opened on the standalone layer over the window. The list reads Name, Tier and Most recently crafted, none ticked, below the trigger still showing Choose an order. The frame draws inside the manager window; the census of the sheet and the mounted player-shell clause are the evidence for the player window',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each choice.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-select' },
    steps: [
      { selector: LAB_SELECT('hosted', SELECT_TRIGGER) },
      { selector: SELECT_OPTION(HOSTED_LIST, 'all') },
      { selector: LAB_SELECT('layer', SELECT_TRIGGER) },
    ],
    // The choice the companion passed back, and the list the last press opened on the layer.
    expectSelector: `body:has(${SELECT_SECTION('hosted')}[data-lab-value="all"]) > .fabricate.fabricate-standalone-overlay > div > .fabricate-select-popover [data-popover-option="tier"]`,
    expectCenterHit: SELECT_OPTION(LAYER_LIST, 'tier'),
    expectContained: SELECT_CONTAINMENT,
    expectLayout: {
      controls: [
        // The form rung's declared corner, and the panel's own on the layer.
        { selector: LAB_SELECT('layer', SELECT_TRIGGER), styles: 'border-radius: 9px' },
        { selector: LAYER_LIST, styles: 'border-radius: 11px' },
      ],
    },
    position: SELECT_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Select.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-stage-bars-specimen',
    label:
      'Specimen, mounted through the published seam — three stage groups, each beneath the text that names it, reading top to bottom: Forging progress, four bars side by side captioned 1 Gather, 2 Smelt, 3 Forge and 4 Temper, the first two full in the success tone, Forge, the current stage, a little under half full in the accent, and Temper an empty track; Brewing progress, three bars with no captions, the first, the current stage, under a third full in the accent and the other two empty tracks; and Copying a scroll, one bar across the whole width captioned 1 Copy, about two thirds full in the accent. Each caption sits on one line, whole, in the muted ink. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-stage-bars' },
    steps: [],
    // The current stage of the numbered group, the labelled bar of the unnumbered one, and the
    // lone bar named by its stage.
    expectSelector: `${STAGE_BARS_GROUND}:has(${STAGE_BARS_SECTION_IN_GROUND('forge')} [data-stage-bars-stage="2"][data-stage-bars-state="accent"]):has(${STAGE_BARS_SECTION_IN_GROUND('brew')} [role="progressbar"][aria-label="Stage 3 of 3"]) ${STAGE_BARS_SECTION_IN_GROUND('copy')} [role="progressbar"][aria-label="Copy"]`,
    expectContained: [
      ...STAGE_BARS_KEYS.map((key) => ({
        container: STAGE_BARS_GROUND,
        target: `${STAGE_BARS_SECTION(key)} [role="group"]`,
      })),
      { container: '.window-content', target: STAGE_BARS_GROUND },
    ],
    // Each group's bars side by side on one line, and every caption whole, so no name is cut
    // off with an ellipsis.
    expectLayout: {
      containerSelector: STAGE_BARS_GROUND,
      oneLineRows: `${STAGE_BARS_GROUND} .fab-stage-bars`,
      unclipped: `${STAGE_BARS_GROUND} .fab-stage-bars-caption`,
    },
    position: STAGE_BARS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `StageBars.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-field-specimen',
    label:
      'Specimen, mounted through the published seam — one field holding the companion’s own content in its content slot, after two steps that type into it: Moonlit tonic typed into the input, then the right arrow at its end, which keeps keyboard focus on it. Reading top to bottom: the caption Recipe name in the small upper-case kicker type, drawn by a published kicker inside the companion’s caption span, which the companion lays out as a flex box; the input across the column’s width holding Moonlit tonic, 38px tall at radius 9 on a --fab-bg-1 ground, its edge taken by the accent keyboard ring, 1px wide and inset over the edge; and the hint Shown on the recipe card in the muted ink beneath it. The frame draws inside the manager window and is the evidence for it alone; that the inset ring outranks the field’s 2px ring in any window is asserted on the order of the sheet’s rules',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own content in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-field' },
    steps: [
      { selector: FIELD_INPUT, fill: 'Moonlit tonic' },
      { selector: FIELD_INPUT, press: 'ArrowRight' },
    ],
    // The value the companion recorded, which exists only after the edit, with focus on its input.
    expectSelector: `${FIELD_GROUND} > [data-lab-field="name"][data-lab-value="Moonlit tonic"] .fabricate-field input:focus`,
    expectCenterHit: FIELD_INPUT,
    expectContained: [
      { container: FIELD_GROUND, target: `${FIELD_SECTION} .fabricate-field` },
      { container: '.window-content', target: FIELD_GROUND },
    ],
    expectLayout: {
      controls: [
        // The caption span's flex box and its kicker type, the text input's chrome, and its inset
        // keyboard ring; the ring's colour is read off the sheet, because a probe inside a void
        // `<input>` resolves no `var()`.
        { selector: FIELD_CAPTION, styles: 'display: flex' },
        { selector: `${FIELD_SECTION} .fab-kicker`, styles: 'font-size: 8.5px' },
        { selector: FIELD_INPUT, styles: 'height: 38px; border-radius: 9px' },
        {
          selector: `${FIELD_INPUT}:focus-visible`,
          styles: 'outline-style: solid; outline-width: 1px; outline-offset: -1px',
        },
      ],
    },
    position: FIELD_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Field.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-well-specimen',
    label:
      'Specimen, mounted through the published seam — one card holding a well, as a companion groups its own content: the card’s heading Moonlit tonic, a published kicker, and beneath it a well on the --fab-bg-1 fill inside a 1px edge at radius 9 and 12px of padding, headed by its label Chosen reagents in the 8.5px upper-case kicker type, 8px above its content. Below the label, in the well’s normal flow, the companion’s one element lays out the line Moonpetal, silverleaf and ember salt and, 8px beneath it, a positive Ready chip. The frame draws inside the manager window and is the evidence for it alone; the well’s fill inside a Fabricate modal and its refusal outside a Fabricate window are the mounted suite’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own content in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-well' },
    steps: [],
    // The well the fixture's effect mounted in the card, named by its label, holding the chip
    // mounted in the companion's element.
    expectSelector: `${WELL_GROUND} .fabricate-card .fab-well[role="group"][aria-label="Chosen reagents"] [data-lab-well-content] .manager-chip`,
    expectContained: [
      { container: `${WELL_GROUND} .fabricate-card`, target: WELL },
      { container: WELL_GROUND, target: `${WELL_GROUND} .fabricate-card` },
      { container: '.window-content', target: WELL_GROUND },
    ],
    expectLayout: {
      controls: [
        // The well's box in normal flow, its kicker and the space below it, the private wrapper and
        // slot element that take no box, and the companion's own column that spaces its content.
        {
          selector: WELL,
          styles:
            'display: block; padding: 12px; border-top-style: solid; border-top-width: 1px; border-top-color: var(--fab-border); border-radius: 9px; background-color: var(--fab-bg-1)',
        },
        { selector: `${WELL} > .fab-well-label`, styles: 'margin-bottom: 8px' },
        { selector: `${WELL} > .fab-well-label .fab-kicker`, styles: 'font-size: 8.5px' },
        { selector: `${WELL} > div:not(.fab-well-label)`, styles: SLOT_BOX },
        { selector: `${WELL} > div:not(.fab-well-label) > div`, styles: SLOT_BOX },
        { selector: WELL_CONTENT, styles: 'display: flex; row-gap: 8px' },
      ],
    },
    position: WELL_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Well.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-callout-specimen',
    label:
      'Specimen, mounted through the published seam — six standing notes, one per section and one per published tone, 8px apart on the fixture’s own --fab-bg-1 ground, each a strip that sets its tone’s glyph beside its body inside a 1px edge at radius 11 and 12px of padding. Reading top to bottom: a neutral rule drawn from its text alone, a paragraph with no role, its sentence in the muted ink on the --fab-surface-soft fill; an info note, a div with the note role, headed Three crafters online in the info ink above its sentence, on the info fill inside the info edge; an accent paragraph, its glyph in the accent ink on the accent fill inside the accent edge; a warning note headed Two reagents run short above a list of two glyph-led points 8px apart, the leads Moonpetal: and Ember salt: in the strong ink, its leading glyph in the warning ink on the warning fill; a success paragraph, its glyph in the success ink on the success fill inside the success edge; and a danger note whose sentence Deleting a system removes its recipes for every player sits beside its actions, a neutral published Read the rules button, on the danger fill. The frame draws inside the manager window and is the evidence for it alone; what a note draws under no Fabricate ancestor and for a tone outside its set is the mounted suite’s, and its contrast on the four grounds is the contrast measurement’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own control in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-callout' },
    steps: [],
    // Both roots the fixture's effect mounted, the accent and success paragraphs, the warning
    // note's two points, and the button mounted in the danger note's actions slot.
    expectSelector: `${CALLOUT_GROUND}:has(> [data-lab-callout="standing"] p.manager-callout:not([role])):has(> [data-lab-callout="accent"] p.manager-callout.is-accent):has(> [data-lab-callout="success"] p.manager-callout.is-success):has(> [data-lab-callout="warning"] div.manager-callout.is-warning[role="note"] [role="list"] > [role="listitem"] + [role="listitem"]) > [data-lab-callout="actions"] div.manager-callout.is-danger[role="note"] > .manager-callout-actions .fabricate-button`,
    expectContained: [
      ...['standing', 'info', 'accent', 'warning', 'success', 'actions'].map((key) => ({
        container: CALLOUT_GROUND,
        target: CALLOUT(key),
      })),
      { container: CALLOUT_ACTIONS, target: `${CALLOUT_ACTIONS} .fabricate-button` },
      { container: '.window-content', target: CALLOUT_GROUND },
    ],
    expectLayout: {
      controls: [
        // The paragraph root's strip, its own ink and fill; the info note's fill, edge and title
        // ink; the accent and success fills, edges and glyph inks; the warning note's fill, glyph
        // ink, its list's spacing and the first lead's ink; the danger fill; and the actions host
        // that spaces the slot, whose private wrapper and element take no box.
        {
          selector: CALLOUT('standing'),
          styles:
            'display: flex; padding: 12px; border-top-style: solid; border-top-width: 1px; border-top-color: var(--fab-border); border-radius: 11px; background-color: var(--fab-surface-soft); color: var(--fab-text-muted)',
        },
        {
          selector: CALLOUT('info'),
          styles:
            'background-color: var(--fab-info-soft); border-top-color: var(--fab-info-border)',
        },
        {
          selector: `${CALLOUT('info')} .manager-callout-title`,
          styles: 'color: var(--fab-info-text); font-weight: 600',
        },
        ...['accent', 'success'].flatMap((tone) => [
          {
            selector: CALLOUT(tone),
            styles: `background-color: var(--fab-${tone}-soft); border-top-color: var(--fab-${tone}-border)`,
          },
          { selector: `${CALLOUT(tone)} > i`, styles: `color: var(--fab-${tone}-text)` },
        ]),
        { selector: CALLOUT('warning'), styles: 'background-color: var(--fab-warning-soft)' },
        { selector: `${CALLOUT('warning')} > i`, styles: 'color: var(--fab-warning-text)' },
        {
          selector: `${CALLOUT('warning')} .manager-callout-items`,
          styles: 'display: grid; row-gap: 8px',
        },
        {
          selector: `${CALLOUT('warning')} .manager-callout-item:first-child .manager-callout-item-lead`,
          styles: 'color: var(--fab-text)',
        },
        { selector: CALLOUT('actions'), styles: 'background-color: var(--fab-danger-soft)' },
        {
          selector: CALLOUT_ACTIONS,
          styles: 'display: inline-flex; flex-shrink: 0; column-gap: 8px',
        },
        { selector: `${CALLOUT_ACTIONS} > span`, styles: SLOT_BOX },
        { selector: `${CALLOUT_ACTIONS} > span > span`, styles: SLOT_BOX },
      ],
    },
    position: CALLOUT_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Callout.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-icon-buttons-specimen',
    label:
      'Specimen, mounted through the published seam — nine icon buttons in a 360px column on the window’s --fab-bg-1 ground, 8px apart, each a glyph alone beside a caption the companion draws, after two steps: a click on the last, the Batch notes disclosure, whose callback passed aria-expanded true in its own update and showed the companion’s notes line Quench each ingot before the next pour beneath it, the pointer still resting on that button’s raised tile; and Tab from the danger button, which put keyboard focus on the ghost-danger Remove Ember salt, so it carries the accent keyboard ring, 2px wide with 2px of ground between ring and face, on its danger fill and ink. Reading top to bottom: a neutral pen on its 34px bordered face; a primary check in the success ink and edge; a ghost ellipsis 28px tall with no edge or fill; a danger trash in the danger ink and edge; the focused ghost-danger xmark; an xmark at size 24 and one at size 26, each a square of that side; and a disabled arrow at 62% opacity. The lab’s stand-in for Foundry’s tooltip manager records the keyboard focus’s tooltip and draws none, so the frame shows no tooltip; the hover text each button writes and the tooltip’s opening and closing are the mounted suite’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each press.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-icon-buttons' },
    steps: [{ selector: ICON_BUTTON('expand') }, { selector: ICON_BUTTON('danger'), press: 'Tab' }],
    // The disclosure's expanded state and the notes it shows, which only the click produces, and
    // the tooltip the keyboard focus opened through the facade on the ghost-danger button.
    expectSelector: `${ICON_BUTTONS}:has(> [data-lab-icon-button="expand"] button[aria-expanded="true"]):has(> [data-lab-icon-notes]:not([hidden])) > [data-lab-icon-button="ghost-danger"] button[aria-describedby="tooltip"]:focus-visible`,
    expectCenterHit: ICON_BUTTON('expand'),
    expectContained: [
      ...ICON_BUTTON_KEYS.map((key) => ({ container: ICON_BUTTONS, target: ICON_ROW(key) })),
      { container: ICON_BUTTONS, target: ICON_NOTES },
      { container: '.window-content', target: ICON_BUTTONS },
    ],
    expectLayout: {
      controls: [
        // Each role's face and each rung's square at rest, the disabled face, the focused
        // ghost-danger's ring and face, and the pressed disclosure under the pointer.
        {
          selector: ICON_BUTTON('neutral'),
          styles:
            'width: 34px; height: 34px; border-top-color: var(--fab-border); background-color: var(--fab-surface-soft)',
        },
        {
          selector: ICON_BUTTON('primary'),
          styles: 'color: var(--fab-success-text); border-top-color: var(--fab-success-border)',
        },
        {
          selector: ICON_BUTTON('ghost'),
          styles:
            'height: 28px; border-top-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0)',
        },
        {
          selector: ICON_BUTTON('danger'),
          styles: 'color: var(--fab-danger-text); border-top-color: var(--fab-danger-border)',
        },
        // `:focus-visible` alone says focus, not a ring.
        {
          selector: `${ICON_BUTTON('ghost-danger')}:focus-visible`,
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent); color: var(--fab-danger-text); background-color: var(--fab-danger-soft)',
        },
        { selector: ICON_BUTTON('size-24'), styles: 'width: 24px; height: 24px' },
        { selector: ICON_BUTTON('size-26'), styles: 'width: 26px; height: 26px' },
        { selector: ICON_BUTTON('disabled'), styles: 'opacity: 0.62' },
        // Still under the pointer; the lab emulates reduced motion, so the read is not mid-fade.
        {
          selector: ICON_BUTTON('expand'),
          styles: 'background-color: var(--fab-surface-raised)',
        },
      ],
    },
    position: ICON_BUTTONS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `IconButton.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-tabs-specimen',
    label:
      'Specimen, mounted through the published seam — one tab strip of three tabs, Inputs with a flask glyph, Outputs with a box glyph and Notes with none, across a 360px column on the window’s --fab-bg-1 ground, above the one tabpanel the companion draws, after one step: ArrowRight pressed on the selected Inputs, which moved keyboard focus to Outputs and then called onSelect, whose update drew Outputs selected and showed its panel, One iron ingot, and slag. So Outputs is drawn in the accent ink at weight 600 over its 2px accent underline and carries the accent keyboard ring, 2px wide with 2px of ground between ring and tab, and Inputs in the muted ink at weight 500 with no underline, 46px tall over the strip’s 1px rule',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each selection.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-tabs' },
    steps: [{ selector: INPUTS_TAB, press: 'ArrowRight' }],
    // The reached tab selected by the companion's own update, its panel shown, and keyboard focus
    // on it, which only the ArrowRight and the update it led to produce.
    expectSelector: `${TABS_GROUND}:has(> [data-lab-tabs-panel][aria-labelledby="lab-reagents-tab-outputs"])${OUTPUTS_TAB.slice(TABS_GROUND.length)}[id="lab-reagents-tab-outputs"][aria-selected="true"][tabindex="0"]:focus-visible`,
    expectCenterHit: OUTPUTS_TAB,
    expectContained: [
      { container: TABS_GROUND, target: TABS_TARGET },
      { container: TABS_GROUND, target: TABS_PANEL },
      { container: '.window-content', target: TABS_GROUND },
    ],
    expectLayout: {
      controls: [
        // The focused, selected tab's ring, ink and underline, the unselected tab at rest, and the
        // strip's rule.
        {
          selector: `${OUTPUTS_TAB}:focus-visible`,
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent); color: var(--fab-accent); border-bottom-color: var(--fab-accent); font-weight: 600',
        },
        {
          selector: INPUTS_TAB,
          styles:
            'height: 46px; color: var(--fab-text-muted); border-bottom-color: rgba(0, 0, 0, 0); font-weight: 500',
        },
        {
          selector: TABLIST,
          styles:
            'display: flex; border-bottom-style: solid; border-bottom-width: 1px; border-bottom-color: var(--fab-border)',
        },
      ],
    },
    position: TABS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `EditorTabs.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-option-cards-specimen',
    label:
      'Specimen, mounted through the published seam — one option card group of three cards, Breakable with a hammer chip, Immune with a lock chip and Limited uses with an hourglass chip, disabled with its reason Coming soon, in two tracks across a 420px column on the --fab-bg-2 ground, its legend When the tool breaks visually hidden, after one step: ArrowRight pressed on the checked Breakable radio, which the platform moved to the next enabled radio, Immune, and checked, so Fabricate called onChange, whose update drew Immune chosen. So the Immune card carries the accent border over its surface-soft ground and its radio the accent keyboard ring, 2px wide with 2px of ground between ring and radio, and Breakable is drawn at rest',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each choice.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-option-cards' },
    steps: [{ selector: optionRadio('breakable'), press: 'ArrowRight' }],
    // The reached card chosen by the companion's own update, its radio checked and keyboard-focused,
    // and the fixture's echo of the value, which only `onChange` writes.
    expectSelector: `${CARDS_GROUND}[data-lab-option-cards-chosen="immune"]${optionCard('immune').slice(CARDS_GROUND.length)}.is-active input[type="radio"]:checked:focus-visible`,
    expectCenterHit: optionCard('immune'),
    expectContained: [
      { container: CARDS_GROUND, target: CARDS_TARGET },
      { container: '.window-content', target: CARDS_GROUND },
    ],
    expectLayout: {
      controls: [
        // The reached radio's ring, the chosen card's border, and the legend held off the screen;
        // the chosen ground is a `::before` no card-level probe reads. The ring's colour is read
        // off the sheet (`published-radio-card-group-census.test.js`), because a probe inside a
        // void `<input>` resolves no `var()`.
        {
          selector: `${optionRadio('immune')}:focus-visible`,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
        {
          selector: optionCard('immune'),
          styles:
            'border-top-style: solid; border-top-width: 1px; border-top-color: var(--fab-accent-border)',
        },
        {
          selector: CARDS_LEGEND,
          styles: 'position: absolute; width: 1px; height: 1px; clip-path: inset(50%)',
        },
      ],
    },
    position: CARDS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `RadioCardGroup.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-segmented-specimen',
    label:
      'Specimen, mounted through the published seam — two segmented controls, each on its own 360px column of the --fab-bg-1 ground: an ingredient filter of All, Owned with a check glyph and Missing with a cross glyph at the default density, and a page size of 10, 25, 50 and 100 at the inline density sharing its whole width, 25 selected and 100 dimmed as disabled, after one step: ArrowRight pressed on the checked All radio, which the platform moved to the next enabled radio, Owned, and checked, so Fabricate called onChange, whose update drew Owned selected. So the Owned segment is the raised selected tile in the primary ink at weight 600 and carries the accent keyboard ring, 2px wide with 2px of ground between ring and segment, and All is drawn at rest',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each choice.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-segmented' },
    steps: [{ selector: filterRadio('all'), press: 'ArrowRight' }],
    // The reached segment selected by the companion's own update, its radio checked and
    // keyboard-focused, under the fixture's echo of the value, which only `onChange` writes.
    expectSelector:
      '[data-lab-segmented-chosen="owned"] [data-lab-segmented="filter"] label.is-active:has(> input[value="owned"]:checked:focus-visible)',
    expectCenterHit: filterSegment('owned'),
    expectContained: [
      { container: SEGMENTED_GROUND, target: SEGMENTED_TARGET },
      { container: '.window-content', target: SEGMENTED_GROUND },
    ],
    expectLayout: {
      controls: [
        // The reached segment's ring, ink and weight, each a value its scoped rules declare.
        {
          selector: filterSegment('owned'),
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent); color: var(--fab-text); font-weight: 600',
        },
      ],
    },
    position: SEGMENTED_WINDOW,
    kinds: ['manager', 'specimen'],
    // `SegmentedControl.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
]);

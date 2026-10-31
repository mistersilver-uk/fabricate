/**
 * Specimens: a shipped component mounted DIRECTLY by a fixture-only wrapper under
 * `tests/view-lab/fixtures/`, for props no shipped caller passes yet (issue 1782). A specimen frame
 * depicts a state no GM can reach today, so each label says so; it is not a smoke counterpart.
 */

import { ANCHORED_POPOVER_SOURCES, INSPECTOR_PANEL_PATTERN } from './caseConstants.js';
import { managerCase, playerCase } from './caseFactories.js';

/**
 * The seam, its lazy loading, its prop kinds, its callbacks, its values, its overlay chain, its
 * standalone style root, its manifest, its adapter and its host: each redraws what it mounts.
 */
const PUBLISHED_SEAM_SOURCES = Object.freeze([
  /^src\/ui\/publishedComponentSeam\.js$/,
  /^src\/ui\/publishedComponentLoading\.js$/,
  /^src\/ui\/publishedComponentProps\.js$/,
  /^src\/ui\/publishedComponentCallbacks\.js$/,
  /^src\/ui\/publishedComponentValues\.js$/,
  /^src\/ui\/publishedComponentOverlays\.js$/,
  /^src\/ui\/publishedComponentStandaloneRoot\.js$/,
  /^src\/ui\/publishedComponentManifest\.js$/,
  /^src\/ui\/publishedComponents\.svelte\.js$/,
  /^src\/ui\/svelte\/published\/PublishedComponentHost\.svelte$/,
]);

/** The seam's own sources, and the standalone layer's host, for a case that draws on that layer. */
const STANDALONE_LAYER_SOURCES = Object.freeze([
  ...PUBLISHED_SEAM_SOURCES,
  /^src\/ui\/svelte\/util\/overlayHost\.js$/,
]);
/** And the positioning seam, for a case that opens an anchored panel there. */
const OPEN_PANEL_SOURCES = Object.freeze([
  ...STANDALONE_LAYER_SOURCES,
  ...ANCHORED_POPOVER_SOURCES,
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
const LEAF_MOUNTS = 40;

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

/** The one truncated chip, the last mount, whose long label must end inside its 88px cell. */
const TRUNCATED_CHIP = `${LEAVES_GROUND} > section > div > .manager-chip.is-truncated`;

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

/** The search forms fixture's ground, a part of one section's field by its key, and each section's density, height and corner. */
const SEARCH_FORMS = '[data-lab-search-forms]';
const SEARCH_FORM = (key, part) => `${SEARCH_FORMS} > [data-lab-search-form="${key}"] ${part}`;
const SEARCH_FORM_RUNGS = Object.freeze([
  ['default', 38, 9],
  ['toolbar', 34, 9],
  ['inline', 30, 7],
]);

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

/** The forms fixture's ground, one section's companion input by its key, and each section's rung and corner. */
const FIELD_FORMS = '[data-lab-field-forms]';
const FIELD_FORM_INPUT = (key) =>
  `${FIELD_FORMS} > [data-lab-field-form="${key}"] .fabricate-field input`;
const FIELD_FORM_RUNGS = Object.freeze([
  ['name', 34, 9],
  ['formula', 30, 7],
  ['uses', 28, 7],
  ['tag', 26, 7],
  ['bonus', 30, 7],
]);

/** Sized to the fixture's 320px ground and the height of its five fields, about 365px, with room to spare. */
const FIELD_FORMS_WINDOW = Object.freeze({ width: 440, height: 460 });

/** The well fixture's ground, the published well inside its card, and the companion's element. */
const WELL_GROUND = '[data-lab-well-ground]';
const WELL = `${WELL_GROUND} .fabricate-card .fab-well`;
const WELL_CONTENT = `${WELL} [data-lab-well-content]`;

/** Sized to the fixture's 320px ground and the height of its one card. */
const WELL_WINDOW = Object.freeze({ width: 440, height: 320 });

/** The card tones fixture's ground, one section's card by its key, and a part of that card's head. */
const CARD_TONES = '[data-lab-card-tones]';
const CARD_TONE = (key) => `${CARD_TONES} > [data-lab-card-tone="${key}"] .fabricate-card`;
const CARD_TONE_PART = (key, part) => `${CARD_TONE(key)} > .fab-card-head ${part}`;
const CARD_TONE_KEYS = Object.freeze(['warning', 'success', 'accent', 'info']);

/** Sized to the fixture's 320px ground and its seven cards, measured at 832px in Chromium. */
const CARD_TONES_WINDOW = Object.freeze({ width: 440, height: 960 });

/** The callout actions fixture's ground, one section's root by its key, and its actions host. */
const CALLOUT_ACTIONS_GROUND = '[data-lab-callout-actions]';
const CALLOUT_ACTION = (key, root) =>
  `${CALLOUT_ACTIONS_GROUND} > [data-lab-callout-action="${key}"] ${root}`;
const CALLOUT_ACTION_HOST = (key) =>
  `${CALLOUT_ACTION(key, '.manager-callout')} > .manager-callout-actions`;

/** Sized to the fixture's 320px ground, its three notes and its two notices, about 480px. */
const CALLOUT_ACTIONS_WINDOW = Object.freeze({ width: 440, height: 600 });

/** The callout fixture's ground, one section's published note by its key, and its actions host. */
const CALLOUT_GROUND = '[data-lab-callout-ground]';
const CALLOUT = (key) => `${CALLOUT_GROUND} > [data-lab-callout="${key}"] .manager-callout`;
const CALLOUT_ACTIONS = `${CALLOUT('actions')} > .manager-callout-actions`;

/** Sized to the fixture's 360px ground and the height of its six notes. */
const CALLOUT_WINDOW = Object.freeze({ width: 480, height: 560 });

/** The list row fixture's ground, one section's published row by its key, and its aside host. */
const LIST_ROW_GROUND = '[data-lab-list-row-ground]';
const LIST_ROW = (key) => `${LIST_ROW_GROUND} > [data-lab-list-row="${key}"] .fabricate-list-row`;
const LIST_ROW_ASIDE = (key) => `${LIST_ROW(key)} > .fabricate-list-row-aside`;

/** Sized to the fixture's 320px ground and the height of its two rows. */
const LIST_ROW_WINDOW = Object.freeze({ width: 440, height: 280 });

/** The slots fixture's ground, one section's published row by its key, and a slot's host in it. */
const SLOT_GROUND = '[data-lab-list-row-slots]';
const SLOT_ROW = (key) => `${SLOT_GROUND} > [data-lab-list-row="${key}"] .fabricate-list-row`;
const SLOT_HOST = (key, slot) => `${SLOT_ROW(key)} .fabricate-list-row-${slot}`;
// The bare row's trailing mount target, the one child of the root that holds it (the mark and name are spans too).
const BARE_TRAILING = '[data-lab-list-row-trailing]';

/** Sized to the fixture's 320px ground and the height of its three rows. */
const SLOT_WINDOW = Object.freeze({ width: 440, height: 360 });

/** The forms fixture's ground and one section's published row, by its key and its place, first by default. */
const FORMS_GROUND = '[data-lab-list-row-forms]';
const FORM_ROW = (key, place = 1) =>
  `${FORMS_GROUND} > [data-lab-list-row-form="${key}"] > div:nth-child(${place}) .fabricate-list-row`;
/** Each one-row section's key and mark rung, and each board's. */
const FORM_MARKS = Object.freeze([
  ['portrait', 26],
  ['queue', 28],
  ['default', 30],
  ['board', 30],
  ['cards', 34],
]);

/** Sized to the fixture's 480px ground and the height of its seven sections. */
const FORMS_WINDOW = Object.freeze({ width: 600, height: 680 });

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
  'ghost-danger-rest',
  'size-24',
  'size-26',
  'disabled',
  'expand',
]);

/** Sized to the fixture's 360px ground and the height of its ten rows and the notes beneath. */
const ICON_BUTTONS_WINDOW = Object.freeze({ width: 480, height: 560 });

/** The button forms fixture's ground, a row by its key, and the one control the row's target holds. */
const BUTTON_FORMS = '[data-lab-button-forms]';
const BUTTON_FORM = (key) => `${BUTTON_FORMS} > [data-lab-button-form="${key}"]`;
const BUTTON_FORM_CONTROL = (key) => `${BUTTON_FORM(key)} button`;
const BUTTON_FORM_KEYS = Object.freeze([
  'button-24',
  'button-26',
  'icon-20',
  'icon-22',
  'info',
  'pressed',
  'tooltip',
  'unpressed',
  'pressed-ghost',
  'pressed-disabled',
  'stepper',
]);
const INFO_FACE =
  'color: var(--fab-info-text); border-top-color: var(--fab-info-border); background-color: var(--fab-info-soft)';
const PRESSED_FACE =
  'color: var(--fab-on-accent); border-top-color: var(--fab-accent); background-color: var(--fab-accent)';
const NEUTRAL_FACE =
  'color: var(--fab-text); border-top-color: var(--fab-border); background-color: var(--fab-surface-soft)';
const PRESSED_HOVER_FACE =
  'border-top-color: var(--fab-accent-hover); background-color: var(--fab-accent-hover)';
const PRESSED_DISABLED_FACE =
  'opacity: 0.62; border-top-color: var(--fab-accent); background-color: var(--fab-accent)';

/** Sized to the fixture's 360px ground and its rows. */
const BUTTON_FORMS_WINDOW = Object.freeze({ width: 480, height: 640 });

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

/** The segmented forms fixture's ground, a row by its key, its track, and a segment by value. */
const SEGMENTED_FORMS = '[data-lab-segmented-forms]';
const SEGMENTED_FORM = (key) => `${SEGMENTED_FORMS} > [data-lab-segmented-form="${key}"]`;
const SEGMENTED_FORM_TRACK = (key) => `${SEGMENTED_FORM(key)} .manager-segmented`;
const SEGMENTED_FORM_SEGMENT = (key, value) =>
  `${SEGMENTED_FORM_TRACK(key)} label.manager-segment:has(> input[value="${value}"])`;
const SEGMENTED_FORM_KEYS = Object.freeze([
  'panel-names',
  'panel-compact',
  'own-compact',
  'sized-compact',
  'panel-inline',
  'sized-panel-default',
]);

/** Sized to the fixture's 400px ground and its six rows. */
const SEGMENTED_FORMS_WINDOW = Object.freeze({ width: 520, height: 370 });

/** The chip forms fixture's ground, a row by its key, and the one chip the row's target holds. */
const CHIP_FORMS = '[data-lab-chip-forms]';
const CHIP_FORM = (key) => `${CHIP_FORMS} > [data-lab-chip-form="${key}"]`;
const CHIP_FORM_CHIP = (key) => `${CHIP_FORM(key)} .manager-chip`;
const CHIP_FORM_KEYS = Object.freeze([
  'glyph-positive',
  'glyph-warning',
  'glyph-info',
  'glyph-neutral',
  'glyph-danger',
  'glyph-accent',
  'glyph-default',
  'glyph-list',
  'named',
  'dashed',
  'glyph-dashed',
  'plain',
]);

/** Sized to the fixture's 360px ground and its twelve rows. */
const CHIP_FORMS_WINDOW = Object.freeze({ width: 480, height: 440 });

/** The pagination fixture's ground and target for one pager, by the key both name. */
const pagerGround = (key) => `[data-lab-pagination="${key}"]`;
const pagerTarget = (key) => `${pagerGround(key)} > [data-lab-pagination-target="${key}"]`;
const BROWSE_PREVIOUS = `${pagerGround('browse')} [data-pagination-prev]`;
const compactSegment = (value) =>
  `${pagerGround('compact')} label.manager-segment:has(> input[value="${value}"])`;

/** Sized to the fixture's two 600px grounds, one above the other. */
const PAGER_WINDOW = Object.freeze({ width: 720, height: 240 });

/** The icon picker fixture's ground, which is also its overlay host, its target, trigger and list. */
const ICON_GROUND = '[data-lab-icon-picker]';
const ICON_TARGET = `${ICON_GROUND} > [data-lab-icon-picker-target]`;
const ICON_TRIGGER = `${ICON_GROUND} .essence-icon-picker-trigger`;
const ICON_PANEL = `${ICON_GROUND} > div > .fabricate-icon-picker-popover`;
const ICON_FIELD = `${ICON_PANEL} input`;
const ICON_PINNED = `${ICON_PANEL} .essence-icon-picker-option.pinned`;

/** Sized to the fixture's 320px ground and the list that opens below its trigger. */
const ICON_WINDOW = Object.freeze({ width: 440, height: 560 });

const MENU_GROUND = '[data-lab-action-menu]';
const MENU_TARGET = `${MENU_GROUND} [data-lab-action-menu-target]`;
const MENU_TRIGGER = `${MENU_GROUND} .fabricate-icon-button`;
const MENU_PANEL = `${MENU_GROUND} > div > .fabricate-action-menu-panel`;
const MENU_FIRST = `${MENU_PANEL} button.manager-action-menu-item:first-child`;
const MENU_FOCUSED = `${MENU_GROUND} .fabricate-action-menu-panel button.manager-action-menu-item:focus`;

/** Sized to the fixture's 320px ground and the menu that opens below its trigger. */
const MENU_WINDOW = Object.freeze({ width: 440, height: 380 });

const MODAL_GROUND = '[data-lab-modal]';
const MODAL_OPENER = `${MODAL_GROUND} [data-lab-modal-open] button`;
const MODAL_DIALOG = `${MODAL_GROUND} .fabricate-modal`;
const MODAL_CLOSE = `${MODAL_GROUND} [data-manager-modal-close]`;
const MODAL_DONE = `${MODAL_GROUND} [data-lab-modal-footer] button`;

/** Wider and taller than the 560px dialog, which is sized from the viewport and clipped past it. */
const MODAL_WINDOW = Object.freeze({ width: 720, height: 560 });

/**
 * The standalone fixture's ground, its three columns, one target by key, the style root the seam
 * writes in it, and the player window's root.
 */
const STANDALONE_GROUND = '[data-lab-standalone-ground]';
const STANDALONE_COLUMNS = Object.freeze(
  [1, 2, 3].map((column) => `${STANDALONE_GROUND} > [data-lab-standalone-column="${column}"]`)
);
const STANDALONE_TARGET = (key) => `[data-lab-standalone-target="${key}"]`;
const STANDALONE_ROOT = '.fabricate.fabricate-standalone-root';
const FABRICATE_WINDOW = '.fabricate.fabricate-app';

/**
 * What each target draws, column by column: the controls and the toggle cards' switches, the
 * companion's line in the card's well, its input in the field's slot and the search input; then the
 * stepper's input, the chosen segment, the chosen card, the selected tab, the pager's page-size
 * control and a card's switch; then the select's, the icon picker's and the action menu's
 * triggers, the opener, the closed dialog's `null`, which draws nothing in its target, and two
 * more cards' switches.
 */
const STANDALONE_DRAWN = Object.freeze([
  Object.freeze({
    button: '.fabricate-button',
    'icon-button': '.fabricate-icon-button',
    toggle: '.manager-status-toggle-track',
    'toggle-switch': '.manager-status-toggle-track',
    'toggle-card': '.fabricate-toggle-card .manager-status-toggle-track',
    card: '.fabricate-card .fab-well p',
    field: '.fabricate-field input[type="text"]',
    search: '.fabricate-search input[type="search"]',
  }),
  Object.freeze({
    stepper: '.fab-stepper input[type="number"]',
    segmented: '.manager-segmented .manager-segment.is-active',
    cards: '.fabricate-option-cards .manager-resolution-option.is-active',
    tabs: '.fabricate-tabs [role="tab"][aria-selected="true"]',
    pager: '.fabricate-pagination [data-pagination-size]',
    'toggle-card-off': '.fabricate-toggle-card .manager-status-toggle-track',
  }),
  Object.freeze({
    select: '.fabricate-select .fabricate-select-trigger',
    'icon-picker': '.fabricate-icon-picker .essence-icon-picker-trigger',
    menu: '.fabricate-action-menu .fabricate-icon-button',
    opener: '.fabricate-button',
    modal: null,
    'toggle-card-bare': '.fabricate-toggle-card .manager-status-toggle-track',
    'toggle-card-long': '.fabricate-toggle-card .manager-status-toggle-track',
  }),
]);
/** Each drawing `within` its target, and each target that draws nothing `closed`. */
const holdingDrawn = (within, closed) =>
  STANDALONE_DRAWN.flatMap((column, index) =>
    Object.entries(column).map(([key, drawn]) => {
      const target = `> [data-lab-standalone-column="${index + 1}"] > ${STANDALONE_TARGET(key)}`;
      return drawn ? `:has(${target}${within}${drawn})` : `:has(${target}${closed})`;
    })
  ).join('');

/** A drawing directly under the style root the seam wrote in its target. */
const UNDER_STANDALONE_ROOT = ` > ${STANDALONE_ROOT} `;

/**
 * A ground with no `.fabricate` on it or above it, so none above a target, holding each drawing
 * directly under the style root the seam wrote in its target, the closed dialog's root empty, and
 * none inside the card or the field, so the well mounted in the card's slot and the field's own
 * content wrote none.
 */
const STANDALONE_BARE = `${STANDALONE_GROUND}:not(.fabricate, .fabricate *)${holdingDrawn(UNDER_STANDALONE_ROOT, ` > ${STANDALONE_ROOT}:empty`)}:not(:has(.fabricate-card ${STANDALONE_ROOT})):not(:has(.fabricate-field ${STANDALONE_ROOT}))`;

/** The same ground under the player window's Fabricate root, with no style root written in it. */
const STANDALONE_IN_WINDOW = `${FABRICATE_WINDOW} ${STANDALONE_GROUND}:not(:has(${STANDALONE_ROOT}))${holdingDrawn(' ', ':empty')}`;

/** Wide enough for the three columns, and as tall as the player window's own floor. */
const STANDALONE_WINDOW = Object.freeze({ width: 1200, height: 640 });

/** The standalone layer's panel, in the container the seam mounts there, of the class `panel`. */
const STANDALONE_LAYER_PANEL = (panel) =>
  `body > .fabricate.fabricate-standalone-overlay > div > ${panel}`;

/** The trigger `part` drawn under the style root in the target `key`, while it is expanded. */
const EXPANDED_UNDER_ROOT = (key, part) =>
  `${STANDALONE_TARGET(key)} > ${STANDALONE_ROOT} ${part}[aria-expanded="true"]`;

/** Each column inside the window's content, so a column the window clips fails the capture. */
const STANDALONE_CONTAINMENT = Object.freeze(
  STANDALONE_COLUMNS.map((target) => ({ container: '.window-content', target }))
);

/** A case in the classless companion frame; the light one differs from the dark by the page's colour scheme alone. */
const standaloneCase = (entry) => ({
  app: 'fabricate-standalone-companion',
  publish: true,
  reaches: 'beyond',
  smokeLabels: [],
  steps: [],
  expectSelector: STANDALONE_BARE,
  expectContained: STANDALONE_CONTAINMENT,
  position: STANDALONE_WINDOW,
  kinds: ['standalone', 'specimen'],
  sourceMatches: STANDALONE_LAYER_SOURCES,
  ...entry,
});

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
      'Specimen, mounted through the published seam — the seven data-only leaves, then five kickers and three chips, then a rail and a card that each hold two more mounts in a content slot, reading left to right, top to bottom: three portraits, four art tiles, then a 22px tile on the warning ground and edge and one whose glyph alone takes the info ink; fill bars at 0, 64 and 100, then one stacked in the ten tag names; the meter, then one in the ten tag names; the single banded bar, the histogram; three stat boxes, then two label-first ones with a mono figure, the first over a note line, then one whose figure takes the success ink, the info strip, a kicker wrapped to two lines; a heading kicker in the accent ink, an inline kicker, an 8px and a 9px kicker, a warning and a neutral list chip, a chip whose label wraps; a rail labelled Standing whose meter starts 10px under the label, with an info strip 8px under the meter, and a card on the lighter ground holding a kicker over a stat box; then, each on that lighter ground, a dashed empty panel holding a glyph tile, a serif title and a hint over a centred primary button, a warning notice whose detail wraps to two lines, and the quieter filtered panel holding a hint over a centred neutral button; then two list rows, Iron ingot read-only with its art, its Metal detail and its quantity 3, and Silver ore as a selected whole-row button on the active fill with an accent edge; then, in a one-track cell, an info list chip whose lock glyph stays whole while its long label ends in an ellipsis. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: a companion mounts each through `api.ui`, in states no one screen draws together.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-leaves' },
    steps: [],
    // Spelt from hooks `src/` emits, each root the direct child of its target, so a `FillBar`
    // nested in `Meter` cannot stand in for the mounted one.
    expectSelector: `${LEAVES_GROUND} > section > div > .fabricate-info-strip`,
    // Each mount inside the ground, each nested mount inside its host, the wrapped label inside its
    // chip, the truncated chip inside its own cell, and the ground inside the window, so a row the window clips fails the capture.
    expectContained: [
      ...Array.from({ length: LEAF_MOUNTS }, (_, index) => ({
        container: LEAVES_GROUND,
        target: `${LEAVES_GROUND} > section:nth-child(${index + 1}) > div > *`,
      })),
      ...NESTED_LEAF_CONTAINMENT,
      { container: WRAPPED_CHIP, target: `${WRAPPED_CHIP} > span` },
      {
        container: `${LEAVES_GROUND} > section:nth-child(${LEAF_MOUNTS})`,
        target: TRUNCATED_CHIP,
      },
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
          selector: '.fab-kicker.is-size-8',
          styles: 'font-size: 8px; color: var(--fab-text-muted)',
        },
        {
          selector: '.fab-kicker.is-size-9',
          styles: 'font-size: 9px; color: var(--fab-text-muted)',
        },
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
        {
          selector: ".fabricate-list-row:has(> .fabricate-list-row-open[aria-pressed='true'])",
          styles:
            'border-top-color: var(--fab-accent-border); background-color: var(--fab-surface-active)',
        },
        {
          selector: '.manager-chip.is-truncated > .manager-chip-label',
          styles: 'overflow: hidden; text-overflow: ellipsis',
        },
      ],
    },
    // Sized to the fixture's 880px ground and the height of its rows, with room for the next mount;
    // `expectContained` holds the ground inside `.window-content`.
    position: { width: 1024, height: 860 },
    kinds: ['manager', 'specimen'],
    // Every component mounted here is a broad signal, routed here by its override: the seven
    // leaves (issue 2448), then `Kicker`, `Chip`, `Rail`, `InspectorCard`, `EmptyState` and
    // `Notice` (issue 2451), then `Button` (issue 2452), then `ListRow` (issue 2784), then the
    // truncated `Chip` (issue 2817).
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
    id: 'manager-published-search-forms-specimen',
    label:
      'Specimen, mounted through the published seam — three search fields at the densities SearchField publishes, each beneath the text that names it, in a 320px column on the --fab-bg-1 ground. Reading top to bottom: Search recipes, the 38px shell at radius 9 holding tonic with 12 found at its trailing edge; Search components, the 34px toolbar shell at radius 9 holding iron with 3 chosen; and Search tags, the 30px inline shell at radius 7 holding ore with 1 found. Each count sits on one line inside the shell’s inset in the muted ink, after the query and its glyph. The frame draws inside the manager window and is the evidence for it alone; the lit border at each rung, a long count and the polite announcement are the rendered and mounted suites’',
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-search-forms' },
    steps: [],
    // Each section's count the fixture's effect drew, the inline rung's last.
    expectSelector: `${SEARCH_FORMS}:has(> [data-lab-search-form="default"] .fabricate-search > .fabricate-search-count):has(> [data-lab-search-form="toolbar"] .fabricate-search.is-density-toolbar > .fabricate-search-count) > [data-lab-search-form="inline"] .fabricate-search.is-density-inline > .fabricate-search-count[role="status"]`,
    expectContained: [
      ...SEARCH_FORM_RUNGS.map(([key]) => ({
        container: SEARCH_FORMS,
        target: SEARCH_FORM(key, '.fabricate-search'),
      })),
      { container: '.window-content', target: SEARCH_FORMS },
    ],
    expectLayout: {
      controls: [
        // Each section's shell at its rung and corner, and its count's muted ink on one line.
        ...SEARCH_FORM_RUNGS.map(([key, height, corner]) => ({
          selector: SEARCH_FORM(key, '.fabricate-search'),
          styles: `height: ${height}px; border-radius: ${corner}px`,
        })),
        ...SEARCH_FORM_RUNGS.map(([key]) => ({
          selector: SEARCH_FORM(key, '.fabricate-search-count'),
          styles: 'color: var(--fab-text-muted); white-space: nowrap',
        })),
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
    sourceMatches: OPEN_PANEL_SOURCES,
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
    // Each group's bars side by side on one line, every caption whole, so no name is cut off
    // with an ellipsis, and every track at least 72px, as the forge group's four draw 79.5px.
    expectLayout: {
      containerSelector: STAGE_BARS_GROUND,
      oneLineRows: `${STAGE_BARS_GROUND} .fab-stage-bars`,
      unclipped: `${STAGE_BARS_GROUND} .fab-stage-bars-caption`,
      minInlineSize: { selector: `${STAGE_BARS_GROUND} .fab-stage-bars-track`, pixels: 72 },
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
    id: 'manager-published-field-forms-specimen',
    label:
      'Specimen, mounted through the published seam — five fields at the forms Field publishes, in a 320px column on the --fab-bg-1 ground, each a caption over the companion’s own input. Reading top to bottom: Activity name, a 34px input at radius 9 holding Moonlit Glade in the serif face; Check formula, a 30px input at radius 7 holding 1d20 + 4 in the mono face; Uses, a 28px number input at radius 7 holding 3 in the mono face with no step buttons beside it; Tag, a 26px input at radius 7 holding Iron in the column’s face; and Bonus, a 30px input at radius 7 holding 1d20 + on the translucent danger fill, holding keyboard focus after one step that presses the right arrow in it, so the 1px accent ring is drawn inset over its danger edge, with the message Finish the formula beneath it in the danger text ink after a decorative warning glyph. The frame draws inside the manager window and is the evidence for it alone; the error state’s colours, the focus ring at each rung and the step buttons’ absence are the rendered suite’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own content in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-field-forms' },
    steps: [{ selector: FIELD_FORM_INPUT('bonus'), press: 'ArrowRight' }],
    // Every section's input the fixture's effect drew, the error one described by its message and focused.
    expectSelector: `${FIELD_FORMS}:has(> [data-lab-field-form="name"] .fabricate-field.is-size-34.is-face-serif input):has(> [data-lab-field-form="uses"] .fabricate-field.is-type-number input[type="number"]):has(> [data-lab-field-form="tag"] .fabricate-field.is-size-26 input) > [data-lab-field-form="bonus"] .fabricate-field.is-invalid input[aria-invalid="true"][aria-describedby]:focus`,
    expectContained: [
      ...FIELD_FORM_RUNGS.map(([key]) => ({
        container: FIELD_FORMS,
        target: FIELD_FORM_INPUT(key),
      })),
      { container: '.window-content', target: FIELD_FORMS },
    ],
    expectLayout: {
      controls: [
        // Each section's input at its rung and corner, the number input's want of step buttons, and the ring.
        ...FIELD_FORM_RUNGS.map(([key, height, corner]) => ({
          selector: FIELD_FORM_INPUT(key),
          styles: `height: ${height}px; border-radius: ${corner}px`,
        })),
        { selector: FIELD_FORM_INPUT('uses'), styles: 'appearance: textfield' },
        // The focused error input's inset ring, drawn over its danger edge.
        {
          selector: `${FIELD_FORM_INPUT('bonus')}:focus-visible`,
          styles: 'outline-style: solid; outline-width: 1px; outline-offset: -1px',
        },
      ],
    },
    position: FIELD_FORMS_WINDOW,
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
    id: 'manager-published-card-tones-specimen',
    label:
      'Specimen, mounted through the published seam — seven cards 8px apart in a 320px column on the --fab-bg-1 ground, each headed as InspectorCard publishes: a 34px Medallion tile in the leading slot beside a serif 15px title over an 11px note, and a published 28px Manage button in the trailing slot at the far edge, above the body line Two crafters assigned. Reading top to bottom: the untoned baseline, Activity limits, on the --fab-bg-2 fill inside the --fab-border edge with its note in the muted ink; then Over the limit on the warning fill inside the warning edge, its Manage button holding keyboard focus after one right-arrow press in it, so the 2px accent ring is drawn beside the tone edge; Ready to finish on the success fill; Chosen route on the accent fill; Check due on the info fill, each toned note in the secondary ink and each tile in its tone, every 296px card keeping its Manage button on the title’s row; a 180px warning card whose Manage button has dropped beneath its tile and title, at the far edge; and Standing rules, an untoned card holding an accent well, the on panel, with the line Catch up missed ticks: on. The frame draws inside the manager window and is the evidence for it alone; the second edge under forced colours, the head’s refusals and the slots kept across an update are the rendered and mounted suites’, and the contrast on the four grounds is the contrast measurement’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own controls in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-card-tones' },
    steps: [{ selector: CARD_TONE_PART('warning', '.fabricate-button'), press: 'ArrowRight' }],
    // Every section's card the fixture's effect drew, the warning card's button focused, and the well.
    expectSelector: `${CARD_TONES}:has(> [data-lab-card-tone="info"] .fabricate-card.is-tone-info .fab-card-leading .fab-medallion):has(> [data-lab-card-tone="narrow"] .fabricate-card.is-tone-warning .fab-card-trailing .fabricate-button):has(> [data-lab-card-tone="warning"] .fab-card-trailing .fabricate-button:focus) > [data-lab-card-tone="well"] .fabricate-card .fab-well.is-tone-accent`,
    expectContained: [
      ...['plain', ...CARD_TONE_KEYS, 'narrow', 'well'].map((key) => ({
        container: CARD_TONES,
        target: CARD_TONE(key),
      })),
      { container: '.window-content', target: CARD_TONES },
    ],
    expectLayout: {
      controls: [
        // The untoned card's fill and edge, its title's face and its note's muted ink; each tone's
        // fill, edge and the secondary note; the focused button's ring; and the accent well.
        {
          selector: CARD_TONE('plain'),
          styles: 'background-color: var(--fab-bg-2); border-top-color: var(--fab-border)',
        },
        {
          selector: CARD_TONE_PART('plain', '.fab-card-title'),
          styles: 'font-size: 15px; font-weight: 600; color: var(--fab-text); margin-top: 0px',
        },
        {
          selector: CARD_TONE_PART('plain', '.fab-card-note'),
          styles: 'font-size: 11px; color: var(--fab-text-muted)',
        },
        ...CARD_TONE_KEYS.flatMap((tone) => [
          {
            selector: CARD_TONE(tone),
            styles: `background-color: var(--fab-${tone}-soft); border-top-color: var(--fab-${tone}-border)`,
          },
          {
            selector: CARD_TONE_PART(tone, '.fab-card-note'),
            styles: 'color: var(--fab-text-secondary)',
          },
        ]),
        {
          selector: `${CARD_TONE_PART('warning', '.fabricate-button')}:focus-visible`,
          styles: 'outline-style: solid; outline-width: 2px; outline-color: var(--fab-accent)',
        },
        {
          selector: `${CARD_TONE('well')} .fab-well`,
          styles:
            'background-color: var(--fab-accent-soft); border-top-color: var(--fab-accent-border)',
        },
      ],
    },
    position: CARD_TONES_WINDOW,
    kinds: ['manager', 'specimen'],
    // `InspectorCard.svelte` and `Well.svelte` are broad signals, routed here by their overrides.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-callout-actions-specimen',
    label:
      'Specimen, mounted through the published seam — three standing notes and two notices 8px apart in a 320px column on the --fab-bg-1 ground. Reading top to bottom: Begin an activity, an accent note at actionsPlacement below, its sentence beside its glyph and beneath them, across the strip’s whole content box, a full-width primary Begin activity button; At your limit, the same at the warning tone in a 180px column, the button still full width under the wrapped sentence; Standing rules, a neutral note at the default inline placement, its Read button on the sentence’s row at the far edge; then two danger notices, Something went wrong over The Downtime Studio could not be drawn, the first mounted assertive as role alert and the second the polite status, drawn alike. The frame draws inside the manager window and is the evidence for it alone; the announcement role at each tone and across an update is the mounted suite’s, and the stacked geometry at 320 and 180px the rendered suite’s',
    // Beyond the smoke: a companion mounts each through `api.ui` and draws its own control in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-callout-actions' },
    steps: [],
    // Both stacked notes' buttons, the inline note's, and the alert beside the polite notice.
    expectSelector: `${CALLOUT_ACTIONS_GROUND}:has(> [data-lab-callout-action="cta"] .manager-callout.is-actions-below .fabricate-button.is-full-width):has(> [data-lab-callout-action="narrow"] .manager-callout.is-actions-below .fabricate-button.is-full-width):has(> [data-lab-callout-action="inline"] .manager-callout:not(.is-actions-below) .fabricate-button):has(> [data-lab-callout-action="status"] .fab-notice[role="status"]) > [data-lab-callout-action="fault"] .fab-notice[role="alert"]`,
    expectContained: [
      ...['cta', 'narrow', 'inline'].map((key) => ({
        container: CALLOUT_ACTIONS_GROUND,
        target: CALLOUT_ACTION(key, '.manager-callout'),
      })),
      ...['fault', 'status'].map((key) => ({
        container: CALLOUT_ACTIONS_GROUND,
        target: CALLOUT_ACTION(key, '.fab-notice'),
      })),
      { container: '.window-content', target: CALLOUT_ACTIONS_GROUND },
    ],
    expectLayout: {
      controls: [
        // Each stacked host's column, the inline host's row, and the two notices' one face.
        ...['cta', 'narrow'].map((key) => ({
          selector: CALLOUT_ACTION_HOST(key),
          styles: 'flex-direction: column; align-items: stretch',
        })),
        { selector: CALLOUT_ACTION_HOST('inline'), styles: 'flex-direction: row' },
        ...['fault', 'status'].map((key) => ({
          selector: CALLOUT_ACTION(key, '.fab-notice'),
          styles:
            'background-color: var(--fab-danger-soft); border-top-color: var(--fab-danger-border)',
        })),
      ],
    },
    position: CALLOUT_ACTIONS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Callout.svelte` and `Notice.svelte` are broad signals, routed here by their overrides.
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
    id: 'manager-published-list-row-aside-specimen',
    label:
      'Specimen, mounted through the published seam — two list rows, 8px apart in a 320px column on the --fab-bg-2 ground, each with its aside content slot requested. Reading top to bottom: Moonpetal tincture, a whole-row button with its default box glyph and its Stage 2 of 3 detail, and beneath its mark, name and detail, on a line of its own across the row, the companion’s column of the line Due at dusk, Mira Voss tending over a published fill bar at 64; then Ember salt reserve, a read-only row with its quantity 3 and, on its own line beneath, the companion’s line Restocked by the caravan. Both rows take the tighter inset of a row with an aside, and each aside’s text is in the row’s muted ink and type. The frame draws inside the manager window and is the evidence for it alone; that a press on the aside presses the button is the rendered suite’s, and the slot’s detach, re-attach and stillness across an onOpen update are the mounted suite’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own content in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-list-rows' },
    steps: [],
    // Both rows the fixture's effect mounted, each aside holding the companion's element, the
    // button row's holding the bar mounted in it.
    expectSelector: `${LIST_ROW_GROUND}:has(> [data-lab-list-row="still"] .fabricate-list-row > .fabricate-list-row-aside [data-lab-list-row-aside]) > [data-lab-list-row="open"] .fabricate-list-row:has(> button.fabricate-list-row-open) > .fabricate-list-row-aside [data-lab-list-row-aside] .fab-fill-bar`,
    expectContained: [
      ...['open', 'still'].flatMap((key) => [
        { container: LIST_ROW(key), target: `${LIST_ROW_ASIDE(key)} [data-lab-list-row-aside]` },
        { container: LIST_ROW_GROUND, target: LIST_ROW(key) },
      ]),
      { container: '.window-content', target: LIST_ROW_GROUND },
    ],
    expectLayout: {
      controls: [
        // The aside's own line across the row, beneath the button's layer, the private wrapper
        // and slot element that take no box, and the row's ink its text takes.
        ...['open', 'still'].flatMap((key) => [
          {
            selector: LIST_ROW_ASIDE(key),
            styles:
              'position: relative; z-index: 0; flex-basis: 100%; color: var(--fab-text-muted)',
          },
          { selector: `${LIST_ROW_ASIDE(key)} > div`, styles: SLOT_BOX },
          { selector: `${LIST_ROW_ASIDE(key)} > div > div`, styles: SLOT_BOX },
        ]),
      ],
    },
    position: LIST_ROW_WINDOW,
    kinds: ['manager', 'specimen'],
    // `ListRow.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-list-row-slots-specimen',
    label:
      'Specimen, mounted through the published seam — three list rows, 8px apart in a 320px column on the --fab-bg-2 ground, each with content slots requested. Reading top to bottom: Moonpetal tincture, a whole-row button with the Stage 2 of 3 detail, a published glyph medallion in place of its mark, a published Fresh chip after its name, the companion’s line Due at dusk, Mira Voss tending beneath, and at the row’s end beside the button a published pencil icon button; then Ember salt reserve, a read-only row with its quantity 3, a published Low stock chip after its name and the pencil icon button at its end; then Cinder salt reserve, a read-only row at the dense inset with the pencil icon button as a bare flex item after its name. The two rows with badges take the tighter inset of a selectable form and the bare row keeps the dense row’s. The frame draws inside the manager window and is the evidence for it alone; which element a point lands on is the rendered suite’s, and the slots’ move, detach and re-attach are the mounted suite’s',
    // Beyond the smoke: a companion mounts it through `api.ui` and draws its own content in it.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-list-row-slots' },
    steps: [],
    // Each row's last mount: the medallion, chip and note of the button row, and an icon button
    // in each row's trailing slot, the bare row's a child of the root.
    expectSelector: `${SLOT_GROUND}:has(> [data-lab-list-row="open"] .fabricate-list-row-open .fab-medallion):has(> [data-lab-list-row="open"] .fabricate-list-row-trailing button):has(> [data-lab-list-row="still"] .fabricate-list-row-badges .manager-chip):has(> [data-lab-list-row="still"] .fabricate-list-row-trailing button):has(> [data-lab-list-row="bare"] .fabricate-list-row > span > span button)`,
    expectContained: [
      ...['open', 'still', 'bare'].map((key) => ({
        container: SLOT_ROW(key),
        target: `${SLOT_ROW(key)} button:not(.fabricate-list-row-open)`,
      })),
      {
        container: SLOT_ROW('open'),
        target: `${SLOT_HOST('open', 'meta')} [data-lab-list-row-meta]`,
      },
      ...['open', 'still', 'bare'].map((key) => ({
        container: SLOT_GROUND,
        target: SLOT_ROW(key),
      })),
      { container: '.window-content', target: SLOT_GROUND },
    ],
    expectLayout: {
      controls: [
        // The slot hosts the row lays out, each lifted above the button's overlay, and the private
        // wrapper and slot element that take no box.
        ...[
          ['open', 'leading'],
          ['open', 'badges'],
          ['open', 'meta'],
          ['open', 'trailing'],
          ['still', 'badges'],
          ['still', 'trailing'],
        ].flatMap(([key, slot]) => [
          { selector: `${SLOT_HOST(key, slot)} > span`, styles: SLOT_BOX },
          { selector: `${SLOT_HOST(key, slot)} > span > span`, styles: SLOT_BOX },
        ]),
        { selector: SLOT_HOST('open', 'trailing'), styles: 'position: relative; z-index: 2' },
        { selector: SLOT_HOST('still', 'trailing'), styles: 'position: relative; z-index: 2' },
        { selector: `${SLOT_ROW('bare')} > span:has(> span > ${BARE_TRAILING})`, styles: SLOT_BOX },
        { selector: `${SLOT_ROW('bare')} > span > span:has(> ${BARE_TRAILING})`, styles: SLOT_BOX },
      ],
    },
    position: SLOT_WINDOW,
    kinds: ['manager', 'specimen'],
    // `ListRow.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-list-row-forms-specimen',
    label:
      'Specimen, mounted through the published seam — list rows at the geometry and state ListRow publishes, in a 480px column on the --fab-bg-2 ground, 8px apart. Reading top to bottom: Mira Voss, a read-only dense row with a 26px glyph mark and its Contributor detail; Ember salt reserve, a whole-row button with a 28px mark and its quantity 3 at the selectable form’s tighter inset; Moonlit Glade, a whole-row button at the default density, its 30px mark at a 12px by 16px inset with an 11px corner; then a four-column board of read-only rows, each a 30px mark and the long name Forge a Pattern-Welded Blade of the Deep Seam cut to one line with an ellipsis, its Recipe detail held at the row’s end; and a four-column board of cards on the card ground at an 11px corner, each a 34px mark above the same name, cut to one line with an ellipsis, over its Forest detail; then three read-only stage rows 4px apart, Gather the ore plain with its Done detail, Quench the blade the current step on the active fill with an accent edge at the dense row’s own inset and its Now detail, and Temper the edge muted with a dashed edge and its Not yet reachable detail; and Ember salt reserve, a busy whole-row button whose mark is a spinner glyph, with its Claiming the reward detail. The frame draws inside the manager window and is the evidence for it alone; the row heights each rung sets, the card’s column and the face on each ground are the rendered suites’, and the keys’ update and removal, the busy press and the ARIA each state writes are the mounted suites’',
    // Beyond the smoke: a companion mounts it through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-list-row-forms' },
    steps: [],
    // Every section's rows the fixture's effect mounted, the last board's fourth card, the current
    // stage and the busy reward's spinner among them.
    expectSelector: `${FORMS_GROUND}:has(> [data-lab-list-row-form="portrait"] .fabricate-list-row):has(> [data-lab-list-row-form="board"] > div:nth-child(4) .fabricate-list-row):has(> [data-lab-list-row-form="stages"] > div:nth-child(2) .fabricate-list-row.is-selected-face[aria-current="step"]):has(> [data-lab-list-row-form="reward"] .fabricate-list-row-open[aria-busy="true"] .fa-spinner) > [data-lab-list-row-form="cards"] > div:nth-child(4) .fabricate-list-row.is-card > .fabricate-list-row-open`,
    expectContained: [
      ...FORM_MARKS.map(([key]) => ({ container: FORMS_GROUND, target: FORM_ROW(key) })),
      ...[1, 2, 3].map((place) => ({ container: FORMS_GROUND, target: FORM_ROW('stages', place) })),
      { container: FORMS_GROUND, target: FORM_ROW('reward') },
      { container: '.window-content', target: FORMS_GROUND },
    ],
    expectLayout: {
      controls: [
        // Each section's mark at its rung, the default row's inset, the board's one-line name, the
        // card's column at its corner, the current stage's face at the dense inset and the busy cursor.
        ...FORM_MARKS.map(([key, size]) => ({
          selector: `${FORM_ROW(key)} .fab-medallion`,
          styles: `width: ${size}px; height: ${size}px`,
        })),
        {
          selector: FORM_ROW('default'),
          styles: 'padding-top: 12px; padding-left: 16px; border-top-left-radius: 11px',
        },
        {
          selector: `${FORM_ROW('board')} .fabricate-list-row-name`,
          styles: 'text-overflow: ellipsis; white-space: nowrap; overflow-x: hidden',
        },
        {
          selector: FORM_ROW('cards'),
          styles:
            'flex-direction: column; border-top-left-radius: 11px; background-color: var(--fab-bg-2)',
        },
        {
          selector: FORM_ROW('stages', 2),
          styles:
            'background-color: var(--fab-surface-active); border-top-color: var(--fab-accent-border); padding-top: 8px; padding-left: 12px',
        },
        {
          selector: `${FORM_ROW('reward')} > .fabricate-list-row-open`,
          styles: 'cursor: progress',
        },
      ],
    },
    position: FORMS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `ListRow.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-icon-buttons-specimen',
    label:
      'Specimen, mounted through the published seam — ten icon buttons in a 360px column on the window’s --fab-bg-1 ground, 8px apart, each a glyph alone beside a caption the companion draws, after two steps: a click on the last, the Batch notes disclosure, whose callback passed aria-expanded true in its own update and showed the companion’s notes line Quench each ingot before the next pour beneath it, the pointer still resting on that button’s raised tile; and Tab from the danger button, which put keyboard focus on the ghost-danger Remove Ember salt, so it carries the accent keyboard ring, 2px wide with 2px of ground between ring and face, on its danger fill and ink. Reading top to bottom: a neutral pen on its 34px bordered face; a primary check in the success ink and edge; a ghost ellipsis 28px tall with no edge or fill; a danger trash in the danger ink and edge; the focused ghost-danger xmark; a second ghost-danger xmark that nothing focuses, 28px square with no edge or fill and the subtle ink, as a ghost rests; an xmark at size 24 and one at size 26, each a square of that side; and a disabled arrow at 62% opacity. The lab’s stand-in for Foundry’s tooltip manager records the keyboard focus’s tooltip and draws none, so the frame shows no tooltip; the hover text each button writes and the tooltip’s opening and closing are the mounted suite’s',
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
        // The role at rest, which the focused row above cannot show: no edge, no fill, the subtle ink.
        {
          selector: ICON_BUTTON('ghost-danger-rest'),
          styles:
            'width: 28px; height: 28px; color: var(--fab-text-subtle); border-top-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0)',
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
    id: 'manager-published-button-forms-specimen',
    label:
      'Specimen, mounted through the published seam — eleven controls in a 360px column on the window’s --fab-bg-1 ground, 8px apart, each beside a caption the companion draws, after two steps: a click on the pressed ghost Show the reward, the pointer still resting on it, and Tab from the pressed +7 button, which put keyboard focus on Rewind, so it carries the accent keyboard ring, 2px wide with 2px of ground between ring and face. Reading top to bottom: the neutral button Add tier at the 24px rung with a 6px corner, the neutral button Claim at the 26px rung with a 7px corner, each keeping the default rung’s inline padding; the neutral icon button Dismiss the entry, an xmark on a 20px square, and Credit a day to Mira, a plus on a 22px square, each at a 6px corner; Roll Wits in the info role, its info ink on the soft info fill inside the info edge; +7, pressed, a solid accent tile in the ink drawn on it; the focused Rewind; +7 again, not pressed, on the neutral face; the pressed ghost under the pointer, its tile in the accent’s hover colour; the pressed toggle disabled, its tile kept under the disabled dimming; and a stepper at 3 whose minus and plus carry tooltips. The lab’s stand-in for Foundry’s tooltip manager records the keyboard focus’s tooltip and draws none, so the frame shows no tooltip; the frame cannot show the 24px pointer target the two icon buttons reach past their box, which the rendered suite measures, nor the names, aria-pressed and hover text, which the mounted suites read',
    // Beyond the smoke: a companion mounts each through `api.ui` and is told of each press.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-button-forms' },
    steps: [
      { selector: BUTTON_FORM_CONTROL('pressed-ghost') },
      { selector: BUTTON_FORM_CONTROL('pressed'), press: 'Tab' },
    ],
    // The stepper mounted last, the pressed toggle's state, and the tooltip the keyboard focus
    // opened through the facade on the Rewind button.
    expectSelector: `${BUTTON_FORMS}:has(> [data-lab-button-form="stepper"] [data-stepper-increment][data-tooltip-text]):has(> [data-lab-button-form="pressed"] button[aria-pressed="true"]) > [data-lab-button-form="tooltip"] button[aria-describedby="tooltip"]:focus-visible`,
    expectContained: [
      ...BUTTON_FORM_KEYS.map((key) => ({ container: BUTTON_FORMS, target: BUTTON_FORM(key) })),
      { container: '.window-content', target: BUTTON_FORMS },
    ],
    expectLayout: {
      controls: [
        // Each rung's box and corner, and the default inline padding the button rungs keep.
        {
          selector: BUTTON_FORM_CONTROL('button-24'),
          styles: 'height: 24px; border-top-left-radius: 6px; padding-left: 12px',
        },
        {
          selector: BUTTON_FORM_CONTROL('button-26'),
          styles: 'height: 26px; border-top-left-radius: 7px; padding-left: 12px',
        },
        {
          selector: BUTTON_FORM_CONTROL('icon-20'),
          styles: 'width: 20px; height: 20px; border-top-left-radius: 6px',
        },
        {
          selector: BUTTON_FORM_CONTROL('icon-22'),
          styles: 'width: 22px; height: 22px; border-top-left-radius: 6px',
        },
        // The info face, the pressed face at rest, beside its unpressed self, under the pointer on
        // a ghost and disabled, and the focused hint button's ring.
        { selector: BUTTON_FORM_CONTROL('info'), styles: INFO_FACE },
        { selector: BUTTON_FORM_CONTROL('pressed'), styles: PRESSED_FACE },
        { selector: BUTTON_FORM_CONTROL('unpressed'), styles: NEUTRAL_FACE },
        // Still under the pointer; the lab emulates reduced motion, so the read is not mid-fade.
        { selector: BUTTON_FORM_CONTROL('pressed-ghost'), styles: PRESSED_HOVER_FACE },
        { selector: BUTTON_FORM_CONTROL('pressed-disabled'), styles: PRESSED_DISABLED_FACE },
        {
          selector: `${BUTTON_FORM_CONTROL('tooltip')}:focus-visible`,
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent)',
        },
      ],
    },
    position: BUTTON_FORMS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Button.svelte`, `IconButton.svelte` and `Stepper.svelte` are broad signals, each routed
    // here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
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
  managerCase({
    id: 'manager-published-segmented-forms-specimen',
    label:
      "Specimen, mounted through the published seam — six segmented controls in a 400px column on the window's --fab-bg-1 ground, 8px apart, each beside a caption the companion draws. Reading top to bottom: a reward choice of Oak staff, Ash bow and Yew charm on the panel surface, its track filled --fab-bg-0, one step below the ground, whose Oak staff and Yew charm radios are named by their ariaLabel, after one step: ArrowRight pressed on the checked Oak staff radio, so the companion's update drew Ash bow selected, the raised tile in the primary ink at weight 600 with the accent keyboard ring 2px wide and 2px clear; then Characters and Party at the compact density in the accent tone, on the panel surface and, below it for comparison, on its own --fab-bg-1 track, Characters solid accent in each; then At least, Exactly and a dimmed disabled At most at the compact density in the info tone at size 34, a 34px track where the compact one is 36, At least solid info; then All and Mine at the inline density on the panel surface, All selected; then All, Mine and Shared at the default density at size 34 on the panel surface, a 34px track filled --fab-bg-0, All selected. The frame cannot show the radios' names, which the rendered suite reads from Chromium's accessibility tree",
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-segmented-forms' },
    steps: [
      {
        selector: `${SEGMENTED_FORM_TRACK('panel-names')} input[value="oak"]`,
        press: 'ArrowRight',
      },
    ],
    // The reached segment selected by the companion's own update, keyboard-focused, under the
    // fixture's echo of the value, which only `onChange` writes.
    expectSelector: `${SEGMENTED_FORMS} > [data-lab-segmented-form="panel-names"][data-lab-segmented-form-chosen="ash"] label.is-active:has(> input[value="ash"]:checked:focus-visible)`,
    expectContained: [
      ...SEGMENTED_FORM_KEYS.map((key) => ({
        container: SEGMENTED_FORMS,
        target: SEGMENTED_FORM(key),
      })),
      { container: '.window-content', target: SEGMENTED_FORMS },
    ],
    expectLayout: {
      controls: [
        // The panel track's fill, beside its own-surface twin's, and the stated rung's height.
        {
          selector: SEGMENTED_FORM_TRACK('panel-compact'),
          styles: 'height: 36px; background-color: var(--fab-bg-0)',
        },
        {
          selector: SEGMENTED_FORM_TRACK('own-compact'),
          styles: 'height: 36px; background-color: var(--fab-bg-1)',
        },
        { selector: SEGMENTED_FORM_TRACK('sized-compact'), styles: 'height: 34px' },
        {
          selector: SEGMENTED_FORM_TRACK('panel-inline'),
          styles: 'height: 30px; background-color: var(--fab-bg-0)',
        },
        {
          selector: SEGMENTED_FORM_TRACK('sized-panel-default'),
          styles: 'height: 34px; background-color: var(--fab-bg-0)',
        },
        // The keyboard-reached segment's ring, ink and weight on the panel track.
        {
          selector: SEGMENTED_FORM_SEGMENT('panel-names', 'ash'),
          styles:
            'outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--fab-accent); color: var(--fab-text); font-weight: 600',
        },
      ],
    },
    position: SEGMENTED_FORMS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `SegmentedControl.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-chip-forms-specimen',
    label:
      "Specimen, mounted through the published seam — twelve chips in a 360px column on the window's --fab-bg-1 ground, 6px apart, each beside a caption the companion draws. Reading top to bottom: the icon-only chip, a glyph alone on a 20px square named by its ariaLabel, under the positive tone with a check, the warning tone with a warning triangle, the info tone with a question mark, the neutral tone with a dash, the danger tone with a cross, the accent tone with a star and no tone with an hourglass, then the positive check on the 15px list square; a chip labelled 3 in the info tone, named 3 days waiting; a locked chip, a lock glyph beside Locked until the harvest, in the dashed emphasis, its edge dashed, then the icon-only lock dashed, then the same locked chip with no emphasis, its edge solid, for comparison. No chip takes focus. The frame cannot show the names or the hover tooltip each icon-only chip carries, which the mounted and rendered suites read",
    // Beyond the smoke: a companion mounts each through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-chip-forms' },
    steps: [],
    expectSelector: `${CHIP_FORMS}:has(> [data-lab-chip-form="glyph-positive"] .manager-chip.is-icon-only) > [data-lab-chip-form="plain"] .manager-chip`,
    expectContained: [
      ...CHIP_FORM_KEYS.map((key) => ({ container: CHIP_FORMS, target: CHIP_FORM(key) })),
      { container: '.window-content', target: CHIP_FORMS },
    ],
    expectLayout: {
      controls: [
        // Each square's side, and the dashed edge beside its undashed twin.
        { selector: CHIP_FORM_CHIP('glyph-positive'), styles: 'width: 20px; height: 20px' },
        { selector: CHIP_FORM_CHIP('glyph-list'), styles: 'width: 15px; height: 15px' },
        { selector: CHIP_FORM_CHIP('dashed'), styles: 'border-top-style: dashed' },
        { selector: CHIP_FORM_CHIP('glyph-dashed'), styles: 'border-top-style: dashed' },
        { selector: CHIP_FORM_CHIP('plain'), styles: 'border-top-style: solid' },
      ],
    },
    position: CHIP_FORMS_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Chip.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-pagination-specimen',
    label:
      "Specimen, mounted through the published seam — a reagent pager on a 600px column of the --fab-bg-2 ground, 60 records at 25 a page on page 2 of 3, its sizes 10, 25 and 50 with 25 selected, at the default density on its own --fab-bg-1 bar, after one step: Enter pressed on the Next arrow, so Fabricate called onPageChange, whose update drew the last page. So the summary reads 51–60 of 60 reagents and the page label Page 3 of 3, Next is disabled, and focus rests on the Previous arrow, which carries the accent keyboard ring, 2px wide with 2px of ground between ring and arrow, and which has opened Foundry's tooltip for its name, Previous reagents page, on the keyboard focus Fabricate moved to it (the lab records the tooltip as aria-describedby and draws none)",
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each page turn.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-pagination' },
    steps: [{ selector: `${pagerGround('browse')} [data-pagination-next]`, press: 'Enter' }],
    // The last page drawn by the companion's own update, under the fixture's echo of the page,
    // which only `onPageChange` writes, and the focus Fabricate moved off the disabled Next, which
    // opens Previous's tooltip.
    expectSelector: `${pagerGround('browse')}[data-lab-pagination-page="2"]:has([data-pagination-next]:disabled) [data-pagination-prev][aria-describedby="tooltip"]:focus-visible`,
    expectCenterHit: BROWSE_PREVIOUS,
    expectContained: [
      { container: pagerGround('browse'), target: pagerTarget('browse') },
      { container: '.window-content', target: pagerGround('browse') },
    ],
    expectLayout: {
      controls: [
        // The moved focus's ring by its shape; its colour is the census's.
        {
          selector: BROWSE_PREVIOUS,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: PAGER_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Pagination.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-pagination-size-specimen',
    label:
      'Specimen, mounted through the published seam — a compact reagent rail pager on a 600px column of the --fab-bg-2 ground, 40 records at 10 a page, its sizes 10 and 25 on the inline rung, one transparent row whose Per page caption shows and whose page label is visually hidden, after one step: ArrowRight pressed on the checked 10 radio, which the platform moved to 25 and checked, so Fabricate called onPageSizeChange, whose update drew 25 a page from the first page. So the summary reads 1–25 of 40 reagents and the 25 segment is the raised selected tile carrying the accent keyboard ring, 2px wide with 2px of ground between ring and segment',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each size chosen.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-pagination' },
    steps: [{ selector: `${pagerGround('compact')} input[value="10"]`, press: 'ArrowRight' }],
    // The reached size selected by the companion's own update, its radio checked and
    // keyboard-focused, under the fixture's echo of the size, which only `onPageSizeChange` writes.
    expectSelector: `${pagerGround('compact')}[data-lab-pagination-size="25"] label.is-active:has(> input[value="25"]:checked:focus-visible)`,
    expectCenterHit: compactSegment(25),
    expectContained: [
      { container: pagerGround('compact'), target: pagerTarget('compact') },
      { container: '.window-content', target: pagerGround('compact') },
    ],
    expectLayout: {
      controls: [
        // The reached segment's ring by its shape, and the page label held off the screen.
        {
          selector: compactSegment(25),
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
        {
          selector: `${pagerGround('compact')} [data-pagination-page]`,
          styles: 'position: absolute; width: 1px; height: 1px; clip-path: inset(50%)',
        },
      ],
    },
    position: PAGER_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Pagination.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-icon-picker-specimen',
    label:
      'Specimen, mounted through the published seam — a reagent icon picker on a 320px column of the --fab-bg-2 ground, which is also its overlay host, its trigger showing the flask glyph, the name Flask and a caret, after one step: Enter pressed on the trigger, which opened the list in the ground with focus in its query field. So the query field holds keyboard focus, its 1px border turned to the accent and its Search icons placeholder hidden, and the flask row is pinned first above the vocabulary and selected',
    // Beyond the smoke: a companion mounts it through `api.ui`; the list is drawn in its own host.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-icon-picker' },
    steps: [{ selector: ICON_TRIGGER, press: 'Enter' }],
    // The list in the host the companion passed, focus in its query field, and the value's row
    // pinned and selected.
    expectSelector: `${ICON_GROUND} > div > .fabricate-icon-picker-popover:has(input:focus) .essence-icon-picker-option.pinned[aria-selected="true"]`,
    expectCenterHit: ICON_PINNED,
    expectContained: [
      { container: ICON_GROUND, target: ICON_TARGET },
      { container: '.window-content', target: ICON_GROUND },
    ],
    expectLayout: {
      controls: [
        // The trigger's and the pinned row's declared corners, and the focused field's want of a
        // ring of its own; its accent border's colour is the census's.
        { selector: ICON_TRIGGER, styles: 'border-radius: 9px' },
        { selector: ICON_PINNED, styles: 'border-radius: 9px' },
        { selector: `${ICON_FIELD}:focus-visible`, styles: 'outline-style: none' },
      ],
    },
    position: ICON_WINDOW,
    kinds: ['manager', 'specimen'],
    // `IconPicker.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-icon-picker-choice',
    label:
      'Specimen, mounted through the published seam — the same reagent icon picker, after four steps: Enter pressed on the trigger, which opened the list with focus in its query field; ArrowDown pressed twice there, which moved the active row past the pinned flask row to the first glyph of the vocabulary; and Enter, which chose it, so Fabricate called onChange, whose update drew the chosen glyph. So the list is closed, the trigger shows the chosen glyph and its name, and focus has returned to the trigger, which carries the accent keyboard ring, 2px wide with 2px of ground between ring and trigger',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each glyph chosen.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-icon-picker' },
    steps: [
      { selector: ICON_TRIGGER, press: 'Enter' },
      { selector: ICON_FIELD, press: 'ArrowDown' },
      { selector: ICON_FIELD, press: 'ArrowDown' },
      { selector: ICON_FIELD, press: 'Enter' },
    ],
    // A glyph other than the flask, drawn on the trigger by the companion's own update, and the
    // focus Fabricate returned.
    expectSelector: '.essence-icon-picker-trigger:not(:has(.fa-flask)):focus-visible',
    expectCenterHit: ICON_TRIGGER,
    expectContained: [
      { container: ICON_GROUND, target: ICON_TARGET },
      { container: '.window-content', target: ICON_GROUND },
    ],
    expectLayout: {
      controls: [
        // The returned focus's ring by its shape; its colour is the census's.
        {
          selector: ICON_TRIGGER,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: ICON_WINDOW,
    kinds: ['manager', 'specimen'],
    // `IconPicker.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-action-menu-specimen',
    label:
      'Specimen, mounted through the published seam — a reagent action menu at the end of a row on a 320px column of the --fab-bg-2 ground, which is also its overlay host, its trigger the overflow glyph named Reagent actions for Flask, after one step: Enter pressed on the trigger, which opened the menu below it in the ground with focus on its first item. So Duplicate reagent holds keyboard focus on the raised fill with its 1px accent ring drawn inside its edge, Archive reagent is dimmed as disabled, and Delete reagent is drawn in the danger ink',
    // Beyond the smoke: a companion mounts it through `api.ui`; the menu is drawn in its own host.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-action-menu' },
    steps: [{ selector: MENU_TRIGGER, press: 'Enter' }],
    // The menu in the host the companion passed, focus on its first item.
    expectSelector: `${MENU_FIRST}:focus-visible`,
    expectCenterHit: MENU_FIRST,
    expectContained: [
      { container: MENU_GROUND, target: MENU_TARGET },
      { container: MENU_GROUND, target: '.fabricate-action-menu-panel' },
      { container: '.window-content', target: MENU_GROUND },
    ],
    expectLayout: {
      controls: [
        // The panel's and the item's concentric corners, and the focused item's inset ring by its
        // shape; its colour is the census's.
        { selector: MENU_PANEL, styles: 'border-radius: 11px' },
        {
          selector: MENU_FIRST,
          styles:
            'border-radius: 7px; outline-style: solid; outline-width: 1px; outline-offset: -1px',
        },
      ],
    },
    position: MENU_WINDOW,
    kinds: ['manager', 'specimen'],
    // `ActionMenu.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-action-menu-choice',
    label:
      'Specimen, mounted through the published seam — the same reagent action menu, after three steps: Enter pressed on the trigger, which opened the menu with focus on Duplicate reagent; ArrowDown, which skipped the disabled Archive reagent to Delete reagent; and Enter, which chose it, so Fabricate called onSelect with delete, which the ground records. So the menu is closed and focus has returned to the trigger, which carries the accent keyboard ring, 2px wide with 2px of ground between ring and trigger, and which has opened the tooltip Foundry shows for its name on that keyboard focus (the lab records the tooltip as aria-describedby and draws none)',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told of each command chosen.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-action-menu' },
    steps: [
      { selector: MENU_TRIGGER, press: 'Enter' },
      { selector: MENU_FOCUSED, press: 'ArrowDown' },
      { selector: MENU_FOCUSED, press: 'Enter' },
    ],
    // The id the companion was told of, the menu closed, and the focus Fabricate returned.
    expectSelector: `${MENU_GROUND}[data-lab-action-chosen="delete"]:not(:has(.fabricate-action-menu-panel)) .fabricate-icon-button[aria-describedby="tooltip"]:focus-visible`,
    expectCenterHit: MENU_TRIGGER,
    expectContained: [
      { container: MENU_GROUND, target: MENU_TARGET },
      { container: '.window-content', target: MENU_GROUND },
    ],
    expectLayout: {
      controls: [
        // The returned focus's ring by its shape; its colour is the census's.
        {
          selector: MENU_TRIGGER,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: MENU_WINDOW,
    kinds: ['manager', 'specimen'],
    // `ActionMenu.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-modal-specimen',
    label:
      'Specimen, mounted through the published seam — a Rename the reagent dialog on the --fab-bg-2 ground, which is also its overlay host, after one step: Enter pressed on the Rename reagent opener, a published Button, which opened the dialog and then focused its footer button from a later task. So the dialog shows its header band with the title, the Flask of quicksilver subtitle beneath it and the close glyph, a body paragraph, and a footer band whose Done button, a published primary Button, holds keyboard focus with the accent ring 2px wide and 2px clear',
    // Beyond the smoke: a companion mounts it through `api.ui`; the dialog is drawn in its own host.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-modal' },
    steps: [{ selector: MODAL_OPENER, press: 'Enter' }],
    // The dialog in the host the companion passed, focus on the footer button it moved there.
    expectSelector: `${MODAL_GROUND} .fabricate-modal[role="dialog"] [data-lab-modal-footer] button:focus-visible`,
    expectCenterHit: MODAL_CLOSE,
    expectContained: [
      { container: '.window-content', target: MODAL_DIALOG },
      { container: '.window-content', target: MODAL_GROUND },
    ],
    expectLayout: {
      controls: [
        // The close control's declared corner, and the focused footer button's ring by its shape;
        // its colour is the census's.
        { selector: MODAL_CLOSE, styles: 'border-radius: 7px' },
        {
          selector: MODAL_DONE,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: MODAL_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Modal.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-modal-close',
    label:
      'Specimen, mounted through the published seam — the same Rename the reagent dialog, after two steps: Enter pressed on the Rename reagent opener, which opened the dialog, and Enter pressed on its close glyph, so Fabricate called onClose, whose close path focused the opener and passed open false in its update. So the dialog is gone from the ground, and the opener holds keyboard focus with the accent ring 2px wide and 2px clear',
    // Beyond the smoke: a companion mounts it through `api.ui` and is told when the user asks to close.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-modal' },
    steps: [
      { selector: MODAL_OPENER, press: 'Enter' },
      { selector: MODAL_CLOSE, press: 'Enter' },
    ],
    // The close the companion was told of, the dialog gone, and the focus its close path moved.
    expectSelector: `${MODAL_GROUND}[data-lab-modal-closed="1"]:not(:has(.fabricate-modal)) [data-lab-modal-open] button:focus-visible`,
    expectCenterHit: MODAL_OPENER,
    expectContained: [{ container: '.window-content', target: MODAL_GROUND }],
    expectLayout: {
      controls: [
        // The returned focus's ring by its shape; its colour is the census's.
        {
          selector: MODAL_OPENER,
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
        },
      ],
    },
    position: MODAL_WINDOW,
    kinds: ['manager', 'specimen'],
    // `Modal.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  standaloneCase({
    id: 'published-standalone',
    label:
      'Specimen, mounted through the published seam — the seventeen entries that state a standalone style root, each in a target of its own under a classless window frame with no Fabricate root above it, in three 360px columns on a --fab-bg-1 ground the companion paints, because the style root paints none: in the first column, top to bottom, a primary Button, an IconButton, a StatusToggle on, a StatusToggle off that announces as a switch, a ToggleCard titled Spend when this stage begins with its second line and a hammer glyph, its switch on, an InspectorCard holding a Well labelled Chosen reagents and a line of the companion’s own text, a Field holding the companion’s caption Batch name over an empty text input with a placeholder and a hint, and an empty SearchField with a placeholder; in the second, a Stepper at 3 between 0 and 10, a SegmentedControl of three options with the first selected, a RadioCardGroup of two cards with icons and descriptions with the first chosen, an EditorTabs strip of three tabs with an icon on the first and the second active, and a Pagination on the first page of 42 at 10 a page with the sizes 10, 25 and 50, its bar wrapped to the column, and a ToggleCard with its switch off; in the third, the Method Select showing Forge, the Tonic icon IconPicker showing the flask, the Tonic actions ActionMenu trigger, the companion’s Rename the tonic opener, a published Button, and the Rename the tonic Modal, drawn closed, which draws nothing in its target, then a ToggleCard with no glyph and a ToggleCard whose long title wraps, with one unspaced run of it breaking at the card’s edge. The seam wrote one style root in each of the twenty-one targets, the closed dialog’s empty, and none for the well in the card or the field’s content; the ink is the root’s and the typeface is the window’s own. The frame is the evidence for the dark page; the measured equality with the in-window frame is the rendered suite’s',
    // Beyond the smoke: a companion mounts them through `api.ui` into a target with no Fabricate root.
    query: { specimen: 'published-standalone' },
  }),
  standaloneCase({
    id: 'published-standalone-light',
    label:
      'Specimen, mounted through the published seam — the same seventeen entries and three columns, in Foundry’s light application theme, so the window is light around the --fab-bg-1 ground: the style root states the dark scheme and the Fabricate ink for the content, and the companion’s line of text in the well’s slot, its caption and hint in the field’s slot read in that ink on the dark ground, and the card descriptions and the pager’s summary on their own fills',
    // Beyond the smoke: Foundry’s light theme is a condition the smoke never walks.
    query: { specimen: 'published-standalone', colorScheme: 'light' },
  }),
  standaloneCase({
    id: 'published-standalone-select-open',
    label:
      'Specimen, mounted through the published seam — the same seventeen entries in the classless companion frame, after one step: a press on the Method select at the top of the third column, whose target has no Fabricate root, so its trigger is drawn under the style root and its list opened on the standalone layer over the window. The list reads Forge, ticked and filled as the chosen row, then Brew and By hand, below the trigger; the frame is the evidence that the layer draws it, and the measured equality with the player window’s list is the rendered suite’s',
    // Beyond the smoke: a companion opens a select it mounted through `api.ui`.
    query: { specimen: 'published-standalone' },
    steps: [{ selector: `${STANDALONE_TARGET('select')} .fabricate-select-trigger` }],
    expectSelector: `body:has(${EXPANDED_UNDER_ROOT('select', '.fabricate-select-trigger')}) > .fabricate.fabricate-standalone-overlay > div > .fabricate-select-popover [data-popover-option="forge"][aria-selected="true"]`,
    expectCenterHit: `${STANDALONE_LAYER_PANEL('.fabricate-select-popover')} [data-popover-option="brew"]`,
    sourceMatches: OPEN_PANEL_SOURCES,
  }),
  standaloneCase({
    id: 'published-standalone-icon-picker-open',
    label:
      'Specimen, mounted through the published seam — the same seventeen entries in the classless companion frame, after one step: Enter pressed on the Tonic icon picker in the third column, whose target has no Fabricate root, so its list opened on the standalone layer over the window with focus in its query field, which shows the accent border and the placeholder hidden while it holds focus. The flask row is pinned first and selected, above the vocabulary’s first glyphs; the frame is the evidence that the layer draws it, and the measured equality with the player window’s list is the rendered suite’s',
    // Beyond the smoke: a companion opens an icon picker it mounted through `api.ui`.
    query: { specimen: 'published-standalone' },
    steps: [
      {
        selector: `${STANDALONE_TARGET('icon-picker')} .essence-icon-picker-trigger`,
        press: 'Enter',
      },
    ],
    expectSelector: `body:has(${EXPANDED_UNDER_ROOT('icon-picker', '.essence-icon-picker-trigger')}) > .fabricate.fabricate-standalone-overlay > div > .fabricate-icon-picker-popover .essence-icon-picker-option.pinned[aria-selected="true"]`,
    expectCenterHit: `${STANDALONE_LAYER_PANEL('.fabricate-icon-picker-popover')} .essence-icon-picker-option.pinned`,
    sourceMatches: OPEN_PANEL_SOURCES,
  }),
  standaloneCase({
    id: 'published-standalone-action-menu-open',
    label:
      'Specimen, mounted through the published seam — the same seventeen entries in the classless companion frame, after one step: Enter pressed on the Tonic actions trigger in the third column, whose target has no Fabricate root, so its menu opened on the standalone layer over the window, lined up with the trigger’s start edge, with focus on Duplicate tonic, which takes the raised fill and the 1px accent ring inside its edge. Archive tonic is dimmed and Delete tonic is in the danger ink; the frame is the evidence that the layer draws the menu where it was measured, and the measured equality with the player window’s menu is the rendered suite’s',
    // Beyond the smoke: a companion opens an action menu it mounted through `api.ui`.
    query: { specimen: 'published-standalone' },
    steps: [{ selector: `${STANDALONE_TARGET('menu')} .fabricate-icon-button`, press: 'Enter' }],
    expectSelector: `body:has(${EXPANDED_UNDER_ROOT('menu', '.fabricate-icon-button')}) > .fabricate.fabricate-standalone-overlay > div > .fabricate-action-menu-panel button.manager-action-menu-item[data-action-menu-focused]`,
    expectCenterHit: `${STANDALONE_LAYER_PANEL('.fabricate-action-menu-panel')} button.manager-action-menu-item.is-danger`,
    sourceMatches: OPEN_PANEL_SOURCES,
  }),
  standaloneCase({
    id: 'published-standalone-modal-open',
    label:
      'Specimen, mounted through the published seam — the same seventeen entries in the classless companion frame, after one step: a press on the companion’s Rename the tonic opener, a published Button whose callback passed open true to the Modal mounted closed below it, whose target has no Fabricate root, so its dialog opened on the standalone layer, centred in the viewport above the window. The dialog’s header band reads Rename the tonic over Shown to every player beside its close glyph, and its body the companion’s line Choose the name the whole table will read; the frame is the evidence that the layer draws it, and the measured equality with the player window’s dialog is the rendered suite’s',
    // Beyond the smoke: a companion opens a dialog it mounted through `api.ui`.
    query: { specimen: 'published-standalone' },
    steps: [{ selector: `${STANDALONE_TARGET('opener')} .fabricate-button` }],
    expectSelector: `body:has(${STANDALONE_TARGET('modal')} > ${STANDALONE_ROOT}) > .fabricate.fabricate-standalone-overlay > div > .fabricate-modal[aria-label="Rename the tonic"] .manager-modal-body p`,
    expectCenterHit: `${STANDALONE_LAYER_PANEL('.fabricate-modal')} [data-manager-modal-close]`,
    sourceMatches: STANDALONE_LAYER_SOURCES,
  }),
  playerCase({
    id: 'published-standalone-in-window',
    label:
      'Specimen, mounted through the published seam — the seventeen entries that state a standalone style root, each in a target of its own under the player window’s Fabricate root, as the reference for the two frames beside it, in three 360px columns on a --fab-bg-1 ground: in the first column, top to bottom, a primary Button, an IconButton, a StatusToggle on, a StatusToggle off that announces as a switch, a ToggleCard titled Spend when this stage begins with its second line and a hammer glyph, its switch on, an InspectorCard holding a Well labelled Chosen reagents and a line of the companion’s own text, a Field holding the companion’s caption Batch name over an empty text input with a placeholder and a hint, and an empty SearchField with a placeholder; in the second, a Stepper at 3 between 0 and 10, a SegmentedControl of three options with the first selected, a RadioCardGroup of two cards with icons and descriptions with the first chosen, an EditorTabs strip of three tabs with an icon on the first and the second active, and a Pagination on the first page of 42 at 10 a page with the sizes 10, 25 and 50, its bar wrapped to the column, and a ToggleCard with its switch off; in the third, the Method Select showing Forge, the Tonic icon IconPicker showing the flask, the Tonic actions ActionMenu trigger, the companion’s Rename the tonic opener, a published Button, and the Rename the tonic Modal, drawn closed, which draws nothing in its target, then a ToggleCard with no glyph and a ToggleCard whose long title wraps, with one unspaced run of it breaking at the card’s edge. The seam wrote no style root, because the window is one; the frame shows what each draws in the window',
    // Beyond the smoke: a companion mounts them through `api.ui` into a target with a Fabricate root.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-standalone' },
    steps: [],
    expectSelector: STANDALONE_IN_WINDOW,
    expectContained: STANDALONE_CONTAINMENT,
    position: STANDALONE_WINDOW,
    kinds: ['standalone', 'specimen'],
    sourceMatches: STANDALONE_LAYER_SOURCES,
  }),
]);

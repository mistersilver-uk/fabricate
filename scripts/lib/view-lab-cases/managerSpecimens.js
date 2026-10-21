/**
 * Specimens: a shipped component mounted DIRECTLY by a fixture-only wrapper under
 * `tests/view-lab/fixtures/`, for props no shipped caller passes yet (issue 1782). A specimen frame
 * depicts a state no GM can reach today, so each label says so; it is not a smoke counterpart.
 */

import { INSPECTOR_PANEL_PATTERN } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

/**
 * The seam, its prop kinds, its callbacks, its values, its overlay chain, its manifest, its adapter
 * and its host: each redraws what it mounts.
 */
const PUBLISHED_SEAM_SOURCES = Object.freeze([
  /^src\/ui\/publishedComponentSeam\.js$/,
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
]);

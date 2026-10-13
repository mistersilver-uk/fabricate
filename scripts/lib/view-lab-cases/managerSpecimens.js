/**
 * Specimens: a shipped component mounted DIRECTLY by a fixture-only wrapper under
 * `tests/view-lab/fixtures/`, for props no shipped caller passes yet (issue 1782). A specimen frame
 * depicts a state no GM can reach today, so each label says so; it is not a smoke counterpart.
 */

import { managerCase } from './caseFactories.js';

/**
 * The seam, its prop kinds, its callbacks, its manifest, its adapter and its host: each redraws
 * what it mounts.
 */
const PUBLISHED_SEAM_SOURCES = Object.freeze([
  /^src\/ui\/publishedComponentSeam\.js$/,
  /^src\/ui\/publishedComponentProps\.js$/,
  /^src\/ui\/publishedComponentCallbacks\.js$/,
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
 * width and at the two-cell span's, the disabled look at two roles, and the box a long label
 * does not grow.
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

/** Each notice and each button inside the ground, and the ground inside the window. */
const CONTROLS_CONTAINMENT = Object.freeze([
  ...CONTROL_KEYS.map((key) => ({
    container: CONTROLS_GROUND,
    target: `${CONTROL(key)} > div > .fab-notice`,
  })),
  ...BUTTON_KEYS.map((key) => ({ container: CONTROLS_GROUND, target: LAB_BUTTON(key) })),
  { container: '.window-content', target: CONTROLS_GROUND },
]);

/** Sized to the fixture's 592px ground and the height of its notices and buttons. */
const CONTROLS_WINDOW = Object.freeze({ width: 680, height: 640 });

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
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/BulkEditPanelShell\.svelte$/],
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
            'display: flex; row-gap: 8px; padding-top: 12px; border-radius: 11px; background-color: var(--fab-bg-2)',
        },
        { selector: '.fab-rail > div', styles: SLOT_BOX },
        { selector: '.fab-rail > div > div', styles: SLOT_BOX },
        { selector: '.fabricate-card > div', styles: SLOT_BOX },
        { selector: '.fabricate-card > div > div', styles: SLOT_BOX },
        {
          selector: HERO_PANEL,
          styles: 'border-top-style: dashed; background-color: rgba(0, 0, 0, 0)',
        },
        { selector: `${HERO_PANEL} > div`, styles: 'display: flex; row-gap: 8px' },
        { selector: `${HERO_PANEL} > div > i`, styles: 'width: 46px; height: 46px' },
        { selector: `${HERO_PANEL} > div > div`, styles: SLOT_BOX },
        { selector: `${HERO_PANEL} > div > div > div`, styles: SLOT_BOX },
        {
          selector: '.manager-empty h3',
          styles: 'color: var(--fab-text-secondary); font-size: 13px',
        },
        { selector: `${FILTERED_PANEL} > div`, styles: 'row-gap: 12px' },
        { selector: `${FILTERED_PANEL} p`, styles: 'color: var(--fab-text-muted)' },
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
      'Specimen, mounted through the published seam — five notices that each carry an action, on the lighter ground, after three steps that press what the fixture mounts: a click on the first action, whose callback redrew that notice in the success tone with no button; Enter on the second, whose callback kept its button and counted the press in its title; and Tab from the second, which put keyboard focus on the third. Reading left to right, top to bottom: the success notice with no button; an info notice whose title reads Attempts allowed: 1; a danger notice across both cells whose detail wraps under its title, its button on the title’s row carrying the accent ring; a warning notice in one cell whose button has dropped beneath the text; and a success notice with its button on the title’s row. Beneath them, thirteen published buttons at rest: a neutral and a primary; a ghost and a danger; a warning and a dashed adder that hugs its label; a dashed adder across both cells; a neutral across one cell beside a disabled neutral; a disabled primary beside a neutral whose long label wraps to two lines inside its 34px box in a 120px target; and, on a darker strip, a ghost and a dashed adder. The frame draws inside the manager window, so it shows the ring’s declarations and not the bare host: the control gate’s focus-mark clause is the evidence for no Fabricate ancestor',
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
        ...['info', 'danger', 'warning', 'success'].map((tone) => ({
          selector: `.fab-notice.is-${tone} [data-notice-action]`,
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
          selector: '.fab-notice:not(.is-warning, .is-info, .is-success) .fab-notice-title',
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
      'Specimen, mounted through the published seam — the same fixture after two steps that press its buttons: a click on the neutral Clear filters, whose callback redrew it as Filters cleared, and Space on the primary New project, whose callback redrew it as Projects: 1. The first button stands on the raised tile under the pointer, and the second carries the accent keyboard ring, 2px wide with 2px of ground between ring and fill, kept across its own update. No other ring is drawn and the five notices above are unpressed. The frame draws inside the manager window; the census of the sheet, the mounted player-shell clause and the measured equality are the evidence for the player window',
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
          styles: 'outline-style: solid; outline-width: 2px; outline-offset: 2px',
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
    // `Button.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
]);

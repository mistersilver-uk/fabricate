/**
 * The specimens the standalone style root's rendered admission test draws (issues 2456, 2679,
 * 2680): each widened entry's props, covering every value of the vocabularies that test reads from
 * the components, with the target width, slot content, nested mount and opening steps a specimen
 * states, its reach, and the computed properties the test compares element by element and on each
 * pseudo-element. An overlay entry's specimen with `open` steps is read with its open panel.
 */

import {
  CARD_COMPARED,
  COMPARED,
  TOGGLE_COMPARED,
  TOGGLE_KNOB_COMPARED,
  TOGGLE_LABEL_COMPARED,
  TOGGLE_TRACK_COMPARED,
} from './comparedProperties.js';

const press = () => {};

/** The properties a focus ring changes, and those the search shell's lit border changes. */
const RING = Object.freeze(['outline-style', 'outline-width', 'outline-color']);
const SHELL_BORDER = Object.freeze([
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
]);

/**
 * What a specimen answers to, each selector read inside its target, or inside its open panel where
 * it is written `{ panel }`: `focus` is the element Tab from the sentinel before it reaches, or
 * `null` where nothing is reachable; `mark` the element and properties its keyboard mark changes,
 * the focused element's ring by default; `hover` an enabled, unselected target whose compared
 * properties the pointer changes, or `null`; `inert` marks a disabled hover target, or one the
 * family draws no hover state on, drawn alike under the pointer but not required to change.
 */
const reach = (focus, hover = focus, mark = {}) => ({
  focus,
  mark: { selector: mark.selector ?? focus, properties: mark.properties ?? RING },
  hover,
  inert: mark.inert === true,
});
const UNREACHABLE = reach(null, null);
const inertHover = (hover) => ({ ...reach(null, hover), inert: true });

const button = (props) => ({ props, reach: reach('button') });
const disabledButton = (props) => ({ props, reach: inertHover('button') });

const card = (props) => ({
  title: 'Spend when this stage begins',
  sub: 'The ingredient is used up as the stage starts.',
  onToggle: press,
  ...props,
});

const unboundedStepper = (props) => ({
  value: 3,
  ariaLabel: 'Batch size',
  decrementLabel: 'Fewer',
  incrementLabel: 'More',
  onChange: press,
  ...props,
});
const stepper = (props) => unboundedStepper({ min: 0, max: 10, ...props });

const SEGMENTS = Object.freeze([
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
  { value: 'missing', label: 'Missing' },
]);
export const segmentedProps = (props) => ({
  options: SEGMENTS,
  value: 'all',
  ariaLabel: 'Show',
  onChange: press,
  ...props,
});
const SEGMENT_HOVER = '.manager-segment:not(.is-active, .is-disabled)';
const chosenSegment = (props) => ({
  props: segmentedProps(props),
  reach: reach('input:checked', SEGMENT_HOVER, { selector: '.manager-segment.is-active' }),
});

const CARDS = Object.freeze([
  {
    value: 'forge',
    label: 'Forge',
    description: 'Heat and hammer the stock',
    icon: 'fas fa-hammer',
  },
  { value: 'brew', label: 'Brew', description: 'Simmer it over a low flame', icon: 'fas fa-flask' },
  { value: 'hand', label: 'By hand' },
]);
export const cardsProps = (props) => ({
  options: CARDS,
  value: 'forge',
  legend: 'Method',
  onChange: press,
  ...props,
});
const CARD_HOVER = '.manager-resolution-option:not(.is-active, .is-disabled)';
const chosenCard = (props) => ({
  props: cardsProps(props),
  width: 480,
  reach: reach('input:checked', CARD_HOVER),
});

const TABS = Object.freeze([
  { id: 'overview', label: 'Overview', icon: 'fas fa-scroll' },
  { id: 'steps', label: 'Steps' },
  { id: 'results', label: 'Results' },
]);
const tabs = (props) => ({
  props: {
    tabs: TABS,
    activeTab: 'steps',
    ariaLabel: 'Recipe sections',
    idStem: 'standalone',
    onSelect: press,
    ...props,
  },
  width: 360,
  reach: reach('[role="tab"][tabindex="0"]', '[role="tab"]:not(.is-active)'),
});

export const pagerProps = (props) => ({
  totalCount: 42,
  pageSize: 10,
  pageIndex: 0,
  pageSizeOptions: [10, 25, 50],
  onPageChange: press,
  onPageSizeChange: press,
  ariaLabel: 'Recipes pages',
  navLabel: 'Recipes page navigation',
  previousLabel: 'Previous page',
  nextLabel: 'Next page',
  perPageLabel: 'Per page',
  rangeTemplate: 'Showing {first}–{last} of {total}',
  pageTemplate: 'Page {page} of {total}',
  ...props,
});
const NEXT = '[data-pagination-next]';
const PREVIOUS = '[data-pagination-prev]';

const CAPTION = '<span id="standalone-field-caption">Batch name</span>';

const SELECT_OPTIONS = Object.freeze([
  { value: 'forge', label: 'Forge' },
  { value: 'brew', label: 'Brew' },
  { value: 'hand', label: 'By hand' },
]);
const selectProps = (props) => ({
  options: SELECT_OPTIONS,
  ariaLabel: 'Method',
  onChange: press,
  ...props,
});
/** The select's keyboard mark is its trigger's own border, and the trigger draws no hover state. */
const TRIGGER_BORDER = Object.freeze({ properties: SHELL_BORDER, inert: true });
const closedSelect = (props) => ({
  props: selectProps(props),
  reach: reach('button', 'button', TRIGGER_BORDER),
});

const pickerProps = (props) => ({
  value: 'fas fa-flask',
  ariaLabel: 'Reagent icon',
  listLabel: 'Reagent icons',
  searchLabel: 'Search reagent icons',
  searchPlaceholder: 'Name a glyph',
  noMatchesText: 'No glyph matches',
  onChange: press,
  ...props,
});

const MENU_ITEMS = Object.freeze([
  { id: 'duplicate', label: 'Duplicate reagent', icon: 'fas fa-copy' },
  { id: 'archive', label: 'Archive reagent', icon: 'fas fa-box-archive', disabled: true },
  { id: 'rename', label: 'Rename reagent' },
  { id: 'delete', label: 'Delete reagent', icon: 'fas fa-trash', danger: true },
]);
const menuProps = (props) => ({
  items: MENU_ITEMS,
  ariaLabel: 'Reagent actions',
  onSelect: press,
  ...props,
});

const CLOSE = { panel: '[data-manager-modal-close]' };
const modal = (props, slots) => ({
  props: {
    open: true,
    title: 'Rename the reagent',
    closeLabel: 'Close',
    onClose: press,
    ...props,
    ...Object.fromEntries(Object.keys(slots).map((key) => [key, true])),
  },
  slots,
  reach: reach(CLOSE),
});

/** Each widened entry's specimens, by id. */
export const STANDALONE_SPECIMENS = Object.freeze({
  InspectorCard: Object.freeze({
    'card-filled': { props: { children: true }, reach: UNREACHABLE },
    // Issue 2854: each published tone under the head it publishes.
    ...Object.fromEntries(
      [
        ['warning', 'Over the limit'],
        ['success', 'Ready to finish'],
        ['accent', 'Chosen route'],
        ['info', 'Check due'],
      ].map(([tone, title]) => [
        `card-tone-${tone}`,
        {
          props: { tone, title, note: 'Two crafters assigned.', children: true },
          reach: UNREACHABLE,
        },
      ])
    ),
  }),
  Button: Object.freeze({
    'button-neutral': button({ role: 'neutral', children: 'Clear filters', onclick: press }),
    'button-primary': button({ role: 'primary', children: 'Craft', onclick: press }),
    'button-ghost': button({ role: 'ghost', children: 'Cancel', onclick: press }),
    'button-dashed': button({ role: 'dashed', children: 'Add step', onclick: press }),
    'button-danger': button({ role: 'danger', children: 'Delete', onclick: press }),
    'button-warning': button({ role: 'warning', children: 'Override', onclick: press }),
    'button-info': button({ role: 'info', children: 'Roll Wits', onclick: press }),
    'button-full-width': button({ fullWidth: true, children: 'Start batch', onclick: press }),
    'button-size-24': button({ size: '24', children: 'Add tier', onclick: press }),
    'button-size-26': button({ size: '26', children: 'Claim', onclick: press }),
    'button-size-28': button({ size: '28', children: 'Add choice', onclick: press }),
    'button-size-38': button({ size: '38', children: 'Register item', onclick: press }),
    'button-disabled': disabledButton({ disabled: true, children: 'Not yet', onclick: press }),
    'button-busy': {
      props: { busy: true, children: 'Saving…', onclick: press },
      reach: reach('button', 'button', { inert: true }),
    },
    'button-icon': button({ icon: 'fas fa-plus', children: 'Add step', onclick: press }),
  }),
  StatusToggle: Object.freeze({
    'toggle-off': button({ on: false, ariaLabel: 'Group by category', onclick: press }),
    'toggle-on': button({ on: true, ariaLabel: 'Hidden tasks', onclick: press }),
    'toggle-switch': button({
      on: true,
      semantics: 'switch',
      ariaLabel: 'Spend when this stage begins',
      onclick: press,
    }),
  }),
  Stepper: Object.freeze({
    'stepper-mid': { props: stepper({}), reach: reach('[data-stepper-decrement]') },
    'stepper-at-min': {
      props: stepper({ value: 0 }),
      reach: reach('input', '[data-stepper-increment]'),
    },
    'stepper-at-max': { props: stepper({ value: 10 }), reach: reach('[data-stepper-decrement]') },
    'stepper-unbounded': {
      props: unboundedStepper({ value: 1.5, step: 0.5 }),
      reach: reach('[data-stepper-decrement]'),
    },
    'stepper-disabled': {
      props: stepper({ disabled: true }),
      reach: inertHover('[data-stepper-decrement]'),
    },
    'stepper-fill': { props: stepper({ fill: true }), reach: reach('[data-stepper-decrement]') },
    'stepper-comfortable': {
      props: stepper({ density: 'comfortable' }),
      reach: reach('[data-stepper-decrement]'),
    },
    'stepper-unset': {
      props: stepper({ value: null, allowUnset: true }),
      reach: reach('[data-stepper-decrement]'),
    },
    'stepper-placeholder': {
      props: stepper({ value: null, allowUnset: true, placeholder: 'Any' }),
      reach: reach('[data-stepper-decrement]'),
    },
    'stepper-signed': {
      props: stepper({ value: 5, min: -10, format: 'signed' }),
      reach: reach('[data-stepper-decrement]'),
    },
    'stepper-unlimited': {
      props: stepper({ value: 0, format: 'unlimited', nullLabel: 'No limit' }),
      reach: reach('input', '[data-stepper-increment]'),
    },
    'stepper-stops-null': {
      props: stepper({
        value: null,
        format: 'signed',
        stops: [-5, 0, 5],
        nullLabel: 'Otherwise',
      }),
      reach: reach('input', '[data-stepper-increment]'),
    },
  }),
  SearchField: Object.freeze({
    'search-empty': {
      props: { placeholder: 'Search recipes', ariaLabel: 'Search recipes' },
      reach: reach('input', '.fabricate-search', {
        selector: '.fabricate-search',
        properties: SHELL_BORDER,
        inert: true,
      }),
    },
    'search-holding': {
      props: { value: 'iron', placeholder: 'Search recipes', ariaLabel: 'Search recipes' },
      reach: reach('input', '.fabricate-search', {
        selector: '.fabricate-search',
        properties: SHELL_BORDER,
        inert: true,
      }),
    },
    // Issue 2849: the toolbar rung holding a count, the inline rung, and the withheld compact.
    'search-compact-withheld': {
      props: { placeholder: 'Any tag', ariaLabel: 'Search tags', density: 'compact' },
      reach: reach('input', '.fabricate-search', {
        selector: '.fabricate-search',
        properties: SHELL_BORDER,
        inert: true,
      }),
    },
    'search-toolbar-count': {
      props: {
        value: 'iron',
        ariaLabel: 'Search components',
        density: 'toolbar',
        countLabel: '12 found',
      },
      reach: reach('input', '.fabricate-search', {
        selector: '.fabricate-search',
        properties: SHELL_BORDER,
        inert: true,
      }),
    },
    'search-inline': {
      props: { placeholder: 'Any tag', ariaLabel: 'Search tags', density: 'inline' },
      reach: reach('input', '.fabricate-search', {
        selector: '.fabricate-search',
        properties: SHELL_BORDER,
        inert: true,
      }),
    },
  }),
  Select: Object.freeze({
    'select-form-chosen': closedSelect({ value: 'forge' }),
    'select-inline-chosen': closedSelect({ value: 'brew', size: 'inline' }),
    'select-toolbar-placeholder': closedSelect({ size: 'toolbar', placeholder: 'Choose a method' }),
    'select-open': {
      props: selectProps({ value: 'forge' }),
      open: [{ key: 'ArrowDown' }],
      reach: reach(
        'button',
        { panel: '[role="option"]:not([aria-selected="true"])' },
        {
          properties: SHELL_BORDER,
        }
      ),
    },
  }),
  Field: Object.freeze({
    'field-text-input': {
      props: { as: 'div', children: true },
      slot: `${CAPTION}<input type="text" placeholder="Moonpetal tonic" aria-labelledby="standalone-field-caption" aria-describedby="standalone-field-hint"><small id="standalone-field-hint">Shown to players</small>`,
      reach: reach('input', 'input', { inert: true }),
    },
    'field-textarea': {
      props: { as: 'div', children: true },
      slot: `${CAPTION}<textarea aria-labelledby="standalone-field-caption"></textarea>`,
      reach: reach('textarea', 'textarea', { inert: true }),
    },
    'field-nested-stepper': {
      props: { as: 'div', children: true },
      slot: CAPTION,
      nest: { name: 'Stepper', props: stepper({ ariaLabel: 'Batch name size' }) },
      reach: reach('[data-stepper-decrement]', '[data-stepper-increment]'),
    },
    'field-label-host': {
      props: { as: 'label', children: true },
      slot: '<span>Batch name</span><input type="text" placeholder="Moonpetal tonic">',
      reach: reach('input', 'input', { inert: true }),
    },
    'field-fieldset-host': {
      props: { as: 'fieldset', children: true },
      slot: `${CAPTION}<input type="text" placeholder="Moonpetal tonic" aria-labelledby="standalone-field-caption">`,
      reach: reach('input', 'input', { inert: true }),
    },
    // Issue 2848: each rung under the 38 default, with each face, the number type and the error.
    'field-size-26-number': {
      props: { as: 'div', children: true, size: 26, face: 'mono', type: 'number' },
      slot: `${CAPTION}<input type="number" value="12" aria-labelledby="standalone-field-caption">`,
      reach: reach('input', 'input', { inert: true }),
    },
    'field-size-28-serif': {
      props: { as: 'div', children: true, size: 28, face: 'serif' },
      slot: `${CAPTION}<input type="text" value="Moonlit Glade" aria-labelledby="standalone-field-caption">`,
      reach: reach('input', 'input', { inert: true }),
    },
    'field-size-30-invalid': {
      props: { as: 'div', children: true, size: 30, invalid: true },
      slot: `${CAPTION}<input type="text" value="1d20 +" aria-invalid="true" aria-labelledby="standalone-field-caption" aria-describedby="standalone-field-error"><small id="standalone-field-error" style="color: var(--fab-danger-text)">Finish the formula.</small>`,
      reach: reach('input', 'input', { inert: true }),
    },
    'field-size-34': {
      props: { as: 'div', children: true, size: 34 },
      slot: `${CAPTION}<input type="text" placeholder="Moonpetal tonic" aria-labelledby="standalone-field-caption">`,
      reach: reach('input', 'input', { inert: true }),
    },
  }),
  Well: Object.freeze({
    'well-labelled': { props: { label: 'Chosen reagents', children: true }, reach: UNREACHABLE },
    'well-unlabelled': { props: { children: true }, reach: UNREACHABLE },
    // Issue 2854: each published tone.
    ...Object.fromEntries(
      ['warning', 'success', 'accent', 'info'].map((tone) => [
        `well-tone-${tone}`,
        { props: { tone, children: true }, reach: UNREACHABLE },
      ])
    ),
  }),
  IconButton: Object.freeze({
    'icon-button-neutral': button({ icon: 'fas fa-gear', ariaLabel: 'Settings', onclick: press }),
    'icon-button-primary': button({
      role: 'primary',
      icon: 'fas fa-plus',
      ariaLabel: 'Add',
      onclick: press,
    }),
    'icon-button-ghost': button({
      role: 'ghost',
      icon: 'fas fa-eye',
      ariaLabel: 'Show',
      onclick: press,
    }),
    'icon-button-danger': button({
      role: 'danger',
      icon: 'fas fa-trash',
      ariaLabel: 'Remove',
      onclick: press,
    }),
    'icon-button-ghost-danger': button({
      role: 'ghost-danger',
      icon: 'fas fa-xmark',
      ariaLabel: 'Discard',
      onclick: press,
    }),
    'icon-button-size-20': button({
      size: '20',
      icon: 'fas fa-xmark',
      ariaLabel: 'Dismiss',
      onclick: press,
    }),
    'icon-button-size-22': button({
      size: '22',
      icon: 'fas fa-plus',
      ariaLabel: 'Credit',
      onclick: press,
    }),
    'icon-button-size-24': button({
      size: 24,
      icon: 'fas fa-pen',
      ariaLabel: 'Edit',
      onclick: press,
    }),
    'icon-button-size-26': button({
      size: 26,
      icon: 'fas fa-copy',
      ariaLabel: 'Copy',
      onclick: press,
    }),
    'icon-button-disabled': disabledButton({
      disabled: true,
      icon: 'fas fa-lock',
      ariaLabel: 'Locked',
      onclick: press,
    }),
  }),
  EditorTabs: Object.freeze({
    'tabs-second-active': tabs({}),
    'tabs-none-active': tabs({ activeTab: '' }),
    'tabs-active-panel-only': tabs({ activePanelOnly: true }),
  }),
  RadioCardGroup: Object.freeze({
    'cards-row': chosenCard({}),
    'cards-stacked-three': chosenCard({
      options: CARDS.map((card) => ({ icon: 'fas fa-hand', ...card })),
      layout: 'stacked',
      columns: 3,
    }),
    'cards-one-column': chosenCard({ columns: 1 }),
    'cards-example-badge': chosenCard({
      options: CARDS.map((card) =>
        card.value === 'hand'
          ? card
          : {
              ...card,
              example: 'For example, a blade',
              badge: { label: card.value === 'forge' ? 'Slow' : 'New', tone: 'warning' },
            }
      ),
    }),
    'cards-disabled': {
      props: cardsProps({ disabled: true }),
      width: 480,
      reach: inertHover('.manager-resolution-option:not(.is-active)'),
    },
    'cards-disabled-option': chosenCard({
      disabledOptions: [{ value: 'brew', reason: 'Needs a cauldron' }],
    }),
    'cards-unchosen': {
      props: cardsProps({ value: '' }),
      width: 480,
      reach: reach('input', CARD_HOVER),
    },
  }),
  SegmentedControl: Object.freeze({
    'segmented-default': chosenSegment({}),
    'segmented-fill': chosenSegment({ fill: true }),
    'segmented-compact': chosenSegment({ density: 'compact' }),
    'segmented-field': chosenSegment({ density: 'field' }),
    'segmented-inline': chosenSegment({ density: 'inline' }),
    'segmented-panel': chosenSegment({ density: 'compact', surface: 'panel' }),
    'segmented-sized': chosenSegment({ density: 'compact', size: 34, tone: 'info' }),
    'segmented-accent': chosenSegment({ tone: 'accent' }),
    'segmented-accent-soft': chosenSegment({ tone: 'accent-soft' }),
    'segmented-info': chosenSegment({ tone: 'info' }),
    'segmented-tag': chosenSegment({ tone: 'tag' }),
    'segmented-pill': chosenSegment({ shape: 'pill' }),
    'segmented-info-variant': chosenSegment({
      tone: 'accent',
      options: SEGMENTS.map((segment) =>
        segment.value === 'all' ? { ...segment, variant: 'info' } : segment
      ),
    }),
    'segmented-titled': chosenSegment({
      density: 'compact',
      options: SEGMENTS.map((segment) => ({ ...segment, title: `Show ${segment.label}` })),
    }),
    'segmented-icon-disabled': chosenSegment({
      options: [
        { value: 'all', label: 'All', icon: 'fas fa-list' },
        { value: 'owned', label: 'Owned' },
        { value: 'missing', label: 'Missing', disabled: true },
      ],
    }),
    'segmented-unselected': {
      props: segmentedProps({ value: '' }),
      reach: reach('input', SEGMENT_HOVER, { selector: '.manager-segment' }),
    },
  }),
  Pagination: Object.freeze({
    'pagination-first-wide': { props: pagerProps({}), width: 560, reach: reach(NEXT) },
    'pagination-last-wide': {
      props: pagerProps({ pageIndex: 4 }),
      width: 560,
      reach: reach(PREVIOUS),
    },
    'pagination-first-narrow': { props: pagerProps({}), width: 336, reach: reach(NEXT) },
    'pagination-compact': {
      props: pagerProps({ density: 'compact' }),
      width: 336,
      reach: reach(NEXT),
    },
    'pagination-no-sizes': {
      props: pagerProps({ pageSizeOptions: [] }),
      width: 336,
      reach: reach(NEXT),
    },
    'pagination-persistent-single': {
      props: pagerProps({ totalCount: 6, pageSizeOptions: [], persistent: true }),
      width: 336,
      reach: inertHover(NEXT),
    },
  }),
  IconPicker: Object.freeze({
    'icon-picker-chosen': {
      props: pickerProps({}),
      reach: reach('button', 'button', { inert: true }),
    },
    'icon-picker-open': {
      props: pickerProps({}),
      open: [{ click: true }, { query: 'fla' }],
      reach: reach({ panel: 'input' }, { panel: '[role="option"]' }, { properties: SHELL_BORDER }),
    },
    'icon-picker-no-match': {
      props: pickerProps({}),
      open: [{ click: true }, { query: 'zzqx' }],
      reach: reach(
        { panel: 'input' },
        { panel: 'input' },
        { properties: SHELL_BORDER, inert: true }
      ),
    },
  }),
  ActionMenu: Object.freeze({
    'action-menu-closed': { props: menuProps({}), reach: reach('button') },
    'action-menu-open': {
      props: menuProps({ align: 'start' }),
      open: [{ click: true }],
      reach: reach('button', { panel: 'button.is-danger' }),
    },
  }),
  Modal: Object.freeze({
    'modal-banded': modal(
      { subtitle: 'Shown to every player' },
      {
        body: '<p style="margin:0">Choose a name the whole table will read.</p>',
        footer: '<button type="button">Done</button>',
      }
    ),
    'modal-header-only': modal({ closeOnOutsideClick: false }, {}),
    'modal-icon': modal(
      { icon: 'fas fa-plus', subtitle: 'Pick one to add' },
      { body: '<p style="margin:0">Choose what this stage requires.</p>' }
    ),
    'modal-size-sm': modal({ size: 'sm' }, { body: '<p style="margin:0">A narrow picker.</p>' }),
    'modal-size-lg': modal({ size: 'lg' }, { body: '<p style="margin:0">A wide picker.</p>' }),
    'modal-equal-footer': modal(
      { footerLayout: 'equal' },
      {
        body: '<p style="margin:0">Assign the activity to the chosen characters.</p>',
        footer:
          '<button type="button">Assign</button><button type="button">Assign and start</button>',
      }
    ),
  }),
  ToggleCard: Object.freeze({
    'card-off': button(card({ on: false })),
    'card-on': button(card({ on: true, icon: 'fa-solid fa-hammer' })),
    'card-switch': button(card({ on: true, semantics: 'switch' })),
    'card-no-icon': button(card({ on: false, icon: '' })),
    'card-long-title': button(
      card({
        on: false,
        title:
          'Spend MoonpetalSilverleafEmberSaltVerdigrisAlloyCatalystResidueInfusion when this stage begins',
      })
    ),
  }),
});

/**
 * The computed properties compared on every element drawn: every list the three-host test
 * compares for these controls, then the remaining border edges, the ink and scheme, the type, the
 * focus ring, the motion and the disabled face the admission clause reads.
 */
export const STANDALONE_COMPARED = Object.freeze([
  ...new Set([
    ...COMPARED,
    ...CARD_COMPARED,
    ...TOGGLE_COMPARED,
    ...TOGGLE_TRACK_COMPARED,
    ...TOGGLE_KNOB_COMPARED,
    ...TOGGLE_LABEL_COMPARED,
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    ...SHELL_BORDER,
    'flex-wrap',
    'color',
    'color-scheme',
    'opacity',
    'cursor',
    'appearance',
    'text-align',
    'letter-spacing',
    'text-transform',
    'visibility',
    'background-image',
    'text-decoration-line',
    'font-style',
    'text-shadow',
    'filter',
    'white-space',
    'word-spacing',
    'accent-color',
    'resize',
    ...RING,
    'outline-offset',
    'box-shadow',
    'transition-duration',
  ]),
]);

/** What is compared on each element's `::before` and `::after`, and on an input's `::placeholder`. */
export const STANDALONE_PSEUDO_COMPARED = Object.freeze([
  'content',
  'display',
  'width',
  'height',
  'background-color',
  'color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
]);

/**
 * System scope: the component browser, its bulk sets, the component editor and its complications.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  BULK_DELETE_CARD_PATTERN,
  BULK_EDIT_CHROME_PATTERN,
  COMPONENT_EDITOR_MATCHES,
  PREMIUM_ICONS_AD_PATTERN,
  REQUIREMENT_SUGGESTION,
  TYPEAHEAD_COMBOBOX_SOURCE,
  WORLD_SCOPE_MODEL_PATTERN,
} from './caseConstants.js';
import { chooseSelectOption, managerCase, previewAsActor } from './caseFactories.js';

/** A simple salvage's result rows (issue 1516), all of them and the `n`th from the page. */
const SALVAGE_LIST = '[data-salvage-group] .manager-recipe-ingredient-set-groups';
const SALVAGE_ROWS = `${SALVAGE_LIST} > [data-salvage-result]`;
const SALVAGE_ROW = (n) => `${SALVAGE_ROWS}:nth-child(${n})`;

/**
 * A flat salvage list's row geometry at 1024, where the list is too narrow for one line: the plate,
 * kind, name and remove on the first, the toggle and amount on the second, every remove and toggle
 * in a column.
 */
const SALVAGE_GEOMETRY = Object.freeze({
  containerSelector: SALVAGE_LIST,
  wrappedRows: {
    rows: SALVAGE_ROWS,
    lines: [
      [
        '.manager-recipe-option-lead',
        '.manager-recipe-option-kind',
        '[data-salvage-result-component]',
        '[data-remove-salvage-result]',
      ],
      ['[role="radiogroup"]', '[data-salvage-result-quantity], [data-recipe-option-formula]'],
    ],
  },
  alignedRight: `${SALVAGE_ROWS} .manager-recipe-option-remove`,
  alignedLeft: `${SALVAGE_ROWS} [role="radiogroup"]`,
});

/**
 * A progressive salvage's stage rows at 1024: the plate and kind, the name below them at its stated
 * minimum, then the DC and Edit.
 */
const SALVAGE_STAGES = '.fabricate-sortable-list-row[data-salvage-result]';
const SALVAGE_STAGE_GEOMETRY = Object.freeze({
  containerSelector: '[data-salvage-result-groups]',
  wrappedRows: {
    rows: `${SALVAGE_STAGES} [data-recipe-option]`,
    lines: [
      ['.manager-recipe-option-lead', '.manager-recipe-option-kind'],
      ['[data-salvage-result-component]'],
      ['[data-salvage-result-difficulty]', '[data-salvage-result-edit]'],
    ],
  },
  alignedRight: `${SALVAGE_STAGES} [data-remove-salvage-result]`,
  minInlineSize: {
    selector: `${SALVAGE_STAGES} [data-salvage-result-component]`,
    pixels: 140,
  },
});

/** The salvage rows' sources: the editor and the requirement row it draws them with. */
const SALVAGE_ROW_SOURCES = Object.freeze([
  ...COMPONENT_EDITOR_MATCHES,
  /^src\/ui\/svelte\/apps\/manager\/recipe\/(PickerRow|PickerRowAmount)\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\/(pickerRowKinds|resultRows)\.js$/,
]);

/** Component Rules' header group, led by the Premium advert until it is dismissed. */
const COMPONENT_RULES_ACTIONS = '[data-manager-view="components"] .manager-header-actions';

/** The page heading keeps 320px beside the advert, measured on the lab's real header. */
const PREMIUM_AD_HEADING_FLOOR = Object.freeze({
  containerSelector: '[data-manager-view="components"] .manager-header',
  minInlineSize: { selector: '[data-manager-view="components"] .manager-heading', pixels: 320 },
});

/** Open the editor on a component and bring its salvage results into view. */

const salvageSteps = (componentId) => [
  { selector: '#manager-nav-component-rules' },
  { selector: `.manager-component-row[data-component-id="${componentId}"] [data-component-edit]` },
  { selector: '[data-salvage-result-groups]', scroll: true },
];

/**
 * The salvage check override states (issue 2005), one per state the approved prototype's frames 23
 * and 24 depict, on Smithing's Longsword under `checkOverride` (`tests/view-lab/world/labWorld.js`).
 * `sees` is the Player sees state; a `resolved` case chooses a character in its Preview-as picker,
 * and `claim` adds the field's own state. The `count-*` states are issue 2006's frame 25: a
 * counting check's successes needed override beside a kept DC override it never reads.
 */
const OVERRIDE_PREVIEW = '[data-salvage-dc-override] [data-override-preview-actor]';
const overrideCase = ({ id, label, field, frame, sees, claim = '' }) =>
  managerCase({
    id,
    label: `Manager — Component edit salvage override, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: {
      system: 'lab-smithing',
      checkOverride: id.slice('manager-component-edit-salvage-override-'.length),
    },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-longsword"] [data-component-edit]',
      },
      { selector: '[data-salvage-dc-override]', scroll: true },
      ...(sees === 'resolved' ? previewAsActor('lab-actor-idrin', OVERRIDE_PREVIEW) : []),
    ],
    expectView: 'component-edit',
    expectSelector: `.fabricate-manager [data-salvage-dc-override][data-salvage-override-field="${field}"]${claim} [data-override-player-sees="${sees}"]`,
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/(CheckOverrideField\.svelte|OverridePlayerSees\.svelte|overridePlayerSees\.js|salvageDcPresets\.js|componentEditSelectOptions\.js)$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/PreviewAsPicker\.svelte$/,
    ],
  });

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-components-normal',
    label: 'Manager — Components normal',
    smokeLabels: ['manager-components-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    // The lab world opts into experimental features, so the Premium advert leads the header,
    // compact at 1280: the full face waits for the 1320 rung.
    expectSelector: `${COMPONENT_RULES_ACTIONS} > [data-premium-icons-ad]:first-child`,
    expectVisible: '[data-premium-icons-ad]',
    // Issue 1371 r13-list — the list opens on its first drawn row (maintainer ruling M14).
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[aria-current="true"]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-inspector-kicker]',
      },
    ],
    // The rail's one verb on the manager button's rung, in the success family (issue 1521), and
    // the sort Select and its sort-direction `Button` at one weight (issue 2257 D8).
    expectLayout: {
      controls: [
        {
          selector: '[data-component-edit-system-rules]',
          styles:
            'min-height: 34px; border-radius: 9px; font-size: 0.72rem; background-color: var(--fab-success)',
        },
        { selector: '[data-component-sort]', styles: 'font-size: 11.5px; font-weight: 600' },
        { selector: '[data-component-sort-direction]', styles: 'font-weight: 600' },
      ],
    },
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/ui\/model\/(?:component|entity)BrowserModel\.js$/,
      WORLD_SCOPE_MODEL_PATTERN,
      // Builds the attribution note the inspector's Shared identity card draws (issue 2218).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/componentScoped\.js$/,
      PREMIUM_ICONS_AD_PATTERN,
    ],
  }),
  managerCase({
    // Issue 2220: the header once a GM dismisses the advert, which only the × reaches.
    id: 'manager-components-premium-ad-dismissed',
    label: 'Manager — Components with the Premium advert dismissed',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-premium-icons-ad-dismiss]' },
    ],
    expectView: 'components',
    expectSelector: `${COMPONENT_RULES_ACTIONS} > [data-component-add-from-catalogue]:first-child`,
    kinds: ['manager', 'components'],
    sourceMatches: [PREMIUM_ICONS_AD_PATTERN],
  }),
  managerCase({
    // Issue 2220: the advert's compact face, three icons and no subline, beside the action.
    id: 'manager-components-premium-ad-compact',
    label: 'Manager — Components with the compact Premium advert',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    expectSelector: `${COMPONENT_RULES_ACTIONS} > [data-premium-icons-ad]:first-child`,
    // Drawn rather than withheld; the geometry test proves this face drops its subline.
    expectVisible: '[data-premium-icons-ad]',
    expectClick: '[data-premium-icons-ad-link]',
    expectContained: [
      { container: '.manager-header', target: '[data-component-add-from-catalogue]' },
    ],
    position: { width: 1100, height: 820 },
    kinds: ['manager', 'components'],
    sourceMatches: [PREMIUM_ICONS_AD_PATTERN],
  }),
  managerCase({
    // Inside the old 1121-1179 band, where the full face left the lab header's heading 291-318px.
    id: 'manager-components-premium-ad-1150',
    label: 'Manager — Components header at 1150px',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    expectSelector: `${COMPONENT_RULES_ACTIONS} > [data-premium-icons-ad]:first-child`,
    expectVisible: '[data-premium-icons-ad]',
    expectLayout: PREMIUM_AD_HEADING_FLOOR,
    position: { width: 1150, height: 820 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [PREMIUM_ICONS_AD_PATTERN],
  }),
  managerCase({
    // Issue 2220: the advert's full face, six icons and the subline, above the 1320 rung.
    id: 'manager-components-premium-ad-full',
    label: 'Manager — Components with the full Premium advert',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    expectSelector: `${COMPONENT_RULES_ACTIONS} > [data-premium-icons-ad]:first-child`,
    // Only the full face draws the subline.
    expectVisible: '[data-premium-icons-ad] .manager-premium-icons-ad-subline',
    expectLayout: PREMIUM_AD_HEADING_FLOOR,
    position: { width: 1330, height: 820 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [PREMIUM_ICONS_AD_PATTERN],
  }),
  managerCase({
    // Issue 1371 r18-colour — the row badges in the essence's own colour (maintainer ruling M29).
    id: 'manager-components-essence-chips',
    label: 'Manager — Components essence chips',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      ...chooseSelectOption('[data-component-essence-filter]', '__any'),
      // Open a carrying row through its identity button: the list opens on its first drawn row, which may carry nothing.
      { selector: '.manager-component-row:has([data-chip-tint]) .manager-component-identity' },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row [data-essence-chip][data-chip-tint]',
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row [data-essence-chip][data-chip-tint]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-essence-list] [data-essence-chip][data-chip-tint]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceChip\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentBrowserInspector\.svelte$/,
    ],
  }),
  // The component toolbar's open-panel frame (issue 1510), on the tightest list in the phase:
  // `Carries any essence` in the 116px a ticked row leaves inside the call site's 168px panel
  // floor.
  managerCase({
    id: 'manager-components-essence-filter-list',
    label: 'Manager — Components essence filter list',
    reaches: 'beyond',
    smokeLabels: [],
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-essence-filter]' },
    ],
    expectView: 'components',
    // Two claims a closed frame cannot make: the panel exists and it is the ticked essence list.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="__any"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    // The inheriting rules editor (issue 1371): the only state that renders the category note in its info tone.
    id: 'manager-component-edit-inheriting',
    label: 'Manager — Component edit inheriting',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Iron Ingot' },
      { selector: '[data-component-edit]' },
    ],
    expectView: 'component-edit',
    // The category control is one select, not an `InheritRow` (issue 1371): its first option inherits, with the note under it.
    expectSelector: '[data-component-edit-category]',
    expectContained: [
      // The info-tone branch: `sm-iron-ingot` inherits, while `manager-component-edit-normal` opens a row that overrides.
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-category-note="inherited"]',
      },
      // And the one identity callout the two stacked cards collapsed into (D3).
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-section="identity"]',
      },
      // The essence section's inherit choice (issue 1371 r18-entry, maintainer ruling M31).
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-scoped-inherit-toggle="essences"]',
      },
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-component-edit-essence-note="inherited"]',
      },
    ],
    // The switch is a new control on this card (issue 1371), so it owns a real pointer hit rather than a DOM assertion.
    expectCenterHit: '[data-scoped-inherit-toggle="essences"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      ...COMPONENT_EDITOR_MATCHES,
      WORLD_SCOPE_MODEL_PATTERN,
      // Builds the attribution note the identity callout draws (issue 2218).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/componentScoped\.js$/,
    ],
  }),
  // The first open-panel frame in the component studio (issue 1510): the option list exists only
  // while the panel is open, so a closed-state frame cannot double for it (the portal occludes
  // the screen behind it). The category card's control is the widest `form` trigger, and its
  // list is unticked, the polarity the ticked recipe frame beside it does not draw.
  managerCase({
    id: 'manager-component-edit-category-list',
    label: 'Manager — Component edit category list',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    // The walk stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Iron Ingot' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-category]' },
    ],
    expectView: 'component-edit',
    // Three claims a closed-state frame fails: the panel exists, it is the unticked list, and its inherit row — the one option that is not a category at all — is drawn inside it.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover:not(.fabricate-select-popover-ticked) ' +
      '[data-popover-option="__inherit"] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by it.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'components'],
    sourceMatches: [...COMPONENT_EDITOR_MATCHES, ...ANCHORED_POPOVER_SOURCES],
  }),
  managerCase({
    // The rules editor's read-only world tag card (issue 1371, round 3), which no frame reached.
    id: 'manager-component-edit-world-tags',
    label: 'Manager — Component edit world tags',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Coal' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-section="world-tags"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: '[data-component-edit-section="world-tags"]',
    expectContained: [
      // The count note is contained by the card, not by the world-tag group, which is what this pair was getting wrong.
      {
        container: '[data-component-edit-section="tags"]',
        target: '[data-component-edit-world-tags-note]',
      },
      // The chip states stay scoped to the group: `bulk` is muted in this system and `fuel` is not.
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="bulk"]',
      },
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="fuel"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  managerCase({
    // The widened membership cohort (issue 1371): the ghost rows, their Add, and the toolbar counting the widened set.
    id: 'manager-components-world-cohort',
    label: 'Manager — Components world cohort',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      // The cohort switch is a `SegmentedControl` (issue 1371): one `<label>` per option, and the track stamps `true`.
      { selector: '[data-component-membership-option="all"]' },
      // Scroll to the cohort: it sits below every member row, so an unscrolled frame photographs the wrong rows.
      { selector: '.manager-component-row[data-component-member="false"]', scroll: true },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row[data-component-member="false"]',
    expectContained: [
      // A row, not the whole `<ul>`.
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[data-component-member="false"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentRow\.svelte$/,
      WORLD_SCOPE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    // The `Add from catalogue` picker, open and multi-selected (issue 1371, M9).
    id: 'manager-components-add-from-catalogue',
    label: 'Manager — Components add from catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-add-from-catalogue]' },
      // Two rows ticked, by state rather than by id.
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-add-from-catalogue-dialog]',
    kinds: ['manager', 'components'],
    // The picker's own file, and not `Modal.svelte`.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ComponentAddFromCatalogueDialog\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit',
    label: 'Manager — Components bulk edit',
    smokeLabels: ['manager-components-bulk-edit'],
    reaches: 'exact',
    query: {},
    // The staged face. `data-component-select` sits on a hidden input, so the click target is its `<label>`; two rows, because one reads as an accident.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      { selector: '[data-component-bulk-essences] [data-stepper-increment]' },
      // The tag inset pages over the system's tags (issue 1371), so each tag is reached through its search well and the well then cleared.
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ore' },
      { selector: '[data-bulk-tag="ore"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ingot' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: '' },
      { selector: '[data-component-bulk-category-option="Refined"]' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-bulk-panel]',
    // The three staged axes asserted: a radio or tri-state that stopped staging would otherwise publish a green frame.
    expectContained: [
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-category-option="Refined"][data-component-bulk-option-state="on"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-tag-chip="ore"][data-component-bulk-tag-chip-state="add"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-tag-chip="ingot"][data-component-bulk-tag-chip-state="remove"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-essences-staged="true"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-idle',
    label: 'Manager — Components bulk delete idle',
    reaches: 'beyond',
    smokeLabels: [],
    // The unarmed face of the set remove (issue 1129), and the frame that photographs its consequence note.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ingot"])' },
      { selector: '[data-component-bulk-remove]', scroll: true },
    ],
    expectView: 'components',
    // Unarmed is the state under test, and `data-armed="false"` is what separates this frame from its armed twin.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="false"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-armed',
    label: 'Manager — Components bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The armed half of the set remove (issue 1129), the twin of `manager-essences-bulk-delete-armed`.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      // The button, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it arms.
      { selector: '[data-arm-token="delete-components"]' },
    ],
    expectView: 'components',
    // Armed is a state; a frame re-photographing the idle button would be indistinguishable from the case above.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="true"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit-unstaged',
    label: 'Manager — Components bulk edit unstaged',
    smokeLabels: ['manager-components-bulk-edit-unstaged'],
    reaches: 'exact',
    query: {},
    // The pristine face: a selection and nothing staged, the only evidence of the leave-unchanged chips and inert Apply.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-description-before',
    label: 'Manager — Components description before',
    smokeLabels: ['manager-components-description-before'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ember Quenching Oil' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-raw"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-repaired',
    label: 'Manager — Components description repaired',
    smokeLabels: ['manager-components-description-repaired'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-toolbar input[type="search"]',
        fill: 'Rimefrost Quenching Oil',
      },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-repaired"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-ingested',
    label: 'Manager — Components description ingested',
    smokeLabels: ['manager-components-description-ingested'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ashfall Reagent Case' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-ingested"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-component-edit-normal',
    label: 'Manager — Component edit normal',
    smokeLabels: ['manager-component-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }, { selector: '[data-component-edit]' }],
    expectView: 'component-edit',
    // The tab strip's pointer hit, moved here from the stacked twin (issue 1976).
    expectCenterHit: '[data-component-edit-tab="rules"]',
    // The shared rail in this frame (issue 1371): the editor renders the world entry's rail at system scope.
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-scope-note]',
      },
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    kinds: ['manager', 'components'],
    // The three complication components are claimed by the four complication and stage-strip cases below (issue 1286).
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  // Issue 1522: the refused save's blocking notice, a row of the entry column above the scroller.
  managerCase({
    id: 'manager-component-edit-save-failed',
    label: 'Manager — Component edit save failed',
    smokeLabels: [],
    reaches: 'beyond',
    query: { saveFails: '1' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-tag-toggle]' },
      { selector: '[data-component-edit-save]' },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager #manager-component-edit-form > [data-notice-position] > [role="alert"]',
    expectCenterHit: '#manager-component-edit-form > [data-notice-position] > [role="alert"]',
    kinds: ['manager', 'components'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  // Issue 1522: the Validation tab, whose failing rows each draw a View routed to the Rules tab.
  managerCase({
    id: 'manager-component-edit-validation',
    label: 'Manager — Component edit validation',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-row[data-component-id="rw-slag"] [data-component-edit]' },
      { selector: '[data-component-edit-tab="validation"]' },
    ],
    expectView: 'component-edit',
    expectSelector: '.fabricate-manager [data-component-edit-validation]',
    expectCenterHit:
      '[data-component-validation-check="salvageRouting"] [data-component-validation-view]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      ...COMPONENT_EDITOR_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/component\/componentRulesValidation\.js$/,
    ],
  }),
  managerCase({
    // The other consumer of the shared frame, stacked (issue 1371 r19-entry2).
    id: 'manager-component-edit-stacked',
    label: 'Manager — Component edit stacked',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-edit]' },
      // The bounded frame scrolls itself, so the stacked preview tile is below its fold (issue 1976).
      { selector: '[data-scoped-entry-preview-tile]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: 'main.manager-component-edit-main',
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: 'main.manager-component-edit-main',
      expectedTracks: 1,
      // The side rail runs the body's full height beside the stacked frame (issue 1976).
      fillSelector: '.manager-rail',
    },
    expectCenterHit: '[data-scoped-entry-preview-tile]',
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    position: { width: 960, height: 860 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  managerCase({
    id: 'manager-component-edit-salvage',
    label: 'Manager — Component edit salvage',
    smokeLabels: ['manager-component-edit-salvage'],
    // The routed salvage authoring body: per-component result groups, a populated routing table and the DC override.
    reaches: 'exact',
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="rw-slag"] [data-component-edit]',
      },
      { selector: '[data-salvage-routing]', scroll: true },
    ],
    expectView: 'component-edit',
    // The flat row in view after the scroll; its amount toggle is the requirement row's (issue 1516).
    expectCenterHit:
      '[data-salvage-group="rw-salv-partial"] [data-salvage-result] [data-recipe-option-amount-mode="rolled"]',
    // The `toolbar` rung: 11.5px at the sort-direction `Button`'s weight (issue 2257 D8).
    expectLayout: {
      controls: [
        { selector: '[data-salvage-dc-preset]', styles: 'font-size: 11.5px; font-weight: 600' },
      ],
    },
    kinds: ['manager', 'components'],
    // The shared subject check-modifier picker does not render here, and this list used to claim it did (issue 1095).
    sourceMatches: SALVAGE_ROW_SOURCES,
  }),
  managerCase({
    id: 'manager-component-edit-salvage-narrow',
    label: 'Manager — Component edit progressive salvage at the declared floor',
    // Anchored to `hb-cracked-alembic`, the fixture world's one progressive salvage: the stage rows
    // are the shared list's now, and this selector is satisfied only by the converted state.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-salvage-result-groups]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row[data-salvage-result] [data-sortable-move="up"]',
    // The second stage's Edit link, in view after the scroll, is the row's trailing control (issue 1516).
    expectLayout: SALVAGE_STAGE_GEOMETRY,
    expectCenterHit: `${SALVAGE_STAGES}[data-salvage-stage="2"] [data-salvage-result-edit]`,
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: SALVAGE_ROW_SOURCES,
  }),
  // The Progressive DC card closing the stage list (issue 1522), which no frame above scrolls to.
  managerCase({
    id: 'manager-component-edit-salvage-progressive-dc',
    label: 'Manager — Component edit progressive salvage, the DC card closing the stage list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-component-edit-section="difficulty"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager [data-salvage-result-groups] [data-component-edit-section="difficulty"]',
    kinds: ['manager', 'components'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  // The stage list's complication band at the declared floor (issue 1522).
  managerCase({
    id: 'manager-component-edit-salvage-stages-narrow',
    label: 'Manager — Component edit progressive salvage, a stage’s complication band at the floor',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-salvage-stage-complications]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row.has-band [data-salvage-stage-complications]',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  managerCase({
    id: 'manager-component-edit-salvage-off',
    label: 'Manager — Component edit salvage off',
    smokeLabels: ['manager-component-edit-salvage-off'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-chainmail"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  managerCase({
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager — Component edit salvage simple',
    smokeLabels: ['manager-component-edit-salvage-simple'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-longsword"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: COMPONENT_EDITOR_MATCHES,
  }),
  // The fixed-or-rolled amount on salvage results (issue 1516): Steel Ingot Fixed, Tanned Leather
  // rolled, a third row opened on Rolled with nothing typed, and a fourth holding an unrollable
  // expression, captured after the field loses focus so its invalid paint is the resting one.
  managerCase({
    id: 'manager-component-edit-salvage-rolled-narrow',
    label:
      'Manager — Component edit salvage, rolled, opened and invalid amounts, at the declared floor',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      ...salvageSteps('sm-longsword'),
      { selector: '[data-salvage-section] [data-add-salvage-result]' },
      { selector: '.manager-travel-option:has-text("Flawless Ruby")' },
      { selector: '[data-salvage-section] [data-add-salvage-result]' },
      { selector: '.manager-travel-option:has-text("Deep Sapphire")' },
      { selector: `${SALVAGE_ROW(2)} [data-recipe-option-amount-mode="rolled"]` },
      { selector: `${SALVAGE_ROW(2)} [data-recipe-option-formula]`, fill: '1d4+1' },
      { selector: `${SALVAGE_ROW(3)} [data-recipe-option-amount-mode="rolled"]` },
      { selector: `${SALVAGE_ROW(4)} [data-recipe-option-amount-mode="rolled"]` },
      { selector: `${SALVAGE_ROW(4)} [data-recipe-option-formula]`, fill: 'max(, 2)' },
      // A click on the selected tab moves focus off the field without changing the screen.
      { selector: '[data-component-edit-tab="rules"]' },
    ],
    expectView: 'component-edit',
    // The first row Fixed, the next three on Rolled, and only the fourth marked invalid.
    expectSelector:
      `${SALVAGE_LIST}:not(:has(> [data-salvage-result]:nth-child(1) [data-recipe-option-formula]))` +
      ':has(> [data-salvage-result]:nth-child(2) [data-recipe-option-formula])' +
      ':has(> [data-salvage-result]:nth-child(3) [data-recipe-option-formula])' +
      ':not(:has(> [data-salvage-result]:nth-child(3) [data-recipe-option-invalid]))' +
      ' > [data-salvage-result]:nth-child(4) [data-recipe-option-invalid]',
    expectAttributes: [
      {
        selector: `${SALVAGE_ROW(2)} [data-recipe-option-formula]`,
        name: 'aria-invalid',
        value: null,
      },
      {
        selector: `${SALVAGE_ROW(4)} [data-recipe-option-formula]`,
        name: 'aria-invalid',
        value: 'true',
      },
    ],
    expectLayout: SALVAGE_GEOMETRY,
    expectContained: [1, 2, 3, 4].map((row) => ({
      container: SALVAGE_ROW(row),
      target: `${SALVAGE_ROW(row)} .manager-recipe-option-remove`,
    })),
    expectCenterHit: `${SALVAGE_ROW(4)} .manager-recipe-option-remove`,
    expectNoHorizontalOverflow: SALVAGE_LIST,
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [
      ...SALVAGE_ROW_SOURCES,
      /^src\/ui\/svelte\/apps\/manager\/RollDataExpressionInput\.svelte$/,
    ],
  }),
  // A cleared stage searches again in place (issue 1516): its suggestion list opens beneath it,
  // inside the editor's form, and its last suggestion must own its pointer target.
  managerCase({
    id: 'manager-component-edit-salvage-suggestions',
    label: 'Manager — Component edit salvage, a cleared stage row’s suggestion list open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      ...salvageSteps('hb-cracked-alembic'),
      { selector: '[data-salvage-stage="1"] [data-recipe-option-clear]' },
      { selector: '[data-salvage-stage="1"] [data-recipe-option-search]', fill: 'r' },
    ],
    expectView: 'component-edit',
    expectSelector: REQUIREMENT_SUGGESTION,
    expectContained: [
      { container: '.fabricate-manager', target: '.manager-recipe-option-suggestions' },
    ],
    expectCenterHit: `${REQUIREMENT_SUGGESTION}:last-child`,
    kinds: ['manager', 'components'],
    sourceMatches: [...SALVAGE_ROW_SOURCES, TYPEAHEAD_COMBOBOX_SOURCE, ...ANCHORED_POPOVER_SOURCES],
  }),
  // A salvage row's kind select, open (issue 1516): one option, Component, ticked.
  managerCase({
    id: 'manager-component-edit-salvage-kind-list',
    label: 'Manager — Component edit salvage, a result row’s kind list open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      ...salvageSteps('sm-longsword'),
      { selector: `${SALVAGE_ROW(1)} [data-recipe-option-kind]` },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="component"] .fabricate-select-tick',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    expectCenterHit:
      '.fabricate-manager > .fabricate-select-popover [data-popover-option="component"]',
    kinds: ['manager', 'components'],
    sourceMatches: [...SALVAGE_ROW_SOURCES, ...ANCHORED_POPOVER_SOURCES],
  }),

  // Five frames, all on `lab-herbalism`: the section gates on progressive resolution, which only herbalism has.
  managerCase({
    id: 'manager-component-complications-empty',
    label: 'Manager — Component complications empty',
    // The section's empty state is `EmptyState`'s `inline` variant (issue 1286), which exists on no other screen.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="hb-empty-vial"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // The empty state itself: a component that acquired a complication would publish the populated list under this name.
    expectSelector: '.fabricate-manager [data-complications-section] [data-complications-empty]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-collapsed',
    label: 'Manager — Component complications collapsed',
    // The resting list: two summary rows, both closed.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // A row, and specifically the authoring variant.
    expectSelector:
      '.fabricate-manager [data-complications-section] [data-complication-row="authoring"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-expanded',
    label: 'Manager — Component complications expanded',
    // The open row, where the section's whole authoring surface lives: identity strip, Applies-to chips, When and Then cards.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complication="hb-comp-dust-cloud"] [data-complication-disclosure]' },
      // The last row of the When card, so the scroll puts the whole card and the identity strip in one frame.
      { selector: '[data-complication-roll-condition]', scroll: true },
    ],
    expectView: 'component-edit',
    // `aria-expanded`, not merely the detail: a disclosure that stopped toggling would publish the collapsed frame.
    expectSelector:
      '.fabricate-manager [data-complication="hb-comp-dust-cloud"] ' +
      '[data-complication-disclosure][aria-expanded="true"]',
    // The `toolbar` rung: 11.5px at the sort-direction `Button`'s weight (issue 2257 D8).
    expectLayout: {
      controls: [
        {
          selector: '[data-complication-roll-condition-cmp]',
          styles: 'font-size: 11.5px; font-weight: 600',
        },
      ],
    },
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationEffectRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-check-trigger',
    label: 'Manager — Component complications check trigger',
    // Beyond the smoke: the check-trigger Select appears only once a check-trigger condition is chosen on an open complication.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism', w: '1280', h: '820' },
    steps: [
      // A crafting trigger has to exist for the Select to list; the save keeps the dirty-draft discard dialog from blocking navigation.
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-add-trigger]' },
      { selector: '[data-checks-save]' },
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complication="hb-comp-dust-cloud"] [data-complication-disclosure]' },
      {
        selector:
          '[data-complication="hb-comp-dust-cloud"] [data-complication-condition="checkTrigger"]',
      },
    ],
    expectView: 'component-edit',
    expectSelector: '[data-complication="hb-comp-dust-cloud"] [data-complication-trigger]',
    // The `toolbar` rung: 11.5px at the sort-direction `Button`'s weight (issue 2257 D8).
    expectLayout: {
      controls: [
        { selector: '[data-complication-trigger]', styles: 'font-size: 11.5px; font-weight: 600' },
      ],
    },
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationEffectRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-salvage-stage-strip',
    label: 'Manager — Component complications salvage stage strip',
    // The read-only strip under a progressive salvage stage row.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-salvage-stage-complications]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager [data-salvage-stage-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
      ...COMPONENT_EDITOR_MATCHES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-complications-stage-strip',
    label: 'Manager — Recipe complications stage strip',
    // The Recipe Studio's counterpart, kept as a separate frame because the two strips are deliberately asymmetric.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-result-complications]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager [data-recipe-result-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'recipes', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeResultGroupCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-fixed-over',
    label: 'higher is better, fixed DC',
    field: 'dcOverride',
    frame: 23,
    sees: 'fixed',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-fixed-under',
    label: 'lower is better, fixed target',
    field: 'dcOverride',
    frame: 23,
    sees: 'fixed',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-add',
    label: 'character value, added adjustment, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-multiply',
    label: 'character value, multiplied adjustment, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-default',
    label: 'character value, system default, no character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'no-character',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-custom',
    label: 'character value, custom multiplier, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  // Routed salvage whose `simple` check is a fixed DC: the adjustment field proves the override
  // reads the routed sub-object salvage rolls.
  overrideCase({
    id: 'manager-component-edit-salvage-override-routed',
    label: 'routed salvage reading a character value, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  // A kind switch left this kept override invalid (issue 2078); the field itself names it.
  overrideCase({
    id: 'manager-component-edit-salvage-override-invalid',
    label: 'character value, a kept override invalid for its kind',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'adjustment-invalid',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-count-preset',
    label: 'counting successes, a tier preset',
    field: 'successesOverride',
    frame: 25,
    sees: 'count',
    claim:
      ':has([data-salvage-dc-preset]:has-text("Standard — 3 successes needed"))' +
      ':has([data-salvage-override-kept])',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-count-custom',
    label: 'counting successes, a custom count',
    field: 'successesOverride',
    frame: 25,
    sees: 'count',
    claim: ':has([data-salvage-successes-custom])',
  }),
  overrideCase({
    id: 'manager-component-edit-salvage-override-count-default',
    label: 'counting successes, the system default',
    field: 'successesOverride',
    frame: 25,
    sees: 'count',
    claim:
      ':has([data-salvage-dc-preset]:has-text("System default — 2 successes needed"))' +
      ':not(:has([data-salvage-successes-custom]))' +
      ':has([data-salvage-override-kept])',
  }),
]);

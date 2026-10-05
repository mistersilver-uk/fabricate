/**
 * System scope: environments, gathering tasks, their editors and gathering events.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
  GATHERING_ROUTE_MODEL_PATTERN,
  GATHERING_TASK_EDITOR_PATTERN,
} from './caseConstants.js';
import { chooseSelectOption, managerCase, previewAsActor } from './caseFactories.js';

/**
 * The gathering task check override (issue 2005, R3), one per state of the approved prototype's
 * frames 23 and 24, on Smithing's Prospect task under `checkOverride`. `sees` is the Player sees
 * state; a `resolved` case chooses a character in the task's own Preview-as picker, and `claim`
 * adds the field's own state. `count` is issue 2006's: one successes needed Stepper, no presets.
 */
const OPEN_PROSPECT_TASK = Object.freeze([
  { selector: '#manager-gathering-nav-tasks' },
  {
    selector:
      '[data-gathering-task-id="sm-task-prospect"] .fabricate-icon-button[aria-label^="Edit"]',
  },
]);
const TASK_PREVIEW = '[data-gathering-task-dc] [data-override-preview-actor]';
/** A click on one of the task editor's tabs (issue 1522); Overview is where it opens. */
const taskTab = (tab) => ({ selector: `[data-gathering-task-tab="${tab}"]` });
const OPEN_SLOWBLOOM_TASK = Object.freeze([
  { selector: '#manager-gathering-nav-tasks' },
  {
    selector:
      '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
  },
]);
const AVAILABLE_SPRING_ROW = '[data-section="available-to-add"] [data-record-id="hb-task-spring"]';
/** A Direct task's result rows; a step or a single-element check reads the first. */
const STRAIGHT_RESULT = '[data-gathering-task-results="straight"] [data-recipe-result-item]';
const taskOverrideCase = ({ id, label, field, frame, sees, claim = '' }) =>
  managerCase({
    id,
    label: `Manager — Gathering task check override, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: {
      system: 'lab-smithing',
      checkOverride: id.slice('manager-gathering-task-editor-check-'.length),
    },
    steps: [
      'Gathering',
      ...OPEN_PROSPECT_TASK,
      taskTab('requirements'),
      { selector: '[data-gathering-task-dc]', scroll: true },
      ...(sees === 'resolved' ? previewAsActor('lab-actor-idrin', TASK_PREVIEW) : []),
    ],
    expectView: 'gathering-task-edit',
    expectSelector: `.fabricate-manager [data-gathering-task-dc][data-gathering-task-override-field="${field}"]${claim} [data-override-player-sees="${sees}"]`,
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_TASK_EDITOR_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/component\/(OverridePlayerSees\.svelte|overridePlayerSees\.js)$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/PreviewAsPicker\.svelte$/,
    ],
  });

export const CASES = Object.freeze([
  // The state it would show is reached by flipping an inherit switch, and in the View Lab that write never reaches the screen.
  managerCase({
    id: 'manager-environments-browse-normal',
    label: 'Manager — Environments browse normal',
    smokeLabels: ['manager-environments-browse-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
    ],
  }),
  managerCase({
    id: 'manager-environments-browse-stacked',
    label: 'Manager — Environments browse stacked',
    smokeLabels: ['manager-environments-browse-stacked'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // This case stacks the browse column above the rail, so it is the frame that proves the
      // list geometry survives a change to the rail even though the rail itself clips below the
      // 700px fold here; the default-width browse case is the one that photographs the column.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-tasks-browse-normal',
    label: 'Manager — Gathering tasks browse normal',
    // Beyond the smoke: `screenshotCaptureMap.js` carries the two task-editor labels and nothing for the library.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The tasks library is a section of the environments route, so the route key stays `environments`.
    steps: ['Gathering', { selector: '#manager-gathering-nav-tasks' }],
    expectView: 'environments',
    // `selectedGatheringTaskId` falls back to the declaration-ordered library, so the browse opens on `hb-task-forage`.
    expectSelector: '.fabricate-manager [data-gathering-task-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringTasksBrowserView)\.svelte$/,
      // This frame's `expectSelector` is a fact of the task inspector, which issue 1707 phase 2
      // moved out of the root: without this the leaf publishes environment-editor frames instead.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringTaskInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  // The gathering toolbars' open-panel frame (issue 1510), on the tightest of their six lists:
  // `Any time/weather` is 93px of the 108 a ticked row leaves at the `toolbar` band's 160px floor.
  // No filter in these two bars carries an `aria-label`, so the trigger is addressed by the caption
  // id that names it.
  managerCase({
    id: 'manager-gathering-tasks-availability-filter-list',
    label: 'Manager — Gathering tasks availability filter list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-tasks-browser] .fabricate-select-trigger[aria-labelledby$="-availability-filter"]',
      },
    ],
    expectView: 'environments',
    // Two claims a closed frame cannot make: the panel exists and it is the ticked availability list.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="any"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringTasksBrowserView\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-normal',
    label: 'Manager — Gathering task editor normal',
    smokeLabels: ['manager-gathering-task-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a submenu, so reaching the task library takes two clicks.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
    ],
    // Hearth & Herb, the palette where the control outline is weakest (issue 2151).
    themeVariants: ['hearth-herb'],
    expectView: 'gathering-task-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      GATHERING_TASK_EDITOR_PATTERN,
    ],
  }),
  // The editor's other two tabs (issue 1522): Requirements full width, and a d100 task's Results,
  // the one tab whose rail holds the selected-drop editor.
  ...[
    [
      'requirements',
      '[data-gathering-task-panel="requirements"] [data-gathering-task-availability]',
    ],
    [
      'results',
      '.fabricate-manager:not([data-gathering-task-layout]) aside.manager-inspector [data-gathering-task-drop-inspector]',
    ],
  ].map(([tab, claim]) =>
    managerCase({
      id: `manager-gathering-task-editor-${tab}`,
      label: `Manager — Gathering task editor ${tab} tab`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-herbalism' },
      steps: ['Gathering', ...OPEN_SLOWBLOOM_TASK, taskTab(tab)],
      expectView: 'gathering-task-edit',
      expectSelector: claim,
      expectCenterHit: `[data-gathering-task-tab="${tab}"]`,
      kinds: ['manager', 'environments'],
      sourceMatches: [GATHERING_ROUTE_MODEL_PATTERN, GATHERING_TASK_EDITOR_PATTERN],
    })
  ),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].map(({ suffix, width, height }) =>
    managerCase({
      id: `manager-gathering-task-node-interval-${suffix}`,
      label: `Manager — Gathering resource node interval ${suffix}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-smithing' },
      position: { width, height },
      // Herbalism disables nodes. Prospecting reaches the actual paired-control layout (#1649).
      steps: [
        'Gathering',
        { selector: '#manager-gathering-nav-tasks' },
        {
          selector:
            '[data-gathering-task-id="sm-task-prospect"] .fabricate-icon-button[aria-label^="Edit"]',
        },
        ...chooseSelectOption('[data-gathering-task-node-respawn]', 'overTime'),
        { selector: '[data-gathering-task-node-interval]', fill: '1440' },
        { selector: '[data-gathering-task-nodes]', scroll: true },
      ],
      expectView: 'gathering-task-edit',
      // A trigger has no `:checked` and the row click shuts the panel, so the claim rides what the
      // choice unlocks: the interval row renders only under `overTime` (issue 1510).
      expectSelector:
        '.manager-task-node-interval-row .fabricate-select-trigger[data-gathering-task-node-interval-unit]',
      expectVisible: '[data-gathering-task-node-interval]',
      expectCenterHit: '[data-gathering-task-node-interval]',
      expectNoHorizontalOverflow: '[data-gathering-task-nodes]',
      expectContained: [
        '[data-gathering-task-node-count]',
        '.manager-task-node-interval-row .fab-stepper',
        '[data-gathering-task-node-interval]',
        '[data-gathering-task-node-interval-unit]',
      ].map((target) => ({ container: '[data-gathering-task-nodes]', target })),
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [GATHERING_ROUTE_MODEL_PATTERN, GATHERING_TASK_EDITOR_PATTERN],
    })
  ),
  // The depleted-marker art picker (issue 1522): the art and its pencil, and the empty slot.
  ...[
    ['filled', { depletedImage: '1' }, '[data-gathering-task-depleted-image]'],
    ['empty', {}, '[data-gathering-task-depleted-image]'],
  ].map(([state, flags, hit]) =>
    managerCase({
      id: `manager-gathering-task-depleted-image-${state}`,
      label: `Manager — Gathering task depleted marker image, ${state}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-smithing', ...flags },
      steps: [
        'Gathering',
        ...OPEN_PROSPECT_TASK,
        { selector: '[data-gathering-task-depleted-behavior]', scroll: true },
      ],
      expectView: 'gathering-task-edit',
      expectSelector: `.fabricate-manager [data-gathering-task-depleted-image]${state === 'filled' ? ' img' : ':not(:has(img))'}`,
      expectCenterHit: hit,
      kinds: ['manager', 'environments'],
      sourceMatches: [GATHERING_ROUTE_MODEL_PATTERN, GATHERING_TASK_EDITOR_PATTERN],
    })
  ),
  // The gathering studio's first open-panel frame (issue 1510), and the only way to photograph a
  // converted control's list: it exists only while the panel is open, and an open panel cannot
  // double as the route's closed-state frame. This one is unticked, unlike the checks studio's.
  managerCase({
    id: 'manager-gathering-task-node-respawn-list',
    label: 'Manager — Gathering resource node respawn list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="sm-task-prospect"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-node-respawn]' },
    ],
    expectView: 'gathering-task-edit',
    // Three claims a closed frame cannot make: the panel exists, it is the unticked list, and it
    // names the policy in the GM's words rather than the `overTime` the model stores.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover:not(.fabricate-select-popover-ticked)' +
      ' [data-popover-option="overTime"] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by the card it opened from.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'environments'],
    sourceMatches: [GATHERING_TASK_EDITOR_PATTERN, ...ANCHORED_POPOVER_SOURCES],
  }),
  // The stamina row's two pickers reached no frame at all until this case (issue 1510), and they
  // are the only converted controls in this editor whose panel is TICKED. The row exists only under
  // the stamina economy, so the state is driven: enable the mode in Settings, then author a row.
  managerCase({
    id: 'manager-gathering-task-stamina-modifier-list',
    label: 'Manager — Gathering task stamina modifier list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      { selector: '[data-economy-mode-option="stamina"]' },
      { selector: '[data-economy-stamina-max]', fill: '12' },
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('requirements'),
      { selector: '[data-gathering-add-stamina-modifier]' },
      // The row renders no caption, so its own accessible name is the address (issue 1510).
      { selector: '.fabricate-select-trigger[aria-label="Per-actor cost modifiers"]' },
    ],
    expectView: 'gathering-task-edit',
    // Three claims a closed frame cannot make: the panel exists, it is the ticked list, and the
    // world's longest modifier name renders whole in it rather than ellipsised.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="hb-mod-weather"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      GATHERING_TASK_EDITOR_PATTERN,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].flatMap(({ suffix, width, height }) =>
    ['task-availability', 'task-tools', 'event-availability'].map((state) => {
      const kind = state.startsWith('task') ? 'task' : 'event';
      const tools = state === 'task-tools';
      const availability = `[data-gathering-${kind}-availability]`;
      const toolPill = '[data-gathering-task-required-tool-pill="hb-tool-mortar"]';
      const toolCard = '[data-gathering-task-required-tools-card="hb-tool-mortar"]';
      const focus = tools ? '[data-gathering-task-required-tools-attached]' : availability;
      const emptyFields = ['biomes', 'timeOfDay', 'weather'].map(
        (field) => `[data-gathering-${kind}-availability-pills="${field}"] .manager-empty.is-field`
      );
      return managerCase({
        id: `manager-gathering-${state}-feedback-${suffix}`,
        label: `Manager — Gathering ${state} feedback ${suffix}`,
        reaches: 'beyond',
        smokeLabels: [],
        query: { system: 'lab-herbalism' },
        position: { width, height },
        steps: [
          'Gathering',
          { selector: `#manager-gathering-nav-${kind === 'task' ? 'tasks' : 'encounters'}` },
          {
            selector:
              `[data-gathering-${kind}-id="${kind === 'task' ? 'hb-task-slowbloom' : 'hb-event-wolves'}"]` +
              ' .fabricate-icon-button[aria-label^="Edit"]',
          },
          ...(kind === 'task'
            ? [
                taskTab('requirements'),
                { selector: '[data-gathering-task-availability-pill="biomes"] [data-chip-remove]' },
                { selector: toolCard },
                { selector: `${toolPill} [data-chip-remove]`, press: 'Space' },
                { selector: toolCard, press: 'Enter' },
              ]
            : []),
          ...['biomes', 'timeOfDay', 'weather'].flatMap((field) => [
            {
              selector: `[data-gathering-${kind}-field="${field}"] .manager-condition-menu-button`,
            },
            { selector: `[data-gathering-${kind}-availability-option="${field}"]`, press: 'Enter' },
            {
              selector: `[data-gathering-${kind}-availability-pill="${field}"] [data-chip-remove]`,
              press: 'Space',
            },
          ]),
          { selector: focus, scroll: true },
        ],
        expectView: `gathering-${kind}-edit`,
        expectSelector:
          `.fabricate-manager${emptyFields.map((selector) => `:has(${selector})`).join('')}` +
          (kind === 'task' ? `:has(${toolPill} img)` : ''),
        expectVisible: focus,
        expectCenterHit: tools ? `${toolPill} [data-chip-remove]` : null,
        expectNoHorizontalOverflow: focus,
        expectContained: (tools ? [toolPill, `${toolPill} [data-chip-remove]`] : emptyFields).map(
          (target) => ({ container: '.manager-main', target })
        ),
        kinds: ['manager', 'environments', 'responsive'],
        sourceMatches: [
          // One dirty-draft frame per editor stands for the route model, and the Required Tools
          // frame for the task's tool-reference handlers (issue 1721).
          ...(suffix === 'normal' ? [GATHERING_ROUTE_MODEL_PATTERN] : []),
          /^src\/ui\/svelte\/apps\/manager\/Gathering(TaskEditView|EventEditView)\.svelte$/,
          ...(kind === 'task' ? [GATHERING_TASK_EDITOR_PATTERN] : []),
        ],
      });
    })
  ),
  managerCase({
    id: 'manager-gathering-task-editor-straight',
    label: 'Manager — Gathering task Direct yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'straight' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-task-results="straight"] [data-recipe-result-item]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringTaskEditView)\.svelte$/,
      GATHERING_TASK_EDITOR_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  // A Direct task's result on Rolled beside a second on Fixed (issue 1516): the gathering surface of
  // the result row.
  managerCase({
    id: 'manager-gathering-task-editor-straight-rolled',
    label: 'Manager — Gathering task Direct yields, a rolled amount',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'straight' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-results]', scroll: true },
      { selector: `${STRAIGHT_RESULT} [data-recipe-option-amount-mode="rolled"]` },
      { selector: `${STRAIGHT_RESULT} [data-recipe-option-formula]`, fill: '1d4+1' },
      { selector: '[data-gathering-task-results="straight"] [data-recipe-add="result-item"]' },
      { selector: '.manager-travel-option:has-text("Moonleaf")' },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: `${STRAIGHT_RESULT} [data-recipe-option-formula]:not([aria-invalid])`,
    expectLayout: {
      containerSelector: '[data-gathering-task-results="straight"]',
      oneLineRows: STRAIGHT_RESULT,
      alignedRight: `${STRAIGHT_RESULT} .manager-recipe-option-remove`,
      alignedLeft: `${STRAIGHT_RESULT} [role="radiogroup"]`,
    },
    expectContained: [
      { container: STRAIGHT_RESULT, target: `${STRAIGHT_RESULT} .manager-recipe-option-remove` },
    ],
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_TASK_EDITOR_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/(Recipe(ResultGroupCard|ResultsSection)|PickerRow|PickerRowAmount)\.svelte$/,
    ],
  }),
  ...['selector', 'straight', 'routed'].map((mode) =>
    managerCase({
      id: `manager-gathering-task-editor-${mode}-narrow`,
      label: `Manager — Gathering task ${mode}, narrow`,
      smokeLabels: [],
      reaches: 'beyond',
      position: { width: 1000, height: 720 },
      query: {
        system: 'lab-herbalism',
        gatheringTaskMode: mode === 'selector' ? 'straight' : mode,
      },
      steps: [
        'Gathering',
        { selector: '#manager-gathering-nav-tasks' },
        {
          selector:
            '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
        },
        ...(mode === 'selector' ? [] : [taskTab('results')]),
        {
          selector:
            mode === 'selector'
              ? '[data-gathering-task-resolution]'
              : '[data-gathering-task-results]',
          scroll: true,
        },
      ],
      expectView: 'gathering-task-edit',
      expectSelector:
        mode === 'selector'
          ? '[data-gathering-task-resolution-mode]'
          : `[data-gathering-task-results="${mode}"]`,
      // The editor's own main, not the body, scrolls below the 1120px rung (issue 1976).
      expectScrollable: 'main.manager-gathering-task-edit-view',
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        GATHERING_ROUTE_MODEL_PATTERN,
        /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringTaskEditView)\.svelte$/,
        GATHERING_TASK_EDITOR_PATTERN,
        /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
      ],
    })
  ),
  managerCase({
    id: 'manager-gathering-task-editor-routed',
    label: 'Manager — Gathering task Matched check yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'routed' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="1"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringTaskEditView)\.svelte$/,
      GATHERING_TASK_EDITOR_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-routed-unmatched',
    label: 'Manager — Gathering task Unmatched check yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'routed-unmatched' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="0"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringTaskEditView)\.svelte$/,
      GATHERING_TASK_EDITOR_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-availability-menu',
    label: 'Manager — Gathering task availability menu open',
    // Beyond the smoke: no smoke routine opens an availability menu, so there is no counterpart frame.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // `hb-task-slowbloom` authors one of four biomes, so the menu opens on the three unselected ones.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('requirements'),
      { selector: '[data-gathering-task-availability]', scroll: true },
      { selector: '[data-gathering-task-field="biomes"] .manager-condition-menu-button' },
    ],
    expectView: 'gathering-task-edit',
    // The portaled panel and an option inside it: either alone is satisfied by a state this case is not about.
    expectSelector:
      '.fabricate-manager .manager-travel-popover [data-gathering-task-availability-option="biomes"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      // The biome options are the modifier handlers' vocabulary read (issue 1721).
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(EventEditView|TaskEditView)\.svelte$/,
      GATHERING_TASK_EDITOR_PATTERN,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-stacked',
    label: 'Manager — Gathering task editor stacked',
    smokeLabels: ['manager-gathering-task-editor-stacked'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      // At 1000px the library stacks, so the scroll to reach Edit carries into the editor's own container.
      { selector: '[data-gathering-task-core-editor]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // 1000x720, the width its smoke counterpart stacks at; 1280x820 was the normal geometry.
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      GATHERING_TASK_EDITOR_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-environment-edit-placeholder',
    label: 'Manager — Environment edit placeholder',
    smokeLabels: ['manager-environment-edit-placeholder'],
    // The environment editor's Overview tab, with the summary, linked-scene, validation and runtime inspector beside it.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .fabricate-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'environment-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
      GATHERING_ROUTE_MODEL_PATTERN,
    ],
  }),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].map(({ suffix, width, height }) => {
    const fields = [
      '[data-environment-field="includedRealmIds"]',
      '.manager-environment-context-biomes',
    ];
    const emptyFields = fields.map((field) => `${field} .manager-empty.is-field`);
    // Both add controls are `<Select>` triggers since issue 1510, and neither carries a hook of its
    // own, so each is addressed by the trigger class inside its own field.
    const addTriggers = fields.map((field) => `${field} .fabricate-select-trigger`);
    const context = '[data-overview-section="context"]';
    return managerCase({
      id: `manager-environment-empty-membership-${suffix}`,
      label: `Manager — Environment empty realms and biomes ${suffix}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-herbalism' },
      position: { width, height },
      // Herbalism opts out of realms; enable participation through the existing settings UI.
      steps: [
        'System Overview',
        { selector: '#system-tab-settings' },
        { selector: '[data-gathering-realm-toggle]', press: 'Space' },
        'Gathering',
        {
          selector:
            '.manager-environment-row[data-environment-id="hb-env-grove"] .fabricate-icon-button[aria-label^="Edit"]',
        },
        ...[
          ['realm', 'hb-realm-verdant'],
          ['biome', 'forest'],
        ].flatMap(([kind, id], index) => {
          const remove = `[data-environment-${kind}-pill="${id}"] [data-chip-remove]`;
          return [
            { selector: remove, press: 'Space' },
            ...chooseSelectOption(addTriggers[index], id),
            { selector: remove, press: 'Space' },
          ];
        }),
        { selector: context, scroll: true },
      ],
      expectView: 'environment-edit',
      expectSelector: `.fabricate-manager${emptyFields.map((selector) => `:has(${selector})`).join('')}`,
      expectVisible: context,
      expectNoHorizontalOverflow: context,
      expectContained: [...emptyFields, ...addTriggers].map((target) => ({
        container: '.manager-main',
        target,
      })),
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        GATHERING_ROUTE_MODEL_PATTERN,
        /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentOverviewTab\.svelte$/,
      ],
    });
  }),
  // The environment editor's first open-panel frame (issue 1510), and its ticked list, so the tick
  // gutter's bite out of the panel width is read against a six-level vocabulary.
  managerCase({
    id: 'manager-environment-danger-level-list',
    label: 'Manager — Environment danger level list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-environment-field="dangerLevel"]' },
    ],
    expectView: 'environment-edit',
    // Three claims a closed frame cannot make: the panel exists, it is the ticked list, and it
    // names the level in the GM's words rather than the `hazardous` the model stores.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="hazardous"] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by the card it opened from.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'environments'],
    sourceMatches: [
      // The danger levels are the modifier handlers' vocabulary read (issue 1721).
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentOverviewTab\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-environment-edit-events',
    label: 'Manager — Environment edit Events tab',
    smokeLabels: ['manager-environment-edit-events'],
    // `exact`: the smoke's own walk clicks this tab and photographs it without selecting anything.
    reaches: 'exact',
    // No fixture change.
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-events' },
    ],
    expectView: 'environment-edit',
    // The route survives a tab click that did nothing, so the assertion names the tab panel and the inspector.
    expectSelector:
      '.fabricate-manager:has([data-environment-tab="events"] .manager-environment-comp-entry.is-selected)' +
      ' [data-record-inspector="event"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  // Issue 1522: a composition row's overrides open in place in that row, and the scene link is
  // authored on the Overview tab's own card, so the rail beside both is read-only.
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].flatMap(({ suffix, width, height }) =>
    [
      ['task', 'lab-smithing', 'sm-env-mine', 'tasks', 'sm-task-prospect'],
      ['event', 'lab-herbalism', 'hb-env-grove', 'events', 'hb-event-storm'],
    ].map(([kind, system, environment, tab, record]) => {
      const row = `[data-environment-tab="${tab}"] .fabricate-sortable-list-row.is-expanded[data-record-id="${record}"]`;
      const input = `${row} [data-drop-rate-adjustment-input]`;
      return managerCase({
        id: `manager-environment-edit-${kind}-row-open-${suffix}`,
        label: `Manager — Environment edit ${kind} row overrides open ${suffix}`,
        reaches: 'beyond',
        smokeLabels: [],
        query: { system },
        position: { width, height },
        steps: [
          'Gathering',
          {
            selector: `.manager-environment-row[data-environment-id="${environment}"] .fabricate-icon-button[aria-label^="Edit"]`,
          },
          { selector: `#environment-tab-${tab}` },
          { selector: `[data-sortable-disclosure="${record}"]` },
          { selector: input, scroll: true },
        ],
        expectView: 'environment-edit',
        expectSelector: `.fabricate-manager ${row} [data-composition-override-body="${kind}"]`,
        expectNoHorizontalOverflow: `[data-environment-tab="${tab}"]`,
        expectCenterHit: input,
        kinds: ['manager', 'environments', ...(suffix === 'narrow' ? ['responsive'] : [])],
        sourceMatches: [
          GATHERING_ROUTE_MODEL_PATTERN,
          ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
          /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
        ],
      });
    })
  ),
  ...[
    ['linked', 'hb-env-grove', { width: 1280, height: 820 }, '[data-overview-scene-unlink]'],
    [
      'unlinked-narrow',
      'hb-env-ridge',
      { width: 1000, height: 720 },
      '[data-overview-section="scene"] [data-manager-item-drop-zone]',
    ],
  ].map(([state, environment, position, hit]) =>
    managerCase({
      id: `manager-environment-edit-scene-${state}`,
      label: `Manager — Environment edit Linked scene card, ${state}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-herbalism' },
      position,
      steps: [
        'Gathering',
        {
          selector: `.manager-environment-row[data-environment-id="${environment}"] .fabricate-icon-button[aria-label^="Edit"]`,
        },
        { selector: '[data-overview-section="scene"]', scroll: true },
      ],
      expectView: 'environment-edit',
      expectSelector:
        state === 'linked'
          ? '.fabricate-manager [data-overview-section="scene"] [data-overview-scene-linked]'
          : '.fabricate-manager [data-overview-section="scene"] [data-item-drop-zone="scene"]:not([data-overview-scene-linked])',
      expectNoHorizontalOverflow: '[data-overview-section="scene"]',
      expectCenterHit: hit,
      kinds: ['manager', 'environments', ...(state === 'linked' ? [] : ['responsive'])],
      sourceMatches: [
        GATHERING_ROUTE_MODEL_PATTERN,
        ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
        /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
      ],
    })
  ),
  // A row outside the ordered list opens the same body through its own grid track, at the floor.
  managerCase({
    id: 'manager-environment-edit-available-row-open-narrow',
    label: 'Manager — Environment edit Available-to-add row overrides open narrow',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    position: { width: 1000, height: 720 },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-thicket"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-tasks' },
      { selector: '[data-composition-disclosure="hb-task-spring"]' },
      { selector: `${AVAILABLE_SPRING_ROW} [data-drop-rate-adjustment-input]`, scroll: true },
    ],
    expectView: 'environment-edit',
    expectSelector: `.fabricate-manager ${AVAILABLE_SPRING_ROW} [data-composition-override-body="task"]`,
    expectNoHorizontalOverflow: '[data-environment-tab="tasks"]',
    expectCenterHit: `${AVAILABLE_SPRING_ROW} [data-drop-rate-adjustment-input]`,
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  // The ranked event strip's 94px lead: the grip, the badge and the disclosure over each row.
  managerCase({
    id: 'manager-environment-edit-events-ranked',
    label: 'Manager — Environment edit Events tab, highest-ranked event selection',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      { selector: '#manager-gathering-rule-events', select: 'highestRankedDrop' },
      { selector: '#manager-gathering-nav-environments' },
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-events' },
    ],
    expectView: 'environment-edit',
    expectSelector:
      '.fabricate-manager [data-environment-tab="events"] .manager-environment-comp-head.has-rank-controls',
    expectCenterHit: '[data-environment-tab="events"] [data-sortable-grip]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-events-normal',
    label: 'Manager — Gathering events normal',
    smokeLabels: ['manager-gathering-events-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // `encounters`, not `events`: the nav item's id is the route key, and only the label says Events.
    steps: ['Gathering', { selector: '#manager-gathering-nav-encounters' }],
    // The events library is a section of the environments route, so the second step moves the section.
    expectView: 'environments',
    // The inspector fact is the only evidence that the event browser calls `activeEnvironmentsForRecord` correctly (issue 1321).
    expectSelector: '.fabricate-manager [data-gathering-event-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // The facts this case exists to show are computed and rendered here.
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      // And drawn by the leaf they moved into (issue 1707 phase 2).
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringEventInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-event-editor-normal',
    label: 'Manager — Gathering event editor normal',
    smokeLabels: ['manager-gathering-event-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-encounters' },
      {
        selector:
          '[data-gathering-event-id="hb-event-wolves"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      // The danger pills into frame (issue 1515).
      { selector: '[data-gathering-event-danger-pills]', scroll: true },
    ],
    expectView: 'gathering-event-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // This is the only frame that draws the event half of the shared modifier panel, and neither
      // pattern above reaches `environment/` (issue 1707).
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringModifierEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringEventInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-drop-modifiers-normal',
    label: 'Manager — Gathering task drop modifiers normal',
    // Beyond the smoke: its walk never selects a drop, so no existing frame draws this column.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a submenu, so the task library is two clicks; the drop row is
    // the third, and the drop panel is the aside's third track.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-drop-id="hb-slowbloom-drop"]' },
      { selector: '[data-gathering-drop-condition-modifiers="biome"]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // The drop half of the shared modifier panel, which no other case in the registry reaches.
    expectSelector:
      '.fabricate-manager .manager-inspector [data-gathering-drop-condition-modifiers="biome"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringModifierEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringTaskInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-drop-condition-modifier-attached',
    label: 'Manager — Gathering task drop with an attached condition modifier',
    // Beyond the smoke: it attaches a biome modifier, so a condition modifier's one-line rule row
    // is on screen, which the empty card above never draws (issue 1782).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
      },
      taskTab('results'),
      { selector: '[data-gathering-task-drop-id="hb-slowbloom-drop"]' },
      { selector: '[data-gathering-drop-condition-modifier-picker="biome"] button' },
      { selector: '[data-gathering-drop-condition-modifiers="biome"]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector:
      '.fabricate-manager .manager-inspector [data-gathering-drop-condition-modifiers="biome"] [data-gathering-drop-modifier-id]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringModifierEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringTaskInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-fixed-over',
    label: 'higher is better, fixed DC',
    field: 'dcOverride',
    frame: 23,
    sees: 'fixed',
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-fixed-under',
    label: 'lower is better, fixed target',
    field: 'dcOverride',
    frame: 23,
    sees: 'fixed',
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-add',
    label: 'character value, added adjustment, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-multiply',
    label: 'character value, multiplied adjustment, a character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'resolved',
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-default',
    label: 'character value, system default, no character chosen',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'no-character',
  }),
  // A kind switch left this kept override invalid (issue 2078); the field itself names it.
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-invalid',
    label: 'character value, a kept override invalid for its kind',
    field: 'adjustmentOverride',
    frame: 24,
    sees: 'adjustment-invalid',
  }),
  taskOverrideCase({
    id: 'manager-gathering-task-editor-check-count',
    label: 'counting successes, one successes needed stepper',
    field: 'successesOverride',
    frame: 25,
    sees: 'count',
    claim:
      ':has([data-gathering-task-successes-override][placeholder="System default"])' +
      ':has([data-gathering-task-override-kept])',
  }),
]);

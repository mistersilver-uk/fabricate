/**
 * System scope: environments, gathering tasks, their editors and gathering events.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
} from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTasksBrowserView)\.svelte$/,
      // This frame's `expectSelector` is a fact of the task inspector, which issue 1707 phase 2
      // moved out of the root: without this the leaf publishes environment-editor frames instead.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringTaskInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'gathering-task-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
    ],
  }),
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
            '[data-gathering-task-id="sm-task-prospect"] .manager-icon-button[aria-label^="Edit"]',
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
      sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/],
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
    // Stops ON the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="sm-task-prospect"] .manager-icon-button[aria-label^="Edit"]',
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
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
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
    // Stops ON the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      { selector: '[data-economy-mode-option="stamina"]' },
      { selector: '[data-economy-stamina-max]', fill: '12' },
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
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
      /^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/,
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
              ' .manager-icon-button[aria-label^="Edit"]',
          },
          ...(kind === 'task'
            ? [
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
          /^src\/ui\/svelte\/apps\/manager\/Gathering(TaskEditView|EventEditView)\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-task-results="straight"] [data-recipe-result-item]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
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
            '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
        },
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
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="1"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="0"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-availability]', scroll: true },
      { selector: '[data-gathering-task-field="biomes"] .manager-condition-menu-button' },
    ],
    expectView: 'gathering-task-edit',
    // The portaled panel and an option inside it: either alone is satisfied by a state this case is not about.
    expectSelector:
      '.fabricate-manager .manager-travel-popover [data-gathering-task-availability-option="biomes"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Gathering(EventEditView|TaskEditView)\.svelte$/,
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      // At 1000px the library stacks, so the scroll to reach Edit carries into the editor's own container.
      { selector: '[data-gathering-task-core-editor]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // 1000x720, the width its smoke counterpart stacks at; 1280x820 was the normal geometry.
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
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
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'environment-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/],
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
            '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
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
        /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentOverviewTab\.svelte$/,
      ],
    });
  }),
  // The environment editor's first open-panel frame (issue 1510), and the first ticked one in the
  // registry — so it is also where the tick gutter's bite out of the panel width is visible.
  managerCase({
    id: 'manager-environment-danger-level-list',
    label: 'Manager — Environment danger level list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops ON the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
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
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
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
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // The facts this case exists to show are computed and rendered here.
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
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
          '[data-gathering-event-id="hb-event-wolves"] .manager-icon-button[aria-label^="Edit"]',
      },
      // The danger pills into frame (issue 1515).
      { selector: '[data-gathering-event-danger-pills]', scroll: true },
    ],
    expectView: 'gathering-event-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
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
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-drop-id="hb-slowbloom-drop"]' },
      { selector: '[data-gathering-drop-condition-modifiers="biome"]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // The drop half of the shared modifier panel, which no other case in the registry reaches.
    expectSelector:
      '.fabricate-manager .manager-inspector [data-gathering-drop-condition-modifiers="biome"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringModifierEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringTaskInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
]);

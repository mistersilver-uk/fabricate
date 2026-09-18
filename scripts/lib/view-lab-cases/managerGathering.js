/**
 * System scope: environments, gathering tasks, their editors and gathering events.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
} from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  // The state it would show — one section inherited with its value card locked and one overridden
  // beside it — is reached by flipping an inherit switch, and in the View Lab that write does not
  // reach the screen: the toggle renders and clicks, and neither its own state chip nor the value
  // card beneath it changes.
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
    ],
  }),
  managerCase({
    id: 'manager-gathering-tasks-browse-normal',
    label: 'Manager — Gathering tasks browse normal',
    // Beyond the smoke: `screenshotCaptureMap.js` carries the two task-EDITOR labels and nothing
    // for the library that lists them, so there is no smoke routine to name.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The tasks library is a SECTION of the environments route, exactly as the events library is
    // (`EnvironmentsBrowserView.svelte:1111` renders `GatheringTasksBrowserView`), so the route
    // key stays `environments` and the second step moves the section rather than the route.
    steps: ['Gathering', { selector: '#manager-gathering-nav-tasks' }],
    expectView: 'environments',
    // The inspector fact, which needs no click to populate: `selectedGatheringTaskId` falls back to
    // `gatheringTaskDefinitions[0]?.id` over the declaration-ordered library, so the browse opens
    // on `hb-task-forage`.
    expectSelector: '.fabricate-manager [data-gathering-task-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTasksBrowserView)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-normal',
    label: 'Manager — Gathering task editor normal',
    smokeLabels: ['manager-gathering-task-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a submenu, so reaching the task library is two clicks:
    // `Gathering` opens the group on Environments, then the `tasks` subitem switches the section.
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
        { selector: '[data-gathering-task-node-respawn]', select: 'overTime' },
        { selector: '[data-gathering-task-node-interval]', fill: '1440' },
        { selector: '[data-gathering-task-nodes]', scroll: true },
      ],
      expectView: 'gathering-task-edit',
      expectSelector: '[data-gathering-task-node-respawn] option[value="overTime"]:checked',
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
    // Beyond the smoke: no smoke routine opens an availability menu, so there is no counterpart
    // frame of this state and no label to name.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // `hb-task-slowbloom` authors `biomes: ['mountain']` against a four-entry biome vocabulary, so
    // the menu opens on the three still-unselected biomes rather than on the empty state.
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
    // The portaled panel, and an option inside it. Asserting the option alone would be satisfied by
    // the old in-place menu; asserting the popover alone would be satisfied by an empty one.
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
      // At 1000px the task library stacks, so Playwright has to scroll the panel to reach the row's
      // Edit control — and the editor then mounts into a container that kept that scroll offset,
      // framing "Required Tools" instead of the identity card.
      { selector: '[data-gathering-task-core-editor]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // 1000x720, the width its smoke counterpart stacks at — the previous 1280x820 was the
    // NORMAL geometry, so the two cases differed in nothing at all.
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
    // The environment editor's Overview tab — identity, context, player-facing behaviour and
    // composition mode, with the summary/linked-scene/validation/runtime inspector beside it.
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
            { selector: `${fields[index]} select`, select: id },
            { selector: remove, press: 'Space' },
          ];
        }),
        { selector: context, scroll: true },
      ],
      expectView: 'environment-edit',
      expectSelector: `.fabricate-manager${emptyFields.map((selector) => `:has(${selector})`).join('')}`,
      expectVisible: context,
      expectNoHorizontalOverflow: context,
      expectContained: [...emptyFields, ...fields.map((field) => `${field} select`)].map(
        (target) => ({ container: '.manager-main', target })
      ),
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentOverviewTab\.svelte$/,
      ],
    });
  }),
  managerCase({
    id: 'manager-environment-edit-events',
    label: 'Manager — Environment edit Events tab',
    smokeLabels: ['manager-environment-edit-events'],
    // `exact`: the smoke's own walk clicks this tab and photographs it without selecting anything,
    // and so does this.
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
    // The route survives a tab click that did nothing, so the assertion names the tab panel AND the
    // inspector the auto-selection populates.
    expectSelector:
      '.fabricate-manager:has([data-environment-tab="events"] .manager-environment-comp-row.is-selected)' +
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
    // `encounters`, not `events`: the nav item's id is the route key, and the label is the only
    // place the word "Events" appears.
    steps: ['Gathering', { selector: '#manager-gathering-nav-encounters' }],
    // The events library is a SECTION of the environments route, so the route key is unchanged;
    // the section is what the second step moves.
    expectView: 'environments',
    // The inspector fact, pinned because it is the only evidence that the event browser calls
    // `activeEnvironmentsForRecord` correctly (issue 1321): the seam's own suite proves the return
    // value, and the caller is an unexported component local no unit test can reach.
    expectSelector: '.fabricate-manager [data-gathering-event-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // The facts this case exists to show are computed and rendered here.
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
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
    ],
  }),
]);

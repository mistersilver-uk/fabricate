/** The environment routes: the browser, the v2 editor and its validation surfaces. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import {
  railCounts as sharedRailCounts,
  tallyMatchingRail as sharedTallyMatchingRail,
} from '../helpers/validationSurfaceReadings.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import {
  createManagerQueries,
  waitForQueuedAnnouncement,
} from '../helpers/manager/managerQueries.js';
import {
  assertDropComponentCellKeyboardPath,
  managerComponents,
  settleBetweenTests,
} from './manager-mounted-shared.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  closeSelectPanel,
  openSelectPanel,
  selectOptionLabels,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';

let Component;
let EnvironmentEditViewComponent;
let GatheringModifierEditorComponent;
let GatheringTaskInspectorComponent;
let GatheringEventInspectorComponent;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  assertHeaderBackIsGhost,
  gatheringSubitem,
  gatheringToggle,
  navButton,
  rowMenuCommands,
  runRowMenuCommand,
} = queries;

/** A gathering task or event toolbar filter, addressed by the caption id that names it. */
const gatheringFilter = (browser, axis) =>
  `[data-gathering-${browser}-browser] .fabricate-select-trigger[aria-labelledby$="-${axis}-filter"]`;

/**
 * A stand-in shell for ONE subject: it answers the panel's readers and, like the real shell,
 * persists a picked character modifier before the panel is rendered again (issue 1707).
 */
function modifierEditorShell(subject, attached = []) {
  const picked = [];
  const refs = [];
  const keydowns = [];
  return {
    picked,
    keydowns,
    props: {
      subject,
      row: { id: `${subject}-1`, conditionModifiers: {}, characterModifiers: refs },
      idPrefix: `${subject}-${subject}-1`,
      suggestions: [{ id: 'mod-training', label: 'Herbalism Training', icon: 'fa-solid fa-leaf' }],
      characterModifierLibrary: [{ id: 'mod-training', label: 'Herbalism Training' }],
      gatheringConditionAvailableOptions: () => [{ id: 'forest', label: 'Forest' }],
      gatheringConditionModifierRows: (_row, kind) =>
        attached.filter((modifier) => modifier.kind === kind),
      gatheringConditionLabel: (_kind, conditionId) => `label:${conditionId}`,
      gatheringModifierValueClass: (modifier) => `is-${modifier.sign}`,
      gatheringModifierDisplayValue: (modifier) => modifier.display,
      gatheringModifierKindIcon: () => 'fas fa-mountain-sun',
      onConditionModifierKeydown: (kind, modifier, event) =>
        keydowns.push([kind, modifier.id, event.key]),
      gatheringModifierCardTitle: (kind, scope) => `${kind}/${scope}`,
      gatheringModifierCardHint: (kind, scope) => `${kind}/${scope} hint`,
      rowCharacterModifiers: () => refs,
      characterModifierLabelForRef: (ref) => ref.modifierId,
      characterModifierLibraryEntry: () => ({ id: 'mod-training', expression: '@skills.nat.total' }),
      onPickCharacterModifier: (modifierId) => {
        picked.push(modifierId);
        refs.push({ id: `ref-${modifierId}`, modifierId, operator: '+' });
      },
    },
  };
}

/** Mount the shared panel for one subject and return its root element. */
function mountModifierEditor(props) {
  target?.remove();
  target = document.createElement('div');
  document.body.appendChild(target);
  if (mounted) unmount(mounted);
  mounted = mount(GatheringModifierEditorComponent, { target, props });
  flushSync();
  return target;
}

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerEnvironmentsCases() {
  before(async () => {
    ({
      Component,
      EnvironmentEditViewComponent,
      GatheringModifierEditorComponent,
      GatheringTaskInspectorComponent,
      GatheringEventInspectorComponent,
    } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });

  /** Mount on the Gathering route, with a switch for the selected system's gathering feature. */
  async function mountGatheringToggle(storeOptions = {}) {
    const store = createStore([], storeOptions);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    const settle = async () => {
      await tick();
      flushSync();
    };
    const setGathering = async (enabled) => {
      store.viewState.update((state) => ({
        ...state,
        selectedSystem: {
          ...state.selectedSystem,
          features: { ...state.selectedSystem.features, gathering: enabled },
        },
      }));
      await settle();
    };
    const openSection = async (label) => {
      gatheringSubitem(label).click();
      await settle();
    };
    navButton('Gathering').click();
    await settle();
    return { setGathering, openSection, settle };
  }

  // Off every gathering route the tab returns to Environments, so a workspace switched back on
  // opens on its first tab rather than the one the GM left.
  it('reopens a re-enabled gathering workspace on its environments tab', async () => {
    const { setGathering, openSection } = await mountGatheringToggle();
    const view = () => target.querySelector('.fabricate-manager').dataset.managerView;
    const tasksBrowser = () => target.querySelector('[data-gathering-tasks-browser]');

    await openSection('Tasks');
    assert.ok(Boolean(tasksBrowser()), 'pre-condition: the GM is on the Tasks tab');

    await setGathering(false);
    assert.equal(view(), 'systems', 'with gathering off the route falls back to the library');
    await setGathering(true);
    assert.equal(view(), 'environments', 'switched back on, the same route returns');
    assert.ok(!tasksBrowser(), 'on its environments tab');
  });

  // A workspace switched off clears both library selections, so each library it reopens selects
  // its first entry rather than the one the GM left.
  it('reselects the first task and event once a re-enabled workspace reopens', async () => {
    const { setGathering, openSection, settle } = await mountGatheringToggle({
      gatheringLibraryEvents: [
        { id: 'event-owl', name: 'Owl Omen', enabled: true, dropRate: 10 },
        { id: 'event-rockfall', name: 'Rockfall', enabled: true, dropRate: 20 },
      ],
    });
    const selected = (kind) =>
      target.querySelector(`.manager-gathering-${kind}-row.is-selected`)?.getAttribute(
        `data-gathering-${kind}-id`
      );
    const pick = async (kind, id) => {
      target
        .querySelector(`[data-gathering-${kind}-id="${id}"] .manager-gathering-${kind}-identity`)
        .click();
      await settle();
    };

    await openSection('Tasks');
    await pick('task', 'task-cavern');
    await openSection('Events');
    await pick('event', 'event-rockfall');
    assert.equal(selected('event'), 'event-rockfall', 'pre-condition: the GM picked a second event');

    await setGathering(false);
    await setGathering(true);
    await openSection('Tasks');
    assert.equal(selected('task'), 'task-herbs');
    await openSection('Events');
    assert.equal(selected('event'), 'event-owl');
  });

  // The browse row and the inspector both draw the environment draft the shell hands them.
  it('marks a dirty, invalid environment draft in its row and in the inspector', async () => {
    const store = createStore([]);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    store.viewState.update((state) => ({
      ...state,
      selectedEnvironmentId: 'env-forest',
      environmentDraft: {
        ...state.environments.find((environment) => environment.id === 'env-forest'),
        name: 'Renamed Woods',
        selectionMode: 'blind',
        description: 'a'.repeat(200),
      },
      environmentDraftDirty: true,
      environmentValidationState: { errors: ['one', 'two'] },
    }));
    await tick();
    flushSync();

    const row = target.querySelector('[data-environment-id="env-forest"]');
    assert.ok(row.textContent.includes('Renamed Woods'), 'the row shows the dirty draft');
    assert.ok(row.textContent.includes('Unsaved') && row.textContent.includes('Invalid'));
    const inspector = target.querySelector('.manager-inspector');
    assert.equal(inspector.querySelector('.manager-inspector-name').textContent.trim(), 'Renamed Woods');
    assert.ok(inspector.textContent.includes('Blind'), 'the selection mode chip');
    assert.ok(inspector.textContent.includes('Unsaved'), 'the draft-state card');
    assert.ok(inspector.textContent.includes('2 validation issues'));
    assert.ok(
      inspector.textContent.includes(`${'a'.repeat(160)}…`) &&
        !inspector.textContent.includes('a'.repeat(161)),
      'the inspector cuts a long description at 160 characters'
    );
  });

  it('offers the realm field in the environment editor only with Travel & Realms on', async () => {
    for (const enabled of [true, false]) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore([], { gatheringRealmsEnabled: enabled }),
          services: { openCurrentAdmin: () => {} },
        },
      });
      flushSync();
      navButton('Gathering').click();
      await tick();
      flushSync();
      target
        .querySelector('[data-environment-id="env-forest"] .manager-icon-button[aria-label^="Edit"]')
        .click();
      await tick();
      flushSync();
      assert.equal(
        Boolean(target.querySelector('[data-environment-field="includedRealmIds"]')),
        enabled,
        `the realm field follows Travel & Realms (${enabled})`
      );
      unmount(mounted);
      mounted = null;
      target.remove();
    }
  });

  // A party's realm override needs the selected system's gathering and its Travel & Realms.
  it('gates the party realm override on the selected system’s Travel & Realms', async () => {
    for (const enabled of [true, false]) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore([], { gatheringRealmsEnabled: enabled }),
          services: { openCurrentAdmin: () => {} },
        },
      });
      flushSync();
      target.querySelector('#manager-world-nav-parties').click();
      await tick();
      flushSync();
      const lock = target.querySelector('[data-party-realm-override-unavailable]');
      assert.equal(Boolean(target.querySelector('.manager-travel-parties-override-trigger')), enabled);
      assert.equal(
        Boolean(lock?.textContent.includes('Enable Travel & Realms in this system')),
        !enabled,
        'and a system without it says why'
      );
      unmount(mounted);
      mounted = null;
      target.remove();
    }
  });

  // The rules leaf's own controls (issue 1707 phase 2). Every one of the ten selects and both
  // steppers write through one `onUpdate` prop; before this case nothing anywhere changed one, so
  // dropping the prop rendered the whole column inert and shipped green.
  it('persists a Gathering Rules select, and the stepper the chosen mode reveals', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();

    const card = target.querySelector('.manager-inspector [data-gathering-inspector-rules]');
    assert.ok(Boolean(card), 'the settings tab renders the Gathering Rules card in the inspector');
    assert.ok(
      Boolean(card.querySelector('.manager-rule-copy')),
      'each rule row stacks its description beside the icon'
    );
    const scope = card.querySelector('#manager-gathering-rule-reveal-scope');
    scope.value = 'party';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.findLast((call) => call[0] === 'updateGatheringRules'),
      ['updateGatheringRules', 'alchemy', { revealScope: 'party' }],
      'the select writes its own field for the selected system, and only that field'
    );

    assert.ok(!card.querySelector('[data-gathering-rule-stepper="rewardLimit"]'));
    const rewards = card.querySelector('#manager-gathering-rule-rewards');
    rewards.value = 'limitedDrops';
    rewards.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.findLast((call) => call[0] === 'updateGatheringRules'),
      ['updateGatheringRules', 'alchemy', { rewardSelectionMode: 'limitedDrops' }],
      'the rewards select writes the mode that reveals the limit stepper'
    );

    const stepper = card.querySelector('[data-gathering-rule-stepper="rewardLimit"]');
    assert.ok(Boolean(stepper), 'choosing the limited mode reveals the reward-limit stepper');
    [...stepper.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === 'Increase reward limit')
      .click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.findLast((call) => call[0] === 'updateGatheringRules'),
      ['updateGatheringRules', 'alchemy', { rewardLimit: 2 }],
      'the revealed stepper writes the limit itself through the same one prop'
    );
  });

  // The environments toolbar's four filters (issue 1510). None carries a `data-*` hook, so each is
  // addressed by the `aria-label` its `<select>` carried and the trigger keeps — the demoted
  // caption was never its accessible name.
  it('narrows the environments library through the four converted toolbar filters', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore([]), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();

    const filter = (axis) => `.fabricate-select-trigger[aria-label="Filter environments by ${axis}"]`;
    const rows = () =>
      [...target.querySelectorAll('.manager-environment-row')].map((row) =>
        row.getAttribute('data-environment-id')
      );
    assert.deepEqual(rows(), ['env-forest', 'env-cavern'], 'both fixture environments list');

    for (const [axis, values, labels, ticked] of [
      [
        'status',
        ['all', 'active', 'disabled', 'dirty', 'invalid'],
        ['All environments', 'Active', 'Disabled', 'Unsaved', 'Invalid'],
        true,
      ],
      ['selection mode', ['all', 'targeted', 'blind'], ['All modes', 'Targeted', 'Blind'], false],
      [
        'risk',
        ['all', 'safe', 'hazardous', 'unsafe', 'extreme'],
        ['All risks', 'Safe', 'Hazardous', 'Unsafe', 'Extreme'],
        true,
      ],
      ['biome', ['all', 'cavern', 'forest'], ['All biomes', 'Cavern', 'Forest'], true],
    ]) {
      assert.equal(
        assertSelectHasResolvedName(target, filter(axis)),
        `Filter environments by ${axis}`
      );
      assert.deepEqual(selectOptionValues(target, filter(axis)), values);
      assert.deepEqual(selectOptionLabels(target, filter(axis)), labels);
      assert.equal(
        openSelectPanel(target, filter(axis)).classList.contains('fabricate-select-popover-ticked'),
        ticked,
        `the ${axis} list ${ticked ? 'keeps' : 'drops'} its tick column`
      );
      assert.equal(
        target.querySelector(filter(axis)).closest('.manager-filter').tagName,
        'SPAN',
        'the caption is a demoted `<span>`: inside a `<label>` its own mousedown would dismiss ' +
          'the panel and the forwarded click would re-open it'
      );
      closeSelectPanel(target, filter(axis));
    }

    const narrowsTo = async (axis, value, expected) => {
      chooseSelectOption(target, filter(axis), value);
      await tick();
      flushSync();
      assert.deepEqual(rows(), expected, `the ${axis} filter narrowed to ${value}`);
      chooseSelectOption(target, filter(axis), 'all');
      await tick();
      flushSync();
    };
    await narrowsTo('status', 'disabled', ['env-cavern']);
    await narrowsTo('selection mode', 'targeted', ['env-forest']);
    await narrowsTo('risk', 'safe', ['env-forest', 'env-cavern']);
    await narrowsTo('risk', 'hazardous', []);
    await narrowsTo('biome', 'forest', ['env-forest']);
    assert.equal(selectTriggerText(target, filter('biome')), 'All biomes');
  });

  it('sets the current time and weather through the conditions card pickers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();

    const picker = (kind) =>
      `[data-gathering-condition-panel="${kind}"] .manager-condition-current .fabricate-select-trigger`;
    // The caption names the trigger through its id, and the field is a `<div>` rather than the
    // `<label>` it was (issue 1510).
    assert.equal(assertSelectHasResolvedName(target, picker('timeOfDay')), 'Current time');
    assert.equal(assertSelectHasResolvedName(target, picker('weather')), 'Current weather');
    assert.ok(!target.querySelector('label.manager-condition-current'));
    assert.equal(selectTriggerText(target, picker('timeOfDay')), 'High Day');
    assert.deepEqual(selectOptionLabels(target, picker('timeOfDay')), [
      'First Light',
      'High Day',
      'Deep Night',
    ]);
    closeSelectPanel(target, picker('timeOfDay'));
    assert.deepEqual(selectOptionValues(target, picker('weather')), ['clear', 'heavy-rain']);
    closeSelectPanel(target, picker('weather'));

    chooseSelectOption(target, picker('weather'), 'heavy-rain');
    await tick();
    assert.deepEqual(calls.filter((call) => call[0] === 'updateGatheringConditions'), [
      ['updateGatheringConditions', { weather: 'heavy-rain', systemId: 'alchemy' }],
    ]);
  });

  // The gathering task and event toolbars' six filters (issue 1510), each trigger named by its own
  // caption through an instance-scoped id.
  for (const [browser, subitem, axes, library] of [
    [
      'tasks',
      'Tasks',
      [
        ['status', 'Status', ['all', 'active', 'disabled'], false],
        ['biome', 'Biome', ['all', 'cavern', 'forest'], true],
        ['availability', 'Availability', ['all', 'any', 'current', 'mismatch'], true],
      ],
      undefined,
    ],
    [
      'events',
      'Events',
      [
        ['status', 'Status', ['all', 'active', 'disabled'], false],
        ['biome', 'Biome', ['all', 'cavern', 'forest'], true],
        [
          'danger',
          'Danger',
          ['all', 'safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'],
          true,
        ],
      ],
      [
        { id: 'event-owl', name: 'Owl Omen', enabled: true, biomes: ['forest'], dangerTags: [] },
        {
          id: 'event-rockfall',
          name: 'Rockfall',
          enabled: false,
          biomes: ['cavern'],
          dangerTags: ['deadly'],
        },
      ],
    ],
  ]) {
    it(`names and drives the gathering ${browser} toolbar's three converted filters`, async () => {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore([], { gatheringLibraryEvents: library }),
          services: { openCurrentAdmin: () => {} },
        },
      });
      flushSync();
      navButton('Gathering').click();
      await tick();
      flushSync();
      gatheringSubitem(subitem).click();
      await tick();
      flushSync();

      for (const [axis, caption, values, ticked] of axes) {
        const filter = gatheringFilter(browser, axis);
        assert.equal(assertSelectHasResolvedName(target, filter), caption);
        assert.ok(!target.querySelector(filter).hasAttribute('aria-label'));
        assert.deepEqual(selectOptionValues(target, filter), values);
        assert.equal(
          openSelectPanel(target, filter).classList.contains('fabricate-select-popover-ticked'),
          ticked,
          `the ${browser} ${axis} list ${ticked ? 'keeps' : 'drops'} its tick column`
        );
        assert.equal(
          target.querySelector(filter).closest('.manager-filter').tagName,
          'SPAN',
          'the caption is a demoted `<span>`: inside a `<label>` its own mousedown would dismiss ' +
            'the panel and the forwarded click would re-open it'
        );
        closeSelectPanel(target, filter);
      }
      if (browser === 'tasks') {
        assert.deepEqual(selectOptionLabels(target, gatheringFilter('tasks', 'biome')), [
          'All biomes',
          'Crystal Cavern',
          'Moon Forest',
        ]);
        closeSelectPanel(target, gatheringFilter('tasks', 'biome'));
      }

      const rows = () =>
        [...target.querySelectorAll(`[data-gathering-${browser}-browser] [role="listitem"]`)].map(
          (row) => row.getAttribute(`data-gathering-${browser.slice(0, -1)}-id`)
        );
      const everyRow = rows();
      for (const [axis, value] of [
        ['status', 'disabled'],
        ['biome', 'forest'],
        [axes[2][0], browser === 'tasks' ? 'current' : 'deadly'],
      ]) {
        chooseSelectOption(target, gatheringFilter(browser, axis), value);
        await tick();
        flushSync();
        assert.ok(
          rows().length > 0 && rows().length < everyRow.length,
          `the ${browser} ${axis} filter narrowed ${everyRow.join(', ')} to ${rows().join(', ')}`
        );
        chooseSelectOption(target, gatheringFilter(browser, axis), 'all');
        await tick();
        flushSync();
        assert.deepEqual(rows(), everyRow, `the ${axis} filter restored every row`);
      }
    });
  }

  it('routes to the environments browser and opens the forced v2 editor route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 2);
    assert.ok(target.textContent.includes('Gathering environments'));
    assert.ok(target.textContent.includes('Moonlit Forest'));
    assert.ok(target.textContent.includes('Quiet Cavern'));
    const gatheringParent = target.querySelector('#manager-nav-gathering');
    assert.equal(gatheringParent.getAttribute('aria-expanded'), 'true');
    assert.equal(gatheringParent.classList.contains('is-active'), false);
    // The Crafting group also renders (unconditional as of issue 745).
    assert.equal(
      gatheringParent.closest('.manager-nav-group').classList.contains('is-expanded'),
      true
    );
    // The parent count is the sum of records (environments + tasks + events).
    assert.equal(gatheringParent.querySelector('.manager-nav-count').textContent.trim(), '5');
    assert.equal(gatheringToggle().getAttribute('aria-label'), 'Collapse gathering menu');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Events', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(
        (item) => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null
      ),
      ['2', '3', '0', null]
    );
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelectorAll('.manager-gathering-tab').length, 0);

    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.equal(
      target
        .querySelector('#manager-nav-gathering')
        .closest('.manager-nav-group')
        .classList.contains('is-expanded'),
      true
    );

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.equal(
      target.querySelector('#manager-nav-gathering').classList.contains('is-active'),
      false
    );
    assert.equal(gatheringSubitem('Tasks').classList.contains('is-active'), true);
    target.querySelector('#manager-nav-gathering').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.equal(gatheringSubitem('Tasks').classList.contains('is-active'), true);
    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 3);
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    const tasksHead = target.querySelector('.manager-gathering-task-table-head');
    assert.equal(tasksHead.getAttribute('aria-hidden'), 'true');
    const taskHeaders = Array.from(tasksHead.querySelectorAll('span')).map((node) =>
      node.textContent.trim()
    );
    assert.equal(taskHeaders.length, 4, 'task list should have four column labels');
    assert.deepEqual(taskHeaders, ['Gathering task', 'Tags', 'Status', 'Actions']);
    assert.equal(
      target.querySelectorAll('.manager-gathering-tasks-table[role="list"]').length,
      1,
      'the gathering task browser is a list, not a table (issue 1515)'
    );
    assert.equal(target.querySelectorAll('.manager-gathering-task-row[role="listitem"]').length, 3);
    const firstTaskRow = target.querySelector('.manager-gathering-task-row');
    const tagsCell = firstTaskRow.querySelector(
      '.manager-gathering-task-tags-cell[data-gathering-task-tags]'
    );
    assert.ok(tagsCell, 'tags chip cell renders as its own grid cell');
    // BY THE FACET HOOK, NOT BY A VARIANT CLASS (issue 1515). The three facet chips render
    // through the shared `Chip` now, whose face is a `tone` or a `tint` rather than an
    // `is-<facet>` class of the retired availability family, so the row's own data hook is what
    // says which dimension each chip states.
    const tagPills = Array.from(tagsCell.querySelectorAll('.manager-chip[data-gathering-task-tag]'));
    const tagKinds = new Set(
      tagPills.map((pill) => pill.getAttribute('data-gathering-task-tag'))
    );
    assert.equal(
      tagKinds.size,
      3,
      'tags row should contain chips from all composition dimensions (biome/time/weather); region is geography, not composition'
    );
    const description = firstTaskRow.querySelector(
      '.manager-gathering-task-identity .manager-system-description'
    );
    assert.ok(
      description && description.textContent.trim().length > 0,
      'short description should render under the task name'
    );
    assert.ok(
      target
        .querySelector('[data-gathering-task-inspector]')
        .textContent.includes('Selected gathering task')
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Gathering task actions'),
      false,
      'selected gathering task inspector should not duplicate row actions'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Edit Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render edit action buttons'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Duplicate Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render duplicate action buttons'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Delete Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render delete action buttons'
    );
    assert.equal(
      target.querySelector('[data-gathering-task-inspector] .manager-action-group'),
      null,
      'selected gathering task identity card should not contain an action group'
    );
    const dropChips = target.querySelectorAll(
      '[data-task-drops-summary] [data-task-drop-summary-chip]'
    );
    assert.ok(
      Array.from(dropChips).some(
        (chip) =>
          chip.textContent.includes(
            'Nightshade With An Exceptionally Long Localized Component Name'
          ) && chip.textContent.includes('80%')
      ),
      'drops summary should show the nightshade drop name + chance'
    );
    assert.equal(
      target.querySelector('[data-gathering-task-fact="environments"] strong').textContent.trim(),
      '1'
    );
    // Region is no longer a composition fact in the task inspector.
    assert.equal(
      target.querySelector('[data-gathering-task-fact="region"]'),
      null,
      'region fact is removed from the task inspector'
    );
    // A user-defined biome keeps its contextual label inline (e.g. "2 Biome").
    const taskBiomeFact = target.querySelector('[data-gathering-task-fact="biomes"]');
    assert.ok(
      taskBiomeFact.querySelector('.manager-fact-label'),
      'a user-defined biome count should keep its contextual label'
    );
    assert.ok(
      Boolean(target.querySelector('[data-task-environment-usage-chips]')),
      'Gather Moon Herbs is referenced by env-forest, so its card renders chips'
    );

    // Prospect Crystal Veins is referenced by no environment, so selecting it flips the same
    // card to its empty state (issue 1707 phase 2 review).
    target.querySelector('[data-gathering-task-id="task-cavern"] .manager-gathering-task-identity').click();
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector('[data-task-environment-usage-empty]')),
      'Prospect Crystal Veins is unreferenced, so its card renders the empty state'
    );
    target.querySelector('[data-gathering-task-id="task-herbs"] .manager-gathering-task-identity').click();
    await tick();
    flushSync();

    const taskSearch = target.querySelector('[data-gathering-tasks-browser] input[type="search"]');
    taskSearch.value = 'crystal';
    taskSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    chooseSelectOption(target, gatheringFilter('tasks', 'status'), 'disabled');
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('South Coast Driftwood'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    chooseSelectOption(target, gatheringFilter('tasks', 'biome'), 'cavern');
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    chooseSelectOption(target, gatheringFilter('tasks', 'availability'), 'mismatch');
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 2);

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] .manager-status-toggle').click();
    await runRowMenuCommand('[data-gathering-task-id="task-herbs"]', 'Duplicate gathering task');
    await runRowMenuCommand('[data-gathering-task-id="task-herbs"]', 'Delete gathering task');
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          call[3].enabled === false
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'duplicateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'deleteGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      )
    );

    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    target.querySelector('#manager-nav-gathering').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.ok(target.querySelector('[data-gathering-task-editor]'));
    assertHeaderBackIsGhost('[data-gathering-task-back]', 'gathering-task-edit');
    const coreEditor = target.querySelector('[data-gathering-task-core-editor]');
    assert.ok(coreEditor);
    assert.equal(coreEditor.querySelector('.manager-link-button'), null);
    assert.equal(coreEditor.textContent.includes('Back to task library'), false);
    assert.ok(target.textContent.includes('Task Identity'));
    assert.equal(target.textContent.includes('Internal ID'), false);
    assert.ok(
      target.textContent.includes(
        'Edit identity, availability, resolution, and results for the selected gathering task.'
      )
    );
    assert.ok(target.querySelector('[data-gathering-task-drops-table]'));
    assert.ok(target.querySelector('[data-gathering-task-drop-inspector]'));
    const dropInspector = target.querySelector('[data-gathering-task-drop-inspector]');
    const dropInspectorChildren = Array.from(dropInspector.children);
    assert.ok(dropInspectorChildren[0].classList.contains('manager-drop-editor-header-card'));
    assert.equal(dropInspectorChildren[0].classList.contains('is-sticky'), false);
    assert.ok(dropInspectorChildren[1].classList.contains('manager-drop-inspector-divider'));
    assert.ok(dropInspectorChildren[2].classList.contains('manager-drop-inspector-scroll'));
    assert.ok(dropInspectorChildren[2].querySelector('.manager-drop-editor-card'));
    assert.ok(dropInspectorChildren[2].querySelector('[data-gathering-drop-character-modifiers]'));
    assert.equal(target.querySelector('.manager-task-editor-tabs'), null);
    assert.equal(target.querySelector('[data-gathering-task-summary]'), null);
    assert.equal(target.querySelector('[data-gathering-task-matching-logic]'), null);
    assert.ok(target.textContent.includes('Drop chance'));
    assert.equal(target.querySelector('.manager-task-card-header .manager-drop-count'), null);
    assert.ok(target.querySelector('.manager-task-drop-footer [data-gathering-task-drop-count]'));
    const dropColumnHeaders = Array.from(
      target.querySelectorAll('[data-gathering-task-drops-table] [role="columnheader"]')
    ).map((node) => node.textContent.trim());
    assert.ok(dropColumnHeaders.includes('Count'));
    assert.ok(
      dropColumnHeaders.includes('#'),
      'highestRankedDrop mode should surface the rank column header'
    );
    assert.equal(dropColumnHeaders.includes('Quantity'), false);
    assert.equal(dropColumnHeaders.includes('Actions'), false);
    const populatedDropRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"]'
    );
    assert.equal(populatedDropRow.querySelector('[data-gathering-task-drop-row-number]'), null);
    const populatedComponentCell = populatedDropRow.querySelector(
      '[data-gathering-task-drop-component-cell]'
    );
    const populatedComponentButton = populatedComponentCell.querySelector(
      '.manager-drop-component-button'
    );
    assert.ok(populatedComponentButton);
    // The FILLED branch of the row's keyboard path (issue 1512); the empty branch is asserted in
    // `manager-gathering-mounted.js`, where a freshly added row renders it.
    assertDropComponentCellKeyboardPath(populatedDropRow, {
      empty: false,
      label: 'Nightshade With An Exceptionally Long Localized Component Name',
    });
    const populatedComponentThumb = populatedComponentCell.querySelector(
      '.manager-gathering-task-thumb'
    );
    assert.ok(populatedComponentThumb);
    assert.equal(populatedComponentButton.getAttribute('title'), 'Right-click to clear component');
    assert.ok(
      populatedComponentCell.textContent.includes(
        'Nightshade With An Exceptionally Long Localized Component Name'
      )
    );
    assert.equal(
      populatedComponentCell.querySelector(
        '.manager-drop-component-button .manager-system-description'
      ),
      null
    );
    assert.equal(
      populatedComponentCell.textContent.includes('A dusky flowering herb used in careful doses.'),
      false
    );
    assert.equal(populatedComponentCell.textContent.includes('Unresolved drop'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop component'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(populatedDropRow.textContent.includes('Quantity'), false);
    assert.equal(populatedDropRow.textContent.includes('award'), false);
    const populatedChanceCell = populatedDropRow.querySelector(
      '[data-gathering-task-drop-chance-cell]'
    );
    const dropRateInput = populatedChanceCell.querySelector('.manager-drop-rate-percent input');
    assert.equal(dropRateInput.getAttribute('type'), 'number');
    assert.equal(dropRateInput.getAttribute('min'), '0');
    assert.equal(dropRateInput.getAttribute('max'), '100');
    assert.equal(dropRateInput.value, '80');
    const dropRateControl = populatedChanceCell.querySelector('input[type="range"]').parentElement;
    assert.ok(dropRateControl.classList.contains('manager-drop-rate-control'));
    assert.ok(dropRateControl.classList.contains('is-common'));
    assert.ok(dropRateControl.getAttribute('style').includes('--fab-drop-rate-value: 80%;'));
    assert.ok(
      dropRateControl
        .getAttribute('style')
        .includes('--fab-drop-rate-color: var(--fab-drop-rate-common);')
    );
    dropRateInput.value = '7';
    dropRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(dropRateInput.value, '7');
    const updatedDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    updatedDropRateInput.value = '150';
    updatedDropRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(updatedDropRateInput.value, '100');
    updatedDropRateInput.value = '7';
    updatedDropRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    let stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    const dropRateArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    stepDropRateInput.dispatchEvent(dropRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(dropRateArrowUpEvent.defaultPrevented, true);
    assert.equal(stepDropRateInput.value, '8');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '7');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.value = '100';
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '100');
    stepDropRateInput.value = '0';
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '0');
    const quantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    assert.equal(quantityInput.getAttribute('type'), 'text');
    assert.equal(quantityInput.getAttribute('inputmode'), 'numeric');
    assert.equal(quantityInput.getAttribute('pattern'), '[1-9][0-9]{0,2}');
    assert.equal(quantityInput.value, '2');
    quantityInput.value = 'abc0';
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(quantityInput.value, '');
    quantityInput.value = '03a';
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(quantityInput.value, '3');
    let stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    const quantityArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    stepQuantityInput.dispatchEvent(quantityArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(quantityArrowUpEvent.defaultPrevented, true);
    assert.equal(stepQuantityInput.value, '4');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '3');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '999';
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '999');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '1';
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '1000';
    stepQuantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1000');
    stepQuantityInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1');
    const modifierPills = populatedDropRow.querySelectorAll('.manager-drop-modifier-pill');
    assert.equal(modifierPills.length, 4);
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-negative') &&
          pill.textContent.includes('Moon Forest') &&
          pill.textContent.includes('-10%')
      ),
      'biome drop modifiers should render in the row'
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-positive') &&
          pill.textContent.includes('Deep Night') &&
          pill.textContent.includes('+20%')
      )
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-negative') &&
          pill.textContent.includes('Clear Sky') &&
          pill.textContent.includes('-15%')
      )
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-neutral') &&
          pill.textContent.includes('High Day') &&
          pill.textContent.includes('+0%')
      )
    );
    assert.equal(populatedDropRow.querySelector('[aria-label="Duplicate"]'), null);
    assert.equal(populatedDropRow.querySelector('[aria-label="Delete"]'), null);
    const selectedDropInspector = target.querySelector('[data-gathering-task-drop-inspector]');
    const selectedDropActions = selectedDropInspector.querySelector('.manager-drop-editor-actions');
    assert.ok(selectedDropActions);
    assert.ok(
      selectedDropActions.previousElementSibling?.classList.contains('manager-inspector-title-row')
    );
    assert.ok(selectedDropActions.querySelector('[aria-label="Duplicate"]'));
    assert.ok(selectedDropActions.querySelector('[aria-label="Delete"]'));
    assert.equal(selectedDropInspector.textContent.includes('Drop component'), false);
    assert.equal(selectedDropInspector.textContent.includes('Select a component'), false);
    const inspectorRateEditor = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate]'
    );
    assert.ok(inspectorRateEditor.textContent.includes('Drop chance'));
    const inspectorRateInput = inspectorRateEditor.querySelector(
      '.manager-drop-rate-percent input'
    );
    // Issue 883: the inspector renders the shared `ChanceSlider`.
    assert.equal(inspectorRateInput.getAttribute('type'), 'number');
    assert.equal(inspectorRateInput.getAttribute('min'), '0');
    assert.equal(inspectorRateInput.getAttribute('max'), '100');
    assert.equal(inspectorRateInput.value, '0');
    const inspectorRateControl = inspectorRateEditor.querySelector('.manager-drop-rate-control');
    assert.ok(inspectorRateControl.classList.contains('manager-chance-slider-control'));
    assert.ok(inspectorRateControl.classList.contains('is-none'));
    assert.ok(inspectorRateControl.getAttribute('style').includes('--fab-drop-rate-value: 0%;'));
    assert.ok(
      inspectorRateControl
        .getAttribute('style')
        .includes('--fab-drop-rate-color: var(--fab-drop-rate-none);')
    );
    inspectorRateInput.value = '9';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorRateInput.value, '9');
    // Out of range clamps rather than being held un-committed until blur.
    inspectorRateInput.value = '150';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorRateInput.value, '100');
    // Commit-on-blur is preserved: an emptied field reverts to the model value on blur
    // instead of committing an empty rate.
    inspectorRateInput.value = '9';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    inspectorRateInput.value = '';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorRateInput.value, '', 'an emptied field is left alone while editing');
    inspectorRateInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      inspectorRateInput.value,
      '9',
      'blur restores the model value, it does not commit empty'
    );
    let refreshedInspectorRateInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
    );
    const inspectorRateArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    refreshedInspectorRateInput.dispatchEvent(inspectorRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(inspectorRateArrowUpEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorRateInput.value, '10');
    refreshedInspectorRateInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
    );
    refreshedInspectorRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(refreshedInspectorRateInput.value, '9');
    const inspectorCountEditor = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count]'
    );
    assert.ok(inspectorCountEditor.textContent.includes('Count'));
    const inspectorCountInput = inspectorCountEditor.querySelector('input');
    assert.equal(inspectorCountInput.getAttribute('type'), 'text');
    assert.equal(inspectorCountInput.getAttribute('inputmode'), 'numeric');
    assert.equal(inspectorCountInput.getAttribute('pattern'), '[1-9][0-9]{0,2}');
    assert.equal(inspectorCountInput.value, '1');
    inspectorCountInput.value = '06x';
    inspectorCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorCountInput.value, '6');
    let refreshedInspectorCountInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count] input'
    );
    const inspectorCountArrowDownEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    refreshedInspectorCountInput.dispatchEvent(inspectorCountArrowDownEvent);
    await tick();
    flushSync();
    assert.equal(inspectorCountArrowDownEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorCountInput.value, '5');
    refreshedInspectorCountInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count] input'
    );
    refreshedInspectorCountInput.value = '1000';
    refreshedInspectorCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(refreshedInspectorCountInput.value, '1000');
    refreshedInspectorCountInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(refreshedInspectorCountInput.value, '5');
    assert.equal(populatedDropRow.querySelector('[aria-label="Select drop rule"]'), null);
    assert.equal(populatedDropRow.querySelector('[aria-label="Edit drop rule"]'), null);
    const mediaColumn = coreEditor.querySelector('.manager-task-media-column');
    const taskImagePicker = coreEditor.querySelector('.manager-task-image-picker');
    const taskStatus = coreEditor.querySelector('.manager-task-core-status');
    const taskStatusToggle = taskStatus.querySelector('.manager-status-toggle');
    assert.equal(mediaColumn.firstElementChild, taskImagePicker);
    assert.equal(mediaColumn.children[1], taskStatus);
    assert.equal(taskStatusToggle.tagName, 'BUTTON');
    assert.equal(taskStatusToggle.querySelector('input'), null);
    assert.equal(
      taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(),
      'Off'
    );
    taskStatusToggle.click();
    await tick();
    flushSync();
    assert.equal(
      taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(),
      'On'
    );
    const taskNameInput = target.querySelector('[data-gathering-task-field="name"]');
    assert.equal(
      Boolean(
        taskNameInput.compareDocumentPosition(taskImagePicker) & Node.DOCUMENT_POSITION_PRECEDING
      ),
      true,
      'task name should be positioned after the image column in the core editor'
    );
    taskNameInput.value = 'Gather Sun Herbs';
    taskNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(taskNameInput.value, 'Gather Sun Herbs');
    const biomeAvailability = target.querySelector('[data-gathering-task-field="biomes"]');
    const timeAvailability = target.querySelector('[data-gathering-task-field="timeOfDay"]');
    const weatherAvailability = target.querySelector('[data-gathering-task-field="weather"]');
    // Region is no longer a task availability/composition axis.
    assert.equal(
      target.querySelector('[data-gathering-task-field="regions"]'),
      null,
      'region availability picker is removed from the task editor'
    );
    // What each row is, rather than "not a native select" (issue 1510): this editor renders none
    // at all now, so each of these three read as a claim about any tree. An availability row edits
    // a set — an add menu feeding the chip row beside it — never a picker holding one value.
    for (const field of [timeAvailability, weatherAvailability, biomeAvailability]) {
      const menu = field.querySelector('button.manager-condition-menu-button');
      assert.ok(Boolean(menu), 'each availability row renders its own add-menu trigger');
      assert.equal(menu.getAttribute('aria-haspopup'), 'listbox');
      assert.ok(Boolean(field.querySelector('.manager-chip-row')), 'and the set it adds into');
      assert.ok(
        !field.querySelector('.fabricate-select-trigger'),
        'and no shared one-of-N picker, which holds one value rather than a set'
      );
    }
    const biomePill = biomeAvailability.querySelector(
      '[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"]'
    );
    const timePill = timeAvailability.querySelector(
      '[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"]'
    );
    const weatherPill = weatherAvailability.querySelector(
      '[data-gathering-task-availability-pill="weather"][data-condition-id="clear"]'
    );
    assert.ok(biomePill);
    assert.ok(biomePill.textContent.includes('Moon Forest'));
    assert.ok(biomePill.querySelector('i.fas.fa-tree'));
    assert.ok(timePill);
    assert.ok(timePill.textContent.includes('High Day'));
    assert.ok(timePill.querySelector('i.fas.fa-sun'));
    assert.ok(weatherPill);
    assert.ok(weatherPill.textContent.includes('Clear Sky'));
    assert.ok(weatherPill.querySelector('i.fas.fa-sun'));

    // The three availability add menus are `SearchablePopover`s (issue 1458).
    const availabilityOptions = (kind) =>
      Array.from(document.querySelectorAll(`[data-gathering-task-availability-option="${kind}"]`));
    const availabilityOption = (kind, conditionId) =>
      document.querySelector(
        `[data-gathering-task-availability-option="${kind}"][data-condition-id="${conditionId}"]`
      );
    const availabilityPill = (field, kind, conditionId) =>
      field.querySelector(
        `[data-gathering-task-availability-pill="${kind}"][data-condition-id="${conditionId}"]`
      );
    const availabilityTrigger = (field) =>
      field.querySelector('.manager-condition-menu-button');
    const openAvailabilityMenu = async (field) => {
      availabilityTrigger(field).click();
      await tick();
      flushSync();
    };
    const removeAvailabilityPill = async (field, kind, conditionId) => {
      availabilityPill(field, kind, conditionId)
        .querySelector('[data-chip-remove]')
        .click();
      await tick();
      flushSync();
    };

    await openAvailabilityMenu(biomeAvailability);
    assert.ok(
      !availabilityOption('biomes', 'forest'),
      'the already-selected biome should not be offered again'
    );
    assert.deepEqual(
      availabilityOptions('biomes').map((option) => option.textContent.trim()),
      ['Crystal Cavern']
    );
    assert.ok(availabilityOption('biomes', 'cavern').querySelector('i.fas.fa-gem'));
    availabilityOption('biomes', 'cavern').click();
    await tick();
    flushSync();
    assert.ok(availabilityPill(biomeAvailability, 'biomes', 'cavern'));

    await removeAvailabilityPill(biomeAvailability, 'biomes', 'forest');
    assert.ok(
      !availabilityPill(biomeAvailability, 'biomes', 'forest'),
      'removing a pill should drop the condition'
    );

    await removeAvailabilityPill(biomeAvailability, 'biomes', 'cavern');
    assert.ok(biomeAvailability.textContent.includes('Any Biome'));

    await openAvailabilityMenu(timeAvailability);
    assert.ok(
      !availabilityOption('timeOfDay', 'day'),
      'the already-selected time of day should not be offered again'
    );
    assert.deepEqual(
      availabilityOptions('timeOfDay').map((option) => option.textContent.trim()),
      ['First Light', 'Deep Night']
    );
    assert.ok(availabilityOption('timeOfDay', 'night').querySelector('i.fas.fa-moon'));
    availabilityOption('timeOfDay', 'night').click();
    await tick();
    flushSync();
    assert.ok(availabilityPill(timeAvailability, 'timeOfDay', 'night'));

    await removeAvailabilityPill(timeAvailability, 'timeOfDay', 'day');
    assert.ok(
      !availabilityPill(timeAvailability, 'timeOfDay', 'day'),
      'removing a pill should drop the time of day'
    );

    await openAvailabilityMenu(weatherAvailability);
    assert.ok(
      !availabilityOption('weather', 'clear'),
      'the already-selected weather should not be offered again'
    );
    assert.deepEqual(
      availabilityOptions('weather').map((option) => option.textContent.trim()),
      ['Storm Rain']
    );
    assert.ok(
      availabilityOption('weather', 'heavy-rain').querySelector('i.fas.fa-cloud-showers-heavy')
    );
    availabilityOption('weather', 'heavy-rain').click();
    await tick();
    flushSync();
    assert.ok(availabilityPill(weatherAvailability, 'weather', 'heavy-rain'));

    await removeAvailabilityPill(weatherAvailability, 'weather', 'clear');
    assert.ok(
      !availabilityPill(weatherAvailability, 'weather', 'clear'),
      'removing a pill should drop the weather'
    );

    // Open / dismiss, read through the ARIA contract as well as the DOM. `aria-expanded` is
    // what a screen reader is told and the portaled panel is what a pointer sees, and after a
    // conversion that moved the panel out of this subtree only asserting BOTH distinguishes
    // "the menu closed" from "the menu was never here".
    for (const [field, kind] of [
      [biomeAvailability, 'biomes'],
      [timeAvailability, 'timeOfDay'],
      [weatherAvailability, 'weather'],
    ]) {
      await openAvailabilityMenu(field);
      assert.equal(
        availabilityTrigger(field).getAttribute('aria-expanded'),
        'true',
        'the trigger should announce the menu as expanded'
      );
      assert.ok(
        availabilityOptions(kind).length > 0,
        'picker menu should open on trigger click'
      );
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await tick();
      flushSync();
      assert.equal(
        availabilityTrigger(field).getAttribute('aria-expanded'),
        'false',
        'the trigger should announce the menu as collapsed after an outside mousedown'
      );
      assert.equal(
        availabilityOptions(kind).length,
        0,
        'picker menu should dismiss on outside mousedown'
      );
    }
    const inspectorSlider = target.querySelector(
      '[data-gathering-task-drop-inspector] input[type="range"]'
    );
    inspectorSlider.value = '35';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
      ).value,
      '35'
    );
    const chanceSlider = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"] input[type="range"]'
    );
    chanceSlider.value = '25';
    chanceSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-id="drop-nightshade"] .manager-drop-rate-percent input'
      ).value,
      '25'
    );
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-gathering-task-reward-rule-notice]'));
    const clearableComponentThumb = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"] .manager-gathering-task-thumb'
    );
    assert.ok(clearableComponentThumb);
    const clearComponentEvent = new MouseEvent('mousedown', {
      button: 2,
      bubbles: true,
      cancelable: true,
    });
    clearableComponentThumb.dispatchEvent(clearComponentEvent);
    await tick();
    flushSync();
    assert.equal(clearComponentEvent.defaultPrevented, true);
    const clearedDropRow = target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]');
    assert.ok(clearedDropRow.textContent.includes('No Component'));
    const saveButton = target.querySelector('.manager-header-actions .manager-button.is-primary');
    assert.ok(saveButton, 'gathering task editor should expose a Save button');
    saveButton.click();
    await tick();
    flushSync();
    const savedTaskCall = calls.find(
      (call) =>
        call[0] === 'updateGatheringLibraryTask' &&
        call[1] === 'alchemy' &&
        call[2] === 'task-herbs' &&
        call[3].name === 'Gather Sun Herbs' &&
        call[3].enabled === true
    );
    assert.ok(savedTaskCall, 'Save should persist staged edits in a single call');
    assert.equal(
      savedTaskCall[3].dropRows.find((row) => row.id === 'drop-nightshade')?.dropRate,
      25,
      'Save should persist the ChanceSlider value through the task dropRows payload'
    );
    target.querySelector('.manager-header-actions .manager-button:not(.is-primary)').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');

    gatheringSubitem('Events').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Events').getAttribute('aria-current'), 'page');
    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Events tab should mount the event library browser'
    );
    assert.equal(target.querySelector('.manager-environments-table'), null);
    assert.ok(
      target.querySelector('.manager-inspector').textContent.includes('Select a gathering event'),
      'inspector should show the select-event empty state when no event is selected'
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment'),
      false
    );

    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Settings').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelector('.manager-toolbar'), null);
    assert.equal(target.querySelector('.manager-environments-table'), null);
    // The Gathering tab's page hint is the SHELL's since issue 1515 deleted the browse view's own
    // section header, so it reads the rail record's fallback — which is the one that agrees with
    // `lang/en.json`. The view's own tab table still carries a longer copy for the empty-tab
    // panel; the two tables have disagreed on this string since before this change.
    assert.equal(
      target.querySelector('.manager-header .manager-subtitle').textContent.trim(),
      'Set system-level rules for gathering.'
    );
    assert.equal(target.querySelectorAll('[data-gathering-condition-panel]').length, 2);
    // Region is no longer a vocabulary dimension: only the biome vocabulary panel remains.
    assert.equal(target.querySelectorAll('[data-gathering-vocabulary-panel]').length, 1);
    assert.ok(target.querySelector('[data-gathering-condition-panel="timeOfDay"]'));
    assert.ok(target.querySelector('[data-gathering-condition-panel="weather"]'));
    assert.equal(target.querySelector('[data-gathering-vocabulary-panel="regions"]'), null);
    assert.ok(target.querySelector('[data-gathering-vocabulary-panel="biomes"]'));
    // The Travel & Realms toggle LEFT this tab for a System Settings feature tile beside
    // Currency (issue 1282), because participation in a world-scope subsystem is the same kind
    // of statement Currency's toggle makes.
    assert.ok(!target.querySelector('[data-gathering-realm-toggle-panel]'));
    assert.ok(!target.querySelector('[data-gathering-realm-toggle]'));
    assert.ok(target.textContent.includes('Times of day'));
    assert.ok(target.textContent.includes('Weather conditions'));
    assert.equal(target.textContent.includes('Travel & Realms'), false);
    assert.ok(target.textContent.includes('Biomes'));
    assert.ok(
      target.textContent.includes(
        'These values control current time matching for gathering tasks and events. Click the name of a time of day to edit it.'
      )
    );
    assert.ok(
      target.textContent.includes(
        'These values control weather matching for gathering tasks and events. Click the name of a condition to edit it.'
      )
    );
    assert.ok(
      target.textContent.includes(
        'Environments can have multiple biomes. Left-click the icon to swap it out, right-click to change the colour.'
      )
    );
    assert.equal(target.querySelectorAll('.manager-condition-add input').length, 3);
    assert.equal(
      target.querySelectorAll('.manager-condition-add .essence-icon-picker-trigger.icon-only')
        .length,
      3
    );
    assert.equal(target.querySelectorAll('.manager-color-picker-trigger').length, 1);
    assert.equal(target.querySelectorAll('.manager-condition-add .manager-add-button').length, 3);
    assert.equal(
      Array.from(target.querySelectorAll('.manager-condition-add .manager-add-button')).every(
        (button) => button.textContent.trim() === 'Add'
      ),
      true
    );
    // The three inline `Add` submits carry the PRIMARY role (issue 1118). Each is the create
    // verb of its own little form — the same shape `InlineVocabularyAdd` already paints
    // `manager-button is-primary` — and all three shipped role-less, so they read as the
    // neutral secondary beside the field they complete.
    for (const hook of [
      '[data-gathering-condition-add="timeOfDay"]',
      '[data-gathering-condition-add="weather"]',
      '[data-gathering-vocabulary-add="biomes"]',
    ]) {
      const add = target.querySelector(hook);
      assert.ok(Boolean(add), `the gathering settings tab should render an add control at ${hook}`);
      assert.ok(
        add.classList.contains('fab-manager-button'),
        `${hook} should render through the ManagerButton primitive, not a hand-written class`
      );
      assert.ok(
        add.classList.contains('is-primary'),
        `${hook} should carry the primary role, as the same inline-add shape does elsewhere`
      );
      assert.equal(
        add.getAttribute('type'),
        'submit',
        `${hook} completes its own form, so it must stay a submit rather than a plain button`
      );
    }
    assert.equal(target.textContent.includes('Add time of day'), false);
    assert.equal(target.textContent.includes('Add weather'), false);
    assert.equal(target.textContent.includes('Add region'), false);
    assert.equal(target.textContent.includes('Add biome'), false);
    assert.equal(target.querySelectorAll('[data-gathering-condition-value]').length, 5);
    assert.equal(target.querySelectorAll('.manager-vocabulary-pill').length, 2);
    assert.equal(
      target.querySelectorAll(
        '[data-gathering-vocabulary-panel="biomes"] .manager-biome-combined-trigger'
      ).length,
      2
    );
    assert.equal(target.querySelectorAll('.manager-condition-label-input').length, 7);
    assert.equal(
      target.querySelectorAll('.manager-vocabulary-pill .manager-condition-label-input').length,
      2
    );
    assert.deepEqual(
      Array.from(
        target.querySelectorAll(
          '[data-gathering-condition-panel="weather"] .manager-condition-label-input'
        )
      ).map((input) => input.value),
      ['Clear Sky', 'Storm Rain']
    );
    assert.deepEqual(
      Array.from(
        target.querySelectorAll(
          '[data-gathering-condition-panel="timeOfDay"] .manager-condition-label-input'
        )
      ).map((input) => input.value),
      ['First Light', 'High Day', 'Deep Night']
    );
    const weatherLabelInput = target.querySelector(
      '[data-gathering-condition-value="heavy-rain"] .manager-condition-label-input'
    );
    weatherLabelInput.value = 'Heavy Rainfall';
    weatherLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringConditionValue'),
      [
        'updateGatheringConditionValue',
        'weather',
        'heavy-rain',
        { label: 'Heavy Rainfall' },
        'alchemy',
      ]
    );

    const timeLabelInput = target.querySelector(
      '[data-gathering-condition-value="dawn"] .manager-condition-label-input'
    );
    timeLabelInput.focus();
    timeLabelInput.value = 'Grey Dawn';
    timeLabelInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.deepEqual(calls.filter((call) => call[0] === 'updateGatheringConditionValue').at(-1), [
      'updateGatheringConditionValue',
      'timeOfDay',
      'dawn',
      { label: 'Grey Dawn' },
      'alchemy',
    ]);
    assert.equal(
      target.querySelectorAll(
        '[data-gathering-condition-value] .essence-icon-picker-trigger.icon-only'
      ).length,
      5
    );
    const biomeLabelInput = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-condition-label-input'
    );
    biomeLabelInput.value = 'Old Moon Forest';
    biomeLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringVocabularyValue'),
      [
        'updateGatheringVocabularyValue',
        'biomes',
        'forest',
        { label: 'Old Moon Forest' },
        'alchemy',
      ]
    );
    const biomeIconTrigger = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger'
    );
    biomeIconTrigger.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.essence-icon-picker-popover'));
    target.querySelector('.essence-icon-picker-popover .essence-icon-picker-option').click();
    await tick();
    flushSync();
    assert.equal(
      calls.filter((call) => call[0] === 'updateGatheringVocabularyValue').at(-1)[1],
      'biomes'
    );
    const biomeColorTrigger = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger'
    );
    const managerShell = target.querySelector('.fabricate-manager');
    const managerMain = target.querySelector('.manager-main');
    const originalShellRect = managerShell.getBoundingClientRect;
    const originalMainRect = managerMain.getBoundingClientRect;
    const originalBiomeTriggerRect = biomeColorTrigger.getBoundingClientRect;
    managerShell.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      right: 800,
      bottom: 370,
      width: 700,
      height: 320,
    });
    managerMain.getBoundingClientRect = () => ({
      left: 120,
      top: 60,
      right: 760,
      bottom: 360,
      width: 640,
      height: 300,
    });
    biomeColorTrigger.getBoundingClientRect = () => ({
      left: 140,
      top: 330,
      right: 170,
      bottom: 360,
      width: 30,
      height: 30,
    });
    biomeColorTrigger.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    await tick();
    flushSync();
    const colorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(colorPopover);
    assert.equal(
      colorPopover.closest('.fabricate-manager'),
      managerShell,
      'biome color popover should stay inside the Manager shell overlay layer'
    );
    assert.equal(
      colorPopover.closest('[data-gathering-vocabulary-panel="biomes"]'),
      null,
      'biome color popover should be portaled out of the settings panel'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /bottom:\s*\d+px;/,
      'lower biome color popovers should flip above the trigger when space below is constrained'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /left:\s*40px;/,
      'biome color popover should left-align with the trigger while within the main panel bounds'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /width:\s*220px;/,
      'biome color popover should keep its fixed compact width'
    );
    target.querySelector('[data-manager-color-token="mist"]').click();
    await tick();
    flushSync();
    assert.deepEqual(calls.filter((call) => call[0] === 'updateGatheringVocabularyValue').at(-1), [
      'updateGatheringVocabularyValue',
      'biomes',
      'forest',
      { colorToken: 'mist', customColor: '' },
      'alchemy',
    ]);
    assert.ok(target.querySelector('[data-manager-color-picker-popover]'));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-color-picker-popover]'), null);
    biomeColorTrigger.getBoundingClientRect = () => ({
      left: 760,
      top: 330,
      right: 790,
      bottom: 360,
      width: 30,
      height: 30,
    });
    biomeColorTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    const constrainedColorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(constrainedColorPopover);
    assert.match(
      constrainedColorPopover.getAttribute('style'),
      /left:\s*424px;/,
      'biome color popover should clamp to the Manager main panel right edge'
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-color-picker-popover]'), null);
    managerShell.getBoundingClientRect = originalShellRect;
    managerMain.getBoundingClientRect = originalMainRect;
    biomeColorTrigger.getBoundingClientRect = originalBiomeTriggerRect;
    assert.equal(target.querySelector('.manager-gathering-settings-summary'), null);
    assert.equal(target.querySelector('[data-gathering-rule-fact]'), null);
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes('Choose how rewards are granted.')
    );
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes('Choose how matching events are applied after a gathering roll.')
    );
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes(
          'Decide whether rolling an event still allows the gathering attempt to succeed.'
        )
    );
    const rewardsSelect = target.querySelector('#manager-gathering-rule-rewards');
    const eventsSelect = target.querySelector('#manager-gathering-rule-events');
    assert.deepEqual(
      Array.from(rewardsSelect.options).map((option) => option.textContent.trim()),
      ['Highest ranked successful drop', 'All successful drops', 'Limit successful drops']
    );
    assert.deepEqual(
      Array.from(eventsSelect.options).map((option) => option.textContent.trim()),
      ['Highest ranked triggered event', 'All triggered events', 'Limit triggered events']
    );
    assert.equal(eventsSelect.textContent.includes('Highest ranked successful drop'), false);
    assert.equal(eventsSelect.textContent.includes('All successful drops'), false);
    assert.ok(target.textContent.includes('Gathering succeeds'));
    assert.ok(target.querySelector('.manager-inspector [data-gathering-inspector-rules]'));
    assert.equal(
      target
        .querySelector('.manager-inspector [data-gathering-inspector-rules] h2')
        .textContent.trim(),
      'Rules'
    );
    assert.equal(
      target.querySelectorAll('.manager-inspector [data-gathering-inspector-rules] select').length,
      10
    );
    const dropModifierModeSelect = target.querySelector(
      '#manager-gathering-rule-drop-modifier-mode'
    );
    assert.ok(dropModifierModeSelect, 'drop modifier mode select renders in the rules inspector');
    assert.deepEqual(
      Array.from(dropModifierModeSelect.options).map((option) => option.value),
      ['additive', 'multiplicative']
    );
    assert.deepEqual(
      Array.from(dropModifierModeSelect.options).map((option) => option.textContent.trim()),
      ['Additive (percentage points)', 'Multiplicative (scale by percentage)']
    );
    const eventVisibilitySelect = target.querySelector('#manager-gathering-rule-event-visibility');
    assert.ok(eventVisibilitySelect, 'event visibility select renders in the rules inspector');
    assert.deepEqual(
      Array.from(eventVisibilitySelect.options).map((option) => option.textContent.trim()),
      ['Danger level only', 'Encounter chance', 'Full details']
    );
    assert.equal(target.querySelector('.manager-inspector [data-gathering-rule-stepper]'), null);
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment'),
      false
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 2);

    const environmentTable = target.querySelector('.manager-environments-table');
    assert.equal(
      environmentTable.getAttribute('role'),
      'list',
      'the environments browser is a list, not a table (issue 1515)'
    );
    assert.equal(target.querySelectorAll('.manager-environment-row[role="listitem"]').length, 2);
    assert.equal(environmentTable.querySelectorAll('[role="columnheader"]').length, 0);
    assert.deepEqual(
      Array.from(
        environmentTable.querySelectorAll('.manager-environment-table-head[aria-hidden="true"] span')
      ).map((header) => header.textContent.trim()),
      ['Environment', 'Selection mode', 'Tasks', 'Status', 'Actions']
    );
    assert.equal(environmentTable.textContent.includes('Linked scene'), false);
    assert.equal(environmentTable.textContent.includes('Scene unresolved'), false);
    const forestRow = target.querySelector('[data-environment-id="env-forest"]');
    assert.equal(
      forestRow.querySelector('.manager-environment-task-count').textContent.trim(),
      '1'
    );
    assert.equal(forestRow.textContent.includes('results'), false);
    assert.equal(forestRow.textContent.includes('catalysts'), false);
    assert.equal(forestRow.querySelector('.manager-environment-task-count.manager-chip'), null);
    assert.ok(forestRow.querySelector('.manager-status-toggle'));
    assert.ok(forestRow.querySelector('.manager-environment-action-grid'));
    assert.ok(forestRow.querySelector('[aria-label="Edit Moonlit Forest"]'));
    // Edit stays the row's own `<IconButton>`.
    assert.deepEqual(await rowMenuCommands('[data-environment-id="env-forest"]'), [
      'Duplicate environment',
      'Delete environment',
    ]);
    // AND THE TRIGGER NAMES THE RECORD (issue 1515, review round 1). The items are generic.
    assert.deepEqual(
      [...target.querySelectorAll('.manager-environment-row')].map((row) =>
        row.querySelector('[aria-haspopup="menu"]').getAttribute('aria-label')
      ),
      ['Environment actions for Moonlit Forest', 'Environment actions for Quiet Cavern'],
      'each row menu trigger is named for the record it acts on'
    );
    // The hover tooltip stays generic: it appears beside the row the pointer is already on.
    assert.deepEqual(
      [...target.querySelectorAll('.manager-environment-row')].map((row) =>
        row.querySelector('[aria-haspopup="menu"]').getAttribute('title')
      ),
      ['Environment actions', 'Environment actions']
    );
    assert.equal(
      forestRow.querySelector('.manager-environment-reorder-stack'),
      null,
      'environment rows should no longer render reorder controls'
    );
    assert.ok(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment')
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Environment actions'),
      false,
      'selected environment inspector should not duplicate row quick actions'
    );

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'cavern';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 1);
    assert.ok(target.textContent.includes('Quiet Cavern'));

    const cavernToggle = target.querySelector(
      '[data-environment-id="env-cavern"] .manager-status-toggle'
    );
    cavernToggle.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'toggleEnvironmentEnabled' && call[1] === 'env-cavern' && call[2] === true
      )
    );
    assert.equal(
      calls.some((call) => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'),
      false
    );

    target
      .querySelector('[data-environment-id="env-cavern"] .manager-environment-identity')
      .click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-environment-id="env-cavern"]').classList.contains('is-selected')
    );
    assert.ok(calls.some((call) => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'));

    await runRowMenuCommand('[data-environment-id="env-cavern"]', 'Duplicate environment');
    await runRowMenuCommand('[data-environment-id="env-cavern"]', 'Delete environment');
    assert.ok(
      calls.some((call) => call[0] === 'duplicateEnvironmentDraft' && call[1] === 'env-cavern')
    );
    assert.ok(
      calls.some((call) => call[0] === 'deleteEnvironmentDraft' && call[1] === 'env-cavern')
    );

    target.querySelector('[aria-label="Edit Quiet Cavern"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    assert.ok(
      target.querySelector('.manager-environment-editor-shell .manager-environment-edit-view')
    );
    assert.ok(target.textContent.includes('Quiet Cavern'));
  });

  it('creates a new environment draft with draft-backed title and inspector context', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    // THE TITLE STAYS STATIC and the BREADCRUMB LEAF NAMES THE SUBJECT (issue 1328). These were
    // one rule and are now two, deliberately. The chrome ruling this case was written for is
    // about the TITLE and SUBTITLE: an environment's name and description are not injected
    // there, and the pills render under a fixed heading. That still holds.
    assert.equal(target.querySelector('.manager-title').textContent.trim(), 'Edit environment');
    const envEditCrumbs = Array.from(target.querySelectorAll('.manager-breadcrumbs span'));
    assert.equal(
      envEditCrumbs[envEditCrumbs.length - 1].textContent.trim(),
      'New Gathering Environment',
      'final breadcrumb crumb should name the environment, not the kind of screen'
    );
    // AND THE TRAIL ABOVE IT IS THE PATH THAT WAS WALKED, group and sub-tab included.
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-breadcrumbs > *'))
        .filter((node) => node.tagName.toLowerCase() !== 'i')
        .map((node) => node.textContent.trim()),
      ['Crafting Systems', 'Alchemy', 'Gathering', 'Environments', 'New Gathering Environment']
    );
    assert.equal(
      target.querySelector('.manager-subtitle').textContent.trim(),
      'Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.',
      'subtitle should be the static help text, not the environment description'
    );
    assert.ok(
      target.querySelector('[data-environment-status-pills]'),
      'chrome header should render environment status pills'
    );
    assert.ok(
      target.querySelector('[data-action="delete-environment"]'),
      'chrome header should expose the delete action'
    );
    // The v2 composition editor owns its own contextual inspector inside the
    // editor workspace (the manager root no longer renders the shared rail for
    // this view), defaulting to the environment summary when nothing is selected.
    assert.ok(
      target.querySelector('.manager-environment-edit-view[data-environment-editor]'),
      'environment-edit should mount the composition editor'
    );
    assert.ok(
      target.querySelector('.manager-environment-inspector'),
      'composition editor should render its own inspector rail'
    );
    assert.ok(
      target.querySelector('[data-environment-summary-inspector]'),
      'inspector should default to the environment summary with no selection'
    );
    assert.ok(calls.some((call) => call[0] === 'createEnvironmentDraft'));
  });

  it('shows the linked scene thumbnail in place of the environment image and locks the editor identity', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    // Display precedence: the linked scene thumbnail replaces the environment's own image,
    // even though the environment stores its own `img` ('forest-custom.webp').
    const forestRow =
      target.querySelector('[data-environment-id="env-forest"]') ||
      Array.from(target.querySelectorAll('.manager-environment-row')).find((row) =>
        row.textContent.includes('Moonlit Forest')
      );
    assert.equal(
      forestRow.querySelector('.manager-environment-thumb').getAttribute('src'),
      'forest-medium.webp',
      'a linked scene image should replace the environment image in browser rows'
    );

    // Open the editor on the forest draft (scene linked).
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );

    // Identity image is a locked, muted scene thumbnail — not an editable picker.
    let picker = target.querySelector(
      '[data-overview-section="identity"] .manager-task-image-picker'
    );
    assert.ok(
      picker.classList.contains('is-scene-linked'),
      'identity image should be scene-locked while a scene is linked'
    );
    assert.equal(picker.tagName, 'SPAN', 'locked identity image should not be an editable button');
    assert.ok(picker.querySelector('.fa-lock'), 'locked identity image should show a lock icon');
    assert.equal(
      target.querySelector('[data-overview-section="identity"] .fa-pen'),
      null,
      'locked identity image should not show the edit affordance'
    );
    assert.equal(
      picker.querySelector('img').getAttribute('src'),
      'forest-medium.webp',
      'locked identity image should show the scene thumbnail'
    );

    // Unlink the scene → the identity image returns to the editable stored value.
    target.querySelector('[data-environment-summary-scene] .manager-icon-button.is-danger').click();
    await tick();
    flushSync();

    picker = target.querySelector('[data-overview-section="identity"] .manager-task-image-picker');
    assert.equal(
      picker.tagName,
      'BUTTON',
      'identity image should be editable again once the scene is unlinked'
    );
    assert.equal(picker.classList.contains('is-scene-linked'), false);
    assert.ok(
      picker.querySelector('.fa-pen'),
      'unlocked identity image should show the edit affordance'
    );
    assert.equal(
      picker.querySelector('img').getAttribute('src'),
      'forest-custom.webp',
      'unlinking should restore the stored environment image'
    );
  });

  it('protects dirty environment edit drafts when leaving via the back button', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { confirmDiscardResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );

    const backButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Back to environments'));
    assert.ok(backButton, 'env-edit header should render a Back to environments button');
    backButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyEnvironmentDraft'),
      'clicking Back with a dirty draft should ask the store to confirm discard'
    );
    assert.equal(
      calls.filter((call) => call[0] === 'cancelEnvironmentDraft').length,
      0,
      'declining the confirm should not run cancelEnvironmentDraft'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit',
      'declining the confirm should keep the editor open'
    );
  });

  it('omits source and action controls from mounted task and event record inspectors', async () => {
    const updateCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          taskDropRateAdjustments: { 'task-forage': { 'drop-herb': 15, 'drop-root': -10 } },
          taskDropRateAdjustmentsEnabled: {},
        },
        composition: {
          compositionMode: 'automatic',
          conditions: {},
          counts: { availableTasks: 1, availableEvents: 1 },
          tasks: [
            {
              id: 'task-forage',
              record: { name: 'Forage Herbs', img: 'icons/svg/item-bag.svg' },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              libraryEnabled: true,
              matches: true,
              conditionsMet: true,
              evidence: {
                biome: {
                  state: 'match',
                  recordValues: ['forest', 'desert'],
                  envValues: ['forest'],
                  applicable: true,
                },
                region: {
                  state: 'mismatch',
                  recordValues: ['south'],
                  envValues: ['north'],
                  applicable: true,
                },
                weather: {
                  state: 'mismatch',
                  recordValues: ['storm'],
                  envValues: ['clear'],
                  applicable: true,
                },
                time: { state: 'any', recordValues: [], envValues: ['day'], applicable: true },
                danger: {
                  state: 'any',
                  recordValues: ['deadly'],
                  envValues: ['dangerous'],
                  applicable: false,
                },
              },
              dropRateAdjustmentsEnabled: true,
              dropRateAdjustmentRows: [
                {
                  id: 'drop-herb',
                  name: 'Moon Herb',
                  img: 'icons/consumables/plants/leaf-green.webp',
                  componentId: 'c1',
                  quantity: 1,
                  baseDropRate: 40,
                  adjustment: 15,
                  effectiveDropRate: 55,
                  hasDropRateAdjustment: true,
                },
                {
                  id: 'drop-root',
                  name: 'Moon Root',
                  img: 'icons/consumables/plants/root-brown.webp',
                  componentId: 'c2',
                  quantity: 1,
                  baseDropRate: 30,
                  adjustment: -10,
                  effectiveDropRate: 20,
                  hasDropRateAdjustment: true,
                },
              ],
            },
          ],
          events: [
            {
              id: 'event-thorns',
              record: { name: 'Thorn Snare', img: 'icons/svg/hazard.svg', dropRate: 10 },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              libraryEnabled: true,
              matches: true,
              conditionsMet: true,
              evidence: {
                biome: {
                  state: 'match',
                  recordValues: ['forest'],
                  envValues: ['forest'],
                  applicable: true,
                },
                region: {
                  state: 'match',
                  recordValues: ['north'],
                  envValues: ['north'],
                  applicable: true,
                },
                weather: {
                  state: 'match',
                  recordValues: ['clear'],
                  envValues: ['clear'],
                  applicable: true,
                },
                time: {
                  state: 'mismatch',
                  recordValues: ['night'],
                  envValues: ['day'],
                  applicable: true,
                },
                danger: {
                  state: 'mismatch',
                  recordValues: ['deadly'],
                  envValues: ['dangerous'],
                  applicable: true,
                },
              },
              dropRateAdjustment: 0,
            },
          ],
        },
        onUpdateEnvironment: (updates) => updateCalls.push(updates),
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="tasks"]').click();
    await tick();
    flushSync();
    const taskInspector = target.querySelector('[data-record-inspector="task"]');
    assert.ok(taskInspector, 'tasks tab should render the selected task inspector');
    assert.ok(
      taskInspector.querySelector('.manager-inspector-title-row'),
      'task inspector should render the selected-record header'
    );
    assert.ok(
      taskInspector.textContent.includes('Selected task'),
      'task inspector header should identify the selected task'
    );
    assert.ok(
      taskInspector.textContent.includes('Forage Herbs'),
      'task inspector header should include the selected task name'
    );
    assert.equal(
      taskInspector.querySelector('[data-composition-state]')?.dataset.compositionState,
      'includedByMatch',
      'task inspector header should keep the composition pill'
    );
    assert.equal(
      taskInspector.querySelector('[data-runtime-state]')?.dataset.runtimeState,
      'available',
      'task inspector header should keep the runtime pill'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="source"]'),
      null,
      'task inspector should not render a Source card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="runtime-state"]'),
      null,
      'task inspector should not render a Runtime state card'
    );
    assert.equal(
      target.querySelector('.manager-environment-inspector-actions'),
      null,
      'task inspector should not render the selected-record action strip'
    );
    assert.equal(
      target.querySelector('.manager-environment-open-source'),
      null,
      'task inspector should not render an open-source CTA'
    );
    assert.equal(
      target
        .querySelector('[data-record-inspector-section="evidence"] .manager-card-title')
        .textContent.trim(),
      'Task Environment Matching'
    );
    const taskEvidenceRows = Array.from(
      target.querySelectorAll('.manager-environment-evidence-table [data-evidence-field]')
    );
    assert.deepEqual(
      taskEvidenceRows.map((row) => row.dataset.evidenceField),
      ['biome', 'weather', 'time', 'danger'],
      'task evidence table should render every composition dimension (region is geography, not composition)'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="biome"] [data-evidence-value-state="match"]')
        .textContent.trim(),
      'Forest'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="biome"] [data-evidence-value-state="mismatch"]')
        .textContent.trim(),
      'Desert'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="weather"] .manager-environment-evidence-value-pill')
        .classList.contains('is-warning'),
      true,
      'weather mismatch should use warning tone'
    );
    assert.ok(
      target.querySelector('[data-evidence-field="danger"]').textContent.includes('Any danger'),
      'task evidence table should keep the danger row as unconstrained'
    );
    const taskOverrides = target.querySelector('[data-record-inspector-section="overrides"]');
    assert.ok(taskOverrides, 'task inspector should keep the overrides card');
    assert.ok(
      taskOverrides.querySelector('[data-task-drop-rate-adjustments-toggle]'),
      'task overrides should render the apply toggle'
    );
    assert.ok(
      taskOverrides.textContent.includes('Base chance modifiers'),
      'task overrides should render the base chance modifier section'
    );
    assert.ok(
      taskOverrides.textContent.includes('Base 40%'),
      'task overrides should keep the base chance context'
    );
    assert.ok(
      taskOverrides.textContent.includes('Effective 55%'),
      'task overrides should keep the effective chance context'
    );
    const taskAdjustmentRow = taskOverrides.querySelector(
      '[data-drop-rate-adjustment="drop-herb"]'
    );
    assert.ok(taskAdjustmentRow, 'task drop override should render a row for the selected drop');
    assert.equal(
      taskAdjustmentRow.classList.contains('is-positive'),
      true,
      'positive modifiers should color the whole task drop override row'
    );
    assert.equal(
      taskOverrides
        .querySelector('[data-drop-rate-adjustment="drop-root"]')
        ?.classList.contains('is-negative'),
      true,
      'negative modifiers should color the whole task drop override row'
    );
    assert.equal(
      taskAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-thumb')
        ?.getAttribute('src'),
      'icons/consumables/plants/leaf-green.webp',
      'task drop override should render the drop image'
    );
    assert.equal(
      taskAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-drop strong')
        ?.textContent.trim(),
      'Moon Herb',
      'task drop override should render the drop name'
    );
    assert.equal(
      taskAdjustmentRow.querySelector('[data-drop-rate-adjustment-base]')?.textContent.trim(),
      'Base 40%',
      'base rate should be its own one-row item'
    );
    const taskEffectiveRate = taskAdjustmentRow.querySelector(
      '[data-drop-rate-adjustment-effective]'
    );
    assert.equal(
      taskEffectiveRate?.textContent.trim(),
      'Effective 55%',
      'effective rate should be its own one-row item'
    );
    const taskClearButton = taskAdjustmentRow.querySelector(
      '.manager-environment-drop-adjustment-clear'
    );
    assert.ok(taskClearButton, 'task drop override should render an icon-only clear button');
    assert.equal(taskClearButton.getAttribute('aria-label'), 'Clear');
    assert.equal(taskClearButton.getAttribute('title'), 'Clear');
    assert.equal(
      taskClearButton.textContent.trim(),
      '',
      'clear button should not render visible text'
    );
    assert.equal(
      taskClearButton.parentElement?.classList.contains(
        'manager-environment-drop-adjustment-controls'
      ),
      true,
      'clear button should stay inside the task drop control row'
    );
    assert.equal(
      taskEffectiveRate?.nextElementSibling,
      taskClearButton,
      'clear button should sit immediately after the effective rate block'
    );
    const taskAdjustmentInput = taskOverrides.querySelector(
      '[data-drop-rate-adjustment="drop-herb"] [data-drop-rate-adjustment-input]'
    );
    assert.ok(taskAdjustmentInput, 'task drop override should render a custom percent input');
    assert.equal(taskAdjustmentInput.getAttribute('type'), 'text');
    assert.equal(taskAdjustmentInput.value, '+15');
    assert.equal(
      taskAdjustmentInput.getAttribute('aria-label'),
      'Drop-rate adjustment (-100% to +100%)'
    );
    const percentShell = taskAdjustmentRow.querySelector('[data-drop-rate-adjustment-percent]');
    assert.ok(percentShell, 'task drop override should render the percent suffix shell');
    assert.equal(
      percentShell.classList.contains('is-positive'),
      false,
      'positive modifiers should not color the percent input shell'
    );
    assert.equal(
      taskOverrides
        .querySelector(
          '[data-drop-rate-adjustment="drop-root"] [data-drop-rate-adjustment-percent]'
        )
        ?.classList.contains('is-negative'),
      false,
      'negative modifiers should not color the percent input shell'
    );
    assert.equal(
      taskOverrides.querySelector('[data-drop-rate-adjustment="drop-herb"] input[type="number"]'),
      null,
      'task drop override should not use the plain number input'
    );
    taskAdjustmentInput.value = '-';
    taskAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(
      updateCalls.length,
      0,
      'typing a lone negative sign should remain an intermediate edit state'
    );
    taskAdjustmentInput.value = '-5';
    taskAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(
      updateCalls.at(-1),
      { taskDropRateAdjustments: { 'task-forage': { 'drop-herb': -5, 'drop-root': -10 } } },
      'task percent input should update the stored drop adjustment'
    );
    taskOverrides.querySelector('[data-task-drop-rate-adjustments-toggle]').click();
    assert.deepEqual(
      updateCalls.at(-1),
      { taskDropRateAdjustmentsEnabled: { 'task-forage': false } },
      'turning the toggle off should preserve stored values and only disable application'
    );

    target.querySelector('[data-environment-tab-button="events"]').click();
    await tick();
    flushSync();
    const eventInspector = target.querySelector('[data-record-inspector="event"]');
    assert.ok(eventInspector, 'events tab should render the selected event inspector');
    assert.ok(
      eventInspector.querySelector('.manager-inspector-title-row'),
      'event inspector should render the selected-record header'
    );
    assert.ok(
      eventInspector.textContent.includes('Selected event'),
      'event inspector header should identify the selected event'
    );
    assert.ok(
      eventInspector.textContent.includes('Thorn Snare'),
      'event inspector header should include the selected event name'
    );
    assert.equal(
      eventInspector.querySelector('[data-composition-state]')?.dataset.compositionState,
      'includedByMatch',
      'event inspector header should keep the composition pill'
    );
    assert.equal(
      eventInspector.querySelector('[data-runtime-state]')?.dataset.runtimeState,
      'available',
      'event inspector header should keep the runtime pill'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="source"]'),
      null,
      'event inspector should not render a Source card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="runtime-state"]'),
      null,
      'event inspector should not render a Runtime state card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="event-runtime"]'),
      null,
      'event inspector should not render a Event runtime card'
    );
    assert.equal(
      target.querySelector('.manager-environment-inspector-actions'),
      null,
      'event inspector should not render the selected-record action strip'
    );
    assert.equal(
      target.querySelector('.manager-environment-open-source'),
      null,
      'event inspector should not render an open-source CTA'
    );
    assert.equal(
      target
        .querySelector('[data-record-inspector-section="evidence"] .manager-card-title')
        .textContent.trim(),
      'Event Environment Matching'
    );
    const eventEvidenceRows = Array.from(
      target.querySelectorAll('.manager-environment-evidence-table [data-evidence-field]')
    );
    assert.deepEqual(
      eventEvidenceRows.map((row) => row.dataset.evidenceField),
      ['biome', 'weather', 'time', 'danger'],
      'event evidence table should render every composition dimension (region is geography, not composition)'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="danger"] [data-evidence-value-state="mismatch"]')
        .textContent.trim(),
      'Deadly'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="danger"] .manager-environment-evidence-value-pill')
        .classList.contains('is-danger'),
      true,
      'danger mismatch should use danger tone'
    );
    const eventOverrides = target.querySelector('[data-record-inspector-section="overrides"]');
    assert.ok(eventOverrides, 'event inspector should keep the overrides card');
    assert.ok(
      eventOverrides.textContent.includes('Environment overrides'),
      'event overrides card should keep its title'
    );
    assert.ok(
      eventOverrides.textContent.includes('Base chance modifier'),
      'event overrides should render the singular base-chance-modifier heading'
    );
    assert.ok(
      eventOverrides.querySelector('[data-event-drop-rate-adjustments-toggle]'),
      'event overrides should render the apply toggle'
    );
    const eventAdjustmentRow = eventOverrides.querySelector(
      '[data-drop-rate-adjustment="event-thorns"]'
    );
    assert.ok(
      eventAdjustmentRow,
      'event override should render a single row card for the selected event'
    );
    assert.equal(
      eventAdjustmentRow.classList.contains('is-task-drop'),
      true,
      'event override row should reuse the task-drop card layout'
    );
    assert.equal(
      eventAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-thumb')
        ?.getAttribute('src'),
      'icons/svg/hazard.svg',
      'event override should render the event image'
    );
    assert.equal(
      eventAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-drop strong')
        ?.textContent.trim(),
      'Thorn Snare',
      'event override should render the event name'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('[data-drop-rate-adjustment-base]')?.textContent.trim(),
      'Base 10%',
      'event base rate should be its own one-row item'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('[data-drop-rate-adjustment-effective]')?.textContent.trim(),
      'Effective 10%',
      'event effective rate should be its own one-row item'
    );
    const eventAdjustmentInput = eventAdjustmentRow.querySelector(
      '[data-drop-rate-adjustment-input]'
    );
    assert.ok(eventAdjustmentInput, 'event override should render the custom percent input');
    assert.equal(
      eventAdjustmentInput.getAttribute('type'),
      'text',
      'event override input should use the text percentage input formatting'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('input[type="number"]'),
      null,
      'event override should no longer use the plain number input'
    );
    assert.ok(
      eventAdjustmentRow.querySelector('.manager-environment-drop-adjustment-clear'),
      'event override should render the icon-only clear button'
    );
    eventAdjustmentInput.value = '-5';
    eventAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(
      updateCalls.at(-1),
      { eventDropRateAdjustments: { 'event-thorns': -5 } },
      'event percent input should update the stored event adjustment'
    );
    eventOverrides.querySelector('[data-event-drop-rate-adjustments-toggle]').click();
    assert.deepEqual(
      updateCalls.at(-1),
      { eventDropRateAdjustmentsEnabled: { 'event-thorns': false } },
      'turning the event toggle off should preserve stored values and only disable application'
    );
  });

  it('routes validation issue actions to the matching composition tab and selected record', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
          sceneUuid: 'Scene.forest',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 1, includedNotMatchingEvents: 1, availableEvents: 0 },
          tasks: [
            {
              id: 'task-moon-herbs',
              kind: 'task',
              record: { name: 'Gather Moon Herbs', description: '', img: 'icons/svg/item-bag.svg' },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              evidence: {},
            },
          ],
          events: [
            {
              id: 'event-thorns',
              kind: 'event',
              record: {
                name: 'Thorn Snare',
                description: 'Tangled thorns.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              // `includedNotMatching` (issue #1315).
              compositionState: 'includedNotMatching',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
        },
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="validation"]').click();
    await tick();
    flushSync();

    // THE TAB IS THE SHARED SURFACE AS OF ISSUE 1517.
    const surface = target.querySelector('[data-environment-tab="validation"]');
    assert.ok(
      surface.hasAttribute('data-editor-validation-surface'),
      'the validation tab renders through EditorValidationSurface'
    );
    assert.equal(
      surface
        .querySelector('[data-editor-validation-summary]')
        .getAttribute('data-editor-validation-summary'),
      'warn',
      'three warnings and no blocking issue is the warn verdict'
    );
    assert.deepEqual(
      Array.from(surface.querySelectorAll('[data-editor-validation-count]')).map((tile) => [
        tile.getAttribute('data-editor-validation-count'),
        tile.textContent.trim(),
      ]),
      [
        ['passing', '6'],
        ['warnings', '3'],
        ['blocking', '0'],
      ],
      'the counts rail reports six satisfied checks and the three issues, none of them blocking'
    );

    // `info` COLLAPSES TO `warn` IN THIS TAB'S ROW BUILDER.
    const staleRow = surface.querySelector('[data-issue="staleIncluded"]');
    assert.ok(Boolean(staleRow), 'the not-matching included event still raises its note');
    assert.ok(
      staleRow.classList.contains('is-warn'),
      `the info note takes the warn row word, got ${staleRow.className}`
    );
    assert.equal(
      staleRow.getAttribute('data-issue-severity'),
      'info',
      'the domain severity is unchanged on the row hook'
    );
    // Selected by the control's OWN hook rather than by its label text (issue 1118). The
    // bespoke `manager-environment-issue-action` class it used to be found by styled nothing
    // in any theme — it was a test selector wearing a style class's clothes — and matching on
    // `textContent` could not tell the two deep links apart except by the words on them.
    for (const kind of ['event', 'task']) {
      const action = target.querySelector(`[data-environment-issue-action="${kind}"]`);
      assert.ok(Boolean(action), `the validation tab renders a View ${kind} deep link`);
      assert.ok(
        action.classList.contains('fab-manager-button'),
        `the View ${kind} link renders through the ManagerButton primitive, got ${action.className}`
      );
      assert.ok(
        action.classList.contains('is-ghost'),
        `the View ${kind} link takes the ghost role, got ${action.className}`
      );
      // TWO VERBS DOWN ONE LIST, which is what `row.viewLabel` exists for.
      assert.ok(
        action.textContent.includes(kind === 'event' ? 'ViewEvent' : 'ViewTask'),
        `the View ${kind} link keeps its own verb, got ${action.textContent.trim()}`
      );
    }

    target.querySelector('[data-environment-issue-action="event"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-environment-tab-button="events"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target
        .querySelector('[data-environment-tab="events"] [data-record-id="event-thorns"]')
        .classList.contains('is-selected')
    );
    assert.ok(
      target.querySelector('[data-record-inspector="event"]').textContent.includes('Thorn Snare')
    );

    target.querySelector('[data-environment-tab-button="validation"]').click();
    await tick();
    flushSync();

    target.querySelector('[data-environment-issue-action="task"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-environment-tab-button="tasks"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target
        .querySelector('[data-environment-tab="tasks"] [data-record-id="task-moon-herbs"]')
        .classList.contains('is-selected')
    );
    assert.ok(
      target
        .querySelector('[data-record-inspector="task"]')
        .textContent.includes('Gather Moon Herbs')
    );
  });

  it('counts editor tab badges from composition membership and splits validation counts', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
          sceneUuid: '',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 0, availableEvents: 0, includedNotMatchingEvents: 1 },
          tasks: [
            {
              id: 'task-rain-herbs',
              kind: 'task',
              record: {
                name: 'Gather Rain Herbs',
                description: 'Gather herbs that only bloom in rain.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'includedByMatch',
              runtimeState: 'unavailable',
              evidence: {},
            },
            {
              id: 'task-excluded',
              kind: 'task',
              record: {
                name: 'Excluded Task',
                description: 'Locally excluded.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'excluded',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
          events: [
            {
              id: 'event-force',
              kind: 'event',
              record: {
                name: 'Forced Event',
                description: 'Added despite matching state.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'forceIncluded',
              runtimeState: 'available',
              evidence: {},
            },
            {
              id: 'event-stale',
              kind: 'event',
              record: {
                name: 'Stale Event',
                description: 'Does not match, and composes anyway.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'includedNotMatching',
              runtimeState: 'unavailable',
              evidence: {},
            },
            {
              id: 'event-disabled',
              kind: 'event',
              record: {
                name: 'Disabled Event',
                description: 'Disabled globally.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'libraryDisabled',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
        },
      },
    });
    flushSync();

    const taskBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="tasks"] .manager-environment-tab-badge'
      )
    );
    const eventBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="events"] .manager-environment-tab-badge'
      )
    );
    const validationBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="validation"] .manager-environment-tab-badge'
      )
    );

    assert.deepEqual(
      taskBadges.map((node) => node.textContent.trim()),
      ['1'],
      'runtime-unavailable included task should count, excluded task should not'
    );
    assert.deepEqual(
      eventBadges.map((node) => node.textContent.trim()),
      ['2'],
      'force-included and not-matching included events should count, library-disabled event should not'
    );
    assert.deepEqual(
      validationBadges.map((node) => node.textContent.trim()),
      ['2', '4'],
      // TWO blocking, not three (issue #1315).
      'validation badges should show counts only'
    );
    assert.equal(
      target
        .querySelector('[data-environment-tab-button="validation"]')
        .textContent.includes('errors'),
      false,
      'validation badge should not spell out error status'
    );
    assert.equal(
      target
        .querySelector('[data-environment-tab-button="validation"]')
        .textContent.includes('warnings'),
      false,
      'validation badge should not spell out warning status'
    );
    assert.equal(
      validationBadges[0].classList.contains('is-danger'),
      true,
      'error validation badge should use danger tone'
    );
    assert.equal(
      validationBadges[1].classList.contains('is-warning'),
      true,
      'warning validation badge should use warning tone'
    );
  });

  // ── THE RAIL, THE VERDICT AND THE ROWS ARE ONE READING (issue 1517, review r1) ─────────────
  const environmentDraftWith = (overrides) => ({
    id: 'env-forest',
    craftingSystemId: 'alchemy',
    name: 'Moonlit Forest',
    description: 'Old trees and moonlit herbs.',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
    biomes: ['forest'],
    dangerLevel: 'dangerous',
    sceneUuid: 'Scene.forest',
    ...overrides,
  });

  const describedTask = (id, name) => ({
    id,
    kind: 'task',
    record: { name, description: 'Gather herbs by moonlight.', img: 'icons/svg/item-bag.svg' },
    compositionState: 'includedByMatch',
    runtimeState: 'available',
    evidence: {},
  });

  function mountEnvironmentEditor(environmentDraft, composition) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: { environmentDraft, composition },
    });
    flushSync();
    target.querySelector('[data-environment-tab-button="validation"]').click();
    flushSync();
    return target;
  }

  // Both readers are the SHARED ones (issue 1517, review r3). Three suites compare a rail with
  // its own rows, and the comparison only means anything while all three read the two sides the
  // same way — so the readers live in `tests/helpers/validationSurfaceReadings.js` and this
  // suite's `target` is bound to them here.
  const railCounts = () => sharedRailCounts(target);
  const rowStatusTally = () => sharedTallyMatchingRail(target);

  const verdict = () => target.querySelector('[data-editor-validation-summary]');

  it('counts an unsatisfied check that raises NO issue, and does not call it all clear', async () => {
    // THE REPRO. Only `hasAvailableTask` pairs with an issue.
    mountEnvironmentEditor(
      environmentDraftWith({ description: '', dangerLevel: '' }),
      {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 0 },
        tasks: [describedTask('task-moon-herbs', 'Gather Moon Herbs')],
        events: [],
      }
    );

    assert.equal(
      target.querySelectorAll('[data-check="hasDescription"].is-warn').length,
      1,
      'the unsatisfied description check paints an amber row'
    );
    assert.deepEqual(
      railCounts(),
      { passing: 5, warnings: 2, blocking: 0 },
      'and the rail counts it: four satisfied checks plus the "no issues" result, and the two ' +
        'unsatisfied checks as warnings'
    );
    assert.deepEqual(
      rowStatusTally(),
      railCounts(),
      'the rail is a TALLY OF THE ROWS, so the two cannot disagree — which is the whole defect: ' +
        'a count is a reading of a result, and there were two readings'
    );
    assert.equal(
      verdict().getAttribute('data-editor-validation-summary'),
      'warn',
      'and the verdict is not "All clear" over two amber rows'
    );
  });

  it('badges an INFO-only environment with the same warnings count the rail shows', async () => {
    // `info` collapses to the Warnings tile inside the tab.
    mountEnvironmentEditor(environmentDraftWith({}), {
      compositionMode: 'manual',
      counts: { availableTasks: 1, availableEvents: 1, includedNotMatchingEvents: 1 },
      tasks: [describedTask('task-moon-herbs', 'Gather Moon Herbs')],
      events: [
        {
          id: 'event-thorns',
          kind: 'event',
          record: { name: 'Thorn Snare', description: 'Tangled thorns.', img: 'icons/svg/hazard.svg' },
          compositionState: 'includedNotMatching',
          runtimeState: 'unavailable',
          evidence: {},
        },
      ],
    });

    assert.equal(railCounts().warnings, 1, 'the rail counts the info note as a warning');
    assert.deepEqual(
      Array.from(
        target.querySelectorAll(
          '[data-environment-tab-button="validation"] .manager-environment-tab-badge'
        )
      ).map((node) => node.textContent.trim()),
      ['1'],
      'and so does the badge, which showed nothing here'
    );
  });

  // ── THE ROW ACTION RE-HOMES THE KEYBOARD AND SAYS WHERE (issue 1517, docs round) ───────────
  it('lands the keyboard in the destination panel and announces the record it selected', async () => {
    mountEnvironmentEditor(environmentDraftWith({}), {
      compositionMode: 'manual',
      counts: { availableTasks: 1, availableEvents: 1, includedNotMatchingEvents: 1 },
      tasks: [describedTask('task-moon-herbs', 'Gather Moon Herbs')],
      events: [
        {
          id: 'event-thorns',
          kind: 'event',
          record: { name: 'Thorn Snare', description: 'Tangled thorns.', img: 'icons/svg/hazard.svg' },
          compositionState: 'includedNotMatching',
          runtimeState: 'unavailable',
          evidence: {},
        },
      ],
    });

    const region = target.querySelector('[data-environment-issue-announcement]');
    assert.ok(Boolean(region), 'the live region exists before it has any text');
    assert.equal(region.textContent.trim(), '', 'and it is empty until an action has an outcome');

    target.querySelector('[data-environment-issue-action="event"]').click();
    // A MACROTASK, not a microtask. The focus move is two `queueMicrotask` hops deep.
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();

    assert.equal(
      target.querySelector('[data-environment-tab-button="events"]').getAttribute('aria-selected'),
      'true',
      'the route ran first, so the panel the keyboard is about to land in is the Events one'
    );
    const panel = target.querySelector('.manager-environment-tab-panel');
    // `assert.ok(a === b)` rather than `assert.strictEqual`.
    assert.ok(
      document.activeElement === panel,
      'the destination PANEL took the keyboard. Without it focus rests on `<body>`, where every ' +
        'Foundry keybinding is live'
    );
    assert.equal(
      panel.getAttribute('data-keyboard-focus'),
      'true',
      'and it declares itself focused, or Foundry treats the window as unfocused while it holds ' +
        'the keyboard'
    );
    assert.equal(region.textContent.trim(), '', 'the sentence is QUEUED BEHIND the focus move');

    await waitForQueuedAnnouncement();

    assert.equal(
      region.textContent.trim(),
      'Events — Thorn Snare',
      'the sentence names the route and the RECORD the route selected, which is where the GM ' +
        'now is. The harness localizer returns the key, so the tab word is the English fallback'
    );
  });

  it('refuses "Saves and enables" for a disabled environment nothing can enable', async () => {
    // `noAvailableTasks` is `critical` on an ACTIVE environment and `warning` on a disabled one —
    // the same missing task, graded by how loud it needs to be — and it carries `blocks: 'enable'`
    // in both states. Routing the verdict off severity told the GM of a disabled, taskless
    // environment that it "Saves and enables". It does not: it cannot be enabled at all.
    mountEnvironmentEditor(
      environmentDraftWith({ enabled: false, dangerLevel: '' }),
      {
        compositionMode: 'automatic',
        counts: { availableTasks: 0, availableEvents: 0 },
        tasks: [],
        events: [],
      }
    );

    assert.equal(
      verdict().getAttribute('data-editor-validation-summary'),
      'block',
      'the verdict answers `blocks: enable`, not the severity ranking'
    );
    assert.equal(
      verdict().textContent.includes('Saves and enables'),
      false,
      'so the sub-line does not promise something the environment cannot do'
    );
    const row = target.querySelector('[data-issue="noAvailableTasks"]');
    assert.ok(Boolean(row), 'the row is drawn');
    assert.ok(
      row.classList.contains('is-block'),
      `a row that blocks enabling takes the block word, got ${row.className}`
    );
    assert.equal(
      row.getAttribute('data-issue-severity'),
      'warning',
      'while the DOMAIN severity is unchanged on its own hook: the two are different questions'
    );
    assert.equal(railCounts().blocking, 1, 'and the Blocking tile counts it, as the row shows it');
  });

  it('uses configured danger choices while preserving stale current danger values', async () => {
    target = document.createElement('div');
    // The portal host: the danger ceiling's panel goes to the nearest application root.
    target.className = 'fabricate-manager';
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'extreme',
        },
        composition: { compositionMode: 'automatic', counts: {}, tasks: [], events: [] },
        dangerOptions: [
          { id: 'safe', label: 'Camp safe' },
          { id: 'hazardous', label: 'Rough going' },
        ],
      },
    });
    flushSync();

    const danger = '.fabricate-select-trigger[data-environment-field="dangerLevel"]';
    assert.equal(
      assertSelectHasResolvedName(target, danger),
      'Danger level',
      'the demoted caption names the trigger, and the hint below it is no longer part of the name'
    );
    assert.equal(selectTriggerText(target, danger), 'Extreme');
    assert.deepEqual(selectOptionValues(target, danger), ['extreme', 'safe', 'hazardous']);
    assert.deepEqual(selectOptionLabels(target, danger), [
      'Extreme',
      'Camp safe',
      'Rough going',
    ]);
  });

  it('scores inspector danger evidence against the six-level canonical scale', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 1 },
          tasks: [
            {
              id: 'task-danger',
              kind: 'task',
              record: {
                name: 'Read the Trail',
                description: 'Judge the safest route.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              evidence: {
                biome: { state: 'any', recordValues: [], envValues: ['forest'], applicable: true },
                region: { state: 'any', recordValues: [], envValues: [], applicable: true },
                weather: { state: 'any', recordValues: [], envValues: [], applicable: true },
                time: { state: 'any', recordValues: [], envValues: [], applicable: true },
                danger: {
                  state: 'match',
                  recordValues: ['unsafe', 'extreme'],
                  envValues: ['dangerous'],
                  applicable: true,
                },
              },
            },
          ],
          events: [],
        },
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="tasks"]').click();
    await tick();
    flushSync();

    const dangerPills = Array.from(
      target.querySelectorAll('[data-evidence-field="danger"] [data-evidence-value-state]')
    );
    assert.deepEqual(
      dangerPills.map((pill) => pill.textContent.trim()),
      ['Unsafe', 'Extreme']
    );
    assert.deepEqual(
      dangerPills.map((pill) => pill.dataset.evidenceValueState),
      ['match', 'mismatch']
    );
    assert.equal(
      dangerPills[0].classList.contains('is-positive'),
      true,
      'unsafe should rank below dangerous'
    );
    assert.equal(
      dangerPills[1].classList.contains('is-danger'),
      true,
      'extreme should rank above dangerous'
    );
  });

  // The DOM half of what `gathering-event-editor.test.js` pinned as root text: the panel is one
  // component now, so only rendering both subjects can prove their hooks stayed distinct.
  for (const subject of ['drop', 'event']) {
    it(`renders the shared modifier panel under its own ${subject} hook prefix`, async () => {
      const shell = modifierEditorShell(subject, [
        { id: 'cm-1', kind: 'biome', conditionId: 'forest', sign: 'positive', display: '+15' },
      ]);
      const other = subject === 'drop' ? 'event' : 'drop';
      // Nothing else pins the open direction now that it crosses the prop boundary.
      const props = { ...shell.props, characterModifierSearchOpenUp: true };
      const root = mountModifierEditor(props);

      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-condition-modifiers="biome"]`)),
        `the biome condition card must carry the ${subject} prefix`
      );
      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-condition-modifier-picker="biome"]`)),
        `the biome picker must carry the ${subject} prefix`
      );
      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-modifier-id="cm-1"]`)),
        `the attached modifier row must carry the ${subject} prefix`
      );
      assert.ok(
        !root.querySelector(`[data-gathering-${other}-modifier-id="cm-1"]`),
        `the attached modifier row must not carry the ${other} prefix`
      );
      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-character-modifiers]`)),
        `the character-modifier card must carry the ${subject} prefix`
      );
      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-character-modifier-search]`)),
        `the character-modifier search must carry the ${subject} prefix`
      );
      assert.ok(
        Boolean(root.querySelector(`[data-gathering-${subject}-character-modifier-suggestions]`)),
        `the suggestion list must carry the ${subject} prefix`
      );
      assert.ok(
        Boolean(root.querySelector('.manager-character-modifier-add-suggestions.is-above')),
        'the suggestion list opens upwards when the shell says it must'
      );
      assert.ok(
        !root.querySelector(`[data-gathering-${other}-condition-modifiers="biome"]`),
        `no ${other} hook may appear on the ${subject} panel`
      );
      assert.ok(
        !root.querySelector(`[data-gathering-${other}-character-modifiers]`),
        `no ${other} hook may appear on the ${subject} panel`
      );

      // The card copy is fed `subject` as the helpers' existing `scope` argument.
      assert.ok(
        root.textContent.includes(`biome/${subject}`),
        `the card title must be built from the ${subject} scope`
      );

      const suggestion = root.querySelector(
        `[data-gathering-${subject}-character-modifier-suggestion="mod-training"]`
      );
      assert.ok(Boolean(suggestion), `the suggestion must carry the ${subject} prefix`);
      assert.ok(
        !root.querySelector(`[data-gathering-${other}-character-modifier-suggestion="mod-training"]`),
        `the suggestion must not carry the ${other} prefix`
      );
      suggestion.click();
      await tick();
      flushSync();
      assert.deepEqual(shell.picked, ['mod-training'], 'the pick must reach the shell');

      const rendered = mountModifierEditor(props);
      const ref = rendered.querySelector(
        `[data-gathering-${subject}-character-modifier-ref="ref-mod-training"]`
      );
      assert.ok(Boolean(ref), `the picked reference row must carry the ${subject} prefix`);
      assert.ok(
        !rendered.querySelector(`[data-gathering-${other}-character-modifier-ref="ref-mod-training"]`),
        `the reference row must not carry the ${other} prefix`
      );
      assert.ok(
        Boolean(ref.querySelector('.manager-character-modifier-row-bounds')),
        'the reference row renders the one shared bounds row'
      );
      assert.ok(
        Boolean(ref.querySelector('.manager-character-modifier-operator-select select')),
        'the reference row renders its operator select'
      );
    });
  }

  // The forward crosses TWO boundaries now (leaf -> panel); pin it at the leaf too, not only at
  // the panel the loop above mounts directly (issue 1707 phase 2 review).
  for (const [label, component] of [
    ['task', () => GatheringTaskInspectorComponent],
    ['event', () => GatheringEventInspectorComponent],
  ]) {
    it(`fills the ${label} inspector when no row is selected`, () => {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(component(), { target });
      flushSync();

      const empty = target.querySelector('.manager-empty');
      assert.ok(Boolean(empty), `the ${label} inspector rendered no empty state`);
      assert.ok(
        empty.classList.contains('is-fill'),
        `the ${label} inspector empty state does not claim the available rail height`
      );
    });
  }

  it('opens the drop panel upwards through GatheringTaskInspector, the leaf that owns it', async () => {
    const shell = modifierEditorShell('drop', []);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(GatheringTaskInspectorComponent, {
      target,
      props: {
        ...shell.props,
        editing: true,
        task: { id: 'task-1' },
        editingTask: { resolutionMode: 'd100' },
        selectedDrop: { id: 'drop-1' },
        characterModifierSearchOpenUp: true,
        // Forwarded on to the panel via `bind:`; a leaf-level bindable with no fallback of its
        // own needs an entry value, or the panel's own `$bindable(null)` fallback throws.
        characterModifierSearchAnchor: null,
        characterModifierSearchTerm: '',
      },
    });
    flushSync();

    assert.ok(
      Boolean(target.querySelector('.manager-character-modifier-add-suggestions.is-above')),
      'the task leaf must forward characterModifierSearchOpenUp to the shared panel'
    );
  });

  it('opens the event panel upwards through GatheringEventInspector, the leaf that owns it', async () => {
    const shell = modifierEditorShell('event', []);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(GatheringEventInspectorComponent, {
      target,
      props: {
        ...shell.props,
        editing: true,
        editingEvent: { id: 'event-1' },
        characterModifierSearchOpenUp: true,
        characterModifierSearchAnchor: null,
        characterModifierSearchTerm: '',
      },
    });
    flushSync();

    assert.ok(
      Boolean(target.querySelector('.manager-character-modifier-add-suggestions.is-above')),
      'the event leaf must forward characterModifierSearchOpenUp to the shared panel'
    );
  });

  // The coloured box, the signed value input, its `%` adornment and the Arrow stepper moved into
  // the shared panel, so they are asserted where they render rather than re-pinned as root text.
  it('renders an attached condition modifier as one coloured, signed, steppable input', async () => {
    const attached = [{ id: 'cm-1', kind: 'biome', conditionId: 'forest', sign: 'positive', display: '+15' }];
    const shell = modifierEditorShell('drop', attached);
    const root = mountModifierEditor(shell.props);

    const article = root.querySelector('[data-gathering-drop-modifier-id="cm-1"]');
    assert.ok(Boolean(article), 'the attached modifier renders under the drop modifier-id hook');
    assert.ok(
      article.classList.contains('manager-condition-modifier-row-reference'),
      'the row keeps the shared reference class'
    );
    assert.ok(
      article.classList.contains('is-positive'),
      'the box is coloured by the signed value class the shell computes'
    );
    assert.ok(article.textContent.includes('label:forest'), 'the row names its condition');

    const box = article.querySelector('.manager-condition-modifier-value');
    assert.ok(Boolean(box), 'the value sits in the single signed-input wrapper');
    const input = box.querySelector('input');
    assert.equal(input.getAttribute('type'), 'text', 'a text input so a leading + can render');
    assert.equal(input.getAttribute('inputmode'), 'numeric', 'with a numeric keypad');
    assert.equal(input.value, '+15', 'and the formatted signed value the shell returned');
    const adornment = [...box.querySelectorAll('span')].find((span) => span.textContent === '%');
    assert.ok(Boolean(adornment), 'the value carries its % adornment');
    assert.equal(
      adornment.getAttribute('aria-hidden'),
      'true',
      'the adornment stays hidden from assistive technology'
    );

    input.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.deepEqual(
      shell.keydowns,
      [['biome', 'cm-1', 'ArrowUp']],
      'Arrow stepping reaches the shell with the kind, the modifier and the key'
    );
  });

  it('renders the empty condition-modifier body for a drop and nothing for an event', () => {
    const dropBody = mountModifierEditor(modifierEditorShell('drop').props).querySelector(
      '[data-gathering-drop-condition-modifiers="biome"] .manager-condition-modifier-row-list'
    );
    assert.ok(
      dropBody.textContent.includes('No modifiers attached.'),
      'the drop keeps the empty-state body it has always drawn'
    );
    const eventBody = mountModifierEditor(modifierEditorShell('event').props).querySelector(
      '[data-gathering-event-condition-modifiers="biome"] .manager-condition-modifier-row-list'
    );
    assert.equal(
      eventBody.textContent.trim(),
      '',
      'the event has never drawn one, and gains none from sharing the panel'
    );
  });
  /** One editor draft, varied per case: the fixture differences are what each case is about. */
  function editorDraft(overrides = {}) {
    return {
      id: 'env-forest',
      craftingSystemId: 'alchemy',
      name: 'Moonlit Forest',
      description: 'Old trees and moonlit herbs.',
      enabled: true,
      selectionMode: 'targeted',
      compositionMode: 'automatic',
      biomes: ['forest'],
      dangerLevel: 'dangerous',
      sceneUuid: 'Scene.moonlit',
      ...overrides,
    };
  }

  function compositionRecord(id, name, compositionState, overrides = {}) {
    return {
      id,
      kind: overrides.kind ?? 'task',
      record: { name, description: `${name} description`, img: 'icons/svg/item-bag.svg' },
      compositionState,
      runtimeState: overrides.runtimeState ?? 'unavailable',
      matches: overrides.matches ?? true,
      libraryEnabled: overrides.libraryEnabled ?? true,
      evidence: {},
    };
  }

  function mountEditor(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, { target, props });
    flushSync();
  }

  async function openEditorTab(id) {
    target.querySelector(`[data-environment-tab-button="${id}"]`).click();
    await tick();
    flushSync();
  }

  it('hides the right inspector on the validation tab and collapses the workspace to one column', async () => {
    mountEditor({
      environmentDraft: editorDraft(),
      composition: {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-a', 'Forage Herbs', 'includedByMatch')],
        events: [],
      },
    });

    const workspace = () => target.querySelector('.manager-environment-workspace');
    assert.ok(
      Boolean(target.querySelector('.manager-environment-inspector')),
      'the overview tab renders the editor-owned right inspector'
    );
    assert.equal(workspace().classList.contains('is-inspector-hidden'), false);

    await openEditorTab('validation');
    assert.ok(
      !target.querySelector('.manager-environment-inspector'),
      'the validation tab renders no right inspector'
    );
    assert.equal(
      workspace().classList.contains('is-inspector-hidden'),
      true,
      'and the workspace collapses to one column'
    );

    await openEditorTab('overview');
    assert.ok(
      Boolean(target.querySelector('.manager-environment-inspector')),
      'and it comes back on every other tab'
    );
  });

  it('draws no tab badge at the cohort zero point, where a wrong count and a right one agree', async () => {
    mountEditor({
      // Every readiness check satisfied and no issue raised, so both validation counts are zero;
      // the one composition row is excluded, so both membership counts are zero too.
      environmentDraft: editorDraft(),
      composition: {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-out', 'Excluded Task', 'excluded')],
        events: [],
      },
    });

    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-environment-tab-badge')).map((node) =>
        node.textContent.trim()
      ),
      [],
      'no tab draws a badge when its count is zero'
    );

    await openEditorTab('tasks');
    assert.ok(
      Boolean(target.querySelector('[data-record-id="task-out"]')),
      'though the row the count excluded is on screen, so the zero is a reading and not an empty fixture'
    );
  });

  it('routes a manual task row quick action through the editor own compose callbacks', async () => {
    const excluded = [];
    const included = [];
    mountEditor({
      environmentDraft: editorDraft({ compositionMode: 'manual' }),
      composition: {
        compositionMode: 'manual',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [
          compositionRecord('task-in', 'Forage Herbs', 'explicitlyIncluded', {
            runtimeState: 'available',
          }),
          compositionRecord('task-add', 'Gather Roots', 'candidate'),
        ],
        events: [],
      },
      onExcludeRecord: (kind, id) => excluded.push([kind, id]),
      onIncludeRecord: (kind, id) => included.push([kind, id]),
    });

    await openEditorTab('tasks');
    target
      .querySelector('[data-record-id="task-in"] [data-quick-action="exclude"]')
      .click();
    await tick();
    target
      .querySelector('[data-record-id="task-add"] [data-quick-action="include"]')
      .click();
    await tick();

    assert.deepEqual(excluded, [['task', 'task-in']]);
    assert.deepEqual(included, [['task', 'task-add']]);
  });

  it('gates the realm field on the toggle, not on the field simply existing', async () => {
    mountEditor({
      environmentDraft: editorDraft(),
      composition: {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-in', 'Forage Herbs', 'includedByMatch')],
        events: [],
      },
      realmsEnabled: false,
    });

    assert.ok(
      !target.querySelector('[data-environment-field="includedRealmIds"]'),
      'the realm field stays gone while the world toggle is off'
    );
  });

  it('draws the empty-state hint exactly when no realm exists yet, not once one does', async () => {
    mountEditor({
      environmentDraft: editorDraft(),
      composition: {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-in', 'Forage Herbs', 'includedByMatch')],
        events: [],
      },
      realmsEnabled: true,
      realmRecords: [],
    });

    assert.ok(
      Boolean(target.querySelector('[data-environment-realm-empty]')),
      'no realm exists yet, so the empty-state hint draws'
    );
    assert.ok(
      !target.querySelector('.manager-environment-membership-add'),
      'and the add-realm select stays gone until a realm exists'
    );
  });

  it('offers the force add in automatic mode only, and emits the mode the switch was clicked for', async () => {
    const modes = [];
    const forced = [];
    const included = [];
    const events = [
      compositionRecord('event-in', 'Thorn Snare', 'includedByMatch', {
        kind: 'event',
        runtimeState: 'available',
      }),
      compositionRecord('event-off', 'Rock Fall', 'notMatching', {
        kind: 'event',
        matches: false,
      }),
    ];
    mountEditor({
      environmentDraft: editorDraft(),
      composition: {
        compositionMode: 'automatic',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-in', 'Forage Herbs', 'includedByMatch')],
        events,
      },
      onSetCompositionMode: (mode) => modes.push(mode),
      onForceIncludeRecord: (kind, id) => forced.push([kind, id]),
      onIncludeRecord: (kind, id) => included.push([kind, id]),
    });

    await openEditorTab('events');
    const forceAdd = target.querySelector(
      '[data-section="non-matching"] [data-record-id="event-off"] .manager-environment-force-include'
    );
    assert.ok(Boolean(forceAdd), 'automatic mode offers the force add on a non-matching row');
    forceAdd.click();
    await tick();
    assert.deepEqual(forced, [['event', 'event-off']]);

    await openEditorTab('overview');
    target.querySelector('[data-composition-mode-option="manual"]').click();
    await tick();
    flushSync();
    assert.deepEqual(modes, ['manual'], 'clicking the switch asks the host for manual mode');

    unmount(mounted);
    mounted = null;
    target.remove();
    mountEditor({
      environmentDraft: editorDraft({ compositionMode: 'manual' }),
      composition: {
        compositionMode: 'manual',
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [compositionRecord('task-in', 'Forage Herbs', 'includedByMatch')],
        events,
      },
      onIncludeRecord: (kind, id) => included.push([kind, id]),
    });

    await openEditorTab('events');
    assert.ok(
      Boolean(target.querySelector('[data-section="available-to-add"]')),
      'manual mode offers the Available to add list instead'
    );
    assert.ok(
      !target.querySelector('[data-action="force-include"]'),
      'and no force add anywhere: manual mode has no filter for one to override'
    );
    assert.ok(
      !target.querySelector('.manager-environment-force-include'),
      'nor the labelled one'
    );
    target
      .querySelector('[data-record-id="event-off"] [data-quick-action="include"]')
      .click();
    await tick();
    assert.deepEqual(included, [['event', 'event-off']], 'the same row is plainly added instead');
  });

  // The two states the rail draws itself (issue 1707 phase 3): the selected environment's
  // summary card and the empty-library setup card, neither of which had a DOM assertion.
  it('draws the selected environment summary in the rail, and follows the row that is picked', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    const rail = () => target.querySelector('.manager-inspector');
    const facts = () =>
      Array.from(rail().querySelectorAll('[data-environment-fact]')).map((fact) => [
        fact.dataset.environmentFact,
        fact.querySelector('strong').textContent.trim(),
      ]);
    const chips = () =>
      Array.from(rail().querySelectorAll('.manager-chip-row .manager-chip')).map((chip) =>
        chip.textContent.trim()
      );

    assert.equal(rail().querySelector('.manager-kicker').textContent.trim(), 'Selected environment');
    assert.equal(rail().querySelector('.manager-inspector-name').textContent.trim(), 'Moonlit Forest');
    assert.deepEqual(chips(), ['Active', 'Targeted', 'Linked scene']);
    assert.deepEqual(facts(), [
      ['tasks', '1'],
      ['events', '0'],
      ['required-tools', '0'],
      ['mode', 'Targeted'],
      // The hook the smoke harness reads as `.manager-inspector [data-environment-fact="scene"]`.
      ['scene', 'Moonlit Forest'],
    ]);
    assert.equal(
      rail().querySelector('.manager-environment-preview').classList.contains('is-fallback'),
      false,
      'the linked scene supplies the preview, so the fallback modifier stays off'
    );

    target
      .querySelector('[data-environment-id="env-cavern"] .manager-environment-identity')
      .click();
    await tick();
    flushSync();

    assert.equal(rail().querySelector('.manager-inspector-name').textContent.trim(), 'Quiet Cavern');
    assert.deepEqual(chips(), ['Disabled', 'Blind', 'Scene unresolved']);
    assert.deepEqual(facts(), [
      ['tasks', '1'],
      ['events', '0'],
      ['required-tools', '0'],
      ['mode', 'Blind'],
      ['scene', 'Scene.missing'],
    ]);
    assert.ok(
      rail().querySelector('.manager-environment-preview').classList.contains('is-fallback'),
      'and an unresolved scene with no image of its own falls back'
    );
  });

  it('draws the empty-library setup card in the rail, with its published gathering-docs link', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEnvironments: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    const card = target.querySelector('.manager-inspector .manager-setup-card');
    assert.ok(Boolean(card), 'an empty library draws the setup card rather than a row summary');
    assert.equal(card.getAttribute('aria-label'), 'Plan gathering content');
    assert.equal(card.querySelector('.manager-kicker').textContent.trim(), 'Gathering setup');
    assert.equal(card.querySelector('h3').textContent.trim(), 'Plan gathering content');
    assert.deepEqual(
      Array.from(card.querySelectorAll('.manager-setup-list li')).map((step) =>
        step.textContent.trim()
      ),
      [
        'Define gathering tasks with their checks, timing, result groups, and failure outcomes.',
        'Prepare event options that can be reused across your locations.',
        'Create environments after the gathering task and event libraries are ready to attach.',
      ]
    );
    assert.deepEqual(
      Array.from(card.querySelectorAll('.manager-setup-links a')).map((link) => [
        link.getAttribute('href'),
        link.textContent.trim(),
      ]),
      [
        ['https://mistersilver-uk.github.io/fabricate/gathering/environments', 'Gathering docs'],
        ['https://mistersilver-uk.github.io/fabricate/help/quickstart', 'Quickstart'],
      ]
    );
    assert.equal(
      Boolean(target.querySelector('.manager-inspector [data-environment-fact]')),
      false,
      'and no summary fact, since there is no row to summarise'
    );
  });

}

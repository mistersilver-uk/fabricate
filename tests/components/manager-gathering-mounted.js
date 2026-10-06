/** The gathering routes: the task and event editors, their pickers and their save failures. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import {
  TOOL_DISPLAY_PRECEDENCE_CASES,
  TOOL_PRECEDENCE_MANAGED_ITEMS,
} from '../helpers/toolDisplayPrecedenceCases.js';
// Issue 1504: a converted control is a shared `<Select>`.
import { chooseSelectOption, selectTriggerText } from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';
import {
  createManagerQueries,
  headerSaveButton,
  setInputValue,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { railCounts } from '../helpers/validationSurfaceReadings.js';
import {
  booksScrollsFixtures,
  assertDropComponentCellKeyboardPath,
  managerComponents,
  settleBetweenTests,
  settleRouteExit,
  compareStrings,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;
let mountedStore;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  assertHeaderBackIsGhost,
  craftingParent,
  craftingSubitem,
  gatheringSubitem,
  navButton,
  runRowMenuCommand,
  worldNavItem,
  worldTravelItem,
} = queries;
const { mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: (store) => {
    mountedStore = store;
  },
});

/** Open one of the gathering task editor's tabs (issue 1522), as a GM's click on its strip does. */
async function openTaskTab(tab) {
  target.querySelector(`[data-gathering-task-tab="${tab}"]`).click();
  await settleRouteExit();
}

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerGatheringCases() {
  before(async () => {
    ({ Component } = await managerComponents());
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


  // Site 10 (issue 1321): the gathering EVENT browser's "Active environments" fact.
  //   3. The `environment.enabled !== false` scoping filter regressing (covered by the
  //      `env-thorn-disabled` environment below, which composes on every other axis and must
  //      still read zero).
  it('computes the gathering event browser\'s "Active environments" fact through the shared seam', async () => {
    const calls = [];
    const gatheringEventFactEnvironments = [
      {
        id: 'env-thorn-a',
        craftingSystemId: 'alchemy',
        name: 'Stormlit Thicket',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'deadly',
        // Unrelated to the active-environment count below: it drives the "used in
        // environments" card instead (issue 1707 phase 2 review).
        enabledEventIds: ['event-storm-omen'],
      },
      {
        id: 'env-thorn-b',
        craftingSystemId: 'alchemy',
        name: 'Ashen Hollow',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'extreme',
      },
      // Composes on biome but NOT danger under the real `kind: 'event'` rule (a `deadly`-tagged
      // event needs an environment ranked `deadly` or above). If `'event'` regresses to
      // `'task'`, `includeDanger` goes false, danger stops mismatching, and this environment
      // wrongly joins the count — the failure mode 1 mutation below proves it does.
      {
        id: 'env-thorn-safe',
        craftingSystemId: 'alchemy',
        name: 'Quiet Meadow',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'safe',
      },
      // Wrong biome: excluded on every axis.
      {
        id: 'env-thorn-cavern',
        craftingSystemId: 'alchemy',
        name: 'Silent Cavern',
        enabled: true,
        biomes: ['cavern'],
        dangerLevel: 'deadly',
      },
      // Matches biome, danger AND conditions, but is disabled.
      {
        id: 'env-thorn-disabled',
        craftingSystemId: 'alchemy',
        name: 'Fogbound Hollow (disabled)',
        enabled: false,
        biomes: ['forest'],
        dangerLevel: 'deadly',
      },
    ];
    const gatheringEventFactEvent = {
      id: 'event-storm-omen',
      name: 'Storm Omen',
      description: 'A deadly squall drives dangerous game to shelter.',
      img: 'icons/svg/hazard.svg',
      enabled: true,
      dropRate: 15,
      biomes: ['forest'],
      // Non-empty and satisfied only by the overridden current weather below.
      weather: ['heavy-rain'],
      timeOfDay: [],
      dangerTags: ['deadly'],
    };
    // Unreferenced by any environment: the counterpart empty state for the same card.
    const gatheringEventFactUnreferencedEvent = {
      id: 'event-clear-skies',
      name: 'Clear Skies',
      enabled: true,
      dropRate: 15,
      biomes: [],
      weather: [],
      timeOfDay: [],
      dangerTags: [],
    };

    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryEvents: [gatheringEventFactEvent, gatheringEventFactUnreferencedEvent],
          gatheringEventFactEnvironments,
          gatheringEventFactWeather: 'heavy-rain',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Events').click();
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Events tab should mount the event library browser'
    );
    assert.ok(
      target.textContent.includes('Storm Omen'),
      'the single library event should be auto-selected into the inspector'
    );
    assert.equal(
      target.querySelector('[data-gathering-event-fact="environments"] strong').textContent.trim(),
      '2',
      'the event fact should count only the environments the shared seam composes: matching ' +
        'biome AND danger AND current conditions, scoped to enabled environments in this system'
    );
    assert.ok(
      Boolean(target.querySelector('[data-event-environment-usage-chips]')),
      'Storm Omen is referenced by Stormlit Thicket, so its card renders chips'
    );

    target.querySelector('[data-gathering-event-id="event-clear-skies"] .manager-gathering-event-identity').click();
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector('[data-event-environment-usage-empty]')),
      'Clear Skies is unreferenced, so the same card renders the empty state'
    );
  });

  // A system switch reopens the gathering workspace on its first tab, so the next system's
  // library is not entered on the tab and task the GM picked in the last one.
  it('reopens the gathering workspace on its environments tab when the selected system switches', async () => {
    const calls = [];
    mountManager(calls, {
      smithingFeatures: { gathering: true, itemTags: true, recipeCategories: true, salvage: true },
      modifiers: [{ id: 'mod-herbalism', label: 'Herbalism Lore' }],
    });
    const settle = async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      await tick();
      flushSync();
    };
    const switchSystem = async (systemId) => {
      const scope = target.querySelector('[data-manager-scope-select]');
      scope.value = systemId;
      scope.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
      await settle();
      await settle();
    };
    const tasksBrowser = () => target.querySelector('[data-gathering-tasks-browser]');
    const selectedTaskId = () =>
      target.querySelector('.manager-gathering-task-row.is-selected')?.dataset.gatheringTaskId;

    navButton('Gathering').click();
    await settle();
    gatheringSubitem('Tasks').click();
    await settle();
    target
      .querySelector('[data-gathering-task-id="task-cavern"] .manager-gathering-task-identity')
      .click();
    await settle();
    assert.equal(selectedTaskId(), 'task-cavern', 'pre-condition: the GM picked the second task');

    await switchSystem('smithing');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.ok(!tasksBrowser(), 'the switch returns the workspace to its environments tab');

    await switchSystem('alchemy');
    gatheringSubitem('Tasks').click();
    await settle();
    assert.equal(selectedTaskId(), 'task-herbs', 'and the returning library selects its first task');

    // The draft and modifier handlers read the system and the library when they are called.
    mountedStore.viewState.update((state) => {
      const { alchemy } = state.gatheringConfig.systems;
      const forge = { ...alchemy.tasks[0], id: 'task-forge', name: 'Stoke the Forge' };
      const smithing = { ...alchemy, tasks: [forge] };
      const systems = { ...state.gatheringConfig.systems, smithing };
      return { ...state, gatheringConfig: { ...state.gatheringConfig, systems } };
    });
    await switchSystem('smithing');
    gatheringSubitem('Tasks').click();
    await settle();
    target
      .querySelector('[data-gathering-task-id="task-forge"] [aria-label="Edit Stoke the Forge"]')
      .click();
    await settle();
    setInputValue(target.querySelector('[data-gathering-task-field="name"]'), 'Bank the Forge');
    await settle();
    headerSaveButton(target).click();
    await settle();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    assert.deepEqual(saved.slice(1, 3), ['smithing', 'task-forge'], 'saved on the new system');

    await openTaskTab('results');
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settle();
    const search = target.querySelector('[data-gathering-drop-character-modifier-search] input');
    setInputValue(search, 'lore');
    await settle();
    const suggested = () =>
      [...target.querySelectorAll('[data-gathering-drop-character-modifier-suggestion]')].map(
        (node) => node.getAttribute('data-gathering-drop-character-modifier-suggestion')
      );
    assert.deepEqual(suggested(), ['mod-herbalism']);
    mountedStore.viewState.update((state) => ({
      ...state,
      worldModifiers: [{ id: 'mod-anvil', label: 'Anvil Lore' }],
    }));
    await settle();
    assert.deepEqual(suggested(), ['mod-anvil'], 'the drop search reads the library as it stands');
  });

  // The shell's writes to the gathering route model's selections, drafts and flags, one record
  // kind per row: each case reads what the library or the editor draws after the write.
  const LIBRARY_KINDS = Object.freeze([
    Object.freeze({
      kind: 'task',
      title: 'Task',
      section: 'Tasks',
      first: 'task-herbs',
      second: 'task-cavern',
      duplicateLabel: 'Duplicate gathering task',
      deleteLabel: 'Delete gathering task',
      storeOptions: {},
    }),
    Object.freeze({
      kind: 'event',
      title: 'Event',
      section: 'Events',
      first: 'event-owl',
      second: 'event-rockfall',
      duplicateLabel: 'Duplicate event',
      deleteLabel: 'Delete event',
      storeOptions: {
        gatheringLibraryEvents: [
          { id: 'event-owl', name: 'Owl Omen', enabled: true, dropRate: 10 },
          { id: 'event-rockfall', name: 'Rockfall', enabled: true, dropRate: 20 },
        ],
      },
    }),
  ]);

  /**
   * Mount on one library section. The kind's create, duplicate and delete writes answer through
   * `deliver`, and the first two add their record to the library as the real store does.
   */
  async function openLibrary(entry, { deliver = (value) => value, storeOptions, configure } = {}) {
    const calls = [];
    const store = createStore(calls, { ...entry.storeOptions, ...storeOptions });
    const collection = `${entry.kind}s`;
    const addToLibrary = (record) => {
      store.viewState.update((state) => {
        const system = state.gatheringConfig.systems.alchemy;
        const systems = {
          ...state.gatheringConfig.systems,
          alchemy: { ...system, [collection]: [...(system[collection] || []), record] },
        };
        return { ...state, gatheringConfig: { ...state.gatheringConfig, systems } };
      });
      return deliver(record);
    };
    store[`addGatheringLibrary${entry.title}`] = () =>
      addToLibrary({ id: `${entry.kind}-new`, name: 'New', enabled: true, dropRate: 10 });
    store[`duplicateGatheringLibrary${entry.title}`] = (_systemId, id) =>
      addToLibrary({ id: `${id}-copy`, name: 'Copy', enabled: true, dropRate: 10 });
    store[`deleteGatheringLibrary${entry.title}`] = () => deliver(true);
    configure?.(store);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await settleRouteExit();
    gatheringSubitem(entry.section).click();
    await settleRouteExit();
    return { calls, store };
  }

  const selectedRecord = (kind) =>
    target
      .querySelector(`.manager-gathering-${kind}-row.is-selected`)
      ?.getAttribute(`data-gathering-${kind}-id`);

  const headerButton = (label) =>
    Array.from(target.querySelectorAll('.manager-header-actions .fabricate-button')).find((button) =>
      button.textContent.includes(label)
    );

  const headerReadsUnsaved = () =>
    target.querySelector('.manager-header-actions').textContent.includes('Unsaved');

  async function pickRecord(kind, id) {
    target
      .querySelector(`[data-gathering-${kind}-id="${id}"] .manager-gathering-${kind}-identity`)
      .click();
    await settleRouteExit();
  }

  async function openEditor(kind, id) {
    target
      .querySelector(`[data-gathering-${kind}-id="${id}"] .fabricate-icon-button[aria-label^="Edit"]`)
      .click();
    await settleRouteExit();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, `gathering-${kind}-edit`);
  }

  async function rename(kind, name) {
    setInputValue(target.querySelector(`[data-gathering-${kind}-field="name"]`), name);
    await settleRouteExit();
  }

  for (const entry of LIBRARY_KINDS) {
    const { kind, title, first, second } = entry;
    const row = (id) => `[data-gathering-${kind}-id="${id}"]`;

    for (const [delivery, deliver] of [
      ['at once', (value) => value],
      ['once the store resolves', (value) => Promise.resolve(value)],
    ]) {
      it(`selects the ${kind} it creates or duplicates, answered ${delivery}`, async () => {
        await openLibrary(entry, { deliver });
        assert.equal(
          target.querySelector('aside.manager-inspector').getAttribute('aria-label'),
          kind === 'task' ? 'Selected gathering task inspector' : 'Selected environment inspector',
          'the aside names what the section selects'
        );
        headerButton('Create gathering').click();
        await settleRouteExit();
        assert.equal(selectedRecord(kind), `${kind}-new`, 'the created record');

        await pickRecord(kind, second);
        await runRowMenuCommand(row(second), entry.duplicateLabel);
        await settleRouteExit();
        assert.equal(selectedRecord(kind), `${second}-copy`, 'the duplicate');
      });

      it(`lets go of a deleted ${kind}, answered ${delivery}`, async () => {
        await openLibrary(entry, { deliver });
        await pickRecord(kind, second);
        await runRowMenuCommand(row(second), entry.deleteLabel);
        await settleRouteExit();
        assert.equal(selectedRecord(kind), first, 'the library falls back to its first record');
      });
    }

    it(`saves the ${kind} it opened, holding Save until the write lands`, async () => {
      let land;
      const writes = [];
      const { calls } = await openLibrary(entry, {
        configure: (store) => {
          store[`updateGatheringLibrary${title}`] = (systemId, id, draft) => {
            writes.push([systemId, id, draft.name]);
            return new Promise((resolve) => {
              land = resolve;
            });
          };
        },
      });
      await openEditor(kind, second);
      await rename(kind, 'Renamed');
      assert.ok(headerReadsUnsaved(), 'pre-condition: the rename reads unsaved');

      headerSaveButton(target).click();
      await settleRouteExit();
      const named = [['alchemy', second, 'Renamed']];
      assert.deepEqual(writes, named, 'the write names the record the editor opened, and its draft');
      assert.deepEqual(
        calls
          .filter((call) => call[0] === `confirmGatheringLibrary${title}CompositionLoss`)
          .map(([, systemId, id, draft]) => [systemId, id, draft.name]),
        named,
        'and so does the composition-loss check before it'
      );
      assert.ok(headerSaveButton(target).disabled, 'Save holds while the write is in flight');
      land(true);
      await settleRouteExit();
      assert.ok(!headerReadsUnsaved(), 'and the landed write is the new baseline');
    });

    it(`deletes the ${kind} it opened from the editor and lets go of it`, async () => {
      const originalConfirm = globalThis.confirm;
      globalThis.confirm = () => true;
      try {
        await openLibrary(entry);
        await pickRecord(kind, second);
        await openEditor(kind, second);
        headerButton(entry.deleteLabel).click();
        await settleRouteExit();
      } finally {
        globalThis.confirm = originalConfirm;
      }
      assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
      assert.equal(selectedRecord(kind), first, 'the library falls back to its first record');
    });

    // The environment editor holds the tab on Environments, so opening a composed record from it
    // is the one entry to the record editor that moves the tab.
    it(`opens a composed ${kind} from the environment editor on its own library tab`, async () => {
      const { store } = await openLibrary(entry);
      gatheringSubitem('Environments').click();
      await settleRouteExit();
      target
        .querySelector('[data-environment-id="env-forest"] .fabricate-icon-button[aria-label^="Edit"]')
        .click();
      await settleRouteExit();
      store.viewState.update((state) => ({
        ...state,
        environmentComposition: {
          compositionMode: 'automatic',
          [`${kind}s`]: [{ id: second, name: 'Composed', compositionState: 'includedByMatch' }],
        },
      }));
      target.querySelector(`#environment-tab-${kind}s`).click();
      await settleRouteExit();
      await runRowMenuCommand(
        `[data-environment-tab="${kind}s"] [data-record-id="${second}"]`,
        `Open source ${kind}`
      );
      await settleRouteExit();
      assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, `gathering-${kind}-edit`);
      assert.equal(
        gatheringSubitem(entry.section).getAttribute('aria-current'),
        'page',
        'the rail marks the record kind’s own tab'
      );
    });

    it(`states why an invalid ${kind} draft refused to save on the way out`, async () => {
      await openLibrary(entry, {
        storeOptions: {
          [`confirmDiscardGathering${title}Result`]: 'save',
          gatheringTaskValidation: () => ({ valid: false, errors: ['Name clash'] }),
        },
      });
      await openEditor(kind, second);
      await rename(kind, '');
      worldNavItem('parties').click();
      await settleRouteExit();
      assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, `gathering-${kind}-edit`);
      assert.equal(
        target.querySelector(`[data-gathering-${kind}-save-error]`)?.textContent.trim(),
        kind === 'task' ? 'Name clash' : 'Name is required.',
        'the first validation error is the save error'
      );
    });
  }

  // Each drop verb selects the row it lands on, so the inspector beside the table edits it next.
  it('selects the drop row each drop verb lands on', async () => {
    const row = (id) => ({ id, componentId: 'c3', quantity: 1, dropRate: 40, enabled: true });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: [row('drop-a'), row('drop-b'), row('drop-c')] }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async () => ({ id: 'c1', name: 'Iron Ore' }),
        },
      },
    });
    flushSync();
    navButton('Gathering').click();
    await settleRouteExit();
    gatheringSubitem('Tasks').click();
    await settleRouteExit();
    await openEditor('task', 'task-herbs');
    await openTaskTab('results');
    const rows = () =>
      Array.from(target.querySelectorAll('tr[data-gathering-task-drop-id]')).map((node) =>
        node.getAttribute('data-gathering-task-drop-id')
      );
    const selected = () =>
      target
        .querySelector('tr.is-selected[data-gathering-task-drop-id]')
        ?.getAttribute('data-gathering-task-drop-id');
    const press = async (node) => {
      node.click();
      await settleRouteExit();
    };
    const inspectorAction = (label) =>
      target.querySelector(`.manager-inspector .manager-drop-editor-actions [aria-label="${label}"]`);

    await press(target.querySelector('[data-gathering-add-drop="toolbar"]'));
    assert.equal(selected(), rows().at(-1), 'an added drop is selected');

    await press(target.querySelector('[data-gathering-task-drop-id="drop-b"]'));
    await press(inspectorAction('Duplicate'));
    const copy = rows()[2];
    assert.ok(!['drop-b', 'drop-c'].includes(copy), 'the copy lands after its source');
    assert.equal(selected(), copy, 'a duplicate is selected');

    await press(inspectorAction('Delete'));
    assert.equal(selected(), 'drop-c', 'a deleted drop hands the selection to its neighbour');

    await press(target.querySelector('[data-gathering-task-drop-id="drop-a"]'));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    const payload = JSON.stringify({ type: 'Item', uuid: 'Item.imported' });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (type) => (type === 'text/plain' ? payload : '') },
    });
    target.querySelector('[data-gathering-task-drop-id="drop-c"]').dispatchEvent(drop);
    await settleRouteExit();
    assert.equal(selected(), 'drop-c', 'an imported item selects the row it landed on');
  });

  /** Open the Results tab of a task whose drop rows and reward mode the options shape (issue 1782). */
  async function openDropTable(storeOptions) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore([], storeOptions), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await settleRouteExit();
    gatheringSubitem('Tasks').click();
    await settleRouteExit();
    await openEditor('task', 'task-herbs');
    await openTaskTab('results');
    const ids = () =>
      [...target.querySelectorAll('tr[data-gathering-task-drop-id]')].map(
        (node) => node.dataset.gatheringTaskDropId
      );
    const selectedId = () =>
      target.querySelector('tr.is-selected[data-gathering-task-drop-id]')?.dataset
        .gatheringTaskDropId;
    return { ids, selectedId };
  }

  // A lone row is also the editor's default selection, so this proves the empty state's add only;
  // the next test proves an add selects the NEW row over another one.
  it('selects the first drop rule added from the empty drop table', async () => {
    const { ids, selectedId } = await openDropTable({ taskDropRows: [] });
    assert.deepEqual(ids(), [], 'the table opens empty');
    target.querySelector('[data-gathering-add-drop="empty"]').click();
    await settleRouteExit();
    assert.equal(ids().length, 1, 'the empty state adds a row');
    assert.equal(selectedId(), ids()[0], 'and selects it, so the rail edits it next');
  });

  it('selects a drop rule added from the toolbar over the rule that was selected', async () => {
    const row = (id) => ({ id, componentId: 'c1', quantity: 1, dropRate: 40, enabled: true });
    const { ids, selectedId } = await openDropTable({
      taskDropRows: [row('drop-a'), row('drop-b')],
    });
    target.querySelector('[data-gathering-task-drop-id="drop-b"]').click();
    await settleRouteExit();
    assert.equal(selectedId(), 'drop-b', 'precondition: another rule is selected');
    target.querySelector('[data-gathering-add-drop="toolbar"]').click();
    await settleRouteExit();
    const added = ids().filter((id) => id !== 'drop-a' && id !== 'drop-b');
    assert.equal(added.length, 1, 'the toolbar adds one rule');
    assert.equal(selectedId(), added[0], 'and the rail moves to it');
  });

  it('keeps the selected drop selected when a rank rocker moves it', async () => {
    const row = (id) => ({ id, componentId: 'c1', quantity: 1, dropRate: 40, enabled: true });
    const { ids, selectedId } = await openDropTable({
      taskDropRows: [row('drop-a'), row('drop-b'), row('drop-c')],
      rewardSelectionMode: 'highestRankedDrop',
    });
    target.querySelector('[data-gathering-task-drop-id="drop-b"]').click();
    await settleRouteExit();
    assert.equal(selectedId(), 'drop-b');
    target
      .querySelector(
        ':scope [data-gathering-task-drop-id="drop-b"] [data-gathering-task-drop-move="down"]'
      )
      .click();
    await settleRouteExit();
    assert.deepEqual(ids(), ['drop-a', 'drop-c', 'drop-b'], 'the rocker moved the row');
    assert.equal(selectedId(), 'drop-b', 'and the selection stayed with it');
  });

  /** Mount on the Tasks section of a system whose library the options shape. */
  async function openTasks(storeOptions = {}) {
    const store = createStore([], storeOptions);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    navButton('Gathering').click();
    await settleRouteExit();
    gatheringSubitem('Tasks').click();
    await settleRouteExit();
    return store;
  }

  // The inspector and the editor draw with the presenters and flags the shell hands them.
  it('names the selected task and its drop through the shell’s presenters', async () => {
    const store = await openTasks();
    const inspector = () => target.querySelector('.manager-inspector');
    assert.equal(
      inspector().querySelector('[data-gathering-task-inspector] .manager-inspector-name').textContent.trim(),
      'Gather Moon Herbs'
    );
    assert.ok(inspector().textContent.includes('High Day, Clear Sky'), 'the availability chip');

    await openEditor('task', 'task-herbs');
    await openTaskTab('results');
    const stack = inspector().querySelector('.manager-drop-inspector-stack');
    assert.equal(
      stack.querySelector('img.manager-recipe-preview').getAttribute('src'),
      'icons/consumables/plants/nightshade.jpg',
      'the selected drop pictures its managed item'
    );
    const biome = stack.querySelector('[data-gathering-drop-condition-modifiers="biome"]');
    assert.equal(biome.querySelector('.manager-card-title').textContent.trim(), 'Biome modifiers');
    assert.equal(
      biome.querySelector('.manager-card-title + .manager-muted').textContent.trim(),
      "Adjust this drop's chance based on the gathering environment's biomes."
    );
    assert.equal(
      biome.querySelector('.fabricate-rule-row-icon i').getAttribute('class'),
      'fas fa-tree',
      'a biome modifier takes its vocabulary icon'
    );

    // The model reads the selected system live, so a republished component name reaches the drop.
    store.viewState.update((state) => {
      const managedItemOptions = state.selectedSystem.managedItemOptions.map((option) =>
        option.id === 'c3' ? { ...option, name: 'Renamed Nightshade' } : option
      );
      return { ...state, selectedSystem: { ...state.selectedSystem, managedItemOptions } };
    });
    await settleRouteExit();
    assert.equal(
      inspector().querySelector('.manager-drop-inspector-stack .manager-inspector-name').textContent.trim(),
      'Renamed Nightshade'
    );
  });

  it('keeps the drop inspector to a task that rolls d100', async () => {
    await openTasks({ taskResolutionMode: 'progressive' });
    await openEditor('task', 'task-herbs');
    assert.ok(!target.querySelector('aside.manager-inspector'), 'Overview is full width');
    await openTaskTab('results');
    assert.ok(Boolean(target.querySelector('.manager-inspector')), 'a progressive task keeps the aside');
    assert.ok(
      !target.querySelector('.manager-inspector [data-gathering-task-drop-inspector]'),
      'but it draws no drop inspector'
    );
  });

  // Only a d100 task's Results tab keeps the rail, whose drop editor is the declared leaf, and the
  // tab is the shell's: it returns to Overview when the route or the task changes (issue 1522).
  it('keeps the drop rail to a d100 task`s Results tab, and reopens the next task on Overview', async () => {
    await openTasks();
    await openEditor('task', 'task-herbs');
    const manager = () => target.querySelector('.fabricate-manager');
    const selectedTab = () =>
      target.querySelector('[data-gathering-task-tab][aria-selected="true"]')?.dataset
        .gatheringTaskTab;
    for (const tab of ['overview', 'requirements']) {
      await openTaskTab(tab);
      assert.equal(selectedTab(), tab, `${tab} opens`);
      assert.equal(manager().dataset.gatheringTaskLayout, 'full', `${tab} is full width`);
      assert.ok(!target.querySelector('aside.manager-inspector'), `${tab} draws no rail`);
    }
    await openTaskTab('results');
    assert.equal(manager().dataset.gatheringTaskLayout, undefined, 'Results keeps its track');
    assert.ok(
      Boolean(
        target.querySelector(':scope aside.manager-inspector [data-gathering-task-drop-inspector]')
      ),
      'the rail holds the selected-drop editor'
    );

    // A save keeps the tab; leaving and re-entering, even the same task, opens on Overview.
    target.querySelector('[data-gathering-add-drop="toolbar"]').click();
    await settleRouteExit();
    headerSaveButton(target).click();
    await settleRouteExit();
    assert.equal(selectedTab(), 'results', 'Save keeps the tab');
    for (const task of ['task-herbs', 'task-cavern']) {
      target.querySelector('[data-gathering-task-back]').click();
      await settleRouteExit();
      await openEditor('task', task);
      assert.equal(selectedTab(), 'overview', `${task} reopens on Overview`);
      assert.ok(!target.querySelector('aside.manager-inspector'), 'with no rail');
    }
  });

  it('keeps the drop table`s page across a tab round trip', async () => {
    const dropRows = Array.from({ length: 7 }, (_, index) => ({
      id: `drop-trip-${index + 1}`,
      componentId: 'c1',
      quantity: 1,
      dropRate: 10,
      enabled: true,
    }));
    await openTasks({ taskDropRows: dropRows });
    await openEditor('task', 'task-herbs');
    await openTaskTab('results');
    const page = () =>
      target.querySelector(':scope .manager-task-drops-card [data-pagination-page]').textContent.trim();
    target.querySelector(':scope .manager-task-drops-card [data-pagination-next]').click();
    await settleRouteExit();
    assert.equal(page(), 'Page 2 of 2');
    await openTaskTab('overview');
    await openTaskTab('results');
    assert.equal(page(), 'Page 2 of 2', 'the page survives the round trip');
    assert.ok(Boolean(target.querySelector('[data-gathering-task-drop-id="drop-trip-6"]')));
  });

  // Every list state the view owns, each set away from its default on its own tab (issue 1522).
  const DROPS = '.manager-task-drops-card';
  const BROWSER = '[data-gathering-task-component-browser]';
  const TOOLS = '[data-gathering-task-required-tools]';
  const pageOf = (card) => target.querySelector(`${card} [data-pagination-page]`).textContent.trim();
  const pageSizeOf = (card) => selectTriggerText(target, `${card} [data-pagination-size]`);
  const pressIn = async (selector) => {
    target.querySelector(selector).click();
    await settleRouteExit();
  };
  const TAB_SURVIVING_STATES = [
    {
      state: 'pageSize',
      tab: 'results',
      set: () => chooseSelectOption(target, `${DROPS} [data-pagination-size]`, 10),
      read: () => pageSizeOf(DROPS),
      expected: '10',
    },
    {
      state: 'componentPageIndex',
      tab: 'results',
      set: () => pressIn(`${BROWSER} [data-pagination-next]`),
      read: () => pageOf(BROWSER),
      expected: 'Page 2 of 2',
    },
    {
      state: 'componentPageSize',
      tab: 'results',
      set: () => chooseSelectOption(target, `${BROWSER} [data-pagination-size]`, 9),
      read: () => pageSizeOf(BROWSER),
      expected: '9',
    },
    {
      state: 'selectedComponentTags',
      tab: 'results',
      set: async () => {
        setInputValue(target.querySelector(':scope [data-gathering-component-tag-search] input'), 'moon');
        await settleRouteExit();
        await pressIn('[data-gathering-component-tag-suggestion="moon"]');
      },
      read: () =>
        [...target.querySelectorAll('[data-gathering-component-tag-pill]')]
          .map((pill) => pill.dataset.gatheringComponentTagPill)
          .join(','),
      expected: 'moon',
    },
    {
      state: 'toolPageIndex',
      tab: 'requirements',
      set: () => pressIn(`${TOOLS} [data-pagination-next]`),
      read: () => pageOf(TOOLS),
      expected: 'Page 2 of 2',
    },
    {
      state: 'toolPageSize',
      tab: 'requirements',
      set: () => chooseSelectOption(target, `${TOOLS} [data-pagination-size]`, 9),
      read: () => pageSizeOf(TOOLS),
      expected: '9',
    },
  ];

  it('keeps every list state the view owns across a tab round trip', async () => {
    await openTasks({
      extendedComponentCards: true,
      taskDropRows: Array.from({ length: 12 }, (_, index) => ({
        id: `drop-trip-${index + 1}`,
        componentId: 'c1',
        quantity: 1,
        dropRate: 10,
        enabled: true,
      })),
      gatheringLibraryTools: Array.from({ length: 8 }, (_, index) => ({
        id: `tool-${index}`,
        label: `Tool ${index}`,
        enabled: true,
        componentId: 'c1',
      })),
    });
    await openEditor('task', 'task-herbs');
    for (const { state, tab, set, read, expected } of TAB_SURVIVING_STATES) {
      await openTaskTab(tab);
      await set();
      await settleRouteExit();
      assert.equal(read(), expected, `precondition: ${state} is set`);
      await openTaskTab('overview');
      await openTaskTab(tab);
      assert.equal(read(), expected, `${state} survives the round trip`);
    }
  });

  // The one piece of editor state that does NOT survive a tab switch: an open menu is transient.
  it('closes an open availability menu when its tab is left', async () => {
    await openTasks();
    await openEditor('task', 'task-herbs');
    await openTaskTab('requirements');
    const trigger = () =>
      target.querySelector(':scope [data-gathering-task-field="biomes"] .manager-condition-menu-button');
    await pressIn('[data-gathering-task-field="biomes"] .manager-condition-menu-button');
    assert.equal(trigger().getAttribute('aria-expanded'), 'true', 'precondition: the menu opens');
    await openTaskTab('overview');
    assert.ok(
      !document.querySelector('[data-gathering-task-availability-option]'),
      'its portaled panel leaves with the tab'
    );
    await openTaskTab('requirements');
    assert.equal(trigger().getAttribute('aria-expanded'), 'false', 'and it is shut on return');
    assert.ok(!document.querySelector('[data-gathering-task-availability-option]'));
  });

  // The Validation tab reads the header Save's own evaluation (issue 1522): its errors are the
  // blocking rows, and the warnings are the draft's.
  const validationRows = () =>
    [...target.querySelectorAll(':scope [data-gathering-task-validation-check]')].map((row) => [
      row.dataset.gatheringTaskValidationCheck,
      /\bis-(pass|warn|block)\b/.exec(row.className)?.[1],
    ]);
  const validationMarks = () =>
    [
      ...target.querySelectorAll(
        ':scope [data-gathering-task-tab="validation"] [data-gathering-task-tab-badge]'
      ),
    ].map((mark) => [mark.dataset.badgeTone, mark.textContent.trim()]);
  const verdict = () =>
    target.querySelector(':scope .manager-recipe-rail-summary-title').textContent.trim();
  const NO_TIERS_CHECK = {
    routed: { type: 'relative', relativeOutcomes: [], fixedOutcomes: [] },
  };
  const NAME_OR_RESULT_ERRORS = (task) => {
    const nameErrors = String(task?.name ?? '').trim() ? [] : ['Task name is required'];
    const resultErrors = ['Task check tier "Rich" requires exactly one matching result group'];
    return { valid: false, errors: [...nameErrors, ...resultErrors], nameErrors, resultErrors };
  };

  it('warns, without blocking, of a routed task under a check with no tiers', async () => {
    await openTasks({ taskResolutionMode: 'routed', gatheringCraftingCheck: NO_TIERS_CHECK });
    await openEditor('task', 'task-herbs');
    await openTaskTab('validation');
    assert.deepEqual(validationRows(), [
      ['name', 'pass'],
      ['results', 'pass'],
      ['routedTiers', 'warn'],
    ]);
    assert.deepEqual(railCounts(target), { passing: 2, warnings: 1, blocking: 0 });
    assert.deepEqual(validationMarks(), [['warning', '1']], 'the badge agrees with the counts');
    assert.equal(verdict(), 'Saves with warnings');
  });

  it('blocks Save on one blocking row per error, and says the task cannot be saved', async () => {
    await openTasks({
      taskResolutionMode: 'routed',
      gatheringTaskValidation: NAME_OR_RESULT_ERRORS,
    });
    await openEditor('task', 'task-herbs');
    setInputValue(target.querySelector('[data-gathering-task-field="description"]'), 'Changed');
    await settleRouteExit();
    assert.ok(headerSaveButton(target).disabled, 'the header Save reads the same evaluation');
    await openTaskTab('validation');
    // The surface lifts the blocking row; the store double's check has no tiers, so one warns.
    assert.deepEqual(validationRows(), [
      ['name', 'pass'],
      ['result-1', 'block'],
      ['routedTiers', 'warn'],
    ]);
    assert.deepEqual(railCounts(target), { passing: 1, warnings: 1, blocking: 1 });
    assert.deepEqual(validationMarks(), [
      ['danger', '1'],
      ['warning', '1'],
    ]);
    assert.equal(verdict(), 'Cannot be saved');
    assert.equal(
      target
        .querySelector(':scope [data-gathering-task-validation-check="result-1"] .manager-recipe-val-pill')
        .textContent.trim(),
      'Blocks save',
      'the blocking pill names the Save gate'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'full');
    assert.ok(!target.querySelector('aside.manager-inspector'), 'Validation is full width');
  });

  it('sends each failing row to its control or its panel, and says where focus landed', async () => {
    await openTasks({ taskResolutionMode: 'routed', gatheringTaskValidation: NAME_OR_RESULT_ERRORS });
    await openEditor('task', 'task-herbs');
    setInputValue(target.querySelector('[data-gathering-task-field="name"]'), '');
    await settleRouteExit();
    const announcement = async () => {
      await new Promise((done) => setTimeout(done, ANNOUNCE_AFTER_FOCUS_MS + 40));
      flushSync();
      return target.querySelector('[data-gathering-task-issue-announcement]').textContent.trim();
    };
    const view = async (row) => {
      await openTaskTab('validation');
      target
        .querySelector(`[data-gathering-task-validation-check="${row}"] [data-gathering-task-validation-view]`)
        .click();
      await settleRouteExit();
      await settleRouteExit();
    };

    await view('name');
    const name = target.querySelector('[data-gathering-task-field="name"]');
    assert.ok(document.activeElement === name, 'the name row reaches the name input');
    assert.equal(await announcement(), 'Overview — Name');

    await view('result-1');
    const panel = target.querySelector('[data-gathering-task-panel="results"]');
    assert.ok(Boolean(panel), 'a result row opens Results');
    assert.ok(document.activeElement === panel, 'and, naming no control, lands on its panel');
    assert.equal(await announcement(), 'Results');
  });

  it('counts the Results errors in a notice whose action opens Validation', async () => {
    await openTasks({ taskResolutionMode: 'routed', gatheringTaskValidation: NAME_OR_RESULT_ERRORS });
    await openEditor('task', 'task-herbs');
    for (const tab of ['overview', 'requirements', 'validation']) {
      await openTaskTab(tab);
      const stray = target.querySelector(':scope [data-gathering-task-results-validation]');
      assert.ok(!stray, `the Results notice stays on Results, not on ${tab}`);
    }
    await openTaskTab('results');
    const notice =target.querySelector(':scope [data-notice-position="page"] [data-gathering-task-results-validation]');
    assert.match(notice.textContent, /1 result issue blocks save/);
    notice.querySelector('button').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('[data-gathering-task-tab][aria-selected="true"]').dataset.gatheringTaskTab,
      'validation'
    );
    assert.ok(Boolean(target.querySelector('[data-gathering-task-validation]')));
  });

  it('keeps a d100 task`s Validation tab full width', async () => {
    await openTasks();
    await openEditor('task', 'task-herbs');
    await openTaskTab('validation');
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'full');
    assert.ok(!target.querySelector('aside.manager-inspector'), 'no drop rail on Validation');
  });

  it('shows the economy cards the system economy turns on', async () => {
    const store = await openTasks();
    store.viewState.update((state) => {
      const alchemy = state.gatheringConfig.systems.alchemy;
      const economy = { ...alchemy.economy, stamina: { enabled: true }, nodes: { enabled: true } };
      const systems = { ...state.gatheringConfig.systems, alchemy: { ...alchemy, economy } };
      return { ...state, gatheringConfig: { ...state.gatheringConfig, systems } };
    });
    await settleRouteExit();
    await openEditor('task', 'task-herbs');
    assert.ok(Boolean(target.querySelector('[data-gathering-task-nodes]')), 'resource nodes');
    await openTaskTab('requirements');
    assert.ok(Boolean(target.querySelector('[data-gathering-task-stamina]')), 'stamina');
  });

  it('deletes the editing gathering task from the editor toolbar and returns to the task browser', async () => {
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

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );

    const headerDeleteButton = target.querySelector(
      '.manager-header-actions .fabricate-button.is-danger'
    );
    assert.ok(headerDeleteButton, 'editor toolbar should expose a destructive delete button');
    assert.ok(headerDeleteButton.textContent.includes('Delete gathering task'));
    headerDeleteButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'deleteGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      ),
      `expected deleteGatheringLibraryTask call for task-herbs, got ${JSON.stringify(calls)}`
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
  });

  // A gathering task's results keep their component picker and its quantity bump (issue 1773): only a
  // recipe's result set took the `Result` adder, and a task's rows are not reward rows.
  it('raises the quantity of a Direct task result when its component is picked again', async () => {
    const calls = [];
    mountManager(calls, {
      taskResolutionMode: 'straight',
      taskResultGroups: [
        { id: 'group-ore', name: '', results: [{ id: 'result-ore', componentId: 'c1', quantity: 2 }] },
      ],
      gatheringTaskValidation: () => ({ valid: true, errors: [], resultErrors: [] }),
    });
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const results = target.querySelector('[data-gathering-task-results="straight"]');
    const adder = results.querySelector('[data-recipe-add="result-item"]');
    assert.equal(adder.textContent.trim(), 'Add item', 'the component picker, not the Result adder');
    assert.ok(!results.querySelector('.is-reward'), 'and its rows are no reward rows');
    adder.click();
    await tick();
    flushSync();
    [...document.querySelectorAll('.manager-travel-option')]
      .find((option) => option.textContent.includes('Iron Ore'))
      .click();
    await tick();
    flushSync();

    target.querySelector(':scope .manager-header-actions .fabricate-button.is-primary').click();
    await tick();
    flushSync();
    const saved = calls.find((call) => call[0] === 'updateGatheringLibraryTask');
    assert.ok(saved, 'Save persists the task');
    assert.deepEqual(saved[3].resultGroups[0].results, [
      { id: 'result-ore', componentId: 'c1', quantity: 3 },
    ]);
  });

  it('authors task-owned gathering modes while retaining inactive result sources across save and reload', async () => {
    const calls = [];
    const retainedGroups = [
      {
        id: 'group-rich',
        name: '  Rich Vein ',
        results: [{ id: 'result-ore', componentId: 'c1', quantity: 2 }],
      },
      {
        id: 'group-poor',
        name: 'Poor Vein',
        results: [{ id: 'result-coal', componentId: 'c4', quantity: 1 }],
      },
    ];
    mountManager(calls, {
      taskResultGroups: retainedGroups,
      gatheringResolutionMode: 'progressive',
      gatheringTaskValidation: (task) =>
        task?.resolutionMode === 'straight'
          ? {
              valid: false,
              errors: ['Direct mode requires exactly one non-empty result group'],
              resultErrors: ['Direct mode requires exactly one non-empty result group'],
            }
          : { valid: true, errors: [], resultErrors: [] },
      gatheringCraftingCheck: {
        routed: {
          type: 'relative',
          relativeOutcomes: [
            { id: 'rich', name: 'rich vein', success: true, dc: 5 },
            { id: 'poor', name: 'Poor Vein', success: true, dc: 0 },
          ],
          fixedOutcomes: [],
        },
      },
    });
    await tick();
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    // The mode is an Overview control and the results a Results card (issue 1522).
    const modeInput = (mode) =>
      target.querySelector(`[data-gathering-task-resolution-mode] input[value="${mode}"]`);
    assert.ok(modeInput('d100'), 'the task editor exposes its own resolution-mode control');
    assert.equal(
      modeInput('d100').checked,
      true,
      'a task mode is independent of the legacy progressive economy mode'
    );
    assert.ok(!target.querySelector('.manager-inspector'), 'Overview is full width under d100');
    await openTaskTab('results');
    assert.ok(target.querySelector('[data-gathering-task-drops-table]'));
    assert.ok(!target.querySelector('[data-gathering-task-results]'));
    assert.ok(target.querySelector('.manager-inspector'), 'd100 keeps the drop inspector');
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, undefined);

    await openTaskTab('overview');
    const straight = modeInput('straight');
    straight.checked = true;
    straight.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    await openTaskTab('results');
    assert.ok(target.querySelector('[data-gathering-task-results="straight"]'));
    assert.ok(target.querySelector('[data-recipe-result-item]'));
    assert.ok(target.textContent.includes('Iron Ore'), 'straight results are visible after acting');
    assert.ok(!target.querySelector('[data-gathering-task-drops-table]'));
    assert.ok(
      !target.querySelector('.manager-inspector'),
      'Direct suppresses the entire unused inspector'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'full');
    assert.ok(
      target
        .querySelector('[data-gathering-task-results-validation]')
        ?.textContent.includes('1 result issue blocks save'),
      'the blocking count is rendered beside straight results'
    );
    assert.ok(
      !target.querySelector('[data-gathering-task-drop-inspector]'),
      'inactive d100 rows do not keep their inspector active'
    );

    await openTaskTab('overview');
    const routed = modeInput('routed');
    routed.checked = true;
    routed.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    await openTaskTab('results');
    assert.ok(target.querySelector('[data-gathering-task-results="routed"]'));
    assert.ok(
      !target.querySelector('.manager-inspector'),
      'Check suppresses the entire unused inspector'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'full');
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-routed-tier-status]')).map((row) => [
        row.dataset.gatheringRoutedTierStatus,
        row.dataset.matchCount,
      ]),
      [
        ['rich', '1'],
        ['poor', '1'],
      ],
      'routed tiers match result-group names after trimming and case folding'
    );

    target.querySelector('.manager-header-actions .fabricate-button.is-primary').click();
    await tick();
    flushSync();
    const saved = calls.find(
      (call) =>
        call[0] === 'updateGatheringLibraryTask' &&
        call[1] === 'alchemy' &&
        call[2] === 'task-herbs' &&
        call[3].resolutionMode === 'routed'
    );
    assert.ok(saved, 'Save persists the selected task resolution mode');
    assert.deepEqual(saved[3].dropRows.map((row) => row.id), ['drop-nightshade']);
    assert.deepEqual(saved[3].resultGroups, retainedGroups);

    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-gathering-task-resolution-mode] input[value="routed"]').checked,
      true,
      'saved task mode reloads into the selector'
    );
    await openTaskTab('results');
    assert.ok(target.textContent.includes('Iron Ore'));
    assert.ok(target.textContent.includes('Coal'));
  });

  it('defaults an absent task resolution mode to d100 and removes the economy selector', async () => {
    mountManager([], { omitTaskResolutionMode: true, gatheringResolutionMode: 'routed' });
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-gathering-task-resolution-mode] input[value="d100"]').checked,
      true
    );

    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector('[data-gathering-resolution-mode]'));
    assert.ok(target.querySelector('[data-economy-mode-card]'));
  });

  it('picks a task default environment through the converted picker and saves it', async () => {
    // The route's own proof of issue 1510's conversion: the editor-only suite mounts the component
    // directly, so nothing else shows the panel portaling into the real manager application root
    // and the choice surviving a save.
    const calls = [];
    mountManager(calls);
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const picker = '[data-gathering-task-field="defaultEnvironmentId"]';
    assert.equal(
      selectTriggerText(target, picker),
      'None (ask on drop)',
      'a task with no default environment reads as the sentinel, not as the first environment'
    );
    chooseSelectOption(target, picker, 'env-cavern');
    await tick();
    flushSync();
    assert.equal(
      selectTriggerText(target, picker),
      'Quiet Cavern',
      'the trigger reads back the chosen environment by name'
    );

    headerSaveButton(target).click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[2] === 'task-herbs' &&
          call[3].defaultEnvironmentId === 'env-cavern'
      ),
      'the chosen environment reaches the store on save'
    );
  });

  it('edits gathering task drop rules from unresolved row through inspector modifiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async () => ({ id: 'c2', name: 'Glass Vial' }),
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const knownDropIds = new Set(
      Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
        (node) => node.dataset.gatheringTaskDropId
      )
    );
    Array.from(target.querySelectorAll('.manager-task-drops-card caption .fabricate-button'))
      .find((button) => button.textContent.includes('Add drop rule'))
      .click();
    await tick();
    flushSync();

    const addedDropRow = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).find(
      (node) => !knownDropIds.has(node.dataset.gatheringTaskDropId)
    );
    assert.ok(addedDropRow, 'add drop should stage an unresolved selected drop row');
    const addedRow = { id: addedDropRow.dataset.gatheringTaskDropId };
    assert.ok(addedDropRow.querySelector('[data-gathering-task-drop-zone]'));
    assert.ok(addedDropRow.textContent.includes('No Component'));
    assert.ok(addedDropRow.textContent.includes('Create or assign'));
    // The EMPTY branch of the row's keyboard path (issue 1512): the zero-point case, and the only
    // place the shared-wrapper claim can fail, because a new row is always born in it.
    assertDropComponentCellKeyboardPath(addedDropRow, { empty: true, label: 'Create or assign' });
    assert.equal(addedDropRow.textContent.includes('Drop component'), false);
    assert.equal(addedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(addedDropRow.textContent.includes('Quantity'), false);
    assert.equal(addedDropRow.querySelector('[aria-label="Select drop rule"]'), null);
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await tick();
    flushSync();
    assert.ok(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Nightshade With An Exceptionally Long Localized Component Name')
    );
    addedDropRow.click();
    await tick();
    flushSync();
    assert.equal(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Drop component'),
      false
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
      ).value,
      '25'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-count] input'
      ).value,
      '1'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Duplicate"]'
      ),
      null
    );
    assert.equal(
      target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Delete"]'),
      null
    );

    const inspectorSlider = target.querySelector(
      '[data-gathering-task-drop-inspector] input[type="range"]'
    );
    inspectorSlider.value = '100';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate"]').click();
    await tick();
    flushSync();
    const unresolvedDropsAtRate100 = Array.from(
      target.querySelectorAll('[data-gathering-task-drop-id]')
    ).filter((node) => node.textContent.includes('No Component'));
    assert.ok(
      unresolvedDropsAtRate100.length >= 2,
      'duplicate should stage a second unresolved drop row'
    );
    target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`).click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Delete"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`),
      null,
      'delete should stage removal of the row'
    );
  });

  it('browses and drags managed components inside the gathering task editor', async () => {
    const calls = [];
    const importedDrops = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          extendedComponentCards: true,
          taskDropRows: [
            {
              id: 'drop-empty',
              componentId: '',
              itemUuid: '',
              systemItemId: '',
              name: '',
              quantity: 1,
              dropRate: 25,
              enabled: false,
            },
            {
              id: 'drop-stale',
              componentId: 'c3',
              itemUuid: 'Item.stale',
              systemItemId: 'legacy-system-item',
              name: 'Legacy Name',
              quantity: 1,
              dropRate: 40,
              enabled: true,
            },
          ],
        }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c1', name: 'Iron Ore' };
          },
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const browser = target.querySelector('[data-gathering-task-component-browser]');
    const dropsCard = target.querySelector('.manager-task-drops-card');
    assert.ok(browser, 'component browser should render in the task editor');
    assert.equal(
      Boolean(browser.compareDocumentPosition(dropsCard) & Node.DOCUMENT_POSITION_FOLLOWING),
      true,
      'component browser should render above drop rules'
    );
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(browser.textContent.includes('Iron Ore'));
    assert.equal(
      browser.textContent.includes('River Salt'),
      false,
      'seventh component should start on the next page'
    );

    const nameSearch = target.querySelector('[aria-label="Search component names"]');
    nameSearch.value = 'coal';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 1);
    assert.ok(browser.textContent.includes('Coal'));

    nameSearch.value = 'fuel';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      0,
      'component browser name search should not match descriptions'
    );

    nameSearch.value = '';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    tagSearch.value = 'her';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const tagList = target.querySelector('[data-gathering-component-tag-suggestions]');
    assert.equal(tagSearch.getAttribute('role'), 'combobox');
    assert.equal(tagSearch.getAttribute('aria-controls'), tagList.id, 'the field names its list');
    assert.equal(tagList.getAttribute('role'), 'listbox');
    assert.ok(
      tagList.parentElement.classList.contains('fabricate-manager'),
      'the list floats in the application root rather than inside the browser card'
    );
    assert.equal(tagList.querySelector('[role="option"]').getAttribute('tabindex'), '-1');
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('herb'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 3);
    assert.ok(browser.textContent.includes('Nightshade'));
    assert.ok(browser.textContent.includes('Moon Fern'));
    assert.ok(browser.textContent.includes('Sun Petal'));

    tagSearch.value = 'moo';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('moon'))
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      1,
      'selected component tags should require all tags'
    );
    assert.ok(browser.textContent.includes('Moon Fern'));
    const selectedTagPills = Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill]')
    );
    assert.ok(
      selectedTagPills.every((pill) => pill.classList.contains('manager-selected-tag-pill')),
      'selected component tags should render as removable pills'
    );

    for (const pill of Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill] button')
    )) {
      pill.click();
      await tick();
      flushSync();
    }

    function dragPayloadFrom(card) {
      let raw = '';
      const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(dragStart, 'dataTransfer', {
        value: {
          setData: (type, value) => {
            if (type === 'text/plain') raw = value;
          },
          effectAllowed: '',
        },
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(row, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => (type === 'text/plain' ? raw : '') },
      });
      row.dispatchEvent(dropEvent);
    }

    const emptyRow = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    const glassPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c2"]')
    );
    assert.deepEqual(JSON.parse(glassPayload), {
      type: 'FabricateManagedComponent',
      componentId: 'c2',
    });
    dropPayloadOn(emptyRow, glassPayload);
    await tick();
    flushSync();
    const emptyRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    assert.ok(
      emptyRowAfter && emptyRowAfter.textContent.includes('Glass Vial'),
      'managed-component drag should stage the new component on the drop row'
    );

    const staleRow = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    const coalPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c4"]')
    );
    dropPayloadOn(staleRow, coalPayload);
    await tick();
    flushSync();
    const staleRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    assert.ok(
      staleRowAfter && !staleRowAfter.textContent.includes('Legacy Name'),
      'managed-component drag onto a stale row should stage the replacement'
    );

    dropPayloadOn(staleRow, JSON.stringify({ type: 'Item', uuid: 'Item.imported' }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.deepEqual(
      importedDrops,
      [{ type: 'Item', uuid: 'Item.imported' }],
      'non-managed drops should keep using the import flow'
    );
  });

  it('keeps the component browser per-page selector after a page size fits everything on one page', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { extendedComponentCards: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const footer = target.querySelector('.manager-task-component-browser-footer');
    const sizeSelect = () => footer.querySelector('[data-pagination-size]');
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(sizeSelect(), 'per-page selector should render while multiple pages exist');
    assert.ok(
      footer.querySelector('[data-pagination-next]'),
      'next-page control should render while multiple pages exist'
    );

    // Selecting 9 fits all seven components on a single page. The per-page selector must
    // survive so the user can still switch back — the prev/next nav is the only part that
    // should disappear once there is a single page.
    chooseSelectOption(target, '[data-pagination-size]', 9);
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      8,
      'choosing nine per page should show every component on one page'
    );
    assert.ok(
      sizeSelect(),
      'per-page selector must remain visible when the chosen size fits everything on one page'
    );
    // THE CONTROL STATES ITS VALUE AS A LABEL NOW (issue 1504). A native `<select>` carried it in
    // `.value`; the converted trigger renders the chosen option's label, so what a GM reads is
    // `9` as text rather than `9` as an attribute.
    assert.equal(
      selectTriggerText(target, '[data-pagination-size]'),
      '9',
      'per-page selector should reflect the chosen page size'
    );
    assert.equal(
      footer.querySelector('[data-pagination-next]'),
      null,
      'prev/next nav should hide when there is only one page'
    );

    // Recoverability: the surviving selector still works to reduce the page size again.
    chooseSelectOption(target, '[data-pagination-size]', 6);
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'the per-page selector should switch back to six per page'
    );
  });

  it('caps gathering task drop modifiers at four labels and redirects to the selected rule beyond', async () => {
    const fourModifiers = Array.from({ length: 4 }, (_, index) => ({
      id: `four-${index}`,
      conditionId: `four-${index}`,
      value: index + 1,
    }));
    const fiveModifiers = Array.from({ length: 5 }, (_, index) => ({
      id: `five-${index}`,
      conditionId: `five-${index}`,
      value: index + 1,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: [
            {
              id: 'drop-four-modifiers',
              componentId: 'c1',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fourModifiers, weather: [] },
            },
            {
              id: 'drop-five-modifiers',
              componentId: 'c3',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fiveModifiers, weather: [] },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const fourModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-four-modifiers"]'
    );
    const fiveModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-five-modifiers"]'
    );
    // Up to four modifiers render as chips (which scroll within the cell if long names wrap);
    // five or more are capped and redirect to the selected rule's inspector.
    assert.equal(fourModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 4);
    assert.equal(fourModifierRow.textContent.includes('See selected rule for modifiers'), false);
    assert.equal(fiveModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 0);
    assert.ok(fiveModifierRow.querySelector('.manager-drop-modifier-overflow'));
    assert.ok(fiveModifierRow.textContent.includes('See selected rule for modifiers'));
  });

  it('colours gathering task drop chance sliders by rarity threshold', async () => {
    const rarityRows = [
      ['drop-guaranteed', 100, 'is-guaranteed', 'var(--fab-drop-rate-guaranteed)'],
      ['drop-common', 70, 'is-common', 'var(--fab-drop-rate-common)'],
      ['drop-uncommon', 69, 'is-uncommon', 'var(--fab-drop-rate-uncommon)'],
      ['drop-rare', 15, 'is-rare', 'var(--fab-drop-rate-rare)'],
      ['drop-very-rare', 5, 'is-very-rare', 'var(--fab-drop-rate-very-rare)'],
      ['drop-legendary', 4, 'is-legendary', 'var(--fab-drop-rate-legendary)'],
      ['drop-zero', 0, 'is-none', 'var(--fab-drop-rate-none)'],
    ];
    const dropRows = rarityRows.map(([id, dropRate]) => ({
      id,
      componentId: 'c1',
      quantity: 1,
      dropRate,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    function assertRenderedRarityRows(rows) {
      for (const [id, dropRate, tierClass, color] of rows) {
        const control = target.querySelector(
          `[data-gathering-task-drop-id="${id}"] .manager-drop-rate-control`
        );
        assert.ok(control.classList.contains(tierClass), `${id} should use ${tierClass}`);
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-value: ${dropRate}%;`),
          `${id} should expose its slider fill value`
        );
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-color: ${color};`),
          `${id} should expose ${color}`
        );
      }
    }

    assertRenderedRarityRows(rarityRows.slice(0, 5));
    target.querySelector('.manager-task-drops-card [data-pagination-next]').click();
    await tick();
    flushSync();
    assertRenderedRarityRows(rarityRows.slice(5));
  });

  it('paginates gathering task editor drop rules without snapping back to the selected row', async () => {
    const dropRows = Array.from({ length: 12 }, (_, index) => ({
      id: `drop-page-${index + 1}`,
      componentId: index % 2 === 0 ? 'c1' : 'c3',
      quantity: 1,
      dropRate: 10 + index,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const dropRulesCard = target.querySelector('.manager-task-drops-card');
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'));
    assert.equal(
      dropRulesCard.querySelectorAll('[data-gathering-task-drop-id]').length,
      5,
      'drop rules should default to five rows per page'
    );
    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 1 of 3'
    );
    dropRulesCard.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();

    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 2 of 3'
    );
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'), null);
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-6"]'));
  });

  it('shows the drop rank column with boundary-aware reorder buttons under highestRankedDrop mode', async () => {
    const dropRows = [
      { id: 'drop-rank-1', componentId: 'c1', quantity: 1, dropRate: 90, enabled: true },
      { id: 'drop-rank-2', componentId: 'c1', quantity: 1, dropRate: 60, enabled: true },
      { id: 'drop-rank-3', componentId: 'c1', quantity: 1, dropRate: 30, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: dropRows,
          rewardSelectionMode: 'highestRankedDrop',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.ok(
      table.classList.contains('is-ranked-mode'),
      'drop table should opt into ranked-mode layout'
    );
    const rankCells = table.querySelectorAll('[data-gathering-task-drop-rank-cell]');
    assert.equal(rankCells.length, 3, 'every visible drop row should expose a rank cell');
    const ranks = Array.from(rankCells).map((cell) =>
      cell.querySelector('[data-gathering-task-drop-rank]').textContent.trim()
    );
    assert.deepEqual(
      ranks,
      ['#1', '#2', '#3'],
      'rank labels should reflect 1-indexed position in dropRows'
    );

    const firstRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-1"]');
    const lastRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-3"]');
    assert.equal(
      firstRow.querySelector('[data-gathering-task-drop-move="up"]').disabled,
      true,
      'first row should not be movable up'
    );
    assert.equal(
      lastRow.querySelector('[data-gathering-task-drop-move="down"]').disabled,
      true,
      'last row should not be movable down'
    );

    firstRow.querySelector('[data-gathering-task-drop-move="down"]').click();
    await tick();
    flushSync();

    const reorderedIds = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
      (node) => node.dataset.gatheringTaskDropId
    );
    assert.deepEqual(
      reorderedIds,
      ['drop-rank-2', 'drop-rank-1', 'drop-rank-3'],
      'moving the top row down should swap it with its neighbor in dropRows'
    );
    const updatedRanks = Array.from(target.querySelectorAll('[data-gathering-task-drop-rank]')).map(
      (node) => node.textContent.trim()
    );
    assert.deepEqual(
      updatedRanks,
      ['#1', '#2', '#3'],
      'rank labels should re-derive from the new array order'
    );
  });

  it('hides the drop rank column when the reward selection mode is not highestRankedDrop', async () => {
    const dropRows = [
      { id: 'drop-unranked-1', componentId: 'c1', quantity: 1, dropRate: 70, enabled: true },
      { id: 'drop-unranked-2', componentId: 'c1', quantity: 1, dropRate: 40, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows, rewardSelectionMode: 'allDrops' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('results');

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.equal(
      table.classList.contains('is-ranked-mode'),
      false,
      'allDrops mode should not opt into ranked layout'
    );
    assert.equal(
      table.querySelectorAll('[data-gathering-task-drop-rank-cell]').length,
      0,
      'allDrops mode should not render rank cells'
    );
  });

  it('renders the Required Tools picker in the gathering task editor and adds/removes references', async () => {
    const calls = [];
    const toolLabel = 'Pickaxe — ' + 'exceptionally long required tool name '.repeat(12);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: toolLabel,
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
          taskInitialToolIds: ['tool-pickaxe'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('requirements');

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'required tools section should render in the task editor');

    const attached = section.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(attached.length, 1);
    assert.equal(
      attached[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-pickaxe'
    );
    assert.ok(attached[0].textContent.includes('Pickaxe'));
    assert.ok(attached[0].classList.contains('is-truncated'));
    assert.equal(attached[0].getAttribute('title'), toolLabel.trim());
    const toolContent = attached[0].querySelector('.manager-required-tool-content');
    assert.ok(toolContent, 'the thumbnail and name share one shrinkable row');
    assert.equal(toolContent.querySelector('img').getAttribute('alt'), '');
    assert.equal(
      toolContent.querySelector('.manager-required-tool-name').textContent,
      toolLabel.trim()
    );
    assert.equal(
      attached[0].querySelector('[data-chip-remove]').getAttribute('aria-label'),
      `Remove ${toolLabel.trim()} from required tools`
    );

    const resultCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(resultCards.length, 1);
    assert.equal(
      resultCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );

    resultCards[0].click();
    await tick();
    flushSync();

    const afterAddPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterAddPills.length, 2);
    const afterAddPillIds = Array.from(afterAddPills).map((node) =>
      node.getAttribute('data-gathering-task-required-tool-pill')
    );
    assert.deepEqual(afterAddPillIds.sort(compareStrings), ['tool-lantern', 'tool-pickaxe']);
    assert.equal(
      target.querySelectorAll('[data-gathering-task-required-tools-card]').length,
      0,
      'attached tools should be removed from the result grid'
    );

    const lanternPill = Array.from(afterAddPills).find(
      (node) => node.getAttribute('data-gathering-task-required-tool-pill') === 'tool-pickaxe'
    );
    lanternPill.querySelector('[data-chip-remove]').click();
    await tick();
    flushSync();
    const afterRemovePills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterRemovePills.length, 1);
    assert.equal(
      afterRemovePills[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-lantern'
    );
    assert.ok(
      document.activeElement === afterRemovePills[0].querySelector('[data-chip-remove]'),
      'removing the long-label member hands focus to the remaining remover'
    );

    target.querySelector('.manager-header-actions .fabricate-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 1 &&
          call[3].toolIds[0] === 'tool-lantern'
      ),
      `expected Save to persist toolIds: ['tool-lantern'], got ${JSON.stringify(calls.filter((c) => c[0] === 'updateGatheringLibraryTask'))}`
    );
  });

  // Issue 976. The gathering task editor carried the same defect as the recipe editor:
  it('resolves every tool-display precedence case in the gathering task tool picker', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          managedItemOptions: TOOL_PRECEDENCE_MANAGED_ITEMS,
          gatheringLibraryTools: TOOL_DISPLAY_PRECEDENCE_CASES.map((testCase) => ({
            ...testCase.tool,
            enabled: true,
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' },
          })),
          taskInitialToolIds: [],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('requirements');

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'the required tools section renders');

    for (const testCase of TOOL_DISPLAY_PRECEDENCE_CASES) {
      const card = section.querySelector(
        `[data-gathering-task-required-tools-card="${testCase.tool.id}"]`
      );
      assert.ok(card, `${testCase.id}: a picker card renders`);
      assert.equal(
        card.querySelector('strong').textContent.trim(),
        testCase.expectedName === null ? 'Unnamed tool' : testCase.expectedName,
        `${testCase.id}: ${testCase.summary}`
      );
      assert.equal(
        card.querySelector('img').getAttribute('src'),
        testCase.expectedImg,
        `${testCase.id}: the card renders the expected image`
      );
      assert.equal(
        card.querySelector('.manager-task-component-card-copy span').textContent.trim(),
        testCase.expectedDescription || 'No description has been added.',
        `${testCase.id}: the card renders the expected description`
      );
    }
  });

  it('renders a stale chip for task toolIds whose library entry is missing and lets the user clear it', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [],
          taskInitialToolIds: ['tool-ghost'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('requirements');

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const stalePill = section.querySelector(
      '[data-gathering-task-required-tool-pill="tool-ghost"]'
    );
    assert.ok(stalePill, 'stale tool reference should render as a pill');
    assert.ok(stalePill.classList.contains('is-stale'));
    assert.ok(stalePill.textContent.includes('Deleted tool'));

    assert.ok(
      section.querySelector('[data-gathering-task-required-tools-library-empty]'),
      'library-empty placeholder should render when no tools exist'
    );
    assert.equal(
      section.querySelector('[data-gathering-task-required-tools-search]'),
      null,
      'search input should hide when library is empty'
    );

    stalePill.querySelector('[data-chip-remove]').click();
    await tick();
    flushSync();

    const afterClearPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(
      afterClearPills.length,
      0,
      'removing the stale chip should clear the dangling reference'
    );
    assert.ok(
      target
        .querySelector('[data-gathering-task-required-tools]')
        .textContent.includes('No tools required')
    );

    target.querySelector('.manager-header-actions .fabricate-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 0
      ),
      'saving after stale-chip removal should persist toolIds: []'
    );
  });

  it('filters required-tools results by the search input', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: 'Pickaxe',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    await openTaskTab('requirements');

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const initialCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(initialCards.length, 2);

    const searchInput = section.querySelector('[data-gathering-task-required-tools-search] input');
    searchInput.value = 'lant';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const filteredCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(filteredCards.length, 1);
    assert.equal(
      filteredCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );
  });

  // --- Failed-save alerts in the editor toolbars (issue 919) -----------------------

  const SAVE_FAILED_MESSAGE = 'Save failed. Try again.';

  const gatheringEventLibraryFixtures = [
    {
      id: 'event-thorns',
      name: 'Thorn Snare',
      description: 'Tangled thorns snap shut around a careless gatherer.',
      img: 'icons/svg/hazard.svg',
      enabled: true,
      dropRate: 10,
      biomes: [],
      weather: [],
      timeOfDay: [],
      dangerTags: [],
    },
  ];

  // Two ticks: the save handlers await a store promise.
  async function settleSaveAttempt() {
    await tick();
    await tick();
    flushSync();
  }

  async function clickHeaderSave() {
    headerSaveButton(target).click();
    await settleSaveAttempt();
  }

  async function clickRecipeItemSave() {
    target.querySelector('[data-recipe-item-save]').click();
    await settleSaveAttempt();
  }

  // The gathering alerts are asserted through the toolbar; the recipe item's is its editor's
  // blocking notice at the notice position (issue 1522), whose title names the failure.
  const RECIPE_ITEM_ALERT = '[data-recipe-item-save-error]';
  const alertMessage = (selector) =>
    selector === RECIPE_ITEM_ALERT ? 'Save failed' : SAVE_FAILED_MESSAGE;

  function saveErrorNode(selector) {
    return selector === RECIPE_ITEM_ALERT
      ? target.querySelector(`[data-recipe-item-editor] [data-notice-position="page"] > ${selector}`)
      : target.querySelector(`.manager-header-actions ${selector}`);
  }

  function assertSaveErrorRendered(selector) {
    const alert = saveErrorNode(selector);
    assert.ok(alert, `expected the failed-save alert ${selector} where its editor announces it`);
    assert.equal(alert.getAttribute('role'), 'alert', 'the failed-save alert is a live region');
    assert.equal(
      (alert.querySelector('.fab-notice-title') ?? alert).textContent.trim(),
      alertMessage(selector),
      'the failed-save alert renders its localized message, not an empty element'
    );
  }

  function assertSaveErrorAbsent(selector, why) {
    assert.equal(target.querySelector(selector), null, why);
    assert.equal(
      target.textContent.includes(alertMessage(selector)),
      false,
      `${why} (the message text is gone from the surface too)`
    );
  }

  async function openDirtyGatheringTaskEditor(calls, storeOptions) {
    mountManager(calls, storeOptions);
    navButton('Gathering').click();
    await settleSaveAttempt();
    gatheringSubitem('Tasks').click();
    await settleSaveAttempt();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await settleSaveAttempt();
    setInputValue(target.querySelector('[data-gathering-task-field="name"]'), 'Gather Sun Herbs');
    await settleSaveAttempt();
  }

  async function openDirtyGatheringEventEditor(calls, storeOptions) {
    Object.assign(storeOptions, { gatheringLibraryEvents: gatheringEventLibraryFixtures });
    mountManager(calls, storeOptions);
    navButton('Gathering').click();
    await settleSaveAttempt();
    gatheringSubitem('Events').click();
    await settleSaveAttempt();
    target
      .querySelector('[data-gathering-event-id="event-thorns"] [aria-label="Edit Thorn Snare"]')
      .click();
    await settleSaveAttempt();
    setInputValue(target.querySelector('[data-gathering-event-field="name"]'), 'Bramble Snare');
    await settleSaveAttempt();
  }

  for (const [kind, openEditor] of [
    ['task', openDirtyGatheringTaskEditor],
    ['event', openDirtyGatheringEventEditor],
  ]) {
    it(`${kind} availability restores field-sized empties after pointer and keyboard selection`, async () => {
      await openEditor([], {});
      if (kind === 'task') await openTaskTab('requirements');
      for (const field of ['biomes', 'timeOfDay', 'weather']) {
        const host = target.querySelector(`[data-gathering-${kind}-field="${field}"]`);
        const trigger = host.querySelector('.manager-condition-menu-button');
        const pillSelector = `[data-gathering-${kind}-availability-pill="${field}"]`;
        for (const remover of host.querySelectorAll(`${pillSelector} [data-chip-remove]`)) {
          remover.click();
          await settleSaveAttempt();
        }
        for (const keyboard of [false, true]) {
          assert.ok(host.querySelector('.manager-empty.is-inline.is-field'), `${field} starts empty`);
          trigger.click();
          await settleSaveAttempt();
          if (keyboard) {
            trigger.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
            );
            await settleSaveAttempt();
            trigger.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
            );
          } else {
            document
              .querySelector(`[data-gathering-${kind}-availability-option="${field}"]`)
              .click();
          }
          await settleSaveAttempt();
          assert.ok(!host.querySelector('.manager-empty'), 'selection replaces the placeholder');
          const remover = host.querySelector(`${pillSelector} [data-chip-remove]`);
          assert.ok(remover, 'the selected condition has an accessible removal action');
          assert.ok(remover.getAttribute('aria-label'));
          remover.focus();
          remover.click();
          await settleSaveAttempt();
          assert.ok(!host.querySelector(pillSelector));
          assert.ok(host.querySelector('.manager-empty.is-inline.is-field'));
          assert.ok(document.activeElement === trigger, 'last removal returns focus to the dropdown');
        }
      }
    });
  }

  // Every destination this guard walks is a WORLD route since issue 1282 — Parties.
  const WORLD_EXIT_DESTINATION_VIEWS = Object.freeze({
    parties: 'world',
    downtime: 'world-downtime',
    realms: 'world-travel',
    map: 'world-travel',
  });

  async function attemptDirtyGatheringWorldExit(kind, outcome, destination) {
    const calls = [];
    const title = kind === 'task' ? 'Task' : 'Event';
    const storeOptions = {
      gatheringRealmsEnabled: true,
      // The `downtime` destination below is experimental-gated (issue 1257).
      experimentalFeaturesEnabled: true,
      [`confirmDiscardGathering${title}Result`]: outcome.action,
    };
    if (outcome.saveResult === false) {
      storeOptions[`updateGatheringLibrary${title}Result`] = false;
    }
    if (outcome.rejectSave) {
      storeOptions[`updateGatheringLibrary${title}Reject`] = true;
    }
    if (kind === 'task') await openDirtyGatheringTaskEditor(calls, storeOptions);
    else await openDirtyGatheringEventEditor(calls, storeOptions);

    if (!['parties', 'downtime'].includes(destination)) {
      target.querySelector('#manager-travel-toggle').click();
      await tick();
      flushSync();
      assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'true');
      assert.equal(
        calls.some((call) => call[0] === `confirmDiscardDirtyGathering${title}Draft`),
        false,
        `${kind} ${outcome.name} disclosure must not consume the dirty-route guard`
      );
    }

    const activateDestination = async () => {
      (['parties', 'downtime'].includes(destination)
        ? worldNavItem(destination)
        : worldTravelItem(destination)
      ).click();
      await settleRouteExit();
    };
    if (outcome.rejectSave) await withSilencedConsoleError(activateDestination);
    else await activateDestination();

    const expectedView = outcome.proceeds
      ? WORLD_EXIT_DESTINATION_VIEWS[destination]
      : `gathering-${kind}-edit`;
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      expectedView,
      `${kind} ${outcome.name} should ${outcome.proceeds ? '' : 'not '}leave the editor; rendered: ${JSON.stringify(Array.from(target.querySelectorAll('.fabricate-manager')).map((node) => node.dataset.managerView))}; calls: ${JSON.stringify(calls)}`
    );
    assert.equal(
      (['parties', 'downtime'].includes(destination)
        ? worldNavItem(destination)
        : worldTravelItem(destination)
      ).getAttribute('aria-current'),
      outcome.proceeds ? 'page' : null,
      `${kind} ${outcome.name} ${destination} must not leave a hidden active navigation control`
    );
    assert.ok(
      calls.some((call) => call[0] === `confirmDiscardDirtyGathering${title}Draft`),
      `${kind} ${outcome.name} routes through its dirty-exit confirmation`
    );
    const saveCalls = calls.filter((call) => call[0] === `updateGatheringLibrary${title}`);
    assert.equal(
      saveCalls.length > 0,
      outcome.action === 'save',
      `${kind} ${outcome.name} ${outcome.action === 'save' ? 'does' : 'does not'} save`
    );
  }

  it('guards dirty gathering task and event exits through World Parties, Downtime, and a Travel child', async () => {
    const outcomes = [
      { name: 'cancel', action: 'cancel', proceeds: false },
      { name: 'save false', action: 'save', saveResult: false, proceeds: false },
      { name: 'rejected save', action: 'save', rejectSave: true, proceeds: false },
      { name: 'successful save', action: 'save', proceeds: true },
      { name: 'discard', action: 'discard', proceeds: true },
    ];

    for (const destination of ['parties', 'downtime', 'realms']) {
      for (const kind of ['task', 'event']) {
        for (const outcome of outcomes) {
          await attemptDirtyGatheringWorldExit(kind, outcome, destination);
          unmount(mounted);
          mounted = null;
          target.remove();
          target = null;
        }
      }
    }
  });

  async function openDirtyRecipeItemEditor(calls, storeOptions) {
    Object.assign(storeOptions, {
      experimentalFeaturesEnabled: true,
      recipeItemDefinitions: booksScrollsFixtures,
    });
    mountManager(calls, storeOptions);
    craftingParent().click();
    await settleSaveAttempt();
    craftingSubitem('Books & Scrolls').click();
    await settleSaveAttempt();
    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await settleSaveAttempt();
    target.querySelector('[data-recipe-item-enabled]').click();
    await settleSaveAttempt();
  }

  // The retry case: a GM whose save fails, changes nothing.
  async function assertRepeatFailureReAnnounces(selector, save = clickHeaderSave) {
    await save();
    assertSaveErrorRendered(selector);
    const firstAlert = saveErrorNode(selector);

    await save();
    assertSaveErrorRendered(selector);
    assert.notStrictEqual(
      saveErrorNode(selector),
      firstAlert,
      'a second identical failure re-inserts the alert rather than leaving the first node in place'
    );
    assert.equal(
      firstAlert.isConnected,
      false,
      'the first alert node left the DOM, so the re-insertion is a real announcement'
    );
  }

  // The counterpart constraint, and the reason the pre-attempt clear sits AFTER the
  // composition-loss confirmation rather than at the top of the save: cancelling that
  // confirmation makes no new attempt at all, so a failure the GM has not yet dealt with has to
  // stay exactly where it is. Clearing first would delete the alert node with nothing put in its
  // place — and a removal, unlike an insertion, is typically not announced at all, so the GM
  // would be left with strictly less than they started with.
  async function assertCancelledConfirmKeepsSaveError(selector, storeOptions, cancelKey) {
    await clickHeaderSave();
    assertSaveErrorRendered(selector);
    const standingAlert = saveErrorNode(selector);

    storeOptions[cancelKey] = false;
    await clickHeaderSave();
    assertSaveErrorRendered(selector);
    assert.strictEqual(
      saveErrorNode(selector),
      standingAlert,
      'a cancelled confirmation leaves the standing failure alert in place, untouched'
    );
  }

  // The two gathering rejection paths log through console.error before they surface the
  // alert, so silence just that call rather than dumping an expected stack into the run.
  async function withSilencedConsoleError(run) {
    const original = console.error;
    console.error = () => {};
    try {
      await run();
    } finally {
      console.error = original;
    }
  }

  it('surfaces a gathering-task save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryTaskResult: false };
    await openDirtyGatheringTaskEditor(calls, storeOptions);

    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'no alert before a save has been attempted'
    );

    await clickHeaderSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    assertSaveErrorRendered('[data-gathering-task-save-error]');

    storeOptions.updateGatheringLibraryTaskResult = true;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('surfaces a gathering-task save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryTaskReject: true };
    await openDirtyGatheringTaskEditor(calls, storeOptions);

    await withSilencedConsoleError(clickHeaderSave);
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    assertSaveErrorRendered('[data-gathering-task-save-error]');

    storeOptions.updateGatheringLibraryTaskReject = false;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('re-announces a gathering-task save that fails the same way twice', async () => {
    await openDirtyGatheringTaskEditor([], { updateGatheringLibraryTaskResult: false });
    await assertRepeatFailureReAnnounces('[data-gathering-task-save-error]');
  });

  it('keeps a standing gathering-task save error when the composition-loss warning is cancelled', async () => {
    const storeOptions = { updateGatheringLibraryTaskResult: false };
    await openDirtyGatheringTaskEditor([], storeOptions);
    await assertCancelledConfirmKeepsSaveError(
      '[data-gathering-task-save-error]',
      storeOptions,
      'confirmGatheringLibraryTaskCompositionLossResult'
    );
  });

  it('surfaces a gathering-event save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryEventResult: false };
    await openDirtyGatheringEventEditor(calls, storeOptions);
    assertHeaderBackIsGhost('[data-gathering-event-back]', 'gathering-event-edit');

    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'no alert before a save has been attempted'
    );

    await clickHeaderSave();
    assert.ok(
      calls.some((call) => call[0] === 'updateGatheringLibraryEvent' && call[2] === 'event-thorns'),
      'Save routes through updateGatheringLibraryEvent'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-event-edit'
    );
    assertSaveErrorRendered('[data-gathering-event-save-error]');

    storeOptions.updateGatheringLibraryEventResult = true;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  // The event half of the shared panel, asserted through the root (issue 1707): only the rendered
  // hook name can prove the shell still asks for the event subject at this call site.
  it('renders the shared modifier panel at the event subject on the event editor route', async () => {
    await openDirtyGatheringEventEditor([], {});

    const stack = target.querySelector('[data-gathering-event-inspector-stack]');
    assert.ok(Boolean(stack), 'the event editor route renders its inspector stack');
    for (const kind of ['biome', 'timeOfDay', 'weather']) {
      assert.ok(
        Boolean(stack.querySelector(`[data-gathering-event-condition-modifiers="${kind}"]`)),
        `the ${kind} condition-modifier card renders under the event prefix`
      );
      assert.ok(
        Boolean(stack.querySelector(`[data-gathering-event-condition-modifier-picker="${kind}"]`)),
        `the ${kind} condition picker renders under the event prefix`
      );
    }
    assert.ok(
      Boolean(stack.querySelector('[data-gathering-event-character-modifiers]')),
      'the character-modifier card renders under the event prefix'
    );
    assert.ok(
      Boolean(stack.querySelector('[data-gathering-event-character-modifier-search]')),
      'the character-modifier search renders under the event prefix'
    );
    assert.ok(
      !stack.querySelector('[data-gathering-drop-condition-modifiers="biome"]'),
      'the event route must not render the drop prefix: the two call sites pass different subjects'
    );
    assert.ok(
      !stack.querySelector('[data-gathering-drop-character-modifiers]'),
      'the event route must not render the drop prefix'
    );
  });

  // The drop half acted on through the root (issue 1707): its writers arrive pre-bound to
  // `selectedGatheringDrop.id`, so only a click proves the row they reach is the selected one.
  it('adds and steps a drop condition modifier on the selected drop row', async () => {
    const calls = [];
    await openDirtyGatheringTaskEditor(calls, {});
    await openTaskTab('results');
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settleSaveAttempt();

    const biomeCard = target.querySelector('[data-gathering-drop-condition-modifiers="biome"]');
    assert.ok(Boolean(biomeCard), 'the drop inspector renders the biome condition-modifier card');
    assert.equal(
      biomeCard.querySelectorAll('[data-gathering-drop-modifier-id]').length,
      1,
      'the fixture drop starts with its one seeded biome modifier'
    );

    biomeCard
      .querySelector('[data-gathering-drop-condition-modifier-picker="biome"] .fabricate-icon-button')
      .click();
    await settleSaveAttempt();

    const attached = [...biomeCard.querySelectorAll('[data-gathering-drop-modifier-id]')];
    assert.equal(attached.length, 2, 'the add control attaches a second modifier to this drop');
    const added = attached.find(
      (row) => row.getAttribute('data-gathering-drop-modifier-id') !== 'forest-penalty'
    );
    assert.ok(
      added.textContent.includes('Crystal Cavern'),
      'the added row names the condition the picker had selected'
    );
    assert.ok(added.classList.contains('is-zero'), 'a freshly attached modifier reads zero');

    added
      .querySelector('.manager-condition-modifier-value input')
      .dispatchEvent(
        new globalThis.KeyboardEvent('keydown', {
          key: 'ArrowUp',
          bubbles: true,
          cancelable: true,
        })
      );
    await settleSaveAttempt();
    const addedId = added.getAttribute('data-gathering-drop-modifier-id');
    assert.ok(
      biomeCard
        .querySelector(`[data-gathering-drop-modifier-id="${addedId}"]`)
        .classList.contains('is-positive'),
      'Arrow stepping rewrites the stored value, not only the input the key landed in'
    );

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    assert.equal(saved[2], 'task-herbs', 'the save carries the task being edited');
    const savedRow = saved[3].dropRows.find((row) => row.id === 'drop-nightshade');
    assert.ok(Boolean(savedRow), 'the drop row the panel was bound to survives the save');
    const savedBiomes = savedRow.conditionModifiers.biome;
    assert.equal(savedBiomes.length, 2, 'both writes landed on this drop row, by its real id');
    assert.deepEqual(
      savedBiomes
        .filter((modifier) => modifier.conditionId === 'cavern')
        .map((modifier) => [modifier.operator, modifier.value]),
      [['+', 1]],
      'the added modifier persists on the selected drop with its stepped value'
    );
  });

  // The task leaf's own controls (issue 1707 phase 2): the count field and the duplicate action
  // are handed writers pre-bound to the selected drop inside the leaf, so only a gesture proves
  // the row they reach is the selected one rather than the first.
  it('persists a drop count typed into the selected drop inspector', async () => {
    const calls = [];
    await openDirtyGatheringTaskEditor(calls, {});
    await openTaskTab('results');
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settleSaveAttempt();

    const countField = target.querySelector('[data-gathering-drop-inspector-count]');
    assert.ok(Boolean(countField), 'the drop inspector renders the count field');
    const countInput = countField.querySelector('input');
    assert.equal(countInput.value, '2', 'the count field reads the fixture drop\'s own quantity');
    setInputValue(countInput, '7');
    await settleSaveAttempt();

    const duplicate = [...target.querySelectorAll('.manager-drop-editor-actions button')].find(
      (button) => button.getAttribute('aria-label') === 'Duplicate'
    );
    assert.ok(Boolean(duplicate), 'the drop header renders its duplicate action');
    duplicate.click();
    await settleSaveAttempt();

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    assert.equal(saved[2], 'task-herbs', 'the save carries the task being edited');
    const typed = saved[3].dropRows.filter((row) => row.id === 'drop-nightshade');
    assert.equal(typed.length, 1, 'the drop the inspector was bound to is still one row');
    assert.equal(typed[0].quantity, 7, 'the typed count landed on that row, by its real id');
    const copies = saved[3].dropRows.filter((row) => row.componentId === typed[0].componentId);
    assert.equal(copies.length, 2, 'duplicating the selected drop added a second copy of it');
    assert.deepEqual(
      copies.map((row) => row.quantity),
      [7, 7],
      'the copy was taken from the selected row after the typed count, not from the first row'
    );
  });

  // The event half's glue: its pick writer is bound to `editingGatheringEvent` at that call site.
  it('persists a character modifier picked from the event editor suggestions', async () => {
    const calls = [];
    await openDirtyGatheringEventEditor(calls, {
      modifiers: [
        { id: 'mod-herbalism', label: 'Herbalism Training', expression: '@skills.nat.total' },
      ],
    });

    const search = target.querySelector('[data-gathering-event-character-modifier-search]');
    assert.ok(Boolean(search), 'the event editor renders the character-modifier search');
    assert.ok(
      !target.querySelector('[data-gathering-event-character-modifier-ref]'),
      'the fixture event starts with no character modifiers attached'
    );

    setInputValue(search.querySelector('input'), 'herbal');
    await settleSaveAttempt();
    const suggestion = target.querySelector(
      '[data-gathering-event-character-modifier-suggestion="mod-herbalism"]'
    );
    assert.ok(Boolean(suggestion), 'the typed term suggests the one library modifier');
    suggestion.click();
    await settleSaveAttempt();

    const ref = target.querySelector('[data-gathering-event-character-modifier-ref]');
    assert.ok(Boolean(ref), 'picking a suggestion attaches a reference row to the event');
    assert.ok(
      ref.textContent.includes('Herbalism Training'),
      'the reference row names the library modifier it points at'
    );

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryEvent');
    assert.equal(saved[2], 'event-thorns', 'the save carries the event being edited');
    assert.deepEqual(
      saved[3].characterModifiers.map((entry) => entry.modifierId),
      ['mod-herbalism'],
      'the picked reference persists on this event, so the pick reached its own record'
    );
  });

  // The drop half of the same search: its suggestions exclude what the selected drop already
  // references, and a pick lands on that drop by its real id.
  it('suggests and persists a character modifier typed into the selected drop search', async () => {
    const calls = [];
    await openDirtyGatheringTaskEditor(calls, {
      modifiers: [
        { id: 'mod-herbalism', label: 'Herbalism Training', expression: '@skills.nat.total' },
        { id: 'mod-herb-lore', label: 'Herb Lore', expression: '@skills.med.total' },
      ],
    });
    await openTaskTab('results');
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settleSaveAttempt();

    const search = target.querySelector('[data-gathering-drop-character-modifier-search]');
    assert.ok(Boolean(search), 'the drop inspector renders the character-modifier search');
    setInputValue(search.querySelector('input'), 'herb');
    await settleSaveAttempt();
    const suggested = () =>
      [...target.querySelectorAll('[data-gathering-drop-character-modifier-suggestion]')].map(
        (node) => node.getAttribute('data-gathering-drop-character-modifier-suggestion')
      );
    assert.deepEqual(suggested(), ['mod-herbalism', 'mod-herb-lore'], 'both library entries match');

    target
      .querySelector('[data-gathering-drop-character-modifier-suggestion="mod-herbalism"]')
      .click();
    await settleSaveAttempt();
    assert.equal(
      target.querySelector('[data-gathering-drop-character-modifier-search] input').value,
      '',
      'a pick clears the search term'
    );
    setInputValue(
      target.querySelector('[data-gathering-drop-character-modifier-search] input'),
      'herb'
    );
    await settleSaveAttempt();
    assert.deepEqual(suggested(), ['mod-herb-lore'], 'the attached entry is no longer suggested');

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    const row = saved[3].dropRows.find((entry) => entry.id === 'drop-nightshade');
    assert.deepEqual(
      row.characterModifiers.map((ref) => [ref.modifierId, ref.operator, ref.expressionOverride]),
      [['mod-herbalism', '+', '']],
      'the pick persists on the selected drop as one fresh reference'
    );
  });

  const HERBALISM = Object.freeze({
    id: 'mod-herbalism',
    label: 'Herbalism Training',
    icon: 'fa-solid fa-leaf',
    expression: '@skills.nat.total',
  });
  const HERB_LORE = Object.freeze({ id: 'mod-herb-lore', label: 'Herb Lore' });

  /** The drop or the event editor, its record carrying one reference and no condition modifier. */
  async function openModifierSubject(subject, calls) {
    const ref = { id: 'ref-1', modifierId: HERBALISM.id, operator: '-', min: null, max: null };
    const bare = { biome: [], timeOfDay: [], weather: [] };
    mountManager(calls, {
      modifiers: [HERBALISM, HERB_LORE],
      taskDropRows: [
        { id: 'drop-herb', componentId: 'c3', quantity: 1, dropRate: 50, enabled: true },
        { id: 'drop-root', componentId: 'c3', quantity: 1, dropRate: 50, enabled: true },
      ].map((row) => ({ ...row, conditionModifiers: bare, characterModifiers: [ref] })),
      gatheringLibraryEvents: gatheringEventLibraryFixtures.map((event) => ({
        ...event,
        conditionModifiers: bare,
        characterModifiers: [ref],
      })),
    });
    navButton('Gathering').click();
    await settleSaveAttempt();
    gatheringSubitem(subject === 'drop' ? 'Tasks' : 'Events').click();
    await settleSaveAttempt();
    const [kind, id, name] =
      subject === 'drop'
        ? ['task', 'task-herbs', 'Gather Moon Herbs']
        : ['event', 'event-thorns', 'Thorn Snare'];
    target.querySelector(`[data-gathering-${kind}-id="${id}"] [aria-label="Edit ${name}"]`).click();
    await settleSaveAttempt();
    if (subject === 'drop') {
      await openTaskTab('results');
      target.querySelector('[data-gathering-task-drop-id="drop-herb"]').click();
      await settleSaveAttempt();
    }
  }

  async function saveSubject(subject, calls) {
    await clickHeaderSave();
    const saved = calls.findLast((call) =>
      ['updateGatheringLibraryTask', 'updateGatheringLibraryEvent'].includes(call[0])
    );
    return subject === 'drop' ? saved[3].dropRows[0] : saved[3];
  }

  // Each subject's condition cards through the root: the picker it reconciled, a picked option, a
  // typed and a stepped value, and a delete, all landing on that record.
  for (const subject of ['drop', 'event']) {
    it(`edits the ${subject}'s condition modifiers through the shell's picker and writers`, async () => {
      const calls = [];
      await openModifierSubject(subject, calls);
      const card = () =>
        target.querySelector(`[data-gathering-${subject}-condition-modifiers="timeOfDay"]`);
      const picker = () =>
        card().querySelector(`[data-gathering-${subject}-condition-modifier-picker="timeOfDay"]`);
      const rows = () => [...card().querySelectorAll(`[data-gathering-${subject}-modifier-id]`)];
      const add = () => picker().querySelector('.fabricate-icon-button');
      const trigger = `[data-gathering-${subject}-condition-modifier-picker="timeOfDay"] .fabricate-select-trigger`;

      add().click();
      await settleSaveAttempt();
      assert.deepEqual(
        rows().map((row) => row.textContent.includes('First Light')),
        [true],
        'the add control attaches the option the picker reconciled to'
      );

      chooseSelectOption(target, trigger, 'night');
      await settleSaveAttempt();
      add().click();
      await settleSaveAttempt();
      const night = rows().find((row) => row.textContent.includes('Deep Night'));
      assert.ok(Boolean(night), 'a picked option is the one the add control attaches');

      setInputValue(night.querySelector('input'), '5');
      await settleSaveAttempt();
      rows()
        .find((row) => row.textContent.includes('Deep Night'))
        .querySelector('input')
        .dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await settleSaveAttempt();
      chooseSelectOption(target, trigger, 'day');
      await settleSaveAttempt();
      add().click();
      await settleSaveAttempt();
      const row = (name) => rows().find((entry) => entry.textContent.includes(name));
      setInputValue(row('High Day').querySelector('input'), '-3');
      await settleSaveAttempt();
      const focused = (node) => node.ownerDocument.activeElement === node;
      const removeRow = async (name) => {
        const remove = row(name).querySelector('[data-rule-row-remove]');
        assert.equal(remove.getAttribute('aria-label'), 'Delete modifier', 'the remove names itself');
        remove.focus();
        remove.click();
        await settleSaveAttempt();
      };
      await removeRow('First Light');
      assert.ok(focused(row('Deep Night').querySelector('input')), 'focus moves to the next modifier');

      const saved = await saveSubject(subject, calls);
      assert.deepEqual(
        saved.conditionModifiers.timeOfDay.map((entry) => [entry.conditionId, entry.operator, entry.value]),
        [
          ['night', '+', 6],
          ['day', '-', 3],
        ],
        'the typed and stepped value survives, and a typed sign is kept'
      );

      await removeRow('High Day');
      assert.ok(focused(row('Deep Night').querySelector('input')), 'the last falls back to the previous');
      await removeRow('Deep Night');
      assert.ok(
        focused(picker().querySelector('.fabricate-select-trigger')),
        'the only one hands focus to the picker'
      );
    });

    it(`edits the ${subject}'s Modifier Library reference through the shell's writers`, async () => {
      const calls = [];
      await openModifierSubject(subject, calls);
      const ref = () =>
        target.querySelector(`[data-gathering-${subject}-character-modifier-ref="ref-1"]`);
      assert.ok(Boolean(ref().querySelector('i.fa-leaf')), 'the row draws its library icon');
      assert.ok(!ref().querySelector('.manager-character-modifier-stale-warning'), 'not stale');
      assert.ok(
        ref().querySelector('.manager-character-modifier-operator-select.is-negative'),
        'the operator reads negative'
      );

      const overrideLabel = () =>
        ref().querySelector(':scope .manager-character-modifier-override-row .manager-status-toggle-label');
      assert.equal(overrideLabel().textContent.trim(), 'Override?', 'the switch offers the override');
      ref().querySelector('.manager-character-modifier-override-row button').click();
      await settleSaveAttempt();
      assert.equal(
        ref().querySelector('.manager-character-modifier-override-row button')
          .getAttribute('aria-pressed'),
        'true',
        'the override is on'
      );
      assert.equal(overrideLabel().textContent.trim(), 'Overridden', 'the switch names the override');
      chooseSelectOption(
        target,
        `[data-gathering-${subject}-character-modifier-ref="ref-1"] .manager-character-modifier-operator-select .fabricate-select-trigger`,
        '+'
      );
      await settleSaveAttempt();
      assert.ok(ref().querySelector('.manager-character-modifier-operator-select.is-positive'));

      const saved = await saveSubject(subject, calls);
      assert.deepEqual(
        saved.characterModifiers.map((entry) => [entry.operator, entry.expressionOverride]),
        [['+', HERBALISM.expression]],
        'the override seeds the library expression and the operator flips'
      );

      assert.ok(
        ref().querySelector('.manager-character-modifier-row-reference-delete.is-danger'),
        'the reference delete carries the danger tone'
      );
      ref().querySelector('.manager-character-modifier-row-reference-delete').click();
      await settleSaveAttempt();
      assert.deepEqual((await saveSubject(subject, calls)).characterModifiers, []);
    });
  }

  // The term is shared by both subjects, so each clears it when its own record changes.
  it('clears the character-modifier search per record', async () => {
    await openModifierSubject('drop', []);
    const search = () => target.querySelector('[data-gathering-drop-character-modifier-search]');
    setInputValue(search().querySelector('input'), 'herb');
    await settleSaveAttempt();
    assert.ok(
      Boolean(target.querySelector('[data-gathering-drop-character-modifier-suggestions]')),
      'the typed term opens the suggestion list'
    );

    target.querySelector('[data-gathering-task-drop-id="drop-root"]').click();
    await settleSaveAttempt();
    assert.equal(search().querySelector('input').value, '', 'another drop starts a new search');

    unmount(mounted);
    mounted = null;
    target.remove();
    await openModifierSubject('event', []);
    const eventInput = () =>
      target.querySelector('[data-gathering-event-character-modifier-search] input');
    setInputValue(eventInput(), 'herb');
    await settleSaveAttempt();
    target.querySelector('[data-gathering-event-back]').click();
    await settleSaveAttempt();
    target.querySelector('[data-gathering-event-id="event-thorns"] [aria-label="Edit Thorn Snare"]').click();
    await settleSaveAttempt();
    assert.equal(eventInput().value, '', 'reopening the event starts a new search');
  });

  // The two saves read a store that answers nothing in opposite ways: a task save needs a truthy
  // answer, an event save fails only on a literal `false`.
  it('fails a gathering-task save the store answers with nothing', async () => {
    await openDirtyGatheringTaskEditor([], { updateGatheringLibraryTaskResolvesNothing: true });
    await clickHeaderSave();
    assertSaveErrorRendered('[data-gathering-task-save-error]');
    assert.equal(headerSaveButton(target).disabled, false, 'the draft is still dirty');
  });

  it('rebaselines a gathering-event save the store answers with nothing', async () => {
    await openDirtyGatheringEventEditor([], { updateGatheringLibraryEventResolvesNothing: true });
    await clickHeaderSave();
    assertSaveErrorAbsent('[data-gathering-event-save-error]', 'the save counts as landed');
    assert.equal(headerSaveButton(target).disabled, true, 'the draft is clean against its baseline');
  });

  it('surfaces a gathering-event save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryEventReject: true };
    await openDirtyGatheringEventEditor(calls, storeOptions);

    // Before issue 919 `saveGatheringEventDraft` had no `catch` at all.
    await withSilencedConsoleError(clickHeaderSave);
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-event-edit'
    );
    assertSaveErrorRendered('[data-gathering-event-save-error]');

    storeOptions.updateGatheringLibraryEventReject = false;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('re-announces a gathering-event save that fails the same way twice', async () => {
    await openDirtyGatheringEventEditor([], { updateGatheringLibraryEventResult: false });
    await assertRepeatFailureReAnnounces('[data-gathering-event-save-error]');
  });

  it('keeps a standing gathering-event save error when the composition-loss warning is cancelled', async () => {
    const storeOptions = { updateGatheringLibraryEventResult: false };
    await openDirtyGatheringEventEditor([], storeOptions);
    await assertCancelledConfirmKeepsSaveError(
      '[data-gathering-event-save-error]',
      storeOptions,
      'confirmGatheringLibraryEventCompositionLossResult'
    );
  });

  it('surfaces a recipe-item save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { saveRecipeItemResult: false };
    await openDirtyRecipeItemEditor(calls, storeOptions);

    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'no alert before a save has been attempted'
    );

    await clickRecipeItemSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
    assertSaveErrorRendered('[data-recipe-item-save-error]');

    storeOptions.saveRecipeItemResult = true;
    await clickRecipeItemSave();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('surfaces a recipe-item save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { saveRecipeItemReject: true };
    await openDirtyRecipeItemEditor(calls, storeOptions);

    await clickRecipeItemSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
    assertSaveErrorRendered('[data-recipe-item-save-error]');

    storeOptions.saveRecipeItemReject = false;
    await clickRecipeItemSave();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  // The recipe-item model's `saveRecipeItemDraft` already reset `recipeItemSaveFailed` before its
  // awaited store call.
  it('re-announces a recipe-item save that fails the same way twice', async () => {
    await openDirtyRecipeItemEditor([], { saveRecipeItemResult: false });
    await assertRepeatFailureReAnnounces('[data-recipe-item-save-error]', clickRecipeItemSave);
  });
}

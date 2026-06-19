import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeSystem(overrides = {}) {
  return {
    id: overrides.id || 'system-a',
    name: overrides.name || 'System A',
    description: '',
    resolutionMode: 'simple',
    features: {},
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    components: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    ...overrides
  };
}

function makeEnvironment(overrides = {}) {
  return {
    id: overrides.id || 'environment-a',
    craftingSystemId: overrides.craftingSystemId || 'system-a',
    name: overrides.name || 'Forest',
    description: '',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [
      {
        id: 'task-a',
        name: 'Forage',
        description: 'Search for useful supplies.',
        img: 'icons/svg/forest.svg',
        enabled: true,
        resolutionMode: 'routed',
        toolIds: ['tool-a'],
        visibility: { formula: '@skills.sur.mod', threshold: '12' },
        timeRequirement: { minutes: 5, hours: 0, days: 0, months: 0, years: 0 },
        failureOutcome: { mode: 'text', text: 'Nothing useful turns up.' },
        resultSelection: {
          provider: 'macroOutcome',
          macroUuid: 'Macro.gatheringOutcome'
        },
        resultGroups: [
          {
            id: 'group-a',
            name: 'Common',
            results: [{ id: 'result-a', componentId: 'component-a', quantity: 1 }]
          }
        ]
      }
    ],
    ...overrides
  };
}

function validateEnvironmentForFakeCreate(environment) {
  const errors = [];
  const reservedResultGroups = new Set(['f', 'fail', 'failed', 'failure', 'miss', 'missed', 'm', 'none', 'nothing', 'whiff', 'whiffed', 'hazard', 'danger', 'complication', 'trap', 'oops']);
  // An environment is a valid task source via its enabled/forced library-task ids
  // (tasks are matched in from the system library, not authored on the environment).
  const hasTaskSource = (Array.isArray(environment.enabledTaskIds) && environment.enabledTaskIds.length > 0)
    || (Array.isArray(environment.forcedTaskIds) && environment.forcedTaskIds.length > 0)
    || (Array.isArray(environment.tasks) && environment.tasks.length > 0);
  // A task source is only required to ENABLE an environment; a disabled draft may
  // be saved without one (issue #298).
  if (environment.enabled !== false && !hasTaskSource) {
    errors.push('Environment must have at least one task before it can be enabled');
  }
  for (const task of environment.tasks || []) {
    const resultGroupNames = new Map();
    for (const group of task.resultGroups || []) {
      const normalizedName = String(group?.name || '').trim().toLowerCase();
      if (!normalizedName) {
        errors.push(`Task "${task.name}" result groups require names`);
        continue;
      }
      if (reservedResultGroups.has(normalizedName)) {
        errors.push(`Task "${task.name}" result group "${group.name}" collides with reserved failure keyword`);
      }
      if (resultGroupNames.has(normalizedName)) {
        errors.push(`Task "${task.name}" result group "${group.name}" duplicates "${resultGroupNames.get(normalizedName)}"`);
      } else {
        resultGroupNames.set(normalizedName, group.name);
      }
    }
    if (task.enabled !== true) continue;
    if (task.resolutionMode === 'routed') {
      if (!task.resultSelection?.provider) {
        errors.push(`Task "${task.name}" routed resolution requires resultSelection`);
      }
      if (task.resultSelection?.provider === 'macroOutcome' && !task.resultSelection.macroUuid) {
        errors.push(`Task "${task.name}" macroOutcome provider requires macroUuid`);
      }
      if (task.resultSelection?.provider === 'rollTableOutcome' && !task.resultSelection.rollTableUuid) {
        errors.push(`Task "${task.name}" rollTableOutcome provider requires rollTableUuid`);
      }
      if (!Array.isArray(task.resultGroups) || task.resultGroups.length < 1) {
        errors.push(`Task "${task.name}" routed resolution requires at least one result group`);
      }
    }
    if (task.resolutionMode === 'progressive') {
      if (!task.progressive?.awardMode || !['partial', 'equal', 'exceed'].includes(task.progressive.awardMode)) {
        errors.push(`Task "${task.name}" progressive.awardMode must be partial, equal, or exceed`);
      }
      if (!task.check || !task.check.formula) {
        errors.push(`Task "${task.name}" gathering check requires formula`);
      }
      if (!Array.isArray(task.resultGroups) || task.resultGroups.length !== 1) {
        errors.push(`Task "${task.name}" progressive resolution requires exactly one result group`);
      } else if (!Array.isArray(task.resultGroups[0]?.results) || task.resultGroups[0].results.length < 1) {
        errors.push(`Task "${task.name}" progressive result group requires at least one result`);
      }
    }
    if (task.visibility) {
      if (!task.visibility.formula || !task.visibility.threshold) {
        errors.push(`Task "${task.name}" visibility gate requires formula and threshold`);
      }
    }
    if (task.timeRequirement) {
      let total = 0;
      for (const unit of ['minutes', 'hours', 'days', 'months', 'years']) {
        const value = Number(task.timeRequirement?.[unit] || 0);
        if (!Number.isFinite(value) || value < 0) {
          errors.push(`Task "${task.name}" timeRequirement.${unit} must be a non-negative number`);
          continue;
        }
        total += value;
      }
      if (total <= 0) {
        errors.push(`Task "${task.name}" timeRequirement must include a positive duration`);
      }
    }
    if (task.failureOutcome) {
      if (!['text', 'macro'].includes(task.failureOutcome.mode)) {
        errors.push(`Task "${task.name}" failureOutcome.mode must be text or macro`);
      }
      if (task.failureOutcome.mode === 'text' && !task.failureOutcome.text) {
        errors.push(`Task "${task.name}" failureOutcome text mode requires text`);
      }
      if (task.failureOutcome.mode === 'macro' && !task.failureOutcome.macroUuid) {
        errors.push(`Task "${task.name}" failureOutcome macro mode requires macroUuid`);
      }
    }
  }
  if (errors.length > 0) {
    const error = new Error(`Gathering environment validation failed: ${errors.join('; ')}`);
    error.errors = errors;
    throw error;
  }
}

function createServices({
  systems = [makeSystem()],
  environments = [],
  gatheringConfig = {},
  updateError = null,
  confirmResult = true,
  sceneOptions = [],
  rollTableOptions = []
} = {}) {
  const settings = { lastManagedCraftingSystem: '', gatheringConfig };
  const listCalls = [];
  const confirmCalls = [];
  const notifyCalls = { info: [], warn: [], error: [] };
  const calls = {
    create: [],
    update: [],
    duplicate: [],
    delete: [],
    reorder: [],
    cleanupTaskRuns: []
  };
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(system => system.id === id) || null,
    getItems: () => [],
    updateSystem: async (id, updates) => {
      const index = systems.findIndex(system => system.id === id);
      if (index < 0) return;
      systems[index] = {
        ...systems[index],
        ...updates,
        features: {
          ...(systems[index].features || {}),
          ...(updates.features || {})
        }
      };
    },
    createSystem: async () => null,
    deleteSystem: async () => {}
  };
  const recipeManager = {
    getRecipes: () => [],
    getRecipe: () => null
  };
  const records = environments;
  const gatheringEnvironmentStore = {
    list: () => clone(records),
    listBySystem: async (systemId) => {
      listCalls.push(systemId);
      return clone(records.filter(environment => environment.craftingSystemId === systemId));
    },
    create: async (environment) => {
      calls.create.push(clone(environment));
      validateEnvironmentForFakeCreate(environment);
      const created = { ...clone(environment), id: `created-${calls.create.length}` };
      records.push(created);
      return clone(created);
    },
    update: async (environmentId, environment) => {
      calls.update.push({ environmentId, environment: clone(environment) });
      if (updateError) throw updateError;
      validateEnvironmentForFakeCreate(environment);
      const index = records.findIndex(record => record.id === environmentId);
      if (index < 0) return null;
      const previousTaskIds = new Set((records[index].tasks || []).map(task => task.id));
      const nextTaskIds = new Set((environment.tasks || []).map(task => task.id));
      records[index] = { ...clone(environment), id: environmentId };
      for (const taskId of previousTaskIds) {
        if (!nextTaskIds.has(taskId)) calls.cleanupTaskRuns.push({ environmentId, taskId });
      }
      return clone(records[index]);
    },
    duplicate: async (environmentId) => {
      calls.duplicate.push(environmentId);
      const source = records.find(record => record.id === environmentId);
      if (!source) return null;
      const duplicate = {
        ...clone(source),
        id: `${environmentId}-copy`,
        name: `${source.name} Copy`
      };
      records.push(duplicate);
      return clone(duplicate);
    },
    delete: async (environmentId) => {
      calls.delete.push(environmentId);
      const index = records.findIndex(record => record.id === environmentId);
      if (index < 0) return false;
      records.splice(index, 1);
      return true;
    },
    reorder: async (systemId, orderedIds) => {
      calls.reorder.push({ systemId, orderedIds: clone(orderedIds) });
      const byId = new Map(records.map(record => [record.id, record]));
      const systemRecords = records.filter(record => record.craftingSystemId === systemId);
      const orderedSystemRecords = orderedIds
        .filter(id => byId.get(id)?.craftingSystemId === systemId)
        .map(id => byId.get(id));
      const orderedSet = new Set(orderedSystemRecords.map(record => record.id));
      for (const record of systemRecords) {
        if (!orderedSet.has(record.id)) orderedSystemRecords.push(record);
      }

      const queue = [...orderedSystemRecords];
      for (let index = 0; index < records.length; index += 1) {
        if (records[index].craftingSystemId === systemId) {
          records[index] = queue.shift();
        }
      }
      return clone(records.filter(record => record.craftingSystemId === systemId));
    }
  };

  return {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => { settings[key] = value; },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getGatheringEnvironmentStore: () => gatheringEnvironmentStore,
    getScriptMacros: () => [],
    getSceneOptions: () => sceneOptions,
    getRollTableOptions: () => rollTableOptions,
    notify: {
      info: (msg) => { notifyCalls.info.push(msg); },
      warn: (msg) => { notifyCalls.warn.push(msg); },
      error: (msg) => { notifyCalls.error.push(msg); }
    },
    confirmDialog: async (options) => {
      confirmCalls.push(clone(options));
      if (Array.isArray(confirmResult)) {
        return confirmResult[Math.min(confirmCalls.length - 1, confirmResult.length - 1)];
      }
      if (typeof confirmResult === 'function') {
        return confirmResult(options, confirmCalls.length - 1);
      }
      return confirmResult;
    },
    localize: (key, data = {}) => {
      const messages = {
        'FABRICATE.Admin.Environments.DeleteTitle': 'Delete {name}?',
        'FABRICATE.Admin.Environments.DeleteContent': 'Delete gathering environment <strong>{name}</strong>? This also cleans active and historical gathering runs that reference it.',
        'FABRICATE.Admin.Environments.DiscardDirtyTitle': 'Discard unsaved environment changes?',
        'FABRICATE.Admin.Environments.DiscardDirtyContent': 'The current gathering environment has unsaved changes. Discard them and continue?',
        'FABRICATE.Admin.Environments.DiscardDirtyConfirm': 'Discard Changes',
        'FABRICATE.Admin.Environments.DiscardDirtyCancel': 'Keep Editing',
        'FABRICATE.Admin.Environments.NewEnvironmentName': 'New Gathering Environment',
        'FABRICATE.Admin.Environments.NewTaskName': 'Configure gathering task',
        'FABRICATE.Admin.Environments.NewResultGroupName': 'Results',
        'FABRICATE.Admin.Environments.NewResultName': 'Result',
        'FABRICATE.Admin.Environments.TaskCopySuffix': '{name} Copy',
        'FABRICATE.Admin.Environments.ValidationSummary': 'Resolve {count} validation issues before saving.',
        'FABRICATE.Admin.Environments.ValidationSummaryOne': 'Resolve 1 validation issue before saving.',
        'FABRICATE.Admin.Manager.Environment.Tasks.DisabledNotice': 'Disabled task “{name}” — no longer available in {count} environment(s): {environments}.',
        'FABRICATE.Admin.Manager.Environment.Events.DisabledNotice': 'Disabled event “{name}” — no longer available in {count} environment(s): {environments}.'
      };
      return Object.entries(data).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        messages[key] || key
      );
    },
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {},
    getModuleVersion: () => 'test',
    downloadFile: async () => {},
    renderSystemImportDialog: async () => {},
    _listCalls: listCalls,
    _confirmCalls: confirmCalls,
    _notify: notifyCalls,
    _environmentCalls: calls,
    _environments: records
  };
}

describe('adminStore gathering environments tab state', () => {
  it('injects scene and roll-table picker options into the selected system view state', async () => {
    const sceneOptions = [{ uuid: 'Scene.forest', name: 'Forest', img: 'forest.webp' }];
    const rollTableOptions = [{ uuid: 'RollTable.forage', name: 'Forage Table', img: 'icons/svg/d20-grey.svg' }];
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment()],
      sceneOptions,
      rollTableOptions
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');

    const selectedSystem = get(store.viewState).selectedSystem;
    assert.deepEqual(selectedSystem.sceneOptions, sceneOptions);
    assert.deepEqual(selectedSystem.rollTableOptions, rollTableOptions);
  });

  it('exposes canShowEnvironmentsTab only when the selected system enables gathering', async () => {
    const services = createServices({
      systems: [
        makeSystem({ id: 'system-a', name: 'No Gathering', features: { gathering: false } }),
        makeSystem({ id: 'system-b', name: 'Gathering', features: { gathering: true } })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    assert.equal(get(store.viewState).canShowEnvironmentsTab, false);

    await store.selectSystem('system-b');
    assert.equal(get(store.viewState).canShowEnvironmentsTab, true);
  });

  it('falls back when setTab("environments") is requested while gathering is disabled', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: false } })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');

    assert.equal(get(store.activeTab), 'systems');
  });

  it('resets activeTab to a visible tab when gathering is toggled off', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    assert.equal(get(store.activeTab), 'environments');

    await store.toggleFeature('gathering', false);

    assert.equal(get(store.activeTab), 'systems');
    assert.equal(get(store.viewState).canShowEnvironmentsTab, false);
  });

  it('confirms before leaving a dirty environment draft by tab navigation', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.setTab('recipes');

    assert.equal(changed, false);
    assert.equal(get(store.activeTab), 'environments');
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._confirmCalls.length, 1);
    assert.equal(services._confirmCalls[0].title, 'Discard unsaved environment changes?');
    assert.match(services._confirmCalls[0].content, /Discard them and continue/);
    assert.equal(services._confirmCalls[0].yes.label, 'Discard Changes');
    assert.equal(services._confirmCalls[0].no.label, 'Keep Editing');
  });

  it('discards a dirty environment draft when tab navigation is confirmed', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.setTab('recipes');

    assert.equal(changed, true);
    assert.equal(get(store.activeTab), 'recipes');
    assert.equal(get(store.viewState).environmentDraft.name, 'Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('does not confirm when clean environment navigation leaves the draft unchanged', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    await store.setTab('recipes');
    await store.selectEnvironment('environment-b');

    assert.equal(services._confirmCalls.length, 0);
    assert.equal(get(store.viewState).environmentDraft.name, 'Cavern');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('confirms before switching systems away from a dirty environment draft', async () => {
    const services = createServices({
      systems: [
        makeSystem({ id: 'system-a', features: { gathering: true } }),
        makeSystem({ id: 'system-b', features: { gathering: true } })
      ],
      environments: [
        makeEnvironment({ id: 'environment-a', craftingSystemId: 'system-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', craftingSystemId: 'system-b', name: 'Cavern' })
      ],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.selectSystem('system-b');

    assert.equal(changed, false);
    assert.equal(get(store.selectedSystemId), 'system-a');
    assert.equal(get(store.activeTab), 'environments');
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('switches systems and resets the environment draft after dirty confirmation is accepted', async () => {
    const services = createServices({
      systems: [
        makeSystem({ id: 'system-a', features: { gathering: true } }),
        makeSystem({ id: 'system-b', features: { gathering: true } })
      ],
      environments: [
        makeEnvironment({ id: 'environment-a', craftingSystemId: 'system-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', craftingSystemId: 'system-b', name: 'Cavern' })
      ],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.selectSystem('system-b');

    assert.equal(changed, true);
    assert.equal(get(store.selectedSystemId), 'system-b');
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-b');
    assert.equal(get(store.viewState).environmentDraft.name, 'Cavern');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('confirms before selecting another environment over a dirty draft', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.selectEnvironment('environment-b');

    assert.equal(changed, false);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('selects another environment after dirty confirmation is accepted', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const changed = await store.selectEnvironment('environment-b');

    assert.equal(changed, true);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-b');
    assert.equal(get(store.viewState).environmentDraft.name, 'Cavern');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('confirms before creating a new environment over a dirty draft', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const draft = await store.createEnvironmentDraft();

    assert.equal(draft, null);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraftIsNew, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('creates a new dirty environment draft after dirty confirmation is accepted', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const draft = await store.createEnvironmentDraft();

    assert.equal(draft.name, 'New Gathering Environment');
    assert.equal(get(store.viewState).selectedEnvironmentId, '');
    assert.equal(get(store.viewState).environmentDraft.name, 'New Gathering Environment');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraftIsNew, true);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('confirms before duplicating another environment over a dirty draft', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const duplicated = await store.duplicateEnvironmentDraft('environment-b');

    assert.equal(duplicated, null);
    assert.deepEqual(services._environmentCalls.duplicate, []);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('duplicates an environment after dirty confirmation is accepted', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const duplicated = await store.duplicateEnvironmentDraft('environment-b');

    assert.equal(duplicated.id, 'environment-b-copy');
    assert.deepEqual(services._environmentCalls.duplicate, ['environment-b']);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-b-copy');
    assert.equal(get(store.viewState).environmentDraft.name, 'Cavern Copy');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('exposes the dirty draft confirmation helper for app close handling', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const action = await store.confirmDiscardDirtyEnvironmentDraft();

    assert.equal(action, 'cancel');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('shares one in-flight dirty discard confirmation across concurrent declined navigation', async () => {
    const confirmation = deferred();
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: () => confirmation.promise
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const recipesNavigation = store.setTab('recipes');
    const itemsNavigation = store.setTab('items');

    assert.equal(services._confirmCalls.length, 1);

    confirmation.resolve(false);
    const results = await Promise.all([recipesNavigation, itemsNavigation]);

    assert.deepEqual(results, [false, false]);
    assert.equal(get(store.activeTab), 'environments');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);

    const secondDecline = await store.setTab('recipes');
    assert.equal(secondDecline, false);
    assert.equal(services._confirmCalls.length, 2);
  });

  it('shares one in-flight dirty discard confirmation across concurrent accepted navigation', async () => {
    const confirmation = deferred();
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: () => confirmation.promise
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const recipesNavigation = store.setTab('recipes');
    const itemsNavigation = store.setTab('items');

    assert.equal(services._confirmCalls.length, 1);

    confirmation.resolve(true);
    const results = await Promise.all([recipesNavigation, itemsNavigation]);

    assert.deepEqual(results, [true, true]);
    assert.equal(get(store.activeTab), 'items');
    assert.equal(get(store.viewState).environmentDraft.name, 'Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('refreshes the environment list per selected system and does not leak draft state', async () => {
    const services = createServices({
      systems: [
        makeSystem({ id: 'system-a', features: { gathering: true } }),
        makeSystem({ id: 'system-b', features: { gathering: true } })
      ],
      environments: [
        makeEnvironment({ id: 'environment-a', craftingSystemId: 'system-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', craftingSystemId: 'system-b', name: 'Cavern' })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    assert.equal(get(store.viewState).environmentDraft?.name, 'Forest');

    await store.selectSystem('system-b');
    const viewState = get(store.viewState);

    assert.deepEqual(services._listCalls.slice(-2), ['system-a', 'system-b']);
    assert.deepEqual(viewState.environments.map(environment => environment.id), ['environment-b']);
    assert.equal(viewState.environmentDraft?.id, 'environment-b');
    assert.equal(viewState.environmentDraft?.name, 'Cavern');
  });

  it('clones environment list and draft records before exposing editable state', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      craftingSystemId: 'system-a',
      name: 'Forest'
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const viewState = get(store.viewState);
    viewState.environments[0].name = 'Mutated List Name';
    viewState.environmentDraft.name = 'Mutated Draft Name';
    viewState.environmentDraft.tasks[0].name = 'Mutated Task Name';

    assert.equal(persistedEnvironment.name, 'Forest');
    assert.equal(persistedEnvironment.tasks[0].name, 'Forage');
  });

  it('tracks selected environment draft dirty state and resets it after cancel, save, and select', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest', description: 'Old' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    assert.equal(get(store.viewState).environmentDraftDirty, false);

    store.updateEnvironmentDraft({ name: 'Deep Forest' });
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraft.name, 'Deep Forest');
    assert.equal(services._environments[0].name, 'Forest');

    await store.cancelEnvironmentDraft();
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(get(store.viewState).environmentDraft.name, 'Forest');

    store.updateEnvironmentDraft({ description: 'Updated' });
    const saveResult = await store.saveEnvironmentDraft();
    assert.equal(saveResult.ok, true);
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(services._environmentCalls.update.length, 1);
    assert.equal(services._environmentCalls.update[0].environmentId, 'environment-a');
    assert.equal(services._environmentCalls.update[0].environment.description, 'Updated');

    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });
    await store.selectEnvironment('environment-b');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.equal(get(store.viewState).environmentDraft.id, 'environment-b');
  });

  it('keeps per-environment node-pool edits in the environment draft and persists them on save', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', enabledTaskIds: ['mine-ore'] })],
      gatheringConfig: {
        systems: {
          'system-a': {
            tasks: [
              { id: 'mine-ore', name: 'Mine Ore', nodes: { max: 5, current: 5 } }
            ]
          }
        }
      }
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    // No stored pool yet — the environment seeds from the library config at runtime.
    assert.deepEqual(get(store.viewState).environmentDraft.nodeRuntime ?? {}, {});

    // A nodeRuntime patch is no longer dropped by the draft allow-list, and is
    // normalized through normalizeNodeRuntime (gains enabled/depletionTiming/respawn).
    store.updateEnvironmentDraft({ nodeRuntime: { 'mine-ore': { max: 5, current: 3 } } });
    const draft = get(store.viewState).environmentDraft;
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(draft.nodeRuntime['mine-ore'].current, 3);
    assert.equal(draft.nodeRuntime['mine-ore'].max, 5);
    assert.equal(draft.nodeRuntime['mine-ore'].enabled, true);
    assert.equal(draft.nodeRuntime['mine-ore'].depletionTiming, 'onStart');

    const saveResult = await store.saveEnvironmentDraft();
    assert.equal(saveResult.ok, true);
    const lastUpdate = services._environmentCalls.update.at(-1);
    assert.equal(lastUpdate.environmentId, 'environment-a');
    assert.equal(lastUpdate.environment.nodeRuntime['mine-ore'].current, 3);
    assert.equal(lastUpdate.environment.nodeRuntime['mine-ore'].max, 5);
  });

  it('summarizes task and event drop-rate adjustments in environment composition view state', async () => {
    const services = createServices({
      systems: [makeSystem({
        id: 'system-a',
        features: { gathering: true },
        components: [{ id: 'ore', name: 'Iron Ore', img: 'ore.png' }]
      })],
      environments: [makeEnvironment({
        id: 'environment-a',
        tasks: [],
        taskDropRateAdjustments: { 'task-library': { 'drop-ore': 25 } },
        eventDropRateAdjustments: { 'event-cave-in': -10 }
      })],
      gatheringConfig: {
        systems: {
          'system-a': {
            tasks: [
              { id: 'task-library', name: 'Mine Ore', dropRows: [{ id: 'drop-ore', componentId: 'ore', quantity: 1, dropRate: 40 }] }
            ],
            events: [
              { id: 'event-cave-in', name: 'Cave-in', dropRate: 30 }
            ]
          }
        }
      }
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    let composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].hasDropRateAdjustment, true);
    assert.equal(composition.tasks[0].dropRateAdjustmentsEnabled, true);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].name, 'Iron Ore');
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].img, 'ore.png');
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].adjustment, 25);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].effectiveDropRate, 65);
    assert.equal(composition.events[0].hasDropRateAdjustment, true);
    assert.equal(composition.events[0].dropRateAdjustment, -10);
    assert.equal(composition.events[0].effectiveDropRate, 20);

    store.updateEnvironmentDraft({
      taskDropRateAdjustments: { 'task-library': { 'drop-ore': 0 } },
      eventDropRateAdjustments: { 'event-cave-in': 0 }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].hasDropRateAdjustment, false);
    assert.equal(composition.events[0].hasDropRateAdjustment, false);
    assert.deepEqual(get(store.viewState).environmentDraft.taskDropRateAdjustments, {});
    assert.deepEqual(get(store.viewState).environmentDraft.eventDropRateAdjustments, {});

    store.updateEnvironmentDraft({
      taskDropRateAdjustments: { 'task-library': { 'drop-ore': 25 } },
      taskDropRateAdjustmentsEnabled: { 'task-library': false }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].dropRateAdjustmentsEnabled, false);
    assert.equal(composition.tasks[0].hasDropRateAdjustment, false);
    assert.equal(composition.tasks[0].hasStoredDropRateAdjustment, true);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].adjustment, 25);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].effectiveDropRate, 40);
    assert.deepEqual(get(store.viewState).environmentDraft.taskDropRateAdjustmentsEnabled, { 'task-library': false });

    store.updateEnvironmentDraft({
      taskDropRateAdjustmentsEnabled: { 'task-library': true }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].dropRateAdjustmentsEnabled, true);
    assert.equal(composition.tasks[0].hasDropRateAdjustment, true);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].effectiveDropRate, 65);
    assert.deepEqual(get(store.viewState).environmentDraft.taskDropRateAdjustmentsEnabled, {});

    store.updateEnvironmentDraft({
      eventDropRateAdjustments: { 'event-cave-in': -10 },
      eventDropRateAdjustmentsEnabled: { 'event-cave-in': false }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.events[0].dropRateAdjustmentsEnabled, false);
    assert.equal(composition.events[0].hasDropRateAdjustment, false);
    assert.equal(composition.events[0].hasStoredDropRateAdjustment, true);
    assert.equal(composition.events[0].dropRateAdjustment, -10);
    assert.equal(composition.events[0].effectiveDropRate, 30);
    assert.deepEqual(get(store.viewState).environmentDraft.eventDropRateAdjustmentsEnabled, { 'event-cave-in': false });

    store.updateEnvironmentDraft({
      eventDropRateAdjustmentsEnabled: { 'event-cave-in': true }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.events[0].dropRateAdjustmentsEnabled, true);
    assert.equal(composition.events[0].hasDropRateAdjustment, true);
    assert.equal(composition.events[0].hasStoredDropRateAdjustment, true);
    assert.equal(composition.events[0].effectiveDropRate, 20);
    assert.deepEqual(get(store.viewState).environmentDraft.eventDropRateAdjustmentsEnabled, {});
  });

  it('create, duplicate, delete, and reorder use the environment store and refresh selection safely', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.createEnvironmentDraft();
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraftIsNew, true);

    // A targeted environment needs a task source — enable a library task (the
    // composition flow that replaced authoring tasks directly on the environment).
    store.updateEnvironmentDraft({ enabledTaskIds: ['lib-task'] });
    const createResult = await store.saveEnvironmentDraft();
    assert.equal(createResult.ok, true);
    assert.equal(services._environmentCalls.create.length, 1);
    assert.equal(services._environmentCalls.create[0].craftingSystemId, 'system-a');
    assert.equal(services._environmentCalls.create[0].enabled, false);
    assert.equal(services._environmentCalls.create[0].selectionMode, 'targeted');
    assert.equal(get(store.viewState).selectedEnvironmentId, 'created-1');

    await store.duplicateEnvironmentDraft('environment-a');
    assert.deepEqual(services._environmentCalls.duplicate, ['environment-a']);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a-copy');

    await store.deleteEnvironmentDraft('environment-a-copy');
    assert.deepEqual(services._environmentCalls.delete, ['environment-a-copy']);
    assert.match(services._confirmCalls.at(-1).title, /environment-a-copy|Forest Copy/);
    assert.notEqual(get(store.viewState).selectedEnvironmentId, 'environment-a-copy');

    await store.reorderEnvironments(['environment-b', 'environment-a']);
    assert.deepEqual(services._environmentCalls.reorder.at(-1), {
      systemId: 'system-a',
      orderedIds: ['environment-b', 'environment-a']
    });
    assert.deepEqual(
      get(store.viewState).environments.slice(0, 2).map(environment => environment.id),
      ['environment-b', 'environment-a']
    );
  });

  it('toggles a non-selected persisted environment by id without changing the selected draft', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest', enabled: true }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern', enabled: false })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');

    const result = await store.toggleEnvironmentEnabled('environment-b', true);

    assert.equal(result, true);
    assert.equal(services._environmentCalls.update.length, 1);
    assert.equal(services._environmentCalls.update[0].environmentId, 'environment-b');
    assert.equal(services._environmentCalls.update[0].environment.enabled, true);
    assert.equal(get(store.viewState).environmentDraft.id, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.enabled, true);
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('surfaces failed persisted environment toggles without changing the saved card state', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest', enabled: true }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern', enabled: false })
      ],
      updateError: new Error('Toggle failed')
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');

    const result = await store.toggleEnvironmentEnabled('environment-b', true);

    assert.equal(result, false);
    assert.match(get(store.viewState).environmentSaveError, /Toggle failed/);
    assert.equal(services._environments.find(environment => environment.id === 'environment-b').enabled, false);
  });

  it('rejects enabling a persisted environment that has no task source', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        // A disabled draft persisted earlier with no task source (issue #298).
        makeEnvironment({ id: 'environment-a', name: 'Forest', enabled: false, tasks: [], enabledTaskIds: [], forcedTaskIds: [] })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');

    const result = await store.toggleEnvironmentEnabled('environment-a', true);

    assert.equal(result, false);
    assert.match(get(store.viewState).environmentSaveError, /at least one task before it can be enabled/);
    // The enable attempt is rejected, so the persisted record stays disabled.
    assert.equal(services._environments.find(environment => environment.id === 'environment-a').enabled, false);
  });

  it('saves a new disabled environment with no task source', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: []
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.createEnvironmentDraft();

    // New drafts default to enabled: false, so a task-less draft persists fine.
    const createResult = await store.saveEnvironmentDraft();
    assert.equal(createResult.ok, true);
    assert.equal(services._environmentCalls.create.length, 1);
    assert.equal(services._environmentCalls.create[0].enabled, false);
    // No task source authored on the draft, yet the disabled draft persists.
    assert.ok(!services._environmentCalls.create[0].enabledTaskIds?.length);
    assert.equal(get(store.viewState).environmentSaveError, null);
  });

  it('setEnvironmentRealmMembership adds and removes a realm tag on an environment', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest', includedRealmIds: [] })]
    });
    const store = createAdminStore(services);
    await store.selectSystem('system-a');

    const added = await store.setEnvironmentRealmMembership('environment-a', 'r1', true);
    assert.equal(added, true);
    assert.deepEqual(services._environments.find(e => e.id === 'environment-a').includedRealmIds, ['r1']);

    const removed = await store.setEnvironmentRealmMembership('environment-a', 'r1', false);
    assert.equal(removed, true);
    assert.deepEqual(services._environments.find(e => e.id === 'environment-a').includedRealmIds, []);

    // No-op (no extra persist) when already in the desired state.
    const updatesBefore = services._environmentCalls.update.length;
    const noop = await store.setEnvironmentRealmMembership('environment-a', 'r1', false);
    assert.equal(noop, true);
    assert.equal(services._environmentCalls.update.length, updatesBefore);
  });

  it('keeps a dirty selected draft coherent when toggling its persisted environment', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      name: 'Forest',
      description: 'Persisted',
      enabled: true
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ description: 'Unsaved local edit' });

    const result = await store.toggleEnvironmentEnabled('environment-a', false);

    assert.equal(result, true);
    assert.equal(services._environmentCalls.update.length, 1);
    assert.deepEqual(services._environmentCalls.update[0], {
      environmentId: 'environment-a',
      environment: { ...clone(persistedEnvironment), enabled: false }
    });
    assert.equal(services._environments[0].description, 'Persisted');
    assert.equal(services._environments[0].enabled, false);
    assert.equal(get(store.viewState).environmentDraft.description, 'Unsaved local edit');
    assert.equal(get(store.viewState).environmentDraft.enabled, false);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('does not delete an environment when the confirmation is cancelled', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const deleted = await store.deleteEnvironmentDraft('environment-a');

    assert.equal(deleted, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].title, /Forest/);
    assert.match(services._confirmCalls[0].content, /cleans active and historical gathering runs/);
    assert.deepEqual(services._environmentCalls.delete, []);
    assert.deepEqual(services._environments.map(environment => environment.id), ['environment-a']);
  });

  it('uses only the delete confirmation for a dirty selected persisted environment and preserves the draft when declined', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const deleted = await store.deleteEnvironmentDraft('environment-a');

    assert.equal(deleted, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].title, /Forest/);
    assert.doesNotMatch(services._confirmCalls[0].title, /Discard unsaved/);
    assert.deepEqual(services._environmentCalls.delete, []);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-a');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Forest');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('uses only the delete confirmation for a dirty selected persisted environment and deletes when accepted', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest' }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern' })
      ],
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Unsaved Forest' });

    const deleted = await store.deleteEnvironmentDraft('environment-a');

    assert.equal(deleted, true);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].title, /Forest/);
    assert.doesNotMatch(services._confirmCalls[0].title, /Discard unsaved/);
    assert.deepEqual(services._environmentCalls.delete, ['environment-a']);
    assert.equal(get(store.viewState).selectedEnvironmentId, 'environment-b');
    assert.equal(get(store.viewState).environmentDraft.name, 'Cavern');
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('confirms before discarding an unsaved new environment draft through delete', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.createEnvironmentDraft();
    store.updateEnvironmentDraft({ name: 'Unsaved Clearing' });

    const deleted = await store.deleteEnvironmentDraft();

    assert.equal(deleted, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.equal(services._confirmCalls[0].title, 'Discard unsaved environment changes?');
    assert.deepEqual(services._environmentCalls.delete, []);
    assert.equal(get(store.viewState).selectedEnvironmentId, '');
    assert.equal(get(store.viewState).environmentDraft.name, 'Unsaved Clearing');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('escapes GM-authored environment names before interpolating delete confirmation HTML', async () => {
    const maliciousName = '<img src=x onerror=alert(1)>';
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: maliciousName })],
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const deleted = await store.deleteEnvironmentDraft('environment-a');

    assert.equal(deleted, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.doesNotMatch(services._confirmCalls[0].content, /<img src=x onerror=alert\(1\)>/);
    assert.match(
      services._confirmCalls[0].content,
      /&lt;img src=x onerror=alert\(1\)&gt;/
    );
    assert.match(
      services._confirmCalls[0].content,
      /<strong>&lt;img src=x onerror=alert\(1\)&gt;<\/strong>/
    );
    assert.deepEqual(services._environmentCalls.delete, []);
  });

});

describe('adminStore gathering library match-loss handling', () => {
  function gatheringConfigWithTask() {
    return { systems: { 'system-a': { tasks: [{ id: 'lib-task', name: 'Forage', enabled: true, biomes: ['forest'], regions: [], dropRows: [] }], events: [] } } };
  }

  it('classifies a non-matching library task as notMatching in automatic mode even with a stale enabled entry', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({
        id: 'environment-a',
        name: 'Cavern',
        compositionMode: 'automatic',
        biomes: ['cavern'],
        enabledTaskIds: ['lib-task'] // stale allow-list entry left over from a previous manual phase
      })],
      gatheringConfig: gatheringConfigWithTask()
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.setTab('environments');
    await store.selectEnvironment('environment-a');

    const entry = get(store.viewState).environmentComposition.tasks.find(task => task.id === 'lib-task');
    assert.equal(entry.compositionState, 'notMatching');
  });

  it('warns and enumerates auto-mode and manually-enabled environments when an edit drops the match', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] }),
        makeEnvironment({ id: 'manual-enabled', name: 'Manual Enabled', compositionMode: 'manual', biomes: ['forest'], enabledTaskIds: ['lib-task'] }),
        makeEnvironment({ id: 'manual-forced', name: 'Manual Forced', compositionMode: 'manual', biomes: ['forest'], forcedTaskIds: ['lib-task'] }),
        makeEnvironment({ id: 'auto-excluded', name: 'Auto Excluded', compositionMode: 'automatic', biomes: ['forest'], disabledTaskIds: ['lib-task'] })
      ],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { biomes: ['cavern'] });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 1);
    const { content } = services._confirmCalls[0];
    assert.match(content, /Auto Forest/);
    assert.match(content, /Manual Enabled/);
    assert.doesNotMatch(content, /Manual Forced/); // force-included records stay regardless of match
    assert.doesNotMatch(content, /Auto Excluded/); // locally excluded records are not surfaced today
  });

  it('returns false without proceeding when the GM cancels the match-loss warning', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { biomes: ['cavern'] });

    assert.equal(proceed, false);
    assert.equal(services._confirmCalls.length, 1);
  });

  it('does not warn when the edit keeps the record matching its environments', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { name: 'Renamed' });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 0);
  });

  it('warns when raising an event danger tag above an environment danger level drops the match', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'], dangerLevel: 'hazardous' })],
      gatheringConfig: { systems: { 'system-a': { tasks: [], events: [{ id: 'lib-haz', name: 'Cave-in', enabled: true, biomes: ['forest'], regions: [], dangerTags: ['hazardous'], dropRate: 25 }] } } },
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryEventCompositionLoss('system-a', 'lib-haz', { dangerTags: ['extreme'] });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].content, /Auto Forest/);
  });

  it('lists auto-matched environments with no enabled entry when deleting a library task', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: false // decline so the record is not actually deleted
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const removed = await store.deleteGatheringLibraryTask('system-a', 'lib-task');

    assert.equal(removed, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].content, /Auto Forest/);
    assert.match(services._confirmCalls[0].content, /Used by/);
  });

  it('lists manual force-included environments when deleting a library event even without a match', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'forced', name: 'Forced Cave', compositionMode: 'manual', biomes: ['cavern'], forcedEventIds: ['lib-haz'] })],
      gatheringConfig: { systems: { 'system-a': { tasks: [], events: [{ id: 'lib-haz', name: 'Cave-in', enabled: true, biomes: ['forest'], regions: [], dangerTags: ['hazardous'], dropRate: 25 }] } } },
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const removed = await store.deleteGatheringLibraryEvent('system-a', 'lib-haz');

    assert.equal(removed, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.match(services._confirmCalls[0].content, /Forced Cave/);
    assert.match(services._confirmCalls[0].content, /Used by/);
  });

  it('does not list a manual environment whose stale enabled entry no longer matches when deleting', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      // Manual environment keeps a stale enabled entry, but the task no longer matches its biome,
      // so runtime composition does not include it — the delete dialog must not claim it is used.
      environments: [makeEnvironment({ id: 'manual', name: 'Manual Cavern', compositionMode: 'manual', biomes: ['cavern'], enabledTaskIds: ['lib-task'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: false
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const removed = await store.deleteGatheringLibraryTask('system-a', 'lib-task');

    assert.equal(removed, false);
    assert.equal(services._confirmCalls.length, 1);
    assert.doesNotMatch(services._confirmCalls[0].content, /Manual Cavern/);
    assert.doesNotMatch(services._confirmCalls[0].content, /Used by/);
  });

  it('does not warn on match loss for a library-disabled task', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] })],
      gatheringConfig: { systems: { 'system-a': { tasks: [{ id: 'lib-task', name: 'Forage', enabled: false, biomes: ['forest'], regions: [], dropRows: [] }], events: [] } } },
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { biomes: ['cavern'] });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 0);
  });

  it('does not warn on match loss for a manual environment that also force-includes the task', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      // Both enabled and forced: force-inclusion keeps it composed after the match edit, so no loss.
      environments: [makeEnvironment({ id: 'manual', name: 'Manual Forest', compositionMode: 'manual', biomes: ['forest'], enabledTaskIds: ['lib-task'], forcedTaskIds: ['lib-task'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { biomes: ['cavern'] });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 0);
  });

  it('does not show the composition-loss dialog when an edit disables the record', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] })],
      gatheringConfig: gatheringConfigWithTask(),
      confirmResult: true
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    // Disabling is announced by a notification (see updateGatheringLibraryTask), not gated by a dialog.
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss('system-a', 'lib-task', { enabled: false });

    assert.equal(proceed, true);
    assert.equal(services._confirmCalls.length, 0);
  });

  it('notifies (no dialog) and enumerates environments when a task is disabled from the library', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'] }),
        // Force-included into a non-matching environment: disabling still removes it here.
        makeEnvironment({ id: 'forced', name: 'Forced Cave', compositionMode: 'manual', biomes: ['cavern'], forcedTaskIds: ['lib-task'] })
      ],
      gatheringConfig: gatheringConfigWithTask()
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const ok = await store.updateGatheringLibraryTask('system-a', 'lib-task', { enabled: false });

    assert.equal(ok, true);
    assert.equal(services._confirmCalls.length, 0);
    assert.equal(services._notify.warn.length, 1);
    const message = services._notify.warn[0];
    assert.match(message, /Auto Forest/);
    assert.match(message, /Forced Cave/);
  });

  it('notifies when an event is disabled and enumerates its environments', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Forest', compositionMode: 'automatic', biomes: ['forest'], dangerLevel: 'hazardous' })],
      gatheringConfig: { systems: { 'system-a': { tasks: [], events: [{ id: 'lib-haz', name: 'Cave-in', enabled: true, biomes: ['forest'], regions: [], dangerTags: ['hazardous'], dropRate: 25 }] } } }
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const ok = await store.updateGatheringLibraryEvent('system-a', 'lib-haz', { enabled: false });

    assert.equal(ok, true);
    assert.equal(services._notify.warn.length, 1);
    assert.match(services._notify.warn[0], /Auto Forest/);
  });

  it('does not notify when enabling a task or disabling one that composes no environments', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      // The only environment does not match the forest task, so nothing currently composes it.
      environments: [makeEnvironment({ id: 'auto', name: 'Auto Cavern', compositionMode: 'automatic', biomes: ['cavern'] })],
      gatheringConfig: gatheringConfigWithTask()
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    await store.updateGatheringLibraryTask('system-a', 'lib-task', { enabled: false }); // disabled but unused → silent
    await store.updateGatheringLibraryTask('system-a', 'lib-task', { enabled: true }); // re-enable → silent

    assert.equal(services._notify.warn.length, 0);
  });
});

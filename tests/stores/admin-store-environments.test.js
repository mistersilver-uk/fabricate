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
    advancedOptionsEnabled: true,
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    components: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
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
        catalysts: [{
          componentId: 'catalyst-a',
          degradesOnUse: false,
          destroyWhenExhausted: false,
          maxUses: null
        }],
        visibility: { provider: 'macro', macroUuid: 'Macro.visibility' },
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
  if (environment.selectionMode === 'targeted' && (!Array.isArray(environment.tasks) || environment.tasks.length < 1)) {
    errors.push('targeted selection requires at least one task');
  }
  if (environment.selectionMode === 'blind' && (!Array.isArray(environment.tasks) || environment.tasks.length !== 1)) {
    errors.push('blind selection requires exactly one task');
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
      if (!task.check?.provider) {
        errors.push(`Task "${task.name}" progressive resolution requires check`);
      }
      if (task.check?.provider === 'macro' && !task.check.macroUuid) {
        errors.push(`Task "${task.name}" check macro provider requires macroUuid`);
      }
      if ((task.check?.provider === 'dnd5e' || task.check?.provider === 'pf2e') && !task.check.formula) {
        errors.push(`Task "${task.name}" check ${task.check.provider} provider requires formula`);
      }
      if (!Array.isArray(task.resultGroups) || task.resultGroups.length !== 1) {
        errors.push(`Task "${task.name}" progressive resolution requires exactly one result group`);
      } else if (!Array.isArray(task.resultGroups[0]?.results) || task.resultGroups[0].results.length < 1) {
        errors.push(`Task "${task.name}" progressive result group requires at least one result`);
      }
    }
    if (task.visibility) {
      if (task.visibility.provider === 'macro' && !task.visibility.macroUuid) {
        errors.push(`Task "${task.name}" visibility macro provider requires macroUuid`);
      }
      if ((task.visibility.provider === 'dnd5e' || task.visibility.provider === 'pf2e') && !task.visibility.formula) {
        errors.push(`Task "${task.name}" visibility ${task.visibility.provider} provider requires formula`);
      }
      if ((task.visibility.provider === 'dnd5e' || task.visibility.provider === 'pf2e') && !task.visibility.threshold) {
        errors.push(`Task "${task.name}" visibility ${task.visibility.provider} provider requires threshold`);
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
    notify: { info: () => {}, warn: () => {}, error: () => {} },
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
        'FABRICATE.Admin.Environments.ValidationSummaryOne': 'Resolve 1 validation issue before saving.'
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

    const confirmed = await store.confirmDiscardDirtyEnvironmentDraft();

    assert.equal(confirmed, false);
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

  it('summarizes task and hazard drop-rate adjustments in environment composition view state', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({
        id: 'environment-a',
        tasks: [],
        taskDropRateAdjustments: { 'task-library': { 'drop-ore': 25 } },
        hazardDropRateAdjustments: { 'hazard-cave-in': -10 }
      })],
      gatheringConfig: {
        systems: {
          'system-a': {
            tasks: [
              { id: 'task-library', name: 'Mine Ore', dropRows: [{ id: 'drop-ore', componentId: 'ore', quantity: 1, dropRate: 40 }] }
            ],
            hazards: [
              { id: 'hazard-cave-in', name: 'Cave-in', dropRate: 30 }
            ]
          }
        }
      }
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    let composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].hasDropRateAdjustment, true);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].adjustment, 25);
    assert.equal(composition.tasks[0].dropRateAdjustmentRows[0].effectiveDropRate, 65);
    assert.equal(composition.hazards[0].hasDropRateAdjustment, true);
    assert.equal(composition.hazards[0].dropRateAdjustment, -10);
    assert.equal(composition.hazards[0].effectiveDropRate, 20);

    store.updateEnvironmentDraft({
      taskDropRateAdjustments: { 'task-library': { 'drop-ore': 0 } },
      hazardDropRateAdjustments: { 'hazard-cave-in': 0 }
    });
    composition = get(store.viewState).environmentComposition;
    assert.equal(composition.tasks[0].hasDropRateAdjustment, false);
    assert.equal(composition.hazards[0].hasDropRateAdjustment, false);
    assert.deepEqual(get(store.viewState).environmentDraft.taskDropRateAdjustments, {});
    assert.deepEqual(get(store.viewState).environmentDraft.hazardDropRateAdjustments, {});
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

    const createResult = await store.saveEnvironmentDraft();
    assert.equal(createResult.ok, true);
    assert.equal(services._environmentCalls.create.length, 1);
    assert.equal(services._environmentCalls.create[0].craftingSystemId, 'system-a');
    assert.equal(services._environmentCalls.create[0].enabled, false);
    assert.equal(services._environmentCalls.create[0].selectionMode, 'targeted');
    assert.equal(services._environmentCalls.create[0].tasks.length, 1);
    assert.equal(services._environmentCalls.create[0].tasks[0].enabled, false);
    assert.equal(services._environmentCalls.create[0].tasks[0].resultSelection.provider, 'macroOutcome');
    assert.equal(services._environmentCalls.create[0].tasks[0].resultSelection.macroUuid, '');
    assert.equal(services._environmentCalls.create[0].tasks[0].resultGroups.length, 1);
    assert.ok(services._environmentCalls.create[0].tasks[0].resultGroups[0].id);
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

  it('clears previous environment save errors after a successful off-to-on card toggle', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({ id: 'environment-a', name: 'Forest', enabled: true }),
        makeEnvironment({ id: 'environment-b', name: 'Cavern', enabled: false })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: ''
    });
    const failedSave = await store.saveEnvironmentDraft();
    assert.equal(failedSave.ok, false);
    assert.ok(get(store.viewState).environmentSaveError);

    const result = await store.toggleEnvironmentEnabled('environment-b', true);

    assert.equal(result, true);
    assert.equal(get(store.viewState).environmentSaveError, null);
    assert.equal(services._environments.find(environment => environment.id === 'environment-b').enabled, true);
    assert.equal(
      get(store.viewState).environments.find(environment => environment.id === 'environment-b').enabled,
      true
    );
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

  it('blocks saving an enabled placeholder routed task until a real outcome provider target is selected', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: []
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const draft = await store.createEnvironmentDraft();
    const placeholderTaskId = draft.tasks[0].id;

    store.updateEnvironmentTask(placeholderTaskId, { enabled: true });
    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /macroOutcome provider requires macroUuid/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(services._environmentCalls.create.length, 1);
    assert.deepEqual(services._environments, []);
  });

  it('blocks provider-only routed switches that commit blank required provider fields', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultSelection('task-a', { provider: 'rollTableOutcome' });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /rollTableOutcome provider requires rollTableUuid/);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0].resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: ''
    });
  });

  it('cancel restores the last persisted clone without mutating store-owned records', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      name: 'Forest',
      tasks: [{ id: 'task-a', name: 'Forage', enabled: true, resolutionMode: 'routed', catalysts: [], resultGroups: [] }]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ name: 'Changed' });
    get(store.viewState).environmentDraft.tasks[0].name = 'Mutated View Task';

    await store.cancelEnvironmentDraft();

    assert.equal(get(store.viewState).environmentDraft.name, 'Forest');
    assert.equal(get(store.viewState).environmentDraft.tasks[0].name, 'Forage');
    assert.equal(persistedEnvironment.name, 'Forest');
    assert.equal(persistedEnvironment.tasks[0].name, 'Forage');
  });

  it('save preserves existing task data and keeps dirty draft state when validation throws', async () => {
    const validationError = new Error('Validation failed');
    validationError.errors = ['Task "Forage" routed resolution requires resultSelection'];
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })],
      updateError: validationError
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTasks = clone(get(store.viewState).environmentDraft.tasks);
    store.updateEnvironmentDraft({ name: 'Invalid Forest' });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraft.name, 'Invalid Forest');
    assert.match(get(store.viewState).environmentSaveError, /routed resolution requires resultSelection/);
    assert.deepEqual(services._environmentCalls.update[0], {
      environmentId: 'environment-a',
      environment: {
        ...makeEnvironment({ id: 'environment-a', name: 'Invalid Forest' }),
        tasks: originalTasks
      }
    });
  });

  it('failed environment validation exposes localized field-addressable state and keeps the dirty draft intact', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentDraft({ selectionMode: 'blind' });
    const addedTask = store.addEnvironmentTask();
    store.updateEnvironmentTask('task-a', { resolutionMode: 'progressive' });
    store.updateEnvironmentTaskTimeRequirement('task-a', {
      minutes: 0,
      hours: 0,
      days: 0,
      months: 0,
      years: 0
    });
    store.updateEnvironmentTaskFailureOutcome('task-a', { mode: 'text', text: '' });
    store.updateEnvironmentTaskResultGroup('task-a', 'group-a', { name: 'fail' });
    const duplicateGroup = store.addEnvironmentTaskResultGroup('task-a');
    store.updateEnvironmentTaskResultGroup('task-a', duplicateGroup.id, { name: 'fail' });
    store.updateEnvironmentTask(addedTask.id, { enabled: true });

    const result = await store.saveEnvironmentDraft();
    const viewState = get(store.viewState);
    const validation = viewState.environmentValidationState;

    assert.equal(result.ok, false);
    assert.equal(viewState.environmentDraftDirty, true);
    assert.equal(viewState.environmentDraft.selectionMode, 'blind');
    assert.equal(viewState.environmentDraft.tasks.length, 2);
    assert.deepEqual(services._environments[0].tasks.map(task => task.id), ['task-a']);
    assert.equal(validation.summary, 'Resolve 10 validation issues before saving.');
    assert.equal(validation.firstInvalidField.path, 'environment.selectionMode');
    assert.equal(validation.firstInvalidField.fieldSelector, '[data-environment-field="environment.selectionMode"]');
    assert.ok(validation.attempt > 0);

    const errorsByPath = new Map(validation.errors.map(error => [error.path, error.message]));
    assert.match(errorsByPath.get('environment.selectionMode'), /blind selection requires exactly one task/);
    assert.match(errorsByPath.get('task.task-a.progressive.awardMode'), /progressive\.awardMode/);
    assert.match(errorsByPath.get('task.task-a.check.provider'), /progressive resolution requires check/);
    assert.match(errorsByPath.get('task.task-a.timeRequirement.minutes'), /positive duration/);
    assert.match(errorsByPath.get('task.task-a.failureOutcome.text'), /failureOutcome text mode requires text/);
    assert.ok(validation.errors.some(error =>
      error.path === 'task.task-a.resultGroups.group-a.name' &&
      /reserved failure keyword/.test(error.message)
    ));
    assert.ok(validation.errors.some(error =>
      error.path?.startsWith('task.task-a.resultGroups.') &&
      /duplicates/.test(error.message)
    ));
    assert.match(errorsByPath.get(`task.${addedTask.id}.resultSelection.macroUuid`), /macroOutcome provider requires macroUuid/);
    assert.equal(result.validation.firstInvalidField.path, 'environment.selectionMode');
  });

  it('addresses duplicate reserved result-group errors to distinct group fields with unique summary ids', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultGroup('task-a', 'group-a', { name: 'fail' });
    const duplicateGroup = store.addEnvironmentTaskResultGroup('task-a');
    store.updateEnvironmentTaskResultGroup('task-a', duplicateGroup.id, { name: 'fail' });

    const result = await store.saveEnvironmentDraft();
    const validation = get(store.viewState).environmentValidationState;

    assert.equal(result.ok, false);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.deepEqual(
      validation.errors
        .filter(error => /result group/.test(error.message))
        .map(error => error.path),
      [
        'task.task-a.resultGroups.group-a.name',
        `task.task-a.resultGroups.${duplicateGroup.id}.name`,
        `task.task-a.resultGroups.${duplicateGroup.id}.name`
      ]
    );
    assert.equal(new Set(validation.errors.map(error => error.id)).size, validation.errors.length);
    assert.deepEqual(
      validation.errors
        .filter(error => /result group/.test(error.message))
        .map(error => error.fieldSelector),
      [
        '[data-environment-field="task.task-a.resultGroups.group-a.name"]',
        `[data-environment-field="task.task-a.resultGroups.${duplicateGroup.id}.name"]`,
        `[data-environment-field="task.task-a.resultGroups.${duplicateGroup.id}.name"]`
      ]
    );
  });

  it('maps collection-level result validation to focusable result-group anchors', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.deleteEnvironmentTaskResultGroup('task-a', 'group-a');

    let result = await store.saveEnvironmentDraft();
    let validation = get(store.viewState).environmentValidationState;

    assert.equal(result.ok, false);
    assert.equal(validation.firstInvalidField.path, 'task.task-a.resultGroups');
    assert.equal(validation.firstInvalidField.fieldSelector, '[data-environment-field="task.task-a.resultGroups"]');

    await store.cancelEnvironmentDraft();
    store.updateEnvironmentTask('task-a', { resolutionMode: 'progressive' });
    store.updateEnvironmentTaskProgressive('task-a', { awardMode: 'equal' });
    store.updateEnvironmentTaskCheck('task-a', {
      provider: 'macro',
      macroUuid: 'Macro.progressiveCheck'
    });
    store.deleteEnvironmentTaskResult('task-a', 'group-a', 'result-a');

    result = await store.saveEnvironmentDraft();
    validation = get(store.viewState).environmentValidationState;

    assert.equal(result.ok, false);
    assert.equal(validation.firstInvalidField.path, 'task.task-a.resultGroups.group-a.results');
    assert.equal(validation.firstInvalidField.fieldSelector, '[data-environment-field="task.task-a.resultGroups.group-a.results"]');
  });

  it('clears environment validation state when the GM edits after a failed save', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: ''
    });

    const result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.ok(get(store.viewState).environmentValidationState);

    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.repaired'
    });

    assert.equal(get(store.viewState).environmentValidationState, null);
    assert.equal(get(store.viewState).environmentSaveError, null);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('adds, selects, duplicates, deletes, and reorders tasks only in the cloned draft', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        makeEnvironment().tasks[0],
        {
          ...makeEnvironment().tasks[0],
          id: 'task-b',
          name: 'Chop Wood',
          resultGroups: [{ id: 'group-b', name: 'Wood', results: [{ id: 'result-b', componentId: 'component-b', quantity: 2 }] }]
        }
      ]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, 'task-a');

    store.selectEnvironmentTask('task-b');
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, 'task-b');
    assert.equal(get(store.viewState).environmentDraftDirty, false);

    const added = store.addEnvironmentTask();
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, added.id);
    assert.equal(get(store.viewState).environmentDraft.tasks.length, 3);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(persistedEnvironment.tasks.length, 2);

    const duplicated = store.duplicateEnvironmentTask('task-a');
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, duplicated.id);
    assert.equal(get(store.viewState).environmentDraft.tasks.length, 4);
    assert.deepEqual(duplicated.resultGroups, persistedEnvironment.tasks[0].resultGroups);
    assert.deepEqual(duplicated.catalysts, persistedEnvironment.tasks[0].catalysts);
    assert.notEqual(duplicated.id, 'task-a');
    assert.deepEqual(persistedEnvironment.tasks.map(task => task.id), ['task-a', 'task-b']);

    store.deleteEnvironmentTask(added.id);
    assert.equal(get(store.viewState).environmentDraft.tasks.some(task => task.id === added.id), false);
    assert.deepEqual(persistedEnvironment.tasks.map(task => task.id), ['task-a', 'task-b']);

    store.reorderEnvironmentTasks(['task-b', duplicated.id, 'task-a']);
    assert.deepEqual(
      get(store.viewState).environmentDraft.tasks.map(task => task.id),
      ['task-b', duplicated.id, 'task-a']
    );
    assert.deepEqual(persistedEnvironment.tasks.map(task => task.id), ['task-a', 'task-b']);
  });

  it('marks the environment draft dirty when editing base task fields and preserves nested task config', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);

    const updated = store.updateEnvironmentTask('task-a', {
      name: 'Careful Forage',
      description: 'Look under roots and stones.',
      img: 'icons/svg/oak.svg',
      enabled: false,
      resolutionMode: 'progressive'
    });

    assert.equal(updated, true);
    const task = get(store.viewState).environmentDraft.tasks[0];
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(task.name, 'Careful Forage');
    assert.equal(task.description, 'Look under roots and stones.');
    assert.equal(task.img, 'icons/svg/oak.svg');
    assert.equal(task.enabled, false);
    assert.equal(task.resolutionMode, 'progressive');
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
  });

  it('saves a full environment payload with nested task config preserved after base task edits', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);
    store.updateEnvironmentTask('task-a', {
      name: 'Careful Forage',
      description: 'Look under roots and stones.',
      img: 'icons/svg/oak.svg',
      enabled: false,
      resolutionMode: 'routed'
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.equal(services._environmentCalls.update.length, 1);
    assert.deepEqual(services._environmentCalls.update[0].environment.tasks[0], {
      ...originalTask,
      name: 'Careful Forage',
      description: 'Look under roots and stones.',
      img: 'icons/svg/oak.svg',
      enabled: false,
      resolutionMode: 'routed'
    });
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('adds, renames, deletes, and reorders selected-task result groups without mutating persisted records', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        makeEnvironment().tasks[0],
        {
          ...makeEnvironment().tasks[0],
          id: 'task-b',
          name: 'Mine Gems',
          resultGroups: [
            { id: 'group-b', name: 'Gems', results: [{ id: 'result-b', componentId: 'component-b', quantity: 2 }] },
            { id: 'group-c', name: 'Dust', results: [{ id: 'result-c', componentId: 'component-c', quantity: 1 }] }
          ]
        }
      ]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.selectEnvironmentTask('task-b');
    const added = store.addEnvironmentTaskResultGroup();

    assert.equal(get(store.viewState).selectedEnvironmentTaskId, 'task-b');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(get(store.viewState).environmentDraft.tasks[1].resultGroups.length, 3);
    assert.equal(persistedEnvironment.tasks[1].resultGroups.length, 2);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0], persistedEnvironment.tasks[0]);

    const renamed = store.updateEnvironmentTaskResultGroup('task-b', added.id, { name: 'Rare Finds' });
    assert.equal(renamed, true);
    assert.equal(
      get(store.viewState).environmentDraft.tasks[1].resultGroups.find(group => group.id === added.id).name,
      'Rare Finds'
    );

    store.reorderEnvironmentTaskResultGroups('task-b', [added.id, 'group-c', 'group-b']);
    assert.deepEqual(
      get(store.viewState).environmentDraft.tasks[1].resultGroups.map(group => group.id),
      [added.id, 'group-c', 'group-b']
    );

    store.deleteEnvironmentTaskResultGroup('task-b', 'group-c');
    assert.deepEqual(
      get(store.viewState).environmentDraft.tasks[1].resultGroups.map(group => group.id),
      [added.id, 'group-b']
    );
    assert.deepEqual(
      persistedEnvironment.tasks[1].resultGroups.map(group => group.id),
      ['group-b', 'group-c']
    );
  });

  it('adds, edits, deletes, and reorders component results on the selected task draft', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        {
          ...makeEnvironment().tasks[0],
          resultGroups: [
            {
              id: 'group-a',
              name: 'Common',
              results: [
                { id: 'result-a', componentId: 'component-a', quantity: 1 },
                { id: 'result-b', componentId: 'component-b', quantity: 2 }
              ]
            }
          ],
          catalysts: [{
            componentId: 'catalyst-a',
            degradesOnUse: false,
            destroyWhenExhausted: false,
            maxUses: null
          }],
          visibility: { provider: 'macro', macroUuid: 'Macro.visibility' },
          timeRequirement: { minutes: 5, hours: 0, days: 0, months: 0, years: 0 },
          failureOutcome: { mode: 'text', text: 'Nothing useful turns up.' },
          resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.gatheringOutcome' }
        }
      ]
    });
    const services = createServices({
      systems: [
        makeSystem({
          id: 'system-a',
          features: { gathering: true },
          components: [
            { id: 'component-a', name: 'Herb', img: 'herb.png', difficulty: 1 },
            { id: 'component-b', name: 'Gem', img: 'gem.png', difficulty: 3 },
            { id: 'component-c', name: 'Ore', img: 'ore.png', difficulty: 5 }
          ]
        })
      ],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);
    const added = store.addEnvironmentTaskResult('task-a', 'group-a');

    assert.equal(added.componentId, 'component-a');
    assert.equal(added.quantity, 1);
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, 'task-a');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(persistedEnvironment.tasks[0].resultGroups[0].results.length, 2);

    store.updateEnvironmentTaskResult('task-a', 'group-a', added.id, {
      componentId: 'component-c',
      quantity: 4
    });
    const updatedResult = get(store.viewState).environmentDraft.tasks[0].resultGroups[0].results
      .find(result => result.id === added.id);
    assert.deepEqual(updatedResult, {
      id: added.id,
      componentId: 'component-c',
      quantity: 4,
      propertyMacroUuid: null
    });

    store.reorderEnvironmentTaskResults('task-a', 'group-a', [added.id, 'result-b', 'result-a']);
    assert.deepEqual(
      get(store.viewState).environmentDraft.tasks[0].resultGroups[0].results.map(result => result.id),
      [added.id, 'result-b', 'result-a']
    );

    store.deleteEnvironmentTaskResult('task-a', 'group-a', 'result-b');
    const task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(
      task.resultGroups[0].results.map(result => result.id),
      [added.id, 'result-a']
    );
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(
      persistedEnvironment.tasks[0].resultGroups[0].results.map(result => result.id),
      ['result-a', 'result-b']
    );
  });

  it('adds, updates, and deletes catalysts on the selected task draft without dropping nested config', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        {
          ...makeEnvironment().tasks[0],
          catalysts: [
            {
              componentId: 'catalyst-a',
              degradesOnUse: false,
              destroyWhenExhausted: false,
              maxUses: null
            }
          ],
          visibility: { provider: 'macro', macroUuid: 'Macro.visibility' },
          timeRequirement: { minutes: 5, hours: 0, days: 0, months: 0, years: 0 },
          failureOutcome: { mode: 'text', text: 'Nothing useful turns up.' },
          resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.gatheringOutcome' },
          resultGroups: [
            {
              id: 'group-a',
              name: 'Common',
              results: [{ id: 'result-a', componentId: 'component-a', quantity: 1 }]
            }
          ]
        }
      ]
    });
    const services = createServices({
      systems: [
        makeSystem({
          id: 'system-a',
          features: { gathering: true },
          components: [
            { id: 'component-a', name: 'Herb', img: 'herb.png', difficulty: 1 },
            { id: 'catalyst-a', name: 'Knife', img: 'knife.png', difficulty: 1 },
            { id: 'catalyst-b', name: 'Basket', img: 'basket.png', difficulty: 2 }
          ]
        })
      ],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);
    const added = store.addEnvironmentTaskCatalyst('task-a');

    assert.deepEqual(added, {
      componentId: 'component-a',
      degradesOnUse: false,
      destroyWhenExhausted: false,
      maxUses: null
    });
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(persistedEnvironment.tasks[0].catalysts.length, 1);

    const updated = store.updateEnvironmentTaskCatalyst('task-a', 1, {
      componentId: 'catalyst-b',
      degradesOnUse: true,
      destroyWhenExhausted: true,
      maxUses: '4'
    });
    assert.equal(updated, true);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0].catalysts[1], {
      componentId: 'catalyst-b',
      degradesOnUse: true,
      destroyWhenExhausted: true,
      maxUses: 4
    });

    store.updateEnvironmentTaskCatalyst('task-a', 1, {
      degradesOnUse: false,
      maxUses: '3'
    });
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0].catalysts[1], {
      componentId: 'catalyst-b',
      degradesOnUse: false,
      destroyWhenExhausted: true,
      maxUses: 3
    });

    store.updateEnvironmentTaskCatalyst('task-a', 1, { maxUses: '' });
    assert.equal(get(store.viewState).environmentDraft.tasks[0].catalysts[1].maxUses, null);

    const deleted = store.deleteEnvironmentTaskCatalyst('task-a', 0);
    assert.equal(deleted, true);
    const task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.catalysts, [
      {
        componentId: 'catalyst-b',
        degradesOnUse: false,
        destroyWhenExhausted: true,
        maxUses: null
      }
    ]);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
    assert.deepEqual(persistedEnvironment.tasks[0].catalysts, originalTask.catalysts);
  });

  it('adds, updates, and clears selected-task visibility on the cloned draft', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        {
          ...makeEnvironment().tasks[0],
          visibility: null
        }
      ]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');

    const added = store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'macro',
      macroUuid: 'Macro.visible'
    });
    assert.equal(added, true);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0].visibility, {
      provider: 'macro',
      macroUuid: 'Macro.visible'
    });
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(persistedEnvironment.tasks[0].visibility, null);

    const updated = store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'dnd5e',
      formula: '@skills.sur.value',
      threshold: '12',
      macroUuid: 'Macro.stale'
    });
    assert.equal(updated, true);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0].visibility, {
      provider: 'dnd5e',
      formula: '@skills.sur.value',
      threshold: '12'
    });

    const cleared = store.updateEnvironmentTaskVisibility('task-a', null);
    assert.equal(cleared, true);
    assert.equal(Object.prototype.hasOwnProperty.call(get(store.viewState).environmentDraft.tasks[0], 'visibility'), false);
    assert.equal(persistedEnvironment.tasks[0].visibility, null);
  });

  it('normalizes visibility provider switches without dropping other selected-task configuration', async () => {
    const persistedEnvironment = makeEnvironment({ id: 'environment-a', name: 'Forest' });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);

    store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'pf2e',
      formula: '@skills.sur.mod',
      threshold: '18',
      macroUuid: 'Macro.stale'
    });
    let task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.visibility, {
      provider: 'pf2e',
      formula: '@skills.sur.mod',
      threshold: '18'
    });
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);

    store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'macro',
      macroUuid: 'Macro.visible',
      formula: '@stale',
      threshold: '99'
    });
    task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.visibility, {
      provider: 'macro',
      macroUuid: 'Macro.visible'
    });
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
  });

  it('saves visibility edits through the gathering environment validation boundary', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'dnd5e',
      formula: '@skills.sur.value',
      threshold: '12'
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].visibility, {
      provider: 'dnd5e',
      formula: '@skills.sur.value',
      threshold: '12'
    });
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('updates routed result-selection providers while clearing irrelevant provider UUIDs and preserving task config', async () => {
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [
        {
          ...makeEnvironment().tasks[0],
          resultSelection: {
            provider: 'macroOutcome',
            macroUuid: 'Macro.old'
          }
        }
      ]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[0]);

    const switchedToTable = store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.forest',
      macroUuid: 'Macro.stale'
    });

    assert.equal(switchedToTable, true);
    let task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.forest'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(task.resultSelection, 'macroUuid'), false);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.equal(persistedEnvironment.tasks[0].resultSelection.macroUuid, 'Macro.old');

    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'macroOutcome',
      macroUuid: 'Macro.new',
      rollTableUuid: 'RollTable.stale'
    });
    task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.resultSelection, {
      provider: 'macroOutcome',
      macroUuid: 'Macro.new'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(task.resultSelection, 'rollTableUuid'), false);
  });

  it('saves routed roll-table result selection through the environment validation boundary', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.forage'
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.forage'
    });
  });

  it('surfaces validation errors when routed result-selection provider fields are blank', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultSelection('task-a', {
      provider: 'rollTableOutcome',
      rollTableUuid: ''
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /rollTableOutcome provider requires rollTableUuid/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('updates progressive award mode and check providers while preserving routed and sibling task config', async () => {
    const routedTask = makeEnvironment().tasks[0];
    const progressiveTask = {
      ...makeEnvironment().tasks[0],
      id: 'task-b',
      name: 'Careful Forage',
      resolutionMode: 'progressive',
      progressive: { awardMode: 'equal' },
      check: { provider: 'macro', macroUuid: 'Macro.oldCheck' },
      resultGroups: [
        {
          id: 'group-b',
          name: 'Progressive Finds',
          results: [{ id: 'result-b', componentId: 'component-a', quantity: 1 }]
        }
      ]
    };
    const persistedEnvironment = makeEnvironment({
      id: 'environment-a',
      tasks: [routedTask, progressiveTask]
    });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.selectEnvironmentTask('task-b');
    const originalTask = clone(get(store.viewState).environmentDraft.tasks[1]);

    assert.equal(store.updateEnvironmentTaskProgressive('task-b', { awardMode: 'partial' }), true);
    assert.equal(store.updateEnvironmentTaskCheck('task-b', {
      provider: 'dnd5e',
      formula: '@skills.sur.total',
      threshold: '',
      macroUuid: 'Macro.stale'
    }), true);

    let task = get(store.viewState).environmentDraft.tasks[1];
    assert.deepEqual(task.progressive, { awardMode: 'partial' });
    assert.deepEqual(task.check, {
      provider: 'dnd5e',
      formula: '@skills.sur.total'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(task.check, 'threshold'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(task.check, 'macroUuid'), false);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(task.resultGroups, originalTask.resultGroups);
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks[0], routedTask);

    store.updateEnvironmentTaskCheck('task-b', {
      provider: 'pf2e',
      formula: '@actor.skills.sur.mod',
      threshold: '18'
    });
    task = get(store.viewState).environmentDraft.tasks[1];
    assert.deepEqual(task.check, {
      provider: 'pf2e',
      formula: '@actor.skills.sur.mod',
      threshold: '18'
    });

    store.updateEnvironmentTaskCheck('task-b', {
      provider: 'macro',
      macroUuid: 'Macro.newCheck',
      formula: '@stale',
      threshold: '99'
    });
    task = get(store.viewState).environmentDraft.tasks[1];
    assert.deepEqual(task.check, {
      provider: 'macro',
      macroUuid: 'Macro.newCheck'
    });
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.deepEqual(persistedEnvironment.tasks[1].check, { provider: 'macro', macroUuid: 'Macro.oldCheck' });
  });

  it('saves progressive award mode and check configuration through the validation boundary', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTask('task-a', { resolutionMode: 'progressive' });
    store.updateEnvironmentTaskProgressive('task-a', { awardMode: 'exceed' });
    store.updateEnvironmentTaskCheck('task-a', {
      provider: 'macro',
      macroUuid: 'Macro.progressiveCheck'
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.equal(services._environmentCalls.update.at(-1).environment.tasks[0].resolutionMode, 'progressive');
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].progressive, {
      awardMode: 'exceed'
    });
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].check, {
      provider: 'macro',
      macroUuid: 'Macro.progressiveCheck'
    });
  });

  it('blocks routed-to-progressive save until progressive award and check fields are committed', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTask('task-a', { resolutionMode: 'progressive' });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /progressive resolution requires check/);
    assert.match(result.error, /progressive.awardMode must be partial, equal, or exceed/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('surfaces validation errors when progressive check provider fields are blank', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTask('task-a', { resolutionMode: 'progressive' });
    store.updateEnvironmentTaskProgressive('task-a', { awardMode: 'equal' });
    store.updateEnvironmentTaskCheck('task-a', {
      provider: 'dnd5e',
      formula: '',
      threshold: ''
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /check dnd5e provider requires formula/);
    assert.doesNotMatch(result.error, /requires threshold/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('surfaces validation errors when saving blank visibility provider fields', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'macro',
      macroUuid: ''
    });

    let result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /visibility macro provider requires macroUuid/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);

    store.updateEnvironmentTaskVisibility('task-a', {
      provider: 'pf2e',
      formula: '',
      threshold: ''
    });

    result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /visibility pf2e provider requires formula/);
    assert.match(result.error, /visibility pf2e provider requires threshold/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('sets and clears selected-task time requirements without dropping unrelated task config', async () => {
    const originalTask = makeEnvironment().tasks[0];
    const persistedEnvironment = makeEnvironment({ id: 'environment-a', name: 'Forest' });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskTimeRequirement('task-a', {
      minutes: '15',
      hours: '2',
      days: '',
      months: 0,
      years: 0
    });

    let task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.timeRequirement, {
      minutes: 15,
      hours: 2,
      days: 0,
      months: 0,
      years: 0
    });
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);
    assert.deepEqual(persistedEnvironment.tasks[0].timeRequirement, originalTask.timeRequirement);

    const result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].timeRequirement, {
      minutes: 15,
      hours: 2,
      days: 0,
      months: 0,
      years: 0
    });

    store.updateEnvironmentTaskTimeRequirement('task-a', null);
    task = get(store.viewState).environmentDraft.tasks[0];
    assert.equal(Object.prototype.hasOwnProperty.call(task, 'timeRequirement'), false);
    assert.deepEqual(task.failureOutcome, originalTask.failureOutcome);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
  });

  it('rejects all-zero, negative, and non-numeric selected-task time requirements at save', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskTimeRequirement('task-a', {
      minutes: 0,
      hours: 0,
      days: 0,
      months: 0,
      years: 0
    });

    let result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /timeRequirement must include a positive duration/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);

    store.updateEnvironmentTaskTimeRequirement('task-a', { minutes: -1, hours: 0 });
    result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /timeRequirement\.minutes must be a non-negative number/);

    store.updateEnvironmentTaskTimeRequirement('task-a', { minutes: 'many', hours: 0 });
    result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /timeRequirement\.minutes must be a non-negative number/);
  });

  it('sets, switches, and clears selected-task failure outcomes while clearing stale provider fields', async () => {
    const originalTask = makeEnvironment().tasks[0];
    const persistedEnvironment = makeEnvironment({ id: 'environment-a', name: 'Forest' });
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskFailureOutcome('task-a', {
      mode: 'text',
      text: 'The forest offers nothing.'
    });

    let task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.failureOutcome, {
      mode: 'text',
      text: 'The forest offers nothing.'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(task.failureOutcome, 'macroUuid'), false);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.deepEqual(task.catalysts, originalTask.catalysts);
    assert.deepEqual(task.visibility, originalTask.visibility);
    assert.deepEqual(task.resultSelection, originalTask.resultSelection);

    store.updateEnvironmentTaskFailureOutcome('task-a', {
      mode: 'macro',
      macroUuid: 'Macro.failureOutcome'
    });
    task = get(store.viewState).environmentDraft.tasks[0];
    assert.deepEqual(task.failureOutcome, {
      mode: 'macro',
      macroUuid: 'Macro.failureOutcome'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(task.failureOutcome, 'text'), false);

    let result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].failureOutcome, {
      mode: 'macro',
      macroUuid: 'Macro.failureOutcome'
    });

    store.updateEnvironmentTaskFailureOutcome('task-a', null);
    task = get(store.viewState).environmentDraft.tasks[0];
    assert.equal(Object.prototype.hasOwnProperty.call(task, 'failureOutcome'), false);
    assert.deepEqual(task.timeRequirement, originalTask.timeRequirement);
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.equal(persistedEnvironment.tasks[0].failureOutcome.text, 'Nothing useful turns up.');
  });

  it('surfaces validation errors for blank selected-task failure outcome text and macro UUID', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskFailureOutcome('task-a', { mode: 'text', text: '' });

    let result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /failureOutcome text mode requires text/);
    assert.equal(get(store.viewState).environmentDraftDirty, true);

    store.updateEnvironmentTaskFailureOutcome('task-a', { mode: 'macro', macroUuid: '' });
    result = await store.saveEnvironmentDraft();
    assert.equal(result.ok, false);
    assert.match(result.error, /failureOutcome macro mode requires macroUuid/);
  });

  it('saves catalyst edits through the gathering environment validation boundary', async () => {
    const services = createServices({
      systems: [
        makeSystem({
          id: 'system-a',
          features: { gathering: true },
          components: [
            { id: 'catalyst-a', name: 'Knife', img: 'knife.png', difficulty: 1 },
            { id: 'catalyst-b', name: 'Basket', img: 'basket.png', difficulty: 2 }
          ]
        })
      ],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskCatalyst('task-a', 0, {
      componentId: 'catalyst-b',
      degradesOnUse: true,
      destroyWhenExhausted: true,
      maxUses: 2
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].catalysts, [
      {
        componentId: 'catalyst-b',
        degradesOnUse: true,
        destroyWhenExhausted: true,
        maxUses: 2
      }
    ]);
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('saves result group edits through the gathering environment validation boundary', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTaskResultGroup('task-a', 'group-a', { name: 'Uncommon' });
    store.updateEnvironmentTaskResult('task-a', 'group-a', 'result-a', {
      componentId: 'component-b',
      quantity: 3
    });

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks[0].resultGroups, [
      {
        id: 'group-a',
        name: 'Uncommon',
        results: [
          {
            id: 'result-a',
            componentId: 'component-b',
            quantity: 3,
            propertyMacroUuid: null
          }
        ]
      }
    ]);
    assert.equal(get(store.viewState).environmentDraftDirty, false);
  });

  it('new environment placeholder result group has a draft id and can be edited before save', async () => {
    const persistedEnvironment = makeEnvironment({ id: 'environment-a', name: 'Forest' });
    const services = createServices({
      systems: [
        makeSystem({
          id: 'system-a',
          features: { gathering: true },
          components: [
            { id: 'component-a', name: 'Herb', img: 'herb.png', difficulty: 1 }
          ]
        })
      ],
      environments: [persistedEnvironment]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const draft = await store.createEnvironmentDraft();
    const [placeholderTask] = draft.tasks;
    const [placeholderGroup] = placeholderTask.resultGroups;

    assert.ok(placeholderTask.id);
    assert.ok(placeholderGroup.id);
    assert.equal(placeholderGroup.name, 'Results');

    const renamed = store.updateEnvironmentTaskResultGroup(placeholderTask.id, placeholderGroup.id, {
      name: 'Common Finds'
    });
    const addedResult = store.addEnvironmentTaskResult(placeholderTask.id, placeholderGroup.id);

    assert.equal(renamed, true);
    assert.equal(addedResult.componentId, 'component-a');
    assert.equal(addedResult.quantity, 1);

    const editedTask = get(store.viewState).environmentDraft.tasks[0];
    assert.equal(editedTask.resultGroups[0].id, placeholderGroup.id);
    assert.equal(editedTask.resultGroups[0].name, 'Common Finds');
    assert.deepEqual(editedTask.resultGroups[0].results, [
      {
        id: addedResult.id,
        componentId: 'component-a',
        quantity: 1,
        propertyMacroUuid: null
      }
    ]);
    assert.equal(editedTask.enabled, false);
    assert.equal(editedTask.resultSelection.provider, 'macroOutcome');
    assert.equal(editedTask.resultSelection.macroUuid, '');
    assert.deepEqual(persistedEnvironment.tasks[0].resultGroups, [
      {
        id: 'group-a',
        name: 'Common',
        results: [{ id: 'result-a', componentId: 'component-a', quantity: 1 }]
      }
    ]);
    assert.equal(services._environmentCalls.create.length, 0);
  });

  it('cancel restores persisted task data after draft task edits', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.updateEnvironmentTask('task-a', { name: 'Changed Forage' });
    store.addEnvironmentTask();
    store.deleteEnvironmentTask('task-a');

    await store.cancelEnvironmentDraft();

    assert.equal(get(store.viewState).environmentDraftDirty, false);
    assert.deepEqual(
      get(store.viewState).environmentDraft.tasks,
      services._environments[0].tasks
    );
    assert.equal(get(store.viewState).selectedEnvironmentTaskId, 'task-a');
  });

  it('cleans runs for persisted tasks removed from the draft when saving', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({
          id: 'environment-a',
          tasks: [
            makeEnvironment().tasks[0],
            {
              ...makeEnvironment().tasks[0],
              id: 'task-b',
              name: 'Chop Wood',
              resultGroups: [{ id: 'group-b', name: 'Wood', results: [{ id: 'result-b', componentId: 'component-b', quantity: 2 }] }]
            }
          ]
        })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.deleteEnvironmentTask('task-b');
    assert.equal(get(store.viewState).environmentDraftDirty, true);
    assert.deepEqual(services._environmentCalls.cleanupTaskRuns, []);

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.cleanupTaskRuns, [
      { environmentId: 'environment-a', taskId: 'task-b' }
    ]);
    assert.deepEqual(services._environments[0].tasks.map(task => task.id), ['task-a']);
    assert.deepEqual(services._environmentCalls.update.at(-1).environment.tasks.map(task => task.id), ['task-a']);
  });

  it('deleting an unsaved task remains draft-only and does not call task cleanup on save', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [makeEnvironment({ id: 'environment-a', name: 'Forest' })]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    const added = store.addEnvironmentTask();
    store.deleteEnvironmentTask(added.id);
    assert.deepEqual(get(store.viewState).environmentDraft.tasks.map(task => task.id), ['task-a']);
    assert.deepEqual(services._environmentCalls.cleanupTaskRuns, []);

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, true);
    assert.deepEqual(services._environmentCalls.cleanupTaskRuns, []);
    assert.deepEqual(services._environments[0].tasks.map(task => task.id), ['task-a']);
  });

  it('keeps task delete and reorder draft-only until save validation runs', async () => {
    const services = createServices({
      systems: [makeSystem({ id: 'system-a', features: { gathering: true } })],
      environments: [
        makeEnvironment({
          id: 'environment-a',
          selectionMode: 'blind',
          tasks: [makeEnvironment().tasks[0]]
        })
      ]
    });
    const store = createAdminStore(services);

    await store.selectSystem('system-a');
    store.deleteEnvironmentTask('task-a');
    store.reorderEnvironmentTasks([]);

    assert.equal(get(store.viewState).environmentDraft.tasks.length, 0);
    assert.equal(services._environmentCalls.update.length, 0);
    assert.equal(services._environments[0].tasks.length, 1);

    const result = await store.saveEnvironmentDraft();

    assert.equal(result.ok, false);
    assert.match(result.error, /blind selection requires exactly one task/);
    assert.equal(services._environmentCalls.update.length, 1);
    assert.equal(services._environments[0].tasks.length, 1);
  });
});

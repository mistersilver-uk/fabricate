/**
 * The recording `services` double and shared harness the four admin-store section corpora drive
 * (issue 1708). Every seam call is logged with its full argument list, so a row asserts what the
 * store asked the world for as well as what it published.
 */
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';

/** Structural clone, matching the store's own plain-object clone. */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** A crafting system fixture with gathering on, so the environments tab is reachable. */
export function makeCorpusSystem(overrides = {}) {
  return {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'simple',
    visibilityMode: 'item',
    features: { gathering: true },
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    components: [],
    tools: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
    ...overrides,
  };
}

/** Append-only seam journal; `drain` returns the entries recorded since the last drain. */
function createJournal() {
  const entries = [];
  return {
    entries,
    record(seam, args) {
      entries.push({ seam, args: clone(args) ?? args });
    },
    drain() {
      const drained = [...entries];
      entries.length = 0;
      return drained;
    },
  };
}

/** The gathering-environment store double: one array, cloned in and out like the real store. */
function createEnvironmentStoreDouble(environments, journal, failures) {
  let idSeq = 0;
  const rows = environments.map((environment) => clone(environment));
  const failOnce = (seam) => {
    const error = failures[seam]?.shift();
    if (error) throw error;
  };
  return {
    rows,
    list: () => rows.map((row) => clone(row)),
    listBySystem: async (systemId) => {
      journal.record('environments.listBySystem', [systemId]);
      return rows.filter((row) => row.craftingSystemId === systemId).map((row) => clone(row));
    },
    create: async (payload) => {
      journal.record('environments.create', [payload]);
      failOnce('environments.create');
      const created = { ...clone(payload), id: payload.id || `env-new-${(idSeq += 1)}` };
      rows.push(created);
      return clone(created);
    },
    update: async (id, payload) => {
      journal.record('environments.update', [id, payload]);
      failOnce('environments.update');
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return null;
      rows[index] = { ...clone(payload), id };
      return clone(rows[index]);
    },
    delete: async (id) => {
      journal.record('environments.delete', [id]);
      failOnce('environments.delete');
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
    duplicate: async (id) => {
      journal.record('environments.duplicate', [id]);
      failOnce('environments.duplicate');
      const source = rows.find((row) => row.id === id);
      if (!source) return null;
      const copy = { ...clone(source), id: `${id}-copy`, name: `${source.name} Copy` };
      rows.push(copy);
      return clone(copy);
    },
    reorder: async (systemId, orderedIds) => {
      journal.record('environments.reorder', [systemId, orderedIds]);
      failOnce('environments.reorder');
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      for (const row of rows) if (!orderedIds.includes(row.id)) ordered.push(row);
      rows.splice(0, rows.length, ...ordered);
      return rows.filter((row) => row.craftingSystemId === systemId).map((row) => clone(row));
    },
  };
}

/** The world currency-config store double: one persisted record plus a full `save` journal. */
function createCurrencyStoreDouble(initialConfig, journal) {
  let config = clone(initialConfig) || null;
  return {
    get: () => clone(config),
    save: async (next) => {
      journal.record('currency.save', [next]);
      config = clone(next);
      return clone(config);
    },
    persisted: () => clone(config),
  };
}

/** The crafting-system manager double: system reads plus a journalled tool write path. */
function createSystemManagerDouble(systems, journal, options) {
  return {
    getSystems: () => systems,
    getSystem: (id) => systems.find((system) => system.id === id) || null,
    getItems: (id) => systems.find((system) => system.id === id)?.components || [],
    createSystem: async (partial = {}) => {
      journal.record('systemManager.createSystem', [partial]);
      const created = { ...systems[0], ...partial, id: `sys-new-${systems.length}`, tools: [] };
      systems.push(created);
      return created;
    },
    deleteSystem: async (id) => {
      journal.record('systemManager.deleteSystem', [id]);
      const index = systems.findIndex((system) => system.id === id);
      if (index !== -1) systems.splice(index, 1);
      return true;
    },
    updateSystem: async (id, updates = {}) => {
      journal.record('systemManager.updateSystem', [id, updates]);
      const system = systems.find((entry) => entry.id === id);
      if (!system) return null;
      Object.assign(system, clone(updates));
      return system;
    },
    upsertTool: async (systemId, record, extra = {}) => {
      journal.record('systemManager.upsertTool', [systemId, record, extra]);
      if (options.refuseToolWrites) throw new Error('tool write refused');
      const system = systems.find((entry) => entry.id === systemId);
      if (!system) return null;
      system.tools = Array.isArray(system.tools) ? system.tools : [];
      const index = system.tools.findIndex((tool) => String(tool.id) === String(record.id));
      const item = clone(record);
      if (index === -1) system.tools.push(item);
      else system.tools[index] = item;
      return { item: clone(item) };
    },
    deleteTool: async (systemId, toolId) => {
      journal.record('systemManager.deleteTool', [systemId, toolId]);
      const system = systems.find((entry) => entry.id === systemId);
      if (!system) return { deleted: false };
      const before = (system.tools || []).length;
      system.tools = (system.tools || []).filter((tool) => String(tool.id) !== String(toolId));
      return { deleted: system.tools.length !== before };
    },
  };
}

/**
 * The recording `services` object. `answers` queues dialog replies by seam name; an empty queue
 * falls back to `true` for a confirm and `'discard'` for the three-way choice.
 */
export function createRecordingServices({
  systems = [makeCorpusSystem()],
  environments = [],
  currencyConfig = null,
  knowledgeSnapshots = {},
  knowledgeResults = {},
  answers = {},
  failures = {},
  foundrySystemId = 'dnd5e',
  settings = { lastManagedCraftingSystem: 'sys1' },
  refuseToolWrites = false,
} = {}) {
  const journal = createJournal();
  const environmentStore = createEnvironmentStoreDouble(environments, journal, failures);
  const currencyStore = createCurrencyStoreDouble(currencyConfig, journal);
  const systemManager = createSystemManagerDouble(systems, journal, { refuseToolWrites });
  const nextAnswer = (seam, fallback) => {
    const queue = answers[seam];
    return Array.isArray(queue) && queue.length > 0 ? queue.shift() : fallback;
  };
  let idSeq = 0;
  const services = {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => {
      journal.record('setSetting', [key, value]);
      settings[key] = value;
    },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => ({ getRecipes: () => [], getRecipe: () => null }),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    getAccessCharacterActors: () => [],
    getWorldActors: () => [],
    getActorOptions: () => [],
    getFoundrySystemId: () => foundrySystemId,
    getGatheringEnvironmentStore: () => environmentStore,
    getCurrencyConfigStore: () => currencyStore,
    randomID: () => `id-${(idSeq += 1)}`,
    localize: (key) => key,
    notify: {
      info: (message) => journal.record('notify.info', [String(message)]),
      warn: (message) => journal.record('notify.warn', [String(message)]),
      error: (message) => journal.record('notify.error', [String(message)]),
    },
    confirmDialog: async (config) => {
      journal.record('confirmDialog', [{ title: config?.title, content: config?.content }]);
      return nextAnswer('confirmDialog', true);
    },
    choiceDialog: async (config) => {
      journal.record('choiceDialog', [{ title: config?.title }]);
      return nextAnswer('choiceDialog', 'discard');
    },
    getKnowledgeSnapshot: async (systemId) => {
      journal.record('getKnowledgeSnapshot', [systemId]);
      return clone(knowledgeSnapshots[systemId]) ?? null;
    },
    expendRecipeItemUse: async (payload) => {
      journal.record('expendRecipeItemUse', [payload]);
      return clone(knowledgeResults.expendRecipeItemUse);
    },
    deleteOwnedRecipeItem: async (payload) => {
      journal.record('deleteOwnedRecipeItem', [payload]);
      return clone(knowledgeResults.deleteOwnedRecipeItem);
    },
    eraseLearnedRecipe: async (payload) => {
      journal.record('eraseLearnedRecipe', [payload]);
      return clone(knowledgeResults.eraseLearnedRecipe);
    },
    resetActorKnowledge: async (payload) => {
      journal.record('resetActorKnowledge', [payload]);
      return clone(knowledgeResults.resetActorKnowledge);
    },
  };
  return { services, journal, environmentStore, currencyStore, systemManager, settings };
}

/**
 * Build a store over the recording services and settle its first refresh. `publishes` counts
 * `viewState` notifications, which is how a row proves an out-of-band patch happened at all.
 */
export async function createSectionHarness(options = {}) {
  const context = createRecordingServices(options);
  const store = createAdminStore(context.services);
  await store.refresh();
  let publishes = 0;
  const unsubscribe = store.viewState.subscribe(() => {
    publishes += 1;
  });
  publishes = 0;
  context.journal.drain();
  return {
    ...context,
    store,
    state: () => clone(get(store.viewState)),
    drain: () => context.journal.drain(),
    publishes: () => publishes,
    resetPublishes: () => {
      publishes = 0;
    },
    dispose: () => {
      unsubscribe();
      store.destroy();
    },
  };
}

/**
 * The whole published object must equal the previous one with exactly `patch` applied. For every
 * key a row exercises, that catches one a section's out-of-band publish drops while `refresh()`
 * still sets it, and a collision between two sections' keys in the composed publish. A key no row
 * moves is invisible to it, which is why the corpora drive each publish key explicitly.
 */
export function assertStatePatch(before, after, patch, message) {
  assert.deepStrictEqual(after, { ...before, ...patch }, message);
}

/**
 * Run `operation` twice and assert the repeat cannot move the world on. An op that re-writes takes
 * the default `identical` shape; one that short-circuits once satisfied takes `silent`, which also
 * asserts the first run did write, so the row cannot pass by the op writing nothing at all.
 */
export async function assertConvergent(
  harness,
  operation,
  writeSeams,
  { repeat = 'identical' } = {}
) {
  const drainWrites = () => harness.drain().filter((entry) => writeSeams.includes(entry.seam));
  await operation();
  const first = drainWrites();
  await operation();
  const second = drainWrites();
  if (repeat === 'silent') {
    assert.notDeepStrictEqual(first, [], 'the first run wrote, so the repeat is not vacuous');
    assert.deepStrictEqual(second, [], 'a repeat of a satisfied operation writes nothing further');
    return;
  }
  assert.deepStrictEqual(second, first, 'a repeat of the same operation converges on one result');
}

/**
 * The world fixture every COMPONENT Storage Layout Conversion suite drives (issue 1212).
 *
 * The sibling of `recipeStorageWorld.js`, and extracted rather than copied for the same two
 * reasons: five suites need the same world, and a divergent copy silently stops modelling the
 * facts the conversion turns on.
 *
 * ## The three facts, and why a looser fixture would hide a corpus-destroying defect
 *
 * 1. **A setting VALUE and a setting DOCUMENT are different things.** `game.settings.set`
 *    creates the document when none exists, and once a document is deleted `game.settings.get`
 *    serves the REGISTERED DEFAULT. A fixture that modelled only values could not express "the
 *    layout key had no document before step 1", which is the precondition the forward
 *    compensation is required to restore.
 * 2. **The CONTAINER always exists.** Unlike the recipe conversion's legacy document, the
 *    `craftingSystems` record survives every conversion, because it still carries essences,
 *    tools, item tags, categories, checks, realms and prerequisites. So document PRESENCE
 *    carries no information about components, and the fixture has to be able to express the
 *    three states that DO: the nested key absent, present-and-empty, and present-and-non-empty.
 * 3. **A downgraded build writes `components: []` back.** That is the corpus-loss path this
 *    change creates, and {@link downgradedContainer} builds exactly the bytes an older
 *    Fabricate's ordinary save produces, rather than a hand-written approximation of them.
 */

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
} from '../../src/config/settings.js';
import { componentEnvelope, createComponentRecordStore } from '../../src/systems/componentRecords.js';
import { worldSettingDocumentAccess } from '../../src/systems/definitionStorageConversion.js';

import { installFoundryEnv } from './foundryEnv.js';
import { SettingHost } from './settingDocumentHost.js';

export const LAYOUT_KEY = SETTING_KEYS.COMPONENT_STORAGE_LAYOUT;
export const TARGET_KEY = SETTING_KEYS.COMPONENT_STORAGE_TARGET;
export const { SINGLE_ARRAY, PER_RECORD, UNSETTLED } = DEFINITION_STORAGE_LAYOUTS;

/** The fully-qualified prefix every component record key carries. */
export const COMPONENT_KEY_PREFIX = `${FABRICATE_SETTINGS_NAMESPACE}.component.`;

/**
 * The registered `default` of every key this fixture models, read back once a key's document
 * is gone. Taken from `src/config/settings.js`; a value invented here would decide the outcome
 * of every deletion assertion in the suites below.
 */
const REGISTERED_DEFAULTS = Object.freeze({
  [LAYOUT_KEY]: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  [TARGET_KEY]: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
  [SETTING_KEYS.CRAFTING_SYSTEMS]: [],
  [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
  [SETTING_KEYS.RECIPES]: [],
});

/** @param {string} key @returns {string} the fully-qualified setting key. */
export function qualified(key) {
  return `${FABRICATE_SETTINGS_NAMESPACE}.${key}`;
}

/**
 * Install the Foundry environment this fixture needs, and return the world builder bound to
 * it. Call at module scope, ABOVE any dynamic import of a manager.
 *
 * @returns {{env: object, world: Function}}
 */
export function installComponentStorageWorld() {
  const env = installFoundryEnv();
  return { env, world: (options = {}) => buildWorld(env, options) };
}

/**
 * A world whose component storage pair, container record and component documents are all
 * addressable.
 *
 * @param {object} env the object `installFoundryEnv` returned.
 * @param {object} [options]
 * @param {string} [options.layout]
 * @param {string} [options.target]
 * @param {object[]} [options.systems] The RAW stored crafting systems.
 * @param {Array<{systemId: string, component: object}>} [options.records] Components written
 *   as per-record documents.
 * @param {boolean} [options.layoutDocument] Whether a `fabricate.componentStorageLayout`
 *   document EXISTS. Defaults to "only when the layout is not its registered default", which
 *   is the real shape: a never-converted world has no such document.
 * @returns {Promise<object>} the fixture handles.
 */
async function buildWorld(
  env,
  {
    layout = SINGLE_ARRAY,
    target = SINGLE_ARRAY,
    systems = [],
    records = [],
    layoutDocument = layout !== REGISTERED_DEFAULTS[LAYOUT_KEY],
  } = {}
) {
  env.settings.clear();
  env.writes.length = 0;
  const host = new SettingHost();
  host.onDocumentDeleted = (qualifiedKey) => {
    const key = qualifiedKey.slice(`${FABRICATE_SETTINGS_NAMESPACE}.`.length);
    if (Object.hasOwn(REGISTERED_DEFAULTS, key)) {
      env.settings.set(key, structuredClone(REGISTERED_DEFAULTS[key]));
    }
  };

  for (const [key, value] of Object.entries(REGISTERED_DEFAULTS)) {
    env.settings.set(key, structuredClone(value));
  }
  env.settings.set(LAYOUT_KEY, layout);
  env.settings.set(TARGET_KEY, target);
  env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, structuredClone(systems));
  // Seeded so the Valid Id Basis assertions turn on the STORAGE clauses rather than on an
  // unrelated version refusal.
  env.settings.set(SETTING_KEYS.MIGRATION_VERSION, '1.0.0');

  if (layoutDocument) host.seed({ key: qualified(LAYOUT_KEY), value: layout });
  host.seed({ key: qualified(TARGET_KEY), value: target });
  host.seed({ key: qualified(SETTING_KEYS.CRAFTING_SYSTEMS), value: systems });

  if (records.length > 0) {
    await createComponentRecordStore({
      documentClass: () => host.documentClass,
      collection: () => host.collection,
    }).putAll(records);
    host.calls.length = 0;
  }

  const seams = {
    getSetting: (key) => env.settings.get(key),
    setSetting: async (key, value) => {
      env.settings.set(key, value);
      env.writes.push({ key, value });
      const existing = host.collection.getSetting(qualified(key));
      if (existing) existing.applyChanges({ value });
      else host.seed({ key: qualified(key), value });
      return value;
    },
    documentClass: () => host.documentClass,
    collection: () => host.collection,
  };
  // The PRODUCTION seam over the fixture's collection, never a re-implementation: a fixture
  // that built its own presence/delete pair would test the fixture.
  const settingDocuments = worldSettingDocumentAccess({ collection: () => host.collection });

  const componentDocuments = () =>
    [...host.collection.documents.values()].filter((document) =>
      document.key.startsWith(COMPONENT_KEY_PREFIX)
    );

  return {
    env,
    host,
    seams: { ...seams, settingDocuments },
    settingDocuments,
    documentExists: (key) => settingDocuments.exists(qualified(key)),
    /** Every component RECORD key in the world, sorted. */
    recordKeys: () =>
      componentDocuments()
        .map((document) => document.key.slice(COMPONENT_KEY_PREFIX.length))
        .sort((left, right) => (left < right ? -1 : 1)),
    /** Every component's STORED value, in record-key order. */
    storedComponents: () =>
      componentDocuments()
        .sort((left, right) => (left.key < right.key ? -1 : 1))
        .map((document) => document.value),
    /** The stored container corpus, raw. */
    storedSystems: () => env.settings.get(SETTING_KEYS.CRAFTING_SYSTEMS),
    settingWrites: () => env.writes.map((write) => write.key),
  };
}

/**
 * A crafting system in the shape `_normalizeSystem` emits, with `components` NOT last.
 *
 * The key order matters and is the point: the normalizer's literal puts `components:` before
 * `tools:`, so a migration round trip that deleted the key and re-appended it would pass every
 * fixture whose `components` sits last and fail on every real record.
 *
 * @param {string} id
 * @param {object[]} components
 * @param {object} [overrides]
 * @returns {object}
 */
export function system(id, components, overrides = {}) {
  return {
    id,
    name: `System ${id}`,
    enabled: true,
    essenceDefinitions: [],
    components,
    tools: [],
    itemTags: ['forged'],
    ...overrides,
  };
}

/**
 * A component carrying one field the current model does NOT emit.
 *
 * `fallbackItemIds` appears nowhere in the component normalizer, so it is dropped by any
 * conversion that routes records through `_normalizeComponent` instead of carrying stored
 * bytes. That is the mutation the byte-equivalence item exists to redden, and a fixture with
 * only model-known fields could not see it.
 *
 * @param {string} id
 * @param {object} [overrides]
 * @returns {object}
 */
export function component(id, overrides = {}) {
  return {
    id,
    name: `Component ${id}`,
    imageUrl: `icons/${id}.webp`,
    essences: {},
    fallbackItemIds: [`legacy-${id}`],
    salvage: { enabled: false },
    ...overrides,
  };
}

/**
 * The container bytes an OLDER Fabricate's ordinary save produces on a converted world.
 *
 * The corpus-loss path this change creates, built rather than described: the old build's
 * `_normalizeSystem` finds no `components`, no `managedItems` and no `items`, emits
 * `components: []`, and the next save writes that empty array onto every system.
 *
 * @param {object[]} systems the systems as this build stored them (no `components` key).
 * @returns {object[]}
 */
export function downgradedContainer(systems) {
  return systems.map((record) => ({ ...record, components: [] }));
}

/**
 * Component envelopes for one system, as the per-record store keys them.
 *
 * @param {string} systemId
 * @param {object[]} components
 * @returns {Array<{systemId: string, component: object}>}
 */
export function envelopesFor(systemId, components) {
  return components.map((entry) => componentEnvelope(systemId, entry));
}

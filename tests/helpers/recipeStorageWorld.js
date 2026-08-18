/**
 * The world fixture every recipe Storage Layout Conversion suite drives (issue 1211).
 *
 * Extracted rather than copied. Three suites need the same world — the target control, the
 * forward conversion, and the reclaim/refusal composition — and three copies of a settings
 * map plus a `Setting` document host would be counted by the SonarCloud new-code duplication
 * gate, which counts `tests/**` exactly like `src/`. The stronger reason is drift: this
 * fixture's whole value is that it models the two facts the conversion turns on, and a
 * divergent copy silently stops modelling them.
 *
 * ## The two facts, and why a looser fixture would hide a corpus-destroying defect
 *
 * 1. **A setting VALUE and a setting DOCUMENT are different things.** `game.settings.set`
 *    creates the document when none exists, and once a document is deleted `game.settings.get`
 *    serves the REGISTERED DEFAULT — `WorldSettings#getSetting` finds nothing and core
 *    synthesises `new Setting({value: setting.default})`, silently. A fixture that modelled
 *    only values could not express "the layout key had no document before step 1", which is
 *    the precondition the forward compensation is required to restore; every
 *    key-presence assertion would then be satisfied by a value comparison, which is the
 *    defect the requirement exists to prevent.
 * 2. **A deleted key reads back as its default, not as absent.** So a world whose legacy
 *    recipe document was deleted reads `[]`, indistinguishable from a genuinely empty world.
 *    That IS the cliff the whole reverse conversion exists for, and a fixture that returned
 *    `undefined` there would make the surviving-document detector testable only by accident.
 *
 * `installFoundryEnv`'s settings map is therefore SEEDED with every registered default this
 * fixture models, `setSetting` mirrors its write into a real document, and a document delete
 * resets the value to its registered default.
 */

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
} from '../../src/config/settings.js';
import { worldSettingDocumentAccess } from '../../src/systems/definitionStorageConversion.js';
import {
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from '../../src/systems/PerRecordCraftingDefinitionRepository.js';

import { installFoundryEnv } from './foundryEnv.js';
import { SettingHost } from './settingDocumentHost.js';

export const LAYOUT_KEY = SETTING_KEYS.RECIPE_STORAGE_LAYOUT;
export const TARGET_KEY = SETTING_KEYS.RECIPE_STORAGE_TARGET;
export const { SINGLE_ARRAY, PER_RECORD, UNSETTLED } = DEFINITION_STORAGE_LAYOUTS;

/** `foundry.utils.randomID()`'s alphabet and length. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The registered `default` of every key this fixture models, read back once a key's document
 * is gone. Taken from `src/config/settings.js`; a value invented here would decide the
 * outcome of every deletion assertion in the suites below.
 */
const REGISTERED_DEFAULTS = Object.freeze({
  [LAYOUT_KEY]: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  [TARGET_KEY]: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
  [SETTING_KEYS.RECIPES]: [],
});

/**
 * A faithful stand-in for `foundry.utils.randomID()`, installed over `installFoundryEnv`'s
 * sequential `rid-N` stub.
 *
 * The shared stub is looser in the two ways the canonical form cares about: `rid-N` is not
 * `CORE_ID_PATTERN`-shaped, so the provenance rule would never classify it as hydrate-minted,
 * and it is sequential per process, so two hydrates of the SAME bytes differ in a way no real
 * world does. Drawing from the platform CSPRNG rather than `Math.random()` is SonarCloud
 * S2245.
 *
 * @returns {string}
 */
function mintCoreId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

/**
 * Install the Foundry environment this fixture needs, and return the world builder bound to
 * it. Call at module scope, ABOVE any dynamic import of a manager.
 *
 * @returns {{env: object, world: Function}}
 */
export function installRecipeStorageWorld() {
  const env = installFoundryEnv();
  globalThis.foundry.utils.randomID = mintCoreId;
  return { env, world: (options = {}) => buildWorld(env, options) };
}

/**
 * A world whose two storage settings and legacy recipe array are addressable as VALUES and as
 * DOCUMENTS, plus a `Setting` document host for the per-record side.
 *
 * @param {object} env the object `installFoundryEnv` returned.
 * @param {object} [options]
 * @param {string} [options.layout]
 * @param {string} [options.target]
 * @param {object[]} [options.legacy] Records in the legacy whole-array key.
 * @param {object[]} [options.records] Records written as per-record documents.
 * @param {boolean} [options.layoutDocument] Whether a `fabricate.recipeStorageLayout` document
 *   EXISTS. Defaults to "only when the layout is not its registered default", which is the
 *   real shape: a never-converted world has no such document and is served the default.
 * @param {boolean} [options.legacyDocument] Whether a `fabricate.recipes` document exists.
 *   Defaults to true, which is every world that has ever saved a recipe — including one whose
 *   corpus is empty.
 * @returns {Promise<object>} the fixture handles.
 */
async function buildWorld(
  env,
  {
    layout = SINGLE_ARRAY,
    target = SINGLE_ARRAY,
    legacy = [],
    records = [],
    layoutDocument = layout !== REGISTERED_DEFAULTS[LAYOUT_KEY],
    legacyDocument = true,
  } = {}
) {
  env.settings.clear();
  env.writes.length = 0;
  const host = new SettingHost();
  // A deleted document leaves the REGISTERED DEFAULT readable, never `undefined`. This is the
  // whole reason the fixture models documents at all — see this module's header, fact 2.
  host.onDocumentDeleted = (qualifiedKey) => {
    const key = qualifiedKey.slice(`${FABRICATE_SETTINGS_NAMESPACE}.`.length);
    if (Object.hasOwn(REGISTERED_DEFAULTS, key)) {
      env.settings.set(key, structuredClone(REGISTERED_DEFAULTS[key]));
    }
  };

  env.settings.set(LAYOUT_KEY, layout);
  env.settings.set(TARGET_KEY, target);
  env.settings.set(SETTING_KEYS.RECIPES, legacy);
  // Seeded so the Valid Id Basis assertions turn on the STORAGE clauses. Left unset it reads
  // `null`, clause 3 refuses, and every basis assertion is true for an unrelated reason.
  env.settings.set(SETTING_KEYS.MIGRATION_VERSION, '1.0.0');

  if (layoutDocument) host.seed({ key: qualified(LAYOUT_KEY), value: layout });
  host.seed({ key: qualified(TARGET_KEY), value: target });
  if (legacyDocument) host.seed({ key: qualified(SETTING_KEYS.RECIPES), value: legacy });

  if (records.length > 0) {
    await new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      documentClass: () => host.documentClass,
      collection: () => host.collection,
    }).putAll(records);
    host.calls.length = 0;
  }

  const seams = {
    getSetting: (key) => env.settings.get(key),
    // Mirrors `ClientSettings#set`: the value moves AND a document exists for it afterwards,
    // created on the first write. Without the document half, step 1 on a never-converted
    // world would leave nothing for the compensation to delete and item 8(a) would pass
    // against an implementation that deletes nothing.
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

  return {
    env,
    host,
    seams: { ...seams, settingDocuments },
    settingDocuments,
    documentExists: (key) => settingDocuments.exists(qualified(key)),
    recordIds: () =>
      [...host.collection.documents.values()]
        .filter((document) => document.key.startsWith(`${FABRICATE_SETTINGS_NAMESPACE}.recipe.`))
        .map((document) => document.key.split('.').pop())
        .sort((left, right) => (left < right ? -1 : 1)),
    storedRecords: () =>
      [...host.collection.documents.values()]
        .filter((document) => document.key.startsWith(`${FABRICATE_SETTINGS_NAMESPACE}.recipe.`))
        .map((document) => document.value),
    settingWrites: () => env.writes.map((write) => write.key),
  };
}

/** @param {string} key @returns {string} the fully-qualified setting key. */
export function qualified(key) {
  return `${FABRICATE_SETTINGS_NAMESPACE}.${key}`;
}

/**
 * A post-ingredient-groups recipe, carrying one field the domain model does NOT emit.
 *
 * `catalysts` appears nowhere in `src/models/Recipe.js`, so it is dropped by any conversion
 * that routes records through `Recipe.fromJSON`/`toJSON` instead of carrying stored bytes.
 * That is the mutation item 1 exists to redden, and a fixture with only model-known fields
 * could not see it.
 *
 * @param {string} id @param {object} [overrides]
 */
export function recipe(id, overrides = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: 'sys-1',
    catalysts: [{ componentId: `cat-${id}`, quantity: 1 }],
    ingredientSets: [],
    resultGroups: [
      { id: `rg-${id}`, results: [{ id: `res-${id}`, itemUuid: 'Item.x', quantity: 1 }] },
    ],
    ...overrides,
  };
}

/**
 * A record in the PRE-ingredient-groups shape: a flat `ingredients` array and an ingredient
 * set with no id of its own.
 *
 * It is what makes a fixture MINT at all. `IngredientSet.js`'s permanent inbound shim rewrites
 * the flat array on hydrate, minting an id for the group and one for the set from
 * `foundry.utils.randomID()`. With only post-groups records nothing mints, the degraded
 * `provenance: 'shape'` mode is accidentally deterministic, and every non-vacuity control goes
 * green while demonstrating nothing.
 *
 * It is also the only defence against an ID-ONLY REWRITE: a conversion that carried every
 * field verbatim but minted those two ids is invisible to a post-groups-only corpus, whose
 * `ingredientSets` are empty and have nothing to mint for.
 *
 * @param {string} id
 */
export function legacyShapedRecipe(id) {
  return {
    id,
    name: `Legacy ${id}`,
    craftingSystemId: 'sys-1',
    ingredientSets: [{ ingredients: [{ componentId: 'componentIron001', quantity: 2 }] }],
    resultGroups: [
      {
        id: `rg-${id}`,
        results: [{ id: `res-${id}`, componentId: 'componentSteel01', quantity: 1 }],
      },
    ],
  };
}

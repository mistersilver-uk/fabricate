/**
 * The writeback legs of a startup migration pass. Array position is the writeback order, which
 * `destructive-changes-and-migrations/spec.md` § Startup Migration Flow owns clause by clause and
 * `tests/migration-runner-structure.test.js` pins position by position.
 */

import { SETTING_KEYS } from '../config/settings.js';

/** Fresh empty defaults: a shared literal would let one pass mutate the next pass's default. */
const emptyRecord = () => ({});
const emptyList = () => [];

/** A leg backed by one world-scoped setting, reproducing that setting's empty default. */
function settingLeg(key, settingKey, empty) {
  return {
    key,
    read: ({ getSetting }) => getSetting(settingKey) ?? empty(),
    write: (value, { setSetting }) => setSetting(settingKey, value),
  };
}

/**
 * Every leg a pass snapshots, compares and writes, in writeback order. The two corpus legs go
 * through the accessors the runner is constructed with, which own their own empty default; the
 * version bump is not a leg, and is written unconditionally after the last of these.
 */
export const WRITEBACK_LEGS = Object.freeze([
  settingLeg('worldScopeRekeyMap', SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, emptyRecord),
  settingLeg('worldEssenceMergeMap', SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, emptyRecord),
  {
    key: 'recipes',
    read: ({ recipeCorpus }) => recipeCorpus.loadAll(),
    write: (value, { recipeCorpus }) => recipeCorpus.createOrUpdateAll(value),
  },
  settingLeg('currencyConfig', SETTING_KEYS.CURRENCY_CONFIG, emptyRecord),
  settingLeg('travelConfig', SETTING_KEYS.TRAVEL_CONFIG, emptyRecord),
  settingLeg('characterLibraries', SETTING_KEYS.CHARACTER_LIBRARIES, emptyRecord),
  settingLeg('componentScope', SETTING_KEYS.COMPONENT_SCOPE, emptyRecord),
  settingLeg('essenceScope', SETTING_KEYS.ESSENCE_SCOPE, emptyRecord),
  settingLeg('toolScope', SETTING_KEYS.TOOL_SCOPE, emptyRecord),
  {
    key: 'systems',
    read: ({ craftingSystemCorpus }) => craftingSystemCorpus.loadAll(),
    write: (value, { craftingSystemCorpus }) => craftingSystemCorpus.createOrUpdateAll(value),
  },
  settingLeg('gatheringConfig', SETTING_KEYS.GATHERING_CONFIG, emptyRecord),
  settingLeg('environments', SETTING_KEYS.GATHERING_ENVIRONMENTS, emptyList),
  settingLeg('gatheringParties', SETTING_KEYS.GATHERING_PARTIES, emptyList),
]);

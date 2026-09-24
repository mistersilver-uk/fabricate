import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
} from './componentScope.js';
import { normalizeEssenceMemberships, normalizeEssenceWorldDefaults } from './essenceScope.js';
import { createScopedDefinitionStore } from './scopedDefinitionStore.js';
import {
  normalizeToolMemberships,
  normalizeToolWorldDefaults,
  normalizeWorldToolBreakage,
} from './toolScope.js';

/**
 * The composition root binding the three world-scope entity stores to the real `game.settings`
 * accessors and each type's normalizers (issue 1359), keeping `src/config/settings.js` out of the
 * scope modules' closure. Three instances, loaded at boot and published on `game.fabricate`, never
 * a module-level singleton, which would alias across managers and across worlds in one test run.
 */

/** The world component scope store. */
export function createComponentScopeStore({
  getSetting = defaultGetSetting,
  setSetting = defaultSetSetting,
} = {}) {
  return createScopedDefinitionStore({
    settingKey: SETTING_KEYS.COMPONENT_SCOPE,
    getSetting,
    setSetting,
    normalizeDefaults: normalizeComponentWorldDefaults,
    normalizeMemberships: normalizeComponentMemberships,
  });
}

/** The world essence scope store. */
export function createEssenceScopeStore({
  getSetting = defaultGetSetting,
  setSetting = defaultSetSetting,
} = {}) {
  return createScopedDefinitionStore({
    settingKey: SETTING_KEYS.ESSENCE_SCOPE,
    getSetting,
    setSetting,
    normalizeDefaults: normalizeEssenceWorldDefaults,
    normalizeMemberships: normalizeEssenceMemberships,
  });
}

/**
 * The world tool scope store, which alone carries the world tool-breakage authority: the shipped
 * `CraftingSystem.toolBreakage.authority` lifted to world scope, with the per-system override
 * left on the crafting system (`## CraftingSystem` requirement 21).
 */
export function createToolScopeStore({
  getSetting = defaultGetSetting,
  setSetting = defaultSetSetting,
} = {}) {
  return createScopedDefinitionStore({
    settingKey: SETTING_KEYS.TOOL_SCOPE,
    getSetting,
    setSetting,
    normalizeDefaults: normalizeToolWorldDefaults,
    normalizeMemberships: normalizeToolMemberships,
    normalizeExtras: (source) => normalizeWorldToolBreakage(source.toolBreakage),
  });
}

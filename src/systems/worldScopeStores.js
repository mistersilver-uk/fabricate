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
 * The COMPOSITION ROOT for the three world-scope entity stores (issue 1359, part of epic 1357).
 *
 * `scopedDefinitionStore.js` is the shell and takes its settings seams by injection; this module is
 * the one place that binds them to the real `game.settings` accessors and to each entity type's
 * normalizers. Keeping the two apart is what lets the three per-entity scope modules import the
 * READ union from the shell without dragging `src/config/settings.js` — and through it
 * `src/ui/theme.js` — into their closure.
 *
 * THREE INSTANCES, NEVER A REGISTRY. Each is constructed and `load()`ed by `src/main.js` and
 * published on `game.fabricate`; nothing here holds a module-level singleton, because a hidden
 * singleton would alias across manager instances and across two worlds in one test process — the
 * same hazard `definitionIndex.js` refuses when it declines to key an index on a system id.
 */

/**
 * Build the world COMPONENT scope store.
 *
 * @param {object} [seams]
 * @param {(key: string) => unknown} [seams.getSetting]
 * @param {(key: string, value: unknown) => Promise<unknown>} [seams.setSetting]
 * @returns {object}
 */
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

/**
 * Build the world ESSENCE scope store.
 *
 * @param {object} [seams]
 * @param {(key: string) => unknown} [seams.getSetting]
 * @param {(key: string, value: unknown) => Promise<unknown>} [seams.setSetting]
 * @returns {object}
 */
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
 * Build the world TOOL scope store.
 *
 * It carries one field the other two do not: the WORLD tool-breakage authority. That is a
 * MODIFICATION of the shipped `CraftingSystem.toolBreakage.authority` (`## CraftingSystem`
 * requirement 21) lifted to world scope, not a fourth breakage control, and it has no per-system
 * half here — the override stays on the crafting system, because authoring one field at two scopes
 * is what `## Scoped Entity Definitions` prohibits.
 *
 * IT IS INERT UNTIL THE NORMALIZER FLIP. `_normalizeToolBreakageAuthority` substitutes
 * `toolSpecific` for anything missing or unrecognised on EVERY normalize, so every persisted system
 * already carries a concrete value and the world half can never be reached. Making it reachable
 * requires the normalizer to become absent-preserving, which is the migration issue's flip.
 *
 * @param {object} [seams]
 * @param {(key: string) => unknown} [seams.getSetting]
 * @param {(key: string, value: unknown) => Promise<unknown>} [seams.setSetting]
 * @returns {object}
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

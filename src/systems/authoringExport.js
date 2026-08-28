/**
 * Pure assembly of the gathering authoring bundle for a crafting-system export.
 *
 * This module is Foundry-free (no `game`, `ui`, `fromUuid`) so the exporter
 * stays unit-testable in isolation. It owns:
 *   - filtering the global gathering-environment array down to one system,
 *   - slicing the per-system `gatheringConfig.systems[systemId]` block plus the
 *     shared top-level vocabularies,
 *   - stripping runtime/world state that must never travel with an authoring
 *     export (per-environment `nodeRuntime`, and the current-condition
 *     selection at both the top level and per-system, while preserving the
 *     authoring `enabled`/`values` overrides).
 */

import { normalizeCharacterPrerequisiteList } from './characterPrerequisites.js';
import { normalizeWorldCurrencyConfig } from './currencyProfile.js';
import { normalizeTravelConfig } from './gatheringRealms.js';
import { normalizeModifierLibrary } from './modifierLibrary.js';
import { subKeyEntries } from './scopedDefinitionStore.js';

/**
 * Integer schema-version marker written onto every export envelope. Distinct
 * from `fabricateVersion` (the module semver, retained for provenance). Legacy
 * exports carry no `schemaVersion` and are treated as schema `1` by the
 * migration layer.
 */
export const FABRICATE_EXPORT_SCHEMA_VERSION = 6;

/**
 * Default current-condition selection used when resetting runtime condition
 * state on export. Mirrors `DEFAULT_GATHERING_CONDITIONS` in adminStore.js.
 */
export const DEFAULT_CURRENT_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });

/**
 * Assemble the gathering-authoring slice of an export for one system.
 *
 * @param {object} system - Normalized system object (must carry `id`)
 * @param {object[]} gatheringEnvironments - The FULL global environment array
 *   (all systems); filtered here to `env.craftingSystemId === system.id`
 * @param {object} gatheringConfig - The FULL `gatheringConfig` setting object
 *   (`{ vocabularies, conditions, systems: { [id]: slice } }`)
 * @returns {{ gatheringEnvironments: object[], gatheringConfig: { system: object, shared: object } }}
 */
export function assembleGatheringAuthoringBundle(system, gatheringEnvironments, gatheringConfig) {
  const systemId = system?.id;

  const environments = (Array.isArray(gatheringEnvironments) ? gatheringEnvironments : [])
    .filter((env) => env && env.craftingSystemId === systemId)
    .map((env) => stripEnvironmentRuntime(structuredClone(env)));

  const config = gatheringConfig && typeof gatheringConfig === 'object' ? gatheringConfig : {};
  const rawSlice =
    config.systems && typeof config.systems === 'object' ? config.systems[systemId] : undefined;
  const systemSlice =
    rawSlice && typeof rawSlice === 'object'
      ? resetSystemConditionsCurrent(structuredClone(rawSlice))
      : {};

  const shared = {
    vocabularies:
      config.vocabularies && typeof config.vocabularies === 'object'
        ? structuredClone(config.vocabularies)
        : {},
    // Runtime current-condition state (top-level) is reset to defaults so an
    // import never forces "it is currently raining at dusk" onto the target world.
    conditions: { ...DEFAULT_CURRENT_CONDITIONS },
  };

  return {
    gatheringEnvironments: environments,
    gatheringConfig: { system: systemSlice, shared },
  };
}

/**
 * Assemble the currency-authoring slice of an export.
 *
 * Since issue 1278 the currency configuration is WORLD scope, not per crafting system, so unlike
 * the gathering bundle there is no per-system slice to filter — the whole world config travels.
 * It travels at all because recipe currency options and salvage requirements reference units by
 * `id`: an export whose recipes carry currency costs is unusable in the destination world unless
 * the units those ids name arrive with it.
 *
 * Nothing here is runtime state, so nothing is stripped; the config is authoring data end to end.
 *
 * @param {object} currencyConfig - The FULL `currencyConfig` world setting
 * @returns {{ spendStrategy: string, providerId: string, macros: object, units: object[] }}
 */
export function assembleCurrencyAuthoringBundle(currencyConfig) {
  return normalizeWorldCurrencyConfig(
    currencyConfig && typeof currencyConfig === 'object' ? currencyConfig : {}
  );
}

/**
 * Assemble the travel-authoring slice of an export.
 *
 * Since issue 1282 the realm library, its reveal mode and its modifier visibility are WORLD
 * scope, not per crafting system, so — exactly like the currency bundle above — there is no
 * per-system slice to filter and the whole world config travels. It travels at all because
 * environments reference realms by `id` through `includedRealmIds` / `excludedRealmIds`: an
 * export whose environments are realm-gated is unusable in the destination world unless the
 * realms those ids name arrive with it. Each realm carries its own `sceneMappings[]`, so the
 * Foundry Scene Region links ride along nested inside the realm they belong to rather than as
 * a separate slice.
 *
 * Nothing here is runtime state, so nothing is stripped. A scene/scene-region UUID that names
 * a document the destination world does not have is preserved verbatim and REPORTED by
 * `importReferenceResolver`, never nulled out — the same treatment every other external
 * reference gets.
 *
 * @param {object} travelConfig - The FULL `travelConfig` world setting
 * @returns {{ revealMode: string, modifierVisibility: string, realms: object[] }}
 */
export function assembleTravelAuthoringBundle(travelConfig) {
  return normalizeTravelConfig(
    travelConfig && typeof travelConfig === 'object' ? travelConfig : {}
  );
}

/**
 * The WORLD character libraries slice of an export (issue 1308): the character-prerequisite
 * library and the modifier library.
 *
 * TWO LIBRARIES, NORMALIZED SEPARATELY, and that separation carries all the way through import.
 * They share a setting key for persistence economy only; they share no invariant, so a merge that
 * treated the slice as one aggregate would let a destination holding only prerequisites discard
 * every incoming modifier.
 *
 * Nothing here is runtime state, so nothing is stripped.
 *
 * @param {object} characterLibraries - The FULL `characterLibraries` world setting
 * @returns {{ characterPrerequisites: object[], modifiers: object[] }}
 */
export function assembleCharacterLibrariesAuthoringBundle(characterLibraries) {
  const source =
    characterLibraries &&
    typeof characterLibraries === 'object' &&
    !Array.isArray(characterLibraries)
      ? characterLibraries
      : {};
  return {
    characterPrerequisites: normalizeCharacterPrerequisiteList(source.characterPrerequisites),
    modifiers: normalizeModifierLibrary(source.modifiers),
  };
}

/**
 * The WORLD-SCOPE ENTITY slice of an export for ONE crafting system (issue 1364, epic 1357):
 * the World Component / World Essence / World Tool roster, the donor-elected world defaults and
 * the per-`(entity, system)` membership records.
 *
 * ONE PARAMETERIZED ASSEMBLER, CALLED THREE TIMES. The three scopes carry the same three sub-keys
 * and the same filter, so three near-identical functions would be three copies of one rule — and
 * `tests/**` and `src/**` alike count against the SonarCloud new-code duplication gate.
 *
 * ## It filters by MEMBERSHIP, unlike the three world-scope slices before it
 *
 * Currency, travel and the character libraries travel WHOLE because there is no owning system to
 * filter them by. That reasoning does not transfer: here there IS an owning relation and it is
 * membership. `membership` is filtered to `systemId === systemId`, and `entities` and `defaults`
 * are filtered to exactly the entity ids that filtered set names. Shipping the unfiltered roster
 * would import a foreign world's ENTIRE component roster — every entity of every system that
 * world runs — which is the opposite of what a per-system export means.
 *
 * The consequence is stated rather than discovered later: a reference in the exported system
 * naming a world entity the system has NO membership record for does not travel. That is
 * `## Scoped Entity Definitions` requirement 3's REFUSAL rather than a prune, and it lands in the
 * destination as an ordinary broken internal reference — reported verbatim, never repaired.
 *
 * ## It carries the ARRAY projection, not the persisted map
 *
 * Requirement 13 makes both shapes normative and DISCARDS the map key on read, re-deriving it from
 * the record on write. Arrays win here for three reasons: every other envelope slice is a list,
 * every normalizer takes an array, and the persisted membership key EMBEDS THE SOURCE SYSTEM ID,
 * which neither import mode's destination shares — so every carried key would be stale on arrival.
 *
 * ## The WORLD TOOL-BREAKAGE AUTHORITY IS NOT ASSEMBLED
 *
 * `toolScope` carries a fourth sub-key the other two do not. It does NOT travel: the `1.30.0`
 * migration writes no world authority at all, so a "seed only into an unconfigured destination"
 * rule on the currency/travel precedent would fire on essentially every import and hand a
 * destination world an authority no GM there authored. Emitting the three sub-keys only is
 * necessary but NOT sufficient, because a HAND-EDITED payload never reaches this assembler — the
 * payload upcast drops it and reports it.
 *
 * @param {unknown} scopeValue The scope store's persisted projection (`store.get()`), or its
 *   published corpus; both sub-key shapes are read.
 * @param {string} systemId The exported system's id.
 * @returns {{entities: object[], defaults: object[], membership: object[]}}
 */
export function assembleScopedEntityBundle(scopeValue, systemId) {
  const source = scopeValue && typeof scopeValue === 'object' ? scopeValue : {};
  const owner = typeof systemId === 'string' ? systemId.trim() : '';

  const membership = subKeyEntries(source.membership).filter(
    (record) => isRecord(record) && record.systemId === owner && trimmed(record.entityId)
  );
  const memberIds = new Set(membership.map((record) => record.entityId.trim()));

  const entities = subKeyEntries(source.entities).filter(
    (record) => isRecord(record) && memberIds.has(trimmed(record.id))
  );
  const defaults = subKeyEntries(source.defaults).filter(
    (record) => isRecord(record) && memberIds.has(trimmed(record.id))
  );

  return {
    entities: structuredClone(entities),
    defaults: structuredClone(defaults),
    membership: structuredClone(membership),
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Clear the per-environment runtime node map (depleted counts / respawn timers)
 * so a copy starts with full pools.
 * @param {object} environment
 * @returns {object} the same environment reference, mutated
 */
export function stripEnvironmentRuntime(environment) {
  if (environment && typeof environment === 'object') {
    environment.nodeRuntime = {};
  }
  return environment;
}

/**
 * Reset the runtime `current` selection on each per-system condition kind while
 * preserving the authoring `enabled`/`values` overrides. The per-system shape is
 * `{ <kind>: { enabled, current, values } }`.
 * @param {object} systemSlice
 * @returns {object} the same slice reference, mutated
 */
export function resetSystemConditionsCurrent(systemSlice) {
  const conditions = systemSlice?.conditions;
  if (conditions && typeof conditions === 'object') {
    for (const [kind, setting] of Object.entries(conditions)) {
      if (setting && typeof setting === 'object' && 'current' in setting) {
        setting.current = DEFAULT_CURRENT_CONDITIONS[kind] ?? setting.current;
      }
    }
  }
  return systemSlice;
}

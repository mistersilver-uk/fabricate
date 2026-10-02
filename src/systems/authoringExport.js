/**
 * Pure, Foundry-free assembly of a crafting-system export's authoring slices
 * (`openspec/specs/import-export/spec.md`). Runtime state never travels: per-environment
 * `nodeRuntime` and the current-condition selection, top-level and per-system, are reset while the
 * authoring `enabled`/`values` overrides are kept.
 */

import { trimString as trimmed } from '../utils/scalars.js';

import { normalizeCharacterPrerequisiteList } from './characterPrerequisites.js';
import { normalizeWorldCurrencyConfig } from './currencyProfile.js';
import { normalizeTravelConfig } from './gatheringRealms.js';
import { normalizeModifierLibrary } from './modifierLibrary.js';
import { subKeyEntries } from './scopedDefinitionStore.js';

/**
 * The envelope's integer schema, distinct from the `fabricateVersion` semver; an export carrying
 * none is schema `1`.
 */
export const FABRICATE_EXPORT_SCHEMA_VERSION = 6;

/** Mirrors `DEFAULT_GATHERING_CONDITIONS` in `gatheringComposition.js`. */
export const DEFAULT_CURRENT_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });

/** One system's environments and `gatheringConfig` slice, plus the shared vocabularies. */
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
 * The whole world currency config (world scope since issue 1278), since recipe currency options
 * and salvage requirements name its units by `id`.
 */
export function assembleCurrencyAuthoringBundle(currencyConfig) {
  return normalizeWorldCurrencyConfig(
    currencyConfig && typeof currencyConfig === 'object' ? currencyConfig : {}
  );
}

/**
 * The whole world travel config (world scope since issue 1282), since environments name realms by
 * `id`; each realm carries its own `sceneMappings`. A scene or region UUID the destination lacks is
 * preserved and reported by `importReferenceResolver`, never nulled.
 */
export function assembleTravelAuthoringBundle(travelConfig) {
  return normalizeTravelConfig(
    travelConfig && typeof travelConfig === 'object' ? travelConfig : {}
  );
}

/**
 * The world character libraries (issue 1308), each normalized separately: they share a setting key
 * for persistence only, so treating them as one aggregate could discard incoming modifiers.
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
 * One system's world-scope entity slice (issue 1364), for any of the three scopes: `membership`
 * filtered to `systemId`, and `entities` and `defaults` to the ids it names, so a member-less
 * reference does not travel (a refusal, not a prune). It is the array projection, since the
 * persisted membership key embeds the source system id, and `toolScope`'s world tool-breakage
 * authority is never assembled; `import-export/spec.md` owns all three rules. `scopeValue` may be
 * the store's persisted projection or its published corpus.
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

/** Empty `nodeRuntime` in place, so a copy starts with full pools. */
export function stripEnvironmentRuntime(environment) {
  if (environment && typeof environment === 'object') {
    environment.nodeRuntime = {};
  }
  return environment;
}

/** Reset each per-system condition kind's `current` in place, keeping `enabled` and `values`. */
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

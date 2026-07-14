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

/**
 * Integer schema-version marker written onto every export envelope. Distinct
 * from `fabricateVersion` (the module semver, retained for provenance). Legacy
 * exports carry no `schemaVersion` and are treated as schema `1` by the
 * migration layer.
 */
export const FABRICATE_EXPORT_SCHEMA_VERSION = 2;

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

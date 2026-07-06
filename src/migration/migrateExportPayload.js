/**
 * Pure, idempotent upcast of a Fabricate export payload to the current schema.
 *
 * A legacy export carries no `schemaVersion` and only `{ fabricateVersion,
 * system, recipes }`; it is treated as schema 1 and upcast to schema 2 by adding
 * the gathering-authoring fields and the envelope markers. The migrator is
 * idempotent: `migrate(migrate(v1))` deep-equals `migrate(v1)`, and `migrate(v2)`
 * is a no-op.
 *
 * Foundry-free (no globals) so it runs before validation/import and in tests.
 */

import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../systems/authoringExport.js';

/**
 * @param {*} payload - Parsed export JSON of any prior schema
 * @returns {object} Upcast payload at the current schema version
 */
export function migrateExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  // Already current — no-op (return a clone so callers never alias the input).
  if (payload.schemaVersion === FABRICATE_EXPORT_SCHEMA_VERSION) {
    return structuredClone(payload);
  }

  const migrated = structuredClone(payload);

  // Schema 1 → 2: introduce the explicit version marker + runtime boundary flag,
  // and default the gathering-authoring fields when absent. A hand-authored
  // `system.gatheringConfig` is read defensively as the source of truth.
  migrated.schemaVersion = FABRICATE_EXPORT_SCHEMA_VERSION;
  if (typeof migrated.runtimeStateIncluded !== 'boolean') {
    migrated.runtimeStateIncluded = false;
  }

  if (!Array.isArray(migrated.gatheringEnvironments)) {
    migrated.gatheringEnvironments = [];
  }

  if (!migrated.gatheringConfig || typeof migrated.gatheringConfig !== 'object') {
    // Real schema-1 exports never carried gathering config. Defensively lift a
    // hand-authored `system.gatheringConfig` ONLY when it already matches the
    // export envelope shape (`{ system, shared }`) that the importer expects; a
    // world-setting-shaped object (`{ systems, vocabularies, ... }`) would persist
    // as an empty slice, so it is ignored in favour of the empty default.
    const legacy = migrated.system?.gatheringConfig;
    const looksLikeExportShape =
      legacy && typeof legacy === 'object' && ('system' in legacy || 'shared' in legacy);
    migrated.gatheringConfig = looksLikeExportShape ? legacy : { system: {}, shared: {} };
  }

  return migrated;
}

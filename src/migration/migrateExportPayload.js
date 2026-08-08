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

import { applyRecipeModifierAuthority } from './migrateRecipeModifierAuthority.js';
import { deriveToolSourceFromComponents } from './migrateToolsToFirstClass.js';

/**
 * Upcast every legacy componentId-only Tool in an export payload's system to a first-class
 * tool carrying derived source refs + snapshot (issue 561, D10), mirroring the world-side
 * `migrateToolsToFirstClass`. The `ready`-body tool-flag stamp is version-gated per world so
 * it does not re-fire for a system imported AFTER it ran; an imported tool therefore matches
 * by raw source references (resolver tier 3) until a manual "Repair item data" stamps it,
 * exactly like imported components. Idempotent — a tool already carrying refs is untouched.
 * @private
 */
function upcastLegacyTools(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || !Array.isArray(system.tools)) return;
  const components = Array.isArray(system.components) ? system.components : [];
  for (const tool of system.tools) deriveToolSourceFromComponents(tool, components);
}

/**
 * Retire the `byRecipe` modifier policy and derive `craftingCheck.recipeModifierAuthority`
 * for an imported bundle (issue 1055), mirroring the world-side 1.20.0 migration. An
 * export bundle is already the shape that derivation wants — one system plus its recipes —
 * so the shared per-system transform is applied directly, with no grouping.
 *
 * THIS MUST STAY BRANCH-INDEPENDENT, exactly like `upcastLegacyTools` above and for the
 * same reason: `migrateExportPayload` returns early once `payload.schemaVersion` is already
 * current, and every bundle written by the shipping build carries the current schema. A
 * derivation reachable only from the legacy branch would therefore never run on a real
 * bundle. The authority is a NEW field on an OLD schema version, so its absence is
 * orthogonal to the envelope version and both branches must derive it.
 *
 * Idempotent: the policy mapping is a fixpoint and the stamp fires only on an absent/`null`
 * authority, so an authored value in the bundle always survives the import.
 * @private
 */
function deriveRecipeModifierAuthority(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyRecipeModifierAuthority(system, Array.isArray(migrated.recipes) ? migrated.recipes : []);
}

/**
 * @param {*} payload - Parsed export JSON of any prior schema
 * @returns {object} Upcast payload at the current schema version
 */
export function migrateExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  // Already current — no-op for the schema envelope, but still run every field-level
  // upcast, because a schema-2 export can predate #561's first-class tool fields or
  // #1055's modifier authority. Clone so callers never alias the input.
  if (payload.schemaVersion === FABRICATE_EXPORT_SCHEMA_VERSION) {
    const current = structuredClone(payload);
    upcastLegacyTools(current);
    deriveRecipeModifierAuthority(current);
    return current;
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

  upcastLegacyTools(migrated);
  deriveRecipeModifierAuthority(migrated);

  return migrated;
}

/** The registration half of `CraftingSystemManager.save` (issue 2554): before the systems are
 * written, every Essence and Tool row of every system the write serialises gains its world entity
 * and membership. Scope writes run `essenceScope` then `toolScope`, each read, planned and saved
 * with no `await` between; a failure removes only what this call registered. Contract:
 * `data-models/spec.md` § Scoped Entity Definitions requirement 17. */
import { getSetting, SETTING_KEYS } from '../../config/settings.js';
import { normalizeEssenceMergeMap } from '../../migration/mergeEquivalentWorldEssences.js';
import { compareSemver } from '../../migration/MigrationRunner.js';

import { warnScopedIdentityConflicts } from './scopedIdentityConflictWarning.js';
import { resolveStoreSeam } from './scopeStoreSeams.js';
import {
  applyRegistrationDecisions,
  planWorldScopeIdentityRegistration,
  REGISTERED_ENTITY_TYPES,
  withdrawRegistrationDecisions,
} from './worldScopeIdentityRegistration.js';

/** The first `migrationVersion` whose worlds register at the chokepoint; below it the `1.36.0`
 * migration owns reconciliation. */
export const REGISTRATION_VERSION = '1.36.0';

/** A scope write refused before any system write; recoverable, and the caller's own notice is
 * the only one posted. */
export class WorldScopeRegistrationError extends Error {
  constructor(entityType, cause) {
    super(`Fabricate | could not register world identities in the ${entityType} scope`, {
      cause,
    });
    this.name = 'WorldScopeRegistrationError';
    this.code = 'worldWrite';
    this.entityType = entityType;
  }
}

function readSetting(key) {
  try {
    return getSetting(key);
  } catch {
    return null;
  }
}

/** This cluster's `io` bag, read from the manager at call time. */
export function worldScopeIdentityCollaborators(manager) {
  const seams = { essences: manager._essenceScopeStore, tools: manager._toolScopeStore };
  return {
    owner: manager,
    systems: () => manager.systems,
    systemName: (systemId) => manager.systems.get(systemId)?.name ?? null,
    scopeStore: (entityType) => resolveStoreSeam(seams[entityType]),
    migrationVersion: () => readSetting(SETTING_KEYS.MIGRATION_VERSION),
    retiredEssenceIds: () =>
      Object.keys(
        normalizeEssenceMergeMap(readSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP)).retired
      ),
    parseUuid: () => globalThis.foundry?.utils?.parseUuid,
  };
}

/** The records the repository write persists: the corpus with the change applied. */
function serialisedSystems(systems, change) {
  const corpus = new Map(systems);
  if (change?.put?.id != null) corpus.set(change.put.id, change.put);
  for (const record of change?.batch ?? []) if (record?.id != null) corpus.set(record.id, record);
  if (change?.delete != null) corpus.delete(change.delete);
  return [...corpus.values()];
}

/** Remove what `written` registered, newest first, re-reading each store now; answers the errors. */
async function withdraw(written) {
  const errors = [];
  for (const { store, decisions } of written.toReversed()) {
    try {
      const payload = store.get();
      if (withdrawRegistrationDecisions(payload, decisions)) await store.save(payload);
    } catch (error) {
      errors.push(error);
    }
    store.load();
  }
  return errors;
}

/** The failures thrown after this module wrote a scope, so `saveOrRestore` announces the restore. */
const AFTER_SCOPE_WRITE = new WeakSet();

async function withdrawAndThrow(written, failure, message) {
  const errors = await withdraw(written);
  const thrown = errors.length > 0 ? new AggregateError([failure, ...errors], message) : failure;
  if (written.length > 0 && Object(thrown) === thrown) AFTER_SCOPE_WRITE.add(thrown);
  throw thrown;
}

function isActive(io) {
  const version = io.migrationVersion();
  return typeof version === 'string' && compareSemver(version, REGISTRATION_VERSION) >= 0;
}

/** Plan and write one scope: `{ written, conflicts }`, `written` null when nothing was written. */
async function registerScope(io, entityType, systems, seeds) {
  const store = io.scopeStore(entityType);
  if (!store) return { written: null, conflicts: [] };
  const payload = store.get();
  const planned = planWorldScopeIdentityRegistration({
    entityType,
    payload,
    systems,
    retiredIds: entityType === 'essences' ? io.retiredEssenceIds() : null,
    parseUuid: io.parseUuid(),
    seeds,
  });
  const decisions = planned.filter((decided) => decided.entity || decided.membership);
  const conflicts = planned
    .filter((decided) => decided.decision === 'conflicting')
    .map((decided) => ({ ...decided, entityType }));
  if (decisions.length === 0) return { written: null, conflicts };
  try {
    await store.save(applyRegistrationDecisions(payload, decisions));
  } catch (error) {
    store.load();
    throw new WorldScopeRegistrationError(entityType, error);
  }
  return { written: { store, decisions }, conflicts };
}

const NOTHING_REGISTERED = Object.freeze({
  async settle(write) {
    await write;
    return NOTHING_REGISTERED;
  },
  async compensate() {},
});

/**
 * Register the identities `change` would persist, then answer a receipt whose `settle(write)`
 * awaits the system write: on its rejection it withdraws this call's registrations and rethrows,
 * on success it warns about conflicts and resolves to the receipt, whose `compensate()` a later
 * rollback calls. A failed withdrawal throws `AggregateError`.
 */
export async function registerWorldScopeIdentities(io, change) {
  if (!isActive(io)) return NOTHING_REGISTERED;
  const systems = serialisedSystems(io.systems(), change);
  const seeds = change?.scopeMembershipSeeds
    ? { ...change.scopeMembershipSeeds, systemId: change.put?.id }
    : null;
  const written = [];
  const conflicts = [];
  for (const entityType of REGISTERED_ENTITY_TYPES) {
    let result;
    try {
      result = await registerScope(io, entityType, systems, seeds);
    } catch (error) {
      await withdrawAndThrow(
        written,
        error,
        'World identity registration failed and its rollback was incomplete'
      );
    }
    if (result.written) written.push(result.written);
    conflicts.push(...result.conflicts);
  }
  const receipt = {
    async settle(write) {
      try {
        await write;
      } catch (error) {
        await withdrawAndThrow(
          written,
          error,
          'System save failed and its world identity rollback was incomplete'
        );
      }
      warnScopedIdentityConflicts(io.owner, conflicts, io.systemName);
      return receipt;
    },
    async compensate() {
      const pending = [...written];
      written.length = 0;
      const errors = await withdraw(pending);
      if (errors.length > 0) {
        throw new AggregateError(errors, 'World identity compensation was incomplete');
      }
    },
  };
  return receipt;
}

/** Persist `change.put` through `manager.save` with `options.scopeMembershipSeeds`, restoring
 * `previous` (by default the record held before staging, else forgetting it) when that save
 * throws, and announcing the restore when a scope was written; a later failure keeps the
 * persisted record in memory. */
export async function saveOrRestore(manager, previous, change, { scopeMembershipSeeds } = {}) {
  const { id } = change.put;
  const restored = previous ?? manager.systems.get(id) ?? null;
  manager.systems.set(id, change.put);
  try {
    return await manager.save(scopeMembershipSeeds ? { ...change, scopeMembershipSeeds } : change);
  } catch (error) {
    if (restored) manager.systems.set(id, restored);
    else manager.systems.delete(id);
    if (AFTER_SCOPE_WRITE.has(error)) manager._notifySystemsChanged();
    throw error;
  }
}

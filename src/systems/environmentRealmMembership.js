import { cloneJson, normalizeIdList } from '../utils/scalars.js';

/** The two id lists that make up an environment's realm membership. */
const REALM_MEMBERSHIP_KEYS = Object.freeze(['includedRealmIds', 'excludedRealmIds']);

/**
 * Drop, and answer, every realm id `baseline` already carried that the world library lacks; an id
 * `baseline` did not carry is left for validation to reject.
 */
function pruneRealmMembership(environment, baseline, knownRealmIds) {
  const dropped = new Set();
  for (const key of REALM_MEMBERSHIP_KEYS) {
    const inherited = new Set(normalizeIdList(baseline[key]));
    const kept = [];
    for (const realmId of environment[key]) {
      if (knownRealmIds.has(realmId) || !inherited.has(realmId)) kept.push(realmId);
      else dropped.add(realmId);
    }
    environment[key] = kept;
  }
  return [...dropped];
}

/** The record a write is measured against: the persisted one, unless the caller names another. */
function resolveBaseline(environmentId, baselineById, findPersisted) {
  if (baselineById?.has(environmentId)) return baselineById.get(environmentId);
  return findPersisted(environmentId);
}

/** The rejection of a realm id that names no realm in the world library. */
function unknownRealmErrors(environment, label, knownRealmIds) {
  const errors = [];
  for (const realmId of environment.includedRealmIds) {
    if (!knownRealmIds.has(realmId)) {
      errors.push(`Environment "${label}" includedRealmIds references unknown realm "${realmId}"`);
    }
  }
  for (const realmId of environment.excludedRealmIds) {
    if (!knownRealmIds.has(realmId)) {
      errors.push(`Environment "${label}" excludedRealmIds references unknown realm "${realmId}"`);
    }
  }
  return errors;
}

/**
 * Realm membership for the gathering environment store: the world library read, the prune of ids
 * whose realm has left it (issue 1848), and the rejection of ids a write introduces. The library
 * is resolved PER CALL and never memoised, so the prune and the rejection agree because they ask
 * the same store at the same moment — a realm delete strips membership before the realm goes.
 *
 * @param {{ travelStore?: object|null, warn?: Function, findPersisted?: Function }} collaborators
 */
export function createRealmMembership({
  travelStore = null,
  warn = console.warn,
  findPersisted = () => null,
} = {}) {
  /**
   * The world realm ids, or `null` when unreadable, in which case neither the rejection nor the
   * prune keyed to this answer acts.
   */
  function knownRealmIds() {
    const worldRealms = travelStore?.list?.();
    if (!Array.isArray(worldRealms)) return null;
    return new Set(worldRealms.map((realm) => realm?.id).filter(Boolean));
  }

  /**
   * Prune, in place, records that already carried a departed realm id, so one deleted realm cannot
   * make every environment unsaveable; answers the same records.
   */
  function prune(environments, { baselineById = null, notify = true } = {}) {
    const known = knownRealmIds();
    if (!known) return environments;

    const reports = [];
    for (const environment of environments) {
      const baseline = resolveBaseline(environment.id, baselineById, findPersisted);
      const dropped = baseline ? pruneRealmMembership(environment, baseline, known) : [];
      if (dropped.length > 0) {
        reports.push(`"${environment.name || environment.id}" (${dropped.join(', ')})`);
      }
    }

    // One report per write, not one per environment: environments persist as a single world
    // list, so the save that repairs one of them repairs every one of them.
    if (notify && reports.length > 0) {
      warn(
        `Fabricate | Dropped gathering environment references to realms no longer in the world library: ${reports.join('; ')}`
      );
    }
    return environments;
  }

  return {
    knownRealmIds,
    prune,
    /** A copy of one normalized record with its inherited stale realm ids pruned, silently. */
    prunedCopy(environment, { baselineById = null } = {}) {
      const [pruned] = prune([cloneJson(environment)], { baselineById, notify: false });
      return pruned;
    },
    /** One error per realm id the world library does not have. */
    unknownRealmErrors(environment, label) {
      const known = knownRealmIds();
      return known ? unknownRealmErrors(environment, label, known) : [];
    },
  };
}

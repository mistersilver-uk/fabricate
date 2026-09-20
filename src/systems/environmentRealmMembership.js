import { cloneJson, normalizeIdList } from '../utils/scalars.js';

/** The two id lists that make up an environment's realm membership. */
const REALM_MEMBERSHIP_KEYS = Object.freeze(['includedRealmIds', 'excludedRealmIds']);

/**
 * Drop from `environment` every realm id that `baseline` already carried and the world library
 * no longer has; an id `baseline` did not carry is left for validation to reject.
 *
 * @returns {string[]} the dropped ids
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
   * The world realm library as a lookup, or null when it cannot be read at all. Both the
   * rejection of an unknown realm id and the prune of a stale one are keyed to this same
   * answer, so a library that is missing neither rejects nor destroys anything.
   *
   * @returns {Set<string>|null}
   */
  function knownRealmIds() {
    const worldRealms = travelStore?.list?.();
    if (!Array.isArray(worldRealms)) return null;
    return new Set(worldRealms.map((realm) => realm?.id).filter(Boolean));
  }

  /**
   * Prune the records that ALREADY carried a departed realm id, so one deleted realm cannot make
   * every environment in the world unsaveable.
   *
   * @param {object[]} environments normalized records, pruned in place
   * @param {{ baselineById?: Map<string, object>|null, notify?: boolean }} [options]
   * @returns {object[]} the same records
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
    /** @returns {string[]} one error per realm id the world library does not have. */
    unknownRealmErrors(environment, label) {
      const known = knownRealmIds();
      return known ? unknownRealmErrors(environment, label, known) : [];
    },
  };
}

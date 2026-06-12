/**
 * Pure location-availability evaluation, disclosure-safe realm display models,
 * and player travel guidance. No Foundry globals. Shared by the gathering engine
 * (listing + start guard) and the public player-facing API so availability,
 * redaction, and guidance never drift between them.
 *
 * Disclosure policy: for a non-GM viewer, a SECRET undiscovered realm MUST NOT
 * expose its id or name anywhere (label, title, aria-label, data-*, filter
 * options). `buildRealmDisclosure` returns `id: null` and a placeholder label
 * key in that case. Always route player-facing realm labels through it.
 *
 * @typedef {{ available: boolean, gated: boolean, reasons: string[], matchedRealmIds: string[], excludedRealmIds: string[] }} LocationAvailability
 * @typedef {{ id: string|null, label?: string, labelKey?: string, discovered: boolean, secret: boolean, placeholder: boolean }} GatheringRealmDisclosure
 */

export const UNDISCOVERED_PLACEHOLDER_KEY = 'FABRICATE.Gathering.Realm.UndiscoveredPlaceholder';

function asIdList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(v => String(v ?? '').trim()).filter(Boolean)));
}

function asBiomeList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean)));
}

/**
 * Whether an environment declares any location availability rule after
 * normalization. Empty-after-normalization arrays count as ungated (identical to
 * absent fields) per the spec.
 *
 * @param {object} env
 * @returns {boolean}
 */
export function environmentHasLocationRules(env = {}) {
  return asIdList(env?.includedRealmIds ?? env?.includedRegionIds).length > 0
    || asIdList(env?.excludedRealmIds ?? env?.excludedRegionIds).length > 0
    || asBiomeList(env?.includedBiomeIds).length > 0
    || asBiomeList(env?.excludedBiomeIds).length > 0;
}

/**
 * Evaluate environment availability against the resolved current-realm context.
 *
 * @param {object} env Environment with availability rule fields.
 * @param {object} currentRealmContext
 * @param {boolean} currentRealmContext.resolved Whether a current realm resolved.
 * @param {Array<{ id: string, biomes?: string[] }>} [currentRealmContext.realms] Resolved current realms.
 * @returns {LocationAvailability}
 */
export function evaluateLocationAvailability(env = {}, currentRealmContext = {}) {
  const includedRealms = asIdList(env?.includedRealmIds ?? env?.includedRegionIds);
  const excludedRealms = asIdList(env?.excludedRealmIds ?? env?.excludedRegionIds);
  const includedBiomes = asBiomeList(env?.includedBiomeIds);
  const excludedBiomes = asBiomeList(env?.excludedBiomeIds);

  const gated = includedRealms.length > 0
    || excludedRealms.length > 0
    || includedBiomes.length > 0
    || excludedBiomes.length > 0;

  // Rule 6: ungated environments are never location-blocked.
  if (!gated) {
    return { available: true, gated: false, reasons: [], matchedRealmIds: [], excludedRealmIds: [] };
  }

  const hasInclusions = includedRealms.length > 0 || includedBiomes.length > 0;
  const resolved = currentRealmContext?.resolved === true;
  const realms = Array.isArray(currentRealmContext?.realms) ? currentRealmContext.realms : [];

  // Rule 7: no current realm resolved.
  if (!resolved || realms.length === 0) {
    if (hasInclusions) {
      return {
        available: false,
        gated: true,
        reasons: ['NO_CURRENT_REALM'],
        matchedRealmIds: [],
        excludedRealmIds: []
      };
    }
    // Exclusion-only or biome-exclusion-only with no current realm: available.
    return { available: true, gated: true, reasons: [], matchedRealmIds: [], excludedRealmIds: [] };
  }

  // Rules 1 & 2: exclusions win. A realm exclusion on ANY current realm, or a
  // biome exclusion matched by ANY current realm's biome, blocks the env.
  const excludedHits = [];
  for (const realm of realms) {
    const realmBiomes = asBiomeList(realm?.biomes);
    if (excludedRealms.includes(realm?.id)) {
      excludedHits.push(realm.id);
      continue;
    }
    if (realmBiomes.some(biome => excludedBiomes.includes(biome))) {
      excludedHits.push(realm?.id);
    }
  }
  if (excludedHits.length > 0) {
    return {
      available: false,
      gated: true,
      reasons: ['LOCATION_BLOCKED'],
      matchedRealmIds: [],
      excludedRealmIds: Array.from(new Set(excludedHits.filter(Boolean)))
    };
  }

  // Rule 5: exclusion-only (no inclusions) and not excluded above ⇒ available.
  if (!hasInclusions) {
    return { available: true, gated: true, reasons: [], matchedRealmIds: [], excludedRealmIds: [] };
  }

  // Rules 3 & 4: inclusion match when any current realm id is included OR any
  // current realm has an included biome.
  const matched = [];
  for (const realm of realms) {
    const realmBiomes = asBiomeList(realm?.biomes);
    if (includedRealms.includes(realm?.id) || realmBiomes.some(biome => includedBiomes.includes(biome))) {
      matched.push(realm.id);
    }
  }
  if (matched.length > 0) {
    return {
      available: true,
      gated: true,
      reasons: [],
      matchedRealmIds: Array.from(new Set(matched)),
      excludedRealmIds: []
    };
  }

  // Inclusion-gated, current realm resolved, but no current realm matches.
  return {
    available: false,
    gated: true,
    reasons: ['LOCATION_BLOCKED'],
    matchedRealmIds: [],
    excludedRealmIds: []
  };
}

/**
 * Build a disclosure-safe display model for one realm. For a non-GM viewer, a
 * secret undiscovered realm NEVER leaks its id or name: it resolves to
 * `{ id: null, labelKey: placeholder, placeholder: true }`.
 *
 * @param {object} realm Realm record (with at least id, name, secret).
 * @param {object} options
 * @param {boolean} options.isGM
 * @param {boolean} options.discovered Whether the selected actor discovered the realm.
 * @param {string} [options.revealMode] System reveal mode ('alwaysVisible' shows names).
 * @returns {GatheringRealmDisclosure}
 */
export function buildRealmDisclosure(realm = {}, { isGM = false, discovered = false, revealMode = 'manual' } = {}) {
  const id = realm?.id ? String(realm.id) : null;
  const secret = realm?.secret === true;
  const name = String(realm?.name ?? '');

  // GMs, non-secret realms, discovered realms, and alwaysVisible reveal mode
  // all disclose the real name/id.
  const disclosed = isGM === true || !secret || discovered === true || revealMode === 'alwaysVisible';
  if (disclosed) {
    return {
      id,
      label: name,
      discovered: discovered === true,
      secret,
      placeholder: false
    };
  }

  // Non-GM, secret, undiscovered, not alwaysVisible: redact completely.
  return {
    id: null,
    labelKey: UNDISCOVERED_PLACEHOLDER_KEY,
    discovered: false,
    secret: true,
    placeholder: true
  };
}

/**
 * Build the redaction-safe current-realm summary for a player-callable read.
 *
 * Mirrors the disclosure policy of `buildRealmDisclosure`: every realm is
 * routed through it so a non-GM viewer never receives a secret undiscovered
 * realm's id or name, and the raw `realmIds`/`staleRealmIds` arrays (which
 * are real ids) are returned EMPTY unless the viewer is a GM.
 *
 * @param {object} args
 * @param {object} args.context Resolved current-realm context
 *   ({ resolved, source, realms, realmIds, staleRealmIds }).
 * @param {boolean} [args.isGM]
 * @param {string} [args.revealMode] System reveal mode ('alwaysVisible' shows names).
 * @param {Set<string>|string[]} [args.discoveredRealmIds] Realm ids the actor discovered.
 * @returns {{ resolved: boolean, source: string, realms: GatheringRealmDisclosure[], realmIds: string[], staleRealmIds: string[] }}
 */
export function buildLocationSummaryForViewer({
  context = {},
  isGM = false,
  revealMode = 'manual',
  discoveredRealmIds = new Set()
} = {}) {
  const discovered = discoveredRealmIds instanceof Set
    ? discoveredRealmIds
    : new Set(Array.isArray(discoveredRealmIds) ? discoveredRealmIds : []);
  const realms = (Array.isArray(context?.realms) ? context.realms : [])
    .map(realm => buildRealmDisclosure(realm, {
      isGM,
      discovered: discovered.has(realm?.id),
      revealMode
    }));
  return {
    resolved: context?.resolved === true,
    source: context?.source || 'unresolved',
    realms,
    realmIds: isGM ? (Array.isArray(context?.realmIds) ? context.realmIds : []) : [],
    staleRealmIds: isGM ? (Array.isArray(context?.staleRealmIds) ? context.staleRealmIds : []) : []
  };
}

/**
 * Build redaction-safe travel guidance for a blocked environment.
 *
 * @param {object} args
 * @param {object} args.environment Environment with availability rules.
 * @param {Map<string, object>|object} args.realmsById Realm lookup by id.
 * @param {object} args.currentRealmContext Resolved current-realm context.
 * @param {LocationAvailability} args.availability Result of evaluateLocationAvailability.
 * @param {Set<string>|string[]} [args.discoveredRealmIds] Realm ids the actor discovered.
 * @param {boolean} [args.isGM]
 * @param {string} [args.revealMode]
 * @returns {{ state: 'noCurrentRealm'|'excluded'|'travel', knownDestinations: GatheringRealmDisclosure[], undiscoveredCount: number }}
 */
export function buildTravelGuidance({
  environment = {},
  realmsById = new Map(),
  currentRealmContext = {},
  availability = null,
  discoveredRealmIds = new Set(),
  isGM = false,
  revealMode = 'manual'
} = {}) {
  const result = availability || evaluateLocationAvailability(environment, currentRealmContext);
  const lookup = realmsById instanceof Map
    ? realmsById
    : new Map(Object.entries(realmsById || {}));
  const discovered = discoveredRealmIds instanceof Set
    ? discoveredRealmIds
    : new Set(Array.isArray(discoveredRealmIds) ? discoveredRealmIds : []);

  // No current realm resolved (and the env is inclusion-gated) ⇒ ask the GM to
  // set the party's current realm. Distinct from an explicit exclusion.
  if (result.reasons.includes('NO_CURRENT_REALM')) {
    return { state: 'noCurrentRealm', knownDestinations: [], undiscoveredCount: 0 };
  }

  const excluded = Array.isArray(result.excludedRealmIds) && result.excludedRealmIds.length > 0;
  const state = excluded ? 'excluded' : 'travel';

  // Destinations are the environment's included realm ids — the places the
  // player could travel to so the env becomes available.
  const destinationIds = asIdList(environment?.includedRealmIds ?? environment?.includedRegionIds);
  const knownDestinations = [];
  let undiscoveredCount = 0;
  for (const realmId of destinationIds) {
    const realm = lookup.get(realmId) || { id: realmId, name: '', secret: false };
    const isDiscovered = discovered.has(realmId);
    const disclosure = buildRealmDisclosure(realm, { isGM, discovered: isDiscovered, revealMode });
    if (disclosure.placeholder) {
      undiscoveredCount += 1;
    } else {
      knownDestinations.push(disclosure);
    }
  }

  return { state, knownDestinations, undiscoveredCount };
}

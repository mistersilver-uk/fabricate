/**
 * Pure location-availability evaluation, disclosure-safe region display models,
 * and player travel guidance. No Foundry globals. Shared by the gathering engine
 * (listing + start guard) and the public player-facing API so availability,
 * redaction, and guidance never drift between them.
 *
 * Disclosure policy: for a non-GM viewer, a SECRET undiscovered region MUST NOT
 * expose its id or name anywhere (label, title, aria-label, data-*, filter
 * options). `buildRegionDisclosure` returns `id: null` and a placeholder label
 * key in that case. Always route player-facing region labels through it.
 *
 * @typedef {{ available: boolean, gated: boolean, reasons: string[], matchedRegionIds: string[], excludedRegionIds: string[] }} LocationAvailability
 * @typedef {{ id: string|null, label?: string, labelKey?: string, discovered: boolean, secret: boolean, placeholder: boolean }} GatheringRegionDisclosure
 */

const UNDISCOVERED_PLACEHOLDER_KEY = 'FABRICATE.Gathering.Region.UndiscoveredPlaceholder';

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
  return asIdList(env?.includedRegionIds).length > 0
    || asIdList(env?.excludedRegionIds).length > 0
    || asBiomeList(env?.includedBiomeIds).length > 0
    || asBiomeList(env?.excludedBiomeIds).length > 0;
}

/**
 * Evaluate environment availability against the resolved current-region context.
 *
 * @param {object} env Environment with availability rule fields.
 * @param {object} currentRegionContext
 * @param {boolean} currentRegionContext.resolved Whether a current region resolved.
 * @param {Array<{ id: string, biomes?: string[] }>} [currentRegionContext.regions] Resolved current regions.
 * @returns {LocationAvailability}
 */
export function evaluateLocationAvailability(env = {}, currentRegionContext = {}) {
  const includedRegions = asIdList(env?.includedRegionIds);
  const excludedRegions = asIdList(env?.excludedRegionIds);
  const includedBiomes = asBiomeList(env?.includedBiomeIds);
  const excludedBiomes = asBiomeList(env?.excludedBiomeIds);

  const gated = includedRegions.length > 0
    || excludedRegions.length > 0
    || includedBiomes.length > 0
    || excludedBiomes.length > 0;

  // Rule 6: ungated environments are never location-blocked.
  if (!gated) {
    return { available: true, gated: false, reasons: [], matchedRegionIds: [], excludedRegionIds: [] };
  }

  const hasInclusions = includedRegions.length > 0 || includedBiomes.length > 0;
  const resolved = currentRegionContext?.resolved === true;
  const regions = Array.isArray(currentRegionContext?.regions) ? currentRegionContext.regions : [];

  // Rule 7: no current region resolved.
  if (!resolved || regions.length === 0) {
    if (hasInclusions) {
      return {
        available: false,
        gated: true,
        reasons: ['NO_CURRENT_REGION'],
        matchedRegionIds: [],
        excludedRegionIds: []
      };
    }
    // Exclusion-only or biome-exclusion-only with no current region: available.
    return { available: true, gated: true, reasons: [], matchedRegionIds: [], excludedRegionIds: [] };
  }

  // Rules 1 & 2: exclusions win. A region exclusion on ANY current region, or a
  // biome exclusion matched by ANY current region's biome, blocks the env.
  const excludedHits = [];
  for (const region of regions) {
    const regionBiomes = asBiomeList(region?.biomes);
    if (excludedRegions.includes(region?.id)) {
      excludedHits.push(region.id);
      continue;
    }
    if (regionBiomes.some(biome => excludedBiomes.includes(biome))) {
      excludedHits.push(region?.id);
    }
  }
  if (excludedHits.length > 0) {
    return {
      available: false,
      gated: true,
      reasons: ['LOCATION_BLOCKED'],
      matchedRegionIds: [],
      excludedRegionIds: Array.from(new Set(excludedHits.filter(Boolean)))
    };
  }

  // Rule 5: exclusion-only (no inclusions) and not excluded above ⇒ available.
  if (!hasInclusions) {
    return { available: true, gated: true, reasons: [], matchedRegionIds: [], excludedRegionIds: [] };
  }

  // Rules 3 & 4: inclusion match when any current region id is included OR any
  // current region has an included biome.
  const matched = [];
  for (const region of regions) {
    const regionBiomes = asBiomeList(region?.biomes);
    if (includedRegions.includes(region?.id) || regionBiomes.some(biome => includedBiomes.includes(biome))) {
      matched.push(region.id);
    }
  }
  if (matched.length > 0) {
    return {
      available: true,
      gated: true,
      reasons: [],
      matchedRegionIds: Array.from(new Set(matched)),
      excludedRegionIds: []
    };
  }

  // Inclusion-gated, current region resolved, but no current region matches.
  return {
    available: false,
    gated: true,
    reasons: ['LOCATION_BLOCKED'],
    matchedRegionIds: [],
    excludedRegionIds: []
  };
}

/**
 * Build a disclosure-safe display model for one region. For a non-GM viewer, a
 * secret undiscovered region NEVER leaks its id or name: it resolves to
 * `{ id: null, labelKey: placeholder, placeholder: true }`.
 *
 * @param {object} region Region record (with at least id, name, secret).
 * @param {object} options
 * @param {boolean} options.isGM
 * @param {boolean} options.discovered Whether the selected actor discovered the region.
 * @param {string} [options.revealMode] System reveal mode ('alwaysVisible' shows names).
 * @returns {GatheringRegionDisclosure}
 */
export function buildRegionDisclosure(region = {}, { isGM = false, discovered = false, revealMode = 'manual' } = {}) {
  const id = region?.id ? String(region.id) : null;
  const secret = region?.secret === true;
  const name = String(region?.name ?? '');

  // GMs, non-secret regions, discovered regions, and alwaysVisible reveal mode
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
 * Build redaction-safe travel guidance for a blocked environment.
 *
 * @param {object} args
 * @param {object} args.environment Environment with availability rules.
 * @param {Map<string, object>|object} args.regionsById Region lookup by id.
 * @param {object} args.currentRegionContext Resolved current-region context.
 * @param {LocationAvailability} args.availability Result of evaluateLocationAvailability.
 * @param {Set<string>|string[]} [args.discoveredRegionIds] Region ids the actor discovered.
 * @param {boolean} [args.isGM]
 * @param {string} [args.revealMode]
 * @returns {{ state: 'noCurrentRegion'|'excluded'|'travel', knownDestinations: GatheringRegionDisclosure[], undiscoveredCount: number }}
 */
export function buildTravelGuidance({
  environment = {},
  regionsById = new Map(),
  currentRegionContext = {},
  availability = null,
  discoveredRegionIds = new Set(),
  isGM = false,
  revealMode = 'manual'
} = {}) {
  const result = availability || evaluateLocationAvailability(environment, currentRegionContext);
  const lookup = regionsById instanceof Map
    ? regionsById
    : new Map(Object.entries(regionsById || {}));
  const discovered = discoveredRegionIds instanceof Set
    ? discoveredRegionIds
    : new Set(Array.isArray(discoveredRegionIds) ? discoveredRegionIds : []);

  // No current region resolved (and the env is inclusion-gated) ⇒ ask the GM to
  // set the party's current region. Distinct from an explicit exclusion.
  if (result.reasons.includes('NO_CURRENT_REGION')) {
    return { state: 'noCurrentRegion', knownDestinations: [], undiscoveredCount: 0 };
  }

  const excluded = Array.isArray(result.excludedRegionIds) && result.excludedRegionIds.length > 0;
  const state = excluded ? 'excluded' : 'travel';

  // Destinations are the environment's included region ids — the places the
  // player could travel to so the env becomes available.
  const destinationIds = asIdList(environment?.includedRegionIds);
  const knownDestinations = [];
  let undiscoveredCount = 0;
  for (const regionId of destinationIds) {
    const region = lookup.get(regionId) || { id: regionId, name: '', secret: false };
    const isDiscovered = discovered.has(regionId);
    const disclosure = buildRegionDisclosure(region, { isGM, discovered: isDiscovered, revealMode });
    if (disclosure.placeholder) {
      undiscoveredCount += 1;
    } else {
      knownDestinations.push(disclosure);
    }
  }

  return { state, knownDestinations, undiscoveredCount };
}

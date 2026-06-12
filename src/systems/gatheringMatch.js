/**
 * Shared, dependency-free environment matching for gathering library records.
 *
 * A reusable task/event "matches" an environment when none of its declared
 * biome / weather / time / danger constraints conflict with the environment
 * context. An empty constraint means "any" and never blocks a match. This
 * module is the single source of truth consumed by both the runtime composition
 * service (`GatheringRichStateService`) and the Manager V2 admin store, so match
 * results and the GM-facing match evidence never drift.
 *
 * Region is NOT a composition axis: geography (`GatheringRegion`) drives
 * location availability and travel, not which tasks/events belong to an
 * environment. Composition is biome (+ danger for events) only.
 *
 * @typedef {'match' | 'any' | 'mismatch'} MatchFieldState
 * @typedef {{ state: MatchFieldState, recordValues: string[], envValues: string[], applicable: boolean }} MatchFieldEvidence
 * @typedef {{ biome: MatchFieldEvidence, weather: MatchFieldEvidence, time: MatchFieldEvidence, danger: MatchFieldEvidence }} MatchEvidence
 */

function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)));
}

function normalizeConditionId(value) {
  if (value && typeof value === 'object') {
    return normalizeConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeConditionIdList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(normalizeConditionId).filter(Boolean)));
}

function hasAny(left, right) {
  return left.some(entry => right.includes(entry));
}

/**
 * Canonical danger-level severity scale (ascending). An environment carries a
 * single danger level; an event is eligible when its highest danger tag ranks
 * at or below the environment's level ("events up to and including").
 */
export const DANGER_LEVELS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

export function dangerRank(level) {
  return DANGER_LEVELS.indexOf(normalizeTag(level));
}

/**
 * Resolve an environment's single danger level, migrating legacy shapes:
 * explicit `dangerLevel` → highest of `dangerTags` → `risk` → 'safe'.
 */
export function resolveEnvironmentDangerLevel(environment = {}) {
  const explicit = normalizeTag(environment?.dangerLevel);
  if (DANGER_LEVELS.includes(explicit)) return explicit;
  const tags = normalizeTagList(environment?.dangerTags).filter(tag => DANGER_LEVELS.includes(tag));
  if (tags.length > 0) return tags.reduce((best, tag) => (dangerRank(tag) > dangerRank(best) ? tag : best), tags[0]);
  const risk = normalizeTag(environment?.risk);
  if (DANGER_LEVELS.includes(risk)) return risk;
  return 'safe';
}

/**
 * Evaluate whether a record matches an environment and produce per-dimension
 * evidence for display.
 *
 * Matching is decided by biome and (for events) danger only — weather and
 * time-of-day are runtime gates, not match criteria, and region is geography
 * (not composition). A record with the right biome/danger but the wrong current
 * weather/time still matches the environment; `conditionsMet` is `false` in that
 * case so callers can mark it inactive at runtime without dropping it from
 * composition.
 *
 * @param {object} record Library task or event.
 * @param {object} environment Environment (raw or composed).
 * @param {{ weather?: string, timeOfDay?: string }} [conditions] Current conditions.
 * @param {object} [options]
 * @param {boolean} [options.includeDanger] Apply danger-tag matching (events only).
 * @param {object} [options.conditionSettings] Per-system condition enablement.
 * @returns {{ matches: boolean, conditionsMet: boolean, evidence: MatchEvidence }}
 */
export function evaluateEnvironmentMatch(record = {}, environment = {}, conditions = {}, options = {}) {
  const { includeDanger = false, conditionSettings = null } = options;

  const envBiomes = normalizeTagList(environment?.biomes ?? environment?.biome);
  const envDangerLevel = resolveEnvironmentDangerLevel(environment);

  const biome = evaluateTagField(normalizeTagList(record?.biomes), envBiomes, { requireAll: false });

  const weatherEnabled = conditionSettings?.weather?.enabled !== false;
  const timeEnabled = conditionSettings?.timeOfDay?.enabled !== false;
  const currentWeather = normalizeConditionId(conditions?.weather);
  const currentTime = normalizeConditionId(conditions?.timeOfDay);

  const weather = evaluateConditionField(normalizeConditionIdList(record?.weather), currentWeather, weatherEnabled);
  const time = evaluateConditionField(normalizeConditionIdList(record?.timeOfDay), currentTime, timeEnabled);
  const recordDanger = normalizeTagList(record?.dangerTags).filter(tag => DANGER_LEVELS.includes(tag));
  const danger = includeDanger
    ? evaluateDangerField(recordDanger, envDangerLevel)
    : { state: 'any', recordValues: recordDanger, envValues: envDangerLevel ? [envDangerLevel] : [], applicable: false };

  const evidence = { biome, weather, time, danger };
  // Matching ignores weather/time — those become runtime gates surfaced via conditionsMet.
  const matches = biome.state !== 'mismatch' && danger.state !== 'mismatch';
  const conditionsMet = weather.state !== 'mismatch' && time.state !== 'mismatch';
  return { matches, conditionsMet, evidence };
}

function evaluateTagField(recordValues, envValues) {
  if (recordValues.length === 0) {
    return { state: 'any', recordValues, envValues, applicable: true };
  }
  const state = hasAny(recordValues, envValues) ? 'match' : 'mismatch';
  return { state, recordValues, envValues, applicable: true };
}

function evaluateDangerField(recordTags, envLevel) {
  const envValues = envLevel ? [envLevel] : [];
  if (recordTags.length === 0) {
    return { state: 'any', recordValues: recordTags, envValues, applicable: true };
  }
  const eventRank = recordTags.reduce((max, tag) => Math.max(max, dangerRank(tag)), -1);
  const state = eventRank <= dangerRank(envLevel) ? 'match' : 'mismatch';
  return { state, recordValues: recordTags, envValues, applicable: true };
}

function evaluateConditionField(recordValues, currentValue, enabled) {
  if (!enabled) {
    return { state: 'any', recordValues, envValues: currentValue ? [currentValue] : [], applicable: false };
  }
  const envValues = currentValue ? [currentValue] : [];
  if (recordValues.length === 0) {
    return { state: 'any', recordValues, envValues, applicable: true };
  }
  const state = recordValues.includes(currentValue) ? 'match' : 'mismatch';
  return { state, recordValues, envValues, applicable: true };
}

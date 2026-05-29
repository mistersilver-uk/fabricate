/**
 * Shared, dependency-free environment matching for gathering library records.
 *
 * A reusable task/hazard "matches" an environment when none of its declared
 * region / biome / weather / time / danger constraints conflict with the
 * environment context. An empty constraint means "any" and never blocks a
 * match. This module is the single source of truth consumed by both the
 * runtime composition service (`GatheringRichStateService`) and the Manager V2
 * admin store, so match results and the GM-facing match evidence never drift.
 *
 * @typedef {'match' | 'any' | 'mismatch'} MatchFieldState
 * @typedef {{ state: MatchFieldState, recordValues: string[], envValues: string[], applicable: boolean }} MatchFieldEvidence
 * @typedef {{ region: MatchFieldEvidence, biome: MatchFieldEvidence, weather: MatchFieldEvidence, time: MatchFieldEvidence, danger: MatchFieldEvidence }} MatchEvidence
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

function recordRegionList(record) {
  if (Array.isArray(record?.regions)) return normalizeTagList(record.regions);
  return record?.region ? normalizeTagList([record.region]) : [];
}

/**
 * Evaluate whether a record matches an environment and produce per-dimension
 * evidence for display.
 *
 * @param {object} record Library task or hazard.
 * @param {object} environment Environment (raw or composed).
 * @param {{ weather?: string, timeOfDay?: string }} [conditions] Current conditions.
 * @param {object} [options]
 * @param {boolean} [options.includeDanger] Apply danger-tag matching (hazards only).
 * @param {object} [options.conditionSettings] Per-system condition enablement.
 * @returns {{ matches: boolean, evidence: MatchEvidence }}
 */
export function evaluateEnvironmentMatch(record = {}, environment = {}, conditions = {}, options = {}) {
  const { includeDanger = false, conditionSettings = null } = options;

  const envRegion = normalizeTag(environment?.region);
  const envBiomes = normalizeTagList(environment?.biomes ?? environment?.biome);
  const envDanger = normalizeTagList(environment?.dangerTags ?? environment?.risk);

  const region = evaluateTagField(recordRegionList(record), envRegion ? [envRegion] : [], { requireAll: false });
  const biome = evaluateTagField(normalizeTagList(record?.biomes), envBiomes, { requireAll: false });

  const weatherEnabled = conditionSettings?.weather?.enabled !== false;
  const timeEnabled = conditionSettings?.timeOfDay?.enabled !== false;
  const currentWeather = normalizeConditionId(conditions?.weather);
  const currentTime = normalizeConditionId(conditions?.timeOfDay);

  const weather = evaluateConditionField(normalizeConditionIdList(record?.weather), currentWeather, weatherEnabled);
  const time = evaluateConditionField(normalizeConditionIdList(record?.timeOfDay), currentTime, timeEnabled);
  const danger = includeDanger
    ? evaluateTagField(normalizeTagList(record?.dangerTags), envDanger, { requireAll: false })
    : { state: 'any', recordValues: normalizeTagList(record?.dangerTags), envValues: envDanger, applicable: false };

  const evidence = { region, biome, weather, time, danger };
  const matches = Object.values(evidence).every(field => field.state !== 'mismatch');
  return { matches, evidence };
}

function evaluateTagField(recordValues, envValues) {
  if (recordValues.length === 0) {
    return { state: 'any', recordValues, envValues, applicable: true };
  }
  const state = hasAny(recordValues, envValues) ? 'match' : 'mismatch';
  return { state, recordValues, envValues, applicable: true };
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

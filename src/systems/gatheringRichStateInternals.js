/**
 * Shared file-private internals for the gathering rich-state cluster.
 *
 * These helpers were file-private to `GatheringRichStateService`. Extracting
 * the stamina and node subsystems into dedicated collaborators
 * (`GatheringStaminaService`, `GatheringNodeService`) requires the same pure
 * coercers, the actor-flag persistence pair, and the calendar-aware duration
 * helper in all three modules. They live here so the logic is defined ONCE
 * (no Sonar duplication, no drift) and imported by the parent and both
 * collaborators alike.
 */

/** Foundry flag namespace + key the actor-scoped gathering state persists under. */
export const FLAG_NAMESPACE = 'fabricate';
export const STATE_FLAG_KEY = 'gatheringState';

/** Hardcoded Earth-calendar seconds-per-unit fallback for `durationToSeconds`. */
const SECONDS_PER_UNIT = Object.freeze({
  minutes: 60,
  hours: 3600,
  days: 86_400,
  weeks: 604_800,
});

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

export function numberOrNullStrict(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

export function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number(fallback || 0);
}

/**
 * Read the actor-scoped gathering state flag, returning a deep clone (so callers
 * mutate a copy) or `{}` on any missing/inaccessible state. Never throws.
 *
 * @param {object} actor Foundry actor.
 * @returns {object} Cloned state, or `{}`.
 */
export function readState(actor) {
  try {
    const state = actor?.getFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY);
    return state && typeof state === 'object' ? cloneJson(state) : {};
  } catch {
    return {};
  }
}

/**
 * Persist the actor-scoped gathering state flag (deep-cloned).
 *
 * @param {object} actor Foundry actor.
 * @param {object} state State to persist.
 * @returns {Promise<*>}
 */
export async function writeState(actor, state) {
  return actor?.setFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY, cloneJson(state));
}

/**
 * Convert a count of whole world-time units into seconds via the injected
 * `secondsPerUnit` seam, so day/week interval lengths follow the active calendar
 * (`days`/`weeks` track the active world calendar; `minutes`/`hours` are fixed).
 *
 * @param {Function} secondsPerUnit Seam resolving one unit to seconds.
 * @param {number} count Number of whole units.
 * @param {string} unit One of minutes|hours|days|weeks.
 * @returns {number} Non-negative seconds.
 */
export function durationToSeconds(secondsPerUnit, count, unit) {
  const seconds = Number(secondsPerUnit(unit));
  const safe = seconds > 0 ? seconds : SECONDS_PER_UNIT.hours;
  return Math.max(0, Number(count || 0) * safe);
}

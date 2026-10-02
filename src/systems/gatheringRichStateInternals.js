/**
 * Internals shared by `GatheringRichStateService`, `GatheringStaminaService` and
 * `GatheringNodeService`, defined once so the three cannot drift.
 */

import { cloneJson } from '../utils/scalars.js';

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

export function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

export function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number(fallback || 0);
}

/** A deep clone of the actor's gathering state, or `{}`; never throws. */
export function readState(actor) {
  try {
    const state = actor?.getFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY);
    return state && typeof state === 'object' ? cloneJson(state) : {};
  } catch {
    return {};
  }
}

export async function writeState(actor, state) {
  return actor?.setFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY, cloneJson(state));
}

/** Whole units to seconds through the calendar-aware `secondsPerUnit` seam; never negative. */
export function durationToSeconds(secondsPerUnit, count, unit) {
  const seconds = Number(secondsPerUnit(unit));
  const safe = seconds > 0 ? seconds : SECONDS_PER_UNIT.hours;
  return Math.max(0, Number(count || 0) * safe);
}

export {
  arrayOrEmpty as normalizeList,
  cloneJson,
  numberOrNull as numberOrNullStrict,
} from '../utils/scalars.js';

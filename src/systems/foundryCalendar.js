/**
 * Pure helpers that derive interval lengths from a Foundry V13 world calendar
 * object (`game.time.calendar`, a `foundry.data.CalendarData` instance).
 *
 * Kept free of any `game.*` global access so they can be unit-tested with a plain
 * fake calendar; `main.js` performs the `game.time?.calendar` lookup and injects
 * `secondsPerUnitFromCalendar` as the service's `secondsPerUnit` seam. Minutes and
 * hours are universal (60 / 3600) and never calendar-derived — only days and
 * weeks vary across custom calendars.
 */

const EARTH_SECONDS_PER_DAY = 86_400;
const EARTH_SECONDS_PER_WEEK = 604_800;

/**
 * Measure one calendar day by differencing `componentsToTime` — a fallback for
 * calendars that don't expose explicit day-length config. Returns 0 (rather than
 * throwing) when the method is missing or errors, so callers can fall through.
 *
 * @param {object} calendar
 * @returns {number} Seconds in one day, or 0 if unmeasurable.
 */
function measureDaySeconds(calendar) {
  if (typeof calendar?.componentsToTime !== 'function') return 0;
  try {
    const delta =
      Number(calendar.componentsToTime({ day: 1 })) - Number(calendar.componentsToTime({ day: 0 }));
    return Number.isFinite(delta) && delta > 0 ? delta : 0;
  } catch {
    return 0;
  }
}

/**
 * Seconds in one calendar day. Prefers explicit config
 * (`days.hoursPerDay * days.minutesPerHour * days.secondsPerMinute`), then a
 * measured day, then the Earth day as a last resort.
 *
 * @param {object|null} calendar
 * @returns {number}
 */
export function secondsPerDayFromCalendar(calendar) {
  const days = calendar?.days;
  const hours = Number(days?.hoursPerDay);
  const minutes = Number(days?.minutesPerHour);
  const seconds = Number(days?.secondsPerMinute);
  if (hours > 0 && minutes > 0 && seconds > 0) return hours * minutes * seconds;
  const measured = measureDaySeconds(calendar);
  return measured > 0 ? measured : EARTH_SECONDS_PER_DAY;
}

/**
 * Seconds in one calendar week — the weekday count (`days.values.length`) times
 * the day length. Calendars without a week concept fall back to 7 days; with no
 * calendar at all, the Earth week.
 *
 * @param {object|null} calendar
 * @param {number} [secondsPerDay] Precomputed day length to avoid recomputation.
 * @returns {number}
 */
export function secondsPerWeekFromCalendar(
  calendar,
  secondsPerDay = secondsPerDayFromCalendar(calendar)
) {
  if (!calendar) return EARTH_SECONDS_PER_WEEK;
  const spd = Number(secondsPerDay) > 0 ? Number(secondsPerDay) : EARTH_SECONDS_PER_DAY;
  const weekdayCount = Number(calendar?.days?.values?.length);
  return Number.isFinite(weekdayCount) && weekdayCount > 0 ? weekdayCount * spd : 7 * spd;
}

/**
 * Number of days in one calendar year, derived from a Foundry V13 world calendar.
 * Prefers explicit config (`days.daysPerYear`), then the sum of each configured
 * month's day count (`months.values[].days`). Returns null when neither is
 * resolvable, so callers can fall back to a 1-based within-year day.
 *
 * Kept free of `game.*` so it is unit-testable with a plain fake calendar;
 * `main.js` injects the lookup into the Journal's world-time-components seam.
 *
 * @param {object|null} calendar
 * @returns {number|null}
 */
export function daysPerYearFromCalendar(calendar) {
  const explicit = Number(calendar?.days?.daysPerYear);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const months = calendar?.months?.values;
  if (Array.isArray(months) && months.length > 0) {
    const total = months.reduce((sum, month) => sum + (Number(month?.days) || 0), 0);
    if (total > 0) return total;
  }
  return null;
}

/**
 * Resolve seconds for one regen/respawn unit against a calendar object. Minutes
 * and hours are fixed; days and weeks are calendar-derived. With no calendar,
 * returns the Earth-table values, reproducing the pre-calendar behavior.
 *
 * @param {string} unit One of minutes|hours|days|weeks.
 * @param {object|null} calendar
 * @returns {number} Seconds in one unit.
 */
export function secondsPerUnitFromCalendar(unit, calendar) {
  if (unit === 'minutes') return 60;
  if (unit === 'hours') return 3600;
  // Only days/weeks are calendar-derived; any other (unexpected) unit falls back
  // to hours, matching the service's default seam.
  if (unit !== 'days' && unit !== 'weeks') return 3600;
  if (!calendar) return unit === 'weeks' ? EARTH_SECONDS_PER_WEEK : EARTH_SECONDS_PER_DAY;
  const secondsPerDay = secondsPerDayFromCalendar(calendar);
  return unit === 'weeks' ? secondsPerWeekFromCalendar(calendar, secondsPerDay) : secondsPerDay;
}

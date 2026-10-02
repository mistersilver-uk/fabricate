/**
 * Pure interval lengths from a V13 world calendar (`game.time.calendar`, a
 * `foundry.data.CalendarData`); the caller does the lookup and injects the result, so a plain fake
 * calendar tests these. Minutes and hours are fixed; only days and weeks follow a custom calendar.
 * The calendar fields each helper reads are listed in `.agents/docs/foundry-and-architecture.md`.
 */

const EARTH_SECONDS_PER_DAY = 86_400;
const EARTH_SECONDS_PER_WEEK = 604_800;

/** One day measured by differencing `componentsToTime`, or 0 when unmeasurable; never throws. */
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

/** Seconds per day: explicit `days` config, else a measured day, else the Earth day. */
export function secondsPerDayFromCalendar(calendar) {
  const days = calendar?.days;
  const hours = Number(days?.hoursPerDay);
  const minutes = Number(days?.minutesPerHour);
  const seconds = Number(days?.secondsPerMinute);
  if (hours > 0 && minutes > 0 && seconds > 0) return hours * minutes * seconds;
  const measured = measureDaySeconds(calendar);
  return measured > 0 ? measured : EARTH_SECONDS_PER_DAY;
}

/** Seconds per week: weekdays times the day, else 7 days, else the Earth week with no calendar. */
export function secondsPerWeekFromCalendar(
  calendar,
  secondsPerDay = secondsPerDayFromCalendar(calendar)
) {
  if (!calendar) return EARTH_SECONDS_PER_WEEK;
  const spd = Number(secondsPerDay) > 0 ? Number(secondsPerDay) : EARTH_SECONDS_PER_DAY;
  const weekdayCount = Number(calendar?.days?.values?.length);
  return Number.isFinite(weekdayCount) && weekdayCount > 0 ? weekdayCount * spd : 7 * spd;
}

/** Days per year from `days.daysPerYear` or the month lengths, else `null` to fall back on. */
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

/** Seconds per regen or respawn unit; with no calendar, the Earth values. */
export function secondsPerUnitFromCalendar(unit, calendar) {
  if (unit === 'minutes') return 60;
  if (unit === 'hours') return 3600;
  // An unexpected unit falls back to hours, the service's default seam.
  if (unit !== 'days' && unit !== 'weeks') return 3600;
  if (!calendar) return unit === 'weeks' ? EARTH_SECONDS_PER_WEEK : EARTH_SECONDS_PER_DAY;
  const secondsPerDay = secondsPerDayFromCalendar(calendar);
  return unit === 'weeks' ? secondsPerWeekFromCalendar(calendar, secondsPerDay) : secondsPerDay;
}

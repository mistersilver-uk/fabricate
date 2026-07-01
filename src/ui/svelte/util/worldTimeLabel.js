/**
 * Pure world-time label builder for the player-facing Journal screen.
 *
 * The day and clock come from the active calendar's `timeToComponents(worldTime)`
 * (a V13 `CalendarData` method returning `{ year, day, hour, minute, … }`),
 * resolved at the Foundry edge and passed in as `components`. It must NOT be
 * derived by dividing `worldTime` by the calendar's seconds-per-day.
 *
 * V13 `timeToComponents().day` is the number of days COMPLETED within the current
 * year (0-based, and it resets every year), so this util renders a monotonic,
 * 1-based day instead: when `components` carries a `year` and a derivable
 * `daysPerYear` (supplied by the `getWorldTimeComponents` seam), the absolute day
 * is `year * daysPerYear + day + 1`; otherwise the within-year day is shown
 * 1-based as `day + 1`.
 *
 * Two renderings:
 *  - current time: "Day N, <phase>" where `<phase>` is the same time-of-day
 *    vocabulary the top bar uses, supplied via `timeOfDayLabel`;
 *  - future time (a maturing run's `availableAt`): "Day N HH:MM" — a future
 *    instant cannot map to the current global time-of-day tag, so it shows the
 *    clock instead.
 *
 * Pure: no `game.*`. The localized templates are resolved through the injected
 * `localize` (defaults to identity so the function is trivially unit-testable).
 */

/**
 * @param {{year?: number, day?: number, daysPerYear?: number, hour?: number,
 *   minute?: number}|null} components Calendar components for the instant being
 *   labelled.
 * @param {object} [options]
 * @param {string} [options.timeOfDayLabel] Localized current time-of-day phrase.
 *   When non-empty the "Day N, <phase>" form is used; otherwise the clock form.
 * @param {Function} [options.localize] `(key, data?) => string`.
 * @returns {string} The composed label, or '' when no day is resolvable.
 */
export function worldTimeLabel(components, { timeOfDayLabel = '', localize = (key) => key } = {}) {
  const day = resolveDay(components);
  if (day === null) return '';

  const phase = typeof timeOfDayLabel === 'string' ? timeOfDayLabel.trim() : '';
  if (phase) {
    return localize('FABRICATE.App.Journal.Time.DayWithPhase', { day, phase });
  }
  return localize('FABRICATE.App.Journal.Time.DayWithClock', { day, time: clock(components) });
}

/**
 * Resolve a monotonic, 1-based absolute campaign day from calendar components.
 * The raw `components.day` is 0-based and resets each year; composing it with
 * `year * daysPerYear` (when both are present) yields a day that never goes
 * backwards across a year rollover. Without a year/days-per-year the within-year
 * day is simply shown 1-based.
 */
function resolveDay(components) {
  const rawDay = Number(components?.day);
  if (!Number.isFinite(rawDay)) return null;
  const year = Number(components?.year);
  const daysPerYear = Number(components?.daysPerYear);
  if (Number.isFinite(year) && Number.isFinite(daysPerYear) && daysPerYear > 0) {
    return year * daysPerYear + rawDay + 1;
  }
  return rawDay + 1;
}

function clock(components) {
  const hour = clamp(Number(components?.hour), 0);
  const minute = clamp(Number(components?.minute), 0);
  return `${pad(hour)}:${pad(minute)}`;
}

function clamp(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function pad(value) {
  return String(Math.trunc(value)).padStart(2, '0');
}

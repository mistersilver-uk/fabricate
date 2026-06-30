/**
 * Pure world-time label builder for the player-facing Journal screen.
 *
 * The absolute campaign day and clock come from the active calendar's
 * `timeToComponents(worldTime)` (a V13 `CalendarData` method returning
 * `{ day, hour, minute, … }`), resolved at the Foundry edge and passed in as
 * `components`. It must NOT be derived by dividing `worldTime` by the calendar's
 * seconds-per-day — that yields a duration, not the absolute campaign-day.
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
 * @param {{day?: number, hour?: number, minute?: number}|null} components
 *   Calendar components for the instant being labelled.
 * @param {object} [options]
 * @param {string} [options.timeOfDayLabel] Localized current time-of-day phrase.
 *   When non-empty the "Day N, <phase>" form is used; otherwise the clock form.
 * @param {Function} [options.localize] `(key, data?) => string`.
 * @returns {string} The composed label, or '' when no day is resolvable.
 */
export function worldTimeLabel(components, { timeOfDayLabel = '', localize = (key) => key } = {}) {
  const day = resolveDay(components?.day);
  if (day === null) return '';

  const phase = typeof timeOfDayLabel === 'string' ? timeOfDayLabel.trim() : '';
  if (phase) {
    return localize('FABRICATE.App.Journal.Time.DayWithPhase', { day, phase });
  }
  return localize('FABRICATE.App.Journal.Time.DayWithClock', { day, time: clock(components) });
}

function resolveDay(rawDay) {
  const day = Number(rawDay);
  return Number.isFinite(day) ? day : null;
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

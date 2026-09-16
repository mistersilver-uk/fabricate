// The player Journal's world-time label. `components` comes from the active calendar's
// `timeToComponents(worldTime)` at the Foundry edge and MUST NOT be derived by dividing
// `worldTime` by seconds-per-day. Two renderings: "Day N, <phase>" for the current instant, and
// "Day N HH:MM" for a future one, which cannot map to the current global time-of-day tag.
// Pure — no `game.*`; `localize` is injected and defaults to identity.

export function worldTimeLabel(components, { timeOfDayLabel = '', localize = (key) => key } = {}) {
  const day = resolveDay(components);
  if (day === null) return '';

  const phase = typeof timeOfDayLabel === 'string' ? timeOfDayLabel.trim() : '';
  if (phase) {
    return localize('FABRICATE.App.Journal.Time.DayWithPhase', { day, phase });
  }
  return localize('FABRICATE.App.Journal.Time.DayWithClock', { day, time: clock(components) });
}

// V13's `components.day` is 0-based and RESETS every year, so composing it with `year * daysPerYear`
// (when both are present) is what keeps the campaign day monotonic across a rollover. Without them
// the within-year day is shown 1-based.
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

// Seconds to a human duration, for player-facing gathering and Journal UI. The day and week
// thresholds are NOT the Earth table: they come from the active world calendar through
// `secondsPerUnitFromCalendar`, mirroring the node respawn interval math, which is calendar-aware
// too. Minutes and hours are universal. Pure — the calendar is passed in.

import { secondsPerUnitFromCalendar } from '../../../systems/foundryCalendar.js';

const MINUTE = 60;
const HOUR = 3600;

// The largest whole unit that fits. `''` for non-finite or non-positive input, so a caller can hide
// the line entirely rather than render a zero.
export function formatRespawnDuration(seconds, calendar = null) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';

  const perDay = positiveOr(secondsPerUnitFromCalendar('days', calendar), 86400);
  const perWeek = positiveOr(secondsPerUnitFromCalendar('weeks', calendar), perDay * 7);

  if (total >= perWeek) return plural(Math.round(total / perWeek), 'week');
  if (total >= perDay) return plural(Math.round(total / perDay), 'day');
  if (total >= HOUR) return plural(Math.round(total / HOUR), 'hour');
  if (total >= MINUTE) return plural(Math.round(total / MINUTE), 'minute');
  return plural(Math.max(1, Math.round(total)), 'second');
}

function positiveOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function plural(count, unit) {
  const n = Math.max(1, Number(count) || 1);
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

// A compact `1h 27m 42s` countdown for the Journal's world-time gates, dropping leading zero units.
// A non-positive input renders `0s`, so a MATURED gate reads as elapsed rather than blank.
export function formatDurationHMS(seconds) {
  const total = Math.trunc(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return '0s';

  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const secs = total % MINUTE;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

// "Today" / "Yesterday" / "N days ago" for a terminal run. `secondsPerDay` is a DURATION, which is
// the correct basis for an elapsed-days difference, and the wording is injected so this stays pure.
export function formatRelativeWorldTime(finishedAt, now, { secondsPerDay = 86400, labels = {} } = {}) {
  const finished = Number(finishedAt);
  const current = Number(now);
  if (!Number.isFinite(finished) || !Number.isFinite(current)) return '';

  const perDay = positiveOr(secondsPerDay, 86400);
  const elapsedDays = Math.max(0, Math.floor((current - finished) / perDay));

  const today = labels.today ?? 'Today';
  const yesterday = labels.yesterday ?? 'Yesterday';
  const daysAgo = typeof labels.daysAgo === 'function' ? labels.daysAgo : (n) => `${n} days ago`;

  if (elapsedDays <= 0) return today;
  if (elapsedDays === 1) return yesterday;
  return daysAgo(elapsedDays);
}

// Unit ladder for an AUTHORED duration, largest first. Hours/minutes/seconds only:
// the prototype's own duration helper (`dur(h)`) has no day unit, and these three
// are calendar-independent, so no calendar has to be threaded in. Plurals are TWO
// whole literal keys chosen by a ternary — a concatenated suffix credits only the
// prefix under the lang-key orphan guard and strands the leaf.
const AUTHORED_DURATION_UNITS = [
  {
    seconds: HOUR,
    word: 'hour',
    one: 'FABRICATE.App.Journal.Duration.HourOne',
    many: 'FABRICATE.App.Journal.Duration.HourMany',
  },
  {
    seconds: MINUTE,
    word: 'minute',
    one: 'FABRICATE.App.Journal.Duration.MinuteOne',
    many: 'FABRICATE.App.Journal.Duration.MinuteMany',
  },
  {
    seconds: 1,
    word: 'second',
    one: 'FABRICATE.App.Journal.Duration.SecondOne',
    many: 'FABRICATE.App.Journal.Duration.SecondMany',
  },
];

/**
 * Format an AUTHORED duration requirement (what a stage NEEDS) in words rather
 * than as a countdown: `2 hours`, `1 hour 27 minutes 42 seconds`. Every non-zero
 * unit is rendered so a requirement is never rounded away. Returns `''` for
 * zero/negative/non-finite input so callers can render their own "no wait" copy.
 * A positive sub-second requirement floors UP to `1 second`: truncating it to zero
 * answered `''`, which reads as "no wait at all" for a stage that does have one.
 * Pure: the localized unit words arrive through the injected `localize`.
 *
 * @param {number} seconds Authored requirement in world-time seconds.
 * @param {object} [options]
 * @param {Function} [options.localize] `(key, data?) => string`; English fallback when absent.
 * @returns {string} e.g. "2 hours", or '' when not renderable.
 */
export function formatAuthoredDuration(seconds, { localize = null } = {}) {
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || raw <= 0) return '';
  const total = Math.max(1, Math.trunc(raw));

  let rest = total;
  const parts = [];
  for (const unit of AUTHORED_DURATION_UNITS) {
    const count = Math.floor(rest / unit.seconds);
    rest -= count * unit.seconds;
    if (count > 0) parts.push(authoredUnit(count, unit, localize));
  }
  return parts.join(' ');
}

function authoredUnit(count, unit, localize) {
  if (typeof localize !== 'function') return plural(count, unit.word);
  return localize(count === 1 ? unit.one : unit.many, { count });
}

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

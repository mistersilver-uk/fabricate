/**
 * Calendar-aware "seconds → human duration" formatter for player-facing
 * gathering UI (the per-token node respawn ETA: `respawnEta.secondsUntil`).
 *
 * The day/week thresholds are NOT hard-coded to the Earth table: they are
 * derived from the active world calendar via `secondsPerUnitFromCalendar` so a
 * custom calendar's day/week lengths drive the rendered units (mirroring the
 * node respawn interval math, which is itself calendar-aware). Minutes and hours
 * are universal. Pure (no `game.*`): the calendar is passed in.
 */

import { secondsPerUnitFromCalendar } from '../../../systems/foundryCalendar.js';

const MINUTE = 60;
const HOUR = 3600;

/**
 * Format a non-negative second count as a coarse human duration string using the
 * largest whole calendar unit that fits (weeks → days → hours → minutes →
 * seconds). Returns `''` for non-finite / non-positive input so callers can hide
 * the line entirely.
 *
 * @param {number} seconds Seconds until the next respawn (`secondsUntil`).
 * @param {object|null} [calendar] The active world calendar (`game.time.calendar`).
 * @returns {string} e.g. "3 days", "1 hour", "5 minutes", or '' when not renderable.
 */
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

/**
 * Format a second count as a compact `H+m+s` countdown for the Journal's
 * world-time gates (e.g. `1h 27m 42s`, `27m 42s`, `42s`). Leading zero units
 * are dropped; a zero/negative/non-finite input renders `0s` so a matured gate
 * reads as elapsed rather than blank. Pure — the values are world-time seconds.
 *
 * @param {number} seconds Seconds remaining (`availableAt - worldTime`).
 * @returns {string} e.g. "1h 27m 42s".
 */
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

/**
 * Build a coarse "relative world-time" label for a terminal run's `finishedAt`
 * relative to `now` (both world-time seconds): "Today", "Yesterday", or
 * "N days ago". The day boundary length comes from the injected `secondsPerDay`
 * (a duration, the correct basis for an elapsed-days difference); the localized
 * wording is supplied via injected `labels` so the function stays pure (no
 * `game.*`).
 *
 * @param {number} finishedAt World-time the run finished.
 * @param {number} now Current world time.
 * @param {object} [options]
 * @param {number} [options.secondsPerDay] Seconds per calendar day (default Earth 86400).
 * @param {{today?: string, yesterday?: string, daysAgo?: (n: number) => string}} [options.labels]
 * @returns {string} The relative label, or '' when `finishedAt`/`now` are not finite.
 */
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

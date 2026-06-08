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

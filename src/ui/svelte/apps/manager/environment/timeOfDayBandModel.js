/**
 * The time-of-day bar's pure model (issue 2431): the periods over one calendar day, rotated so the
 * axis starts at the first-listed period's start hour, the tiling verdict, the world-clock and
 * current markers, each band's rail seed and the add form's default start hour.
 */
import { resolveTimeOfDayStartHour } from '../../../../../systems/normalize/gatheringConditionOptions.js';
import { clock } from '../../../util/worldTimeLabel.js';

/** The tag palette in the library drawing's order; a band takes the one at its authored index. */
export const TIME_OF_DAY_TAGS = Object.freeze([
  'mist',
  'butter',
  'peach',
  'lavender',
  'sage',
  'rose',
  'aqua',
  'mauve',
]);

const HOURS_PER_DAY = 24;

/** The band fill and ink at authored `index`; `time-of-day-bar-contrast.test.js` measures both. */
export function timeOfDayTint(index) {
  const tag = TIME_OF_DAY_TAGS[index % TIME_OF_DAY_TAGS.length];
  return {
    color: `color-mix(in oklab, var(--fab-tag-${tag}) 24%, var(--fab-bg-0))`,
    ink: 'var(--fab-text)',
  };
}

/** The calendar's hours per day, 24 without a reading; may be invalid, see `isDayLength`. */
export function dayLengthOf(components) {
  const hours = components?.hoursPerDay;
  return hours === undefined || hours === null ? HOURS_PER_DAY : Number(hours);
}

const isDayLength = (hours) => Number.isInteger(hours) && hours > 0;

/** The highest start hour a stepper offers: the day's last hour, or 23 for an invalid day. */
export const lastHourOf = (components) => {
  const hours = dayLengthOf(components);
  return (isDayLength(hours) ? hours : HOURS_PER_DAY) - 1;
};

export const hourText = (hour) => clock({ hour, minute: 0 });

/** The two-digit hour a band's range sublabel reads, `04` in `04–08`. */
export const shortHourText = (hour) => String(hour).padStart(2, '0');

/** The hour of `HH`, `H` or `HH:MM` text, else `NaN`. */
export function parseHourText(text) {
  const match = /^(\d{1,2})(?::\d{2})?$/.exec(String(text ?? '').trim());
  return match ? Number(match[1]) : NaN;
}

export const unrotateHour = (value, hours) => ((value % hours) + hours) % hours;

/** Each value as `{ id, label, index, startHour }`, a bare string included; hours resolved on read. */
export function timeOfDayPeriods(values) {
  return (Array.isArray(values) ? values : []).map((value, index) => {
    const record = value && typeof value === 'object' ? value : { id: value };
    const id = String(record.id ?? '').trim();
    return {
      id,
      label: String(record.label || id).trim(),
      index,
      startHour: resolveTimeOfDayStartHour({ id, startHour: record.startHour }),
    };
  });
}

/** The labels of the periods that keep the day from tiling, in authored order. */
function unplacedLabels(periods, hours) {
  if (!isDayLength(hours)) return periods.map((period) => period.label);
  const counts = new Map();
  for (const { startHour } of periods) counts.set(startHour, (counts.get(startHour) ?? 0) + 1);
  return periods
    .filter(
      ({ startHour }) => startHour === null || startHour >= hours || counts.get(startHour) > 1
    )
    .map((period) => period.label);
}

/** The bands in day order on the rotated axis, each with its clock hours and rail seed. */
function rotatedBands(periods, hours) {
  const first = periods[0].startHour;
  const rotate = (hour) => (hour < first ? hour + hours : hour);
  const sorted = periods
    .map((period) => ({ ...period, from: rotate(period.startHour) }))
    .sort((a, b) => a.from - b.from);
  return sorted.map((period, position) => {
    const to = position === sorted.length - 1 ? first + hours : sorted[position + 1].from;
    const width = to - period.from;
    return {
      id: period.id,
      name: period.label,
      index: period.index,
      from: period.from,
      to,
      start: period.startHour,
      end: unrotateHour(to, hours),
      seed: width >= 2 ? unrotateHour(period.from + Math.floor(width / 2), hours) : null,
      ...timeOfDayTint(period.index),
    };
  });
}

/** The world clock on the rotated axis, or null without an hour. */
function clockValue(components, first, hours) {
  const hour = Number(components?.hour);
  if (components?.hour === undefined || components?.hour === null || !Number.isFinite(hour)) {
    return null;
  }
  const perHour = Number(components.minutesPerHour) > 0 ? Number(components.minutesPerHour) : 60;
  const value = hour + (Number(components.minute) || 0) / perHour;
  return value < first ? value + hours : value;
}

/**
 * The bar for `values`, `current` and calendar `components` (null without a reading): `status` is
 * `'empty'`, `'fallback'` with the `unplaced` labels to fix, or `'bar'` with its axis `[min, max]`,
 * `bands`, the `clock` and `current` marker values (null when not drawn) and `clockText`.
 */
export function timeOfDayBar({ values, current, components }) {
  const periods = timeOfDayPeriods(values);
  const hoursPerDay = dayLengthOf(components);
  const base = { hoursPerDay, unplaced: [], bands: [], clock: null, current: null, clockText: '' };
  if (periods.length === 0) return { ...base, status: 'empty' };
  const unplaced = unplacedLabels(periods, hoursPerDay);
  if (unplaced.length > 0) return { ...base, status: 'fallback', unplaced };
  const first = periods[0].startHour;
  const bands = rotatedBands(periods, hoursPerDay);
  const currentBand = bands.find((band) => band.id === current);
  const clockAt = clockValue(components, first, hoursPerDay);
  return {
    ...base,
    status: 'bar',
    min: first,
    max: first + hoursPerDay,
    bands,
    clock: clockAt,
    clockText: clockAt === null ? '' : clock(components),
    current: currentBand ? (currentBand.from + currentBand.to) / 2 : null,
  };
}

/** The add form's start hour: the longest period's midpoint, the first in day order on a tie. */
export function addStartDefault({ values, components }) {
  const { status, bands, hoursPerDay } = timeOfDayBar({ values, current: '', components });
  if (status !== 'bar') return null;
  const longest = bands.reduce((best, band) =>
    band.to - band.from > best.to - best.from ? band : best
  );
  return unrotateHour(longest.from + Math.floor((longest.to - longest.from) / 2), hoursPerDay);
}

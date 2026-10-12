/**
 * The pure geometry of the shared range bar, `components/ThresholdBandStrip.svelte`: which bands
 * tile, the track's domain, each handle's bounds and the snap grid. Its contract is the strip's.
 */

/** A finite number, or null for an absent value; `Number(null)` is `0`, so absence is tested first. */
export const numeric = (value) => {
  if ([null, undefined, ''].includes(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The bands in value order, each with its authored `index`, or null when they do not tile. */
export function resolveBands(bands, minimum = 2) {
  if (!Array.isArray(bands) || bands.length < minimum) return null;
  const rows = bands
    .map((band, position) => ({
      id: band?.id ?? '',
      name: band?.name ?? '',
      color: typeof band?.color === 'string' ? band.color : '',
      ink: typeof band?.ink === 'string' ? band.ink : '',
      range: typeof band?.range === 'string' ? band.range : '',
      from: numeric(band?.from),
      to: numeric(band?.to),
      index: Number.isInteger(band?.index) ? band.index : position,
    }))
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  if (rows.some((row) => row.from === null)) return null;

  for (let index = 0; index < rows.length - 1; index += 1) {
    if (rows[index + 1].from <= rows[index].from) return null;
    if (rows[index].to !== null && rows[index].to + 1 !== rows[index + 1].from) return null;
  }
  return rows;
}

/** The track's `[min, max]`: the caller's overrides, else derived from the bands per binding. */
export function bandDomain({ rows, boundaries, min, max, binding, step }) {
  const low = numeric(min);
  const high = numeric(max);
  if (!rows) return { min: low ?? 0, max: high ?? 1 };
  const first = rows[0].from;
  const last = rows.at(-1);
  const tail = boundaries.length >= 2 ? boundaries.at(-1) - boundaries.at(-2) : step;
  const derivedMax =
    binding === 'fixed' && last.to !== null ? last.to : last.from + Math.max(tail, step);
  return { min: low ?? first, max: high ?? derivedMax };
}

/** Where the track ends: one past an inclusive `fixed` end, else the domain's max. */
export function trackMaxOf({ rows, binding, max, domain }) {
  if (!rows || binding !== 'fixed' || numeric(max) !== null) return domain.max;
  return rows.at(-1).to === null ? domain.max : domain.max + 1;
}

/** Handle `index`'s bounds, one step inside each neighbour and the track; pinned when inverted. */
export function boundsFor(index, { boundaries, domainMin, trackMax, step }) {
  const lower = index === 0 ? domainMin + step : boundaries[index - 1] + step;
  const upper = index === boundaries.length - 1 ? trackMax - step : boundaries[index + 1] - step;
  if (lower > upper) {
    const pinned = boundaries[index];
    return [pinned, pinned];
  }
  return [lower, upper];
}

/** The bounds announced, widened to hold the handle's own value. */
export function ariaBoundsFor(index, geometry) {
  const [lower, upper] = boundsFor(index, geometry);
  const now = geometry.boundaries[index];
  return [Math.min(lower, now), Math.max(upper, now)];
}

export function clampTo(index, value, geometry) {
  const [lower, upper] = boundsFor(index, geometry);
  return Math.min(upper, Math.max(lower, value));
}

/** The nearest grid value, the grid running from the domain's min in `step`s. */
export function snapTo(value, domainMin, step) {
  const size = step > 0 ? step : 1;
  return domainMin + Math.round((value - domainMin) / size) * size;
}

/** The position of the band holding `value`, its start inclusive, or -1 before the first. */
export function bandIndexAt(value, rows) {
  return rows.findLastIndex((row) => row.from <= value);
}

const BAND_KEY_DELTAS = Object.freeze({
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
});

/** A marker's next stop for `key`, clamped to `[0, count - 1]`, or null for another key. */
export function markerBandStep(key, position, count, page = 1) {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (!(key in BAND_KEY_DELTAS)) return null;
  const stride = key.startsWith('Page') ? page : 1;
  return Math.min(count - 1, Math.max(0, position + BAND_KEY_DELTAS[key] * stride));
}

/** Where band `index` ends: the next band's start, or the track's end. */
export const bandEnd = (rows, index, trackMax) =>
  index === rows.length - 1 ? trackMax : rows[index + 1].from;

/** Each band at least two steps wide, with its midpoint rounded down to the step. */
export function railSeeds(rows, trackMax, step) {
  return rows.flatMap((band, index) => {
    const width = bandEnd(rows, index, trackMax) - band.from;
    if (width < 2 * step) return [];
    return [{ band, value: band.from + Math.floor(width / 2 / step) * step }];
  });
}

/** A draggable marker's stops: each band's centre under `snap: 'band'`, else each grid value. */
export function markerStops(snap, rows, { domainMin, trackMax, step, formatValue }) {
  if (snap === 'band') {
    return rows.map((band, position) => ({
      from: band.from,
      value: (band.from + bandEnd(rows, position, trackMax)) / 2,
      now: position + 1,
      text: band.name,
      index: band.index,
    }));
  }
  const size = step > 0 ? step : 1;
  const stops = [];
  for (let value = domainMin; value <= trackMax; value += size) {
    const band = rows[Math.max(0, bandIndexAt(value, rows))];
    stops.push({
      from: value - size / 2,
      value,
      now: value,
      text: formatValue(value),
      index: band.index,
    });
  }
  return stops;
}

/** The track value under `clientX` against a scale `{ left, width, min, span }`, or null unmeasured. */
export function valueAtClientX(clientX, scale) {
  if (!scale?.width) return null;
  const ratio = Math.min(1, Math.max(0, (clientX - scale.left) / scale.width));
  return scale.min + ratio * scale.span;
}

/** The authored patch handle `index` writes at `next`, per binding. */
export function boundaryPatch({ binding, rows, index, next, previewDc }) {
  if (binding === 'simple') return { binding: 'simple', dc: next };
  const below = rows[index].index;
  const above = rows[index + 1].index;
  if (binding === 'fixed') {
    return { binding: 'fixed', index: below, end: next - 1, nextIndex: above, start: next };
  }
  if (binding === 'start') return { binding: 'start', index: above, start: next };
  return { binding: 'relative', index: above, dc: next - previewDc };
}

/** Each fixed marker inside the track, and each draggable one with its stops, by `left` percent. */
export function markerLayout(markers, rows, geometry, formatValue) {
  const { domainMin, trackMax } = geometry;
  const percent = (value) =>
    ((value - domainMin) / Math.max(trackMax - domainMin, Number.EPSILON)) * 100;
  const fixed = [];
  const draggable = [];
  for (const marker of rows && Array.isArray(markers) ? markers : []) {
    const value = numeric(marker?.value);
    if (!marker?.draggable) {
      if (value !== null && value >= domainMin && value <= trackMax) {
        fixed.push({ marker, value, left: percent(value) });
      }
      continue;
    }
    const stops = markerStops(marker.snap, rows, { ...geometry, formatValue });
    const at = value === null ? -1 : bandIndexAt(value, stops);
    if (at >= 0) draggable.push({ marker, stops, at, left: percent(stops[at].value) });
  }
  return { fixed, draggable };
}

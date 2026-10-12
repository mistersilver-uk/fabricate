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
export function resolveBands(bands) {
  if (!Array.isArray(bands) || bands.length < 2) return null;
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

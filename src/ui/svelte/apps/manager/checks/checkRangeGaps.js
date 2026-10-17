/**
 * The roll values inside a fixed outcome set's own span that no tier claims, as inclusive
 * `{ from, to }` spans in rising order. Ranges are inclusive on both ends, so adjacency is
 * `next.start === reach + 1`, `reach` being the highest end so far. `excluded` holds the indices
 * already reported invalid or overlapping, which a `start > end` range would otherwise turn into
 * a phantom gap; a non-finite bound drops its range.
 */
export function fixedRangeGaps(outcomes, excluded = new Set()) {
  const spans = (Array.isArray(outcomes) ? outcomes : [])
    .map((outcome, index) => ({ index, start: Number(outcome?.start), end: Number(outcome?.end) }))
    .filter(
      (span) =>
        !excluded.has(span.index) && Number.isFinite(span.start) && Number.isFinite(span.end)
    )
    .sort((a, b) => a.start - b.start);
  const gaps = [];
  let reach = spans[0]?.end;
  for (const span of spans.slice(1)) {
    if (span.start > reach + 1) gaps.push({ from: reach + 1, to: span.start - 1 });
    reach = Math.max(reach, span.end);
  }
  return gaps;
}

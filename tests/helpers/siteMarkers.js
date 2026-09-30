/**
 * Per-site `ratchet-exempt` markers netted against base: a marker excuses a finding only when the
 * finding is new to base, so marking one already there buys no room for another. Pure: the lint
 * gate and the merge-base engine hand it both sides' texts and findings.
 */

/** A line holding nothing but a `ratchet-exempt` marker, in any of the three comment forms. */
export const MARKER_ONLY =
  /^\s*(?:\/\/\s*ratchet-exempt\(.*|\/\*\s*ratchet-exempt\(.*\*\/|<!--\s*ratchet-exempt\(.*-->)\s*$/u;

const MARKER_COMMENT =
  /\/\/\s*ratchet-exempt\(.*$|\/\*\s*ratchet-exempt\(.*?\*\/|<!--\s*ratchet-exempt\(.*?-->/gu;

/** A line's text without its `ratchet-exempt` comments, trimmed: what a finding is matched on. */
export function siteText(line) {
  return String(line ?? '')
    .replaceAll(MARKER_COMMENT, '')
    .trim();
}

/** Beyond this many edits a file's lines are not aligned, and every finding is matched by text. */
const ALIGN_LIMIT = 2000;

function backtrack(trace, start, a, b, kept) {
  let [x, y] = [a.length, b.length];
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const { lo, v } = trace[d];
    const at = (k) => v[k - lo];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevX = at(down ? k + 1 : k - 1);
    const prevY = prevX - (down ? k + 1 : k - 1);
    for (; x > prevX && y > prevY; x -= 1, y -= 1) kept.set(start + y - 1, start + x - 1);
    [x, y] = [prevX, prevY];
  }
  for (; x > 0 && y > 0; x -= 1, y -= 1) kept.set(start + y - 1, start + x - 1);
}

/** Myers' shortest edit script over `a` and `b`, recording each kept pair; false past the limit. */
function alignMiddle(a, b, start, kept) {
  const max = a.length + b.length;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= Math.min(max, ALIGN_LIMIT); d += 1) {
    trace.push({ lo: -d - 1, v: v.slice(offset - d - 1, offset + d + 2) });
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]);
      let x = down ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      for (; x < a.length && y < b.length && a[x] === b[y]; x += 1, y += 1);
      v[offset + k] = x;
      if (x >= a.length && y >= b.length) {
        backtrack(trace, start, a, b, kept);
        return true;
      }
    }
  }
  return false;
}

/**
 * The head line index each base line a shortest edit script keeps maps to, over the lines'
 * {@link siteText}, so adding a marker to a line keeps it; `null` when the files differ too much.
 *
 * @returns {Map<number, number>|null} 0-based head index to 0-based base index.
 */
export function alignLines(baseText, headText) {
  const a = String(baseText).split('\n').map(siteText);
  const b = String(headText).split('\n').map(siteText);
  const kept = new Map();
  let start = 0;
  for (; start < a.length && start < b.length && a[start] === b[start]; start += 1) {
    kept.set(start, start);
  }
  let [endA, endB] = [a.length, b.length];
  for (; endA > start && endB > start && a[endA - 1] === b[endB - 1]; endA -= 1, endB -= 1) {
    kept.set(endB - 1, endA - 1);
  }
  const middle = alignMiddle(a.slice(start, endA), b.slice(start, endB), start, kept);
  return middle ? kept : null;
}

/**
 * One file's findings, their `key`s narrowed to the line pair when both sides keep the line, so
 * a finding on a kept line is matched with the finding at its own base line and a finding on an
 * added line with one on a deleted line. Findings are `{line, key, marker}` with 1-based lines.
 */
export function keyByAlignment(baseText, headText, baseFindings, headFindings) {
  const aligned =
    baseText === undefined || headText === undefined || headFindings.every((f) => !f.marker)
      ? null
      : alignLines(baseText, headText);
  if (!aligned) return { base: baseFindings, head: headFindings };
  const keptBase = new Set(aligned.values());
  const pinned = (finding, line) => ({ ...finding, key: `${finding.key}\u{0}@${line}` });
  return {
    base: baseFindings.map((f) => (keptBase.has(f.line - 1) ? pinned(f, f.line) : f)),
    head: headFindings.map((f) =>
      aligned.has(f.line - 1) ? pinned(f, aligned.get(f.line - 1) + 1) : f
    ),
  };
}

/**
 * Two sides' findings net of their site markers. A reasoned marker excuses a base finding, and a
 * head finding only when it is new: head findings of one `key` are matched, marked ones first,
 * against the base's unexcused findings of that key, so marking one that was already there buys
 * no room. A finding is `{key, amount?, marker}`; {@link keyByAlignment} narrows the keys.
 *
 * @returns {{base: object[], head: object[], exempt: object[], fresh: object[]}} each side's
 *   counted findings, the excused head findings, and those of them no base marker excused.
 */
export function netOfSiteMarkers(base, head) {
  const owed = new Map();
  const carried = new Map();
  const counted = [];
  for (const finding of base) {
    const pool = finding.marker ? carried : owed;
    pool.set(finding.key, (pool.get(finding.key) ?? 0) + (finding.amount ?? 1));
    if (!finding.marker) counted.push(finding);
  }
  const claim = (pool, finding) => {
    const left = pool.get(finding.key) ?? 0;
    if (left > 0) pool.set(finding.key, left - (finding.amount ?? 1));
    return left > 0;
  };
  const outcome = { base: counted, head: [], exempt: [], fresh: [] };
  for (const finding of head) {
    // Unmarked findings claim nothing, so one pass matches the marked ones first.
    if (!finding.marker || claim(owed, finding)) {
      outcome.head.push(finding);
      continue;
    }
    outcome.exempt.push(finding);
    if (!claim(carried, finding)) outcome.fresh.push(finding);
  }
  return outcome;
}

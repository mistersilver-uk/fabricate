/**
 * Parsing and validation helpers for crafting-check roll expressions and the
 * fixed-mode outcome tier ranges built on top of them. Pure functions with no
 * Foundry or DOM dependencies, so the check editor and its unit tests share one
 * source of truth.
 */

/**
 * Extract the dice groups (e.g. `2d6`, `d20`) from a roll expression, in order
 * of appearance. Flat modifiers, operators, and actor references (e.g.
 * `@attributes.con.mod`) are ignored. A bare `dN` counts as a single die.
 * @param {string} expression
 * @returns {{ raw: string, count: number, sides: number }[]}
 */
export function parseDiceGroups(expression) {
  const groups = [];
  const scanner = /(\d*)d(\d+)/gi;
  const text = String(expression ?? '');
  let match;
  while ((match = scanner.exec(text)) !== null) {
    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    if (count >= 1 && sides >= 1) groups.push({ raw: `${count}d${sides}`, count, sides });
  }
  return groups;
}

/**
 * Whether two inclusive integer ranges intersect.
 * @param {{ start: number, end: number }} a
 * @param {{ start: number, end: number }} b
 */
export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return Number(a.start) <= Number(b.end) && Number(b.start) <= Number(a.end);
}

/**
 * Classify a list of fixed-mode outcome ranges: which overlap another range and
 * which are themselves invalid (start greater than end). Invalid ranges are not
 * compared for overlap.
 * @param {{ start: number, end: number }[]} ranges
 * @returns {{ overlapping: Set<number>, invalid: Set<number> }}
 */
export function findRangeConflicts(ranges) {
  const list = Array.isArray(ranges) ? ranges : [];
  const overlapping = new Set();
  const invalid = new Set();

  for (const [index, range] of list.entries()) {
    if (!range || Number(range.start) > Number(range.end)) invalid.add(index);
  }

  for (let i = 0; i < list.length; i += 1) {
    if (invalid.has(i)) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (invalid.has(j)) continue;
      if (rangesOverlap(list[i], list[j])) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }

  return { overlapping, invalid };
}

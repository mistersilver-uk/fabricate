/**
 * Parsing and validation helpers for crafting-check roll expressions and the
 * fixed-mode outcome tier ranges built on top of them. Pure functions with no
 * Foundry or DOM dependencies, so the check editor and its unit tests share one
 * source of truth.
 */

const DICE_TOKEN = /^(\d*)d(\d+)$/i;

/**
 * Extract the dice groups (e.g. `2d6`, `d20`) from a roll expression, in order
 * of appearance. Flat modifiers and operators are ignored. A bare `dN` counts
 * as a single die.
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
 * Compute the inclusive min/max total a roll expression can produce, and whether
 * the whole expression parsed cleanly (no unrecognised characters left over).
 * Supports dice terms and integer constants joined by `+`/`-`.
 * @param {string} expression
 * @returns {{ min: number, max: number, valid: boolean }}
 */
export function expressionRange(expression) {
  const text = String(expression ?? '').trim();
  if (!text) return { min: 0, max: 0, valid: false };

  const scanner = /([+-]?)\s*(\d*d\d+|\d+)/gi;
  let min = 0;
  let max = 0;
  let matched = false;
  let clean = true;
  let cursor = 0;
  let match;
  while ((match = scanner.exec(text)) !== null) {
    if (text.slice(cursor, match.index).replaceAll(/\s+/g, '') !== '') clean = false;
    cursor = scanner.lastIndex;
    const sign = match[1] === '-' ? -1 : 1;
    const dice = DICE_TOKEN.exec(match[2]);
    if (dice) {
      const count = dice[1] === '' ? 1 : Number(dice[1]);
      const sides = Number(dice[2]);
      if (sign > 0) {
        min += count;
        max += count * sides;
      } else {
        min -= count * sides;
        max -= count;
      }
    } else {
      const value = Number(match[2]) * sign;
      min += value;
      max += value;
    }
    matched = true;
  }
  if (text.slice(cursor).replaceAll(/\s+/g, '') !== '') clean = false;
  return { min, max, valid: matched && clean };
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

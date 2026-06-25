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
 *
 * This scans only the `NdS` core, so a modified pool is reported under its
 * STRIPPED key (e.g. `2d20kh1` becomes `2d20`). Use {@link parsePlainDiceGroups}
 * when only plain, crit-eligible terms should match, since that excludes
 * modified pools rather than stripping them.
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
 * Canonical plain `NdS` form for a die term: bare `dN` ≡ `1dN`. Returns null
 * when the term is not a plain `NdS` die core (count and sides both >= 1).
 * @param {string} term A single die term (already isolated, e.g. `2d6`, `d20`).
 * @returns {{ raw: string, count: number, sides: number } | null}
 */
function parsePlainTerm(term) {
  const match = /^(\d*)d(\d+)$/i.exec(String(term ?? '').trim());
  if (!match) return null;
  const count = match[1] === '' ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || sides < 1) return null;
  return { raw: `${count}d${sides}`, count, sides };
}

/**
 * Whether a die term is a PLAIN, unmodified `NdS` die (crit-eligible). Plain
 * means the `NdS` core is the whole term: bare `dN` is treated as `1dN`. A term
 * is crit-INELIGIBLE when anything other than the canonical core is present —
 * i.e. any keep/drop/explode/reroll/min/max/count modifier (e.g. `2d20kh1`,
 * `4d6dl1`, `1d6x`, `2d10r1`, `2d6min2`). Classification is by modifier
 * PRESENCE, not a token blocklist, so future Foundry modifiers cannot slip
 * through: only a string that parses cleanly as `NdS` (optionally bare `dN`) is
 * plain. Bracketed flavor and surrounding operators are handled by
 * {@link parsePlainDiceGroups}, which isolates each term before classifying.
 * @param {string} term
 * @returns {boolean}
 */
export function isPlainDieTerm(term) {
  return parsePlainTerm(term) !== null;
}

/**
 * Extract the PLAIN (crit-eligible), unmodified dice groups from a roll
 * expression, in order of appearance, in canonical `NdS` form (bare `dN` ≡
 * `1dN`). Modified pools (keep/drop/explode/reroll/min/max/count, e.g.
 * `2d20kh1`, `4d6dl1`, `1d6x`, `2d10r1`) are EXCLUDED: their per-die-total range
 * is not the plain `[N, N*S]` sum a crit is matched against, so they are not
 * crit-eligible. Flat modifiers, operators, and actor references are ignored.
 *
 * A term is plain only when its whole token is the `NdS` core (bare `dN` ≡
 * `1dN`). The expression is split on whitespace, operators, parens, and flavor
 * brackets, and each resulting token is classified by {@link parsePlainTerm}.
 * Modifiers attach directly to the core (e.g. `kh`, `dl`, `x`, `r`, `min`,
 * `cs>`), so a modified pool never tokenizes to a bare `NdS` and is excluded.
 * @param {string} expression
 * @returns {{ raw: string, count: number, sides: number }[]}
 */
export function parsePlainDiceGroups(expression) {
  const groups = [];
  // Split on whitespace, operators, parens, and flavor brackets so each token is
  // a single term, then keep only the ones that are a whole plain `NdS` die. A
  // modified pool (`2d20kh1`, `4d6dl1`, …) keeps its modifier in-token, so the
  // anchored parse in parsePlainTerm rejects it — no backtracking scanner needed.
  for (const token of String(expression ?? '').split(/[\s+\-*/%(),[\]]+/)) {
    const plain = token ? parsePlainTerm(token) : null;
    if (plain) groups.push(plain);
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

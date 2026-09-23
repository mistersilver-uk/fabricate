/** Version comparison helpers for the release tooling. */

/**
 * Port of Foundry's `Number.isNumeric` primitive extension — the predicate the comparator's
 * numeric branch turns on. Deliberately NOT `Number.isFinite`: it is the COERCION that makes
 * `' '` (0) and `'0x10'` (16) numeric while `''` is not. Those cases are the specification; they
 * are pinned in tests/semver.test.js and they must not move.
 *
 * The port is BEHAVIOURALLY verbatim, not textually verbatim. Two of upstream's expressions are
 * rewritten here, both under Sonar's reliability gate (`+n === +n` is reported as a bug —
 * S1764/S6679 — and the two identical guard blocks as S1871), and both rewrites are provable
 * identities rather than tidying:
 *
 *   - `[null, ''].includes(n)` ≡ `n === null || n === ''`. `Array#includes` compares with
 *     SameValueZero, which is `===` for `null` and `''`.
 *   - `+n === +n` ≡ `!Number.isNaN(+n)`. NaN is the only value in the language not equal to
 *     itself, so the self-comparison IS a NaN check — that is exactly why upstream carries an
 *     `// eslint-disable no-self-compare` on it. The unary `+` is retained rather than
 *     `Number(n)`: they differ on BigInt (`+1n` throws, `Number(1n)` is `1`), and preserving the
 *     throw costs nothing.
 *
 * The equivalence is PROVEN, not asserted: differential test against the real Foundry function
 * (see the file header for the technique) reports 0 mismatches. Suppressing the finding to keep
 * the upstream bytes would buy fidelity we do not need at the price of a gate we do.
 *
 * @param {unknown} n The value to test.
 * @returns {boolean} Is the value numeric to Foundry?
 */
export function isNumeric(n) {
  if (Array.isArray(n) || n === null || n === '') return false;
  return !Number.isNaN(+n);
}

/**
 * Port of Foundry's `Array#equals`, narrowed to the string-part arrays this file compares (the
 * upstream implementation defers to the deep `foundry.utils.equals`, which reduces to strict
 * equality for strings).
 */
function partsEqual(parts, other) {
  if (!Array.isArray(other)) return false;
  if (parts.length !== other.length) return false;
  return parts.every((value, index) => value === other[index]);
}

/**
 * Return whether a target version (v1) is more advanced than some other reference version (v0),
 * exactly as Foundry VTT would decide it. See the file header before changing anything here.
 */
export function foundryIsNewerVersion(v1, v0) {
  if (v1 === null || v1 === undefined) return false;
  if (v0 === null || v0 === undefined) return true;

  // Handle numeric versions
  if (typeof v1 === 'number' && typeof v0 === 'number') return v1 > v0;

  // Handle string parts
  const v1Parts = String(v1).split('.');
  const v0Parts = String(v0).split('.');

  // Iterate over version parts
  for (const [i, p1] of v1Parts.entries()) {
    const p0 = v0Parts[i];

    // If the prior version doesn't have a part, v1 wins
    if (p0 === undefined) return true;

    // If both parts are numbers, use numeric comparison to avoid cases like "12" < "5".
    if (isNumeric(p0) && isNumeric(p1) && Number(p1) !== Number(p0)) {
      return Number(p1) > Number(p0);
    }

    // Otherwise, compare as strings
    if (p1 !== p0) return p1 > p0;
  }

  // If there are additional parts to v0, it is not newer
  if (v0Parts.length > v1Parts.length) return false;

  // If we have not returned false by now, it's either newer or the same
  return !partsEqual(v1Parts, v0Parts);
}

// Build metadata (`+build.1`) is not accepted.
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?$/i;
const NUMERIC_IDENTIFIER_RE = /^\d+$/;

/** Parse a bare SemVer 2.0.0 version. Build metadata is refused — see the pattern above. */
export function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const match = SEMVER_RE.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/**
 * Compare two prerelease identifiers by SemVer §11 precedence: numeric identifiers compare
 * numerically and always rank below alphanumeric ones, which compare in ascii order.
 */
function compareIdentifiers(a, b) {
  const aNumeric = NUMERIC_IDENTIFIER_RE.test(a);
  const bNumeric = NUMERIC_IDENTIFIER_RE.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Compare two prerelease identifier lists. An empty list is a release, which outranks any
 * prerelease of the same core version; otherwise a shorter list of equal identifiers ranks lower.
 */
function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    const comparison = compareIdentifiers(a[index], b[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

/** Compare two bare versions by SemVer 2.0.0 precedence. */
export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;

  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return Math.sign(left[part] - right[part]);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

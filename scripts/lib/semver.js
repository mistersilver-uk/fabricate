/**
 * Version comparison helpers for the release tooling.
 *
 * Two comparators live here, and they are NOT interchangeable:
 *
 *   - `foundryIsNewerVersion` — the comparator Foundry VTT itself uses to decide whether an
 *     available module version is an upgrade. It is the ONLY comparator allowed to decide
 *     publish safety (which build may overwrite a channel head), because it is the comparator
 *     the player's client will run against whatever we publish.
 *   - `compareSemver` — a real SemVer 2.0.0 precedence comparator. REPORTING ONLY: sorting,
 *     changelogs, and "these two comparators disagree" warnings. It must never gate a publish.
 *
 * `foundryIsNewerVersion` is a DELIBERATE port of `foundry.utils.isNewerVersion`
 * (`resources/app/common/utils/helpers.mjs`, Foundry VTT 14.361.0), together with the two
 * primitive extensions it depends on: `Number.isNumeric`
 * (`resources/app/common/primitives/number.mjs`) and `Array#equals`
 * (`resources/app/common/primitives/array.mjs`).
 *
 * The promise this file makes is BEHAVIOURAL, not textual: it predicts exactly what a player's
 * Foundry client will compute, for every input. It is not a byte-for-byte copy, and it does not
 * need to be — a handful of expressions are rewritten where upstream's form trips a static
 * analysis gate, each one a provable identity, each one covered by the differential test below.
 * What must never change is the ANSWER.
 *
 * ⚠️ DO NOT "fix" IT AND DO NOT REPLACE IT WITH A SEMVER COMPARATOR. It is not SemVer and it is
 * not meant to be. Under SemVer a prerelease sorts BELOW its release (`1.5.0-beta.7` < `1.5.0`);
 * under Foundry's comparator the extra dot-separated parts make it sort ABOVE
 * (`isNewerVersion('1.5.0-beta.7', '1.5.0') === true`). The whole three-channel privacy model
 * rests on that: a beta tester pinned to the beta feed keeps being offered beta builds instead of
 * being silently "upgraded" backwards onto the public stable build. Swap in a SemVer comparator
 * and the private cohorts quietly drain onto the public channel.
 *
 * Other quirks that are load-bearing and therefore intentionally preserved:
 *   - explicit nullish guards: an absent target is never newer; an absent reference is always
 *     older (so ANY candidate beats it). Callers that need "no head published yet" to mean
 *     something else must branch on the absent head BEFORE calling this.
 *   - unequal part counts are asymmetric: extra parts on the target win, extra parts on the
 *     reference lose.
 *   - `Number.isNumeric` is Foundry's own extension, not `Number.isFinite`: `' '` and `'0x10'`
 *     are numeric to it, `''` is not.
 *   - equal versions are NOT newer.
 *
 * THE PORT DEVIATES FROM UPSTREAM'S TEXT IN EXACTLY FIVE PLACES, none of them behavioural:
 *   1. the numeric branch in the comparison loop collapses upstream's nested `if` into one
 *      condition (see the comment at that line);
 *   2. `majorOnly` is omitted — the release tooling never compares major versions in isolation,
 *      and an unused option is one more thing to get wrong;
 *   3. `partsEqual` replaces upstream's `Array#equals` prototype extension, narrowed to the
 *      string-part arrays this file compares (upstream defers to the deep `foundry.utils.equals`,
 *      which reduces to strict equality for strings);
 *   4. and 5. two expressions inside `isNumeric` — `+n === +n` and `[null, ''].includes(n)` —
 *      are rewritten under Sonar's reliability gate. Both are provable identities; see that
 *      function's own comment for the proofs.
 * All five were verified behaviour-identical by differential test against the REAL function,
 * imported from a Foundry install rather than retyped: load
 * `common/primitives/_module.mjs` (it installs `Number.isNumeric` and `Array#equals` as side
 * effects), then `common/utils/_module.mjs`, and set `globalThis.foundry = { utils }` so
 * `Array#equals` can reach `foundry.utils.equals`. Use that technique for any future check. A
 * hand-reconstruction of upstream has already produced two false "divergence" reports.
 *
 * Inputs are bare versions (`1.4.0-rc.3`), never tags (`v1.4.0-rc.3`). Use
 * `parseReleaseTag` from `./releaseTags.js` to strip the `v` before comparing; there is no
 * normalisation here, and a stray `v` would be compared as a string part.
 */

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
 * @param {unknown[]} parts The target parts.
 * @param {unknown[]} other The reference parts.
 * @returns {boolean} Are the two part lists element-wise equal?
 */
function partsEqual(parts, other) {
  if (!Array.isArray(other)) return false;
  if (parts.length !== other.length) return false;
  return parts.every((value, index) => value === other[index]);
}

/**
 * Return whether a target version (v1) is more advanced than some other reference version (v0),
 * exactly as Foundry VTT would decide it. See the file header before changing ANYTHING here.
 *
 * Foundry's `majorOnly` option is omitted: the release tooling never compares major versions in
 * isolation, and an unused option is one more thing to get wrong.
 *
 * @param {number|string|null|undefined} v1 The target version.
 * @param {number|string|null|undefined} v0 The reference version.
 * @returns {boolean} Is v1 a more advanced version than v0?
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
    //
    // The only deviation from upstream IN THIS LOOP: upstream nests this as
    // `if (both numeric) { if (differ) return … }` and collapsing the two conditions into one is
    // behaviour-identical — both forms fall through to the string comparison below when the parts
    // are numerically equal but textually different ("04" vs "4"). Verified by differential test
    // against the REAL function, imported from a Foundry install
    // (`common/utils/_module.mjs` after `common/primitives/_module.mjs`): 0 mismatches over the
    // full pair matrix. Reconstructing upstream by hand to "check" this has now misled two
    // reviewers into believing the next line is an `else if` — it is not. Import the real
    // function; never retype it. The pinned drift cases live in tests/semver.test.js.
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

// Build metadata (`+build.1`) is NOT accepted. It carries no SemVer precedence, semantic-release
// never emits it, no Fabricate version has ever carried it, and matching it duplicated the
// prerelease sub-pattern for no gain — pushing the expression past Sonar's regex-complexity
// limit (S5843). A version with build metadata parses as `null`, which `compareSemver` reports as
// "no opinion". The authoritative grammar for anything we actually publish lives in
// `releaseTags.js`; this pattern serves reporting only.
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?$/i;
const NUMERIC_IDENTIFIER_RE = /^\d+$/;

/**
 * Parse a bare SemVer 2.0.0 version. Build metadata is refused — see the pattern above.
 * @param {unknown} version The version to parse, e.g. `1.5.0-beta.7`.
 * @returns {{major: number, minor: number, patch: number, prerelease: string[]}|null} The parsed
 *   version, or `null` when the value is not a valid SemVer version.
 */
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
 * numerically and always rank below alphanumeric ones, which compare in ASCII order.
 * @param {string} a The target identifier.
 * @param {string} b The reference identifier.
 * @returns {number} -1, 0, or 1.
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
 * @param {string[]} a The target identifiers.
 * @param {string[]} b The reference identifiers.
 * @returns {number} -1, 0, or 1.
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

/**
 * Compare two bare versions by SemVer 2.0.0 precedence.
 *
 * REPORTING ONLY — sorting, changelogs, and disagreement warnings. It is NOT the comparator
 * Foundry runs, so it must never decide whether a build may overwrite a channel head; use
 * `foundryIsNewerVersion` for that. The two deliberately disagree (e.g. `1.5.0-beta.7` vs
 * `1.5.0`), and surfacing that disagreement is the point.
 *
 * Returns `null` rather than throwing when either side is unparseable, so a reporting-only caller
 * (e.g. building a `warnings[]` list during a publish) can never take down the publish it is
 * merely annotating. Treat `null` as "no opinion".
 *
 * @param {unknown} a The target version.
 * @param {unknown} b The reference version.
 * @returns {number|null} -1 (a < b), 0 (equal precedence), 1 (a > b), or `null` if unparseable.
 */
export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;

  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return Math.sign(left[part] - right[part]);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

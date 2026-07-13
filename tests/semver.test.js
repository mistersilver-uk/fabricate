import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareSemver,
  foundryIsNewerVersion,
  isNumeric,
  parseSemver
} from '../scripts/lib/semver.js';

/**
 * `foundryIsNewerVersion` is a port of Foundry's `isNewerVersion`, NOT a SemVer comparator.
 * These cases pin the quirks that make the three-channel release model work; if one of them
 * starts failing, the port has been "fixed" into something Foundry does not do.
 *
 * Each case: [target (v1), reference (v0), expected, why].
 */
const FOUNDRY_CASES = [
  // The load-bearing case: a prerelease has MORE dot-separated parts, so it sorts ABOVE its
  // release. This is what keeps a private beta cohort on the private feed.
  ['1.5.0-beta.7', '1.5.0', true, 'extra parts on the target win (asymmetric part counts)'],
  ['1.5.0', '1.5.0-beta.7', false, 'extra parts on the reference lose (the same asymmetry)'],
  ['1.3.0', '1.3.0-rc.85', false, 'a release does not supersede its own prerelease'],

  // The stale-head case the publish guard must catch: a genuinely newer patch DOES win.
  ['1.5.1', '1.5.0-beta.7', true, 'a newer patch beats a soaking prerelease'],

  // Patch rollover: part 3 is compared as a STRING ("10-beta" < "9-beta"), so this fails closed.
  ['1.4.10-beta.1', '1.4.9-beta.3', false, 'string compare on a suffixed part; 10 loses to 9'],

  // Prerelease ids are compared as strings: beta < rc alphabetically.
  ['1.3.0-beta.1', '1.3.0-rc.85', false, 'beta sorts below rc as a string'],
  ['1.4.0-beta.1', '1.3.0-rc.85', true, 'the numeric minor decides before the suffix is reached'],

  // Plain ordering.
  ['1.4.1', '1.5.0', false, 'older minor'],
  ['1.4.1', '1.6.0-beta.3', false, 'older minor, prerelease reference'],
  ['1.4.0', '1.3.9', true, 'newer minor'],
  ['1.10.0', '1.9.0', true, 'numeric compare, not lexical, on unsuffixed parts'],

  // Equal is never newer.
  ['1.4.0', '1.4.0', false, 'identical versions are not newer'],
  ['1.4.0-rc.3', '1.4.0-rc.3', false, 'identical prereleases are not newer'],

  // DRIFT GUARD for the collapsed `if` in the comparison loop (review of PR for issue 627, round
  // 1: two reviewers independently claimed upstream writes the string comparison as `else if` and
  // that the collapse therefore diverges — it does not; upstream is a plain `if`). These two
  // cases are the ones that WOULD flip if an `else` were ever "restored": they only reach the
  // string comparison BECAUSE the numeric branch fell through on numerically-equal parts. Note
  // the asymmetry — it is real, and both expectations were taken from the real Foundry function,
  // not derived by hand.
  ['1.04.0', '1.4.0', false, 'numerically equal parts fall through to a string compare'],
  ['1.4.0', '1.04.0', true, 'and that string compare is asymmetric'],

  // DRIFT GUARD for `isNumeric`: this case is wrong under a "sane" /^\d+$/ predicate (which would
  // string-compare '0x10' against '9' and answer false) and right only under Foundry's coercing
  // Number.isNumeric, which reads '0x10' as 16. Without it, the internal predicate could be
  // swapped for a plausible-looking one and this whole suite would stay green.
  ['1.4.0x10', '1.4.9', true, 'Foundry coerces the hex part to 16; a /^\\d+$/ predicate would not'],

  // Nullish guards — copied verbatim, and NOT inverted. An absent target is never newer; an
  // absent reference is beaten by anything. Callers must branch on an absent channel head
  // BEFORE calling this, not rely on it to mean "nothing published yet".
  [null, '1.4.0', false, 'an absent target is never newer'],
  [undefined, '1.4.0', false, 'an absent target is never newer'],
  ['1.4.0', null, true, 'anything beats an absent reference'],
  ['1.4.0', undefined, true, 'anything beats an absent reference'],
  [null, null, false, 'the target guard is checked first'],

  // The numeric fast path.
  [2, 1, true, 'numeric versions compare numerically'],
  [1, 2, false, 'numeric versions compare numerically'],

  // Extra parts.
  ['1.4.0.1', '1.4.0', true, 'a longer target wins'],
  ['1.4.0', '1.4.0.1', false, 'a longer reference is not beaten']
];

for (const [v1, v0, expected, why] of FOUNDRY_CASES) {
  test(`foundryIsNewerVersion(${JSON.stringify(v1)}, ${JSON.stringify(v0)}) === ${expected} — ${why}`, () => {
    assert.equal(foundryIsNewerVersion(v1, v0), expected);
  });
}

/**
 * Foundry's `Number.isNumeric` is its own extension, not `Number.isFinite`. Coercion is what
 * makes a whitespace string and a hex literal numeric while an empty string is not — and the
 * comparator branches on exactly this predicate.
 */
const IS_NUMERIC_CASES = [
  ['1', true],
  [1, true],
  [' ', true, 'coerces to 0 — deliberately NOT Number.isFinite behaviour'],
  ['0x10', true, 'coerces to 16'],
  ['', false],
  [null, false],
  [[], false, 'arrays are rejected before coercion (+[] would be 0)'],
  [[1], false],
  ['0-beta', false],
  ['beta', false],
  [Number.NaN, false],
  [undefined, false]
];

for (const [value, expected, why] of IS_NUMERIC_CASES) {
  test(`isNumeric(${JSON.stringify(value)}) === ${expected}${why ? ` — ${why}` : ''}`, () => {
    assert.equal(isNumeric(value), expected);
  });
}

/** SemVer 2.0.0 precedence — reporting only. [a, b, expected]. */
const SEMVER_CASES = [
  ['1.4.0', '1.4.0', 0],
  ['1.4.1', '1.4.0', 1],
  ['1.4.0', '1.5.0', -1],
  ['2.0.0', '1.99.99', 1],
  ['1.10.0', '1.9.0', 1],
  ['1.5.0-beta.7', '1.5.0', -1],
  ['1.5.0', '1.5.0-beta.7', 1],
  ['1.4.10-beta.1', '1.4.9-beta.3', 1],
  ['1.4.0-beta.10', '1.4.0-beta.9', 1],
  ['1.4.0-beta.1', '1.4.0-rc.1', -1],
  ['1.4.0-alpha.1', '1.4.0-beta.1', -1],
  ['1.4.0-beta.1', '1.4.0-beta.1.1', -1],
  // Build metadata is refused outright, not parsed-and-ignored: nothing we publish carries it,
  // and matching it pushed the pattern past Sonar's regex-complexity limit. `null` = no opinion,
  // which is the correct answer from a comparator that only ever annotates a report.
  ['1.4.0+build.1', '1.4.0', null],
  ['1.4.0', '1.4.0+build.1', null],
  ['not-a-version', '1.4.0', null],
  ['1.4.0', 'v1.4.0', null],
  [undefined, '1.4.0', null]
];

for (const [a, b, expected] of SEMVER_CASES) {
  test(`compareSemver(${JSON.stringify(a)}, ${JSON.stringify(b)}) === ${expected}`, () => {
    assert.equal(compareSemver(a, b), expected);
  });
}

/**
 * The two comparators DISAGREE, on purpose. Pin the disagreements: `foundryIsNewerVersion` is the
 * one the player's Foundry client runs, so it is the only one allowed to gate a publish, and
 * `compareSemver` exists to report the divergence — never to decide it.
 */
const DISAGREEMENT_CASES = [
  ['1.5.0-beta.7', '1.5.0'],
  ['1.4.10-beta.1', '1.4.9-beta.3']
];

for (const [v1, v0] of DISAGREEMENT_CASES) {
  test(`compareSemver and foundryIsNewerVersion disagree on (${v1}, ${v0})`, () => {
    const semverSaysNewer = compareSemver(v1, v0) > 0;
    assert.notEqual(foundryIsNewerVersion(v1, v0), semverSaysNewer);
  });
}

test('parseSemver splits prerelease identifiers and refuses build metadata', () => {
  assert.deepEqual(parseSemver('1.5.0-beta.7'), {
    major: 1,
    minor: 5,
    patch: 0,
    prerelease: ['beta', '7']
  });
  assert.deepEqual(parseSemver('1.5.0'), { major: 1, minor: 5, patch: 0, prerelease: [] });
  assert.equal(parseSemver('1.5.0-beta.7+abc123'), null, 'build metadata is not accepted');
  assert.equal(parseSemver('v1.5.0'), null, 'a tag is not a version');
});

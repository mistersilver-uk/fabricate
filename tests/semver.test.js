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
  ['1.4.0+build.1', '1.4.0+build.2', 0],
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

test('parseSemver strips build metadata and splits prerelease identifiers', () => {
  assert.deepEqual(parseSemver('1.5.0-beta.7+abc123'), {
    major: 1,
    minor: 5,
    patch: 0,
    prerelease: ['beta', '7']
  });
  assert.deepEqual(parseSemver('1.5.0'), { major: 1, minor: 5, patch: 0, prerelease: [] });
  assert.equal(parseSemver('v1.5.0'), null, 'a tag is not a version');
});

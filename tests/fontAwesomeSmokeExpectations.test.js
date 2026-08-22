/**
 * What the version smoke's Font Awesome arms claim, and whether each claim can be satisfied by the
 * bundle its arm boots.
 *
 * The probe fixtures below are not invented: each is the exact evidence
 * `scripts/foundry-icon-bundle-assert.mjs` returned when it was run, through a real browser,
 * against the stylesheet and licence extracted from the corresponding Foundry release archive.
 * They are here so the pairing — each arm against BOTH bundles — is checked by `npm test`, which
 * has no Foundry install, rather than only by a smoke run that boots one generation at a time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FONT_AWESOME_SMOKE_EXPECTATIONS,
  MINIMUM_GLYPH_RULES,
  describeFontAwesomeBundle,
  evaluateFontAwesomeBundleObservation,
  fontAwesomeExpectationForArm,
  fontAwesomeExpectationLabel,
} from '../scripts/lib/fontAwesomeSmokeExpectations.js';
import { FOUNDRY_ICON_DEFINITIONS } from '../src/ui/svelte/util/foundryIconCatalogue.js';

/** Measured from Foundry 13.351: no banner in the stylesheet at all, so no edition and no version. */
const FOUNDRY_13_PROBE = Object.freeze({
  edition: null,
  version: null,
  fontFamilies: Object.freeze([
    'Font Awesome 6 Pro',
    'Font Awesome 6 Duotone',
    'Font Awesome 6 Brands',
    'Font Awesome 6 Sharp',
    'Font Awesome 6 Sharp Duotone',
  ]),
  licenseText: 'Font Awesome Pro License\n------------------------\n',
  names: Object.freeze(['cog', 'gear']),
  stylesheetUrl: 'http://foundry/fonts/fontawesome/css/all.min.css',
  licenseUrl: 'http://foundry/fonts/fontawesome/LICENSE.txt',
  glyphRuleCount: 4655,
});

/**
 * Measured from Foundry 14.360. The family list is the trap this arm exists to survive: the
 * Font Awesome 5 aliases sit in the same file as the 7 families, so a first-match read answers 5.
 */
const FOUNDRY_14_PROBE = Object.freeze({
  edition: 'Pro',
  version: '7.2.0',
  fontFamilies: Object.freeze([
    'Font Awesome 7 Pro',
    'Font Awesome 7 Brands',
    'Font Awesome 7 Duotone',
    'Font Awesome 5 Brands',
    'Font Awesome 5 Pro',
    'Font Awesome 5 Duotone',
  ]),
  licenseText: 'Font Awesome Pro License\n------------------------\n',
  names: Object.freeze(['aquarius', 'cog', 'gear', 'pentagon', 'spiral']),
  stylesheetUrl: 'http://foundry/fonts/fontawesome/css/all.min.css',
  licenseUrl: 'http://foundry/fonts/fontawesome/LICENSE.txt',
  glyphRuleCount: 4318,
});

const verdict = (probe, armId) =>
  evaluateFontAwesomeBundleObservation(
    describeFontAwesomeBundle(probe),
    fontAwesomeExpectationForArm(armId)
  );
const passed = (assertions) => assertions.every((assertion) => assertion.passed);
const assertionNamed = (assertions, id) => assertions.find((assertion) => assertion.id === id);

describe('reading a live Font Awesome bundle', () => {
  // Foundry 14.360 declares `Font Awesome 5 Pro` alongside `Font Awesome 7 Pro` for backward
  // compatibility, so the generation has to be taken from the highest major in the file.
  it('takes the generation from the highest major the bundle declares', () => {
    assert.equal(describeFontAwesomeBundle(FOUNDRY_14_PROBE).familyMajor, 7);
    assert.equal(describeFontAwesomeBundle(FOUNDRY_13_PROBE).familyMajor, 6);
  });

  it('reads the edition from the licence when the stylesheet carries no banner', () => {
    const observation = describeFontAwesomeBundle(FOUNDRY_13_PROBE);

    assert.equal(observation.version, null, 'Foundry 13.351 states no patch version anywhere');
    assert.equal(observation.familyEdition, 'Pro');
    assert.equal(observation.licenseEdition, 'Pro');
  });

  it('keeps the licence text out of the observation it reports', () => {
    assert.ok(
      !Object.hasOwn(describeFontAwesomeBundle(FOUNDRY_13_PROBE), 'licenseText'),
      'the summary is written to disk; only the edition read out of the licence is evidence'
    );
  });
});

describe('holding each smoke arm to the evidence its own bundle carries', () => {
  // The whole point of the change: the v13 arm used to assert `version === '6.7.2'` against a
  // bundle that states no version, so `null === '6.7.2'` failed on every run of a healthy install.
  it('passes each arm against the bundle that arm boots', () => {
    assert.ok(passed(verdict(FOUNDRY_13_PROBE, 'v13')), 'v13 arm against Foundry 13.351');
    assert.ok(passed(verdict(FOUNDRY_14_PROBE, 'v14')), 'v14 arm against Foundry 14.360');
  });

  it('fails each arm against the other generation, on release AND on icons', () => {
    for (const [armId, probe, description] of [
      ['v13', FOUNDRY_14_PROBE, 'v13 arm against Foundry 14.360'],
      ['v14', FOUNDRY_13_PROBE, 'v14 arm against Foundry 13.351'],
    ]) {
      const assertions = verdict(probe, armId);

      assert.equal(assertionNamed(assertions, 'fontawesome-release').passed, false, description);
      assert.equal(
        assertionNamed(assertions, 'fontawesome-icon-presence').passed,
        false,
        `${description}: the sentinels must discriminate on their own`
      );
    }
  });

  it('states which evidence it compared when the release assertion fails', () => {
    const detail = assertionNamed(verdict(FOUNDRY_13_PROBE, 'v14'), 'fontawesome-release').detail;

    assert.equal(detail.evidence, FONT_AWESOME_SMOKE_EXPECTATIONS.v14.releaseEvidence);
    assert.deepEqual(detail.expected, { edition: 'Pro', version: '7.2.0', familyMajor: 7 });
    assert.deepEqual(detail.actual, { edition: null, version: null, familyMajor: 6 });
  });

  it('reports missing and unexpectedly-present icons separately', () => {
    const detail = assertionNamed(
      verdict(FOUNDRY_14_PROBE, 'v13'),
      'fontawesome-icon-presence'
    ).detail;

    assert.deepEqual(detail.missing, []);
    assert.deepEqual(detail.unexpectedlyPresent, ['aquarius', 'pentagon', 'spiral']);
  });

  // A bundle nothing could be read out of must not satisfy an arm by silence. Every `absent`
  // sentinel is satisfied by NOT finding a name, so an empty observation clears all of them.
  it('fails both arms on an observation that measured nothing', () => {
    for (const armId of Object.keys(FONT_AWESOME_SMOKE_EXPECTATIONS)) {
      const assertions = evaluateFontAwesomeBundleObservation(
        { edition: null, version: null, names: [], stylesheetUrl: null },
        fontAwesomeExpectationForArm(armId)
      );

      assert.equal(passed(assertions), false, `${armId} must not pass on an unmeasurable bundle`);
      assert.equal(assertionNamed(assertions, 'fontawesome-release').passed, false, armId);
      assert.equal(assertionNamed(assertions, 'fontawesome-icon-presence').passed, false, armId);
      assert.equal(assertionNamed(assertions, 'fontawesome-glyph-rules').passed, false, armId);
    }
  });

  it('fails the floor when a bundle assigns too few glyphs to have been read', () => {
    const thin = { ...FOUNDRY_14_PROBE, glyphRuleCount: MINIMUM_GLYPH_RULES - 1 };

    assert.equal(
      assertionNamed(verdict(thin, 'v14'), 'fontawesome-glyph-rules').passed,
      false,
      'a floor, not a pinned count: both real bundles clear it by more than four times over'
    );
    assert.equal(
      assertionNamed(verdict(FOUNDRY_14_PROBE, 'v14'), 'fontawesome-glyph-rules').detail.observed,
      4318
    );
  });
});

describe('choosing sentinels a smoke arm can honestly assert', () => {
  const catalogueNames = new Set(
    FOUNDRY_ICON_DEFINITIONS.flatMap((definition) => [definition.iconCode, ...definition.aliases])
  );
  const everySentinel = Object.values(FONT_AWESOME_SMOKE_EXPECTATIONS).flatMap((expectation) => [
    ...expectation.present,
    ...expectation.absent,
  ]);

  // An `absent` sentinel passes by NOT being found, so a name Fabricate does not actually offer
  // would let the v13 arm pass against a v14 container and read as a healthy run. This is also
  // what refuses a Pro-only sentinel: the committed catalogue is intersected with Font Awesome
  // Free, so a name that is not in the free release is not in the catalogue either.
  it('names only icons the committed catalogue carries', () => {
    for (const sentinel of everySentinel) {
      assert.ok(
        catalogueNames.has(sentinel),
        `"${sentinel}" is asserted by a smoke arm but is not in Fabricate's icon catalogue`
      );
    }
  });

  it('discriminates between the generations rather than only proving the font loaded', () => {
    const v13 = fontAwesomeExpectationForArm('v13');
    const v14 = fontAwesomeExpectationForArm('v14');

    assert.ok(v13.absent.length > 0, 'the v13 arm needs a name a v14 bundle would supply');
    for (const sentinel of v13.absent) {
      assert.ok(
        v14.present.includes(sentinel),
        `"${sentinel}" is expected absent from v13, so the v14 arm must claim it present`
      );
    }
    for (const control of ['gear', 'cog']) {
      assert.ok(v13.present.includes(control) && v14.present.includes(control));
    }
  });

  it('labels an arm with the facts it will compare and where they come from', () => {
    assert.equal(
      fontAwesomeExpectationLabel(fontAwesomeExpectationForArm('v14')),
      `edition=Pro, version=7.2.0, familyMajor=7 (from ${FONT_AWESOME_SMOKE_EXPECTATIONS.v14.releaseEvidence})`
    );
    assert.ok(
      !fontAwesomeExpectationLabel(fontAwesomeExpectationForArm('v13')).includes('version='),
      'the v13 arm must not print a version it cannot measure'
    );
  });

  it('refuses an unsupported arm instead of silently borrowing another generation', () => {
    assert.throws(() => fontAwesomeExpectationForArm('v15'), /No Font Awesome smoke expectation/);
  });
});

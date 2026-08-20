/**
 * What each Foundry generation's Font Awesome bundle must prove to the version smoke, and the
 * EVIDENCE each arm's claim rests on.
 *
 * The two arms rest on different evidence because the two bundles state different things, not
 * because one is trusted less. Foundry 14.360 serves the stylesheet with its
 * `/*! Font Awesome Pro 7.2.0 *\/` banner intact, so that arm asserts the edition and the exact
 * patch version. Foundry 13.351 serves a stylesheet containing NO comment at all — its build
 * strips them — so there is no banner and no patch version anywhere in what a client loads, and
 * that arm asserts what the bundle does state: the generation and edition named by its
 * highest-major `font-family` literal, corroborated by the Pro `LICENSE.txt` Foundry ships beside
 * the stylesheet.
 *
 * This replaces a v13 arm that asserted `version === '6.7.2'` against a bundle whose version is
 * unreadable. The observation was always `null`, `null === '6.7.2'` is unconditionally false, and
 * so `npm run test:foundry -- --arm=v13 --check=version` could not pass however healthy the
 * install: an assertion that cannot be satisfied proves nothing about the run, it only reports
 * itself.
 *
 * THE SENTINELS ARE NOT DECORATION. An arm that only checks "Font Awesome loaded" passes against
 * the wrong container, so each arm names icons whose presence discriminates between the two
 * generations. Every sentinel must satisfy three constraints at once, and the obvious candidate
 * satisfies only two:
 *
 * - it must genuinely differ between the bundles. `candle-holder` does not — both ship it.
 * - it must be a name Fabricate's committed catalogue carries, which is what
 *   `tests/fontAwesomeSmokeExpectations.test.js` guards. An `absent` sentinel passes by NOT being
 *   found, so a typo would silently let the v13 arm pass against a v14 container.
 * - it must be in Font Awesome FREE. Fabricate's catalogue is intersected with the free release
 *   under the maintainer's licensing ruling, so asserting a Pro-only name would assert exactly
 *   what that ruling forbids, and the catalogue guard above would fail on both arms. This is why
 *   `caret-large-left` — verified absent from Font Awesome Free 7.3.1's own stylesheet — is not
 *   used here despite being a clean 6-versus-7 discriminator.
 *
 * `aquarius`, `pentagon` and `spiral` satisfy all three: each is classic (not a brand), present in
 * Free 7.3.1, present in Foundry 14.360 and absent from Foundry 13.351 under any spelling. They
 * are three of the 23 names that qualify, and three unrelated drawings rather than one, so a
 * single upstream rename cannot take the discriminator out. `gear` and `cog` are the both-arms
 * control: they prove the probe can find a name at all, which is what stops an `absent` sentinel
 * from passing because the scrape returned nothing.
 */

import { fontAwesomeLicenseEdition, highestFontAwesomeFamilyRelease } from './fontAwesomeBundle.js';

/**
 * The floor a live bundle's glyph-rule count must clear.
 *
 * A NON-VACUITY floor rather than a pinned count, because the count legitimately differs by arm
 * and by release: the probe reads 4,655 rules from Foundry 13.351 and 4,318 from Foundry 14.360.
 * What it is guarding against is a probe that parsed nothing — a stylesheet served as an error
 * page, a splitter broken by a future minifier change, a bundle replaced by a stub — each of which
 * reports zero names found and would otherwise satisfy every `absent` sentinel by silence.
 *
 * It sits well under Font Awesome Free 7.3.1's 1,992 rules deliberately: which EDITION is loaded
 * is the release assertion's question, and a floor tight enough to answer it too would fail for a
 * reason it could not explain.
 */
export const MINIMUM_GLYPH_RULES = 1000;

export const FONT_AWESOME_SMOKE_EXPECTATIONS = Object.freeze({
  v13: Object.freeze({
    releaseEvidence:
      'the highest-major font-family literal and the bundled LICENSE.txt — 13.351 serves no banner',
    release: Object.freeze({ familyEdition: 'Pro', familyMajor: 6, licenseEdition: 'Pro' }),
    present: Object.freeze(['gear', 'cog']),
    absent: Object.freeze(['aquarius', 'pentagon', 'spiral']),
  }),
  v14: Object.freeze({
    releaseEvidence: "the stylesheet's release banner, cross-checked against the family literals",
    release: Object.freeze({ edition: 'Pro', version: '7.2.0', familyMajor: 7 }),
    present: Object.freeze(['gear', 'cog', 'aquarius', 'pentagon', 'spiral']),
    absent: Object.freeze([]),
  }),
});

/**
 * Resolve one smoke arm's Font Awesome expectation.
 *
 * @param {string} armId
 * @returns {(typeof FONT_AWESOME_SMOKE_EXPECTATIONS)['v14']}
 */
export function fontAwesomeExpectationForArm(armId) {
  const expectation = FONT_AWESOME_SMOKE_EXPECTATIONS[armId];
  if (!expectation) {
    throw new Error(
      `No Font Awesome smoke expectation for "${armId}"; expected one of ${Object.keys(FONT_AWESOME_SMOKE_EXPECTATIONS).join(', ')}`
    );
  }
  return expectation;
}

/**
 * The release claim an arm makes, spelled out as the facts it will compare and where they come
 * from.
 *
 * Derived from the facts rather than authored beside them: a hand-written label is a second
 * statement of the same claim, and the two drift the moment one is edited.
 *
 * @param {ReturnType<typeof fontAwesomeExpectationForArm>} expectation
 * @returns {string}
 */
export function fontAwesomeExpectationLabel(expectation) {
  const facts = Object.entries(expectation.release)
    .map(([fact, value]) => `${fact}=${value}`)
    .join(', ');
  return `${facts} (from ${expectation.releaseEvidence})`;
}

/**
 * Turn the raw evidence the browser probe collected into the flat observation the assertions read.
 *
 * The probe extracts, this interprets, and the split is deliberate: the probe is serialised into
 * the page by Playwright and can therefore reference nothing outside its own body, so anything it
 * decides for itself is code no unit test can reach. It hands back the family literals it found
 * and the licence text it fetched; the highest-major rule and the licence reading are applied here
 * against the same functions the catalogue generator uses.
 *
 * @param {{
 *   edition?: string|null,
 *   version?: string|null,
 *   fontFamilies?: ReadonlyArray<string>,
 *   licenseText?: string|null,
 *   names?: ReadonlyArray<string>,
 *   stylesheetUrl?: string|null,
 *   licenseUrl?: string|null,
 *   glyphRuleCount?: number|null
 * }} probe
 */
export function describeFontAwesomeBundle(probe) {
  const family = highestFontAwesomeFamilyRelease(probe.fontFamilies ?? []);
  return {
    edition: probe.edition ?? null,
    version: probe.version ?? null,
    familyEdition: family?.edition ?? null,
    familyMajor: family?.major ?? null,
    licenseEdition: fontAwesomeLicenseEdition(probe.licenseText),
    names: [...(probe.names ?? [])],
    stylesheetUrl: probe.stylesheetUrl ?? null,
    licenseUrl: probe.licenseUrl ?? null,
    glyphRuleCount: probe.glyphRuleCount ?? null,
  };
}

/**
 * Compare an arm's release facts with what the bundle was observed to say.
 *
 * Only the facts the arm declared are compared, so each arm is held to the evidence its own bundle
 * carries and to nothing it cannot state. A fact the observation does not carry reads as `null`
 * and fails, which is what makes an unmeasurable bundle fail rather than pass quietly.
 */
function releaseAssertion(observation, expectation) {
  const facts = Object.keys(expectation.release);
  const actual = Object.fromEntries(facts.map((fact) => [fact, observation[fact] ?? null]));
  return {
    id: 'fontawesome-release',
    passed: facts.every((fact) => actual[fact] === expectation.release[fact]),
    detail: {
      evidence: expectation.releaseEvidence,
      expected: expectation.release,
      actual,
      stylesheetUrl: observation.stylesheetUrl ?? null,
      licenseUrl: observation.licenseUrl ?? null,
    },
  };
}

function iconPresenceAssertion(observation, expectation) {
  const names = new Set(observation.names);
  const missing = expectation.present.filter((name) => !names.has(name));
  const unexpectedlyPresent = expectation.absent.filter((name) => names.has(name));
  return {
    id: 'fontawesome-icon-presence',
    passed: missing.length === 0 && unexpectedlyPresent.length === 0,
    detail: {
      expectedPresent: expectation.present,
      expectedAbsent: expectation.absent,
      missing,
      unexpectedlyPresent,
    },
  };
}

function glyphRuleFloorAssertion(observation) {
  const observed = observation.glyphRuleCount ?? null;
  return {
    id: 'fontawesome-glyph-rules',
    passed: Number.isFinite(observed) && observed >= MINIMUM_GLYPH_RULES,
    detail: { observed, floor: MINIMUM_GLYPH_RULES },
  };
}

/**
 * Turn a measured bundle observation into explicit assertions.
 *
 * @param {ReturnType<typeof describeFontAwesomeBundle>} observation
 * @param {ReturnType<typeof fontAwesomeExpectationForArm>} expectation
 * @returns {Array<{id:string,passed:boolean,detail:unknown}>}
 */
export function evaluateFontAwesomeBundleObservation(observation, expectation) {
  return [
    releaseAssertion(observation, expectation),
    iconPresenceAssertion(observation, expectation),
    glyphRuleFloorAssertion(observation),
  ];
}

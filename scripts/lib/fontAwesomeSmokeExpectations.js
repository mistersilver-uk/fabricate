/**
 * What each Foundry generation's Font Awesome bundle must prove to the version smoke, and the
 * evidence each arm's claim rests on.
 */

import { fontAwesomeLicenseEdition, highestFontAwesomeFamilyRelease } from './fontAwesomeBundle.js';

/** The floor a live bundle's glyph-rule count must clear. */
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

/** Resolve one smoke arm's Font Awesome expectation. */
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
 */
export function fontAwesomeExpectationLabel(expectation) {
  const facts = Object.entries(expectation.release)
    .map(([fact, value]) => `${fact}=${value}`)
    .join(', ');
  return `${facts} (from ${expectation.releaseEvidence})`;
}

/**
 * Turn the raw evidence the browser probe collected into the flat observation the assertions read.
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

/** Compare an arm's release facts with what the bundle was observed to say. */
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

/** Turn a measured bundle observation into explicit assertions. */
export function evaluateFontAwesomeBundleObservation(observation, expectation) {
  return [
    releaseAssertion(observation, expectation),
    iconPresenceAssertion(observation, expectation),
    glyphRuleFloorAssertion(observation),
  ];
}

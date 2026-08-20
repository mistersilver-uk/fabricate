/**
 * Font Awesome bundle expectations for the two Foundry generations Fabricate supports.
 *
 * The release versions are Foundry's bundle versions, not package-manager dependencies. Foundry's
 * V13 release notes pin 6.7.2 but do not state whether that distribution is Free or Pro, so the V13
 * smoke deliberately discovers and reports its edition rather than asserting one we have not
 * established. V14 is measured by #1274 as Pro 7.2.0 and pins both fields.
 *
 * The presence/absence sentinel is deliberately a glyph whose version boundary is useful to prove:
 * `gear` exists in both supported releases, while `caret-large-left` is part of the v7 catalogue
 * and absent from v6.7.2. A smoke arm that accidentally boots the wrong Foundry therefore cannot
 * pass merely because Font Awesome loaded at all.
 *
 * Font Awesome's public release API exposes version-scoped icon lists, and its v7 upgrade guidance
 * explicitly preserves renamed v6 names as aliases. The runtime picker still measures the loaded
 * stylesheet for its complete v13 list; these few names are NON-VACUITY controls for that mechanism,
 * not a hand-maintained substitute for the full version delta.
 */
export const FONT_AWESOME_SMOKE_EXPECTATIONS = Object.freeze({
  v13: Object.freeze({
    edition: null,
    version: '6.7.2',
    present: Object.freeze(['gear', 'cog']),
    absent: Object.freeze(['caret-large-left']),
  }),
  v14: Object.freeze({
    edition: 'Pro',
    version: '7.2.0',
    present: Object.freeze(['gear', 'cog', 'caret-large-left']),
    absent: Object.freeze([]),
  }),
});

/**
 * Resolve one smoke arm's Font Awesome expectation.
 *
 * @param {string} armId
 * @returns {{edition:string|null,version:string,present:ReadonlyArray<string>,absent:ReadonlyArray<string>}}
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

/** Human-readable release expectation, without inventing an unproven edition. */
export function fontAwesomeExpectationLabel(expectation) {
  return expectation.edition
    ? `${expectation.edition} ${expectation.version}`
    : `Font Awesome ${expectation.version}`;
}

/**
 * Turn a measured bundle observation into explicit assertions.
 *
 * @param {{edition:string|null,version:string|null,names:ReadonlyArray<string>,stylesheetUrl:string|null}} observation
 * @param {ReturnType<typeof fontAwesomeExpectationForArm>} expectation
 * @returns {Array<{id:string,passed:boolean,detail:unknown}>}
 */
export function evaluateFontAwesomeBundleObservation(observation, expectation) {
  const names = new Set(observation.names);
  const missing = expectation.present.filter((name) => !names.has(name));
  const unexpectedlyPresent = expectation.absent.filter((name) => names.has(name));
  const editionMatches = expectation.edition === null || observation.edition === expectation.edition;

  return [
    {
      id: 'fontawesome-release',
      passed: editionMatches && observation.version === expectation.version,
      detail: {
        expected: fontAwesomeExpectationLabel(expectation),
        actual:
          observation.edition && observation.version
            ? `${observation.edition} ${observation.version}`
            : null,
        stylesheetUrl: observation.stylesheetUrl,
      },
    },
    {
      id: 'fontawesome-icon-presence',
      passed: missing.length === 0 && unexpectedlyPresent.length === 0,
      detail: {
        expectedPresent: expectation.present,
        expectedAbsent: expectation.absent,
        missing,
        unexpectedlyPresent,
      },
    },
  ];
}

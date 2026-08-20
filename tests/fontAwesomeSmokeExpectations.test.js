import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FONT_AWESOME_SMOKE_EXPECTATIONS,
  evaluateFontAwesomeBundleObservation,
  fontAwesomeExpectationForArm,
  fontAwesomeExpectationLabel,
} from '../scripts/lib/fontAwesomeSmokeExpectations.js';

describe('Font Awesome smoke expectations', () => {
  it('pins the bundle version expected for both supported Foundry generations', () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(FONT_AWESOME_SMOKE_EXPECTATIONS).map(([arm, expectation]) => [
          arm,
          fontAwesomeExpectationLabel(expectation),
        ])
      ),
      {
        v13: 'Font Awesome 6.7.2',
        v14: 'Pro 7.2.0',
      }
    );
    assert.equal(
      FONT_AWESOME_SMOKE_EXPECTATIONS.v13.edition,
      null,
      'Foundry pins the V13 version in public release notes; the live smoke should discover its edition'
    );
  });

  it('uses a version-discriminating sentinel rather than only icons common to both bundles', () => {
    const v13 = fontAwesomeExpectationForArm('v13');
    const v14 = fontAwesomeExpectationForArm('v14');

    assert.ok(v13.present.includes('gear'));
    assert.ok(v14.present.includes('gear'));
    assert.ok(v13.absent.includes('caret-large-left'));
    assert.ok(v14.present.includes('caret-large-left'));
  });

  it('fails the release assertion when the wrong Foundry bundle is served', () => {
    const assertions = evaluateFontAwesomeBundleObservation(
      {
        edition: 'Pro',
        version: '7.2.0',
        names: ['gear', 'cog', 'caret-large-left'],
        stylesheetUrl: 'http://foundry/fonts/fontawesome/css/all.min.css',
      },
      fontAwesomeExpectationForArm('v13')
    );

    assert.equal(assertions.find((assertion) => assertion.id === 'fontawesome-release').passed, false);
    assert.equal(
      assertions.find((assertion) => assertion.id === 'fontawesome-icon-presence').passed,
      false,
      'the v14-only sentinel must also make a v14 bundle fail the v13 arm'
    );
  });

  it('accepts either V13 edition while still pinning its version and icon boundary', () => {
    for (const edition of ['Free', 'Pro']) {
      const assertions = evaluateFontAwesomeBundleObservation(
        {
          edition,
          version: '6.7.2',
          names: ['gear', 'cog'],
          stylesheetUrl: 'http://foundry/fonts/fontawesome/css/all.min.css',
        },
        fontAwesomeExpectationForArm('v13')
      );
      assert.ok(assertions.every((assertion) => assertion.passed), `${edition} V13 should pass`);
    }
  });

  it('reports missing and unexpectedly-present icons separately', () => {
    const assertions = evaluateFontAwesomeBundleObservation(
      {
        edition: 'Pro',
        version: '6.7.2',
        names: ['caret-large-left'],
        stylesheetUrl: 'http://foundry/fonts/fontawesome/css/all.min.css',
      },
      fontAwesomeExpectationForArm('v13')
    );
    const presence = assertions.find((assertion) => assertion.id === 'fontawesome-icon-presence');

    assert.equal(presence.passed, false);
    assert.deepEqual(presence.detail.missing, ['gear', 'cog']);
    assert.deepEqual(presence.detail.unexpectedlyPresent, ['caret-large-left']);
  });

  it('refuses an unsupported arm instead of silently borrowing another generation', () => {
    assert.throws(() => fontAwesomeExpectationForArm('v15'), /No Font Awesome smoke expectation/);
  });
});

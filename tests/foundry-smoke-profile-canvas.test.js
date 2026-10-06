/**
 * Which smoke profiles turn the GM page's canvas off (issue 2192): only `rc`, the one walk that
 * never views a scene, whose idle canvas ticker otherwise starves the GM page of frames on CI.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSmokeProfileFlags } from '../scripts/foundry-smoke/profile.mjs';

const canvasOff = (profile) =>
  resolveSmokeProfileFlags([], { FOUNDRY_SMOKE_PROFILE: profile }).GM_CANVAS_DISABLED;

describe('the GM canvas switch', () => {
  it('turns the canvas off for the rc walk, whether named rc or ci', () => {
    assert.equal(canvasOff('rc'), true);
    assert.equal(canvasOff('ci'), true);
  });

  it('keeps the canvas for every profile that walks a scene or measures one', () => {
    for (const profile of ['full', 'screenshots', 'perf']) assert.equal(canvasOff(profile), false);
    assert.equal(resolveSmokeProfileFlags([], {}).GM_CANVAS_DISABLED, false, 'the default is full');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHotfixMinimumNotRaised,
  evaluateRegistryLeadTarget,
} from '../scripts/lib/promoteGuards.js';

// ── assertHotfixMinimumNotRaised (Gap 1, §Hotfix isolation) ────────────────────────────────────

test('a release-line promotion is unconstrained — it MAY raise the minimum', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: false,
    version: '1.6.0',
    promotedMinimum: '13',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
});

test('a hotfix that keeps the minimum unchanged passes', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
  assert.match(verdict.reason, /does not raise/);
});

test('a hotfix that lowers the minimum passes (it strands no one)', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '11',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
});

test('a hotfix that raises the minimum by a whole generation is refused, naming both minimums', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '13',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /raises the declared minimum/);
  assert.match(verdict.error, /from 12/);
  assert.match(verdict.error, /to 13/);
  assert.match(verdict.error, /Hotfix isolation/);
});

test('a hotfix that raises the minimum to a higher dotted core version is refused', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12.331',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /raises the declared minimum/);
});

test('the comparison is Foundry-numeric, not textual — "12" is newer than "5"', () => {
  // A textual comparison would order "12" below "5"; Foundry's comparator (and this guard) does not.
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: '5',
  });
  assert.equal(verdict.ok, false);
});

test('a hotfix whose artefact declares no minimum fails closed (unverifiable)', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /no compatibility.minimum/);
});

test('a hotfix whose current public release declares no readable minimum fails closed', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: undefined,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /no readable compatibility.minimum/);
});

// ── evaluateRegistryLeadTarget (Gap 2, §Registry lead prohibition) ─────────────────────────────

test('a beta head Foundry considers older than the promoted version is refused (backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: '1.4.0-beta.3',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'backwards');
  assert.match(verdict.reason, /Advance beta first/);
});

test('an early-access head Foundry considers older than the promoted version is refused (backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: '1.4.x',
    label: 'channel-early-access',
    head: '1.4.0',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'backwards');
  assert.match(verdict.reason, /Advance early-access first/);
});

test('a head Foundry considers newer than the promoted version is safe (the normal beta lead)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: '1.5.0-beta.1', // Foundry sorts a prerelease ABOVE its own GA — the fail-safe.
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
});

test('a head equal to the promoted version is safe (equal is not backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: 'early-access',
    label: 'channel-early-access',
    head: '1.5.0',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
});

test('an ABSENT head on a cohort-retaining NON-SOURCE target is refused (the 404 half)', () => {
  // Release-line promotion (source early-access): beta is a cohort-retaining non-source channel.
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'tester-closed-beta-2026',
    head: null,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'absent');
  assert.match(verdict.reason, /NO published head/);
  assert.match(verdict.reason, /404/);
});

test('an ABSENT head on the SOURCE channel is exempt — step 2 already covers it', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: 'early-access',
    label: 'channel-early-access',
    head: null,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
  assert.match(verdict.reason, /source channel/);
});

test('on a hotfix promotion BOTH beta and early-access absent heads are refused (neither is source)', () => {
  for (const channel of ['beta', 'early-access']) {
    const verdict = evaluateRegistryLeadTarget({
      channel,
      sourceChannel: '1.4.x',
      label: `channel-${channel}`,
      head: null,
      version: '1.4.1',
    });
    assert.equal(verdict.decision, 'refuse', `${channel} absent head must refuse on a hotfix`);
    assert.equal(verdict.kind, 'absent');
  }
});

test('an undefined head is treated as absent, not compared', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: undefined,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'absent');
});

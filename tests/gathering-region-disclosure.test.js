import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRegionDisclosure, buildTravelGuidance, evaluateLocationAvailability } from '../src/systems/gatheringLocation.js';

const secretRegion = { id: 'r-secret', name: 'Hidden Vale', secret: true };
const openRegion = { id: 'r-open', name: 'Verdant Expanse', secret: false };

test('secret undiscovered region for a non-GM ⇒ id:null + placeholder, never the secret name/id', () => {
  const disclosure = buildRegionDisclosure(secretRegion, { isGM: false, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, null);
  assert.equal(disclosure.placeholder, true);
  assert.equal(disclosure.secret, true);
  assert.equal(disclosure.label, undefined);
  assert.ok(disclosure.labelKey);
  assert.equal(JSON.stringify(disclosure).includes('Hidden Vale'), false);
  assert.equal(JSON.stringify(disclosure).includes('r-secret'), false);
});

test('GM sees the full secret region', () => {
  const disclosure = buildRegionDisclosure(secretRegion, { isGM: true, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('discovered secret region discloses its name to a non-GM', () => {
  const disclosure = buildRegionDisclosure(secretRegion, { isGM: false, discovered: true, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('alwaysVisible reveal mode discloses a secret region without discovery', () => {
  const disclosure = buildRegionDisclosure(secretRegion, { isGM: false, discovered: false, revealMode: 'alwaysVisible' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('non-secret region always discloses', () => {
  const disclosure = buildRegionDisclosure(openRegion, { isGM: false, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-open');
  assert.equal(disclosure.label, 'Verdant Expanse');
});

test('guidance state noCurrentRegion carries set-region guidance and no destination leakage', () => {
  const env = { includedRegionIds: ['r-secret'] };
  const availability = evaluateLocationAvailability(env, { resolved: false, regions: [] });
  const guidance = buildTravelGuidance({
    environment: env,
    regionsById: new Map([[secretRegion.id, secretRegion]]),
    currentRegionContext: { resolved: false, regions: [] },
    availability,
    discoveredRegionIds: new Set(),
    isGM: false
  });
  assert.equal(guidance.state, 'noCurrentRegion');
  assert.deepEqual(guidance.knownDestinations, []);
  assert.equal(guidance.undiscoveredCount, 0);
});

test('guidance distinguishes exclusion from travel and counts undiscovered secret destinations', () => {
  const env = { includedRegionIds: ['r-open', 'r-secret'], excludedRegionIds: ['r-here'] };
  const context = { resolved: true, regions: [{ id: 'r-here' }] };
  const availability = evaluateLocationAvailability(env, context);
  const guidance = buildTravelGuidance({
    environment: env,
    regionsById: new Map([[openRegion.id, openRegion], [secretRegion.id, secretRegion]]),
    currentRegionContext: context,
    availability,
    discoveredRegionIds: new Set(),
    isGM: false
  });
  assert.equal(guidance.state, 'excluded');
  assert.equal(guidance.knownDestinations.length, 1);
  assert.equal(guidance.knownDestinations[0].label, 'Verdant Expanse');
  assert.equal(guidance.undiscoveredCount, 1);
  assert.equal(JSON.stringify(guidance).includes('Hidden Vale'), false);
});

test('guidance lists known destination names when not excluded', () => {
  const env = { includedRegionIds: ['r-open'] };
  const context = { resolved: true, regions: [{ id: 'r-other' }] };
  const availability = evaluateLocationAvailability(env, context);
  const guidance = buildTravelGuidance({
    environment: env,
    regionsById: new Map([[openRegion.id, openRegion]]),
    currentRegionContext: context,
    availability,
    discoveredRegionIds: new Set(),
    isGM: false
  });
  assert.equal(guidance.state, 'travel');
  assert.equal(guidance.knownDestinations[0].label, 'Verdant Expanse');
});

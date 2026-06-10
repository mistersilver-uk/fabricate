import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocationSummaryForViewer,
  buildRegionDisclosure,
  buildTravelGuidance,
  evaluateLocationAvailability
} from '../src/systems/gatheringLocation.js';

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

// buildLocationSummaryForViewer is the pure core of Fabricate.getGatheringLocationForActor:
// it applies the same disclosure policy and GM gating that main.js used to inline.
const summaryContext = {
  resolved: true,
  source: 'manualOverride',
  regions: [secretRegion, openRegion],
  regionIds: ['r-secret', 'r-open'],
  staleRegionIds: ['r-stale']
};

test('viewer summary for a non-GM redacts secret undiscovered regions and drops raw ids', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: false,
    revealMode: 'manual',
    discoveredRegionIds: new Set()
  });
  assert.equal(summary.resolved, true);
  assert.equal(summary.source, 'manualOverride');
  // Non-GM gets EMPTY raw id arrays — those carry real region ids.
  assert.deepEqual(summary.regionIds, []);
  assert.deepEqual(summary.staleRegionIds, []);
  // Regions come back as disclosure objects; the secret one is a placeholder.
  const secret = summary.regions.find(region => region.placeholder === true);
  assert.ok(secret, 'secret undiscovered region must surface as a placeholder');
  assert.equal(secret.id, null);
  assert.equal(secret.label, undefined);
  const open = summary.regions.find(region => region.id === 'r-open');
  assert.equal(open.label, 'Verdant Expanse');
  // The secret name/id never appear anywhere in the serialized summary.
  assert.equal(JSON.stringify(summary).includes('Hidden Vale'), false);
  assert.equal(JSON.stringify(summary).includes('r-secret'), false);
  assert.equal(JSON.stringify(summary).includes('r-stale'), false);
});

test('viewer summary for a non-GM discloses a discovered secret region but still hides raw ids', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: false,
    revealMode: 'manual',
    discoveredRegionIds: new Set(['r-secret'])
  });
  const secret = summary.regions.find(region => region.secret === true);
  assert.equal(secret.id, 'r-secret');
  assert.equal(secret.label, 'Hidden Vale');
  assert.equal(secret.placeholder, false);
  // Discovery reveals the disclosure label, but raw id arrays stay GM-only.
  assert.deepEqual(summary.regionIds, []);
  assert.deepEqual(summary.staleRegionIds, []);
});

test('viewer summary for a GM exposes full ids and never redacts', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: true,
    revealMode: 'manual',
    discoveredRegionIds: new Set()
  });
  assert.deepEqual(summary.regionIds, ['r-secret', 'r-open']);
  assert.deepEqual(summary.staleRegionIds, ['r-stale']);
  assert.equal(summary.regions.every(region => region.placeholder === false), true);
  const secret = summary.regions.find(region => region.id === 'r-secret');
  assert.equal(secret.label, 'Hidden Vale');
});

test('viewer summary tolerates an empty/unresolved context', () => {
  const summary = buildLocationSummaryForViewer({ context: {}, isGM: false });
  assert.equal(summary.resolved, false);
  assert.equal(summary.source, 'unresolved');
  assert.deepEqual(summary.regions, []);
  assert.deepEqual(summary.regionIds, []);
  assert.deepEqual(summary.staleRegionIds, []);
});

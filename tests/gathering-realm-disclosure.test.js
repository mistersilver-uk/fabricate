import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocationSummaryForViewer,
  buildRealmDisclosure,
  buildTravelGuidance,
  evaluateLocationAvailability
} from '../src/systems/gatheringLocation.js';

const secretRealm = { id: 'r-secret', name: 'Hidden Vale', secret: true };
const openRealm = { id: 'r-open', name: 'Verdant Expanse', secret: false };

test('secret undiscovered realm for a non-GM ⇒ id:null + placeholder, never the secret name/id', () => {
  const disclosure = buildRealmDisclosure(secretRealm, { isGM: false, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, null);
  assert.equal(disclosure.placeholder, true);
  assert.equal(disclosure.secret, true);
  assert.equal(disclosure.label, undefined);
  assert.ok(disclosure.labelKey);
  assert.equal(JSON.stringify(disclosure).includes('Hidden Vale'), false);
  assert.equal(JSON.stringify(disclosure).includes('r-secret'), false);
});

test('GM sees the full secret realm', () => {
  const disclosure = buildRealmDisclosure(secretRealm, { isGM: true, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('discovered secret realm discloses its name to a non-GM', () => {
  const disclosure = buildRealmDisclosure(secretRealm, { isGM: false, discovered: true, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('alwaysVisible reveal mode discloses a secret realm without discovery', () => {
  const disclosure = buildRealmDisclosure(secretRealm, { isGM: false, discovered: false, revealMode: 'alwaysVisible' });
  assert.equal(disclosure.id, 'r-secret');
  assert.equal(disclosure.label, 'Hidden Vale');
  assert.equal(disclosure.placeholder, false);
});

test('non-secret realm always discloses', () => {
  const disclosure = buildRealmDisclosure(openRealm, { isGM: false, discovered: false, revealMode: 'manual' });
  assert.equal(disclosure.id, 'r-open');
  assert.equal(disclosure.label, 'Verdant Expanse');
});

test('guidance state noCurrentRealm carries set-realm guidance and no destination leakage', () => {
  const env = { includedRealmIds: ['r-secret'] };
  const availability = evaluateLocationAvailability(env, { resolved: false, realms: [] });
  const guidance = buildTravelGuidance({
    environment: env,
    realmsById: new Map([[secretRealm.id, secretRealm]]),
    currentRealmContext: { resolved: false, realms: [] },
    availability,
    discoveredRealmIds: new Set(),
    isGM: false
  });
  assert.equal(guidance.state, 'noCurrentRealm');
  assert.deepEqual(guidance.knownDestinations, []);
  assert.equal(guidance.undiscoveredCount, 0);
});

test('guidance distinguishes exclusion from travel and counts undiscovered secret destinations', () => {
  const env = { includedRealmIds: ['r-open', 'r-secret'], excludedRealmIds: ['r-here'] };
  const context = { resolved: true, realms: [{ id: 'r-here' }] };
  const availability = evaluateLocationAvailability(env, context);
  const guidance = buildTravelGuidance({
    environment: env,
    realmsById: new Map([[openRealm.id, openRealm], [secretRealm.id, secretRealm]]),
    currentRealmContext: context,
    availability,
    discoveredRealmIds: new Set(),
    isGM: false
  });
  assert.equal(guidance.state, 'excluded');
  assert.equal(guidance.knownDestinations.length, 1);
  assert.equal(guidance.knownDestinations[0].label, 'Verdant Expanse');
  assert.equal(guidance.undiscoveredCount, 1);
  assert.equal(JSON.stringify(guidance).includes('Hidden Vale'), false);
});

test('guidance lists known destination names when not excluded', () => {
  const env = { includedRealmIds: ['r-open'] };
  const context = { resolved: true, realms: [{ id: 'r-other' }] };
  const availability = evaluateLocationAvailability(env, context);
  const guidance = buildTravelGuidance({
    environment: env,
    realmsById: new Map([[openRealm.id, openRealm]]),
    currentRealmContext: context,
    availability,
    discoveredRealmIds: new Set(),
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
  realms: [secretRealm, openRealm],
  realmIds: ['r-secret', 'r-open'],
  staleRealmIds: ['r-stale']
};

test('viewer summary for a non-GM redacts secret undiscovered realms and drops raw ids', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: false,
    revealMode: 'manual',
    discoveredRealmIds: new Set()
  });
  assert.equal(summary.resolved, true);
  assert.equal(summary.source, 'manualOverride');
  // Non-GM gets EMPTY raw id arrays — those carry real realm ids.
  assert.deepEqual(summary.realmIds, []);
  assert.deepEqual(summary.staleRealmIds, []);
  // Realms come back as disclosure objects; the secret one is a placeholder.
  const secret = summary.realms.find(realm => realm.placeholder === true);
  assert.ok(secret, 'secret undiscovered realm must surface as a placeholder');
  assert.equal(secret.id, null);
  assert.equal(secret.label, undefined);
  const open = summary.realms.find(realm => realm.id === 'r-open');
  assert.equal(open.label, 'Verdant Expanse');
  // The secret name/id never appear anywhere in the serialized summary.
  assert.equal(JSON.stringify(summary).includes('Hidden Vale'), false);
  assert.equal(JSON.stringify(summary).includes('r-secret'), false);
  assert.equal(JSON.stringify(summary).includes('r-stale'), false);
});

test('viewer summary for a non-GM discloses a discovered secret realm but still hides raw ids', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: false,
    revealMode: 'manual',
    discoveredRealmIds: new Set(['r-secret'])
  });
  const secret = summary.realms.find(realm => realm.secret === true);
  assert.equal(secret.id, 'r-secret');
  assert.equal(secret.label, 'Hidden Vale');
  assert.equal(secret.placeholder, false);
  // Discovery reveals the disclosure label, but raw id arrays stay GM-only.
  assert.deepEqual(summary.realmIds, []);
  assert.deepEqual(summary.staleRealmIds, []);
});

test('viewer summary for a GM exposes full ids and never redacts', () => {
  const summary = buildLocationSummaryForViewer({
    context: summaryContext,
    isGM: true,
    revealMode: 'manual',
    discoveredRealmIds: new Set()
  });
  assert.deepEqual(summary.realmIds, ['r-secret', 'r-open']);
  assert.deepEqual(summary.staleRealmIds, ['r-stale']);
  assert.equal(summary.realms.every(realm => realm.placeholder === false), true);
  const secret = summary.realms.find(realm => realm.id === 'r-secret');
  assert.equal(secret.label, 'Hidden Vale');
});

test('viewer summary tolerates an empty/unresolved context', () => {
  const summary = buildLocationSummaryForViewer({ context: {}, isGM: false });
  assert.equal(summary.resolved, false);
  assert.equal(summary.source, 'unresolved');
  assert.deepEqual(summary.realms, []);
  assert.deepEqual(summary.realmIds, []);
  assert.deepEqual(summary.staleRealmIds, []);
});

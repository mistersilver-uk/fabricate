/**
 * Pure view-helper coverage for the Interactable config panel
 * (`interactableConfigView.js`): the linked-visual status banner, the activation
 * gate summary line, the node count line, and the respawn-ETA formatting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeVisualStatus,
  describeActivationGate,
  describeNodeLine,
  formatRespawnEta
} from '../../src/ui/interactableConfigView.js';

describe('describeVisualStatus', () => {
  it('maps ok / missing / none statuses to distinct banners', () => {
    assert.equal(describeVisualStatus({ status: 'ok' }).severity, 'ok');
    assert.equal(describeVisualStatus({ status: 'missing' }).severity, 'missing');
    assert.equal(describeVisualStatus({ status: 'none' }).severity, 'none');
    assert.equal(describeVisualStatus(null).severity, 'none', 'null → none');
  });

  it('carries a localization key + fallback for each banner', () => {
    const missing = describeVisualStatus({ status: 'missing' });
    assert.ok(missing.key.startsWith('FABRICATE.Canvas.Interactable.Config.'));
    assert.ok(missing.fallback.length > 0);
    assert.ok(missing.icon.startsWith('fa-'));
  });
});

describe('describeActivationGate', () => {
  it('reports the FIRST blocking gate in precedence order', () => {
    assert.equal(describeActivationGate({ enabled: false }).status, 'disabled');
    assert.equal(describeActivationGate({ enabled: true, locked: true }).status, 'locked');
    assert.equal(describeActivationGate({ enabled: true, consumed: true }).status, 'consumed');
    assert.equal(describeActivationGate({ enabled: true, uses: { max: 2, used: 2 } }).status, 'usesExhausted');
  });

  it('reports a COOLDOWN gate when now is before lastUsed + seconds', () => {
    const state = { enabled: true, cooldown: { seconds: 100, lastUsedWorldTime: 1000 } };
    assert.equal(describeActivationGate(state, { now: 1050 }).status, 'cooldown', 'still cooling down');
    assert.equal(describeActivationGate(state, { now: 1100 }).status, 'active', 'cooldown elapsed');
    // No `now` supplied → the cooldown gate is skipped (active).
    assert.equal(describeActivationGate(state).status, 'active');
  });

  it('reports a NODE_DEPLETED gate after cooldown in precedence order', () => {
    const node = { hasNode: true, depleted: true };
    assert.equal(describeActivationGate({ enabled: true }, { node }).status, 'nodeDepleted');
    // Cooldown still wins over node depletion (higher precedence).
    const state = { enabled: true, cooldown: { seconds: 100, lastUsedWorldTime: 1000 } };
    assert.equal(describeActivationGate(state, { now: 1050, node }).status, 'cooldown');
    // An available node does not block.
    assert.equal(describeActivationGate({ enabled: true }, { node: { hasNode: true, depleted: false } }).status, 'active');
  });

  it('reports active when nothing blocks', () => {
    assert.equal(describeActivationGate({ enabled: true, uses: { max: 3, used: 1 } }).status, 'active');
    assert.equal(describeActivationGate({}).status, 'active', 'empty state defaults to active');
  });
});

describe('describeNodeLine', () => {
  it('reports unlimited / depleted / available', () => {
    assert.equal(describeNodeLine(null).key.endsWith('NodeUnlimited'), true);
    assert.equal(describeNodeLine({ hasNode: false }).key.endsWith('NodeUnlimited'), true);
    assert.equal(describeNodeLine({ hasNode: true, depleted: true }).key.endsWith('NodeDepleted'), true);
    assert.equal(describeNodeLine({ hasNode: true, depleted: false }).key.endsWith('NodeAvailable'), true);
  });
});

describe('formatRespawnEta', () => {
  it('returns null when there is no ETA', () => {
    assert.equal(formatRespawnEta(null), null);
    assert.equal(formatRespawnEta({}), null);
  });

  it('formats seconds into the two most significant units', () => {
    assert.equal(formatRespawnEta({ secondsUntil: 90 }), '1m 30s');
    assert.equal(formatRespawnEta({ secondsUntil: 3661 }), '1h 1m');
    assert.equal(formatRespawnEta({ secondsUntil: 90061 }), '1d 1h');
    assert.equal(formatRespawnEta({ secondsUntil: 0 }), '0s');
  });
});

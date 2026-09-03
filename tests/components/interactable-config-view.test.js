/**
 * Pure view-helper coverage for the Interactable config panel
 * (`interactableConfigView.js`): the linked-visual status banner and the
 * activation gate summary line.
 *
 * A region-first interactable carries NO per-interactable node pool (the
 * environment's `nodeRuntime[taskId]` owns depletion/respawn), so there is no
 * node count line or respawn-ETA formatting to cover here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeVisualStatus,
  describeActivationGate
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

  it('reports active when nothing blocks', () => {
    assert.equal(describeActivationGate({ enabled: true, uses: { max: 3, used: 1 } }).status, 'active');
    assert.equal(describeActivationGate({}).status, 'active', 'empty state defaults to active');
  });
});

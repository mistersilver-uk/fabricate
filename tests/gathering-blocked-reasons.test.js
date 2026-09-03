import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_LABEL_KEYS,
  localizeBlockedReasons,
  describeBlockedReasons,
  calloutFor
} from '../src/ui/svelte/apps/gathering/gatheringBlockedReasons.js';

// An echo `localize` so assertions read against the resolved keys/formatting.
const localize = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);

describe('gatheringBlockedReasons', () => {
  it('maps known codes to their player-facing label keys, deduplicated', () => {
    const labels = localizeBlockedReasons(
      [
        { code: 'STAMINA_BLOCKED' },
        { code: 'NO_CURRENT_REALM' },
        { code: 'STAMINA_BLOCKED' } // duplicate code collapses
      ],
      localize
    );
    assert.deepEqual(labels, [
      BLOCK_LABEL_KEYS.STAMINA_BLOCKED,
      BLOCK_LABEL_KEYS.NO_CURRENT_REALM
    ]);
  });

  it('covers the location codes that caused the silent no-op', () => {
    assert.equal(BLOCK_LABEL_KEYS.LOCATION_BLOCKED, 'FABRICATE.App.Gathering.Detail.Callout.Location');
    assert.equal(BLOCK_LABEL_KEYS.NO_CURRENT_REALM, 'FABRICATE.App.Gathering.Detail.Callout.NoRealm');
  });

  it('maps the permanently-exhausted (nonRegenerating) node code to its own label (issue 301)', () => {
    assert.equal(BLOCK_LABEL_KEYS.NODE_EXHAUSTED, 'FABRICATE.App.Gathering.Detail.Callout.NodeExhausted');
    // It is distinct from the regenerating "depleted" code.
    assert.notEqual(BLOCK_LABEL_KEYS.NODE_EXHAUSTED, BLOCK_LABEL_KEYS.NODE_DEPLETED);
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'NODE_EXHAUSTED' }], localize),
      ['FABRICATE.App.Gathering.Detail.Callout.NodeExhausted']
    );
  });

  it('falls back to the reason message, then a generic label, for unknown codes', () => {
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'WEIRD_CODE', message: 'Custom reason' }], localize),
      ['Custom reason']
    );
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'WEIRD_CODE' }], localize),
      ['FABRICATE.App.Gathering.Detail.Blocked']
    );
  });

  it('describeBlockedReasons builds a "Can\'t attempt — …" sentence', () => {
    const sentence = describeBlockedReasons([{ code: 'NO_CURRENT_REALM' }], localize);
    assert.match(sentence, /^FABRICATE\.App\.Gathering\.Detail\.CannotAttempt:/);
    assert.match(sentence, /Callout\.NoRealm/);
  });

  it('describeBlockedReasons returns the generic label for an empty/garbage list', () => {
    assert.equal(describeBlockedReasons([], localize), 'FABRICATE.App.Gathering.Detail.Blocked');
    assert.equal(describeBlockedReasons(null, localize), 'FABRICATE.App.Gathering.Detail.Blocked');
  });

  it('calloutFor pairs a known warning code with its icon, tone and label', () => {
    assert.deepEqual(calloutFor('STAMINA_BLOCKED', {}, localize), {
      code: 'STAMINA_BLOCKED',
      icon: 'fa-bolt',
      tone: 'warning',
      label: BLOCK_LABEL_KEYS.STAMINA_BLOCKED
    });
  });

  it('calloutFor preserves the neutral tone for paused / duplicate-run chips', () => {
    assert.equal(calloutFor('GAME_PAUSED', {}, localize).tone, 'neutral');
    assert.equal(calloutFor('DUPLICATE_ACTIVE_RUN', {}, localize).tone, 'neutral');
  });

  it('calloutFor falls back to a generic warning chip for unknown codes', () => {
    assert.deepEqual(calloutFor('WEIRD_CODE', { message: 'Custom reason' }, localize), {
      code: 'WEIRD_CODE',
      icon: 'fa-triangle-exclamation',
      tone: 'warning',
      label: 'Custom reason'
    });
    assert.deepEqual(calloutFor('WEIRD_CODE', {}, localize), {
      code: 'WEIRD_CODE',
      icon: 'fa-triangle-exclamation',
      tone: 'warning',
      label: 'FABRICATE.App.Gathering.Detail.Blocked'
    });
  });
});

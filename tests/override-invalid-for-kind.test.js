import test from 'node:test';
import assert from 'node:assert/strict';

import { overrideInvalidForKind } from '../src/ui/svelte/apps/manager/component/overridePlayerSees.js';

test('overrideInvalidForKind: a fixed target has no kind to break', () => {
  assert.equal(
    overrideInvalidForKind({ attribute: false, kind: 'multiply', adjustmentOverride: -5 }),
    false
  );
});

test('overrideInvalidForKind: an unset override never invalidates', () => {
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'multiply', adjustmentOverride: null }),
    false
  );
});

test('overrideInvalidForKind: an added adjustment is valid at any finite value', () => {
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'add', adjustmentOverride: -12 }),
    false
  );
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'add', adjustmentOverride: 0 }),
    false
  );
});

test('overrideInvalidForKind: a multiplier at or below zero is invalid', () => {
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'multiply', adjustmentOverride: 0 }),
    true
  );
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'multiply', adjustmentOverride: -0.5 }),
    true
  );
});

test('overrideInvalidForKind: a multiplier above zero is valid', () => {
  assert.equal(
    overrideInvalidForKind({ attribute: true, kind: 'multiply', adjustmentOverride: 0.5 }),
    false
  );
});

// A kind switch is the reachable path to an invalid KEPT override (issue 2078): a value authored
// as a valid `add` becomes invalid the moment the target switches to `multiply`.
test('overrideInvalidForKind: a kind switch can invalidate a previously valid override', () => {
  const kept = { attribute: true, adjustmentOverride: -3 };
  assert.equal(overrideInvalidForKind({ ...kept, kind: 'add' }), false);
  assert.equal(overrideInvalidForKind({ ...kept, kind: 'multiply' }), true);
});

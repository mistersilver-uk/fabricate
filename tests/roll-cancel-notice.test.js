/**
 * Unit tests for the shared roll-cancel toast discriminator (issue #513):
 * `src/ui/svelte/util/rollCancelNotice.js`.
 *
 * The helper fires a WARN toast ONLY for a native roll-dialog dismissal
 * (`cancelledReason === 'nativeRollDialogDismissed'`); a bespoke confirm-prompt
 * Cancel (no `cancelledReason`) stays silent. Also guards against drift between the
 * UI-side reason constant and the systems-side `NATIVE_ROLL_DIALOG_DISMISSED`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  notifyRollDialogDismissed,
  NATIVE_ROLL_DIALOG_DISMISSED as UI_REASON,
  ROLL_CANCELLED_MESSAGE_KEY,
} from '../src/ui/svelte/util/rollCancelNotice.js';
import { NATIVE_ROLL_DIALOG_DISMISSED as SYSTEMS_REASON } from '../src/systems/fabricateRoll.js';

function makeSpy() {
  const calls = [];
  return { fn: (msg) => calls.push(msg), calls };
}

test('fires the WARN toast for a native roll-dialog dismissal', () => {
  const warn = makeSpy();
  const fired = notifyRollDialogDismissed(
    { cancelled: true, cancelledReason: 'nativeRollDialogDismissed' },
    { notifyWarn: warn.fn, localize: (key) => `L:${key}` }
  );
  assert.equal(fired, true, 'reports that it fired');
  assert.deepEqual(warn.calls, [`L:${ROLL_CANCELLED_MESSAGE_KEY}`], 'warns with the localized key');
});

test('stays silent for a bespoke confirm-prompt Cancel (no cancelledReason)', () => {
  const warn = makeSpy();
  const fired = notifyRollDialogDismissed(
    { cancelled: true, cancelledReason: undefined },
    { notifyWarn: warn.fn }
  );
  assert.equal(fired, false);
  assert.deepEqual(warn.calls, [], 'no toast for a reason-less cancel');
});

test('stays silent for a non-cancel result and for null/undefined', () => {
  const warn = makeSpy();
  assert.equal(notifyRollDialogDismissed({ success: true }, { notifyWarn: warn.fn }), false);
  assert.equal(notifyRollDialogDismissed(null, { notifyWarn: warn.fn }), false);
  assert.equal(notifyRollDialogDismissed(undefined, { notifyWarn: warn.fn }), false);
  assert.deepEqual(warn.calls, []);
});

test('localize defaults to identity so a headless caller sees the raw key', () => {
  const warn = makeSpy();
  notifyRollDialogDismissed({ cancelledReason: 'nativeRollDialogDismissed' }, { notifyWarn: warn.fn });
  assert.deepEqual(warn.calls, [ROLL_CANCELLED_MESSAGE_KEY]);
});

test('the UI reason constant does not drift from the systems-side constant', () => {
  assert.equal(UI_REASON, SYSTEMS_REASON, 'rollCancelNotice + fabricateRoll must agree');
  assert.equal(UI_REASON, 'nativeRollDialogDismissed');
});

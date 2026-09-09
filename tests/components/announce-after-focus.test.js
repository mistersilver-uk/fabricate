/**
 * The ordering rule itself, over BOTH mover shapes (issue 1157, second shape added at 1517).
 *
 * `src/ui/svelte/util/announceAfterFocus.js` is the one place the module decides "move the
 * keyboard first, queue the sentence behind it" — and until this file it had no suite of its own.
 * Every assertion on it was made through a mounted host, which can see the SETTLED state (the
 * sentence eventually arrives) but not the property the module exists for: that a decline is
 * announced IMMEDIATELY and a move is announced LATE. A host test that waits for the delay before
 * reading the region passes either way.
 *
 * THE SECOND SHAPE IS WHY THIS IS WORTH A FILE. The 1157 call sites hand the mover a synchronous
 * `true`/`false`; the validation row action hands it a PROMISE of the element it landed on,
 * because its destination panel does not exist until Svelte has flushed the route just written.
 * Both are read as one question — "did focus move" — by one branch, and that branch is invisible
 * to every mounted suite: delete it and a promise is still a truthy object, so a DECLINED
 * asynchronous move takes the delayed path and announces the promise rather than `null`. Nothing
 * in the repository could see that. The `{shape} x {outcome}` table below can.
 *
 * NO DOM AND NO HAPPY-DOM. The module touches neither; the "element" a mover resolves is only ever
 * passed through to `announce`, so a plain object proves the identity hand-off exactly as a real
 * node would, without a document.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANNOUNCE_AFTER_FOCUS_MS,
  announceAfterFocusMove,
} from '../../src/ui/svelte/util/announceAfterFocus.js';

/**
 * The delay these cells run with, OVERRIDDEN rather than shipped.
 *
 * Short enough that four cells cost a quarter of a second, long enough that "the microtasks and
 * one macrotask turn have drained" cannot be mistaken for it. The shipped number is asserted
 * separately, so a change to it moves one assertion rather than the running time of this file.
 */
const DELAY = 60;

/** Every queued microtask, plus one macrotask turn — but nothing like `DELAY`. */
const drain = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Long enough for a queued announcement to have fired. */
const afterDelay = () => new Promise((resolve) => setTimeout(resolve, DELAY + 40));

/**
 * Run one cell of the table and report WHEN the sentence arrived rather than only whether it did.
 *
 * @param {() => boolean|Promise<object|null>} moveFocus
 * @returns {Promise<{early: object[], late: object[]}>} the announce arguments seen before the
 *   delay could have elapsed, and those seen after it.
 */
async function announcementTiming(moveFocus) {
  const seen = [];
  announceAfterFocusMove(moveFocus, (focused) => seen.push({ focused }), DELAY);
  await drain();
  const early = [...seen];
  await afterDelay();
  return { early, late: [...seen] };
}

describe('announceAfterFocus: the sentence is queued behind a move and not behind a decline', () => {
  it('exports the shipped delay as a positive number, so a suite waits on it rather than on a copy', () => {
    assert.equal(typeof ANNOUNCE_AFTER_FOCUS_MS, 'number');
    assert.ok(
      ANNOUNCE_AFTER_FOCUS_MS > 0,
      'a zero delay is the un-queued order this module exists to prevent'
    );
  });

  it('delays the sentence when a SYNCHRONOUS mover reports it moved', async () => {
    const { early, late } = await announcementTiming(() => true);
    assert.deepEqual(early, [], 'nothing is said while the focus utterance is still starting');
    assert.deepEqual(
      late,
      [{ focused: null }],
      'and then the sentence arrives. A `true`/`false` mover has no element to hand over, so the ' +
        'callback is given null'
    );
  });

  it('announces IMMEDIATELY when a synchronous mover declines', async () => {
    const { early, late } = await announcementTiming(() => false);
    assert.deepEqual(
      early,
      [{ focused: null }],
      'a decline moved no focus, so there is no utterance to queue behind and waiting would only ' +
        'delay the one thing the GM is owed'
    );
    assert.equal(late.length, 1, 'and it is said once, not again when the delay elapses');
  });

  it('delays the sentence when an ASYNCHRONOUS mover resolves the element it landed on', async () => {
    const destination = { tag: 'input' };
    const { early, late } = await announcementTiming(async () => destination);
    assert.deepEqual(early, [], 'nothing is said while the focus utterance is still starting');
    assert.equal(late.length, 1, 'and then the sentence arrives, once');
    assert.ok(
      late[0].focused === destination,
      'and it is handed the RESOLVED element, so a caller composing its sentence from the ' +
        'destination cannot write one before focus moved'
    );
  });

  it('announces IMMEDIATELY when an asynchronous mover resolves null', async () => {
    // THE CELL THE BRANCH EXISTS FOR. A promise is a truthy object, so a reader that never
    // awaited it would take this for a successful move: delayed, and announced with the promise
    // itself as the "focused element". Both halves are asserted.
    const { early, late } = await announcementTiming(async () => null);
    assert.deepEqual(
      early,
      [{ focused: null }],
      'the promise is AWAITED and its `null` read as a decline, so the sentence is not queued ' +
        'behind a focus move that never happened'
    );
    assert.equal(late.length, 1, 'and it is said once');
  });

  it('says nothing at all when there is no mover, rather than announcing a move it did not make', async () => {
    const { late } = await announcementTiming(undefined);
    assert.deepEqual(
      late,
      [{ focused: null }],
      'an absent mover is a decline: `moveFocus?.()` is undefined, which is neither `true` nor an ' +
        'element'
    );
  });
});

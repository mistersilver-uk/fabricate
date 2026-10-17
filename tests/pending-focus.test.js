/**
 * The one armed focus request three editors share (issue 2511): it settles only while armed, a miss
 * disarms it unless `keepUntilHeld`, and a hold focuses in a task rather than synchronously.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { createPendingFocus } from '../src/ui/svelte/util/pendingFocus.js';

describe('createPendingFocus', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  const recorder = () => {
    const focused = [];
    return {
      focused,
      focus: (request) => {
        focused.push(request);
      },
    };
  };

  it('does nothing while unarmed, not even asking whether the edit holds', () => {
    const pending = createPendingFocus();
    const { focused, focus } = recorder();
    let asked = 0;
    pending.settle(() => {
      asked += 1;
      return true;
    }, focus);
    mock.timers.runAll();
    assert.equal(asked, 0);
    assert.deepEqual(focused, []);
  });

  it('focuses a held request in a task, then disarms', () => {
    const pending = createPendingFocus();
    const { focused, focus } = recorder();
    pending.arm({ at: 2 });
    pending.settle((request) => request.at === 2, focus);
    assert.deepEqual(focused, [], 'the focus waits for the task');
    mock.timers.tick(0);
    assert.deepEqual(focused, [{ at: 2 }]);

    pending.settle(() => true, focus);
    mock.timers.runAll();
    assert.equal(focused.length, 1, 'a settled request does not focus twice');
  });

  it('disarms on a miss, so a refused write never moves focus', () => {
    const pending = createPendingFocus();
    const { focused, focus } = recorder();
    pending.arm('g1');
    pending.settle(() => false, focus);
    pending.settle(() => true, focus);
    mock.timers.runAll();
    assert.deepEqual(focused, []);
  });

  it('keeps a missed request armed under keepUntilHeld until the edit holds it', () => {
    const pending = createPendingFocus({ keepUntilHeld: true });
    const { focused, focus } = recorder();
    pending.arm({ at: 1 });
    pending.settle(({ at }) => 1 > at, focus);
    mock.timers.runAll();
    assert.deepEqual(focused, []);

    pending.settle(({ at }) => 2 > at, focus);
    mock.timers.tick(0);
    assert.deepEqual(focused, [{ at: 1 }]);

    pending.settle(() => true, focus);
    mock.timers.runAll();
    assert.equal(focused.length, 1);
  });

  it('settles the latest request when re-armed before a settle', () => {
    const pending = createPendingFocus();
    const { focused, focus } = recorder();
    pending.arm('first');
    pending.arm('second');
    pending.settle(() => true, focus);
    mock.timers.runAll();
    assert.deepEqual(focused, ['second']);
  });
});

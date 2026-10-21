/**
 * The published component seam's `callback` kind (issue 2452), driven through its factory with the
 * fake runtime: M17 and the narrowed M10, what the host is handed for a callback key, `deliver`'s
 * liveness, the failure report for a throw, a rejection and a thenable, and a function that
 * updates, destroys or mounts before it returns. The forwarder's slice, snapshot and `untrack` are
 * `components/published-callbacks-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';

import {
  ALPHA,
  CALLBACK_REPORT,
  FAULT_REPORT,
  FakeTarget,
  PREFIX,
  drained,
  exactly,
  fakeRuntime,
  recorder,
  refusal,
  seamWith,
} from './helpers/publishedComponentFakes.js';

// Two callback keys, one stating `args`, beside a key of each other kind.
const ACTED = Object.freeze({
  name: 'Acted',
  path: 'src/ui/svelte/components/Acted.svelte',
  version: 1,
  props: {
    label: { kind: 'data' },
    title: { kind: 'text' },
    body: { kind: 'slot' },
    onDone: { kind: 'callback' },
    onPick: { kind: 'callback', args: 2 },
  },
  rest: true,
  root: 'any',
  component: Object.freeze({ role: 'Acted' }),
});

/** A seam over `ACTED`, and `mounted(props, onFault)` answering the handle beside the fake's instance. */
function acted(options = {}) {
  const fake = seamWith({ table: [ACTED], ...options });
  const mounted = (props, onFault) => {
    const handle = fake.ui.mount('Acted', { target: new FakeTarget(), props, onFault });
    return { handle, instance: fake.mounts.at(-1).instance, hostProps: fake.mounts.at(-1).props };
  };
  return { ...fake, mounted };
}

// ratchet-exempt(lint): a thenable that is no Promise is the case under test.
const thenable = (then) => ({ then });

const unhandled = [];
const recordUnhandled = (error) => {
  unhandled.push(error);
};
before(() => process.on('unhandledRejection', recordUnhandled));
after(() => process.off('unhandledRejection', recordUnhandled));
beforeEach(() => {
  unhandled.length = 0;
});

describe('a callback key', () => {
  it('M17: refuses a value that is not a function, null included, and mounts nothing', () => {
    const { ui, mounts } = acted();
    for (const value of ['press', 3, null, true, { handleEvent() {} }]) {
      for (const key of ['onDone', 'onPick']) {
        assert.throws(
          () => ui.mount('Acted', { target: new FakeTarget(), props: { [key]: value } }),
          refusal(`"${key}" must be a function`)
        );
      }
    }
    assert.equal(mounts.length, 0);
  });

  it('M10: refuses a function anywhere else, naming the top-level key that holds it', () => {
    const { ui, mounts } = acted();
    const fn = () => {};
    for (const [key, value] of [
      ['label', fn],
      ['title', fn],
      ['body', fn],
      ['data-x', fn],
      ['label', { rows: [{ render: fn }] }],
    ]) {
      assert.throws(
        () => ui.mount('Acted', { target: new FakeTarget(), props: { [key]: value } }),
        refusal(`"${key}" must not hold a function`)
      );
    }
    assert.equal(mounts.length, 0);
  });

  it('reads undefined as absent, and hands the host true for a function, never the function', () => {
    const { mounted } = acted();
    const { record } = recorder();
    const props = { label: 'Hold', onDone: record, onPick: undefined };
    const { hostProps } = mounted(props);
    assert.deepEqual(hostProps.initial, { label: 'Hold', onDone: true });
    assert.equal(Object.hasOwn(hostProps.initial, 'onPick'), false, 'an absent key is no key');
    assert.equal(props.onDone, record, "the companion's own object is not rewritten");
    assert.deepEqual(hostProps.kinds, {
      title: 'text',
      body: 'slot',
      onDone: 'callback',
      onPick: 'callback',
    });
    assert.ok(Object.isFrozen(hostProps.kinds));
  });

  it('hands each setProps true for a passed callback and no key for an absent one', () => {
    const { mounted } = acted();
    const { record } = recorder();
    const { handle, instance } = mounted({ onDone: record });
    assert.equal(handle.update({ onPick: record }), true);
    assert.equal(handle.update({}), true);
    assert.equal(handle.update({ onDone: record, onPick: record }), true);
    assert.deepEqual(instance.updates, [{ onPick: true }, {}, { onDone: true, onPick: true }]);
  });

  it("answers a frozen { arity, deliver } per key, its arity the entry's args or 0", () => {
    const { mounted } = acted();
    const { instance, hostProps } = mounted({});
    const { onDone, onPick } = instance.callbacks;
    for (const callback of [onDone, onPick]) {
      assert.deepEqual(Object.keys(callback), ['arity', 'deliver']);
      assert.ok(Object.isFrozen(callback));
    }
    assert.equal(onDone.arity, 0, 'unstated args');
    assert.equal(onPick.arity, 2);
    assert.equal(hostProps.callbacks('onPick').arity, 2, 'answered again on a later call');
  });

  it('accepts a bound function and a class constructor, whose TypeError on call is one report', () => {
    const { mounted, reports } = acted();
    const owner = { seen: [] };
    function note(value) {
      this.seen.push(value);
    }
    class Picker {}
    const { instance } = mounted({ onDone: Picker, onPick: note.bind(owner) });
    instance.callbacks.onPick.deliver(['a']);
    assert.deepEqual(owner.seen, ['a']);
    instance.callbacks.onDone.deliver([]);
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].slice(0, 3), [CALLBACK_REPORT, 'Acted', 'onDone']);
    assert.ok(reports[0][3] instanceof TypeError, 'a class called without new');
  });

  it('M9: reads a function as present on a required callback key, and absence as missing', () => {
    const table = [{ ...ACTED, props: { onDone: { kind: 'callback', required: true } } }];
    const { ui } = seamWith({ table });
    for (const props of [{}, { onDone: undefined }]) {
      assert.throws(
        () => ui.mount('Acted', { target: new FakeTarget(), props }),
        refusal('Acted requires a non-empty "onDone"')
      );
    }
    assert.equal(
      ui
        .mount('Acted', { target: new FakeTarget(), props: { onDone() {} } })
        .update({ onDone() {} }),
      true
    );
  });
});

describe('deliver', () => {
  it('calls the function with the arguments it is given, and answers undefined', () => {
    const { mounted } = acted();
    const { calls, record } = recorder();
    const { instance } = mounted({ onPick: record });
    assert.equal(instance.callbacks.onPick.deliver(['a', 'b']), undefined);
    assert.deepEqual(calls, [['a', 'b']]);
  });

  it('reaches the newest function after an update, and none after one that omits the key', () => {
    const { mounted, reports } = acted();
    const first = recorder();
    const second = recorder();
    const { handle, instance } = mounted({ onDone: first.record });
    const { deliver } = instance.callbacks.onDone;
    handle.update({ onDone: second.record });
    deliver([]);
    assert.deepEqual([first.calls.length, second.calls.length], [0, 1], 'the newest only');
    handle.update({ label: 'Still drawn' });
    deliver([]);
    assert.deepEqual([first.calls.length, second.calls.length], [0, 1], 'omitted, so not called');
    handle.update({ onDone: first.record });
    deliver([]);
    assert.deepEqual([first.calls.length, second.calls.length], [1, 1], 'passed again');
    assert.deepEqual(reports, []);
  });

  it('keeps the earlier function when an update is refused', () => {
    const { mounted } = acted();
    const first = recorder();
    const second = recorder();
    const { handle, instance } = mounted({ onDone: first.record });
    const refused = { onDone: second.record, title: 7 };
    assert.throws(() => handle.update(refused), refusal('"title" must be a string'));
    assert.equal(refused.onDone, second.record, 'a refused object is not rewritten');
    assert.throws(() => handle.update({ onDone: null }), refusal('"onDone" must be a function'));
    instance.callbacks.onDone.deliver([]);
    assert.deepEqual([first.calls.length, second.calls.length], [1, 0]);
    assert.deepEqual(instance.updates, []);
  });

  it('calls nothing and reports nothing after destroy, and after a fault', async () => {
    const { mounted, reports } = acted();
    const { calls, record } = recorder();
    const destroyed = mounted({ onDone: record });
    destroyed.handle.destroy();
    destroyed.instance.callbacks.onDone.deliver([]);
    const faulted = mounted({ onDone: record });
    faulted.hostProps.onfault(new Error('render blew up'));
    faulted.instance.callbacks.onDone.deliver([]);
    await drained();
    assert.deepEqual(calls, []);
    assert.equal(reports.length, 1, 'the fault alone');
    assert.equal(reports[0][0], FAULT_REPORT);
  });

  it('calls nothing from inside the unmount that ends its mount', () => {
    const { calls, record } = recorder();
    const { mounted } = acted({
      onUnmount: (instance) => instance.callbacks.onDone.deliver([]),
    });
    mounted({ onDone: record }).handle.destroy();
    assert.deepEqual(calls, [], 'the mount was retired before its unmount ran');
  });

  it('calls nothing between a fault inside the runtime call and its deferred unmount', async () => {
    const { calls, record } = recorder();
    const { mounted, unmounts } = acted({ faultDuringMount: new Error('during mount') });
    const { instance } = mounted({ onDone: record });
    assert.equal(unmounts.length, 0, 'the unmount is still queued');
    instance.callbacks.onDone.deliver([]);
    await drained();
    assert.deepEqual(calls, []);
  });
});

describe('a callback that fails', () => {
  it('reports a throw once, leaves the mount live, and never calls onFault', async () => {
    const { mounted, reports, unmounts } = acted();
    const thrown = new Error('the companion handler threw');
    const faults = [];
    const { handle, instance } = mounted(
      {
        onDone() {
          throw thrown;
        },
      },
      (fault) => {
        faults.push(fault);
      }
    );
    assert.equal(instance.callbacks.onDone.deliver([]), undefined);
    await drained();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Acted', 'onDone', thrown]]);
    assert.equal(handle.update({ label: 'Still live' }), true);
    assert.equal(unmounts.length, 0);
    assert.deepEqual(faults, []);
  });

  it('reports the rejection of a returned Promise once, after it settles, and leaves none unhandled', async () => {
    const { mounted, reports } = acted();
    const rejected = new Error('the companion write failed');
    const { handle, instance } = mounted({ onDone: () => Promise.reject(rejected) });
    assert.equal(instance.callbacks.onDone.deliver([]), undefined);
    assert.deepEqual(reports, [], 'not before it settles');
    await drained();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Acted', 'onDone', rejected]]);
    assert.deepEqual(unhandled, []);
    assert.equal(handle.update({}), true);
  });

  it('ignores what the function returns: a value, a Promise that resolves, a thenable that resolves, its own handle', async () => {
    const { mounted, reports } = acted();
    const held = {};
    const returns = [
      () => 'ignored',
      () => Promise.resolve('ignored'),
      () => thenable((resolve) => resolve(1)),
      () => held.handle,
    ];
    for (const onDone of returns) {
      const { handle, instance } = mounted({ onDone });
      held.handle = handle;
      assert.equal(instance.callbacks.onDone.deliver([]), undefined);
    }
    await drained();
    assert.deepEqual(reports, []);
    assert.deepEqual(unhandled, []);
  });

  const failure = new Error('the thenable failed');
  const fail = () => {
    throw failure;
  };
  const later = new Error('a second failure of the same call');
  for (const [what, result] of [
    ['rejects', thenable((_resolve, reject) => reject(failure))],
    [
      'rejects twice',
      thenable((_resolve, reject) => {
        reject(failure);
        reject(later);
      }),
    ],
    [
      'rejects and then throws',
      thenable((_resolve, reject) => {
        reject(failure);
        throw later;
      }),
    ],
    ['throws from then', thenable(fail)],
    // ratchet-exempt(lint): a thenable whose `then` throws on read is the case under test.
    ['throws from the read of then', Object.defineProperty({}, 'then', { get: fail })],
  ]) {
    it(`reports a returned thenable that ${what}, once`, async () => {
      const { mounted, reports } = acted();
      const { instance } = mounted({ onDone: () => result });
      assert.equal(instance.callbacks.onDone.deliver([]), undefined);
      await drained();
      assert.deepEqual(reports, [[CALLBACK_REPORT, 'Acted', 'onDone', failure]]);
      assert.deepEqual(unhandled, []);
    });
  }
});

describe('a callback that acts on the seam before it returns', () => {
  it('has its update accepted and recorded', () => {
    const { mounted, reports } = acted();
    const held = {};
    const { handle, instance } = mounted({
      onDone() {
        held.answer = held.handle.update({ label: 'Working' });
      },
    });
    held.handle = handle;
    instance.callbacks.onDone.deliver([]);
    assert.equal(held.answer, true);
    assert.deepEqual(instance.updates, [{ label: 'Working' }]);
    assert.deepEqual(reports, []);
  });

  it('reports a refusal its update throws as a callback failure, and stays live', () => {
    const { mounted, reports } = acted();
    const held = {};
    const { handle, instance } = mounted({
      onDone() {
        held.handle.update({ title: 7 });
      },
    });
    held.handle = handle;
    instance.callbacks.onDone.deliver([]);
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].slice(0, 3), [CALLBACK_REPORT, 'Acted', 'onDone']);
    assert.match(reports[0][3].message, exactly(`${PREFIX}"title" must be a string`));
    assert.equal(handle.update({}), true);
  });

  it('unmounts once on its destroy, after which a second deliver calls nothing', () => {
    const { seam, mounted, unmounts, reports } = acted();
    const held = { calls: 0 };
    const { handle, instance } = mounted({
      onDone() {
        held.calls += 1;
        held.handle.destroy();
      },
    });
    held.handle = handle;
    const { deliver } = instance.callbacks.onDone;
    deliver([]);
    deliver([]);
    assert.equal(held.calls, 1);
    assert.equal(unmounts.length, 1);
    assert.equal(handle.update({}), false);
    assert.equal(seam.liveMountCount(), 0);
    assert.deepEqual(reports, []);
  });

  it('mounts into another target', () => {
    const { ui, mounted, mounts, reports } = acted();
    const held = {};
    const { instance } = mounted({
      onDone() {
        held.other = ui.mount('Acted', { target: new FakeTarget(), props: { label: 'Next' } });
      },
    });
    instance.callbacks.onDone.deliver([]);
    assert.equal(mounts.length, 2);
    assert.equal(held.other.update({}), true);
    assert.deepEqual(reports, []);
  });
});

describe('registering a callback kind', () => {
  it('describes a callback key by its kind and whether it is required, and never its args', () => {
    const { ui } = acted();
    const { props } = ui.describe('Acted');
    assert.deepEqual(props.onDone, { kind: 'callback', required: false });
    assert.deepEqual(props.onPick, { kind: 'callback', required: false });
    assert.ok(Object.isFrozen(props.onPick));
  });

  it('refuses a manifest entry whose prop kind is bindable, which no table ships', () => {
    const unknown = { ...ALPHA, props: { amount: { kind: 'bindable' } } };
    const seam = createPublishedComponents({ table: [unknown], isReady: () => true });
    assert.throws(
      () => seam.register({ ...fakeRuntime().runtime, components: {} }),
      (error) =>
        exactly(`${PREFIX}Alpha "amount" has an unknown kind "bindable"`).test(error.message)
    );
  });
});

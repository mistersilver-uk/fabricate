/**
 * The published component seam's `value` kind on the fake runtime (issue 2453): the synthesised
 * `on<Key>Change` and how `describe` lists it, the registration refusals, M20 and M17 on a change
 * key, what the host receives at mount and update, the delivery `callbacks(key)` answers for a
 * value key, and `handle.value`. The real runtime's resync is `components/published-values-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';
import { changeKeyOf, changeKeys, keepCurrent } from '../src/ui/publishedComponentValues.js';

import {
  ALPHA,
  CALLBACK_REPORT,
  FakeTarget,
  PREFIX,
  exactly,
  fakeRuntime,
  recorder,
  refusal,
  seamWith,
} from './helpers/publishedComponentFakes.js';

const VALUED = Object.freeze({
  ...ALPHA,
  name: 'Valued',
  props: Object.freeze({
    query: Object.freeze({ kind: 'value', initial: '' }),
    count: Object.freeze({ kind: 'value', initial: 0 }),
    label: Object.freeze({ kind: 'data' }),
  }),
});

/** A mount of `VALUED` whose instance answers `getValue` from what the host was handed. */
function mounted(props) {
  const fake = seamWith({ table: [VALUED] });
  const handle = fake.ui.mount('Valued', { target: new FakeTarget(), props });
  const [{ instance, props: hostProps }] = fake.mounts;
  const held = { ...hostProps.values };
  instance.getValue = (key) => held[key];
  instance.setProps = (next, values) => {
    instance.updates.push([next, values]);
    Object.assign(held, values);
  };
  return { ...fake, handle, instance, hostProps };
}

describe('a value key’s change callback', () => {
  it('is on, the key with its first letter upper-cased, then Change, derived once per entry', () => {
    assert.equal(changeKeyOf('query'), 'onQueryChange');
    assert.equal(changeKeyOf('x'), 'onXChange');
    assert.deepEqual(changeKeys(VALUED), { onQueryChange: 'query', onCountChange: 'count' });
    assert.equal(changeKeys(VALUED), changeKeys(VALUED), 'the same frozen object');
    assert.ok(Object.isFrozen(changeKeys(VALUED)));
    assert.deepEqual(changeKeys(ALPHA), {});
  });

  it('is described directly after its value key, as an optional callback', () => {
    const { ui } = seamWith({ table: [VALUED] });
    const { props } = ui.describe('Valued');
    assert.deepEqual(Object.keys(props), [
      'query',
      'onQueryChange',
      'count',
      'onCountChange',
      'label',
    ]);
    assert.deepEqual(props.query, { kind: 'value', required: false });
    assert.deepEqual(props.onQueryChange, { kind: 'callback', required: false });
    assert.ok(Object.isFrozen(props.onQueryChange));
  });
});

describe('registering a value kind', () => {
  const register = (props) => {
    const seam = createPublishedComponents({ table: [{ ...VALUED, props }], isReady: () => true });
    return () => seam.register({ ...fakeRuntime().runtime, components: {} });
  };
  const refused = (tail) => (error) =>
    error.constructor === Error && exactly(PREFIX + tail).test(error.message);

  for (const initial of [undefined, {}, [], () => {}, 1n]) {
    it(`refuses an initial of ${typeof initial}${Array.isArray(initial) ? ' (array)' : ''}`, () => {
      assert.throws(
        register({ query: { kind: 'value', initial } }),
        refused('Valued "query" has an initial that is not a string, number, boolean or null')
      );
    });
  }

  it('admits each primitive initial, null among them', () => {
    for (const initial of ['', 0, true, null]) register({ query: { kind: 'value', initial } })();
  });

  it('refuses an entry that lists the synthesised name as a key of its own', () => {
    assert.throws(
      register({ query: { kind: 'value', initial: '' }, onQueryChange: { kind: 'callback' } }),
      refused('Valued "onQueryChange" collides with the change callback of "query"')
    );
  });
});

describe('mounting and updating a value key', () => {
  it('hands the host the seeded values apart from the props, and no change key', () => {
    const { hostProps } = mounted({ count: 3, label: 'L', onQueryChange: () => {} });
    assert.deepEqual(hostProps.initial, { label: 'L' });
    assert.deepEqual(hostProps.values, { query: '', count: 3 }, 'initial where none was passed');
    assert.deepEqual(hostProps.kinds, {}, 'the host draws no content for a value key');
  });

  it('seeds a value passed as null, and the initial for one passed as undefined', () => {
    const { hostProps } = mounted({ query: null, count: undefined });
    assert.deepEqual(hostProps.values, { query: null, count: 0 });
  });

  it('throws M20 for a value that is not a primitive, M10 for a function, at mount and update', () => {
    const fake = seamWith({ table: [VALUED] });
    for (const query of [{}, [1], Symbol('s'), 1n]) {
      assert.throws(
        () => fake.ui.mount('Valued', { target: new FakeTarget(), props: { query } }),
        refusal('"query" must be a string, number, boolean or null')
      );
    }
    assert.throws(
      () => fake.ui.mount('Valued', { target: new FakeTarget(), props: { query: () => {} } }),
      refusal('"query" must not hold a function')
    );
    const { handle, instance } = mounted({ query: 'q' });
    assert.throws(
      () => handle.update({ count: {} }),
      refusal('"count" must be a string, number, boolean or null')
    );
    assert.deepEqual(instance.updates, [], 'atomic');
  });

  it('throws M17 for a change key that holds no function', () => {
    const { handle } = mounted({});
    assert.throws(
      () => handle.update({ onQueryChange: 'later' }),
      refusal('"onQueryChange" must be a function')
    );
  });

  it('passes the host on update only the values passed other than undefined', () => {
    const { handle, instance } = mounted({ query: 'a' });
    assert.equal(handle.update({ label: 'L', count: undefined, query: 'b' }), true);
    assert.deepEqual(instance.updates, [[{ label: 'L' }, { query: 'b' }]]);
    assert.equal(handle.value('query'), 'b');
    assert.equal(handle.value('count'), 0, 'kept');
  });

  it('keeps the host’s own record when every value passed equals it', () => {
    const held = { query: 'a', count: 0 };
    assert.equal(keepCurrent(held, { query: 'a' }), held);
    assert.equal(keepCurrent(held, {}), held);
    assert.deepEqual(keepCurrent(held, { count: -0 }), { query: 'a', count: -0 }, 'by Object.is');
  });
});

describe('the delivery a value key answers', () => {
  it('forwards (next, previous) to the newest change function, reporting a throw under its name', () => {
    const first = recorder();
    const { handle, hostProps, reports } = mounted({ onQueryChange: first.record });
    const { arity, deliver } = hostProps.callbacks('query');
    assert.equal(arity, 2);
    deliver(['b', 'a']);
    assert.deepEqual(first.calls, [['b', 'a']]);
    const error = new Error('companion threw');
    handle.update({
      onQueryChange() {
        throw error;
      },
    });
    deliver(['c', 'b']);
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Valued', 'onQueryChange', error]]);
    handle.update({});
    deliver(['d', 'c']);
    assert.equal(first.calls.length, 1, 'omitted, so nothing is called');
  });

  it('runs the flush only while the mount is live', () => {
    let flushes = 0;
    const fake = fakeRuntime();
    const seam = createPublishedComponents({
      table: [VALUED],
      isReady: () => true,
      ...fake.runtime,
      flush: () => {
        flushes += 1;
      },
    });
    const handle = seam.publicApi.mount('Valued', { target: new FakeTarget(), props: {} });
    const [{ props: hostProps }] = fake.mounts;
    hostProps.flush();
    handle.destroy();
    hostProps.flush();
    assert.equal(flushes, 1);
  });
});

describe('handle.value', () => {
  it('answers undefined for a key that is not a value key, and after destroy', () => {
    const { handle } = mounted({ query: 'q', label: 'L' });
    assert.equal(handle.value('query'), 'q');
    assert.equal(handle.value('label'), undefined, 'a data key');
    assert.equal(handle.value('onQueryChange'), undefined);
    assert.equal(handle.value('missing'), undefined);
    handle.destroy();
    assert.equal(handle.value('query'), undefined);
  });

  it('answers undefined after a fault', async () => {
    const { handle, hostProps } = mounted({ query: 'q' });
    hostProps.onfault(new Error('render blew up'));
    assert.equal(handle.value('query'), undefined);
    await new Promise((done) => setTimeout(done, 0));
  });
});

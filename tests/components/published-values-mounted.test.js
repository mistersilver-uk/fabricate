/**
 * The published component seam's `value` kind on Fabricate's real Svelte runtime (issue 2453),
 * drawing the test-only probe into bare companion-owned targets with a `flush` that counts each
 * call: the one `on<Key>Change` call per change, the resync flushes around it, a transform or a
 * revert made inside the callback, `update`'s silence and its keep-current rule, two independent
 * values, `-0`, the no-content path, an effect's write, and the handle after `destroy`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { PROBE_ENTRY, PROBE_VALUE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER as ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM as SEAM,
  companionTarget,
  recordEscapes,
  settle,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-values-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: [...PUBLISHED_COMPILED_MODULES, PROBE],
  componentPath: PROBE,
});

let runtime;
let createPublishedComponents;
let probe;
let reports;
let escaped;
let targets;
let stopRecording;

before(async () => {
  await harness.setup();
  ({ publishedComponentRuntime: runtime } = await harness.loadRuneModule(ADAPTER));
  ({ createPublishedComponents } = await harness.loadRawModule(SEAM));
  probe = await harness.loadRuneModule(PROBE);
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** The probe mounted into a bare target over a counting `flush`, with what the suite reads of it. */
function mountProbe(props, entry = PROBE_ENTRY) {
  const flushes = { count: 0 };
  const seam = createPublishedComponents({
    table: [{ ...entry, component: probe.default }],
    ...runtime,
    flush() {
      flushes.count += 1;
      runtime.flush();
    },
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
  });
  const target = companionTarget(targets);
  const handle = seam.publicApi.mount('PublishedProbe', { target, props });
  return {
    seam,
    target,
    handle,
    flushes,
    query: () => target.querySelector('[data-probe-query]'),
    count: () => target.querySelector('[data-probe-count]'),
  };
}

/** Types `text` into `input` as the user does: the value, then one `input` event. */
function type(input, text) {
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** A change callback that hands each call's `(next, previous)` to `then`, after recording it. */
function changes(then = () => {}) {
  const { calls, record } = recorder();
  return {
    calls,
    record(next, previous) {
      record(next, previous);
      then(next, previous);
    },
  };
}

describe('a value key written by the component', () => {
  it('calls back once with (next, previous) and flushes once', async () => {
    const change = changes();
    const { handle, query, flushes } = mountProbe({ query: 'q', onQueryChange: change.record });
    await settle();
    assert.equal(query().value, 'q', 'drawn from the value passed');
    type(query(), 'qa');
    assert.deepEqual(change.calls, [['qa', 'q']]);
    assert.equal(flushes.count, 1, 'once, before the delivery');
    assert.equal(handle.value('query'), 'qa');
  });

  it('draws a transform made inside the callback at once, flushing twice and calling once', async () => {
    const held = {};
    const change = changes((next) =>
      held.handle.update({ query: next.toUpperCase(), onQueryChange: change.record })
    );
    const { handle, query, flushes } = mountProbe({ onQueryChange: change.record });
    held.handle = handle;
    await settle();
    type(query(), 'ab');
    assert.equal(query().value, 'AB', 'drawn before the event returns');
    assert.deepEqual(change.calls, [['ab', '']], 'the update called nothing back');
    assert.equal(flushes.count, 2);
    assert.equal(handle.value('query'), 'AB');
  });

  it('holds a revert to previous made inside the callback, in the DOM at once', async () => {
    const held = {};
    const change = changes((_next, previous) =>
      held.handle.update({ query: previous, onQueryChange: change.record })
    );
    const { handle, query, flushes } = mountProbe({
      query: 'keep',
      onQueryChange: change.record,
    });
    held.handle = handle;
    await settle();
    type(query(), 'keepx');
    assert.equal(query().value, 'keep', 'the input shows previous synchronously');
    assert.deepEqual(change.calls, [['keepx', 'keep']]);
    assert.equal(flushes.count, 2, 'the write, then the value put back');
    await settle();
    assert.equal(query().value, 'keep', 'and still after the next flush');
    assert.equal(handle.value('query'), 'keep');
  });

  it('does not loop on an echo: an update with the value it was called with', async () => {
    const held = {};
    const change = changes((next) =>
      held.handle.update({ query: next, onQueryChange: change.record })
    );
    const { handle, query, flushes } = mountProbe({ onQueryChange: change.record });
    held.handle = handle;
    await settle();
    type(query(), 'x');
    type(query(), 'xy');
    await settle();
    assert.deepEqual(change.calls, [
      ['x', ''],
      ['xy', 'x'],
    ]);
    assert.equal(flushes.count, 2, 'one per write, none after an echo');
    assert.equal(query().value, 'xy');
  });

  it('calls back for count moving from 0 to -0, which Object.is tells apart', async () => {
    const change = changes();
    const { handle, count } = mountProbe({ onCountChange: change.record });
    await settle();
    type(count(), '-0');
    assert.equal(change.calls.length, 1);
    const [[next, previous]] = change.calls;
    assert.ok(Object.is(next, -0) && Object.is(previous, 0), 'called with (-0, 0)');
    assert.ok(Object.is(handle.value('count'), -0));
  });

  it('reports each value apart, and the handle tracks both', async () => {
    const queried = changes();
    const counted = changes();
    const { handle, query, count } = mountProbe({
      onQueryChange: queried.record,
      onCountChange: counted.record,
    });
    await settle();
    type(count(), '3');
    type(query(), 'z');
    assert.deepEqual(counted.calls, [[3, 0]]);
    assert.deepEqual(queried.calls, [['z', '']]);
    assert.deepEqual([handle.value('query'), handle.value('count')], ['z', 3]);
  });
});

describe('a value key the companion sets', () => {
  it('draws an update silently, and keeps the value an update omits', async () => {
    const change = changes();
    const { handle, query, target } = mountProbe({ text: 'One', onQueryChange: change.record });
    await settle();
    type(query(), 'typed');
    assert.equal(handle.update({ text: 'Two', onQueryChange: change.record }), true);
    await settle();
    assert.equal(target.querySelector('.probe-text').textContent, 'Two');
    assert.equal(query().value, 'typed', 'an omitted value key keeps its value');
    assert.equal(handle.update({ query: undefined, onQueryChange: change.record }), true);
    await settle();
    assert.equal(query().value, 'typed', 'and so does undefined');
    assert.equal(handle.update({ query: 'set', onQueryChange: change.record }), true);
    await settle();
    assert.equal(query().value, 'set');
    assert.equal(handle.value('query'), 'set');
    assert.deepEqual(change.calls, [['typed', '']], 'mount and update never call back');
  });

  it('calls once with the right value after an update replaced the drawn props', async () => {
    const change = changes();
    const { handle, query } = mountProbe({ label: 'Find', onQueryChange: change.record });
    await settle();
    assert.equal(handle.update({ label: 'Search', onQueryChange: change.record }), true);
    await settle();
    type(query(), 'n');
    assert.deepEqual(change.calls, [['n', '']]);
    assert.equal(handle.value('query'), 'n', 'the setter is not tied to the first props object');
  });

  it('binds on the no-content path, where the host draws no content key', async () => {
    const change = changes();
    const { handle, query } = mountProbe(
      { query: 'bare', onQueryChange: change.record },
      PROBE_VALUE_ENTRY
    );
    await settle();
    assert.equal(query().value, 'bare');
    type(query(), 'bared');
    assert.deepEqual(change.calls, [['bared', 'bare']]);
    assert.equal(handle.value('query'), 'bared');
  });
});

describe('a value key written by an effect', () => {
  it('calls back once and flushes nothing', async () => {
    const change = changes();
    const { handle, flushes } = mountProbe({ onMirrorChange: change.record });
    await settle();
    assert.equal(handle.update({ mirrorAt: 'm', onMirrorChange: change.record }), true);
    await settle();
    assert.deepEqual(change.calls, [['m', '']]);
    assert.equal(flushes.count, 0, 'never inside an effect');
    assert.equal(handle.value('mirror'), 'm');
  });
});

describe('the value refusals and the dead handle', () => {
  it('throws M20 for a value that is not a primitive, and keeps the mount', async () => {
    const { handle, query } = mountProbe({ query: 'q' });
    for (const value of [{}, [], 1n]) {
      assert.throws(
        () => handle.update({ query: value }),
        (error) => error.message.endsWith('"query" must be a string, number, boolean or null')
      );
    }
    assert.throws(() => handle.update({ query: () => {} }), /"query" must not hold a function$/);
    await settle();
    assert.equal(query().value, 'q');
  });

  it('refuses at registration an entry whose change key collides with a key of its own', () => {
    const props = { ...PROBE_ENTRY.props, onQueryChange: { kind: 'callback' } };
    assert.throws(
      () =>
        createPublishedComponents({
          table: [{ ...PROBE_ENTRY, props, component: probe.default }],
          ...runtime,
        }),
      (error) =>
        error.constructor === Error &&
        error.message.endsWith(
          'PublishedProbe "onQueryChange" collides with the change callback of "query"'
        )
    );
  });

  it('answers undefined after destroy, and a write then calls and flushes nothing', async () => {
    const change = changes();
    const { handle, query, flushes } = mountProbe({ query: 'q', onQueryChange: change.record });
    await settle();
    const input = query();
    handle.destroy();
    assert.equal(handle.value('query'), undefined);
    assert.equal(handle.value('nothing'), undefined);
    type(input, 'late');
    assert.deepEqual(change.calls, []);
    assert.equal(flushes.count, 0);
  });
});

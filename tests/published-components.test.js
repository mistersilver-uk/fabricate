/**
 * The published component seam (issue 2426), driven through its factory with a fake runtime: the
 * frozen descriptor, every fixed refusal, replace-not-merge and atomic updates, destroy, the claim
 * on a target, and the fault path. The real Svelte runtime is the mounted suite's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';

const PREFIX = 'Fabricate | published components: ';
const FAULT_REPORT = 'Fabricate | Published component render failed:';
const HOST = Object.freeze({ role: 'host' });
const ZETA_COMPONENT = Object.freeze({ role: 'Zeta' });
const ALPHA_COMPONENT = Object.freeze({ role: 'Alpha' });

// Two entries out of alphabetical order, so `components` must keep table order.
const ZETA = Object.freeze({
  name: 'Zeta',
  path: 'src/ui/svelte/components/Zeta.svelte',
  version: 3,
  props: { label: { kind: 'data', required: true }, items: { kind: 'data' } },
  rest: true,
  component: ZETA_COMPONENT,
});
const ALPHA = Object.freeze({
  name: 'Alpha',
  path: 'src/ui/svelte/components/Alpha.svelte',
  version: 1,
  props: { value: { kind: 'data' } },
  rest: false,
  component: ALPHA_COMPONENT,
});
const TABLE = Object.freeze([ZETA, ALPHA]);

const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const exactly = (message) => new RegExp(`^${escape(message)}$`);

function refusal(tail) {
  return (error) => {
    assert.ok(error instanceof TypeError, `a TypeError, not ${error?.constructor?.name}`);
    assert.match(error.message, exactly(PREFIX + tail));
    return true;
  };
}

/** A DOM-shaped target: `nodeType` 1, children, and `contains`. */
class FakeTarget {
  nodeType = 1;
  childNodes = [];
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }
  contains(node) {
    return this.childNodes.includes(node);
  }
  replaceChildren() {
    this.childNodes.length = 0;
  }
}

/** A recording runtime: `mount` appends a root and captures the host's fault callback. */
function fakeRuntime({ mountError = null, faultDuringMount = null, unmountError = null } = {}) {
  const mounts = [];
  const unmounts = [];
  const reports = [];
  const runtime = {
    host: HOST,
    mount(host, { target, props }) {
      if (mountError) {
        target.childNodes.push({ role: 'partial' });
        throw mountError;
      }
      const instance = {
        target,
        root: { role: 'root' },
        updates: [],
        setProps(next) {
          instance.updates.push(next);
        },
      };
      target.childNodes.push(instance.root);
      mounts.push({ host, target, props, instance });
      if (faultDuringMount) props.onfault(faultDuringMount);
      return instance;
    },
    unmount(instance) {
      unmounts.push(instance);
      if (unmountError) throw unmountError;
      const at = instance.target.childNodes.indexOf(instance.root);
      if (at !== -1) instance.target.childNodes.splice(at, 1);
    },
    report: (...args) => {
      reports.push(args);
    },
  };
  return { runtime, mounts, unmounts, reports };
}

function seamWith({ table = TABLE, isReady = () => true, ...runtimeOptions } = {}) {
  const fake = fakeRuntime(runtimeOptions);
  const seam = createPublishedComponents({ table, isReady, ...fake.runtime });
  return { ...fake, seam, ui: seam.publicApi };
}

const zetaProps = (overrides = {}) => ({ label: 'Rank', items: [{ id: 'a' }], ...overrides });

describe('the published-components descriptor', () => {
  it('is frozen, with exactly its four members and schema version 1', () => {
    const { ui } = seamWith();
    assert.deepEqual(Object.keys(ui), ['schemaVersion', 'components', 'describe', 'mount']);
    assert.equal(ui.schemaVersion, 1);
    assert.ok(Object.isFrozen(ui));
  });

  it('lists the published names frozen and in table order, never sorted', () => {
    const { ui } = seamWith();
    assert.deepEqual(ui.components, ['Zeta', 'Alpha']);
    assert.ok(Object.isFrozen(ui.components));
  });

  it('describes an entry as a frozen version, data props and rest, with nothing else', () => {
    const { ui } = seamWith();
    const described = ui.describe('Zeta');
    assert.deepEqual(Object.keys(described), ['version', 'props', 'rest']);
    assert.deepEqual(described, {
      version: 3,
      props: { label: { kind: 'data', required: true }, items: { kind: 'data', required: false } },
      rest: true,
    });
    assert.ok(Object.isFrozen(described));
    assert.ok(Object.isFrozen(described.props));
    for (const spec of Object.values(described.props)) assert.ok(Object.isFrozen(spec));
    assert.deepEqual(ui.describe('Alpha'), {
      version: 1,
      props: { value: { kind: 'data', required: false } },
      rest: false,
    });
  });

  it('answers null for a name that is not published, inherited names included', () => {
    const { ui } = seamWith();
    for (const name of ['Nope', 'toString', '__proto__', undefined]) {
      assert.equal(ui.describe(name), null, String(name));
    }
  });

  it('is bound onto an api as the same object on every bind, without the test-only count', () => {
    const { seam, ui } = seamWith();
    const api = {};
    assert.equal(seam.bindPublicApi(api), api);
    assert.equal(api.ui, ui);
    seam.bindPublicApi(api);
    assert.equal(api.ui, ui, 'a rebind publishes the same object');
    assert.equal('liveMountCount' in ui, false);
  });
});

describe('mount refuses before it can draw', () => {
  it('M1: throws a plain Error until a runtime registers', () => {
    const seam = createPublishedComponents({ table: TABLE, isReady: () => true });
    assert.throws(
      () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.match(error.message, exactly(`${PREFIX}not registered`));
        return true;
      }
    );
    const { runtime } = fakeRuntime();
    seam.register({ ...runtime, components: { [ZETA.path]: ZETA_COMPONENT } });
    const handle = seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    assert.equal(handle.update(zetaProps()), true);
  });

  it('M2: throws before Fabricate is ready, reading the facade flag by default', () => {
    const { ui } = seamWith({ isReady: () => false });
    assert.throws(
      () => ui.mount('Zeta', { target: new FakeTarget() }),
      refusal('mount before ready')
    );
    const { runtime } = fakeRuntime();
    const seam = createPublishedComponents({ table: TABLE, ...runtime });
    const previous = globalThis.game;
    const setGame = (game) => Object.assign(globalThis, { game });
    try {
      setGame({ fabricate: { ready: false } });
      assert.throws(
        () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
        refusal('mount before ready')
      );
      globalThis.game.fabricate.ready = true;
      seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    } finally {
      setGame(previous);
    }
  });

  it('M3: refuses a name that is not published', () => {
    const { ui } = seamWith();
    for (const name of ['Nope', 'toString']) {
      assert.throws(
        () => ui.mount(name, { target: new FakeTarget() }),
        refusal(`"${name}" is not published`)
      );
    }
  });

  it('M4: refuses a target whose nodeType is not 1, and accepts any node of type 1', () => {
    const { ui } = seamWith();
    for (const target of [undefined, null, {}, { nodeType: 3 }, 'div']) {
      assert.throws(() => ui.mount('Zeta', { target }), refusal('target must be an element'));
    }
    assert.throws(() => ui.mount('Zeta'), refusal('target must be an element'));
    // Not an `Element`: a detached V14 window's element fails `instanceof` against this realm.
    const foreign = new FakeTarget();
    assert.equal(
      ui.mount('Zeta', { target: foreign, props: zetaProps() }).update(zetaProps()),
      true
    );
  });

  it('M4: asks the injected element check', () => {
    const allowed = new FakeTarget();
    const { runtime } = fakeRuntime();
    const seam = createPublishedComponents({
      table: TABLE,
      isReady: () => true,
      isElement: (target) => target === allowed,
      ...runtime,
    });
    assert.throws(
      () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
      refusal('target must be an element')
    );
    seam.publicApi.mount('Zeta', { target: allowed, props: zetaProps() });
  });

  it('M5: refuses a target holding a live mount and leaves that mount live', () => {
    const { ui, unmounts } = seamWith();
    const target = new FakeTarget();
    const first = ui.mount('Zeta', { target, props: zetaProps() });
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target already holds a published component')
    );
    assert.equal(unmounts.length, 0);
    assert.equal(first.update(zetaProps({ label: 'Still' })), true);
  });

  it('M6: refuses a target that is not empty', () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    target.childNodes.push({ role: 'companion text' });
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target must be empty')
    );
    assert.equal(mounts.length, 0);
  });

  it('M7: refuses props that are not a plain object, and accepts a foreign-realm plain one', () => {
    const { ui, mounts } = seamWith();
    class Props {}
    for (const props of [null, [], 'x', 3, new Props(), new Map(), Object.create({})]) {
      assert.throws(
        () => ui.mount('Alpha', { target: new FakeTarget(), props }),
        refusal('props must be a plain object')
      );
    }
    assert.equal(mounts.length, 0);
    const foreignRealm = Object.create(Object.create(null));
    foreignRealm.value = 1;
    ui.mount('Alpha', { target: new FakeTarget(), props: foreignRealm });
    ui.mount('Alpha', { target: new FakeTarget(), props: Object.assign(Object.create(null), {}) });
    ui.mount('Alpha', { target: new FakeTarget() });
    assert.equal(mounts.length, 3);
  });

  it('M8: refuses a key the entry does not publish, and a data attribute when it has no rest', () => {
    const { ui } = seamWith();
    assert.throws(
      () => ui.mount('Alpha', { target: new FakeTarget(), props: { colour: 'red' } }),
      refusal('"colour" is not a prop of Alpha')
    );
    assert.throws(
      () => ui.mount('Alpha', { target: new FakeTarget(), props: { 'data-x': 'y' } }),
      refusal('"data-x" is not a prop of Alpha')
    );
  });

  it('M9: refuses a required prop that is absent or empty', () => {
    const { ui } = seamWith();
    for (const props of [{}, { label: '' }, { label: undefined }]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props }),
        refusal('Zeta requires a non-empty "label"')
      );
    }
  });

  it('M10: refuses a function at any depth', () => {
    const { ui } = seamWith();
    for (const props of [
      zetaProps({ label: () => 'x' }),
      zetaProps({ items: [{ id: 'a', render() {} }] }),
      zetaProps({ 'data-x': () => 1 }),
    ]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props }),
        refusal('functions are phase 2 (issue 2427)')
      );
    }
  });

  it('M11: refuses a value that is not a primitive, plain object or array', () => {
    const { ui } = seamWith();
    class Row {}
    for (const value of [new Date(), new Map(), new Row(), [new Set()], { nested: new Row() }]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items: value }) }),
        refusal('"items" must be data')
      );
    }
  });

  it('M12: refuses a cycle, while a shared reference is plain data', () => {
    const { ui, mounts } = seamWith();
    const loop = { id: 'a' };
    loop.self = loop;
    const ring = [];
    ring.push([ring]);
    for (const items of [loop, ring, [{ child: loop }]]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items }) }),
        refusal('"items" holds a cycle')
      );
    }
    const shared = { id: 'shared' };
    ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items: [shared, shared] }) });
    assert.equal(mounts.length, 1);
  });

  it('M13: refuses a rest key that is not a data attribute holding a scalar', () => {
    const { ui } = seamWith();
    for (const [key, value] of [
      ['aria-label', 'x'],
      ['data-Upper', 'x'],
      ['data-', 'x'],
      ['data-x', null],
      ['data-x', { a: 1 }],
      ['data-x', ['a']],
    ]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ [key]: value }) }),
        refusal(`"${key}" is not a data attribute`)
      );
    }
  });

  it('accepts data attributes on an entry with rest, and passes them through', () => {
    const { ui, mounts } = seamWith();
    const props = zetaProps({ 'data-rank': 2, 'data-open': true, 'data-tag-name': 'x' });
    ui.mount('Zeta', { target: new FakeTarget(), props });
    assert.deepEqual(mounts[0].props.initial, props);
  });
});

describe('a live mount', () => {
  it('hands the runtime the host, the entry component and a copy of the props', () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    const props = zetaProps();
    const handle = ui.mount('Zeta', { target, props });
    const [{ host, props: hostProps }] = mounts;
    assert.equal(host, HOST);
    assert.equal(hostProps.component, ZETA_COMPONENT);
    assert.deepEqual(Object.keys(hostProps), ['component', 'initial', 'onfault']);
    assert.deepEqual(hostProps.initial, props);
    assert.notEqual(hostProps.initial, props);
    assert.notEqual(hostProps.initial.items, props.items, 'copied at every depth');
    props.items[0].id = 'mutated';
    assert.equal(hostProps.initial.items[0].id, 'a', 'copied at call time');
    assert.deepEqual(Object.keys(handle), ['update', 'destroy']);
    assert.ok(Object.isFrozen(handle));
  });

  it('replaces the props on update rather than merging them', () => {
    const { ui, mounts } = seamWith();
    const handle = ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    assert.equal(handle.update({ label: 'Only' }), true);
    const [{ instance }] = mounts;
    assert.deepEqual(instance.updates, [{ label: 'Only' }]);
    assert.equal(Object.hasOwn(instance.updates[0], 'items'), false);
    assert.equal(mounts.length, 1, 'nothing remounts');
  });

  it('applies an update atomically: a refused one leaves the previous props rendered', () => {
    const { ui, mounts } = seamWith();
    const handle = ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    const loop = {};
    loop.loop = loop;
    const refusals = [
      [null, 'props must be a plain object'],
      [zetaProps({ 'aria-x': 'y' }), '"aria-x" is not a data attribute'],
      [{ items: [] }, 'Zeta requires a non-empty "label"'],
      [zetaProps({ items: [() => 1] }), 'functions are phase 2 (issue 2427)'],
      [zetaProps({ items: new Date() }), '"items" must be data'],
      [zetaProps({ items: loop }), '"items" holds a cycle'],
    ];
    for (const [props, tail] of refusals) {
      assert.throws(() => handle.update(props), refusal(tail));
    }
    const alpha = ui.mount('Alpha', { target: new FakeTarget(), props: { value: 1 } });
    assert.throws(() => alpha.update({ extra: 1 }), refusal('"extra" is not a prop of Alpha'));
    assert.deepEqual(mounts[0].instance.updates, []);
    assert.deepEqual(mounts[1].instance.updates, []);
    assert.equal(handle.update(zetaProps({ label: 'Next' })), true);
    assert.equal(mounts[0].instance.updates.length, 1);
  });

  it('destroys idempotently: one unmount, a released claim, and updates answering false', () => {
    const { seam, ui, unmounts } = seamWith();
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    handle.destroy();
    handle.destroy();
    handle.destroy();
    assert.equal(unmounts.length, 1);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(handle.update(null), false, 'a dead handle answers false before validating');
    assert.equal(seam.liveMountCount(), 0);
    const again = ui.mount('Zeta', { target, props: zetaProps() });
    assert.equal(again.update(zetaProps()), true, 'the target can be mounted again');
  });

  it('releases the claim even when the runtime unmount throws, reporting that throw', () => {
    const error = new Error('teardown threw');
    const { ui, reports } = seamWith({ unmountError: error });
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    handle.destroy();
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(handle.update(zetaProps()), false);
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target must be empty'),
      'the leftover root is content, not a held claim'
    );
  });

  it('supersedes a stale claim whose root has left the target, then checks emptiness', () => {
    const { ui, unmounts, mounts } = seamWith();
    const target = new FakeTarget();
    const stale = ui.mount('Zeta', { target, props: zetaProps() });
    target.childNodes.length = 0;
    const fresh = ui.mount('Zeta', { target, props: zetaProps() });
    assert.equal(unmounts.length, 1);
    assert.equal(unmounts[0], mounts[0].instance);
    assert.equal(stale.update(zetaProps()), false);
    assert.equal(fresh.update(zetaProps()), true);

    const replaced = new FakeTarget();
    const old = ui.mount('Zeta', { target: replaced, props: zetaProps() });
    replaced.childNodes[0] = { role: 'companion re-render' };
    assert.throws(
      () => ui.mount('Zeta', { target: replaced, props: zetaProps() }),
      refusal('target must be empty')
    );
    assert.equal(old.update(zetaProps()), false, 'the stale entry was destroyed first');
  });

  it('counts live mounts back to zero after mounts and destroys', () => {
    const { seam, ui } = seamWith();
    const handles = Array.from({ length: 5 }, () =>
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() })
    );
    assert.equal(seam.liveMountCount(), 5);
    for (const handle of handles) handle.destroy();
    assert.equal(seam.liveMountCount(), 0);
  });
});

describe('a faulted mount', () => {
  it('reports once, unmounts once, releases the claim and goes inert', () => {
    const { seam, ui, mounts, unmounts, reports } = seamWith();
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    const error = new Error('render blew up');
    mounts[0].props.onfault(error);
    mounts[0].props.onfault(new Error('a second fault'));
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(unmounts.length, 1);
    assert.equal(target.childNodes.length, 0);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(handle.update(zetaProps()), false);
    handle.destroy();
    assert.equal(unmounts.length, 1, 'destroy after a fault unmounts nothing more');
    assert.equal(seam.liveMountCount(), 0);
    assert.equal(ui.mount('Zeta', { target, props: zetaProps() }).update(zetaProps()), true);
  });

  it('defers the unmount to a microtask when the fault arrives inside the runtime call', async () => {
    const error = new Error('during mount');
    const { seam, ui, unmounts, reports } = seamWith({ faultDuringMount: error });
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(seam.liveMountCount(), 0);
    assert.equal(unmounts.length, 0);
    await Promise.resolve();
    assert.equal(unmounts.length, 1);
    assert.equal(target.childNodes.length, 0);
  });

  it('reports a synchronous runtime throw and answers an inert handle on an empty target', () => {
    const error = new Error('runtime refused');
    const { seam, ui, unmounts, reports } = seamWith({ mountError: error });
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.deepEqual(Object.keys(handle), ['update', 'destroy']);
    assert.ok(Object.isFrozen(handle));
    assert.equal(handle.update(zetaProps()), false);
    handle.destroy();
    assert.equal(unmounts.length, 0);
    assert.equal(target.childNodes.length, 0);
    assert.equal(seam.liveMountCount(), 0);
  });
});

describe('registration', () => {
  it('refuses a manifest entry with a non-data prop kind, naming phase 2', () => {
    const snippet = { ...ALPHA, props: { body: { kind: 'snippet' } } };
    const seam = createPublishedComponents({ table: [snippet], isReady: () => true });
    assert.throws(
      () => seam.register({ ...fakeRuntime().runtime, components: {} }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.match(
          error.message,
          exactly(`${PREFIX}Alpha "body" is a snippet prop; only data props ship before issue 2427`)
        );
        return true;
      }
    );
    assert.throws(
      () => seam.publicApi.mount('Alpha', { target: new FakeTarget() }),
      (error) => exactly(`${PREFIX}not registered`).test(error.message)
    );
  });

  it('refuses a second registration, keeping the first runtime', () => {
    const { seam, ui, mounts } = seamWith();
    const second = fakeRuntime();
    assert.throws(
      () => seam.register({ ...second.runtime, components: {} }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.match(error.message, exactly(`${PREFIX}already registered`));
        return true;
      }
    );
    ui.mount('Alpha', { target: new FakeTarget(), props: { value: 1 } });
    assert.equal(mounts.length, 1, 'the first runtime still mounts');
    assert.equal(second.mounts.length, 0);
  });

  it('treats only a boolean true as required', () => {
    const loose = { ...ALPHA, props: { value: { kind: 'data', required: 'yes' } } };
    const { ui } = seamWith({ table: [loose] });
    assert.deepEqual(ui.describe('Alpha').props.value, { kind: 'data', required: false });
    ui.mount('Alpha', { target: new FakeTarget(), props: {} });
  });
});

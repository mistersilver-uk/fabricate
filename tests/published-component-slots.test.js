/**
 * The published component seam's content slots (issue 2451), driven through its factory with the
 * fake runtime: the `slot` kind and M15, the slot element's creation, life and removal,
 * `handle.slot`, the teardown of mounts nested in a slot element, a runtime `unmount` that
 * rejects, and the required ancestor root with M16. The real Svelte runtime is
 * `components/published-slots-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  FAULT_REPORT,
  FakeTarget,
  ZETA,
  drained,
  fakeDocument,
  refusal,
  seamWith,
  zetaProps,
} from './helpers/publishedComponentFakes.js';

// A `<div>` and a `<span>` content slot beside a `text` and a `data` key.
const PANEL = Object.freeze({
  name: 'Panel',
  path: 'src/ui/svelte/components/Panel.svelte',
  version: 1,
  props: {
    title: { kind: 'text' },
    body: { kind: 'slot' },
    aside: { kind: 'slot', element: 'span' },
    rank: { kind: 'data' },
  },
  rest: true,
  root: 'any',
  component: Object.freeze({ role: 'Panel' }),
});

const panelSeam = (options = {}) => seamWith({ table: [PANEL, ZETA], ...options });

/** A seam and a target whose document logs each `remove()` into the runtime's `events`. */
function logged(options = {}) {
  const fake = panelSeam(options);
  const document = fakeDocument(fake.events);
  const targetIn = (parent = null) => {
    const target = new FakeTarget('div', document);
    parent?.append(target);
    return target;
  };
  return { ...fake, document, targetIn };
}

describe('a slot key', () => {
  it('M15: refuses a value that is not a boolean, and creates nothing', () => {
    const { ui, mounts } = panelSeam();
    for (const value of [3, 'yes', '', null, { on: true }, [true]]) {
      for (const key of ['body', 'aside']) {
        const target = new FakeTarget();
        assert.throws(
          () => ui.mount('Panel', { target, props: { [key]: value } }),
          refusal(`"${key}" is a slot and takes true or false`)
        );
        assert.equal(target.ownerDocument.created.length, 0);
      }
    }
    assert.equal(mounts.length, 0);
  });

  it('M10: refuses a function, as on a data key', () => {
    const { ui } = panelSeam();
    assert.throws(
      () => ui.mount('Panel', { target: new FakeTarget(), props: { body: () => true } }),
      refusal('"body" must not hold a function')
    );
  });

  it('reads undefined, false and absence as not requested, so no element is created', () => {
    const { ui, mounts } = panelSeam();
    for (const props of [{}, { body: undefined }, { body: false, aside: false }]) {
      const target = new FakeTarget();
      const handle = ui.mount('Panel', { target, props });
      assert.equal(target.ownerDocument.created.length, 0);
      assert.equal(handle.slot('body'), null);
      assert.deepEqual(mounts.at(-1).props.initial, props, 'each value reaches the host as passed');
      assert.deepEqual(mounts.at(-1).instance.slotsAtMount, { body: null, aside: null });
    }
  });

  it('hands the host each key that is not data by its kind, frozen', () => {
    const { ui, mounts } = panelSeam();
    ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    const [{ props: hostProps }] = mounts;
    assert.deepEqual(hostProps.kinds, { title: 'text', body: 'slot', aside: 'slot' });
    assert.ok(Object.isFrozen(hostProps.kinds));
    assert.deepEqual(
      hostProps.initial,
      { body: true },
      'a requested slot reaches the host as true'
    );
  });

  it("creates each requested element from the target's document, before the runtime mounts", () => {
    const { ui, mounts } = panelSeam();
    const target = new FakeTarget();
    const handle = ui.mount('Panel', { target, props: { body: true, aside: true } });
    const [body, aside] = target.ownerDocument.created;
    assert.equal(target.ownerDocument.created.length, 2);
    assert.equal(body.localName, 'div', 'a <div> by default');
    assert.equal(aside.localName, 'span', "the entry's own element");
    for (const element of [body, aside]) {
      assert.deepEqual(element.style, { display: 'contents' });
      assert.equal(element.parentNode, null, 'the host attaches it, not the seam');
    }
    assert.equal(handle.slot('body'), body);
    assert.equal(handle.slot('aside'), aside);
    const { slotsAtMount } = mounts[0].instance;
    assert.equal(slotsAtMount.body, body, "the host's slots answers it inside the runtime's mount");
    assert.equal(slotsAtMount.aside, aside);
  });

  it('answers null for a key never requested, and for a key that is no slot', () => {
    const { ui } = panelSeam();
    const handle = ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    for (const key of ['aside', 'title', 'rank', 'nope', 'toString', undefined]) {
      assert.equal(handle.slot(key), null, String(key));
    }
  });

  it('creates an element first requested by update before setProps, and keeps it thereafter', () => {
    const { ui, mounts } = panelSeam();
    const target = new FakeTarget();
    const handle = ui.mount('Panel', { target, props: {} });
    const [{ instance, props: hostProps }] = mounts;
    assert.equal(handle.update({ body: true }), true);
    const [body] = target.ownerDocument.created;
    assert.equal(handle.slot('body'), body);
    assert.equal(instance.slotsAtUpdate[0].body, body, 'in place inside setProps');
    assert.equal(handle.update({ body: false }), true);
    assert.equal(handle.slot('body'), body, 'still that element while it is not requested');
    assert.equal(hostProps.slots('body'), body);
    assert.equal(body.removals, 0, 'the host detaches it, not the seam');
    assert.equal(handle.update({ body: true, title: 'Again' }), true);
    assert.equal(handle.slot('body'), body, 'the same element once requested again');
    assert.equal(target.ownerDocument.created.length, 1, 'created once');
    assert.deepEqual(instance.updates, [
      { body: true },
      { body: false },
      { body: true, title: 'Again' },
    ]);
  });

  it('applies an update atomically: a refused one creates no element and renders nothing', () => {
    const { ui, mounts } = panelSeam();
    const target = new FakeTarget();
    const handle = ui.mount('Panel', { target, props: {} });
    assert.throws(
      () => handle.update({ body: 'yes' }),
      refusal('"body" is a slot and takes true or false')
    );
    assert.throws(
      () => handle.update({ body: true, title: 7 }),
      refusal('"title" must be a string')
    );
    assert.throws(
      () => handle.update({ body: true, 'aria-x': 'y' }),
      refusal('"aria-x" is not a data attribute')
    );
    assert.equal(target.ownerDocument.created.length, 0);
    assert.equal(handle.slot('body'), null);
    assert.deepEqual(mounts[0].instance.updates, []);
  });

  it('answers null from slot after destroy, after a fault, and on the inert handle', async () => {
    const destroyed = panelSeam();
    const first = destroyed.ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    assert.notEqual(first.slot('body'), null);
    first.destroy();
    assert.equal(first.slot('body'), null);

    const faulted = panelSeam();
    const second = faulted.ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    faulted.mounts[0].props.onfault(new Error('render blew up'));
    assert.equal(second.slot('body'), null);
    assert.equal(faulted.mounts[0].props.slots('body'), null, "and from the host's slots");

    const refused = panelSeam({ mountError: new Error('runtime refused') });
    const inert = refused.ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    assert.deepEqual(Object.keys(inert), ['update', 'destroy', 'slot', 'value']);
    assert.equal(inert.slot('body'), null);
    await drained();
  });

  it('answers null from slot inside the unmount that destroy runs', () => {
    const seen = [];
    const mounted = {};
    const { ui } = panelSeam({
      onUnmount: () => {
        seen.push(mounted.handle.slot('body'));
      },
    });
    mounted.handle = ui.mount('Panel', { target: new FakeTarget(), props: { body: true } });
    mounted.handle.destroy();
    assert.deepEqual(seen, [null]);
  });
});

describe('a slot element at the end of its mount', () => {
  const requested = { body: true, aside: true };
  const removalsOf = (target) => target.ownerDocument.created.map((element) => element.removals);

  it('is removed after the unmount on destroy', () => {
    const { ui, events, targetIn } = logged();
    const target = targetIn();
    const handle = ui.mount('Panel', { target, props: requested });
    target.append(handle.slot('body'));
    handle.destroy();
    assert.deepEqual(events, ['unmount', 'remove', 'remove']);
    assert.deepEqual(removalsOf(target), [1, 1]);
    assert.ok(!target.contains(target.ownerDocument.created[0]), 'it has left the target');
    handle.destroy();
    assert.deepEqual(removalsOf(target), [1, 1], 'a second destroy removes nothing more');
  });

  it('is removed after the unmount on a boundary fault', () => {
    const { ui, mounts, events, targetIn } = logged();
    const target = targetIn();
    ui.mount('Panel', { target, props: requested });
    mounts[0].props.onfault(new Error('render blew up'));
    assert.deepEqual(events, ['unmount', 'remove', 'remove']);
    assert.deepEqual(removalsOf(target), [1, 1]);
  });

  it('is removed after the deferred unmount on a fault inside the runtime call', async () => {
    const { ui, events, targetIn } = logged({ faultDuringMount: new Error('during mount') });
    const target = targetIn();
    ui.mount('Panel', { target, props: requested });
    assert.deepEqual(events, [], 'nothing before the microtask');
    await drained();
    assert.deepEqual(events, ['unmount', 'remove', 'remove']);
    assert.deepEqual(removalsOf(target), [1, 1]);
  });

  it('is removed on a synchronous runtime throw, which has no instance to unmount', async () => {
    const { ui, events, targetIn } = logged({ mountError: new Error('runtime refused') });
    const target = targetIn();
    ui.mount('Panel', { target, props: requested });
    assert.deepEqual(events, ['remove', 'remove']);
    assert.deepEqual(removalsOf(target), [1, 1]);
    await drained();
    assert.deepEqual(removalsOf(target), [1, 1]);
  });
});

describe('a mount nested in a slot element', () => {
  /** An outer `Panel` with its `body` requested, and a `Zeta` mounted by `place(slot)`'s target. */
  function nested(place, options = {}) {
    const fake = logged(options);
    const outerTarget = fake.targetIn();
    const outer = fake.ui.mount('Panel', { target: outerTarget, props: { body: true } });
    const slot = outer.slot('body');
    const innerFaults = [];
    const inner = fake.ui.mount('Zeta', {
      target: place(slot, fake),
      props: zetaProps(),
      onFault: (error) => {
        innerFaults.push(error);
      },
    });
    return { ...fake, outer, inner, slot, innerFaults };
  }

  const PLACES = [
    ['a child of the slot element', (slot, { targetIn }) => targetIn(slot)],
    ['a grandchild of the slot element', (slot, { targetIn }) => targetIn(targetIn(slot))],
    ['the slot element itself', (slot) => slot],
  ];
  for (const [where, place] of PLACES) {
    it(`is ended before the outer unmount when its target is ${where}`, () => {
      const { seam, outer, inner, slot, mounts, unmounts, events } = nested(place);
      assert.equal(seam.liveMountCount(), 2);
      outer.destroy();
      assert.deepEqual(events, ['unmount', 'unmount', 'remove']);
      assert.equal(unmounts[0], mounts[1].instance, 'the nested mount first');
      assert.equal(unmounts[1], mounts[0].instance);
      assert.equal(slot.removals, 1, 'then the slot element is removed');
      assert.equal(inner.update(zetaProps()), false);
      assert.equal(seam.liveMountCount(), 0);
      inner.destroy();
      assert.equal(unmounts.length, 2, 'a dead nested handle unmounts nothing more');
    });
  }

  it('leaves a mount outside the slot element live', () => {
    const { seam, ui, outer, targetIn, unmounts } = nested((slot, { targetIn: make }) =>
      make(slot)
    );
    const beside = ui.mount('Zeta', { target: targetIn(), props: zetaProps() });
    const sibling = ui.mount('Panel', { target: targetIn(), props: { body: true } });
    outer.destroy();
    assert.equal(unmounts.length, 2);
    assert.equal(beside.update(zetaProps()), true);
    assert.notEqual(sibling.slot('body'), null);
    assert.equal(seam.liveMountCount(), 2);
  });

  it('ends three levels innermost first, each slot element after its own unmount', () => {
    const { seam, ui, events, mounts, unmounts, targetIn } = logged();
    const a = ui.mount('Panel', { target: targetIn(), props: { body: true } });
    const b = ui.mount('Panel', { target: targetIn(a.slot('body')), props: { body: true } });
    mounts[1].target.append(b.slot('body'));
    const c = ui.mount('Zeta', { target: targetIn(b.slot('body')), props: zetaProps() });
    a.destroy();
    assert.deepEqual(
      unmounts,
      [mounts[2].instance, mounts[1].instance, mounts[0].instance],
      'innermost first'
    );
    assert.deepEqual(events, ['unmount', 'unmount', 'remove', 'unmount', 'remove']);
    assert.equal(b.slot('body'), null);
    assert.equal(c.update(zetaProps()), false);
    assert.equal(seam.liveMountCount(), 0);
  });

  it('is ended, not faulted, when the outer mount faults: its own onFault is never called', async () => {
    const outerFaults = [];
    const fake = logged();
    const outer = fake.ui.mount('Panel', {
      target: fake.targetIn(),
      props: { body: true },
      onFault: (error) => {
        outerFaults.push(error);
      },
    });
    const innerFaults = [];
    const inner = fake.ui.mount('Zeta', {
      target: fake.targetIn(outer.slot('body')),
      props: zetaProps(),
      onFault: (error) => {
        innerFaults.push(error);
      },
    });
    const error = new Error('render blew up');
    fake.mounts[0].props.onfault(error);
    assert.deepEqual(fake.events, ['unmount', 'unmount', 'remove']);
    assert.equal(fake.unmounts[0], fake.mounts[1].instance, 'the nested mount first');
    await drained();
    assert.deepEqual(outerFaults, [error]);
    assert.deepEqual(innerFaults, []);
    assert.deepEqual(fake.reports, [[FAULT_REPORT, 'Panel', error]]);
    assert.equal(inner.update(zetaProps()), false);
    assert.equal(fake.seam.liveMountCount(), 0);
  });

  it('still ends the outer mount when the nested mount own unmount throws', async () => {
    const unmountError = new Error('unmount threw');
    const fake = logged({ unmountError });
    const outer = fake.ui.mount('Panel', { target: fake.targetIn(), props: { body: true } });
    const slot = outer.slot('body');
    fake.ui.mount('Zeta', { target: fake.targetIn(slot), props: zetaProps() });
    assert.doesNotThrow(() => outer.destroy());
    await drained();
    assert.equal(fake.unmounts.length, 2, 'both mounts were unmounted');
    assert.equal(slot.parentNode, null, 'the slot element was removed');
    assert.equal(fake.reports.length, 2, 'one report each');
    assert.equal(fake.seam.liveMountCount(), 0);
  });
});

describe('a runtime whose unmount returns a rejected Promise', () => {
  const teardown = new Error('teardown rejected');
  const rejecting = (options = {}) =>
    seamWith({ unmountResult: () => Promise.reject(teardown), ...options });

  let unhandled;
  const recordUnhandled = (reason) => {
    unhandled.push(reason);
  };
  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', recordUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', recordUnhandled);
  });

  it('reports the rejection once after destroy, with the claim released', async () => {
    const { seam, ui, reports } = rejecting();
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    handle.destroy();
    assert.deepEqual(reports, [], 'a rejection is reported a microtask later');
    assert.equal(seam.liveMountCount(), 0);
    await drained();
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', teardown]]);
    assert.deepEqual(unhandled, []);
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target must be empty'),
      'the leftover root is content, not a held claim'
    );
  });

  it('reports the fault and the rejection before onFault on a boundary fault, the target empty', async () => {
    const { ui, mounts, reports } = rejecting();
    const target = new FakeTarget();
    const seen = [];
    const onFault = () => {
      seen.push({ children: target.childNodes.length, reports: reports.length });
    };
    ui.mount('Zeta', { target, props: zetaProps(), onFault });
    const error = new Error('render blew up');
    mounts[0].props.onfault(error);
    assert.equal(target.childNodes.length, 0, 'emptied as the unmount call returns');
    await drained();
    assert.deepEqual(reports, [
      [FAULT_REPORT, 'Zeta', error],
      [FAULT_REPORT, 'Zeta', teardown],
    ]);
    assert.deepEqual(seen, [{ children: 0, reports: 2 }]);
    assert.deepEqual(unhandled, []);
  });

  it('finds the target empty in onFault on a fault inside the runtime call', async () => {
    const error = new Error('during mount');
    const { ui, reports } = rejecting({ faultDuringMount: error });
    const target = new FakeTarget();
    const seen = [];
    const onFault = () => {
      seen.push(target.childNodes.length);
    };
    ui.mount('Zeta', { target, props: zetaProps(), onFault });
    await drained();
    assert.deepEqual(seen, [0]);
    assert.deepEqual(reports, [
      [FAULT_REPORT, 'Zeta', error],
      [FAULT_REPORT, 'Zeta', teardown],
    ]);
    assert.deepEqual(unhandled, []);
  });

  it('leaves a mount made into the target after the faulted unmount returned in place', async () => {
    const { ui, mounts } = rejecting();
    const target = new FakeTarget();
    ui.mount('Zeta', { target, props: zetaProps() });
    mounts[0].props.onfault(new Error('render blew up'));
    const again = ui.mount('Zeta', { target, props: zetaProps({ label: 'Again' }) });
    await drained();
    assert.equal(target.childNodes.length, 1, 'the rejection handler empties nothing');
    assert.equal(target.firstChild, mounts[1].instance.root);
    assert.equal(again.update(zetaProps()), true);
    assert.deepEqual(unhandled, []);
  });

  it('skips a return that is no thenable', async () => {
    // ratchet-exempt(lint): a `then` that is no function is the return under test.
    const thenIsNoFunction = { then: true };
    for (const result of [null, 0, 'done', {}, thenIsNoFunction]) {
      const { ui, mounts, reports } = seamWith({ unmountResult: () => result });
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }).destroy();
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
      mounts[1].props.onfault(new Error('render blew up'));
      await drained();
      assert.equal(reports.length, 1, 'only the fault itself is reported');
    }
    assert.deepEqual(unhandled, []);
  });
});

describe('M16: the required ancestor root', () => {
  const WINDOWED = Object.freeze({ ...PANEL, name: 'Windowed', root: 'fabricate' });
  const MANAGED = Object.freeze({ ...PANEL, name: 'Managed', root: 'manager' });
  const WINDOW = 'Windowed needs a Fabricate window ancestor';
  const MANAGER = 'Managed needs a Fabricate manager ancestor';

  /** A seam whose `hasAncestor` answers from `rooted`, logging each question in `asked`. */
  function rootedSeam(options = {}) {
    const asked = [];
    const rooted = new Set();
    const hasAncestor = (target, selector) => {
      asked.push([target, selector]);
      return rooted.has(target);
    };
    const fake = seamWith({ table: [PANEL, ZETA, WINDOWED, MANAGED], hasAncestor, ...options });
    const under = (parent = null) => {
      const target = new FakeTarget();
      parent?.append(target);
      return target;
    };
    return { ...fake, asked, rooted, under };
  }

  it('refuses a target outside the root, asking for the selector of that root', () => {
    const { ui, asked, mounts, under } = rootedSeam();
    const first = under();
    assert.throws(() => ui.mount('Windowed', { target: first }), refusal(WINDOW));
    const second = under();
    assert.throws(() => ui.mount('Managed', { target: second }), refusal(MANAGER));
    assert.deepEqual(asked, [
      [first, '.fabricate'],
      [second, '.fabricate-manager'],
    ]);
    assert.equal(mounts.length, 0);
    assert.equal(first.ownerDocument.created.length, 0, 'no slot element for a refused mount');
  });

  it('mounts a target inside the root', () => {
    const { ui, rooted, under } = rootedSeam();
    for (const name of ['Windowed', 'Managed']) {
      const target = under();
      rooted.add(target);
      assert.equal(ui.mount(name, { target, props: {} }).update({}), true);
    }
  });

  it('never asks for an ancestor of an entry whose root is any', () => {
    const { ui, asked, under } = rootedSeam();
    ui.mount('Panel', { target: under(), props: { body: true } });
    ui.mount('Zeta', { target: under(), props: zetaProps() });
    assert.deepEqual(asked, []);
  });

  it('follows M4, and precedes M5, M6 and M7', () => {
    const { ui, asked, under } = rootedSeam();
    assert.throws(() => ui.mount('Windowed', { target: {} }), refusal('target must be an element'));
    assert.deepEqual(asked, [], 'M4 first');
    const held = under();
    ui.mount('Zeta', { target: held, props: zetaProps() });
    assert.throws(() => ui.mount('Windowed', { target: held }), refusal(WINDOW), 'before M5');
    const full = under();
    full.childNodes.push({ role: 'companion text' });
    assert.throws(() => ui.mount('Windowed', { target: full }), refusal(WINDOW), 'before M6');
    assert.throws(
      () => ui.mount('Windowed', { target: under(), props: null }),
      refusal(WINDOW),
      'before M7'
    );
  });

  it("leaves a stale claim's mount live when it refuses", () => {
    const { ui, unmounts, under } = rootedSeam();
    const target = under();
    const stale = ui.mount('Zeta', { target, props: zetaProps() });
    target.childNodes.length = 0;
    assert.throws(() => ui.mount('Windowed', { target }), refusal(WINDOW));
    assert.equal(unmounts.length, 0, 'the refusal came before the claim was superseded');
    assert.equal(stale.update(zetaProps()), true);
  });

  it("judges a target inside a detached slot element by its owner's target", () => {
    const { ui, asked, rooted, under } = rootedSeam();
    const inside = under();
    rooted.add(inside);
    const outer = ui.mount('Panel', { target: inside, props: { body: true } });
    const nested = under(outer.slot('body'));
    assert.equal(ui.mount('Windowed', { target: nested, props: {} }).update({}), true);
    assert.deepEqual(asked, [
      [nested, '.fabricate'],
      [inside, '.fabricate'],
    ]);

    const outside = ui.mount('Panel', { target: under(), props: { body: true } });
    assert.throws(
      () => ui.mount('Windowed', { target: under(outside.slot('body')) }),
      refusal(WINDOW),
      "refused when the owner's target is outside the root too"
    );
    assert.throws(
      () => ui.mount('Managed', { target: outside.slot('body') }),
      refusal(MANAGER),
      'and when the target is the slot element itself'
    );
  });

  it('judges two levels of detached slot elements by the outermost target', () => {
    const { ui, asked, rooted, under } = rootedSeam();
    const top = under();
    rooted.add(top);
    const a = ui.mount('Panel', { target: top, props: { body: true } });
    const middle = under(a.slot('body'));
    const b = ui.mount('Panel', { target: middle, props: { body: true } });
    const inner = under(b.slot('body'));
    assert.equal(ui.mount('Managed', { target: inner, props: {} }).update({}), true);
    assert.deepEqual(
      asked.map(([target]) => target),
      [inner, middle, top]
    );
    assert.ok(asked.every(([, selector]) => selector === '.fabricate-manager'));
  });

  it('refuses a mount moved into its own detached slot element, without recursing', () => {
    const { ui, under } = rootedSeam();
    const target = under();
    const looped = ui.mount('Panel', { target, props: { body: true } });
    looped.slot('body').append(target);
    assert.throws(
      () => ui.mount('Windowed', { target: under(looped.slot('body')) }),
      refusal(WINDOW)
    );
  });

  it("refuses two mounts moved into each other's detached slot elements", () => {
    const { ui, under } = rootedSeam();
    const [firstTarget, secondTarget] = [under(), under()];
    const first = ui.mount('Panel', { target: firstTarget, props: { body: true } });
    const second = ui.mount('Panel', { target: secondTarget, props: { body: true } });
    first.slot('body').append(secondTarget);
    second.slot('body').append(firstTarget);
    assert.throws(
      () => ui.mount('Managed', { target: under(first.slot('body')) }),
      refusal(MANAGER)
    );
  });

  it('decides by closest when no hasAncestor is injected, and refuses a node with none', () => {
    const { ui } = seamWith({ table: [WINDOWED, MANAGED] });
    const asked = [];
    const framed = new FakeTarget();
    framed.closest = (selector) => {
      asked.push(selector);
      return selector === '.fabricate' ? framed : null;
    };
    assert.equal(ui.mount('Windowed', { target: framed, props: {} }).update({}), true);
    assert.throws(() => ui.mount('Managed', { target: framed }), refusal(MANAGER));
    assert.deepEqual(asked, ['.fabricate', '.fabricate-manager']);
    assert.throws(
      () => ui.mount('Windowed', { target: new FakeTarget() }),
      refusal(WINDOW),
      'a node with no closest is outside every root, not a raw TypeError'
    );
  });
});

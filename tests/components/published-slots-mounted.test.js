/**
 * The published component seam's content slots on Fabricate's real Svelte runtime (issue 2451),
 * drawing the test-only probe into bare companion-owned targets: the slot element inside its
 * private wrapper, its detach and re-attach, a host element replaced around it, the teardown of a
 * published mount nested in it, a teardown that throws during the unmount, and the required
 * ancestor root decided by `closest`. The fake runtime's order and timing clauses are
 * `published-component-slots.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import {
  FAULT_REPORT,
  PUBLISHED_ADAPTER as ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM as SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-slots-',
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

function seam(options = {}) {
  return createPublishedComponents({
    table: [{ ...PROBE_ENTRY, component: probe.default }],
    ...runtime,
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
    ...options,
  });
}

/** An element the companion owns, appended to `parent`, to fill a slot or to mount into. */
function ownedIn(parent, tag = 'div') {
  const element = parent.ownerDocument.createElement(tag);
  parent.append(element);
  return element;
}

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
});

describe('a slot key on the real runtime', () => {
  it('draws the slot element as the only child of one wrapper, in place when mount returns', async () => {
    const target = companionTarget(targets);
    const handle = seam().publicApi.mount('PublishedProbe', { target, props: { body: true } });
    const host = target.querySelector('.probe-body');
    assert.equal(host.children.length, 1, 'one wrapper');
    const [wrapper] = host.children;
    const slot = handle.slot('body');
    assert.equal(wrapper.localName, 'div');
    assert.equal(wrapper.style.display, 'contents');
    assert.equal(wrapper.children.length, 1);
    assert.ok(wrapper.children[0] === slot, "the wrapper's only child is the slot element");
    assert.equal(slot.localName, 'div');
    assert.equal(slot.style.display, 'contents');
    assert.deepEqual(
      [...slot.attributes].map(({ name }) => name),
      ['style'],
      'one attribute'
    );
    assert.equal(slot.childNodes.length, 0, 'no text and no child of its own');
    assert.ok(!target.querySelector('.probe-aside').firstElementChild, 'aside was not requested');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    await settle();
    assert.deepEqual(reports, []);
  });

  it("draws a <span> slot inside the paragraph, by the entry's element", () => {
    const target = companionTarget(targets);
    const handle = seam().publicApi.mount('PublishedProbe', { target, props: { aside: true } });
    const slot = handle.slot('aside');
    assert.equal(slot.localName, 'span');
    const wrapper = slot.parentElement;
    assert.equal(wrapper.localName, 'span', 'phrasing content all the way down');
    assert.ok(wrapper.parentElement === target.querySelector('.probe-aside'));
    assert.ok(target.querySelector('p.probe').contains(slot), 'inside the <p>');
    assert.ok(!handle.slot('body'), 'body was not requested');
    handle.destroy();
  });

  it('answers a slot first requested by update at once, and attaches it on the flush', async () => {
    const target = companionTarget(targets);
    const handle = seam().publicApi.mount('PublishedProbe', { target, props: {} });
    assert.ok(handle.slot('body') === null, 'null before it is requested');
    assert.equal(handle.update({ body: true }), true);
    const slot = handle.slot('body');
    assert.equal(slot?.localName, 'div', 'the element, before the flush');
    assert.ok(!slot.isConnected, 'not yet attached');
    await settle();
    assert.ok(target.querySelector('.probe-body').contains(slot), 'attached by the flush');
    handle.destroy();
  });

  it('keeps the element and its content across updates, a detach and a re-attach', async () => {
    const target = companionTarget(targets);
    const handle = seam().publicApi.mount('PublishedProbe', { target, props: { body: true } });
    const slot = handle.slot('body');
    const content = ownedIn(slot);
    content.textContent = 'Companion content';
    const host = target.querySelector('.probe-body');
    assert.equal(host.textContent, 'Companion content', 'in place when mount returns');
    await settle();
    assert.equal(handle.update({ body: true, text: 'Moved' }), true);
    await settle();
    assert.equal(target.querySelector('.probe-text').textContent, 'Moved');
    assert.ok(handle.slot('body') === slot && host.contains(content), 'another key moves nothing');
    const wrapper = slot.parentElement;
    assert.equal(handle.update({ body: false }), true);
    await settle();
    assert.ok(!slot.isConnected, 'detached while it is not requested');
    assert.equal(host.children.length, 0, 'and its wrapper is gone');
    assert.ok(handle.slot('body') === slot, 'still the element');
    assert.ok(slot.firstChild === content, 'with its content');
    assert.equal(handle.update({ body: true }), true);
    await settle();
    assert.ok(handle.slot('body') === slot, 'the same element');
    assert.ok(host.contains(content), 'attached again with its content');
    assert.ok(slot.parentElement !== wrapper, 'in a new wrapper');
    assert.equal(host.children.length, 1);
    handle.destroy();
    assert.ok(!slot.isConnected && slot.firstChild === content, 'destroy leaves its children');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('stays attached, with its content, when an update replaces the element holding it', async () => {
    const target = companionTarget(targets);
    const handle = seam().publicApi.mount('PublishedProbe', { target, props: { body: true } });
    const slot = handle.slot('body');
    const content = ownedIn(slot);
    const before = target.querySelector('.probe-body');
    await settle();
    assert.equal(handle.update({ body: true, bodyAs: 'section' }), true);
    await settle();
    const host = target.querySelector('.probe-body');
    assert.equal(host.localName, 'section');
    assert.ok(!before.isConnected, 'the old host is gone');
    assert.ok(handle.slot('body') === slot, 'the same element');
    assert.ok(host.contains(slot) && slot.firstChild === content, 'under the new host');
    assert.equal(host.children.length, 1, 'in one wrapper');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });
});

describe('a published mount nested in a slot element on the real runtime', () => {
  /** An outer probe with `body` requested and an inner probe mounted at `place(slot)`. */
  function nested(place, outerOptions = {}) {
    const instance = seam();
    const target = companionTarget(targets);
    const outer = instance.publicApi.mount('PublishedProbe', {
      target,
      props: { body: true },
      ...outerOptions,
    });
    const slot = outer.slot('body');
    const innerTarget = place(slot);
    const innerFaults = [];
    const inner = instance.publicApi.mount('PublishedProbe', {
      target: innerTarget,
      props: { text: 'Inner' },
      onFault: (error) => {
        innerFaults.push(error);
      },
    });
    return { instance, target, outer, slot, inner, innerTarget, innerFaults };
  }

  it('is destroyed by the outer destroy, its target emptied', async () => {
    const { instance, target, outer, slot, inner, innerTarget } = nested((el) => ownedIn(el));
    assert.equal(target.querySelector(':scope .probe-body .probe-text').textContent, 'Inner');
    await settle();
    assert.equal(instance.liveMountCount(), 2);
    outer.destroy();
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(inner.update({}), false);
    assert.equal(innerTarget.childNodes.length, 0, 'the nested target was emptied');
    assert.ok(slot.firstChild === innerTarget, "the companion's own element is left in place");
    assert.equal(target.childNodes.length, 0);
    assert.ok(outer.slot('body') === null);
    await settle();
    assert.deepEqual(reports, []);
  });

  it('is destroyed, not faulted, when the outer mount faults', async () => {
    const outerFaults = [];
    const { instance, target, outer, inner, innerTarget, innerFaults } = nested(
      (el) => ownedIn(el),
      {
        onFault: (error) => {
          outerFaults.push(error);
        },
      }
    );
    await settle();
    assert.equal(outer.update({ body: true, explode: true }), true);
    await settle();
    assert.equal(outerFaults.length, 1, 'the outer onFault once');
    assert.ok(outerFaults[0] === probe.PROBE_FAULTS.explode);
    assert.deepEqual(innerFaults, [], 'the inner onFault never');
    assert.deepEqual(reports, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.explode]]);
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(inner.update({}), false);
    assert.equal(innerTarget.childNodes.length, 0);
    assert.equal(target.childNodes.length, 0);
    assert.ok(outer.slot('body') === null);
  });

  it('is destroyed by the outer destroy when its target is the slot element itself', async () => {
    const { instance, outer, slot, inner } = nested((el) => el);
    assert.equal(slot.querySelector('.probe-text').textContent, 'Inner');
    await settle();
    outer.destroy();
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(inner.update({}), false);
    assert.equal(slot.childNodes.length, 0);
    await settle();
    assert.deepEqual(reports, []);
  });

  it('is destroyed by the outer destroy while its slot element is detached', async () => {
    const { instance, outer, slot, inner, innerTarget } = nested((el) => ownedIn(el));
    await settle();
    assert.equal(outer.update({ body: false }), true);
    await settle();
    assert.ok(!slot.isConnected, 'the slot element is detached');
    assert.equal(inner.update({ text: 'Still live' }), true, 'and its content keeps running');
    await settle();
    assert.equal(innerTarget.querySelector('.probe-text').textContent, 'Still live');
    outer.destroy();
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(inner.update({}), false);
    assert.equal(innerTarget.childNodes.length, 0);
    await settle();
    assert.deepEqual(reports, []);
  });
});

describe('a published teardown that throws on the real runtime', () => {
  it('is reported once after destroy returns, and goes no further', async () => {
    const instance = seam();
    const target = companionTarget(targets);
    const handle = instance.publicApi.mount('PublishedProbe', {
      target,
      props: { throwAt: 'teardown' },
    });
    await settle();
    assert.doesNotThrow(() => handle.destroy());
    assert.deepEqual(reports, [], 'a rejected unmount is reported a microtask later');
    assert.equal(instance.liveMountCount(), 0);
    await settle();
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].slice(0, 2), [FAULT_REPORT, 'PublishedProbe']);
    assert.ok(reports[0][2] === probe.PROBE_FAULTS.teardown, "the probe's own Error");
    assert.equal(handle.update({}), false);
  });

  it('faults the mount once when its cleanup throws while a fault is torn down', async () => {
    const instance = seam();
    const target = companionTarget(targets);
    const faults = [];
    const handle = instance.publicApi.mount('PublishedProbe', {
      target,
      props: { throwAt: 'teardown' },
      onFault: (error) => {
        faults.push([error, target.childNodes.length]);
      },
    });
    await settle();
    assert.equal(handle.update({ throwAt: 'teardown', explode: true }), true);
    await settle();
    assert.equal(faults.length, 1, 'onFault once');
    assert.ok(faults[0][0] === probe.PROBE_FAULTS.teardown, 'the error that left the boundary');
    assert.equal(faults[0][1], 0, 'the target is empty inside onFault');
    assert.deepEqual(reports, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.teardown]]);
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(handle.update({}), false);
    assert.equal(target.childNodes.length, 0);
  });
});

describe('the required ancestor root on the real runtime', () => {
  const WINDOW =
    /^TypeError: Fabricate \| published components: WindowProbe needs a Fabricate window ancestor$/;
  const MANAGER =
    /^TypeError: Fabricate \| published components: ManagerProbe needs a Fabricate manager ancestor$/;

  /** A seam publishing the probe at each root: `PublishedProbe`, `WindowProbe` and `ManagerProbe`. */
  function rooted() {
    const component = probe.default;
    const table = [
      { ...PROBE_ENTRY, component },
      { ...PROBE_ENTRY, name: 'WindowProbe', root: 'fabricate', component },
      { ...PROBE_ENTRY, name: 'ManagerProbe', root: 'manager', component },
    ];
    return seam({ table });
  }

  it('refuses a bare target, before it draws or claims anything', () => {
    const instance = rooted();
    const target = companionTarget(targets);
    assert.throws(() => instance.publicApi.mount('WindowProbe', { target, props: {} }), WINDOW);
    assert.throws(() => instance.publicApi.mount('ManagerProbe', { target, props: {} }), MANAGER);
    assert.equal(target.childNodes.length, 0);
    assert.equal(instance.liveMountCount(), 0);
    instance.publicApi.mount('PublishedProbe', { target, props: {} }).destroy();
  });

  it('mounts a fabricate entry under a .fabricate shell, which is no manager root', () => {
    const instance = rooted();
    const target = fabricateTarget(targets);
    assert.throws(() => instance.publicApi.mount('ManagerProbe', { target, props: {} }), MANAGER);
    const handle = instance.publicApi.mount('WindowProbe', { target, props: { text: 'Framed' } });
    assert.equal(target.querySelector('.probe-text').textContent, 'Framed');
    handle.destroy();
  });

  it('mounts both under a .fabricate-manager root inside the frame', () => {
    const instance = rooted();
    const manager = ownedIn(fabricateTarget(targets).parentElement);
    manager.className = 'fabricate-manager';
    for (const name of ['WindowProbe', 'ManagerProbe']) {
      const target = ownedIn(manager);
      const handle = instance.publicApi.mount(name, { target, props: {} });
      assert.equal(target.querySelector('.probe-text').textContent, 'DEFAULT', name);
      handle.destroy();
    }
  });

  it("judges a target in a detached slot element by its owner's target", async () => {
    const instance = rooted();
    const framed = instance.publicApi.mount('PublishedProbe', {
      target: fabricateTarget(targets),
      props: {},
    });
    assert.equal(framed.update({ body: true }), true);
    const pending = ownedIn(framed.slot('body'));
    assert.ok(!pending.isConnected, 'the slot element is not attached before the flush');
    const inner = instance.publicApi.mount('WindowProbe', { target: pending, props: {} });
    assert.equal(pending.querySelector('.probe-text').textContent, 'DEFAULT');
    await settle();
    assert.ok(pending.isConnected && pending.closest('.fabricate'), 'attached by the flush');

    const bare = instance.publicApi.mount('PublishedProbe', {
      target: companionTarget(targets),
      props: {},
    });
    assert.equal(bare.update({ body: true }), true);
    assert.throws(
      () =>
        instance.publicApi.mount('WindowProbe', { target: ownedIn(bare.slot('body')), props: {} }),
      WINDOW
    );
    framed.destroy();
    bare.destroy();
    assert.equal(inner.update({}), false, 'the nested mount ended with its owner');
    assert.equal(instance.liveMountCount(), 0);
  });
});

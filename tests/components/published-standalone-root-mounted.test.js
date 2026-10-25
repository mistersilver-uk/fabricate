/**
 * The standalone style root (issue 2456) on Fabricate's real Svelte runtime: each widened entry
 * draws under one in a target with no Fabricate root and under none in a Fabricate window, judged
 * through the content slots that own a target; an unwidened entry nested there is still refused
 * (M16), as is a shadow root, in this realm and a second window's; and `destroy`, a fault and a
 * companion's re-render leave `target` as it was. The theme is read as the overlay layer reads it.
 * Limit: happy-dom resolves no cascade, so what the root draws is
 * `published-standalone-root-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { applyFabricateTheme } from '../../src/ui/theme.js';
import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import {
  FAULT_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
  standaloneRootIn,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const THEME = 'data-fabricate-theme';
const ROOT = '.fabricate-standalone-root';
const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';

/** Each widened entry with props it mounts with. */
const WIDENED = Object.freeze({
  Button: { children: 'Clear filters', onclick() {} },
  IconButton: { icon: 'fas fa-trash', ariaLabel: 'Remove Iron ingot', onclick() {} },
  StatusToggle: { on: false, ariaLabel: 'Group by category', onclick() {} },
  InspectorCard: { children: true },
  Well: { label: 'Chosen reagents', children: true },
});
const BUTTON = WIDENED.Button;
/** Each slot owner a nested target sits in, with its props but the slot. */
const OWNERS = Object.freeze({
  EmptyState: { title: 'No projects yet' },
  InspectorCard: {},
  Well: { label: 'Chosen reagents' },
});
const FIELD = Object.freeze({ as: 'div', children: true });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-standalone-root-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: [...PUBLISHED_COMPILED_MODULES, PROBE],
  componentPath: PROBE,
});

let seamParts;
let probe;
let reports;
let escaped;
let targets;
let stopRecording;

const report = (...args) => {
  reports.push(args);
};
const ui = () => shippedSeam({ ...seamParts, report });

/** A seam over the probe drawn under the standalone style root, on the runtime `overrides` alter. */
function probeSeam(overrides = {}) {
  const { createPublishedComponents, runtime } = seamParts;
  const entry = { ...PROBE_ENTRY, standaloneRoot: true, component: probe.default };
  return createPublishedComponents({
    table: [entry],
    ...runtime,
    ...overrides,
    isReady: () => true,
    report,
  }).publicApi;
}

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  probe = await harness.loadRuneModule(PROBE);
  seamParts = { createPublishedComponents, runtime, components };
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
  document.documentElement.removeAttribute(THEME);
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A mount of `outer` into `target` whose content slot is requested and not yet drawn, holding a fresh target. */
function detachedSlotTarget(seam, outer, target) {
  const handle = seam.mount(outer, { target, props: { ...OWNERS[outer], children: false } });
  flushSync();
  handle.update({ ...OWNERS[outer], children: true });
  const slot = handle.slot('children');
  assert.ok(Boolean(slot) && !slot.isConnected, 'the slot is requested and not yet drawn');
  const inner = document.createElement('div');
  slot.append(inner);
  return { handle, inner };
}

/** A target in an open shadow root attached to a shell in `doc`. */
function shadowTarget(doc) {
  const shell = doc.createElement('section');
  doc.body.append(shell);
  targets.push(shell);
  const target = doc.createElement('div');
  shell.attachShadow({ mode: 'open' }).append(target);
  assert.equal(target.getRootNode().nodeType, 11, 'a shadow root');
  return target;
}

const SHADOW_REFUSAL = Object.freeze({
  name: 'TypeError',
  message: `${REFUSAL}Button cannot be drawn in a shadow root`,
});

describe('a widened entry and the standalone style root', () => {
  for (const [name, props] of Object.entries(WIDENED)) {
    it(`${name} writes exactly one in a bare target, and none in a Fabricate window`, () => {
      const seam = ui();
      const bare = companionTarget(targets);
      const drawn = seam.mount(name, { target: bare, props });
      flushSync();
      const root = standaloneRootIn(bare);
      assert.ok(root.firstElementChild, `${name} is drawn inside it`);
      assert.ok(!root.hasAttribute('role') && !root.hasAttribute('tabindex'), 'and names nothing');
      assert.deepEqual(
        root.getAttributeNames().filter((attribute) => attribute.startsWith('aria-')),
        []
      );
      for (const button of bare.querySelectorAll('button')) {
        assert.equal(button.getAttribute('type'), 'button', `${name}'s button is typed`);
      }
      const windowed = fabricateTarget(targets, 'fabricate fabricate-app');
      seam.mount(name, { target: windowed, props });
      flushSync();
      assert.ok(!windowed.parentElement.querySelector(ROOT), 'none in a Fabricate window');
      assert.ok(!windowed.firstElementChild.matches(ROOT));
      drawn.destroy();
      assert.equal(bare.childNodes.length, 0, 'destroy leaves the bare target empty');
    });
  }

  for (const outer of ['EmptyState', 'InspectorCard']) {
    it(`a Button in the detached slot of an in-window ${outer} writes none`, () => {
      const seam = ui();
      const { handle, inner } = detachedSlotTarget(seam, outer, fabricateTarget(targets));
      seam.mount('Button', { target: inner, props: BUTTON });
      flushSync();
      assert.equal(inner.firstElementChild.localName, 'button', 'drawn straight in its target');
      handle.destroy();
    });
  }

  it('a Button in the detached slot of a bare EmptyState writes one, and in a bare card none', () => {
    const seam = ui();
    const panel = detachedSlotTarget(seam, 'EmptyState', companionTarget(targets));
    seam.mount('Button', { target: panel.inner, props: BUTTON });
    flushSync();
    assert.equal(standaloneRootIn(panel.inner).firstElementChild.localName, 'button');
    const card = detachedSlotTarget(seam, 'InspectorCard', companionTarget(targets));
    seam.mount('Button', { target: card.inner, props: BUTTON });
    flushSync();
    assert.equal(card.inner.firstElementChild.localName, 'button', 'the card’s root holds it');
    assert.ok(card.inner.closest('.fabricate'), 'which the drawn slot now sits in');
    panel.handle.destroy();
    card.handle.destroy();
  });

  it('refuses an unwidened entry in a slot of a mount drawn under it, drawn or detached (M16)', () => {
    const seam = ui();
    const card = seam.mount('InspectorCard', {
      target: companionTarget(targets),
      props: { children: true },
    });
    flushSync();
    const drawnSlot = card.slot('children');
    assert.ok(drawnSlot.closest(ROOT), 'the drawn slot is inside the standalone style root');
    const needs = {
      name: 'TypeError',
      message: `${REFUSAL}Field needs a Fabricate window ancestor`,
    };
    assert.throws(() => seam.mount('Field', { target: drawnSlot, props: FIELD }), needs);
    const { handle, inner } = detachedSlotTarget(seam, 'Well', companionTarget(targets));
    assert.throws(() => seam.mount('Field', { target: inner, props: FIELD }), needs);
    assert.equal(inner.childNodes.length, 0);
    card.destroy();
    handle.destroy();
  });
});

describe('where a target has no Fabricate root and no document head', () => {
  let second;

  beforeEach(() => {
    second = new Window({ url: 'http://localhost/detached' });
  });

  afterEach(async () => {
    await second.happyDOM.close();
  });

  it('draws in a detached div under the standalone style root', () => {
    const target = document.createElement('div');
    const handle = ui().mount('Button', { target, props: BUTTON });
    assert.equal(standaloneRootIn(target).firstElementChild.localName, 'button');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('refuses a shadow root (M16), naming it, and draws nothing', () => {
    const target = shadowTarget(document);
    assert.throws(() => ui().mount('Well', { target, props: WIDENED.Well }), {
      name: 'TypeError',
      message: `${REFUSAL}Well cannot be drawn in a shadow root`,
    });
    assert.equal(target.childNodes.length, 0);
  });

  it("draws in a second window's document, and refuses that window's shadow root", () => {
    const doc = second.document;
    const target = doc.createElement('div');
    doc.body.append(target);
    const seam = ui();
    const handle = seam.mount('StatusToggle', { target, props: WIDENED.StatusToggle });
    const root = standaloneRootIn(target);
    assert.ok(root.ownerDocument === doc, "the root is that document's own");
    assert.equal(root.firstElementChild.localName, 'button');
    assert.throws(() => seam.mount('Button', { target: shadowTarget(doc), props: BUTTON }), {
      name: 'TypeError',
      message: `${REFUSAL}Button cannot be drawn in a shadow root`,
    });
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('judges a detached slot by the shadow root its owner sits in (M16)', () => {
    const seam = ui();
    const { handle, inner } = detachedSlotTarget(seam, 'EmptyState', shadowTarget(document));
    assert.equal(inner.getRootNode().nodeType, 1, 'the nested target itself is in no shadow root');
    assert.throws(() => seam.mount('Button', { target: inner, props: BUTTON }), SHADOW_REFUSAL);
    assert.equal(inner.childNodes.length, 0);
    handle.destroy();
  });

  it("reads the theme from the main <html>, never a second window's stale copy", () => {
    second.document.documentElement.setAttribute(THEME, 'stale');
    document.documentElement.setAttribute(THEME, 'foundry-native');
    const target = second.document.createElement('div');
    second.document.body.append(target);
    const handle = ui().mount('Button', { target, props: BUTTON });
    assert.equal(standaloneRootIn(target).getAttribute(THEME), 'foundry-native');
    handle.destroy();
  });
});

describe('mountMany and the standalone style root', () => {
  it('writes one root in a bare item and none in an in-window one, and destroy empties the bare', () => {
    const bare = companionTarget(targets);
    const inWindow = fabricateTarget(targets, 'fabricate fabricate-app');
    const items = [bare, inWindow].map((target) => ({ target, props: BUTTON }));
    const [bareHandle, windowHandle] = ui().mountMany('Button', items);
    assert.equal(standaloneRootIn(bare).firstElementChild.localName, 'button');
    assert.equal(inWindow.children.length, 1, 'one element in the in-window target');
    assert.equal(inWindow.firstElementChild.localName, 'button', 'and it is the button');
    bareHandle.destroy();
    assert.equal(bare.childNodes.length, 0);
    windowHandle.destroy();
  });

  it('draws nothing when a later item is in a shadow root (M16)', () => {
    const first = companionTarget(targets);
    const items = [first, shadowTarget(document)].map((target) => ({ target, props: BUTTON }));
    assert.throws(() => ui().mountMany('Button', items), SHADOW_REFUSAL);
    assert.equal(first.childNodes.length, 0, 'the first item is not drawn');
  });

  it("judges a target in a stale standalone mount's detached slot as under a root", () => {
    const seam = ui();
    const target = companionTarget(targets);
    const card = seam.mount('InspectorCard', { target, props: { children: true } });
    flushSync();
    const inner = document.createElement('div');
    card.slot('children').append(inner);
    target.replaceChildren();
    const items = [target, inner].map((each) => ({ target: each, props: BUTTON }));
    const [outer, nested] = seam.mountMany('Button', items);
    assert.equal(card.update({ children: true }), false, "the first item's draw ended the card");
    assert.equal(standaloneRootIn(target).firstElementChild.localName, 'button');
    assert.equal(inner.firstElementChild.localName, 'button', 'drawn with no standalone root');
    assert.ok(!inner.closest('.fabricate'), 'and with no .fabricate above it');
    nested.destroy();
    outer.destroy();
  });
});

describe('the theme of the standalone style root', () => {
  for (const palette of ['fabricate', 'foundry-native']) {
    it(`carries the ${palette} palette named on <html>`, () => {
      document.documentElement.setAttribute(THEME, palette);
      const target = companionTarget(targets);
      const handle = ui().mount('InspectorCard', { target, props: {} });
      assert.equal(standaloneRootIn(target).getAttribute(THEME), palette);
      handle.destroy();
    });
  }

  it('carries none where nothing names one, and takes the one applyFabricateTheme writes', () => {
    const target = companionTarget(targets);
    const handle = ui().mount('Button', { target, props: BUTTON });
    const root = standaloneRootIn(target);
    assert.ok(!root.hasAttribute(THEME), 'no theme is named');
    applyFabricateTheme('foundry-native');
    assert.equal(root.getAttribute(THEME), 'foundry-native', 'a later theme change reaches it');
    handle.destroy();
  });
});

describe('leaving the target as it was', () => {
  it('destroy empties the target at once and after the runtime settles', async () => {
    const target = companionTarget(targets);
    const handle = ui().mount('Well', { target, props: WIDENED.Well });
    await settle();
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'at once');
    await settle();
    assert.equal(target.childNodes.length, 0, 'and after');
  });

  it("removes the root by reference after a companion's replaceChildren, never what it now holds", () => {
    const target = companionTarget(targets);
    const handle = ui().mount('Button', { target, props: BUTTON });
    const root = standaloneRootIn(target);
    target.replaceChildren();
    const own = document.createElement('p');
    target.append(own);
    handle.destroy();
    assert.ok(target.firstChild === own, "the companion's own content stays");
    assert.ok(!root.isConnected);
  });

  it('a second mount after replaceChildren supersedes the first, whose destroy leaves its root', () => {
    const seam = ui();
    const target = companionTarget(targets);
    const first = seam.mount('Button', { target, props: BUTTON });
    const firstRoot = standaloneRootIn(target);
    target.replaceChildren();
    const second = seam.mount('Button', { target, props: BUTTON });
    const secondRoot = standaloneRootIn(target);
    assert.ok(secondRoot !== firstRoot, 'a fresh root');
    first.destroy();
    assert.ok(standaloneRootIn(target) === secondRoot, "the second's root stays");
    assert.equal(second.update(BUTTON), true);
    second.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('a fault Svelte delivers inside flushSync empties the target at once and after', async () => {
    const target = companionTarget(targets);
    const handle = probeSeam().mount('PublishedProbe', { target, props: {} });
    standaloneRootIn(target);
    handle.update({ explode: true });
    flushSync();
    assert.equal(target.childNodes.length, 0, 'at once');
    await settle();
    assert.equal(target.childNodes.length, 0, 'and after');
    assert.deepEqual(reports, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.explode]]);
  });

  it('a fault at init, which the boundary reports later, empties the target', async () => {
    const target = companionTarget(targets);
    probeSeam().mount('PublishedProbe', { target, props: { throwAt: 'init' } });
    await settle();
    assert.equal(target.childNodes.length, 0);
    assert.equal(reports.length, 1);
  });

  it('a runtime mount that throws, or faults before it returns, empties the target', async () => {
    const { mount } = seamParts.runtime;
    const failure = new Error('runtime mount failed');
    const throwing = probeSeam({
      mount: (host, options) => {
        mount(host, options);
        throw failure;
      },
    });
    const thrown = companionTarget(targets);
    throwing.mount('PublishedProbe', { target: thrown, props: {} });
    assert.equal(thrown.childNodes.length, 0, 'the failed mount’s catch, at once');
    const early = probeSeam({
      mount: (host, options) => {
        options.props.onfault(failure);
        return mount(host, options);
      },
    });
    const deferred = companionTarget(targets);
    early.mount('PublishedProbe', { target: deferred, props: {} });
    await settle();
    assert.equal(deferred.childNodes.length, 0, 'the deferred unmount, after the runtime settles');
    assert.equal(reports.length, 2);
  });
});

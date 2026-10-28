/**
 * The published seam's overlay host chain on Fabricate's real Svelte runtime (issue 2454), drawn
 * through the test-only overlay probe: the `overlayHost` option, a disconnected option falling
 * through, the nearest overlay root, the seam's standalone layer with its theme and its count, a
 * press inside the container reaching `onChoose`, and `destroy` and a fault leaving no panel,
 * held overlay, container, layer or listener; then a second happy-dom `Window`, where the panel's
 * handlers run only because its container is a Svelte mount target. M18 is
 * `published-components.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PROBE_OVERLAY_ENTRY } from '../fixtures/published-components/probeEntry.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
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
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PROBE = PROBE_OVERLAY_ENTRY.path;
const OVERLAY_HOST = 'src/ui/svelte/util/overlayHost.js';
const OVERLAYS = 'src/ui/publishedComponentOverlays.js';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const THEME = 'data-fabricate-theme';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-overlays-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: [...PUBLISHED_COMPILED_MODULES, PROBE],
  componentPath: PROBE,
});

let runtime;
let components;
let overlaysOpenedFrom;
let openOverlayChain;
let createPublishedComponents;
let probe;
let reports;
let escaped;
let shells;
let handles;
let stopRecording;

before(async () => {
  await harness.setup();
  ({ publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(ADAPTER));
  ({ overlaysOpenedFrom } = await harness.loadRawModule(OVERLAY_HOST));
  ({ openOverlayChain } = await harness.loadRawModule(OVERLAYS));
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
  shells = [];
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its overlays');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A seam over the overlay probe alone; `withRuntime` replaces members of the real runtime. */
function overlaySeam(withRuntime = {}) {
  return createPublishedComponents({
    table: [{ ...PROBE_OVERLAY_ENTRY, component: probe.default }],
    ...runtime,
    ...withRuntime,
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
  }).publicApi;
}

const panelsIn = (doc) => [...doc.querySelectorAll('[data-overlay-probe-panel]')];

/** Mounts the probe closed into `target`, then opens it and flushes; answers its handle and panel. */
function openProbe(target, { overlayHost, onChoose, seam = overlaySeam(), onFault } = {}) {
  const props = { label: 'Per page', onChoose };
  const handle = seam.mount('PublishedOverlayProbe', { target, props, overlayHost, onFault });
  handles.push(handle);
  flushSync();
  const before = new Set(panelsIn(target.ownerDocument));
  handle.update({ ...props, open: true });
  flushSync();
  const opened = panelsIn(target.ownerDocument).filter((panel) => !before.has(panel));
  assert.equal(opened.length, 1, 'the panel opened');
  return { handle, panel: opened[0], props };
}

/** The container the seam portaled `panel` into, asserted to draw no box of its own. */
function containerOf(panel) {
  const container = panel.parentElement;
  assert.equal(container.style.display, 'contents', 'the container is display: contents');
  assert.equal(container.localName, 'div');
  return container;
}

/** A positioned element of the companion's own, attached to `document.body`. */
function companionHost() {
  const host = document.createElement('section');
  host.style.position = 'relative';
  document.body.append(host);
  shells.push(host);
  return host;
}

/**
 * Records every listener added from now on to any node, and to this window and each of `windows`,
 * which hold their own pair, and answers those still bound as `<type>` strings; `stop()` restores both.
 */
function trackListeners(windows = []) {
  let nodes = document.createElement('div');
  while (!Object.hasOwn(nodes, 'addEventListener')) nodes = Object.getPrototypeOf(nodes);
  const owners = [nodes, document.defaultView, ...windows];
  const originals = owners.map((owner) => [owner.addEventListener, owner.removeEventListener]);
  const bound = [];
  const captureOf = (options) =>
    typeof options === 'boolean' ? options : Boolean(options?.capture);
  const same = (on, type, listener, options) => (entry) =>
    entry.on === on &&
    entry.type === type &&
    entry.listener === listener &&
    entry.capture === captureOf(options);
  for (const [index, owner] of owners.entries()) {
    const [add, remove] = originals[index];
    owner.addEventListener = function (type, listener, options) {
      bound.push({ on: this, type, listener, capture: captureOf(options) });
      return add.call(this, type, listener, options);
    };
    owner.removeEventListener = function (type, listener, options) {
      const at = bound.findIndex(same(this, type, listener, options));
      if (at !== -1) bound.splice(at, 1);
      return remove.call(this, type, listener, options);
    };
  }
  return {
    still: () => bound.map(({ type }) => type).sort((a, b) => a.localeCompare(b)),
    stop() {
      for (const [index, owner] of owners.entries()) {
        const [add, remove] = originals[index];
        owner.addEventListener = add;
        owner.removeEventListener = remove;
      }
    },
  };
}

describe('the host chain an overlay resolves when it opens', () => {
  it('takes the overlayHost option, in a container that keeps it the containing block', () => {
    const target = companionTarget(shells);
    const overlayHost = companionHost();
    const { handle, panel } = openProbe(target, { overlayHost });
    const container = containerOf(panel);
    assert.ok(container.parentElement === overlayHost, 'the option hosts the container');
    assert.ok(!target.contains(panel), 'the panel is drawn outside target');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
    handle.destroy();
    assert.ok(!container.isConnected && !panel.isConnected, 'destroy removes both');
  });

  it('skips a disconnected option and takes the nearest overlay root above target', () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = document.createElement('section');
    const { handle, panel } = openProbe(target, { overlayHost });
    const container = containerOf(panel);
    assert.ok(container.parentElement === target.closest('.fabricate-app'), 'the app root hosts');
    handle.destroy();
  });

  it('re-reads the chain at each open, so an option attached later is taken then', () => {
    const target = fabricateTarget(shells, 'fabricate-manager');
    const overlayHost = document.createElement('section');
    const { handle, panel, props } = openProbe(target, { overlayHost });
    assert.ok(containerOf(panel).parentElement === target.parentElement, 'the manager root first');
    handle.update({ ...props, open: false });
    flushSync();
    document.body.append(overlayHost);
    shells.push(overlayHost);
    handle.update({ ...props, open: true });
    flushSync();
    const reopened = document.querySelector('[data-overlay-probe-panel]');
    assert.ok(containerOf(reopened).parentElement === overlayHost, 'the option, once connected');
    handle.destroy();
  });

  it('makes one themed standalone layer on the target’s body for every overlay with no root', () => {
    const first = companionTarget(shells);
    first.parentElement.setAttribute(THEME, 'ancestor-theme');
    document.documentElement.setAttribute(THEME, 'main-theme');
    try {
      const one = openProbe(first);
      const layer = document.querySelector(LAYER);
      assert.ok(layer?.parentElement === document.body, 'a layer on the target’s body');
      assert.equal(layer.getAttribute(THEME), 'ancestor-theme', "the nearest ancestor's theme");
      assert.ok(containerOf(one.panel).parentElement === layer);

      const two = openProbe(companionTarget(shells));
      assert.equal(document.querySelectorAll(LAYER).length, 1, 'the layer is shared');
      assert.ok(containerOf(two.panel).parentElement === layer);

      one.handle.update({ ...one.props, open: false });
      flushSync();
      assert.ok(layer.isConnected, 'kept while an overlay is still open on it');
      two.handle.destroy();
      assert.ok(!layer.isConnected, 'removed when the last overlay on it closes');
      one.handle.destroy();

      const three = openProbe(companionTarget(shells));
      assert.equal(
        document.querySelector(LAYER).getAttribute(THEME),
        'main-theme',
        'else the main one'
      );
      three.handle.destroy();
    } finally {
      document.documentElement.removeAttribute(THEME);
    }
  });

  it('leaves an overlay outside every published mount on the class walk, with no container', () => {
    const target = fabricateTarget(shells, 'fabricate-app');
    const unpublished = probe.default;
    const { mount, unmount } = runtime;
    const instance = mount(unpublished, { target, props: { open: true, label: 'Own' } });
    flushSync();
    const panel = document.querySelector('[data-overlay-probe-panel]');
    assert.ok(panel.parentElement === target.parentElement, 'the app root itself hosts');
    unmount(instance);
    flushSync();
  });

  it('leaves an unpublished overlay on the class walk once a published mount has been destroyed', () => {
    const target = fabricateTarget(shells, 'fabricate-app');
    openProbe(target, { overlayHost: companionHost() }).handle.destroy();
    const { mount, unmount } = runtime;
    const instance = mount(probe.default, { target, props: { open: true, label: 'Own' } });
    flushSync();
    const panel = document.querySelector('[data-overlay-probe-panel]');
    assert.ok(panel.parentElement === target.parentElement, 'the dead chain hosts nothing');
    unmount(instance);
    flushSync();
  });

  it('ends a stale claim’s chain when the target is mounted again on the same seam', () => {
    const target = companionTarget(shells);
    const overlayHost = companionHost();
    const seam = overlaySeam();
    openProbe(target, { overlayHost, seam });
    assert.equal(overlayHost.children.length, 1, 'one container while open');
    target.replaceChildren();
    const { handle } = openProbe(target, { overlayHost, seam });
    assert.equal(overlayHost.children.length, 1, 'the stale claim’s container is gone');
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves none');
  });

  it('keeps one container while an update re-syncs the open panel', () => {
    const overlayHost = companionHost();
    const { handle, props } = openProbe(companionTarget(shells), { overlayHost });
    for (const cap of [100, 200]) {
      handle.update({ ...props, open: true, cap });
      flushSync();
      assert.equal(overlayHost.children.length, 1, `one container at cap ${cap}`);
    }
    handle.destroy();
    assert.equal(overlayHost.children.length, 0);
  });

  it('measures the panel from the overlayHost option’s own rect', () => {
    const overlayHost = companionHost();
    overlayHost.getBoundingClientRect = () => ({
      left: 50,
      top: 60,
      right: 350,
      bottom: 260,
      width: 300,
      height: 200,
    });
    const { handle, panel } = openProbe(companionTarget(shells), { overlayHost });
    assert.match(panel.getAttribute('style'), /left: 50px;/);
    handle.destroy();
  });

  it('takes a new container when the host it was opened in is removed while open', () => {
    const overlayHost = companionHost();
    const { handle, panel, props } = openProbe(companionTarget(shells), { overlayHost });
    const first = containerOf(panel);
    overlayHost.remove();
    handle.update({ ...props, open: true, cap: 10 });
    flushSync();
    const layer = document.querySelector(LAYER);
    assert.ok(layer && !first.isConnected, 'the removed host’s container is replaced');
    assert.ok(containerOf(panel).parentElement === layer, 'by one in the standalone layer');
    assert.equal(layer.children.length, 1);
    handle.destroy();
  });
});

describe('an acquire that throws holds nothing', () => {
  const opened = [];
  afterEach(() => {
    for (const chain of opened) chain.close();
    opened.length = 0;
  });

  /** A chain over `target` on the real runtime less `withRuntime`; it is closed after each clause. */
  function chainOver(target, { option, withRuntime = {} } = {}) {
    const chain = openOverlayChain({
      target,
      option,
      runtime: () => ({ ...runtime, ...withRuntime }),
      report: (...args) => {
        reports.push(args);
      },
    });
    opened.push(chain);
    return chain;
  }

  it('releases the standalone layer when the container cannot be made, and takes the next acquire', () => {
    const chain = chainOver(companionTarget(shells));
    const make = document.createElement.bind(document);
    let divs = 0;
    const stub = mock.method(document, 'createElement', (name, ...rest) => {
      // The layer is the first div, the container the second.
      if (name === 'div' && (divs += 1) === 2) throw new Error('container refused');
      return make(name, ...rest);
    });
    try {
      assert.throws(() => chain.acquire({}), { message: 'container refused' });
    } finally {
      stub.mock.restore();
    }
    assert.equal(divs, 2, 'the layer was made and the container was refused');
    assert.ok(!document.querySelector(LAYER), 'no layer is left');
    const overlay = {};
    const container = chain.acquire(overlay);
    assert.ok(document.querySelector(LAYER)?.contains(container), 'the next acquire is hosted');
    chain.release(overlay);
    assert.ok(!document.querySelector(LAYER), 'and releases its layer');
  });

  it('removes the container from an overlayHost when the mount throws, and takes the next acquire', () => {
    const option = companionHost();
    const failing = chainOver(companionTarget(shells), {
      option,
      withRuntime: {
        mount: () => {
          throw new Error('mount refused');
        },
      },
    });
    assert.throws(() => failing.acquire({}), { message: 'mount refused' });
    assert.equal(option.children.length, 0, 'no container is left in the option');
    const chain = chainOver(companionTarget(shells), { option });
    const overlay = {};
    assert.ok(chain.acquire(overlay).parentElement === option, 'the next acquire is hosted');
    chain.release(overlay);
    assert.equal(option.children.length, 0);
  });
});

describe('a press inside the container', () => {
  it('reaches onChoose once, with the number the probe states', () => {
    const choose = recorder();
    const { handle, panel } = openProbe(companionTarget(shells), { onChoose: choose.record });
    panel.querySelector('[data-overlay-probe-choice]').click();
    assert.deepEqual(choose.calls, [[25]]);
    handle.destroy();
  });
});

describe('destroy and a fault close every open overlay', () => {
  it('destroy leaves no panel, container, layer or listener', async () => {
    const listeners = trackListeners();
    try {
      const { handle, panel } = openProbe(companionTarget(shells));
      const container = containerOf(panel);
      // Svelte binds every event a loaded component delegates to each mount root, as many times
      // as it has roots, the published `Select`'s picker delegates `keydown` and `mousedown`, the
      // published `RadioCardGroup`'s radio delegates `change`, and the published `Pagination`'s
      // region delegates `focusin` and `focusout`.
      const bound = [
        'change',
        'click',
        'focusin',
        'focusout',
        'keydown',
        'mousedown',
        'resize',
        'scroll',
      ];
      assert.deepEqual(
        [...new Set(listeners.still())].sort((a, b) => a.localeCompare(b)),
        bound,
        'bound'
      );
      handle.destroy();
      await settle();
      assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
      assert.deepEqual(listeners.still(), [], 'no listener');
    } finally {
      listeners.stop();
    }
    assert.deepEqual(reports, []);
  });

  it('destroy closes the chain whatever the runtime’s unmount does', () => {
    const failing = overlaySeam({
      unmount: () => {
        throw new Error('unmount failed');
      },
    });
    const { handle, panel } = openProbe(companionTarget(shells), { seam: failing });
    const container = containerOf(panel);
    handle.destroy();
    assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
    assert.ok(!document.querySelector(LAYER), 'no layer remains');
    assert.deepEqual(
      reports.map(([report, name, error]) => [report, name, error.message]),
      [
        [FAULT_REPORT, 'PublishedOverlayProbe', 'unmount failed'],
        [FAULT_REPORT, 'PublishedOverlayProbe', 'unmount failed'],
      ],
      'the mount’s and the container’s failures are both reported'
    );
  });

  it('a fault while open does the same, then tells onFault', async () => {
    const listeners = trackListeners();
    const faults = [];
    try {
      const target = companionTarget(shells);
      const onFault = (error) => {
        faults.push(error.message);
      };
      const { handle, panel, props } = openProbe(target, { onFault });
      const container = containerOf(panel);
      const trigger = target.querySelector('[data-overlay-probe-trigger]');
      assert.equal(overlaysOpenedFrom(trigger).length, 1, 'the panel is held, opened from it');
      handle.update({ ...props, open: true, explode: true });
      await settle();
      assert.deepEqual(faults, ['overlay probe fault']);
      assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
      assert.equal(target.childNodes.length, 0, 'the target is empty');
      assert.deepEqual(listeners.still(), [], 'no listener');
      assert.equal(overlaysOpenedFrom(trigger).length, 0, 'nor held');
      assert.equal(handle.update(props), false, 'the handle is inert');
    } finally {
      listeners.stop();
    }
    assert.deepEqual(
      reports.map(([report, name]) => [report, name]),
      [[FAULT_REPORT, 'PublishedOverlayProbe']]
    );
  });
});

describe('the overlays a published mount opened (issue 2660)', () => {
  const shipped = () =>
    shippedSeam({
      createPublishedComponents,
      runtime,
      components,
      report: (...args) => {
        reports.push(args);
      },
    });

  /** Mounts the published `name` into a new Fabricate target and opens it from its trigger. */
  async function openShipped(name, props) {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const handle = shipped().mount(name, { target, props });
    handles.push(handle);
    flushSync();
    const trigger = target.querySelector('button');
    trigger.click();
    flushSync();
    await settle();
    return { handle, trigger };
  }

  for (const [name, props] of [
    [
      'Select',
      { options: [{ value: 'flask', label: 'Flask' }], ariaLabel: 'Vessel', onChange() {} },
    ],
    [
      'ActionMenu',
      { items: [{ id: 'rename', label: 'Rename' }], ariaLabel: 'Actions', onSelect() {} },
    ],
  ]) {
    it(`holds none once an open published ${name} is destroyed`, async () => {
      const { handle, trigger } = await openShipped(name, props);
      assert.equal(overlaysOpenedFrom(trigger).length, 1, 'its panel, opened from the trigger');
      handle.destroy();
      await settle();
      assert.ok(!trigger.isConnected, 'the trigger is gone');
      assert.equal(overlaysOpenedFrom(trigger).length, 0, 'and the entry with it');
    });
  }
});

describe('in a second window', () => {
  let second;

  beforeEach(() => {
    second = new Window({ url: 'http://localhost/detached' });
  });

  afterEach(async () => {
    await second.happyDOM.close();
  });

  /** A companion target in the second window's own document. */
  function detachedTarget() {
    const doc = second.document;
    const shell = doc.createElement('section');
    const target = doc.createElement('div');
    shell.append(target);
    doc.body.append(shell);
    return target;
  }

  it('hosts the overlay on that document’s own layer, and a press there reaches onChoose', () => {
    const choose = recorder();
    const target = detachedTarget();
    second.document.documentElement.setAttribute(THEME, 'stale');
    document.documentElement.setAttribute(THEME, 'fresh');
    let handle, panel, layer;
    try {
      ({ handle, panel } = openProbe(target, { onChoose: choose.record }));
      layer = second.document.querySelector(LAYER);
      assert.equal(layer.getAttribute(THEME), 'fresh', 'not the copy made when the window opened');
    } finally {
      document.documentElement.removeAttribute(THEME);
    }
    assert.ok(layer?.parentElement === second.document.body, "the second document's body");
    assert.ok(containerOf(panel).parentElement === layer);
    assert.ok(!document.querySelector(LAYER), 'nothing is drawn in this window');
    panel.querySelector('[data-overlay-probe-choice]').click();
    assert.deepEqual(choose.calls, [[25]], 'delegated through the container’s own listener');
    handle.destroy();
    assert.ok(!layer.isConnected, 'its layer goes with its last overlay');
  });

  it('binds its listeners to that window and leaves none in it once destroyed', async () => {
    const listeners = trackListeners([second]);
    try {
      const { handle, panel } = openProbe(detachedTarget());
      const container = containerOf(panel);
      assert.ok(
        ['resize', 'scroll'].every((type) => listeners.still().includes(type)),
        'the popover is bound while open'
      );
      handle.destroy();
      await settle();
      assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
      assert.deepEqual(listeners.still(), [], 'no listener in either window');
    } finally {
      listeners.stop();
    }
  });

  it('hosts a same-document overlayHost moved into another document in the target’s own layer', () => {
    const target = companionTarget(shells);
    const overlayHost = companionHost();
    const seam = overlaySeam();
    const props = { label: 'Per page' };
    const handle = seam.mount('PublishedOverlayProbe', { target, props, overlayHost });
    handles.push(handle);
    flushSync();
    second.document.body.append(overlayHost);
    handle.update({ ...props, open: true });
    flushSync();
    const layer = document.querySelector(LAYER);
    assert.ok(layer, 'a layer in the target’s document');
    assert.ok(layer.querySelector('[data-overlay-probe-panel]'), 'the panel is in it');
    assert.equal(overlayHost.children.length, 0, 'the moved host holds none');
    handle.destroy();
  });

  it('keeps an open overlay in its overlayHost when that host is moved to another document', () => {
    const overlayHost = companionHost();
    const { handle, panel, props } = openProbe(companionTarget(shells), { overlayHost });
    const container = containerOf(panel);
    second.document.body.append(overlayHost);
    handle.update({ ...props, open: true, cap: 10 });
    flushSync();
    assert.ok(containerOf(panel) === container, 'the same container');
    assert.ok(
      container.parentElement === overlayHost && container.isConnected,
      'in the moved host'
    );
    assert.ok(!document.querySelector(LAYER), 'no layer is made for it');
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves none');
  });

  it('reaches no handler when the container is not a mount target', () => {
    const choose = recorder();
    const { mount, unmount, overlay } = runtime;
    const skipped = new Set();
    const seam = overlaySeam({
      mount(component, options) {
        if (component !== overlay) return mount(component, options);
        const instance = {};
        skipped.add(instance);
        return instance;
      },
      unmount: (instance) => (skipped.has(instance) ? undefined : unmount(instance)),
    });
    const target = detachedTarget();
    const { handle, panel } = openProbe(target, { onChoose: choose.record, seam });
    assert.ok(containerOf(panel).isConnected, 'the container is drawn');
    panel.querySelector('[data-overlay-probe-choice]').click();
    assert.deepEqual(choose.calls, [], 'no listener of Svelte’s hears the press');
    assert.equal(skipped.size, 1, 'the one container mount was skipped');
    handle.destroy();
  });
});

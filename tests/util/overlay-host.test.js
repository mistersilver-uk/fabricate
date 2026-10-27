/**
 * The overlay host registry and the seam's shared standalone layer (issue 2454), with stand-in
 * chains: the nearest registered target above an anchor wins, an overlay opened inside another's
 * container joins that chain, a held overlay keeps its container, the layer is counted per
 * document, and each held overlay is known by what it was opened from (issue 2660).
 * The real chain is `components/published-overlays-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const {
  acquireOverlayHost,
  acquireStandaloneOverlayLayer,
  createOverlayContainer,
  heldBy,
  overlayHostRect,
  overlaysOpenedFrom,
  registerOverlayChain,
  releaseOverlayHost,
  resetOverlayHostDiagnostics,
  unregisterOverlayChain,
} = await import('../../src/ui/svelte/util/overlayHost.js');

const { anchoredPopover } = await import('../../src/ui/svelte/actions/anchoredPopover.js');
const { computeActionMenuLayout } = await import('../../src/ui/svelte/util/actionMenuLayout.js');

const LAYER = '.fabricate.fabricate-standalone-overlay';

/** A chain that hands each overlay one container in `host` and logs each call in `log`. */
function standInChain(host, log = []) {
  const held = new Map();
  const chain = {
    log,
    acquire(overlay) {
      log.push('acquire');
      if (!held.has(overlay)) held.set(overlay, createOverlayContainer(host, chain));
      return held.get(overlay);
    },
    release(overlay) {
      log.push('release');
      held.get(overlay)?.remove();
      held.delete(overlay);
    },
  };
  return chain;
}

function element(tag = 'div', parent = document.body) {
  const node = document.createElement(tag);
  parent.append(node);
  return node;
}

before(() => setupDOM());
after(() => teardownDOM());
afterEach(() => {
  document.body.innerHTML = '';
  resetOverlayHostDiagnostics();
});

describe('acquireOverlayHost', () => {
  it('takes the nearest registered target above the anchor, so a nested mount wins', () => {
    const outerHost = element('section');
    const innerHost = element('section');
    const outer = element();
    const inner = element('div', outer);
    const anchor = element('button', inner);
    const outerChain = standInChain(outerHost);
    const innerChain = standInChain(innerHost);
    registerOverlayChain(outer, outerChain);
    registerOverlayChain(inner, innerChain);
    const overlay = document.createElement('div');

    const container = acquireOverlayHost(overlay, anchor, { component: 'Nested' });
    assert.ok(container.parentElement === innerHost, 'the inner chain hosts');
    assert.ok(acquireOverlayHost(overlay, anchor, {}) === container, 'held, so the same container');
    assert.deepEqual(outerChain.log, [], 'the outer chain is never asked');

    releaseOverlayHost(overlay);
    assert.ok(!container.isConnected, 'released through the chain that holds it');
    releaseOverlayHost(overlay);
    assert.deepEqual(innerChain.log, ['acquire', 'acquire', 'release'], 'a second release is none');
    unregisterOverlayChain(inner, innerChain);
    unregisterOverlayChain(outer, outerChain);
  });

  it('joins the chain whose container holds the anchor, and keeps another chain’s target', () => {
    const host = element('section');
    const target = element();
    const chain = standInChain(host);
    registerOverlayChain(target, chain);
    const first = document.createElement('div');
    const container = acquireOverlayHost(first, element('button', target), {});
    const nestedAnchor = element('button', container);
    const second = document.createElement('div');
    const nested = acquireOverlayHost(second, nestedAnchor, {});
    assert.ok(nested.parentElement === host, 'an overlay opened inside a panel joins its chain');
    unregisterOverlayChain(target, standInChain(host));
    assert.ok(
      acquireOverlayHost(first, target, {}) === container,
      'another chain unregisters nothing'
    );
    unregisterOverlayChain(target, chain);
    releaseOverlayHost(first);
    releaseOverlayHost(second);
  });

  it('releases the old container when the anchor moves to another chain', () => {
    const [hostA, hostB] = [element('section'), element('section')];
    const [targetA, targetB] = [element(), element()];
    const [chainA, chainB] = [standInChain(hostA), standInChain(hostB)];
    registerOverlayChain(targetA, chainA);
    registerOverlayChain(targetB, chainB);
    const overlay = document.createElement('div');
    const first = acquireOverlayHost(overlay, element('button', targetA), {});
    const moved = acquireOverlayHost(overlay, element('button', targetB), {});
    assert.ok(!first.isConnected && moved.parentElement === hostB);
    releaseOverlayHost(overlay);
    unregisterOverlayChain(targetA, chainA);
    unregisterOverlayChain(targetB, chainB);
  });

  it('answers the class walk outside every registered target', () => {
    const root = element();
    root.className = 'fabricate-app';
    const anchor = element('button', root);
    assert.ok(acquireOverlayHost(document.createElement('div'), anchor, {}) === root);
  });
});

describe('heldBy', () => {
  it('answers false for a target that is not a node, as a Window', () => {
    assert.equal(heldBy(element(), document.defaultView), false);
    assert.equal(heldBy(element(), null), false);
  });

  it('never hands a target that is not a node to contains, which throws on one in a browser', () => {
    const strict = {
      contains(node) {
        if (typeof node?.nodeType !== 'number') throw new TypeError('not a Node');
        return false;
      },
    };
    assert.equal(heldBy(strict, document.defaultView), false);
  });

  it('answers true for a node in the container and for one in an open shadow root under it', () => {
    const container = element();
    const inside = element('span', container);
    const hostNode = element('div', container);
    const shadow = hostNode.attachShadow({ mode: 'open' });
    const deep = document.createElement('i');
    shadow.append(deep);
    assert.equal(heldBy(container, inside), true);
    assert.equal(heldBy(container, deep), true);
    assert.equal(heldBy(element(), inside), false);
  });
});

describe('overlaysOpenedFrom', () => {
  const acquired = [];
  /** Acquires a panel named `name` from `anchor`, released after the test. */
  function acquire(name, anchor, overlay = element()) {
    overlay.dataset.probe = name;
    acquired.push(overlay);
    acquireOverlayHost(overlay, anchor, { component: 'Probe' });
    return overlay;
  }
  /** The probe names `root`'s answer holds, sorted, so a failure prints no element. */
  const openedFrom = (root) =>
    overlaysOpenedFrom(root)
      .map((overlay) => overlay.dataset.probe)
      .sort((a, b) => a.localeCompare(b));
  afterEach(() => {
    for (const overlay of acquired) releaseOverlayHost(overlay);
    acquired.length = 0;
  });

  it('answers [] while no overlay is held', () => {
    assert.deepEqual(openedFrom(element()), []);
  });

  it('counts an overlay acquired from an anchor in root, by the class walk and by a chain', () => {
    const root = element();
    root.className = 'fabricate-app';
    acquire('walked', element('button', root));
    const target = element('div', root);
    const chain = standInChain(element('section'));
    registerOverlayChain(target, chain);
    try {
      acquire('chained', element('button', target));
      assert.deepEqual(chain.log, ['acquire'], 'the chain hosts the second');
      assert.deepEqual(openedFrom(root), ['chained', 'walked']);
      assert.deepEqual(openedFrom(element()), [], 'another root holds neither');
    } finally {
      unregisterOverlayChain(target, chain);
    }
  });

  it('forgets an overlay once it is released', () => {
    const root = element();
    const overlay = acquire('released', element('button', root));
    releaseOverlayHost(overlay);
    assert.deepEqual(openedFrom(root), []);
  });

  it('never answers root itself, nor stores an overlay acquired from itself', () => {
    const outer = element();
    const root = element('div', outer);
    acquire('root', element('button', root), root);
    const dialog = element('div', outer);
    acquire('dialog', dialog, dialog);
    assert.deepEqual(openedFrom(root), [], 'root is not its own panel');
    assert.deepEqual(openedFrom(outer), ['root'], 'the self-anchored dialog is not stored');
  });

  for (const [label, anchorOf] of [
    ['null', () => null],
    ['a text node', () => document.createTextNode('x')],
  ]) {
    it(`forgets an overlay re-acquired from ${label}`, () => {
      const root = element();
      const overlay = acquire('moved', element('button', root));
      acquire('moved', anchorOf(), overlay);
      assert.deepEqual(openedFrom(root), []);
      assert.deepEqual(openedFrom(document.body), [], 'no entry is left anywhere');
    });
  }

  it('follows a re-acquire whose anchor left root', () => {
    const [first, second] = [element(), element()];
    const overlay = acquire('moved', element('button', first));
    acquire('moved', element('button', second), overlay);
    assert.deepEqual(openedFrom(first), [], 'the old root no longer holds it');
    assert.deepEqual(openedFrom(second), ['moved']);
  });

  it('counts an overlay opened from inside a counted one, to a fixed point', () => {
    const root = element();
    const [third, second, first] = [element(), element(), element()];
    acquire('third', element('button', second), third);
    acquire('second', element('button', first), second);
    acquire('first', element('button', root), first);
    acquire('elsewhere', element('button'));
    assert.deepEqual(openedFrom(root), ['first', 'second', 'third']);
  });

  it('counts an anchor inside an open shadow root that root holds', () => {
    const root = element();
    const anchor = document.createElement('button');
    element('span', root).attachShadow({ mode: 'open' }).append(anchor);
    acquire('shadowed', anchor);
    assert.deepEqual(openedFrom(root), ['shadowed']);
  });
});

describe('overlayHostRect', () => {
  it('measures a container’s host, because a container draws no box', () => {
    const host = element('section');
    host.getBoundingClientRect = () => ({ left: 5, top: 6, width: 7, height: 8 });
    const container = createOverlayContainer(host, standInChain(host));
    assert.deepEqual(overlayHostRect(container), { left: 5, top: 6, width: 7, height: 8 });
    assert.equal(container.style.display, 'contents');
  });

  it('measures the standalone layer, which has no box of its own, as its window’s viewport', () => {
    const layer = acquireStandaloneOverlayLayer(document, {});
    const { innerWidth, innerHeight } = document.defaultView;
    const viewport = { left: 0, top: 0, width: innerWidth, height: innerHeight };
    assert.ok(innerWidth > 0 && innerHeight > 0, 'the window has a size');
    assert.deepEqual(overlayHostRect(layer.host), viewport);
    const container = createOverlayContainer(layer.host, standInChain(layer.host));
    assert.deepEqual(overlayHostRect(container), viewport, 'so is a container in it');
    layer.release();
  });

  it('places an action menu in the standalone layer, where a zero-size host would leave it unplaced', () => {
    const layer = acquireStandaloneOverlayLayer(document, {});
    const trigger = { left: 100, right: 130, top: 50, bottom: 80 };
    const placed = computeActionMenuLayout(
      trigger,
      { width: 120, height: 90 },
      overlayHostRect(layer.host)
    );
    assert.equal(placed?.placement, 'bottom');
    layer.release();
  });
});

describe('anchoredPopover under a registered chain', () => {
  it('releases the container it held when it closes, and holds a new one when it opens again', () => {
    const host = element('section');
    const target = element();
    const chain = standInChain(host);
    registerOverlayChain(target, chain);
    const trigger = element('button', target);
    const panel = element();
    const params = {
      component: 'ChainPopover',
      trigger,
      layout: () => ({ left: 0, top: 0, placement: 'bottom' }),
    };
    const handle = anchoredPopover(panel, params);
    assert.ok(panel.parentElement?.parentElement === host, 'held a container while open');
    handle.update({ ...params, open: false });
    assert.deepEqual(chain.log, ['acquire', 'release'], 'released on close');
    assert.equal(host.children.length, 0, 'the container is gone');
    handle.update(params);
    assert.equal(host.children.length, 1, 'a new one on reopening');
    handle.destroy();
    unregisterOverlayChain(target, chain);
  });
});

describe('anchoredPopover when its layout throws at setup', () => {
  it('leaves no registry entry and no panel in the host', () => {
    const app = element();
    app.className = 'fabricate-app';
    const trigger = element('button', app);
    const panel = element();
    assert.throws(
      () =>
        anchoredPopover(panel, {
          component: 'ThrowingPopover',
          trigger,
          layout() {
            throw new Error('layout failed');
          },
        }),
      /layout failed/
    );
    assert.deepEqual(overlaysOpenedFrom(app), [], 'the registry holds nothing');
  });
});

describe('acquireStandaloneOverlayLayer', () => {
  it('shares one layer per document, made on the first acquire and removed on the last release', () => {
    const one = acquireStandaloneOverlayLayer(document, { 'data-fabricate-theme': 'night' });
    const two = acquireStandaloneOverlayLayer(document, { 'data-fabricate-theme': 'day' });
    assert.ok(one.host === two.host && one.host.matches(LAYER), 'one shared layer');
    assert.equal(one.host.getAttribute('data-fabricate-theme'), 'night', 'themed when made');
    assert.ok(one.host.parentElement === document.body);
    one.release();
    one.release();
    assert.ok(two.host.isConnected, 'a repeated release counts once');
    two.release();
    assert.ok(!document.querySelector(LAYER), 'gone with the last release');
  });

  it('spans its window’s viewport and takes no pointer, and a container on it takes the pointer', () => {
    const layer = acquireStandaloneOverlayLayer(document, {});
    const { right, bottom, pointerEvents } = layer.host.style;
    assert.deepEqual([right, bottom, pointerEvents], ['0px', '0px', 'none']);
    const container = createOverlayContainer(layer.host, standInChain(layer.host));
    assert.equal(container.style.pointerEvents, 'auto', 'its panel takes the pointer');
    const framed = createOverlayContainer(element(), standInChain(layer.host));
    assert.equal(framed.style.pointerEvents, '', 'a container elsewhere states none');
    layer.release();
  });

  it('makes a new layer when the shared one was removed by another hand', () => {
    const one = acquireStandaloneOverlayLayer(document, {});
    one.host.remove();
    const two = acquireStandaloneOverlayLayer(document, {});
    assert.ok(two.host !== one.host && two.host.isConnected);
    two.release();
    one.release();
    assert.ok(!document.querySelector(LAYER));
  });
});

/**
 * The overlay host registry and the seam's shared standalone layer (issue 2454), with stand-in
 * chains: the nearest registered target above an anchor wins, an overlay opened inside another's
 * container joins that chain, a held overlay keeps its container, and the layer is counted per
 * document. The real chain is `components/published-overlays-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const {
  acquireOverlayHost,
  acquireStandaloneOverlayLayer,
  createOverlayContainer,
  overlayHostRect,
  registerOverlayChain,
  releaseOverlayHost,
  resetOverlayHostDiagnostics,
  unregisterOverlayChain,
} = await import('../../src/ui/svelte/util/overlayHost.js');

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

describe('overlayHostRect', () => {
  it('measures a container’s host, because a container draws no box', () => {
    const host = element('section');
    host.getBoundingClientRect = () => ({ left: 5, top: 6, width: 7, height: 8 });
    const container = createOverlayContainer(host, standInChain(host));
    assert.deepEqual(overlayHostRect(container), { left: 5, top: 6, width: 7, height: 8 });
    assert.equal(container.style.display, 'contents');
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

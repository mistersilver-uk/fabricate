/**
 * Proves that the `happy-dom` component test infrastructure works inside
 * `node --test`.
 *
 * `setupDOM()` assigns a live happy-dom Window's globals to `globalThis`
 * before the tests run. If `document`, `HTMLElement`, and basic DOM query
 * methods are all present and functional after that call, the infrastructure
 * is ready for real Svelte component tests.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

describe('happy-dom component test infrastructure', () => {
  before(setupDOM);
  after(teardownDOM);

  it('setupDOM() provides a working document object', () => {
    assert.ok(globalThis.document, 'globalThis.document should be defined after setupDOM()');
    assert.equal(typeof globalThis.document.createElement, 'function', 'document.createElement should be a function');
  });

  it('document.createElement() returns a real DOM element', () => {
    const div = document.createElement('div');
    assert.ok(div, 'createElement should return an element');
    assert.equal(div.tagName, 'DIV');
  });

  it('DOM elements support innerHTML and text content', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello, Fabricate';
    assert.equal(p.textContent, 'Hello, Fabricate');
  });

  it('elements can be appended to a container and queried', () => {
    const container = document.createElement('div');
    const span = document.createElement('span');
    span.id = 'target';
    span.textContent = 'found';

    container.appendChild(span);

    const found = container.querySelector('#target');
    assert.ok(found, 'querySelector should find the appended element');
    assert.equal(found.textContent, 'found');
  });

  it('HTMLElement is available as a constructor', () => {
    assert.equal(typeof globalThis.HTMLElement, 'function', 'HTMLElement should be a constructor function');
    const div = document.createElement('div');
    assert.ok(div instanceof HTMLElement, 'createElement("div") should return an HTMLElement instance');
  });

  it('document.body is accessible', () => {
    assert.ok(document.body, 'document.body should be accessible');
  });

  it('elements can be appended to document.body and found via document.querySelector', () => {
    const marker = document.createElement('section');
    marker.id = 'fabricate-test-marker';
    document.body.appendChild(marker);

    const found = document.querySelector('#fabricate-test-marker');
    assert.ok(found, 'document.querySelector should find element appended to body');

    // Clean up so subsequent tests see a predictable DOM.
    document.body.removeChild(marker);
  });
});

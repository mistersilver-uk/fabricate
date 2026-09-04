import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { portal } = await import('../../src/ui/svelte/actions/portal.js');

describe('portal action', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('moves the node into the requested target container', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    const node = document.createElement('div');
    source.appendChild(node);
    document.body.append(source, target);

    const action = portal(node, target);

    assert.equal(node.parentNode, target);
    action.destroy();
  });

  it('can resolve the target from a callback', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    const node = document.createElement('div');
    source.appendChild(node);
    document.body.append(source, target);

    const action = portal(node, () => target);

    assert.equal(node.parentNode, target);
    action.destroy();
  });

  it('refuses a selector string, leaving the node where it is (issue 1500)', () => {
    // The string branch was the document-wide `querySelector` form in a second spelling: the one
    // target shape that is not guaranteed to be an ancestor of the node being moved, and so the
    // one that could portal a panel into a DIFFERENT window. Removing it has to be visible here,
    // or a caller could reintroduce it and be silently served.
    const source = document.createElement('div');
    const target = document.createElement('div');
    target.className = 'portal-target';
    const node = document.createElement('div');
    source.appendChild(node);
    document.body.append(source, target);

    const action = portal(node, '.portal-target');

    assert.equal(node.parentNode, source);
    action.destroy();
  });
});

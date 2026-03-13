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
});

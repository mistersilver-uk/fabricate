import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { dismissOnOutsideClick } = await import('../../src/ui/svelte/actions/dismissOnOutsideClick.js');

describe('dismissOnOutsideClick action', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('calls onDismiss when clicking outside the node', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissCount += 1; }
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });

  it('does not call onDismiss when clicking inside the node', () => {
    const host = document.createElement('div');
    const inside = document.createElement('button');
    host.appendChild(inside);
    document.body.appendChild(host);

    let dismissed = false;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissed = true; }
    });

    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissed, false);
    action.destroy();
  });

  it('calls onDismiss when Escape is pressed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissCount += 1; }
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });

  it('does not react while disabled and starts reacting after update enables it', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      enabled: false,
      onDismiss: () => { dismissCount += 1; }
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    assert.equal(dismissCount, 0);

    action.update({
      enabled: true,
      onDismiss: () => { dismissCount += 1; }
    });
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });
});

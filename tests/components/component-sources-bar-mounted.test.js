import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-sources-bar-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte'
});

function craftingSources(overrides = {}) {
  const calls = { remove: [], toggle: [] };
  return {
    calls,
    store: {
      sources: overrides.sources ?? [
        { id: 'a', name: 'Aria', img: 'icons/svg/mystery-man.svg', removable: false },
        { id: 'b', name: 'Borin', img: '', removable: true }
      ],
      available: overrides.available ?? [
        { id: 'a', name: 'Aria', img: 'icons/svg/mystery-man.svg' },
        { id: 'b', name: 'Borin', img: '' },
        { id: 'c', name: 'Cy', img: '' }
      ],
      selectedSourceIds: overrides.selectedSourceIds ?? ['a', 'b'],
      remove: (id) => calls.remove.push(id),
      toggle: (id) => calls.toggle.push(id),
      add: () => {}
    }
  };
}

describe('ComponentSourcesBar mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders one focusable avatar button per source with an always-present aria-label', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const sources = target.querySelectorAll('.crafting-source');
    assert.equal(sources.length, 2, 'one element per source');

    const avatars = target.querySelectorAll('.crafting-source-avatar');
    for (const avatar of avatars) {
      assert.equal(avatar.tagName.toLowerCase(), 'button', 'each avatar is a button (focusable)');
      assert.ok((avatar.getAttribute('aria-label') || '').trim() !== '', 'avatar has a non-empty aria-label');
    }
  });

  it('renders the required (non-removable) source with a lock badge, aria-disabled, and an always-included aria suffix — and no remove control', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const required = target.querySelector('[data-source-id="a"]');
    assert.equal(required.getAttribute('data-source-removable'), 'false', 'required source flagged non-removable');
    const avatar = required.querySelector('.crafting-source-avatar');
    assert.equal(avatar.getAttribute('aria-disabled'), 'true', 'required avatar is aria-disabled');
    assert.match(avatar.getAttribute('aria-label'), /Aria/, 'aria-label names the actor');
    assert.match(avatar.getAttribute('aria-label'), /AlwaysIncluded/, 'aria-label carries the always-included suffix');
    assert.ok(required.querySelector('.crafting-source-lock'), 'lock badge rendered');
    assert.equal(required.querySelector('.crafting-source-remove'), null, 'no remove control for the required source');
  });

  it('renders a keyboard-reachable remove control for a removable source and calls remove on click', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const removable = target.querySelector('[data-source-id="b"]');
    assert.equal(removable.getAttribute('data-source-removable'), 'true', 'removable source flagged removable');
    const removeButton = removable.querySelector('[data-source-remove="b"]');
    assert.ok(removeButton, 'remove control rendered');
    assert.equal(removeButton.tagName.toLowerCase(), 'button', 'remove control is a button (keyboard reachable)');
    assert.ok((removeButton.getAttribute('aria-label') || '').includes('Remove'), 'remove control has a descriptive aria-label');

    removeButton.click();
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'remove called with the source id');
  });

  it('removes a removable source via right-click as an additive shortcut, but never the required source', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    target.querySelector('[data-source-id="b"] .crafting-source-avatar')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'right-click removed the removable source');

    target.querySelector('[data-source-id="a"] .crafting-source-avatar')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'right-click did NOT remove the required source');
  });

  it('opens the add/edit popover listing every owned actor to toggle', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    assert.equal(target.querySelector('.crafting-sources-popover'), null, 'popover closed by default');
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const popover = target.querySelector('.crafting-sources-popover');
    assert.ok(popover, 'popover opened');
    const options = popover.querySelectorAll('.crafting-source-option');
    assert.equal(options.length, 3, 'one option per available owned actor');

    options[2].click();
    flushSync();
    assert.deepEqual(calls.toggle, ['c'], 'toggling an available actor calls store.toggle');
  });
});

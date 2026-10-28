/** `SearchablePopover` opened from a caller's anchor in a second window (issues 2459, 2593). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const PANEL = '.fabricate-picker-popover';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-anchor-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

let second;

before(() => harness.setup());
after(() => harness.teardown());
beforeEach(() => {
  second = new Window({ url: 'http://localhost/detached' });
});
afterEach(async () => {
  harness.remount();
  await second.happyDOM.close();
});

/** Two macrotasks, so a mutation record and the close it causes have both landed. */
async function settle() {
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

describe('SearchablePopover anchored in a second window', () => {
  it('closes when its anchor is removed from that window’s document', async () => {
    const anchor = second.document.createElement('button');
    second.document.body.append(anchor);
    await harness.mount(
      {
        options: [{ id: 'coal', label: 'Coal' }],
        ariaLabel: 'Anchored',
        onSelect: () => {},
        anchor: () => anchor,
        open: true,
      },
      { ownerDocument: second.document }
    );
    await settle();
    assert.ok(Boolean(second.document.querySelector(PANEL)), 'the panel is open in that window');
    anchor.remove();
    await settle();
    assert.ok(!second.document.querySelector(PANEL), 'losing the anchor there closes it');
  });
});

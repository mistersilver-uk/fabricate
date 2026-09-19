/**
 * The two capabilities `bind:popover` is the picker's only wire onto the panel it extracted
 * (issue 1719), neither previously asserted by a shipped suite as a named DOM outcome:
 *   - the panel is registered as an "inside" node of the picker's `dismissOnOutsideClick`, so a
 *     `mousedown` on the panel's own chrome — which is in another DOM subtree, being portaled —
 *     does not dismiss it. The action listens on `mousedown` in the capture phase at `document`;
 *   - the active-option `$effect` scrolls the cursor's row into view, and it reaches that row by
 *     querying the panel element, so a picker holding no panel reference scrolls nothing.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const ICONS = [
  { id: 'anvil', label: 'Anvil', icon: 'fas fa-hammer' },
  { id: 'beaker', label: 'Beaker', icon: 'fas fa-flask' },
  { id: 'coin', label: 'Coin', icon: 'fas fa-coins' },
  { id: 'dagger', label: 'Dagger', icon: 'fas fa-khanda' },
  { id: 'ember', label: 'Ember', icon: 'fas fa-fire' },
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-panel-bindings-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'tests/fixtures/searchable-popover/CapabilityHost.svelte',
  ],
  componentPath: 'tests/fixtures/searchable-popover/CapabilityHost.svelte',
});

const trigger = () => harness.target.querySelector('.fabricate-picker button');
const panel = () => harness.target.querySelector('.fabricate-picker-popover');
const rows = () => [...panel().querySelectorAll('[role="option"]')];

async function settle() {
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

async function openPanel(props = {}) {
  await harness.mount({
    options: ICONS,
    triggerLabel: 'Icon',
    dialogAriaLabel: 'Choose an icon',
    popoverTitle: 'Icons',
    searchPlaceholder: 'Search icons...',
    onChoose: () => {},
    ...props,
  });
  trigger().click();
  flushSync();
  await settle();
  return panel();
}

describe('1719 the picker holds its panel element', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('does not dismiss on a mousedown inside the portaled panel, which is not in its subtree', async () => {
    const open = await openPanel();
    const header = open.querySelector('[data-popover-header]');
    assert.ok(header, 'the probe needs the panel header, which is the chrome no row covers');
    assert.equal(
      harness.target.querySelector('.fabricate-picker').contains(header),
      false,
      'the panel is portaled, so this assertion is only meaningful while it is outside the ' +
        'picker root — otherwise `node.contains` alone would carry it'
    );

    // The action listens at `document` in the capture phase, so the event must reach `document`.
    header.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    header.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    flushSync();
    await settle();

    assert.ok(
      panel(),
      'a click on the panel’s own header dismissed it: the picker no longer registers the panel ' +
        'as an inside node, so every GM who reaches for the query field or the header closes the ' +
        'picker instead'
    );
    assert.equal(trigger().getAttribute('aria-expanded'), 'true');
    harness.remount();
  });

  it('scrolls the active row into view on the first arrow key', async () => {
    const open = await openPanel();
    const scrolled = [];
    for (const row of rows()) {
      row.scrollIntoView = (options) => scrolled.push([row.textContent.trim(), options]);
    }

    const holder = open.querySelector('.manager-travel-popover-search input');
    holder.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    flushSync();
    await settle();

    assert.deepEqual(
      scrolled,
      [['Anvil', { block: 'nearest' }]],
      'the cursor moved to the first row and nothing scrolled it into view, so a cursor driven ' +
        'below the panel’s fold is invisible to the GM steering it'
    );
    harness.remount();
  });
});

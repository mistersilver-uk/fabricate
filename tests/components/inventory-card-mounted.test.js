/**
 * Issue 1778 — an inventory card is ListRow's card layout: one named button holding phrasing
 * content, pressed by the inspected card or, while a bulk selection is open, by each bulk-selected
 * card, with Shift routing a click or a key to the bulk toggle; a preview is the inert form.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { NON_PHRASING_CONTENT } from '../helpers/listRowContract.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CARD = 'src/ui/svelte/apps/inventory/InventoryItemCard.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inventory-card-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceTint.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/ListRow.svelte',
    CARD,
  ],
  componentPath: CARD,
  rootClass: 'fabricate-app',
});

const SALVAGEABLE = 'FABRICATE.App.Inventory.Card.SalvageablePip';
const TOOL = 'FABRICATE.App.Inventory.Card.ToolPip';
const BROKEN = 'FABRICATE.App.Inventory.Card.Broken';
const BULK = 'FABRICATE.App.Inventory.Card.SelectedSuffix';
const BULK_PIP = 'FABRICATE.App.Inventory.Card.BulkSelectedPip';

/** A salvageable tool carrying two essences. */
const gland = (overrides = {}) => ({
  key: 'sys:c1',
  name: 'Mordant Gland',
  img: 'icons/gland.webp',
  isEssenceSource: false,
  isTool: true,
  salvage: { enabled: true },
  totalQuantity: 7,
  essences: [
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
    { id: 'water', name: 'Water', icon: 'fas fa-droplet' },
  ],
  ...overrides,
});

/** Mount one card, recording its two callbacks. */
async function mountCard(props = {}) {
  const calls = { select: [], bulk: [] };
  const target = await harness.mount({
    item: gland(),
    onSelect: (key) => {
      calls.select.push(key);
    },
    onBulkToggle: (key) => {
      calls.bulk.push(key);
    },
    ...props,
  });
  const root = target.querySelector('[data-inventory-card]');
  return { calls, root, control: root.querySelector('.fabricate-list-row-open') };
}

/** Dispatch a real bubbling event on `node`, with `init` (its modifier keys, its key). */
function fire(node, type, init = {}) {
  const { KeyboardEvent, MouseEvent } = node.ownerDocument.defaultView;
  const EventClass = type.startsWith('key') ? KeyboardEvent : MouseEvent;
  const event = new EventClass(type, { bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

describe('InventoryItemCard through ListRow (issue 1778)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws one list-row card whose one named button holds phrasing content only', async () => {
    const { root, control } = await mountCard();
    assert.equal(root.getAttribute('role'), 'listitem');
    assert.equal(root.getAttribute('data-inventory-card'), 'sys:c1');
    assert.ok(root.matches('.fabricate-list-row.is-card.inventory-card'), root.className);
    assert.equal(root.querySelectorAll('button').length, 1, 'the card holds one control');
    assert.equal(control.tagName, 'BUTTON');
    assert.ok(control.matches('.inventory-card-button'), control.className);
    assert.equal(control.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(control.getAttribute('aria-keyshortcuts'), 'Shift+Enter Shift+Space');
    assert.equal(control.getAttribute('title'), 'Mordant Gland');
    assert.deepEqual(
      [...control.querySelectorAll(NON_PHRASING_CONTENT)].map((node) => node.tagName),
      [],
      'a button may hold phrasing content only'
    );
    const label = control.querySelector('.inventory-card-name');
    assert.equal(label.textContent, 'Mordant Gland');
    assert.ok(root.matches('.is-truncated'), 'the name keeps to one line');
    assert.equal(label.getAttribute('title'), 'Mordant Gland', 'whole in its title');
    assert.equal(
      control.querySelector('.inventory-card-thumb').getAttribute('aria-hidden'),
      'true',
      'the thumbnail is drawn only; the name carries its states'
    );
    assert.ok(!root.querySelector('.fab-medallion'), 'the fluid thumbnail replaces the mark');
  });

  it("folds the thumbnail's quantity, badges, essences and bulk selection into the name", async () => {
    const plain = await mountCard();
    assert.equal(
      plain.control.getAttribute('aria-label'),
      `Mordant Gland, ×7, ${SALVAGEABLE}, ${TOOL}, Fire, Water`
    );
    harness.remount();
    const broken = await mountCard({
      item: gland({ broken: true, isTool: false, essences: [] }),
      bulkActive: true,
      bulkSelected: true,
    });
    assert.equal(
      broken.control.getAttribute('aria-label'),
      `Mordant Gland, ${BROKEN}, ${SALVAGEABLE}, ${BULK}`,
      'Broken replaces the quantity, and the bulk selection is added, never a replacement'
    );
    harness.remount();
    const essence = await mountCard({
      item: { key: 'sys:fire', name: 'Fire', isEssenceSource: true, totalQuantity: 6 },
    });
    assert.equal(essence.control.getAttribute('aria-label'), 'Fire, ×6');
  });

  it('presses the inspected card, or each bulk-selected card while a bulk selection is open', async () => {
    const rows = [
      [{ selected: true }, 'true', ['is-selected']],
      [{ selected: false }, 'false', []],
      [{ bulkActive: true, bulkSelected: true }, 'true', ['is-bulk-selected']],
      [{ bulkActive: true, bulkSelected: false, selected: true }, 'false', ['is-selected']],
      // Bulk-selected with no bulk selection open: the inspected state alone presses.
      [{ bulkActive: false, bulkSelected: true, selected: false }, 'false', ['is-bulk-selected']],
    ];
    for (const [props, pressed, states] of rows) {
      const { root, control } = await mountCard(props);
      assert.equal(control.getAttribute('aria-pressed'), pressed, JSON.stringify(props));
      assert.deepEqual(
        ['is-selected', 'is-bulk-selected'].filter((state) => root.classList.contains(state)),
        states,
        `the root carries the inspected and bulk states: ${JSON.stringify(props)}`
      );
      assert.equal(
        root.hasAttribute('data-inventory-card-bulk-selected'),
        props.bulkSelected === true
      );
      const badges = [...root.querySelectorAll('[data-inventory-bulk-badge]')];
      assert.deepEqual(
        badges.map((badge) => badge.getAttribute('title')),
        props.bulkSelected === true ? [BULK_PIP] : [],
        `the check badge marks a bulk-selected card alone: ${JSON.stringify(props)}`
      );
      harness.remount();
    }
  });

  it('draws the quantity, the badges and each essence chip on the thumbnail', async () => {
    const plain = await mountCard();
    const qty = plain.root.querySelector('[data-inventory-qty]');
    assert.equal(qty.textContent.trim(), '×7');
    assert.ok(!qty.matches('.is-broken'), 'a sound item shows its quantity');
    assert.ok(!plain.root.querySelector('.inventory-card-broken-wash'), 'and no broken wash');
    assert.deepEqual(
      [...plain.root.querySelectorAll(':scope [data-inventory-badges] [data-inventory-pip]')].map(
        (badge) => [badge.dataset.inventoryPip, badge.getAttribute('title')]
      ),
      [
        ['salvageable', SALVAGEABLE],
        ['tool', TOOL],
      ]
    );
    assert.deepEqual(
      [...plain.root.querySelectorAll('[data-inventory-pip="essence"]')].map((chip) =>
        chip.getAttribute('title')
      ),
      ['Fire', 'Water']
    );
    harness.remount();
    const broken = await mountCard({ item: gland({ broken: true }) });
    const brokenQty = broken.root.querySelector('[data-inventory-qty]');
    assert.equal(brokenQty.textContent.trim(), BROKEN, 'Broken replaces the quantity');
    assert.ok(brokenQty.matches('.is-broken[data-inventory-qty-broken]'), brokenQty.className);
    assert.ok(broken.root.querySelector('.inventory-card-broken-wash'), 'over a broken wash');
  });

  it('inspects on a click or Enter, and toggles the bulk selection on Shift, never inspecting', async () => {
    const { calls, control } = await mountCard();
    const click = fire(control, 'click');
    assert.deepEqual(calls, { select: ['sys:c1'], bulk: [] });
    assert.ok(!click.defaultPrevented, 'a plain click keeps its default');
    const shiftClick = fire(control, 'click', { shiftKey: true });
    assert.ok(shiftClick.defaultPrevented, 'a Shift-click starts no text selection');
    const shiftEnter = fire(control, 'keydown', { key: 'Enter', shiftKey: true });
    const shiftSpace = fire(control, 'keydown', { key: ' ', shiftKey: true });
    assert.deepEqual(
      calls,
      { select: ['sys:c1'], bulk: ['sys:c1', 'sys:c1', 'sys:c1'] },
      'Shift on a click, Enter or Space reaches the bulk toggle alone'
    );
    assert.ok(
      shiftEnter.defaultPrevented && shiftSpace.defaultPrevented,
      'no native click follows'
    );
    const shiftTab = fire(control, 'keydown', { key: 'Tab', shiftKey: true });
    assert.ok(!shiftTab.defaultPrevented, 'Shift+Tab still moves focus');
    const enter = fire(control, 'keydown', { key: 'Enter' });
    fire(control, 'keydown', { key: ' ' });
    fire(control, 'keydown', { key: 'Spacebar' });
    fire(control, 'keydown', { key: 'Tab' });
    assert.deepEqual(
      calls,
      { select: ['sys:c1', 'sys:c1', 'sys:c1', 'sys:c1'], bulk: ['sys:c1', 'sys:c1', 'sys:c1'] },
      'Enter, Space and the legacy Spacebar inspect once each, and Tab and Shift+Tab act on nothing'
    );
    assert.ok(enter.defaultPrevented, 'so the native click does not inspect twice');
  });

  it('draws a broken card on the danger tone, and a sound one off it', async () => {
    const sound = await mountCard();
    assert.ok(!sound.root.matches('.is-danger, .is-broken'), sound.root.className);
    assert.ok(!sound.root.hasAttribute('data-inventory-card-broken'));
    harness.remount();
    const { root } = await mountCard({ item: gland({ broken: true }) });
    assert.ok(root.matches('.is-danger.is-broken'), root.className);
    assert.equal(root.getAttribute('data-inventory-card-broken'), 'true');
  });

  it('draws a preview as the inert form: no button, no pressed state, nothing focusable', async () => {
    const { calls, root, control } = await mountCard({ interactive: false, selected: true });
    assert.equal(root.querySelectorAll('button').length, 0, 'no button');
    assert.equal(control.tagName, 'DIV');
    assert.ok(control.matches('.inventory-card-button.is-static'), control.className);
    for (const name of [
      'aria-pressed',
      'aria-label',
      'aria-keyshortcuts',
      'tabindex',
      'data-keyboard-focus',
    ]) {
      assert.ok(!root.querySelector(`[${name}]`), `the preview carries ${name}`);
    }
    fire(control, 'click');
    fire(control, 'keydown', { key: 'Enter', shiftKey: true });
    assert.deepEqual(calls, { select: [], bulk: [] }, 'and it acts on nothing');
  });
});

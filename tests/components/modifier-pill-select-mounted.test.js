/**
 * `ModifierPillSelect` MOUNTED (issue 1055) — the announcement and focus contracts.
 * 1. `aria-live="polite"` used to sit on `[data-modifier-pill-row]`. `aria-relevant`
 *    defaults to `additions text`, so removing a keyed `{#each}` child was excluded
 *    outright — a removal announced NOTHING — while an addition announced the whole new
 *    pill subtree, remove-button label included ("Medicine, Remove Medicine"). The region
 *    is now a visually-hidden text node of its own, `[data-modifier-pill-status]`, whose
 *    content is a sentence naming the current selection.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PILL_SELECT_PATH = 'src/ui/svelte/components/ModifierPillSelect.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-modifier-pill-select-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    // `SearchablePopover` portals its panel to the manager host and lays it out against
    // the trigger, so the add menu reaches these two as well (issue 1458).
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  // `Field.svelte` is THE manager's labelled form field (issue 1428).
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    // `SearchablePopover` and the two primitives IT renders (issue 1458). The add menu is
    // the shared picker now, so this tree reaches all three; an omission does not fail this
    // suite, it cancels every test in it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    PILL_SELECT_PATH,
  ],
  componentPath: PILL_SELECT_PATH,
});

const OPTIONS = Object.freeze([
  Object.freeze({ id: 'med', label: 'Medicine' }),
  Object.freeze({ id: 'alch', label: 'Alchemy' }),
  Object.freeze({ id: 'herb', label: 'Herbalism' }),
]);

const NONE_LABEL = 'No modifiers — nothing is added to this recipe’s check roll.';

before(async () => {
  await harness.setup();
  // The shared harness stubs `i18n.format` as `key:{json}`.
  globalThis.game.i18n.format = (key) => key;
});
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Let Svelte flush, twice over. */
async function settle() {
  flushSync();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

/** Name the focused node without ever handing a mounted element to `node:assert`. */
function focusDescriptor(element) {
  if (!element) return 'none';
  if (element.hasAttribute?.('data-modifier-pill-remove')) {
    return `remove:${element.getAttribute('data-modifier-pill-remove')}`;
  }
  if (element.hasAttribute?.('data-modifier-pill-menu-button')) return 'menu';
  return element.tagName?.toLowerCase?.() ?? 'unknown';
}

/** Mount the control with the given selection. */
async function mountPills(selectedIds, props = {}) {
  const toggles = [];
  const root = await harness.mount({
    options: OPTIONS,
    selectedIds,
    testId: 'pill',
    noneSelectedLabel: NONE_LABEL,
    onToggle: (id, next) =>
      toggles.push({ id, next, focused: focusDescriptor(globalThis.document.activeElement) }),
    ...props,
  });
  return { root, toggles };
}

describe('ModifierPillSelect announcement contract (issue 1055)', () => {
  it('carries the live region on its own status node, not on the pill row', async () => {
    const { root } = await mountPills(['med', 'alch']);
    const status = root.querySelector(
      '[data-modifier-pill-select="pill"] [data-modifier-pill-status]'
    );
    assert.ok(Boolean(status), 'the status node lives inside the control');
    assert.equal(
      status.getAttribute('aria-live'),
      'polite',
      'announced after the current utterance, not over it'
    );
    const row = root.querySelector('[data-modifier-pill-row]');
    assert.ok(Boolean(row), 'pre-condition: the pill row still renders');
    assert.ok(
      !row.hasAttribute('aria-live'),
      'the row must NOT be a live region: it announces added pill chrome and no removal at all'
    );
  });

  it('names the selected modifiers rather than counting them, and restates on every change', async () => {
    const { root } = await mountPills(['med', 'alch']);
    const status = () => root.querySelector('[data-modifier-pill-status]').textContent;
    assert.ok(status().includes('Medicine'), 'the summary names the selection');
    assert.ok(
      status().includes('Alchemy'),
      '…all of it — "2 selected" says nothing about which two'
    );

    // A removal is the case the old region could not announce at all.
    await harness.setProps({ selectedIds: ['alch'] });
    assert.ok(!status().includes('Medicine'), 'a removal is reflected in the region');
    assert.ok(status().includes('Alchemy'), 'and what remains is restated');
  });

  it('falls back to the caller’s empty-set sentence when nothing is selected', async () => {
    const { root } = await mountPills([]);
    assert.equal(
      root.querySelector('[data-modifier-pill-status]').textContent.trim(),
      NONE_LABEL,
      'an empty set is a real authored state and says what it means for the roll'
    );
  });
});

describe('ModifierPillSelect focus contract (issue 1055)', () => {
  // Removing the FIRST of several has only a next sibling and the LAST only a previous
  // one; the MIDDLE has both, and pins the preference — next first, because jumping
  // backwards past pills the GM has not reached reads as being bounced. All three
  // survive the update (the `{#each}` is keyed), so none needs a render to pass first.
  for (const [removed, expected] of [
    ['med', 'remove:alch'],
    ['alch', 'remove:herb'],
    ['herb', 'remove:alch'],
  ]) {
    it(`moves focus to the neighbouring remove button when ${removed} is removed`, async () => {
      const { root, toggles } = await mountPills(['med', 'alch', 'herb']);
      root.querySelector(`[data-modifier-pill-remove="${removed}"]`).click();
      // Deliberately NOT awaited: the move is synchronous and lands before `onToggle`.
      assert.deepEqual(
        toggles.map(({ id, next, focused }) => [id, next, focused]),
        [[removed, false, expected]],
        'focus must land on a surviving control before the removal is emitted'
      );
    });
  }

  it('falls back to the menu button when the last pill is removed', async () => {
    const { root, toggles } = await mountPills(['med']);
    root.querySelector('[data-modifier-pill-remove="med"]').click();
    assert.deepEqual(
      toggles.map(({ focused }) => focused),
      ['menu'],
      'with no neighbour left, focus stays in the control instead of dropping to <body>'
    );
  });
});

/** The picker conversion's INTERACTION contract (issue 1458). */
describe('ModifierPillSelect popover contract (issue 1458)', () => {
  const menuButton = (root) => root.querySelector('[data-modifier-pill-menu-button]');
  const menuOptions = (root) =>
    Array.from(root.querySelectorAll('[data-modifier-pill-option]')).map((option) =>
      option.getAttribute('data-modifier-pill-option')
    );

  it('announces a listbox on the trigger and opens one', async () => {
    const { root } = await mountPills(['med']);
    const trigger = menuButton(root);
    assert.equal(
      trigger.getAttribute('aria-haspopup'),
      'listbox',
      'this menu has no search field, so a listbox is what activating the trigger opens'
    );
    assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'closed to begin with');
    assert.deepEqual(menuOptions(root), [], 'and rendering no options while closed');

    trigger.click();
    await settle();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the trigger announces the open');
    assert.deepEqual(
      menuOptions(root),
      ['alch', 'herb'],
      'the still-unselected options, each keeping the hook four suites address it by'
    );
    const listbox = root.querySelector('[role="listbox"]');
    assert.ok(Boolean(listbox), 'the options sit in a real listbox');
    assert.ok(
      Boolean(listbox.getAttribute('aria-label')),
      'and it is named — an unnamed listbox is announced as a list with no purpose'
    );
    assert.deepEqual(
      Array.from(listbox.querySelectorAll('[data-modifier-pill-option]')).map((option) => [
        option.getAttribute('role'),
        option.getAttribute('aria-selected'),
      ]),
      [
        ['option', 'false'],
        ['option', 'false'],
      ],
      'every row is an option, and none is the current value — this menu ADDS'
    );
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { root } = await mountPills(['med']);
    menuButton(root).click();
    await settle();
    assert.equal(menuButton(root).getAttribute('aria-expanded'), 'true', 'pre-condition: open');

    globalThis.document.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await settle();
    await settle();

    assert.equal(
      menuButton(root).getAttribute('aria-expanded'),
      'false',
      'Escape closes the menu — a lost key handler is invisible in a markup diff'
    );
    assert.deepEqual(menuOptions(root), [], 'and the options go with it');
    assert.equal(
      focusDescriptor(globalThis.document.activeElement),
      'menu',
      'focus returns to the trigger rather than dropping to <body>'
    );
  });

  it('refuses to open at the cap while staying focusable', async () => {
    const { root } = await mountPills(['med'], { addDisabled: true });
    const trigger = menuButton(root);
    assert.equal(
      trigger.getAttribute('aria-disabled'),
      'true',
      'the cap is announced on the control that cannot act'
    );
    assert.equal(
      trigger.disabled,
      false,
      'and NOT through `disabled`: that drops the button from several screen readers` tab ' +
        'order and makes the post-removal focus fallback a silent no-op'
    );

    trigger.click();
    await settle();
    assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'the click is refused');
    assert.deepEqual(menuOptions(root), [], 'and no options are rendered');

    trigger.focus();
    assert.equal(
      focusDescriptor(globalThis.document.activeElement),
      'menu',
      'the refusing trigger is still a real focus target'
    );
  });

  it('adds the chosen option and closes, without renaming the hook it is addressed by', async () => {
    const { root, toggles } = await mountPills(['med']);
    menuButton(root).click();
    await settle();
    root.querySelector('[data-modifier-pill-option="herb"]').click();
    await settle();
    assert.deepEqual(
      toggles.map(({ id, next }) => [id, next]),
      [['herb', true]],
      'choosing emits the add'
    );
    assert.equal(
      menuButton(root).getAttribute('aria-expanded'),
      'false',
      'and the menu closes behind it'
    );
  });
});

/** THE ACTION MENU'S CONTRACT (issue 1477). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-action-menu-',
  rawModules: [
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/actionMenuLayout.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ActionMenu.svelte',
  ],
  componentPath: 'src/ui/svelte/components/ActionMenu.svelte',
});

/** Three enabled verbs and one disabled note — the shape both callers produce between them. */
function items() {
  return [
    { id: 'first', label: 'Open source task', icon: 'fas fa-up-right-from-square' },
    {
      id: 'middle',
      label: 'Force add',
      icon: 'fas fa-plus',
      data: { 'data-action': 'force-include' },
    },
    { id: 'note', label: 'Enable in library first', disabled: true },
    { id: 'last', label: 'Exclude from environment', icon: 'fas fa-ban', danger: true },
  ];
}

function props(chosen = []) {
  return {
    items: items(),
    triggerLabel: 'More actions',
    onSelect: (id) => chosen.push(id),
  };
}

const trigger = (target) => target.querySelector('[aria-haspopup="menu"]');
const panel = (target) => target.querySelector('[role="menu"]');
const menuItems = (target) => [...target.querySelectorAll('[role="menuitem"]')];
const enabledItems = (target) => menuItems(target).filter((item) => !item.disabled);

/** Dispatch a keydown on an element or on the document itself (which has no `ownerDocument`). */
function keydown(node, key) {
  const view = (node.ownerDocument ?? node).defaultView;
  node.dispatchEvent(new view.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Open by click and settle, returning the mount target. */
async function open(target) {
  trigger(target).click();
  await flushRender();
  return target;
}

describe('1477 ActionMenu announces a MENU, never a listbox', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('the trigger promises a menu and reports its own expanded state', async () => {
    const target = await harness.mount(props());
    const button = trigger(target);
    assert.ok(Boolean(button), 'the trigger announces `aria-haspopup="menu"`');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(
      button.className,
      'fabricate-icon-button manager-icon-button',
      'the trigger IS the shared IconButton, root class first (issue 1502)'
    );
    assert.equal(
      button.getAttribute('aria-label'),
      'More actions',
      'an icon-only control takes its accessible name as a required prop'
    );
    assert.ok(!panel(target), 'and nothing is rendered while it is closed');

    await open(target);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    harness.remount();
  });

  it('the panel is a named menu of menuitems, and carries NO selection vocabulary', async () => {
    const target = await open(await harness.mount(props()));
    const menu = panel(target);
    assert.ok(Boolean(menu), 'the panel is a menu');
    assert.equal(menu.getAttribute('aria-label'), 'More actions');
    assert.equal(menu.getAttribute('tabindex'), '-1');
    assert.equal(menu.getAttribute('data-keyboard-focus'), 'true');

    assert.equal(menuItems(target).length, 4);
    for (const item of menuItems(target)) {
      assert.equal(item.getAttribute('role'), 'menuitem');
      assert.equal(item.getAttribute('tabindex'), '-1');
      assert.equal(item.getAttribute('data-keyboard-focus'), 'true');
      assert.ok(!item.hasAttribute('aria-selected'), 'a command is neither selected nor not');
    }

    // THE OLD ANNOUNCEMENT, asserted GONE rather than merely unlooked-for.
    assert.ok(!target.querySelector('[role="listbox"]'), 'no listbox');
    assert.ok(!target.querySelector('[role="option"]'), 'no options');
    assert.ok(!target.querySelector('[role="dialog"]'), 'no dialog');
    assert.ok(!target.querySelector('[aria-selected]'), 'nothing is selected');
    assert.ok(
      !menu.hasAttribute('aria-activedescendant') && !trigger(target).hasAttribute('aria-activedescendant'),
      'a menu MOVES focus to its items rather than pointing at them, so nothing here points'
    );
    harness.remount();
  });

  it('a caller’s per-item hooks and modifiers survive the primitive', async () => {
    const target = await open(await harness.mount(props()));
    const forced = target.querySelector('[data-action="force-include"]');
    assert.ok(Boolean(forced), 'the per-item `data` map is stamped on the item button');
    assert.equal(forced.getAttribute('role'), 'menuitem', 'and cannot overwrite the primitive’s own role');
    assert.ok(
      target.querySelector('.manager-action-menu-item.is-danger'),
      'a danger verb keeps its modifier class'
    );
    assert.ok(
      menuItems(target)[2].disabled,
      'and a note is a genuinely disabled button rather than an `aria-disabled` one'
    );
    // The icon cell is rendered for EVERY item.
    for (const item of menuItems(target)) {
      assert.equal(item.firstElementChild?.tagName, 'I', 'every item leads with its icon cell');
    }
    harness.remount();
  });
});

describe('1477 ActionMenu keyboard contract (APG menu button)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('opening moves focus TO the first item', async () => {
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    assert.ok(doc.activeElement === enabledItems(target)[0], 'focus is on the first item');
    harness.remount();
  });

  it('ArrowUp on the trigger opens onto the LAST item', async () => {
    const target = await harness.mount(props());
    keydown(trigger(target), 'ArrowUp');
    await flushRender();
    const doc = target.ownerDocument;
    assert.ok(Boolean(panel(target)), 'ArrowUp opens the menu');
    const enabled = enabledItems(target);
    assert.ok(doc.activeElement === enabled.at(-1), 'and lands on its last item');
    harness.remount();
  });

  it('ArrowDown and ArrowUp wrap, and SKIP the disabled note', async () => {
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    const enabled = enabledItems(target);
    assert.equal(enabled.length, 3, 'three of the four items are focusable');

    keydown(doc.activeElement, 'ArrowDown');
    assert.ok(doc.activeElement === enabled[1]);
    keydown(doc.activeElement, 'ArrowDown');
    assert.ok(
      doc.activeElement === enabled[2],
      'the disabled note is stepped over rather than focused'
    );
    keydown(doc.activeElement, 'ArrowDown');
    assert.ok(doc.activeElement === enabled[0], 'and the run wraps');

    keydown(doc.activeElement, 'ArrowUp');
    assert.ok(doc.activeElement === enabled[2], 'ArrowUp wraps backwards');
    harness.remount();
  });

  it('Home and End jump to the ends', async () => {
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    const enabled = enabledItems(target);

    keydown(doc.activeElement, 'End');
    assert.ok(doc.activeElement === enabled.at(-1));
    keydown(doc.activeElement, 'Home');
    assert.ok(doc.activeElement === enabled[0]);
    harness.remount();
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    // Dispatched on the DOCUMENT, because that is where `dismissOnOutsideClick` listens and
    // because a GM can press Escape with focus anywhere in the window while a menu is open.
    keydown(doc, 'Escape');
    await flushRender();
    assert.ok(!panel(target), 'the menu closes');
    assert.ok(doc.activeElement === trigger(target), 'and focus comes back to the trigger');
    harness.remount();
  });

  it('Tab closes and returns focus to the trigger, which is the stated deviation', async () => {
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    keydown(doc.activeElement, 'Tab');
    await flushRender();
    assert.ok(!panel(target), 'the menu closes');
    assert.ok(
      doc.activeElement === trigger(target),
      'and focus returns to the trigger rather than to whatever follows the PORTAL HOST, which ' +
        'is where the APG contract would send it and is somewhere else in the window entirely'
    );
    harness.remount();
  });

  it('activating an item reports its id, closes, and restores focus', async () => {
    const chosen = [];
    const target = await open(await harness.mount(props(chosen)));
    const doc = target.ownerDocument;

    enabledItems(target)[1].click();
    await flushRender();

    assert.deepEqual(chosen, ['middle'], 'the item id reaches the caller');
    assert.ok(!panel(target), 'and the menu closes behind it');
    assert.ok(doc.activeElement === trigger(target), 'with focus back on the trigger');
    harness.remount();
  });

  it('an outside mousedown closes WITHOUT stealing focus back', async () => {
    // The other half of the dismiss callback.
    const target = await open(await harness.mount(props()));
    const doc = target.ownerDocument;
    const elsewhere = doc.createElement('button');
    doc.body.append(elsewhere);
    elsewhere.focus();

    elsewhere.dispatchEvent(new doc.defaultView.MouseEvent('mousedown', { bubbles: true }));
    await flushRender();

    assert.ok(!panel(target), 'the menu closes');
    assert.ok(doc.activeElement === elsewhere, 'and focus stays where the pointer put it');
    elsewhere.remove();
    harness.remount();
  });

  it('a disabled menu refuses to open at all', async () => {
    const target = await harness.mount({ ...props(), disabled: true });
    trigger(target).click();
    keydown(trigger(target), 'ArrowDown');
    await flushRender();
    assert.ok(!panel(target), 'neither the pointer nor the keyboard opens a disabled menu');
    harness.remount();
  });
});

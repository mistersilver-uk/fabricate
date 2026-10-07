/**
 * `Typeahead` mounted (issue 1782): #2157's holder contract, one test per clause, through the
 * shared component rather than a call site, plus its naming route and the hooks it carries.
 * `tests/fixtures/typeahead/TypeaheadHost.svelte` binds `query` and reports every write.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  TYPEAHEAD_RUNE_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-typeahead-',
  runeModules: TYPEAHEAD_RUNE_MODULES,
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/Typeahead.svelte',
    'tests/fixtures/typeahead/TypeaheadHost.svelte',
  ],
  componentPath: 'tests/fixtures/typeahead/TypeaheadHost.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const ITEMS = Object.freeze([
  { id: 'iron-ingot', name: 'Iron ingot', icon: 'fas fa-cube' },
  { id: 'iron-ore', name: 'Iron ore', icon: '' },
  { id: 'copper-wire', name: 'Copper wire', icon: 'fas fa-bolt' },
]);

/** The caller's filter: what a call site hands `source`. */
function matching(query) {
  const needle = query.trim().toLowerCase();
  return needle ? ITEMS.filter((item) => item.name.toLowerCase().includes(needle)) : [];
}

async function mountTypeahead(props = {}) {
  const chosen = [];
  const writes = [];
  const root = await harness.mount({
    ariaLabel: 'Find a material',
    source: matching,
    itemLabel: (item) => item.name,
    onChoose: (item, index) => {
      chosen.push([item.id, index]);
    },
    onWrite: (next) => {
      writes.push(next);
    },
    ...props,
  });
  return { root, input: root.querySelector('input[type="search"]'), chosen, writes };
}

/** One keystroke's worth of input: the value, then the bubbling `input` event. */
function type(input, text) {
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
}

function press(input, key) {
  const event = new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  flushSync();
  return event;
}

function focus(input, kind = 'focus') {
  input.dispatchEvent(new globalThis.FocusEvent(kind));
  flushSync();
}

const listbox = (root) => root.querySelector('[role="listbox"]');
const options = (root) => [...root.querySelectorAll('[role="option"]')];

/** Every `console.warn` naming `Typeahead` raised while `run` mounts. */
async function typeaheadWarningsDuring(run) {
  const original = console.warn;
  const seen = [];
  console.warn = (...args) => {
    seen.push(args.join(' '));
  };
  try {
    await run();
    flushSync();
  } finally {
    console.warn = original;
  }
  return seen.filter((message) => message.includes('Typeahead'));
}

describe('Typeahead keeps the typeahead holder contract', () => {
  it('is a combobox naming its active option by aria-activedescendant, whose options never take focus', async () => {
    const { root, input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    assert.equal(input.getAttribute('aria-controls'), listbox(root).id);
    assert.ok(options(root).length === 2, 'both iron names are listed');
    for (const option of options(root)) assert.equal(option.getAttribute('tabindex'), '-1');

    press(input, 'ArrowDown');
    const [first] = options(root);
    assert.equal(input.getAttribute('aria-activedescendant'), first.id);
    assert.equal(first.getAttribute('aria-selected'), 'true');
    assert.ok(document.activeElement !== first, 'the active option is named, never focused');
  });

  it('is open only while the field holds focus and its query is not empty', async () => {
    const { root, input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    assert.ok(Boolean(listbox(root)), 'open: focused, with a query');
    focus(input, 'blur');
    assert.ok(!listbox(root), 'closed once the field loses focus');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    focus(input);
    assert.ok(Boolean(listbox(root)), 'open again on focus, the query unchanged');
    type(input, ' '.repeat(3));
    assert.ok(!listbox(root), 'closed under a blank query');
  });

  it('starts a new query with no active option', async () => {
    const { root, input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    press(input, 'ArrowDown');
    assert.ok(input.hasAttribute('aria-activedescendant'), 'an option is active before the edit');
    type(input, 'iron o');
    assert.ok(Boolean(listbox(root)), 'the narrowed list is still open');
    assert.ok(!input.hasAttribute('aria-activedescendant'), 'the new query names no option');
    assert.deepEqual(
      options(root).map((option) => option.getAttribute('aria-selected')),
      ['false'],
      'and marks none'
    );
  });

  it('clears on Escape and stops it only when the query is not empty; an empty Escape propagates', async () => {
    const { root, input, writes } = await mountTypeahead();
    // Above the mount root, which is where Svelte's delegated handler listens.
    const reached = [];
    const listener = (event) => {
      reached.push(event.key);
    };
    document.body.addEventListener('keydown', listener);
    try {
      focus(input);
      type(input, 'iron');

      const clearing = press(input, 'Escape');
      assert.equal(clearing.defaultPrevented, true);
      assert.deepEqual(reached, [], 'a clearing Escape stops at the field');
      assert.equal(input.value, '', 'and empties it');
      assert.equal(writes.at(-1), '', 'through the bound query');
      assert.ok(!listbox(root), 'which closes the list');

      const empty = press(input, 'Escape');
      assert.equal(empty.defaultPrevented, false);
      assert.deepEqual(
        reached,
        ['Escape'],
        'an empty field lets Escape reach the dialog behind it'
      );
    } finally {
      document.body.removeEventListener('keydown', listener);
    }
  });

  it('commits the active option on Enter, and nothing with none active', async () => {
    const { input, chosen } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    const idle = press(input, 'Enter');
    assert.equal(idle.defaultPrevented, true, 'Enter is consumed while the list is open');
    assert.deepEqual(chosen, [], 'and commits nothing with no option active');

    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    press(input, 'Enter');
    assert.deepEqual(chosen, [['iron-ore', 1]], 'the active option, with its index');

    type(input, '');
    assert.equal(
      press(input, 'Enter').defaultPrevented,
      false,
      'a closed field leaves Enter alone'
    );
  });

  it('wraps the arrows: ArrowUp from none lands on the last, and each end wraps to the other', async () => {
    const { input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    const active = () => input.getAttribute('aria-activedescendant') ?? '';
    press(input, 'ArrowUp');
    assert.ok(active().endsWith('-option-1'), `ArrowUp from none lands on the last: ${active()}`);
    press(input, 'ArrowDown');
    assert.ok(active().endsWith('-option-0'), 'ArrowDown wraps from the last to the first');
    press(input, 'ArrowUp');
    assert.ok(active().endsWith('-option-1'), 'ArrowUp wraps from the first to the last');
  });

  it('takes End at a caret already at the end, and Home at a caret at the start', async () => {
    const { input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    input.setSelectionRange(4, 4);
    assert.equal(press(input, 'End').defaultPrevented, true);
    assert.ok(input.getAttribute('aria-activedescendant').endsWith('-option-1'), 'End: the last');
    input.setSelectionRange(0, 0);
    assert.equal(press(input, 'Home').defaultPrevented, true);
    assert.ok(input.getAttribute('aria-activedescendant').endsWith('-option-0'), 'Home: the first');
  });

  it('never consumes Tab, even with an option active', async () => {
    const { input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    press(input, 'ArrowDown');
    assert.equal(press(input, 'Tab').defaultPrevented, false, 'Tab leaves the field');
  });

  it('leaves no option active after a commit, under the unchanged query', async () => {
    const { input, chosen } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    press(input, 'ArrowDown');
    press(input, 'Enter');
    assert.deepEqual(chosen, [['iron-ingot', 0]]);
    assert.ok(!input.hasAttribute('aria-activedescendant'), 'a second Enter has nothing to commit');
  });

  it('gives two typeaheads two list ids', async () => {
    const first = await mountTypeahead();
    focus(first.input);
    type(first.input, 'iron');
    const id = listbox(first.root).id;
    harness.remount();
    const second = await mountTypeahead();
    focus(second.input);
    type(second.input, 'iron');
    assert.notEqual(listbox(second.root).id, id);
  });

  it('is dismissed by a press outside it until the query changes', async () => {
    const { root, input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    root
      .querySelector('[data-outside]')
      .dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    assert.ok(!listbox(root), 'the press elsewhere closed it');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    press(input, 'ArrowDown');
    assert.ok(!listbox(root), 'a key that changes no query leaves it closed');
    type(input, 'iron i');
    assert.ok(Boolean(listbox(root)), 'a changed query reopens it');
  });

  it('writes one keystroke to the bound query once, and the controller opens the list on it', async () => {
    const { root, input, writes } = await mountTypeahead();
    type(input, 'ir');
    assert.deepEqual(writes, ['ir'], 'the field’s handler wrote the query, once');
    assert.ok(Boolean(listbox(root)), 'the controller’s handler reached the input and held it');
    type(input, 'iro');
    assert.deepEqual(writes, ['ir', 'iro']);
  });

  it('commits a pointer choice through onChoose with the item', async () => {
    const { root, input, chosen } = await mountTypeahead();
    focus(input);
    type(input, 'copper');
    options(root)[0].click();
    flushSync();
    assert.deepEqual(chosen, [['copper-wire', 0]]);
  });
});

describe('Typeahead names its field and its list by one route', () => {
  it('ariaLabel names the input and the list', async () => {
    const { root, input } = await mountTypeahead();
    focus(input);
    type(input, 'iron');
    assert.equal(input.getAttribute('aria-label'), 'Find a material');
    assert.equal(listbox(root).getAttribute('aria-label'), 'Find a material');
  });

  it('ariaLabelledBy points both at the caller’s caption', async () => {
    const { root, input } = await mountTypeahead({ ariaLabel: '', ariaLabelledBy: 'caption-id' });
    focus(input);
    type(input, 'iron');
    assert.equal(input.getAttribute('aria-labelledby'), 'caption-id');
    assert.ok(!input.hasAttribute('aria-label'), 'the input carries no second name');
    assert.equal(listbox(root).getAttribute('aria-labelledby'), 'caption-id');
    assert.ok(!listbox(root).hasAttribute('aria-label'), 'nor does the list');
  });

  it('label renders the field’s caption, which is the input’s one label and the list’s name', async () => {
    const { root, input } = await mountTypeahead({ ariaLabel: '', label: 'Material' });
    focus(input);
    type(input, 'iron');
    assert.equal(input.labels.length, 1, 'one label');
    assert.equal(
      input.labels[0].querySelector('.fabricate-search-caption').textContent,
      'Material'
    );
    assert.ok(!input.hasAttribute('aria-label'), 'and no aria-label beside it');
    assert.equal(listbox(root).getAttribute('aria-label'), 'Material');
  });
});

describe('Typeahead carries its caller’s hooks to the part each names', () => {
  it('class and rest on the root, inputProps on the input, list and option hooks on theirs', async () => {
    const { root, input } = await mountTypeahead({
      class: 'site-search',
      'data-site': '',
      density: 'compact',
      icon: 'fas fa-tags',
      inputProps: { 'data-input-hook': '', disabled: false },
      listClass: 'site-list',
      listProps: { 'data-list-hook': '' },
      optionClass: 'site-option',
      optionDataAttr: 'data-option-hook',
      itemIcon: (item) => item.icon,
    });
    const host = root.querySelector('.fabricate-typeahead');
    assert.ok(host.matches('label.fabricate-search.is-compact.site-search[data-site]'));
    assert.ok(host.querySelector(':scope > i.fa-tags'), 'the field draws the caller’s glyph');
    assert.ok(input.hasAttribute('data-input-hook'));
    focus(input);
    type(input, 'iron');
    const list = listbox(root);
    assert.ok(list.matches('.fabricate-typeahead-list.site-list[data-list-hook]'));
    assert.equal(list.parentElement, root, 'the list floats in the application root');
    const [ingot, ore] = options(root);
    assert.ok(ingot.matches('button.fabricate-typeahead-option.site-option'));
    assert.equal(ingot.getAttribute('data-option-hook'), 'iron-ingot');
    assert.equal(ingot.getAttribute('data-keyboard-focus'), 'true');
    assert.ok(ingot.querySelector(':scope > i.fa-cube'), 'an item with a glyph draws it');
    assert.ok(!ore.querySelector('i'), 'an item without one draws none');
    assert.equal(ore.textContent.trim(), 'Iron ore');
  });

  it('draws the magnifier when the caller names no glyph', async () => {
    const { root } = await mountTypeahead();
    const field = root.querySelector('.fabricate-typeahead');
    assert.ok(field.querySelector(':scope > i.fas.fa-search'));
  });

  it('writes the holder contract over a colliding inputProps key', async () => {
    const { input } = await mountTypeahead({
      inputProps: { role: 'textbox', 'aria-expanded': 'true' },
    });
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
  });

  it('warns when inputProps carries a handler the holder replaces, and only then', async () => {
    const warned = await typeaheadWarningsDuring(() =>
      mountTypeahead({ inputProps: { oninput: () => {}, onkeydown: () => {} } })
    );
    assert.equal(warned.length, 1, warned.join('\n'));
    assert.match(warned[0], /oninput, onkeydown in `inputProps` never runs/);
    harness.remount();
    const quiet = await typeaheadWarningsDuring(() =>
      mountTypeahead({ inputProps: { 'data-input-hook': '' } })
    );
    assert.deepEqual(quiet, []);
  });

  it('says nothing at rest, even with an emptyLabel', async () => {
    const { root } = await mountTypeahead({ emptyLabel: 'No materials match' });
    assert.ok(!root.querySelector('.fabricate-typeahead-list'), 'no panel at rest');
  });

  it('says emptyLabel in the panel when the query matches nothing, and is silent without one', async () => {
    const { root, input } = await mountTypeahead({ emptyLabel: 'No materials match' });
    focus(input);
    type(input, 'zinc');
    assert.ok(!listbox(root), 'no listbox to announce');
    const note = root.querySelector('.fabricate-typeahead-list[role="status"]');
    assert.equal(note?.textContent.trim(), 'No materials match');
    assert.equal(input.getAttribute('aria-expanded'), 'false');

    harness.remount();
    const silent = await mountTypeahead();
    focus(silent.input);
    type(silent.input, 'zinc');
    assert.ok(!silent.root.querySelector('.fabricate-typeahead-list'), 'no panel at all');
  });
});

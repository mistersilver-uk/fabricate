/** Issue 1782 — the library's `<LogList>`, a named list of past entries a caller may open. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const LOG_LIST = 'src/ui/svelte/components/LogList.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-log-list-',
  compiledModules: ['src/ui/svelte/components/Medallion.svelte', LOG_LIST],
  componentPath: LOG_LIST,
  rootClass: 'fabricate fabricate-app',
});

const ENTRIES = [
  {
    key: 'a',
    text: 'Iron sword',
    when: 'Today',
    art: 'icons/svg/sword.svg',
    outcome: { icon: 'fa-circle-check', label: 'Succeeded', tone: 'success' },
    props: { 'data-probe-entry': 'a' },
  },
  {
    key: 'b',
    text: 'Healing draught',
    when: '',
    tone: 'danger',
    outcome: { icon: 'fa-circle-xmark', label: 'Failed', tone: 'danger', props: { 'data-o': 'b' } },
    props: { 'data-probe-entry': 'b' },
  },
];

const action = createRawSnippet((entry) => ({
  render: () => `<button type="button" data-probe-action="${entry().key}">x</button>`,
}));

const listIn = (root) => root.querySelector('[role="list"]');
const openOf = (root, key) => root.querySelector(`[data-probe-entry="${key}"]`);

describe('LogList', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('is a list named by its label, one listitem per entry, with the caller class and hook', async () => {
    const root = await harness.mount({
      entries: ENTRIES,
      ariaLabel: 'History',
      class: 'is-caller',
      'data-probe-list': '',
    });
    const list = listIn(root);
    assert.equal(list.getAttribute('aria-label'), 'History', 'the list is named by its label');
    assert.ok(list.classList.contains('is-caller'), 'the caller class is appended');
    assert.ok(list.hasAttribute('data-probe-list'), 'the rest spread lands on the root');
    const items = [...list.children];
    assert.deepEqual(
      items.map((item) => item.getAttribute('role')),
      ['listitem', 'listitem'],
      'every entry is a direct listitem of the list'
    );
    assert.equal(items[0].querySelector('[title="Iron sword"]').textContent, 'Iron sword');
    assert.equal(
      items[0].textContent.includes('Today'),
      true,
      'the caller-formatted time is drawn'
    );
  });

  it('names each outcome mark by its label, so an outcome is never told by colour alone', async () => {
    const root = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    const marks = [...root.querySelectorAll('[role="img"]')];
    assert.deepEqual(
      marks.map((mark) => mark.getAttribute('aria-label')),
      ['Succeeded', 'Failed']
    );
    assert.deepEqual(
      marks.map((mark) => mark.getAttribute('title')),
      ['Succeeded', 'Failed']
    );
    assert.ok(
      marks[0].classList.contains('is-success') && marks[1].classList.contains('is-danger')
    );
    assert.equal(marks[1].getAttribute('data-o'), 'b', 'the outcome props land on the mark');
    assert.ok(
      marks.every((mark) => mark.querySelector('i')?.getAttribute('aria-hidden') === 'true'),
      'the glyph itself is hidden, so the mark is read once by its name'
    );
  });

  it('opens an entry by pointer, Enter and Space, pressed while it is the selected entry', async () => {
    const opened = [];
    const root = await harness.mount({
      entries: ENTRIES,
      ariaLabel: 'History',
      selectedKey: 'b',
      onOpen: (entry) => {
        opened.push(entry.key);
      },
    });
    const first = openOf(root, 'a');
    const second = openOf(root, 'b');
    assert.equal(first.getAttribute('role'), 'button', 'an openable entry is a button');
    assert.equal(first.getAttribute('tabindex'), '0', 'an openable entry is in the tab order');
    assert.equal(first.getAttribute('data-keyboard-focus'), 'true', 'it declares itself focused');
    assert.equal(first.getAttribute('aria-pressed'), 'false');
    assert.equal(second.getAttribute('aria-pressed'), 'true', 'the selected entry is pressed');
    assert.deepEqual(
      [first, second].map((node) => node.getAttribute('data-selected')),
      ['false', 'true'],
      'the selected hook the old row carried is kept'
    );
    first.click();
    const key = (name) =>
      new globalThis.window.KeyboardEvent('keydown', { key: name, bubbles: true });
    second.dispatchEvent(key('Enter'));
    second.dispatchEvent(key(' '));
    first.dispatchEvent(key('Tab'));
    assert.deepEqual(opened, ['a', 'b', 'b'], 'only a click, Enter and Space open an entry');
  });

  it('renders inert entries without an open handler: no button, nothing in the tab order', async () => {
    const root = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    assert.ok(!root.querySelector('[role="button"]'), 'an inert entry announces no control');
    assert.ok(!root.querySelector('[tabindex]'), 'an inert entry takes no focus');
    assert.equal(openOf(root, 'a').getAttribute('aria-pressed'), null);
  });

  it('draws the art only when an entry has some, and marks a danger entry on its row', async () => {
    const root = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    const [first, second] = listIn(root).children;
    assert.ok(first.querySelector('img'), 'an entry with art draws its tile');
    assert.ok(!second.querySelector('img'), 'an entry without art draws no tile');
    assert.ok(second.firstElementChild.classList.contains('is-danger'), 'a danger entry is marked');
    assert.ok(!first.firstElementChild.classList.contains('is-danger'));
  });

  it("renders the caller's per-entry action beside the open control, never inside it", async () => {
    const root = await harness.mount({
      entries: ENTRIES,
      ariaLabel: 'History',
      onOpen: () => {},
      action,
    });
    for (const { key } of ENTRIES) {
      const control = root.querySelector(`[data-probe-action="${key}"]`);
      assert.ok(control, `entry ${key} renders its action`);
      assert.ok(!openOf(root, key).contains(control), 'a button is never nested in a button');
      assert.ok(control.parentElement === openOf(root, key).parentElement, 'it is a sibling');
    }
  });

  it('marks exactly the selected entry, and nothing when no key is selected', async () => {
    const selectedRows = async (props) => {
      const root = await harness.mount({ ariaLabel: 'History', onOpen: () => {}, ...props });
      return [...listIn(root).children].map((item) =>
        item.firstElementChild.classList.contains('is-selected')
      );
    };
    assert.deepEqual(await selectedRows({ entries: ENTRIES, selectedKey: 'b' }), [false, true]);
    harness.remount();
    const keyless = [{ ...ENTRIES[0], key: '' }, ENTRIES[1]];
    assert.deepEqual(await selectedRows({ entries: keyless }), [false, false]);
    const root = harness.target;
    assert.ok(
      [...root.querySelectorAll('[role="button"]')].every(
        (node) => node.getAttribute('aria-pressed') === 'false'
      ),
      'with no selected key an empty-keyed entry is not pressed'
    );
  });

  it('cancels the default of Enter, Space and Spacebar keydowns, and opens on each', async () => {
    const opened = [];
    const root = await harness.mount({
      entries: ENTRIES,
      ariaLabel: 'History',
      onOpen: (entry) => {
        opened.push(entry.key);
      },
    });
    const keydown = (name) =>
      new globalThis.window.KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
        cancelable: true,
      });
    for (const name of ['Enter', ' ', 'Spacebar']) {
      const event = keydown(name);
      openOf(root, 'a').dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, `${JSON.stringify(name)} default is cancelled`);
    }
    const tab = keydown('Tab');
    openOf(root, 'a').dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, false, 'other keys keep their default');
    assert.deepEqual(opened, ['a', 'a', 'a']);
  });

  it('marks an entry row open only when the caller can open it', async () => {
    const withOpen = await harness.mount({
      entries: ENTRIES,
      ariaLabel: 'History',
      onOpen: () => {},
    });
    assert.ok(listIn(withOpen).querySelectorAll('.fab-log-list-entry.is-open').length === 2);
    harness.remount();
    const inert = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    assert.equal(listIn(inert).querySelectorAll('.is-open').length, 0);
  });

  it('draws the time only when an entry has one', async () => {
    const root = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    const [first, second] = listIn(root).children;
    assert.equal(first.querySelector('.fab-log-list-when').textContent, 'Today');
    assert.equal(second.querySelector('.fab-log-list-when'), null, 'an empty time draws no span');
  });

  it('tones an outcome mark by success, danger and warning', async () => {
    const entries = ['success', 'danger', 'warning', 'neutral'].map((tone) => ({
      key: tone,
      text: tone,
      outcome: { icon: 'fa-circle', label: tone, tone },
    }));
    const root = await harness.mount({ entries, ariaLabel: 'History' });
    const tones = [...root.querySelectorAll('[role="img"]')].map((mark) =>
      ['is-success', 'is-danger', 'is-warning'].filter((name) => mark.classList.contains(name))
    );
    assert.deepEqual(tones, [['is-success'], ['is-danger'], ['is-warning'], []]);
  });

  it('keeps each entry node when the list is reordered, keyed by entry key', async () => {
    const root = await harness.mount({ entries: ENTRIES, ariaLabel: 'History' });
    const [itemA, itemB] = [...listIn(root).children];
    await harness.setProps({ entries: [ENTRIES[1], ENTRIES[0]] });
    assert.deepEqual([...listIn(root).children], [itemB, itemA], 'the same nodes, moved');
  });
});

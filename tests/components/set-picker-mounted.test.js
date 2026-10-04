/** `SetPicker`: a bounded, staged set-membership picker over the searchable popover (issue 1782). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-set-picker-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'src/ui/svelte/components/Avatar.svelte',
    'src/ui/svelte/components/SetPicker.svelte',
  ],
  componentPath: 'src/ui/svelte/components/SetPicker.svelte',
});

const TAGS = ['Refined', 'Metal', 'Smithing', 'Raw', 'Smithy', 'Blacksmith'].map((label) => ({
  id: label.toLowerCase(),
  label,
}));

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

async function settle() {
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/** A mounted picker with every `onChange` call recorded. */
async function mountPicker(props = {}) {
  const calls = [];
  const root = await harness.mount({
    options: TAGS,
    ariaLabel: 'Tags',
    onChange: (next, change) => {
      calls.push({ next, change });
    },
    ...props,
  });
  const q = (selector) => root.querySelector(selector);
  const panel = () => q('.fabricate-set-picker-popover');
  return {
    root,
    calls,
    panel,
    trigger: () => q('.fabricate-set-picker .fabricate-picker > button'),
    option: (id) => panel()?.querySelector(`[role="option"][title="${id}"]`),
    clear: () => q('[data-set-picker-clear]'),
    apply: () => q('[data-set-picker-apply]'),
    async open() {
      this.trigger().click();
      await settle();
    },
    async choose(label) {
      this.option(label).click();
      await settle();
    },
    selected: () =>
      [...(panel()?.querySelectorAll('[role="option"][aria-selected="true"]') ?? [])].map((row) =>
        row.getAttribute('title')
      ),
  };
}

async function press(key) {
  document.activeElement.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  await settle();
}

/** A source whose answers the test releases by hand, in any order. */
function manualSource() {
  const pending = new Map();
  const source = (query) =>
    new Promise((resolveAnswer, rejectAnswer) => {
      pending.set(query, { resolveAnswer, rejectAnswer });
    });
  return { source, pending };
}

describe('SetPicker (mounted)', () => {
  describe('the bounded trigger', () => {
    it('draws maxTokens tokens, then a "+N more" button named "and N more" that opens the panel', async () => {
      const picker = await mountPicker({
        value: ['refined', 'metal', 'smithing', 'raw', 'smithy'],
      });
      const tokens = [...picker.root.querySelectorAll('[data-set-picker-token]')];
      assert.deepEqual(
        tokens.map((token) => token.textContent.trim()),
        ['Refined', 'Metal', 'Smithing']
      );
      const more = picker.root.querySelector('[data-set-picker-more]');
      assert.equal(more.textContent.trim(), '+2 more');
      assert.equal(more.getAttribute('aria-label'), 'and 2 more');
      assert.equal(more.getAttribute('data-keyboard-focus'), 'true');

      more.click();
      await settle();
      assert.ok(Boolean(picker.panel()), 'the overflow opens the panel');
    });

    it('takes its own token bound, and draws no overflow while the set fits', async () => {
      const bounded = await mountPicker({ value: ['refined', 'metal'], maxTokens: 1 });
      assert.equal(bounded.root.querySelectorAll('[data-set-picker-token]').length, 1);
      assert.equal(
        bounded.root.querySelector('[data-set-picker-more]').getAttribute('aria-label'),
        'and 1 more'
      );
      harness.remount();
      const fits = await mountPicker({ value: ['refined'] });
      assert.ok(!fits.root.querySelector('[data-set-picker-more]'), 'nothing overflows');
    });

    it('names the token group and the panel by one route', async () => {
      const labelled = await mountPicker({ ariaLabel: '', label: 'Tags', value: ['metal'] });
      const group = labelled.root.querySelector('[role="group"]');
      const kicker = labelled.root.querySelector('.fabricate-set-picker-label');
      assert.equal(kicker.textContent, 'Tags');
      assert.equal(group.getAttribute('aria-labelledby'), kicker.id);
      assert.ok(!group.hasAttribute('aria-label'), 'a labelledby group carries no second name');
      await labelled.open();
      assert.equal(labelled.panel().getAttribute('aria-label'), 'Tags');
      harness.remount();

      const named = await mountPicker({ value: [] });
      assert.equal(named.root.querySelector('[role="group"]').getAttribute('aria-label'), 'Tags');
      assert.ok(!named.root.querySelector('.fabricate-set-picker-label'), 'no visible kicker');
    });
  });

  describe('staged commit', () => {
    it('writes nothing while choices are toggled, and marks the buffer rather than the value', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      assert.equal(
        picker.panel().querySelector('[role="listbox"]').getAttribute('aria-multiselectable'),
        'true'
      );
      await picker.choose('Raw');
      await picker.choose('Metal');
      assert.deepEqual(picker.calls, [], 'a toggle writes nothing');
      assert.deepEqual(picker.selected(), ['Raw'], 'the panel marks the staged set');
      assert.ok(Boolean(picker.panel()), 'and stays open across choices');
    });

    it('applies only the change, once, then closes and returns focus to the trigger', async () => {
      const picker = await mountPicker({ value: ['metal', 'refined'] });
      await picker.open();
      await picker.choose('Raw');
      await picker.choose('Metal');
      picker.apply().click();
      await settle();
      assert.deepEqual(picker.calls, [
        { next: ['refined', 'raw'], change: { added: ['raw'], removed: ['metal'] } },
      ]);
      assert.ok(!picker.panel(), 'Apply closes the panel');
      assert.ok(document.activeElement === picker.trigger(), 'focus returns to the trigger');
    });

    it('refuses an Apply that changes nothing', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      assert.equal(picker.apply().disabled, true, 'nothing staged, nothing to apply');
      await picker.choose('Raw');
      await picker.choose('Raw');
      assert.equal(picker.apply().disabled, true, 'a toggle undone is no change');
      assert.deepEqual(picker.calls, []);
    });

    for (const [how, dismiss] of [
      ['Escape', () => press('Escape')],
      [
        'an outside press',
        async () => {
          document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
          await settle();
        },
      ],
    ]) {
      it(`discards the buffer on ${how} and returns focus to the trigger`, async () => {
        const picker = await mountPicker({ value: ['metal'] });
        await picker.open();
        await picker.choose('Raw');
        await dismiss();
        assert.ok(!picker.panel(), `${how} closes the panel`);
        assert.ok(document.activeElement === picker.trigger(), 'focus returns to the trigger');
        assert.deepEqual(picker.calls, [], 'and writes nothing');
        await picker.open();
        assert.deepEqual(picker.selected(), ['Metal'], 'reopening shows the committed set');
      });
    }

    it('discards the buffer when the trigger closes the panel', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      await picker.choose('Raw');
      await picker.open();
      assert.ok(!picker.panel(), 'the trigger closes it');
      await picker.open();
      assert.deepEqual(picker.selected(), ['Metal']);
      assert.deepEqual(picker.calls, []);
    });

    it('clears the buffer with a Clear that is reachable at zero members and while loading', async () => {
      const empty = await mountPicker({ value: [] });
      await empty.open();
      assert.ok(Boolean(empty.clear()), 'Clear is in the footer at zero members');
      assert.equal(empty.clear().disabled, false);
      assert.equal(empty.clear().getAttribute('data-keyboard-focus'), 'true');
      await empty.choose('Raw');
      empty.clear().click();
      await settle();
      assert.deepEqual(empty.selected(), [], 'Clear empties the buffer');
      assert.deepEqual(empty.calls, [], 'and writes nothing');
      harness.remount();

      const loading = await mountPicker({ value: ['metal', 'raw'], loading: true });
      await loading.open();
      assert.equal(
        loading.panel().querySelector('[data-popover-status]').getAttribute('data-popover-status'),
        'loading'
      );
      assert.equal(loading.clear().disabled, false, 'Clear is reachable while loading');
      loading.clear().click();
      await settle();
      loading.apply().click();
      await settle();
      assert.deepEqual(loading.calls, [
        { next: [], change: { added: [], removed: ['metal', 'raw'] } },
      ]);
    });

    it('counts what is staged in the footer, and matched-of-total beside the search', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      await picker.choose('Raw');
      assert.equal(picker.panel().querySelector('[role="status"]').textContent.trim(), '6 of 6');
      assert.equal(
        picker.panel().querySelector('.fabricate-set-picker-selected').textContent.trim(),
        '2 selected'
      );
    });
  });

  describe('an async source', () => {
    it('lets a slow earlier answer lose to a fast later one', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source });
      await picker.open();
      const field = picker.panel().querySelector('input');
      field.value = 'sm';
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      await settle();
      assert.deepEqual([...pending.keys()], ['', 'sm']);

      pending.get('sm').resolveAnswer({ options: [TAGS[2], TAGS[4]], total: 412 });
      await settle();
      pending.get('').resolveAnswer(TAGS);
      await settle();

      const rows = [...picker.panel().querySelectorAll('[role="option"]')];
      assert.deepEqual(
        rows.map((row) => row.getAttribute('title')),
        ['Smithing', 'Smithy'],
        'the earlier, slower answer did not overwrite the later one'
      );
      assert.equal(
        picker.panel().querySelector('[data-popover-filtered-count]').textContent,
        '2 of 412'
      );
    });

    it('shows a failed answer as an alert and writes nothing from it, staged choices included', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source, value: ['metal'] });
      await picker.open();
      pending.get('').resolveAnswer(TAGS);
      await settle();
      await picker.choose('Raw');
      assert.equal(picker.apply().disabled, false, 'a staged change arms Apply');

      const field = picker.panel().querySelector('input');
      field.value = 'x';
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      await settle();
      pending.get('x').rejectAnswer(new Error('offline'));
      await settle();

      assert.ok(
        Boolean(picker.panel().querySelector('[role="alert"]')),
        'the failure is announced'
      );
      assert.equal(picker.apply().disabled, true, 'Apply is refused in the error state');
      picker.apply().click();
      await settle();
      assert.deepEqual(picker.calls, [], 'and writes nothing');
    });

    it('treats a caller error the same way', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      await picker.choose('Raw');
      await harness.setProps({ error: 'The tags could not load.' });
      await settle();
      assert.equal(
        picker.panel().querySelector('[role="alert"]').textContent.trim(),
        'The tags could not load.'
      );
      assert.equal(picker.apply().disabled, true);
      picker.apply().click();
      await settle();
      assert.deepEqual(picker.calls, []);
    });
  });

  describe('choose commit', () => {
    it('writes each choice once, draws no token run and no footer', async () => {
      const picker = await mountPicker({ commit: 'choose', value: ['metal'] });
      assert.ok(!picker.root.querySelector('[data-set-picker-token]'), 'no token run');
      await picker.open();
      assert.ok(!picker.panel().querySelector('[data-set-picker-footer]'), 'no Apply or Clear');
      await picker.choose('Raw');
      await picker.choose('Metal');
      assert.deepEqual(picker.calls, [
        { next: ['metal', 'raw'], change: { added: ['raw'], removed: [] } },
        { next: [], change: { added: [], removed: ['metal'] } },
      ]);
      assert.ok(Boolean(picker.panel()), 'the panel stays open across choices');
    });
  });
});

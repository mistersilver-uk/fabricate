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
    'src/ui/svelte/components/Kicker.svelte',
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
    more: () => q('[data-set-picker-more]'),
    field: () => panel()?.querySelector('input'),
    option: (id) => panel()?.querySelector(`[role="option"][title="${id}"]`),
    rows: () =>
      [...(panel()?.querySelectorAll('[role="option"]') ?? [])].map((row) =>
        row.getAttribute('title')
      ),
    tokens: () =>
      [...root.querySelectorAll('[data-set-picker-token]')].map((token) =>
        token.textContent.trim()
      ),
    footerStatus: () => panel()?.querySelector('.fabricate-set-picker-selected'),
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
    async type(query) {
      const field = this.field();
      field.value = query;
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
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

/** A browser press: pointerdown, then the mousedown a cancelled pointerdown suppresses, then click. */
async function pointerPress(element) {
  const PointerEventCtor = globalThis.PointerEvent ?? globalThis.MouseEvent;
  const down = new PointerEventCtor('pointerdown', { bubbles: true, cancelable: true });
  element.dispatchEvent(down);
  if (!down.defaultPrevented) {
    element.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
  }
  element.click();
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
    it('draws maxTokens tokens, then a "+N more" row chip named "and N more" that opens the panel', async () => {
      const picker = await mountPicker({
        value: ['refined', 'metal', 'smithing', 'raw', 'smithy'],
      });
      assert.deepEqual(picker.tokens(), ['Refined', 'Metal', 'Smithing']);
      const more = picker.more();
      assert.equal(more.tagName, 'BUTTON');
      assert.equal(more.getAttribute('type'), 'button');
      assert.ok(more.classList.contains('manager-chip'), 'it is the shared Chip');
      assert.ok(more.classList.contains('is-row'), 'at the token run’s own row density');
      assert.equal(more.textContent.trim(), '+2 more');
      assert.equal(more.getAttribute('aria-label'), 'and 2 more');
      assert.equal(more.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(more.getAttribute('aria-haspopup'), 'dialog');
      assert.equal(more.getAttribute('aria-expanded'), 'false');

      more.click();
      await settle();
      assert.ok(Boolean(picker.panel()), 'the overflow opens the panel');
      assert.equal(more.getAttribute('aria-expanded'), 'true');
    });

    it('takes its own token bound, zero included, and draws no overflow while the set fits', async () => {
      const bounded = await mountPicker({ value: ['refined', 'metal'], maxTokens: 1 });
      assert.equal(bounded.tokens().length, 1);
      assert.equal(bounded.more().getAttribute('aria-label'), 'and 1 more');
      harness.remount();

      const none = await mountPicker({ value: ['refined', 'metal'], maxTokens: 0 });
      assert.deepEqual(none.tokens(), [], 'a bound of zero draws no token');
      assert.equal(none.more().getAttribute('aria-label'), 'and 2 more');
      harness.remount();

      const fits = await mountPicker({ value: ['refined'] });
      assert.ok(!fits.more(), 'nothing overflows');
    });

    it('names the token group and the panel by one route, the label through the shared Kicker', async () => {
      const labelled = await mountPicker({ ariaLabel: '', label: 'Tags', value: ['metal'] });
      const group = labelled.root.querySelector('[role="group"]');
      const kicker = labelled.root.querySelector('.fab-kicker');
      assert.equal(kicker.tagName, 'SPAN');
      assert.equal(kicker.textContent, 'Tags');
      assert.equal(group.getAttribute('aria-labelledby'), kicker.parentElement.id);
      assert.ok(!group.hasAttribute('aria-label'), 'a labelledby group carries no second name');
      await labelled.open();
      assert.equal(labelled.panel().getAttribute('aria-label'), 'Tags');
      harness.remount();

      const named = await mountPicker({ value: [] });
      assert.equal(named.root.querySelector('[role="group"]').getAttribute('aria-label'), 'Tags');
      assert.ok(!named.root.querySelector('.fab-kicker'), 'no visible kicker');
    });

    it('names the dashed Add by `addLabel` and stamps `addProps` on that button', async () => {
      const plain = await mountPicker();
      assert.equal(plain.trigger().textContent.trim(), 'Add');
      harness.remount();

      const picker = await mountPicker({ addLabel: 'Edit tags', addProps: { 'data-tag-add': '' } });
      assert.equal(picker.trigger().textContent.trim(), 'Edit tags');
      assert.equal(picker.trigger().getAttribute('data-tag-add'), '');
      assert.equal(picker.trigger().getAttribute('aria-haspopup'), 'dialog');
    });
  });

  describe('the "+N more" opener', () => {
    const overflowing = { value: ['refined', 'metal', 'smithing', 'raw', 'smithy'] };

    it('takes focus back when the panel it opened closes', async () => {
      const picker = await mountPicker(overflowing);
      picker.more().click();
      await settle();
      assert.ok(document.activeElement === picker.field(), 'the query field holds focus');
      await press('Escape');
      assert.ok(!picker.panel());
      assert.ok(document.activeElement === picker.more(), 'focus returns to "+N more"');
    });

    it('leaves focus with the Add when the Add opened the panel', async () => {
      const picker = await mountPicker(overflowing);
      await picker.open();
      await press('Escape');
      assert.ok(document.activeElement === picker.trigger(), 'focus returns to the Add');
    });

    it('is a no-op while the panel is open, so the staged choices survive the press', async () => {
      const picker = await mountPicker(overflowing);
      await picker.open();
      await picker.choose('Blacksmith');
      await pointerPress(picker.more());
      assert.ok(Boolean(picker.panel()), 'the panel stays open');
      assert.ok(picker.selected().includes('Blacksmith'), 'and keeps the staged choice');
      assert.ok(document.activeElement === picker.field(), 'and focus stays in the query field');
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
      assert.deepEqual(picker.tokens(), ['Metal'], 'and the tokens keep the committed set');
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

    it('refuses an Apply after a member is removed and then re-added', async () => {
      const picker = await mountPicker({ value: ['metal', 'refined'] });
      await picker.open();
      await picker.choose('Metal');
      assert.equal(picker.apply().disabled, false, 'the removal arms Apply');
      await picker.choose('Metal');
      assert.equal(picker.apply().disabled, true, 'the re-add is the committed set again');
      picker.apply().click();
      await settle();
      assert.deepEqual(picker.calls, []);
    });

    it('says what it will add and remove while staged, and the set’s size while clean', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      const clean = picker.footerStatus().textContent.trim();
      assert.equal(clean, '1 selected');
      assert.ok(!picker.footerStatus().hasAttribute('data-set-picker-pending'));
      await picker.choose('Raw');
      await picker.choose('Metal');
      const staged = picker.footerStatus().textContent.trim();
      assert.equal(staged, '1 to add · 1 to remove');
      assert.notEqual(staged, clean, 'one add and one remove keep the size and change the line');
      assert.ok(picker.footerStatus().hasAttribute('data-set-picker-pending'));
    });

    it('keeps a member that changed under the open panel when it applies', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      await picker.choose('Raw');
      await harness.setProps({ value: ['metal', 'smithy'] });
      assert.deepEqual(picker.selected(), ['Metal', 'Raw', 'Smithy'], 'the change is laid over');
      picker.apply().click();
      await settle();
      assert.deepEqual(picker.calls, [
        { next: ['metal', 'smithy', 'raw'], change: { added: ['raw'], removed: [] } },
      ]);
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

    it('clears the buffer with a Clear all that is reachable at zero members and while loading', async () => {
      const empty = await mountPicker({ value: [] });
      await empty.open();
      assert.ok(Boolean(empty.clear()), 'Clear is in the footer at zero members');
      assert.equal(empty.clear().textContent.trim(), 'Clear all');
      assert.equal(empty.clear().disabled, false);
      assert.equal(empty.clear().getAttribute('data-keyboard-focus'), 'true');
      await empty.choose('Raw');
      empty.clear().click();
      await settle();
      assert.deepEqual(empty.selected(), [], 'Clear empties the buffer');
      assert.deepEqual(empty.calls, [], 'and writes nothing');
      harness.remount();

      const loading = await mountPicker({ value: ['metal', 'raw'], options: [], loading: true });
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

    it('counts matched-of-total beside the search', async () => {
      const picker = await mountPicker({ value: ['metal'] });
      await picker.open();
      await picker.choose('Raw');
      assert.equal(picker.panel().querySelector('[role="status"]').textContent.trim(), '6 of 6');
    });
  });

  describe('a status in place of the list', () => {
    it('hides an errored list from the keyboard, so nothing hidden is chosen or pointed at', async () => {
      const picker = await mountPicker({ commit: 'choose', value: [], error: 'The tags failed.' });
      await picker.open();
      assert.ok(Boolean(picker.panel().querySelector('[role="alert"]')), 'the error shows');
      assert.deepEqual(picker.rows(), [], 'and no row renders');
      assert.ok(!picker.field().hasAttribute('aria-controls'), 'the field controls no list');
      await press('ArrowDown');
      assert.ok(!picker.field().hasAttribute('aria-activedescendant'), 'and points at no row');
      await press('Enter');
      assert.deepEqual(picker.calls, [], 'Enter chooses nothing it is not showing');
    });

    it('keeps the listed rows under aria-busy while the caller is loading more', async () => {
      const picker = await mountPicker({ loading: true });
      await picker.open();
      assert.equal(picker.rows().length, 6, 'rows on screen stay on screen');
      assert.equal(
        picker.panel().querySelector('[role="listbox"]').getAttribute('aria-busy'),
        'true'
      );
      assert.ok(!picker.panel().querySelector('[data-popover-status]'), 'and no loading line');
    });
  });

  describe('an async source', () => {
    it('asks nothing until the panel opens, then shows the loading line until it answers', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source });
      assert.equal(pending.size, 0, 'a closed panel asks its source nothing');
      await picker.open();
      assert.deepEqual([...pending.keys()], ['']);
      const loading = picker.panel().querySelector('[data-popover-status="loading"]');
      assert.ok(Boolean(loading), 'the first wait shows the loading line');
      assert.equal(
        picker.panel().querySelector('[data-popover-live]').textContent,
        'Loading…',
        'and the panel’s standing live region says so'
      );
      assert.equal(
        picker.panel().querySelector('[data-popover-filtered-count]').textContent,
        '',
        'with no matched-of-total to state yet'
      );
    });

    it('keeps the last answer’s rows and total, busy, while a refinement is out', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source });
      await picker.open();
      pending.get('').resolveAnswer({ options: TAGS, total: 412 });
      await settle();
      await picker.type('sm');

      assert.equal(picker.rows().length, 6, 'the rows do not flash away');
      const list = picker.panel().querySelector('[role="listbox"]');
      assert.equal(list.getAttribute('aria-busy'), 'true');
      assert.ok(!picker.panel().querySelector('[data-popover-status]'), 'no loading line');
      assert.equal(picker.panel().querySelector('[data-popover-live]').textContent, '');
      assert.equal(
        picker.panel().querySelector('[data-popover-filtered-count]').textContent,
        '6 of 412'
      );

      pending.get('sm').resolveAnswer([TAGS[2], TAGS[4]]);
      await settle();
      assert.deepEqual(picker.rows(), ['Smithing', 'Smithy']);
      assert.ok(!picker.panel().querySelector('[role="listbox"]').hasAttribute('aria-busy'));
    });

    it('lets a slow earlier answer lose to a fast later one', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source });
      await picker.open();
      await picker.type('sm');
      assert.deepEqual([...pending.keys()], ['', 'sm']);

      pending.get('sm').resolveAnswer({ options: [TAGS[2], TAGS[4]], total: 412 });
      await settle();
      pending.get('').resolveAnswer(TAGS);
      await settle();

      assert.deepEqual(
        picker.rows(),
        ['Smithing', 'Smithy'],
        'the earlier, slower answer did not overwrite the later one'
      );
      assert.equal(
        picker.panel().querySelector('[data-popover-filtered-count]').textContent,
        '2 of 412'
      );
    });

    it('lists an empty answer as empty, never falling back to the static options', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: TAGS, source });
      await picker.open();
      pending.get('').resolveAnswer([]);
      await settle();
      assert.deepEqual(picker.rows(), []);
    });

    it('starts each session afresh: nothing a closed panel heard, or listed, comes back', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source });
      await picker.open();
      pending.get('').resolveAnswer(TAGS);
      await settle();
      await picker.open();
      await picker.open();
      assert.ok(
        Boolean(picker.panel().querySelector('[data-popover-status="loading"]')),
        'a reopened panel waits for its own answer rather than listing the last session’s'
      );
      assert.deepEqual(picker.rows(), []);

      const late = pending.get('');
      await picker.open();
      late.resolveAnswer(TAGS);
      await settle();
      await picker.open();
      assert.deepEqual(picker.rows(), [], 'an answer that lands while closed is dropped');
    });

    it('shows a failed answer as an alert and writes nothing from it, staged choices included', async () => {
      const { source, pending } = manualSource();
      const picker = await mountPicker({ options: [], source, value: ['metal'] });
      await picker.open();
      pending.get('').resolveAnswer(TAGS);
      await settle();
      await picker.choose('Raw');
      assert.equal(picker.apply().disabled, false, 'a staged change arms Apply');

      await picker.type('x');
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

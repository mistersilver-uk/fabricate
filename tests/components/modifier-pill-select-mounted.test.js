/**
 * `ModifierPillSelect` MOUNTED (issue 1055) — the announcement and focus contracts.
 *
 * Both are invisible to every suite that renders this control as part of a bigger tree:
 * `aria-live` and focus leave no mark on the markup those suites assert on, so the two
 * fixes below are deletable green everywhere else.
 *
 * 1. `aria-live="polite"` used to sit on `[data-modifier-pill-row]`. `aria-relevant`
 *    defaults to `additions text`, so removing a keyed `{#each}` child was excluded
 *    outright — a removal announced NOTHING — while an addition announced the whole new
 *    pill subtree, remove-button label included ("Medicine, Remove Medicine"). The region
 *    is now a visually-hidden text node of its own, `[data-modifier-pill-status]`, whose
 *    content is a sentence naming the current selection.
 * 2. Removing a pill destroys the button that had focus, dropping it to `<body>` and
 *    stranding a keyboard user at the top of the document. Focus moves to a surviving
 *    neighbour BEFORE `onToggle` is emitted, which is why no `tick()` is involved.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PILL_SELECT_PATH = 'src/ui/svelte/components/ModifierPillSelect.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-modifier-pill-select-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
  ],
  compiledModules: [PILL_SELECT_PATH],
  componentPath: PILL_SELECT_PATH,
});

const OPTIONS = Object.freeze([
  Object.freeze({ id: 'med', label: 'Medicine' }),
  Object.freeze({ id: 'alch', label: 'Alchemy' }),
  Object.freeze({ id: 'herb', label: 'Herbalism' }),
]);

const NONE_LABEL = 'No modifiers — @craftingmod resolves to 0 for this recipe.';

before(async () => {
  await harness.setup();
  // The shared harness stubs `i18n.format` as `key:{json}`, which reads as a real
  // translation, so this component's `format()` helper would prefer it over its English
  // fallback and the summary would never be a sentence. Returning the key selects the
  // fallback branch — the one an unlocalized build takes, and the one worth pinning.
  globalThis.game.i18n.format = (key) => key;
});
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Name the focused node without ever handing a mounted element to `node:assert`. */
function focusDescriptor(element) {
  if (!element) return 'none';
  if (element.hasAttribute?.('data-modifier-pill-remove')) {
    return `remove:${element.getAttribute('data-modifier-pill-remove')}`;
  }
  if (element.hasAttribute?.('data-modifier-pill-menu-button')) return 'menu';
  return element.tagName?.toLowerCase?.() ?? 'unknown';
}

/**
 * Mount the control with the given selection, recording every emitted toggle together
 * with where focus was AT THE MOMENT the callback ran — which is what proves the move
 * happens before the emission rather than after some later render.
 */
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

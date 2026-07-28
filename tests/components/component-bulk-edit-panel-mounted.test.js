/**
 * The component browser's BULK EDIT panel (issue 772).
 *
 * The panel is where a destructive multi-component write becomes legible BEFORE it
 * happens, so what is tested here is the staging semantics, not the pixels: the tri-state
 * tag cycle, the Apply enablement rule (including the removal-only draft that an earlier
 * design would have left inert), the conditional overwrite warning, the staged-axis chip
 * that arms and disarms an axis without touching the selection, and the two section
 * visibility gates across a system progressive on EACH axis in turn plus the none case.
 *
 * The panel does NOT own the draft — the manager root does, because the panel is unmounted
 * the moment the selection empties. So these tests drive it the way the root does: hand it
 * a draft, take the NEW draft back through `onDraftChange`, and re-render with it.
 *
 * That round-trip is the point. Every helper in `componentBulkEditModel.js` is IMMUTABLE,
 * so a panel that called `cycleBulkTag(draft, tag)` without reassigning would compile, run,
 * and silently do nothing — the control would simply look dead. Asserting on the rendered
 * chip state after the round-trip is what catches that.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createComponentBulkDraft } from '../../src/utils/componentBulkEditModel.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const panel = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-bulk-panel-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/componentCategories.js',
    // The pure selection + staging model. Omitting it throws loudly in this shared
    // harness — the hand-rolled suites are the ones that hang instead.
    'src/utils/componentBulkEditModel.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
    'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte'
});

const ESSENCES = [
  { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
  { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' }
];

/**
 * Mount the panel the way the manager root drives it: the caller owns the draft, and every
 * `onDraftChange` REPLACES it and re-renders. Returns the live draft accessor so a test can
 * assert on what was actually staged as well as on what is rendered.
 */
async function mountPanel(props = {}) {
  const state = { draft: props.draft || createComponentBulkDraft(), applies: 0, clears: 0 };
  const root = await panel.mount({
    count: 3,
    categoryOptions: [{ name: 'Metal', count: 2 }, { name: 'general', count: 1 }],
    tags: ['metal', 'rune'],
    essenceDefinitions: ESSENCES,
    showEssences: true,
    selectedCards: [],
    ...props,
    draft: state.draft,
    onDraftChange: async (next) => {
      state.draft = next;
      await panel.setProps({ draft: next });
    },
    onApply: () => { state.applies += 1; },
    onClearSelection: () => { state.clears += 1; }
  });
  return { root, state };
}

function tagChip(root, tag) {
  return root.querySelector(`[data-bulk-tag="${tag}"]`);
}

function tagState(root, tag) {
  return tagChip(root, tag).getAttribute('data-bulk-tag-state');
}

function applyButton(root) {
  return root.querySelector('[data-component-bulk-apply]');
}

before(async () => {
  await panel.setup();
});
after(() => {
  panel.teardown();
});
afterEach(() => {
  panel.remount();
});

describe('ComponentBulkEditPanel tag staging (issue 772)', () => {
  it('cycles a chip leave -> add -> remove -> leave and is never both', async () => {
    const { root, state } = await mountPanel();

    assert.equal(tagState(root, 'metal'), 'none', 'a fresh draft stages nothing');

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'add');
    assert.deepEqual(state.draft.tagAdd, ['metal']);
    assert.deepEqual(state.draft.tagRemove, []);

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'remove');
    assert.deepEqual(state.draft.tagAdd, [], 'a tag is never simultaneously add and remove');
    assert.deepEqual(state.draft.tagRemove, ['metal']);

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'none');
    assert.deepEqual(state.draft.tagRemove, []);

    assert.equal(tagState(root, 'rune'), 'none', 'the other tags are untouched throughout');
  });

  it('renders each chip as a real focusable button', async () => {
    const { root } = await mountPanel();
    const chip = tagChip(root, 'metal');

    assert.equal(chip.tagName, 'BUTTON', 'a span could not be reached by keyboard');
    assert.equal(chip.getAttribute('type'), 'button', 'and an untyped button would submit');
    assert.match(
      chip.getAttribute('aria-label'),
      /Leave metal unchanged/,
      'the accessible name states the staged ACTION — aria-pressed cannot describe three states'
    );
  });

  it('says the system defines no tags rather than rendering an empty run', async () => {
    const { root } = await mountPanel({ tags: [] });
    assert.ok(Boolean(root.querySelector('[data-component-bulk-tags-empty]')));
  });
});

describe('ComponentBulkEditPanel apply enablement (issue 772)', () => {
  it('is inert with nothing staged and live the moment any axis is staged', async () => {
    const { root, state } = await mountPanel();

    assert.equal(applyButton(root).disabled, true, 'a no-op Apply would report success and write nothing');
    assert.match(applyButton(root).textContent, /3/, 'and it names the exact blast radius');

    root.querySelector('[data-component-bulk-category]').value = 'Metal';
    root.querySelector('[data-component-bulk-category]').dispatchEvent(
      new globalThis.Event('change', { bubbles: true })
    );
    flushSync();

    assert.equal(applyButton(root).disabled, false);
    assert.equal(state.draft.category, 'Metal');

    applyButton(root).click();
    flushSync();
    assert.equal(state.applies, 1);
  });

  it('is live for a REMOVAL-ONLY draft', async () => {
    const { root } = await mountPanel();

    // Straight to `remove`: two clicks, never resting on `add`.
    tagChip(root, 'metal').click();
    flushSync();
    tagChip(root, 'metal').click();
    flushSync();

    assert.equal(tagState(root, 'metal'), 'remove');
    assert.equal(
      applyButton(root).disabled,
      false,
      'a removal-only edit is a real edit the chip run can stage on its own'
    );
  });

  it('names one component in the singular', async () => {
    const { root } = await mountPanel({ count: 1 });
    assert.match(applyButton(root).textContent, /Apply to 1 component/);
    assert.match(
      root.querySelector('[data-component-bulk-count]').textContent,
      /1 component selected/,
      'never "1 components selected"'
    );
  });

  it('clears the selection without applying anything', async () => {
    const { root, state } = await mountPanel();
    root.querySelector('[data-component-bulk-clear]').click();
    flushSync();
    assert.equal(state.clears, 1);
    assert.equal(state.applies, 0);
  });
});

describe('ComponentBulkEditPanel staged-axis indicators (issue 772)', () => {
  it('arms the essence axis DIRECTLY, because Stepper emits nothing at the zero boundary', async () => {
    const { root, state } = await mountPanel();
    const chip = root.querySelector('[data-component-bulk-essences-staged]');

    assert.equal(chip.tagName, 'BUTTON', 'the only route to a destructive axis must be operable');
    assert.equal(chip.getAttribute('type'), 'button');
    assert.equal(chip.getAttribute('data-component-bulk-essences-staged'), 'false');
    assert.equal(applyButton(root).disabled, true);

    chip.click();
    flushSync();

    assert.equal(state.draft.essencesStaged, true, 'a fresh, all-zero draft can stage "clear everything"');
    assert.equal(
      root.querySelector('[data-component-bulk-essences-staged]').getAttribute('data-component-bulk-essences-staged'),
      'true'
    );
    assert.equal(applyButton(root).disabled, false, 'an all-zero staged map is a REAL edit');
  });

  it('leaves a bumped-then-zeroed essence axis staged, and visibly so', async () => {
    const { root, state } = await mountPanel();

    const fireStepper = root.querySelector('[data-component-edit-essence="fire"]');
    fireStepper.querySelector('[data-stepper-increment]').click();
    flushSync();
    assert.equal(state.draft.essences.fire, 1);
    assert.equal(state.draft.essencesStaged, true);

    root
      .querySelector('[data-component-edit-essence="fire"] [data-stepper-decrement]')
      .click();
    flushSync();

    assert.equal(state.draft.essences.fire, 0, 'back to zero');
    assert.equal(
      state.draft.essencesStaged,
      true,
      'and STILL staged — this is the wipe the prototype rendered as pixel-identical to untouched'
    );
    assert.equal(
      root.querySelector('[data-component-bulk-essences-staged]').getAttribute('data-component-bulk-essences-staged'),
      'true',
      'the panel says so'
    );
  });

  it('disarms an axis from the same chip without touching the selection', async () => {
    const { root, state } = await mountPanel();

    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();
    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();

    assert.equal(state.draft.essencesStaged, false, 'the axis is back to leave-unchanged');
    assert.equal(state.clears, 0, 'and the selection was never cleared');
    assert.equal(applyButton(root).disabled, true);
  });

  it('seeds a zero DC when the progressive axis is armed, so it is never a silent clear', async () => {
    const { root, state } = await mountPanel({ showProgressiveDifficulty: true });

    root.querySelector('[data-component-bulk-difficulty-staged]').click();
    flushSync();

    assert.equal(state.draft.difficultyStaged, true);
    assert.equal(state.draft.difficulty, 0, '0 CLEARS the value on every selected component');
    assert.equal(root.querySelector('[data-component-bulk-difficulty]').value, '0', 'and the panel shows it');

    root.querySelector('[data-component-bulk-difficulty]').value = '14';
    root.querySelector('[data-component-bulk-difficulty]').dispatchEvent(
      new globalThis.Event('input', { bubbles: true })
    );
    flushSync();
    assert.equal(state.draft.difficulty, 14);
  });
});

describe('ComponentBulkEditPanel overwrite legibility (issue 772)', () => {
  const authored = [
    { id: 'a', essences: [{ id: 'fire', quantity: 3 }] },
    { id: 'b', essences: [] }
  ];

  it('states the permanent overwrite hint whether or not the axis is staged', async () => {
    const { root } = await mountPanel();
    assert.match(root.textContent, /overwrites the essence values on every selected component/);
  });

  it('warns only when the staged map would in fact change an AUTHORED value', async () => {
    const { root, state } = await mountPanel({ selectedCards: authored });

    // Staged but matching the authored value: nothing is destroyed, so no hazard strip.
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-input]').value = '3';
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-input]').dispatchEvent(
      new globalThis.Event('input', { bubbles: true })
    );
    flushSync();
    assert.equal(state.draft.essences.fire, 3);
    assert.ok(
      !root.querySelector('[data-component-bulk-essence-warning]'),
      'a no-change overwrite is not a hazard'
    );

    // An INCREASE destroys the authored 3 as surely as a clear would.
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-increment]').click();
    flushSync();

    const warning = root.querySelector('[data-component-bulk-essence-warning]');
    assert.ok(Boolean(warning), 'overwriting a hand-tuned value is exactly what the warning is for');
    assert.match(warning.textContent, /1 of the selected components/, 'and it names the count');
  });

  it('shows no warning while the axis is unstaged, however different the values', async () => {
    const { root } = await mountPanel({ selectedCards: authored });

    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-increment]').click();
    flushSync();
    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();

    assert.ok(
      !root.querySelector('[data-component-bulk-essence-warning]'),
      'an unstaged axis is never sent, so it can destroy nothing'
    );
  });
});

describe('ComponentBulkEditPanel section visibility (issue 772)', () => {
  it('hides the essences section when the system does not enable essences', async () => {
    const { root } = await mountPanel({ showEssences: false });
    assert.ok(!root.querySelector('[data-component-bulk-essences]'));
    assert.ok(!root.querySelector('[data-component-bulk-essences-staged]'));
  });

  // The caller supplies ONE predicate that is already the OR of crafting, salvage and
  // gathering resolution modes, so the panel's contract is simply that it obeys it — which
  // is what makes a salvage-only-progressive system show the section at all.
  for (const shown of [true, false]) {
    it(`${shown ? 'shows' : 'hides'} the progressive DC section when the axis predicate is ${shown}`, async () => {
      const { root } = await mountPanel({ showProgressiveDifficulty: shown });
      assert.equal(
        Boolean(root.querySelector('[data-component-bulk-difficulty]')),
        shown,
        'the bulk panel, the editor control and the row badge read ONE predicate'
      );
    });
  }
});

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  TYPEAHEAD_RUNE_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-limits-',
  // Both typeaheads float their list through the shared seam: its controller, and the popover
  // closure its panel action reaches, which carries the Foundry bridge list with it.
  runeModules: TYPEAHEAD_RUNE_MODULES,
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    // The Limits tab's "Character prerequisites to learn" picker imports the pure
    // prerequisite engine (issue 544).
    'src/systems/characterPrerequisites.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the harness
    // omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
    // the harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    // Both fields are the shared typeahead, whose field is the search (issue 1782).
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/Typeahead.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
});

function itemDraft(overrides = {}) {
  return {
    id: 'ri1',
    caps: {
      item: { limitUses: false, maxUses: 3, whenSpent: 'destroyed', ...overrides },
      learn: {},
    },
  };
}
function learnDraft(overrides = {}) {
  return {
    id: 'ri1',
    caps: {
      item: {},
      learn: { limitLearning: false, learnScope: 'perInstance', learnsAllowed: 1, ...overrides },
    },
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemLimitsTab (mounted)', () => {
  it('renders only the item Uses card in item mode', async () => {
    const root = await harness.mount({ recipeItem: itemDraft(), visibilityMode: 'item' });
    assert.ok(root.querySelector('[data-recipe-item-limits-card="item"]'));
    assert.equal(root.querySelector('[data-recipe-item-limits-card="knowledge"]'), null);
  });

  it('renders only the knowledge Learning card in knowledge mode', async () => {
    const root = await harness.mount({ recipeItem: learnDraft(), visibilityMode: 'knowledge' });
    assert.ok(root.querySelector('[data-recipe-item-limits-card="knowledge"]'));
    assert.equal(root.querySelector('[data-recipe-item-limits-card="item"]'), null);
  });

  // Set a typeahead's term (bubbling input event) then click the matching suggestion.
  function pickFromTypeahead(root, searchSelector, term, optionSelector) {
    const input = root.querySelector(searchSelector);
    input.value = term;
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    const option = root.querySelector(optionSelector);
    assert.ok(option, `suggestion ${optionSelector} appears for term "${term}"`);
    option.click();
  }

  it('adds a learning prerequisite via the typeahead, then appends a second (issue 544)', async () => {
    const patches = [];
    const props = {
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      characterPrerequisites: [
        { id: 'p1', name: 'Expert Crafter', path: 'skills.cra.rank', op: 'gte', value: 2 },
        { id: 'p2', name: 'Journeyman', path: 'abilities.int.mod', op: 'gte', value: 2 },
      ],
      onPatch: (p) => patches.push(p),
    };
    let root = await harness.mount(props);
    const search = root.querySelector('[data-recipe-item-character-prereq-search]');
    assert.ok(search && !search.disabled, 'the search renders and is enabled');
    pickFromTypeahead(
      root,
      '[data-recipe-item-character-prereq-search]',
      'expert',
      '[data-recipe-item-character-prereq-option="p1"]'
    );
    assert.deepEqual(patches.at(-1), { caps: { learn: { characterPrerequisiteIds: ['p1'] } } });

    // Re-mount with p1 already selected: it shows as a chip.
    harness.remount();
    root = await harness.mount({
      ...props,
      recipeItem: learnDraft({ limitLearning: true, characterPrerequisiteIds: ['p1'] }),
    });
    assert.ok(
      root.querySelector('[data-recipe-item-character-prereq="p1"]'),
      'the selected prereq shows as a chip'
    );
    pickFromTypeahead(
      root,
      '[data-recipe-item-character-prereq-search]',
      'journ',
      '[data-recipe-item-character-prereq-option="p2"]'
    );
    assert.deepEqual(patches.at(-1), {
      caps: { learn: { characterPrerequisiteIds: ['p1', 'p2'] } },
    });
    // An already-selected prerequisite is not offered again.
    const search2 = root.querySelector('[data-recipe-item-character-prereq-search]');
    search2.value = 'expert';
    search2.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(
      root.querySelector('[data-recipe-item-character-prereq-option="p1"]'),
      null,
      'an already-selected prereq is not offered again'
    );
  });

  it('removes a selected learning prerequisite via its pill ×', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, characterPrerequisiteIds: ['p1'] }),
      visibilityMode: 'knowledge',
      characterPrerequisites: [{ id: 'p1', name: 'Expert', path: 'x', op: 'gte', value: 1 }],
      onPatch: (p) => patches.push(p),
    });
    const remove = root.querySelector('[data-recipe-item-character-prereq-remove="p1"]');
    assert.ok(remove, 'the pill renders a remove control');
    remove.click();
    assert.deepEqual(patches, [{ caps: { learn: { characterPrerequisiteIds: [] } } }]);
  });

  it('shows an inline empty note (not a search input) for learning prerequisites when the library is empty', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      characterPrerequisites: [],
    });
    assert.equal(
      root.querySelector('[data-recipe-item-character-prereq-search]'),
      null,
      'no search input when the library is empty'
    );
    const empty = root.querySelector('[data-recipe-item-character-prereq-empty]');
    assert.ok(empty && empty.textContent.trim().length > 0, 'a real muted empty note is rendered');
    assert.equal(
      root.querySelector('[data-recipe-item-character-prereq-chips]'),
      null,
      'no chips when nothing selected'
    );
  });

  it('adds and removes Required Knowledge via the typeahead + pill (issue 544)', async () => {
    const patches = [];
    const props = {
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      linkedRecipes: [
        { id: 'r1', name: 'Alloy Bronze' },
        { id: 'r2', name: 'Forge Steel' },
      ],
      onPatch: (p) => patches.push(p),
    };
    let root = await harness.mount(props);
    const search = root.querySelector('[data-recipe-item-required-knowledge-search]');
    assert.ok(search && !search.disabled, 'the Required Knowledge search is enabled with options');
    pickFromTypeahead(
      root,
      '[data-recipe-item-required-knowledge-search]',
      'alloy',
      '[data-recipe-item-required-knowledge-option="r1"]'
    );
    assert.deepEqual(patches.at(-1), { caps: { learn: { prerequisiteIds: ['r1'] } } });

    // Re-mount with r1 selected: it shows as a pill and its × removes it.
    harness.remount();
    root = await harness.mount({
      ...props,
      recipeItem: learnDraft({ limitLearning: true, prerequisiteIds: ['r1'] }),
    });
    assert.ok(
      root.querySelector('[data-recipe-item-required-knowledge="r1"]'),
      'the selected recipe shows as a pill'
    );
    root.querySelector('[data-recipe-item-required-knowledge-remove="r1"]').click();
    assert.deepEqual(patches.at(-1), { caps: { learn: { prerequisiteIds: [] } } });
  });

  it('folds a legacy single prerequisite into the Required Knowledge pills', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, prerequisite: 'r2' }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r2', name: 'Forge Steel' }],
    });
    assert.ok(
      root.querySelector('[data-recipe-item-required-knowledge="r2"]'),
      'the legacy single prerequisite renders as a pill'
    );
  });

  it('renders a leading icon on selected chips in both columns; character-prereq chips use the prereq’s own icon', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({
        limitLearning: true,
        prerequisiteIds: ['r1'],
        characterPrerequisiteIds: ['p1'],
      }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      characterPrerequisites: [
        { id: 'p1', name: 'Wizardly', icon: 'fas fa-hat-wizard', path: 'x', op: 'gte', value: 1 },
      ],
    });
    // Required Knowledge chip carries the generic scroll icon (matching its suggestion).
    const rkChip = root.querySelector('[data-recipe-item-required-knowledge="r1"]');
    assert.ok(
      rkChip.querySelector('i.fa-scroll'),
      'the Required Knowledge chip has a leading scroll icon'
    );
    // Character-prereq chip carries the prerequisite's OWN icon, not the generic one.
    const cpChip = root.querySelector('[data-recipe-item-character-prereq="p1"]');
    assert.ok(
      cpChip.querySelector('i.fa-hat-wizard'),
      'the character-prereq chip uses the prereq’s own icon'
    );
    assert.equal(
      cpChip.querySelector('i.fa-user-check'),
      null,
      'no generic fallback icon when the prereq has its own'
    );
  });

  it('renders the prereq’s own icon on the character-prerequisite suggestion', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      characterPrerequisites: [
        { id: 'p1', name: 'Wizardly', icon: 'fas fa-hat-wizard', path: 'x', op: 'gte', value: 1 },
      ],
    });
    const search = root.querySelector('[data-recipe-item-character-prereq-search]');
    search.value = 'wiz';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    const option = root.querySelector('[data-recipe-item-character-prereq-option="p1"]');
    assert.ok(option.querySelector('i.fa-hat-wizard'), 'the suggestion uses the prereq’s own icon');
  });

  it('shows an inline empty note (not a search input) for Required Knowledge when there are no recipe options', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      linkedRecipes: [],
      availableRecipes: [],
    });
    assert.equal(
      root.querySelector('[data-recipe-item-required-knowledge-search]'),
      null,
      'no search input with no options'
    );
    const empty = root.querySelector('[data-recipe-item-required-knowledge-empty]');
    assert.ok(empty && empty.textContent.trim().length > 0, 'a real muted empty note is rendered');
  });

  it('exposes combobox semantics on the typeahead inputs', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      characterPrerequisites: [{ id: 'p1', name: 'Expert', path: 'x', op: 'gte', value: 1 }],
    });
    for (const [selector, term] of [
      ['[data-recipe-item-required-knowledge-search]', 'alloy'],
      ['[data-recipe-item-character-prereq-search]', 'expert'],
    ]) {
      const field = root.querySelector(selector);
      assert.equal(field.getAttribute('role'), 'combobox');
      assert.equal(field.getAttribute('aria-expanded'), 'false', 'collapsed with no term typed');
      assert.equal(
        field.hasAttribute('aria-controls'),
        false,
        'nothing is controlled while no listbox is rendered'
      );

      field.value = term;
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      flushSync();
      assert.equal(field.getAttribute('aria-expanded'), 'true');
      const list = root.querySelector(`[id="${field.getAttribute('aria-controls')}"]`);
      assert.equal(list.getAttribute('role'), 'listbox');
      assert.ok(
        list.parentElement === root,
        'the list floats in the application root rather than inside its clipped column'
      );
      const option = list.querySelector('[role="option"]');
      assert.equal(option.getAttribute('tabindex'), '-1', 'no suggestion is a tab stop');

      field.dispatchEvent(
        new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      flushSync();
      assert.equal(field.value, '', 'Escape clears the query');
      assert.ok(!root.querySelector('[role="listbox"]'), 'which closes the list');
    }
  });

  it('commits the active option on Enter, and nothing while none is active', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      linkedRecipes: [
        { id: 'r1', name: 'Alloy Bronze' },
        { id: 'r2', name: 'Alloy Steel' },
      ],
      onPatch: (patch) => {
        patches.push(patch);
      },
    });
    const field = root.querySelector('[data-recipe-item-required-knowledge-search]');
    const press = (key) => {
      const event = new globalThis.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      flushSync();
      return event;
    };
    field.value = 'alloy';
    field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();

    const idle = press('Enter');
    assert.equal(idle.defaultPrevented, true, 'Enter is consumed while the list is open');
    assert.equal(patches.length, 0, 'and commits nothing with no option active');

    press('ArrowDown');
    press('ArrowDown');
    const active = root.querySelector(`[id="${field.getAttribute('aria-activedescendant')}"]`);
    assert.equal(active.getAttribute('data-recipe-item-required-knowledge-option'), 'r2');
    assert.equal(active.getAttribute('aria-selected'), 'true');
    press('Enter');
    assert.deepEqual(patches.at(-1), { caps: { learn: { prerequisiteIds: ['r2'] } } });
  });

  it('hides BOTH Required Knowledge and Learning prerequisites when Limited learning is off', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: false }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      characterPrerequisites: [{ id: 'p1', name: 'Expert', path: 'x', op: 'gte', value: 1 }],
    });
    assert.equal(
      root.querySelector('[data-recipe-item-required-knowledge-search]'),
      null,
      'Required Knowledge is hidden when the toggle is off'
    );
    assert.equal(
      root.querySelector('[data-recipe-item-character-prereq-search]'),
      null,
      'Learning prerequisites are hidden when the toggle is off'
    );
  });

  it('shows Required Knowledge and Learning prerequisites together in one detail block when on', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      characterPrerequisites: [{ id: 'p1', name: 'Expert', path: 'x', op: 'gte', value: 1 }],
    });
    assert.ok(
      root.querySelector('[data-recipe-item-required-knowledge-search]'),
      'Required Knowledge control present'
    );
    assert.ok(
      root.querySelector('[data-recipe-item-character-prereq-search]'),
      'Learning prerequisites control present'
    );
    // Limit applies + Recipes allowed share the detail block too.
    assert.ok(root.querySelector('[data-recipe-item-learn-scope]'), 'Limit applies present');
    assert.ok(root.querySelector('[data-recipe-item-learns-stepper]'), 'Recipes allowed present');
  });

  it('emits a limitUses patch and hides detail while off', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: itemDraft({ limitUses: false }),
      visibilityMode: 'item',
      onPatch: (p) => patches.push(p),
    });
    assert.equal(
      root.querySelector('[data-recipe-item-uses-stepper]'),
      null,
      'uses detail hidden while limited-use is off'
    );
    root.querySelector('[data-recipe-item-limit-uses]').click();
    assert.deepEqual(patches, [{ caps: { item: { limitUses: true } } }]);
  });

  it('seeds learnsAllowed: 1 in the SAME patch when Limited learning is toggled on with no count (issue 544)', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: false, learnsAllowed: undefined }),
      visibilityMode: 'knowledge',
      onPatch: (p) => patches.push(p),
    });
    root.querySelector('[data-recipe-item-limit-learning]').click();
    assert.deepEqual(patches, [{ caps: { learn: { limitLearning: true, learnsAllowed: 1 } } }]);
  });

  it('does not re-seed learnsAllowed when toggling on with an existing count', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: false, learnsAllowed: 3 }),
      visibilityMode: 'knowledge',
      onPatch: (p) => patches.push(p),
    });
    root.querySelector('[data-recipe-item-limit-learning]').click();
    assert.deepEqual(patches, [{ caps: { learn: { limitLearning: true } } }]);
  });

  it('steps uses per copy (min 1) via nested caps patch', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: itemDraft({ limitUses: true, maxUses: 1 }),
      visibilityMode: 'item',
      onPatch: (p) => patches.push(p),
    });
    assert.equal(root.querySelector('[data-recipe-item-uses-value]').textContent.trim(), '1');
    // Decrement is clamped at 1 -> no patch.
    root.querySelector('[data-recipe-item-uses-dec]').click();
    assert.equal(patches.length, 0);
    root.querySelector('[data-recipe-item-uses-inc]').click();
    assert.deepEqual(patches, [{ caps: { item: { maxUses: 2 } } }]);
  });

  it('emits a whenSpent patch from the segmented control', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: itemDraft({ limitUses: true }),
      visibilityMode: 'item',
      onPatch: (p) => patches.push(p),
    });
    const inertRadio = root.querySelector(
      '[data-recipe-item-when-spent-option="inert"] input[type="radio"]'
    );
    inertRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(patches, [{ caps: { item: { whenSpent: 'inert' } } }]);
  });

  it('emits a learnScope patch from the segmented control', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance' }),
      visibilityMode: 'knowledge',
      onPatch: (p) => patches.push(p),
    });
    const total = root.querySelector(
      '[data-recipe-item-learn-scope-option="total"] input[type="radio"]'
    );
    total.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(patches, [{ caps: { learn: { learnScope: 'total' } } }]);
  });

  it('keeps the learns stepper active in both scopes (no forced pin)', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 5 }),
      visibilityMode: 'knowledge',
    });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '5');
    assert.equal(root.querySelector('[data-recipe-item-learns-inc]').disabled, false);
    assert.equal(root.querySelector('[data-recipe-item-learns-dec]').disabled, false);
  });

  it('steps recipes allowed', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 2 }),
      visibilityMode: 'knowledge',
      onPatch: (p) => patches.push(p),
    });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '2');
    root.querySelector('[data-recipe-item-learns-inc]').click();
    assert.deepEqual(patches, [{ caps: { learn: { learnsAllowed: 3 } } }]);
  });

  it('renders a live learning explanation that reflects the scope', async () => {
    const total = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'total', learnsAllowed: 4 }),
      visibilityMode: 'knowledge',
    });
    const totalText = total.querySelector('[data-recipe-item-learn-explain]').textContent;
    assert.match(totalText, /total/i);
    assert.match(totalText, /4/);
    harness.remount();
    const perCopy = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 2 }),
      visibilityMode: 'knowledge',
    });
    assert.match(perCopy.querySelector('[data-recipe-item-learn-explain]').textContent, /copy/i);
  });
});

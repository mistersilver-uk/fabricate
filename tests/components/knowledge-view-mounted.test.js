/**
 * Mounted behaviour of the GM Knowledge surface (issue 785).
 *
 * The armed two-step confirmation is per-INSTANCE component state rather than a
 * control shape, so its full disarm rule set is pinned here rather than in a
 * source-contract test. The five uses/inert chip combinations are pinned here too:
 * the pure derivations live in tests/knowledge-studio.test.js, but only a render
 * proves the fifth state (inert-but-not-spent) shows BOTH chips.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  KNOWLEDGE_TAB_LEARNED_RECIPES,
  KNOWLEDGE_TAB_RECIPE_ITEMS,
  projectKnowledgeSnapshot,
} from '../../src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-knowledge-view-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/recipeCategories.js',
    'src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js',
  ],
  // `Medallion.svelte` is NOT in the shared CRAFTING_APP_COMPILED_MODULES list, and
  // a `.svelte` the tree renders but the allowlist omits HANGS this file (reported
  // as `# cancelled`) rather than failing it. Both lists are inlined here, following
  // the tool-studio-mounted precedent.
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeTabs.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeRoster.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRow.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeRecipeItemsTab.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRecipesTab.svelte',
    'src/ui/svelte/apps/manager/KnowledgeView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/KnowledgeView.svelte',
});

// ---------------------------------------------------------------------------
// Fixtures. RAW seam-shaped records run through the real projection, so a change
// to a derivation cannot leave these rows describing a state the surface can
// never actually receive.
// ---------------------------------------------------------------------------

function rawCopy(overrides = {}) {
  return {
    itemId: 'i1',
    itemUuid: 'Actor.a1.Item.i1',
    name: 'Alchemist Cook Book',
    img: 'icons/sundries/books/book-worn-brown.webp',
    quantity: 1,
    definitionId: 'ri1',
    definitionName: 'Alchemist Cook Book',
    matchTier: 'identity',
    recipeCount: 2,
    limitUses: true,
    maxUses: 5,
    timesUsed: 1,
    inert: false,
    learnScope: 'perInstance',
    ...overrides,
  };
}

function rawLearned(overrides = {}) {
  return {
    recipeId: 'r1',
    recipeName: 'Healing Draught',
    recipeImg: 'icons/consumables/potions/bottle-round-corked-red.webp',
    recipeCategory: 'potions',
    craftingSystemId: 'alchemy',
    learnedAt: 1700000000,
    sourceItemUuid: 'Actor.a1.Item.i1',
    sourceOwned: true,
    sourceCapped: true,
    sourceItemName: 'Alchemist Cook Book',
    ...overrides,
  };
}

function rawCharacter(overrides = {}) {
  return {
    id: 'a1',
    name: 'Aria Thorn',
    img: 'icons/svg/mystery-man.svg',
    ownedCopies: [rawCopy()],
    learnedRecipes: [rawLearned()],
    otherSystemCount: 0,
    orphanCount: 0,
    ...overrides,
  };
}

function makeKnowledge({ characters, definitionCount = 2, ...options } = {}) {
  return projectKnowledgeSnapshot(
    { systemId: 'alchemy', definitionCount, characters: characters ?? [rawCharacter()] },
    {
      active: true,
      defaultTab: KNOWLEDGE_TAB_RECIPE_ITEMS,
      selectedActorId: 'a1',
      ...options,
    }
  );
}

function makeProps(overrides = {}) {
  return {
    knowledge: makeKnowledge(),
    selectedSystemName: 'Alchemy',
    onSelectActor: () => {},
    onExpend: () => {},
    onDelete: () => {},
    onErase: () => {},
    onResetSystem: () => {},
    onResetAll: () => {},
    ...overrides,
  };
}

function fire(element, type, init = {}) {
  element.dispatchEvent(new Event(type, { bubbles: false, ...init }));
}

function pressEscape(element) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function armedState(target, token) {
  return target.querySelector(`[data-arm-token="${token}"]`)?.getAttribute('data-armed');
}

describe('KnowledgeView mounted behaviour', () => {
  before(async () => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('renders the roster with per-character meta and a dimmed untracked row', async () => {
    const selected = [];
    const target = await harness.mount(
      makeProps({
        characters: undefined,
        onSelectActor: (id) => selected.push(id),
        knowledge: makeKnowledge({
          characters: [
            rawCharacter(),
            rawCharacter({ id: 'a2', name: 'Bran Coldwater', ownedCopies: [], learnedRecipes: [] }),
          ],
        }),
      })
    );

    const rows = target.querySelectorAll('[data-knowledge-actor]');
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /1 item\(s\) · 1 learned/);
    assert.equal(rows[0].getAttribute('aria-pressed'), 'true');
    assert.equal(rows[1].classList.contains('is-untracked'), true);
    assert.match(rows[1].textContent, /Nothing tracked/);
    assert.ok(rows[1].querySelector('[data-knowledge-untracked]'));

    rows[1].click();
    assert.deepEqual(selected, ['a2']);
  });

  it('filters the roster through the shared pure filter and reports no matches', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [rawCharacter(), rawCharacter({ id: 'a2', name: 'Bran Coldwater' })],
        }),
      })
    );

    const search = target.querySelector('[data-knowledge-search]');
    search.value = 'bran';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.setProps({});
    assert.equal(target.querySelectorAll('[data-knowledge-actor]').length, 1);

    search.value = 'nobody';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.setProps({});
    assert.equal(target.querySelectorAll('[data-knowledge-actor]').length, 0);
    assert.match(target.textContent, /No characters match this search/);
  });

  it('opens on the tab the store resolved once on surface entry', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({ definitionCount: 0, defaultTab: KNOWLEDGE_TAB_LEARNED_RECIPES }),
      })
    );

    assert.equal(
      target.querySelector('[data-knowledge-panel]').dataset.knowledgePanel,
      KNOWLEDGE_TAB_LEARNED_RECIPES
    );
    assert.ok(target.querySelector('[data-knowledge-learned-banner]'));
  });

  // The five chip COMBINATIONS. `inert` is an independent chip, so an
  // inert-but-not-spent copy keeps its remaining-tone uses chip AND gains an Inert
  // chip — the state no unit test can draw and the visible form of the known gap.
  const CHIP_CASES = [
    {
      name: 'uncapped',
      copy: { itemId: 'c-unlimited', limitUses: false },
      chip: 'unlimited',
      label: /Unlimited/,
      inert: false,
      expendDisabled: true,
    },
    {
      name: 'remaining',
      copy: { itemId: 'c-remaining', timesUsed: 2 },
      chip: 'remaining',
      label: /2 of 5 uses spent/,
      inert: false,
      expendDisabled: false,
    },
    {
      name: 'spent',
      copy: { itemId: 'c-spent', timesUsed: 5 },
      chip: 'spent',
      label: /Spent/,
      inert: false,
      expendDisabled: true,
    },
    {
      name: 'spent and inert',
      copy: { itemId: 'c-spent-inert', timesUsed: 5, inert: true },
      chip: 'spent',
      label: /Spent/,
      inert: true,
      expendDisabled: true,
    },
    {
      name: 'inert but not spent',
      copy: { itemId: 'c-inert', timesUsed: 1, inert: true },
      chip: 'remaining',
      label: /1 of 5 uses spent/,
      inert: true,
      expendDisabled: false,
    },
  ];

  for (const testCase of CHIP_CASES) {
    it(`renders the ${testCase.name} copy state`, async () => {
      const target = await harness.mount(
        makeProps({
          knowledge: makeKnowledge({
            characters: [rawCharacter({ ownedCopies: [rawCopy(testCase.copy)] })],
          }),
        })
      );

      const row = target.querySelector(`[data-knowledge-copy="${testCase.copy.itemId}"]`);
      const usesChip = row.querySelector('[data-knowledge-uses-chip]');
      assert.equal(usesChip.dataset.knowledgeUsesChip, testCase.chip);
      assert.match(usesChip.textContent, testCase.label);
      assert.equal(Boolean(row.querySelector('[data-knowledge-inert]')), testCase.inert);
      assert.equal(row.querySelector('[data-knowledge-expend]').disabled, testCase.expendDisabled);
      assert.equal(row.classList.contains('is-spent'), testCase.chip === 'spent');
    });
  }

  it('expends a capped copy and leaves the definition-facing metadata alone', async () => {
    const expended = [];
    const target = await harness.mount(makeProps({ onExpend: (...args) => expended.push(args) }));

    target.querySelector('[data-knowledge-expend="i1"]').click();
    assert.deepEqual(expended, [['a1', 'i1']]);
    assert.match(target.querySelector('[data-knowledge-copy="i1"]').textContent, /2 recipes inside/);
    assert.equal(
      target.querySelector('[data-knowledge-copy="i1"] [data-knowledge-type]').dataset
        .knowledgeType,
      'Book'
    );
  });

  it('raises the party-pool ordering warning only when the hazard is real', async () => {
    const safe = await harness.mount(makeProps());
    assert.equal(safe.querySelector('[data-knowledge-party-pool-warning]'), null);
    harness.remount();

    const hazardous = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [rawCharacter({ ownedCopies: [rawCopy({ learnScope: 'total' })] })],
        }),
      })
    );
    assert.ok(hazardous.querySelector('[data-knowledge-party-pool-warning]'));
  });

  it('renders both tab empty states without coupling the two lists', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [rawCharacter({ ownedCopies: [], learnedRecipes: [rawLearned()] })],
        }),
      })
    );

    assert.ok(target.querySelector('[data-knowledge-items-empty]'));
    target.querySelector('[data-knowledge-tab="learnedRecipes"]').click();
    await harness.setProps({});
    assert.equal(target.querySelectorAll('[data-knowledge-learned]').length, 1);
  });

  it('states the learned source without promising slot recovery it cannot deliver', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          defaultTab: KNOWLEDGE_TAB_LEARNED_RECIPES,
          characters: [
            rawCharacter({
              learnedRecipes: [
                rawLearned(),
                rawLearned({
                  recipeId: 'r2',
                  recipeName: 'Elixir of Focus',
                  sourceOwned: false,
                  sourceItemName: '',
                  sourceDefinitionName: 'Scroll of Elixirs',
                }),
                rawLearned({
                  recipeId: 'r3',
                  recipeName: 'Field Poultice',
                  sourceItemUuid: null,
                }),
              ],
            }),
          ],
        }),
      })
    );

    const owned = target.querySelector('[data-knowledge-learned="r1"]');
    const lost = target.querySelector('[data-knowledge-learned="r2"]');
    const auto = target.querySelector('[data-knowledge-learned="r3"]');
    assert.match(owned.textContent, /Learned from Alchemist Cook Book/);
    assert.equal(owned.querySelector('[data-knowledge-frees-no-slot]'), null);
    assert.match(lost.textContent, /Learned from Scroll of Elixirs \(copy no longer owned\)/);
    assert.ok(lost.querySelector('[data-knowledge-frees-no-slot]'));
    assert.match(auto.textContent, /Learned by crafting/);
    assert.ok(auto.querySelector('[data-knowledge-frees-no-slot]'));
  });

  it('shows a per-character fact cluster and hides the zero-valued roll-ups', async () => {
    const quiet = await harness.mount(makeProps());
    assert.equal(quiet.querySelector('[data-knowledge-fact="other-systems"]'), null);
    assert.equal(quiet.querySelector('[data-knowledge-fact="orphans"]'), null);
    harness.remount();

    const noisy = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [rawCharacter({ otherSystemCount: 3, orphanCount: 2 })],
        }),
      })
    );
    assert.match(noisy.querySelector('[data-knowledge-fact="other-systems"]').textContent, /3/);
    assert.match(noisy.querySelector('[data-knowledge-fact="orphans"]').textContent, /2/);
  });

  it('routes both reset grains to their own handler', async () => {
    const calls = [];
    const target = await harness.mount(
      makeProps({
        onResetSystem: (id) => calls.push(['system', id]),
        onResetAll: (id) => calls.push(['all', id]),
      })
    );

    target.querySelector('[data-knowledge-reset="system"]').click();
    target.querySelector('[data-knowledge-reset="all"]').click();
    assert.deepEqual(calls, [
      ['system', 'a1'],
      ['all', 'a1'],
    ]);
  });

  it('arms a destructive row action before executing it, keyed on the document id', async () => {
    const deleted = [];
    const target = await harness.mount(makeProps({ onDelete: (...args) => deleted.push(args) }));

    const deleteButton = target.querySelector('[data-arm-token="delete:i1"]');
    assert.equal(deleteButton.getAttribute('data-armed'), 'false');
    assert.match(deleteButton.getAttribute('aria-label'), /Delete Alchemist Cook Book/);

    deleteButton.click();
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'true');
    assert.equal(deleted.length, 0, 'arming must not execute');
    // The armed affordance swaps the ICON as well as the label, so it survives
    // greyscale and does not rest on the danger fill.
    assert.ok(target.querySelector('[data-arm-token="delete:i1"] .fa-triangle-exclamation'));
    assert.match(
      target.querySelector('[data-arm-token="delete:i1"]').getAttribute('aria-label'),
      /cannot be undone/
    );

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    assert.deepEqual(deleted, [['a1', 'i1']]);
    assert.equal(armedState(target, 'delete:i1'), 'false');
  });

  it('holds exactly one armed token across rows and tabs', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [
            rawCharacter({
              ownedCopies: [rawCopy(), rawCopy({ itemId: 'i2', name: 'Scroll of Elixirs' })],
            }),
          ],
        }),
      })
    );

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    target.querySelector('[data-arm-token="delete:i2"]').click();
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'false');
    assert.equal(armedState(target, 'delete:i2'), 'true');

    target.querySelector('[data-knowledge-tab="learnedRecipes"]').click();
    await harness.setProps({});
    target.querySelector('[data-knowledge-tab="recipeItems"]').click();
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i2'), 'false');
  });

  it('disarms on Escape, on blur, and on a roster search change', async () => {
    const target = await harness.mount(makeProps());

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    pressEscape(target.querySelector('[data-arm-token="delete:i1"]'));
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'false');

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    fire(target.querySelector('[data-arm-token="delete:i1"]'), 'blur');
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'false');

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    const search = target.querySelector('[data-knowledge-search]');
    search.value = 'ar';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'false');
  });

  it('disarms when the selected character changes', async () => {
    const twoCharacters = {
      characters: [rawCharacter(), rawCharacter({ id: 'a2', name: 'Bran Coldwater' })],
    };
    const target = await harness.mount(
      makeProps({ knowledge: makeKnowledge(twoCharacters) })
    );

    target.querySelector('[data-arm-token="delete:i1"]').click();
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i1'), 'true');

    await harness.setProps({
      knowledge: makeKnowledge({ ...twoCharacters, selectedActorId: 'a2' }),
    });
    assert.equal(armedState(target, 'delete:i1'), 'false');
  });

  it('drops an armed token whose row disappears from a re-projection', async () => {
    const twoCopies = [rawCopy(), rawCopy({ itemId: 'i2', name: 'Scroll of Elixirs' })];
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({ characters: [rawCharacter({ ownedCopies: twoCopies })] }),
      })
    );

    target.querySelector('[data-arm-token="delete:i2"]').click();
    await harness.setProps({});
    assert.equal(armedState(target, 'delete:i2'), 'true');

    // Another client deletes i2 and the projection re-publishes without it.
    await harness.setProps({
      knowledge: makeKnowledge({ characters: [rawCharacter({ ownedCopies: [rawCopy()] })] }),
    });
    assert.equal(target.querySelector('[data-arm-token="delete:i2"]'), null);

    // It comes back (an undo, an import) — and must NOT still be armed.
    await harness.setProps({
      knowledge: makeKnowledge({ characters: [rawCharacter({ ownedCopies: twoCopies })] }),
    });
    assert.equal(armedState(target, 'delete:i2'), 'false');
  });

  it('arms and executes the learned-recipe erase on its own token namespace', async () => {
    const erased = [];
    const target = await harness.mount(
      makeProps({
        onErase: (...args) => erased.push(args),
        knowledge: makeKnowledge({ defaultTab: KNOWLEDGE_TAB_LEARNED_RECIPES }),
      })
    );

    target.querySelector('[data-arm-token="erase:r1"]').click();
    await harness.setProps({});
    assert.equal(armedState(target, 'erase:r1'), 'true');
    assert.equal(erased.length, 0);

    target.querySelector('[data-arm-token="erase:r1"]').click();
    await harness.setProps({});
    assert.deepEqual(erased, [['a1', 'r1']]);
  });

  it('offers a no-selection empty state when the roster is empty', async () => {
    const target = await harness.mount(
      makeProps({ knowledge: makeKnowledge({ characters: [] }) })
    );

    assert.ok(target.querySelector('[data-knowledge-no-selection]'));
    assert.match(target.textContent, /No player characters/);
  });
});

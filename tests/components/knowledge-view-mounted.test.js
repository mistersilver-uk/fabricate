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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  KNOWLEDGE_TAB_LEARNED_RECIPES,
  KNOWLEDGE_TAB_RECIPE_ITEMS,
  learnedRecipeSource,
  projectKnowledgeSnapshot,
  projectLearnedRecipeRow,
} from '../../src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-knowledge-view-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/utils/recipeCategories.js',
    'src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js',
    // knowledgeStudio resolves a learned recipe's image through the shared chokepoint
    // (issue 887). It is an import-free leaf, so this one entry suffices — but omitting
    // it HANGS this suite (`# cancelled`) rather than failing it.
    'src/ui/svelte/util/craftingImageDefaults.js',
    // The companion contract (issue 1289): `knowledgeStudio` reads its `grantedBy`
    // length bound and `KnowledgeLearnedRow` its two granted message keys. Import-free,
    // so this one entry covers both edges.
    'src/systems/companionContract.js',
  ],
  // `Medallion.svelte` is NOT in the shared CRAFTING_APP_COMPILED_MODULES list, and
  // a `.svelte` the tree renders but the allowlist omits HANGS this file (reported
  // as `# cancelled`) rather than failing it. Both lists are inlined here, following
  // the tool-studio-mounted precedent.
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    // The shared standing-statement strip both tab bodies render (issue 785).
    'src/ui/svelte/apps/manager/Callout.svelte',
    // The shared chip (issue 883). The tab bar's count badge and both row types render it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeTabs.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeRoster.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRow.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeRecipeItemsTab.svelte',
    'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRecipesTab.svelte',
    // THE manager's labelled push-button (issue 1118). Both resets and the owned-copy row`s Expend use render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
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

    const expend = target.querySelector('[data-knowledge-expend="i1"]');
    expend.focus();
    expend.click();
    assert.deepEqual(expended, [['a1', 'i1']]);
    // Expend is NOT destructive: the row survives, so focus MUST stay on the button a
    // keyboard GM is walking a multi-use copy with. Moving it here would force a
    // re-tab after every single charge.
    assert.equal(target.ownerDocument.activeElement, expend, 'Expend keeps its own focus');
    // The type pill carries the count for a multi-recipe item, so the row no longer
    // renders a separate "N recipe(s) inside" chip stating the same number twice.
    assert.match(
      target.querySelector('[data-knowledge-copy="i1"] [data-knowledge-type]').textContent,
      /2 Recipe Book/
    );
    assert.doesNotMatch(
      target.querySelector('[data-knowledge-copy="i1"]').textContent,
      /recipe\(s\) inside/
    );
    assert.equal(
      target.querySelector('[data-knowledge-copy="i1"] [data-knowledge-type]').dataset
        .knowledgeType,
      'Book'
    );
  });

  it('shows the match-tier chip only for the actionable duplicate tier', async () => {
    const durable = await harness.mount(makeProps());
    const durableRow = durable.querySelector('[data-knowledge-copy="i1"]');
    assert.equal(
      durableRow.querySelector('[data-knowledge-match-tier]'),
      null,
      'a durable match is diagnostic, not actionable, so it earns no chip'
    );
    // The tier is still disclosed — in the row's title, where it costs no width in the
    // pane the geometry guard measures at its narrowest.
    assert.match(durableRow.getAttribute('title'), /Durable match/);
    harness.remount();

    const ambiguous = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          characters: [rawCharacter({ ownedCopies: [rawCopy({ matchTier: 'duplicate' })] })],
        }),
      })
    );
    const chip = ambiguous.querySelector('[data-knowledge-match-tier="duplicate"]');
    assert.ok(chip, 'the low-confidence tier the auto-learn gate refuses earns a chip');
    assert.match(chip.getAttribute('title'), /auto-learn refuses/i);
    assert.equal(chip.getAttribute('aria-label'), chip.getAttribute('title'));
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
                // The copy IS still owned here — only the learn cap is missing. This is
                // why the clause stays cause-specific: "no owned copy to refund" would
                // be a false statement about this row.
                rawLearned({
                  recipeId: 'r4',
                  recipeName: 'Tincture of Ash',
                  sourceCapped: false,
                  sourceItemName: 'Uncapped Compendium',
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
    const uncapped = target.querySelector('[data-knowledge-learned="r4"]');

    // A refundable row carries the source line alone — no clause, no second sub-label.
    assert.match(owned.textContent, /Learned from Alchemist Cook Book/);
    assert.equal(owned.querySelector('[data-knowledge-no-refund]'), null);

    // The other three state the reason as ONE icon-led clause inside the source line.
    // The old markup rendered a separate "Frees no slot" label whose cause the source
    // line had already given, so the row said the same thing twice.
    const clause = (row) => row.querySelector('[data-knowledge-no-refund]');

    assert.match(lost.textContent, /Learned from Scroll of Elixirs/);
    assert.equal(clause(lost).dataset.knowledgeNoRefund, 'notOwned');
    assert.match(clause(lost).textContent, /no owned copy to refund/);
    assert.ok(clause(lost).querySelector('i.fas'), 'the clause leads with an icon');
    // The parenthetical is retired: the clause is now the single statement of the cause.
    assert.doesNotMatch(lost.textContent, /copy no longer owned/);

    assert.match(auto.textContent, /Learned by crafting/);
    assert.equal(clause(auto).dataset.knowledgeNoRefund, 'noSource');
    assert.match(clause(auto).textContent, /no source copy to refund/);

    // Owned copy, no learn cap: the clause must NOT claim the copy is missing.
    assert.match(uncapped.textContent, /Learned from Uncapped Compendium/);
    assert.equal(clause(uncapped).dataset.knowledgeNoRefund, 'uncapped');
    assert.match(clause(uncapped).textContent, /no learn limit to refund/);
    assert.doesNotMatch(uncapped.textContent, /no owned copy/);

    // Every clause sits INSIDE the source line, never as a second sub-label.
    for (const row of [lost, auto, uncapped]) {
      assert.ok(
        row.querySelector('[data-knowledge-source] [data-knowledge-no-refund]'),
        'the clause must be nested in the source line'
      );
    }

    // Nothing anywhere still renders the retired sub-label.
    assert.equal(target.querySelector('[data-knowledge-frees-no-slot]'), null);
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
    // `describedBy` is OPTIONAL (issue 1129 added it for the bulk panels' impact list), and a
    // row call site passes none. It must therefore render NO `aria-describedby` at all: the
    // bare `aria-describedby=""` that a raw pass-through emits points at nothing, and a
    // screen reader resolving an empty idref list is a worse name than no description. This
    // is the assertion that makes `describedBy || undefined` in `ArmedDangerButton` a
    // contract rather than a comment.
    assert.equal(
      deleteButton.hasAttribute('aria-describedby'),
      false,
      'a call site that passes no description renders exactly the markup it did before the prop existed'
    );

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
    // A destructive action DOES unmount the row that held focus, so focus is moved to
    // the owning tab panel rather than falling through to `<body>`.
    assert.equal(
      target.ownerDocument.activeElement,
      target.querySelector('[data-knowledge-panel]'),
      'focus lands on the owning tab panel after a destructive row action'
    );
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
    const target = await harness.mount(makeProps({ knowledge: makeKnowledge(twoCharacters) }));

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

  // ---------------------------------------------------------------------------
  // The GM-grant rungs (issue 1289, criterion 16).
  //
  // All six rows sit on ONE character and are read from ONE mount, because the thing
  // under test is a three-way DISCRIMINANT: a per-case mount would prove each arm
  // fires when it is the only entry, which is exactly the assumption a shared default
  // arm satisfies too. `sourceLineParts` has one arm per kind, and with the granted
  // kinds falling to the `LearnedFrom` default instead, the labelled row would read
  // "Learned from Greenwarden Circle" — naming a book that does not exist — and the
  // label-less row "Learned from " with nothing after it.
  //
  // Text is asserted against the ENGLISH FALLBACKS: the harness's `localize` answers
  // the key for an unmapped key, so `text()` falls back exactly as a world with no
  // translation for these keys does.
  // ---------------------------------------------------------------------------
  const GRANTED_LABEL = 'Greenwarden Circle';
  const LONG_LABEL = 'A'.repeat(200);
  // Each of these is a `String.prototype.replace` REPLACEMENT pattern. A row built by
  // `replace` renders `` $` `` as the text before the match, `$&` as the placeholder
  // itself and `$'` as the empty text after it — untrusted foreign text rewriting the
  // GM's audit line rather than appearing in it, while passing a `typeof` test, a
  // length clamp and Svelte's escaping. Foundry's `Localization#format` does the same.
  const DOLLAR_LABEL = "$` $& $' $1 $$";

  function grantedCharacter() {
    return rawCharacter({
      ownedCopies: [],
      learnedRecipes: [
        rawLearned({
          recipeId: 'g-labelled',
          recipeName: 'Brew Sunwake',
          sourceItemUuid: null,
          granted: true,
          grantedBy: GRANTED_LABEL,
        }),
        rawLearned({
          recipeId: 'g-unlabelled',
          recipeName: 'Steep Dusk',
          sourceItemUuid: null,
          granted: true,
        }),
        rawLearned({ recipeId: 'g-auto', recipeName: 'Grind Chalk', sourceItemUuid: null }),
        // BOTH fields alongside a real book uuid. The book provenance wins: the entry
        // has a source copy, and the grant fields are display-irrelevant there. This is
        // also the complement of the dead-code guard below — the grant rungs are only
        // consulted inside the `!uuid` branch.
        rawLearned({
          recipeId: 'g-both',
          recipeName: 'Distil Ember',
          granted: true,
          grantedBy: GRANTED_LABEL,
        }),
        rawLearned({
          recipeId: 'g-nonstring',
          recipeName: 'Render Tallow',
          sourceItemUuid: null,
          granted: true,
          grantedBy: { module: 'some-companion' },
        }),
        rawLearned({
          recipeId: 'g-long',
          recipeName: 'Press Verbena',
          sourceItemUuid: null,
          granted: true,
          grantedBy: LONG_LABEL,
        }),
        rawLearned({
          recipeId: 'g-dollar',
          recipeName: 'Boil Rimewort',
          sourceItemUuid: null,
          granted: true,
          grantedBy: DOLLAR_LABEL,
        }),
      ],
    });
  }

  it('discriminates granted, label-less granted and auto-learn rows in one list', async () => {
    const target = await harness.mount(
      makeProps({
        knowledge: makeKnowledge({
          definitionCount: 0,
          defaultTab: KNOWLEDGE_TAB_LEARNED_RECIPES,
          characters: [grantedCharacter()],
        }),
      })
    );

    const row = (id) => target.querySelector(`[data-knowledge-learned="${id}"]`);
    const kind = (id) => row(id).querySelector('[data-knowledge-source]').dataset.knowledgeSource;
    const line = (id) => row(id).querySelector('[data-knowledge-source] > span').textContent;
    const label = (id) => row(id).querySelector('[data-knowledge-source-name]').textContent;
    const icon = (id) => row(id).querySelector('[data-knowledge-source] > i').className;

    // The three kinds are DISTINCT, which is what makes the label-less rung — the
    // common one — addressable by a selector at all.
    assert.equal(kind('g-labelled'), 'granted');
    assert.equal(kind('g-unlabelled'), 'grantedUnlabelled');
    assert.equal(kind('g-auto'), 'autoLearn');
    assert.equal(kind('g-both'), 'ownedCopy');

    assert.equal(line('g-labelled'), `Learned by grant: ${GRANTED_LABEL}`);
    assert.equal(label('g-labelled'), GRANTED_LABEL);

    // No dangling "Learned by grant: " and no "Learned from " with nothing after it.
    assert.equal(line('g-unlabelled'), 'Learned by grant');
    assert.equal(label('g-unlabelled'), '');
    assert.doesNotMatch(line('g-unlabelled'), /Learned from/);

    assert.equal(line('g-auto'), 'Learned by crafting');
    // The book rung, unchanged — a `grantedBy` beside a uuid is ignored for display.
    assert.equal(line('g-both'), 'Learned from Alchemist Cook Book');
    assert.doesNotMatch(line('g-both'), /grant/i);

    // A non-string label is not a label. `String({})` would put "[object Object]" in
    // the GM's audit line, and the entry-boundary reader lets an ARRAY through too.
    assert.equal(kind('g-nonstring'), 'grantedUnlabelled');
    assert.equal(line('g-nonstring'), 'Learned by grant');
    assert.doesNotMatch(target.textContent, /\[object Object\]/);

    // Clamped INCLUSIVE of the ellipsis, so the rendered label never exceeds the
    // 64 the write path refuses past.
    assert.equal(kind('g-long'), 'granted');
    assert.equal(label('g-long'), `${'A'.repeat(63)}…`);
    assert.equal([...label('g-long')].length, 64);
    assert.equal(line('g-long'), `Learned by grant: ${'A'.repeat(63)}…`);

    // The `$` patterns appear VERBATIM. Rendered through `replace`, this row would
    // read "Learned by grant: Learned by grant:  {grantedBy}  …" instead.
    assert.equal(label('g-dollar'), DOLLAR_LABEL);
    assert.equal(line('g-dollar'), `Learned by grant: ${DOLLAR_LABEL}`);

    // A non-book line does not get a book glyph. "grant" against "crafting" is
    // otherwise the whole difference between the two, at 0.62rem muted text.
    for (const id of ['g-labelled', 'g-unlabelled', 'g-long', 'g-dollar', 'g-nonstring']) {
      assert.equal(icon(id), 'fas fa-hand-holding', `${id}: granted rows carry the non-book glyph`);
    }
    assert.equal(icon('g-auto'), 'fas fa-book-sparkles');
    assert.equal(icon('g-both'), 'fas fa-book-sparkles');

    // Every granted entry has `sourceItemUuid: null`, so erasing it frees no budget
    // for the SAME reason auto-learn does. Asserted rather than discovered.
    for (const id of ['g-labelled', 'g-unlabelled', 'g-long', 'g-dollar', 'g-nonstring']) {
      const clause = row(id).querySelector('[data-knowledge-source] [data-knowledge-no-refund]');
      assert.equal(clause.dataset.knowledgeNoRefund, 'noSource', `${id}: no-refund reason`);
      assert.match(clause.textContent, /no source copy to refund/, `${id}: no-refund clause`);
    }

    // The label reaches NO attribute — not a link target, not a tooltip. Rendered
    // markup, not source text: an attribute added by a child component would be
    // invisible to a source scan of this one file.
    const granted = row('g-labelled');
    assert.ok(!granted.querySelector('[href]'), 'no learned row renders a link');
    for (const titled of granted.querySelectorAll('[title]')) {
      assert.doesNotMatch(
        titled.getAttribute('title'),
        /Greenwarden/,
        'no title carries the label'
      );
    }
  });

  it('offers a no-selection empty state when the roster is empty', async () => {
    const target = await harness.mount(makeProps({ knowledge: makeKnowledge({ characters: [] }) }));

    assert.ok(target.querySelector('[data-knowledge-no-selection]'));
    assert.match(target.textContent, /No player characters/);
  });
});

// ---------------------------------------------------------------------------
// The grant rungs at the LADDER, not the render (issue 1289, criterion 16).
//
// These live beside the mounted cases rather than in the pure suite because they are
// the same requirement seen from the other end: the mount proves the discriminant is
// rendered, and this proves the discriminant is REACHABLE. The rungs sit inside
// `learnedRecipeSource`'s `!uuid` branch, which returns first, so a rung written after
// the uuid rungs would be dead code that a table exercising only those three still
// passes green.
// ---------------------------------------------------------------------------
const GRANT_LADDER_CASES = [
  // (label, raw) -> (kind, name)
  ['no uuid and no grant is still auto-learn', {}, 'autoLearn', ''],
  ['a bare grant is the label-less rung', { granted: true }, 'grantedUnlabelled', ''],
  [
    'a labelled grant names its source',
    { granted: true, grantedBy: 'Circle' },
    'granted',
    'Circle',
  ],
  ['a label is trimmed', { granted: true, grantedBy: '  Circle  ' }, 'granted', 'Circle'],
  ['whitespace is not a label', { granted: true, grantedBy: '   ' }, 'grantedUnlabelled', ''],
  // `granted` is tested STRICTLY. The flag is public, so each of these is a value
  // another module can write, and none of them records a GM grant.
  ['a truthy string is not a grant', { granted: 'yes' }, 'autoLearn', ''],
  ['a truthy number is not a grant', { granted: 1 }, 'autoLearn', ''],
  ['an explicit false is not a grant', { granted: false, grantedBy: 'Circle' }, 'autoLearn', ''],
  // `grantedBy` is tested strictly too — coercion would render the writer's own shape.
  [
    'an object label is dropped',
    { granted: true, grantedBy: { id: 'x' } },
    'grantedUnlabelled',
    '',
  ],
  ['an array label is dropped', { granted: true, grantedBy: ['x'] }, 'grantedUnlabelled', ''],
  ['a numeric label is dropped', { granted: true, grantedBy: 7 }, 'grantedUnlabelled', ''],
];

describe('learnedRecipeSource grant rungs', () => {
  it('resolves every grant rung inside the no-uuid branch', () => {
    for (const [label, overrides, expectedKind, expectedName] of GRANT_LADDER_CASES) {
      const source = learnedRecipeSource({ sourceItemUuid: null, ...overrides });
      assert.equal(source.kind, expectedKind, `${label}: kind`);
      assert.equal(source.name, expectedName, `${label}: name`);
    }
  });

  it('lets real book provenance win over a grant on the same entry', () => {
    // The complement of the case above: a uuid-bearing entry has a source copy, so the
    // grant fields are display-irrelevant and MUST NOT be consulted.
    const owned = learnedRecipeSource({
      sourceItemUuid: 'Actor.a.Item.i',
      sourceOwned: true,
      sourceItemName: 'Primer',
      granted: true,
      grantedBy: 'Circle',
    });
    assert.equal(owned.kind, 'ownedCopy');
    assert.equal(owned.name, 'Primer');

    const lost = learnedRecipeSource({
      sourceItemUuid: 'Actor.a.Item.gone',
      sourceDefinitionName: 'Grand Codex',
      granted: true,
      grantedBy: 'Circle',
    });
    assert.equal(lost.kind, 'lostCopy');
    assert.equal(lost.name, 'Grand Codex');
  });

  it('clamps an over-long label by code point, inclusive of the ellipsis', () => {
    const long = learnedRecipeSource({
      sourceItemUuid: null,
      granted: true,
      grantedBy: 'A'.repeat(200),
    });
    assert.equal(long.name, `${'A'.repeat(63)}…`);
    assert.equal([...long.name].length, 64, 'the ellipsis counts against the 64');

    // Exactly at the bound: a contract-legal label renders verbatim, un-ellipsised.
    const exact = learnedRecipeSource({
      sourceItemUuid: null,
      granted: true,
      grantedBy: 'B'.repeat(64),
    });
    assert.equal(exact.name, 'B'.repeat(64));

    // Astral plane. `String.prototype.slice(0, 63)` cuts BETWEEN the halves of the
    // 32nd surrogate pair and leaves a lone surrogate that renders as tofu.
    const astral = learnedRecipeSource({
      sourceItemUuid: null,
      granted: true,
      grantedBy: '🜂'.repeat(100),
    });
    assert.equal(astral.name, `${'🜂'.repeat(63)}…`);
    // `[...str]` iterates CODE POINTS, so a lone surrogate — the tofu a UTF-16 slice
    // leaves behind — is the only way an element can land in the D800–DFFF range.
    const lone = [...astral.name].filter((point) => {
      const code = point.codePointAt(0);
      return code >= 0xd800 && code <= 0xdfff;
    });
    assert.equal(lone.length, 0, 'no half of a surrogate pair survives the clamp');
  });

  it('carries both grant fields through the projected row', () => {
    const row = projectLearnedRecipeRow({
      recipeId: 'r1',
      sourceItemUuid: null,
      granted: true,
      grantedBy: 'Circle',
    });
    assert.equal(row.sourceKind, 'granted');
    assert.equal(row.sourceName, 'Circle');
    // The projection keeps the DERIVED pair only, so no unclamped foreign text is
    // published onto the row at all.
    assert.ok(!('grantedBy' in row), 'the raw label is not republished');
    assert.ok(!('granted' in row), 'the raw flag is not republished');
    assert.equal(row.noRefundReason, 'noSource');
  });
});

describe('KnowledgeLearnedRow untrusted-text contract', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRow.svelte'),
    'utf8'
  );

  it('renders the source line as text and nothing else', () => {
    assert.ok(!source.includes('{@html'), 'the row must never render raw HTML');
    assert.ok(!/\bhref\b/.test(source), 'the row must never render a link');
    // `title` is allowed — it carries the RECIPE name, which the surface already
    // renders in full — but never the source name or a source-line fragment.
    for (const [, expression] of source.matchAll(/\btitle=\{([^}]*)\}/g)) {
      assert.doesNotMatch(
        expression,
        /source/i,
        `title must not carry the source name: ${expression}`
      );
    }
  });

  it('never substitutes through a mechanism that interprets $ patterns', () => {
    // `String.prototype.replace` interprets `$&`, `` $` ``, `$'` and `$n` in the
    // REPLACEMENT, and Foundry's `Localization#format` does the same, so neither may
    // carry a value into a translated sentence here. `split`/`join` interprets nothing.
    assert.ok(!/\.replace\(/.test(source), 'no replace-based substitution');
    assert.ok(!/localize\([^)]*,/.test(source), 'no format-based substitution');
    assert.ok(source.includes('.split(`{${name}}`).join('), 'fill substitutes by split/join');
    assert.ok(
      source.includes('<span data-knowledge-source-name>'),
      'the label is rendered as its own text node between the translated fragments'
    );
  });
});

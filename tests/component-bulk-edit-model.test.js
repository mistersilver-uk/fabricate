/**
 * Issue 772 — the component browser's pure bulk selection + staging model.
 *
 * Everything the bulk edit feature can be reasoned about without a DOM lives in
 * `src/utils/componentBulkEditModel.js`; the Svelte surfaces are wiring. This suite
 * therefore owns the semantics the plan pinned as easy to get subtly wrong:
 *
 * - the three-state tag cycle, and the invariant that a tag is never BOTH staged for
 *   addition and staged for removal;
 * - `essences` / `difficulty` being emitted on PRESENCE of their staged flag, never on
 *   the truthiness of their value — a staged all-zero map is the "clear essences on
 *   every selected component" instruction;
 * - a removal-only draft counting as a change, so `Apply` enables for it.
 *
 * The SELECTION half moved to `bulk-selection-model.test.js` with the helpers themselves
 * (issue 1010) — page-selection state, the select-all-results affordance, and every helper
 * returning a NEW `Set` are pinned there, against the shared model's own names.
 *
 * Top-level under `tests/` deliberately: the `npm test` glob covers `tests/*.test.js`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createComponentBrowserState } from '../src/utils/componentBrowserModel.js';
import {
  adjustBulkEssence,
  bulkDraftHasChanges,
  countComponentsChangingEssences,
  createComponentBulkDraft,
  cycleBulkTag,
  setBulkCategory,
  setBulkDifficulty,
  setBulkEssence,
  toBulkComponentEdit,
  toggleBulkDifficultyStaged,
  toggleBulkEssencesStaged,
} from '../src/utils/componentBulkEditModel.js';

/** A projected `itemCards` row, essences-as-ARRAY exactly as the admin store emits them. */
const card = (id, essences = []) => ({ id, name: id, essences });

describe('component bulk edit model (issue 772) — the staged draft', () => {
  it('createComponentBulkDraft returns a FRESH, wholly unstaged draft each call', () => {
    const first = createComponentBulkDraft();
    const second = createComponentBulkDraft();

    assert.deepEqual(first, {
      category: '',
      tagAdd: [],
      tagRemove: [],
      essencesStaged: false,
      essences: {},
      difficultyStaged: false,
      difficulty: 0,
    });
    assert.notEqual(first, second);
    assert.notEqual(first.tagAdd, second.tagAdd);
    assert.notEqual(first.essences, second.essences);
  });

  it('cycleBulkTag walks none -> add -> remove -> none, exactly as the prototype does', () => {
    const fresh = createComponentBulkDraft();

    const added = cycleBulkTag(fresh, 'metal');
    assert.deepEqual(added.tagAdd, ['metal']);
    assert.deepEqual(added.tagRemove, []);

    const removed = cycleBulkTag(added, 'metal');
    assert.deepEqual(removed.tagAdd, []);
    assert.deepEqual(removed.tagRemove, ['metal']);

    const cleared = cycleBulkTag(removed, 'metal');
    assert.deepEqual(cleared.tagAdd, []);
    assert.deepEqual(cleared.tagRemove, []);

    // …and round again, so the machine is a cycle rather than a one-way ratchet.
    assert.deepEqual(cycleBulkTag(cleared, 'metal').tagAdd, ['metal']);
  });

  it('a tag is NEVER simultaneously staged for add and for remove', () => {
    let draft = createComponentBulkDraft();
    for (let step = 0; step < 7; step += 1) {
      draft = cycleBulkTag(draft, 'rune');
      const both = draft.tagAdd.filter((tag) => draft.tagRemove.includes(tag));
      assert.deepEqual(both, [], `step ${step} staged 'rune' as both add and remove`);
    }
  });

  it('cycles each tag independently and never mutates the draft it was given', () => {
    const fresh = createComponentBulkDraft();
    const withMetal = cycleBulkTag(fresh, 'metal');
    const withBoth = cycleBulkTag(withMetal, 'rune');

    assert.deepEqual(withBoth.tagAdd, ['metal', 'rune']);
    // Cycling `metal` on to `remove` leaves `rune` staged for addition.
    const mixed = cycleBulkTag(withBoth, 'metal');
    assert.deepEqual(mixed.tagAdd, ['rune']);
    assert.deepEqual(mixed.tagRemove, ['metal']);

    // The inputs are untouched: every helper returns a NEW draft.
    assert.deepEqual(fresh.tagAdd, []);
    assert.deepEqual(withMetal.tagAdd, ['metal']);
    assert.deepEqual(withBoth.tagRemove, []);
    assert.notEqual(mixed, withBoth);
  });

  it('setBulkCategory stages an overwrite; the empty string is the leave-unchanged sentinel', () => {
    const staged = setBulkCategory(createComponentBulkDraft(), 'Metal');
    assert.equal(staged.category, 'Metal');
    assert.equal(bulkDraftHasChanges(staged), true);

    const unstaged = setBulkCategory(staged, '');
    assert.equal(unstaged.category, '');
    assert.equal(bulkDraftHasChanges(unstaged), false);
  });

  it('setBulkEssence and adjustBulkEssence clamp at 0, truncate, and stage the axis', () => {
    // `_normalizeEssenceQuantities` coerces with a bare `Number()` and does NOT floor,
    // so truncation has to happen in the model.
    const set = setBulkEssence(createComponentBulkDraft(), 'fire', 2.9);
    assert.equal(set.essences.fire, 2);
    assert.equal(set.essencesStaged, true);

    assert.equal(setBulkEssence(set, 'fire', -4).essences.fire, 0);

    const bumped = adjustBulkEssence(set, 'fire', 1);
    assert.equal(bumped.essences.fire, 3);
    // Clamped at zero rather than going negative.
    assert.equal(adjustBulkEssence(bumped, 'fire', -9).essences.fire, 0);
    // A bump on an unstaged draft stages the axis too.
    assert.equal(adjustBulkEssence(createComponentBulkDraft(), 'earth', 1).essencesStaged, true);
  });

  it('toggleBulkEssencesStaged arms and disarms the axis while keeping the staged map', () => {
    // Acceptance 16: on a fresh draft every essence is already 0, and `Stepper` emits
    // nothing at the zero boundary — so the indicator is the ONLY way to stage a
    // clear-everything edit.
    const armed = toggleBulkEssencesStaged(createComponentBulkDraft());
    assert.equal(armed.essencesStaged, true);
    assert.deepEqual(armed.essences, {});
    assert.equal(bulkDraftHasChanges(armed), true);

    const withValue = setBulkEssence(armed, 'fire', 2);
    const disarmed = toggleBulkEssencesStaged(withValue);
    assert.equal(disarmed.essencesStaged, false);
    assert.equal(disarmed.essences.fire, 2, 'unstaging keeps the value so re-staging restores it');
    assert.equal(bulkDraftHasChanges(disarmed), false);
  });

  it('setBulkDifficulty clamps to 0..35 and stages; toggling the axis on seeds 0', () => {
    const staged = setBulkDifficulty(createComponentBulkDraft(), 14);
    assert.equal(staged.difficulty, 14);
    assert.equal(staged.difficultyStaged, true);

    assert.equal(setBulkDifficulty(staged, 99).difficulty, 35);
    assert.equal(setBulkDifficulty(staged, -3).difficulty, 0);
    assert.equal(setBulkDifficulty(staged, 12.7).difficulty, 12);

    const armed = toggleBulkDifficultyStaged(createComponentBulkDraft());
    assert.equal(armed.difficultyStaged, true);
    assert.equal(armed.difficulty, 0, 'staged-but-untouched shows a 0 stepper, never a silent clear');
    assert.equal(toggleBulkDifficultyStaged(armed).difficultyStaged, false);
  });
});

describe('component bulk edit model (issue 772) — has-changes and the emitted edit', () => {
  it('a fresh draft is no change', () => {
    assert.equal(bulkDraftHasChanges(createComponentBulkDraft()), false);
    assert.deepEqual(toBulkComponentEdit(createComponentBulkDraft()), {});
  });

  it('a REMOVAL-ONLY draft is a real change, so Apply enables for it', () => {
    // Without this, cycling a single chip to `remove` leaves Apply inert forever.
    const removalOnly = cycleBulkTag(cycleBulkTag(createComponentBulkDraft(), 'metal'), 'metal');
    assert.deepEqual(removalOnly.tagAdd, []);
    assert.deepEqual(removalOnly.tagRemove, ['metal']);
    assert.equal(bulkDraftHasChanges(removalOnly), true);
    assert.deepEqual(toBulkComponentEdit(removalOnly), { removeTags: ['metal'] });
  });

  it('emits `essences` if and only if the axis is staged — emptiness is never "no change"', () => {
    // A staged, ALL-ZERO map is the instruction "clear essences on every selected
    // component". Reading `{}` as "nothing to do" would silently drop that edit.
    const stagedEmpty = toggleBulkEssencesStaged(createComponentBulkDraft());
    const emptyEdit = toBulkComponentEdit(stagedEmpty);
    assert.equal(Object.hasOwn(emptyEdit, 'essences'), true);
    assert.deepEqual(emptyEdit.essences, {});
    assert.equal(bulkDraftHasChanges(stagedEmpty), true);

    const allZero = setBulkEssence(stagedEmpty, 'fire', 0);
    const allZeroEdit = toBulkComponentEdit(allZero);
    assert.equal(Object.hasOwn(allZeroEdit, 'essences'), true);
    assert.deepEqual(allZeroEdit.essences, { fire: 0 });

    // Unstaged, the values are carried in the draft but are NOT part of the write.
    const unstaged = toggleBulkEssencesStaged(setBulkEssence(createComponentBulkDraft(), 'fire', 3));
    assert.equal(unstaged.essences.fire, 3);
    assert.equal(Object.hasOwn(toBulkComponentEdit(unstaged), 'essences'), false);
  });

  it('emits `difficulty` if and only if the axis is staged — including a staged 0', () => {
    const clearing = toggleBulkDifficultyStaged(createComponentBulkDraft());
    const clearingEdit = toBulkComponentEdit(clearing);
    assert.equal(Object.hasOwn(clearingEdit, 'difficulty'), true);
    assert.equal(clearingEdit.difficulty, 0, 'a staged 0 is an instruction to CLEAR the DC');

    const unstaged = toggleBulkDifficultyStaged(setBulkDifficulty(createComponentBulkDraft(), 17));
    assert.equal(unstaged.difficulty, 17);
    assert.equal(Object.hasOwn(toBulkComponentEdit(unstaged), 'difficulty'), false);
  });

  it('maps every staged axis onto the write primitive`s edit keys', () => {
    let draft = setBulkCategory(createComponentBulkDraft(), 'Metal');
    draft = cycleBulkTag(draft, 'rune');
    draft = cycleBulkTag(cycleBulkTag(draft, 'herb'), 'herb');
    draft = setBulkEssence(draft, 'fire', 2);
    draft = setBulkDifficulty(draft, 14);

    assert.deepEqual(toBulkComponentEdit(draft), {
      category: 'Metal',
      addTags: ['rune'],
      removeTags: ['herb'],
      essences: { fire: 2 },
      difficulty: 14,
    });
  });
});

describe('component bulk edit model (issue 772) — the essence-overwrite warning count', () => {
  const selected = [
    card('a', [{ id: 'fire', quantity: 2 }]),
    card('b', [{ id: 'earth', quantity: 1 }]),
    card('c'),
  ];

  it('counts a component whose authored essence would be removed by the overwrite', () => {
    // Replacing with `{fire: 2}` leaves `a`'s authored 2 exactly as it was, strips
    // `earth` from `b`, and only ADDS to `c`.
    assert.equal(countComponentsChangingEssences(selected, { fire: 2 }), 1);
  });

  it('counts every component with authored essences when the staged map is all-zero', () => {
    assert.equal(countComponentsChangingEssences(selected, {}), 2);
    assert.equal(countComponentsChangingEssences(selected, { fire: 0, earth: 0 }), 2);
  });

  it('counts an INCREASE too — overwriting an authored 1 with a 5 destroys that 1', () => {
    // The canonical requirement is "change or remove authored essence values", not
    // "lose": a bulk set across individually hand-tuned components is exactly as
    // destructive of the GM's authoring as a bulk clear.
    assert.equal(countComponentsChangingEssences(selected, { fire: 5, earth: 5 }), 2);
    // `b`'s authored earth:1 survives untouched here, so only `a` is counted.
    assert.equal(countComponentsChangingEssences(selected, { fire: 1, earth: 1 }), 1);
  });

  it('does not count a component whose authored values all survive unchanged', () => {
    assert.equal(countComponentsChangingEssences(selected, { fire: 2, earth: 1 }), 0);
    // A staged map that only ADDS a new essence alongside untouched authored values
    // destroys nothing, so it is not the hazard the tinted strip is reserved for.
    assert.equal(countComponentsChangingEssences(selected, { fire: 2, earth: 1, air: 4 }), 0);
    // …and a component with no authored essences at all is never in the blast radius.
    assert.equal(countComponentsChangingEssences([card('c')], { fire: 3 }), 0);
  });

  it('is pure over the PROJECTED essences ARRAY and tolerates empty inputs', () => {
    const rows = [card('a', [{ id: 'fire', quantity: 2 }])];
    countComponentsChangingEssences(rows, { fire: 0 });
    assert.deepEqual(rows[0].essences, [{ id: 'fire', quantity: 2 }], 'inputs are not mutated');
    assert.equal(countComponentsChangingEssences([], { fire: 0 }), 0);
    assert.equal(countComponentsChangingEssences(undefined, undefined), 0);
  });
});

describe('component browser state (issue 772)', () => {
  it('createComponentBrowserState carries a FRESH bulk selection Set', () => {
    const first = createComponentBrowserState();
    const second = createComponentBrowserState();

    assert.equal(first.bulkSelectedComponentIds instanceof Set, true);
    assert.equal(first.bulkSelectedComponentIds.size, 0);
    assert.notEqual(first.bulkSelectedComponentIds, second.bulkSelectedComponentIds);
    first.bulkSelectedComponentIds.add('a');
    assert.equal(second.bulkSelectedComponentIds.has('a'), false);
  });
});

/** `worldVocabularyStudio.js`, the world Tags & Categories screen's pure leaf (issue 1392). */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cascadeClause,
  describeVocabularyInput,
  inputNormalizer,
  panelKey,
  panelRows,
  WORLD_VOCABULARY_PANELS,
  worldPanelProps,
} from '../src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js';

const panelFor = (kind) => WORLD_VOCABULARY_PANELS.find((panel) => panel.kind === kind);
/** A localizer that answers the KEY, so an assertion names the key the code asked for. */
const echo = (key) => key;
const row = (id, name, totalUsage = 0) => ({ id, name, totalUsage });

test('the three panels carry distinct row hooks, input ids and sort-label ids', () => {
  // Three panels are mounted at once, so a shared hook makes every row selector ambiguous.
  for (const field of ['kind', 'rowAttr', 'inputId', 'sortLabelId']) {
    const values = WORLD_VOCABULARY_PANELS.map((panel) => panel[field]);
    assert.equal(new Set(values).size, 3, `two panels share a ${field}: ${values.join(', ')}`);
  }
  assert.deepEqual(
    WORLD_VOCABULARY_PANELS.filter((panel) => panel.column === 'grid').map((panel) => panel.kind),
    ['recipeCategories', 'componentCategories'],
    'the 2-up grid holds the two CATEGORY vocabularies, in the reference’s order'
  );
  assert.deepEqual(
    WORLD_VOCABULARY_PANELS.filter((panel) => panel.column === 'full').map((panel) => panel.kind),
    ['componentTags'],
    'and the tag vocabulary is the full-width band beneath it'
  );
});

test('the tag vocabulary lowercases on submit and displays a # prefix', () => {
  assert.equal(inputNormalizer('componentTags')('  HERB  '), 'herb');
  assert.equal(
    inputNormalizer('componentCategories')('  Reagent  '),
    'Reagent',
    'a category keeps its authored casing; only the derived id is folded'
  );

  const tags = panelRows({ componentTags: [row('herb', 'herb', 2)] }, panelFor('componentTags'));
  assert.equal(tags[0].displayName, '#herb');
  assert.equal(tags[0].name, 'herb', 'the # is DISPLAY only — `name` is what the confirm states');
  assert.equal(
    'displayName' in panelRows({ recipeCategories: [row('p', 'Potions')] }, panelFor('recipeCategories'))[0],
    false,
    'and only the tag vocabulary carries it'
  );
  assert.deepEqual(panelRows(null, panelFor('componentTags')), []);
});

test('the add-form hint answers all four of its branches', () => {
  const panel = panelFor('componentCategories');
  const rows = [row('reagent', 'Reagent')];
  const describe = describeVocabularyInput(panel, rows, echo);

  assert.deepEqual(
    describe('   '),
    { tone: '', message: '', blocked: true },
    'an empty input states nothing and blocks'
  );

  const reserved = describe('General');
  assert.equal(reserved.blocked, true);
  assert.equal(reserved.tone, 'danger');
  assert.equal(
    reserved.message,
    panelKey(panel, 'ReservedFeedback'),
    'the reserved bucket is refused through the SHIPPED guard, not a restated string test'
  );

  const duplicate = describe('  reagent ');
  assert.equal(duplicate.blocked, true);
  assert.equal(
    duplicate.message,
    panelKey(panel, 'DuplicateFeedback'),
    'de-duplication is on the DERIVED id, so a re-cased duplicate is caught before submit'
  );

  const ready = describe('Alloy');
  assert.equal(ready.blocked, false);
  assert.equal(ready.tone, 'success');
  assert.equal(ready.message, panelKey(panel, 'ReadyFeedback'));
  // AND THE VALUE IS SUBSTITUTED INTO IT, proved with a localizer that returns a template rather
  // than the key: `echo` above carries no `{name}`, so it could not tell a filled hint from an
  // unfilled one.
  const named = describeVocabularyInput(panel, rows, () => 'Ready to add "{name}".')('  Alloy  ');
  assert.equal(named.message, 'Ready to add "Alloy".');

  // A TAG HAS NO RESERVED BUCKET, and the guard is per kind rather than shared.
  const tagHint = describeVocabularyInput(panelFor('componentTags'), [], echo);
  assert.equal(tagHint('general').blocked, false);
  assert.equal(
    describeVocabularyInput(panelFor('componentTags'), [row('herb', 'herb')], echo)('HERB').blocked,
    true,
    'and its duplicate test runs over the LOWERCASED value it would submit'
  );
});

test('the cascade clause is per kind, per row, and already substituted', () => {
  const categories = panelFor('componentCategories');
  const some = cascadeClause(
    categories,
    { confirmTokens: { defaults: 2, inheriting: 3 } },
    (key, fallback) => (key.endsWith('CascadeSome') ? 'clears {defaults} for {inheriting}' : fallback)
  );
  assert.equal(
    some,
    'clears 2 for 3',
    'the clause is substituted HERE, so it cannot depend on the panel’s token iteration order'
  );
  assert.equal(some.includes('{'), false);

  assert.equal(
    cascadeClause(categories, { confirmTokens: { defaults: 0, inheriting: 0 } }, echo),
    panelKey(categories, 'CascadeNone'),
    'a deletion that rewrites nothing says so rather than stating two zeroes'
  );
  assert.equal(
    cascadeClause(panelFor('componentTags'), { confirmTokens: { components: 4 } }, echo),
    panelKey(panelFor('componentTags'), 'CascadeSome')
  );
  assert.equal(
    cascadeClause(panelFor('recipeCategories'), { confirmTokens: {} }, echo),
    '',
    'a recipe category rewrites nothing anywhere, so it has no second number and no clause'
  );
});

test('worldPanelProps carries every per-kind string the panel component needs', () => {
  const panel = panelFor('componentTags');
  const rows = [row('herb', 'herb', 2)];
  const props = worldPanelProps(panel, {
    rows,
    text: echo,
    onAdd: () => {},
    onRemove: () => {},
  });

  // THE HOOKS THE THREE MOUNTED PANELS MUST NOT SHARE come from the descriptor, not from here.
  assert.equal(props.kind, 'componentTags');
  assert.equal(props.rowAttr, panel.rowAttr);
  assert.equal(props.inputId, panel.inputId);
  assert.equal(props.sortLabelId, panel.sortLabelId);
  assert.equal(props.rows, rows, 'the rows are handed on UNSORTED; the panel component sorts');
  assert.equal(props.lockedRow, null, 'the world scope has no reserved row to lock');
  assert.equal(props.showIcon, false, 'and no per-row persisted icon');

  // EVERY STRING RESOLVES THROUGH THIS MODULE'S OWN KEY BUILDER, which is what the lang contract
  // reads; a prop that fell back to a hard-coded English literal would pass a smoke test and ship
  // untranslated.
  for (const [prop, field] of [
    ['title', 'Title'],
    ['label', 'Title'],
    ['subline', 'Subline'],
    ['inputLabel', 'InputLabel'],
    ['addLabel', 'AddLabel'],
    ['emptyTitle', 'EmptyTitle'],
    ['removeConfirmHint', 'RemoveConfirm'],
  ]) {
    assert.equal(props[prop], panelKey(panel, field), `${prop} reads ${field}`);
  }
  // AND THE TOOLBAR NAME IS SUBSTITUTED rather than left carrying its token.
  const named = worldPanelProps(panel, {
    rows,
    text: (key, fallback) => (key.endsWith('.SortToolbar') ? 'Sort {vocabulary}' : fallback || key),
    onAdd: () => {},
    onRemove: () => {},
  });
  assert.equal(named.sortToolbarLabel.includes('{vocabulary}'), false);
  assert.ok(named.sortToolbarLabel.startsWith('Sort '));
});

test('worldPanelProps routes add and remove back to the page with their panel', () => {
  const panel = panelFor('recipeCategories');
  const added = [];
  const removed = [];
  const props = worldPanelProps(panel, {
    rows: [],
    text: echo,
    onAdd: (target, value) => added.push([target.kind, value]),
    onRemove: (target, entry) => removed.push([target.kind, entry.id]),
  });

  props.onAdd('Potions');
  props.onRemove({ id: 'potions' });
  // WITHOUT THE PANEL the page cannot tell which of three simultaneous vocabularies it is writing.
  assert.deepEqual(added, [['recipeCategories', 'Potions']]);
  assert.deepEqual(removed, [['recipeCategories', 'potions']]);
});

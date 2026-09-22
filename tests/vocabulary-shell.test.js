/** `vocabularyShell.js`, the pure leaf both Tags & Categories screens build from (issue 1915). */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decorateTagRows,
  defineVocabularyPanel,
  partitionVocabularyPanels,
  sortVocabularyRows,
  toggledDirection,
  VOCABULARY_SORT_KEYS,
} from '../src/ui/svelte/apps/manager/vocabularyShell.js';
import { SYSTEM_VOCABULARY_PANELS } from '../src/ui/svelte/apps/manager/systemVocabularyStudio.js';
import { WORLD_VOCABULARY_PANELS } from '../src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js';

const row = (id, name, totalUsage = 0) => ({ id, name, totalUsage });

test('defineVocabularyPanel answers the kind facts neither scope gets to choose', () => {
  // THE WHOLE POINT OF THE FACTORY. Two scopes state their own hooks and lang wiring; where the
  // panel sits and which glyph heads it belong to the VOCABULARY, so the two screens cannot drift
  // into drawing the recipe categories in different places.
  for (const kind of ['recipeCategories', 'componentCategories', 'componentTags']) {
    const world = WORLD_VOCABULARY_PANELS.find((panel) => panel.kind === kind);
    const system = SYSTEM_VOCABULARY_PANELS.find((panel) => panel.kind === kind);
    assert.ok(world && system, `${kind} is a panel at BOTH scopes`);
    assert.equal(world.column, system.column, `${kind} sits in the same placement on both screens`);
    assert.equal(world.icon, system.icon, `${kind} is headed by the same glyph on both screens`);
  }
  // AND THE HOOKS DIVERGE, which is what makes the clause above a claim rather than a tautology.
  // WITHIN a scope, because three panels mount at once and a shared hook makes every row selector
  // ambiguous; ACROSS the two scopes `rowAttr` is deliberately the same vocabulary of hooks, since
  // the two screens are different routes and are never mounted together.
  for (const table of [WORLD_VOCABULARY_PANELS, SYSTEM_VOCABULARY_PANELS]) {
    for (const field of ['kind', 'rowAttr', 'inputId', 'sortLabelId']) {
      const values = table.map((panel) => panel[field]);
      assert.equal(new Set(values).size, 3, `two panels share a ${field}: ${values.join(', ')}`);
    }
  }
  // The two DOCUMENT-scoped ids must not collide across scopes either: an id is unique per
  // document, and the two screens share a stylesheet and a component.
  for (const field of ['inputId', 'sortLabelId']) {
    const values = [...WORLD_VOCABULARY_PANELS, ...SYSTEM_VOCABULARY_PANELS].map(
      (panel) => panel[field]
    );
    assert.equal(new Set(values).size, 6, `a ${field} is reused across scopes: ${values.join(', ')}`);
  }

  const divergent = defineVocabularyPanel({
    kind: 'componentTags',
    rowAttr: 'data-tag-id',
    decorativeIcon: 'fas fa-tag',
    showIcon: true,
  });
  assert.equal(divergent.column, 'full', 'the tag vocabulary is always the full-width panel');
  assert.equal(divergent.icon, 'fas fa-hashtag');
  assert.equal(divergent.emptyIcon, 'fas fa-hashtag', 'the empty state falls to the head glyph');
  assert.equal(divergent.decorativeIcon, 'fas fa-tag', 'and a stated field WINS over the default');
  assert.equal(divergent.showIcon, true);
  assert.throws(
    () => {
      divergent.column = 'grid';
    },
    TypeError,
    'a descriptor is frozen, because both tables are module-level singletons'
  );

  // A kind the factory does not know still produces a usable descriptor rather than `undefined`s.
  const unknown = defineVocabularyPanel({ kind: 'nonsense' });
  assert.equal(unknown.column, 'grid');
  assert.equal(unknown.icon, '');
});

test('partitionVocabularyPanels splits the 2-up grid from the panel beneath it', () => {
  const placements = partitionVocabularyPanels(WORLD_VOCABULARY_PANELS);
  assert.deepEqual(
    placements.grid.map((panel) => panel.kind),
    ['recipeCategories', 'componentCategories'],
    'the two CATEGORY vocabularies, in the reference’s order'
  );
  assert.deepEqual(
    placements.full.map((panel) => panel.kind),
    ['componentTags'],
    'and the tag vocabulary is the full-width panel'
  );
  assert.deepEqual(partitionVocabularyPanels(null), { grid: [], full: [] }, 'and it is total');
});

test('sortVocabularyRows orders by name and by references, in both directions', () => {
  const rows = [row('b', 'Beta', 5), row('a', 'Alpha', 1), row('c', 'Gamma', 5)];
  const names = (sorted) => sorted.map((entry) => entry.name);

  assert.deepEqual(names(sortVocabularyRows(rows, 'name', 'asc')), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(names(sortVocabularyRows(rows, 'name', 'desc')), ['Gamma', 'Beta', 'Alpha']);
  assert.deepEqual(names(sortVocabularyRows(rows, 'references', 'asc')), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(
    names(sortVocabularyRows(rows, 'references', 'desc')),
    ['Beta', 'Gamma', 'Alpha'],
    'and a tie falls back to the NAME, so the order is deterministic rather than the engine’s'
  );

  // IT COPIES. The projection publishes these arrays and the store owns the corpus behind them.
  const original = [...rows];
  sortVocabularyRows(rows, 'references', 'desc');
  assert.deepEqual(rows, original, 'the published array is never reordered in place');
  assert.deepEqual(sortVocabularyRows(null, 'name', 'asc'), [], 'and it is total');
});

test('the two sort keys mint no lang key of their own', () => {
  assert.deepEqual(
    VOCABULARY_SORT_KEYS.map((option) => option.id),
    ['name', 'references'],
    'two sort keys, both labelled from shipped keys'
  );
  for (const option of VOCABULARY_SORT_KEYS) {
    assert.ok(option.key.startsWith('FABRICATE.'), `${option.id} reads a real key`);
    assert.ok(option.fallback.length > 0, `${option.id} states a fallback`);
  }
});

test('decorateTagRows prefixes the DISPLAY name and leaves the name alone', () => {
  const [decorated] = decorateTagRows([row('herb', 'herb', 2)]);
  assert.equal(decorated.displayName, '#herb');
  assert.equal(decorated.name, 'herb', 'the # is DISPLAY only — `name` is what the confirm states');
  assert.deepEqual(decorateTagRows(null), [], 'and it is total');
});

test('toggledDirection is a two-state toggle that cannot get stuck', () => {
  assert.equal(toggledDirection('asc'), 'desc');
  assert.equal(toggledDirection('desc'), 'asc');
  // AN UNSET DIRECTION MUST MOVE. A toggle whose first click is a no-op reads as a dead control.
  assert.equal(toggledDirection(''), 'asc');
  assert.equal(toggledDirection(undefined), 'asc');
});

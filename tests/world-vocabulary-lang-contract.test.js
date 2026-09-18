/**
 * The world vocabulary screen's PER-KIND copy, which is otherwise an unguarded mirror that fails to
 * an empty string (issue 1392, epic 1357).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  panelKey,
  WORLD_VOCABULARY_PANELS,
} from '../src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const LANG = JSON.parse(read('lang/en.json'));

/** The per-panel field names the two consumers actually ask for. */
function requestedFields() {
  const fields = new Set();
  const sources = [
    read('src/ui/svelte/apps/manager/scoped/WorldVocabularyPage.svelte'),
    read('src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js'),
  ];
  for (const source of sources) {
    for (const [, field] of source.matchAll(/panel(?:Text|Key)\(panel, '(\w+)'/g)) {
      fields.add(field);
    }
  }
  return [...fields].sort();
}

/** The ONE field pair that is legitimately per-kind rather than universal. */
const CASCADE_FIELDS = new Set(['CascadeSome', 'CascadeNone']);

function resolveKey(key) {
  return key.split('.').reduce((node, segment) => (node == null ? node : node[segment]), LANG);
}

test('every per-kind string the world vocabulary screen asks for resolves to real copy', () => {
  const fields = requestedFields();
  // THE ANTI-VACUITY FLOOR. An extraction that stopped matching would quantify over nothing and
  // report clean on a lang file with every one of these strings deleted.
  assert.ok(
    fields.length > 1,
    `the extraction found ${fields.length} field name(s), so it has stopped reading the call sites`
  );
  assert.ok(fields.includes('Title'), 'and it reaches the panel head');
  assert.ok(fields.includes('RemoveConfirm'), 'and the confirm sentence');
  assert.equal(WORLD_VOCABULARY_PANELS.length, 3, 'three vocabularies');

  const missing = [];
  for (const panel of WORLD_VOCABULARY_PANELS) {
    for (const field of fields) {
      if (CASCADE_FIELDS.has(field) && panel.kind === 'recipeCategories') continue;
      const key = panelKey(panel, field);
      const value = resolveKey(key);
      if (typeof value !== 'string' || value.trim() === '') missing.push(key);
    }
  }
  assert.deepEqual(
    missing,
    [],
    'the page resolves per-kind copy from a table and falls back to an EMPTY STRING, so a key ' +
      'that is absent renders a blank title, label or empty state rather than the raw key:\n  ' +
      missing.join('\n  ')
  );
});

test('the two component confirms state their second number, and the recipe confirm does not', () => {
  // A `{cascade}` token whose clause pair is missing renders a literal brace in a destructive
  // confirm; a recipe confirm that grew one would render an unsubstituted token forever, because
  // `cascadeClause` never supplies it for that kind.
  for (const kind of ['ComponentCategories', 'ComponentTags']) {
    const base = `FABRICATE.Admin.Manager.Scoped.WorldVocabulary.${kind}`;
    assert.ok(
      resolveKey(`${base}.RemoveConfirm`).includes('{cascade}'),
      `${kind}'s confirm carries the cascade clause`
    );
    assert.equal(
      resolveKey(`${base}.CascadeNone`).includes('{'),
      false,
      `${kind}'s no-cascade clause states no number at all, which is the whole point of it`
    );
  }
  const recipeConfirm = resolveKey(
    'FABRICATE.Admin.Manager.Scoped.WorldVocabulary.RecipeCategories.RemoveConfirm'
  );
  assert.equal(recipeConfirm.includes('{cascade}'), false);
  assert.ok(recipeConfirm.includes('{count}'), 'it still states the reference count');
});

/**
 * The world vocabulary screen's PER-KIND copy, which is otherwise an unguarded mirror that fails
 * to an empty string (issue 1392, epic 1357).
 *
 * ── WHY THIS IS NOT COVERED BY THE TWO SHIPPED LANG GUARDS ────────────────────────────────
 * `ui-lang-keys-resolve.test.js` checks LITERAL `FABRICATE.*` keys found in source text, and this
 * screen composes every one of its strings from a table: one `panelText(panel, 'Title')` call
 * site serves three vocabularies, so the only literal in the file is the namespace base — which
 * resolves to an object and is admitted. `lang-keys-no-orphans.test.js` runs the other way and
 * credits the whole subtree from that same base. Measured on this tree: deleting 16 of the 19
 * `Scoped.WorldVocabulary.ComponentTags.*` display strings left 105 tests green, and the screen
 * rendered a blank title, a blank subline, a blank add label and a blank empty state.
 *
 * ── THE FIELD LIST IS EXTRACTED, NEVER RESTATED ───────────────────────────────────────────
 * A hand-written list of field names is the same mirror one level up: it would go stale the day
 * the page reads a new one, and the new field is exactly the case this exists to catch. So the
 * names are read out of the page's own `panelText(panel, '…')` call sites and the studio's own
 * `panelKey(panel, '…')` call sites, and the extraction carries its own floor.
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

/**
 * The ONE field pair that is legitimately per-kind rather than universal.
 *
 * A recipe category's deletion rewrites nothing anywhere in the world, so `cascadeClause`
 * answers `''` for it and never asks for either clause — its own sentence says so outright. Every
 * other field is asked for on every panel.
 */
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

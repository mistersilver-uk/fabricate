/*
 * Canonical view-case registry invariants (issue 823).
 *
 * This file lives at the GLOBBED top-level `tests/*.test.js` location (alongside
 * `ui-pr-screenshot-evidence.test.js`) so `npm test` actually runs it — a copy
 * under `tests/view-lab/` or `scripts/lib/` would pass in isolation but never run
 * in CI. It asserts ONLY new-registry self-consistency; it NEVER hard-equals the
 * legacy `VIEW_RECIPES` (that pilot-subset equality is deferred to #824). The
 * anti-stranding "every pattern resolves to a real tracked file" invariants are
 * PORTED here from `ui-pr-screenshot-evidence.test.js` before the old map is
 * deleted — consolidation does not auto-solve the stranded-pattern class.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, sep, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  VIEW_CASES,
  FALLBACK_CASE_ID,
  caseIds,
  fallbackCase,
  hasUiChanges,
  isUiFile,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';
import { fixtureIds } from './view-lab/fixtures.js';

const repoRoot = resolve(import.meta.dirname, '..');

// Recover the single literal path a purely-literal anchored pattern targets, or
// null for a real glob (checked by walking the repo instead). Ported verbatim in
// spirit from the legacy `keeps every matches entry resolving to a real repo path`
// test: BOTH anchors are required so an unanchored suffix pattern (`/\.css$/`) is
// not mis-"recovered" as the literal path `.css`.
function literalPathOf(source) {
  if (!source.startsWith('^') || !source.endsWith('$')) return null;
  const body = source.slice(1, -1);
  const withoutEscapes = body.replace(/\\[.*+?[\]{}()|/\\^$]/g, '');
  if (/[.*+?[\]{}()|]/.test(withoutEscapes)) return null;
  return body.replace(/\\(.)/g, '$1');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full.split(sep).join('/'));
  }
  return out;
}

test('every case id is unique, so <id>.png filenames are unique', () => {
  const ids = caseIds();
  assert.equal(ids.length, VIEW_CASES.length);
  assert.equal(new Set(ids).size, ids.length, 'duplicate case id would collide on <id>.png');
});

test('every case declares an explicit viewport', () => {
  for (const viewCase of VIEW_CASES) {
    assert.ok(viewCase.viewport, `${viewCase.id} must declare a viewport`);
    assert.equal(typeof viewCase.viewport.width, 'number', `${viewCase.id} viewport.width`);
    assert.equal(typeof viewCase.viewport.height, 'number', `${viewCase.id} viewport.height`);
    assert.ok(viewCase.viewport.width > 0 && viewCase.viewport.height > 0, `${viewCase.id} positive viewport`);
  }
});

test('every publishable case has a readySelector keyed on stable classes/roles, not generated ids', () => {
  for (const viewCase of VIEW_CASES) {
    if (!viewCase.publish) continue;
    assert.equal(typeof viewCase.readySelector, 'string', `${viewCase.id} readySelector present`);
    assert.ok(viewCase.readySelector.length > 0, `${viewCase.id} readySelector non-empty`);
    // A generated DOM id (crypto.randomUUID / foundry.utils.randomID) is a UUID-shaped
    // token; a readySelector must never key on one (Design D). Reject a bare `#<uuid>`.
    assert.doesNotMatch(
      viewCase.readySelector,
      /#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      `${viewCase.id} readySelector must not key on a generated id`,
    );
  }
});

test('exactly one global-UI fallback case exists', () => {
  const fallbacks = VIEW_CASES.filter((viewCase) => (viewCase.kinds || []).includes('fallback'));
  assert.equal(fallbacks.length, 1, 'exactly one fallback case');
  assert.equal(fallbacks[0].id, FALLBACK_CASE_ID);
  assert.equal(fallbackCase().id, FALLBACK_CASE_ID);
});

test('every case fixtureId resolves to a registered fixture', () => {
  const registered = new Set(fixtureIds());
  for (const viewCase of VIEW_CASES) {
    assert.ok(
      registered.has(viewCase.fixtureId),
      `${viewCase.id} fixtureId '${viewCase.fixtureId}' is not registered in tests/view-lab/fixtures.js`,
    );
  }
});

test('every case component is a real tracked .svelte file', () => {
  for (const viewCase of VIEW_CASES) {
    assert.match(viewCase.component, /\.svelte$/, `${viewCase.id} component must be a .svelte path`);
    assert.ok(existsSync(resolve(repoRoot, viewCase.component)), `${viewCase.id} component '${viewCase.component}' must exist`);
  }
});

test('every sourceMatches array is non-empty', () => {
  for (const viewCase of VIEW_CASES) {
    assert.ok(Array.isArray(viewCase.sourceMatches), `${viewCase.id} sourceMatches array`);
    assert.ok(viewCase.sourceMatches.length > 0, `${viewCase.id} sourceMatches non-empty`);
  }
});

// PORTED anti-stranding invariant #1 (literal path exists on disk).
test('every literal sourceMatches pattern resolves to a real path on disk', () => {
  let checkedLiterals = 0;
  for (const viewCase of VIEW_CASES) {
    for (const pattern of viewCase.sourceMatches) {
      const literal = literalPathOf(pattern.source);
      if (!literal) continue;
      checkedLiterals += 1;
      assert.ok(
        existsSync(resolve(repoRoot, literal)),
        `${viewCase.id} matches '${literal}', which does not exist — its frame is stranded`,
      );
    }
  }
  assert.ok(checkedLiterals > 0, 'expected to check at least one literal pattern');
});

// PORTED anti-stranding invariant #2 (every pattern, incl. globs, resolves to a
// real repo file via a tree walk).
test('every sourceMatches pattern (incl. globs) matches at least one repo file', () => {
  const repoFiles = [...walk(join(repoRoot, 'src')), ...walk(join(repoRoot, 'styles'))].map((file) =>
    file.slice(repoRoot.length + 1),
  );
  let checked = 0;
  for (const viewCase of VIEW_CASES) {
    for (const pattern of viewCase.sourceMatches) {
      checked += 1;
      assert.ok(
        repoFiles.some((file) => pattern.test(file)),
        `${viewCase.id} pattern ${pattern} matches no file in the repo — its frame is stranded`,
      );
    }
  }
  assert.ok(checked > 0, 'expected to check at least one pattern');
});

// PORTED anti-stranding invariant #3 (git-tracked, not just on disk).
test('every literal sourceMatches pattern points at a git-tracked file', () => {
  const tracked = new Set(
    spawnSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
      .stdout.split(/\r?\n/)
      .map((line) => line.replace(/\\/g, '/'))
      .filter(Boolean),
  );
  assert.ok(tracked.size > 0, 'expected git ls-files to return tracked files');
  for (const viewCase of VIEW_CASES) {
    const resolves = viewCase.sourceMatches.some((pattern) => [...tracked].some((file) => pattern.test(file)));
    assert.ok(resolves, `${viewCase.id} has no sourceMatches pattern resolving to a tracked file`);
  }
});

test('mapChangedFilesToCases falls back to the single global-UI case for an unmapped UI change', () => {
  // A render file matching no explicit case still trips the fallback.
  const ids = mapChangedFilesToCases(['src/ui/svelte/util/dropUtils.js']).map((viewCase) => viewCase.id);
  assert.deepEqual(ids, [FALLBACK_CASE_ID]);

  // A crafting change maps to the crafting cases (never the fallback).
  const craftingIds = mapChangedFilesToCases([
    'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
  ]).map((viewCase) => viewCase.id);
  assert.ok(craftingIds.includes('player-crafting-status'));
  assert.ok(!craftingIds.includes(FALLBACK_CASE_ID));

  // A styles-only change maps ONLY to the fallback.
  assert.deepEqual(
    mapChangedFilesToCases(['styles/fabricate.css']).map((viewCase) => viewCase.id),
    [FALLBACK_CASE_ID],
  );
});

test('lang-only change is non-UI; a lang change beside a render file is UI', () => {
  assert.equal(hasUiChanges(['lang/en.json']), false);
  assert.deepEqual(mapChangedFilesToCases(['lang/en.json']), []);
  assert.equal(isUiFile('lang/en.json'), false);
  assert.equal(hasUiChanges(['lang/en.json', 'styles/fabricate.css']), true);
});

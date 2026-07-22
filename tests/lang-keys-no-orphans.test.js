/**
 * Reverse guard: every `FABRICATE.*` STRING leaf declared in `lang/en.json` must
 * be referenced by something in `src/**`. This is the counterpart to
 * `tests/ui-lang-keys-resolve.test.js` (which only checks the forward direction —
 * that every literal key USED in `src/ui` resolves to a string). Without this
 * reverse check an orphaned key ships as dead weight invisibly: it renders
 * nowhere and nothing fails (see issue #680 — the `SalvageEditor`/`SalvageEdit`
 * near-miss, where a branch rewrite would have left ~30 freshly-authored keys
 * unreferenced with no gate noticing).
 *
 * Reference model — deliberately GENEROUS (unlike the narrow forward test) so it
 * never reports a FALSE orphan and never pressures anyone to delete a live key:
 *
 *   Every `FABRICATE.<seg>(.<seg>)*` literal found anywhere in `src/**` source
 *   text is captured and treated as a covering PREFIX over its ancestor-or-equal
 *   leaves. One regex uniformly credits all reference shapes because in each the
 *   literal appears verbatim in the source:
 *     - exact keys: `text('FABRICATE.A.B')`, `name: 'FABRICATE.A.B'`;
 *     - inline interpolation bases: `` `FABRICATE.A.B.${x}` `` (the regex stops at
 *       `${`, capturing `FABRICATE.A.B` — which covers the whole `A.B` subtree);
 *     - module const/static bases later interpolated, e.g.
 *       `const L = 'FABRICATE.Admin.ImportReport'` (importReportContent.js) and
 *       `DENIAL_PREFIX = 'FABRICATE.Canvas.Interactable.Denied'`;
 *     - `LOCALIZATION_PREFIXES = ['FABRICATE.RegionBehavior.Interactable']`
 *       (FabricateInteractableRegionBehavior.js) — Foundry expands `<prefix>.FIELDS.*`.
 *
 * Coverage limit (stated, matching the forward test's honesty): inside a
 * referenced subtree this check cannot tell a live leaf from a dead sibling — the
 * whole subtree is treated as covered. That is the intended trade to avoid false
 * positives; the reverse of the forward test's own dynamic-key blind spot.
 *
 * Escape hatches:
 *   - DYNAMIC_KEY_ALLOWLIST (below): keys referenced in a way the scan CANNOT see
 *     — assembled from a bare `'FABRICATE.'` prefix + variable, or read only by an
 *     external surface. Currently empty: a repo-wide search found no bare-prefix
 *     concatenation and no external lang surfaces, and every dynamic reference in
 *     `src` carries a static `FABRICATE.<seg>` prefix the scan already credits.
 *   - KNOWN_ORPHANS (imported): the ratchet DEBT baseline of genuinely-dead leaves
 *     surfaced by #680, pending a follow-up bulk prune. See lang-known-orphans.js.
 *
 * Structurally distinct from the forward test on purpose (no shared `resolveKey`
 * reduce / recursive file collector) so the SonarCloud new-code duplication gate
 * stays under 3%.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { KNOWN_ORPHANS } from './lang-known-orphans.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Explicit, inline-commented escape hatch for keys referenced in a way the static
// prefix scan cannot see (bare-`'FABRICATE.'`-prefix assembly, or external-only
// reads). Distinct from KNOWN_ORPHANS, which is dead-weight debt. Keep it small.
const DYNAMIC_KEY_ALLOWLIST = [
  // (none) — see the file header: no bare-prefix assembly or external surface exists today.
];

// Capture a maximal `FABRICATE.<seg>(.<seg>)*` dotted literal. Requiring at least
// one segment after `FABRICATE` means a bare `` `FABRICATE.${x}` `` never collapses
// to an everything-covering `FABRICATE` prefix (such a key would be allowlisted).
const REFERENCE = /FABRICATE\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g;

// Flat, recursive directory listing — intentionally not the forward test's
// hand-rolled recursion — filtered to the two source extensions that carry keys.
function sourceFiles(root) {
  return readdirSync(root, { recursive: true })
    .map((relative) => join(root, relative))
    .filter((path) => path.endsWith('.js') || path.endsWith('.svelte'));
}

// Every STRING leaf's dotted path under `FABRICATE`, collected by an explicit
// stack walk (namespaces/objects are not leaves).
function declaredStringLeaves(fabricate) {
  const leaves = [];
  const stack = [['FABRICATE', fabricate]];
  while (stack.length > 0) {
    const [path, node] = stack.pop();
    for (const [key, value] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      if (typeof value === 'string') {
        leaves.push(childPath);
      } else if (value && typeof value === 'object') {
        stack.push([childPath, value]);
      }
    }
  }
  return leaves;
}

function isCoveredBy(prefixes, leaf) {
  for (const prefix of prefixes) {
    if (leaf === prefix || leaf.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

test('no FABRICATE lang key in en.json is orphaned (unreferenced in src)', () => {
  const lang = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));
  const leaves = declaredStringLeaves(lang.FABRICATE);
  assert.ok(leaves.length > 0, 'expected en.json to declare FABRICATE string leaves');

  const prefixes = new Set(DYNAMIC_KEY_ALLOWLIST);
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(REFERENCE)) {
      prefixes.add(match[0]);
    }
  }

  const knownOrphans = new Set(KNOWN_ORPHANS);
  const orphans = leaves.filter((leaf) => !isCoveredBy(prefixes, leaf));

  // Ratchet 1: no NEW orphan. Any unreferenced leaf not already in the baseline
  // must be wired up, deleted, or (if truly dynamic) allowlisted.
  const newOrphans = orphans
    .filter((leaf) => !knownOrphans.has(leaf))
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(
    newOrphans,
    [],
    `new orphaned lang keys (unreferenced in src):\n${newOrphans.join('\n')}`
  );

  // Ratchet 2: the baseline can only shrink. An entry that is no longer an orphan
  // (deleted from en.json, or now referenced) must be removed from KNOWN_ORPHANS.
  const orphanSet = new Set(orphans);
  const staleBaseline = [...knownOrphans]
    .filter((leaf) => !orphanSet.has(leaf))
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(
    staleBaseline,
    [],
    `stale KNOWN_ORPHANS entries (no longer orphaned — remove them from lang-known-orphans.js):\n${staleBaseline.join('\n')}`
  );
});

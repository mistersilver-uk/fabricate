/**
 * Changed-file segmentation completeness.
 *
 * The View Lab's value depends on a changed file selecting the frames that show it. A component
 * inside a mounted window that no case claims does not produce NO evidence — `mapChangedFilesToCases`
 * falls back to `FALLBACK_CASE_ID` — it produces UNRELATED evidence, a frame of some other window
 * presented as proof of a change it does not contain. That is the failure this gates.
 *
 * The gate is deliberately scoped to the transitive `.svelte` import closure of the two mounted
 * roots, not to every UI file. Scoping matters more than coverage here: 326 tracked files match
 * `isUiFile()`, and 135 of them are claimed by nothing — including roots this change explicitly
 * declares out of scope, and modules the lab can never photograph (`appFactory.js`,
 * `SvelteApplicationMixinCore.js`, `actions/portal.js`). A gate demanding a claim for those has two
 * exits: build applications the change excluded, or paste a regex onto an unrelated case. The
 * second is what would happen, and it makes the mapping worse than the gap it closed.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BROAD_SIGNAL_PATTERN, VIEW_LAB_CASES, normalizePath } from '../scripts/lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The two windows the lab mounts. Everything reachable from these is photographable. */
const MOUNTED_ROOTS = [
  'src/ui/svelte/apps/FabricateAppRoot.svelte',
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
];

/**
 * Components inside the closure that no case claims ON PURPOSE, each with the reason.
 *
 * An entry here is a reviewed decision, not a silence. The list is itself gated below: an entry
 * that no longer resolves to a tracked file, or that has left the closure, fails — so a stale
 * exemption cannot outlive the thing it exempted.
 */
const UNCLAIMED_BY_DESIGN = Object.freeze([]);

/**
 * Components a case may match even though no mounted window renders them.
 *
 * Kept EMPTY on purpose. A pattern reaching an unrenderable component is the "unrelated evidence"
 * failure, so the fix is nearly always to narrow the pattern rather than to record an exception. An
 * entry here has to be a component that is genuinely dead or genuinely out of scope AND that no
 * narrower pattern can exclude — and it is checked below, so it cannot outlive that condition.
 */
const EXPECTED_OUTSIDE_CLOSURE = new Set([]);

const tracked = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
);

/**
 * Walk the `.svelte` import closure from the mounted roots.
 *
 * Only relative specifiers are followed, and only to `.svelte` files: a bare specifier is a package,
 * and a `.js` import is logic rather than a rendered surface. Both are out of the closure by
 * construction, which is what keeps the gate to "components a frame can actually show".
 *
 * @returns {Set<string>} Repo-relative paths, normalized.
 */
function svelteClosure() {
  const seen = new Set();
  const queue = [...MOUNTED_ROOTS];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);

    const absolute = join(ROOT, current);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, 'utf8');

    for (const match of source.matchAll(/from\s+['"](\.[^'"]+\.svelte)['"]/g)) {
      const resolved = normalizePath(relative(ROOT, resolve(dirname(absolute), match[1])));
      if (tracked.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

const CLOSURE = svelteClosure();

test('the closure walk reaches a non-trivial component set', () => {
  // A walk that silently found nothing would make every assertion below vacuously true — the
  // failure mode this whole file exists to prevent, turned on itself.
  assert.ok(
    CLOSURE.size >= 50,
    `the import closure resolved only ${CLOSURE.size} components; the walk is probably broken`
  );
  for (const root of MOUNTED_ROOTS) assert.ok(CLOSURE.has(root), `closure lost its root ${root}`);
});

test('every component a mounted window can render is claimed by some case', () => {
  const exempt = new Set(UNCLAIMED_BY_DESIGN.map((entry) => entry.path));
  const unclaimed = [];

  for (const file of CLOSURE) {
    if (exempt.has(file)) continue;
    // Broad signals are claim-exempt because `mapChangedFilesToCases` `continue`s on them BEFORE
    // consulting `sourceMatches` at all — a shared primitive routes to the representative set by
    // design, since attributing it to one window would select every window. Requiring a claim here
    // would mandate data the mapper never reads: ceremony that rots.
    if (BROAD_SIGNAL_PATTERN.test(file)) continue;
    const claimed = VIEW_LAB_CASES.some((viewCase) =>
      viewCase.sourceMatches.some((pattern) => pattern.test(file))
    );
    if (!claimed) unclaimed.push(file);
  }

  assert.deepEqual(
    unclaimed,
    [],
    'these components are reachable in a captured window but no case claims them, so a change to ' +
      'one selects an UNRELATED frame as its evidence. Add a `sourceMatches` pattern to the case ' +
      'that shows the component, or add an `UNCLAIMED_BY_DESIGN` entry stating why not:\n  ' +
      unclaimed.join('\n  ')
  );
});

test('no case claims a component that appears in no window', () => {
  // The completeness test above checks one direction — that everything renderable is claimed. This
  // is the other, and it is the direction that produces WRONG evidence rather than none.
  //
  // A retired combined Travel view was claimed by eight cases through a `Gathering` prefix while
  // being imported by nothing under `src/`. So a PR editing it selected eight frames as evidence
  // of a change none of them can contain.
  //
  // It also bounds pattern BREADTH, which nothing else did: the registry could be satisfied by
  // pasting one blanket `/^src\/ui\//` onto a single case, which reports zero unclaimed and passes.
  // An over-broad pattern now starts matching unrenderable components and fails here.
  const svelteFiles = [...tracked].filter((file) => file.endsWith('.svelte'));
  const phantom = [];

  for (const viewCase of VIEW_LAB_CASES) {
    for (const pattern of viewCase.sourceMatches) {
      const unrenderable = svelteFiles.filter(
        (file) => pattern.test(file) && !CLOSURE.has(file) && !EXPECTED_OUTSIDE_CLOSURE.has(file)
      );
      if (unrenderable.length > 0) {
        phantom.push(`${viewCase.id}: ${pattern} also matches ${unrenderable.join(', ')}`);
      }
    }
  }

  assert.deepEqual(
    phantom,
    [],
    'these patterns claim components that no mounted window renders, so a change to one selects ' +
      'frames that cannot contain it — unrelated evidence, which is worse than none. Narrow the ' +
      'pattern, or add the file to EXPECTED_OUTSIDE_CLOSURE if it is deliberately unrenderable:\n  ' +
      phantom.join('\n  ')
  );
});

test('every by-design exemption still resolves and is still in the closure', () => {
  for (const entry of UNCLAIMED_BY_DESIGN) {
    assert.ok(tracked.has(entry.path), `exemption "${entry.path}" matches no tracked file`);
    assert.ok(
      CLOSURE.has(entry.path),
      `exemption "${entry.path}" has left the mounted closure — delete it rather than leaving a ` +
        'standing waiver for a component no window renders'
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.trim().length > 20,
      `exemption "${entry.path}" needs a real reason, not a placeholder`
    );
  }
});

/**
 * Direct proof for the shared manager harness in `tests/helpers/manager/` (issue 1669).
 *
 * `tests/components/manager-mounted.test.js` already drives the store double, the locators and the
 * mount helpers 520 times over, so their happy paths need nothing here. What a green mounted run
 * cannot prove is everything this file asserts:
 *
 *   - the DERIVATION is complete. The compile list stopped being 161 hand-written paths and became
 *     a walk of the root's own import closure, and the failure mode it inherits is silent: a
 *     component the tree renders and the list omits does not fail the suite, it HANGS it, and
 *     `node --test` reports the blocked tests as `# cancelled` rather than `# fail`.
 *   - the two THROW paths that make an incomplete list loud. Neither is reached by a passing run,
 *     which is exactly the shape of guarantee that rots unobserved, so the closure check is
 *     mutated here and asserted to red.
 *   - `act` really waits. A settle helper that returned early would leave the mounted suite
 *     asserting the pre-click screen, and some of those assertions would still pass.
 *   - the locators resolve against the LIVE mount target rather than a captured element.
 *
 * `tests/helpers/` is outside the `npm test` glob and `tests/*.test.js` is inside it, so this file
 * runs and the helpers it imports do not run as suites of their own — the `sourceScan.js` /
 * `source-scan.test.js` arrangement, for the same reason.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  CLOSURE_FLOOR,
  MANAGER_ROOT,
  assertCompiledSvelteClosure,
  deriveManagerModuleClosure,
} from './helpers/manager/managerCompile.js';
import { act, createManagerQueries } from './helpers/manager/managerQueries.js';
import { repoRoot } from './helpers/sourceScan.js';
import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

const closure = deriveManagerModuleClosure();

// The positive control for everything below. The derivation is a graph walk, and the cheapest
// green available to a broken walk is an empty result that every later assertion then quantifies
// over vacuously. The floors are far under the measured 242 components and 149 modules, because
// the claim is "this reached the real tree", not "the tree is exactly this size".
test('the derivation reaches the real manager graph and splits it by what the tree does with it', () => {
  assert.ok(
    closure.components.length > 200,
    `expected the root's closure to reach the real component tree, got ${closure.components.length}`
  );
  assert.ok(
    closure.modules.length > 100,
    `expected the plain modules under it too, got ${closure.modules.length}`
  );
  assert.ok(closure.components.includes(MANAGER_ROOT), 'the root is compiled, not merely walked');
  assert.ok(
    closure.components.every((path) => path.endsWith('.svelte')),
    'a compiled entry is always a component'
  );
  assert.ok(
    closure.modules.every((path) => path.endsWith('.js')),
    'a copied entry is always a plain module'
  );
  const absent = [...closure.components, ...closure.modules].filter(
    (path) => !existsSync(resolve(repoRoot, path))
  );
  assert.deepEqual(absent, [], 'every derived path is a real file the compile can read');
});

// THE ACCEPTANCE CRITERION ITSELF, and its negative control.
//
// `assertCompiledSvelteClosure` re-walks the root with its own narrow matcher, so running it over
// the derived set asks the question the hand list could only answer by inspection: is this list
// closed over everything the mounted root's static graph reaches?
//
// The control is what makes the answer worth anything. Dropping one component and asserting the
// throw names it proves the check can red at all — a check that silently found nothing would pass
// this clause over an empty graph, which is the failure the walk exists to convert into a loud one.
test('the derived compile list is closed over the root graph, and the check can still red', () => {
  const compiled = new Set(closure.components);
  assert.doesNotThrow(() => assertCompiledSvelteClosure(compiled, MANAGER_ROOT));

  // A component with a PARENT, so dropping it is visible to a walk that starts at the root.
  const dropped = closure.components.find((path) => path !== MANAGER_ROOT);
  const before = compiled.size;
  assert.equal(compiled.delete(dropped), true, `the control never applied: ${dropped} was not in`);
  assert.equal(compiled.size, before - 1, 'exactly one entry was removed');

  assert.throws(
    () => assertCompiledSvelteClosure(compiled, MANAGER_ROOT),
    (error) => error.message.includes(dropped) && error.message.includes('imported by'),
    `dropping ${dropped} left the closure check green, so it is not checking anything`
  );
});

// The vacuity floor, on the one input that reaches it. A root the walk cannot read reaches exactly
// itself, and without this branch that empty walk reports a perfectly closed list.
test('a closure check that reaches almost nothing throws instead of reporting clean', () => {
  assert.throws(
    () => assertCompiledSvelteClosure(new Set(), 'src/ui/svelte/apps/manager/no-such-root.svelte'),
    /the compiled-closure walk reached only 1 components/
  );
  assert.ok(CLOSURE_FLOOR > 1, 'a floor of one would admit the empty walk it exists to reject');
});

test('a derived path that is not on disk is named rather than compiled into a hang', () => {
  assert.throws(
    () => deriveManagerModuleClosure('src/ui/svelte/apps/manager/no-such-root.svelte'),
    /no-such-root\.svelte is reached from .* but is not on disk/
  );
});

// `act` is the click-then-settle sequence the mounted suite runs ~900 times. The claim under test
// is the AWAIT: a handler that defers its work must have finished before `act` returns, or the
// assertion after it reads the pre-click screen.
test('act drains the microtasks a handler queued, which a bare click does not', async () => {
  let settled = 0;
  const element = {
    click() {
      Promise.resolve().then(() => {
        settled += 1;
      });
    },
  };

  element.click();
  assert.equal(settled, 0, 'the control: a bare click leaves the handler queued');

  await act(element);
  assert.equal(settled, 2, 'act waits, so both the queued handler and its own click have landed');
});

// The locators close over a GETTER, and that is load-bearing rather than stylistic: the suite
// remounts per case, so a captured element would go on addressing the previous screen and answer
// every question about it — passing, for the wrong tree.
test('a locator resolves against the live mount target, not the one it was created with', () => {
  setupDOM();
  try {
    const railWith = (label) => {
      const root = document.createElement('div');
      root.innerHTML =
        `<button class="manager-nav-button"><span class="manager-nav-label">${label}</span></button>`;
      return root;
    };

    let target = railWith('Recipes');
    const { navButton } = createManagerQueries(() => target);
    assert.ok(Boolean(navButton('Recipes')), 'the first screen resolves');

    target = railWith('Checks');
    assert.ok(Boolean(navButton('Checks')), 'and so does the screen that replaced it');
    assert.ok(!navButton('Recipes'), 'while the replaced screen is gone, rather than still found');
  } finally {
    teardownDOM();
  }
});

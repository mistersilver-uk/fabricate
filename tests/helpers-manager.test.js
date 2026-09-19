/** Direct proof for the shared manager harness in `tests/helpers/manager/` (issue 1669). */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  CLOSURE_FLOOR,
  MANAGER_ROOT,
  assertCompiledSvelteClosure,
  deriveManagerModuleClosure,
} from './helpers/manager/managerCompile.js';
import { act, createManagerQueries } from './helpers/manager/managerQueries.js';
import { repoRoot, stripComments } from './helpers/sourceScan.js';
import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

const closure = deriveManagerModuleClosure();

// The positive control for everything below.
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
    closure.modules.every((path) => /\.(?:js|json)$/.test(path)),
    'a copied entry is always a plain module or a JSON data file'
  );
  const absent = [...closure.components, ...closure.modules].filter(
    (path) => !existsSync(resolve(repoRoot, path))
  );
  assert.deepEqual(absent, [], 'every derived path is a real file the compile can read');
});

// THE ACCEPTANCE CRITERION ITSELF, and its negative control.
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

// `act` is the click-then-settle sequence the mounted suite runs ~900 times.
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

test('every relative import of a derived module is itself in the closure', () => {
  const inClosure = new Set([...closure.components, ...closure.modules]);
  const missing = [];
  for (const entry of inClosure) {
    const absolute = resolve(repoRoot, entry);
    const source = stripComments(readFileSync(absolute, 'utf8'));
    for (const [, specifier] of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"](\.[^'"\s]+)['"]/g)) {
      const child = relative(repoRoot, resolve(dirname(absolute), specifier)).replaceAll('\\', '/');
      if (!inClosure.has(child)) missing.push(`${entry} -> ${child}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    'the walk queues by extension, so a dependency it does not recognise compiles into a hang rather than a failure'
  );
});

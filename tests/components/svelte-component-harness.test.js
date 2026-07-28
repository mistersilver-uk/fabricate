import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CRAFTING_APP_COMPILED_MODULES,
  CRAFTING_APP_RAW_MODULES,
  assertClientSvelteReactivity,
  createMountedComponentHarness
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte';

function createRecipeBrowserHarness({ rawModules = CRAFTING_APP_RAW_MODULES, compiledModules = CRAFTING_APP_COMPILED_MODULES }) {
  return createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-svelte-harness-closure-',
    rawModules,
    compiledModules,
    componentPath
  });
}

describe('createMountedComponentHarness dependency validation', () => {
  it('reports the full importer chain for an omitted indirect raw import before component import', async () => {
    const harness = createRecipeBrowserHarness({
      rawModules: CRAFTING_APP_RAW_MODULES.filter((modulePath) => modulePath !== 'src/ui/svelte/util/craftingImageDefaults.js')
    });

    await assert.rejects(
      harness.setup(),
      (error) => {
        assert.match(
          error.message,
          /src\/ui\/svelte\/apps\/crafting\/RecipeBrowser\.svelte -> src\/ui\/svelte\/apps\/crafting\/RecipeListRow\.svelte -> src\/ui\/svelte\/apps\/crafting\/CraftingThumb\.svelte -> src\/ui\/svelte\/util\/craftingImageDefaults\.js/
        );
        assert.match(error.message, /rawModules/);
        return true;
      }
    );

    harness.teardown();
  });

  it('reports the full importer chain for an omitted indirect compiled component before component import', async () => {
    const harness = createRecipeBrowserHarness({
      compiledModules: CRAFTING_APP_COMPILED_MODULES.filter((modulePath) => modulePath !== 'src/ui/svelte/apps/crafting/CraftingThumb.svelte')
    });

    await assert.rejects(
      harness.setup(),
      (error) => {
        assert.match(
          error.message,
          /src\/ui\/svelte\/apps\/crafting\/RecipeBrowser\.svelte -> src\/ui\/svelte\/apps\/crafting\/RecipeListRow\.svelte -> src\/ui\/svelte\/apps\/crafting\/CraftingThumb\.svelte/
        );
        assert.match(error.message, /compiledModules/);
        return true;
      }
    );

    harness.teardown();
  });
});

/**
 * The `svelte/reactivity` export condition is the difference between a reactivity assertion
 * that can fail and one that cannot: without `browser`, `SvelteSet` IS `globalThis.Set`, so
 * a run outside `npm test` reports PASS on unfixed code. `installComponentTestGlobals` is
 * the chokepoint because all 59 mounted suites reach it, including the six travel/realm/party
 * suites that build their own harness instead of `createMountedComponentHarness`.
 */
const harnessUrl = pathToFileURL(resolve(repoRoot, 'tests/helpers/svelte-component-harness.js')).href;

// Each probe runs in a fresh process so the condition set under test is the process's own.
// The reactivity barrel is only ever EVALUATED here, never in the guard: its client build
// touches URLSearchParams at module scope, which teardownDOM removes from this process.
function probe(source, { browser }) {
  const conditions = browser ? ['--conditions=browser'] : [];
  return execFileSync(process.execPath, [...conditions, '--input-type=module', '-e', source], {
    encoding: 'utf8',
    cwd: repoRoot
  });
}

describe('assertClientSvelteReactivity', () => {
  it('passes under npm test, where SvelteSet is genuinely not globalThis.Set', () => {
    assert.doesNotThrow(() => assertClientSvelteReactivity());

    const probed = probe(
      `const { SvelteSet } = await import('svelte/reactivity');
       console.log(SvelteSet === globalThis.Set ? 'ALIASED' : 'DISTINCT');`,
      { browser: true }
    );
    assert.match(
      probed,
      /DISTINCT/,
      'the guard is pointless unless the client build really does supply a distinct SvelteSet'
    );
  });

  it('is what makes the server build detectable at all', () => {
    const probed = probe(
      `const { SvelteSet } = await import('svelte/reactivity');
       console.log(SvelteSet === globalThis.Set ? 'ALIASED' : 'DISTINCT');`,
      { browser: false }
    );
    assert.match(
      probed,
      /ALIASED/,
      'without the browser condition SvelteSet IS Set, so a reactivity assertion cannot fail'
    );
  });

  it('fails loudly from installComponentTestGlobals when the browser condition is missing', () => {
    const probed = probe(
      `const { installComponentTestGlobals } = await import(${JSON.stringify(harnessUrl)});
       try {
         installComponentTestGlobals();
         console.log('NO_THROW');
       } catch (error) {
         console.log(error.message);
       }`,
      { browser: false }
    );

    assert.match(probed, /svelte\/reactivity' resolved to/);
    assert.match(probed, /--conditions=browser/);
    assert.doesNotMatch(
      probed,
      /NO_THROW|document is not defined/,
      'the guard must run before the DOM globals, so the chokepoint reports the real cause'
    );
  });
});

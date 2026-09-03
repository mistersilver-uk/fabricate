import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CRAFTING_APP_COMPILED_MODULES,
  CRAFTING_APP_RAW_MODULES,
  assertClientSvelteReactivity,
  createMountedComponentHarness,
  rewriteClientImports
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
 * `rewriteClientImports` decides which specifier every `svelte` import in a compiled component
 * is resolved against, for every suite built on this harness. Getting it wrong is not a test
 * failure: an ES module that does not provide a named export fails to LINK, before the suite's
 * first test runs, so `node --test` reports `# cancelled N` with `# fail 0` and a gate reading
 * the fail count sees green. That is what issue 1185 was, and what a five-name allowlist routing
 * everything else to `svelte/internal/client` had rebuilt one import away from happening again.
 *
 * So the routing is asserted SEMANTICALLY — the specifier a name is routed to must really export
 * it — with the input derived from the installed Svelte rather than listed here, so a Svelte
 * release that adds an export is covered the day it lands instead of the day someone remembers.
 */
describe('rewriteClientImports', () => {
  it('routes every `svelte` export to a specifier that actually provides it', async () => {
    // Under the wrong condition set `svelte` is the SERVER build, whose export list is a
    // different set; this test would then be asserting about a module no mounted suite loads.
    assertClientSvelteReactivity();

    const exportedNames = Object.keys(await import('svelte')).filter((name) => name !== 'default');
    assert.ok(
      exportedNames.length > 5,
      `the installed Svelte reports only ${exportedNames.length} exports, which is fewer than the `
        + 'five-name allowlist this test replaced — read that as a broken probe, not a small API'
    );

    const rewritten = rewriteClientImports(`import { ${exportedNames.join(', ')} } from 'svelte';`);
    const routes = [...rewritten.matchAll(/import \{([^}]*)\} from ['"]([^'"]+)['"];/g)].flatMap(
      ([, names, specifier]) => names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name, specifier])
    );

    assert.deepEqual(
      routes.map(([name]) => name).sort(),
      [...exportedNames].sort(),
      'the rewrite must carry every imported name through exactly once, dropping and inventing none'
    );

    const loaded = new Map();
    for (const [name, specifier] of routes) {
      if (!loaded.has(specifier)) loaded.set(specifier, await import(specifier));
      assert.ok(
        loaded.get(specifier)[name] !== undefined,
        `rewriteClientImports routes '${name}' to '${specifier}', which does not export it. A `
          + `component importing '${name}' from 'svelte' would report every suite sharing this `
          + "harness as '# cancelled', never '# fail' — issue 1185's symptom, rebuilt."
      );
    }
  });

  it('appends `.js` to `.svelte` specifiers and rewrites nothing else', () => {
    // The compiler's own runtime import already names `svelte/internal/client`, and the bare
    // `svelte` line is the component's own. Pinned as whole text because the defect this guards
    // is a rewrite that fires where it should not.
    const compiled = [
      "import 'svelte/internal/disclose-version';",
      "import * as $ from 'svelte/internal/client';",
      "import { getContext, onDestroy, tick, untrack } from 'svelte';",
      "import Child from './Child.svelte';",
      'import Sibling from "../nested/Sibling.svelte";',
      "import { helper } from '../util/helper.js';"
    ].join('\n');

    assert.equal(
      rewriteClientImports(compiled),
      [
        "import 'svelte/internal/disclose-version';",
        "import * as $ from 'svelte/internal/client';",
        "import { getContext, onDestroy, tick, untrack } from 'svelte';",
        "import Child from './Child.svelte.js';",
        'import Sibling from "../nested/Sibling.svelte.js";',
        "import { helper } from '../util/helper.js';"
      ].join('\n'),
      'only `.svelte` specifiers move; the bare `svelte` import must survive intact and unsplit'
    );
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

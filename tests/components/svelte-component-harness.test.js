import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  CRAFTING_APP_COMPILED_MODULES,
  CRAFTING_APP_RAW_MODULES,
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
  it('rejects an omitted raw transitive import before component import', async () => {
    const harness = createRecipeBrowserHarness({
      rawModules: CRAFTING_APP_RAW_MODULES.filter((modulePath) => modulePath !== 'src/ui/svelte/util/foundryBridge.js')
    });

    await assert.rejects(
      harness.setup(),
      (error) => {
        assert.match(error.message, /src\/ui\/svelte\/apps\/crafting\/RecipeBrowser\.svelte/);
        assert.match(error.message, /\.\.\/\.\.\/util\/foundryBridge\.js/);
        assert.match(error.message, /src\/ui\/svelte\/util\/foundryBridge\.js/);
        assert.match(error.message, /rawModules/);
        return true;
      }
    );

    harness.teardown();
  });

  it('rejects an omitted compiled transitive component before component import', async () => {
    const harness = createRecipeBrowserHarness({
      compiledModules: CRAFTING_APP_COMPILED_MODULES.filter((modulePath) => modulePath !== 'src/ui/svelte/components/Pagination.svelte')
    });

    await assert.rejects(
      harness.setup(),
      (error) => {
        assert.match(error.message, /src\/ui\/svelte\/apps\/crafting\/RecipeBrowser\.svelte/);
        assert.match(error.message, /\.\.\/\.\.\/components\/Pagination\.svelte/);
        assert.match(error.message, /src\/ui\/svelte\/components\/Pagination\.svelte/);
        assert.match(error.message, /compiledModules/);
        return true;
      }
    );

    harness.teardown();
  });
});

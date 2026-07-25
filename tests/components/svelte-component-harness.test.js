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

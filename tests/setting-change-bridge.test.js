import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleFabricateSettingChange } from '../src/config/settingChangeBridge.js';

describe('handleFabricateSettingChange', () => {
  it('reloads systems and re-emits craftingSystemsChanged when the setting changed', () => {
    const emitted = [];
    const craftingSystemManager = { reload: () => true, getSystems: () => [{ id: 's1' }] };
    const handled = handleFabricateSettingChange('fabricate.craftingSystems', {
      craftingSystemManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.deepEqual(emitted, [['fabricate.craftingSystemsChanged', [{ id: 's1' }]]]);
  });

  it('reloads but does NOT re-emit when systems are unchanged (writing-client no-op)', () => {
    const emitted = [];
    let reloadCalls = 0;
    const craftingSystemManager = {
      reload: () => {
        reloadCalls += 1;
        return false;
      },
      getSystems: () => [],
    };
    const handled = handleFabricateSettingChange('fabricate.craftingSystems', {
      craftingSystemManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.equal(reloadCalls, 1, 'the manager is still reloaded');
    assert.equal(emitted.length, 0, 'no redundant hook re-emitted');
  });

  it('reloads recipes and re-emits recipesChanged with an external-action payload', () => {
    const emitted = [];
    const recipeManager = { reload: () => true, getRecipes: () => [{ id: 'r1' }] };
    handleFabricateSettingChange('fabricate.recipes', {
      recipeManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], 'fabricate.recipesChanged');
    assert.deepEqual(emitted[0][1], { action: 'external', recipes: [{ id: 'r1' }] });
  });

  it('ignores unrelated settings without touching the managers', () => {
    const emitted = [];
    let reloadCalls = 0;
    const handled = handleFabricateSettingChange('fabricate.gatheringEnvironments', {
      craftingSystemManager: {
        reload: () => {
          reloadCalls += 1;
          return true;
        },
        getSystems: () => [],
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, false);
    assert.equal(reloadCalls, 0);
    assert.equal(emitted.length, 0);
  });
});

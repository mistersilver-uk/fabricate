/** Every one of the six modes is accepted on read and write and is selectable (`resolution-modes`). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const availability = await import('../src/systems/resolutionModeAvailability.js');
const { importModeRefusal, modeChangeRefusal, RESOLUTION_MODES } = availability;
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');

const normalizedMode = (resolutionMode) =>
  new CraftingSystemManager({ getRecipes: () => [] })._normalizeSystem({ resolutionMode })
    .resolutionMode;

describe('the mode set', () => {
  it('accepts six modes and exports no selectable subset', () => {
    assert.deepEqual(RESOLUTION_MODES, [
      'simple',
      'routedByIngredients',
      'routedByCheck',
      'progressive',
      'alchemy',
      'iterative',
    ]);
    assert.equal('SELECTABLE_RESOLUTION_MODES' in availability, false);
    assert.equal('isResolutionModeSelectable' in availability, false);
  });

  it('refuses only an unknown token, and lets every mode and legacy alias through', () => {
    assert.equal(modeChangeRefusal('bogus'), 'resolutionModeUnknown');
    assert.equal(modeChangeRefusal('constructor'), 'resolutionModeUnknown');
    for (const token of [...RESOLUTION_MODES, 'routed', 'mapped', 'tiered', 'cauldron']) {
      assert.equal(modeChangeRefusal(token), null, token);
    }
  });
});

describe('the normalizer accepts iterative and keeps every alias', () => {
  it('persists iterative', () => {
    assert.equal(normalizedMode('iterative'), 'iterative');
  });

  it('reads the legacy aliases and an unknown token as before', () => {
    assert.deepEqual(
      ['cauldron', 'mapped', 'routed', 'tiered', 'unknown-mode', undefined, 'toString'].map(
        normalizedMode
      ),
      [
        'alchemy',
        'routedByIngredients',
        'routedByIngredients',
        'routedByCheck',
        'simple',
        'simple',
        'simple',
      ]
    );
  });
});

/** An importer over recording doubles: every write and progress emit lands in `writes`. */
function recordingImporter() {
  const writes = [];
  const record =
    (name) =>
    async (...args) => {
      writes.push(name);
      return name.endsWith('System') ? { id: args[0]?.id ?? 'sys-new', ...args[0] } : undefined;
    };
  const systemManager = {
    getSystems: () => [],
    getSystem: () => null,
    createSystem: record('createSystem'),
    updateSystem: record('updateSystem'),
  };
  const recipeManager = {
    getRecipe: () => null,
    getRecipes: () => [],
    createRecipe: record('createRecipe'),
    updateRecipe: record('updateRecipe'),
    save: record('save'),
  };
  const importer = new CompendiumImporter(systemManager, recipeManager, {
    isGM: () => true,
    getSetting: () => undefined,
    setSetting: record('setSetting'),
    reportProgress: (update) => {
      writes.push(`progress:${update.phase}`);
    },
  });
  return { importer, writes };
}

const ITERATIVE_PAYLOAD = Object.freeze({
  system: { id: 'sys-it', name: 'Forge', resolutionMode: 'iterative', components: [] },
  recipes: [],
});

describe('the importer', () => {
  it('refuses an iterative block newer than the build before any write or progress toast', async () => {
    const { importer, writes } = recordingImporter();
    const payload = {
      system: { ...ITERATIVE_PAYLOAD.system, resolutionMode: 'simple', iterative: { version: 2 } },
      recipes: [],
    };
    await assert.rejects(importer.importFromPackData(payload), (error) => {
      assert.equal(error.reason, 'iterativeVersionUnsupported');
      assert.equal(
        error.message,
        "This export's iterative settings were made by a newer version of Fabricate."
      );
      return true;
    });
    assert.deepEqual(writes, []);
  });

  it('imports an iterative payload, ignoring a stale selectableModes option', async () => {
    for (const options of [undefined, { selectableModes: ['simple'] }]) {
      const { importer, writes } = recordingImporter();
      const summary = await importer.importFromPackData(ITERATIVE_PAYLOAD, options);
      assert.equal(summary.system.created, true);
      assert.ok(writes.includes('createSystem'), writes.join(', '));
    }
  });

  it('game.fabricate.importFromPack forwards a stale selectableModes and still imports', async () => {
    const { importer, writes } = recordingImporter();
    const { bindFabricateGlobal } = await import('../src/bootstrap/publicApi.js');
    bindFabricateGlobal({ compendiumImporter: importer }, {});
    const summary = await globalThis.game.fabricate.importFromPack(ITERATIVE_PAYLOAD, {
      selectableModes: ['simple'],
    });
    assert.equal(summary.system.created, true);
    assert.ok(writes.includes('createSystem'), writes.join(', '));
  });

  it('answers null for every mode, a legacy alias and an unknown token', () => {
    for (const resolutionMode of [...RESOLUTION_MODES, 'tiered', 'unknown-mode', undefined]) {
      assert.equal(importModeRefusal({ resolutionMode }), null, String(resolutionMode));
    }
    assert.equal(importModeRefusal({ resolutionMode: 'simple', iterative: { version: 1 } }), null);
  });
});

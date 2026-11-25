/** Iterative mode is accepted on read and write but not selectable or importable yet (`resolution-modes`). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const {
  importModeRefusal,
  isResolutionModeSelectable,
  modeChangeRefusal,
  RESOLUTION_MODES,
  SELECTABLE_RESOLUTION_MODES,
} = await import('../src/systems/resolutionModeAvailability.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');

const normalizedMode = (resolutionMode) =>
  new CraftingSystemManager({ getRecipes: () => [] })._normalizeSystem({ resolutionMode })
    .resolutionMode;

describe('the selectable set', () => {
  it('accepts six modes and offers every one but iterative', () => {
    assert.deepEqual(RESOLUTION_MODES, [
      'simple',
      'routedByIngredients',
      'routedByCheck',
      'progressive',
      'alchemy',
      'iterative',
    ]);
    assert.ok(!SELECTABLE_RESOLUTION_MODES.includes('iterative'));
    assert.ok(!isResolutionModeSelectable('iterative'));
    assert.ok(isResolutionModeSelectable('alchemy'));
  });

  it('honours an injected set in both predicates', () => {
    assert.ok(isResolutionModeSelectable('iterative', RESOLUTION_MODES));
    assert.equal(modeChangeRefusal('iterative', RESOLUTION_MODES), null);
    assert.ok(!isResolutionModeSelectable('alchemy', ['simple']));
    assert.equal(modeChangeRefusal('alchemy', ['simple']), 'resolutionModeUnavailable');
  });

  it('refuses an unselectable mode and an unknown token, and lets a legacy alias through', () => {
    assert.equal(modeChangeRefusal('iterative'), 'resolutionModeUnavailable');
    assert.equal(modeChangeRefusal('bogus'), 'resolutionModeUnknown');
    assert.equal(modeChangeRefusal('constructor'), 'resolutionModeUnknown');
    for (const token of ['routed', 'mapped', 'tiered', 'cauldron', 'simple']) {
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

const ITERATIVE_PAYLOAD = {
  system: { id: 'sys-it', name: 'Forge', resolutionMode: 'iterative', components: [] },
  recipes: [],
};

describe('the importer refuses before any write or progress toast', () => {
  const cases = {
    resolutionModeUnavailable: {
      payload: ITERATIVE_PAYLOAD,
      message:
        'This export uses the Iterative resolution mode, which this version of Fabricate cannot import yet.',
    },
    iterativeVersionUnsupported: {
      payload: {
        system: {
          ...ITERATIVE_PAYLOAD.system,
          resolutionMode: 'simple',
          iterative: { version: 2 },
        },
        recipes: [],
      },
      message: "This export's iterative settings were made by a newer version of Fabricate.",
    },
  };

  for (const [reason, { payload, message }] of Object.entries(cases)) {
    it(`refuses ${reason} with plain English and no write`, async () => {
      const { importer, writes } = recordingImporter();
      await assert.rejects(importer.importFromPackData(payload), (error) => {
        assert.equal(error.reason, reason);
        assert.equal(error.message, message);
        assert.ok(!error.message.includes(reason), 'the message never shows the reason code');
        return true;
      });
      assert.deepEqual(writes, []);
    });
  }

  it('imports the same iterative payload when the full mode set is injected', async () => {
    const { importer, writes } = recordingImporter();
    const summary = await importer.importFromPackData(ITERATIVE_PAYLOAD, {
      selectableModes: RESOLUTION_MODES,
    });
    assert.equal(summary.system.created, true);
    assert.ok(writes.includes('createSystem'), writes.join(', '));
  });

  it('answers null for a selectable mode, a legacy alias and an unknown token', () => {
    for (const resolutionMode of ['simple', 'tiered', 'unknown-mode', undefined]) {
      assert.equal(importModeRefusal({ resolutionMode }), null, String(resolutionMode));
    }
    assert.equal(importModeRefusal({ resolutionMode: 'simple', iterative: { version: 1 } }), null);
  });
});

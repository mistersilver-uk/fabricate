/** The Checks Studio's route-exit prompt, and the plural Save it belongs to (issue 1096). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import {
  cloneProgressiveCheck,
  cloneRoutedCheck,
  cloneSimpleCheck,
} from '../src/ui/svelte/apps/manager/checks/checkDraftClone.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from './helpers/adminStoreServices.js';

const repoRoot = resolve(import.meta.dirname, '..');

/**
 * A store on the SHARED adminStore service fixture, with only the two dialog seams this prompt can
 * take overridden.
 */
function makeStore({ choiceDialog, confirmDialog, localize } = {}) {
  const calls = [];
  const overrides = {
    localize: localize ?? ((key) => key),
    confirmDialog: (options) => {
      calls.push(['confirmDialog', options]);
      return confirmDialog ? confirmDialog(options) : true;
    },
  };
  if (choiceDialog !== null) {
    overrides.choiceDialog = (options) => {
      calls.push(['choiceDialog', options]);
      return choiceDialog ? choiceDialog(options) : 'save';
    };
  }
  const services = createServices(makeSystem(), [], [], overrides);
  // `null` means "this world has no three-way dialog at all", which is the degraded path the
  // shared helper's own fallback branch answers — so the seam has to be genuinely ABSENT,
  // not a stub returning undefined.
  if (choiceDialog === null) delete services.choiceDialog;
  return { store: createAdminStore(services), calls };
}

describe('confirmDiscardDirtyChecksDraft', () => {
  it('is exported by the store at all', () => {
    const { store } = makeStore();
    assert.equal(
      typeof store.confirmDiscardDirtyChecksDraft,
      'function',
      'the manager root calls this through the store; an unexported one is a silent no-prompt'
    );
  });

  it('is the THREE-WAY variant, by its return shape', async () => {
    // The distinction is not cosmetic.
    for (const action of ['save', 'discard', 'cancel']) {
      const { store } = makeStore({ choiceDialog: () => action });
      assert.equal(await store.confirmDiscardDirtyChecksDraft(['Crafting']), action);
    }
  });

  it('coerces an unknown or absent choice to cancel, never to discard', async () => {
    for (const answer of [undefined, null, 'whatever']) {
      const { store } = makeStore({ choiceDialog: () => answer });
      assert.equal(
        await store.confirmDiscardDirtyChecksDraft(['Crafting']),
        'cancel',
        'the safe default keeps the edit; defaulting to discard would destroy it'
      );
    }
  });

  it('still answers in that vocabulary with no three-way dialog available', async () => {
    // The no-`choiceDialog` fallback is what makes "built on the shared helper IS the
    // three-way prompt" true by construction rather than by convention: even the degraded
    // path returns `'discard' | 'cancel'`, never a boolean the caller would read as truthy.
    const { store: yes } = makeStore({ choiceDialog: null, confirmDialog: () => true });
    assert.equal(await yes.confirmDiscardDirtyChecksDraft(['Crafting']), 'discard');
    const { store: no } = makeStore({ choiceDialog: null, confirmDialog: () => false });
    assert.equal(await no.confirmDiscardDirtyChecksDraft(['Crafting']), 'cancel');
  });

  it('NAMES the dirty activities in the prompt', async () => {
    // The GM may be standing on Gathering while the unsaved edit is on Crafting, and this prompt is
    // the last thing they see before it is discarded.
    const { store, calls } = makeStore({
      // Localization is stubbed to the FALLBACK path so the assertion reads the real authored
      // sentence rather than a key echoed back.
      localize: () => '',
    });
    await store.confirmDiscardDirtyChecksDraft(['Crafting', 'Gathering']);
    const [, options] = calls.find(([kind]) => kind === 'choiceDialog');
    assert.match(options.content, /Crafting, Gathering/);
    assert.ok(
      !options.content.includes('{activities}'),
      'the placeholder must be substituted, not rendered'
    );
    assert.deepEqual(
      options.choices.map((choice) => choice.action),
      ['save', 'discard', 'cancel']
    );
  });

  it('substitutes into the LOCALIZED sentence, not only the fallback', async () => {
    const { store, calls } = makeStore({
      localize: (key) =>
        key === 'FABRICATE.Admin.Manager.Checks.DiscardDirtyContent'
          ? 'Unsaved: {activities}. Continue?'
          : '',
    });
    await store.confirmDiscardDirtyChecksDraft(['Salvage']);
    const [, options] = calls.find(([kind]) => kind === 'choiceDialog');
    assert.match(options.content, /Unsaved: Salvage\./);
  });
});

describe('the Checks header Save is PLURAL', () => {
  const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
  const checks = en.FABRICATE.Admin.Manager.Checks;

  it('says "Save checks", because one press persists every dirty activity', () => {
    // It was the singular "Save check", which was accurate while Save persisted only the
    // active sub-tab and is a lie now.
    assert.equal(checks.Save, 'Save checks');
  });

  it('declares the discard-prompt copy the store reaches for', () => {
    assert.equal(typeof checks.DiscardDirtyContent, 'string');
    assert.match(checks.DiscardDirtyContent, /\{activities\}/, 'it carries the slot');
  });
});

describe('a false situational-bonus offer survives the Studio round trip (issue 2005)', () => {
  const SLOTS = [
    ['craftingCheck', 'simple', cloneSimpleCheck, 'saveCraftingCheckSimple'],
    ['craftingCheck', 'routed', cloneRoutedCheck, 'saveCraftingCheckRouted'],
    ['craftingCheck', 'progressive', cloneProgressiveCheck, 'saveCraftingCheckProgressive'],
    ['salvageCraftingCheck', 'simple', cloneSimpleCheck, 'saveSalvageCheckSimple'],
    ['salvageCraftingCheck', 'routed', cloneRoutedCheck, 'saveSalvageCheckRouted'],
    ['salvageCraftingCheck', 'progressive', cloneProgressiveCheck, 'saveSalvageCheckProgressive'],
    ['gatheringCraftingCheck', 'routed', cloneRoutedCheck, 'saveGatheringCheckRouted'],
    ['gatheringCraftingCheck', 'progressive', cloneProgressiveCheck, 'saveGatheringCheckProgressive'],
  ];

  async function realStore() {
    globalThis.foundry = { utils: { randomID: () => 'rid', deepClone: structuredClone } };
    globalThis.game = {
      user: { id: 'gm', isGM: true },
      system: { id: 'generic' },
      actors: [],
      settings: { get: () => undefined, set: async () => {} },
    };
    globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
    const manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
    manager.initialized = true;
    manager.save = async () => {};
    const off = { rollFormula: '1d20', offerSituationalBonus: false };
    manager.systems.set(
      'sys1',
      manager._normalizeSystem({
        id: 'sys1',
        name: 'Offer',
        resolutionMode: 'simple',
        craftingCheck: { simple: off, routed: off, progressive: off },
        salvageCraftingCheck: { simple: off, routed: off, progressive: off },
        gatheringCraftingCheck: { routed: off, progressive: off },
      })
    );
    const store = createAdminStore(
      createServices(manager.getSystem('sys1'), [], [], { getCraftingSystemManager: () => manager })
    );
    await store.selectSystem('sys1');
    return { manager, store };
  }

  for (const [activity, slot, clone, save] of SLOTS) {
    it(`${activity}.${slot}: clone, unrelated edit, save and reseed keep it off`, async () => {
      const { manager, store } = await realStore();
      const draft = clone(manager.getSystem('sys1')[activity][slot]);
      assert.equal(draft.offerSituationalBonus, false, 'the clone keeps it');
      draft.rollFormula = '2d6';
      await store[save](draft);
      const saved = manager.getSystem('sys1')[activity][slot];
      assert.equal(saved.rollFormula, '2d6', 'the unrelated edit landed');
      assert.equal(saved.offerSituationalBonus, false, 'the save keeps it');
      const reseeded = clone(saved);
      assert.equal(reseeded.offerSituationalBonus, false, 'the reseed keeps it');
      assert.equal(JSON.stringify(reseeded), JSON.stringify(draft), 'the saved draft is clean');
    });
  }
});

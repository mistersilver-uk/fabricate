/**
 * The Checks Studio's route-exit prompt, and the plural Save it belongs to (issue 1096).
 *
 * The four activity drafts moved ABOVE the four routes, which is what makes this prompt
 * necessary in the first place: under the old tab model a switch between activities never
 * left the surface, so an unsaved edit could not walk out of the building. It can now, and
 * one click on `Components` is all it takes.
 *
 * None of this was reachable from any existing suite. `confirmDiscardDirtyChecksDraft` could
 * be deleted from the store's returned object with `npm test` green, and `Checks.Save` could
 * revert to the singular with nothing noticing — both proven by mutation before this file
 * was written, and both are exactly the class of gap the store's allowlist projections make
 * invisible.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from './helpers/adminStoreServices.js';

const repoRoot = resolve(import.meta.dirname, '..');

/**
 * A store on the SHARED adminStore service fixture, with only the two dialog seams this
 * prompt can take overridden. The shared fixture rather than a bespoke one because the store
 * reads a good deal more than dialogs at construction, and because a fresh copy of that
 * factory is exactly the duplication `tests/helpers/adminStoreServices.js` exists to remove.
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
    // The distinction is not cosmetic. The boolean `confirmDiscardDirtyToolsDraft` is the one
    // sibling that does NOT use the shared helper, and copying its shape here would drop the
    // "save and continue" branch entirely — the only branch that keeps the GM's work.
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
    // The GM may be standing on Gathering while the unsaved edit is on Crafting, and this
    // prompt is the last thing they see before it is discarded. A prompt that said only "the
    // checks" would discard work on a route they never opened.
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

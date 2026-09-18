/** The STANDALONE component editor window (`ComponentEditorRoot`), mounted (issue 1036). */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { stepMigratedNumberField } from '../helpers/numericKeyboardStep.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-editor-root-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/componentEditor.js',
    'src/ui/model/essenceValidation.js',
    'src/utils/scalars.js',
  ],
  // The essence quantity control is the shared `Stepper` (issue 1050). Omitting it here
  // does not fail this suite — it HANGS it, reported as `# cancelled`.
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/ComponentEditorRoot.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/ComponentEditorRoot.svelte',
});

/** `fire` disabled and carried, `earth` enabled and uncarried, `air` disabled and uncarried. */
const MIXED_ESSENCES = [
  { id: 'air', name: 'Air', icon: 'fas fa-wind', enabled: false, quantity: 0 },
  { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 0 },
  { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false, quantity: 3 },
];

function editorState(essenceOptions) {
  return {
    itemId: 'comp-1',
    itemName: 'Dragon Scale',
    hintKey: 'FABRICATE.Admin.Items.Editor.HintEssencesOnly',
    showTags: false,
    showEssences: true,
    hasEditableFields: true,
    tagOptions: [],
    essenceOptions,
  };
}

function essenceNames(target) {
  return [...target.querySelectorAll('.essence-name')].map((node) => node.textContent.trim());
}

describe('1036 ComponentEditorRoot — the add-new essence offer', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('withholds a disabled essence, and keeps one this component already carries', async () => {
    const target = await harness.mount({ editorState: editorState(MIXED_ESSENCES) });

    const rendered = essenceNames(target);
    assert.ok(
      rendered.includes('Earth'),
      'negative control: the ENABLED essence IS offered, so the grid is not simply empty'
    );
    assert.ok(
      rendered.includes('Fire'),
      'a disabled essence with an authored quantity stays visible — the offer withholds, the DATA never does'
    );
    assert.ok(
      !rendered.includes('Air'),
      'a disabled essence with NO authored quantity is withheld from the offer'
    );
    harness.remount();
  });

  it('withholds nothing at all when every essence is enabled', async () => {
    const target = await harness.mount({
      editorState: editorState(
        MIXED_ESSENCES.map((essence) => ({ ...essence, enabled: true, quantity: 0 }))
      ),
    });

    // The negative control for the whole projection.
    assert.deepEqual(essenceNames(target).sort(), ['Air', 'Earth', 'Fire']);
    harness.remount();
  });

  /**
   * Mount the editor, drive the Earth quantity field with `edit`, save, and report the saved
   * per-essence quantities.
   *
   * @param {(input: HTMLInputElement) => void} edit
   * @returns {Promise<Map<string, number>>} saved quantity by essence id
   */
  async function savedQuantitiesAfterEditingEarth(edit) {
    const saved = [];
    const target = await harness.mount({
      editorState: editorState(MIXED_ESSENCES),
      onSave: (payload) => saved.push(payload),
    });

    edit(
      [...target.querySelectorAll('.fab-stepper-input')].at(essenceNames(target).indexOf('Earth'))
    );
    target.querySelector('.save-btn').click();
    await Promise.resolve();
    harness.remount();

    return new Map(saved.at(-1).essenceOptions.map((option) => [option.id, option.quantity]));
  }

  it('saves the WHOLE draft, so an unrelated edit does not delete the disabled quantity', async () => {
    const byId = await savedQuantitiesAfterEditingEarth((input) => {
      input.value = '2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    assert.equal(byId.get('earth'), 2, 'the edit lands');
    assert.equal(
      byId.get('fire'),
      3,
      'and the withheld-from-the-offer disabled essence keeps its authored quantity'
    );
    assert.equal(
      byId.get('air'),
      0,
      'the uncarried disabled essence is still in the payload, at zero, so nothing is lost either'
    );
  });

  // Issue 1050, Phase 1's keyboard non-regression entry. This card used to hand-roll its own
  // `−`/`+` pair around a bare `type="number"`; folding it onto `Stepper` had to keep the keyboard
  // path, which is native `<input type="number">` behaviour rather than anything either component
  // implements. `stepUp()` throws on a non-steppable input, so a "fix" that reached for
  // `type="text"` to hide the spinner fails here instead of silently shipping a click-only card.
  it('still steps an essence quantity from the keyboard, and saves the stepped value', async () => {
    const byId = await savedQuantitiesAfterEditingEarth((input) => {
      assert.equal(
        stepMigratedNumberField(input, 'up', 'the Earth quantity'),
        '1',
        'ArrowUp steps the quantity'
      );
    });

    assert.equal(byId.get('earth'), 1, 'and the keyboard-stepped value reaches the saved draft');
  });
});

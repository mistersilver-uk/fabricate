/**
 * The STANDALONE component editor window (`ComponentEditorRoot`), mounted (issue 1036).
 *
 * It reaches the same whitelist rebuild the in-manager editor does — `handleSave` hands its
 * essence draft straight to `buildComponentEditorUpdates`, which builds `updates.essences`
 * SOLELY from those rows — so the add-new offer rule has to hold here too, and for the same
 * reason. This window had no mounted coverage at all before: the only test naming it
 * (`component-editor-layout.test.js`) scans its source text.
 *
 * Criteria 2 and 18. Each assertion carries its negative control, because a filter that
 * filters nothing passes the positive half of both.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-editor-root-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/componentEditor.js',
    'src/utils/essenceValidation.js',
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

    // The negative control for the whole projection: flip the one field and all three come
    // back. Without this, "Air is absent" could be measuring anything.
    assert.deepEqual(essenceNames(target).sort(), ['Air', 'Earth', 'Fire']);
    harness.remount();
  });

  it('saves the WHOLE draft, so an unrelated edit does not delete the disabled quantity', async () => {
    const saved = [];
    const target = await harness.mount({
      editorState: editorState(MIXED_ESSENCES),
      onSave: (payload) => saved.push(payload),
    });

    const earthInput = [...target.querySelectorAll('.fab-stepper-input')].at(
      essenceNames(target).indexOf('Earth')
    );
    earthInput.value = '2';
    earthInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('.save-btn').click();
    await Promise.resolve();

    const byId = new Map(saved.at(-1).essenceOptions.map((option) => [option.id, option.quantity]));
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
    harness.remount();
  });
});

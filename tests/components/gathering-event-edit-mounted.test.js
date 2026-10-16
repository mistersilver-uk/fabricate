/** The gathering event editor's identity art, MOUNTED (issue 1522). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const { DEFAULT_GATHERING_EVENT_IMG } = await import('../../src/gatheringImageDefaults.js');

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITOR_PATH = 'src/ui/svelte/apps/manager/GatheringEventEditView.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-event-edit-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/util/sceneImages.js',
  ],
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'src/ui/svelte/components/ArtPicker.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    EDITOR_PATH,
  ],
  componentPath: EDITOR_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const tileOf = (root) =>
  root.querySelector(':scope [data-gathering-event-core-editor] .fab-art-picker-tile');

/** Mount the editor on one event, recording every `onUpdateEvent` patch and each picker open. */
async function mountEvent(event, onPickImagePath) {
  const updates = [];
  const root = await harness.mount({
    event: { id: 'event-squall', name: 'Squall', dropRate: 10, ...event },
    onPickImagePath,
    onUpdateEvent: (patch) => {
      updates.push(patch);
    },
  });
  return { root, updates, tile: tileOf(root) };
}

describe('the gathering event art picker (issue 1522)', () => {
  it('draws the stored art, or the default event art when none is stored', async () => {
    for (const [img, expected] of [
      ['icons/squall.webp', 'icons/squall.webp'],
      ['', DEFAULT_GATHERING_EVENT_IMG],
    ]) {
      const { tile } = await mountEvent({ img }, async () => null);
      assert.equal(tile.getAttribute('aria-label'), 'Choose event image');
      assert.equal(tile.querySelector('img').getAttribute('src'), expected);
      assert.ok(Boolean(tile.querySelector('.fa-pen')), 'the art carries its edit affordance');
      harness.remount();
    }
  });

  it('opens the host file picker on the stored art and writes the chosen path', async () => {
    const opened = [];
    const { tile, updates } = await mountEvent({ img: 'icons/squall.webp' }, async (current) => {
      opened.push(current);
      return 'icons/picked.webp';
    });
    assert.equal(tile.disabled, false, 'a host with a file picker can open it');
    tile.click();
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(opened, ['icons/squall.webp']);
    assert.deepEqual(updates, [{ img: 'icons/picked.webp' }]);
  });

  it('is disabled, and writes nothing, when the host has no file picker', async () => {
    const { tile, updates } = await mountEvent({ img: 'icons/squall.webp' }, null);
    assert.equal(tile.disabled, true);
    tile.click();
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(updates, []);
  });
});

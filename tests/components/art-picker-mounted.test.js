/** `ArtPicker`, identity art picked as a picture (issue 1522). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { defineStructureContract } from '../helpers/structureContract.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PRIMITIVE = 'src/ui/svelte/components/ArtPicker.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-art-picker-',
  rawModules: [],
  compiledModules: [PRIMITIVE],
  componentPath: PRIMITIVE,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const ART = 'icons/environment/wilderness/cave-entrance-mountain.webp';
const tileOf = (root) => root.querySelector('.fab-art-picker-tile');

describe('ArtPicker (mounted) — filled, empty and locked', () => {
  // The caller owns Foundry's picker dialog, so the primitive names neither it nor its namespace.
  defineStructureContract('names neither Foundry nor its file picker', PRIMITIVE, {
    namesNo: ['FilePicker', 'foundry'],
  });

  it('mounts and picks with no `foundry` global defined', async () => {
    assert.equal(typeof globalThis.foundry, 'undefined', 'this suite defines no `foundry` global');
    let picks = 0;
    const root = await harness.mount({ art: ART, onPick: () => (picks += 1) });
    tileOf(root).click();
    assert.equal(picks, 1);
  });

  it('draws filled art with a pencil, and never the stored path', async () => {
    const root = await harness.mount({ art: ART, ariaLabel: 'Choose task image' });
    const tile = tileOf(root);
    assert.equal(tile.tagName, 'BUTTON');
    assert.equal(tile.getAttribute('aria-label'), 'Choose task image');
    assert.equal(tile.querySelector('img').getAttribute('src'), ART);
    assert.ok(Boolean(tile.querySelector('.fa-pen')), 'the filled art carries its edit affordance');
    assert.ok(!tile.classList.contains('is-empty'));
    assert.ok(!root.textContent.includes(ART), 'the path is an implementation detail');
    assert.ok(!root.textContent.includes('cave-entrance'), 'not even its file name renders');
  });

  it('draws the empty state as a dashed slot with no image and no glyph', async () => {
    const root = await harness.mount({ art: '', ariaLabel: 'Choose depleted marker image' });
    const tile = tileOf(root);
    assert.equal(tile.tagName, 'BUTTON');
    assert.ok(tile.classList.contains('is-empty'), 'the empty slot is the dashed variant');
    assert.ok(!tile.querySelector('img'), 'an empty slot draws no image');
    assert.ok(!tile.querySelector('.fa-image'), 'the retired placeholder glyph is gone');
  });

  it('calls onPick from filled and empty alike, and `disabled` blocks it', async () => {
    for (const art of [ART, '']) {
      let picks = 0;
      const root = await harness.mount({ art, onPick: () => (picks += 1) });
      tileOf(root).click();
      assert.equal(picks, 1, `a click on the ${art ? 'filled' : 'empty'} tile picks`);
      await harness.setProps({ disabled: true });
      assert.equal(tileOf(root).disabled, true);
      tileOf(root).click();
      assert.equal(picks, 1, 'a disabled tile does not pick');
      harness.remount();
    }
  });

  it('draws locked art as a named image with a padlock and no button', async () => {
    let picks = 0;
    const root = await harness.mount({
      art: ART,
      locked: true,
      lockedLabel: 'Image provided by the linked scene',
      lockedHint: 'Unlink the scene to choose a custom image.',
      onPick: () => (picks += 1),
    });
    const tile = tileOf(root);
    assert.equal(tile.getAttribute('role'), 'img');
    assert.equal(tile.getAttribute('aria-label'), 'Image provided by the linked scene');
    assert.equal(tile.getAttribute('title'), 'Unlink the scene to choose a custom image.');
    assert.ok(Boolean(tile.querySelector('.fa-lock')), 'locked art carries a padlock');
    assert.ok(!tile.querySelector('.fa-pen'), 'and no edit affordance');
    assert.equal(root.querySelectorAll('button').length, 0, 'locked art is not a control');
    tile.click();
    assert.equal(picks, 0);
  });

  it('renders the visible clear button under filled art only, and it calls onClear', async () => {
    let clears = 0;
    const props = { art: ART, onClear: () => (clears += 1), clearLabel: 'Remove image' };
    const root = await harness.mount(props);
    const clear = root.querySelector('.fab-art-picker-clear');
    assert.ok(Boolean(clear), 'filled art with onClear offers the clear action');
    assert.equal(clear.textContent.trim(), 'Remove image', 'the clear action is visible text');
    assert.equal(clear.dataset.keyboardFocus, 'true');
    clear.click();
    assert.equal(clears, 1);
    await harness.setProps({ art: '' });
    assert.ok(!root.querySelector('.fab-art-picker-clear'), 'an empty slot has nothing to clear');
  });

  it('lands pickProps and clearProps on their buttons, and class and rest on the root', async () => {
    let menus = 0;
    const root = await harness.mount({
      art: ART,
      onClear: () => {},
      clearLabel: 'Remove image',
      class: 'manager-task-art',
      'data-art-root': '',
      pickProps: { 'data-recipe-field': 'img', oncontextmenu: () => (menus += 1) },
      clearProps: { 'data-art-clear': '' },
    });
    const picker = root.querySelector('.fab-art-picker');
    assert.ok(picker.classList.contains('manager-task-art'), 'the extra class joins the root');
    assert.ok(picker.hasAttribute('data-art-root'), 'rest lands on the root');
    const tile = tileOf(root);
    assert.equal(tile.dataset.recipeField, 'img');
    assert.equal(tile.dataset.keyboardFocus, 'true');
    tile.dispatchEvent(new globalThis.MouseEvent('contextmenu', { bubbles: true }));
    assert.equal(menus, 1, 'a handler in pickProps is wired');
    assert.ok(root.querySelector('.fab-art-picker-clear').hasAttribute('data-art-clear'));
  });
});

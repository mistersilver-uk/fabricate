import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssencePreviewRow,
  SAMPLE_COMPONENT_IMAGE,
} from '../../src/ui/svelte/util/essencePreviewRow.js';
import { GENERIC_ITEM_IMAGE } from '../../src/ui/svelte/util/craftingImageDefaults.js';

// The exact set of top-level keys `InventoryListingBuilder._buildEssenceRows` emits — the
// contract `InventoryItemCard` reads. Both preview rows share this shape so the card renders
// them the same way it renders a real owned row. Kept in lockstep with
// tests/inventory-listing-builder.test.js.
const EXPECTED_KEYS = [
  'key',
  'componentId',
  'systemId',
  'systemName',
  'name',
  'img',
  'icon',
  'colorToken',
  'tags',
  'tier',
  'isEssenceSource',
  'isTool',
  'broken',
  'salvage',
  'totalQuantity',
  'sources',
  'essences',
  'usedBy',
  'requiredFor',
  'producedBy',
  'contributors',
];

const FIRE = { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: '--fab-tag-mauve' };

test('both rows carry exactly the builder essence-row keys', () => {
  const { essence, component } = buildEssencePreviewRow(FIRE, { sampleComponentName: 'Ember Ash' });
  for (const [label, row] of [
    ['essence tile', essence],
    ['carrying component', component],
  ]) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [...EXPECTED_KEYS].sort(),
      `${label} row is shaped like the builder emits`
    );
  }
});

test('the essence-tile row is an essence SOURCE with a null image so the card renders its glyph', () => {
  const { essence } = buildEssencePreviewRow(FIRE);
  assert.equal(essence.isEssenceSource, true);
  assert.equal(essence.img, null, 'no artwork: the card routes to the essence-glyph tile');
  assert.equal(essence.icon, 'fas fa-fire', "the essence's own authored glyph");
  assert.equal(essence.name, 'Fire');
  assert.equal(essence.componentId, 'fire');
  assert.equal(
    essence.colorToken,
    '--fab-tag-mauve',
    "the essence's chosen colour so the mounted tile tints its glyph identically to the player app"
  );
  // The preview owns one copy — no count the store cannot produce is invented.
  assert.equal(essence.totalQuantity, 1);
  assert.deepEqual(essence.essences, [], 'an essence source carries no pips of its own');
});

test('an essence with no chosen colour yields a null colorToken (the tile keeps the accent)', () => {
  const { essence } = buildEssencePreviewRow({ id: 'fire', name: 'Fire', icon: 'fas fa-fire' });
  assert.equal(essence.colorToken, null);
});

test('the carrying-component row is a normal item on a CORE Foundry icon, carrying the essence pip', () => {
  const { component } = buildEssencePreviewRow(FIRE, { sampleComponentName: 'Ember Ash' });
  assert.equal(component.isEssenceSource, false, 'a normal item, so the card renders artwork');
  assert.equal(component.img, SAMPLE_COMPONENT_IMAGE);
  assert.equal(
    component.img,
    'icons/containers/bags/pack-engraved-leather-leaf-tan.webp',
    'a core asset present in every Foundry install, served from the core public root'
  );
  // The tile wears REAL artwork, never the "no image" sentinel: `resolveRecipeImage` and
  // `InventoryListingBuilder._resolveRecipeImg` both read the bag as absent artwork, so
  // reaching for it here would say "a component nobody gave an image".
  assert.notEqual(
    component.img,
    GENERIC_ITEM_IMAGE,
    'not the generic item-bag "no image" sentinel'
  );
  assert.equal(component.name, 'Ember Ash');
  // The one essence pip the card reads off `essences[]` — id (keyed on), name, icon and
  // colorToken, so the pip tints to the essence's own colour on the fake carrying component.
  assert.deepEqual(component.essences, [
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: '--fab-tag-mauve' },
  ]);
});

test('an uncoloured essence yields a pip with a null colorToken (the pip keeps --fab-text)', () => {
  const { component } = buildEssencePreviewRow(
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
    { sampleComponentName: 'Ember Ash' }
  );
  assert.equal(component.essences[0].colorToken, null);
});

test('an empty sample name passes through unchanged (the caller resolves the fallback copy)', () => {
  const { component } = buildEssencePreviewRow(FIRE);
  assert.equal(
    component.name,
    '',
    'the helper invents no copy — the Svelte caller localizes the fallback'
  );
});

test('a missing icon falls back to the mortar-pestle pip, and a missing id does not throw', () => {
  const { essence, component } = buildEssencePreviewRow({ name: 'Nameless' });
  assert.equal(essence.icon, null, 'no authored glyph ⇒ the card applies its own default');
  assert.equal(
    component.essences[0].icon,
    'fas fa-mortar-pestle',
    'the pip needs a concrete glyph class'
  );
  assert.equal(essence.componentId, null);
  assert.match(essence.key, /draft/, 'a draft with no id still keys stably');
});

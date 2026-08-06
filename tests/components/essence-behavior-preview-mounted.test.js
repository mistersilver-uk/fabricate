/**
 * `EssenceBehaviorPreview` mounted, in isolation (issue 1036, maintainer round 3).
 *
 * The round-3 note replaced the schematic swatch-chip samples ("On a component", "As a
 * recipe input") with the REAL player `InventoryItemCard`, mounted twice from synthetic rows
 * — the essence's own inventory tile and a fake carrying component. This suite pins that the
 * "How it appears" card mounts both real tiles without cancelling, and that the inspector
 * path (`showIdentity={false}`) mounts NO card, so that surface is unaffected.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { makeEssenceRow } from '../helpers/makeEssenceRow.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-preview-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // The preview builds its two synthetic tiles with this pure helper, which imports only
    // craftingImageDefaults; InventoryItemCard imports the same leaf.
    'src/ui/svelte/util/essencePreviewRow.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
    'src/utils/essenceValidation.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    // The REAL player tile the "How it appears" card mounts for both samples. A `.svelte` in
    // the closure but absent HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());

describe('EssenceBehaviorPreview — "How it appears" mounts the real player tiles', () => {
  it('renders the essence tile AND a fake carrying component, plus the rules and live note', async () => {
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }),
      sampleComponentName: 'Ember Ash',
    });

    // The essence's own inventory tile: the REAL card's essence-glyph branch.
    const tile = root.querySelector('[data-essence-preview-tile]');
    assert.ok(tile, 'the essence tile cell renders');
    assert.ok(
      tile.querySelector('.inventory-card-essence i.fa-fire'),
      'as the real essence-glyph tile'
    );
    assert.match(
      tile.querySelector('.inventory-card-name').textContent,
      /Fire/,
      "carrying the essence's name"
    );

    // The fake carrying component: a normal card on a CORE Foundry icon, carrying the pip.
    const component = root.querySelector('[data-essence-preview-component]');
    assert.ok(component, 'the carrying-component cell renders');
    const art = component.querySelector('.inventory-card-art img');
    assert.ok(
      art?.getAttribute('src').includes('icons/svg/item-bag.svg'),
      'on the core item-bag icon'
    );
    const pip = component.querySelector('[data-inventory-pip="essence"]');
    assert.ok(pip, 'and it carries the essence as a pip');
    assert.ok(pip.querySelector('i.fa-fire'), "the pip is the essence's own glyph");
    assert.match(
      component.querySelector('.inventory-card-name').textContent,
      /Ember Ash/,
      'named after the real carrier passed in'
    );

    // The behaviour rules list and the live-update note both survive the round-3 change.
    assert.ok(
      root.querySelector('[data-essence-preview-rule]'),
      'the effective-behaviour rules render'
    );
    assert.ok(root.querySelector('[data-essence-preview-live]'), 'and the live-update note');
    harness.remount();
  });

  it('flags a disabled essence with the Disabled pill in the card header', async () => {
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'aether', name: 'Aether', enabled: false }),
    });
    assert.match(
      root.querySelector('.manager-essence-preview-appears-head').textContent,
      /Disabled/,
      'the disabled state is still surfaced beside the "How it appears" kicker'
    );
    assert.ok(root.querySelector('[data-essence-preview-tile]'), 'and the real tile still renders');
    harness.remount();
  });

  it('mounts NO "How it appears" card on the inspector path, leaving that surface unaffected', async () => {
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'fire', name: 'Fire' }),
      showIdentity: false,
      showLiveNote: false,
      showEffectiveKicker: false,
    });
    assert.equal(root.querySelector('[data-essence-preview-appears]'), null, 'no appears card');
    assert.equal(root.querySelector('.inventory-card'), null, 'and no player tile is mounted');
    // The rules — the inspector's actual payload — still render.
    assert.ok(root.querySelector('[data-essence-preview-rule]'), 'the rules list still renders');
    harness.remount();
  });
});

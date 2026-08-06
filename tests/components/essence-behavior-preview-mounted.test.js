/**
 * `EssenceBehaviorPreview` mounted, in isolation (issue 1036, maintainer round 3).
 *
 * The round-3 note replaced the schematic swatch-chip samples ("On a component", "As a
 * recipe input") with the REAL player `InventoryItemCard`, mounted twice from synthetic rows
 * — the essence's own inventory tile and a fake carrying component. This suite pins that the
 * "How players see it" card mounts both real tiles without cancelling, and that the inspector
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
    // The REAL player tile the "How players see it" card mounts for both samples. A `.svelte` in
    // the closure but absent HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());

describe('EssenceBehaviorPreview — "How players see it" mounts the real player tiles', () => {
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

    // Issue 1036 round 4: both real tiles are mounted `interactive={false}` — a preview, not
    // a control. Neither `onSelect` nor `onBulkToggle` is wired here, so a focusable,
    // keyboard-operable, aria-pressed button would be a no-op trap in the editor's tab order.
    const appears = root.querySelector('[data-essence-preview-appears]');
    assert.equal(
      appears.querySelector('button'),
      null,
      'the preview subtree mounts no <button> at all'
    );
    assert.equal(
      appears.querySelector('[aria-pressed]'),
      null,
      'and nothing in it carries aria-pressed'
    );
    assert.ok(
      tile.querySelector('.inventory-card-button.is-static'),
      'the essence tile card body renders as a non-interactive static wrapper'
    );
    assert.ok(
      component.querySelector('.inventory-card-button.is-static'),
      'as does the fake carrying component'
    );
    harness.remount();
  });

  it('tints the preview essence tile to the essence colour when one is chosen', async () => {
    // Issue 1036: the preview mounts the REAL player tile, so a coloured essence's tile paints
    // its glyph in the chosen colour here exactly as it does in the player app — the
    // `colorToken` reaches `buildEssencePreviewRow`, which shapes it onto the mounted row.
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'fire', name: 'Fire', colorToken: '--fab-tag-mauve' }),
    });
    const tile = root.querySelector('[data-essence-preview-tile] .inventory-card-essence');
    assert.ok(tile, 'the essence tile renders');
    assert.equal(tile.getAttribute('data-inventory-essence-tint'), 'mauve');
    assert.match(
      tile.getAttribute('style') || '',
      /--fab-essence-tint:\s*var\(--fab-tag-mauve\)/,
      'the real tile carries the tint var, so the preview matches the player app'
    );
    harness.remount();
  });

  it('leaves the preview essence tile untinted (accent) when the essence has no colour', async () => {
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'fire', name: 'Fire' }),
    });
    const tile = root.querySelector('[data-essence-preview-tile] .inventory-card-essence');
    assert.ok(tile, 'the essence tile renders');
    assert.equal(tile.hasAttribute('data-inventory-essence-tint'), false);
    assert.doesNotMatch(tile.getAttribute('style') || '', /--fab-essence-tint/);
    harness.remount();
  });

  it('flags a disabled essence with the Disabled pill in the card header', async () => {
    const root = await harness.mount({
      essence: makeEssenceRow({ id: 'aether', name: 'Aether', enabled: false }),
    });
    assert.match(
      root.querySelector('.manager-essence-preview-appears-head').textContent,
      /Disabled/,
      'the disabled state is still surfaced beside the "How players see it" kicker'
    );
    assert.ok(root.querySelector('[data-essence-preview-tile]'), 'and the real tile still renders');
    harness.remount();
  });

  it('mounts NO "How players see it" card on the inspector path, leaving that surface unaffected', async () => {
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

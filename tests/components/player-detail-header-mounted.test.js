/** `PlayerDetailHeader`, mounted on its own and through the inventory shell that composes it. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from 'svelte';

import { assertIdentityHeader, primaryButtons } from '../helpers/playerDetailHeaderAssertions.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const HEADER_PATH = 'src/ui/svelte/apps/PlayerDetailHeader.svelte';
const SHELL_PATH = 'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte';

/** The row and the three members it composes: its whole compiled closure. */
const HEADER_CLOSURE = [
  HEADER_PATH,
  ...['Avatar', 'Button', 'Medallion'].map((name) => `src/ui/svelte/components/${name}.svelte`),
];

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));

const header = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-player-detail-header-',
  compiledModules: HEADER_CLOSURE,
  componentPath: HEADER_PATH,
  rootClass: 'fabricate-app',
});

const shell = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inventory-detail-header-',
  rawModules: [
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/essenceTint.js',
  ],
  compiledModules: [...HEADER_CLOSURE, SHELL_PATH],
  componentPath: SHELL_PATH,
  rootClass: 'fabricate-app',
});

describe('PlayerDetailHeader', () => {
  before(header.setup);
  after(header.teardown);
  afterEach(header.remount);

  it('renders the zero-primary form: a 38px tile, one h2 and no button', async () => {
    const target = await header.mount({ name: 'Karrun Warblade', art: 'icons/blade.webp' });

    const row = assertIdentityHeader(target, { primaries: 0, name: 'Karrun Warblade' });
    assert.equal(row.querySelector('img').getAttribute('src'), 'icons/blade.webp');
    assert.ok(!row.querySelector('button'), 'no primary means no button of any role');
    assert.ok(
      !row.querySelector('.player-detail-header-meta'),
      'no meta row is drawn when the caller passes neither meta nor chips'
    );
  });

  it('renders the one-primary form and reports its activation', async () => {
    const clicks = [];
    const target = await header.mount({
      name: 'Karrun Warblade',
      icon: 'fas fa-hammer',
      primaryLabel: 'Craft',
      primaryIcon: 'fas fa-hammer',
      primaryProps: { 'data-probe-primary': '' },
      onclick: (event) => {
        clicks.push(event.type);
      },
    });

    const row = assertIdentityHeader(target, { primaries: 1 });
    const [primary] = primaryButtons(row);
    assert.equal(primary.textContent.trim(), 'Craft');
    assert.ok(primary.hasAttribute('data-probe-primary'), 'the caller’s hooks land on the button');
    assert.ok(Boolean(primary.querySelector('i.fa-hammer')), 'with its leading glyph');
    assert.equal(primary.disabled, false);
    primary.click();
    assert.deepEqual(clicks, ['click']);
  });

  it('disables the primary without removing it', async () => {
    const target = await header.mount({ name: 'N', primaryLabel: 'Craft', primaryDisabled: true });
    const [primary] = primaryButtons(assertIdentityHeader(target, { primaries: 1 }));
    assert.equal(primary.disabled, true);
  });

  it('draws meta before chips in one row, and the overlay over a dimmed tile', async () => {
    const target = await header.mount({
      name: 'N',
      artDimmed: true,
      tileOverlay: snippet('<span data-probe-overlay></span>'),
      meta: snippet('<span data-probe-meta>12 total</span>'),
      chips: snippet('<span data-probe-chip>Component</span>'),
    });

    const row = assertIdentityHeader(target, { primaries: 0 });
    const tile = row.querySelector('.player-detail-header-tile');
    assert.ok(tile.classList.contains('is-dimmed'));
    assert.ok(Boolean(tile.querySelector(':scope > [data-probe-overlay]')), 'over the tile');
    assert.ok(
      !tile.querySelector('.player-detail-header-art').querySelector('[data-probe-overlay]'),
      'and outside the faded artwork, so the overlay itself is not dimmed'
    );
    const parts = [...row.querySelector('.player-detail-header-meta').children];
    assert.deepEqual(
      parts.map((part) => part.textContent),
      ['12 total', 'Component']
    );
  });

  it('draws an actor as a 32px portrait, with initials when there is no artwork', async () => {
    const target = await header.mount({ name: 'Akra Vey', portrait: true });
    const row = assertIdentityHeader(target, { primaries: 0, name: 'Akra Vey' });
    assert.equal(row.querySelector('.fab-avatar').textContent.trim(), 'AV');
    assert.ok(!row.querySelector('.fab-medallion'));
  });

  it('appends the caller’s class and forwards the rest to the root', async () => {
    const target = await header.mount({ name: 'N', class: 'probe-row', 'data-probe-root': 'x' });
    const row = assertIdentityHeader(target, { primaries: 0 });
    assert.ok(row.classList.contains('player-detail-header'));
    assert.ok(row.classList.contains('probe-row'));
    assert.equal(row.getAttribute('data-probe-root'), 'x');
  });
});

describe('InventoryDetailHeader composes PlayerDetailHeader', () => {
  before(shell.setup);
  after(shell.teardown);
  afterEach(shell.remount);

  it('keeps its scrolling column and draws the identity row inside its header', async () => {
    const target = await shell.mount({
      detailKey: 'sys:c1',
      img: 'icons/gland.webp',
      name: 'Mordant Gland',
      total: '12 total',
      totalAttrs: { 'aria-live': 'polite' },
      chips: [{ id: 'kind', label: 'Component', tone: 'quiet', attrs: { 'data-probe-kind': '' } }],
    });

    const column = target.querySelector('.inventory-detail[data-inventory-detail="sys:c1"]');
    const row = assertIdentityHeader(column, { primaries: 0, name: 'Mordant Gland' });
    assert.ok(row.closest('header.inventory-detail-header'), 'inside the shell’s own header');
    const total = row.querySelector('.inventory-detail-total');
    assert.equal(total.textContent, '12 total');
    assert.equal(total.getAttribute('aria-live'), 'polite');
    assert.ok(Boolean(row.querySelector('.inventory-chip.is-quiet[data-probe-kind]')));
  });

  it('inks an essence glyph in its own colour on the same 38px tile', async () => {
    const target = await shell.mount({ icon: 'fas fa-fire', colorToken: 'ember', name: 'Fire' });
    const row = assertIdentityHeader(target, { primaries: 0 });
    const tile = row.querySelector('.fab-medallion');
    assert.equal(tile.getAttribute('data-medallion'), 'glyph');
    assert.equal(tile.getAttribute('data-medallion-tint'), 'ember');
  });

  it('forwards one primary into the identity row and keeps a header action outside it', async () => {
    const target = await shell.mount({
      name: 'Mordant Gland',
      primary: { primaryLabel: 'Salvage' },
      headerAction: snippet('<button type="button" data-probe-clear>Clear</button>'),
    });

    const row = assertIdentityHeader(target, { primaries: 1 });
    assert.equal(primaryButtons(row)[0].textContent.trim(), 'Salvage');
    const action = target.querySelector('[data-probe-clear]');
    assert.ok(action.closest('.inventory-detail-header-action'), 'the non-primary action renders');
    assert.ok(!row.contains(action), 'beside the identity row, not inside it');
  });
});

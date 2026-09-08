import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-sources-bar-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte'
});

function craftingSources(overrides = {}) {
  const calls = { remove: [], toggle: [] };
  return {
    calls,
    store: {
      sources: overrides.sources ?? [
        { id: 'a', name: 'Aria', img: 'icons/svg/mystery-man.svg', removable: false },
        { id: 'b', name: 'Borin', img: '', removable: true }
      ],
      available: overrides.available ?? [
        { id: 'a', name: 'Aria', img: 'icons/svg/mystery-man.svg' },
        { id: 'b', name: 'Borin', img: '' },
        { id: 'c', name: 'Cy', img: '' }
      ],
      selectedSourceIds: overrides.selectedSourceIds ?? ['a', 'b'],
      remove: (id) => calls.remove.push(id),
      toggle: (id) => calls.toggle.push(id),
      add: () => {}
    }
  };
}

describe('ComponentSourcesBar mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders one focusable avatar button per source with an always-present aria-label', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const sources = target.querySelectorAll('.crafting-source');
    assert.equal(sources.length, 2, 'one element per source');

    const avatars = target.querySelectorAll('.crafting-source-avatar');
    for (const avatar of avatars) {
      assert.equal(avatar.tagName.toLowerCase(), 'button', 'each avatar is a button (focusable)');
      assert.ok((avatar.getAttribute('aria-label') || '').trim() !== '', 'avatar has a non-empty aria-label');
    }
  });

  it('renders the required (non-removable) source with a lock badge, aria-disabled, and an always-included aria suffix — and no remove control', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const required = target.querySelector('[data-source-id="a"]');
    assert.equal(required.getAttribute('data-source-removable'), 'false', 'required source flagged non-removable');
    const avatar = required.querySelector('.crafting-source-avatar');
    assert.equal(avatar.getAttribute('aria-disabled'), 'true', 'required avatar is aria-disabled');
    assert.match(avatar.getAttribute('aria-label'), /Aria/, 'aria-label names the actor');
    assert.match(avatar.getAttribute('aria-label'), /AlwaysIncluded/, 'aria-label carries the always-included suffix');
    assert.ok(required.querySelector('.crafting-source-lock'), 'lock badge rendered');
    assert.equal(required.querySelector('.crafting-source-remove'), null, 'no remove control for the required source');
  });

  it('renders a keyboard-reachable remove control for a removable source and calls remove on click', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const removable = target.querySelector('[data-source-id="b"]');
    assert.equal(removable.getAttribute('data-source-removable'), 'true', 'removable source flagged removable');
    const removeButton = removable.querySelector('[data-source-remove="b"]');
    assert.ok(removeButton, 'remove control rendered');
    assert.equal(removeButton.tagName.toLowerCase(), 'button', 'remove control is a button (keyboard reachable)');
    assert.ok((removeButton.getAttribute('aria-label') || '').includes('Remove'), 'remove control has a descriptive aria-label');

    removeButton.click();
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'remove called with the source id');
  });

  it('removes a removable source via right-click as an additive shortcut, but never the required source', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    target.querySelector('[data-source-id="b"] .crafting-source-avatar')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'right-click removed the removable source');

    target.querySelector('[data-source-id="a"] .crafting-source-avatar')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(calls.remove, ['b'], 'right-click did NOT remove the required source');
  });

  it('opens the add/edit popover listing every owned actor to toggle', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    assert.equal(target.querySelector('.crafting-sources-popover'), null, 'popover closed by default');
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const popover = target.querySelector('.crafting-sources-popover');
    assert.ok(popover, 'popover opened');
    const options = popover.querySelectorAll('.crafting-source-option');
    assert.equal(options.length, 3, 'one option per available owned actor');

    options[2].click();
    flushSync();
    assert.deepEqual(calls.toggle, ['c'], 'toggling an available actor calls store.toggle');
  });

  /**
   * BOTH ACTOR PORTRAITS ARE THE SHARED `Avatar` (issue 1514).
   *
   * Asserted on the RENDERED DOM rather than on the source text, because the interesting half is
   * the FALLBACK: this file's fixtures give Aria a portrait and Borin none, so one of each state
   * is on screen in every mount here. That is the state neither shipped `Avatar` caller reached
   * before this change, and no View Lab frame can draw it — every lab actor carries an image —
   * so these are the only assertions that hold it.
   */
  it('draws both actor portraits as the shared square Avatar, initials fallback included', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    const tiles = [...target.querySelectorAll('.crafting-source-avatar .fab-avatar')];
    assert.equal(tiles.length, 2, 'one shared portrait per source, and no hand-rolled tile left');
    assert.ok(
      tiles.every((tile) => tile.classList.contains('is-square')),
      '`shape="square"` is mandatory here: the component defaults to `round`, which renders a ' +
        '999px person mark where this bar has always drawn a rounded square'
    );

    const withArt = target.querySelector('[data-source-id="a"] [data-avatar]');
    assert.equal(withArt.getAttribute('data-avatar'), 'image', 'the actor with a portrait draws it');
    assert.ok(Boolean(withArt.querySelector('img[alt=""]')), 'and passes an explicit empty alt');

    const withoutArt = target.querySelector('[data-source-id="b"] [data-avatar]');
    assert.equal(
      withoutArt.getAttribute('data-avatar'),
      'initials',
      'and the actor with none draws INITIALS. This markup drew `<i class="fas fa-user">` before, ' +
        'so it is a CONTENT change; it is unphotographable because every lab actor has a portrait'
    );
    assert.equal(withoutArt.textContent.trim(), 'BO', 'two letters of the actor`s own name');
    assert.ok(
      !target.querySelector('.crafting-source-avatar .fa-user'),
      'and the person glyph is gone rather than left beside the mark'
    );
  });

  it('draws the picker option portraits the same way, at the portrait ladder`s own 32px mark', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const tiles = [...target.querySelectorAll('.crafting-source-option .fab-avatar')];
    assert.equal(tiles.length, 3, 'one shared portrait per available actor');
    assert.ok(
      tiles.every((tile) => tile.classList.contains('is-square') && tile.style.width === '32px'),
      'square at 32px, which is the portrait ladder`s single mark'
    );
    assert.equal(
      tiles.filter((tile) => tile.getAttribute('data-avatar') === 'initials').length,
      2,
      'and two of the three fixtures carry no image, so the fallback renders here as well'
    );
  });

  /**
   * THE TWO RULES THE CONVERSION HAD TO MOVE, and both are CSS claims happy-dom cannot compute.
   *
   * Source text with comments stripped in both syntaxes: the record of each move is a comment
   * beside the rule it replaced and each NAMES the declaration it removed, so a raw scan reads
   * the note as the thing it forbids. Measured, not anticipated — the sibling clause in
   * `essence-pool-panel-mounted` failed exactly that way before its own strip was added.
   */
  it('draws ONE hairline around the portrait button, and keeps the required actor`s accent ring', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte'),
      'utf8'
    )
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

    assert.match(
      source,
      /\.crafting-source-avatar \{[^}]*border: 0;/u,
      'the button`s own 1px edge came OFF in the same commit: `Avatar` draws a 1px ' +
        '`--fab-border` edge that cannot be turned off, so keeping both would render two ' +
        'concentric hairlines. Measured in the View Lab: the button is 40.00x40.00 with ' +
        'border-width 0 and the tile inside it 40.00x40.00 with 1px'
    );
    assert.match(
      source,
      /\.crafting-source-avatar\.is-required \{[^}]*outline: 1px solid var\(--fab-accent\);[^}]*outline-offset: -1px;/u,
      'and the required actor`s accent ring is an outline at a NEGATIVE offset, which paints ' +
        'exactly OVER the tile`s own border rather than beside it. A `border-color` cannot do ' +
        'this any more: that border belongs to the nested tile'
    );
    assert.match(
      source,
      /\.crafting-source\[data-source-removable='true'\]:hover \.crafting-source-avatar,/u,
      'and the hover dim that reveals the remove control moved OFF the `<img>` — which is ' +
        'inside `Avatar` now and unreachable from a caller`s scoped block — onto the button ' +
        'this file still owns, scoped to the removable row because the required one renders ' +
        'no "x" to reveal'
    );
  });

  /**
   * THE FOCUS RING IS DRAWN OUTSIDE THE FILTER, and this is the clause that keeps it there.
   *
   * The dim above is `filter: brightness(0.5)` on the BUTTON, which is where it had to move
   * when the `<img>` went inside `Avatar`. A CSS `filter` renders its element as a GROUP and
   * dims everything the group paints — content, background, border and OUTLINE alike — so a
   * ring painted on that same button paints at half brightness. Measured on the default
   * `fabricate` theme: the accent over the surface is 10.17:1, and at half brightness it is
   * 2.84:1, under the 3:1 floor SC 1.4.11 sets for a focus indicator. It is the ONLY keyboard
   * affordance on the row and NO View Lab case focuses it, so no frame can catch this.
   *
   * Asserted on the SOURCE, following `shopping-list-mounted`'s own ring clause, because
   * happy-dom computes no cascade and cannot answer whether a filtered ancestor dims an
   * outline. Both halves are required and the second is the one that is easy to lose: without
   * the suppression the button still matches `.fabricate button:focus-visible` in
   * `styles/fabricate.css`, which paints the same ring on the same filtered element.
   */
  it('draws the keyboard focus ring on the UNFILTERED row wrapper, not on the dimmed button', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte'),
      'utf8'
    )
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

    assert.match(
      source,
      /\.crafting-source:has\(\.crafting-source-avatar:focus-visible\) \{[^}]*outline: 2px solid var\(--fab-accent\);/u,
      'the WRAPPER draws the ring, through a `:has()` both of whose elements are in this ' +
        'template, so the ring paints at full brightness over the undimmed row'
    );
    assert.match(
      source,
      /\.crafting-source-avatar:focus-visible \{\s*outline: none;\s*\}/u,
      'and the button SUPPRESSES its own, or the module sheet`s `.fabricate ' +
        'button:focus-visible` paints the dimmed ring straight back beside the wrapper`s'
    );
    assert.ok(
      !/:not\(:focus-visible\)/u.test(source),
      'the dim is NOT gated on `:not(:focus-visible)`, which would kill it at exactly the ' +
        'moment the "x" becomes keyboard-reachable — the moment the dim exists for'
    );
  });
});

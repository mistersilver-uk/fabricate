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

  /**
   * THE PANEL IS `SearchablePopover`'S NOW, AND IT IS PORTALED (issue 1513).
   *
   * Every selector here reads from the mount TARGET rather than from the bar: the primitive
   * moves its panel to the resolved application root, so `[data-crafting-sources]` is no longer
   * an ancestor of it. The two caller hooks are what keep these assertions about THIS panel —
   * `popoverClass` puts `crafting-sources-popover` on the portaled node and `optionClass` puts
   * `crafting-source-option` on the primitive's row.
   *
   * `assert.ok(!node)` rather than `assert.equal(node, null)` for the closed state: on failure
   * `node:assert` serialises the actual value to build its diff and walks a mounted happy-dom
   * element's circular tree until the heap dies, so a two-second failure would surface as an
   * OOM with no message.
   */
  it('opens the add/edit picker listing every owned actor to toggle, and commits on choose', async () => {
    const { store, calls } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });

    assert.ok(!target.querySelector('.crafting-sources-popover'), 'panel closed by default');
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const popover = target.querySelector('.crafting-sources-popover');
    assert.ok(Boolean(popover), 'panel opened');
    assert.ok(
      !popover.closest('[data-crafting-sources]'),
      'and it is PORTALED out of the bar rather than positioned inside it, which is the whole ' +
        'reason the hand-rolled `position: absolute` panel could be clipped by the listing'
    );
    const options = popover.querySelectorAll('.crafting-source-option');
    assert.equal(options.length, 3, 'one option per available owned actor');

    options[2].click();
    flushSync();
    assert.deepEqual(calls.toggle, ['c'], 'toggling an available actor calls store.toggle');
    assert.ok(
      Boolean(target.querySelector('.crafting-sources-popover')),
      'and the panel STAYS OPEN, because a control that adds four source actors must not cost ' +
        'four open-choose-reopen cycles'
    );

    target
      .querySelectorAll('.crafting-sources-popover .crafting-source-option')[1]
      .click();
    flushSync();
    assert.deepEqual(
      calls.toggle,
      ['c', 'b'],
      'a second choice commits straight through as well: there is no staged set, no Apply and ' +
        'no Clear, because every surface reading the selection re-derives from it live'
    );
  });

  /**
   * THE MULTI-SELECT ANNOUNCEMENT, which is the single most important thing the conversion had
   * to preserve.
   *
   * The hand-rolled panel wrote `aria-selected={selectedIds.has(actor.id)}` per row and was
   * CORRECT: it was true on every chosen actor at once. Routing it onto a primitive that
   * announces one-of-N would have been an accessibility regression shipped as a design-system
   * adoption, so this asserts the exact strings on every row rather than the presence of the
   * attribute — the primitive emits `aria-selected` unconditionally, so a presence check passes
   * straight over the defect.
   */
  it('announces every chosen source actor at once, not one of N', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const popover = target.querySelector('.crafting-sources-popover');
    assert.equal(
      popover.querySelector('[role="listbox"]').getAttribute('aria-multiselectable'),
      'true',
      'the list declares itself multi-selectable'
    );
    const marks = [...popover.querySelectorAll('.crafting-source-option')].map((row) =>
      row.getAttribute('aria-selected')
    );
    assert.deepEqual(
      marks,
      ['true', 'true', 'false'],
      'the fixture selects `a` and `b` and not `c`, and the panel says so on all three rows. A ' +
        'single-value listbox can only ever mark ONE, which is the announcement this control ' +
        'has always made correctly and must not lose to the conversion'
    );
    assert.equal(
      popover.querySelectorAll('.crafting-source-option-check').length,
      2,
      'and the visible check glyph agrees with the announcement'
    );
  });

  /**
   * THE SEARCH FIELD AND THE MATCHED-OF-TOTAL COUNT, neither of which this control has ever had.
   *
   * `Sources.SearchCharacters` is the placeholder AND the field's accessible name, taken
   * verbatim from the GM-side `Access.SearchCharacters` so one control does not read differently
   * in two windows.
   */
  it('renders a query field and a matched-of-total count over the owned-actor list', async () => {
    const { store } = craftingSources();
    const target = await harness.mount({ services: { craftingSources: store } });
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const popover = target.querySelector('.crafting-sources-popover');
    const field = popover.querySelector('.manager-travel-popover-search input');
    assert.ok(Boolean(field), 'the panel renders a query field');
    assert.ok(
      (field.getAttribute('aria-label') || '').trim() !== '',
      'and it is named, rather than relying on a placeholder assistive technology may not read'
    );
    assert.equal(popover.querySelector('[data-popover-filtered-count]').textContent, '3 of 3');

    field.value = 'ar';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(
      target.querySelector('.crafting-sources-popover [data-popover-filtered-count]').textContent,
      '1 of 3',
      'and the count answers the query rather than restating the list length'
    );
  });

  /**
   * THE NO-OWNED-ACTORS LINE, in the slot it has always occupied.
   *
   * `Sources.Empty` is a body SENTENCE. The primitive's `emptyHint` feeds `EmptyState`'s `<h3>`
   * and `emptyDetail` feeds its `<p>`, so the sentence routes to `emptyDetail` — which is the
   * same `EmptyState note` slot the deleted `<EmptyState note hint={...}/>` markup put it in.
   * Demoting it into a heading would have been the visible cost of taking the nearer-looking
   * prop name.
   */
  it('draws the no-owned-actors sentence as a body line, not as a heading', async () => {
    const { store } = craftingSources({ available: [] });
    const target = await harness.mount({ services: { craftingSources: store } });
    target.querySelector('[data-crafting-sources-add]').click();
    flushSync();

    const empty = target.querySelector('.crafting-sources-popover .manager-travel-popover-empty');
    assert.ok(Boolean(empty), 'the empty branch renders');
    assert.ok(!empty.querySelector('h3'), 'and it renders NO heading');
    assert.match(
      empty.querySelector('p').textContent,
      /Sources\.Empty/u,
      'and the sentence is the one this control has always drawn (the mount stub echoes the key)'
    );
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

    const tiles = [
      ...target.querySelectorAll('.crafting-sources-popover .crafting-source-option .fab-avatar'),
    ];
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

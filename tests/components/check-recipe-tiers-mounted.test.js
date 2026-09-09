import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-recipe-tiers-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    // THE ORDERED ROW, the disclosure and the icon button it renders (issue 1512). A `.svelte`
    // the tree renders but this list omits HANGS the suite (`# cancelled`) rather than
    // failing it.
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
});

before(async () => {
  await harness.setup();
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

const TIERS = [
  { id: 't-easy', name: 'Apprentice work', dc: 8 },
  { id: 't-mid', name: 'Journeyman work', dc: 12 },
  { id: 't-hard', name: 'Masterwork', dc: 18 },
];

function names(emitted) {
  return emitted.at(-1).map((tier) => tier.id);
}

/**
 * The grip's hook is `SortableList`'s, not this surface's (issue 1512).
 *
 * `[data-tier-grip]` was this component's own attribute on its own `<ManagerButton>`. The grip is
 * the shared list's control now — it is the same control on every ordered row in the product —
 * so it carries the list's hook and this suite reads that. The five hooks this surface still owns
 * (`data-tier-row`, `data-tier-name`, `data-tier-dc`, `data-remove-tier`, `data-add-tier`) are
 * unchanged, and every assertion below still addresses the row by its own id.
 */
function gripFor(target, tierId) {
  return target.querySelector(`[data-sortable-grip="${tierId}"]`);
}

/**
 * A keydown on the grip, as a real one arrives: bubbling, cancellable, and carrying the key.
 */
function pressGrip(target, tierId, key) {
  const grip = gripFor(target, tierId);
  assert.ok(grip, `a grip exists for ${tierId}`);
  grip.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return grip;
}

describe('the recipe difficulty tier list (issue 1096)', () => {
  it('gives every row a grip, and the grip is a real focusable control', async () => {
    const target = await harness.mount({ tiers: TIERS });
    const grips = [...target.querySelectorAll('[data-sortable-grip]')];
    assert.equal(grips.length, 3, 'every row carries a handle');
    for (const grip of grips) {
      assert.equal(grip.tagName, 'BUTTON', 'the handle is a real button, not a bare glyph');
      assert.ok(grip.querySelector('.fa-grip-vertical'), 'it draws the prototype grip glyph');
    }
    assert.match(
      grips[0].getAttribute('aria-label'),
      /Apprentice work/,
      'the handle names the row it moves'
    );
  });

  it('MOVES a row with the arrow keys, which is the only keyboard path there is', async () => {
    const emitted = [];
    const target = await harness.mount({ tiers: TIERS, onChange: (next) => emitted.push(next) });

    pressGrip(target, 't-hard', 'ArrowUp');
    assert.deepEqual(names(emitted), ['t-easy', 't-hard', 't-mid'], 'ArrowUp moves the row up');

    await harness.setProps({ tiers: emitted.at(-1) });
    pressGrip(target, 't-easy', 'ArrowDown');
    assert.deepEqual(names(emitted), ['t-hard', 't-easy', 't-mid'], 'ArrowDown moves it down');
  });

  it('emits nothing at the ends of the list rather than a no-op reorder', async () => {
    const emitted = [];
    const target = await harness.mount({ tiers: TIERS, onChange: (next) => emitted.push(next) });
    pressGrip(target, 't-easy', 'ArrowUp');
    pressGrip(target, 't-hard', 'ArrowDown');
    assert.equal(emitted.length, 0, 'a move that changes nothing writes nothing');
  });

  it('ignores a key that is not a move', async () => {
    const emitted = [];
    const target = await harness.mount({ tiers: TIERS, onChange: (next) => emitted.push(next) });
    pressGrip(target, 't-mid', 'Enter');
    pressGrip(target, 't-mid', 'a');
    assert.equal(emitted.length, 0);
  });

  it('reorders on a real drop, and the dragged row says it is travelling', async () => {
    const emitted = [];
    const target = await harness.mount({ tiers: TIERS, onChange: (next) => emitted.push(next) });
    const rows = [...target.querySelectorAll('[data-tier-row]')];

    rows[2].dispatchEvent(new globalThis.Event('dragstart', { bubbles: true }));
    flushSync();
    assert.ok(
      target.querySelector('[data-tier-row="t-hard"]').classList.contains('is-dragging'),
      'the row being dragged paints itself as travelling'
    );
    rows[0].dispatchEvent(new globalThis.Event('drop', { bubbles: true, cancelable: true }));
    assert.deepEqual(names(emitted), ['t-hard', 't-easy', 't-mid'], 'the row lands where it was dropped');
  });

  it('draws the chevron rocker as well as the grip, disabled at the ends (M2)', async () => {
    // ISSUE 1096'S ONE-AFFORDANCE DECISION, OVERTURNED by the maintainer on 2026-09-09. The
    // specimen states BOTH AFFORDANCES ALWAYS, and this is the row that refused the rocker in
    // as many words in its own docblock — so it is the row whose new controls have to be
    // asserted rather than assumed from the primitive's own suite.
    const emitted = [];
    const target = await harness.mount({ tiers: TIERS, onChange: (next) => emitted.push(next) });

    const rows = [...target.querySelectorAll('[data-tier-row]')];
    assert.equal(rows.length, 3, 'three rows, so the ends and the middle are all represented');

    const up = rows.map((row) => row.querySelector('[data-sortable-move="up"]'));
    const down = rows.map((row) => row.querySelector('[data-sortable-move="down"]'));
    assert.ok(
      up.every(Boolean) && down.every(Boolean),
      'every row draws both chevrons, in every position'
    );
    assert.ok(up[0].disabled, 'the first row cannot move up');
    assert.ok(down[2].disabled, 'the last row cannot move down');
    assert.ok(
      !up[2].disabled && !down[0].disabled,
      'the chevron that CAN move is live, so the pair reads as a range rather than as chrome'
    );
    assert.ok(
      up.every((button) => button.getAttribute('data-keyboard-focus') === 'true'),
      'or Foundry keeps its arrow bindings and the canvas pans behind the studio'
    );

    down[0].click();
    assert.deepEqual(
      names(emitted),
      ['t-mid', 't-easy', 't-hard'],
      'the rocker moves the row it belongs to'
    );
  });

  it('announces a keyboard move through the list, which this row had no region for', async () => {
    const target = await harness.mount({ tiers: TIERS, onChange: () => {} });
    pressGrip(target, 't-hard', 'ArrowUp');
    flushSync();
    const region = target.querySelector('[data-sortable-list-status]');
    assert.ok(region, 'the list renders a polite live region');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.match(
      region.textContent,
      /Masterwork/,
      'it names the row that moved, read BEFORE the array was round-tripped'
    );
  });

  it("states the prototype's title and the sentence for the screen it is on", async () => {
    const banded = await harness.mount({ tiers: TIERS, anchorsBands: true });
    assert.equal(
      banded.querySelector('.manager-checks-card-title').textContent.trim(),
      lookup('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle')
    );
    assert.equal(
      banded.querySelector('.manager-checks-card-description').textContent.trim(),
      lookup('FABRICATE.Admin.Manager.Checks.Crafting.TiersLeadBands')
    );

    harness.remount();
    const plain = await harness.mount({ tiers: TIERS });
    assert.equal(
      plain.querySelector('.manager-checks-card-description').textContent.trim(),
      lookup('FABRICATE.Admin.Manager.Checks.Crafting.TiersLead'),
      'a simple check has no outcome bands, so it must not claim its tiers anchor any'
    );
  });

  // THE ADDER IS THE LIST'S FOOTER, AND REACHABLE AT ZERO (issue 1512). The requirement puts
  // the adder in flow with the collection it extends; the carve-out is that a footer of a list
  // that is not rendered cannot render either, so where a surface replaces the list with an
  // empty message the adder follows the message. Both halves are asserted, because a change
  // that satisfies only the first ships an empty state saying "add one" with nothing to press.
  it('renders the adder as the list`s own footer, and after the empty message at zero', async () => {
    const populated = await harness.mount({ tiers: TIERS });
    const footerAdd = populated.querySelector('[data-add-tier]');
    assert.ok(
      Boolean(footerAdd.closest('.fabricate-sortable-list')),
      'with tiers, the adder is the list`s last child rather than a sibling of the list'
    );

    harness.remount();
    const empty = await harness.mount({ tiers: [] });
    assert.ok(Boolean(empty.querySelector('[data-tiers-empty]')), 'the empty message renders');
    const emptyAdd = empty.querySelector('[data-add-tier]');
    assert.ok(Boolean(emptyAdd), 'and the adder is still reachable with no tiers at all');
    assert.ok(
      !emptyAdd.closest('.fabricate-sortable-list'),
      'following the message it now sits under, because there is no list to be a footer of'
    );
    harness.remount();
  });

  it('extends the list with the dashed control the prototype puts under it', async () => {
    const emitted = [];
    const target = await harness.mount({
      tiers: TIERS,
      defaultDc: 14,
      onChange: (next) => emitted.push(next),
    });
    const add = target.querySelector('[data-add-tier]');
    assert.ok(add.classList.contains('is-dashed'), 'it is the dashed add role');
    assert.equal(
      add.textContent.trim(),
      lookup('FABRICATE.Admin.Manager.Checks.Crafting.AddTier')
    );
    add.click();
    assert.equal(emitted.at(-1).length, 4);
    assert.equal(emitted.at(-1).at(-1).dc, 14, 'a new tier is seeded from the base DC');
  });
});

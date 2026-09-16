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
 * A keydown on the grip, as a real one arrives: bubbling, cancellable, and carrying the key.
 */
function pressGrip(target, tierId, key) {
  const grip = target.querySelector(`[data-tier-grip="${tierId}"]`);
  assert.ok(grip, `a grip exists for ${tierId}`);
  grip.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return grip;
}

describe('the recipe difficulty tier list (issue 1096)', () => {
  it('gives every row a grip, and the grip is a real focusable control', async () => {
    const target = await harness.mount({ tiers: TIERS });
    const grips = [...target.querySelectorAll('[data-tier-grip]')];
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

/** The rules editor's Essence contribution card reports quantities and the switch (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  callRecorder,
  cardFormat,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';

const harness = componentCardHarness('ComponentEssencesCard');

const DRAFT = Object.freeze([
  { id: 'fire', name: 'Fire', icon: '', enabled: true, quantity: 2 },
  { id: 'water', name: 'Water', icon: '', enabled: true, quantity: 0 },
  // Disabled but carried at a positive quantity, so it is still offered (issue 1036).
  { id: 'void', name: 'Void', icon: '', enabled: false, quantity: 1 },
  // Disabled and not carried, so it is withheld.
  { id: 'aether', name: 'Aether', icon: '', enabled: false, quantity: 0 },
]);

async function mountWith(overrides = {}) {
  const { calls, record } = callRecorder();
  const target = await harness.mount({
    text: cardText,
    format: cardFormat,
    systemLabel: 'Alchemy',
    essenceDraft: DRAFT,
    essenceNote: { tone: 'warning', state: 'overridden', icon: 'fas fa-pen', text: 'Overridden' },
    onQuantityChange: record('quantity'),
    onInheritChange: record('inherit'),
    ...overrides,
  });
  return { calls, target };
}

const tile = (target, id) => target.querySelector(`[data-component-edit-essence="${id}"]`);

describe('ComponentEssencesCard', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('offers the enabled and carried essences, and reports a stepped quantity', async () => {
    const { calls, target } = await mountWith();
    const offered = [...target.querySelectorAll('[data-component-edit-essence]')].map(
      (node) => node.dataset.componentEditEssence
    );
    assert.deepEqual(offered, ['fire', 'water', 'void']);
    assert.match(target.textContent, /Keyed to the 3 essences Alchemy uses/);

    tile(target, 'water').querySelector('[data-stepper-increment]').click();
    tile(target, 'fire').querySelector('[data-stepper-decrement]').click();
    assert.deepEqual(calls, [
      ['quantity', 'water', 1],
      ['quantity', 'fire', 1],
    ]);
    harness.remount();
  });

  it('reports the NEXT inherit value from the switch, and locks the tiles to the world map', async () => {
    const { calls, target } = await mountWith({
      essenceInheritOffered: true,
      essenceInheritStaged: true,
      essenceLocked: true,
      worldEssenceMap: { fire: 5 },
    });
    assert.equal(tile(target, 'fire').querySelector('[data-stepper-input]').value, '5');
    assert.ok(
      tile(target, 'fire').querySelector('[data-stepper-increment]').disabled,
      'a locked tile is inert'
    );
    target.querySelector('[data-scoped-inherit-toggle="essences"]').click();
    assert.deepEqual(calls, [['inherit', false]]);
    harness.remount();
  });

  it('withholds the switch where the world authored no map, and forks its two empty states', async () => {
    const { target } = await mountWith({ essenceDraft: [] });
    assert.ok(!target.querySelector('[data-scoped-inherit-toggle]'), 'no switch is offered');
    assert.match(target.textContent, /No essences are defined for this system yet\./);
    harness.remount();

    const disabledOnly = await mountWith({ essenceDraft: [DRAFT[3]] });
    assert.match(disabledOnly.target.textContent, /No essences are enabled for this system yet/);
    harness.remount();
  });
});

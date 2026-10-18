/**
 * A routed result set's source rows (issue 2512): the chips its card names, read off the routing
 * model, and the candidates its Assign panel offers with where each routes today.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRoutingModel } from '../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import {
  assignCandidates,
  inboundChips,
} from '../src/ui/svelte/apps/manager/recipe/resultSetSources.js';

const FINE = { id: 't-fine', name: 'Fine', success: true };
const GREAT = { id: 't-great', name: 'Great', success: true };
const BOTCH = { id: 't-botch', name: 'Botch', success: false };
const TIER_NAMES = new Map([FINE, GREAT, BOTCH].map((tier) => [tier.id, tier.name]));

const setName = (set, index) => set?.name || `Set ${index + 1}`;
const groupName = (group, index) => group?.name || `Set ${index + 1}`;

const setModel = (ingredientSets, resultGroups) =>
  buildRoutingModel({ provider: 'ingredientSet', ingredientSets, resultGroups, setName });
const tierModel = (resultGroups, tiers = [FINE, GREAT]) =>
  buildRoutingModel({ provider: 'check', resultGroups, tiers });

const chipsOf = (model, groups, index, provider) =>
  inboundChips({ model, index, group: groups[index], provider, tierNames: TIER_NAMES });

describe('inboundChips', () => {
  it('names an explicit set source as explicit, and a fallback one as its how', () => {
    const groups = [
      { id: 'g1', name: 'Ring' },
      { id: 'g2', name: 'Amulet' },
    ];
    const sets = [
      { id: 's1', name: 'Gold', resultGroupId: 'g1' },
      { id: 's2', name: 'Silver' },
    ];
    const model = setModel(sets, groups);
    assert.deepEqual(chipsOf(model, groups, 0, 'ingredientSet'), [
      { id: 's1', name: 'Gold', how: 'explicit', explicit: true, nonRouting: false },
      { id: 's2', name: 'Silver', how: 'fallback', explicit: false, nonRouting: false },
    ]);
    assert.deepEqual(chipsOf(model, groups, 1, 'ingredientSet'), []);
  });

  it('names a listed tier as explicit, and an unlisted one by its single or name how', () => {
    const single = [{ id: 'g1', name: 'Blade' }];
    assert.deepEqual(chipsOf(tierModel(single), single, 0, 'check'), [
      { id: 't-fine', name: 'Fine', how: 'single', explicit: false, nonRouting: false },
      { id: 't-great', name: 'Great', how: 'single', explicit: false, nonRouting: false },
    ]);

    const named = [
      { id: 'g1', name: 'Fine' },
      { id: 'g2', name: 'Great' },
    ];
    assert.deepEqual(chipsOf(tierModel(named), named, 1, 'check'), [
      { id: 't-great', name: 'Great', how: 'name', explicit: false, nonRouting: false },
    ]);

    const listed = [{ id: 'g1', checkOutcomeIds: ['t-great'] }, { id: 'g2' }];
    assert.deepEqual(chipsOf(tierModel(listed), listed, 0, 'check'), [
      { id: 't-great', name: 'Great', how: 'explicit', explicit: true, nonRouting: false },
    ]);
  });

  it('lists each tier the group names that does not reach it as non-routing, after the effective ones', () => {
    const groups = [
      { id: 'g1', checkOutcomeIds: ['t-fine'] },
      { id: 'g2', checkOutcomeIds: ['t-great', 't-fine', 't-botch', 't-gone'] },
    ];
    // Botch is not offered under the forbidding policy, Fine is listed first by g1, and t-gone is
    // no tier the system defines.
    assert.deepEqual(chipsOf(tierModel(groups), groups, 1, 'check'), [
      { id: 't-great', name: 'Great', how: 'explicit', explicit: true, nonRouting: false },
      { id: 't-fine', name: 'Fine', how: null, explicit: false, nonRouting: true },
      { id: 't-botch', name: 'Botch', how: null, explicit: false, nonRouting: true },
      { id: 't-gone', name: null, how: null, explicit: false, nonRouting: true },
    ]);
  });

  it('names a listed tier once however often the group lists it', () => {
    const groups = [{ id: 'g1', checkOutcomeIds: ['t-botch', 't-botch'] }];
    assert.deepEqual(
      chipsOf(tierModel(groups), groups, 0, 'check').map((chip) => chip.id),
      ['t-botch']
    );
  });

  it('reads no non-routing tier outside check routing', () => {
    const groups = [{ id: 'g1', checkOutcomeIds: ['t-gone'] }];
    const model = setModel([{ id: 's1', resultGroupId: 'g1' }], groups);
    assert.deepEqual(
      chipsOf(model, groups, 0, 'ingredientSet').map((chip) => chip.nonRouting),
      [false]
    );
  });
});

describe('assignCandidates', () => {
  it('offers every set with where it routes today, naming an unnamed target through groupName', () => {
    const groups = [{ id: 'g1', name: 'Ring' }, { id: 'g2' }, { id: 'g3', name: 'Brooch' }];
    const sets = [
      { id: 's1', name: 'Gold', resultGroupId: 'g1' },
      { id: 's2', name: 'Silver', resultGroupId: 'g2' },
      { id: 's3', name: 'Copper', resultGroupId: 'g3' },
    ];
    const model = setModel(sets, groups);
    assert.deepEqual(assignCandidates({ model, index: 2, groups, groupName }), [
      { id: 's1', name: 'Gold', routedTo: 'Ring' },
      { id: 's2', name: 'Silver', routedTo: 'Set 2' },
      { id: 's3', name: 'Copper', routedTo: null },
    ]);
  });

  it('offers every offered tier with where it routes today', () => {
    const groups = [{ id: 'g1', name: 'Fine blade', checkOutcomeIds: ['t-fine'] }, { id: 'g2' }];
    const model = tierModel(groups);
    assert.deepEqual(assignCandidates({ model, index: 1, groups, groupName }), [
      { id: 't-fine', name: 'Fine', routedTo: 'Fine blade' },
      { id: 't-great', name: 'Great', routedTo: null },
    ]);
  });

  it('leaves out a source with no id', () => {
    const groups = [{ id: 'g1', name: 'Ring' }];
    const model = setModel([{ name: 'Draft' }, { id: 's2', name: 'Silver' }], groups);
    assert.deepEqual(
      assignCandidates({ model, index: 0, groups, groupName }).map((row) => row.id),
      ['s2']
    );
  });
});

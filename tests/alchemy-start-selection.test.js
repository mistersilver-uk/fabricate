/** The version-1 brew's derived start plan and submission-funded set (issue 2574). */
import test from 'node:test';
import assert from 'node:assert/strict';

import { IngredientSet } from '../src/models/IngredientSet.js';
import {
  deriveAlchemySelectionPlan,
  submissionFundedSet,
} from '../src/systems/alchemyStartSelection.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';

const components = [
  { id: 'herb', name: 'Herb' },
  { id: 'ember', name: 'Ember', essences: { fire: 2 } },
];
const signatureValidator = new SignatureValidator({});
const herb = { uuid: 'Actor.s.Item.herb', name: 'Herb' };
const ember = { uuid: 'Actor.s.Item.ember', name: 'Ember' };
const essencesOn = { id: 'sys', features: { essences: true } };

function plan(set, submittedItems, system = essencesOn) {
  return deriveAlchemySelectionPlan({
    steps: [{ id: 'step', ingredientSets: set ? [set] : [] }],
    ingredientSetId: 'set',
    submittedItems,
    components,
    signatureValidator,
    system,
  });
}

const component = (componentId) => ({ match: { type: 'component', componentId }, quantity: 1 });
const essence = (essenceId, amount) => ({ match: { type: 'essence', essenceId, amount }, quantity: 1 });

test('a recipe without the matched set yields the set id alone', () => {
  assert.deepEqual(plan(null, [{ item: herb, componentId: 'herb' }]), { selectedIngredientSetId: 'set' });
  assert.deepEqual(
    deriveAlchemySelectionPlan({ steps: [], ingredientSetId: 'set', submittedItems: [], components }),
    { selectedIngredientSetId: 'set' }
  );
});

test('a single-option component set emits no override or allocation key', () => {
  const set = new IngredientSet({ id: 'set', ingredientGroups: [{ id: 'g', options: [component('herb')] }] });
  const derived = plan(set, [{ item: herb, componentId: 'herb' }]);
  assert.deepEqual(derived, { selectedIngredientSetId: 'set' });
  assert.equal(Object.values(derived).includes(undefined), false);
});

test('the legacy per-set essences map allocates the submitted carriers', () => {
  const set = new IngredientSet({ id: 'set', ingredientGroups: [], essences: { fire: 2 } });
  const derived = plan(set, [
    { item: ember, componentId: 'ember' },
    { item: ember, componentId: 'ember' },
    { item: herb, componentId: 'herb' },
  ]);
  assert.deepEqual(derived.ingredientEssenceAllocation, {
    stepId: 'step',
    ingredientSetId: 'set',
    allocation: { [ember.uuid]: 2 },
  });
});

test('an essences-disabled system picks the first non-essence option the submission meets', () => {
  const set = new IngredientSet({
    id: 'set',
    ingredientGroups: [{ id: 'g', options: [essence('fire', 2), component('herb')] }],
  });
  const submitted = [{ item: herb, componentId: 'herb' }];
  assert.deepEqual(plan(set, submitted, { id: 'sys', features: { essences: false } }), {
    selectedIngredientSetId: 'set',
    ingredientOptionOverrides: { g: { optionIndex: 1 } },
  });
  const withEmbers = [{ item: ember, componentId: 'ember' }];
  assert.deepEqual(plan(set, withEmbers).ingredientOptionOverrides, { g: { optionIndex: 0 } });
});

test('an unmatched trust or a set without a resolver is returned unchanged', () => {
  const set = new IngredientSet({ id: 'set' });
  assert.equal(submissionFundedSet(set, { matched: false, activityKind: 'alchemy' }, []), set);
  assert.equal(submissionFundedSet(set, { matched: true, activityKind: 'crafting' }, []), set);
  const duck = { id: 'set', matchIngredients: () => [] };
  assert.equal(submissionFundedSet(duck, { matched: true, activityKind: 'alchemy' }, []), duck);
});

test('a funded set refuses a submission whose Item is gone', () => {
  const set = new IngredientSet({ id: 'set' });
  const trusted = { matched: true, activityKind: 'alchemy', submittedItemUuids: [herb.uuid] };
  const funded = submissionFundedSet(set, trusted, [{ items: [] }]);
  assert.equal(funded.toJSON().id, 'set');
  assert.throws(() => funded.resolveIngredientSelection([], null, {}), {
    code: 'STALE_ALCHEMY_SUBMISSION',
  });
});

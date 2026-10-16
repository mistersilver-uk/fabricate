/**
 * What a recipe's result rows offer (issue 1773): `component` always, `currency` only while the
 * system takes part in currency and the world has units, `knowledge` only while learning is
 * observable, and the observability reading the manager uses is the service's own.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isLearnedKnowledgeObservable } from '../src/systems/learnedKnowledgeObservability.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';
import {
  recipeResultKinds,
  resultAmountInvalid,
} from '../src/ui/svelte/apps/manager/recipe/resultRows.js';

const UNITS = Object.freeze([
  { id: 'gp', label: 'Gold', icon: 'fa-solid fa-sun' },
  { id: 'sp', abbreviation: 'sp' },
]);
const RECIPES = Object.freeze([{ id: 'r-sword', name: 'Forge Sword', img: 'icons/sword.webp' }]);

test('a recipe result set offers each kind only where the system can award it', () => {
  const offer = (overrides) =>
    recipeResultKinds({
      currencyUnits: UNITS,
      currencyEnabled: true,
      recipeOptions: RECIPES,
      knowledgeObservable: true,
      ...overrides,
    }).kinds;
  assert.deepEqual(offer({}), ['component', 'currency', 'knowledge']);
  assert.deepEqual(offer({ currencyEnabled: false }), ['component', 'knowledge'], 'currency off');
  assert.deepEqual(offer({ currencyUnits: [] }), ['component', 'knowledge'], 'no world units');
  assert.deepEqual(offer({ knowledgeObservable: false }), ['component', 'currency']);
  assert.deepEqual(recipeResultKinds().kinds, ['component'], 'a caller passing nothing');
});

test('an authored reward reads back inert where its system cannot award its kind', () => {
  const inert = (overrides) => recipeResultKinds(overrides).readonlyKinds;
  assert.deepEqual(inert({ currencyEnabled: false, knowledgeObservable: true }), ['currency']);
  assert.deepEqual(inert({ currencyEnabled: true, knowledgeObservable: false }), ['knowledge']);
  assert.deepEqual(inert({ currencyEnabled: true, knowledgeObservable: true }), []);
});

test('a fixed currency amount is a whole number, which the row marks invalid otherwise', () => {
  const text = (_key, fallback) => fallback;
  const coin = (fields) => ({ id: 'c', kind: 'currency', unit: 'gp', ...fields });
  const NOT_WHOLE = { amount: 'A currency amount must be a whole number.' };
  assert.deepEqual(resultAmountInvalid(coin({ quantity: 2.5 }), text), NOT_WHOLE);
  assert.deepEqual(resultAmountInvalid(coin({ quantity: 3 }), text), {});
  assert.deepEqual(resultAmountInvalid(coin({}), text), {}, 'an absent amount reads as 1');
  assert.deepEqual(
    resultAmountInvalid({ id: 'r', componentId: 'ore', quantity: 2.5 }, text),
    {},
    'a component amount is not a currency’s'
  );
});

test('the catalogue names units by label, else abbreviation, and recipes by name', () => {
  const { catalogue } = recipeResultKinds({
    componentOptions: [{ id: 'c-pelt', name: 'Pelt', img: 'icons/pelt.webp' }],
    currencyUnits: UNITS,
    recipeOptions: RECIPES,
  });
  assert.deepEqual(
    catalogue.component.map(({ id, label }) => [id, label]),
    [['c-pelt', 'Pelt']]
  );
  assert.deepEqual(catalogue.currency, [
    { id: 'gp', label: 'Gold', icon: 'fa-solid fa-sun' },
    { id: 'sp', label: 'sp', icon: 'fa-solid fa-coins' },
  ]);
  assert.deepEqual(catalogue.knowledge, [
    { id: 'r-sword', label: 'Forge Sword', img: 'icons/sword.webp', icon: 'fa-solid fa-book-open' },
  ]);
});

test('the manager reads learning observability through the service’s own predicate', () => {
  const service = new RecipeVisibilityService(null, null);
  const systems = [
    { resolutionMode: 'simple', visibilityMode: 'knowledge' },
    { resolutionMode: 'simple', visibilityMode: 'global' },
    { resolutionMode: 'simple', recipeVisibility: { listMode: 'knowledge' } },
    {
      resolutionMode: 'simple',
      visibilityMode: 'knowledge',
      recipeVisibility: { listMode: 'teaser' },
    },
    { resolutionMode: 'alchemy', visibilityMode: 'restricted', alchemy: { learnOnCraft: true } },
    { resolutionMode: 'alchemy', visibilityMode: 'item' },
    null,
  ];
  assert.deepEqual(
    systems.map((system) => isLearnedKnowledgeObservable(system)),
    [true, false, true, false, true, false, false]
  );
  for (const system of systems) {
    assert.equal(
      service.isLearnedKnowledgeObservable(system),
      isLearnedKnowledgeObservable(system)
    );
  }
});

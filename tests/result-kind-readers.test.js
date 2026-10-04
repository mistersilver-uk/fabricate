/**
 * Issue 1773 PR1: the readers of a currency or knowledge result — the outcome signature, the
 * crafting output rows, the chat card, the Journal history rows and the manager's Produces rows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecipeProduceRows } from '../src/ui/model/recipeBrowserModel.js';
import { AlchemyListingBuilder } from '../src/ui/presenters/AlchemyListingBuilder.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';
import { resultOutputRows, resultSignature } from '../src/ui/presenters/resultOutputRows.js';
import {
  presentHistory,
  presentRewards,
} from '../src/ui/svelte/apps/journal/historyPresentation.js';

const localize = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);
const group = (...results) => [{ id: 'g', results }];
const coin = (extra = {}) => ({ id: 'c', kind: 'currency', unit: 'gp', quantity: 5, ...extra });
const lore = (extra = {}) => ({
  id: 'k',
  kind: 'knowledge',
  recipeId: 'taught',
  quantity: 1,
  ...extra,
});

test('1773 V&A 16: credits in different units, or different taught recipes, sign differently', () => {
  const sign = (...results) => resultSignature(group(...results));
  assert.equal(sign({ componentId: 'ore', quantity: 2 }), 'ore:2', 'a component signs as it did');
  assert.notEqual(sign(coin()), sign(coin({ unit: 'sp' })));
  assert.notEqual(sign(lore()), sign(lore({ recipeId: 'other' })));
  assert.notEqual(
    sign(coin()),
    sign({ componentId: '', quantity: 5 }),
    'no reward signs as an empty component'
  );
});

test('1773: the crafting output rows preview a credit by its label and a grant by its recipe', () => {
  const rows = resultOutputRows(
    group(
      { componentId: 'ore', quantity: 2 },
      coin({ label: 'Bounty', quantityFormula: '1d6' }),
      lore()
    ),
    {
      system: { components: [{ id: 'ore', name: 'Iron ore', img: 'ore.webp' }] },
      currencyUnits: () => [{ id: 'gp', label: 'Gold', abbreviation: 'gp' }],
      recipeManager: { getRecipe: (id) => (id === 'taught' ? { name: 'Healing draught' } : null) },
      localize,
    }
  );
  assert.deepEqual(
    rows[0],
    { name: 'Iron ore', img: 'ore.webp', qty: 2 },
    'a component row is unchanged'
  );
  assert.equal(rows[1].name, 'Bounty');
  assert.equal(rows[1].amountText, '1d6 gp', 'a rolled credit previews its expression');
  assert.equal(rows[1].glyph, 'fa-solid fa-coins');
  assert.equal(rows[2].name, 'Healing draught');
  assert.equal(rows[2].amountText, 'FABRICATE.App.Crafting.Io.RecipeKnowledge');
});

test('1773: the chat card lists credits, with label, roll and reason, and grants', () => {
  const content = buildCraftingChatContent(
    {
      status: 'succeeded',
      actorName: 'Sera',
      recipeName: 'Tonic',
      results: [
        {
          kind: 'currency',
          resultId: 'c',
          unit: 'gp',
          unitName: 'gp',
          amount: 4,
          label: 'Bounty',
          reason: 'For the job',
          rolled: { formula: '1d6', total: 4 },
        },
        {
          kind: 'knowledge',
          resultId: 'k',
          recipeId: 'taught',
          recipeName: 'Healing draught',
          outcome: 'granted',
        },
        {
          kind: 'knowledge',
          resultId: 'k2',
          recipeId: 'old',
          recipeName: 'Old lore',
          outcome: 'alreadyKnown',
        },
      ],
    },
    (key) =>
      ({
        'FABRICATE.Chat.RecipeLearned': 'Learned {recipe}',
        'FABRICATE.Chat.RecipeAlreadyKnown': 'Already knew {recipe}',
        'FABRICATE.Chat.RolledAmount': 'Rolled {formula} = {total}',
      })[key] ?? key
  );
  assert.match(
    content,
    /data-reward-kind="currency"><i class="fabricate-craft-chat__icon fa-solid fa-coins"/
  );
  assert.match(content, /Bounty — 4 gp/);
  assert.match(content, /Rolled 1d6 = 4/);
  assert.match(content, /For the job/);
  assert.match(content, /Learned Healing draught/);
  assert.match(content, /Already knew Old lore/);
  assert.ok(!content.includes('<img'), 'a reward row draws its glyph rather than an image');
});

test('1773: the Journal states a credit, a grant and an already-known recipe as fact rows', () => {
  const stage = {
    stepId: 's',
    status: 'succeeded',
    currencyCredits: [
      {
        resultId: 'c',
        unit: 'gp',
        unitName: 'gp',
        amount: 4,
        label: 'Bounty',
        reason: 'For the job',
        rolled: { formula: '1d6', total: 4 },
      },
      { resultId: 'c2', unit: 'sp', amount: 0 },
    ],
    knowledgeGrants: [
      { resultId: 'k', recipeId: 'taught', recipeName: 'Healing draught', outcome: 'granted' },
      { resultId: 'k2', recipeId: 'old', outcome: 'alreadyKnown' },
    ],
  };
  const rows = presentRewards(stage, (key, data) =>
    data ? `${data.formula} = ${data.total}` : key.split('.').at(-1)
  );
  assert.deepEqual(
    rows.map(({ label, value }) => [label, value]),
    [
      ['Bounty', '4 gp · 1d6 = 4 · For the job'],
      ['CurrencyAwarded', '0 sp'],
      ['RecipeLearned', 'Healing draught'],
      ['RecipeAlreadyKnown', 'old'],
    ]
  );
  const account = presentHistory(
    { status: 'succeeded', steps: [stage], createdResults: [] },
    localize
  );
  assert.deepEqual(
    account.rewards.map((row) => row.kind),
    ['currency', 'currency', 'knowledge', 'knowledge']
  );
  assert.equal(
    account.closed,
    'FABRICATE.App.Journal.History.ClosedSuccess{"count":1}',
    'a craft that only paid out still closes as a success'
  );
  assert.deepEqual(presentRewards({ stepId: 's' }, localize), [], 'a pre-change stage has none');
});

test('1773: the manager Produces rows name a reward by itself, never as a component', () => {
  const rows = buildRecipeProduceRows(
    { resultGroups: [{ id: 'g', results: [coin({ label: 'Bounty' }), lore()] }] },
    { componentOptions: [], recipeOptions: [{ id: 'taught', name: 'Healing draught' }] }
  );
  assert.deepEqual(
    rows.map(({ kind, name, icon }) => [kind, name, icon]),
    [
      ['currency', 'Bounty', 'fa-solid fa-coins'],
      ['knowledge', 'Healing draught', 'fa-solid fa-book-open'],
    ]
  );
});

test('1773: an alchemy headline is the first component result, never a reward', () => {
  const builder = new AlchemyListingBuilder({});
  const recipe = {
    resultGroups: [{ id: 'g', results: [coin(), { componentId: 'ore', quantity: 2 }] }],
  };
  const headline = builder._projectResult(recipe, null, {}, [{ id: 'ore', name: 'Iron ore' }]);
  assert.equal(headline.componentId, 'ore');
  assert.equal(headline.quantity, 2);
});

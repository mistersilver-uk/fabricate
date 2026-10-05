/**
 * Issue 1773 PR1: the readers of a currency or knowledge result — the outcome signature, the
 * crafting output rows, the chat card, the Journal history rows and the manager's Produces rows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecipeProduceRows } from '../src/ui/model/recipeBrowserModel.js';
import { AlchemyListingBuilder } from '../src/ui/presenters/AlchemyListingBuilder.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';
import { CraftingListingBuilder } from '../src/ui/presenters/CraftingListingBuilder.js';
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
      coin({ unit: 'mark' }),
      lore(),
      lore({ recipeId: 'secret' }),
      coin({ unit: '' })
    ),
    {
      system: { components: [{ id: 'ore', name: 'Iron ore', img: 'ore.webp' }] },
      currencyUnits: () => [
        { id: 'gp', label: 'Gold', abbreviation: 'gp' },
        { id: 'mark', label: 'Crown mark' },
      ],
      taughtName: (id) => (id === 'taught' ? 'Healing draught' : null),
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
  assert.deepEqual(
    [rows[2].name, rows[2].amountText],
    ['Crown mark', '5 Crown mark'],
    'an unlabelled credit reads as its unit, as the editor and the chat card name it'
  );
  assert.equal(rows[5].name, 'FABRICATE.App.Crafting.Io.CurrencyReward', 'with no unit, its kind');
  assert.equal(rows[3].name, 'Healing draught');
  assert.equal(rows[3].amountText, 'FABRICATE.App.Crafting.Io.RecipeKnowledge');
  assert.equal(
    rows[4].name,
    'FABRICATE.App.Crafting.Io.UnknownRecipe',
    'a taught recipe the viewer may not read is never named'
  );
});

/** A detail builder over one recipe teaching `taught`, whose visibility answers `access`. */
function teachingDetail({ viewer, access, enabled = true }) {
  const taught = { id: 'taught', name: 'Forbidden tonic', craftingSystemId: 'sys', enabled };
  const recipe = {
    id: 'teacher',
    name: 'Teacher',
    craftingSystemId: 'sys',
    resultGroups: [{ id: 'g', results: [lore()] }],
    ingredientSets: [],
  };
  const step = { id: 'implicit-step', ingredientSets: [], resultGroups: recipe.resultGroups };
  const evaluated = [];
  const builder = new CraftingListingBuilder({
    recipeManager: {
      getRecipe: (id) => ({ teacher: recipe, taught })[id] ?? null,
      evaluateCraftability: () => null,
    },
    recipeVisibility: {
      evaluateRecipeAccess: ({ recipe: asked, viewer: who }) => {
        evaluated.push([asked.id, who?.id]);
        return asked.id === 'teacher' ? { visible: true, reason: 'global' } : access;
      },
    },
    resolutionModeService: {
      getExecutionSteps: () => [step],
      resolveResultGroups: () => ({ groups: recipe.resultGroups }),
    },
    craftingSystemManager: { getSystem: () => ({ id: 'sys', resolutionMode: 'simple' }) },
    localize,
  });
  const detail = builder.buildRecipeDetail({ recipeId: 'teacher', viewer });
  return { names: detail.result.items.map((item) => item.name), evaluated };
}

test('1773: the player preview names a taught recipe only where recipe-visibility shows it', () => {
  const player = { id: 'player', isGM: false };
  const unknown = 'FABRICATE.App.Crafting.Io.UnknownRecipe';
  const hidden = teachingDetail({ viewer: player, access: { visible: false, reason: 'hidden' } });
  assert.deepEqual(hidden.names, [unknown], 'a hidden taught recipe previews unnamed');
  assert.deepEqual(hidden.evaluated.at(-1), ['taught', 'player'], 'asked for this viewer');
  assert.deepEqual(
    teachingDetail({ viewer: player, access: { visible: true, reason: 'teaser' } }).names,
    [unknown],
    'a teaser names nothing'
  );
  assert.deepEqual(
    teachingDetail({ viewer: player, access: { visible: true, reason: 'known' }, enabled: false })
      .names,
    [unknown],
    'a disabled recipe names nothing'
  );
  assert.deepEqual(
    teachingDetail({ viewer: player, access: { visible: true, reason: 'known' } }).names,
    ['Forbidden tonic']
  );
  assert.deepEqual(
    teachingDetail({ viewer: { id: 'gm', isGM: true }, access: { visible: false } }).names,
    ['Forbidden tonic'],
    'the GM reads every name'
  );
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
      ['Bounty', ['4 gp', ' · 1d6 = 4', ' · For the job']],
      ['CurrencyAwarded', ['0 sp']],
      ['RecipeLearned', 'Healing draught'],
      ['RecipeAlreadyKnown', 'old'],
    ],
    'a credit wraps between its amount, roll and reason, never inside a word'
  );
  assert.deepEqual(
    rows.map((row) => row.icon),
    ['fa-solid fa-coins', 'fa-solid fa-coins', 'fa-solid fa-book-open', 'fa-solid fa-book-open'],
    'each glyph carries its own family, so a stage card draws it'
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
    'FABRICATE.App.Journal.History.ClosedSuccessRewards{"count":1}',
    'a craft that paid out closes as a success that is already yours'
  );
  assert.deepEqual(presentRewards({ stepId: 's' }, localize), [], 'a pre-change stage has none');
});

test('1773: the manager Produces rows name a reward by itself, never as a component', () => {
  const rows = buildRecipeProduceRows(
    {
      resultGroups: [
        { id: 'g', results: [coin({ label: 'Bounty', quantityFormula: '2d6' }), coin(), lore()] },
      ],
    },
    {
      componentOptions: [],
      recipeOptions: [{ id: 'taught', name: 'Healing draught' }],
      currencyUnits: [{ id: 'gp', label: 'Gold', abbreviation: 'gp' }],
    }
  );
  assert.deepEqual(
    rows.map(({ kind, name, icon, amountLabel }) => [kind, name, icon, amountLabel]),
    [
      ['currency', 'Bounty', 'fa-solid fa-coins', '2d6 gp'],
      ['currency', '', 'fa-solid fa-coins', '5 gp'],
      ['knowledge', 'Healing draught', 'fa-solid fa-book-open', '1'],
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

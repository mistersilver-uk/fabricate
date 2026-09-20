/**
 * `buildKnowledgeSnapshot` against a hand-built roster (issue 1674). The whole-surface equivalence
 * lives in `tests/ui/manager-services-equivalence.test.js`; what is pinned here is the module's own
 * contract as a Foundry-free unit: the injected caps reader, the raw grant pair, and the
 * orphan-versus-other-system split.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildKnowledgeSnapshot, recipeItemCaps } from '../../src/systems/knowledgeSnapshot.js';

const FLAG_NAMESPACE = 'fabricate';

function flagged(fields, flags = {}) {
  return {
    ...fields,
    getFlag: (namespace, key) =>
      namespace === FLAG_NAMESPACE
        ? String(key)
            .split('.')
            .reduce((node, part) => node?.[part], { [FLAG_NAMESPACE]: flags })
        : undefined,
  };
}

const MODERN = {
  id: 'def-modern',
  name: 'Bound Primer',
  recipeIds: ['recipe-alpha', 'recipe-shared'],
  registeredItemUuid: 'Item.primer',
};
const LEGACY = {
  id: 'def-legacy',
  name: 'Weathered Folio',
  recipeIds: ['recipe-shared'],
  registeredItemUuid: 'Item.folio',
  destroyWhenExhausted: true,
  limitRecipes: 2,
};

const RECIPES = {
  'recipe-alpha': { name: 'Alpha', craftingSystemId: 'sys-1' },
  'recipe-shared': { name: 'Shared', craftingSystemId: 'sys-1' },
  'recipe-elsewhere': { name: 'Elsewhere', craftingSystemId: 'sys-2' },
};

const recipeManager = { getRecipe: (id) => RECIPES[id] ?? null };

/** The caps ladder an engine service provides, folding the legacy derivations. */
const capsFor = (definition) => ({
  item: {
    limitUses: definition.destroyWhenExhausted === true,
    maxUses: definition.destroyWhenExhausted ? 1 : undefined,
  },
  learn: { limitLearning: Number.isFinite(definition.limitRecipes) },
});

function roster({ learned = {}, items = [] } = {}) {
  const actor = flagged(
    { id: 'pc-1', name: 'Arden', img: 'a.webp' },
    { learnedRecipes: learned }
  );
  actor.items = items;
  return [actor];
}

function snapshotOf(options) {
  return buildKnowledgeSnapshot({
    systemId: 'sys-1',
    definitions: [MODERN, LEGACY],
    recipeManager,
    capsFor,
    ...options,
  });
}

describe('buildKnowledgeSnapshot', () => {
  it('reports the definition count and one character per rostered actor', () => {
    const snapshot = snapshotOf({ actors: roster() });
    assert.equal(snapshot.systemId, 'sys-1');
    assert.equal(snapshot.definitionCount, 2);
    assert.deepStrictEqual(
      snapshot.characters.map((character) => character.id),
      ['pc-1']
    );
  });

  it('takes the caps from the injected reader, so a legacy definition still resolves', () => {
    const folio = flagged({ id: 'i-1', name: 'Folio', uuid: 'Item.folio' });
    const [character] = snapshotOf({ actors: roster({ items: [folio] }) }).characters;
    const [copy] = character.ownedCopies;
    assert.equal(copy.definitionId, 'def-legacy');
    assert.equal(copy.limitUses, true, 'destroyWhenExhausted folds into limitUses');
    assert.equal(copy.maxUses, 1);
    // A raw `definition.caps` read answers undefined here, which is what makes this the control.
    assert.equal(LEGACY.caps, undefined);
  });

  it('defaults an absent stack quantity to one and reports usage as stored', () => {
    const primer = flagged({ id: 'i-2', name: 'Primer', uuid: 'Item.primer' });
    const used = flagged({ id: 'i-3', name: 'Used', uuid: 'Item.folio' }, {
      recipeItemUsage: { timesUsed: 2, inert: true },
    });
    const copies = snapshotOf({ actors: roster({ items: [primer, used] }) }).characters[0]
      .ownedCopies;
    assert.equal(copies[0].quantity, 1);
    assert.equal(copies[0].timesUsed, undefined, 'an unused copy carries no count');
    assert.equal(copies[0].inert, false);
    assert.equal(copies[1].timesUsed, 2);
    assert.equal(copies[1].inert, true);
  });

  it('splits an unresolvable learned entry from one belonging to another system', () => {
    const [character] = snapshotOf({
      actors: roster({
        learned: {
          'recipe-alpha': { learnedAt: 1 },
          'recipe-elsewhere': { learnedAt: 2 },
          'recipe-gone': { learnedAt: 3 },
        },
      }),
    }).characters;
    assert.deepStrictEqual(
      character.learnedRecipes.map((entry) => entry.recipeId),
      ['recipe-alpha']
    );
    assert.equal(character.otherSystemCount, 1);
    assert.equal(character.orphanCount, 1, 'an orphan is not counted as another system');
  });

  it('carries the grant pair raw, so a hostile value cannot be coerced into a plausible one', () => {
    const [character] = snapshotOf({
      actors: roster({ learned: { 'recipe-alpha': { granted: 'yes', grantedBy: 7 } } }),
    }).characters;
    assert.equal(character.learnedRecipes[0].granted, 'yes');
    assert.equal(character.learnedRecipes[0].grantedBy, 7);
  });

  it('names the member definition as the second rung of the learned-source ladder', () => {
    const [character] = snapshotOf({
      actors: roster({ learned: { 'recipe-shared': { sourceItemUuid: 'Item.gone' } } }),
    }).characters;
    const [entry] = character.learnedRecipes;
    assert.equal(entry.sourceOwned, false);
    assert.equal(entry.sourceItemName, '');
    assert.equal(entry.sourceDefinitionName, 'Bound Primer', 'the FIRST definition claiming it');
    assert.equal(entry.sourceCapped, false, 'an unowned source cannot report a learn cap');
  });

  it('reports a capped source only when the owned source book is capped', () => {
    const folio = flagged({ id: 'i-4', name: 'Folio', uuid: 'Item.folio' });
    const [character] = snapshotOf({
      actors: roster({
        items: [folio],
        learned: { 'recipe-shared': { sourceItemUuid: 'Item.folio' } },
      }),
    }).characters;
    assert.equal(character.learnedRecipes[0].sourceOwned, true);
    assert.equal(character.learnedRecipes[0].sourceCapped, true);
  });
});

describe('recipeItemCaps', () => {
  it('prefers the definition-only reader over the instance one', () => {
    const service = {
      _capsForDefinition: () => 'definition-only',
      _getRecipeItemCaps: () => 'instance',
    };
    assert.equal(recipeItemCaps(service, MODERN), 'definition-only');
  });

  it('falls back to the instance reader, then to empty caps', () => {
    assert.equal(recipeItemCaps({ _getRecipeItemCaps: () => 'instance' }, MODERN), 'instance');
    assert.deepStrictEqual(recipeItemCaps(null, MODERN), { item: {}, learn: {} });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { isAlchemyTabAvailable } = await import('../src/ui/svelte/util/alchemyTabAvailability.js');

function makeServices(systems, recipesBySystem = {}) {
  return {
    getCraftingSystemManager: () => ({ getSystems: () => systems }),
    getRecipeManager: () => ({
      getRecipes: ({ craftingSystemId } = {}) => recipesBySystem[craftingSystemId] ?? []
    })
  };
}

describe('isAlchemyTabAvailable', () => {
  it('returns false when managers are unavailable', () => {
    assert.equal(isAlchemyTabAvailable(null), false);
    assert.equal(isAlchemyTabAvailable({}), false);
    assert.equal(isAlchemyTabAvailable({ getCraftingSystemManager: () => null, getRecipeManager: () => null }), false);
  });

  it('returns false when no alchemy systems exist', () => {
    const services = makeServices(
      [{ id: 's1', resolutionMode: 'simple', enabled: true }],
      { s1: [{ id: 'r1' }] }
    );
    assert.equal(isAlchemyTabAvailable(services), false);
  });

  it('returns false when an alchemy system is disabled', () => {
    const services = makeServices(
      [{ id: 'a1', resolutionMode: 'alchemy', enabled: false }],
      { a1: [{ id: 'r1' }] }
    );
    assert.equal(isAlchemyTabAvailable(services), false);
  });

  it('returns false when an enabled alchemy system has no recipes', () => {
    const services = makeServices(
      [{ id: 'a1', resolutionMode: 'alchemy', enabled: true }],
      { a1: [] }
    );
    assert.equal(isAlchemyTabAvailable(services), false);
  });

  it('returns true when an enabled alchemy system has at least one recipe', () => {
    const services = makeServices(
      [{ id: 'a1', resolutionMode: 'alchemy', enabled: true }],
      { a1: [{ id: 'r1' }] }
    );
    assert.equal(isAlchemyTabAvailable(services), true);
  });

  it('treats a system with no explicit enabled flag as enabled', () => {
    const services = makeServices(
      [{ id: 'a1', resolutionMode: 'alchemy' }],
      { a1: [{ id: 'r1' }] }
    );
    assert.equal(isAlchemyTabAvailable(services), true);
  });

  it('ignores recipes that belong to non-alchemy systems', () => {
    const services = makeServices(
      [
        { id: 'a1', resolutionMode: 'alchemy', enabled: true },
        { id: 's1', resolutionMode: 'simple', enabled: true }
      ],
      { s1: [{ id: 'r1' }] }
    );
    assert.equal(isAlchemyTabAvailable(services), false);
  });
});

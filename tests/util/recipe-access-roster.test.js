import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRecipeAccessRoster } from '../../src/utils/recipeAccessRoster.js';

const ADA = { id: 'u1', name: 'Ada', avatar: 'icons/ada.webp' };
const BRIN = { id: 'u2', name: 'Brin', avatar: '' };

function character(overrides = {}) {
  return {
    id: 'a1',
    name: 'Thorin',
    img: 'icons/thorin.webp',
    controlledBy: [],
    sharedWithAllPlayers: false,
    ...overrides
  };
}

describe('resolveRecipeAccessRoster', () => {
  it('resolves granted player and character ids to their roster rows, in grant order', () => {
    const resolved = resolveRecipeAccessRoster(
      { playerIds: ['u2', 'u1'], characterIds: ['a2', 'a1'] },
      {
        players: [ADA, BRIN],
        characters: [character(), character({ id: 'a2', name: 'Nori' })]
      }
    );
    assert.deepEqual(
      resolved.players.map((player) => player.id),
      ['u2', 'u1'],
      'players come back in the order the grant names them'
    );
    assert.deepEqual(
      resolved.characters.map((entry) => entry.id),
      ['a2', 'a1'],
      'characters come back in the order the grant names them'
    );
    assert.equal(resolved.players[1].avatar, 'icons/ada.webp', 'carries the avatar through');
  });

  it('DROPS an id that no longer resolves rather than mutating the grant', () => {
    // A deleted actor or user leaves its id in `access`. The rail is READ-ONLY: it must
    // omit the row, never persist the grant back without it (that would silently revoke
    // access the GM never revoked).
    const access = { playerIds: ['u1', 'ghost-user'], characterIds: ['a1', 'ghost-actor'] };
    const resolved = resolveRecipeAccessRoster(access, {
      players: [ADA],
      characters: [character()]
    });
    assert.deepEqual(resolved.players.map((player) => player.id), ['u1']);
    assert.deepEqual(resolved.characters.map((entry) => entry.id), ['a1']);
    assert.deepEqual(
      access,
      { playerIds: ['u1', 'ghost-user'], characterIds: ['a1', 'ghost-actor'] },
      'the grant object is never mutated'
    );
  });

  it('honours a granted character OUTSIDE the player-character roster', () => {
    // The runtime predicate applies no type filter, so a grant naming a non-PC actor is
    // still honoured by the engine. The roster passed here is `game.actors`, not the
    // isPlayerCharacterActor-filtered list — resolving over the latter would drop the
    // grant from display and under-report access.
    const vehicle = character({ id: 'a-vehicle', name: 'The Wagon' });
    const resolved = resolveRecipeAccessRoster(
      { characterIds: ['a-vehicle'] },
      { characters: [vehicle] }
    );
    assert.deepEqual(resolved.characters, [vehicle], 'a non-PC actor grant still displays');
  });

  it('returns empty lists for an absent, empty, or malformed grant', () => {
    for (const access of [null, undefined, {}, { playerIds: 'u1', characterIds: 7 }]) {
      const resolved = resolveRecipeAccessRoster(access, {
        players: [ADA],
        characters: [character()]
      });
      assert.deepEqual(resolved, { players: [], characters: [] });
    }
  });

  it('returns empty lists when the rosters are absent (the store has not projected yet)', () => {
    const resolved = resolveRecipeAccessRoster({ playerIds: ['u1'], characterIds: ['a1'] });
    assert.deepEqual(resolved, { players: [], characters: [] });
  });

  it('preserves the controller SET and the whole-table flag verbatim', () => {
    // The rail renders the sub-line off these two fields; a lossy singular "playedBy"
    // would under-report who has access, so the resolver must pass them through intact.
    const shared = character({
      id: 'a-party',
      name: 'Party Wagon',
      controlledBy: [
        { id: 'u1', name: 'Ada', avatar: '', assigned: false },
        { id: 'u2', name: 'Brin', avatar: '', assigned: false }
      ],
      sharedWithAllPlayers: true
    });
    const resolved = resolveRecipeAccessRoster(
      { characterIds: ['a-party'] },
      { characters: [shared] }
    );
    assert.equal(resolved.characters[0].controlledBy.length, 2);
    assert.equal(resolved.characters[0].sharedWithAllPlayers, true);
  });
});

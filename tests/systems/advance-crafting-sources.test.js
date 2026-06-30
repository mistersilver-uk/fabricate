/**
 * Coverage for the pure ownership-guard + component-source resolver
 * (`src/systems/advanceCraftingSources.js`) extracted from
 * `Fabricate#advanceCraftingRun`. It must block an unknown crafting actor,
 * resolve `componentSourceActorUuids` through the injected `fromUuid` (filtering
 * falsy resolutions), fall back to `[actor]` when nothing resolves, and block
 * when the crafting actor OR any source actor is not owned by the viewer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdvanceSources } from '../../src/systems/advanceCraftingSources.js';

const owned = (id) => ({ id, isOwner: true });
const unowned = (id) => ({ id, isOwner: false });

describe('resolveAdvanceSources — advance ownership guard', () => {
  it('blocks an unknown (falsy) crafting actor', () => {
    assert.deepEqual(resolveAdvanceSources({ actor: null }), { blocked: true });
    assert.deepEqual(resolveAdvanceSources(), { blocked: true });
  });

  it('resolves source UUIDs through the injected fromUuid, filtering falsy', () => {
    const actor = owned('craft');
    const s1 = owned('s1');
    const s2 = owned('s2');
    const byUuid = { 'Actor.s1': s1, 'Actor.s2': s2, 'Actor.gone': null };
    const result = resolveAdvanceSources({
      actor,
      run: { componentSourceActorUuids: ['Actor.s1', 'Actor.gone', 'Actor.s2'] },
      fromUuid: (uuid) => byUuid[uuid] ?? null,
    });
    assert.deepEqual(result, { componentSourceActors: [s1, s2] });
  });

  it('falls back to [actor] when no sources resolve', () => {
    const actor = owned('craft');
    // No uuids array at all.
    assert.deepEqual(resolveAdvanceSources({ actor, run: {} }), {
      componentSourceActors: [actor],
    });
    // Uuids present but no resolver supplied → empty → fallback.
    assert.deepEqual(
      resolveAdvanceSources({ actor, run: { componentSourceActorUuids: ['Actor.s1'] } }),
      { componentSourceActors: [actor] }
    );
    // Uuids all resolve falsy → empty → fallback.
    assert.deepEqual(
      resolveAdvanceSources({
        actor,
        run: { componentSourceActorUuids: ['Actor.gone'] },
        fromUuid: () => null,
      }),
      { componentSourceActors: [actor] }
    );
  });

  it('blocks when the crafting actor is not owned (even with owned sources)', () => {
    const actor = unowned('craft');
    const result = resolveAdvanceSources({
      actor,
      run: { componentSourceActorUuids: ['Actor.s1'] },
      fromUuid: () => owned('s1'),
    });
    assert.deepEqual(result, { blocked: true });
  });

  it('blocks when any component-source actor is not owned', () => {
    const actor = owned('craft');
    const result = resolveAdvanceSources({
      actor,
      run: { componentSourceActorUuids: ['Actor.s1', 'Actor.s2'] },
      fromUuid: (uuid) => (uuid === 'Actor.s1' ? owned('s1') : unowned('s2')),
    });
    assert.deepEqual(result, { blocked: true });
  });

  it('blocks the [actor] fallback when the crafting actor is not owned', () => {
    const actor = unowned('craft');
    assert.deepEqual(resolveAdvanceSources({ actor, run: {} }), { blocked: true });
  });

  it('returns the sources when the crafting actor and every source are owned', () => {
    const actor = owned('craft');
    const s1 = owned('s1');
    const result = resolveAdvanceSources({
      actor,
      run: { componentSourceActorUuids: ['Actor.s1'] },
      fromUuid: () => s1,
    });
    assert.deepEqual(result, { componentSourceActors: [s1] });
  });
});

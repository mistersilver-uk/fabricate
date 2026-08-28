/**
 * THE READ UNION'S FIELD-BY-FIELD MERGE (issue 1363, Phase 8).
 *
 * `unionScopedDefinitions` used to push the world-resolved entry, mark the id claimed, and then
 * SKIP the legacy entry entirely. That was harmless only while nothing wrote the world corpus.
 * After the `1.30.0` migration the in-system record and the world entity share an id BY
 * CONSTRUCTION, so that skip drops `salvage`, `essences`, `difficulty` and `complications` from
 * EVERY component the union returns.
 *
 * The union has no production consumer yet, but `## Scoped Entity Definitions` requirement 15
 * declares its contract binding NOW and binding on the consumer sweep — so shipping a union that
 * is wrong for every migrated world would hand that sweep a contract it must violate.
 *
 * MUTATION PROOF. Reverting the merge to the shipped `{ ...entity, ...resolved }` reddens the
 * first test below; that mutation was run and produced `not ok` before this file was committed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveComponent } from '../src/systems/componentScope.js';
import { resolveEssence } from '../src/systems/essenceScope.js';
import { resolveTool } from '../src/systems/toolScope.js';
import { unionScopedDefinitions } from '../src/systems/scopedDefinitionStore.js';

/** One world corpus in which a world entity and an in-system record share an id. */
function collidingCorpus(entity, membership) {
  return {
    entities: [entity],
    defaults: [],
    membership: [membership],
  };
}

describe('the read union merges FIELD BY FIELD on an id collision', () => {
  it('keeps every in-system field the world layer does not own', () => {
    const legacy = {
      id: 'comp-1',
      name: 'stale name',
      salvage: { enabled: true, resultGroups: [{ id: 'g', results: [] }] },
      essences: { fire: 2 },
      difficulty: 3,
      complications: [{ id: 'cx' }],
    };
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', name: 'Ash Salt', img: 'a.png', description: 'A' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: { category: false }, category: 'reagent' }
      ),
      systemId: 'sys-a',
      systemDefinitions: [legacy],
      resolve: resolveComponent,
    });
    assert.equal(union.length, 1, 'the collision produces ONE entry, not two');
    const entry = union[0];
    // THE FOUR FIELDS THE SKIP DROPPED. Reverting the merge reddens exactly here.
    assert.deepEqual(entry.salvage, legacy.salvage);
    assert.deepEqual(entry.essences, legacy.essences);
    assert.equal(entry.difficulty, 3);
    assert.deepEqual(entry.complications, legacy.complications);
    // …and the world layer still wins every field it authors.
    assert.equal(entry.name, 'Ash Salt', 'world identity WINS the field it owns');
    assert.equal(entry.img, 'a.png');
    assert.equal(entry.category, 'reagent', 'and the resolved section wins over both');
  });

  it('leaves a NON-colliding in-system record exactly as it was', () => {
    const legacy = { id: 'comp-2', name: 'Only here', salvage: { enabled: false } };
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', name: 'Ash Salt' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [legacy],
      resolve: resolveComponent,
    });
    assert.equal(union.length, 2);
    assert.equal(union[1], legacy, 'a non-colliding legacy entry is passed through BY REFERENCE');
  });

  it('still refuses a world entity this system has no membership record for', () => {
    const union = unionScopedDefinitions({
      corpus: { entities: [{ id: 'comp-1', name: 'Ash Salt' }], defaults: [], membership: [] },
      systemId: 'sys-a',
      systemDefinitions: [],
      resolve: resolveComponent,
    });
    assert.deepEqual(union, [], 'an absent membership record is a REFUSAL, never a prune');
  });
});

describe('the two spread hazards, both intended and both stated so neither reads as a defect', () => {
  it('an authored EMPTY-STRING world description or img OVERWRITES a populated legacy one', () => {
    // `resolveScopedDefinition` guards `undefined`, so `resolved` cannot blank a section.
    // `...entity` is NOT guarded that way, because `normalizeWorldEntities` preserves every
    // authored field verbatim and enforces only an identity floor — so an authored empty string
    // is an authored VALUE, and world precedence applies to it exactly as to any other.
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', description: '', img: '' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1', description: 'populated', img: 'a.png' }],
      resolve: resolveComponent,
    });
    assert.equal(union[0].description, '');
    assert.equal(union[0].img, '');
  });

  it('the resolved `enabled` OVERWRITES a legacy one on an essence and on a tool', () => {
    // INTENDED. After the migration the membership record is the ONLY correct source of
    // `enabled` for a world-claimed essence or tool; the legacy value is the pre-migration copy.
    const essenceUnion = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'fire', name: 'Fire' },
        { entityId: 'fire', systemId: 'sys-a', inherit: {}, enabled: false }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'fire', enabled: true }],
      resolve: resolveEssence,
    });
    assert.equal(essenceUnion[0].enabled, false, 'the MEMBERSHIP record decides');

    const toolUnion = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'tool-1', name: 'Hammer' },
        { entityId: 'tool-1', systemId: 'sys-a', inherit: {}, enabled: false }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'tool-1', enabled: true, label: 'kept' }],
      resolve: resolveTool,
    });
    assert.equal(toolUnion[0].enabled, false);
    assert.equal(toolUnion[0].label, 'kept', 'and the in-system label survives the merge');
  });

  it('`member` and `inherited` are ALWAYS emitted, so they always win the merge', () => {
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: { category: false } }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1', member: 'nonsense', inherited: 'nonsense' }],
      resolve: resolveComponent,
    });
    assert.equal(union[0].member, true);
    assert.deepEqual(union[0].inherited, { category: false });
  });
});

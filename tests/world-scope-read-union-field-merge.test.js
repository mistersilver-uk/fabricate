/**
 * THE READ UNION'S MERGE (issue 1363 Phase 8, inverted by issue 1370 PR 8a, SCOPED by 1372).
 * `unionScopedDefinitions` used to push the world-resolved entry, mark the id claimed, and then
 * SKIP the legacy entry entirely.
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
      name: 'fresh name',
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
      entityType: 'components',
    });
    assert.equal(union.length, 1, 'the collision produces ONE entry, not two');
    const entry = union[0];
    // THE FOUR FIELDS THE ORIGINAL SKIP DROPPED.
    assert.deepEqual(entry.salvage, legacy.salvage);
    assert.deepEqual(entry.essences, legacy.essences);
    assert.equal(entry.difficulty, 3);
    assert.deepEqual(entry.complications, legacy.complications);
    // …and the IN-SYSTEM record now wins every identity field it CARRIES.
    assert.equal(entry.name, 'fresh name', 'the in-system identity WINS, and issue 1372 kept it');
    // The world layer still supplies the keys the in-system record does not carry, and the
    // resolved section still wins over both.
    assert.equal(entry.category, 'reagent', 'the resolved section wins over both halves');
    assert.equal(entry.member, true);
  });

  it('DELETES a lifted identity field the in-system record does not carry', () => {
    // ABSENCE IS A VALUE, and a spread cannot express it. Without the DELETE half a world
    // entity's stale `description` survives on a record the GM has since cleared.
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', name: 'Ash Salt', img: 'a.png', description: 'stale blurb' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1', name: 'Ash Salt' }],
      resolve: resolveComponent,
      entityType: 'components',
    });
    assert.equal('description' in union[0], false, 'an absent in-system field stays absent');
    assert.equal('img' in union[0], false);
    assert.equal(union[0].name, 'Ash Salt');
  });

  it('leaves a NON-colliding in-system record exactly as it was, BY REFERENCE', () => {
    const legacy = { id: 'comp-2', name: 'Only here', salvage: { enabled: false } };
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', name: 'Ash Salt' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [legacy],
      resolve: resolveComponent,
      entityType: 'components',
    });
    assert.equal(union.length, 1, 'the ROW SET is the in-system array’s row set');
    assert.equal(union[0], legacy, 'a non-colliding legacy entry is passed through BY REFERENCE');
  });

  it('still refuses a world entity this system has no membership record for', () => {
    const union = unionScopedDefinitions({
      corpus: { entities: [{ id: 'comp-1', name: 'Ash Salt' }], defaults: [], membership: [] },
      systemId: 'sys-a',
      systemDefinitions: [],
      resolve: resolveComponent,
      entityType: 'components',
    });
    assert.deepEqual(union, [], 'an absent membership record is a REFUSAL, never a prune');
  });
});

describe('an unrecognised entityType is REFUSED, never defaulted', () => {
  // THE THROW IS THE POINT, and it is new in this change.
  const corpus = collidingCorpus(
    { id: 'comp-1', name: 'Ash Salt', description: 'the snapshot blurb' },
    { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
  );
  const call = (entityType) =>
    unionScopedDefinitions({
      corpus,
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1', name: 'Ash Salt' }],
      resolve: resolveComponent,
      entityType,
    });

  it('throws when the entityType is OMITTED', () => {
    assert.throws(() => call(undefined), {
      name: 'TypeError',
      message:
        'unionScopedDefinitions: unknown entityType undefined; expected one of components, essences, tools',
    });
  });

  it('throws when the entityType is MISSPELLED', () => {
    assert.throws(() => call('widgets'), {
      name: 'TypeError',
      message:
        'unionScopedDefinitions: unknown entityType "widgets"; expected one of components, essences, tools',
    });
    // The message names the accepted set, because the failure it exists to catch is a typo and the
    // fix is always one of three literals.
    assert.throws(() => call('essenceDefinitions'), /expected one of components, essences, tools/);
  });

  it('accepts each of the three, and DELETES against the right list for each', () => {
    // Non-vacuity: if the throw fired for a legitimate value the arms above would pass anyway.
    assert.equal('description' in call('components')[0], false);
    assert.doesNotThrow(() =>
      unionScopedDefinitions({
        corpus: collidingCorpus({ id: 'fire' }, { entityId: 'fire', systemId: 'sys-a', inherit: {} }),
        systemId: 'sys-a',
        systemDefinitions: [{ id: 'fire' }],
        resolve: resolveEssence,
        entityType: 'essences',
      })
    );
    assert.doesNotThrow(() =>
      unionScopedDefinitions({
        corpus: collidingCorpus({ id: 't1' }, { entityId: 't1', systemId: 'sys-a', inherit: {} }),
        systemId: 'sys-a',
        systemDefinitions: [{ id: 't1' }],
        resolve: resolveTool,
        entityType: 'tools',
      })
    );
  });

  it('does NOT throw on the blank-systemId path, which returns before the check', () => {
    // A PRECISION FOOTNOTE, so a later reader does not widen the contract past what it says. The
    // early return for a blank `systemId` answers the in-system rows before any field list is
    // resolved.
    const legacy = [{ id: 'comp-1', name: 'Ash Salt', description: 'kept' }];
    const answer = unionScopedDefinitions({
      corpus,
      systemId: '   ',
      systemDefinitions: legacy,
      resolve: resolveComponent,
    });
    assert.deepEqual(answer, legacy);
  });
});

describe('a DECLARED section with no writer is REFUSED, on the same rule', () => {
  // THE SAME FAILURE ONE LEVEL DOWN, and unlike the entity-type typo above this one has already
  // shipped (issue 1373).
  const corpus = collidingCorpus({ id: 't1' }, { entityId: 't1', systemId: 'sys-a', inherit: {} });

  /** A resolver that declares one extra section, exactly as widening `TOOL_SECTIONS` would. */
  const declaringAnExtraSection = (worldDefault, membership) => {
    const resolved = resolveTool(worldDefault, membership);
    return { ...resolved, inherited: { ...resolved.inherited, sharpeningKit: true } };
  };

  it('throws, naming the section and what its silence would have cost', () => {
    assert.throws(
      () =>
        unionScopedDefinitions({
          corpus,
          systemId: 'sys-a',
          systemDefinitions: [{ id: 't1' }],
          resolve: declaringAnExtraSection,
          entityType: 'tools',
        }),
      {
        name: 'TypeError',
        message:
          'unionScopedDefinitions: entityType "tools" declares section(s) "sharpeningKit" that ' +
          'INHERITED_SECTION_WRITERS does not write; an inheriting system would silently answer ' +
          'them from the in-system record',
      }
    );
  });

  it('accepts every section the three shipped scopes actually declare', () => {
    // NON-VACUITY, and it is the arm that would have gone red on this branch before the two
    // writers landed: `TOOL_SECTIONS` is four names now, and a table that writes two of them
    // fails here rather than passing quietly.
    for (const [entityType, resolve] of [
      ['components', resolveComponent],
      ['essences', resolveEssence],
      ['tools', resolveTool],
    ]) {
      assert.doesNotThrow(
        () =>
          unionScopedDefinitions({
            corpus,
            systemId: 'sys-a',
            systemDefinitions: [{ id: 't1' }],
            resolve,
            entityType,
          }),
        `every section ${entityType} declares must have a writer`
      );
    }
  });
});

describe('the two spread hazards stay RETIRED for a row with no section to inherit', () => {
  it('an authored EMPTY-STRING world description no longer overwrites a populated legacy one', () => {
    // RETIRED. It was defended as "an authored empty string is an authored value", and that is
    // still true of the world entity — but nothing authors that entity, while the in-system copy
    // is what every shipped identity writer writes.
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1', description: '', img: '' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1', description: 'populated', img: 'a.png' }],
      resolve: resolveComponent,
      entityType: 'components',
    });
    assert.equal(union[0].description, 'populated');
    assert.equal(union[0].img, 'a.png');
  });

  it('a GM-disabled in-system essence and tool read back DISABLED', () => {
    // RETIRED, and this is the severe half: `enabled` is emitted UNCONDITIONALLY for an enableable
    // scope, so before the inversion a disabled essence or tool read back usable whether or not any
    // membership record had authored anything (issue 1372).
    const essenceUnion = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'fire', name: 'Fire' },
        { entityId: 'fire', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'fire', name: 'Fire', enabled: false }],
      resolve: resolveEssence,
      entityType: 'essences',
    });
    assert.equal(essenceUnion[0].enabled, false, 'the IN-SYSTEM record decides a NON-section key');

    const toolUnion = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'tool-1', name: 'Hammer' },
        { entityId: 'tool-1', systemId: 'sys-a', inherit: {} }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'tool-1', name: 'Hammer', enabled: false, label: 'kept' }],
      resolve: resolveTool,
      entityType: 'tools',
    });
    assert.equal(toolUnion[0].enabled, false);
    assert.equal(toolUnion[0].label, 'kept', 'and the in-system label survives the merge');
  });

  it('an in-system record that carries NO `enabled` still takes the resolved one', () => {
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'fire', name: 'Fire' },
        { entityId: 'fire', systemId: 'sys-a', inherit: {}, enabled: false }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'fire', name: 'Fire' }],
      resolve: resolveEssence,
      entityType: 'essences',
    });
    assert.equal(union[0].enabled, false, 'the world layer supplies keys the record does not carry');
  });

  it('`member` and `inherited` are emitted, and no shipped record carries them to contest it', () => {
    const union = unionScopedDefinitions({
      corpus: collidingCorpus(
        { id: 'comp-1' },
        { entityId: 'comp-1', systemId: 'sys-a', inherit: { category: false } }
      ),
      systemId: 'sys-a',
      systemDefinitions: [{ id: 'comp-1' }],
      resolve: resolveComponent,
      entityType: 'components',
    });
    assert.equal(union[0].member, true);
    // Both component sections since issue 1371 r18-store (M31); the omitted `essences` switch inherits.
    assert.deepEqual(union[0].inherited, { category: false, essences: true });
  });
});

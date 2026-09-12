/**
 * UNIT AND PROPERTY COVERAGE for the `1.34.0` world-essence equivalence core (issue 1654).
 *
 * The canonical key and what it deliberately sees through, candidacy and THE ZERO POINT, the
 * false-merge trap, the re-derived survivor election, the three refusal invariants, and the
 * tombstone leg.
 *
 * EVERY FIXTURE COMES FROM THE ONE SHARED BUILDER in `helpers/worldScopeCorpus.js`, and the
 * randomness is SEEDED (`seededRandom`) — `Math.random` is S2245 and fails the quality gate, and
 * a seeded generator is what makes a property failure reproducible from its seed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorldEssenceEquivalence,
  ESSENCE_DECLINE_REASONS,
  ESSENCE_MERGE_REFUSAL_REASONS,
  essenceSlugStem,
} from '../src/migration/worldEssenceEquivalence.js';
import { mintEssenceId } from '../src/ui/svelte/apps/manager/scoped/essenceScoped.js';
import {
  buildEssenceMergeCorpus,
  malformedCorpus,
  seededRandom,
} from './helpers/worldScopeCorpus.js';

/** The empty answer, spelled once so every totality assertion compares against the same shape. */
const EMPTY = {
  mergeMap: {},
  retired: {},
  mergedGroups: [],
  refusals: [],
  declined: [],
  orphaned: [],
};

/** A deterministic Fisher-Yates over a seeded generator. */
function shuffle(list, seed) {
  const random = seededRandom(seed);
  const shuffled = [...list];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1)) % (index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

/** The same corpus with its entity array and membership map re-ordered. */
function permuteCorpus(corpus, seed) {
  const membership = {};
  for (const key of shuffle(Object.keys(corpus.essenceScope.membership), seed + 1)) {
    membership[key] = corpus.essenceScope.membership[key];
  }
  return {
    ...corpus,
    essenceScope: {
      ...corpus.essenceScope,
      entities: shuffle(corpus.essenceScope.entities, seed),
      membership,
    },
  };
}

// ---------------------------------------------------------------------------
// Totality
// ---------------------------------------------------------------------------

test('the equivalence core is TOTAL and NON-THROWING on no input at all', () => {
  assert.deepEqual(buildWorldEssenceEquivalence(), EMPTY);
  assert.deepEqual(buildWorldEssenceEquivalence({}), EMPTY);
  assert.deepEqual(
    buildWorldEssenceEquivalence({ systems: 'nope', essenceScope: 5, componentScope: null }),
    EMPTY
  );
});

test('the equivalence core is TOTAL on a malformed corpus and an adversarial scope payload', () => {
  const result = buildWorldEssenceEquivalence({
    systems: malformedCorpus().systems,
    essenceScope: {
      entities: [null, 'x', { id: '' }, { id: 'e1' }, { id: 'e1', name: 'duplicate id' }],
      defaults: 'nope',
      membership: [null, { entityId: 'e1' }, { entityId: 'e1', systemId: 'sys-a' }],
    },
    componentScope: 'nope',
  });
  assert.deepEqual(result.mergeMap, {});
  assert.deepEqual(result.mergedGroups, []);
  // An id-less world entity is DROPPED; the surviving `e1` carries no name, so its key cannot be
  // canonicalised and it is declined rather than merged on an empty name.
  assert.deepEqual(result.declined, [
    {
      essenceId: 'e1',
      sections: ['name'],
      reason: ESSENCE_DECLINE_REASONS.uncanonicalisableKey,
    },
  ]);
});

test('a SELF-REFERENTIAL section value is declined rather than serialised', () => {
  const cyclic = {
    entityId: 'e2',
    systemId: 'sys-a',
    inherit: { effectSource: false, macro: false },
    effectSource: {},
    macro: null,
  };
  cyclic.effectSource.sourceComponentId = cyclic;
  const result = buildWorldEssenceEquivalence({
    systems: [{ id: 'sys-a', essenceDefinitions: [] }],
    essenceScope: {
      entities: [{ id: 'e2', name: 'Iron' }],
      defaults: {},
      membership: { 'e2|sys-a': cyclic },
    },
  });
  assert.deepEqual(result.declined, [
    {
      essenceId: 'e2',
      sections: ['effectSource'],
      reason: ESSENCE_DECLINE_REASONS.uncanonicalisableKey,
    },
  ]);
  assert.deepEqual(result.mergeMap, {});
});

// ---------------------------------------------------------------------------
// The canonical key (`#### D1`)
// ---------------------------------------------------------------------------

test('two world essences with the SAME NAME in different case are one essence', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'a1b2c3', name: 'IRON' }] },
      ],
    })
  );
  assert.deepEqual(result.mergedGroups, [
    { survivorId: 'iron', loserIds: ['a1b2c3'], systemIds: ['sys-a', 'sys-b'] },
  ]);
  assert.deepEqual(result.mergeMap, { 'sys-b': { essences: { a1b2c3: 'iron' } } });
});

test('an ABSENT, an EMPTY and an ALL-NULL effectSource block all compare EQUAL', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'e-a', name: 'Ash', omitSections: ['effectSource'] }] },
        { id: 'sys-b', essences: [{ id: 'e-b', name: 'Ash', effectSource: {} }] },
        {
          id: 'sys-c',
          essences: [
            {
              id: 'e-c',
              name: 'Ash',
              // REVERSED KEY ORDER, because key order is exactly the non-behavioural metadata
              // difference the canonical block exists to see through.
              effectSource: {
                associatedSystemItemId: null,
                sourceItemUuid: null,
                sourceComponentId: null,
              },
            },
          ],
        },
      ],
    })
  );
  assert.deepEqual(result.mergedGroups, [
    { survivorId: 'e-a', loserIds: ['e-b', 'e-c'], systemIds: ['sys-a', 'sys-b', 'sys-c'] },
  ]);
});

test('an EMPTY-STRING macro reads as null, and a DIFFERENT macro is a different essence', () => {
  const merged = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'aa1', name: 'Ash', macro: null }] },
        { id: 'sys-b', essences: [{ id: 'bb2', name: 'Ash', macro: '   ' }] },
      ],
    })
  );
  assert.deepEqual(merged.mergedGroups, [
    { survivorId: 'aa1', loserIds: ['bb2'], systemIds: ['sys-a', 'sys-b'] },
  ]);

  const split = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'aa1', name: 'Ash', macro: 'Macro.x' }] },
        { id: 'sys-b', essences: [{ id: 'bb2', name: 'Ash', macro: 'Macro.y' }] },
      ],
    })
  );
  assert.deepEqual(split.mergedGroups, []);
  assert.deepEqual(split.mergeMap, {});
});

test('`enabled` is NOT in the key: two essences differing only in it still merge', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'aa1', name: 'Ash', enabled: true }] },
        { id: 'sys-b', essences: [{ id: 'bb2', name: 'Ash', enabled: false }] },
      ],
    })
  );
  assert.deepEqual(result.mergedGroups, [
    { survivorId: 'aa1', loserIds: ['bb2'], systemIds: ['sys-a', 'sys-b'] },
  ]);
});

// ---------------------------------------------------------------------------
// Candidacy and THE ZERO POINT (`#### D2`)
// ---------------------------------------------------------------------------

test('THE ZERO POINT: a world essence with no live membership record never merges', () => {
  const spec = (member) => ({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: 'ghost', name: 'Iron', member }] },
    ],
  });

  const orphaned = buildWorldEssenceEquivalence(buildEssenceMergeCorpus(spec(false)));
  assert.deepEqual(orphaned.orphaned, [{ essenceId: 'ghost', name: 'Iron' }]);
  assert.deepEqual(orphaned.mergedGroups, []);
  assert.deepEqual(orphaned.mergeMap, {});
  assert.deepEqual(orphaned.retired, {});

  // THE MUTATION CONTROL. The only difference is the membership record, so the assertion above
  // pins the explicit member-count test rather than some other accident of the fixture.
  const merged = buildWorldEssenceEquivalence(buildEssenceMergeCorpus(spec(true)));
  assert.deepEqual(merged.orphaned, []);
  assert.deepEqual(merged.mergedGroups, [
    { survivorId: 'iron', loserIds: ['ghost'], systemIds: ['sys-a', 'sys-b'] },
  ]);
});

test('a membership record naming a system the corpus no longer holds is NOT live', () => {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: 'ghost', name: 'Iron', member: false }] },
    ],
  });
  corpus.essenceScope.membership['ghost|sys-deleted'] = {
    entityId: 'ghost',
    systemId: 'sys-deleted',
    inherit: { effectSource: false, macro: false },
    effectSource: { sourceComponentId: null },
    macro: null,
    enabled: true,
  };
  const result = buildWorldEssenceEquivalence(corpus);
  assert.deepEqual(result.orphaned, [{ essenceId: 'ghost', name: 'Iron' }]);
  assert.deepEqual(result.mergeMap, {});
});

test('candidacy compares the RESOLVED value, not the stored one', () => {
  const build = (worldMacro) =>
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.abc' }] },
        {
          id: 'sys-b',
          // STORED `macro` is null and the switch is ON, so only the RESOLVED read can see the
          // world default this system actually runs.
          essences: [{ id: 'xj7', name: 'Iron', macro: null, inherit: { macro: true } }],
        },
      ],
      worldDefaults: { xj7: { macro: worldMacro } },
    });

  const agreeing = buildWorldEssenceEquivalence(build('Macro.abc'));
  assert.deepEqual(agreeing.mergedGroups, [
    { survivorId: 'iron', loserIds: ['xj7'], systemIds: ['sys-a', 'sys-b'] },
  ]);

  const disagreeing = buildWorldEssenceEquivalence(build('Macro.zzz'));
  assert.deepEqual(disagreeing.mergedGroups, []);
});

test('an ABSENT world default reads as NO OPINION, never as disagreement', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'xj7', name: 'Iron', inherit: { macro: true } }] },
      ],
    })
  );
  assert.deepEqual(result.declined, []);
  assert.deepEqual(result.mergedGroups, [
    { survivorId: 'iron', loserIds: ['xj7'], systemIds: ['sys-a', 'sys-b'] },
  ]);
});

test('a world essence whose members DISAGREE is declined with the section they disagreed on', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.a' }] },
        { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.b' }] },
        { id: 'sys-c', essences: [{ id: 'zz9', name: 'Iron', macro: 'Macro.a' }] },
      ],
    })
  );
  assert.deepEqual(result.declined, [
    {
      essenceId: 'iron',
      sections: ['macro'],
      reason: ESSENCE_DECLINE_REASONS.sectionDisagreement,
    },
  ]);
  assert.deepEqual(result.mergedGroups, []);
  assert.deepEqual(result.mergeMap, {});
});

// ---------------------------------------------------------------------------
// The false-merge trap (`#### D1`)
// ---------------------------------------------------------------------------

test('equal sourceComponentIds from two REFUSED component pairs never merge', () => {
  // Both systems carry `comp-1` on the world ROSTER but hold NO membership record for it, which is
  // exactly the state a `(system, 'components')` pair `1.30.0` refused leaves behind: no lift, no
  // re-key, no membership, so the id on the essence is still a raw system-local string.
  const refused = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1', member: false }],
        },
        {
          id: 'sys-b',
          essences: [{ id: 'kt9', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1', member: false }],
        },
      ],
    })
  );
  assert.deepEqual(refused.refusals, [
    {
      survivorId: 'iron',
      loserIds: ['kt9'],
      systemIds: ['sys-a', 'sys-b'],
      reason: ESSENCE_MERGE_REFUSAL_REASONS.unresolvedEffectSourceComponent,
    },
  ]);
  assert.deepEqual(refused.mergeMap, {});
  assert.deepEqual(refused.retired, {});
  assert.deepEqual(refused.mergedGroups, []);

  // THE MUTATION CONTROL: the same corpus with both systems MEMBERS of the world component. The
  // id now means the same thing in both, so the merge is not a guess.
  const lifted = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1' }],
        },
        {
          id: 'sys-b',
          essences: [{ id: 'kt9', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1' }],
        },
      ],
    })
  );
  assert.deepEqual(lifted.refusals, []);
  assert.deepEqual(lifted.mergeMap, { 'sys-b': { essences: { kt9: 'iron' } } });
});

test('a component id on NO world roster at all is refused too', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }] },
        { id: 'sys-b', essences: [{ id: 'kt9', name: 'Iron', sourceComponentId: 'comp-1' }] },
      ],
    })
  );
  assert.equal(
    result.refusals[0].reason,
    ESSENCE_MERGE_REFUSAL_REASONS.unresolvedEffectSourceComponent
  );
  assert.deepEqual(result.mergeMap, {});
});

test('a DOCUMENT UUID effect source is globally addressable and merges freely', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'Item.abc123' }] },
        { id: 'sys-b', essences: [{ id: 'kt9', name: 'Iron', sourceComponentId: 'Item.abc123' }] },
      ],
    })
  );
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.mergeMap, { 'sys-b': { essences: { kt9: 'iron' } } });
});

// ---------------------------------------------------------------------------
// Survivor election (`#### D3`)
// ---------------------------------------------------------------------------

test('SLUG PREFERENCE beats corpus position: a readable id never loses to a generated one', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'kTz9QpLm2xR4vB1a', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron' }] },
      ],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'iron');
  assert.deepEqual(result.mergedGroups[0].loserIds, ['kTz9QpLm2xR4vB1a']);
});

test('the `<stem>-<n>` form `mintEssenceId` produces outranks a non-slug id', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'zzz9', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'iron-2', name: 'Iron' }] },
      ],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'iron-2');
});

test('the bare stem outranks the suffixed one', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron-2', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron' }] },
      ],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'iron');
});

test('election RE-DERIVES corpus position and never reads `entities` array order', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'aaa1', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'bbb2', name: 'Iron' }] },
      ],
      // The already-migrated world has the YOUNGER essence first, which is precisely what GM edits
      // and copy-import appends do to a persisted array.
      entityOrder: ['bbb2', 'aaa1'],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'aaa1');
});

test('a candidate WITH an in-system row outranks one with none, whatever the array says', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'aaa1', name: 'Iron', inSystem: false }] },
        { id: 'sys-b', essences: [{ id: 'bbb2', name: 'Iron' }] },
      ],
      entityOrder: ['aaa1', 'bbb2'],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'bbb2');
});

test('ARRAY POSITION decides only when no candidate has a surviving in-system member', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'bbb2', name: 'Iron', inSystem: false }] },
        { id: 'sys-b', essences: [{ id: 'aaa1', name: 'Iron', inSystem: false }] },
      ],
      entityOrder: ['aaa1', 'bbb2'],
    })
  );
  assert.equal(result.mergedGroups[0].survivorId, 'aaa1');
});

test('the local slug stem agrees with `mintEssenceId` on an unclaimed roster', () => {
  // The migration MUST NOT import the UI leaf that owns `mintEssenceId`, so the stem derivation is
  // duplicated deliberately. This is the pin that keeps the duplicate faithful.
  const names = ['Iron', '  IRON  ', 'Fire & Ice', 'new essence', '***', '', '   ', '123', 'Élan'];
  for (const name of names) {
    assert.equal(
      essenceSlugStem(name),
      mintEssenceId(name, []),
      `stem for ${JSON.stringify(name)}`
    );
  }
  assert.equal(essenceSlugStem(null), 'essence');
  assert.equal(essenceSlugStem(undefined), 'essence');
});

// ---------------------------------------------------------------------------
// The map and its three refusal invariants (`#### D4`)
// ---------------------------------------------------------------------------

test('OUTPUT UNIQUENESS refuses a merge that would make one system emit a duplicate id', () => {
  const spec = (inSystem) => ({
    systems: [
      {
        id: 'sys-a',
        essences: [
          // A ROW in `sys-a` whose membership record lives in `sys-b`: the two invariants that
          // read `essenceDefinitions` see it, and the membership post-condition does not.
          { id: 'iron', name: 'Iron', member: false, inSystem },
          { id: 'kt9', name: 'Iron' },
        ],
      },
      { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron' }] },
    ],
  });

  const refused = buildWorldEssenceEquivalence(buildEssenceMergeCorpus(spec(true)));
  assert.deepEqual(refused.refusals, [
    {
      survivorId: 'iron',
      loserIds: ['kt9'],
      systemIds: ['sys-a'],
      reason: ESSENCE_MERGE_REFUSAL_REASONS.outputIdCollision,
    },
  ]);
  assert.deepEqual(refused.mergeMap, {});
  assert.deepEqual(refused.retired, {});

  // THE MUTATION CONTROL: drop the colliding row and the same merge is safe.
  const allowed = buildWorldEssenceEquivalence(buildEssenceMergeCorpus(spec(false)));
  assert.deepEqual(allowed.refusals, []);
  assert.deepEqual(allowed.mergeMap, { 'sys-a': { essences: { kt9: 'iron' } } });
});

test('MEMBERSHIP-KEY UNIQUENESS catches what the other two invariants cannot see', () => {
  // `kt9` holds a membership record for `sys-a` with NO in-system definition row, so the emitted-id
  // check has nothing to look at — `sys-a` emits `iron` exactly once either way — and only the
  // rebuilt-key post-condition can see that the merge would collide `iron|sys-a` and silently drop
  // `kt9`'s authored overrides for that system.
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [
            { id: 'iron', name: 'Iron' },
            { id: 'kt9', name: 'Iron', inSystem: false },
          ],
        },
      ],
    })
  );
  assert.deepEqual(result.refusals, [
    {
      survivorId: 'iron',
      loserIds: ['kt9'],
      systemIds: ['sys-a'],
      reason: ESSENCE_MERGE_REFUSAL_REASONS.membershipKeyCollision,
    },
  ]);
  assert.deepEqual(result.mergeMap, {});
  assert.deepEqual(result.retired, {});
});

test('a NATIVE duplicate of a group member’s id refuses that group, as `1.30.0` does', () => {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: 'kt9', name: 'Iron' }] },
    ],
  });
  // A hand-edited corpus carrying the SAME row id twice in one system. `1.30.0` refuses a pair
  // holding one of these on its own ("such a system already has an unreachable definition and must
  // not have a lift layered on top of it"), and the same reading applies to a merge INTO that id.
  const [first] = corpus.systems[0].essenceDefinitions;
  corpus.systems[0].essenceDefinitions.push({ ...first });
  const result = buildWorldEssenceEquivalence(corpus);
  assert.deepEqual(result.refusals, [
    {
      survivorId: 'iron',
      loserIds: ['kt9'],
      systemIds: ['sys-a'],
      reason: ESSENCE_MERGE_REFUSAL_REASONS.outputIdCollision,
    },
  ]);
  assert.deepEqual(result.mergeMap, {});
});

test('a NATIVE duplicate NO group touches refuses nothing', () => {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: 'kt9', name: 'Iron' }] },
      { id: 'sys-c', essences: [{ id: 'unrelated', name: 'Quartz' }] },
    ],
  });
  const [only] = corpus.systems[2].essenceDefinitions;
  corpus.systems[2].essenceDefinitions.push({ ...only });
  const result = buildWorldEssenceEquivalence(corpus);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.mergeMap, { 'sys-b': { essences: { kt9: 'iron' } } });
});

test('the merge map is DISJOINT and a second application is a no-op, across every fixture', () => {
  for (const [seed, corpus] of everyMergeFixture().entries()) {
    const { mergeMap } = buildWorldEssenceEquivalence(corpus);
    for (const [systemId, legs] of Object.entries(mergeMap)) {
      const map = legs.essences ?? {};
      const keys = new Set(Object.keys(map));
      for (const survivorId of Object.values(map)) {
        assert.ok(
          !keys.has(survivorId),
          `fixture ${seed}: ${systemId} maps onto a re-keyed id ${survivorId}`
        );
      }
      // IDEMPOTENCE follows from disjointness, and is asserted directly because that is the
      // property the migration actually relies on when it applies the map.
      for (const [loserId, survivorId] of Object.entries(map)) {
        assert.equal(map[survivorId] ?? survivorId, survivorId, `fixture ${seed}: ${loserId}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The tombstone leg (`#### D12`)
// ---------------------------------------------------------------------------

test('every retired id keeps the four identity fields and the systems it lived in', () => {
  const result = buildWorldEssenceEquivalence(
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
        {
          id: 'sys-b',
          essences: [
            {
              id: 'kt9',
              name: 'Iron',
              icon: 'fas fa-anvil',
              colorToken: 'amber',
              description: 'Refined iron',
            },
          ],
        },
      ],
    })
  );
  assert.deepEqual(result.retired, {
    kt9: {
      name: 'Iron',
      icon: 'fas fa-anvil',
      colorToken: 'amber',
      description: 'Refined iron',
      systems: ['sys-b'],
    },
  });
  // The SURVIVOR is never tombstoned: its id is still live.
  assert.ok(!('iron' in result.retired));
});

// ---------------------------------------------------------------------------
// Determinism (`#### D3`)
// ---------------------------------------------------------------------------

test('the answer is BYTE-IDENTICAL on a re-run, across every fixture', () => {
  for (const [seed, corpus] of everyMergeFixture().entries()) {
    const once = JSON.stringify(buildWorldEssenceEquivalence(corpus));
    const twice = JSON.stringify(buildWorldEssenceEquivalence(corpus));
    assert.equal(once, twice, `fixture ${seed} is not re-runnable`);
  }
});

test('the PARTITION is permutation-invariant when the corpus decides every election', () => {
  // Every candidate here has an in-system row, so election never reaches the array-position
  // tie-break and the WHOLE answer — not merely the partition — is invariant under a shuffle.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      {
        id: 'sys-a',
        essences: [
          { id: 'iron', name: 'Iron' },
          { id: 'p7q', name: 'Ash' },
        ],
      },
      {
        id: 'sys-b',
        essences: [
          { id: 'zz1', name: 'IRON' },
          { id: 'ash', name: 'ash' },
        ],
      },
      { id: 'sys-c', essences: [{ id: 'mm4', name: 'Iron ' }] },
    ],
  });
  const expected = JSON.stringify(buildWorldEssenceEquivalence(corpus));
  for (let seed = 1; seed <= 12; seed += 1) {
    assert.equal(
      JSON.stringify(buildWorldEssenceEquivalence(permuteCorpus(corpus, seed))),
      expected,
      `seed ${seed} changed the answer`
    );
  }
  assert.deepEqual(JSON.parse(expected).mergedGroups, [
    { survivorId: 'iron', loserIds: ['zz1', 'mm4'], systemIds: ['sys-a', 'sys-b', 'sys-c'] },
    { survivorId: 'ash', loserIds: ['p7q'], systemIds: ['sys-a', 'sys-b'] },
  ]);
});

/**
 * Every corpus the property assertions above run over, in one place so a new scenario joins them
 * all at once.
 *
 * @returns {Array<object>}
 */
function everyMergeFixture() {
  return [
    buildEssenceMergeCorpus({ systems: [] }),
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: 'a1b2c3', name: 'IRON' }] },
      ],
    }),
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [
            { id: 'iron', name: 'Iron' },
            { id: 'kt9', name: 'Iron', inSystem: false },
          ],
        },
      ],
    }),
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1' }],
        },
        {
          id: 'sys-b',
          essences: [{ id: 'kt9', name: 'Iron', sourceComponentId: 'comp-1' }],
          components: [{ id: 'comp-1' }],
        },
        { id: 'sys-c', essences: [{ id: 'ghost', name: 'Iron', member: false }] },
      ],
    }),
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.a' }] },
        { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.b' }] },
        { id: 'sys-c', essences: [{ id: 'zz9', name: 'Iron', macro: 'Macro.a' }] },
      ],
    }),
  ];
}

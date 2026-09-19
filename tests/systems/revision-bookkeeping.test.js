/**
 * Every member of {@link RevisionBookkeeping} against its injected seams (issue 1694), including
 * the two "I cannot say" domain inputs and the independence of the delta slot from the pending set.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALL_INVALIDATION_DOMAINS,
  INVALIDATION_DOMAINS,
} from '../../src/systems/invalidationDomains.js';
import { RevisionBookkeeping } from '../../src/systems/revisionBookkeeping.js';
import { REVISION_SCOPES } from '../../src/systems/revisionTokens.js';

const ENTITY = 'things';
const DOMAINS = [...ALL_INVALIDATION_DOMAINS];

/** Synthetic seams, so an assertion proves the injected function was consulted rather than a twin
 * of the manager's own. */
function bookkeeping(overrides = {}) {
  return new RevisionBookkeeping({
    entityScope: ENTITY,
    systemScopeOf: (systemId) => `thing:${systemId}`,
    domainsForFields: (fields) => fields.map((field) => `domain:${field}`),
    ownersOf: (recordId) => [recordId],
    ...overrides,
  });
}

/** A reload delta in the shape {@link corpusDelta} returns. */
function delta(perRecord, { changed = true, reordered = false } = {}) {
  return { changed, reordered, perRecord: new Map(perRecord) };
}

const factScopes = (systemId, domains) =>
  domains.map((domain) => REVISION_SCOPES.facts(domain, systemId));

/** The scopes among `candidates` whose token moved while `work` ran, sorted. */
function advancedBy(ledger, candidates, work) {
  const before = candidates.map((scope) => ledger.read(scope));
  work();
  return candidates.filter((scope, index) => ledger.read(scope) !== before[index]).sort();
}

describe('read and the entity scopes', () => {
  it('reads zero for a scope nothing has advanced', () => {
    assert.equal(bookkeeping().read(ENTITY), 0);
  });

  it('advances the entity scope and every named system, skipping a nullish id', () => {
    const ledger = bookkeeping();
    const candidates = [ENTITY, 'thing:a', 'thing:b', 'thing:c', 'thing:null', 'thing:undefined'];

    assert.deepEqual(
      advancedBy(ledger, candidates, () => ledger.advanceEntityScopes('a', null, 'b', undefined)),
      ['thing:a', 'thing:b', ENTITY]
    );
  });

  it('advances the entity scope alone when the mutation names no system', () => {
    const ledger = bookkeeping();

    ledger.advanceEntityScopes();

    assert.equal(ledger.read(ENTITY), 1);
  });

  it('shares no counters with a second bookkeeping in the same process', () => {
    const ledger = bookkeeping();
    const other = bookkeeping();

    ledger.advanceEntityScopes('a');

    assert.equal(other.read(ENTITY), 0);
  });
});

describe('the two "I cannot say" domain inputs', () => {
  it('advances only the named domains when the mutation names some', () => {
    const ledger = bookkeeping();
    const candidates = [...factScopes('a', DOMAINS), ...factScopes('b', DOMAINS)];

    assert.deepEqual(
      advancedBy(ledger, candidates, () =>
        ledger.advanceFactScopes([INVALIDATION_DOMAINS.LABELLING], 'a')
      ),
      factScopes('a', [INVALIDATION_DOMAINS.LABELLING])
    );
  });

  it('advances EVERY fact scope for an omitted domain set and for an explicitly empty one', () => {
    for (const domains of [null, undefined, []]) {
      const ledger = bookkeeping();
      const candidates = factScopes('a', DOMAINS);

      assert.deepEqual(
        advancedBy(ledger, candidates, () => ledger.advanceFactScopes(domains, 'a')).sort(),
        [...candidates].sort(),
        `an ${domains ? 'explicitly empty' : 'omitted'} domain set rules no fact class out`
      );
    }
  });

  it('records an omitted domain set as every domain, an explicitly empty one as nothing', () => {
    const omitted = bookkeeping();
    const explicitlyEmpty = bookkeeping();

    omitted.attributeChange(null, 'a');
    explicitlyEmpty.attributeChange([], 'a');

    assert.deepEqual(omitted.drainAttribution(), [{ systemId: 'a', domains: DOMAINS }]);
    assert.deepEqual(
      explicitlyEmpty.drainAttribution(),
      [],
      'attributable to nothing poisons the whole announcement'
    );
  });

  it('skips a nullish system id rather than minting a null-owner fact scope', () => {
    const ledger = bookkeeping();

    ledger.advanceFactScopes([INVALIDATION_DOMAINS.LABELLING], null);

    assert.equal(ledger.read(REVISION_SCOPES.facts(INVALIDATION_DOMAINS.LABELLING, null)), 0);
  });
});

describe('attribution', () => {
  it('advances the fact scopes it records', () => {
    const ledger = bookkeeping();

    ledger.attributeChange([INVALIDATION_DOMAINS.NARRATIVE], 'a');

    assert.equal(ledger.read(REVISION_SCOPES.facts(INVALIDATION_DOMAINS.NARRATIVE, 'a')), 1);
  });

  it('accumulates between announcements and resets on the drain', () => {
    const ledger = bookkeeping();

    ledger.attributeChange([INVALIDATION_DOMAINS.LABELLING], 'a');
    ledger.attributeChange([INVALIDATION_DOMAINS.NARRATIVE], 'b');

    assert.deepEqual(ledger.drainAttribution(), [
      { systemId: 'a', domains: [INVALIDATION_DOMAINS.LABELLING] },
      { systemId: 'b', domains: [INVALIDATION_DOMAINS.NARRATIVE] },
    ]);
    assert.deepEqual(ledger.drainAttribution(), []);
  });
});

describe('advanceChangedRecords', () => {
  const moved = delta([
    ['r1', { kind: 'changed', fields: ['name'], before: { owner: 'a' }, after: { owner: 'b' } }],
  ]);
  const ownersOf = (_recordId, entry) =>
    [entry.before?.owner, entry.after?.owner].filter((owner) => owner != null);

  it('advances the fact scopes of every owner the injected seam names', () => {
    const ledger = bookkeeping({ ownersOf });
    const candidates = [...factScopes('a', ['domain:name']), ...factScopes('b', ['domain:name'])];

    assert.deepEqual(
      advancedBy(ledger, candidates, () => ledger.advanceChangedRecords(moved)).sort(),
      [...candidates].sort()
    );
  });

  it('returns the systems it touched, for the caller entity advance', () => {
    const ledger = bookkeeping({ ownersOf });

    assert.deepEqual([...ledger.advanceChangedRecords(moved)], ['a', 'b']);
  });

  it('records NOTHING, because a replicated change is announced from the delta', () => {
    const ledger = bookkeeping({ ownersOf });

    ledger.advanceChangedRecords(moved);

    assert.deepEqual(
      ledger.drainAttribution(),
      [],
      'recording it here would widen the next LOCAL announcement'
    );
  });
});

describe('the reload delta slot', () => {
  const renamed = delta([['r1', { kind: 'changed', fields: ['name'] }]]);

  it('holds nothing before any reload', () => {
    assert.equal(bookkeeping().consumeReloadDelta(), null);
  });

  it('is one-shot, so no stale delta is ever readable', () => {
    const ledger = bookkeeping();

    ledger.holdReloadDelta(renamed);

    assert.equal(ledger.consumeReloadDelta(), renamed);
    assert.equal(ledger.consumeReloadDelta(), null);
  });

  it('is cleared by the null hold a snapshot-less reload makes', () => {
    const ledger = bookkeeping();

    ledger.holdReloadDelta(renamed);
    ledger.holdReloadDelta(null);

    assert.equal(ledger.consumeReloadDelta(), null);
  });

  it('is independent of the pending set in both directions', () => {
    const ledger = bookkeeping();

    ledger.attributeChange([INVALIDATION_DOMAINS.LABELLING], 'a');
    ledger.holdReloadDelta(renamed);
    ledger.consumeReplicatedChangeScopes();

    assert.deepEqual(
      ledger.drainAttribution(),
      [{ systemId: 'a', domains: [INVALIDATION_DOMAINS.LABELLING] }],
      'consuming a replicated delta must not disturb a local attribution mid-save'
    );

    ledger.holdReloadDelta(renamed);
    ledger.drainAttribution();

    assert.equal(ledger.consumeReloadDelta(), renamed);
  });
});

describe('consumeReplicatedChangeScopes', () => {
  it('names one scope per owner, with the domains the moved fields belong to', () => {
    const ledger = bookkeeping({
      ownersOf: (_recordId, entry) => [entry.before.owner, entry.after.owner],
    });

    ledger.holdReloadDelta(
      delta([['r1', { fields: ['name'], before: { owner: 'a' }, after: { owner: 'b' } }]])
    );

    assert.deepEqual(ledger.consumeReplicatedChangeScopes(), [
      { systemId: 'a', domains: ['domain:name'] },
      { systemId: 'b', domains: ['domain:name'] },
    ]);
  });

  it('yields ONE null-owner scope for an entry naming no owner', () => {
    const ledger = bookkeeping({ ownersOf: () => [] });

    ledger.holdReloadDelta(delta([['r1', { fields: ['name'] }]]));

    assert.deepEqual(ledger.consumeReplicatedChangeScopes(), [
      { systemId: null, domains: ['domain:name'] },
    ]);
  });

  it('yields nothing for a reordering or an unchanged reload, consuming the delta anyway', () => {
    for (const held of [
      delta([['r1', { fields: ['name'] }]], { reordered: true }),
      delta([], { changed: false }),
    ]) {
      const ledger = bookkeeping();
      ledger.holdReloadDelta(held);

      assert.deepEqual(ledger.consumeReplicatedChangeScopes(), []);
      assert.equal(ledger.consumeReloadDelta(), null);
    }
  });

  it('yields nothing before any reload', () => {
    assert.deepEqual(bookkeeping().consumeReplicatedChangeScopes(), []);
  });
});

describe('domainsForEdit', () => {
  const stored = { id: 'r1', name: 'Stored', volatile: 1 };

  it('falls back to every domain when either side is missing', () => {
    const ledger = bookkeeping();

    assert.deepEqual(ledger.domainsForEdit(null, stored), DOMAINS);
    assert.deepEqual(ledger.domainsForEdit(stored, null), DOMAINS);
  });

  it('names the domains of the fields that actually moved', () => {
    const ledger = bookkeeping();

    assert.deepEqual(ledger.domainsForEdit(stored, { ...stored, name: 'Renamed' }), [
      'domain:name',
    ]);
  });

  it('falls back to every domain when the comparison can pair no record by id', () => {
    const ledger = bookkeeping();

    assert.deepEqual(ledger.domainsForEdit({ name: 'Stored' }, { name: 'Renamed' }), DOMAINS);
  });

  it('names nothing when the edit changed nothing the projection carries', () => {
    const ledger = bookkeeping({ project: ({ id, name }) => ({ id, name }) });

    assert.deepEqual(ledger.domainsForEdit(stored, { ...stored, volatile: 2 }), []);
  });
});

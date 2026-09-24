/**
 * The revision, attribution and reload-delta bookkeeping both crafting-data managers own.
 *
 * One per manager and never a module singleton: two managers in one process must not share
 * counters. It is never handed to a read-only consumer either, because the revision-token
 * contract in `data-models` admits only the managers as minters; a consumer takes a bound `read`.
 */
import { PendingChangeDomains } from './craftingDataChange.js';
import { ALL_INVALIDATION_DOMAINS } from './invalidationDomains.js';
import { corpusDelta, REVISION_SCOPES, RevisionRegistry } from './revisionTokens.js';

export class RevisionBookkeeping {
  /**
   * The per-manager differences arrive as one scope and four functions, so the bookkeeping never
   * reaches back through its owner. `ownersOf(recordId, entry)` yields the systems one delta entry
   * belongs to: the record id for a crafting system, the before/after pair for a recipe. `project`
   * is the comparison projection `corpusDelta` reads.
   */
  constructor({
    entityScope,
    systemScopeOf,
    domainsForFields,
    ownersOf,
    project = (record) => record,
  }) {
    this._entityScope = entityScope;
    this._systemScopeOf = systemScopeOf;
    this._domainsForFields = domainsForFields;
    this._ownersOf = ownersOf;
    this._project = project;
    this._revisions = new RevisionRegistry();
    this._pending = new PendingChangeDomains();
    // Independent of the pending set on purpose: Foundry fires `updateSetting` inside the awaited
    // `game.settings.set`, so on the writer's own client a replicated reload lands between a
    // save's attribution and its notifier's drain.
    this._reloadDelta = null;
  }

  /** The current revision token of one scope. */
  read(scope) {
    return this._revisions.read(scope);
  }

  /** Advance the entity scope and the narrow scope of every named system. */
  advanceEntityScopes(...systemIds) {
    const scopes = systemIds
      .filter((systemId) => systemId != null)
      .map((systemId) => this._systemScopeOf(systemId));
    this._revisions.advance(this._entityScope, ...scopes);
  }

  /** Advance the `facts:<domain>:<systemId>` token of every named pair. An omitted or an
   * explicitly empty `domains` both advance every fact scope of every named system, because in
   * neither case can a fact class be ruled out. */
  advanceFactScopes(domains, ...systemIds) {
    const advanced =
      Array.isArray(domains) && domains.length > 0 ? domains : ALL_INVALIDATION_DOMAINS;
    for (const systemId of systemIds) {
      if (systemId == null) continue;
      this._revisions.advance(...advanced.map((domain) => REVISION_SCOPES.facts(domain, systemId)));
    }
  }

  /** Advance the fact scopes of every record a reload delta reports changed, returning the systems
   * it touched. It records nothing: a replicated change is announced from the delta rather than
   * from the pending set, so recording it would widen the next local announcement. */
  advanceChangedRecords(delta) {
    const touched = new Set();
    for (const [recordId, entry] of delta.perRecord) {
      const owners = [...this._ownersOf(recordId, entry)];
      for (const systemId of owners) touched.add(systemId);
      this.advanceFactScopes(this._domainsForFields(entry.fields), ...owners);
    }
    return touched;
  }

  /** Attribute a local mutation: advance its fact scopes and hold it for the next announcement. */
  attributeChange(domains, ...systemIds) {
    this.advanceFactScopes(domains, ...systemIds);
    this._pending.record(domains, ...systemIds);
  }

  /** Take everything attributed since the last drain, and reset. */
  drainAttribution() {
    return this._pending.drain();
  }

  /** Hold one reload's delta. Every reload calls this twice — with `null` before it reads its
   * snapshot, then with the computed delta — so neither a stale delta nor a snapshot-less reload
   * leaves anything readable. */
  holdReloadDelta(delta) {
    this._reloadDelta = delta;
  }

  /** The delta from the most recent reload, cleared by this read. One-shot: a consumer re-reading
   * a retained delta would invalidate work twice for one change. */
  consumeReloadDelta() {
    const delta = this._reloadDelta;
    this._reloadDelta = null;
    return delta;
  }

  /** The invalidation scopes of the most recent replicated change. A `reordered` delta yields
   * none, which every consumer routes broadly; an entry naming no owner yields one null-owner
   * scope rather than vanishing. */
  consumeReplicatedChangeScopes() {
    const delta = this.consumeReloadDelta();
    if (!delta?.changed || delta.reordered) return [];
    const scopes = [];
    for (const [recordId, entry] of delta.perRecord) {
      const domains = this._domainsForFields(entry.fields);
      const owners = new Set(this._ownersOf(recordId, entry));
      if (owners.size === 0) owners.add(null);
      for (const systemId of owners) scopes.push({ systemId, domains });
    }
    return scopes;
  }

  /** The domains a replacement of one stored record belongs to, read off the fields that moved
   * through the same comparison a reload runs, so a local edit and its replicated copy agree. */
  domainsForEdit(previous, next) {
    if (!previous || !next) return [...ALL_INVALIDATION_DOMAINS];
    const delta = corpusDelta([previous], [next], { project: this._project });
    if (delta.reordered) return [...ALL_INVALIDATION_DOMAINS];
    const entry = [...delta.perRecord.values()][0];
    return entry ? this._domainsForFields(entry.fields) : [];
  }
}

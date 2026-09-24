/**
 * The scoped crafting-data change signal (issue 1078), producer half: an UNPUBLISHED
 * `Hooks.callAll`, absent from `FABRICATE_HOOKS`, so promoting it owes a three-segment name, a
 * `schemaVersion`, a `src/config/hooks.js` entry and a DOMAIN.md row. It is a real hook for core's
 * snapshot iteration and per-listener `Hooks.onError` isolation (13.351 and 14.365 alike), and
 * because tests swap `globalThis.Hooks`. The payload is `{ source: 'recipes' | 'systems', scopes }`
 * with one `{ systemId, domains }` scope per record-owner; an empty `scopes` routes broadly
 * (`data-models/spec.md` § Invalidation Domains).
 */

import { ALL_INVALIDATION_DOMAINS } from './invalidationDomains.js';

/** Mirrored as a literal by the import-free `foundryHooks.js` UI bridge, and test-pinned to it. */
export const CRAFTING_DATA_CHANGED_HOOK = 'fabricate.craftingDataChanged';

/** A frozen payload merged by system; one scope with no domains makes it all unattributable. */
export function craftingDataChange({ source, scopes = [] }) {
  const bySystem = new Map();
  for (const scope of scopes) {
    const domains = Array.isArray(scope?.domains) ? scope.domains : [];
    if (domains.length === 0) return Object.freeze({ source, scopes: Object.freeze([]) });
    const systemId = scope?.systemId ?? null;
    const held = bySystem.get(systemId) ?? new Set();
    for (const domain of domains) held.add(domain);
    bySystem.set(systemId, held);
  }
  const merged = [...bySystem].map(([systemId, domains]) =>
    Object.freeze({ systemId, domains: Object.freeze([...domains]) })
  );
  return Object.freeze({ source, scopes: Object.freeze(merged) });
}

/** Emit on an injected `callAll`, else on `globalThis.Hooks`, read at call time. */
export function emitCraftingDataChanged(change, callAll = null) {
  if (typeof callAll === 'function') {
    callAll(CRAFTING_DATA_CHANGED_HOOK, change);
    return;
  }
  globalThis.Hooks?.callAll?.(CRAFTING_DATA_CHANGED_HOOK, change);
}

/**
 * The domains `change.domains` attributes to one record: a flat array covers every named record,
 * and a `Map` or object keyed by record id is the per-record batch form (no production caller yet;
 * issue 1092 owes it one, else delete the branch). `null` means the change said nothing, read as
 * every domain, unlike an explicit `[]`, which is unattributable.
 */
export function domainsForRecord(change, recordId) {
  const domains = change?.domains;
  if (domains == null) return null;
  if (Array.isArray(domains)) return domains;
  if (domains instanceof Map) return domains.get(recordId) ?? null;
  if (typeof domains === 'object') return domains[recordId] ?? null;
  return null;
}

/**
 * Domains attributed between a mutation and its announcement: `save()` records and the notifier
 * drains, since several paths save without announcing. An unannounced save's domains ride the next
 * announcement, over-broad at worst and never stale.
 */
export class PendingChangeDomains {
  constructor() {
    this._pending = new Map();
    this._unattributable = false;
  }

  /**
   * Omitted or nullish `domains` means every domain; an EXPLICIT `[]` is unattributable and poisons
   * the whole pending set until the drain, so another leg's domains never pass for the batch's.
   */
  record(domains, ...systemIds) {
    if (Array.isArray(domains) && domains.length === 0) {
      this._unattributable = true;
      return;
    }
    const owners = systemIds.length > 0 ? systemIds : [null];
    const named = Array.isArray(domains) ? domains : ALL_INVALIDATION_DOMAINS;
    for (const systemId of owners) {
      const key = systemId ?? null;
      const held = this._pending.get(key) ?? new Set();
      for (const domain of named) held.add(domain);
      this._pending.set(key, held);
    }
  }

  /** Take and reset; empty when nothing was recorded or anything was unattributable. */
  drain() {
    const unattributable = this._unattributable;
    const scopes = unattributable
      ? []
      : [...this._pending].map(([systemId, domains]) => ({ systemId, domains: [...domains] }));
    this._pending.clear();
    this._unattributable = false;
    return scopes;
  }
}

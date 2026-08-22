/**
 * @module craftingDataChange
 *
 * The **scoped crafting-data change signal** (issue 1078 part B1, under #1070) — the producer
 * half.
 *
 * ## It is an UNPUBLISHED `Hooks.callAll`
 *
 * `fabricate.craftingDataChanged` is emitted through `globalThis.Hooks.callAll` and is
 * DELIBERATELY absent from `FABRICATE_HOOKS` / `game.fabricate.api.HOOKS`. `src/config/hooks.js`
 * states the convention outright: only hooks intended as a documented integration surface live
 * there, and "lower-level internal signals … are not part of this contract and may change
 * without notice". Anything that promotes this one owes it the three-segment
 * `fabricate.<domain>.<event>` name, a `schemaVersion`, an entry in `src/config/hooks.js` and
 * a row in `DOMAIN.md`.
 *
 * Three things a hand-rolled module-local emitter would have cost, and the reason this is a
 * real hook rather than a private listener list:
 *
 * - **Snapshot iteration.** Foundry's `Hooks.callAll` iterates `Array.from(this.#events[hook])`,
 *   so a listener unsubscribing mid-dispatch cannot corrupt iteration or starve later
 *   listeners. `GatheringView.svelte` registers inside `$effect`, whose teardown unsubscribes.
 * - **Per-listener isolation.** Each listener is wrapped in `try/catch` and throws are routed to
 *   `Hooks.onError`, so one store throwing cannot starve the other five.
 *
 * Both verified in installed Foundry source and byte-identical in 13.351 and 14.365 — the only
 * difference anywhere in `client/helpers/hooks.mjs` between the two is `onError`'s
 * `instanceof Error` becoming `Error.isError`, which is not on this path.
 * - **The test seam.** `globalThis.Hooks` is read at CALL time and is replaced by ~20 test
 *   files, which is how a simulated two-client fixture gives each client its own bus.
 *
 * **The four module-namespaced legacy hooks keep emitting their current payloads unchanged.**
 * They remain the third-party surface; this signal carries the delta the player shell narrows
 * on.
 *
 * ## The payload
 *
 * ```js
 * { source: 'recipes' | 'systems', scopes: [{ systemId, domains: [...] }] }
 * ```
 *
 * `scopes` is PER RECORD-OWNER, never a flat union, because a batch that rewrote system A's
 * components and system B's name would otherwise apply both domain sets to both systems — the
 * over-broad invalidation this issue exists to remove, at batch scale.
 *
 * An EMPTY `scopes` array, or an empty domain union, means "changed, but attributable to
 * nothing" — a corpus reordering is the production-reachable producer — and every consumer
 * routes it BROADLY. That is the fail-safe direction: over-broad invalidation is a performance
 * bug, a stale read model is a correctness one.
 */

import { ALL_INVALIDATION_DOMAINS } from './invalidationDomains.js';

/**
 * The unpublished hook name. Mirrored as a literal in
 * `src/ui/svelte/util/foundryBridge.js` — which deliberately imports nothing, because ~75
 * mounted-component harnesses declare that module and every one of them would have to declare
 * a new transitive dependency. `tests/util/foundry-bridge-subscriptions.test.js` pins the two
 * against each other.
 *
 * @type {string}
 */
export const CRAFTING_DATA_CHANGED_HOOK = 'fabricate.craftingDataChanged';

/**
 * One record-owner's contribution to a change.
 *
 * @typedef {object} CraftingDataScope
 * @property {string|null} systemId The crafting system the facts belong to, or `null` when the
 *   change cannot be attributed to one.
 * @property {readonly string[]} domains Members of `INVALIDATION_DOMAINS`.
 */

/**
 * @typedef {object} CraftingDataChange
 * @property {'recipes'|'systems'} source Which manager announced it.
 * @property {readonly CraftingDataScope[]} scopes Per record-owner; EMPTY means unattributable.
 */

/**
 * Build a frozen change payload.
 *
 * Scopes naming the same system are merged, and a scope with no domains is dropped — so a
 * caller need not deduplicate, and "nothing was attributable" has exactly one representation.
 *
 * @param {object} input
 * @param {'recipes'|'systems'} input.source
 * @param {Iterable<{systemId?: string|null, domains?: readonly string[]}>} [input.scopes]
 * @returns {CraftingDataChange}
 */
export function craftingDataChange({ source, scopes = [] }) {
  /** @type {Map<string|null, Set<string>>} */
  const bySystem = new Map();
  for (const scope of scopes) {
    const domains = Array.isArray(scope?.domains) ? scope.domains : [];
    // UNATTRIBUTABLE POISONS THE WHOLE PAYLOAD, exactly as {@link PendingChangeDomains#record}
    // treats the identical input. Dropping only the offending scope would let a MIXED payload
    // route narrowly on its other legs' domains while the unattributable one vanished — a
    // stale read model, and the one failure direction this taxonomy must never produce. The
    // two agree deliberately: they are the two places an empty domain set can arrive.
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

/**
 * Emit a change payload on the unpublished hook.
 *
 * @param {CraftingDataChange} change
 * @param {((hook: string, payload: CraftingDataChange) => void)|null} [callAll] An injected
 *   emitter. `src/config/settingChangeBridge.js` already takes one so a simulated client can
 *   own its own bus; everything else falls through to the live `globalThis.Hooks`, read at call
 *   time and never captured.
 * @returns {void}
 */
export function emitCraftingDataChanged(change, callAll = null) {
  if (typeof callAll === 'function') {
    callAll(CRAFTING_DATA_CHANGED_HOOK, change);
    return;
  }
  globalThis.Hooks?.callAll?.(CRAFTING_DATA_CHANGED_HOOK, change);
}

/**
 * The domains a {@link DefinitionChange} attributes to ONE of the records it names.
 *
 * `change.domains` is either a flat array — every named record moved the same classes of fact,
 * which is what a single `put` or `delete` always means — or, for a `batch`, a `Map` or plain
 * object keyed by record id. The per-record form is the reason this function exists: a batch
 * that rewrote system A's components and system B's name must not apply both domain sets to
 * both systems, which is the over-broad invalidation issue 1078 exists to remove at batch scale.
 *
 * **Both of today's `save({batch})` callers are genuinely uniform**, so the per-record branch has
 * no production caller yet, and that is stated rather than left to be discovered — this
 * repository has been bitten by a seam value production could not produce. It is kept rather
 * than deferred because a caller that needs it is named: #1092 replicates a batch delta whose
 * per-record field lists differ by construction. It owes this branch its first real caller;
 * if it does not land, delete the branch rather than leaving it tested and unreachable.
 *
 * @param {object|null|undefined} change
 * @param {string|null|undefined} recordId
 * @returns {readonly string[]|null} `null` when the change said nothing about this record,
 *   which every caller reads as "every domain" — deliberately distinct from an EXPLICIT empty
 *   array, which means "attributable to nothing" and routes broadly.
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
 * A pending per-system domain attribution, accumulated between a mutation and its announcement.
 *
 * **Why the two are separated.** Domains are known at `save()`, which is each manager's single
 * persistence chokepoint; the ANNOUNCEMENT is `_notifySystemsChanged` / `_notifyRecipesChanged`,
 * which has roughly half as many call sites because several paths deliberately save WITHOUT
 * notifying (`applyBulkEditToRecipes` honours `options.notifySystems !== false`; the component
 * cascade announces through the recipe manager instead). Emitting from `save()` would make
 * every one of those paths refresh the app, changing observable behaviour on paths whose
 * silence is deliberate. Emitting from the notifier alone would lose the attribution only
 * `save()` receives.
 *
 * So `save()` RECORDS and the notifier DRAINS. A save whose notification never comes leaves its
 * domains pending, and they are carried by whichever announcement does eventually fire —
 * over-broad by at most the seven-member domain set, and never stale.
 */
export class PendingChangeDomains {
  constructor() {
    /** @type {Map<string|null, Set<string>>} */
    this._pending = new Map();
    /** @type {boolean} Whether anything recorded since the last drain was unattributable. */
    this._unattributable = false;
  }

  /**
   * Attribute a mutation.
   *
   * The two "I cannot say" answers are DIFFERENT, and conflating them is the failure this
   * signature exists to prevent:
   *
   * - **Omitted / nullish** means "every domain". That is the rule for a mutation site that
   *   simply did not say, and it keeps an unannotated site safe rather than silent.
   * - **An EXPLICIT empty array** means "this change is attributable to no domain at all" — a
   *   corpus reordering is the production-reachable producer. It poisons the whole pending set
   *   until the next drain, because a batch one leg of which is unattributable is unattributable
   *   as a whole; anything narrower would let the OTHER leg's domains be read as the batch's,
   *   and the reordered leg would silently vanish.
   *
   * @param {readonly string[]|null|undefined} domains
   * @param {...(string|null|undefined)} systemIds The systems the mutation touched.
   * @returns {void}
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

  /**
   * Take everything recorded so far and reset.
   *
   * @returns {{systemId: string|null, domains: string[]}[]} EMPTY when nothing was recorded, or
   *   when anything recorded was unattributable — both of which every consumer routes broadly.
   */
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

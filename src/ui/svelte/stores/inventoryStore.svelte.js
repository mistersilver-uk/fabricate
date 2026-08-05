/**
 * inventoryStore — Svelte 5 runes store backing the player-facing Inventory tab.
 *
 * Mirrors {@link createCraftingStore}: a plain factory that NEVER touches Foundry
 * globals. Every Foundry-facing read flows through the injected `services` bag
 * (the unified-window seam set built in `SvelteFabricateApp._buildServices`), so
 * the store stays presentational and fully unit-testable.
 *
 * It holds the owned-inventory listing produced by the `InventoryListingBuilder`
 * (via `services.listInventoryForActor`) plus the local browse state (search,
 * filter pill, sort, selection, pagination). The selected character +
 * component-source actors are owned by the sibling crafting stores/seams — this
 * store reads the current ids through `services` when it loads (so the Inventory
 * and Crafting tabs agree on what the player owns).
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listInventoryForActor({ rememberedActorId, componentSourceActorIds })`,
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and the
 *   optional sibling `craftingSources` store.
 * @returns {object} The reactive inventory store.
 */

import {
  applyPlayerResultOrder,
  progressiveOrderKey,
} from '../../../utils/progressiveResultOrder.js';
import { progressiveStageThresholds } from '../../../utils/progressiveStageThresholds.js';

const DEFAULT_PAGE_SIZE = 25;

// The bulk-selection bound (issue 859), applied here at SELECTION level so both
// bulk salvage and bulk destroy inherit one limit (`toggleBulkSelection` refuses
// the 26th). MUST equal `BulkSalvageService.BULK_MAX_ITEMS`
// (`src/systems/BulkSalvageService.js`) — deliberately NOT imported from there:
// that module's own graph (the bulk chat-card builder, `componentStacking.js`,
// `itemStackQuantity.js`, …) is entirely unrelated to this store's presentational
// concern, and pulling it in would drag several unrelated systems modules into
// every store test harness's explicit copy/raw-module allowlist for the sake of
// one integer. `salvage-check-usability.test.js`-style "pin as a pure move" is not
// available here since these are two independent declarations by design; a
// divergence would only ever show up as the UI accepting a 26th while the engine
// (defensively) still refuses it, or vice versa — never a silent wrong-award.
const BULK_MAX_ITEMS = 25;

// Reorder writes are replicated `scope: 'user'` document writes, so they are coalesced
// rather than issued per gesture. Mirrors the crafting store's window.
const ORDER_COMMIT_DEBOUNCE_MS = 400;

// The filter pills. Kept as a local constant so the store never imports the
// builder's module graph.
export const INVENTORY_FILTERS = Object.freeze([
  'all',
  'components',
  'essences',
  'tools',
  'recipeItems',
]);
const VALID_SORTS = new Set(['name', 'quantity', 'type']);

/**
 * Whether a row matches the free-text query. Matches the placeholder's promise —
 * item name, tags, and the names of essences the component carries — all
 * case-insensitively. An empty query matches everything.
 */
function matchesQuery(row, query) {
  if (query.length === 0) return true;
  if (String(row?.name ?? '').toLowerCase().includes(query)) return true;
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  if (tags.some((tag) => String(tag ?? '').toLowerCase().includes(query))) return true;
  const essences = Array.isArray(row?.essences) ? row.essences : [];
  if (essences.some((essence) => String(essence?.name ?? '').toLowerCase().includes(query)))
    return true;
  return false;
}

/**
 * The primary participation of a card: the `systems[]` entry the card's top-level
 * identity mirrors (the builder's salvageable-biased primary), else the first entry.
 * Pure, so the store never re-derives the builder's primary-selection bias.
 */
function primaryParticipation(item) {
  const systems = Array.isArray(item?.systems) ? item.systems : [];
  return systems.find((entry) => entry?.systemId === item?.systemId) ?? systems[0] ?? null;
}

/**
 * The progressive salvage order id for a participation — `<systemId>:<componentId>`
 * (issue 766). Component ids are NOT globally unique (copy-import preserves them), so the
 * old `salvage:<componentId>` key collided across systems the moment the collapse surfaced
 * two participations of one card. Returns null when either id is missing.
 */
function salvageOrderId(participation) {
  const systemId = participation?.systemId;
  const componentId = participation?.componentId;
  if (typeof systemId !== 'string' || systemId.trim() === '') return null;
  if (typeof componentId !== 'string' || componentId.trim() === '') return null;
  return `${systemId}:${componentId}`;
}

/**
 * Reconcile the held salvage snapshot against the reloaded listing (issue 675/766). When
 * the card survives (stock remains anywhere on it) the fresh live row is authoritative;
 * when the card is gone the acting participation is depleted, so the snapshot carries a
 * zero card total AND a zero owned quantity on the acting participation only.
 */
function reconcileHeldRow(row, liveRow, systemId, componentId) {
  if (liveRow) return liveRow;
  const systems = Array.isArray(row?.systems)
    ? row.systems.map((entry) =>
        entry?.systemId === systemId && entry?.componentId === componentId
          ? { ...entry, ownedQuantity: 0 }
          : entry
      )
    : row?.systems;
  return { ...row, totalQuantity: 0, systems };
}

/**
 * The acting participation for a BULK row (issue 859): the row's `systems[]` entry
 * named by `selectedSystemId` when the row IS the currently-inspected card
 * (mirroring `selectedParticipation`'s own resolution), else the PRIMARY — "a row
 * acts on the selected participation when its card is the inspected one, otherwise
 * the primary". For a legacy/single-system card (no `systems[]`) the card's own
 * top-level identity IS the participation, exactly as `selectedParticipation`
 * treats it.
 */
function actingParticipationOf(row, { inspected = false, selectedSystemId = null } = {}) {
  const systems = Array.isArray(row?.systems) ? row.systems : [];
  if (systems.length === 0) {
    return {
      systemId: row?.systemId ?? null,
      systemName: null,
      componentId: row?.componentId ?? null,
      salvage: row?.salvage ?? null,
      ownedQuantity: Number(row?.totalQuantity ?? 0),
    };
  }
  if (inspected) {
    return (
      systems.find((entry) => entry?.systemId === selectedSystemId) ?? primaryParticipation(row)
    );
  }
  return primaryParticipation(row);
}

/**
 * First-match blocked-reason classification for one bulk row (issue 859), reusing
 * already-normative ids: `essence`/`recipeItem` are card KINDS that were never
 * salvageable; `salvageDisabled` covers a real component whose salvage config is
 * off entirely; the three `misconfiguredReason` values are the salvage
 * projection's own; `toolsUnavailable` and `depleted` come last because they
 * describe an otherwise-configured, otherwise-stocked row.
 *
 * `broken` is DELIBERATELY absent — brokenness does not gate salvageability
 * (`InventoryItemCard`, `InventoryComponentDetail`,
 * `InventoryListingBuilder._isBrokenTool`); a broken row stays in the queue.
 *
 * @returns {string|null} A blocked-reason id, or null when the row is queueable.
 */
function bulkBlockedReasonFor(row, participation) {
  if (row?.isEssenceSource === true) return 'essence';
  if (row?.isRecipeItem === true) return 'recipeItem';
  const salvage = participation?.salvage ?? null;
  if (!salvage || salvage.enabled !== true) return 'salvageDisabled';
  if (salvage.misconfiguredReason) return salvage.misconfiguredReason;
  if (salvage.toolsAvailable !== true) return 'toolsUnavailable';
  if (Number(participation?.ownedQuantity ?? 0) <= 0) return 'depleted';
  return null;
}

/** The missing tool NAMES behind a `toolsUnavailable` blocked reason (issue 859). */
function missingToolNames(salvage) {
  const states = Array.isArray(salvage?.toolStates) ? salvage.toolStates : [];
  return states
    .filter((tool) => tool?.available !== true)
    .map((tool) => tool?.name)
    .filter(Boolean);
}

/** The quantity the TARGET actor owns of one row (issue 859) — destroy's basis. */
function actorQuantityOf(row, actorId) {
  const sources = Array.isArray(row?.sources) ? row.sources : [];
  const match = sources.find((source) => source?.actorId === actorId);
  if (match) return Number(match.quantity) || 0;
  return Number(row?.totalQuantity ?? 0);
}

/** Best-case one-unit-per-row yield contribution of a SIMPLE salvage config. */
function simpleYieldRows(salvage) {
  const results = Array.isArray(salvage?.results) ? salvage.results : [];
  const guaranteed = salvage?.checkUsable !== true;
  return results.map((result) => {
    const quantity = Number(result?.quantity) || 0;
    return {
      name: String(result?.name ?? ''),
      img: result?.img ?? null,
      quantity,
      guaranteedQuantity: guaranteed ? quantity : 0,
    };
  });
}

/**
 * Best-case one-unit-per-row yield contribution of a ROUTED salvage config
 * (Divergence 2). `quantity` is the MAX over SUCCESS outcomes only — a
 * `success: false` tier, or a success tier with no `outcomeRouting` entry,
 * contributes 0. `guaranteedQuantity` is the MIN across every (success) outcome,
 * but ONLY when none of the authored outcomes is a failure tier and the mode is
 * not `fixed`; otherwise it is 0 for every component, because the roll can always
 * land on the failure tier (relative) or miss every authored range (fixed).
 */
function routedYieldRows(salvage) {
  const outcomes = Array.isArray(salvage?.routedOutcomes) ? salvage.routedOutcomes : [];
  const successOutcomes = outcomes.filter((outcome) => outcome?.success === true);
  const hasFailureTier = outcomes.some((outcome) => outcome?.success !== true);
  const guaranteedEligible =
    outcomes.length > 0 && !hasFailureTier && salvage?.routedType !== 'fixed';

  const quantityFor = (outcome, name) =>
    (outcome?.results || [])
      .filter((result) => result?.name === name)
      .reduce((sum, result) => sum + (Number(result?.quantity) || 0), 0);

  const byName = new Map();
  for (const outcome of successOutcomes) {
    for (const result of outcome.results || []) {
      const name = String(result?.name ?? '');
      if (!byName.has(name)) {
        byName.set(name, { name, img: result?.img ?? null, quantity: 0, guaranteedQuantity: 0 });
      }
    }
  }
  for (const [name, row] of byName) {
    row.quantity = Math.max(0, ...successOutcomes.map((outcome) => quantityFor(outcome, name)));
    if (guaranteedEligible) {
      row.guaranteedQuantity = Math.min(
        ...successOutcomes.map((outcome) => quantityFor(outcome, name))
      );
    }
  }
  return [...byName.values()];
}

/**
 * Best-case one-unit-per-row yield contribution of a PROGRESSIVE salvage config
 * (Divergence 3): 1 per stage, always POSSIBLE (never guaranteed), and a stage
 * whose `threshold === null` is OMITTED entirely — unreachable at any budget.
 */
function progressiveYieldRows(salvage) {
  const stages = Array.isArray(salvage?.stages) ? salvage.stages : [];
  const byName = new Map();
  for (const stage of stages) {
    if (stage?.threshold === null) continue;
    const name = String(stage?.name ?? '');
    const row = byName.get(name) ?? {
      name,
      img: stage?.img ?? null,
      quantity: 0,
      guaranteedQuantity: 0,
    };
    row.quantity += 1;
    byName.set(name, row);
  }
  return [...byName.values()];
}

/**
 * One row's best-case yield contribution, dispatched by mode, from the row's OWN
 * `salvage.results` / `routedOutcomes` / `stages` — NEVER `store.orderedSalvageStages`,
 * which is scoped to the inspected card only.
 */
function yieldRowsFor(salvage) {
  if (salvage?.mode === 'simple') return simpleYieldRows(salvage);
  if (salvage?.mode === 'routed') return routedYieldRows(salvage);
  if (salvage?.mode === 'progressive') return progressiveYieldRows(salvage);
  return [];
}

/**
 * Assemble the in-panel report from one bulk run's snapshot + facade result
 * (issue 859). Positional matching against `items[index]` is safe because both
 * `BulkSalvageService.run` and `BulkDestroyService.run` preserve `targets` order
 * end to end, and `targets` was built from `snapshot` in that exact order.
 */
function buildBulkReport(mode, snapshot, result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const rows = snapshot.map((entry, index) => ({
    key: entry.key,
    name: entry.name,
    img: entry.img,
    ...(items[index] ?? {}),
  }));
  return {
    mode,
    cancelled: result?.cancelled === true,
    counts: result?.counts ?? null,
    unitsDeleted: Number.isFinite(result?.unitsDeleted) ? result.unitsDeleted : null,
    documentsDeleted: Number.isFinite(result?.documentsDeleted) ? result.documentsDeleted : null,
    posted: result?.posted === true,
    error: result?.error ?? null,
    items: rows,
  };
}

function matchesFilter(row, filter) {
  switch (filter) {
    case 'components':
      // Books (recipe items) and essence rows are their own pills, so the
      // Components pill lists only true crafting components.
      return row?.isEssenceSource !== true && row?.isRecipeItem !== true;
    case 'essences':
      return row?.isEssenceSource === true;
    case 'tools':
      return row?.isTool === true;
    case 'recipeItems':
      return row?.isRecipeItem === true;
    case 'all':
    default:
      return true;
  }
}

export function createInventoryStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let loadedOnce = $state(false);
  let selectedKey = $state(null);
  // The acting/selected system participation within the selected card (issue 766). null =
  // the primary participation. Reset on every `select`, so a freshly-selected card always
  // opens on its primary. Salvage routing, the success-ribbon gate, and the progressive
  // order key all resolve through the participation this names — never the primary default.
  let selectedSystemId = $state(null);
  let search = $state('');
  let filter = $state('all');
  let sort = $state('name');
  let page = $state(0);
  let pageSize = $state(DEFAULT_PAGE_SIZE);
  let worldTimeTick = $state(0);
  // The recipe id currently being learned from a book (Inventory learn button),
  // so the UI can show a busy state and prevent double-submits.
  let learningRecipeId = $state(null);
  // The component id currently being salvaged, so the footer can show a busy state
  // and refuse a double-submit.
  let salvagingKey = $state(null);
  // The last salvage outcome, held against the component it belongs to. Cleared by
  // "Salvage again" or by selecting another item.
  let salvageResult = $state(null);
  // Decision 11: hold the SALVAGED row selected while its ribbon is up. Salvaging the
  // last copy drops the row from the listing, and `selectedItem` would fall through to
  // `visibleItems[0]` — rendering the success ribbon against the wrong component. This
  // is the common case (the smoke fixture seeds a single copy), not an edge.
  let heldItem = $state(null);
  // The player's standing progressive stage orders, keyed `salvage:<componentId>`,
  // seeded from settings on load. `persistedOrders` is the last known-GOOD snapshot —
  // the revert target when an optimistic write is rejected.
  let progressiveOrders = $state({});
  let persistedOrders = {};
  let orderCommitTimer = null;
  // The order key captured when `orderCommitTimer` was ARMED (issue 859 latent-bug
  // fix). `flushSalvageOrder` reads (and clears) THIS rather than re-deriving the
  // key from the CURRENT selection — a selection change between the reorder
  // gesture and the debounced commit must not silently write the pending order
  // under a different participation's key.
  let pendingOrderKey = null;
  let salvageOrderAnnouncement = $state('');

  // Bulk salvage/destroy (issue 859). `bulkSelectedKeys` is CARD keys in click
  // order — see `toggleBulkSelection`.
  let bulkSelectedKeys = $state([]);
  let bulkRunning = $state(false);
  let bulkDestroying = $state(false);
  // `{ current, total }` while a bulk run is in flight, else null.
  let bulkProgress = $state(null);
  // The last bulk run's report, or null. Invalidated by any selection mutation
  // (`toggleBulkSelection` / `removeFromBulkSelection` / `clearBulkSelection`) so a
  // report never stands for a selection it no longer describes.
  let bulkReport = $state(null);

  /** Resolve the current component-source actor ids, preferring the sibling store. */
  function currentSourceIds() {
    const fromSibling = services?.craftingSources?.selectedSourceIds;
    if (Array.isArray(fromSibling)) return fromSibling;
    const persisted = services?.getCraftingComponentSourceIds?.();
    return Array.isArray(persisted) ? persisted : [];
  }

  /** Resolve the current crafting actor id from persistence (sticky selection). */
  function currentActorId() {
    return services?.getSelectedCraftingActorId?.() || null;
  }

  const rows = $derived(Array.isArray(listing?.rows) ? listing.rows : []);
  const hasActor = $derived(Boolean(listing?.selectedActorId));

  const visibleItems = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!matchesQuery(row, query)) return false;
      return true;
    });
    // Explicit comparator (never a bare `.sort()`).
    const byName = (left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? ''));
    if (sort === 'quantity') {
      return [...filtered].sort(
        (left, right) =>
          (right?.totalQuantity ?? 0) - (left?.totalQuantity ?? 0) || byName(left, right)
      );
    }
    if (sort === 'type') {
      // Components before essences, then A→Z within each group.
      return [...filtered].sort(
        (left, right) =>
          Number(left?.isEssenceSource === true) - Number(right?.isEssenceSource === true) ||
          byName(left, right)
      );
    }
    return [...filtered].sort(byName);
  });

  // Per-pill counts for the filter row (computed over the search-filtered set so
  // the badges reflect what a pill would show given the current query).
  const filterCounts = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const searched = rows.filter((row) => matchesQuery(row, query));
    const counts = {};
    for (const key of INVENTORY_FILTERS) {
      counts[key] = searched.filter((row) => matchesFilter(row, key)).length;
    }
    return counts;
  });

  const pageCount = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : 1;
    return Math.max(1, Math.ceil(visibleItems.length / size));
  });

  const pageItems = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : visibleItems.length || 1;
    const clampedPage = Math.min(Math.max(0, page), pageCount - 1);
    const start = clampedPage * size;
    return visibleItems.slice(start, start + size);
  });

  // Find by key across the full listing; fall back to the first VISIBLE item so
  // the selection respects the active search/filter.
  //
  // `heldItem` (decision 11) takes precedence while a salvage ribbon is up: the last
  // copy of a salvaged component leaves the listing, so `rows.find` misses and the
  // fallback would swap in an unrelated component under the ribbon. The held snapshot
  // is the row as it was salvaged; it is released on the next `select` or reset.
  const selectedItem = $derived.by(() => {
    const live = rows.find((row) => row?.key === selectedKey) ?? null;
    if (live) return live;
    if (heldItem && heldItem.key === selectedKey) return heldItem;
    if (rows.length === 0) return null;
    return visibleItems[0] ?? null;
  });

  /**
   * The acting participation of the selected card (issue 766): the `systems[]` entry named
   * by `selectedSystemId`, else the PRIMARY. For a single-system / legacy card (no
   * `systems`) it is the card's own top-level identity, so salvage routing is uniform and
   * byte-identical to today. Never falls back to the primary once a system is explicitly
   * selected AND still present.
   */
  const selectedParticipation = $derived.by(() => {
    const item = selectedItem;
    if (!item) return null;
    const systems = Array.isArray(item.systems) ? item.systems : [];
    if (systems.length === 0) {
      return {
        systemId: item.systemId ?? null,
        componentId: item.componentId ?? null,
        salvage: item.salvage ?? null,
        ownedQuantity: Number(item.totalQuantity ?? 0),
      };
    }
    const chosen =
      systems.find((entry) => entry?.systemId === selectedSystemId) ?? primaryParticipation(item);
    return chosen ?? null;
  });

  /**
   * The selected component's progressive salvage stages in the PLAYER'S order, with
   * thresholds RECOMPUTED for that order (issue 675).
   *
   * The recompute is not an optimization, it is a correctness requirement. A threshold
   * is cumulative — a property of a stage's POSITION in the list the roll is spent
   * down, not of the stage — and `applyPlayerResultOrder` returns elements
   * ===-identical to its inputs (deliberately; downstream depends on it). So a moved
   * stage would otherwise carry its authored-position threshold with it, and the top
   * row would claim a HIGHER bar than the row beneath it.
   *
   * It recomputes through the SAME helper the builder used, fed SALVAGE's own award
   * mode, which is the only thing that keeps the badge and the award in step.
   */
  const orderedSalvageStages = $derived.by(() => {
    const salvage = selectedParticipation?.salvage ?? null;
    const stages = Array.isArray(salvage?.stages) ? salvage.stages : [];
    if (stages.length === 0) return stages;
    if (salvage.allowPlayerResultReorder === false) return stages;
    const key = progressiveOrderKey({ scope: 'salvage', id: salvageOrderId(selectedParticipation) });
    if (!key) return stages;

    const ordered = applyPlayerResultOrder(stages, progressiveOrders[key] ?? null);
    // Identity means nothing moved, so the builder's authored thresholds already stand.
    if (ordered === stages) return stages;

    // `difficulty` is already null for an absent/invalid cost, so `?? NaN` reproduces
    // the award loop's skip: no budget reaches the stage, and its threshold stays null.
    const thresholds = progressiveStageThresholds({
      results: ordered,
      costFor: (stage) => stage?.difficulty ?? NaN,
      awardMode: salvage.awardMode || 'equal',
    });
    return ordered.map((stage, index) => ({ ...stage, threshold: thresholds[index] }));
  });

  // The selected cards, in CLICK order (issue 859). Stale keys (a card the reload
  // dropped) are silently filtered rather than surfaced — the panel has nothing
  // useful to show for a card that no longer exists.
  const bulkSelectedRows = $derived.by(() =>
    bulkSelectedKeys.map((key) => rows.find((row) => row?.key === key) ?? null).filter(Boolean)
  );

  /**
   * The bulk selection partitioned into salvageable/blocked, computed ONCE (issue
   * 859) — `bulkSalvageable`/`bulkBlocked`/`bulkCounts`/`bulkYieldPreview` are all
   * cheap filters/aggregates over this. Entries are PURE DATA carrying no i18n; the
   * view localizes `blockedReason` and renders `yieldRows`.
   */
  const bulkEntries = $derived.by(() =>
    bulkSelectedRows.map((row) => {
      const inspected = row.key === selectedKey;
      const participation = actingParticipationOf(row, { inspected, selectedSystemId });
      const salvage = participation?.salvage ?? null;
      const blockedReason = bulkBlockedReasonFor(row, participation);
      // Decision 8 parity: the first owned actor holding the acting participation's
      // documents, falling back to the card's own first source for a row with no
      // salvage config at all (essence/recipeItem/salvageDisabled) — destroy still
      // needs a target actor for those.
      const actorId = salvage?.targetActorId ?? row?.sources?.[0]?.actorId ?? null;
      const actorSource = (Array.isArray(row?.sources) ? row.sources : []).find(
        (source) => source?.actorId === actorId
      );
      return {
        key: row.key,
        name: row.name,
        img: row.img,
        broken: row.broken === true,
        systemId: participation?.systemId ?? null,
        systemName: participation?.systemName ?? null,
        componentId: participation?.componentId ?? null,
        // > 1 means the card carries several system participations; the queue row
        // names the acting system in that case.
        systemsCount: Array.isArray(row.systems) ? row.systems.length : 0,
        actorId,
        actorName: actorSource?.actorName ?? '',
        actorQuantity: actorQuantityOf(row, actorId),
        blocked: blockedReason !== null,
        blockedReason,
        missingTools: blockedReason === 'toolsUnavailable' ? missingToolNames(salvage) : [],
        yieldRows: blockedReason === null ? yieldRowsFor(salvage) : [],
      };
    })
  );

  // Queue rows follow the NAME-sorted order (issue 859) — also `bulkSalvage()`'s
  // and the report's iteration order.
  const bulkSalvageable = $derived.by(() =>
    bulkEntries
      .filter((entry) => !entry.blocked)
      .sort((left, right) => left.name.localeCompare(right.name))
  );
  const bulkBlocked = $derived.by(() =>
    bulkEntries
      .filter((entry) => entry.blocked)
      .sort((left, right) => left.name.localeCompare(right.name))
  );
  const bulkCounts = $derived.by(() => ({
    selected: bulkSelectedKeys.length,
    salvageable: bulkSalvageable.length,
    blocked: bulkBlocked.length,
    // Flips true on the CLICK that REACHES the cap (not the refused one after it),
    // so the panel's `aria-live` count line already states the limit before a
    // screen-reader user hits the wall — see `toggleBulkSelection`.
    atMax: bulkSelectedKeys.length >= BULK_MAX_ITEMS,
  }));

  // Best-case aggregate yield across the QUEUE only, `quantity`/`guaranteedQuantity`
  // summed INDEPENDENTLY per component name (two rows can yield the same component
  // at different certainties). Sorted by name.
  const bulkYieldPreview = $derived.by(() => {
    const byName = new Map();
    for (const entry of bulkSalvageable) {
      for (const row of entry.yieldRows) {
        const existing = byName.get(row.name) ?? {
          name: row.name,
          img: row.img,
          quantity: 0,
          guaranteedQuantity: 0,
        };
        existing.quantity += row.quantity;
        existing.guaranteedQuantity += row.guaranteedQuantity;
        if (!existing.img && row.img) existing.img = row.img;
        byName.set(row.name, existing);
      }
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  });

  const bulkActive = $derived(bulkSelectedKeys.length > 0);

  /**
   * Persist the pending order for `key`, reverting and announcing on failure.
   *
   * Mirrors `craftingStore.commitProgressiveOrder`'s STRUCTURE but NOT its error
   * contract. That one swallows the rejection outright, so `await flushProgressiveOrder()`
   * resolves successfully even when the write FAILED and the order was silently
   * reverted. Safe for crafting, which never gates an engine call on the flush —
   * unusable here, where a rejected write must ABORT the salvage.
   *
   * SIGNALS BY RETURN STATUS, NEVER BY REthrow. That is a constraint, not a taste:
   * `SvelteFabricateApp._flushPendingOrderWrite` calls this at window teardown as
   * `void`, inside a `try/catch` that catches only SYNCHRONOUS throws — so a rejecting
   * flush would become an unhandled promise rejection on a path with no user to see
   * it, land in the smoke run's `consoleErrors[]`, and flip its `passed` to false.
   *
   * The revert + the live-region announcement stay internal: the write is optimistic,
   * so by the time a rejection returns, the row has ALREADY moved and the announcement
   * has ALREADY been made. A toast is not sufficient — a keyboard user reordering by
   * chevron never looks at one.
   *
   * @returns {Promise<{ok: boolean}>}
   */
  async function commitProgressiveOrder(key) {
    const attempted = progressiveOrders[key] ?? [];
    try {
      await services?.setProgressiveResultOrder?.(key, attempted);
      persistedOrders[key] = [...attempted];
      return { ok: true };
    } catch {
      const restored = persistedOrders[key] ?? null;
      progressiveOrders = { ...progressiveOrders };
      if (restored) {
        progressiveOrders[key] = [...restored];
      } else {
        delete progressiveOrders[key];
      }
      salvageOrderAnnouncement = services?.progressiveOrderRevertMessage?.() ?? '';
      return { ok: false };
    }
  }

  /**
   * Move a stage of the selected progressive salvage, optimistically and debounced.
   *
   * @param {number} index the stage's current position
   * @param {number} target the position to move it to
   * @param {string} [announcement] pre-formatted live-region text (the component owns
   *   the i18n, and reads the moved stage's name BEFORE the move)
   */
  function reorderSalvageStage(index, target, announcement = '') {
    const key = progressiveOrderKey({ scope: 'salvage', id: salvageOrderId(selectedParticipation) });
    if (!key || selectedParticipation?.salvage?.allowPlayerResultReorder === false) return;

    const current = orderedSalvageStages;
    if (target < 0 || target >= current.length || index < 0 || index >= current.length) return;

    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    // Store ids, not indices: they survive a GM editing the component's salvage.
    progressiveOrders = { ...progressiveOrders, [key]: next.map((stage) => stage.id) };
    salvageOrderAnnouncement = announcement;

    if (orderCommitTimer) clearTimeout(orderCommitTimer);
    // Captured HERE, at schedule time — see `pendingOrderKey`'s own comment.
    pendingOrderKey = key;
    orderCommitTimer = setTimeout(() => {
      orderCommitTimer = null;
      pendingOrderKey = null;
      void commitProgressiveOrder(key);
    }, ORDER_COMMIT_DEBOUNCE_MS);
  }

  /**
   * Whether the player's order actually DIFFERS from the GM's authored one.
   *
   * Derived from the RENDERED order rather than from `progressiveOrders[key]` merely
   * being present: a stored order can name the authored sequence exactly (drag a row
   * away and back, or a GM re-authoring the list into the order the player had already
   * chosen), and offering to reset an order that is already the GM's is a control that
   * does nothing when pressed.
   */
  const salvageOrderIsCustom = $derived.by(() => {
    const stages = Array.isArray(selectedParticipation?.salvage?.stages)
      ? selectedParticipation.salvage.stages
      : [];
    if (stages.length === 0) return false;
    const ordered = orderedSalvageStages;
    return ordered.length === stages.length && ordered.some((stage, i) => stage.id !== stages[i].id);
  });

  /**
   * Drop the player's order for the selected salvage, restoring the GM's authored one.
   *
   * Persists `[]`, NOT the authored id list — they are different claims. `[]` means
   * "this player expresses no preference", so a later GM re-author is followed. Writing
   * today's authored ids would PIN the current sequence and silently outlive the GM
   * changing it, which is the opposite of what "reset" promises.
   *
   * Optimistic and debounced like every other order write, so a rejected write reverts
   * and announces through the same path.
   *
   * @param {string} [announcement] pre-formatted live-region text (the component owns
   *   the i18n)
   */
  function resetSalvageOrder(announcement = '') {
    const key = progressiveOrderKey({ scope: 'salvage', id: salvageOrderId(selectedParticipation) });
    if (!key || selectedParticipation?.salvage?.allowPlayerResultReorder === false) return;

    progressiveOrders = { ...progressiveOrders, [key]: [] };
    salvageOrderAnnouncement = announcement;

    if (orderCommitTimer) clearTimeout(orderCommitTimer);
    // Captured HERE, at schedule time — see `pendingOrderKey`'s own comment.
    pendingOrderKey = key;
    orderCommitTimer = setTimeout(() => {
      orderCommitTimer = null;
      pendingOrderKey = null;
      void commitProgressiveOrder(key);
    }, ORDER_COMMIT_DEBOUNCE_MS);
  }

  /**
   * Flush a pending debounced order write immediately, reporting whether it landed.
   *
   * Called on drop, before a salvage run starts, and on window teardown via
   * `SvelteFabricateApp._flushPendingOrderWrite` — without the last, a player who
   * reorders and immediately closes or refreshes inside the debounce window loses the
   * order silently. A no-op when nothing is pending, so a double call from both
   * `close()` and `_onClose()` writes once.
   *
   * NEVER REJECTS: see `commitProgressiveOrder`.
   *
   * @returns {Promise<{ok: boolean}>}
   */
  function flushSalvageOrder() {
    if (!orderCommitTimer) return Promise.resolve({ ok: true });
    clearTimeout(orderCommitTimer);
    orderCommitTimer = null;
    // READ (and clear) the key captured when the debounce was ARMED — never
    // re-derive it from `selectedParticipation`, which may have changed since
    // (issue 859 latent-bug fix). Re-deriving here was the bug: a selection change
    // between the reorder gesture and this flush silently committed the reordered
    // array under a DIFFERENT participation's key.
    const key = pendingOrderKey;
    pendingOrderKey = null;
    return key ? commitProgressiveOrder(key) : Promise.resolve({ ok: true });
  }

  /**
   * Fetch the inventory listing for the current actor + component sources.
   *
   * @param {boolean} [quiet=false] When true, do not raise `loading` (used for
   *   background refreshes after a scene change / world-time tick).
   */
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = null;
    try {
      const result = await services?.listInventoryForActor?.({
        rememberedActorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      });
      listing = result ?? null;
      // Seed the player's stored stage orders. The persisted snapshot is the revert
      // target for a rejected write.
      const orders = services?.getProgressiveResultOrder?.() ?? {};
      progressiveOrders = orders && typeof orders === 'object' ? { ...orders } : {};
      persistedOrders = { ...progressiveOrders };
      loadedOnce = true;
    } catch (err) {
      error = err?.message ?? String(err);
    } finally {
      if (!quiet) loading = false;
    }
  }

  /**
   * Learn one recipe from an owned recipe-item book. Routes through the
   * `learnRecipeFromInventory` seam (capped systems enforce the per-document
   * budget); on success the listing is quietly reloaded so the learned flag and
   * remaining budget update in place, and on failure the service message is
   * surfaced through the notify seam.
   *
   * @param {string} recipeId
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async function learn(recipeId) {
    if (!recipeId || learningRecipeId) return { success: false };
    learningRecipeId = recipeId;
    try {
      const result = await services?.learnRecipeFromInventory?.({
        actorId: currentActorId(),
        recipeId,
        componentSourceActorIds: currentSourceIds(),
      });
      if (result?.success) {
        await load(true);
      } else if (result?.message) {
        services?.notify?.(result.message);
      }
      return result ?? { success: false };
    } catch (err) {
      const message = err?.message ?? String(err);
      services?.notify?.(message);
      return { success: false, message };
    } finally {
      learningRecipeId = null;
    }
  }

  /**
   * Learn several recipes from an owned book in one action — the knowledge-mode
   * "Read & learn all N recipes" convenience (only offered when the reader can learn
   * everything). Learns sequentially through the same per-recipe seam, stopping on the
   * first failure (surfacing its message), and reloads once at the end.
   *
   * @param {string[]} recipeIds
   * @returns {Promise<{success: boolean}>}
   */
  async function learnAll(recipeIds = []) {
    const ids = (Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean);
    if (!ids.length || learningRecipeId) return { success: false };
    learningRecipeId = '*';
    try {
      let anyLearned = false;
      for (const recipeId of ids) {
        const result = await services?.learnRecipeFromInventory?.({
          actorId: currentActorId(),
          recipeId,
          componentSourceActorIds: currentSourceIds(),
        });
        if (result?.success) {
          anyLearned = true;
        } else {
          if (result?.message) services?.notify?.(result.message);
          break;
        }
      }
      if (anyLearned) await load(true);
      return { success: anyLearned };
    } finally {
      learningRecipeId = null;
    }
  }

  /**
   * Salvage the selected owned component (issue 675) — the first player-facing caller
   * of `CraftingEngine.salvage`.
   *
   * Routes through `services.salvageComponent({ actorId, ... })`. An ACTOR ID, never a
   * uuid: `_resolveCraftingActor` behind that facade is the only ownership gate the
   * salvage path has, and a uuid would bypass it and reach the engine (which mutates
   * Items directly and THROWS on a bad uuid rather than returning a message).
   *
   * `salvage()` has FOUR outcomes, not two — `waiting: true` (issue 859; alongside
   * `success: true` and null results) marks a time-gated run that has STARTED and
   * awarded nothing:
   *
   *   cancelled            → silently back to pre-roll. NO notify: the player chose to
   *                          dismiss the prompt; an error toast would be a lie.
   *   waiting              → waiting state carrying the engine's message. No ribbon,
   *                          no "Salvage again" (that would re-enter the time gate).
   *   success + results    → success ribbon, quiet reload, selection HELD.
   *   !success             → surface the message (this is also the misconfigured shape).
   *
   * NO ORDER IS THREADED INTO THE OPTIONS BAG. The engine captures the player's order
   * onto the run record at start, reading the standing preference exactly once, there.
   * Threading one here would reintroduce the executing-user read that capture exists to
   * prevent. Writing the standing preference is the UI's whole job — which is why this
   * FLUSHES the pending debounced write first: without that, a player who reorders and
   * immediately presses Salvage starts a run inside the debounce window and the engine
   * captures the STALE order.
   *
   * A REJECTED FLUSH ABORTS THE SALVAGE (decision 9). The store has already reverted
   * the row and announced the revert, so proceeding would consume the component against
   * an order the player can see was undone. Nothing is consumed; they retry deliberately.
   *
   * ROUTES THROUGH THE SELECTED PARTICIPATION (issue 766), never the primary: the acting
   * `(systemId, componentId, targetActorId)` and the depleted basis are the acting
   * participation's own — a system-B salvage on a divergent-roles card must consume B's
   * documents and reflect B's remaining stock, not the card union.
   *
   * @param {string} systemId The acting participation's system id.
   * @param {string} componentId The acting participation's component id.
   * @returns {Promise<{success: boolean, cancelled?: boolean, message?: string}>}
   */
  async function salvage(systemId, componentId) {
    if (!systemId || !componentId || salvagingKey) return { success: false };
    const participation = resolveActingParticipation(systemId, componentId);
    if (!participation) return { success: false };
    const row = selectedItem;

    salvagingKey = componentId;
    try {
      const flush = await flushSalvageOrder();
      if (flush?.ok === false) {
        // The revert and its live-region announcement already happened inside the
        // flush. Consume nothing.
        return { success: false, message: salvageOrderAnnouncement };
      }
      const result = await services?.salvageComponent?.({
        // Decision 8: the first OWNED actor holding the acting participation's documents.
        actorId: participation.salvage?.targetActorId ?? null,
        systemId,
        componentId,
        interactive: true,
      });

      if (result?.cancelled === true) {
        salvageResult = null;
        return result;
      }
      // Issue 859: read the engine's explicit `waiting: true` flag rather than
      // inferring the time-gated state from `results == null` — one derivation of
      // one fact, matching `classifySalvageOutcome` (`BulkSalvageService.js`).
      if (result?.waiting === true) {
        salvageResult = { systemId, componentId, state: 'waiting', message: result?.message ?? '' };
        await load(true);
        return result;
      }
      if (result?.success === true) {
        // Keep the salvaged component selected so its ribbon stays put even when the
        // last copy is consumed and the row leaves the listing.
        //
        // Hold it selected BEFORE the reload, not only after. `load(true)` awaits, and
        // the reactive flush it schedules runs at that await boundary — BEFORE the code
        // after the await. Without a held row in place, that flush momentarily resolves
        // the selection to a DIFFERENT component (the listing's first visible row), whose
        // changed key bounces the inspector off the Salvage tab (issue 675 defect 2). The
        // pre-roll snapshot pins the same key across the whole reload; its stale count is
        // corrected immediately below.
        heldItem = row;
        selectedKey = row?.key ?? selectedKey;
        salvageResult = {
          systemId,
          componentId,
          state: 'success',
          message: result?.message ?? '',
          // The created result documents, projected for the read-only summary. Never a
          // formula: that is system-authored and the prompt already showed it.
          awarded: (Array.isArray(result.results) ? result.results : []).map((entry) => ({
            name: String(entry?.name ?? ''),
            img: typeof entry?.img === 'string' ? entry.img : null,
          })),
          // What the run RECORDED, so the body can reconcile itself with the roll rather
          // than keep asserting a pre-roll state under a success ribbon.
          //
          // `createdResults` is the engine's own record of what it awarded, keyed by
          // componentId — the only honest source for a per-stage "Recovered" chip
          // (the created Items are matched by name otherwise, which is fragile).
          // `data.outcomeId` is the routed tier the roll actually matched.
          //
          // Both are null/empty when the salvage ran WITHOUT a run manager (the runless
          // invariant), in which case the bodies fall back to a neutral resolved state
          // rather than inventing one.
          awardedComponentIds: (Array.isArray(result?.salvageRun?.createdResults)
            ? result.salvageRun.createdResults
            : []
          )
            .map((entry) => entry?.componentId)
            .filter(Boolean),
          outcomeId: result?.salvageRun?.checkResult?.data?.outcomeId ?? null,
          // The rolled total, so the summary can print "with a roll of N". Read from the
          // engine's top-level `value` (present even runless), NOT from `salvageRun`. A
          // no-check "Guaranteed" salvage rolled nothing and returns null — kept null so
          // the summary omits the roll phrase entirely rather than printing "of 0".
          rollValue: Number.isFinite(result?.value) ? result.value : null,
        };
        await load(true);
        // Reconcile the held snapshot with post-salvage reality (issue 675 defect).
        // The live listing now reflects the consumed stock: when the last copy was
        // broken down the CARD is GONE (remaining 0); otherwise the fresh live row still
        // exists (found by its stable card KEY, not the acting componentId — the acting
        // participation's component id is not the card's top-level id on a multi-system
        // card) and `selectedItem` prefers it. Carry the TRUE remaining onto the held row
        // so a depleted participation reads "None remaining" and withholds "Salvage
        // again" — scoped to the acting participation, never the card union.
        //
        // The card key could in principle shift if depleting one participation changed the
        // salvageable-biased primary — but that cannot surface a stale row today: the
        // primary bias keys on salvageability (which salvaging never changes), and
        // `ingredientQuantity` is effectively always 1 (per DOMAIN.md, no UI authors it), so
        // a partial multi-participation depletion that leaves the card present under a
        // different primary key is unreachable. A bounded edge, not an oversight.
        const liveRow = rows.find((entry) => entry?.key === row?.key) ?? null;
        heldItem = reconcileHeldRow(row, liveRow, systemId, componentId);
        return result;
      }
      salvageResult = null;
      if (result?.message) services?.notify?.(result.message);
      return result ?? { success: false };
    } catch (err) {
      const message = err?.message ?? String(err);
      salvageResult = null;
      services?.notify?.(message);
      return { success: false, message };
    } finally {
      salvagingKey = null;
    }
  }

  /**
   * Resolve the acting participation `(systemId, componentId)` names within the selected
   * card (issue 766). For a single-system / legacy card (no `systems[]`) the top-level
   * identity IS the participation. Returns null when the ids name nothing on the card.
   */
  function resolveActingParticipation(systemId, componentId) {
    const item = selectedItem;
    if (!item) return null;
    const systems = Array.isArray(item.systems) ? item.systems : [];
    if (systems.length === 0) {
      if (item.systemId === systemId && item.componentId === componentId) {
        return {
          systemId,
          componentId,
          salvage: item.salvage ?? null,
          ownedQuantity: Number(item.totalQuantity ?? 0),
        };
      }
      return null;
    }
    return (
      systems.find(
        (entry) => entry?.systemId === systemId && entry?.componentId === componentId
      ) ?? null
    );
  }

  /** Dismiss the salvage outcome and return the panel to its pre-roll state. */
  function resetSalvage() {
    salvageResult = null;
    heldItem = null;
  }

  /**
   * Select an item by key. Releases any held (salvaged) row and its ribbon, and resets the
   * acting participation to the primary so a freshly-selected card opens on its default
   * system (issue 766).
   */
  function select(key) {
    // Cleared FIRST (issue 859) so every plain-click exit from bulk gets it for
    // free — a normal card click always means "leave bulk, inspect this one".
    bulkSelectedKeys = [];
    bulkReport = null;
    selectedKey = key ?? null;
    selectedSystemId = null;
    heldItem = null;
    salvageResult = null;
  }

  /**
   * Toggle one card into or out of the bulk selection, in CLICK ORDER (issue 859).
   *
   * PROMOTION: the FIRST shift-click also promotes the currently-inspected card —
   * but ONLY when the selection is empty AND the newly-toggled key differs from
   * it. Shift-clicking the ALREADY-inspected card first therefore selects exactly
   * ONE (itself), not two — the guard a naive implementation gets wrong.
   *
   * REFUSAL: the store holds no i18n (the `onResetSalvageOrder` precedent — a
   * caller supplies/consumes localized text, the store never authors it), so a
   * refusal at `BULK_MAX_ITEMS` is reported back as a plain signal for
   * `InventoryView` to localize and hand to `services.notify`.
   * `bulkCounts.atMax` flips true on the click that REACHES the cap (this one,
   * when it succeeds), so the panel's `aria-live` count line already states the
   * limit before a screen-reader user hits the wall on the NEXT (refused) click —
   * a toast on the refused click alone would be invisible to them.
   *
   * Clears `bulkReport`: adding a card while a report stands would otherwise show
   * a report for a set it no longer describes. Entering (or extending) bulk
   * releases the single-item inspector's `salvageResult`/`heldItem`; `selectedKey`
   * is retained so Clear/Done return to the same card.
   *
   * @param {string} key
   * @returns {{refused: boolean, reason?: string}}
   */
  function toggleBulkSelection(key) {
    if (!key) return { refused: false };
    bulkReport = null;
    if (bulkSelectedKeys.includes(key)) {
      bulkSelectedKeys = bulkSelectedKeys.filter((existing) => existing !== key);
      return { refused: false };
    }
    let next = bulkSelectedKeys;
    if (next.length === 0 && selectedKey && selectedKey !== key) {
      next = [selectedKey];
    }
    if (next.length >= BULK_MAX_ITEMS) {
      return { refused: true, reason: 'bulkLimit' };
    }
    bulkSelectedKeys = [...next, key];
    salvageResult = null;
    heldItem = null;
    return { refused: false };
  }

  /** Remove one card from the bulk selection (the panel's per-row `×`). */
  function removeFromBulkSelection(key) {
    bulkReport = null;
    bulkSelectedKeys = bulkSelectedKeys.filter((existing) => existing !== key);
  }

  /** Empty the bulk selection, returning to the single-item inspector. */
  function clearBulkSelection() {
    bulkReport = null;
    bulkSelectedKeys = [];
  }

  /**
   * Run the queued bulk salvage (issue 859) — the batch analogue of `salvage()`.
   *
   * FLUSHES the pending progressive-order write FIRST, for the same reason
   * `salvage()` does: a queued row must not run against a stale order. A REJECTED
   * flush ABORTS before anything starts — no run, no toast, no reload — exactly
   * like the single-item path.
   *
   * SNAPSHOTS `bulkSalvageable` BEFORE awaiting the run — the bulk analogue of
   * `heldItem`: the terminal `load(true)` this always performs drops every
   * consumed row from the listing, and the report must survive that drop.
   * Iteration/report order is the snapshot's own name-sorted order.
   *
   * ONE `finally` BLOCK discharges the whole exit-path obligation — this is the
   * sharpest correctness risk in the feature. The busy flag reset, the progress
   * toast's terminal removal, and the single terminal `load(true)` run together on
   * EVERY exit: success, a per-item `error`, a `cancelled` prompt dismissal, AND a
   * throw. Without this, a throw escaping with `bulkRunning` still `true` would
   * leave the inventory PERMANENTLY deaf to document-change reloads for the rest
   * of the session (`reloadOnDocumentChange` reads the flag at fire time, forever)
   * — silently, with no error surfaced anywhere.
   *
   * @returns {Promise<object>} The facade's own result shape, or `{cancelled:
   *   true}` on a pre-flight abort (already running, nothing queued, or a
   *   rejected order flush).
   */
  async function bulkSalvage() {
    if (bulkRunning || bulkDestroying) return { cancelled: true };
    const flush = await flushSalvageOrder();
    if (flush?.ok === false) {
      return { cancelled: true, message: salvageOrderAnnouncement };
    }
    const snapshot = bulkSalvageable;
    if (snapshot.length === 0) return { cancelled: true, items: [] };

    bulkRunning = true;
    const total = snapshot.length;
    bulkProgress = { current: 0, total };
    const reporter = services?.createProgressReporter?.() ?? null;
    try {
      const targets = snapshot.map((entry) => ({
        actorId: entry.actorId,
        actorName: entry.actorName,
        systemId: entry.systemId,
        componentId: entry.componentId,
      }));
      const result = await services?.salvageComponents?.({
        targets,
        interactive: true,
        // Optional: a facade that does not thread this through simply never calls
        // it, and the toast/panel jump straight from 0 to the terminal state below
        // — a graceful degrade, not a throw (a missing facade is `null`, and `?.`
        // on the awaited result already covers that).
        onProgress: (current) => {
          bulkProgress = { current, total };
          reporter?.({ pct: total > 0 ? current / total : 1 });
        },
      });
      bulkProgress = { current: total, total };
      bulkReport = buildBulkReport('salvage', snapshot, result);
      return result ?? { cancelled: true, items: [] };
    } catch (error) {
      const message = error?.message ?? String(error);
      bulkReport = buildBulkReport('salvage', snapshot, { items: [], error: message });
      return { cancelled: false, items: [], error: message };
    } finally {
      reporter?.({ pct: 1 });
      reporter?.dismiss?.();
      bulkRunning = false;
      bulkProgress = null;
      await load(true);
    }
  }

  /**
   * Confirm, then permanently destroy every SELECTED row's whole stack on its
   * target actor (issue 859) — salvageable AND blocked rows alike (acceptance 10):
   * destroy is not gated on salvageability at all, so the snapshot is `bulkEntries`
   * (the whole partition), never `bulkSalvageable`.
   *
   * `prompt` is handed to `services.confirmDialog` VERBATIM — the store holds no
   * i18n, and the caller composes the full dialog copy (the row count AND the unit
   * count). A FALSY result is treated as not-confirmed: covers both `null` (the
   * dialog dismissed) and `false` (No, `DialogV2.confirm`'s own default button).
   *
   * Same single-`finally` exit-path obligation as `bulkSalvage()`.
   *
   * @param {object} prompt Already-localized `DialogV2.confirm` options.
   * @returns {Promise<object>} `{ confirmed: false }` when not confirmed, else the
   *   facade's own result shape merged with `confirmed: true`.
   */
  async function bulkDestroy(prompt) {
    if (bulkRunning || bulkDestroying) return { confirmed: false };
    const confirmed = await services?.confirmDialog?.(prompt);
    if (!confirmed) return { confirmed: false };

    const snapshot = bulkEntries;
    if (snapshot.length === 0) return { confirmed: true, items: [] };

    bulkDestroying = true;
    const total = snapshot.length;
    bulkProgress = { current: 0, total };
    const reporter = services?.createProgressReporter?.() ?? null;
    try {
      const targets = snapshot.map((entry) => ({
        actorId: entry.actorId,
        actorName: entry.actorName,
        systemId: entry.systemId,
        componentId: entry.componentId,
      }));
      const result = await services?.destroyComponents?.({
        targets,
        onProgress: (current) => {
          bulkProgress = { current, total };
          reporter?.({ pct: total > 0 ? current / total : 1 });
        },
      });
      bulkProgress = { current: total, total };
      bulkReport = buildBulkReport('destroy', snapshot, result);
      return { confirmed: true, ...(result ?? { items: [] }) };
    } catch (error) {
      const message = error?.message ?? String(error);
      bulkReport = buildBulkReport('destroy', snapshot, { items: [], error: message });
      return { confirmed: true, items: [], error: message };
    } finally {
      reporter?.({ pct: 1 });
      reporter?.dismiss?.();
      bulkDestroying = false;
      bulkProgress = null;
      await load(true);
    }
  }

  /**
   * Handle a debounced owned-item change notification (`subscribeInventoryChange`,
   * `src/ui/svelte/util/foundryBridge.js`), quietly reloading the listing UNLESS a
   * bulk run is in flight (issue 859). Item mutations arrive one hook fire per
   * document, so a burst under an open bulk run would otherwise reload roughly
   * once per queued item.
   *
   * This is a DROP, not a defer, and that is safe ONLY because it is paired with
   * `bulkSalvage()`/`bulkDestroy()` always performing their own terminal
   * `load(true)` once the run ends — a dropped reload here is never lost, only
   * deferred to that terminal reload.
   *
   * The flag is read HERE, AT FIRE TIME — never by unsubscribing/re-subscribing
   * the hook, which is registered ONCE for the whole window's lifetime.
   */
  function reloadOnDocumentChange() {
    if (bulkRunning || bulkDestroying) return;
    void load(true);
  }

  /**
   * Choose which system participation the selected card's detail body scopes to (issue
   * 766). null restores the primary. Clears the salvage ribbon: it belongs to whichever
   * participation was just acted on, and switching systems changes the acting one.
   */
  function selectSystem(systemId) {
    selectedSystemId = systemId ?? null;
    salvageResult = null;
    heldItem = null;
  }

  /** Update the search query and jump back to the first page. */
  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
    page = 0;
  }

  /** Switch the active filter pill (jumps back to the first page). */
  function setFilter(value) {
    filter = INVENTORY_FILTERS.includes(value) ? value : 'all';
    page = 0;
  }

  /** Switch the sort key. */
  function setSort(value) {
    sort = VALID_SORTS.has(value) ? value : 'name';
  }

  function setPage(next) {
    const value = Number(next);
    page = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  }

  function setPageSize(next) {
    const value = Number(next);
    pageSize = Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_PAGE_SIZE;
    page = 0;
  }

  /** Bump the world-time tick so calendar-aware derived labels recompute. */
  function tickWorldTime() {
    worldTimeTick += 1;
  }

  return {
    get listing() {
      return listing;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get loadedOnce() {
      return loadedOnce;
    },
    get hasActor() {
      return hasActor;
    },
    get search() {
      return search;
    },
    get filter() {
      return filter;
    },
    get sort() {
      return sort;
    },
    get page() {
      return page;
    },
    get pageSize() {
      return pageSize;
    },
    get pageCount() {
      return pageCount;
    },
    get selectedKey() {
      return selectedKey;
    },
    get learningRecipeId() {
      return learningRecipeId;
    },
    get salvagingKey() {
      return salvagingKey;
    },
    get salvageResult() {
      return salvageResult;
    },
    get orderedSalvageStages() {
      return orderedSalvageStages;
    },
    get salvageOrderAnnouncement() {
      return salvageOrderAnnouncement;
    },
    get salvageOrderIsCustom() {
      return salvageOrderIsCustom;
    },
    get worldTimeTick() {
      return worldTimeTick;
    },
    get rows() {
      return rows;
    },
    get visibleItems() {
      return visibleItems;
    },
    get filterCounts() {
      return filterCounts;
    },
    get pageItems() {
      return pageItems;
    },
    get selectedItem() {
      return selectedItem;
    },
    get selectedSystemId() {
      return selectedSystemId;
    },
    get selectedParticipation() {
      return selectedParticipation;
    },
    get bulkSelectedKeys() {
      return bulkSelectedKeys;
    },
    get bulkRunning() {
      return bulkRunning;
    },
    get bulkDestroying() {
      return bulkDestroying;
    },
    get bulkProgress() {
      return bulkProgress;
    },
    get bulkReport() {
      return bulkReport;
    },
    get bulkSelectedRows() {
      return bulkSelectedRows;
    },
    get bulkEntries() {
      return bulkEntries;
    },
    get bulkSalvageable() {
      return bulkSalvageable;
    },
    get bulkBlocked() {
      return bulkBlocked;
    },
    get bulkCounts() {
      return bulkCounts;
    },
    get bulkYieldPreview() {
      return bulkYieldPreview;
    },
    get bulkActive() {
      return bulkActive;
    },
    load,
    learn,
    learnAll,
    salvage,
    resetSalvage,
    reorderSalvageStage,
    resetSalvageOrder,
    flushSalvageOrder,
    select,
    selectSystem,
    setSearch,
    setFilter,
    setSort,
    setPage,
    setPageSize,
    tickWorldTime,
    toggleBulkSelection,
    removeFromBulkSelection,
    clearBulkSelection,
    bulkSalvage,
    bulkDestroy,
    reloadOnDocumentChange,
  };
}

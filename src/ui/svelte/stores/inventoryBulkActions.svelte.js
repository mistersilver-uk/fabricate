/**
 * Bulk salvage and bulk destroy over the inventory listing (issue 1695): the click-ordered card
 * selection, the queued/blocked partition the panel renders, and the two runs that consume it.
 *
 * Every collaborator is injected as a thunk — the listing rows, the inspected key, the acting system
 * and the player's stored orders — so this sub-store never imports the browse store back, and the
 * participation resolvers it needs stay declared once, there.
 */

import { playerStageOrder, storedOrderFor } from '../../../utils/progressiveResultOrder.js';
import { yieldKeyOf, yieldRowsFor } from '../util/salvageYieldRows.js';

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

/**
 * The acting participation for a BULK row (issue 859): the row's `systems[]` entry
 * named by `selectedSystemId` when the row IS the currently-inspected card
 * (mirroring `selectedParticipation`'s own resolution), else the PRIMARY — "a row
 * acts on the selected participation when its card is the inspected one, otherwise
 * the primary". For a legacy/single-system card (no `systems[]`) the card's own
 * top-level identity IS the participation, exactly as `selectedParticipation`
 * treats it.
 */
function actingParticipationOf(
  row,
  { inspected = false, selectedSystemId = null, primaryOf } = {}
) {
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
    return systems.find((entry) => entry?.systemId === selectedSystemId) ?? primaryOf(row);
  }
  return primaryOf(row);
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

/**
 * WHOSE order a bulk entry's stage list is, as one of three named states (issue 1286).
 *
 * `orderIsPlayers` is a BOOLEAN over one question — did the rendered order come from the
 * player's stored preference and actually differ from the authored one — and the panel
 * needs a third answer it cannot express. A player who MAY arrange the list and has not
 * is looking at the GM's order, which is neither "the GM fixed it" nor "the player chose
 * this": calling it the GM's full stop would imply a fixity they do not have, and calling
 * it theirs would be a false claim about their own arrangement. So it is its own state.
 *
 * - `'players'`   — the rendered order IS the player's stored one, and differs from the
 *                   authored list. It persists and is re-read on every salvage of this
 *                   component, which is the fact that makes arranging it worth doing.
 * - `'arrangeable'` — the GM's authored order, which this player may replace.
 * - `'gm'`        — the GM's authored order, pinned by `allowPlayerResultReorder: false`.
 *
 * NULL when the row has no ordered stage list at all — a `simple` or `routed` row has no
 * order for anyone to own, and naming the GM as its author would invent a fact. Such a row
 * publishes no complication forecast either, so no card ever has to render the null.
 *
 * It is derived HERE and not in the panel, on the block's standing rule: the bulk card
 * renders what it is given and re-derives no part of the projection.
 *
 * @param {?object} salvage the row's own salvage projection.
 * @param {boolean} orderIsPlayers whether the rendered order differs from the authored one.
 * @returns {?('players'|'arrangeable'|'gm')}
 */
function bulkOrderProvenance(salvage, orderIsPlayers) {
  const stages = Array.isArray(salvage?.stages) ? salvage.stages : [];
  if (salvage?.mode !== 'progressive' || stages.length === 0) return null;
  if (orderIsPlayers) return 'players';
  return salvage?.allowPlayerResultReorder === false ? 'gm' : 'arrangeable';
}

/**
 * One bulk entry's player-visible complication FORECAST (issue 1286), flattened from the
 * stage rows the builder already attached it to.
 *
 * ## Nothing here is an audience decision
 *
 * `stage.complications` is `attachStageComplications`' output, which is
 * `forecastComplications`' output — already filtered to `visibility: 'visible'`, already
 * stripped of `when`, `rollCondition`, `effectRoll` and `macroUuid`, and already gated on
 * the activity and on the check block's owned trigger ids. This function selects and
 * re-keys; it must never grow a filter of its own, because a second copy of the redaction
 * rule is how the two drift apart. Equally, no PANEL may re-derive any of it: the bulk
 * block renders what it is given.
 *
 * ## `position` counts EVERY stage, and the gaps are the point
 *
 * It is the 1-based index in the player's own ordered list over ALL of that row's stages,
 * not among the complication-bearing ones. A stage authoring no complication therefore
 * leaves a gap in the numbering, and that gap is what makes the number readable against
 * the ordered stage list on the single-item panel — a dense 1..N would name rows that
 * screen does not have.
 *
 * ## Unreachable stages are excluded, on the yield preview's own rule
 *
 * A null `threshold` marks a stage the award loop skips at every budget (an invalid or
 * absent difficulty), so no roll can ever reach it and nothing it carries can fire.
 * `progressiveYieldRows` already omits exactly those, and a forecast that listed them
 * would promise a consequence the run cannot deliver. The flag is position-independent —
 * `progressiveStageThresholds` returns null purely on cost validity — so the builder's
 * authored-order value stays correct after the reorder above.
 *
 * @param {Array<object>} orderedStages the row's stages in the player's order.
 * @returns {Array<{resultId: string|null, position: number, resultName: string,
 *   resultDifficulty: number|null, id: string|null, name: string, description: string,
 *   severity: string}>} ordered by `position`.
 */
function bulkStageComplications(orderedStages) {
  const rows = [];
  for (const [index, stage] of orderedStages.entries()) {
    if (stage?.threshold === null) continue;
    const complications = Array.isArray(stage?.complications) ? stage.complications : [];
    for (const complication of complications) {
      rows.push({
        // The stage OCCURRENCE, not the component: a component staged twice is two rows
        // at two positions, because a complication is evaluated per result entry.
        resultId: stage?.id ?? null,
        position: index + 1,
        resultName: String(stage?.name ?? ''),
        // The stage's own `component.difficulty` — its progressive DC, which the row
        // states beside the position so the player can find it in the ordered list.
        resultDifficulty: stage?.difficulty ?? null,
        id: complication?.id ?? null,
        name: String(complication?.name ?? ''),
        description: String(complication?.description ?? ''),
        severity: String(complication?.severity ?? ''),
      });
    }
  }
  return rows;
}

/**
 * The RUN-shaped half of one bulk entry: what this row's own salvage would do, as opposed
 * to what the card is.
 *
 * Extracted from the `bulkEntries` mapper rather than inlined there because that mapper is
 * already at the edge of the cognitive-complexity budget, and because every field here
 * answers one question — "in what order, and with what consequences, will THIS row run?" —
 * which the identity fields around it do not.
 *
 * `queued` is the blocked/not-blocked verdict, and it gates the two FORECASTS only. A
 * blocked row never enters the run, so it can promise neither a yield nor a complication;
 * its mode, its reorder permission and whose order it is stay true regardless, because they
 * describe the row rather than a run it will not have.
 *
 * @param {?object} salvage the row's own salvage projection.
 * @param {?Array<string>} storedOrder the player's stored stage order for it.
 * @param {boolean} queued whether the row is runnable.
 */
function bulkRunProjection(salvage, storedOrder, queued) {
  const { stages, orderIsPlayers } = playerStageOrder(salvage, storedOrder);
  return {
    // The row's resolution mode, and whether THIS component honours the player's stored
    // stage order. The engine captures that order per `(systemId, componentId)` at run
    // start inside `salvage()`, which the bulk service calls once per queued row — so a
    // bulk run already respects each row's own order. The panel surfaces it because
    // nothing else on this screen tells the player that (issue 859).
    mode: salvage?.mode ?? null,
    allowsReorder: salvage?.mode === 'progressive' && salvage?.allowPlayerResultReorder !== false,
    // Whether the order the forecast below is numbered against is the PLAYER'S, and
    // deliberately NOT `allowsReorder` (issue 1286). The permission says a player MAY
    // arrange the list; one who may and has not is reading the GM's order, and a note
    // saying otherwise is a false claim about their own arrangement. Same derivation as
    // the inspected panel's `salvageOrderIsCustom` — see `orderDiffersFromAuthored`.
    orderIsPlayers,
    // The same question as a THIRD state the boolean above cannot hold: the bulk
    // forecast card names whose order it is numbered against on every card, and "may
    // arrange it and has not" is neither of the boolean's two answers. Derived here
    // because a panel deriving it from `allowsReorder` and `orderIsPlayers` together
    // would be the block re-deriving the projection it exists to merely render.
    orderProvenance: bulkOrderProvenance(salvage, orderIsPlayers),
    // The pre-run complication forecast for this entry, in that order and numbered
    // against ALL of its stages.
    complications: queued ? bulkStageComplications(stages) : [],
    yieldRows: queued ? yieldRowsFor(salvage) : [],
  };
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
    ...items[index],
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

/**
 * @param {object} deps
 * @param {() => Array<object>} deps.rows the live listing rows.
 * @param {() => ?string} deps.inspectedKey the single-item inspector's card key.
 * @param {() => ?string} deps.selectedSystemId the acting system within that card.
 * @param {(row: object) => ?object} deps.primaryParticipation the browse store's primary resolver.
 * @param {(participation: ?object) => ?string} deps.salvageOrderId its order-id mapper.
 * @param {() => object} deps.orders the player's stored stage orders, by key.
 * @param {() => Promise<{ok: boolean}>} deps.flushOrder settles a pending order write before a run.
 * @param {() => string} deps.orderAnnouncement the revert text a rejected flush announced.
 * @param {() => void} deps.clearRibbon releases the single-item salvage ribbon on entering bulk.
 * @param {(quiet?: boolean) => Promise<unknown>} deps.reload the terminal listing reload.
 * @param {object} deps.services the injected Foundry-facing seam bag.
 */
export function createBulkActions({
  rows,
  inspectedKey,
  selectedSystemId,
  primaryParticipation,
  salvageOrderId,
  orders,
  flushOrder,
  orderAnnouncement,
  clearRibbon,
  reload,
  services,
} = {}) {
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
  // The selected cards, in CLICK order (issue 859). Stale keys (a card the reload
  // dropped) are silently filtered rather than surfaced — the panel has nothing
  // useful to show for a card that no longer exists.
  const bulkSelectedRows = $derived.by(() =>
    bulkSelectedKeys.map((key) => rows().find((row) => row?.key === key) ?? null).filter(Boolean)
  );

  /**
   * The bulk selection partitioned into salvageable/blocked, computed ONCE (issue
   * 859) — `bulkSalvageable`/`bulkBlocked`/`bulkCounts`/`bulkYieldPreview` are all
   * cheap filters/aggregates over this. Entries are PURE DATA carrying no i18n; the
   * view localizes `blockedReason` and renders `yieldRows`.
   */
  const bulkEntries = $derived.by(() =>
    bulkSelectedRows.map((row) => {
      const inspected = row.key === inspectedKey?.();
      const participation = actingParticipationOf(row, {
        inspected,
        selectedSystemId: selectedSystemId?.(),
        primaryOf: primaryParticipation,
      });
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
        // How this row would RUN, against its OWN participation and the player's stored
        // order for it — never the inspected card's (issue 1286).
        ...bulkRunProjection(
          salvage,
          storedOrderFor({
            scope: 'salvage',
            id: salvageOrderId(participation),
            orders: orders?.(),
          }),
          blockedReason === null
        ),
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
    const byKey = new Map();
    for (const entry of bulkSalvageable) {
      for (const row of entry.yieldRows) {
        const key = yieldKeyOf(row);
        const existing = byKey.get(key) ?? {
          componentId: row.componentId ?? null,
          name: row.name,
          img: row.img,
          quantity: 0,
          guaranteedQuantity: 0,
        };
        existing.quantity += row.quantity;
        existing.guaranteedQuantity += row.guaranteedQuantity;
        if (!existing.img && row.img) existing.img = row.img;
        byKey.set(key, existing);
      }
    }
    return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
  });

  const bulkActive = $derived(bulkSelectedKeys.length > 0);

  // The one "a run is in flight" question, asked by both entry points and by the browse store's
  // document-change guard — never re-derived from the two flags at a third site.
  const busy = $derived(bulkRunning || bulkDestroying);

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
    const inspected = inspectedKey?.() ?? null;
    if (next.length === 0 && inspected && inspected !== key) {
      next = [inspected];
    }
    if (next.length >= BULK_MAX_ITEMS) {
      return { refused: true, reason: 'bulkLimit' };
    }
    bulkSelectedKeys = [...next, key];
    clearRibbon?.();
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
   * The run body both bulk actions share: the busy flag, the progress toast, the report, and the
   * one `finally` that discharges every exit path. `invoke` is handed `{ targets, onProgress }`
   * and returns the facade's own result; the outcome is tagged rather than shaped, because the two
   * callers answer their callers in different shapes.
   *
   * ONE `finally` BLOCK discharges the whole exit-path obligation — this is the sharpest
   * correctness risk in the feature. The busy flag reset, the progress toast's terminal removal,
   * and the single terminal `reload(true)` run together on EVERY exit: success, a per-item `error`,
   * a `cancelled` prompt dismissal, AND a throw. Without this, a throw escaping with `bulkRunning`
   * still `true` would leave the inventory PERMANENTLY deaf to document-change reloads for the rest
   * of the session (`reloadOnDocumentChange` reads the flag at fire time, forever) — silently, with
   * no error surfaced anywhere.
   *
   * @returns {Promise<{failed: boolean, result?: ?object, message?: string}>}
   */
  async function runBulk({ mode, snapshot, setBusy, invoke }) {
    setBusy(true);
    const total = snapshot.length;
    bulkProgress = { current: 0, total };
    const reporter = services?.createProgressReporter?.() ?? null;
    // Whether the run ever produced a progress tick — the toast's open/close gate; see
    // the `finally` below.
    let ticked = false;
    try {
      const targets = snapshot.map((entry) => ({
        actorId: entry.actorId,
        actorName: entry.actorName,
        systemId: entry.systemId,
        componentId: entry.componentId,
      }));
      const result = await invoke({
        targets,
        // Optional: a facade that does not thread this through simply never calls
        // it, and the toast/panel jump straight from 0 to the terminal state below
        // — a graceful degrade, not a throw (a missing facade is `null`, and `?.`
        // on the awaited result already covers that).
        onProgress: (current) => {
          ticked = true;
          bulkProgress = { current, total };
          reporter?.({ pct: total > 0 ? current / total : 1 });
        },
      });
      bulkProgress = { current: total, total };
      bulkReport = buildBulkReport(mode, snapshot, result);
      return { failed: false, result: result ?? null };
    } catch (error) {
      const message = error?.message ?? String(error);
      bulkReport = buildBulkReport(mode, snapshot, { items: [], error: message });
      return { failed: true, message };
    } finally {
      // The terminal `pct: 1` is CONDITIONAL on a tick having happened. The reporter
      // opens its toast lazily, on its first call (`createDefaultProgressReporter`), so
      // an unconditional terminal emit on a ZERO-TICK exit — a dismissed batch prompt
      // returns `{cancelled: true}` before the first target, and a throw can precede
      // the first target too — OPENS the toast for the first time and immediately
      // drives it to 100%: a completion notification for a run that never ran.
      // `dismiss()` stays unconditional: it is documented as a no-op when the reporter
      // never started, so it still discharges the abnormal-exit obligation.
      if (ticked) reporter?.({ pct: 1 });
      reporter?.dismiss?.();
      setBusy(false);
      bulkProgress = null;
      await reload?.(true);
    }
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
   * `heldItem`: the terminal `reload(true)` this always performs drops every
   * consumed row from the listing, and the report must survive that drop.
   * Iteration/report order is the snapshot's own name-sorted order.
   *
   * @returns {Promise<object>} The facade's own result shape, or `{cancelled:
   *   true}` on a pre-flight abort (already running, nothing queued, or a
   *   rejected order flush).
   */
  async function bulkSalvage() {
    if (busy) return { cancelled: true };
    const flush = await flushOrder?.();
    if (flush?.ok === false) {
      return { cancelled: true, message: orderAnnouncement?.() ?? '' };
    }
    const snapshot = bulkSalvageable;
    if (snapshot.length === 0) return { cancelled: true, items: [] };

    const outcome = await runBulk({
      mode: 'salvage',
      snapshot,
      setBusy: (value) => {
        bulkRunning = value;
      },
      invoke: (options) => services?.salvageComponents?.({ ...options, interactive: true }),
    });
    if (outcome.failed) return { cancelled: false, items: [], error: outcome.message };
    return outcome.result ?? { cancelled: true, items: [] };
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
   * THE TARGET SET IS SNAPSHOTTED BEFORE THE DIALOG OPENS, which is what the spec
   * states (§Bulk Destroy) and what the panel's own docblock claims. The listing
   * reloads on world-time, scene and source changes, any of which can fire while the
   * modal stands, so the set the caller counted for the confirmation copy has to be
   * the set that is destroyed — a re-read afterwards would let the row count and the
   * unit count the player agreed to drift from what is deleted.
   *
   * @param {object} prompt Already-localized `DialogV2.confirm` options.
   * @returns {Promise<object>} `{ confirmed: false }` when not confirmed, else the
   *   facade's own result shape merged with `confirmed: true`.
   */
  async function bulkDestroy(prompt) {
    if (busy) return { confirmed: false };
    // BEFORE the modal, never after — see the docblock. `bulkEntries` recomputes into a
    // NEW array whenever the listing changes, so holding this reference is a real
    // snapshot rather than a live view.
    const snapshot = bulkEntries;
    const confirmed = await services?.confirmDialog?.(prompt);
    if (!confirmed) return { confirmed: false };
    if (snapshot.length === 0) return { confirmed: true, items: [] };

    const outcome = await runBulk({
      mode: 'destroy',
      snapshot,
      setBusy: (value) => {
        bulkDestroying = value;
      },
      invoke: (options) => services?.destroyComponents?.(options),
    });
    if (outcome.failed) return { confirmed: true, items: [], error: outcome.message };
    return { confirmed: true, ...(outcome.result ?? { items: [] }) };
  }

  return {
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
    get busy() {
      return busy;
    },
    toggleBulkSelection,
    removeFromBulkSelection,
    clearBulkSelection,
    bulkSalvage,
    bulkDestroy,
  };
}

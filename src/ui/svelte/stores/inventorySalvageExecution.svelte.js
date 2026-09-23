/**
 * Salvage execution for the INSPECTED participation (issue 1695): the busy key, the outcome the
 * panel ribbons, and the row held under that ribbon. This is `ui-crafting-app` §Salvage Execution's
 * panel state and NOT a Salvage Run — the run record and its captured result order are the engine's
 * aggregate, which this sub-store owns no part of.
 *
 * The browse store composes it and reads `heldItem` back through a lazy getter for its own
 * `selectedItem` derive, so the seam is bidirectional by design; every collaborator arrives as an
 * injected thunk, so there is no import back to the store and no helper declared twice.
 */

// The shared "nothing fired" list (issue 1286). Frozen and hoisted so every un-fired
// state — pre-roll, time-gated, runless, and a resolution that fired nothing — reaches
// `markFiredStageComplications` as the SAME empty array, which returns the stage list by
// identity for it. A fresh `[]` per read would be a new dependency value on every derive
// and would defeat that identity contract.
const NO_FIRED_COMPLICATIONS = Object.freeze([]);

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
 * Project one successful salvage onto the ribbon's read-only summary. Pure, so the projection the
 * panel reads is testable without a run.
 */
function successSnapshot(result, systemId, componentId) {
  return {
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
    // What the resolution FIRED, per stage occurrence (issue 1286), published
    // VERBATIM from the run record.
    //
    // The record is `publicComplications`' output already narrowed at the WRITE, in
    // `CraftingEngine.salvage`, to the four durable keys — `resultId`, `componentId`,
    // `complicationId`, `buckets`. It is not re-filtered and not re-shaped here: the
    // container is an actor flag replicated to the owning player, so redaction had to
    // happen before it was persisted, and `markFiredStageComplications` — the only
    // consumer — re-resolves the prose from the forecast already on the stage row
    // rather than from a second copy of it.
    //
    // `resultId` is the reason a per-component record would not do: a component may
    // legitimately be staged several times, and the badge lands on the occurrence
    // that fired and on none of the others.
    //
    // ALWAYS AN ARRAY, NEVER NULL. The runless path (no salvage run manager) leaves
    // `salvageRun` null, and a salvage that fired nothing player-visible writes no
    // such key at all — both read as `[]`, which is exactly what "no strip claims
    // fired" means. Collapsing the three cases to one empty list is what saves the
    // panel from needing a second "was there a run?" flag to interpret a null.
    firedComplications: Array.isArray(result?.salvageRun?.firedComplications)
      ? result.salvageRun.firedComplications
      : [],
    // The rolled total, so the summary can print "with a roll of N". Read from the
    // engine's top-level `value` (present even runless), NOT from `salvageRun`. A
    // no-check "Guaranteed" salvage rolled nothing and returns null — kept null so
    // the summary omits the roll phrase entirely rather than printing "of 0".
    rollValue: Number.isFinite(result?.value) ? result.value : null,
  };
}

/**
 * @param {object} deps
 * @param {() => ?object} deps.selectedItem the inspected card, the held row included.
 * @param {() => ?object} deps.selectedParticipation the acting participation of that card.
 * @param {() => Array<object>} deps.rows the live listing rows, re-read after the reload.
 * @param {(key: ?string) => void} deps.holdSelection pins the browse store's selection to a key.
 * @param {() => Promise<{ok: boolean}>} deps.flushOrder settles the pending order write first.
 * @param {() => string} deps.orderAnnouncement the revert text a rejected flush announced.
 * @param {(quiet?: boolean) => Promise<unknown>} deps.reload the listing reload.
 * @param {object} deps.services the injected Foundry-facing seam bag.
 */
export function createSalvageExecution({
  selectedItem,
  selectedParticipation,
  rows,
  holdSelection,
  flushOrder,
  orderAnnouncement,
  reload,
  services,
} = {}) {
  // The component id currently being salvaged, so the footer can show a busy state
  // and refuse a double-submit.
  let salvagingKey = $state(null);
  // The last salvage outcome, held against the component it belongs to. Cleared by
  // "Salvage again" or by selecting another item.
  let salvageResult = $state(null);
  // Decision 11: hold the SALVAGED row selected while its ribbon is up. Salvaging the
  // last copy drops the row from the listing, and the browse store's `selectedItem` would
  // fall through to `visibleItems[0]` — rendering the success ribbon against the wrong
  // component. This is the common case (the smoke fixture seeds a single copy), not an edge.
  let heldItem = $state(null);

  /**
   * The fired record the INSPECTED participation's stage list may be marked with, or the
   * shared empty list (issue 1286).
   *
   * Scoped to the acting `(systemId, componentId)` the ribbon belongs to, because
   * `salvageResult` outlives a selection change: `heldItem` deliberately pins the salvaged
   * row through the post-salvage reload, and an unscoped read would badge a DIFFERENT
   * component's stages the moment the held row was released while the result stood.
   *
   * `waiting` and the cleared state carry no record at all, which is the same `[]` the
   * runless invariant produces — and that identity is deliberate. "No record" is the ONLY
   * un-fired state the strip needs: pre-roll, time-gated, runless and fired-nothing are
   * indistinguishable by design, so nothing here needs a second flag to say which it is.
   */
  const firedComplications = $derived.by(() => {
    const result = salvageResult;
    if (result?.state !== 'success') return NO_FIRED_COMPLICATIONS;
    const participation = selectedParticipation?.();
    if (result.systemId !== participation?.systemId) return NO_FIRED_COMPLICATIONS;
    if (result.componentId !== participation?.componentId) return NO_FIRED_COMPLICATIONS;
    return result.firedComplications ?? NO_FIRED_COMPLICATIONS;
  });

  /**
   * Resolve the acting participation `(systemId, componentId)` names within the selected
   * card (issue 766). For a single-system / legacy card (no `systems[]`) the top-level
   * identity IS the participation. Returns null when the ids name nothing on the card.
   */
  function resolveActingParticipation(systemId, componentId) {
    const item = selectedItem?.();
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
      systems.find((entry) => entry?.systemId === systemId && entry?.componentId === componentId) ??
      null
    );
  }

  /**
   * Drop the ribbon and release the held row. One operation under two names: `resetSalvage` is
   * the player-facing dismiss ("Salvage again"), `clearRibbon` the seam the browse store calls
   * whenever the selection, the participation or bulk mode moves off the salvaged row.
   */
  function clearRibbon() {
    salvageResult = null;
    heldItem = null;
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
    const row = selectedItem?.();

    salvagingKey = componentId;
    try {
      const flush = await flushOrder?.();
      if (flush?.ok === false) {
        // The revert and its live-region announcement already happened inside the
        // flush. Consume nothing.
        return { success: false, message: orderAnnouncement?.() ?? '' };
      }
      const result = await services?.salvageComponent?.({
        // Decision 8: the first OWNED actor holding the acting participation's documents.
        actorId: participation.salvage?.targetActorId ?? null,
        systemId,
        componentId,
        interactive: true,
      });
      return await recordOutcome(result, row, systemId, componentId);
    } catch (error) {
      const message = error?.message ?? String(error);
      salvageResult = null;
      services?.notify?.(message);
      return { success: false, message };
    } finally {
      salvagingKey = null;
    }
  }

  /** Dispatch the facade's four outcomes onto the panel's state, and return the result verbatim. */
  async function recordOutcome(result, row, systemId, componentId) {
    if (result?.cancelled === true) {
      salvageResult = null;
      return result;
    }
    // Issue 859: read the engine's explicit `waiting: true` flag rather than
    // inferring the time-gated state from `results == null` — one derivation of
    // one fact, matching `classifySalvageOutcome` (`BulkSalvageService.js`).
    if (result?.waiting === true) {
      salvageResult = { systemId, componentId, state: 'waiting', message: result?.message ?? '' };
      await reload?.(true);
      return result;
    }
    if (result?.success === true) {
      await holdSalvagedRow(result, row, systemId, componentId);
      return result;
    }
    salvageResult = null;
    if (result?.message) services?.notify?.(result.message);
    return result ?? { success: false };
  }

  /** The success path: hold the salvaged row under its ribbon across the reload, then reconcile. */
  async function holdSalvagedRow(result, row, systemId, componentId) {
    // Keep the salvaged component selected so its ribbon stays put even when the
    // last copy is consumed and the row leaves the listing.
    //
    // Hold it selected BEFORE the reload, not only after. `reload(true)` awaits, and
    // the reactive flush it schedules runs at that await boundary — BEFORE the code
    // after the await. Without a held row in place, that flush momentarily resolves
    // the selection to a DIFFERENT component (the listing's first visible row), whose
    // changed key bounces the inspector off the Salvage tab (issue 675 defect 2). The
    // pre-roll snapshot pins the same key across the whole reload; its stale count is
    // corrected immediately below.
    heldItem = row;
    holdSelection?.(row?.key ?? null);
    salvageResult = successSnapshot(result, systemId, componentId);
    await reload?.(true);
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
    const liveRow = (rows?.() ?? []).find((entry) => entry?.key === row?.key) ?? null;
    heldItem = reconcileHeldRow(row, liveRow, systemId, componentId);
  }

  return {
    get salvagingKey() {
      return salvagingKey;
    },
    get salvageResult() {
      return salvageResult;
    },
    get heldItem() {
      return heldItem;
    },
    get firedComplications() {
      return firedComplications;
    },
    salvage,
    resetSalvage: clearRibbon,
    clearRibbon,
  };
}

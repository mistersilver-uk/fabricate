/**
 * Player Result Order editing (issue 1695) — the one optimistic, debounced reorder both progressive
 * player surfaces share: the crafting recipe body and the inventory salvage panel.
 *
 * `subject` is a thunk answering `{ orderId, stages, awardMode, allowReorder }`, never a spread rune
 * object: it depends on the host store's own `$derived`, so passing the value would freeze one pass.
 * Each store maps `allowReorder` as `allowPlayerResultReorder !== false`, because an absent
 * permission reads true.
 *
 * `orderedStages` returns its input by identity whenever nothing moves — no stored order, a stored
 * order reproducing the authored one, or reorder disallowed — and downstream state depends on that.
 *
 * Writes are optimistic, so by the time a rejection returns the row has already moved and the live
 * region has already announced the new position. A failure therefore reverts to the last persisted
 * order and announces the revert through the same live region; a toast is not sufficient, because a
 * keyboard user reordering by chevron never looks at one.
 *
 * `flush` resolves `{ok}` and never rejects, and that is a constraint rather than a taste:
 * `SvelteFabricateApp._flushPendingOrderWrite` calls it at window teardown as `void` inside a
 * `try/catch` that catches only synchronous throws, so a rejecting commit would become an unhandled
 * rejection on a path with no user to see it and would land in the smoke run's `consoleErrors`.
 */

import {
  applyPlayerResultOrder,
  orderDiffersFromAuthored,
  progressiveOrderKey,
} from '../../../utils/progressiveResultOrder.js';
import { progressiveStageThresholds } from '../../../utils/progressiveStageThresholds.js';

// Under `scope: 'user'` every commit is a replicated document write (`#setWorld` broadcasts
// createSetting/updateSetting to every client), so a burst of moves must not become a burst of
// writes. The burst comes from the keyboard path — a player walking a stage up several places emits
// one move per chevron click. Drag emits only one move, on drop (`ProgressiveStageList` fires
// `onReorder` from `ondrop`, never from `ondragover`), so it settles immediately and the drop-path
// flush commits it without waiting.
const ORDER_COMMIT_DEBOUNCE_MS = 400;

/**
 * Reconcile `stages` against `storedOrder`, recomputing each row's cumulative threshold for the
 * order that results; `stages` is returned by identity when the order moves nothing.
 *
 * The recompute is a correctness requirement, not an optimization: a threshold is a property of a
 * stage's position in the list the roll is spent down, and `applyPlayerResultOrder` returns elements
 * identical to its inputs, so a moved stage would otherwise carry its authored-position threshold
 * and the top row would claim a higher bar than the row beneath. Running it through the same helper
 * the builder used, fed the subject's own award mode, is what keeps the badge and the award in step.
 */
function reorderedWithThresholds(stages, storedOrder, awardMode) {
  const ordered = applyPlayerResultOrder(stages, storedOrder);
  if (ordered === stages) return stages;

  // `difficulty` is already null for an absent/invalid cost, so `?? NaN` reproduces the award loop's
  // skip: no budget reaches the stage, and its threshold stays null.
  const thresholds = progressiveStageThresholds({
    results: ordered,
    costFor: (stage) => stage?.difficulty ?? NaN,
    awardMode: awardMode || 'equal',
  });
  return ordered.map((stage, index) => ({ ...stage, threshold: thresholds[index] }));
}

/** Commits already issued (debounce fired, or committed early by `stage`), for `flush` to await. */
function inFlightCommits() {
  const settling = new Set();
  return {
    track(commit) {
      settling.add(commit);
      void commit.then(() => settling.delete(commit));
      return commit;
    },
    pending: () => [...settling],
  };
}

/**
 * The stored-order map and the debounced optimistic write over it, with no knowledge of what a
 * stage is. Module-private: `createPlayerResultOrder` is the only composer, and the gestures are
 * what a store wires to.
 */
function createOrderWriter({ write, revertMessage, debounceMs }) {
  let orders = $state({});
  // The last order successfully persisted, per key — the revert target when a write rejects. Not
  // `$state`: it is never rendered, only read on failure.
  let persisted = {};
  let commitTimer = null;
  // The key captured when `commitTimer` was armed. `flush` reads this rather than re-deriving it
  // from the current subject: a subject change between the gesture and the commit must not write
  // the pending order under a key naming a different recipe or participation (issue 859 for
  // salvage, generalized to crafting by issue 1695). A reorder under another key commits it first
  // (issue 1809), and a `seed` carries its order forward (issue 1807), so it is never lost.
  let pendingKey = null;
  const inFlight = inFlightCommits();
  let announcement = $state('');

  /**
   * Seed from settings; the revert target starts as that same snapshot. A pending write survives:
   * its order is laid back over the re-read map and stays armed, so `flush` still sees it.
   */
  function seed(stored) {
    const pendingIds = commitTimer ? orders[pendingKey] : undefined;
    orders = stored && typeof stored === 'object' ? { ...stored } : {};
    persisted = { ...orders };
    if (commitTimer) orders[pendingKey] = pendingIds;
  }

  /** @returns {Promise<{ok: boolean}>} */
  async function commit(writeKey) {
    const attempted = orders[writeKey] ?? [];
    try {
      await write?.(writeKey, attempted);
      persisted[writeKey] = [...attempted];
      return { ok: true };
    } catch {
      const restored = persisted[writeKey] ?? null;
      orders = { ...orders };
      if (restored) {
        orders[writeKey] = [...restored];
      } else {
        delete orders[writeKey];
      }
      announcement = revertMessage?.() ?? '';
      return { ok: false };
    }
  }

  /** Apply `ids` under `writeKey` optimistically, announce `text`, and arm the debounce. */
  function stage(writeKey, ids, text) {
    if (commitTimer) {
      clearTimeout(commitTimer);
      if (pendingKey !== writeKey) inFlight.track(commit(pendingKey));
    }
    orders = { ...orders, [writeKey]: ids };
    announcement = text;
    pendingKey = writeKey;
    commitTimer = setTimeout(() => {
      commitTimer = null;
      pendingKey = null;
      inFlight.track(commit(writeKey));
    }, debounceMs);
  }

  /**
   * Commit a pending write now and await every in-flight one; `ok` only when all succeed. Nothing
   * pending resolves `{ok: true}`, so a double call from both `close()` and `_onClose()` writes once.
   *
   * @returns {Promise<{ok: boolean}>}
   */
  function flush() {
    const settling = inFlight.pending();
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
      const writeKey = pendingKey;
      pendingKey = null;
      settling.push(inFlight.track(commit(writeKey)));
    }
    if (settling.length === 0) return Promise.resolve({ ok: true });
    return Promise.all(settling).then((results) => ({ ok: results.every((result) => result.ok) }));
  }

  return {
    get orders() {
      return orders;
    },
    get announcement() {
      return announcement;
    },
    seed,
    stage,
    flush,
  };
}

/**
 * @param {object} deps
 * @param {'recipe'|'salvage'} deps.scope the key namespace this surface writes under.
 * @param {() => ?object} deps.subject thunk answering the selected subject.
 * @param {() => ?object} deps.read the stored order map, re-read on every listing load.
 * @param {(key: string, order: Array<string>) => Promise<unknown>} deps.write the persisting seam.
 * @param {() => string} deps.revertMessage localized text announced when a write is rejected.
 * @param {(stages: Array<object>) => Array<object>} [deps.markFiredStages] an optional last pass
 *   over the final list, returning its input by identity when it marks nothing.
 */
export function createPlayerResultOrder({
  scope,
  subject,
  read,
  write,
  revertMessage,
  markFiredStages,
  debounceMs = ORDER_COMMIT_DEBOUNCE_MS,
} = {}) {
  const writer = createOrderWriter({ write, revertMessage, debounceMs });

  const current = $derived.by(() => subject?.() ?? null);
  const key = $derived.by(() => progressiveOrderKey({ scope, id: current?.orderId }));

  const orderedStages = $derived.by(() => {
    const stages = Array.isArray(current?.stages) ? current.stages : [];
    const mark = (list) => (markFiredStages ? markFiredStages(list) : list);
    if (stages.length === 0 || !current.allowReorder || !key) return mark(stages);
    return mark(reorderedWithThresholds(stages, writer.orders[key] ?? null, current.awardMode));
  });

  // Derived from the rendered order rather than from a stored order merely being present, because
  // offering to reset an order that is already the GM's is a control that does nothing when pressed
  // — see `orderDiffersFromAuthored`.
  const isCustom = $derived.by(() => {
    const stages = Array.isArray(current?.stages) ? current.stages : [];
    return stages.length > 0 && orderDiffersFromAuthored(orderedStages, stages);
  });

  function seed() {
    writer.seed(read?.());
  }

  /**
   * Move a stage from `index` to `target`, optimistically and debounced. `text` is pre-formatted
   * live-region copy: the component owns the i18n and reads the moved stage's name before the move.
   */
  function reorder(index, target, text = '') {
    const writeKey = key;
    if (!writeKey || !current?.allowReorder) return;

    const rendered = orderedStages;
    if (target < 0 || target >= rendered.length || index < 0 || index >= rendered.length) return;

    const next = [...rendered];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    // Store ids, not indices: they survive a GM editing the subject's results.
    writer.stage(
      writeKey,
      next.map((entry) => entry.id),
      text
    );
  }

  /**
   * Drop the player's order, restoring the GM's authored one. Persists `[]` and not the authored id
   * list: `[]` means "this player expresses no preference", so a later GM re-author is followed,
   * where writing today's ids would pin the sequence and outlive the GM changing it.
   */
  function reset(text = '') {
    const writeKey = key;
    if (!writeKey || !current?.allowReorder) return;
    writer.stage(writeKey, [], text);
  }

  return {
    get orders() {
      return writer.orders;
    },
    get key() {
      return key;
    },
    get orderedStages() {
      return orderedStages;
    },
    get announcement() {
      return writer.announcement;
    },
    get isCustom() {
      return isCustom;
    },
    seed,
    reorder,
    reset,
    flush: writer.flush,
  };
}

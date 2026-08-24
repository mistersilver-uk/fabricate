/**
 * The PLAYER-facing per-stage projection of progressive component complications (issue 1286):
 * what a player may be told a stage could cost them, before any roll and after one.
 *
 * ## Why the projection hangs off the STAGE ROW rather than beside it
 *
 * A progressive stage list is reordered by the player, and the reorder happens downstream of
 * the builder: `inventoryStore` runs the stored order through `applyPlayerResultOrder` and
 * then respreads each row to recompute its cumulative threshold. A parallel array keyed by
 * result id would silently desynchronise at exactly that point — the stages would move and
 * the strip data would not — so the projection rides ON the row it belongs to and the
 * reorder carries it for free. That is also what makes the association explicit rather than
 * inferred: the stage a complication belongs to is the row it is attached to, and no reader
 * has to rediscover it.
 *
 * ## Additive by identity, not by convention
 *
 * {@link attachStageComplications} returns its INPUT ARRAY by identity when no stage gained
 * anything, and returns the input STAGE by identity for every row that gained nothing. A
 * component authoring no player-visible complications therefore produces a view-model that is
 * byte-identical to the one built before this module existed, and the same holds row by row
 * for a list where only some stages carry any. This is the identity contract
 * `applyPlayerResultOrder` already states, adopted for the same reason: an unwired or
 * unaffected caller must behave exactly as it did before.
 *
 * ## The audience filter lives HERE, never in a panel
 *
 * Everything a player surface may read comes out of {@link forecastComplications}, which
 * filters to `visibility: 'visible'` and drops `when`, `rollCondition`, `effectRoll` and
 * `macroUuid`. A panel re-deriving any of it — filtering an authored list in Svelte,
 * inferring "fired" from a stage's missed state — reintroduces the leak this split exists to
 * prevent, so `InventoryListingBuilder._buildSalvage`'s "the panel is presentational"
 * contract covers this projection exactly as it covers mode, DC and thresholds.
 *
 * Note the standing disclosure caveat that applies to every projection in this feature: the
 * `craftingSystems` world setting is replicated to every connected client, so redaction here
 * is a DISCLOSURE guarantee — Fabricate never shows a player a `gmOnly` complication — and
 * not a confidentiality one.
 *
 * ## Two activities reach it; the third SHIPS DORMANT pending issue 683
 *
 * `InventoryListingBuilder` passes `salvage` and `CraftingListingBuilder` passes `crafting`.
 * `gathering` is a valid `activity` token here only because {@link forecastComplications}
 * accepts the same three the planner does — the seam is free, not built. NO gathering
 * surface calls this and none should be added: `_libraryTaskToRuntimeTask` hardcodes
 * `resolutionMode: 'd100'` and `GatheringEconomyView` renders both formula-rolled modes
 * disabled, so no configuration a GM can select produces a progressive gathering stage list
 * to forecast. A player-facing gathering strip built today would be unreachable scenery.
 *
 * ## Deliberately a leaf
 *
 * Its one import is `complicationPlan.js`, itself an import-free leaf but for the frozen
 * complication vocabularies. That placement is the whole reason the two player projections
 * live there rather than in `complicationRuntime.js`: a view-model reaching the runtime module
 * would drag `checkRoll.js`'s sixteen-module closure into every mounted Svelte suite that
 * loads a real player store. Keep this module a leaf on the same grounds.
 *
 * @module src/utils/progressiveStageComplications
 */

import { forecastComplications } from './complicationPlan.js';

/** @param {unknown} value @returns {Array<any>} */
function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Every trigger id one progressive check block owns, in authored order.
 *
 * Supplying them is what lets {@link forecastComplications} exclude a complication whose only
 * enabled clause names a trigger that block does NOT own — a clause the planner already makes
 * inert — so "N complications could fire" is not a lie.
 *
 * It fails CLOSED, which is why the caller's source for `checkBreakage` matters. This
 * function never returns `null` — `forecastComplications`' fail-open case is reachable only
 * by passing it `checkTriggerIds: null` directly, and {@link attachStageComplications} always
 * passes this array instead. So a caller that omits the block, or reads it off the wrong
 * activity, yields ids the complication does not name, and a complication whose ONLY enabled
 * clause is that trigger drops out of the forecast while the runtime still fires it. That is
 * under-disclosure with no symptom on screen, so each builder's source is pinned by a test.
 *
 * It reads the ids only, never a trigger's condition: matching a condition needs a resolved
 * roll and is `ResolutionModeService.resolveCheckTriggerMatches`'s job. That module is not
 * imported here because it is not a leaf, and a forecast has no roll to match against.
 *
 * @param {?{triggers?: Array<{id?: string}>}} checkBreakage the ACTIVE progressive check
 *   block's breakage record (`salvageCraftingCheck.progressive.checkBreakage`, or the
 *   crafting equivalent).
 * @returns {Array<string>}
 */
export function checkTriggerIdsOf(checkBreakage) {
  const ids = [];
  for (const trigger of list(checkBreakage?.triggers)) {
    const id = typeof trigger?.id === 'string' ? trigger.id.trim() : '';
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Attach each stage's player-visible complication FORECAST to the stage row.
 *
 * The component a stage names is the one it PRODUCES — the salvage yield, the crafted result
 * — not the component being salvaged or the recipe being crafted. That is the same component
 * the engine's own stage occurrences name (`CraftingEngine._progressiveSalvagePlanInputs`,
 * `ResolutionModeService.progressiveStageOccurrences`), so a strip cannot point at a
 * different record from the one that will fire.
 *
 * A component listed several times gains the forecast on EVERY occurrence, because a
 * complication is evaluated per result entry — and fires per result entry too, so every one of
 * those occurrences can end up marked; see {@link markFiredStageComplications}.
 *
 * @param {Array<{id: string|null, componentId: string|null}>} stages the built stage rows, in
 *   the order this view-model publishes them.
 * @param {object} options
 * @param {?Map<string, object>} options.componentById the system's components by id.
 * @param {'crafting'|'salvage'|'gathering'} options.activity the activity being projected.
 * @param {?object} [options.checkBreakage] that activity's progressive check breakage block.
 * @returns {Array<object>} the same array by identity when nothing attached.
 */
export function attachStageComplications(
  stages,
  { componentById = null, activity, checkBreakage = null } = {}
) {
  const rows = list(stages);
  if (rows.length === 0) return stages;
  const checkTriggerIds = checkTriggerIdsOf(checkBreakage);
  let attached = false;
  const projected = rows.map((stage) => {
    const component = componentById?.get?.(stage?.componentId) ?? null;
    const complications = forecastComplications(component, { activity, checkTriggerIds }).map(
      // Spread rather than restate: the player projection owns its own field list, and a
      // copy here would be free to drift wider than it.
      (entry) => ({ ...entry, fired: false })
    );
    if (complications.length === 0) return stage;
    attached = true;
    return { ...stage, complications };
  });
  return attached ? projected : stages;
}

/** Whether one stage row is an occurrence of `componentId` carrying `complicationId`. */
function holdsComplication(stage, componentId, complicationId) {
  return (
    stage?.componentId === componentId &&
    list(stage?.complications).some((entry) => entry?.id === complicationId)
  );
}

/**
 * The occurrence ONE fired record marks: the stage it names, else the first occurrence
 * carrying that complication which no earlier record has already claimed.
 *
 * The named path is the normal one and is exact — a firing is produced per result entry and
 * carries that entry's own id, so N firings for one component name N distinct stages.
 *
 * The fallback exists for a record the planner did not mint that way: a run record persisted
 * before the per-entry rule, or one whose `resultId` no longer resolves against a reordered
 * list. It consumes an UNCLAIMED occurrence rather than always the first, so two such records
 * mark two rows instead of fighting over one. Dropping them instead would render a
 * complication the player was told about in chat as un-fired on the panel beside it.
 *
 * @param {Array<object>} rows
 * @param {object} record
 * @param {string} componentId
 * @param {string} complicationId
 * @param {Set<string>} claimed `${index}\n${complicationId}` for every mark already placed
 * @returns {number} the row index, or -1
 */
function occurrenceIndex(rows, record, componentId, complicationId, claimed) {
  const resultId = typeof record?.resultId === 'string' && record.resultId ? record.resultId : null;
  const named =
    resultId === null
      ? -1
      : rows.findIndex(
          (stage) => stage?.id === resultId && holdsComplication(stage, componentId, complicationId)
        );
  if (named !== -1) return named;
  return rows.findIndex(
    (stage, index) =>
      !claimed.has(`${index}\n${complicationId}`) &&
      holdsComplication(stage, componentId, complicationId)
  );
}

/**
 * `Map<stageIndex, Set<complicationId>>` — one mark per FIRED RECORD, so a complication that
 * fired on three occurrences marks three rows.
 *
 * `claimed` is keyed on `(stage index, complicationId)` and no longer on
 * `(componentId, complicationId)`: the old pair key was the reader's half of a firing rule
 * that fired once per component, and under the per-entry rule it would silently discard every
 * firing after the first. It survives only to stop two unnamed records from claiming the same
 * row; a repeated record naming the SAME stage re-marks it, which is idempotent.
 */
function resolveMarks(rows, records) {
  const marks = new Map();
  const claimed = new Set();
  for (const record of records) {
    const componentId = record?.componentId ?? null;
    const complicationId = record?.complicationId ?? null;
    if (!componentId || !complicationId) continue;
    const index = occurrenceIndex(rows, record, componentId, complicationId, claimed);
    if (index === -1) continue;
    claimed.add(`${index}\n${complicationId}`);
    if (!marks.has(index)) marks.set(index, new Set());
    marks.get(index).add(complicationId);
  }
  return marks;
}

/**
 * Mark, on an already-forecast stage list, which complications a resolution FIRED.
 *
 * ## It marks; it never adds
 *
 * Nothing reaches the returned rows that {@link attachStageComplications} did not already
 * publish. A record naming a complication the forecast withheld — a `gmOnly` one above all —
 * matches no entry and is dropped silently rather than surfacing. The audience filter is
 * therefore structural here rather than repeated: this function has no visibility test of its
 * own and must not grow one, because a second copy of the rule is how the two drift apart.
 * (It cannot simply re-apply `publicComplications` either: that filter reads a `visibility`
 * its own output does not carry, so re-applying it to its own output returns nothing.)
 *
 * ## Per result entry, in both tenses
 *
 * A complication is EVALUATED per result entry, so a component listed five times carries the
 * forecast five times — and it FIRES per result entry too, so between one and five of those
 * rows end up marked, exactly the ones the resolution's records name. A component selected
 * twice asked for two awards and gets two independent verdicts, so a rule that marked only one
 * row would tell a player one `1d6` was rolled when two were.
 *
 * The marks therefore follow the records one for one. There is no `(componentId,
 * complicationId)` collapse here and there must not be one: it was the reader's half of a
 * firing rule that no longer exists, and reinstating it would drop every firing after the
 * first.
 *
 * A resolution that fired nothing leaves every row un-fired, which is also the pre-roll and
 * the runless state: no strip claims fired without a record saying so, and none of the three
 * cases is distinguishable from the others by design.
 *
 * @param {Array<object>} stages rows from {@link attachStageComplications}.
 * @param {?Array<{resultId?: string|null, componentId?: string|null,
 *   complicationId?: string|null}>} fired the resolution's PLAYER-VISIBLE fired list —
 *   `publicComplications`' output, or the four durable keys the salvage run record stores.
 * @returns {Array<object>} the same array by identity when nothing was marked.
 */
export function markFiredStageComplications(stages, fired) {
  const rows = list(stages);
  const records = list(fired);
  if (rows.length === 0 || records.length === 0) return stages;
  const marks = resolveMarks(rows, records);
  if (marks.size === 0) return stages;
  return rows.map((stage, index) => {
    const ids = marks.get(index);
    if (!ids) return stage;
    return {
      ...stage,
      complications: list(stage.complications).map((entry) =>
        ids.has(entry?.id) ? { ...entry, fired: true } : entry
      ),
    };
  });
}

/**
 * The PLAYER-facing per-stage projection of progressive component complications (issue 1286). The
 * projection rides ON the stage row, so `applyPlayerResultOrder`'s reorder carries it and cannot
 * desynchronise it, and {@link attachStageComplications} returns its input array and every
 * unaffected row BY IDENTITY. The audience filter lives here in {@link forecastComplications},
 * never in a panel — a disclosure guarantee, not a confidentiality one, since `craftingSystems`
 * replicates to every client. Salvage and crafting reach it; gathering ships dormant (issue 683).
 */

import { forecastComplications } from './complicationPlan.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

/** Every trigger id one progressive check block owns, in authored order. */
export function checkTriggerIdsOf(checkBreakage) {
  const ids = [];
  for (const trigger of list(checkBreakage?.triggers)) {
    const id = typeof trigger?.id === 'string' ? trigger.id.trim() : '';
    if (id) ids.push(id);
  }
  return ids;
}

/** Attach each stage's player-visible complication FORECAST to the stage row. */
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
      // Spread rather than restate: the player projection owns its own field list, and a copy here
      // would be free to drift wider than it.
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
 * The occurrence ONE fired record marks: the stage it names, else the first occurrence carrying
 * that complication which no earlier record has already claimed.
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
 * `Map<stageIndex, Set<complicationId>>` — one mark per FIRED RECORD, so a complication that fired
 * on three occurrences marks three rows.
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

/** Mark, on an already-forecast stage list, which complications a resolution FIRED. */
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

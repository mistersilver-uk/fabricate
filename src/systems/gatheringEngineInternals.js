/**
 * Dependency-free helpers shared by `GatheringEngine` and its collaborators, so each has one
 * definition; the duplication gate forbids a copy.
 */

import {
  cloneJson,
  iterableToArray as normalizeList,
  stringOrEmpty,
  stringOrNull,
} from '../utils/scalars.js';

/**
 * The `taskId` prefix an opaque-blind waiting run persists instead of the drawn task (issue 901):
 * an owner receives the actor's flags, so the real id lives in the GM-only
 * `fabricate.gatheringBlindRuns` setting. Environment-scoped, keeping one active blind run per
 * blind environment; only an imported id starting `blind:` could collide.
 */
export const BLIND_WAITING_TASK_PREFIX = 'blind:';

export function blindWaitingTaskId(environment) {
  return `${BLIND_WAITING_TASK_PREFIX}${stringOrEmpty(environment?.id)}`;
}

/** Whether a `taskId` is the blind sentinel; false for a pre-901 run, which needs no migration. */
export function isBlindWaitingTaskId(taskId) {
  return typeof taskId === 'string' && taskId.startsWith(BLIND_WAITING_TASK_PREFIX);
}

export function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

/** Iterate an array, a Foundry collection or an `EmbeddedCollection`; nullish yields nothing. */
export function iterateCollection(collection) {
  if (!collection) return [];
  if (typeof collection[Symbol.iterator] === 'function') return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (typeof collection?.values === 'function') return collection.values();
  return [];
}

export function plainObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...value };
}

/** De-duplicated trimmed non-empty strings; a scalar is a one-element list. */
export function normalizeStringList(value) {
  return [
    ...new Set(
      normalizeList(Array.isArray(value) ? value : value ? [value] : [])
        .map((entry) => stringOrEmpty(entry))
        .filter(Boolean)
    ),
  ];
}

/** Blocked reasons de-duplicated by `code`, first wins. */
export function uniqueReasons(reasons) {
  const byCode = new Map();
  for (const reason of reasons) {
    if (!reason?.code || byCode.has(reason.code)) continue;
    byCode.set(reason.code, reason);
  }
  return [...byCode.values()];
}

export function actorToOption(actor) {
  return {
    id: idOf(actor),
    uuid: stringOrNull(actor?.uuid),
    name: stringOrEmpty(actor?.name),
    img: stringOrNull(actor?.img),
  };
}

export function actorMatchesId(actor, actorId) {
  const id = String(actorId);
  return actor?.id === id || actor?.uuid === id;
}

export function sameActor(left, right) {
  return Boolean(
    left && right && (left === right || left.id === right.id || left.uuid === right.uuid)
  );
}

export function sameActorUuid(actor, actorUuid) {
  const runActorUuid = stringOrNull(actorUuid);
  if (!runActorUuid) return false;
  return stringOrNull(actor?.uuid) === runActorUuid;
}

export function normalizeActorList(value) {
  return normalizeList(value).filter(Boolean);
}

/** Call an optional collaborator, or resolve `[]` when it is absent. */
export async function callMaybe(fn, payload) {
  return typeof fn === 'function' ? fn(payload) : [];
}

/** An interactable ref `{sceneId, regionId, behaviorId}`, or `null` if incomplete (issue 302). */
export function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = stringOrNull(ref.sceneId);
  const regionId = stringOrNull(ref.regionId);
  const behaviorId = stringOrNull(ref.behaviorId);
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

/**
 * A blind run's player-safe evidence: node availability only, events as bare matches, modifier
 * snapshots as bare contributions, and no items, rolls or snapshots, so no drop info leaks.
 */
export function redactRichEvidence(evidence = {}) {
  const redacted = cloneJson(evidence) || {};
  if (redacted.node) {
    redacted.node = {
      available: Number(redacted.node.remaining ?? redacted.node.current ?? 0) > 0,
    };
  }
  if (Array.isArray(redacted.events)) {
    redacted.events = redacted.events.map(() => ({ matched: true }));
  }
  if (
    redacted.characterModifierSnapshot &&
    typeof redacted.characterModifierSnapshot === 'object'
  ) {
    redacted.characterModifierSnapshot = {
      rows: normalizeList(redacted.characterModifierSnapshot.rows).map((row) => ({
        rowId: null,
        contributions: normalizeList(row?.contributions).map((entry) => ({
          contribution: Number(entry?.contribution ?? 0),
        })),
      })),
      events: normalizeList(redacted.characterModifierSnapshot.events).map((event) => ({
        eventId: null,
        contributions: normalizeList(event?.contributions).map((entry) => ({
          contribution: Number(entry?.contribution ?? 0),
        })),
      })),
    };
  }
  delete redacted.items;
  delete redacted.rolls;
  delete redacted.dropRows;
  delete redacted.selectedItems;
  delete redacted.selectedEvents;
  delete redacted.runtimeSnapshot;
  delete redacted.encounterOutcome;
  delete redacted.revealEvents;
  return redacted;
}

/** A deep clone without the resume-time `economyEvidence.runtimeSnapshot`, for players. */
export function stripRuntimeSnapshotFromRun(run) {
  if (!run || typeof run !== 'object') return run;
  const publicRun = cloneJson(run);
  if (publicRun.economyEvidence && typeof publicRun.economyEvidence === 'object') {
    delete publicRun.economyEvidence.runtimeSnapshot;
  }
  return publicRun;
}

export {
  cloneJson,
  iterableToArray as normalizeList,
  laxNumberOrNull as numberOrNull,
  stringOrEmpty,
  stringOrNull,
} from '../utils/scalars.js';

/**
 * Internal helpers shared by GatheringEngine and its extracted collaborators
 * (e.g. GatheringWorldTimeProcessor, GatheringListingBuilder). These are
 * intentionally tiny, dependency-free coercions, collection-normalizers, and
 * player-safe run redactors; they live in one module so the engine and its
 * collaborators reuse a single definition instead of duplicating it (the
 * duplication gate forbids a second copy in the builder).
 */

/**
 * Normalize an array / Map / iterable / Foundry collection into a plain array.
 * Returns an empty array for nullish or non-iterable input.
 *
 * @param {*} value
 * @returns {Array<*>}
 */
export function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

/**
 * Resolve a document's stable id, preferring `id` then `uuid`.
 *
 * @param {*} document
 * @returns {string|null}
 */
export function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

/**
 * Trim a value to a non-empty string, or null when empty / nullish.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * Iterate a Foundry collection / array / EmbeddedCollection (scenes, regions,
 * behaviours) tolerantly, mirroring the scan in `interactableMarkerDepletion`.
 * Returns an empty array for nullish input so callers can `for...of` safely.
 *
 * @param {*} collection
 * @returns {Iterable<*>}
 */
export function iterateCollection(collection) {
  if (!collection) return [];
  if (typeof collection[Symbol.iterator] === 'function') return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (typeof collection?.values === 'function') return collection.values();
  return [];
}

/**
 * Trim a value to a string, or `''` when nullish. Mirrors `stringOrNull` but
 * never returns null, for fields the listing models render directly.
 *
 * @param {*} value
 * @returns {string}
 */
export function stringOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Coerce a value to a finite number, or null when not finite.
 *
 * @param {*} value
 * @returns {number|null}
 */
export function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Shallow-clone a plain object, or null for arrays / nullish / non-objects.
 *
 * @param {*} value
 * @returns {object|null}
 */
export function plainObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...value };
}

/**
 * Structured deep clone via JSON round-trip. Returns `undefined` for
 * `undefined` input (so optional fields stay absent rather than becoming null).
 *
 * @param {*} value
 * @returns {*}
 */
export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Normalize a value into a de-duplicated array of trimmed non-empty strings.
 * A non-array scalar is treated as a single-element list.
 *
 * @param {*} value
 * @returns {string[]}
 */
export function normalizeStringList(value) {
  return [
    ...new Set(
      normalizeList(Array.isArray(value) ? value : value ? [value] : [])
        .map((entry) => stringOrEmpty(entry))
        .filter(Boolean)
    ),
  ];
}

/**
 * De-duplicate a list of blocked-reason objects by `code`, keeping the first
 * occurrence of each code.
 *
 * @param {Array<{code?: string}>} reasons
 * @returns {Array<object>}
 */
export function uniqueReasons(reasons) {
  const byCode = new Map();
  for (const reason of reasons) {
    if (!reason?.code || byCode.has(reason.code)) continue;
    byCode.set(reason.code, reason);
  }
  return [...byCode.values()];
}

/**
 * Build the player-facing actor option `{ id, uuid, name, img }`.
 *
 * @param {*} actor
 * @returns {{id: string|null, uuid: string|null, name: string, img: string|null}}
 */
export function actorToOption(actor) {
  return {
    id: idOf(actor),
    uuid: stringOrNull(actor?.uuid),
    name: stringOrEmpty(actor?.name),
    img: stringOrNull(actor?.img),
  };
}

/**
 * Whether an actor matches a remembered id by `id` or `uuid`.
 *
 * @param {*} actor
 * @param {*} actorId
 * @returns {boolean}
 */
export function actorMatchesId(actor, actorId) {
  const id = String(actorId);
  return actor?.id === id || actor?.uuid === id;
}

/**
 * Whether two actor references denote the same actor (identity, `id`, or `uuid`).
 *
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
export function sameActor(left, right) {
  return Boolean(
    left && right && (left === right || left.id === right.id || left.uuid === right.uuid)
  );
}

/**
 * Whether an actor's `uuid` matches a run's persisted `actorUuid`.
 *
 * @param {*} actor
 * @param {*} actorUuid
 * @returns {boolean}
 */
export function sameActorUuid(actor, actorUuid) {
  const runActorUuid = stringOrNull(actorUuid);
  if (!runActorUuid) return false;
  return stringOrNull(actor?.uuid) === runActorUuid;
}

/**
 * Normalize a value into an array with falsy entries removed.
 *
 * @param {*} value
 * @returns {Array<*>}
 */
export function normalizeActorList(value) {
  return normalizeList(value).filter(Boolean);
}

/**
 * Invoke `fn(payload)` when callable, otherwise resolve to an empty array.
 * Used to call optional async collaborators (e.g. `getSelectableActors`).
 *
 * @param {*} fn
 * @param {*} payload
 * @returns {Promise<*>}
 */
export async function callMaybe(fn, payload) {
  return typeof fn === 'function' ? fn(payload) : [];
}

/**
 * Normalize a scene-interactable ref to `{sceneId, regionId, behaviorId}` (issue
 * 302), or null when any id is missing. Used to persist the ref on a waiting run
 * and resolve it back at maturity.
 *
 * @param {object|null} ref
 * @returns {{sceneId:string, regionId:string, behaviorId:string}|null}
 */
export function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = stringOrNull(ref.sceneId);
  const regionId = stringOrNull(ref.regionId);
  const behaviorId = stringOrNull(ref.behaviorId);
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

/**
 * Redact a run's rich economy evidence to a player-safe shape: collapse node
 * details to availability only, flatten matched events, redact character
 * modifier snapshots to bare contributions, and drop item/roll/snapshot
 * internals. Used for opaque-blind runs so aggregate drop info cannot leak.
 *
 * @param {object} [evidence]
 * @returns {object}
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

/**
 * Deep-clone a run and strip the internal `economyEvidence.runtimeSnapshot` so a
 * transparent (non-blind) terminal/waiting run can be surfaced to players
 * without leaking the resume-time snapshot.
 *
 * @param {object} run
 * @returns {object}
 */
export function stripRuntimeSnapshotFromRun(run) {
  if (!run || typeof run !== 'object') return run;
  const publicRun = cloneJson(run);
  if (publicRun.economyEvidence && typeof publicRun.economyEvidence === 'object') {
    delete publicRun.economyEvidence.runtimeSnapshot;
  }
  return publicRun;
}

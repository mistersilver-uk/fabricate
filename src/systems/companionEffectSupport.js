/** Payload, actor and marker helpers the companion reward effect kinds share (issue 1954). */
import { sourceCarriesCompanionEffectMarker } from '../config/flags.js';
import { getByPath } from '../utils/objectPath.js';
import { isPlainObject } from '../utils/scalars.js';

/** A plan failure or a subwrite failure, always `{ reason, detail }`. */
export function effectFailureOf(reason, detail = null) {
  return { reason, detail };
}

/** `value` when it is a plain object with exactly `keys`, else `null`. */
export function exactObject(value, keys) {
  if (!isPlainObject(value)) return null;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key)) ? value : null;
}

export function nonblank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The recipient list, each exactly `{ actorId, [key] }`, or a failure. An empty list, or a
 * recipient whose `key` list is empty, refuses the whole effect rather than applying nothing.
 */
export function readRecipients(payload, key, { list = true } = {}) {
  const recipients = payload?.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { failure: effectFailureOf('noRecipients') };
  }
  for (const recipient of recipients) {
    const valid = exactObject(recipient, ['actorId', key]) && nonblank(recipient.actorId);
    if (!valid || (list && !Array.isArray(recipient[key]))) {
      return { failure: effectFailureOf('invalidPayload', 'recipient') };
    }
    if (list && recipient[key].length === 0) {
      return { failure: effectFailureOf('emptyRecipient', recipient.actorId) };
    }
  }
  return { recipients };
}

/** A world actor by id with a document uuid; a synthetic token actor is refused. */
export function resolveWorldActor(resolveActor, actorId) {
  const actor = typeof resolveActor === 'function' ? resolveActor(actorId) : null;
  if (!actor || actor.isToken === true || !nonblank(actor.uuid)) return null;
  return actor;
}

/** Every recipient's actor, in order, or the first that does not resolve. */
export function resolveRecipientActors(recipients, resolveActor) {
  const actors = [];
  for (const { actorId } of recipients) {
    const actor = resolveWorldActor(resolveActor, actorId);
    if (!actor) return { failure: effectFailureOf('actorNotFound', actorId) };
    actors.push(actor);
  }
  return { actors };
}

/** The update fields that replace the single marker slot wholesale. */
export { companionEffectMarkerUpdate as markerUpdateFor } from '../config/flags.js';

/**
 * Update fields as the persisted post-value list `[{ path, value }]`: a record flag never holds
 * a dotted key, since Foundry would expand it on write and the stored record would differ.
 */
export function postValuesOf(updates) {
  return Object.entries(updates).map(([path, value]) => ({ path, value }));
}

/** Marker AND every intended `[{ path, value }]` post-value on the document's `_source`. */
export function sourceCarries(document, marker, postValues) {
  if (!Array.isArray(postValues) || postValues.length === 0) return false;
  if (!sourceCarriesCompanionEffectMarker(document, marker)) return false;
  const source = document?._source;
  return postValues.every(
    (entry) => isPlainObject(entry) && getByPath(source, entry.path) === entry.value
  );
}

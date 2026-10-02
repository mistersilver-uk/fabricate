/**
 * GM-authoritative delivery of progressive component complications (issue 1286), specified in
 * `openspec/specs/recipes-and-steps/spec.md` § GM-authoritative execution and the sections after
 * it. The acting client commits the award, posts the player card and relays the complication to
 * the elected GM as an action on the existing `module.fabricate` channel. The payload is
 * addressing only: the GM re-reads every executable and disclosure decision from its own
 * `craftingSystems` setting and re-authorizes the actor against the server-attested sender. One
 * message carries every complication for one addressed `(system, actor)` pair, because both are
 * authorization inputs. This is the pure half (routing, validation, throttle, de-duplication and
 * the GM-side apply loop) with the Foundry edges injected, so tests drive the addressing-only
 * contract with real inputs. `main.js` registers the handler and injects the thin Foundry edges
 * this module never calls directly: `game.socket.emit`, `game.users.activeGM` (elected-GM
 * lookup), `fromUuid`, `MacroExecutor.run`, `ChatMessage.create`.
 */

import { COMPLICATION_ACTIVITIES } from '../utils/componentComplications.js';
import { trimString } from '../utils/scalars.js';

import { createDepletionRateLimiter } from './gatheringNodeSocket.js';

export const COMPLICATION_DELIVER = 'complicationDeliver';

/**
 * Messages one sender may deliver per window, sized on the fanned-out worst case: a bulk run
 * relays once per addressed pair, so one gesture at the 25-target bulk selection cap is 25
 * messages, and 100 holds about three such runs plus one-at-a-time crafts and chained steps
 * while leaving a scripted flood useless. The 25 is stated rather than imported to keep this
 * module service-free; re-read this if the cap moves. A sender's GM-side ceiling is this times
 * `COMPLICATION_DELIVERY_MAX_ENTRIES`, each entry able to cost one chat message and one macro.
 */
export const COMPLICATION_RATE_LIMIT = 100;

/** Rolling window for {@link COMPLICATION_RATE_LIMIT}, in milliseconds. */
export const COMPLICATION_RATE_WINDOW_MS = 60_000;

/**
 * Entries one message may address; the excess is dropped rather than refusing the message, so a
 * forged tail cannot suppress the legitimate head. A bulk salvage multiplies rows, complications
 * and stage occurrences (a complication fires per result entry), so an extreme system can reach
 * this; the dropped tail loses its GM card and macro, never an award.
 */
export const COMPLICATION_DELIVERY_MAX_ENTRIES = 250;

/** Delivery keys the de-duplication set retains before evicting the oldest. */
export const COMPLICATION_DEDUPE_LIMIT = 512;

/** One addressed complication, or `null`. `bucket` and `effectRollTotal` are type-checked only:
 *  they are the acting client's unverifiable claim, which the GM never acts on. */
function normalizeComplicationEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const componentId = trimString(entry.componentId);
  const complicationId = trimString(entry.complicationId);
  const resultId = trimString(entry.resultId);
  const activity = trimString(entry.activity);
  if (!componentId || !complicationId || !resultId) return null;
  if (!COMPLICATION_ACTIVITIES.includes(activity)) return null;
  const total = entry.effectRollTotal;
  return {
    componentId,
    complicationId,
    resultId,
    activity,
    bucket: trimString(entry.bucket),
    effectRollTotal: typeof total === 'number' && Number.isFinite(total) ? total : null,
  };
}

/** Rebuilt from the addressing fields only, so a macro uuid, visibility, name, description or
 *  speaker on the wire is discarded before anything downstream can read it. */
export function validateComplicationDeliveryPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== COMPLICATION_DELIVER) return null;
  const craftingSystemId = trimString(payload.craftingSystemId);
  const actorUuid = trimString(payload.actorUuid);
  const resolutionId = trimString(payload.resolutionId);
  if (!craftingSystemId || !actorUuid || !resolutionId) return null;
  if (!Array.isArray(payload.complications)) return null;
  const complications = payload.complications
    .slice(0, COMPLICATION_DELIVERY_MAX_ENTRIES)
    .map((entry) => normalizeComplicationEntry(entry))
    .filter(Boolean);
  if (complications.length === 0) return null;
  return {
    action: COMPLICATION_DELIVER,
    craftingSystemId,
    actorUuid,
    resolutionId,
    complications,
  };
}

/** `resolutionId` separates resolutions and `resultId` separates stage occurrences. */
export function complicationDeliveryKey({ resolutionId, resultId, complicationId } = {}) {
  return [resolutionId, resultId, complicationId].map((part) => String(part ?? '')).join('|');
}

/**
 * The delivery writer: the elected GM applies locally (a socket emit never reaches its emitter)
 * and any other client emits. With no GM connected the delivery is dropped and reported through
 * `onUnroutable`, unlike the blocking blind-gathering relay, because the award is already
 * committed (spec § No GM connected). `mintResolutionId` is injected to keep Foundry out and runs
 * once per `deliver`, which answers whether the complications were routed at all.
 */
export function createComplicationDeliveryWriter({
  isActiveGM,
  hasActiveGM = null,
  onUnroutable = null,
  emitComplications,
  applyComplications,
  mintResolutionId = null,
} = {}) {
  const mint = () => (typeof mintResolutionId === 'function' ? trimString(mintResolutionId()) : '');
  return {
    deliver({ craftingSystemId, actorUuid, complications, resolutionId } = {}) {
      const payload = validateComplicationDeliveryPayload({
        action: COMPLICATION_DELIVER,
        craftingSystemId,
        actorUuid,
        resolutionId: trimString(resolutionId) || mint(),
        complications,
      });
      if (!payload) return false;
      if (typeof isActiveGM === 'function' && isActiveGM() === true) {
        void applyComplications?.(payload);
        return true;
      }
      if (typeof hasActiveGM === 'function' && hasActiveGM() !== true) {
        onUnroutable?.(payload);
        return false;
      }
      emitComplications?.(payload);
      return true;
    },
  };
}

/**
 * Route an inbound delivery: only the elected GM applies. A blank sender is refused fail-closed,
 * and the attested sender id goes to the applier, which re-authorizes the actor against it.
 * Answers whether this client applied at least one complication.
 */
export function routeComplicationDeliveryMessage(
  payload,
  { isActiveGM, senderId, applyComplications, allowSender = null, isFreshDelivery = null } = {}
) {
  const normalized = validateComplicationDeliveryPayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  const sender = authenticateComplicationSender({ senderId, allowSender, request: normalized });
  if (!sender) return false;
  const complications = freshComplications(normalized, isFreshDelivery);
  if (complications.length === 0) return false;
  void applyComplications?.({ ...normalized, complications, senderId: sender });
  return true;
}

/** The attested sender, or `''` when refused. Rate limiting runs last and charges per message. */
function authenticateComplicationSender({ senderId, allowSender, request }) {
  const sender = senderId === undefined || senderId === null ? '' : String(senderId);
  if (!sender) {
    console.warn('Fabricate | Refused a complication delivery from an unauthenticated sender', {
      craftingSystemId: request.craftingSystemId,
    });
    return '';
  }
  if (typeof allowSender === 'function' && allowSender(sender) !== true) {
    console.warn('Fabricate | Refused a complication delivery: sender rate limit exceeded', {
      senderId: sender,
      craftingSystemId: request.craftingSystemId,
    });
    return '';
  }
  return sender;
}

/** Filtered per entry, so a re-delivered message keeps any new stage occurrence it carries. */
function freshComplications(request, isFreshDelivery) {
  if (typeof isFreshDelivery !== 'function') return request.complications;
  return request.complications.filter((entry) =>
    isFreshDelivery(complicationDeliveryKey({ resolutionId: request.resolutionId, ...entry }))
  );
}

/** Reuses the node-depletion limiter as its own instance and budget; in-memory, per GM client. */
export function createComplicationRateLimiter({
  now,
  limit = COMPLICATION_RATE_LIMIT,
  windowMs = COMPLICATION_RATE_WINDOW_MS,
} = {}) {
  return createDepletionRateLimiter({ now, limit, windowMs });
}

/**
 * Bounded, non-persistent de-duplication within one context. It cannot cover one GM user with
 * two tabs (two realms, two sets; Foundry elects a user, not a client), so a complication macro
 * must tolerate running twice (spec § Delivery is at-most-once). True on a key's first sight.
 */
export function createComplicationDeliveryDedupe({ limit = COMPLICATION_DEDUPE_LIMIT } = {}) {
  const seen = new Set();
  return (key) => {
    const entryKey = String(key ?? '');
    if (!entryKey || seen.has(entryKey)) return false;
    seen.add(entryKey);
    if (seen.size > limit) seen.delete(seen.values().next().value);
    return true;
  };
}

/**
 * Re-read one addressed complication from this client's own components, or `null` (dropped). An
 * exact id match with no positional fallback, ever: a fallback would fire the GM's first authored
 * complication for an id the sender chose (spec § The relay payload carries ADDRESSING ONLY).
 */
export function findAuthoredComplication(components, { componentId, complicationId } = {}) {
  const wantedComponent = trimString(componentId);
  const wantedComplication = trimString(complicationId);
  if (!wantedComponent || !wantedComplication) return null;
  const held = Array.isArray(components) ? components : [];
  const component = held.find((candidate) => candidate?.id === wantedComponent);
  if (!component) return null;
  const authored = Array.isArray(component.complications) ? component.complications : [];
  const complication = authored.find((candidate) => candidate?.id === wantedComplication);
  return complication ? { component, complication } : null;
}

/** A call-site check (spec § Essence Property Macros requirement 7): a chat macro also has a
 *  string `command` and Macro defaults to `chat`; `{SCRIPT, CHAT}` is the whole type set. */
export function isRunnableComplicationMacro(macro) {
  return Boolean(macro) && macro.type === 'script' && typeof macro.command === 'string';
}

/**
 * The macro scope, built from the GM-side re-read. `MacroExecutor` binds only `context`, `args`
 * and `scope`, so any other name resolves on the executing GM client (its character, canvas,
 * selection and `isGM === true`); the actor, token and speaker are therefore passed explicitly.
 * A macro therefore cannot prompt the acting player. `bucket`, `resultId` and `effectRollTotal`
 * are the acting client's claim, never acted on.
 */
export function buildComplicationMacroContext({
  craftingSystemId,
  component,
  complication,
  entry,
  actor,
  token = null,
  speaker = null,
  senderUser,
  resolutionId,
} = {}) {
  return {
    kind: 'componentComplication',
    craftingSystemId,
    activity: entry?.activity,
    resolutionId,
    resultId: entry?.resultId,
    bucket: entry?.bucket,
    effectRollTotal: entry?.effectRollTotal,
    component: { id: component?.id ?? entry?.componentId, name: component?.name ?? '' },
    complication: {
      id: complication?.id,
      name: complication?.name,
      severity: complication?.severity,
      visibility: complication?.visibility,
    },
    actor,
    token,
    speaker,
    requestingUser: senderUser,
  };
}

/**
 * Resolve each addressed complication against this client's components and run `execute`
 * sequentially, each awaited in its own `try`: an unresolved entry runs nothing, and a throwing
 * macro costs neither later entries nor the GM card (its row survives with a `null` report).
 * Answers one row per resolved entry, in delivery order.
 */
export async function applyAuthoredComplications({
  components = [],
  complications = [],
  execute = null,
} = {}) {
  const applied = [];
  for (const entry of Array.isArray(complications) ? complications : []) {
    const authored = findAuthoredComplication(components, entry);
    if (!authored) continue;
    let report = null;
    try {
      report = (await execute?.({ ...authored, entry })) ?? null;
    } catch (error) {
      console.error('Fabricate | A complication failed to apply on the GM client', error);
    }
    applied.push({ ...authored, entry, report });
  }
  return applied;
}

/**
 * GM-AUTHORITATIVE delivery of progressive component complications (issue 1286).
 *
 * A complication's GM-only chat output and its macro must run on a GM client. A player
 * cannot author a message as the GM — `#canCreate` forbids it, and a GM-only card a
 * player creates renders in that player's OWN sidebar because `ChatMessage#visible`
 * short-circuits on `isAuthor` — and a macro run on the acting client would carry the
 * acting client's authority rather than the GM's. The acting client therefore commits
 * the award, posts the player-facing card itself, and relays the complication to the
 * elected GM over the socket this module routes.
 *
 * THERE IS NO NEW SOCKET. Foundry registers exactly one event per package, so this is a
 * new `action` on the existing `module.fabricate` channel, dispatched from the single
 * router in `main.js` inside its own `try`/`catch` — a throw on one payload must never
 * starve the others sharing the channel.
 *
 * ADDRESSING ONLY. The payload names the crafting system, the component, the authored
 * complication, the stage occurrence and the acting actor, plus the outcome facts the
 * card reports. It carries NO `macroUuid`, NO `visibility`, and no name, description,
 * severity, chat content or speaker. The elected GM re-reads the authored complication
 * from its OWN copy of the `craftingSystems` world setting and takes every executable
 * and disclosure decision from that lookup; a payload naming a complication that does
 * not exist on that component is dropped. A forged message can therefore do no more
 * than fire a complication the GM themselves authored, for an actor the SENDER already
 * owns — and the sender is the server-attested second callback argument of the socket
 * handler, never a payload field.
 *
 * ABUSE SURFACE, stated precisely: an authenticated player can ask the GM to fire
 * complications their own actors are eligible for, at {@link COMPLICATION_RATE_LIMIT}.
 * That is a self-inflicted nuisance, not privilege escalation. `bucket`, `resultId` and
 * `effectRollTotal` are client-supplied outcome facts the GM cannot verify, so the GM
 * card presents them as the acting client's CLAIM rather than as GM-attested.
 *
 * ONE MESSAGE PER ADDRESSED (SYSTEM, ACTOR) PAIR. Every complication of one resolution
 * rides a single message with an array payload, and a bulk run batches its rows the same
 * way — but it batches per addressed pair rather than per RUN, because the payload names
 * one crafting system and one actor and BOTH are authorization inputs: the GM re-reads
 * the authored complication from that system's record and re-authorizes that actor
 * against the attested sender. Neither can be per-entry without moving the authorization
 * decision onto the wire. So the ordinary bulk run — one actor, one system — emits one
 * message however many rows it carries, and a run deliberately fanned out across N pairs
 * emits N. Per-ROW emits would collide with the rate limiter head-on, silently refusing
 * rows on a path the player never sees; batching also fixes emit ordering GM-side.
 *
 * This module is the PURE half of the channel: the routing decision (payload validation,
 * who applies, GM-on-GM local apply, per-sender throttle, per-context de-duplication) AND
 * the pure half of the GM-side apply (the authored re-read, the `script` discriminant, the
 * macro scope, and the per-entry isolation loop). It touches no Foundry global: `main.js`
 * registers the handler, mints the resolution id, and injects the thin Foundry edges
 * (`game.socket.emit`, `game.users.activeGM`, `fromUuid`, `MacroExecutor.run`,
 * `ChatMessage.create`).
 *
 * The apply half lives HERE rather than in `main.js` for the reason this split exists at
 * all: `src/main.js` cannot be imported under `node --test`, so anything left there can
 * only be pinned by source-TEXT assertions, and a source pin cannot tell an exact id match
 * apart from a match with a positional fallback. The addressing-only contract is the one
 * property of this channel that must be driven with real inputs, so the functions that
 * enforce it are importable.
 */

import { COMPLICATION_ACTIVITIES } from '../utils/componentComplications.js';

import { createDepletionRateLimiter } from './gatheringNodeSocket.js';

export const COMPLICATION_DELIVER = 'complicationDeliver';

/**
 * Complication messages one sender may deliver per window before the GM starts refusing.
 *
 * ## Derived from the SELECTION CAP, not from "one message per run"
 *
 * It is not one message per fired complication — a resolution emits one message however
 * many complications it carries. But it is not one per RUN either: a bulk run batches per
 * addressed `(craftingSystemId, actorUuid)` pair, because both are authorization inputs
 * (see the module docblock). The legitimate worst case is therefore a bulk selection
 * fanned all the way out — one target per pair — which at the bulk selection cap of 25
 * targets is 25 messages for ONE player gesture.
 *
 * A player may reasonably make several such gestures inside one 60-second window, so the
 * bound starts at roughly three fully fanned-out runs (75) and adds headroom for what
 * else is legitimately in flight beside them: deliberate one-at-a-time crafts and
 * salvages, one message each, and a collapsed crafting chain, which recurses into
 * `craft()` per step and so relays once per step.
 *
 * 100 in a minute covers that and still makes a scripted flood useless. The previous 30
 * was derived from the retired premise that a bulk run of any size emits exactly one
 * message: two fanned-out runs spent 50 against it and silently dropped the tail, which
 * is the failure the batching exists to close.
 *
 * The 25 is stated in prose and NOT imported from `BulkSalvageService`: this module is the
 * pure half of a socket channel and must not take a dependency on a crafting service to
 * describe its own budget. If the selection cap moves, this reasoning is what has to be
 * re-read — which is why it is written down rather than computed.
 */
/*
 * The message count is not the only term in a sender's GM-side ceiling.
 * `COMPLICATION_DELIVERY_MAX_ENTRIES` bounds each message, so the worst case an authenticated
 * sender can put in front of the elected GM is the product of the two — each entry able to cost
 * one `ChatMessage.create` and one `MacroExecutor.run`. Raising either raises that product.
 * It is bounded abuse rather than a new hazard: the GM re-reads every complication from its own
 * world setting, so a forger can only replay complications the GM authored, and the rate limiter
 * is charged per message and applied last so a refused payload costs a sender nothing.
 */
export const COMPLICATION_RATE_LIMIT = 100;

/** Rolling window for {@link COMPLICATION_RATE_LIMIT}, in milliseconds. */
export const COMPLICATION_RATE_WINDOW_MS = 60_000;

/**
 * Entries one message may address. Bounds a hostile payload. Excess entries are dropped
 * rather than refusing the whole message, so a forged tail cannot suppress the legitimate
 * head.
 *
 * The legitimate worst case is a bulk salvage of an entire inventory, and it carries THREE
 * terms rather than two: rows (capped at 25), the complications a row's yields author, and
 * the STAGE OCCURRENCES those yields take — a complication fires per result entry
 * (`openspec/specs/resolution-modes/spec.md`), so a component staged five times contributes
 * five entries. A deliberately extreme system can therefore reach this bound, and the tail
 * beyond it is dropped: a lost GM card and a lost macro, never a lost award, because
 * complications are strictly downstream of a committed award. Raising the number raises the
 * abuse product above in the same proportion, which is why it is not raised reflexively.
 */
export const COMPLICATION_DELIVERY_MAX_ENTRIES = 250;

/** Delivery keys the de-duplication set retains before evicting the oldest. */
export const COMPLICATION_DEDUPE_LIMIT = 512;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize one addressed complication, or `null` when it addresses nothing.
 *
 * `activity` is checked against the frozen vocabulary rather than a restated copy of it.
 * `bucket` and `effectRollTotal` are NOT validated beyond their type: they are the
 * acting client's outcome claim, which the GM cannot verify and does not act on.
 *
 * @param {unknown} entry
 * @returns {{ componentId: string, complicationId: string, resultId: string,
 *   activity: string, bucket: string, effectRollTotal: number|null } | null}
 */
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

/**
 * Validate a complication-delivery payload. A well-formed payload names the crafting
 * system, the acting actor and the resolution, and addresses at least one complication.
 *
 * The normalized payload is REBUILT from the addressing fields, so a payload that also
 * carried a macro uuid, a visibility, a name, a description or a speaker loses them
 * here: nothing downstream can read an executable or disclosure decision off the wire.
 *
 * @param {object} payload
 * @returns {{ action: string, craftingSystemId: string, actorUuid: string,
 *   resolutionId: string, complications: object[] } | null}
 */
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

/**
 * The de-duplication key of one addressed complication.
 *
 * `resolutionId` is what makes it unique: `(componentId, complicationId)` repeats across
 * two legitimate resolutions, and `resultId` distinguishes the stage OCCURRENCE, because
 * a component may legitimately appear several times in one resolution.
 *
 * @param {{ resolutionId?: string, resultId?: string, complicationId?: string }} parts
 * @returns {string}
 */
export function complicationDeliveryKey({ resolutionId, resultId, complicationId } = {}) {
  return [resolutionId, resultId, complicationId].map((part) => String(part ?? '')).join('|');
}

/**
 * Build the delivery writer: the elected GM applies locally (no socket round-trip,
 * because `handleCustomSocket` broadcasts and an emit never reaches the emitter); any
 * other client emits for the elected GM to apply. Mirrors
 * `createGatheringBlindStartWriter`.
 *
 * NO GM CONNECTED is a DROP here, deliberately unlike the blind-gathering relay, which
 * blocks. A complication is strictly downstream of a committed award, so blocking would
 * strand a completed craft: the award, the player-facing card and the run record are
 * already written and stay unaffected, while the GM-only card and the macro are lost and
 * reported through `onUnroutable` as a local warning on the acting client. There is no
 * store to defer them into — a non-GM client may not author a GM message, must not write
 * the run record, and cannot write a world setting — so "delivered when a GM connects"
 * would be a promise with no carrier.
 *
 * `mintResolutionId` is injected rather than called for the same reason the rest of the
 * module takes edges: minting reaches `foundry.utils.randomID()`, a Foundry global this
 * module must not touch. It mints ONCE per `deliver` call, which is once per resolution.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {() => boolean} [deps.hasActiveGM]
 * @param {(payload: object) => void} [deps.onUnroutable]
 * @param {(payload: object) => void} deps.emitComplications
 * @param {(payload: object) => (void|Promise<void>)} deps.applyComplications
 * @param {() => string} [deps.mintResolutionId]
 * @returns {{ deliver: (args: object) => boolean }} `deliver` reports whether the
 *   complications were routed (emitted or applied) at all.
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
 * Route an inbound complication-delivery message: only the elected GM applies. The
 * request is authenticated against the server-attested socket SENDER — Foundry passes a
 * trusted, non-forgeable sender user id as the second callback argument of a custom
 * module socket broadcast. An absent/blank sender is treated as unauthenticated and
 * REFUSED (fail-closed).
 *
 * The sender id is handed to the applier, which re-authorizes the addressed actor
 * against THAT user before anything executes. Routing deliberately does not decide
 * authorization itself: the actor is a Foundry document this module may not reach.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {string} [deps.senderId] The server-attested socket sender's user id.
 * @param {(args: object) => (void|Promise<void>)} deps.applyComplications
 * @param {(senderId: string) => boolean} [deps.allowSender] Per-sender rate gate.
 * @param {(key: string) => boolean} [deps.isFreshDelivery] Per-context de-duplication.
 * @returns {boolean} `true` when this client applied at least one complication.
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

/**
 * Resolve the attested sender of a delivery, or `''` when it must be refused. Rate
 * limiting runs LAST so a malformed or unauthenticated message never consumes a sender's
 * budget, and it is charged per MESSAGE rather than per complication so a batched bulk
 * salvage costs one unit however many rows it carries.
 *
 * @param {object} args
 * @returns {string} The sender id, or `''` when refused.
 */
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

/**
 * Drop the complications this context has already applied. Filtering per ENTRY rather
 * than per message is what the at-most-once contract is stated on, and it keeps a
 * re-delivered message that also carries a new stage occurrence from losing that
 * occurrence.
 *
 * @param {object} request
 * @param {((key: string) => boolean)|null} isFreshDelivery
 * @returns {object[]}
 */
function freshComplications(request, isFreshDelivery) {
  if (typeof isFreshDelivery !== 'function') return request.complications;
  return request.complications.filter((entry) =>
    isFreshDelivery(complicationDeliveryKey({ resolutionId: request.resolutionId, ...entry }))
  );
}

/**
 * Build a per-sender sliding-window rate limiter for inbound complication deliveries.
 *
 * The sliding-window mechanism is REUSED from the node-depletion channel rather than
 * copied — a second copy would fail the duplication gate — but this is its own INSTANCE
 * with its own budget, so a burst of gathers cannot starve a legitimate complication
 * through one shared allowance. State is per elected-GM client and in-memory only: a
 * throttle, not an audit log.
 *
 * @param {object} [deps]
 * @param {() => number} [deps.now]
 * @param {number} [deps.limit]
 * @param {number} [deps.windowMs]
 * @returns {(senderId: string) => boolean}
 */
export function createComplicationRateLimiter({
  now,
  limit = COMPLICATION_RATE_LIMIT,
  windowMs = COMPLICATION_RATE_WINDOW_MS,
} = {}) {
  return createDepletionRateLimiter({ now, limit, windowMs });
}

/**
 * Build the bounded de-duplication set for inbound deliveries.
 *
 * Foundry elects a USER, and a user may hold several sockets, so an elected GM with the
 * world open twice passes the election predicate in both contexts and `recipients` does
 * not help — the server iterates every socket of the user. This set suppresses a repeat
 * delivery WITHIN one context.
 *
 * STATED HONESTLY: it cannot cover the two-tab case, and this module does not pretend
 * otherwise. Two tabs are two JS realms with two module instances and two empty sets,
 * and broadcast delivery is per socket, so a single context never receives a duplicate
 * anyway. Foundry offers no per-CLIENT election primitive, and the alternatives are a
 * world write per resolution or accepting the duplicate; this change accepts it. A
 * complication macro must tolerate running more than once, and the addressing-only
 * contract means a duplicate can only re-run the macro the GM themselves authored.
 *
 * The set is bounded and non-persistent — a reconnecting GM starts fresh — which is
 * appropriate for a filter whose job is to make a repeat unlikely, not impossible.
 *
 * @param {object} [deps]
 * @param {number} [deps.limit]
 * @returns {(key: string) => boolean} True the first time a key is seen.
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
 * Re-read ONE addressed complication from a client's OWN components (issue 1286).
 *
 * This is the whole point of the addressing-only payload: the macro uuid, the name, the
 * description, the severity and the visibility all come from the elected GM's own copy of
 * the `craftingSystems` world setting, and an addressing that names no such component or
 * no such complication resolves to `null` and is DROPPED. A forged message can therefore
 * do no more than fire a complication the GM themselves authored.
 *
 * ## Exact id match, with NO positional fallback
 *
 * The `find` has no `?? components[0]` / `?? authored[0]` tail and must never grow one.
 * With one, a payload naming a complication id that does not exist would fire the GM's
 * FIRST authored complication on that component — running a macro the GM never addressed,
 * from an id the sender chose. That is the exact behaviour
 * `openspec/specs/recipes-and-steps/spec.md` § "The relay payload carries ADDRESSING ONLY"
 * forbids when it says such a payload is dropped, and it is why this function is importable
 * rather than pinned by a text search of `main.js`.
 *
 * @param {Array<object>} components the components of the addressed crafting system, as
 *   THIS client holds them
 * @param {{componentId?: string, complicationId?: string}} [entry] the addressing
 * @returns {{component: object, complication: object}|null}
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

/**
 * Whether a resolved Macro document may be EXECUTED as a complication's macro.
 *
 * A CALL-SITE check, for the reason `recipes-and-steps/spec.md` § Essence Property Macros
 * requirement 7 gives: `command` is a required string on a chat macro too and the Macro
 * type defaults to `chat`, so an imported system or a hand-edited world setting can carry a
 * uuid naming a chat macro whose command is not valid JavaScript. `MACRO_TYPES` is exactly
 * `{SCRIPT, CHAT}`, so this is a COMPLETE discriminant rather than a sample of one.
 *
 * @param {object|null} macro
 * @returns {boolean}
 */
export function isRunnableComplicationMacro(macro) {
  return Boolean(macro) && macro.type === 'script' && typeof macro.command === 'string';
}

/**
 * The macro scope for a complication, built from the GM-side re-read.
 *
 * `MacroExecutor` binds only `('context','args','scope')` under `"use strict"`, so every
 * other name a macro author reaches for resolves as a global ON THE EXECUTING CLIENT — and
 * that client is now a GM rather than the acting player. `game.user.character` is the GM's
 * (normally none), `canvas` is whatever scene the GM is viewing, the token selection is the
 * GM's, and `game.user.isGM` is TRUE, so a macro branching on it flips. The speaker, the
 * acting actor and its token are therefore supplied EXPLICITLY, resolved by the caller from
 * the addressing. A complication macro that needs the acting player's own client — any UI
 * prompt — cannot work.
 *
 * `bucket`, `resultId` and `effectRollTotal` are the acting client's CLAIM about the
 * outcome, which the GM cannot verify; they are passed as reported and never acted on.
 *
 * @param {object} args
 * @returns {object}
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
 * Resolve every addressed complication against THIS client's own components and run the
 * injected executor for each, in order, containing one entry's failure from the next.
 *
 * ## Three properties, all of them assertable from here
 *
 * 1. **Dropped, not defaulted.** An entry whose component or complication does not resolve
 *    contributes nothing and runs nothing — see {@link findAuthoredComplication}.
 * 2. **Isolated.** The executor is awaited inside a `try`, so a macro that throws costs the
 *    resolution neither the entries after it nor the GM card: the row survives with a null
 *    report. Dropping that `await` would leave the loop looking correct while turning a
 *    contained GM-side failure into an unhandled rejection, which is why the report is
 *    asserted rather than merely the iteration count.
 * 3. **Sequential.** `Promise.all` would run every macro concurrently against one GM
 *    client's document state, which is the argument `BulkSalvageService` already makes for
 *    its own rows.
 *
 * @param {object} options
 * @param {Array<object>} [options.components] this client's components for the system
 * @param {Array<object>} [options.complications] the validated addressing entries
 * @param {(args: {component: object, complication: object, entry: object}) =>
 *   (object|Promise<object>)} [options.execute] the Foundry-side effect for one entry
 * @returns {Promise<Array<{component: object, complication: object, entry: object,
 *   report: object|null}>>} one row per entry that RESOLVED, in delivery order
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

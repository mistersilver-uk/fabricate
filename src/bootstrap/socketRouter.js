/**
 * The `module.fabricate` socket edge: the per-sender budgets, the elected-GM apply paths and the
 * router. `broadcast.emit` excludes the emitter, so a sender applies its own effect through these.
 */

import { InteractableManager } from '../canvas/InteractableManager.js';
import { handleInteractableSocketMessage } from '../canvas/interactableSocketBridge.js';
import { applyBulkChatVisibility } from '../systems/bulkChatVisibility.js';
import {
  buildGmComplicationCardContent,
  gmComplicationCardEntries,
  rollGmComplicationEffect,
} from '../systems/complicationRuntime.js';
import {
  applyAuthoredComplications,
  buildComplicationMacroContext,
  createComplicationDeliveryDedupe,
  createComplicationRateLimiter,
  isRunnableComplicationMacro,
  routeComplicationDeliveryMessage,
} from '../systems/complicationSocket.js';
import {
  EVENT_SCENE_SOCKET,
  routeEventSceneSocketMessage,
} from '../systems/eventSceneCoordinator.js';
import {
  createBlindStartRateLimiter,
  routeGatheringBlindStartMessage,
} from '../systems/gatheringBlindRunSocket.js';
import {
  createDepletionRateLimiter,
  routeGatheringNodeDepleteMessage,
} from '../systems/gatheringNodeSocket.js';
import { JOURNAL_RUN_SOCKET_KIND } from '../systems/journalRunCommands.js';
import { renderDialog, viewScene } from '../ui/svelte/util/foundryBridge.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';

import { getGatheringEngine } from './gatheringRuntime.js';

// Per-sender throttle for inbound gathering node depletions, held at module scope so the window
// survives across socket messages — a per-message limiter would never refuse anything. Only the
// active GM ever consults it.
const gatheringDepletionRateLimiter = createDepletionRateLimiter();
// A separate budget for the blind-start relay (issue 901), so a burst of gathers and a burst of
// starts cannot starve one another through a shared allowance.
const gatheringBlindStartRateLimiter = createBlindStartRateLimiter();
// Third budget, for the complication relay (issue 1286). Charged per MESSAGE, and one resolution —
// a whole bulk salvage included — emits exactly one.
const complicationDeliveryRateLimiter = createComplicationRateLimiter();
// Suppresses a complication re-delivered to THIS context. Module scope for the reason the limiters
// are: a per-message set would remember nothing. It cannot cover an elected GM with the world open
// in two tabs, which is a stated, accepted residual rather than an oversight.
const complicationDeliveryDedupe = createComplicationDeliveryDedupe();

/**
 * The ACTIVE-GM edge for a relayed BLIND gathering start (issue 901). THE GM RE-RUNS THE WHOLE
 * ATTEMPT WITH THE REQUESTING USER AS THE VIEWER, so every gate is re-evaluated against the player
 * who asked and `_isOpaqueBlindTask` stays TRUE. `senderId` is the attested socket sender.
 */
export async function applyGatheringBlindStart({
  senderId,
  environmentId,
  actorUuid,
  taskId = null,
  interactableRef = null,
} = {}) {
  const requester = game.users?.get?.(senderId) ?? null;
  if (!requester) return null;
  const resolve = globalThis.fromUuidSync;
  let startActor = null;
  try {
    startActor = typeof resolve === 'function' ? resolve(String(actorUuid)) : null;
  } catch {
    // An unresolvable uuid refuses the relayed start rather than throwing into the socket handler.
  }
  if (!startActor) return null;
  // `interactive: false`: the situational-modifier dialog belongs to the player's client, never the
  // GM's, and a timed blind run does not roll at start anyway.
  return getGatheringEngine()?.startAttempt({
    viewer: requester,
    actor: startActor,
    environmentId,
    taskId,
    interactableRef,
    interactive: false,
  });
}

/** Resolve an addressed actor synchronously, or `null` when it names nothing reachable. */
function resolveComplicationActor(actorUuid) {
  const resolve = globalThis.fromUuidSync;
  if (typeof resolve !== 'function' || !actorUuid) return null;
  try {
    return resolve(String(actorUuid)) ?? null;
  } catch {
    return null;
  }
}

/** The corpus the GM-side re-read resolves against (issue 1286): THIS client's own components. */
function complicationComponentsFor(craftingSystemId) {
  return fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId) ?? [];
}

/**
 * The token and speaker the GM side resolves for an addressed actor, NEVER read from the payload.
 * Guarded: a throwing `getSpeaker` would reject out of the fire-and-forget apply.
 */
function resolveComplicationSpeaker(actor) {
  try {
    const token = actor?.token ?? actor?.getActiveTokens?.(false, true)?.[0] ?? null;
    return { token, speaker: globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? null };
  } catch (error) {
    console.warn('Fabricate | Could not resolve a complication speaker', error);
    return { token: null, speaker: null };
  }
}

/**
 * Run one complication's authored macro on this elected-GM client and REPORT what happened, never
 * throwing; `recipes-and-steps/spec.md` § Complication Macros owns the `script` call-site gate, the
 * double uuid resolve and why the return is a REPORT rather than the macro's own value.
 */
async function runComplicationMacro({
  craftingSystemId,
  component,
  complication,
  entry,
  actor,
  token,
  speaker,
  senderUser,
  resolutionId,
}) {
  const macroUuid = complication.macroUuid;
  if (!macroUuid) return { status: 'none', macroUuid: null };
  let macro;
  try {
    macro = await fromUuid(macroUuid);
  } catch {
    macro = null;
  }
  if (!isRunnableComplicationMacro(macro)) {
    console.warn(
      `Fabricate | Complication "${complication.name || complication.id}" names a macro that could not be resolved to a script macro and was skipped (${macroUuid})`
    );
    return { status: 'skipped', macroUuid };
  }
  try {
    await MacroExecutor.run(
      macroUuid,
      buildComplicationMacroContext({
        craftingSystemId,
        component,
        complication,
        entry,
        actor,
        token,
        speaker,
        senderUser,
        resolutionId,
      })
    );
    return { status: 'ran', macroUuid };
  } catch (error) {
    console.error(`Fabricate | Complication macro failed (${macroUuid})`, error);
    return { status: 'failed', macroUuid };
  }
}

/**
 * Everything the elected GM DOES for one re-read complication: a `gmOnly` effect roll, then the
 * macro. Independent, so each carries its own guard, and the macro is unordered.
 */
async function runComplicationDelivery({
  craftingSystemId,
  component,
  complication,
  entry,
  actor,
  token,
  speaker,
  senderUser,
  resolutionId,
}) {
  const effect = await rollGmComplicationEffect({ complication, actor, speaker });
  const macro = await runComplicationMacro({
    craftingSystemId,
    component,
    complication,
    entry,
    actor,
    token,
    speaker,
    senderUser,
    resolutionId,
  });
  return { effect, macro };
}

/**
 * Whether the ADDRESSED crafting system narrates to chat at all (issue 1286). NEITHER THE MACRO NOR
 * THE EFFECT ROLL IS GATED BY THIS, and it SELECTS ROWS rather than vetoing the card —
 * `recipes-and-steps/spec.md` § Complication Macros owns both rules. Read from THIS client's copy,
 * defaulted CLOSED.
 */
function complicationChatOutputEnabled(craftingSystemId) {
  return (
    fabricate.craftingSystemManager?.getSystem?.(craftingSystemId)?.features?.chatOutput === true
  );
}

/**
 * Whether one delivered row's macro reports a CONFIGURATION FAULT rather than an outcome: `skipped`
 * is an unresolvable `macroUuid` and `failed` a body that threw; `none` and `ran` are outcomes.
 */
function hasComplicationMacroFault(row) {
  const status = row?.report?.macro?.status;
  return status === 'skipped' || status === 'failed';
}

/**
 * The GM-only chat card for one delivered resolution — the OUTPUT half of a `gmOnly` complication
 * (issue 1286); `recipes-and-steps/spec.md` § Complication Macros owns the row set and the
 * `chatOutput` rule. FOUR STEPS, IN AN ORDER THAT IS LOAD-BEARING: the `chatOutput` gate first and
 * over the ROW SET, so a gated-off system with nothing faulted returns before any projection;
 * SPEAKER before the visibility pass, which `applyBulkChatVisibility` states as a caller contract;
 * VISIBILITY before `create`, through an EXPLICIT `gmroll`; and `create` INSIDE the same guard, so
 * a card that could not be made GM-only is never posted.
 */
async function postGmComplicationCard({
  craftingSystemId,
  actor,
  speaker,
  senderUser,
  applied = [],
}) {
  try {
    // Over `applied` rather than the projected entries, so the suppressed case returns early.
    const delivered = Array.isArray(applied) ? applied : [];
    const reported = complicationChatOutputEnabled(craftingSystemId)
      ? delivered
      : delivered.filter((row) => hasComplicationMacroFault(row));
    if (reported.length === 0) return null;
    // `gmComplicationCardEntries` — the only projection that may carry an authored description or a
    // severity to a GM surface — augmented with what THIS client did. A suite can drive it directly.
    const entries = gmComplicationCardEntries(reported);
    const content = buildGmComplicationCardContent(
      { entries, actorName: actor?.name ?? '', reporterName: senderUser?.name ?? '' },
      (key) => game.i18n?.localize?.(key) ?? key
    );
    if (!content) return null;

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, 'gmroll');
    return await ChatMessage.create(chatData);
  } catch (error) {
    console.error('Fabricate | Failed to post the GM complication card', error);
    return null;
  }
}

/**
 * The ELECTED-GM edge for a relayed complication delivery (issue 1286); `recipes-and-steps/spec.md`
 * § Complication Macros owns the re-read, the attested `senderId` and the per-complication
 * isolation. The Foundry EDGE only — the pure half lives in `complicationSocket.js`.
 */
export async function applyComplicationDelivery({
  senderId,
  craftingSystemId,
  actorUuid,
  resolutionId,
  complications = [],
} = {}) {
  const senderUser = game.users?.get?.(senderId) ?? null;
  if (!senderUser) return null;
  const actor = resolveComplicationActor(actorUuid);
  // Failing CLOSED is right, but VISIBLY: `fromUuidSync` answers a compendium uuid with an index
  // entry carrying no `testUserPermission`, so such a delivery would be refused with no trace.
  if (!actor || typeof actor.testUserPermission !== 'function') {
    console.warn(
      'Fabricate | Refused a complication delivery: the addressed actor could not be resolved to a permission-testable document',
      {
        senderId,
        actorUuid,
      }
    );
    return null;
  }
  // Ask the ATTESTED SENDER's own permission directly: `actor.isOwner` resolves against the AMBIENT
  // `game.user`, which on the elected GM's client owns every actor. THE RULE (issue 1288) IS THAT NO
  // OWNERSHIP PREDICATE ON A GM-SIDE APPLY PATH MAY READ `isOwner`.
  if (actor.testUserPermission(senderUser, 'OWNER') !== true) {
    console.warn(
      'Fabricate | Refused a complication delivery: the sender does not own the addressed actor',
      {
        senderId,
        actorUuid,
      }
    );
    return null;
  }
  const { token, speaker } = resolveComplicationSpeaker(actor);
  const applied = await applyAuthoredComplications({
    components: complicationComponentsFor(craftingSystemId),
    complications,
    execute: ({ component, complication, entry }) =>
      runComplicationDelivery({
        craftingSystemId,
        component,
        complication,
        entry,
        actor,
        token,
        speaker,
        senderUser,
        resolutionId,
      }),
  });
  await postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied });
  return applied;
}

function fabricateEscapeHtml(value) {
  return String(value ?? '').replaceAll(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch]
  );
}

function eventScenePromptText(key, fallback, data = null) {
  const i18n = game?.i18n;
  if (!i18n) return fallback;
  if (data) return i18n.format?.(key, data) ?? fallback;
  const out = i18n.localize?.(key);
  return out && out !== key ? out : fallback;
}

// GM-side prompt choosing which active players to pull to a dropped event's linked scene. Lives
// here rather than in the engine because it is Foundry glue.
export async function showEventScenePrompt({ sceneUuid, eventName } = {}) {
  const scene = typeof fromUuid === 'function' ? await fromUuid(sceneUuid) : null;
  if (!scene) {
    ui.notifications?.warn?.(
      eventScenePromptText(
        'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Missing',
        "The event's linked scene could not be found."
      )
    );
    return;
  }
  const sceneName = scene.name || sceneUuid;
  const players = [...(game.users?.contents || [])].filter((user) => user?.active && !user?.isGM);
  const intro = eventScenePromptText(
    'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Intro',
    `${eventName || 'An event'} dropped. Move players to ${sceneName}?`,
    { event: eventName || 'An event', scene: sceneName }
  );
  const rows =
    players.length === 0
      ? `<p class="notes">${fabricateEscapeHtml(eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.NoPlayers', 'No active players to move.'))}</p>`
      : players
          .map(
            (user) =>
              `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="fab-pull-player" value="${fabricateEscapeHtml(user.id)}" checked /> ${fabricateEscapeHtml(user.name)}</label>`
          )
          .join('');
  const content = `<div style="display:flex;flex-direction:column;gap:6px;"><p>${fabricateEscapeHtml(intro)}</p>${rows}</div>`;
  renderDialog({
    title: eventScenePromptText(
      'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Title',
      'An event occurred'
    ),
    content,
    default: 'move',
    buttons: {
      move: {
        label: eventScenePromptText(
          'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Move',
          'Move players'
        ),
        callback: (html) => {
          const root = html?.[0] ?? html;
          const userIds = root
            ? [...root.querySelectorAll('.fab-pull-player:checked')].map((input) => input.value)
            : [];
          void viewScene(sceneUuid);
          if (userIds.length > 0) {
            game.socket?.emit(EVENT_SCENE_SOCKET, { action: 'pullToScene', sceneUuid, userIds });
          }
        },
      },
      cancel: {
        label: eventScenePromptText(
          'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Cancel',
          'Cancel'
        ),
      },
    },
  });
}

/**
 * Install the one `module.fabricate` listener. The server-attested `senderId` is the second
 * callback argument of a custom module socket broadcast, and every privileged leg below
 * authenticates against it rather than a payload `userId`, which is spoofable (issue 593).
 */
export function installSocketRouter(io) {
  const { fabricate } = io;
  game.socket?.on(EVENT_SCENE_SOCKET, (payload, senderId) => {
    if (
      payload?.kind === JOURNAL_RUN_SOCKET_KIND.REQUEST ||
      payload?.kind === JOURNAL_RUN_SOCKET_KIND.REPLY
    ) {
      Promise.resolve(fabricate.journalRunCommands?.handleSocketMessage(payload, senderId)).catch(
        (error) => console.error('Fabricate | Journal run socket command failed', error)
      );
    }
    // `senderId` is Foundry's server-attested sender user id — the trusted 2nd callback arg of a
    // custom module socket broadcast, set from the authenticated session in
    // `dist/server/sockets.mjs handleCustomSocket` — which the interactable handler authenticates
    // privileged edges against (issue 593); payload `userId` fields are spoofable. Guarded because
    // this router shares the `module.fabricate` channel with the Interactable round-trip below.
    try {
      routeEventSceneSocketMessage(payload, {
        currentUserId: () => game.user?.id,
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        showPrompt: showEventScenePrompt,
        viewSceneForSelf: (uuid) => viewScene(uuid),
      });
    } catch {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries the environment node depletion a player emits: only the active GM may
    // write `gatheringEnvironments`, so the decrement is applied here from its own stored state.
    try {
      routeGatheringNodeDepleteMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Bounds the residual denial-of-resource surface: the applier re-checks the node economy
        // but not whether the sender could reach that task, so throttle to human gathering speed.
        allowSender: gatheringDepletionRateLimiter,
        applyDeplete: (args) => {
          // The apply is async and nothing awaits a socket handler, so a failed world-setting write
          // must be caught here or it lands as an unhandled rejection on the GM's client.
          Promise.resolve(
            fabricate.gatheringRichStateService?.applyEnvironmentNodeDepletion(args)
          ).catch((error) => console.warn('Fabricate | Gathering node depletion failed', error));
        },
      });
    } catch {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries a player's BLIND gathering start (issue 901): only the active GM may
    // write `gatheringBlindRuns`, and only a client the player does not control may draw the task.
    try {
      routeGatheringBlindStartMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        allowSender: gatheringBlindStartRateLimiter,
        applyStart: (args) => {
          // Nothing awaits a socket handler, so a rejected start must be caught here.
          Promise.resolve(applyGatheringBlindStart(args)).catch((error) =>
            console.warn('Fabricate | Blind gathering start failed', error)
          );
        },
      });
    } catch {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries a relayed COMPLICATION delivery (issue 1286): the GM-only card and
    // macro run from that GM's OWN record. Addressing only — the wire names no macro or content.
    try {
      routeComplicationDeliveryMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Applied LAST of the refusal gates, so a malformed or unauthenticated message never
        // consumes a sender's budget. Charged per MESSAGE: one resolution emits exactly one.
        allowSender: complicationDeliveryRateLimiter,
        // An elected GM holding two sockets in ONE context receives the message twice; two tabs are
        // two contexts and remain a stated, accepted residual.
        isFreshDelivery: complicationDeliveryDedupe,
        applyComplications: (args) => {
          // Nothing awaits a socket handler, so a rejected apply must be caught here.
          Promise.resolve(applyComplicationDelivery(args)).catch((error) =>
            console.warn('Fabricate | Complication delivery failed', error)
          );
        },
      });
    } catch {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries the Interactable node-update and region-first activation round-trip:
    // only the active GM writes and validates, and only the targeted user opens a granted session.
    handleInteractableSocketMessage(payload, {
      senderId,
      isSenderGM: (id) => game.users?.get(id)?.isGM === true,
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant),
      notifyDenied: (reason) => InteractableManager.instance.notifyActivationDenied(reason),
    });
  });
}

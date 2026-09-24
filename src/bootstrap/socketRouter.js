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

// Per-sender budgets at module scope, so a window survives across messages; only the active GM
// consults them. Separate budgets, so bursts of one relay cannot starve another (issues 901, 1286).
const gatheringDepletionRateLimiter = createDepletionRateLimiter();
const gatheringBlindStartRateLimiter = createBlindStartRateLimiter();
// Charged per message; one resolution, a whole bulk salvage included, emits exactly one.
const complicationDeliveryRateLimiter = createComplicationRateLimiter();
// Suppresses a re-delivery to this context. An elected GM with the world open in two tabs is two
// contexts, an accepted residual.
const complicationDeliveryDedupe = createComplicationDeliveryDedupe();

/**
 * The active-GM edge for a relayed blind start (issue 901): the GM re-runs the whole attempt with
 * the attested sender as the viewer, so every gate is re-evaluated against the player who asked and
 * `_isOpaqueBlindTask` stays true.
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
    // An unresolvable uuid refuses the relayed start.
  }
  if (!startActor) return null;
  // The modifier dialog belongs to the player; a timed blind run rolls nothing at start.
  return getGatheringEngine()?.startAttempt({
    viewer: requester,
    actor: startActor,
    environmentId,
    taskId,
    interactableRef,
    interactive: false,
  });
}

function resolveComplicationActor(actorUuid) {
  const resolve = globalThis.fromUuidSync;
  if (typeof resolve !== 'function' || !actorUuid) return null;
  try {
    return resolve(String(actorUuid)) ?? null;
  } catch {
    return null;
  }
}

/** The GM-side re-read resolves against this client's own components (issue 1286). */
function complicationComponentsFor(craftingSystemId) {
  return fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId) ?? [];
}

/** Never read from the payload; guarded, since a throw would reject the fire-and-forget apply. */
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
 * Run one authored macro on the elected GM and report the outcome, never throwing;
 * `recipes-and-steps/spec.md` § Complication Macros.
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

/** A `gmOnly` effect roll, then the macro; independent, so each carries its own guard. */
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
 * Gates neither the macro nor the effect roll, and selects rows rather than vetoing the card
 * (issue 1286). Read from this client's copy, defaulting closed.
 */
function complicationChatOutputEnabled(craftingSystemId) {
  return (
    fabricate.craftingSystemManager?.getSystem?.(craftingSystemId)?.features?.chatOutput === true
  );
}

/** A configuration fault: `skipped` (unresolvable uuid) or `failed` (the body threw). */
function hasComplicationMacroFault(row) {
  const status = row?.report?.macro?.status;
  return status === 'skipped' || status === 'failed';
}

/**
 * The GM-only card for one delivered resolution (issue 1286). The order is load-bearing: the
 * `chatOutput` gate over the row set first; speaker before visibility, a caller contract of
 * `applyBulkChatVisibility`; an explicit `gmroll` before `create`; and `create` inside the same
 * guard, so a card that could not be made GM-only is never posted.
 */
async function postGmComplicationCard({
  craftingSystemId,
  actor,
  speaker,
  senderUser,
  applied = [],
}) {
  try {
    const delivered = Array.isArray(applied) ? applied : [];
    const reported = complicationChatOutputEnabled(craftingSystemId)
      ? delivered
      : delivered.filter((row) => hasComplicationMacroFault(row));
    if (reported.length === 0) return null;
    // The only projection that may carry an authored description or severity to a GM surface.
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
 * The elected-GM edge for a relayed complication delivery (issue 1286); the pure half is
 * `complicationSocket.js`, the rules `recipes-and-steps/spec.md` § Complication Macros.
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
  // Fail closed, visibly: `fromUuidSync` answers a compendium uuid with an index entry that has no
  // `testUserPermission`.
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
  // No GM-side apply path may read `isOwner` (issue 1288): it tests the ambient `game.user`, who
  // owns every actor on the GM's client. Ask the attested sender's permission instead.
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

// The GM-side prompt choosing which active players to pull to a dropped event's linked scene.
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
 * The one `module.fabricate` listener. `senderId`, the second callback argument, is set by the
 * server from the authenticated session (`dist/server/sockets.mjs` `handleCustomSocket`); every
 * privileged leg authenticates against it, never a spoofable payload `userId` (issue 593). The
 * `try`-guarded legs share the channel with, and so must never block, the Interactable payload.
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
    try {
      routeEventSceneSocketMessage(payload, {
        currentUserId: () => game.user?.id,
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        showPrompt: showEventScenePrompt,
        viewSceneForSelf: (uuid) => viewScene(uuid),
      });
    } catch {
      // Never block the Interactable payload below.
    }
    // Only the active GM may write `gatheringEnvironments`, so it applies a player's decrement.
    try {
      routeGatheringNodeDepleteMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // The applier re-checks the node economy but not the sender's reach to the task, so
        // throttle to human gathering speed.
        allowSender: gatheringDepletionRateLimiter,
        applyDeplete: (args) => {
          // Nothing awaits a socket handler, so each async apply catches its own rejection.
          Promise.resolve(
            fabricate.gatheringRichStateService?.applyEnvironmentNodeDepletion(args)
          ).catch((error) => console.warn('Fabricate | Gathering node depletion failed', error));
        },
      });
    } catch {
      // Never block the Interactable payload below.
    }
    // Only the active GM may write `gatheringBlindRuns`, and only a client the player does not
    // control may draw the task (issue 901).
    try {
      routeGatheringBlindStartMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        allowSender: gatheringBlindStartRateLimiter,
        applyStart: (args) => {
          Promise.resolve(applyGatheringBlindStart(args)).catch((error) =>
            console.warn('Fabricate | Blind gathering start failed', error)
          );
        },
      });
    } catch {
      // Never block the Interactable payload below.
    }
    // Addressing only (issue 1286): the wire names no macro or content, which the GM re-reads.
    try {
      routeComplicationDeliveryMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // The last refusal gate, so a malformed or unauthenticated message spends no budget.
        allowSender: complicationDeliveryRateLimiter,
        // Two sockets in one context would receive the message twice.
        isFreshDelivery: complicationDeliveryDedupe,
        applyComplications: (args) => {
          Promise.resolve(applyComplicationDelivery(args)).catch((error) =>
            console.warn('Fabricate | Complication delivery failed', error)
          );
        },
      });
    } catch {
      // Never block the Interactable payload below.
    }
    // Only the active GM writes and validates, and only the targeted user opens a granted session.
    handleInteractableSocketMessage(payload, {
      senderId,
      isSenderGM: (id) => game.users?.get(id)?.isGM === true,
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant),
      notifyDenied: (reason) => InteractableManager.instance.notifyActivationDenied(reason),
    });
  });
}

/**
 * The gathering runtime edge: the module-scope `GatheringEngine` holder the composition root
 * writes and the journal, socket and facade modules read, the actor-selection predicates, and the
 * macro, tool-breakage, failure-feedback and localization seams the engine is constructed with.
 */

import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';
import { isGatheringActorSelectableByUser } from '../config/preferencesCleanup.js';
import { createGatheringSelectableActorsGetter } from '../gatheringBootstrapAdapters.js';
import { resolveGatheringResultSource, gatheringRunItemRef } from '../gatheringResultCreation.js';
import { matchGatheringTools } from '../gatheringToolRuntime.js';
import { createToolBreakageRuntime } from '../toolBreakageRuntime.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';

/**
 * The single `GatheringEngine`. Held behind a setter because an ES module cannot assign to an
 * imported binding, and the composition root writes what four other modules read. ESM gives one
 * module instance per specifier, so this is one holder however many modules import it.
 */
let gatheringEngine = null;

export function setGatheringEngine(engine) {
  gatheringEngine = engine;
  return gatheringEngine;
}

export function getGatheringEngine() {
  return gatheringEngine;
}

/** Resolve a stored gathering actor preference against Foundry's actor collection. */
export function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

/** Whether the current user may select an actor for gathering. */
export function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

export const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser,
});

/**
 * The actor-selection top bar's predicate: attempt authorization's ownership rule plus the
 * player-character concept. It NARROWS the bar, never attempt authorization.
 */
export function isSelectableBarActor({ actor, viewer } = {}) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

export const getBarSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer }),
});

export function getGatheringRunViewer({ run } = {}) {
  const userId = run?.userId;
  return game.users?.get?.(userId) ?? { id: userId ?? null, isGM: false };
}

export function isCurrentWorldPaused() {
  return game.paused === true;
}

/** Execute a gathering macro through the shared macro runner. */
export async function runGatheringMacro(macroUuid, context = {}) {
  return MacroExecutor.run(macroUuid, context);
}

export function createGatheringToolBreakage({ craftingSystemManager, evaluateExpression }) {
  return createToolBreakageRuntime({
    matchTools: ({ actor, system, task, tools = [], presentTools = null }) =>
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools }),
    buildItemRef: (actor, item) => gatheringRunItemRef(actor, item),
    resolveReplacementSource: ({ componentId, system }) =>
      resolveGatheringResultSource({ componentId, quantity: 1 }, system, craftingSystemManager),
    resolveItemUuid: (uuid) => fromUuid(uuid),
    evaluateExpression,
  });
}

export function createGatheringFailureFeedback() {
  return {
    async apply({
      failureOutcome,
      actor,
      viewer,
      system,
      environment,
      task,
      outcome,
      checkResult,
    } = {}) {
      if (failureOutcome?.mode === 'macro') {
        try {
          return await runGatheringMacro(failureOutcome.macroUuid, {
            kind: 'gatheringFailure',
            actor,
            viewer,
            system,
            environment,
            task,
            outcome,
            checkResult,
          });
        } catch (error) {
          console.error('Fabricate | Gathering failure-feedback macro failed:', error);
          const fallback =
            game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') ||
            'Gathering produced no results.';
          ui.notifications?.warn?.(fallback);
          return { message: fallback, error: error?.message || 'Macro threw' };
        }
      }
      const message =
        failureOutcome?.text ||
        game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') ||
        'Gathering produced no results.';
      ui.notifications?.warn?.(message);
      return { message };
    },
  };
}

export function localizeGathering(key, data = {}) {
  return game.i18n?.format?.(key, data) ?? game.i18n?.localize?.(key) ?? key;
}

/**
 * The one-shot deprecation notice for a renamed public name, and the set that makes it fire once
 * per name. Declared in exactly ONE module: every deprecated public name here is a gathering
 * realm-or-region rename, and this is the leaf the class shell, the gathering slice and the
 * published namespace each import without a cycle. A second set would warn twice per name.
 */
const _deprecationWarned = new Set();

/** One-time console deprecation notice for a renamed public API method. Never throws. */
export function deprecate(oldName, newName) {
  if (_deprecationWarned.has(oldName)) return;
  _deprecationWarned.add(oldName);
  console.warn(`Fabricate: ${oldName} is deprecated; use ${newName} instead.`);
}

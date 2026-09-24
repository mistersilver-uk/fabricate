/**
 * The gathering runtime edge: the `GatheringEngine` holder the composition root writes and four
 * modules read, the actor-selection predicates, and the seams the engine is constructed with.
 */

import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';
import { isGatheringActorSelectableByUser } from '../config/preferencesCleanup.js';
import { createGatheringSelectableActorsGetter } from '../gatheringBootstrapAdapters.js';
import { resolveGatheringResultSource, gatheringRunItemRef } from '../gatheringResultCreation.js';
import { matchGatheringTools } from '../gatheringToolRuntime.js';
import { createToolBreakageRuntime } from '../toolBreakageRuntime.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';

// Behind a setter: an ES module cannot assign an imported binding, and the root writes it.
let gatheringEngine = null;

export function setGatheringEngine(engine) {
  gatheringEngine = engine;
  return gatheringEngine;
}

export function getGatheringEngine() {
  return gatheringEngine;
}

export function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

export function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

export const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser,
});

/** Attempt authorization's ownership rule plus player characters; it narrows only the bar. */
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

// One set, held here by `tests/scalar-helper-duplicates.test.js`, so each name warns once.
const _deprecationWarned = new Set();

/** A once-per-name console notice for a renamed public API name. Never throws. */
export function deprecate(oldName, newName, documentation = null) {
  if (_deprecationWarned.has(oldName)) return;
  _deprecationWarned.add(oldName);
  const hint = documentation ? ` See ${documentation}` : '';
  try {
    console.warn(`Fabricate: ${oldName} is deprecated; use ${newName} instead.${hint}`);
  } catch {
    // A broken console shim must not turn the deprecated call into a throw.
  }
}

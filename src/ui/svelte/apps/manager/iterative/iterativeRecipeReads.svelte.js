/**
 * What the recipe and action editors read about an iterative system: the active runs of the
 * selected system, and the staged recipe's issues and header status. It owns no effect, so it is
 * safe to build outside a component: the mounted header calls `watchRuns` from its own effect.
 */
import { fromStore } from 'svelte/store';

import { evaluateIterativeReadiness } from '../../../../../systems/iterative/iterativeReadiness.js';

import {
  iterativeReadinessInput,
  iterativeRecipeIssues,
  iterativeRecipeStatus,
  iterativeStatusPill,
} from './iterativeRecipeIssues.js';

/** The routes whose editors state how many workpieces are in progress. */
const RUN_ROUTES = Object.freeze(['recipe-edit', 'iterative-action-edit']);

/**
 * @param {object} seams
 * @param {() => object|null} seams.section The store's `iterative` section.
 * @param {() => object|null} seams.selectedSystem The projected system.
 * @param {() => string} seams.currentView The routed view token.
 */
export function createIterativeRecipeReads({ section, selectedSystem, currentView }) {
  const iterativeSystem = $derived(selectedSystem()?.resolutionMode === 'iterative');
  const onRunRoute = $derived(RUN_ROUTES.includes(currentView()));
  const runsMemo = $derived.by(() => {
    const memo = section()?.activeIterativeRuns;
    return memo ? fromStore(memo) : null;
  });
  /** The memo's runs of the selected system, and none off the editor routes. */
  const systemRuns = () => {
    const systemId = selectedSystem()?.id;
    if (!onRunRoute || !systemId) return [];
    return (runsMemo?.current ?? []).filter((run) => run.craftingSystemId === systemId);
  };

  /** The recipe's own iterative issues over the staged `recipe`, and none outside an iterative system. */
  function recipeIssues(recipe) {
    const system = selectedSystem();
    if (!recipe || !iterativeSystem) return [];
    return iterativeRecipeIssues(evaluateIterativeReadiness(system, [recipe]), recipe, system);
  }

  /** Watches the store's run memo while `view` is an editor route; the teardown stops the watch. */
  function watchRuns(view) {
    section()?.watchActiveRuns?.(iterativeSystem && RUN_ROUTES.includes(view));
    return () => section()?.watchActiveRuns?.(false);
  }

  return {
    watchRuns,
    activeRunCount: (recipeId) => systemRuns().filter((run) => run.recipeId === recipeId).length,
    actionActiveRunCount: (actionId) =>
      systemRuns().filter((run) => run.actionIds.includes(actionId)).length,
    recipeIssues,
    recipeReadinessInput: (recipe) => iterativeReadinessInput(recipeIssues(recipe), recipe),
    /** The header's status: `null` outside iterative, and `{ id: 'withheld' }` while Ready is withheld. */
    recipeHeaderStatus: (draft) =>
      draft && iterativeSystem
        ? (iterativeStatusPill(
            iterativeRecipeStatus(recipeIssues(draft)),
            draft.enableBlocked === true
          ) ?? { id: 'withheld' })
        : null,
  };
}

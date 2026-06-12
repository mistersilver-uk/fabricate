// Pure scoped-selection decision for the player gathering view.
//
// Extracted from GatheringView so the interactable-granted env+task
// auto-selection (force-select the scoped environment even when locked, prefer
// the scoped task, switch to the Tasks tab) and its "apply once per distinct
// scope" gating are unit-testable without a Svelte mount.
//
// When a canvas gathering-task interactable is activated the granted session
// opens scoped to one environment + task. The activation already validated the
// environment, so the scoped env is force-selected EVEN IF it lists as locked
// (the default's non-locked filter does not apply to a scoped pick).
//
// Inputs (mirror the values the component already holds):
//   - environments       : the freshly fetched listing's environment array;
//   - scopedEnvironmentId : the interactable-granted env id (null on manual open);
//   - scopedTaskId        : the interactable-granted task id (null on manual open);
//   - appliedScopeKey     : the scope key (`env|task`) most recently applied, so
//                           the scoped pick fires once per distinct scope and is
//                           not re-forced on quiet re-loads within a session;
//   - currentSelectedId   : the component's current env selection (preserved by
//                           the default resolver when still valid);
//   - currentTaskId       : the component's current task selection (the default
//                           task resolver's preference when no scope applies);
//   - defaultResolver     : the existing resolveDefaultSelection (threaded so the
//                           non-scope / scope-absent path stays identical).
//
// Returns:
//   {
//     selectedEnvironmentId : the env id to apply after the load,
//     taskPreferenceId      : the preferred task id to feed the task resolver
//                             (the scoped task when the scope was just applied,
//                             otherwise the caller's current task selection),
//     switchToTasksTab      : true only when the scoped selection was forced,
//     appliedScopeKey       : the scope key to store back (set when applied,
//                             unchanged otherwise),
//   }
//
// The component still owns the Foundry/store edges and the downstream task /
// event default resolution; this only encodes the env-selection + tab + task
// preference decision.
export function resolveScopedGatheringSelection({
  environments,
  scopedEnvironmentId = null,
  scopedTaskId = null,
  appliedScopeKey = null,
  currentSelectedId = null,
  currentTaskId = null,
  defaultResolver
}) {
  const list = Array.isArray(environments) ? environments : [];

  // The scope is only meaningful when BOTH ids are present; a half-set scope
  // (only an env, only a task) is treated as no scope.
  const scopeKey = scopedEnvironmentId && scopedTaskId
    ? `${scopedEnvironmentId}|${scopedTaskId}`
    : null;

  const scopedEnvPresent = Boolean(scopeKey)
    && list.some(environment => environment?.id === scopedEnvironmentId);

  // Force the scoped selection only once per distinct scope: when the scope is
  // present in the listing AND differs from the scope last applied. A later
  // manual navigation within the same session keeps `appliedScopeKey === scopeKey`
  // so a quiet re-load does not clobber it.
  if (scopeKey && scopedEnvPresent && appliedScopeKey !== scopeKey) {
    return {
      selectedEnvironmentId: scopedEnvironmentId,
      taskPreferenceId: scopedTaskId,
      switchToTasksTab: true,
      appliedScopeKey: scopeKey
    };
  }

  // No scope, scope absent from the listing, or scope already applied: fall back
  // to the existing default env selection and keep the caller's task preference.
  // `appliedScopeKey` is left unchanged (so an absent scope can still apply once
  // it appears in a later listing, and an already-applied scope is not cleared).
  return {
    selectedEnvironmentId: defaultResolver(list, currentSelectedId),
    taskPreferenceId: currentTaskId,
    switchToTasksTab: false,
    appliedScopeKey
  };
}

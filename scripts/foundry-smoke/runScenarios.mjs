/**
 * Drive an ordered scenario list. `startPhase` fires only when a scenario's phase differs from the
 * one already open, so a group's children add no second `phaseTimings` row; a scenario whose
 * `section` is off a scoped `screenshots` target set is never run.
 */

export async function runScenarios(scenarios, ctx) {
  for (const scenario of scenarios) {
    if (scenario.section && !ctx.shouldRunScreenshotSection(scenario.section)) continue;
    if (scenario.phase && ctx.currentPhaseName() !== scenario.phase) ctx.startPhase(scenario.phase);
    await scenario.run(ctx, { runChildren: () => runScenarios(scenario.children ?? [], ctx) });
  }
}

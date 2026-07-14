/**
 * 1.5.0 — Seed the system-level gathering check from per-task gathering check
 * data (pure, idempotent, version-gated).
 *
 * Gathering checks used to be authored per task: each gathering task carried its
 * own `check` (`{ formula, threshold }`) plus a `progressive.awardMode`. The
 * gathering check is now a SYSTEM-level singleton
 * (`system.gatheringCraftingCheck = { enabled, progressive{…}, routed{…} }`),
 * consumed by the new Checks editor and the gathering engine. This migration
 * seeds that system check from the per-task data so existing worlds keep working
 * and the editor shows a populated check.
 *
 * Seeding rule: the FIRST gathering task (in the system's `gatheringConfig`
 * tasks) that carries a non-empty `check.formula` defines the system default —
 * its formula becomes `gatheringCraftingCheck.progressive.rollFormula` and its
 * `progressive.awardMode` becomes the system award mode.
 *
 * Only the PROGRESSIVE shape is seeded. The legacy per-task check was a numeric
 * roll, which maps cleanly and SAFELY onto the value-driven progressive check
 * (no outcome tiers required). Routed is intentionally NOT seeded: legacy routed
 * tasks resolve via providers (macro/roll-table outcome), and seeding a
 * `routed.rollFormula` with no outcome tiers would make every routed gather fail
 * (the formula would match no tier). Routed therefore keeps its provider-based
 * back-compat. The gathering engine reads the system progressive formula; the
 * per-task `check` is retained only as this migration's source, not a runtime
 * fallback.
 *
 * Per-task fields (`check`/`progressive`/`resolutionMode`/`dcOverride`) are KEPT
 * untouched for back-compat — this migration only WRITES the system-level copy.
 *
 * Mutated setting key: `craftingSystems` (systems[].gatheringCraftingCheck). The
 * `gatheringConfig` is read but not changed.
 *
 * Idempotent: a system whose `gatheringCraftingCheck` is already enabled or
 * already carries a progressive roll formula is skipped, so a re-run is a no-op.
 *
 * Pure: returns `{ systems, gatheringConfig }` and performs no I/O. The runner
 * detects the change and persists.
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @param {object} gatheringConfig - raw gatheringConfig setting
 * @returns {{ systems: Array<object>, gatheringConfig: object, seededCount: number }}
 */
export function migrateGatheringChecksToSystem(systems, gatheringConfig) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  const config = gatheringConfig && typeof gatheringConfig === 'object' ? gatheringConfig : {};
  const configSystems =
    config.systems && typeof config.systems === 'object' ? config.systems : null;

  if (!configSystems) {
    return { systems: safeSystems, gatheringConfig: config, seededCount: 0 };
  }

  let seededCount = 0;

  for (const system of safeSystems) {
    if (!system || typeof system !== 'object' || !system.id) continue;

    // Idempotent: skip a system that already carries a configured gathering
    // check (enabled, or a non-empty progressive roll formula).
    const existing =
      system.gatheringCraftingCheck && typeof system.gatheringCraftingCheck === 'object'
        ? system.gatheringCraftingCheck
        : null;
    const existingFormula =
      typeof existing?.progressive?.rollFormula === 'string'
        ? existing.progressive.rollFormula.trim()
        : '';
    if (existing?.enabled === true || existingFormula !== '') continue;

    const tasks = Array.isArray(configSystems[String(system.id)]?.tasks)
      ? configSystems[String(system.id)].tasks
      : [];

    // The first task with a non-empty check formula defines the system default.
    const defining = tasks.find(
      (task) =>
        task &&
        typeof task === 'object' &&
        typeof task.check?.formula === 'string' &&
        task.check.formula.trim() !== ''
    );
    if (!defining) continue;

    const awardMode = ['partial', 'equal', 'exceed'].includes(defining.progressive?.awardMode)
      ? defining.progressive.awardMode
      : 'equal';

    system.gatheringCraftingCheck = {
      ...existing,
      enabled: true,
      progressive: {
        ...(existing?.progressive &&
          typeof existing.progressive === 'object' &&
          existing.progressive),
        rollFormula: defining.check.formula,
        awardMode,
      },
    };
    seededCount += 1;
  }

  return { systems: safeSystems, gatheringConfig: config, seededCount };
}

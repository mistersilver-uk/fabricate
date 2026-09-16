/**
 * `1.5.0` — seed the system-level gathering check from the FIRST task carrying a non-empty
 * `check.formula`, so existing worlds keep working. Pure, idempotent, version-gated; it mutates
 * `craftingSystems` only. ONLY THE PROGRESSIVE SHAPE IS SEEDED, the legacy per-task check being a
 * numeric roll; routed is deliberately NOT, because a `rollFormula` with no tiers would make every
 * routed gather fail. Per-task fields are KEPT untouched for back-compat.
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

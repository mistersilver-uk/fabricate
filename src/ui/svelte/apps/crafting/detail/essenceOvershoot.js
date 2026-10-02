// What a pool's allocation delivers beyond what its requirements ask, per essence. A requirement's
// own `delivered` is capped at its need, so the surplus is read from the carriers: the units
// allocated times what each unit yields. Import-free, so one raw-module entry covers it.

function allocatedAmount(carriers, essenceId) {
  return carriers.reduce(
    (total, carrier) =>
      total + (Number(carrier?.allocatedUnits) || 0) * (Number(carrier?.perUnit?.[essenceId]) || 0),
    0
  );
}

/**
 * @param {object|null} pool `craftability.essencePool`
 * @returns {{ essenceId: string, name: string, amount: number }[]} one entry per overshot essence
 */
export function essenceOvershoots(pool) {
  const requirements = Array.isArray(pool?.requirements) ? pool.requirements : [];
  const carriers = Array.isArray(pool?.carriers) ? pool.carriers : [];
  const needed = new Map();
  for (const requirement of requirements) {
    const entry = needed.get(requirement.essenceId) ?? { name: requirement.name, need: 0 };
    entry.need += Number(requirement.need) || 0;
    needed.set(requirement.essenceId, entry);
  }
  return [...needed].flatMap(([essenceId, { name, need }]) => {
    const amount = allocatedAmount(carriers, essenceId) - need;
    return amount > 0 ? [{ essenceId, name: name || essenceId, amount }] : [];
  });
}

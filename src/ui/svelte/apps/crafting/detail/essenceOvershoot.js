// What a pool's allocation delivers beyond what its requirements ask, per essence. A requirement's
// own `delivered` is capped at its need, so the surplus is read from the carriers: the units
// allocated times what each unit yields. Import-free, so one raw-module entry covers it.

// The decimal places a value is authored with, so a surplus prints no finer than its inputs.
function placesOf(value) {
  const [, fraction = ''] = String(Number(value) || 0).split('.');
  return /^\d+$/.test(fraction) ? fraction.length : 0;
}

function allocatedAmount(carriers, essenceId) {
  return carriers.reduce(
    (total, carrier) =>
      total + (Number(carrier?.allocatedUnits) || 0) * (Number(carrier?.perUnit?.[essenceId]) || 0),
    0
  );
}

function precisionOf(carriers, essenceId, needs) {
  const yields = carriers.map((carrier) => carrier?.perUnit?.[essenceId]);
  return Math.max(0, ...[...needs, ...yields].map(placesOf));
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
    if (!requirement?.essenceId) continue;
    const entry = needed.get(requirement.essenceId) ?? { name: requirement.name, needs: [] };
    entry.needs.push(Number(requirement.need) || 0);
    needed.set(requirement.essenceId, entry);
  }
  return [...needed].flatMap(([essenceId, { name, needs }]) => {
    const need = needs.reduce((total, value) => total + value, 0);
    if (need <= 0) return [];
    const places = precisionOf(carriers, essenceId, needs);
    const amount = Number((allocatedAmount(carriers, essenceId) - need).toFixed(places));
    return amount > 0 ? [{ essenceId, name: name || essenceId, amount }] : [];
  });
}

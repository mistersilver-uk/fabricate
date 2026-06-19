export function normalizeCurrencyUnit(
  entry = {},
  randomID = () => Math.random().toString(36).slice(2, 10)
) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || randomID()).trim();
  if (!id) return null;
  const label = String(entry.label || entry.name || id).trim() || id;
  const abbreviation = String(entry.abbreviation || entry.abbr || id).trim() || id;
  const actorPath = String(entry.actorPath || entry.path || '').trim();
  const denomination = String(entry.denomination || '').trim();
  const contains = Array.isArray(entry.contains)
    ? entry.contains
        .map((contained) => {
          const unitId = String(contained?.unitId || contained?.id || '').trim();
          const amount = Number(contained?.amount);
          if (!unitId || !Number.isFinite(amount) || amount <= 0) return null;
          return { unitId, amount: Math.trunc(amount) };
        })
        .filter((contained) => contained && contained.amount > 0)
    : [];
  const dedupedContains = [];
  const seenUnitIds = new Set();
  for (const contained of contains) {
    if (seenUnitIds.has(contained.unitId)) continue;
    seenUnitIds.add(contained.unitId);
    dedupedContains.push(contained);
  }
  const unit = {
    id,
    label,
    abbreviation,
    icon: String(entry.icon || '').trim(),
    actorPath,
    contains: dedupedContains,
  };
  if (denomination) unit.denomination = denomination;
  return unit;
}

const SPEND_STRATEGIES = new Set(['dataPath', 'pf2eInventory']);
const PF2E_DENOMINATIONS = new Set(['pp', 'gp', 'sp', 'cp']);

export function normalizeCurrencyConfig(currency = {}, options = {}) {
  const randomID = typeof options.randomID === 'function' ? options.randomID : undefined;
  const units = Array.isArray(currency?.units)
    ? currency.units.map((entry) => normalizeCurrencyUnit(entry, randomID)).filter(Boolean)
    : [];
  const spendStrategy = SPEND_STRATEGIES.has(currency?.spendStrategy)
    ? currency.spendStrategy
    : 'dataPath';
  return {
    enabled: currency?.enabled === true,
    spendStrategy,
    units,
  };
}

export function findCurrencyUnit(units = [], unitId = '') {
  const id = String(unitId || '').trim();
  if (!id) return null;
  return (Array.isArray(units) ? units : []).find((unit) => unit?.id === id) || null;
}

function integerGcd(a, b) {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function integerLcm(a, b) {
  return Math.abs(Math.trunc(a * b)) / integerGcd(a, b);
}

function getByPath(object, path) {
  if (!object || !path) return;
  const foundryGetter = globalThis.foundry?.utils?.getProperty;
  if (typeof foundryGetter === 'function') return foundryGetter(object, path);
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function buildUnitMap(units) {
  return new Map((Array.isArray(units) ? units : []).map((unit) => [unit.id, unit]));
}

export function validateCurrencyProfile(units = [], options = {}) {
  const spendStrategy = SPEND_STRATEGIES.has(options?.spendStrategy)
    ? options.spendStrategy
    : 'dataPath';
  const rawUnits = Array.isArray(units) ? units : [];
  const normalizedUnits = rawUnits.map((entry) => normalizeCurrencyUnit(entry)).filter(Boolean);
  const byId = buildUnitMap(normalizedUnits);
  const errors = [];
  if (normalizedUnits.length === 0) {
    errors.push('No currency units are configured.');
  }
  if (byId.size !== normalizedUnits.length) {
    errors.push('Currency unit IDs must be unique.');
  }
  // Validate the raw, pre-sanitization sub-unit amounts so non-integer/non-positive
  // values surface as configuration errors rather than being silently truncated.
  for (const rawUnit of rawUnits) {
    if (!rawUnit || typeof rawUnit !== 'object' || !Array.isArray(rawUnit.contains)) continue;
    const label = String(rawUnit.label || rawUnit.name || rawUnit.id || '').trim() || rawUnit.id;
    for (const contained of rawUnit.contains) {
      const rawAmount = Number(contained?.amount);
      if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
        errors.push(`Currency unit "${label}" has an invalid sub-unit amount.`);
      }
    }
  }
  for (const unit of normalizedUnits) {
    if (spendStrategy === 'pf2eInventory') {
      const denomination = unit.denomination || unit.id;
      if (!PF2E_DENOMINATIONS.has(denomination)) {
        errors.push(
          `Currency unit "${unit.label}" must map to a pf2e denomination (pp, gp, sp, or cp).`
        );
      }
    } else if (!unit.actorPath) {
      errors.push(`Currency unit "${unit.label}" is missing an actor data path.`);
    }
    for (const contained of unit.contains) {
      if (contained.unitId === unit.id) {
        errors.push(`Currency unit "${unit.label}" cannot contain itself.`);
      }
      if (!byId.has(contained.unitId)) {
        errors.push(`Currency unit "${unit.label}" contains unknown unit "${contained.unitId}".`);
      }
    }
  }

  const resolving = new Set();
  const resolved = new Map();

  function resolve(unitId, ancestry = []) {
    if (resolved.has(unitId)) return resolved.get(unitId);
    const unit = byId.get(unitId);
    if (!unit) return null;
    if (resolving.has(unitId)) {
      errors.push(
        `Currency units contain a circular reference: ${[...ancestry, unitId].join(' -> ')}.`
      );
      return null;
    }
    resolving.add(unitId);
    let result;
    if (unit.contains.length === 0) {
      result = { baseUnitId: unit.id, baseValue: 1 };
    } else {
      let baseUnitId = null;
      let baseValue = 0;
      for (const contained of unit.contains) {
        const child = resolve(contained.unitId, [...ancestry, unitId]);
        if (!child) continue;
        if (baseUnitId && child.baseUnitId !== baseUnitId) {
          errors.push(`Currency unit "${unit.label}" mixes incompatible base units.`);
          continue;
        }
        baseUnitId = child.baseUnitId;
        baseValue += contained.amount * child.baseValue;
      }
      if (!baseUnitId || baseValue <= 0) {
        errors.push(`Currency unit "${unit.label}" cannot resolve to a base unit.`);
      }
      result = { baseUnitId, baseValue };
    }
    resolving.delete(unitId);
    resolved.set(unitId, result);
    return result;
  }

  for (const unit of normalizedUnits) {
    resolve(unit.id);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    units: normalizedUnits,
    metadata: resolved,
  };
}

export function formatCurrencyRequirement(requirement, units = []) {
  const unit = findCurrencyUnit(units, requirement?.unit);
  const label = unit?.abbreviation || unit?.label || requirement?.unit || '';
  return `${requirement?.amount ?? 0} ${label}`.trim();
}

export function readCurrencyBalances(actor, units = []) {
  const balances = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    const raw = getByPath(actor, unit.actorPath);
    // A missing/undefined path means the actor simply has none of this denomination
    // (e.g. an NPC or a custom denomination the actor never carries) and is read as 0,
    // falling through to the normal insufficient-currency path. Only a value that is
    // PRESENT but non-numeric (an object, an unparseable string) is a hard failure.
    if (raw === undefined || raw === null) {
      balances.set(unit.id, 0);
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return {
        valid: false,
        message: `Currency unit "${unit.label || unit.id}" is not available on ${actor?.name || 'actor'}.`,
        balances,
      };
    }
    balances.set(unit.id, Math.max(0, Math.trunc(value)));
  }
  return { valid: true, balances };
}

export function currencyTotalForBase(balances, profile, baseUnitId) {
  let total = 0;
  for (const [unitId, amount] of balances.entries()) {
    const meta = profile.metadata.get(unitId);
    if (meta?.baseUnitId === baseUnitId) total += amount * meta.baseValue;
  }
  return total;
}

function distributeChange(balances, amount, unitsByValue) {
  let remaining = amount;
  for (const { unit, value } of unitsByValue) {
    const count = Math.floor(remaining / value);
    if (count <= 0) continue;
    balances.set(unit.id, (balances.get(unit.id) || 0) + count);
    remaining -= count * value;
  }
  return remaining === 0;
}

export function buildCurrencySpendUpdates(actor, requirement, units = []) {
  const profile = validateCurrencyProfile(units);
  if (!profile.valid) {
    return {
      valid: false,
      message: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
    };
  }
  const requiredUnit = findCurrencyUnit(profile.units, requirement?.unit);
  if (!requiredUnit) {
    return {
      valid: false,
      message: `Currency unit "${requirement?.unit || ''}" is not configured.`,
    };
  }
  const requiredMeta = profile.metadata.get(requiredUnit.id);
  const requiredAmount = Math.max(0, Math.trunc(Number(requirement?.amount || 0)));
  if (requiredAmount <= 0) return { valid: true, updates: {} };

  const balanceResult = readCurrencyBalances(actor, profile.units);
  if (!balanceResult.valid) return { valid: false, message: balanceResult.message };

  const availableBase = currencyTotalForBase(
    balanceResult.balances,
    profile,
    requiredMeta.baseUnitId
  );
  const requiredBase = requiredAmount * requiredMeta.baseValue;
  if (availableBase < requiredBase) {
    return {
      valid: false,
      message: `Insufficient currency. Requires ${formatCurrencyRequirement(requirement, profile.units)}.`,
    };
  }

  const relevantUnits = profile.units
    .filter((unit) => profile.metadata.get(unit.id)?.baseUnitId === requiredMeta.baseUnitId)
    .map((unit) => ({ unit, value: profile.metadata.get(unit.id).baseValue }));
  const spendableLowerUnits = relevantUnits
    .filter((entry) => entry.value <= requiredMeta.baseValue)
    .sort((left, right) => right.value - left.value || left.unit.id.localeCompare(right.unit.id));
  // Change from breaking a higher coin can be returned in ANY smaller denomination,
  // not just denominations at or below the required unit. Use every relevant unit,
  // largest first; distributeChange's floor naturally skips coins larger than the
  // overpay (the overpay is always less than the broken coin's value).
  const changeUnits = [...relevantUnits].sort(
    (left, right) => right.value - left.value || left.unit.id.localeCompare(right.unit.id)
  );
  const higherUnits = relevantUnits
    .filter((entry) => entry.value > requiredMeta.baseValue)
    .sort((left, right) => left.value - right.value || left.unit.id.localeCompare(right.unit.id));
  const nextBalances = new Map(balanceResult.balances);
  let remaining = requiredBase;

  for (const { unit, value } of spendableLowerUnits) {
    if (remaining <= 0) break;
    const available = nextBalances.get(unit.id) || 0;
    const count = Math.min(available, Math.floor(remaining / value));
    if (count <= 0) continue;
    nextBalances.set(unit.id, available - count);
    remaining -= count * value;
  }

  for (const { unit, value } of higherUnits) {
    while (remaining > 0 && (nextBalances.get(unit.id) || 0) > 0) {
      nextBalances.set(unit.id, (nextBalances.get(unit.id) || 0) - 1);
      if (value >= remaining) {
        const overpay = value - remaining;
        remaining = 0;
        if (overpay > 0) distributeChange(nextBalances, overpay, changeUnits);
        break;
      }
      remaining -= value;
    }
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    return {
      valid: false,
      message: `Insufficient currency. Requires ${formatCurrencyRequirement(requirement, profile.units)}.`,
    };
  }

  const updates = {};
  for (const unit of profile.units) {
    const meta = profile.metadata.get(unit.id);
    if (meta?.baseUnitId !== requiredMeta.baseUnitId) continue;
    const nextAmount = nextBalances.get(unit.id) || 0;
    if (nextAmount !== balanceResult.balances.get(unit.id)) {
      updates[unit.actorPath] = nextAmount;
    }
  }
  return {
    valid: true,
    updates,
    formatted: formatCurrencyRequirement(requirement, profile.units),
  };
}

export function canAddCurrencySubUnit(units = [], parentUnitId = '', subUnitId = '') {
  const parentId = String(parentUnitId || '').trim();
  const childId = String(subUnitId || '').trim();
  if (!parentId || !childId || parentId === childId) return false;
  const normalizedUnits = (Array.isArray(units) ? units : [])
    .map((entry) => normalizeCurrencyUnit(entry))
    .filter(Boolean);
  const byId = buildUnitMap(normalizedUnits);
  const parent = byId.get(parentId);
  const child = byId.get(childId);
  if (!parent || !child) return false;
  if (parent.contains.some((entry) => entry.unitId === childId)) return false;

  const stack = [child];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current.id)) continue;
    if (current.id === parentId) return false;
    seen.add(current.id);
    for (const contained of current.contains) {
      stack.push(byId.get(contained.unitId));
    }
  }
  return true;
}

export function currencySubUnitOptions(units = [], parentUnitId = '') {
  return (Array.isArray(units) ? units : [])
    .filter((unit) => canAddCurrencySubUnit(units, parentUnitId, unit?.id))
    .map((unit) => ({
      id: unit.id,
      label: unit.label || unit.id,
      abbreviation: unit.abbreviation || unit.id,
    }));
}

export function currencyBaseValueScale(units = []) {
  const profile = validateCurrencyProfile(units);
  if (!profile.valid) return null;
  let scale = 1;
  for (const meta of profile.metadata.values()) {
    scale = integerLcm(scale, meta.baseValue || 1);
  }
  return scale;
}

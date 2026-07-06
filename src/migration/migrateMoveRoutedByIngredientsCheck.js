/**
 * 1.10.0 — Move a `routedByIngredients` system's optional pass/fail crafting-check
 * config from the shared `craftingCheck.routed` slot to the shared
 * `craftingCheck.simple` slot (pure, idempotent, version-gated).
 *
 * `routedByIngredients` routes result groups by the chosen ingredient set, not by
 * check outcome tiers. Its crafting check has always been a plain pass/fail gate
 * against the DC, but it used to store that config in `craftingCheck.routed` (the
 * tier-routing slot), which mis-rendered it through the tier editor and forced the
 * runtime to special-case reading `routed`. This change unifies it onto the SAME
 * shared optional pass/fail slot (`craftingCheck.simple`) that already backs
 * `simple`/`alchemy`, so the migration relocates any authored pass/fail config.
 *
 * For each `routedByIngredients` system whose `simple` slot is UNAUTHORED (no
 * `rollFormula`) and whose `routed.rollFormula` IS authored, the shared pass/fail
 * fields move `routed → simple`:
 *  - `rollFormula`, `dc`, `thresholdMode`, `tiers` (recipe DC tiers — ids preserved
 *    so recipe `checkTierId` references keep resolving), and `checkBreakage`.
 *  - `dcMode`/`macroUuid` are NOT moved (routed has none; the read-time normalizer
 *    defaults them `static`/`null`).
 *  - The routed slot's `rollFormula` is then cleared so it no longer masquerades as
 *    the config source; the inert routed `type`/`relativeOutcomes`/`fixedOutcomes`
 *    were never meaningful for this mode and are dropped.
 *
 * Guard: only ever fills an UNAUTHORED simple slot — a GM-authored simple check is
 * never clobbered. Idempotent: after the move a re-run finds `simple.rollFormula`
 * authored (or no routed formula) and no-ops.
 *
 * Operates on the RAW, un-normalized persisted shape (the runner passes the raw
 * settings payload, not normalized systems), so it reads only what is actually
 * stored with `_isPlainObject` guards and copies only present fields — it never
 * assumes normalized defaults (`dc: 15`, a present `tiers[]`, etc.).
 *
 * Pure: returns `{ systems }` and performs no I/O (logging excepted). The runner
 * persists only when `systems` changed.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @returns {{ systems: Array<object> }}
 */

export function migrateMoveRoutedByIngredientsCheck(data = {}) {
  const systems = _clone(data.systems);

  if (!Array.isArray(systems)) {
    return { systems: data.systems };
  }

  for (const system of systems) {
    if (!_isPlainObject(system) || system.resolutionMode !== 'routedByIngredients') continue;
    _moveCheckSlot(system);
  }

  return { systems };
}

/**
 * Move one `routedByIngredients` system's pass/fail config `routed → simple` when
 * the simple slot is unauthored and the routed slot carries an authored formula.
 * @param {object} system
 */
function _moveCheckSlot(system) {
  const check = system.craftingCheck;
  if (!_isPlainObject(check)) return;

  const routed = _isPlainObject(check.routed) ? check.routed : null;
  const routedFormula = typeof routed?.rollFormula === 'string' ? routed.rollFormula.trim() : '';
  if (!routed || routedFormula.length === 0) return;

  const existingSimple = _isPlainObject(check.simple) ? check.simple : null;
  const simpleFormula =
    typeof existingSimple?.rollFormula === 'string' ? existingSimple.rollFormula.trim() : '';
  // Never clobber a GM-authored simple check; idempotent once simple is authored.
  if (simpleFormula.length > 0) return;

  // Build the moved simple slot from the routed slot's shared pass/fail fields,
  // preserving any fields the GM already set on the (unauthored-formula) simple slot.
  const simple = existingSimple ? { ...existingSimple } : {};
  simple.rollFormula = routed.rollFormula;
  if ('dc' in routed) simple.dc = routed.dc;
  if ('thresholdMode' in routed) simple.thresholdMode = routed.thresholdMode;
  if ('tiers' in routed) simple.tiers = routed.tiers;
  if ('checkBreakage' in routed) simple.checkBreakage = routed.checkBreakage;
  check.simple = simple;

  // Clear the moved config from the routed slot so it no longer masquerades as the
  // config source; drop the inert tier-routing fields that never applied to this mode.
  routed.rollFormula = '';
  delete routed.dc;
  delete routed.thresholdMode;
  delete routed.tiers;
  delete routed.checkBreakage;
  delete routed.type;
  delete routed.relativeOutcomes;
  delete routed.fixedOutcomes;

  console.log(
    `Fabricate | migrateMoveRoutedByIngredientsCheck: moved routedByIngredients pass/fail check ` +
      `routed → simple for system ${JSON.stringify({ id: system.id, name: system.name })}`
  );
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}

import {
  isChoiceGroup,
  normalizeQuantityFormula,
  quantityFormulaErrors,
} from '../models/Result.js';
import { diceEngine } from '../utils/rollFormulaRollability.js';

import { resolveSalvageCheck } from './salvageCheckUsability.js';

/**
 * The one seam turning a result's authored amount into the integer awarded (issue 1645).
 * No `quantityFormula` (or whitespace) awards `quantity` and rolls nothing; otherwise the formula
 * is rolled once per result per award against the crafting character, floored and clamped at
 * zero, and a zero is an empty award: no item is created and the award still states it. `rolled`
 * is `{ formula, total }` only because run records persist it, and `total` is the roll's own
 * total, not the clamped amount; the live `roll` is for the chat message and never persisted.
 * An absent `Roll`, or a total that is not finite (a path resolving to a string, a division by a
 * zero-valued path), throws: the award is refused rather than given a wrong number. A row carrying
 * the `resolvedAmount` this answered earlier is not rolled again (issue 1773).
 */
export async function resolveRolledAmount(
  { quantity, quantityFormula, resolvedAmount } = {},
  actor,
  { Roll } = {}
) {
  if (resolvedAmount) return resolvedAmount;
  const formula = typeof quantityFormula === 'string' ? quantityFormula.trim() : '';
  if (formula === '') return { amount: quantity, rolled: null, roll: null };
  if (typeof Roll !== 'function') {
    throw new TypeError('Fabricate | A rolled result amount needs a Roll implementation');
  }
  const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate({
    allowInteractive: false,
  });
  const total = Number(roll?.total);
  if (!Number.isFinite(total)) {
    throw new RangeError(`Fabricate | The rolled amount "${formula}" totalled ${roll?.total}`);
  }
  return { amount: Math.max(0, Math.floor(total)), rolled: { formula, total }, roll };
}

const actorData = (actor) => actor?.getRollData?.() ?? {};

/** Whether `formula` totals finitely against `rollData` with every die at its maximum and at its
 *  minimum; a throw (a path resolving to text) is not finite. */
function totalsFinitely(formula, Roll, rollData) {
  try {
    return [{ maximize: true }, { minimize: true }].every((extreme) =>
      Number.isFinite(Number(new Roll(formula, rollData).evaluateSync(extreme)?.total))
    );
  } catch {
    return false;
  }
}

/** Every formula a result rolls: its amount, or a choice group's count, selection and member amounts. */
function resultFormulas(result) {
  if (!isChoiceGroup(result)) return [result?.quantityFormula];
  return [
    result.awardCountFormula,
    result.selectionFormula,
    ...result.alternatives.map((member) => member?.quantityFormula),
  ];
}

/**
 * One refusal per formula in `resultGroups` that, read against the crafting character's `rollData`,
 * cannot total finitely, so a craft refuses before it consumes anything rather than after (issues
 * 1516, 1773). A divisor that crosses zero only inside its range still passes. No `Roll` reports
 * nothing, as `Result.validate` does.
 */
export function rolledAmountRefusals(resultGroups, Roll, rollData) {
  if (typeof Roll !== 'function') return [];
  return (resultGroups ?? [])
    .flatMap((group) => group?.results ?? [])
    .flatMap(resultFormulas)
    .map(normalizeQuantityFormula)
    .filter((formula) => formula && !totalsFinitely(formula, Roll, rollData))
    .map((formula) => `Result amount "${formula}" cannot be rolled for this character`);
}

/** A player-chooser group cannot award until its pick can be settled (issue 1773). */
const playerChooserRefusals = (groups) =>
  groups
    .flatMap((group) => group?.results ?? [])
    .filter((result) => isChoiceGroup(result) && result.chooser !== 'rolled')
    .map(() => 'A reward the player chooses cannot be awarded yet');

/**
 * `recipe.validate({ Roll })`, then `rolledAmountRefusals`, the injected `refuseRewards` and the
 * player-chooser refusal over every result group the recipe and its steps author, against `actor`.
 * A progressive award drops every formula (`ResolutionModeService`), so the amount refusals skip it
 * there; `refuseRewards` still runs and refuses any currency, knowledge or group result.
 */
export function validateCraft(recipe, actor, modeService, refuseRewards = null) {
  const Roll = diceEngine();
  const modes = modeService ?? globalThis.game?.fabricate?.getResolutionModeService?.();
  const progressive = modes?.getMode?.(recipe) === 'progressive';
  const validation = recipe.validate?.({ Roll, progressive }) ?? { valid: true, errors: [] };
  if (!validation.valid) return validation;
  const groups = [
    ...new Set([
      ...(recipe.resultGroups ?? []),
      ...(recipe.steps ?? []).flatMap((step) => step?.resultGroups ?? []),
    ]),
  ];
  const errors = [
    ...(progressive ? [] : rolledAmountRefusals(groups, Roll, actorData(actor))),
    ...(refuseRewards?.(groups, { actor, recipe, progressive }) ?? []),
    ...playerChooserRefusals(groups),
  ];
  if (progressive && errors.length === 0) return validation;
  return { valid: errors.length === 0, errors };
}

/** The `quantityFormulaErrors` floor over every result `salvage` authors; no `Roll` reports none. */
export function salvageResultAmountErrors(salvage, Roll) {
  return (salvage?.resultGroups ?? [])
    .flatMap((group) => group?.results ?? [])
    .flatMap((result) =>
      quantityFormulaErrors(normalizeQuantityFormula(result?.quantityFormula), Roll)
    )
    .map((error) => `Salvage result ${error}`);
}

/** The floor's `Roll` for `system`'s salvage: none under progressive, whose award drops formulas. */
const salvageAmountRoll = (system) =>
  resolveSalvageCheck(system).mode === 'progressive' ? null : diceEngine();

/** Throws when an enabled `salvage`, authored under `system`, fails the amount floor; the save is
 *  refused. A disabled one is never salvaged, so it is not floored. */
export function assertSalvageAmounts(salvage, system) {
  if (salvage?.enabled !== true) return;
  const errors = salvageResultAmountErrors(salvage, salvageAmountRoll(system));
  if (errors.length > 0) throw new Error(`Invalid salvage: ${errors.join(', ')}`);
}

/**
 * `modeService.validateSalvage`, then the amount floor and `rolledAmountRefusals` against `actor`
 * over a non-progressive salvage's results, so a salvage refuses before it consumes anything.
 */
export function validateSalvage({ component, system, actor }, modeService) {
  const modes = modeService ?? globalThis.game?.fabricate?.getResolutionModeService?.();
  const validation = modes?.validateSalvage?.(component, system) ?? { valid: true, errors: [] };
  const Roll = salvageAmountRoll(system);
  if (!validation.valid || !Roll) return validation;
  const floor = salvageResultAmountErrors(component?.salvage, Roll);
  const groups = component?.salvage?.resultGroups;
  const errors = floor.length > 0 ? floor : rolledAmountRefusals(groups, Roll, actorData(actor));
  return { valid: errors.length === 0, errors };
}

/** A rolled result's award report plus the integer awarded (`0` if empty); never persisted. */
export const rolledAwardRecord = (result, rolled, quantity) => ({
  resultId: result?.id ?? null,
  componentId: result?.componentId ?? result?.systemItemId ?? null,
  formula: rolled.formula,
  total: rolled.total,
  quantity,
});

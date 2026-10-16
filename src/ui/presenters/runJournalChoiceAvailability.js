/**
 * One group's Journal choices, each option and held candidate probed against the stage's
 * satisfiable remainder — the other groups the held stock funds together — so a requirement short
 * elsewhere never locks a candidate (issue 1644). A candidate's `claimed` is what the rest of the
 * stage takes of that stack: exclusive component and tag claims plus the essence allocation's units.
 */
import { idOf, normalizeList, stringOrNull } from '../../systems/gatheringEngineInternals.js';

import { selectedIngredientIndex } from './runJournalIngredientOptions.js';

export function missingGroupId(group) {
  return stringOrNull(group?.group?.id ?? group?.groupId ?? group?.id);
}

function withGroups(ingredientSet, groups) {
  return groups.length === normalizeList(ingredientSet.ingredientGroups).length
    ? ingredientSet
    : Object.create(ingredientSet, { ingredientGroups: { value: groups } });
}

/** The other groups that resolve together once every group they report missing is set aside. */
function satisfiableRemainder(ingredientSet, group, resolve) {
  let groups = normalizeList(ingredientSet.ingredientGroups).filter((entry) => entry !== group);
  for (;;) {
    const resolved = resolve(withGroups(ingredientSet, groups));
    const missing = new Set(normalizeList(resolved?.missingGroups).map(missingGroupId));
    const kept = groups.filter((entry) => !missing.has(stringOrNull(entry?.id)));
    if (resolved?.success === true || kept.length === groups.length) {
      return { groups, plan: normalizeList(resolved?.plan) };
    }
    groups = kept;
  }
}

function unitsOf(plan, itemId) {
  return plan
    .filter(
      (entry) => (stringOrNull(entry.item?.uuid) || stringOrNull(idOf(entry.item))) === itemId
    )
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity) || 0), 0);
}

/** An essence or currency option holds no stack: it reads as its need while it can be funded. */
function heldOf(presentation) {
  if (presentation.kind !== 'essence' && presentation.kind !== 'currency') {
    return presentation.candidates.reduce((sum, item) => sum + item.held, 0);
  }
  return presentation.available ? presentation.need : 0;
}

/**
 * `resolve(set, overrides)` is the edit-feasibility probe and `present(option, index, available)`
 * the option's presentation.
 */
export function choiceAvailability({
  group,
  ingredientSet,
  optionOverrides,
  selection,
  resolve,
  present,
}) {
  const groupId = stringOrNull(group?.id);
  const remainder = satisfiableRemainder(ingredientSet, group, (set) =>
    resolve(set, optionOverrides)
  );
  const stage = withGroups(
    ingredientSet,
    normalizeList(ingredientSet.ingredientGroups).filter(
      (entry) => entry === group || remainder.groups.includes(entry)
    )
  );
  const probe = (override) => resolve(stage, { ...optionOverrides, [groupId]: override });
  const options = normalizeList(group?.options).map((option, index) => {
    const presentation = present(option, index, probe({ optionIndex: index })?.success === true);
    presentation.candidates = presentation.candidates.map((item) => {
      const resolved = probe({ optionIndex: index, heldItemId: item.itemId });
      const available = resolved?.success === true;
      // Feasible: only what the solver routed elsewhere. Refused: what the remainder takes.
      const claims = available
        ? normalizeList(resolved.plan).filter((entry) => entry.ingredient !== option)
        : remainder.plan;
      return { ...item, claimed: unitsOf(claims, item.itemId), available };
    });
    presentation.held = heldOf(presentation);
    return presentation;
  });
  return {
    groupId,
    selectedOptionIndex: selectedIngredientIndex(group, optionOverrides, selection),
    options,
  };
}

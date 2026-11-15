/**
 * How the Journal reads one authored ingredient option: which option a group has selected, how
 * much of it a stage needs, and the name it is shown by.
 */
import {
  iterableToArray,
  laxNumberOrNull,
  plainObjectOrNull,
  stringOrEmpty,
  stringOrNull,
} from '../../systems/gatheringEngineInternals.js';

export function ingredientOverrideIndex(group, optionOverrides) {
  const groupId = stringOrNull(group?.id);
  if (!Object.hasOwn(optionOverrides, groupId)) return;
  const raw = optionOverrides[groupId]?.optionIndex;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && !raw.trim()) {
    return null;
  }
  const index = Number(raw);
  return Number.isSafeInteger(index) && index >= 0 && index < iterableToArray(group?.options).length
    ? index
    : null;
}

export function selectedIngredientIndex(group, optionOverrides, selection) {
  const options = iterableToArray(group?.options);
  const override = ingredientOverrideIndex(group, optionOverrides);
  if (override !== undefined) return override;
  const selected = iterableToArray(selection?.selectedIngredients).find((ingredient) =>
    options.includes(ingredient)
  );
  const selectedIndex = options.indexOf(selected);
  return Math.max(selectedIndex, 0);
}

export function ingredientNeed(option) {
  const match = plainObjectOrNull(option?.match);
  if (match?.type === 'essence' || match?.type === 'currency') {
    return Math.max(0, laxNumberOrNull(match.amount) ?? 0);
  }
  return Math.max(0, laxNumberOrNull(option?.quantity) ?? 1);
}

export function ingredientOptionName({ group, option, kind, match, definition, component }) {
  if (kind === 'component') {
    return stringOrEmpty(component?.name) || stringOrEmpty(match?.componentId);
  }
  if (kind === 'essence') {
    const essenceName = stringOrEmpty(definition?.name) || stringOrEmpty(match?.essenceId);
    return essenceName ? `${essenceName} essence` : '';
  }
  if (kind === 'currency') {
    return `${ingredientNeed(option)} ${stringOrEmpty(match?.unit)}`.trim();
  }
  if (kind === 'tag') {
    const tags = iterableToArray(match?.tags).map(stringOrEmpty).filter(Boolean);
    return tags.join(match?.tagMatch === 'all' ? ' & ' : ' | ') || stringOrEmpty(group?.name);
  }
  return stringOrEmpty(option?.name) || stringOrEmpty(group?.name);
}

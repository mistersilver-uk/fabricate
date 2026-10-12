/**
 * The manager store's condition-option normalizers: a weather or time-of-day value's stable id,
 * label and icon as `createAdminStore` persists them. The gathering service keeps its own diverging
 * copy (`src/systems/normalize/gatheringConditionOptions.js`); the two are not merged.
 */
import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../util/essenceIcons.js';
import {
  TIME_OF_DAY_ICONS,
  WEATHER_ICONS,
  WEATHER_FALLBACK_ICON,
} from '../util/gatheringConditionIcons.js';

const DEFAULT_GATHERING_CONDITION_ICONS = Object.freeze({
  weather: WEATHER_ICONS,
  timeOfDay: TIME_OF_DAY_ICONS,
});
const FALLBACK_GATHERING_CONDITION_ICONS = Object.freeze({
  weather: WEATHER_FALLBACK_ICON,
  timeOfDay: 'fas fa-clock',
});

export function normalizeGatheringConditionId(value) {
  if (value && typeof value === 'object') {
    return normalizeGatheringConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function conditionLabelFromId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map((token) =>
      token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`
    )
    .join(' ');
}

function defaultGatheringConditionIcon(kind, id) {
  return (
    DEFAULT_GATHERING_CONDITION_ICONS[kind]?.[id] ||
    FALLBACK_GATHERING_CONDITION_ICONS[kind] ||
    DEFAULT_ESSENCE_ICON
  );
}

export function normalizeGatheringConditionOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = normalizeGatheringConditionId(
    isRecord ? (value.id ?? value.value ?? value.label) : value
  );
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : String(value ?? '').trim();
  const label = isRecord
    ? rawLabel || conditionLabelFromId(id)
    : /[A-Z]/.test(rawLabel)
      ? rawLabel
      : conditionLabelFromId(id);
  const icon = normalizeEssenceIcon(
    isRecord ? value.icon : defaultGatheringConditionIcon(kind, id)
  );
  return { id, label, icon };
}

export function normalizeGatheringConditionOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = normalizeGatheringConditionOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

export function seedGatheringConditionOptions(kind, raw, defaults) {
  const values = normalizeGatheringConditionOptions(kind, raw);
  if (values.length > 0) return values;
  return normalizeGatheringConditionOptions(kind, defaults);
}

/** One option with a label and icon update merged on; its id never changes. */
export function applyGatheringConditionUpdate(kind, option, updates) {
  return {
    ...option,
    label:
      updates.label === undefined
        ? option.label
        : String(updates.label || '').trim() || option.label,
    icon: updates.icon === undefined ? option.icon : normalizeEssenceIcon(updates.icon),
  };
}

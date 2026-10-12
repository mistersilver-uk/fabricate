/**
 * The gathering service's condition-option normalizers: a weather or time-of-day value's stable id,
 * label and Font Awesome icon. The manager store keeps its own diverging copy
 * (`adminGatheringConditionOptions.js`); the two are not merged.
 */
import { normalizeConditionId } from '../../utils/scalars.js';

const DEFAULT_CONDITION_ICONS = Object.freeze({
  weather: Object.freeze({
    clear: 'fas fa-sun',
    cloudy: 'fas fa-cloud',
    rain: 'fas fa-cloud-rain',
    storm: 'fas fa-bolt',
    snow: 'fas fa-snowflake',
    fog: 'fas fa-smog',
    wind: 'fas fa-wind',
  }),
  timeOfDay: Object.freeze({
    dawn: 'fas fa-cloud-sun',
    day: 'fas fa-sun',
    dusk: 'fas fa-cloud-moon',
    night: 'fas fa-moon',
  }),
});
const FALLBACK_CONDITION_ICONS = Object.freeze({
  weather: 'fas fa-cloud-sun',
  timeOfDay: 'fas fa-clock',
});

export function normalizeConditionIcon(icon, fallback) {
  const tokens = String(icon || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const prefix =
    tokens.find((token) =>
      /^(?:fa[bsrltd]?|fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands)$/.test(token)
    ) || 'fas';
  const iconToken = tokens.findLast(
    (token) =>
      token.startsWith('fa-') &&
      !['fa', 'fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands'].includes(
        token
      )
  );
  return iconToken ? `${prefix} ${iconToken}` : fallback;
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

function defaultConditionIcon(kind, id) {
  return DEFAULT_CONDITION_ICONS[kind]?.[id] || FALLBACK_CONDITION_ICONS[kind] || 'fas fa-tag';
}

function normalizeConditionOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = normalizeConditionId(isRecord ? (value.id ?? value.value ?? value.label) : value);
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : String(value ?? '').trim();
  const fallbackIcon = defaultConditionIcon(kind, id);
  return {
    id,
    label: isRecord
      ? rawLabel || conditionLabelFromId(id)
      : /[A-Z]/.test(rawLabel)
        ? rawLabel
        : conditionLabelFromId(id),
    icon: normalizeConditionIcon(isRecord ? value.icon : fallbackIcon, fallbackIcon),
  };
}

export function normalizeConditionOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = normalizeConditionOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

export function seedConditionOptions(kind, raw, defaults) {
  const values = normalizeConditionOptions(kind, raw);
  return values.length > 0 ? values : normalizeConditionOptions(kind, defaults);
}

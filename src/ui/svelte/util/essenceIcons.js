import {
  FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS,
  FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS
} from './fontAwesomeFreeClassicIcons.js';

export const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

const DEFAULT_ICON_PREFIX = 'fas';

const STYLE_PREFIXES = Object.freeze(new Set([
  'fas',
  'far',
  'fal',
  'fat',
  'fad',
  'fab',
  'fass',
  'fasr',
  'fasl',
  'fast',
  'fasds',
  'fasdr',
  'fasdl',
  'fasdt',
  'fa-solid',
  'fa-regular',
  'fa-light',
  'fa-thin',
  'fa-duotone',
  'fa-brands',
  'fa-sharp',
  'fa-sharp-duotone'
]));

const NON_ICON_TOKENS = Object.freeze(new Set([
  'fa',
  'fa-solid',
  'fa-regular',
  'fa-light',
  'fa-thin',
  'fa-duotone',
  'fa-brands',
  'fa-classic',
  'fa-sharp',
  'fa-sharp-duotone',
  'fa-swap-opacity',
  'fa-fw',
  'fa-ul',
  'fa-li',
  'fa-border',
  'fa-pull-left',
  'fa-pull-right',
  'fa-beat',
  'fa-bounce',
  'fa-fade',
  'fa-beat-fade',
  'fa-flip',
  'fa-shake',
  'fa-spin',
  'fa-spin-reverse',
  'fa-spin-pulse',
  'fa-rotate-90',
  'fa-rotate-180',
  'fa-rotate-270',
  'fa-flip-horizontal',
  'fa-flip-vertical',
  'fa-rotate-by',
  'fa-stack',
  'fa-stack-1x',
  'fa-stack-2x',
  'fa-inverse',
  'fa-xs',
  'fa-sm',
  'fa-lg',
  'fa-xl',
  'fa-2xl',
  'fa-2xs',
  'fa-1x',
  'fa-2x',
  'fa-3x',
  'fa-4x',
  'fa-5x',
  'fa-6x',
  'fa-7x',
  'fa-8x',
  'fa-9x',
  'fa-10x'
]));

const PREFIX_ALIASES = Object.freeze({
  'fa-solid': 'fas',
  'fa-regular': 'far'
});

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function humanizeIconName(iconName) {
  return String(iconName || '')
    .split('-')
    .filter(Boolean)
    .map(token => {
      if (token.length <= 2) return token.toUpperCase();
      return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
    })
    .join(' ');
}

function normalizePrefix(prefix) {
  const trimmed = String(prefix || '').trim();
  if (!trimmed) return DEFAULT_ICON_PREFIX;
  return PREFIX_ALIASES[trimmed] || (STYLE_PREFIXES.has(trimmed) ? trimmed : DEFAULT_ICON_PREFIX);
}

function createIconOption({ iconCode, label }, prefix) {
  const variant = prefix === 'far' ? 'regular' : 'solid';
  const resolvedLabel = String(label || '').trim() || humanizeIconName(iconCode);

  return Object.freeze({
    iconClass: `${prefix} fa-${iconCode}`,
    iconName: iconCode,
    label: resolvedLabel,
    variant,
    searchText: normalizeSearch(`${resolvedLabel} ${iconCode} fa-${iconCode} ${prefix} ${variant}`)
  });
}

function createEssenceIconOptions(iconDefinitions) {
  const options = [];

  for (const definition of iconDefinitions) {
    const iconCode = String(definition?.iconCode || definition?.iconName || '').trim();
    if (!iconCode) continue;

    const normalizedDefinition = { iconCode, label: definition.label, hasRegular: definition.hasRegular };
    options.push(createIconOption(normalizedDefinition, 'fas'));
    if (normalizedDefinition.hasRegular) {
      options.push(createIconOption(normalizedDefinition, 'far'));
    }
  }

  return Object.freeze(options);
}

export const ESSENCE_ALL_ICON_OPTIONS = createEssenceIconOptions(FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS);
export const ESSENCE_ICON_OPTIONS = createEssenceIconOptions(FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS);

export function getEssenceIconPrefix(iconClass) {
  const tokens = String(iconClass || '').trim().split(/\s+/).filter(Boolean);
  const prefix = tokens.find(token => STYLE_PREFIXES.has(token));
  return normalizePrefix(prefix);
}

export function getEssenceIconName(iconClass) {
  const tokens = String(iconClass || '').trim().split(/\s+/).filter(Boolean);
  const iconToken = tokens.findLast(token => token.startsWith('fa-') && !NON_ICON_TOKENS.has(token));
  return iconToken ? iconToken.slice(3) : '';
}

export function normalizeEssenceIcon(iconClass) {
  const prefix = getEssenceIconPrefix(iconClass);
  const iconName = getEssenceIconName(iconClass);
  return iconName ? `${prefix} fa-${iconName}` : DEFAULT_ESSENCE_ICON;
}

export function buildEssenceIconOptions(iconDefinitions = FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS) {
  if (iconDefinitions === FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS) {
    return ESSENCE_ICON_OPTIONS;
  }
  if (iconDefinitions === FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS) {
    return ESSENCE_ALL_ICON_OPTIONS;
  }

  const resolvedDefinitions = Array.isArray(iconDefinitions) && iconDefinitions.length > 0
    ? iconDefinitions
    : FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS;

  return createEssenceIconOptions(resolvedDefinitions);
}

export function getEssenceIconOption(iconClass, options = ESSENCE_ICON_OPTIONS) {
  const normalizedIcon = normalizeEssenceIcon(iconClass);
  const resolvedOptions = Array.isArray(options) && options.length > 0
    ? options
    : ESSENCE_ICON_OPTIONS;

  const match = resolvedOptions.find(option => option.iconClass === normalizedIcon);
  if (match) return match;

  const prefix = getEssenceIconPrefix(normalizedIcon);
  const iconName = getEssenceIconName(normalizedIcon);

  return Object.freeze({
    label: humanizeIconName(iconName) || normalizedIcon,
    iconClass: normalizedIcon,
    iconName,
    variant: prefix === 'far' ? 'regular' : 'solid',
    searchText: normalizeSearch(normalizedIcon)
  });
}

export function filterEssenceIconOptions(options = [], searchTerm = '') {
  const resolvedOptions = Array.isArray(options) ? options : [];
  const normalizedSearch = normalizeSearch(searchTerm);
  if (!normalizedSearch) return resolvedOptions;

  const tokens = normalizedSearch.split(' ').filter(Boolean);
  return resolvedOptions.filter(option =>
    tokens.every(token => option.searchText.includes(token))
  );
}

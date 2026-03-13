export const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

const DEFAULT_ICON_PREFIX = 'fas';

const FALLBACK_ICON_NAMES = Object.freeze([
  'mortar-pestle',
  'tint',
  'fire',
  'leaf',
  'skull-crossbones',
  'heart',
  'bolt',
  'sun',
  'moon',
  'snowflake',
  'wind',
  'mountain',
  'paw',
  'bone',
  'brain',
  'eye',
  'ghost',
  'hourglass-half',
  'flask',
  'vial',
  'gem',
  'star',
  'shield-alt',
  'feather-alt',
  'cloud',
  'spider',
  'seedling',
  'atom',
  'radiation-alt',
  'anchor'
]);

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

let cachedIconNames = null;
let pendingIconNames = null;

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
  return STYLE_PREFIXES.has(trimmed) ? trimmed : DEFAULT_ICON_PREFIX;
}

function extractIconNamesFromSelectorText(selectorText = '') {
  const names = new Set();
  for (const match of selectorText.matchAll(/\.fa-([a-z0-9-]+)/g)) {
    const iconName = match[1];
    if (!iconName || NON_ICON_TOKENS.has(`fa-${iconName}`)) continue;
    names.add(iconName);
  }
  return [...names];
}

function freezeNames(iconNames) {
  return Object.freeze([...iconNames].sort((left, right) => left.localeCompare(right)));
}

export function getFallbackEssenceIconNames() {
  return FALLBACK_ICON_NAMES;
}

export function getEssenceIconPrefix(iconClass) {
  const tokens = String(iconClass || '').trim().split(/\s+/).filter(Boolean);
  return tokens.find(token => STYLE_PREFIXES.has(token)) || DEFAULT_ICON_PREFIX;
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

export function buildEssenceIconOptions(iconNames = FALLBACK_ICON_NAMES, prefix = DEFAULT_ICON_PREFIX) {
  const resolvedPrefix = normalizePrefix(prefix);
  const uniqueNames = freezeNames(
    new Set(
      (Array.isArray(iconNames) ? iconNames : FALLBACK_ICON_NAMES)
        .map(name => String(name || '').trim())
        .filter(Boolean)
    )
  );

  return uniqueNames.map(iconName => {
    const label = humanizeIconName(iconName);
    return Object.freeze({
      iconClass: `${resolvedPrefix} fa-${iconName}`,
      iconName,
      label,
      searchText: normalizeSearch(`${label} fa-${iconName} ${iconName} ${resolvedPrefix}`)
    });
  });
}

export function getEssenceIconOption(iconClass, options = []) {
  const normalizedIcon = normalizeEssenceIcon(iconClass);
  const resolvedOptions = Array.isArray(options) && options.length > 0
    ? options
    : buildEssenceIconOptions(FALLBACK_ICON_NAMES, getEssenceIconPrefix(normalizedIcon));

  return resolvedOptions.find(option => option.iconClass === normalizedIcon) || {
    label: humanizeIconName(getEssenceIconName(normalizedIcon)) || normalizedIcon,
    iconClass: normalizedIcon,
    iconName: getEssenceIconName(normalizedIcon),
    searchText: normalizeSearch(normalizedIcon)
  };
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

export function extractFontAwesomeIconNamesFromCss(cssText = '') {
  if (!cssText) return [];

  const iconNames = new Set();
  for (const match of cssText.matchAll(/([^{}]+)\{--fa:[^}]+\}/g)) {
    for (const iconName of extractIconNamesFromSelectorText(match[1])) {
      iconNames.add(iconName);
    }
  }

  return freezeNames(iconNames);
}

export function extractFontAwesomeIconNamesFromStyleSheet(sheet) {
  if (!sheet?.cssRules) return [];

  const iconNames = new Set();
  let rules = [];
  try {
    rules = Array.from(sheet.cssRules);
  } catch {
    return [];
  }

  for (const rule of rules) {
    if (!rule?.style?.getPropertyValue) continue;
    if (!rule.style.getPropertyValue('--fa')) continue;
    for (const iconName of extractIconNamesFromSelectorText(rule.selectorText || '')) {
      iconNames.add(iconName);
    }
  }

  return freezeNames(iconNames);
}

export function extractFontAwesomeIconNamesFromDocument(doc = globalThis.document) {
  if (!doc?.styleSheets) return [];

  const iconNames = new Set();
  const styleSheets = Array.from(doc.styleSheets);
  for (const sheet of styleSheets) {
    const href = String(sheet?.href || '');
    if (href && !href.includes('fontawesome')) continue;
    for (const iconName of extractFontAwesomeIconNamesFromStyleSheet(sheet)) {
      iconNames.add(iconName);
    }
  }

  return freezeNames(iconNames);
}

function findFontAwesomeStylesheetHref(doc = globalThis.document) {
  if (!doc?.styleSheets) return '';

  for (const sheet of Array.from(doc.styleSheets)) {
    const href = String(sheet?.href || '');
    if (href.includes('fontawesome') && href.endsWith('.css')) {
      return href;
    }
  }

  return '';
}

export function getEssenceIconNames() {
  return cachedIconNames || FALLBACK_ICON_NAMES;
}

export async function loadEssenceIconNames() {
  if (cachedIconNames) return cachedIconNames;
  if (pendingIconNames) return pendingIconNames;

  pendingIconNames = (async () => {
    const doc = globalThis.document;
    const runtimeNames = extractFontAwesomeIconNamesFromDocument(doc);
    if (runtimeNames.length > 0) {
      cachedIconNames = runtimeNames;
      return cachedIconNames;
    }

    const stylesheetHref = findFontAwesomeStylesheetHref(doc);
    if (stylesheetHref && typeof globalThis.fetch === 'function') {
      try {
        const response = await globalThis.fetch(stylesheetHref);
        if (response?.ok) {
          const cssText = await response.text();
          const extractedNames = extractFontAwesomeIconNamesFromCss(cssText);
          if (extractedNames.length > 0) {
            cachedIconNames = extractedNames;
            return cachedIconNames;
          }
        }
      } catch {
        // Fall through to the curated fallback set.
      }
    }

    cachedIconNames = FALLBACK_ICON_NAMES;
    return cachedIconNames;
  })();

  try {
    return await pendingIconNames;
  } finally {
    pendingIconNames = null;
  }
}

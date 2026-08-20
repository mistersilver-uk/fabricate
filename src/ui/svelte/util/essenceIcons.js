import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  FOUNDRY_ICON_DEFINITIONS,
  isCuratedIconEntry
} from './foundryIconVocabulary.js';

export const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

/**
 * The shared `--fab-tag-*` palette an essence's optional colour is chosen from
 * (issue 917). The palette is the whole vocabulary — there is no custom-hex entry for
 * an essence — because a free hex cannot be guaranteed legible against all seven
 * themes. It mirrors the preset list the manager's colour picker renders.
 */
export const ESSENCE_COLOR_TOKENS = Object.freeze([
  'sage',
  'mist',
  'lavender',
  'rose',
  'peach',
  'butter',
  'aqua',
  'mauve'
]);

/**
 * Normalize a stored essence colour to a bare palette token, or null.
 *
 * Null is a FIRST-CLASS state, not a failure: an essence with no authored colour
 * renders in the theme accent, which is what every essence renders as today. An
 * unrecognized token normalizes to null for the same reason — falling back to the
 * accent is honest, whereas coercing it to an arbitrary preset would invent a colour
 * the GM never chose.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeEssenceColorToken(value) {
  const token = String(value ?? '').trim().replace(/^--fab-tag-/, '');
  return ESSENCE_COLOR_TOKENS.includes(token) ? token : null;
}

const DEFAULT_ICON_PREFIX = 'fas';
const FOUNDRY_13_MAJOR = 13;
const FOUNDRY_14_MAJOR = 14;

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

/**
 * Human search vocabulary layered over Font Awesome's technical names.
 *
 * Font Awesome's aliases protect compatibility (`cog` -> `gear`); these aliases protect usability.
 * They are deliberately broad RPG/plain-language concepts rather than alternate persisted names:
 * searching "potion" should find flasks, "gold" should find coins, and "character" should find a
 * person even though none of those words needs to become an icon code.
 */
const USER_SEARCH_ALIASES_BY_TOKEN = Object.freeze({
  anvil: ['blacksmith', 'smithing', 'forge', 'crafting'],
  armor: ['armour', 'defence', 'defense', 'protection'],
  axe: ['weapon', 'combat', 'chop'],
  bag: ['container', 'storage', 'inventory'],
  basket: ['container', 'storage', 'market'],
  bell: ['alert', 'notification', 'signal'],
  book: ['lore', 'knowledge', 'journal', 'tome'],
  bottle: ['potion', 'alchemy', 'liquid'],
  bow: ['weapon', 'archery', 'ranged'],
  bolt: ['lightning', 'electric', 'electricity', 'energy'],
  box: ['container', 'storage', 'crate'],
  brain: ['mind', 'intelligence', 'knowledge', 'psychic'],
  building: ['place', 'location', 'settlement'],
  cart: ['trade', 'commerce', 'market', 'transport'],
  castle: ['fortress', 'keep', 'settlement', 'place'],
  chest: ['loot', 'treasure', 'storage', 'container'],
  clock: ['time', 'duration', 'timer'],
  cloud: ['weather', 'sky'],
  cog: ['gear', 'settings', 'options', 'configuration'],
  coin: ['money', 'currency', 'gold', 'treasure'],
  coins: ['money', 'currency', 'gold', 'treasure'],
  crystal: ['gem', 'gemstone', 'jewel', 'magic'],
  dagger: ['weapon', 'knife', 'combat'],
  database: ['data', 'storage', 'technology'],
  dragon: ['monster', 'creature', 'beast'],
  droplet: ['water', 'liquid', 'moisture'],
  eye: ['vision', 'sight', 'perception', 'watch'],
  fire: ['flame', 'burn', 'heat', 'campfire'],
  flask: ['potion', 'alchemy', 'brew', 'liquid'],
  gem: ['gemstone', 'jewel', 'crystal', 'treasure'],
  gear: ['cog', 'settings', 'options', 'configuration'],
  ghost: ['spirit', 'undead', 'haunt'],
  gun: ['weapon', 'firearm', 'ranged', 'combat'],
  hammer: ['tool', 'crafting', 'smithing', 'forge'],
  heart: ['health', 'healing', 'life', 'love'],
  helmet: ['armour', 'armor', 'defence', 'defense', 'protection'],
  hourglass: ['time', 'duration', 'timer'],
  house: ['home', 'building', 'place', 'settlement'],
  key: ['lock', 'access', 'unlock'],
  leaf: ['nature', 'plant', 'herb', 'herbal'],
  lightning: ['electric', 'electricity', 'energy', 'storm'],
  lock: ['security', 'access', 'locked'],
  mace: ['weapon', 'combat'],
  magic: ['spell', 'arcane', 'mystic'],
  mask: ['disguise', 'identity', 'face'],
  moon: ['night', 'lunar'],
  mortar: ['alchemy', 'potion', 'ingredients', 'crafting'],
  mountain: ['terrain', 'travel', 'wilderness'],
  paw: ['animal', 'beast', 'creature'],
  person: ['character', 'npc', 'actor', 'people'],
  pills: ['medicine', 'medical', 'healing'],
  robot: ['machine', 'android', 'technology'],
  scroll: ['lore', 'knowledge', 'spell', 'parchment'],
  server: ['computer', 'technology', 'data'],
  shield: ['armour', 'armor', 'defence', 'defense', 'protection'],
  shop: ['trade', 'commerce', 'market', 'merchant'],
  skull: ['death', 'dead', 'undead', 'danger'],
  sparkles: ['magic', 'spell', 'arcane', 'mystic'],
  star: ['celestial', 'magic', 'favourite', 'favorite'],
  stopwatch: ['time', 'duration', 'timer'],
  store: ['trade', 'commerce', 'market', 'merchant'],
  sun: ['day', 'daylight', 'solar'],
  sword: ['weapon', 'blade', 'combat'],
  syringe: ['medicine', 'medical', 'healing', 'injection'],
  tree: ['nature', 'plant', 'forest', 'wood'],
  user: ['character', 'npc', 'actor', 'person'],
  users: ['party', 'group', 'characters', 'people'],
  vial: ['potion', 'alchemy', 'brew', 'liquid'],
  wand: ['magic', 'spell', 'arcane', 'wizard'],
  water: ['liquid', 'ocean', 'river', 'sea'],
  wheat: ['crop', 'farm', 'food', 'harvest'],
  wrench: ['tool', 'repair', 'maintenance', 'crafting']
});

const USER_SEARCH_ALIASES_BY_ICON = Object.freeze({
  'kit-medical': ['health', 'healing', 'medicine', 'first aid'],
  'mortar-pestle': ['alchemy', 'potion', 'ingredients', 'crafting'],
  'sack-dollar': ['money', 'currency', 'gold', 'treasure', 'loot'],
  'treasure-chest': ['loot', 'treasure', 'reward', 'storage'],
  'user-ninja': ['character', 'npc', 'rogue', 'assassin'],
  'user-wizard': ['character', 'npc', 'mage', 'magic', 'spellcaster']
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

function currentFoundryMajor() {
  const generation = Number(globalThis.game?.release?.generation);
  if (Number.isInteger(generation) && generation > 0) return generation;

  const version = String(globalThis.game?.version ?? globalThis.game?.release?.version ?? '').trim();
  const major = Number.parseInt(version.split('.', 1)[0], 10);
  return Number.isInteger(major) && major > 0 ? major : FOUNDRY_14_MAJOR;
}

function glyphValue(style, selectorText) {
  const modern = String(style?.getPropertyValue?.('--fa') ?? '').trim();
  if (modern) return `fa:${modern}`;

  if (!/::?before\b/i.test(selectorText)) return '';
  const legacy = String(style?.getPropertyValue?.('content') ?? '').trim();
  return legacy && legacy !== 'normal' && legacy !== 'none' ? `content:${legacy}` : '';
}

function collectGlyphsFromRules(rules, glyphsByName) {
  for (const rule of rules ?? []) {
    if (rule?.cssRules) {
      collectGlyphsFromRules(rule.cssRules, glyphsByName);
    }

    const selectorText = String(rule?.selectorText ?? '');
    const glyph = glyphValue(rule?.style, selectorText);
    if (!glyph) continue;

    for (const match of selectorText.matchAll(/\.fa-([a-z0-9-]+)/gi)) {
      glyphsByName.set(match[1], glyph);
    }
  }
}

/**
 * Measure the icon-name -> glyph grouping from the Font Awesome stylesheet the current Foundry
 * client actually loaded.
 *
 * This is intentionally runtime data for V13. Font Awesome's public v7.0 changelog says 300+ icons
 * were added but does not enumerate all of them; subtracting a hand-written list from the V14
 * catalogue would therefore claim exactness it cannot have. Foundry serves its bundled stylesheet
 * same-origin, so the client can answer the stronger question directly. The V13/V14 smoke arms
 * independently assert the bundle release and changelog-known presence/absence sentinels.
 *
 * @param {Document|null|undefined} [documentObject]
 * @returns {Map<string, string>}
 */
export function measureLoadedFontAwesomeGlyphs(documentObject = globalThis.document) {
  const glyphsByName = new Map();
  const styleSheets = documentObject?.styleSheets;
  if (!styleSheets) return glyphsByName;

  for (const sheet of styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    collectGlyphsFromRules(rules, glyphsByName);
  }

  return glyphsByName;
}

function definitionNames(definition) {
  return [definition.iconCode, ...(Array.isArray(definition.aliases) ? definition.aliases : [])];
}

function preferredVersionedName(names, sourceDefinitionsByName) {
  const canonical = names.find((name) => sourceDefinitionsByName.get(name)?.iconCode === name);
  if (canonical) return canonical;
  return [...names].sort((left, right) => {
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : 1;
  })[0];
}

/**
 * Reconstruct one release's rows from the names and glyph groupings that release actually renders.
 *
 * Grouping by glyph rather than merely filtering names is load-bearing across the v6 -> v7 major:
 * v7 remapped some formerly distinct v6 icons as aliases. If V13 says two names point at different
 * glyphs, they become two rows again here even if the V14 source catalogue groups them together.
 *
 * @param {ReadonlyArray<{iconCode:string,label:string,aliases?:ReadonlyArray<string>}>} sourceDefinitions
 * @param {Map<string,string>} glyphsByName
 * @returns {ReadonlyArray<{iconCode:string,label:string,aliases:ReadonlyArray<string>}>>}
 */
export function buildIconDefinitionsForMeasuredBundle(sourceDefinitions, glyphsByName) {
  if (!(glyphsByName instanceof Map) || glyphsByName.size === 0) return Object.freeze([]);

  const sourceDefinitionsByName = new Map();
  for (const definition of sourceDefinitions) {
    for (const name of definitionNames(definition)) sourceDefinitionsByName.set(name, definition);
  }

  const namesByGlyph = new Map();
  for (const name of sourceDefinitionsByName.keys()) {
    const glyph = glyphsByName.get(name);
    if (!glyph) continue;
    const names = namesByGlyph.get(glyph) ?? new Set();
    names.add(name);
    namesByGlyph.set(glyph, names);
  }

  const definitions = [...namesByGlyph.values()]
    .map((nameSet) => {
      const names = [...nameSet];
      const iconCode = preferredVersionedName(names, sourceDefinitionsByName);
      const aliases = Object.freeze(
        names
          .filter((name) => name !== iconCode)
          .sort((left, right) => (left < right ? -1 : 1))
      );
      return Object.freeze({ iconCode, label: humanizeIconName(iconCode), aliases });
    })
    .sort((left, right) => (left.iconCode < right.iconCode ? -1 : 1));

  return Object.freeze(definitions);
}

let measuredGlyphsCache = null;
let foundry13AllDefinitionsCache = null;
let foundry13CuratedDefinitionsCache = null;

function getFoundry13Definitions() {
  measuredGlyphsCache ??= measureLoadedFontAwesomeGlyphs();
  foundry13AllDefinitionsCache ??= buildIconDefinitionsForMeasuredBundle(
    FOUNDRY_ICON_DEFINITIONS,
    measuredGlyphsCache
  );
  foundry13CuratedDefinitionsCache ??= Object.freeze(
    foundry13AllDefinitionsCache.filter(isCuratedIconEntry)
  );
  return {
    all: foundry13AllDefinitionsCache,
    curated: foundry13CuratedDefinitionsCache
  };
}

/**
 * Full icon list for a supported Foundry generation.
 *
 * V14 is the committed generated catalogue measured from Foundry 14.365 / Font Awesome 7.2.0.
 * V13 is reconstructed from the V13 client's own loaded Font Awesome 6.7.2 glyph rules. Tests may
 * inject a measured map to exercise the V13 split without requiring a Foundry installation.
 *
 * @param {number} [major]
 * @param {{glyphsByName?:Map<string,string>}} [options]
 */
export function getFoundryIconDefinitionsForMajor(major = currentFoundryMajor(), options = {}) {
  if (major === FOUNDRY_14_MAJOR) return FOUNDRY_ICON_DEFINITIONS;
  if (major === FOUNDRY_13_MAJOR) {
    if (options.glyphsByName) {
      return buildIconDefinitionsForMeasuredBundle(FOUNDRY_ICON_DEFINITIONS, options.glyphsByName);
    }
    return getFoundry13Definitions().all;
  }

  const measured = options.glyphsByName ?? measureLoadedFontAwesomeGlyphs();
  return measured.size > 0
    ? buildIconDefinitionsForMeasuredBundle(FOUNDRY_ICON_DEFINITIONS, measured)
    : FOUNDRY_ICON_DEFINITIONS;
}

/** Curated icon list for a supported Foundry generation. */
export function getFoundryCuratedIconDefinitionsForMajor(
  major = currentFoundryMajor(),
  options = {}
) {
  if (major === FOUNDRY_14_MAJOR) return FOUNDRY_CURATED_ICON_DEFINITIONS;
  if (major === FOUNDRY_13_MAJOR && !options.glyphsByName) return getFoundry13Definitions().curated;
  return Object.freeze(
    getFoundryIconDefinitionsForMajor(major, options).filter(isCuratedIconEntry)
  );
}

function buildUserSearchAliases({ iconCode, label, aliases = [] }) {
  const searchAliases = new Set();
  const names = [iconCode, ...aliases];

  searchAliases.add(normalizeSearch(label || humanizeIconName(iconCode)));
  for (const name of names) {
    searchAliases.add(normalizeSearch(name.replaceAll('-', ' ')));
    for (const token of name.split('-').filter(Boolean)) {
      for (const alias of USER_SEARCH_ALIASES_BY_TOKEN[token] ?? []) {
        searchAliases.add(normalizeSearch(alias));
      }
    }
    for (const alias of USER_SEARCH_ALIASES_BY_ICON[name] ?? []) {
      searchAliases.add(normalizeSearch(alias));
    }
  }

  return Object.freeze([...searchAliases].filter(Boolean));
}

/**
 * One picker row for one GLYPH, at the solid weight.
 *
 * Solid only, and one row per glyph rather than one per name, for the same reason: Foundry bundles
 * Font Awesome Pro, whose classic solid and regular faces carry an identical cmap and several of
 * whose names routinely share a drawing. Offering both weights, or every alias, would spend two
 * picker rows on one picture — and the picker shows seven or eight rows at a time.
 *
 * Nothing is refused by that. Font Awesome aliases and human search aliases both go into
 * `searchText`, so a GM who types `cog`, `settings`, `potion`, `gold` or `character` can reach the
 * picture they meant without knowing Font Awesome's vocabulary. `far` is still a prefix
 * `normalizeEssenceIcon` accepts and Foundry still renders.
 */
function createIconOption({ iconCode, label, aliases = [] }, prefix) {
  const variant = prefix === 'far' ? 'regular' : 'solid';
  const resolvedLabel = String(label || '').trim() || humanizeIconName(iconCode);
  const aliasText = aliases.join(' ');
  const searchAliases = buildUserSearchAliases({ iconCode, label: resolvedLabel, aliases });

  return Object.freeze({
    iconClass: `${prefix} fa-${iconCode}`,
    iconName: iconCode,
    label: resolvedLabel,
    variant,
    aliases: Object.freeze([...aliases]),
    searchAliases,
    searchText: normalizeSearch(
      `${resolvedLabel} ${iconCode} fa-${iconCode} ${aliasText} ${searchAliases.join(' ')} ${prefix} ${variant}`
    )
  });
}

function createEssenceIconOptions(iconDefinitions) {
  const options = [];

  for (const definition of iconDefinitions) {
    const iconCode = String(definition?.iconCode || definition?.iconName || '').trim();
    if (!iconCode) continue;

    const aliases = Array.isArray(definition?.aliases) ? definition.aliases : [];
    options.push(createIconOption({ iconCode, label: definition.label, aliases }, 'fas'));
  }

  return Object.freeze(options);
}

const essenceIconOptionsCache = new Map();
const essenceAllIconOptionsCache = new Map();

export function getEssenceIconOptions() {
  const major = currentFoundryMajor();
  if (!essenceIconOptionsCache.has(major)) {
    essenceIconOptionsCache.set(
      major,
      createEssenceIconOptions(getFoundryCuratedIconDefinitionsForMajor(major))
    );
  }
  return essenceIconOptionsCache.get(major);
}

export function getEssenceAllIconOptions() {
  const major = currentFoundryMajor();
  if (!essenceAllIconOptionsCache.has(major)) {
    essenceAllIconOptionsCache.set(
      major,
      createEssenceIconOptions(getFoundryIconDefinitionsForMajor(major))
    );
  }
  return essenceAllIconOptionsCache.get(major);
}

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

export function buildEssenceIconOptions(iconDefinitions = null) {
  if (iconDefinitions === null) return getEssenceIconOptions();
  if (iconDefinitions === FOUNDRY_CURATED_ICON_DEFINITIONS && currentFoundryMajor() === FOUNDRY_14_MAJOR) {
    return getEssenceIconOptions();
  }
  if (iconDefinitions === FOUNDRY_ICON_DEFINITIONS && currentFoundryMajor() === FOUNDRY_14_MAJOR) {
    return getEssenceAllIconOptions();
  }

  const resolvedDefinitions = Array.isArray(iconDefinitions) && iconDefinitions.length > 0
    ? iconDefinitions
    : getFoundryCuratedIconDefinitionsForMajor();

  return createEssenceIconOptions(resolvedDefinitions);
}

/**
 * The picker row a stored icon class selects.
 *
 * Resolves through ALIASES as well as offered names, which is what stops a one-row-per-glyph
 * vocabulary from refusing a name: a system that persisted `fas fa-cog` before this vocabulary
 * existed still selects the gear's row, with the gear's label, rather than falling through to a
 * synthesised option that no list contains.
 */
export function getEssenceIconOption(iconClass, options = getEssenceIconOptions()) {
  const normalizedIcon = normalizeEssenceIcon(iconClass);
  const resolvedOptions = Array.isArray(options) && options.length > 0
    ? options
    : getEssenceIconOptions();

  const match = resolvedOptions.find(option => option.iconClass === normalizedIcon);
  if (match) return match;

  const prefix = getEssenceIconPrefix(normalizedIcon);
  const iconName = getEssenceIconName(normalizedIcon);

  const aliased = resolvedOptions.find(option => option.aliases?.includes(iconName));
  if (aliased) return aliased;

  const label = humanizeIconName(iconName) || normalizedIcon;
  const searchAliases = buildUserSearchAliases({ iconCode: iconName, label, aliases: [] });
  return Object.freeze({
    label,
    iconClass: normalizedIcon,
    iconName,
    variant: prefix === 'far' ? 'regular' : 'solid',
    aliases: Object.freeze([]),
    searchAliases,
    searchText: normalizeSearch(`${normalizedIcon} ${searchAliases.join(' ')}`)
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

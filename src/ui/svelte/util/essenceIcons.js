import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  FOUNDRY_ICON_DEFINITIONS,
  findCuratedIcon
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
const FOUNDRY_14_MAJOR = 14;
const UNDETERMINED_FOUNDRY_MAJOR = null;
const BACKSLASH = '\\';

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
  'hat-wizard': ['character', 'npc', 'mage', 'magic', 'spellcaster']
});

/**
 * The keys the two tables above hang aliases on, published for a drift guard.
 *
 * These tables are a hand-maintained MIRROR of the shipped vocabulary, and a mirror rots
 * silently: a key naming an icon no release ships — `user-wizard`, when the icon is `hat-wizard` —
 * costs nothing at load and simply never fires, so the concepts it was written to make searchable
 * are quietly unsearchable. A test that resolves every key against the vocabulary is what turns
 * that into a failure at the next regeneration rather than a report from a GM.
 */
export const USER_SEARCH_ALIAS_KEYS = Object.freeze({
  nameTokens: Object.freeze(Object.keys(USER_SEARCH_ALIASES_BY_TOKEN)),
  iconNames: Object.freeze(Object.keys(USER_SEARCH_ALIASES_BY_ICON))
});

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
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

/**
 * The Foundry generation this client is running, or `null` when the client cannot say.
 *
 * `null` is a FIRST-CLASS answer rather than a defaulted one, and the reason is what the callers
 * do with it. The generation selects between a committed catalogue and a measurement of the
 * client's own stylesheet, and guessing the newest generation resolves "I do not know which
 * Foundry this is" into "offer every Font Awesome 7 name" — which on a v13 client offers hundreds
 * of names its font cannot draw, each rendering as a blank square, any of which a GM can persist
 * into world data. The rule is: WHEN IN DOUBT, MEASURE; when the measurement is empty, fall back
 * to the committed catalogue.
 */
function currentFoundryMajor() {
  const generation = Number(globalThis.game?.release?.generation);
  if (Number.isInteger(generation) && generation > 0) return generation;

  const version = String(globalThis.game?.version ?? globalThis.game?.release?.version ?? '').trim();
  const major = Number.parseInt(version.split('.', 1)[0], 10);
  return Number.isInteger(major) && major > 0 ? major : UNDETERMINED_FOUNDRY_MAJOR;
}

/**
 * A CSS escape, per CSS Syntax §4.3.7: one to SIX hex digits, optionally followed by a single
 * whitespace that terminates the run rather than belonging to it.
 *
 * The same rule the catalogue generator reads the bundle with (`scripts/lib/fontAwesomeBundle.js`),
 * restated here because that module is a build-time Node script and this one runs in the client.
 * The terminator form is how a minifier spells an escape whose next character would otherwise be
 * read as a seventh hex digit — `--fa:"\30 "` is the digit zero, not a three — and the one-digit
 * bound matters because `\a` is a legal escape naming U+000A.
 */
const CSS_HEX_ESCAPE = /^([0-9a-f]{1,6})(?:\r\n|[ \n\t\r\f])?$/i;
const CSS_STRING = /^(["'])(.*)\1$/s;

/**
 * The codepoint a CSS string value names, as an opaque grouping key.
 *
 * A CODEPOINT rather than the declaration's text, because the two ways this bundle assigns a glyph
 * do not serialize alike. Chromium resolves the escape when it serializes `content` (`"\uf013"`, the
 * literal private-use character) but preserves a custom property's raw token stream (`"\\f013"`), and
 * Foundry 13's bundle sets BOTH, on different rules, for the same glyph. Keying on the text would
 * split one glyph into two picker rows and let a name excluded in one group be re-admitted in the
 * other.
 *
 * @param {string} cssValue the declaration's value, quotes included
 * @returns {string} a stable key for the glyph, or `''` when the value names none
 */
function glyphKeyFromCssString(cssValue) {
  const string = CSS_STRING.exec(String(cssValue ?? '').trim());
  const value = string ? string[2] : '';
  if (!value) return '';

  if (!value.startsWith(BACKSLASH)) return codepointKey(value.codePointAt(0));
  const escaped = value.slice(1);
  const hexEscape = CSS_HEX_ESCAPE.exec(escaped);
  return codepointKey(hexEscape ? Number.parseInt(hexEscape[1], 16) : escaped.codePointAt(0));
}

function codepointKey(codepoint) {
  return Number.isInteger(codepoint) ? `u+${codepoint.toString(16)}` : '';
}

/**
 * The glyph one rule assigns, whichever way its release spells the assignment.
 *
 * Font Awesome 7 assigns with the `--fa` custom property; Font Awesome 6 assigns with a `content`
 * declaration on a `::before` pseudo-element, and the pseudo-element requirement is what keeps a
 * layout rule's `content` from being read as a glyph.
 */
function glyphKey(style, selectorText) {
  const modern = String(style?.getPropertyValue?.('--fa') ?? '').trim();
  if (modern) return glyphKeyFromCssString(modern);

  if (!/::?before\b/i.test(selectorText)) return '';
  const legacy = String(style?.getPropertyValue?.('content') ?? '').trim();
  if (!legacy || legacy === 'normal' || legacy === 'none') return '';
  return glyphKeyFromCssString(legacy);
}

/**
 * The rule lists nested inside one rule.
 *
 * `@media` and `@supports` expose theirs as `cssRules`; an `@import` exposes an entire SHEET as
 * `styleSheet`, and `CSSImportRule` does not inherit from `CSSGroupingRule`, so it has no
 * `cssRules` of its own. That distinction decides whether Fabricate measures anything at all on
 * Foundry 13: Foundry serves its Font Awesome stylesheet as a LAYERED core style, which its
 * layout emits as `@import "…" layer(variables)` inside an inline `<style>` rather than as a
 * `<link>`. The only rule in the only sheet is then an import, and a reader that descends
 * `cssRules` alone measures zero glyphs.
 *
 * Each read is guarded because a sheet Foundry serves cross-origin — behind a reverse proxy or a
 * CDN, both supported deployments — throws `SecurityError` on access rather than answering null.
 */
function nestedRuleLists(rule) {
  const lists = [];
  for (const read of [() => rule?.cssRules, () => rule?.styleSheet?.cssRules]) {
    try {
      const rules = read();
      if (rules) lists.push(rules);
    } catch {
      // A cross-origin sheet is unreadable, not fatal: skip it and read the rest.
    }
  }
  return lists;
}

function collectGlyphsFromRules(rules, glyphsByName) {
  for (const rule of rules ?? []) {
    for (const nested of nestedRuleLists(rule)) collectGlyphsFromRules(nested, glyphsByName);

    const selectorText = String(rule?.selectorText ?? '');
    const glyph = glyphKey(rule?.style, selectorText);
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
 * Every sheet is read through the same guard, because a stylesheet a client loaded from another
 * origin throws `SecurityError` on `cssRules` rather than answering null, and one such sheet must
 * not cost the measurement the rest of the document.
 *
 * @param {Document|null|undefined} [documentObject]
 * @returns {Map<string, string>} icon name -> an opaque per-GLYPH key, so two names sharing a
 *   drawing group together however their release spells the assignment
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

/**
 * The committed catalogue, as the vocabulary pair every fallback answers with.
 *
 * FAILING OPEN is the whole point of naming it. An empty measurement and a bundle that draws
 * nothing are the same value to a reader, so a generation whose stylesheet cannot be read offers
 * the committed catalogue rather than an empty picker: a name the client may not draw is a
 * cosmetic defect in one row, whereas zero rows is an icon field a GM cannot use at all.
 */
const COMMITTED_ICON_DEFINITIONS = Object.freeze({
  all: FOUNDRY_ICON_DEFINITIONS,
  curated: FOUNDRY_CURATED_ICON_DEFINITIONS
});

/**
 * The curated subset of a REBUILT vocabulary.
 *
 * Membership is resolved against the committed curated index rather than re-applied as the
 * exclusion predicate, because the exclusions are about what a glyph DEPICTS and are therefore
 * evaluated over all of a glyph's names. A rebuilt group carries only the names the measured
 * bundle declares, so re-running the predicate over that shorter list would re-admit a drawing
 * that was excluded under a name this generation happens to spell differently.
 */
function curatedSubsetOf(definitions) {
  return Object.freeze(
    definitions.filter((definition) =>
      definitionNames(definition).every((name) => findCuratedIcon(name) !== null)
    )
  );
}

function iconDefinitionsForGlyphs(glyphsByName) {
  const all = buildIconDefinitionsForMeasuredBundle(FOUNDRY_ICON_DEFINITIONS, glyphsByName);
  return all.length > 0
    ? Object.freeze({ all, curated: curatedSubsetOf(all) })
    : COMMITTED_ICON_DEFINITIONS;
}

/**
 * The measured vocabulary for one document, memoized per document and NEVER when it is empty.
 *
 * An empty measurement is not an answer about the client's font; it is the state of a client
 * whose stylesheet has not finished parsing, which is reachable because Foundry serves its Font
 * Awesome bundle through an `@import` and a picker can be built before that import resolves.
 * Memoizing it would make one early call decide every picker for the rest of the session, so an
 * empty result falls back for this call only and the next call measures again.
 */
const measuredDefinitionsByDocument = new WeakMap();

function measuredIconDefinitions(documentObject = globalThis.document) {
  if (!documentObject) return COMMITTED_ICON_DEFINITIONS;

  const memoized = measuredDefinitionsByDocument.get(documentObject);
  if (memoized) return memoized;

  const glyphsByName = measureLoadedFontAwesomeGlyphs(documentObject);
  if (glyphsByName.size === 0) return COMMITTED_ICON_DEFINITIONS;

  const definitions = iconDefinitionsForGlyphs(glyphsByName);
  measuredDefinitionsByDocument.set(documentObject, definitions);
  return definitions;
}

/**
 * The vocabulary pair one Foundry generation offers.
 *
 * V14 is the committed generated catalogue, measured from Foundry 14.365 / Font Awesome 7.2.0 by
 * the checked-in generator. EVERY OTHER generation — 13, an unreleased one, and the undetermined
 * one — is measured from the client's own loaded stylesheet and falls back to the committed
 * catalogue when that measurement is empty. Tests may inject a measured map to exercise the split
 * without a Foundry installation.
 */
function iconDefinitionsForMajor(major, options = {}) {
  if (major === FOUNDRY_14_MAJOR) return COMMITTED_ICON_DEFINITIONS;
  if (options.glyphsByName) return iconDefinitionsForGlyphs(options.glyphsByName);
  return measuredIconDefinitions();
}

/**
 * Full icon list for a Foundry generation.
 *
 * @param {number|null} [major]
 * @param {{glyphsByName?:Map<string,string>}} [options]
 * @returns {ReadonlyArray<{iconCode:string,label:string,aliases:ReadonlyArray<string>}>}
 */
export function getFoundryIconDefinitionsForMajor(major = currentFoundryMajor(), options = {}) {
  return iconDefinitionsForMajor(major, options).all;
}

/**
 * Curated icon list for a Foundry generation.
 *
 * @param {number|null} [major]
 * @param {{glyphsByName?:Map<string,string>}} [options]
 * @returns {ReadonlyArray<{iconCode:string,label:string,aliases:ReadonlyArray<string>}>}
 */
export function getFoundryCuratedIconDefinitionsForMajor(
  major = currentFoundryMajor(),
  options = {}
) {
  return iconDefinitionsForMajor(major, options).curated;
}

function buildUserSearchAliases({ iconCode, label, aliases = [] }) {
  const searchAliases = new Set();
  const names = [iconCode, ...aliases];

  searchAliases.add(normalizeSearch(label || humanizeIconName(iconCode)));
  for (const name of names) {
    searchAliases.add(normalizeSearch(name.replaceAll('-', ' ')));
    for (const token of name.split('-')) {
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
    // The style prefix and weight are deliberately NOT searchable. Every row carries the same
    // two words, so baking them in made `s`, `so`, `li`, `as`, `id` and `fa` match the entire
    // vocabulary — which is the second keystroke of solid, lightning, asterisk and astronaut —
    // and nothing ever searched for them: a caller filtering by weight reads `variant`.
    searchText: normalizeSearch(
      `${resolvedLabel} ${iconCode} fa-${iconCode} ${aliasText} ${searchAliases.join(' ')}`
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

/**
 * Picker rows memoized against the VOCABULARY they were built from, not against the generation.
 *
 * Keying on the generation would re-introduce the hazard the measurement cache above avoids: a
 * picker built before the client's stylesheet parsed would pin the fallback catalogue's rows to
 * this generation for the session, and the later, correct measurement would never be rendered.
 * Keyed on the array instead, the fallback and the measured vocabulary simply memoize separately,
 * and a caller-supplied array is collectable once the caller drops it.
 */
const essenceIconOptionsByDefinitions = new WeakMap();

function essenceIconOptionsFor(iconDefinitions) {
  const memoized = essenceIconOptionsByDefinitions.get(iconDefinitions);
  if (memoized) return memoized;

  const options = createEssenceIconOptions(iconDefinitions);
  essenceIconOptionsByDefinitions.set(iconDefinitions, options);
  return options;
}

export function getEssenceIconOptions() {
  return essenceIconOptionsFor(getFoundryCuratedIconDefinitionsForMajor());
}

export function getEssenceAllIconOptions() {
  return essenceIconOptionsFor(getFoundryIconDefinitionsForMajor());
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
  const resolvedDefinitions = Array.isArray(iconDefinitions) && iconDefinitions.length > 0
    ? iconDefinitions
    : getFoundryCuratedIconDefinitionsForMajor();

  return essenceIconOptionsFor(resolvedDefinitions);
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

  // Built the same way a listed row is, so a stored icon the vocabulary does not offer still
  // carries the same fields, the same aliases and the same search text as one it does.
  return createIconOption({ iconCode: iconName, label: humanizeIconName(iconName) }, prefix);
}

const EXACT_NAME_RANK = 0;
const NAME_PREFIX_RANK = 1;
const WORD_PREFIX_RANK = 2;
const SUBSTRING_RANK = 3;

function searchWords(text) {
  return String(text).split(' ').filter(Boolean);
}

/**
 * How well one row answers the whole query, as a relevance TIER rather than a score.
 *
 * Tiers rather than a weighted score because the ordering inside a tier is already decided: the
 * vocabulary is alphabetical, and a stable sort keeps that. What alphabetical order cannot do is
 * put the icon a GM NAMED above the icons that merely contain its name — the picker shows about
 * seven rows, and `key` sat tenth behind `car-key` and `glass-whiskey`, `lock` eighteenth, `water`
 * fifteenth, so typing an icon's exact name left it below the fold.
 *
 * Aliases rank with the names because they ARE names here: `cog` is not offered as a row, and a
 * GM who types it means the gear exactly.
 */
function iconOptionSearchRank(option, query) {
  const name = normalizeSearch(option.iconName);
  const label = normalizeSearch(option.label);
  if (query === name || query === label) return EXACT_NAME_RANK;

  const names = [name, ...(option.aliases ?? []).map((alias) => normalizeSearch(alias))];
  if (names.some((candidate) => candidate.startsWith(query))) return NAME_PREFIX_RANK;

  const words = [...searchWords(label), ...names.flatMap(searchWords)];
  if (words.some((word) => word.startsWith(query))) return WORD_PREFIX_RANK;

  return SUBSTRING_RANK;
}

/**
 * The rows a query matches, most relevant first.
 *
 * Matching is unchanged — every whitespace-separated token has to appear somewhere in the row's
 * search text, so a multi-word query still narrows rather than widens — and only the ORDER is new.
 */
export function filterEssenceIconOptions(options = [], searchTerm = '') {
  const resolvedOptions = Array.isArray(options) ? options : [];
  const normalizedSearch = normalizeSearch(searchTerm);
  if (!normalizedSearch) return resolvedOptions;

  const tokens = searchWords(normalizedSearch);
  const matches = [];
  for (const option of resolvedOptions) {
    if (tokens.some((token) => !option.searchText.includes(token))) continue;
    matches.push({ option, rank: iconOptionSearchRank(option, normalizedSearch) });
  }

  return matches
    .sort((left, right) => left.rank - right.rank)
    .map((match) => match.option);
}

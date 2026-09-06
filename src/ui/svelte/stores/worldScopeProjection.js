/**
 * The GM-facing projection over the three world-scope entity corpora (issue 1362, epic 1357).
 *
 * IT PUBLISHES THE CORPUS, NOT THE UNION. `unionScopedDefinitions` answers what one crafting
 * system's list IS; this answers what the WORLD holds, which is the only thing a world-scope
 * screen can edit. Publishing the union here would hand a world editor a system's resolved
 * values and let it write them back to the world.
 *
 * NO HAND-BUILT ALLOWLIST. Every other projection in `adminStore` names the fields it carries,
 * because the records it projects are open-ended manager objects and a spread would leak
 * whatever the manager happens to hold. A scope corpus is already an allowlist - the three
 * normalizers in `componentScope.js` / `essenceScope.js` / `toolScope.js` rebuild every record
 * from a fixed key set - so restating it here would be a SECOND allowlist that can only ever
 * drift narrower than the first. The failure that produces is the one recorded against
 * `componentCategories` and `categoryIcons`: a persisted field the UI cannot see.
 *
 * A TOP-LEVEL SIBLING KEY, never hung off `selectedSystem`. The corpus is world scope, so
 * hanging it off the selected system would republish it as `null` the moment no system is
 * selected - which is the NORMAL state for a world screen.
 *
 * IT IS PURE. The corpus, the scope descriptor and the crafting-system roster all arrive as
 * arguments; nothing here reads a setting, a store or a Foundry global.
 */

import {
  SOURCE_LINK_FIELDS,
  WORLD_IDENTITY_FIELDS,
} from '../../../migration/worldScopeEntityGrouping.js';
import {
  COMPONENT_SCOPE,
  COMPONENT_SECTIONS,
  normalizeComponentEssenceMap,
} from '../../../systems/componentScope.js';
import { ESSENCE_SCOPE, ESSENCE_SECTIONS } from '../../../systems/essenceScope.js';
import {
  isSectionInherited,
  isWorldEnabled,
  membershipKey,
  resolveScopedDefinition,
} from '../../../systems/scopedDefinitions.js';
import { TOOL_SCOPE, TOOL_SECTIONS } from '../../../systems/toolScope.js';
import {
  WORLD_VOCABULARY_KINDS,
  worldDefaultsAffectedByDeletion,
} from '../../../systems/worldVocabulary.js';
import { buildVocabularyUsage } from '../../../utils/vocabularyUsage.js';

/**
 * The three entity types, in the order the rail lists their world screens.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_ENTITY_TYPES = Object.freeze(['component', 'essence', 'tool']);

/**
 * THE KEY-SPACE BRIDGE, AND IT IS MANDATORY (issue 1380).
 *
 * `WORLD_IDENTITY_FIELDS` is keyed PLURAL — `components` / `essences` / `tools` — because it
 * belongs to the migration that lifted those settings arrays. The descriptors below are keyed
 * SINGULAR, because a descriptor describes one entity. So `WORLD_IDENTITY_FIELDS[entityType]`
 * is `undefined` for all three, and a derivation that reached for it would answer `false`
 * everywhere while looking exactly right — `sourceLinked: false` on a component is
 * indistinguishable from the correct `false` on an essence, and nothing about the shape of the
 * answer says which one you are looking at.
 *
 * The bridge is therefore WRITTEN OUT rather than derived from a pluralize rule, and
 * `tests/scoped-entity-list-model.test.js` pins each list it reads as NON-EMPTY — and re-reads
 * this very map out of THIS file's source — before it asserts a single per-type answer.
 *
 * @type {Readonly<Record<string, string>>}
 */
const IDENTITY_FIELD_KEY = Object.freeze({
  component: 'components',
  essence: 'essences',
  tool: 'tools',
});

/**
 * The identity fields one entity type lifts, reached through {@link IDENTITY_FIELD_KEY}.
 *
 * @param {string} entityType a SINGULAR descriptor key.
 * @returns {readonly string[]}
 */
function identityFieldsOf(entityType) {
  return WORLD_IDENTITY_FIELDS[IDENTITY_FIELD_KEY[entityType]] ?? [];
}

/**
 * Whether this entity type's identity record carries a source item link.
 *
 * DERIVED, NEVER RESTATED. `src/migration/worldScopeEntityGrouping.js` owns both lists; this
 * intersects them. True for a component and a tool, false for an essence — which is one of the
 * THREE ways the three identity records differ (`data-models/spec.md` `### Properties`), and one
 * of the two a shell's own markup reads.
 *
 * @param {string} entityType
 * @returns {boolean}
 */
function derivedSourceLinked(entityType) {
  const fields = identityFieldsOf(entityType);
  return SOURCE_LINK_FIELDS.some((field) => fields.includes(field));
}

/**
 * Whether this entity type's identity record carries a colour token.
 *
 * True for an essence alone. The scoped list shells tint the row medallion from it, which is why
 * this is a descriptor answer rather than a call-site test of the entity type.
 *
 * @param {string} entityType
 * @returns {boolean}
 */
function derivedHasColorToken(entityType) {
  return identityFieldsOf(entityType).includes('colorToken');
}

/**
 * The per-entity-type UI descriptor: the scope the resolver reads through, the sections a GM
 * can switch, the two structural capabilities a screen must not infer, and the two IDENTITY
 * SHAPE facts a shared list shell reads before it draws a row.
 *
 * `enableable` and `taggable` are read from HERE rather than tested at a call site, because
 * both absences are structural: a component has no `enabled` flag at all (`resolveComponent`
 * omits the key), and only a component carries world tags with per-tag muting.
 *
 * `worldEnableable` is the WORLD MASTER SWITCH and is DERIVED from the scope descriptor rather
 * than restated, exactly as the two identity-shape facts below are: `defineScope` decides which
 * entity types have one, and a screen that tested the entity type here would answer the old
 * shape the day a second type declares it.
 *
 * `sourceLinked` and `hasColorToken` join them for the same reason and are named differently on
 * purpose (issue 1380). The first two are capabilities a GM EXERCISES; these two are facts about
 * the shape of the identity record, so a fourth `-able` key would assert a kinship that does not
 * exist. Both are DERIVED from the lifted identity field lists above rather than restated here,
 * so adding a field to one entity type cannot leave this table describing the old shape.
 *
 * @type {Readonly<Record<string, Readonly<object>>>}
 */
export const WORLD_SCOPE_DESCRIPTORS = Object.freeze({
  component: Object.freeze({
    entityType: 'component',
    scope: COMPONENT_SCOPE,
    sections: COMPONENT_SECTIONS,
    enableable: false,
    worldEnableable: COMPONENT_SCOPE.worldEnableable === true,
    taggable: true,
    sourceLinked: derivedSourceLinked('component'),
    hasColorToken: derivedHasColorToken('component'),
  }),
  essence: Object.freeze({
    entityType: 'essence',
    scope: ESSENCE_SCOPE,
    sections: ESSENCE_SECTIONS,
    enableable: true,
    worldEnableable: ESSENCE_SCOPE.worldEnableable === true,
    taggable: false,
    sourceLinked: derivedSourceLinked('essence'),
    hasColorToken: derivedHasColorToken('essence'),
  }),
  tool: Object.freeze({
    entityType: 'tool',
    scope: TOOL_SCOPE,
    sections: TOOL_SECTIONS,
    enableable: true,
    worldEnableable: TOOL_SCOPE.worldEnableable === true,
    taggable: false,
    sourceLinked: derivedSourceLinked('tool'),
    hasColorToken: derivedHasColorToken('tool'),
  }),
});

/**
 * An empty projection for one entity type, used when the store is absent or unreadable.
 *
 * `seeded` is all-false rather than absent, because a screen reading an absent flag as
 * "seeded" would offer a destructive action against an UNKNOWN corpus.
 *
 * @param {string} entityType
 * @returns {object}
 */
export function emptyWorldScopeEntityState(entityType) {
  const descriptor = WORLD_SCOPE_DESCRIPTORS[entityType];
  return {
    entityType,
    sections: descriptor ? [...descriptor.sections] : [],
    enableable: descriptor?.enableable === true,
    worldEnableable: descriptor?.worldEnableable === true,
    taggable: descriptor?.taggable === true,
    sourceLinked: descriptor?.sourceLinked === true,
    hasColorToken: descriptor?.hasColorToken === true,
    available: false,
    seeded: { entities: false, defaults: false, membership: false },
    entities: [],
    entries: [],
  };
}

/**
 * The three vocabularies the World Vocabulary holds, in the order its screen lists them.
 *
 * The World Vocabulary is NOT a scoped-entity layer - it holds the vocabularies the scoped
 * entities draw FROM - so it has no sections, no membership and no per-system rows, and it is
 * projected by its own function rather than through {@link projectWorldScopeEntity}.
 *
 * RE-EXPORTED since issue 1392, and no longer declared here. `src/systems/worldVocabulary.js`
 * owns it now, because this projection needs that module's deletion planners to state a
 * deletion's second number and declaring the list on this side would make the two modules
 * import each other. Re-exporting keeps every existing importer of this name - including
 * `tests/world-scope-projection.test.js` - reading exactly one definition.
 */
export { WORLD_VOCABULARY_KINDS };

/**
 * The World Vocabulary projection when no vocabulary store is registered.
 *
 * `total` is 0 and `available` is false, which is the state PR 7 replaces: the rail leaf's
 * count badge reads 0, which is TRUTHFUL rather than a placeholder, because a world with no
 * vocabulary store has no world vocabulary.
 *
 * @returns {object}
 */
export function emptyWorldVocabularyState() {
  const state = { available: false, total: 0 };
  for (const kind of WORLD_VOCABULARY_KINDS) state[kind] = [];
  return state;
}

/**
 * Project the World Vocabulary corpus.
 *
 * `total` IS THE PUBLISHED FIELD NAME, and it is a contract rather than an implementation
 * detail: `CraftingSystemManagerRoot.svelte` reads `worldScope.vocabulary.total` for the
 * `Tags & Categories` rail leaf's count badge, and requirement 7 of
 * `### GM World Scoped Entity Routes` bars PR 7 from that file - so a producer that published
 * `count` or `entries.length` instead would leave the badge reading 0 forever with every test
 * still green. `ui-integration/spec.md`'s `### GM World Vocabulary Route` names it, and
 * `tests/world-scope-projection.test.js` pins it.
 *
 * The three vocabularies are summed rather than deduplicated across kinds: a category and a tag
 * that happen to share a label are two entries in the world's vocabulary, and the prototype's
 * own badge is the same sum of its three lists.
 *
 * ## What each entry carries since issue 1392, and why it is COUNTED rather than derived
 *
 * `totalUsage` is HOW MANY RECORDS ANYWHERE IN THE WORLD NAME THIS ENTRY. It is
 * `buildVocabularyUsage` - the counter the system-scope Tags & Categories screen already uses,
 * unmodified - run over every crafting system's components and the world's whole recipe corpus
 * instead of one system's. The prototype's `h % 24` string hash is deliberately not copied: a
 * fabricated number in front of a GM deciding whether a deletion is safe is worse than none.
 *
 * THE COUNT IS PER KIND, AND ONE EXCLUSION IS ASYMMETRIC, so nobody generalises it:
 *
 * - The world component defaults' `category` is EXCLUDED. A migrated world elects a world
 *   default category from a system that already carries it, and every membership record carries
 *   that system's `category` verbatim, so `systems[].components` already counts it and counting
 *   both would double-count every migrated component.
 * - The world component defaults' `tags` are INCLUDED, and the reason is NON-MIRRORING rather
 *   than exclusivity: the migration deliberately left world `tags` unauthored because the tag
 *   merge is additive, so a GM-authored world tag is a world-scope grant that no membership
 *   record mirrors. Excluding them would publish `totalUsage: 0` for a tag granted to every
 *   member system - and a zero-usage row offers a ONE-CLICK delete.
 *
 * ## `silentlyDeletable` is a CONJUNCTION, and it is computed HERE
 *
 * An entry deletes in one click only when NOTHING NAMES IT **and** its deletion rewrites nothing
 * anywhere in the world. That is strictly narrower than either half:
 *
 * - a recipe category named by forty recipes rewrites nothing on deletion (the world corpus
 *   holds no recipe record) and must still open the confirm, because forty records name it;
 * - a world component category referenced by no in-system component but carried by five world
 *   defaults reads `0 references` and must still open the confirm, because the cascade rewrites
 *   those five.
 *
 * It is computed here rather than left to `VocabularyPanel`'s default because the panel's
 * default is `totalUsage === 0`, which is exactly wrong on the second case - and the failure is
 * silent: the row renders `Unused` under a red one-click delete and then silently rewrites the
 * world.
 *
 * ## New rows in NEW arrays
 *
 * `corpus[kind]` is the STORE's published array, and `WorldVocabularyStore` replaces its corpus
 * wholesale precisely so nothing mutates it. Stamping the decoration onto those entries would
 * write the projection's per-row fields into the store's cache.
 *
 * @param {{componentCategories?: unknown, componentTags?: unknown, recipeCategories?: unknown}
 *   |null} corpus
 * @param {object} [context] The corpora the counts are taken over. Every field is optional and
 *   an absent one answers 0, which is what a caller that has not wired it sees.
 * @param {unknown} [context.systems] The crafting-system roster.
 * @param {Array<object>} [context.recipes] Every recipe in the world, as MODELS rather than
 *   projected rows: `ingredientSets` and `steps` are detail-tier fields on a projected row and
 *   walking them there materialises the whole detail tier before first paint.
 * @param {Array<object>} [context.componentEntries] The already-projected world COMPONENT leg's
 *   `entries`, for the inheriting-system count a category's deletion warning states.
 * @param {Array<object>} [context.componentDefaults] The world component defaults corpus.
 * @returns {object}
 */
export function projectWorldVocabulary(corpus, context = {}) {
  if (!corpus || typeof corpus !== 'object') return emptyWorldVocabularyState();
  const systems = Array.isArray(context?.systems) ? context.systems : [];
  const recipes = Array.isArray(context?.recipes) ? context.recipes : [];
  const componentDefaults = Array.isArray(context?.componentDefaults)
    ? context.componentDefaults
    : [];
  const inheritCounts = categoryInheritCountsById(context?.componentEntries);
  const usage = buildVocabularyUsage(
    recipes,
    systems.flatMap((system) => (Array.isArray(system?.components) ? system.components : []))
  );
  const usageByKind = {
    componentCategories: usage.componentCategoryUsage,
    componentTags: usage.tagUsage,
    recipeCategories: usage.categoryUsage,
  };
  const state = { available: true, total: 0 };
  for (const kind of WORLD_VOCABULARY_KINDS) {
    const entries = Array.isArray(corpus[kind]) ? corpus[kind] : [];
    state[kind] = entries.map((entry) =>
      decorateVocabularyEntry(kind, entry, {
        usage: usageByKind[kind],
        componentDefaults,
        inheritCounts,
      })
    );
    state.total += entries.length;
  }
  return state;
}

/**
 * `entryId -> inheritCounts.category` for the projected world component entries.
 *
 * Read off the leg this publish has ALREADY built rather than re-derived from the membership
 * records, so the number the deletion warning states is the same one the world component entry
 * screen shows for that entity.
 *
 * @param {unknown} componentEntries
 * @returns {Map<string, number>}
 */
function categoryInheritCountsById(componentEntries) {
  const counts = new Map();
  for (const entry of Array.isArray(componentEntries) ? componentEntries : []) {
    counts.set(entry?.id, Number(entry?.inheritCounts?.category) || 0);
  }
  return counts;
}

/**
 * One decorated vocabulary row.
 *
 * @param {string} kind
 * @param {{id?: string, name?: string}} entry
 * @param {{usage: Map<string, number>|undefined, componentDefaults: Array<object>,
 *   inheritCounts: Map<string, number>}} context
 * @returns {object}
 */
function decorateVocabularyEntry(kind, entry, { usage, componentDefaults, inheritCounts }) {
  const id = String(entry?.id ?? '');
  const affectedIds = worldDefaultsAffectedByDeletion(kind, componentDefaults, id);
  // The world defaults' tags are part of the tag count and their category is not; see the
  // module note above for why the asymmetry is not an oversight.
  const counted = Number(usage?.get?.(id)) || 0;
  const totalUsage = kind === 'componentTags' ? counted + affectedIds.length : counted;
  const inheritingCount =
    kind === 'componentCategories'
      ? affectedIds.reduce((total, defaultId) => total + (inheritCounts.get(defaultId) || 0), 0)
      : 0;
  return {
    id,
    name: String(entry?.name ?? id),
    totalUsage,
    // The confirm sentence's SECOND number, per kind, merged over `{name}` and `{count}` by
    // `VocabularyPanel`. A recipe category has none: nothing is rewritten, and its sentence
    // says exactly that.
    confirmTokens: confirmTokensFor(kind, affectedIds.length, inheritingCount),
    silentlyDeletable: totalUsage === 0 && inheritingCount === 0 && affectedIds.length === 0,
  };
}

/**
 * @param {string} kind
 * @param {number} affectedDefaultCount
 * @param {number} inheritingCount
 * @returns {Record<string, number>}
 */
function confirmTokensFor(kind, affectedDefaultCount, inheritingCount) {
  if (kind === 'componentCategories') {
    return { defaults: affectedDefaultCount, inheriting: inheritingCount };
  }
  if (kind === 'componentTags') return { components: affectedDefaultCount };
  return {};
}

/**
 * The empty projection for all three entity types.
 *
 * @returns {{worldScope: object}}
 */
export function emptyWorldScopeState() {
  const worldScope = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    worldScope[entityType] = emptyWorldScopeEntityState(entityType);
  }
  worldScope.vocabulary = emptyWorldVocabularyState();
  return { worldScope };
}

/**
 * The crafting systems a world screen states membership against, projected to the two fields
 * a per-system row needs.
 *
 * @param {unknown} systems
 * @returns {Array<{id: string, name: string}>}
 */
function projectSystems(systems) {
  if (!Array.isArray(systems)) return [];
  return systems
    .map((system) => ({
      id: typeof system?.id === 'string' ? system.id : String(system?.id ?? ''),
      name: typeof system?.name === 'string' ? system.name : '',
    }))
    .filter((system) => system.id !== '' && system.id !== 'undefined' && system.id !== 'null');
}

/**
 * Index the membership records by their `(entityId, systemId)` key.
 *
 * One pass, rather than a `findMembership` scan per `(entity, system)` pair: a world with 400
 * components and 6 systems would otherwise walk the membership list 2,400 times per publish.
 *
 * @param {unknown} memberships
 * @returns {Map<string, object>}
 */
function indexMemberships(memberships) {
  const index = new Map();
  for (const record of Array.isArray(memberships) ? memberships : []) {
    if (!record?.entityId || !record?.systemId) continue;
    index.set(membershipKey(record.entityId, record.systemId), record);
  }
  return index;
}

/**
 * Index every crafting system's IN-SYSTEM component rows, keyed `systemId` then component id.
 *
 * THE ONE UNION FACT THIS PROJECTION RE-DERIVES, and only for the component leg (issue 1371
 * r18-store, M31). The projection publishes the CORPUS, but a world screen stating "which map does
 * this system resolve" cannot answer it from the corpus alone: an OVERRIDING system's map is its
 * in-system row — the membership record's stored block is the dormant copy and does not win while
 * `## CraftingSystem` requirement 36 holds — so the roster's rows are the other half of the
 * answer. One pass over the raw roster per publish, the same walk the vocabulary leg already
 * takes over `systems[].components`.
 *
 * @param {unknown} systems The RAW crafting-system roster.
 * @returns {Map<string, Map<string, object>>}
 */
function indexInSystemComponents(systems) {
  const bySystem = new Map();
  for (const system of Array.isArray(systems) ? systems : []) {
    const systemId = typeof system?.id === 'string' ? system.id : String(system?.id ?? '');
    if (!systemId) continue;
    const rows = new Map();
    for (const component of Array.isArray(system?.components) ? system.components : []) {
      const id = typeof component?.id === 'string' ? component.id.trim() : '';
      if (id && !rows.has(id)) rows.set(id, component);
    }
    bySystem.set(systemId, rows);
  }
  return bySystem;
}

/**
 * Whether a descriptor's scope declares the component `essences` section — derived from the
 * section list rather than tested against the entity type, so a second type declaring the
 * section would answer the new shape without this file changing.
 *
 * @param {object} descriptor
 * @returns {boolean}
 */
function resolvesEssences(descriptor) {
  return descriptor?.sections?.includes?.('essences') === true;
}

/**
 * The essence map ONE system resolves for an entity: the world map where the switch is on and
 * the world authored one, the system's own in-system row otherwise — normalized as the row's
 * own normalizer would, and always a NEW map, never the corpus's or the roster's.
 *
 * @param {{inherited: {[section: string]: boolean}}} resolved The resolver's answer.
 * @param {object|null} worldDefault
 * @param {object|null} inSystemRow
 * @returns {Record<string, number>}
 */
function resolvedEssencesFor(resolved, worldDefault, inSystemRow) {
  const world = normalizeComponentEssenceMap(worldDefault?.essences);
  if (resolved.inherited?.essences !== false && world) return world;
  return normalizeComponentEssenceMap(inSystemRow?.essences) ?? {};
}

/**
 * Index the world defaults by entity id.
 *
 * @param {unknown} defaults
 * @returns {Map<string, object>}
 */
function indexDefaults(defaults) {
  const index = new Map();
  for (const record of Array.isArray(defaults) ? defaults : []) {
    if (record?.id) index.set(record.id, record);
  }
  return index;
}

/**
 * One `(entity, system)` row: whether the entity is a member there, whether each section is
 * inherited, and - for an enableable entity ONLY - whether it is on.
 *
 * `enabled` is OMITTED for a component rather than answered `false`, exactly as
 * `resolveComponent` omits it. A row that carried `enabled: false` would hand a later screen
 * the value it would read to draw the toggle the epic's ruling removes.
 *
 * ── `enabled` IS THE PER-SYSTEM FLAG AND `resolvedEnabled` IS THE TRUTH ─────────────────────
 * On a `worldEnableable` scope the resolver answers three values, and this row carries two of
 * them under names that say which is which. `enabled` is the LAYER THIS ROW AUTHORS — the
 * per-system flag the membership toggle writes — and `resolvedEnabled` is `world && system`,
 * which is what the entity actually does.
 *
 * They are not collapsed, and the reason is a control that would otherwise lie: a per-system
 * toggle painted from the resolved AND reads OFF for every system the moment the world master
 * switch goes off, and clicking it then appears to do nothing. `enabled` is therefore exactly
 * what it was before the master switch existed, so nothing reading it changed meaning.
 *
 * ── `resolvedEssences` IS THE MAP THIS SYSTEM RESOLVES, AND IT IS A READ FACT ───────────────
 * On the component leg alone (issue 1371 r18-store, M31): the world map where `inherited.essences`
 * is on and the world authored one, this system's own in-system row otherwise. It is named for
 * what it is so no world editor writes it back — the world entry authors `defaults.essences`, and
 * the rules editor authors the in-system row; this row only says which of the two the system
 * reads.
 *
 * NO SCREEN CONSUMES IT YET, and the docblock said otherwise until r19-store2. The entry's
 * systems card draws no essence surface, and the rules editor reads `inherited.essences` and the
 * world entry's `defaults.essences` directly. It is published ahead of its consumer — the
 * per-system essence run on `WorldComponentEntrySystemsCard`, which is not this lane's file — and
 * `tests/world-scope-projection.test.js` and `tests/stores/admin-store-component-scope.test.js`
 * pin the fact it states. The system rules LIST answers the same question from the read union
 * instead (`adminComponentRowProjection`'s `_resolvedEssencesBySystemComponent`), because that
 * projection is per SYSTEM and already holds the manager.
 *
 * @param {object} descriptor
 * @param {{id: string, name: string}} system
 * @param {object|null} membership
 * @param {object|null} worldDefault
 * @param {number} [recipeCount] Recipes in THIS system that reference the entity.
 * @param {object|null} [inSystemRow] This system's own in-system row for the entity, when the
 *   roster holds one; read for the component `essences` section alone.
 * @returns {object}
 */
function buildSystemRow(
  descriptor,
  system,
  membership,
  worldDefault,
  recipeCount = 0,
  inSystemRow = null
) {
  const resolved = resolveScopedDefinition(worldDefault, membership, descriptor.scope);
  const row = {
    systemId: system.id,
    systemName: system.name,
    member: membership !== null,
    inherited: resolved.inherited,
    // HOW MANY OF THIS SYSTEM'S RECIPES REFERENCE THE ENTITY. Per system rather than
    // world-wide, because the only row that states it is a SYSTEM-scope row: a world-wide
    // number under a system's own list would be a wrong number rather than a missing one.
    recipeCount: Number(recipeCount) || 0,
  };
  if (descriptor.enableable) {
    row.enabled = descriptor.worldEnableable
      ? resolved.systemEnabled === true
      : resolved.enabled === true;
    row.resolvedEnabled = resolved.enabled === true;
  }
  // WHICH WORLD TAGS THIS SYSTEM MUTES (issue 1371), for a TAGGABLE type alone — which is the
  // component family and nothing else, so an essence or tool row is byte-identical to what it was.
  //
  // IT IS THE ONE PIECE OF MEMBERSHIP STATE A SCREEN CAN AUTHOR AND COULD NOT READ BACK. Muting
  // is written through `setMutedTags`, which lands on the membership record — and this row was the
  // only published view of that record, carrying `member`, `inherited` and `enabled` but not this.
  // Without it the world entry's mute chips could write a state and never show it, which is the
  // one failure mode a toggle must not have, and the tag note's "muted in {m} systems" clause
  // would count zero on every world however many mutes a GM had authored.
  //
  // A COPY rather than the stored array, on the same rule the entry roster follows: a consumer
  // that mutated the published value in place would edit the corpus behind the store's back.
  if (descriptor.taggable) {
    row.mutedTags = Array.isArray(membership?.mutedTags) ? [...membership.mutedTags] : [];
  }
  if (resolvesEssences(descriptor)) {
    row.resolvedEssences = resolvedEssencesFor(resolved, worldDefault, inSystemRow);
  }
  return row;
}

/**
 * Whether this identity record actually names a source Item.
 *
 * ── A NEW HELPER GOES ABOVE THE DOCBLOCK ABOVE IT, NEVER BETWEEN THE TWO ────────────────────
 * This function was first inserted between `buildEntry`'s docblock and `buildEntry`, which
 * silently re-attached a five-parameter contract to a one-parameter helper and left the
 * function it described undocumented. Nothing catches that: there is no `eslint-plugin-jsdoc`
 * in this repository's config, so a JSDoc block is a comment and a comment cannot be wrong.
 *
 * IT IS THE THIRD TIME THIS SHAPE HAS LANDED IN THIS PROGRAMME — the same insertion happened in
 * `CraftingSystemManager.js` and again in `worldScopeEntityNotice.js` — which is why the rule is
 * written at the site rather than left to be rediscovered a fourth time.
 *
 * The FIELD LIST is the migration's, imported rather than restated: a rename there must not
 * leave a second copy here answering about names nothing declares.
 *
 * @param {object} entity
 * @returns {boolean}
 */
function entryHasSourceLink(entity) {
  for (const field of SOURCE_LINK_FIELDS) {
    const value = entity?.[field];
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) return true;
  }
  return false;
}

/**
 * One world entity's entry: its identity record, its world defaults, a row per crafting
 * system, and the counts every world-defaults editor states before an edit lands.
 *
 * `inheritCounts` is PER SECTION and counts MEMBERS ONLY, matching `countInheritingSystems`:
 * a system with no membership record does not have the entity, so editing a world default
 * changes nothing for it.
 *
 * @param {object} descriptor
 * @param {object} entity
 * @param {object|null} worldDefault
 * @param {Array<{id: string, name: string}>} systems
 * @param {Map<string, object>} membershipIndex
 * @param {Record<string, object>|null} [usage] World-wide reference counts per entity id.
 * @param {Map<string, Map<string, object>>} [inSystemIndex] Each system's in-system rows, from
 *   {@link indexInSystemComponents}; read for the component `essences` section alone.
 * @returns {object}
 */
function buildEntry(
  descriptor,
  entity,
  worldDefault,
  systems,
  membershipIndex,
  usage = null,
  inSystemIndex = new Map()
) {
  const inheritCounts = {};
  for (const section of descriptor.sections) inheritCounts[section] = 0;
  const rows = [];
  const entityUsage = usage?.[entity.id] ?? null;
  let membershipCount = 0;
  for (const system of systems) {
    const membership = membershipIndex.get(membershipKey(entity.id, system.id)) ?? null;
    if (membership) {
      membershipCount += 1;
      for (const section of descriptor.sections) {
        if (isSectionInherited(membership, section)) inheritCounts[section] += 1;
      }
    }
    rows.push(
      buildSystemRow(
        descriptor,
        system,
        membership,
        worldDefault,
        entityUsage?.recipeCountBySystem?.[system.id],
        inSystemIndex.get(system.id)?.get(entity.id) ?? null
      )
    );
  }
  return {
    id: entity.id,
    entity,
    defaults: worldDefault,
    membershipCount,
    inheritCounts,
    // HOW MUCH OF THE WORLD REFERENCES THIS ENTITY, across every crafting system.
    //
    // Supplied by the caller rather than derived here: the counts are over corpora this module
    // is not handed — every system's components and every recipe in the world — and the
    // functions that count them already live beside the admin store's own cards. An absent
    // `usage` answers 0, which is what a caller that has not wired it sees.
    componentCount: Number(entityUsage?.componentCount) || 0,
    recipeCount: Number(entityUsage?.recipeCount) || 0,
    // WHAT REQUIRES IT, by name and kind, rather than only how many (issue 1373). The world
    // Tool entry's `REQUIRED FOR` region lists each recipe and gathering task; it is the one
    // surface with no system context, so it cannot re-derive the list from a selection. Supplied
    // by the caller for the same reason the counts are, and an absent `usage` answers `[]`.
    requiredBy: Array.isArray(entityUsage?.requiredBy) ? [...entityUsage.requiredBy] : [],
    // AND WHAT PRODUCES IT (issue 1371). The component family's usage leg answers two axes — a
    // recipe or a gathering task that CONSUMES the component, and one that MAKES it — because the
    // world entry states them as two lists: "Used by" is what a GM checks before removing a
    // component, and "Produced by" before deleting the thing that makes it.
    //
    // TWO SURFACES DRAW IT: the world component entry's preview rail, through
    // `componentEntryPreviewGroups` in `scoped/componentScoped.js`, and the component rules
    // editor's own rail in `ComponentEditView.svelte`. Round 1 computed it and stopped HERE,
    // which made the leg unobservable from anywhere — and the gathering half of it was reading a
    // key stored tasks never carry, so it reported nothing on every world and no test could have
    // said so. Both were fixed together, and a note still saying "no surface draws it yet" would
    // send the next lane looking for a consumer to write. An absent `usage` answers `[]`, exactly
    // as `requiredBy` does, so no other entity type moves.
    producedBy: Array.isArray(entityUsage?.producedBy) ? [...entityUsage.producedBy] : [],
    // WHETHER THE WORLD MASTER SWITCH LEAVES THIS ENTITY ON. Read through `isWorldEnabled`, so
    // an ABSENT flag — every record in every world that has never touched the switch — answers
    // `true` here and the screens draw the state they always drew.
    worldEnabled: descriptor.worldEnableable ? isWorldEnabled(worldDefault) : true,
    // WHETHER THIS RECORD ACTUALLY NAMES A SOURCE ITEM, answered HERE because this module already
    // imports the one list of source-link field names (issue 1380). The descriptor's
    // `sourceLinked` says whether the TYPE has the fields at all; this says whether this entity
    // filled one in, and it is what decides which badge a GM sees on a row.
    //
    // A consumer that restated the three names would go on testing the old ones after a rename:
    // the descriptor answer stays correct, so a type-level gate stays green, while every entity
    // linked only by the renamed field starts reporting itself unlinked. One directory apart is
    // still a second copy.
    hasSourceLink: descriptor.sourceLinked ? entryHasSourceLink(entity) : false,
    systems: rows,
  };
}

/**
 * Project one entity type's world corpus.
 *
 * @param {object} options
 * @param {string} options.entityType One of {@link WORLD_SCOPE_ENTITY_TYPES}.
 * @param {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}|null}
 *   options.corpus The store's published corpus.
 * @param {{entities: boolean, defaults: boolean, membership: boolean}|null} [options.seeded]
 * @param {unknown} [options.systems] The crafting-system roster.
 * @param {Record<string, {componentCount?: number, recipeCount?: number,
 *   recipeCountBySystem?: Record<string, number>}>|null} [options.usage] World-wide reference
 *   counts per entity id, supplied by the caller; see `buildEntry`.
 * @returns {object}
 */
export function projectWorldScopeEntity({
  entityType,
  corpus,
  seeded = null,
  systems = [],
  usage = null,
}) {
  const descriptor = WORLD_SCOPE_DESCRIPTORS[entityType];
  if (!descriptor || !corpus || typeof corpus !== 'object') {
    return emptyWorldScopeEntityState(entityType);
  }
  const entities = Array.isArray(corpus.entities) ? corpus.entities : [];
  const defaultsIndex = indexDefaults(corpus.defaults);
  const membershipIndex = indexMemberships(corpus.membership);
  const projectedSystems = projectSystems(systems);
  // Walked only for a scope that resolves `essences`; the other two legs never touch the rows.
  const inSystemIndex = resolvesEssences(descriptor) ? indexInSystemComponents(systems) : new Map();
  const state = {
    entityType,
    sections: [...descriptor.sections],
    enableable: descriptor.enableable,
    worldEnableable: descriptor.worldEnableable,
    taggable: descriptor.taggable,
    sourceLinked: descriptor.sourceLinked,
    hasColorToken: descriptor.hasColorToken,
    available: true,
    seeded: {
      entities: seeded?.entities === true,
      defaults: seeded?.defaults === true,
      membership: seeded?.membership === true,
    },
    entities,
    entries: entities.map((entity) =>
      buildEntry(
        descriptor,
        entity,
        defaultsIndex.get(entity.id) ?? null,
        projectedSystems,
        membershipIndex,
        usage,
        inSystemIndex
      )
    ),
  };
  // The world tool-breakage authority is the one field beside the three sub-keys, and it
  // belongs to the tool scope alone. Carried only when the corpus actually holds one, so an
  // absent world value stays distinguishable from an authored `toolSpecific`.
  if (corpus.toolBreakage) state.toolBreakage = corpus.toolBreakage;
  return state;
}

/**
 * Read one store's corpus and its three seededness flags.
 *
 * GUARDED, for the reason `ScopedDefinitionStore#load` is: a store whose setting cannot be
 * read must degrade to an UNKNOWN corpus rather than take the whole publish down. An absent
 * store takes the same path, so a manager opened before `game.fabricate` is assembled renders
 * a shape rather than throwing.
 *
 * @param {object|null} store
 * @returns {{corpus: object|null, seeded: object|null}}
 */
function readCorpus(store) {
  try {
    const corpus = store?.corpus?.() ?? null;
    if (!corpus) return { corpus: null, seeded: null };
    return {
      corpus,
      seeded: {
        entities: store?.isSeeded?.('entities') === true,
        defaults: store?.isSeeded?.('defaults') === true,
        membership: store?.isSeeded?.('membership') === true,
      },
    };
  } catch {
    return { corpus: null, seeded: null };
  }
}

/**
 * Project all three entity types from their three stores.
 *
 * Answers the top-level `worldScope` key `adminStore` publishes, ALWAYS as a new object, so a
 * `$derived` over it re-propagates on every publish.
 *
 * THE FOURTH LEG IS THE WORLD VOCABULARY, and it is optional. `adminStore`'s `_worldScopeStores`
 * reads it through the same `services.getVocabularyScopeStore?.() ?? null` idiom as the other
 * three, so it degrades to `null` - and to a `total: 0` projection - until PR 7 registers the
 * store. That leg exists NOW because `adminStore.js` is a gateway file requirement 7 of
 * `### GM World Scoped Entity Routes` closes to PR 7: a producer wired later could only be
 * wired by reopening a file that lane may not open. Its WRITE-path sibling was added by issue
 * 1374 for the same reason, so the vocabulary lane declares its action family in
 * `worldScopeActions.js` — a file it owns — and finds the store leg already there.
 *
 * @param {object} [options]
 * @param {Record<string, object|null>} [options.stores] `{component, essence, tool, vocabulary}`
 *   scope stores; `vocabulary` may be absent.
 * @param {unknown} [options.systems] The crafting-system roster.
 * @param {Array<object>} [options.recipes] Every recipe in the world (issue 1392). The FOURTH
 *   input, and the one the gateway closure's enumeration did not name: nothing in
 *   `{stores, systems, usage}` can answer a world-wide recipe question, so the World
 *   Vocabulary's recipe-category reference count was underivable without it. `adminStore`
 *   supplies it from `_allRecipes()`, which it already invokes on every publish.
 * @param {Record<string, Record<string, object>>} [options.usage] Per-entity-type reference
 *   counts, keyed by entity type then entity id.
 * @returns {{worldScope: object}}
 */
export function buildWorldScopeState({ stores = {}, systems = [], recipes = [], usage = {} } = {}) {
  const worldScope = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    worldScope[entityType] = projectWorldScopeEntity({
      entityType,
      systems,
      usage: usage?.[entityType] ?? null,
      ...readCorpus(stores?.[entityType] ?? null),
    });
  }
  // THE VOCABULARY LEG READS THE COMPONENT LEG THIS PUBLISH JUST BUILT. A world component
  // category's deletion warning states how many crafting systems INHERIT the defaults it
  // clears, and `buildEntry` has already counted that per entity; re-deriving it from the
  // membership records here would be a second answer to one question.
  const componentCorpus = readCorpus(stores?.component ?? null).corpus;
  worldScope.vocabulary = projectWorldVocabulary(readCorpus(stores?.vocabulary ?? null).corpus, {
    // The RAW roster, not `projectSystems`' `{id, name}` rows: the count is taken over each
    // system's `components`, which that projection deliberately drops.
    systems,
    recipes,
    componentEntries: worldScope.component?.entries ?? [],
    componentDefaults: Array.isArray(componentCorpus?.defaults) ? componentCorpus.defaults : [],
  });
  // THE COMPONENT LEG CARRIES THE VOCABULARY'S NAMES (issue 1371 r13-entry, maintainer ruling
  // M18). The world Component entry offered its category picker from the corpus union of
  // `defaults.category`, and on a migrated world every default was elected from a system that
  // already carried it — so the picker listed the SYSTEMS' categories as if the world had
  // authored them while the vocabulary held none. The shell hands a component screen only this
  // leg (`componentScopeProps`), never `worldScope.vocabulary`, so the names are attached here,
  // by the one function that has both legs in hand: bare strings, because that is all an offer
  // needs, and the decorated rows with their usage counts stay the vocabulary screen's.
  worldScope.component.worldVocabulary = {
    categories: worldScope.vocabulary.componentCategories.map((entry) => entry.name),
    tags: worldScope.vocabulary.componentTags.map((entry) => entry.name),
  };
  return { worldScope };
}
